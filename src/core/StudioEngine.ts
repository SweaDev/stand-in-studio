import type { Settings } from '../shared/settings';
import type { Mode, SignalFrame, StageState, ValidationState } from '../shared/types';
import { type IntentDef, type IntentTuning, defaultIntents, usesBodySignals } from '../shared/intents';
import { ComfortShield } from './auto/ComfortShield';
import { IntentPolicy, type PolicyDecision } from './auto/IntentPolicy';
import { type DecisionTrace, type SensingState, buildTrace } from './intent/DecisionTrace';
import { IntentTracker, NONE_HOLD_MS, type TrackerState, evaluateAll } from './intent/IntentMatcher';
import type { SignalContext } from './intent/signals';
import { TUNING_MS, TuningRecorder, computeTuning } from './intent/tuning';
import { type Baseline, type CalibrationPhase, Calibrator, DEFAULT_BASELINE } from './calibration/Calibrator';
import { C } from './constants';
import type { FaceFeatures } from './features/FaceFeatures';
import { HeadPoseSmoother, computeFaceFeatures } from './features/faceGeometry';
import { PoseMapper } from './pose/PoseMapper';
import { type CommandReceiver } from './stage/commands';
import { Overrides, nextMode, resolveStage } from './stage/ModeController';
import { OpacitySmoother } from './stage/OpacitySmoother';
import { BlinkDetector } from './trackers/BlinkDetector';
import { BreathingNormalizer } from './trackers/BreathingNormalizer';
import { GestureDetector } from './trackers/GestureDetector';
import { PresenceTracker } from './trackers/PresenceTracker';
import { SmileDetector } from './trackers/SmileDetector';
import { TalkTracker } from './trackers/TalkTracker';
import { ValidationFilter } from './trackers/ValidationFilter';
import type { Clock } from './util/Clock';
import { Emitter } from './util/Emitter';
import { TimeWindow } from './util/RingBuffer';

/** Features older than this are treated as "no face data". */
const FEATURES_STALE_MS = 1_000;
/** Window for the talking and multiple-faces shares. */
const SHARE_WINDOW_MS = 1_500;
/** After resuming the SDK, intents stay frozen until data arrives or this long has passed. */
const WARMING_MAX_MS = 10_000;
/** Eye openness below this fraction of the calibrated level counts as closed. */
const EYES_CLOSED_RATIO = 0.5;
/** Vertical iris movement is smaller than horizontal; weight it up. */
const GAZE_Y_WEIGHT = 1.5;

export interface CalibrationStatus {
  phase: CalibrationPhase;
  progress: number;
  approximate: boolean;
}

export interface TuningStatus {
  id: string;
  phase: 'recording' | 'done' | 'cancelled';
  progress: number;
  result?: IntentTuning;
}

export interface EngineEvents {
  state: StageState;
  calibration: CalibrationStatus;
  tuning: TuningStatus;
}

/** Diagnostics for the control window (never sent to the stage or anywhere else). */
export interface EngineDebug {
  validation: ValidationState;
  sensing: SensingState;
  policy: PolicyDecision;
  intent: { id: string | null; name: string; score: number | null; action: PolicyDecision['action'] };
  trace: DecisionTrace;
  shieldActive: boolean;
  calibrated: boolean;
}

/**
 * Facade over the whole sensing → stage pipeline. Feed it SignalFrames (ingest) and call
 * tick() once per rendered frame; it returns the StageState to draw. Pure TypeScript: no
 * Electron, SDK or DOM, with time from an injected Clock.
 */
export class StudioEngine implements CommandReceiver {
  readonly events = new Emitter<EngineEvents>();

