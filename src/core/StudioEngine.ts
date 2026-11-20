import type { Settings } from '../shared/settings';
import type { Mode, SignalFrame, StageState, ValidationState } from '../shared/types';
import { ComfortShield } from './auto/ComfortShield';
import { AutoPolicy, type AutoDecision } from './auto/AutoPolicy';
import type { AutoContext } from './auto/rules';
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
import { Hysteresis, SustainTimer } from './util/Hysteresis';

/** Features older than this are treated as "no face data". */
const FEATURES_STALE_MS = 1_000;

export interface CalibrationStatus {
  phase: CalibrationPhase;
  progress: number;
  approximate: boolean;
}

export interface EngineEvents {
  state: StageState;
  calibration: CalibrationStatus;
}

/** Diagnostics for the control window (never sent to the stage or anywhere else). */
export interface EngineDebug {
  validation: ValidationState;
  auto: AutoDecision;
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
  private readonly pose = new PoseMapper();
  private readonly overrides = new Overrides();
  private readonly lookAway = new Hysteresis({ on: 1, off: 0.6 });
  private readonly lookAwayTimer = new SustainTimer();
  private readonly mouthOpen = new Hysteresis({ on: C.EATING_GAP_ED, off: 0.15 });
  private readonly eatingTimer = new SustainTimer();
  private readonly poorTimer = new SustainTimer();
  private readonly noFaceTimer = new SustainTimer();
  private readonly auto: AutoPolicy;
  private readonly feed: OpacitySmoother;
  private readonly character: OpacitySmoother;
  private testPattern = false;
  private lastDebug: EngineDebug | null = null;
  private lastState: StageState | null = null;

  constructor(
    settings: Settings,
    private readonly clock: Clock,
  ) {
    this.settings = settings;
    this.mode = settings.mode;
    const now = clock.now();
    this.auto = new AutoPolicy(settings.auto.listening);
    this.feed = new OpacitySmoother(0);
    this.feed.snap(0, now);
    this.character = new OpacitySmoother(1);
    this.character.snap(1, now);
    this.shield.setEnabled(settings.auto.comfortShield, now);
    this.presence.reset('present');
  }

  // ---------------------------------------------------------------- inputs

  ingest(frame: SignalFrame): void {
    const now = frame.t;
    if (frame.validation) this.validation.push(frame.validation, now);

    if (frame.landmarks) {
      const raw = computeFaceFeatures(frame.landmarks);
      if (raw) {
        const f = this.headPose.update(raw, now);
        this.features = f;
        this.featuresAt = now;
        this.calibrator.addFeatures(raw);
        const b = this.baseline();
        const n = this.nod.update(f.pitch - b.pitch, now);
        if (n) this.pose.onGesture(n);
        const s = this.shake.update(f.yaw - b.yaw, now);
        if (s) this.pose.onGesture(s);
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
      this.shield.update({ pulseRate: frame.pulseRate, breathingRate: frame.breathingRate }, now);
    }
  }

  // ---------------------------------------------------------------- control

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
    if (modeChanged) this.setMode(next.mode);
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
    const validation = this.validation.evaluate(now);
    let presence = this.presence.update(validation, now);
    if (this.overrides.backSoon) presence = 'away';
    const talking = this.talk.isTalking(now);

    // Looking away: head well past the calibrated pose (only meaningful once calibrated).
    let awayness = 0;
    if (features && calibrated) {
      awayness = Math.max(
        Math.abs(features.yaw - b.yaw) / C.LOOK_AWAY_YAW_ED,
        Math.abs(features.pitch - b.pitch) / C.LOOK_AWAY_PITCH_ED,
      );
    }
    const lookingAway = this.lookAway.update(awayness, now);
    const lookingAwayMs = this.lookAwayTimer.update(lookingAway, now);
    const facingScreen = features !== null && !lookingAway;

    // Eating or yawning: mouth open without talking.
    const gap = features ? features.mouthGap - b.mouthGap : 0;
    const open = this.mouthOpen.update(gap, now);
    const eatingMs = this.eatingTimer.update(open && !talking && features !== null, now);

    const shieldCap = this.shield.update({}, now);
    const ctx: AutoContext = {
      now,
      faceOk: validation === 'ok',
      facingScreen,
      talkingSustained: this.talk.isSustained(now),
      talking,
      lookingAwayMs,
      eatingMs,
      poorFramingMs: this.poorTimer.update(validation === 'poor', now),
      noFaceMs: this.noFaceTimer.update(validation === 'noFace', now),
      shieldCap,
      max: this.settings.auto.max,
      listening: this.settings.auto.listening,
    };
    const decision = this.auto.update(ctx);

    const resolved = resolveStage(
      this.mode,
      { settings: this.settings, autoTarget: decision.target },
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
        backSoon: presence === 'away',
      },
      hidden: this.overrides.hidden,
      pinned: this.overrides.pinned,
      style: { ...this.settings.accessibility },
      testPattern: this.testPattern,
    };
    this.lastDebug = { validation, auto: decision, shieldActive: shieldCap !== null, calibrated };
    this.lastState = state;
    this.events.emit('state', state);
    return state;
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
