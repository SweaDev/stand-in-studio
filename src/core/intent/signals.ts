import type { ExpressionName, ValidationState } from '../../shared/types';
import { type SignalId, signalInfo } from '../../shared/signalCatalog';

export type { ExpressionName };

/**
 * Everything the signals read for one engine tick, already relative to the calibration
 * baseline. Built by StudioEngine from its trackers; pure data.
 */
export interface SignalContext {
  /** Fresh face landmarks are available. */
  faceSeen: boolean;
  validation: ValidationState;
  /** Share of the last 1.5 s with talking detected (0..1). */
  talkingShare: number;
  /** Head yaw / pitch relative to calibration (eye-distances), null without landmarks. */
  yaw: number | null;
  pitch: number | null;
  /** Eye-in-head gaze offset relative to calibration (eye-widths); null without iris points. */
  gaze: number | null;
  /** Inner-lip gap above the calibrated closed gap (eye-distances). */
  mouthGap: number | null;
  /** Latest expression scores 0..1 (happy already minus the resting level). Empty until the first sample. */
  expressions: Partial<Record<ExpressionName, number>>;
  /** How long the eyes have been closed (ms), 0 when open. */
  eyesClosedMs: number;
  sinceNodMs: number;
  sinceShakeMs: number;
  /** Share of recent validation reports with more than one face (0..1). */
  multipleFacesShare: number;
  /** Body signals relative to the learned baseline, null until a baseline exists. */
  pulseDelta: number | null;
  breathingDelta: number | null;
}

export const EMPTY_CONTEXT: SignalContext = Object.freeze({
  faceSeen: false,
  validation: 'noFace',
  talkingShare: 0,
  yaw: null,
  pitch: null,
  gaze: null,
  mouthGap: null,
  expressions: {},
  eyesClosedMs: 0,
  sinceNodMs: Number.POSITIVE_INFINITY,
  sinceShakeMs: Number.POSITIVE_INFINITY,
  multipleFacesShare: 0,
  pulseDelta: null,
  breathingDelta: null,
}) as SignalContext;

/**
 * One signal's reading: the membership (0..1) of each of its states, plus the raw quantity
 * each state compares against the threshold (for tuning and the developer log).
 */
export interface SignalReading {
  /** False when the signal can't be measured right now. */
  available: boolean;
  /** Unavailable but not blocking (e.g. no iris points in this landmark layout). */
  ignored: boolean;
  /** Why it is unavailable. */
  reason?: string;
  m: Record<string, number>;
  values: Record<string, number>;
  /** Short human-readable value for logs, e.g. "yaw +0.31 ed". */
  text: string;
}

const GESTURE_HOLD_MS = 1_500;
const GESTURE_FADE_MS = 300;

