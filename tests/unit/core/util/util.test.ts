import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  Emitter,
  ExpSmoother,
  FakeClock,
  Hysteresis,
  RingBuffer,
  SustainTimer,
  TimeWindow,
  clamp,
  easeInOutCubic,
  lerp,
  mean,
  median,
  percentile,
} from '../../../../src/core/util';

describe('FakeClock', () => {
  it('advances and refuses to go backwards', () => {
    const c = new FakeClock(100);
    expect(c.advance(50)).toBe(150);
    c.set(200);
    expect(c.now()).toBe(200);
    expect(() => c.advance(-1)).toThrow();
    expect(() => c.set(10)).toThrow();
  });
});

describe('RingBuffer', () => {
  it('keeps the newest items in order', () => {
    const r = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => r.push(n));
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.size).toBe(3);
    expect(r.at(0)).toBe(3);
    expect(r.last()).toBe(5);
    expect(r.at(5)).toBeUndefined();
    r.clear();
    expect(r.size).toBe(0);
  });
  it('rejects bad capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
  });
  it('never exceeds capacity (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.array(fc.integer()), (cap, xs) => {
        const r = new RingBuffer<number>(cap);
        xs.forEach((x) => r.push(x));
        expect(r.toArray()).toEqual(xs.slice(-cap));
      }),
    );
  });
});

describe('TimeWindow', () => {
  it('drops samples outside the window', () => {
    const w = new TimeWindow<number>(1000);
    w.push(0, 1);
    w.push(500, 2);
    w.push(1200, 3);
    expect(w.values()).toEqual([2, 3]);
    expect(w.span()).toBe(700);
    w.prune(2000);
    expect(w.values()).toEqual([3]);
    w.clear();
    expect(w.size).toBe(0);
  });
});

describe('math', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });
  it('eases from 0 to 1 symmetrically and monotonically', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('computes percentiles', () => {
    expect(percentile([], 50)).toBeNaN();
    expect(percentile([3, 1, 2], 50)).toBe(2);
    expect(percentile([0, 10], 10)).toBeCloseTo(1);
    expect(median([5, 1, 9, 3])).toBe(4);
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBeNaN();
  });
  it('percentile stays within min..max (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), { minLength: 1 }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (xs, p) => {
          const v = percentile(xs, p);
          expect(v).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9);
          expect(v).toBeLessThanOrEqual(Math.max(...xs) + 1e-9);
        },
      ),
    );
  });
});

describe('ExpSmoother', () => {
  it('converges with a time constant independent of update rate', () => {
    const a = new ExpSmoother(100);
    const b = new ExpSmoother(100);
    a.update(0, 0);
    b.update(0, 0);
    for (let t = 10; t <= 100; t += 10) a.update(1, t);
    b.update(1, 100);
    // Piecewise updates reach the same point as one big step (exponential is memoryless).
    expect(a.current).toBeCloseTo(b.current as number, 6);
    expect(a.current).toBeCloseTo(1 - Math.exp(-1), 6);
    a.reset();
    expect(a.current).toBeUndefined();
  });
});

describe('Hysteresis', () => {
  it('uses separate thresholds and hold times', () => {
    const h = new Hysteresis({ on: 0.5, off: 0.3, onHoldMs: 100, offHoldMs: 50 });
    expect(h.update(0.6, 0)).toBe(false);
    expect(h.update(0.6, 99)).toBe(false);
    expect(h.update(0.6, 100)).toBe(true);
    expect(h.update(0.4, 150)).toBe(true); // between thresholds: stays on
    expect(h.update(0.2, 200)).toBe(true);
    expect(h.update(0.2, 250)).toBe(false);
  });
  it('resets the hold when the condition breaks', () => {
    const h = new Hysteresis({ on: 1, off: 0, onHoldMs: 100 });
    h.update(1, 0);
    h.update(0.5, 50);
    expect(h.update(1, 120)).toBe(false);
    expect(h.update(1, 220)).toBe(true);
  });
  it('supports boolean input and rejects inverted thresholds', () => {
    const h = new Hysteresis({ on: 1, off: 1, onHoldMs: 10, offHoldMs: 10 });
    h.updateBool(true, 0);
    expect(h.updateBool(true, 10)).toBe(true);
    h.updateBool(false, 20);
    expect(h.updateBool(false, 30)).toBe(false);
    h.reset(true);
    expect(h.active).toBe(true);
    expect(() => new Hysteresis({ on: 0, off: 1 })).toThrow();
  });
});

describe('SustainTimer', () => {
  it('measures continuous duration', () => {
    const s = new SustainTimer();
    expect(s.update(true, 0)).toBe(0);
    expect(s.update(true, 500)).toBe(500);
    expect(s.update(false, 600)).toBe(0);
    expect(s.update(true, 700)).toBe(0);
    s.reset();
    expect(s.update(true, 900)).toBe(0);
  });
});

describe('Emitter', () => {
  it('delivers typed events and unsubscribes', () => {
    const e = new Emitter<{ tick: number }>();
    const got: number[] = [];
    const off = e.on('tick', (n) => got.push(n));
    e.emit('tick', 1);
    off();
    e.emit('tick', 2);
    expect(got).toEqual([1]);
    e.clear();
  });
});
