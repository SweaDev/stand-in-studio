import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { OpacitySmoother } from '../../../../src/core/stage/OpacitySmoother';

describe('OpacitySmoother', () => {
  it('cross-fades with an ease-in-out curve over 450 ms', () => {
    const s = new OpacitySmoother(0);
    s.value(0);
    s.setTarget(1, 'fade', 0);
    expect(s.value(0)).toBe(0);
    expect(s.value(100)).toBeLessThan(0.1); // slow start
    expect(s.value(225)).toBeCloseTo(0.5);
    expect(s.value(400)).toBeGreaterThan(0.9);
    expect(s.value(450)).toBe(1);
    expect(s.target).toBe(1);
  });

  it('limits Auto changes to 40% per second', () => {
    const s = new OpacitySmoother(1);
    s.value(0);
    s.setTarget(0, 'rate', 0);
    expect(s.value(1000)).toBeCloseTo(0.6);
    expect(s.value(2000)).toBeCloseTo(0.2);
    expect(s.value(3000)).toBe(0);
  });

  it('never moves faster than the rate limit (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.integer({ min: 1, max: 500 })), {
          maxLength: 30,
        }),
        (steps) => {
          const s = new OpacitySmoother(0.5);
          let t = 0;
          let prev = s.value(t);
          for (const [target, dt] of steps) {
            s.setTarget(target, 'rate', t);
            t += dt;
            const v = s.value(t);
            expect(Math.abs(v - prev)).toBeLessThanOrEqual((0.4 * dt) / 1000 + 1e-9);
            prev = v;
          }
        },
      ),
    );
  });

  it('jumps for instant transitions and snaps', () => {
    const s = new OpacitySmoother(1);
    s.setTarget(0, 'instant', 10);
    expect(s.value(10)).toBe(0);
    s.snap(0.7, 20);
    expect(s.value(30)).toBe(0.7);
  });

  it('changes course smoothly mid-fade', () => {
    const s = new OpacitySmoother(0);
    s.value(0);
    s.setTarget(1, 'fade', 0);
    const mid = s.value(225);
    s.setTarget(0, 'fade', 225);
    expect(s.value(225)).toBeCloseTo(mid);
    expect(s.value(675)).toBe(0);
    s.setTarget(0, 'fade', 700); // same target: no restart
    expect(s.value(700)).toBe(0);
  });
});