/** Soft step: 0.5 at the threshold, ~0.9 at 1.25× (relative width 12%). */
export function softStep(v: number, thr: number): number {
  const w = Math.max(1e-6, Math.abs(thr) * 0.12);
  return 1 / (1 + Math.exp(-(v - thr) / w));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const signed = (v: number, digits = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

function unavailable(id: SignalId, reason: string, ignored = false): SignalReading {
  const m: Record<string, number> = {};
  for (const s of signalInfo(id).states) m[s.id] = ignored ? 1 : 0;
  return { available: false, ignored, reason, m, values: {}, text: `n/a (${reason})` };
}

function twoState(rest: string, active: string, activeM: number, value: number, text: string): SignalReading {
  return {
    available: true,
    ignored: false,
    m: { [rest]: 1 - activeM, [active]: activeM },
    values: { [rest]: value, [active]: value },
    text,
  };
}

/** Reads one signal from the context with the given threshold (defaults from the catalogue). */
export function readSignal(id: SignalId, ctx: SignalContext, threshold?: number): SignalReading {
  const info = signalInfo(id);
  const thr = threshold ?? info.threshold?.default ?? 0;
  if (info.needsFace && !ctx.faceSeen && id !== 'talking') return unavailable(id, 'no face');
  switch (id) {
    case 'talking': {
      if (!ctx.faceSeen) return unavailable(id, 'no face');
      const yes = clamp01((ctx.talkingShare - 0.2) / 0.4);
      return twoState('no', 'yes', yes, ctx.talkingShare, `talking ${Math.round(ctx.talkingShare * 100)}%`);
    }
    case 'headTurn': {
      if (ctx.yaw === null) return unavailable(id, 'no landmarks');
      const y = ctx.yaw;
      const left = softStep(-y, thr);
      const right = softStep(y, thr);
      return {
        available: true,
        ignored: false,
        m: { centred: 1 - Math.max(left, right), left, right },
        values: { centred: Math.abs(y), left: -y, right: y },
        text: `yaw ${signed(y)} ed`,
      };
    }
    case 'headTilt': {
      if (ctx.pitch === null) return unavailable(id, 'no landmarks');
      const p = ctx.pitch;
      const down = softStep(p, thr);
      const up = softStep(-p, thr);
      return {
        available: true,
        ignored: false,
        m: { level: 1 - Math.max(down, up), down, up },
        values: { level: Math.abs(p), down: p, up: -p },
        text: `pitch ${signed(p)} ed`,
      };
    }
    case 'gaze': {
      if (ctx.gaze === null) return unavailable(id, 'no iris points', true);
      return twoState(
        'onScreen',
        'away',
        softStep(ctx.gaze, thr),
        ctx.gaze,
        `gaze ${ctx.gaze.toFixed(2)} ew`,
      );
    }
    case 'mouth': {
      if (ctx.mouthGap === null) return unavailable(id, 'no landmarks');
      const g = ctx.mouthGap;
      return twoState('closed', 'open', softStep(g, thr), g, `mouth ${signed(g)} ed`);
    }
    case 'expression': {
      const e = ctx.expressions;
      const names = Object.keys(e) as ExpressionName[];
      if (names.length === 0) return unavailable(id, 'no expression yet');
      const m: Record<string, number> = {};
      const values: Record<string, number> = {};
      for (const st of info.states) {
        const v = e[st.id as ExpressionName] ?? 0;
        values[st.id] = v;
        m[st.id] = softStep(v, thr);
      }
      const top = names.reduce((a, b) => ((e[b] ?? 0) > (e[a] ?? 0) ? b : a));
      return {
        available: true,
        ignored: false,
        m,
        values,
        text: `${top} ${Math.round((e[top] ?? 0) * 100)}`,
      };
    }
    case 'eyes': {
      const ms = ctx.eyesClosedMs;
      return twoState(
        'open',
        'closed',
        ms > 0 ? softStep(ms, thr) : 0,
        ms,
        ms > 0 ? `closed ${Math.round(ms)} ms` : 'open',
      );
    }
    case 'gesture': {
      const fade = (since: number) =>
        since <= GESTURE_HOLD_MS ? 1 : clamp01(1 - (since - GESTURE_HOLD_MS) / GESTURE_FADE_MS);
      const nodding = fade(ctx.sinceNodMs);
      const shaking = fade(ctx.sinceShakeMs);
      const text = nodding > 0 ? 'nod' : shaking > 0 ? 'shake' : 'still';
      return {
        available: true,
        ignored: false,
        m: { still: 1 - Math.max(nodding, shaking), nodding, shaking },
        values: { still: 0, nodding, shaking },
        text,
      };
    }
    case 'faceInView': {
      const no = ctx.validation === 'noFace' ? 1 : 0;
      return twoState('yes', 'no', no, no, `validation ${ctx.validation}`);
    }
    case 'people': {
      const sh = ctx.multipleFacesShare;
      return twoState('justMe', 'more', softStep(sh, thr), sh, `multiple faces ${Math.round(sh * 100)}%`);
    }
    case 'breathingRate':
    case 'pulse': {
      const d = id === 'pulse' ? ctx.pulseDelta : ctx.breathingDelta;
      if (d === null) return unavailable(id, 'learning baseline');
      return twoState('near', 'raised', softStep(d, thr), d, `${signed(d, 1)} vs baseline`);
    }
  }
}
