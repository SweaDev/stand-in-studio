import type { Point, RateReading, SignalFrame, ValidationState } from '../shared/types';
import { EXPRESSION_HAPPY, ValidationCodes } from './metricTypes';

/**
 * Structural view of a decoded `Metrics` message (from `decodeMetrics`). protobufjs
 * omits default values, so every field is optional.
 */
export interface DecodedMetrics {
  breathing?: {
    upperTrace?: { value?: number; timestamp?: number | Long }[] | null;
    rate?: RawRate[] | null;
  } | null;
  cardio?: { pulseRate?: RawRate[] | null } | null;
  face?: {
    landmarks?: { value?: { x?: number; y?: number }[] | null }[] | null;
    blinking?: { detected?: boolean }[] | null;
    talking?: { detected?: boolean }[] | null;
    expression?: { scores?: { type?: number; confidence?: number }[] | null }[] | null;
  } | null;
}

interface RawRate {
  value?: number;
  confidence?: number;
  stable?: boolean;
}

/** protobufjs may represent int64 timestamps as Long objects. */
interface Long {
  toNumber(): number;
}

/** Confidence (0–100) at which the SDK marks readings stable (Presage data-types docs). */
export const PULSE_CONFIDENT = 40;
export const BREATHING_RATE_CONFIDENT = 45;

function last<T>(xs: readonly T[] | null | undefined): T | undefined {
  return xs && xs.length > 0 ? xs[xs.length - 1] : undefined;
}

function rate(raw: RawRate | undefined, threshold: number): RateReading | undefined {
  if (!raw || typeof raw.value !== 'number' || !Number.isFinite(raw.value) || raw.value <= 0)
    return undefined;
  return { value: raw.value, confident: raw.stable === true || (raw.confidence ?? 0) >= threshold };
}

/**
 * Adapter: converts one decoded SDK metrics packet into a SignalFrame stamped with the
 * engine time `t`. Physiological values pass through in memory only.
 */
export function mapMetrics(m: DecodedMetrics, t: number): SignalFrame {
  const frame: SignalFrame = { t };
  const face = m.face ?? {};

  const trace = m.breathing?.upperTrace;
  if (trace && trace.length > 0) {
    frame.breathingTrace = trace
      .map((s) => s.value)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  }

  if (face.blinking && face.blinking.length > 0) frame.blink = face.blinking.some((b) => b.detected === true);

  const talk = last(face.talking);
  if (talk) frame.talking = talk.detected === true;

  const lm = last(face.landmarks);
  if (lm?.value && lm.value.length > 0) {
    frame.landmarks = lm.value.map((p): Point => ({ x: p.x ?? 0, y: p.y ?? 0 }));
  }

  const expr = last(face.expression);
  if (expr?.scores && expr.scores.length > 0) {
    const happy = expr.scores.find((s) => s.type === EXPRESSION_HAPPY);
    frame.happy = Math.min(1, Math.max(0, (happy?.confidence ?? 0) / 100));
  }

  const pulse = rate(last(m.cardio?.pulseRate), PULSE_CONFIDENT);
  if (pulse) frame.pulseRate = pulse;
  const br = rate(last(m.breathing?.rate), BREATHING_RATE_CONFIDENT);
  if (br) frame.breathingRate = br;

  return frame;
}

/** Maps an SDK ValidationCode to the app's coarse validation state. */
export function mapValidation(code: number): ValidationState {
  if (code === ValidationCodes.kOk) return 'ok';
  if (code === ValidationCodes.kNoFaceFound) return 'noFace';
  return 'poor';
}