  private settings: Settings;
  private mode: Mode;
  private calibrator = new Calibrator();
  private calibrationDurationMs: number = C.CALIBRATION_MS;
  private readonly headPose = new HeadPoseSmoother();
  private features: FaceFeatures | null = null;
  private featuresAt = Number.NEGATIVE_INFINITY;
  private readonly breathing = new BreathingNormalizer();
  private readonly blink = new BlinkDetector();
  private readonly nod = new GestureDetector('nod', { direction: 'positive' });
  private readonly shake = new GestureDetector('shake', { direction: 'both' });
  private readonly smile = new SmileDetector();
  private readonly talk = new TalkTracker();
  private readonly validation = new ValidationFilter();
  private readonly presence = new PresenceTracker();
  private readonly shield = new ComfortShield();
  /** Baseline for body-signal intents (separate from the shield so it never caps). */
  private readonly body = new ComfortShield();
  private readonly pose = new PoseMapper();
  private readonly overrides = new Overrides();
  private readonly talkShare = new TimeWindow<number>(SHARE_WINDOW_MS);
  private readonly facesShare = new TimeWindow<number>(SHARE_WINDOW_MS);
  private expressions: SignalContext['expressions'] = {};
  private expressionsAt = Number.NEGATIVE_INFINITY;
  private eyesClosedSince: number | null = null;
  private lastNodAt = Number.NEGATIVE_INFINITY;
  private lastShakeAt = Number.NEGATIVE_INFINITY;
  private intents: IntentDef[] = defaultIntents();
  private tuning: Record<string, IntentTuning> = {};
  private recorder: TuningRecorder | null = null;
  private readonly tracker = new IntentTracker();
  private sensing: SensingState = 'live';
  private warmingSince = 0;
  /** Calibration was interrupted by a pause and restarts on resume. */
  private calibrationInterrupted = false;
  private readonly auto: IntentPolicy;
  private readonly feed: OpacitySmoother;
  private readonly character: OpacitySmoother;
  private testPattern = false;
  private lastDebug: EngineDebug | null = null;
  private lastContext: SignalContext | null = null;
  private lastState: StageState | null = null;

  constructor(
    settings: Settings,
    private readonly clock: Clock,
  ) {
    this.settings = settings;
    this.mode = settings.mode;
    const now = clock.now();
    this.auto = new IntentPolicy(settings.auto.listening);
    this.feed = new OpacitySmoother(0);
    this.feed.snap(0, now);
    this.character = new OpacitySmoother(1);
    this.character.snap(1, now);
    this.shield.setEnabled(settings.auto.comfortShield, now);
    this.presence.reset('present');
    this.setIntents(settings.auto.intents);
    if (settings.auto.saveTuning) this.loadTuning(settings.intentTuning);
  }

  // ---------------------------------------------------------------- inputs

  ingest(frame: SignalFrame): void {
    // Late packets from a stopping SDK are dropped while paused.
    if (this.sensing === 'paused') return;
    const now = frame.t;
    if (frame.validation && this.sensing === 'warming') this.sensing = 'live';
    if (frame.validation) {
      this.validation.push(frame.validation, now);
      this.facesShare.push(now, frame.multipleFaces ? 1 : 0);
    }
    if (frame.expressions) {
      this.expressions = frame.expressions;
      this.expressionsAt = now;
    }

    if (frame.landmarks) {
      const raw = computeFaceFeatures(frame.landmarks);
      if (raw) {
        const f = this.headPose.update(raw, now);
        this.features = f;
        this.featuresAt = now;
        this.calibrator.addFeatures(raw);
        const b = this.baseline();
        const n = this.nod.update(f.pitch - b.pitch, now);
        if (n) {
          this.pose.onGesture(n);
          this.lastNodAt = now;
        }
        const s = this.shake.update(f.yaw - b.yaw, now);
        if (s) {
          this.pose.onGesture(s);
          this.lastShakeAt = now;
        }
        const closed = raw.eyeOpenness < b.eyeOpenness * EYES_CLOSED_RATIO;
        this.eyesClosedSince = closed ? (this.eyesClosedSince ?? now) : null;
      }
    }

    if (frame.blink !== undefined || frame.landmarks) {
      const calibrated = this.calibrator.state === 'done' ? this.baseline().eyeOpenness : null;
      const started = this.blink.update(
        { sdkBlink: frame.blink, eyeOpenness: frame.landmarks ? this.features?.eyeOpenness : undefined },
        calibrated,
        now,
      );
      if (started) this.calibrator.addBlink();
    }

    if (frame.talking !== undefined) this.talk.update(frame.talking, now);
    if (frame.happy !== undefined) {
      this.calibrator.addHappy(frame.happy);
      this.smile.update(frame.happy, this.baseline().happyRest, now);
    }
    if (frame.breathingTrace) this.breathing.push(frame.breathingTrace, now);
    if (frame.pulseRate || frame.breathingRate) {
      const rates = { pulseRate: frame.pulseRate, breathingRate: frame.breathingRate };
      this.shield.update(rates, now);
      this.body.update(rates, now);
    }
  }

  // ---------------------------------------------------------------- control

