import { describe, expect, it } from 'vitest';
import { BlinkDetector } from '../../../../src/core/trackers/BlinkDetector';

describe('BlinkDetector', () => {
  it('fires once on the rising edge of the SDK flag', () => {
    const b = new BlinkDetector();
    expect(b.update({ sdkBlink: false }, null, 0)).toBe(false);
    expect(b.update({ sdkBlink: true }, null, 50)).toBe(true);
    expect(b.update({ sdkBlink: true }, null, 100)).toBe(false);
    expect(b.update({ sdkBlink: false }, null, 150)).toBe(false);
  });

  it('animates a 140 ms close-and-open', () => {
    const b = new BlinkDetector();
    expect(b.eyeOpen(0)).toBe(1);
    b.update({ sdkBlink: true }, null, 1000);
    expect(b.eyeOpen(1000)).toBe(1);
    expect(b.eyeOpen(1035)).toBeCloseTo(0.5);
    expect(b.eyeOpen(1070)).toBeCloseTo(0);
    expect(b.eyeOpen(1105)).toBeCloseTo(0.5);
    expect(b.eyeOpen(1140)).toBe(1);
  });

  it('enforces the refractory period', () => {
    const b = new BlinkDetector();
    expect(b.update({ sdkBlink: true }, null, 0)).toBe(true);
    b.update({ sdkBlink: false }, null, 100);
    expect(b.update({ sdkBlink: true }, null, 300)).toBe(false); // < 140 + 250
    b.update({ sdkBlink: false }, null, 350);
    expect(b.update({ sdkBlink: true }, null, 400)).toBe(true);
  });

  it('uses landmark eye openness as a backup below 60% of calibration', () => {
    const b = new BlinkDetector();
    expect(b.update({ eyeOpenness: 0.3 }, 0.3, 0)).toBe(false);
    expect(b.update({ eyeOpenness: 0.19 }, 0.3, 50)).toBe(true);
    expect(b.update({ eyeOpenness: 0.1 }, 0.3, 500)).toBe(false); // still closed: no new edge
    b.update({ eyeOpenness: 0.3 }, 0.3, 600);
    expect(b.update({ eyeOpenness: 0.1 }, 0.3, 700)).toBe(true);
  });

  it('ignores the backup without calibration or when landmarks are too coarse', () => {
    const b = new BlinkDetector();
    expect(b.update({ eyeOpenness: 0 }, null, 0)).toBe(false);
    expect(b.update({ eyeOpenness: 0 }, 0.05, 10)).toBe(false);
  });

  it('can be triggered directly and reset', () => {
    const b = new BlinkDetector();
    expect(b.trigger(0)).toBe(true);
    expect(b.trigger(100)).toBe(false);
    b.reset();
    expect(b.trigger(100)).toBe(true);
  });
});
