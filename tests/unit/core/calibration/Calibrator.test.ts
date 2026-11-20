import { describe, expect, it } from 'vitest';
import { Calibrator, DEFAULT_BASELINE } from '../../../../src/core/calibration/Calibrator';
import type { FaceFeatures } from '../../../../src/core/features/FaceFeatures';

const feat = (o: Partial<FaceFeatures> = {}): FaceFeatures => ({
  pitch: 0.6,
  yaw: 0.02,
  roll: 0,
  mouthGap: 0.02,
  eyeOpenness: 0.32,
  eyeDistancePx: 60,
  ...o,
});

describe('Calibrator', () => {
  it('runs idle → collecting → done after 15 s with enough samples', () => {
    const c = new Calibrator();
    expect(c.state).toBe('idle');
    expect(c.progress(0)).toBe(0);
    c.start(1000);
    expect(c.state).toBe('collecting');
    for (let i = 0; i < 60; i++) {
      c.addFeatures(feat({ mouthGap: i % 4 === 0 ? 0.3 : 0.02, pitch: 0.6 + (i % 2) * 0.01 }));
      c.addHappy(0.2);
    }
    c.addBlink();
    c.addBlink();
    c.addBlink();
    expect(c.progress(8500)).toBeCloseTo(0.5);
    expect(c.update(15_999)).toBeNull();
    const b = c.update(16_000);
    expect(c.state).toBe('done');
    expect(b).not.toBeNull();
    expect(b?.pitch).toBeCloseTo(0.605);
    expect(b?.yaw).toBeCloseTo(0.02);
    expect(b?.mouthGap).toBeCloseTo(0.02); // talking frames ignored by p20
    expect(b?.eyeOpenness).toBeCloseTo(0.32);
    expect(b?.happyRest).toBeCloseTo(0.2);
    expect(b?.blinksPerMin).toBeCloseTo(12);
    expect(b?.approximate).toBe(false);
    expect(c.progress(99_999)).toBe(1);
    expect(c.update(20_000)).toBe(b);
  });

  it('extends up to 30 s when the face was barely seen, then falls back to defaults', () => {
    const c = new Calibrator();
    c.start(0);
    c.addFeatures(feat());
    expect(c.update(15_000)).toBeNull();
    const b = c.update(30_000);
    expect(b?.approximate).toBe(true);
    expect(b?.pitch).toBeCloseTo(0.6);
    expect(b?.happyRest).toBe(DEFAULT_BASELINE.happyRest);
  });

  it('uses defaults for everything when nothing arrived', () => {
    const c = new Calibrator();
    c.start(0);
    const b = c.update(30_000);
    expect(b).toMatchObject({ ...DEFAULT_BASELINE, blinksPerMin: 0 });
  });

  it('ignores input outside collecting and can be reset', () => {
    const c = new Calibrator(100, 200, 1);
    c.addFeatures(feat());
    c.addHappy(1);
    c.addBlink();
    c.start(0);
    c.addFeatures(feat({ yaw: 0.5 }));
    expect(c.update(100)?.yaw).toBeCloseTo(0.5);
    c.reset();
    expect(c.state).toBe('idle');
    expect(c.baseline).toBeNull();
    expect(c.update(500)).toBeNull();
  });
});
