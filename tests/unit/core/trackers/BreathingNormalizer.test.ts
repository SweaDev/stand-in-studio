import { describe, expect, it } from 'vitest';
import { BreathingNormalizer, idleBreath } from '../../../../src/core/trackers/BreathingNormalizer';

/** Feeds a 15/min sine with arbitrary offset/scale at 20 Hz for `ms`. */
function feed(n: BreathingNormalizer, fromMs: number, ms: number, offset = 100, amp = 7) {
  let last = 0;
  for (let t = fromMs; t < fromMs + ms; t += 50) {
    n.push([offset + amp * Math.sin((2 * Math.PI * t) / 4000)], t);
    last = n.value(t);
  }
  return last;
}

describe('BreathingNormalizer', () => {
  it('normalises any offset and scale into -1..1', () => {
    const n = new BreathingNormalizer();
    feed(n, 0, 15_000);
    let min = Infinity;
    let max = -Infinity;
    for (let t = 15_000; t < 23_000; t += 50) {
      n.push([100 + 7 * Math.sin((2 * Math.PI * t) / 4000)], t);
      const v = n.value(t);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max).toBeGreaterThan(0.7);
    expect(min).toBeLessThan(-0.7);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(-1);
  });

  it('gives the same output for scaled input', () => {
    const a = new BreathingNormalizer();
    const b = new BreathingNormalizer();
    expect(feed(a, 0, 10_000, 0, 1)).toBeCloseTo(feed(b, 0, 10_000, 500, 40), 6);
  });

  it('switches to a 12/min idle breath after 2 s without samples', () => {
    const n = new BreathingNormalizer();
    feed(n, 0, 5000);
    expect(n.isLive(6000)).toBe(true);
    expect(n.isLive(7100)).toBe(false);
    for (let t = 7100; t < 21_250; t += 50) n.value(t);
    // At a crest of the idle sine; the light smoothing only lags it slightly.
    expect(idleBreath(21_250)).toBeCloseTo(1);
    expect(n.value(21_250)).toBeGreaterThan(0.95);
  });

  it('outputs 0 for a flat signal and idles when never fed', () => {
    const n = new BreathingNormalizer();
    for (let t = 0; t < 3000; t += 50) n.push([5], t);
    expect(n.value(3000)).toBeCloseTo(0);
    const m = new BreathingNormalizer();
    expect(m.isLive(0)).toBe(false);
    expect(m.value(1250)).toBeCloseTo(idleBreath(1250));
    m.push([], 10);
    expect(m.isLive(10)).toBe(false);
    m.reset();
  });

  it('idle breath runs at 12 per minute', () => {
    expect(idleBreath(0)).toBeCloseTo(0);
    expect(idleBreath(1250)).toBeCloseTo(1); // quarter of a 5 s cycle
    expect(idleBreath(5000)).toBeCloseTo(0);
  });
});
