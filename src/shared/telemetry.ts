/**
 * Saved Presage telemetry for a recorded clip (Phase 12). A file holds every SignalFrame
 * the SDK delivered while the clip played once, stamped with the clip's media time at the
 * moment the frame arrived, so a replay reproduces the SDK's real latency. Saved demos
 * live in the user's demo library, never in the repo.
 */
import type { ExpressionName, Point, RateReading, SignalFrame, ValidationState } from './types';

export const TELEMETRY_FORMAT = 'standin-telemetry';
export const TELEMETRY_VERSION = 1;
/** About 25 packets/s for an hour: anything larger is not a file this app wrote. */
export const MAX_FRAMES = 100_000;
const MAX_LANDMARKS = 600;
const MAX_TRACE = 512;
const MAX_TEXT = 200;

export type TelemetryFrame = Omit<SignalFrame, 't'> & { tMs: number };

export interface TelemetryVideo {
  /** File name of the clip (no path). */
  file: string;
  durationMs: number;
  width: number;
  height: number;
}

export interface TelemetryFile {
  format: typeof TELEMETRY_FORMAT;
  version: typeof TELEMETRY_VERSION;
  app: string;
  sdk: string;
  createdAt: string;
  /** Pulse and breathing were kept (the user opted in when saving). */
  includesBody: boolean;
  video: TelemetryVideo;
  frames: TelemetryFrame[];
}

const EXPRESSIONS: readonly ExpressionName[] = ['neutral', 'happy', 'surprise', 'sad', 'angry'];
const VALIDATIONS: readonly ValidationState[] = ['ok', 'noFace', 'poor'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : fallback);

function rate(v: unknown): RateReading | undefined {
  if (!isObj(v) || !num(v.value)) return undefined;
  return { value: v.value, confident: v.confident === true };
}

function points(v: unknown): Point[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_LANDMARKS) return undefined;
  const out: Point[] = [];
  for (const p of v) {
    if (!isObj(p) || !num(p.x) || !num(p.y)) return undefined;
    out.push({ x: p.x || 0, y: p.y || 0 }); // -0 → 0, as JSON would
  }
  return out;
}

/** Keeps only well-formed signal fields; returns null for a frame without a valid time. */
export function sanitizeFrame(v: unknown): TelemetryFrame | null {
  if (!isObj(v) || !num(v.tMs) || v.tMs < 0) return null;
  const f: TelemetryFrame = { tMs: v.tMs };
  if (typeof v.blink === 'boolean') f.blink = v.blink;
  if (typeof v.talking === 'boolean') f.talking = v.talking;
  if (typeof v.multipleFaces === 'boolean') f.multipleFaces = v.multipleFaces;
  if (num(v.happy)) f.happy = Math.min(1, Math.max(0, v.happy));
  if (typeof v.validation === 'string' && (VALIDATIONS as readonly string[]).includes(v.validation)) {
    f.validation = v.validation as ValidationState;
  }
  const lm = points(v.landmarks);
  if (lm) f.landmarks = lm;
  if (isObj(v.expressions)) {
    const e: Partial<Record<ExpressionName, number>> = {};
    for (const k of EXPRESSIONS) {
      const s = v.expressions[k];
      if (num(s)) e[k] = Math.min(1, Math.max(0, s));
    }
    if (Object.keys(e).length > 0) f.expressions = e;
  }
  if (
    Array.isArray(v.breathingTrace) &&
    v.breathingTrace.length <= MAX_TRACE &&
    v.breathingTrace.every(num)
  ) {
    f.breathingTrace = [...(v.breathingTrace as number[])];
  }
  const pr = rate(v.pulseRate);
  if (pr) f.pulseRate = pr;
  const br = rate(v.breathingRate);
  if (br) f.breathingRate = br;
  return f;
}

/** Removes body signals (pulse, breathing rate and trace) from a frame. */
export function stripBody(f: TelemetryFrame): TelemetryFrame {
  const { pulseRate: _p, breathingRate: _b, breathingTrace: _t, ...rest } = f;
  return rest;
}

/** True when the frame still carries any signal after its time stamp. */
export function hasSignal(f: TelemetryFrame): boolean {
  return Object.keys(f).length > 1;
}

/** A live SignalFrame converted to a saved frame at the given media time. */
export function toTelemetryFrame(
  frame: SignalFrame,
  tMs: number,
  includeBody: boolean,
): TelemetryFrame | null {
  const { t: _t, ...rest } = frame;
  const f = sanitizeFrame({ ...rest, tMs: Math.max(0, Math.round(tMs)) });
  if (!f) return null;
  const out = includeBody ? f : stripBody(f);
  return hasSignal(out) ? out : null;
}

/**
 * Validates a telemetry file read from disk (it may have been edited or shared). Frames
 * are sorted by time, malformed ones are dropped, and body signals are dropped unless the
 * file says it includes them. Throws with a readable message when it is not a telemetry file.
 */
export function sanitizeTelemetry(raw: unknown): TelemetryFile {
  if (!isObj(raw) || raw.format !== TELEMETRY_FORMAT) throw new Error('Not a Stand-In telemetry file.');
  if (raw.version !== TELEMETRY_VERSION) {
    throw new Error(
      `Unsupported telemetry version ${String(raw.version)} (this app reads ${TELEMETRY_VERSION}).`,
    );
  }
  if (!Array.isArray(raw.frames)) throw new Error('The telemetry file has no frames.');
  if (raw.frames.length > MAX_FRAMES) throw new Error('The telemetry file is too large.');
  const includesBody = raw.includesBody === true;
  const frames: TelemetryFrame[] = [];
  for (const r of raw.frames) {
    const f = sanitizeFrame(r);
    if (!f) continue;
    const kept = includesBody ? f : stripBody(f);
    if (hasSignal(kept)) frames.push(kept);
  }
  if (frames.length === 0) throw new Error('The telemetry file has no usable frames.');
  frames.sort((a, b) => a.tMs - b.tMs);
  const v = isObj(raw.video) ? raw.video : {};
  const last = frames[frames.length - 1]?.tMs ?? 0;
  return {
    format: TELEMETRY_FORMAT,
    version: TELEMETRY_VERSION,
    app: text(raw.app),
    sdk: text(raw.sdk),
    createdAt: text(raw.createdAt),
    includesBody,
    video: {
      file: text(v.file, 'video').replace(/[/\\]/g, '_'),
      durationMs: num(v.durationMs) && v.durationMs > 0 ? v.durationMs : last,
      width: num(v.width) ? v.width : 0,
      height: num(v.height) ? v.height : 0,
    },
    frames,
  };
}

/** Does any frame carry a body signal? */
export function framesHaveBody(frames: readonly TelemetryFrame[]): boolean {
  return frames.some((f) => f.pulseRate || f.breathingRate || f.breathingTrace);
}