  /**
   * Tells the engine whether the SDK is analysing frames. Paused (Camera mode): presence
   * stays "present", intents are frozen, and calibration or tuning in progress is cancelled
   * (calibration restarts on resume). Live again: a warming phase holds the current Auto
   * decision until the first validation report arrives, so a resuming SDK never looks like
   * an empty chair.
   */
  setSensing(state: 'live' | 'paused'): void {
    const now = this.clock.now();
    if (state === 'paused') {
      if (this.sensing === 'paused') return;
      this.sensing = 'paused';
      if (this.calibrator.state === 'collecting') {
        this.calibrationInterrupted = true;
        this.calibrator.reset();
        this.emitCalibration();
      }
      this.cancelTuning();
      return;
    }
    if (this.sensing !== 'paused') return;
    this.clearSignalHistory(now);
    if (this.calibrationInterrupted) {
      this.calibrationInterrupted = false;
      this.startCalibration(this.calibrationDurationMs);
    }
  }

  /**
   * The signal timeline jumped (a recorded clip was rewound, looped or seeked): drops the
   * signal history so nothing from before the jump carries over, and warms up like a
   * resuming SDK, holding the current Auto decision until the next validation report.
   * Calibration and the learned baseline are kept.
   */
  resetSignals(): void {
    if (this.sensing === 'paused') return;
    this.clearSignalHistory(this.clock.now());
  }

  private clearSignalHistory(now: number): void {
    this.sensing = 'warming';
    this.warmingSince = now;
    this.validation.reset();
    this.talk.reset();
    this.talkShare.clear();
    this.facesShare.clear();
    this.eyesClosedSince = null;
    this.expressions = {};
    this.expressionsAt = Number.NEGATIVE_INFINITY;
    this.tracker.reset();
    this.presence.reset('present');
  }

  get sensingState(): SensingState {
    return this.sensing;
  }

  startCalibration(durationMs: number = C.CALIBRATION_MS): void {
    this.calibrationDurationMs = durationMs;
    this.calibrator = new Calibrator(durationMs, Math.max(durationMs * 2, 4_000));
    this.calibrator.start(this.clock.now());
    this.emitCalibration();
  }

  calibrationStatus(): CalibrationStatus {
    const now = this.clock.now();
    return {
      phase: this.calibrator.state,
      progress: this.calibrator.progress(now),
      approximate: this.calibrator.baseline?.approximate ?? true,
    };
  }

  /** Forgets calibration (it lives in memory only). */
  clearCalibration(): void {
    this.calibrator.reset();
    this.emitCalibration();
  }

  applySettings(next: Settings): void {
    const now = this.clock.now();
    const modeChanged = next.mode !== this.settings.mode;
    this.settings = next;
    this.shield.setEnabled(next.auto.comfortShield, now);
    this.setIntents(next.auto.intents);
    if (modeChanged) this.setMode(next.mode);
  }

  // ---------------------------------------------------------------- intents

  /** Replaces the intent list (priority order). Tuning for removed intents is dropped. */
  setIntents(intents: readonly IntentDef[]): void {
    this.intents = intents.map((i) => ({ ...i, conditions: i.conditions.map((c) => ({ ...c })) }));
    const ids = new Set(this.intents.map((i) => i.id));
    for (const id of Object.keys(this.tuning)) if (!ids.has(id)) delete this.tuning[id];
    if (this.recorder && !ids.has(this.recorder.intentId)) this.cancelTuning();
    this.body.setEnabled(
      this.intents.some((i) => i.enabled && usesBodySignals(i)),
      this.clock.now(),
    );
  }

  get intentList(): readonly IntentDef[] {
    return this.intents;
  }

  /** Learned thresholds per intent (in memory; saved only if the user opts in). */
  get intentTuning(): Readonly<Record<string, IntentTuning>> {
    return this.tuning;
  }

  loadTuning(tuning: Readonly<Record<string, IntentTuning>>): void {
    const ids = new Set(this.intents.map((i) => i.id));
    this.tuning = Object.fromEntries(Object.entries(tuning).filter(([id]) => ids.has(id)));
  }

  clearTuning(id?: string): void {
    if (id === undefined) this.tuning = {};
    else delete this.tuning[id];
  }

  /** Records the user acting an intent out, then learns its thresholds. */
  startTuning(id: string, durationMs: number = TUNING_MS): void {
    if (!this.intents.some((i) => i.id === id)) return;
    this.recorder = new TuningRecorder(id, durationMs);
    this.recorder.start(this.clock.now());
    this.events.emit('tuning', { id, phase: 'recording', progress: 0 });
  }

  cancelTuning(): void {
    const r = this.recorder;
    if (!r) return;
    this.recorder = null;
    this.events.emit('tuning', { id: r.intentId, phase: 'cancelled', progress: 0 });
  }

