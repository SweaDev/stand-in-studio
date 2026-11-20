export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cubic ease-in-out on t ∈ [0, 1]. */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Linear-interpolated percentile (p ∈ [0, 100]) of an unsorted list; NaN when empty. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (clamp(p, 0, 100) / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return lerp(a, b, rank - lo);
}

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/**
 * Exponential smoothing whose strength is defined by a time constant, so it behaves the
 * same regardless of the update rate.
 */
export class ExpSmoother {
  private value: number | undefined;
  private lastT: number | undefined;

  constructor(private readonly tauMs: number) {}

  update(x: number, now: number): number {
    if (this.value === undefined || this.lastT === undefined) {
      this.value = x;
    } else {
      const dt = Math.max(0, now - this.lastT);
      const a = this.tauMs <= 0 ? 1 : 1 - Math.exp(-dt / this.tauMs);
      this.value += (x - this.value) * a;
    }
    this.lastT = now;
    return this.value;
  }

  get current(): number | undefined {
    return this.value;
  }

  reset(): void {
    this.value = undefined;
    this.lastT = undefined;
  }
}