  get tuningActive(): { id: string; progress: number } | null {
    const r = this.recorder;
    return r ? { id: r.intentId, progress: r.progress(this.clock.now()) } : null;
  }

  /** Current signal context (for the builder's live match meter). */
  get signalContext(): SignalContext | null {
    return this.lastContext;
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    const now = this.clock.now();
    if (mode === 'auto') this.auto.reset(this.feed.value(now));
    this.mode = mode;
    this.settings = { ...this.settings, mode };
  }

  get currentMode(): Mode {
    return this.mode;
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  /** Turning the dial switches to Blend at that opacity and releases a pin. */
  setDial(opacity: number): void {
    this.overrides.clearPin();
    this.settings = { ...this.settings, blend: { ...this.settings.blend, opacity } };
    this.setMode('blend');
  }

  setTestPattern(on: boolean): void {
    this.testPattern = on;
  }

  /** Demo mode: raise the Comfort-shield trigger (only works when the shield is on). */
  simulateShieldTrigger(): void {
    this.shield.simulateTrigger(this.clock.now());
  }

  toggleHide(): void {
    this.overrides.toggleHide();
  }
  togglePin(): void {
    this.overrides.togglePin(this.feed.value(this.clock.now()));
  }
  toggleRaiseHand(): void {
    this.overrides.toggleRaiseHand();
  }
  toggleBackSoon(): void {
    this.overrides.toggleBackSoon();
  }
  cycleMode(): void {
    this.setMode(nextMode(this.mode));
  }

  get overrideState(): Readonly<Pick<Overrides, 'hidden' | 'pinned' | 'raisedHand' | 'backSoon'>> {
    return this.overrides;
  }

  get debug(): EngineDebug | null {
    return this.lastDebug;
  }

  get state(): StageState | null {
    return this.lastState;
  }

  // ---------------------------------------------------------------- frame

  tick(): StageState {
    const now = this.clock.now();
    const prevPhase = this.calibrator.state;
    this.calibrator.update(now);
    if (prevPhase !== this.calibrator.state) this.emitCalibration();
    const calibrated = this.calibrator.state === 'done';
    const b = this.baseline();

    const features = now - this.featuresAt <= FEATURES_STALE_MS ? this.features : null;
    if (this.sensing === 'warming' && now - this.warmingSince >= WARMING_MAX_MS) this.sensing = 'live';
    const live = this.sensing === 'live';
    const validation = this.validation.evaluate(now);
    // Not analysing (Camera mode) or just resumed: you are not "away", there is just no data.
    let presence = live ? this.presence.update(validation, now) : 'present';
    if (this.overrides.backSoon) presence = 'away';
    const talking = this.talk.isTalking(now);

    const ctx = this.signalContext_(now, features, validation, talking, b);
    this.lastContext = ctx;
    const evals = evaluateAll(this.intents, ctx, this.tuning);
    const holdOf = (id: string | null) =>
      id === null ? NONE_HOLD_MS : (this.intents.find((i) => i.id === id)?.holdMs ?? NONE_HOLD_MS);
    // Frozen while not live: keep the active intent and the committed Auto decision.
    const tracked: TrackerState = live
      ? this.tracker.update(evals, holdOf, now)
      : { current: this.tracker.active, best: null };
    const active = this.intents.find((i) => i.id === tracked.current);
    if (live) this.recordTuning(ctx, now);

    const shieldCap = this.shield.update({}, now);
    const decision = live
      ? this.auto.update({
          now,
          action: active?.action ?? 'blend',
          max: this.settings.auto.max,
          listening: this.settings.auto.listening,
          shieldCap,
        })
      : this.auto.hold(this.settings.auto.max, shieldCap);

    const resolved = resolveStage(
      this.mode,
      { settings: this.settings, autoTarget: decision.target, autoCharacter: decision.character },
      this.overrides,
    );
    this.feed.setTarget(resolved.feedTarget, resolved.transition, now);
    this.character.setTarget(resolved.characterTarget, 'fade', now);

    const smiling = this.smile.smiling;
    const characterPose = this.pose.map({
      now,
      breath: this.breathing.value(now),
      eyeOpen: this.blink.eyeOpen(now),
      features,
      baseline: b,
      talking,
      smiling,
      glow: this.smile.glow(now),
      presence,
      wake: this.presence.wakeProgress(now),
      raisedHand: this.overrides.raisedHand,
      reducedMotion: this.settings.accessibility.reducedMotion,
    });

    const state: StageState = {
      mode: this.mode,
      feedOpacity: this.feed.value(now),
      targetOpacity: resolved.feedTarget,
      characterOpacity: this.character.value(now),
      layout: this.settings.blend.layout,
      cornerBadge: this.mode === 'camera' && this.settings.camera.badge,
      character: this.settings.character,
      background: this.settings.background,
      pose: characterPose,
      badges: {
        speaking: talking && presence !== 'away',
        raisedHand: this.overrides.raisedHand,
        backSoon:
          this.mode === 'auto' && !this.overrides.pinned
            ? decision.action === 'backSoon' || this.overrides.backSoon
            : presence === 'away',
      },
      hidden: this.overrides.hidden,
      pinned: this.overrides.pinned,
      style: { ...this.settings.accessibility },
      testPattern: this.testPattern,
    };
    const override = this.overrides.hidden
      ? 'hidden'
      : this.overrides.backSoon
        ? 'backSoon'
        : this.overrides.pinned
          ? 'pinned'
          : null;
    const trace = buildTrace({
      now,
      mode: this.mode,
      sensing: this.sensing,
      ctx,
      evals,
      tracker: tracked,
      names: new Map(this.intents.map((i) => [i.id, i.name])),
      policy: decision,
      policyHoldMs: C.AUTO_HOLD_MS,
      shieldCap,
      override,
      feedTarget: resolved.feedTarget,
      tuning: this.tuningActive,
    });
    const currentEval = evals.find((e) => e.id === tracked.current);
    this.lastDebug = {
      validation,
      sensing: this.sensing,
      policy: decision,
      intent: {
        id: tracked.current,
        name: active?.name ?? 'No intent matches',
        score: currentEval?.score ?? null,
        action: active?.action ?? 'blend',
      },
      trace,
      shieldActive: shieldCap !== null,
      calibrated,
    };
    this.lastState = state;
    this.events.emit('state', state);
    return state;
  }

  private signalContext_(
    now: number,
    features: FaceFeatures | null,
    validation: ValidationState,
    talking: boolean,
    b: Baseline,
  ): SignalContext {
    this.talkShare.push(now, talking ? 1 : 0);
    this.talkShare.prune(now);
    this.facesShare.prune(now);
    const share = (w: TimeWindow<number>) => {
      const v = w.values();
      return v.length > 0 ? v.reduce((a, x) => a + x, 0) / v.length : 0;
    };
    let gaze: number | null = null;
    if (features && features.gazeX !== undefined && features.gazeY !== undefined) {
      gaze = Math.hypot(features.gazeX - b.gazeX, (features.gazeY - b.gazeY) * GAZE_Y_WEIGHT);
    }
    const expressions: SignalContext['expressions'] = {};
    if (features && now - this.expressionsAt <= FEATURES_STALE_MS) {
      for (const [k, v] of Object.entries(this.expressions)) {
        expressions[k as keyof typeof expressions] =
          k === 'happy' ? Math.max(0, (v ?? 0) - b.happyRest) : (v ?? 0);
      }
    }
    if (!features) this.eyesClosedSince = null;
    const body = this.body.deltas(now);
    return {
      faceSeen: features !== null,
      validation,
      talkingShare: share(this.talkShare),
      yaw: features ? features.yaw - b.yaw : null,
      pitch: features ? features.pitch - b.pitch : null,
      gaze,
      mouthGap: features ? features.mouthGap - b.mouthGap : null,
      expressions,
      eyesClosedMs: this.eyesClosedSince !== null ? now - this.eyesClosedSince : 0,
      sinceNodMs: now - this.lastNodAt,
      sinceShakeMs: now - this.lastShakeAt,
      multipleFacesShare: share(this.facesShare),
      pulseDelta: body.pulse,
      breathingDelta: body.breathing,
    };
  }

  private recordTuning(ctx: SignalContext, now: number): void {
    const r = this.recorder;
    if (!r) return;
    r.push(ctx);
    if (!r.done(now)) return;
    this.recorder = null;
    const intent = this.intents.find((i) => i.id === r.intentId);
    if (!intent) return;
    const result = computeTuning(intent, r.collected, this.intents, now);
    this.tuning[intent.id] = result;
    this.events.emit('tuning', { id: intent.id, phase: 'done', progress: 1, result });
  }

  private baseline(): Baseline {
    return this.calibrator.baseline ?? DEFAULT_BASELINE;
  }

  private emitCalibration(): void {
    this.events.emit('calibration', this.calibrationStatus());
  }

  /** Nominal calibration length for the current run (UI countdown). */
  get calibrationMs(): number {
    return this.calibrationDurationMs;
  }
}
