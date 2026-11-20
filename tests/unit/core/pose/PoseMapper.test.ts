import { describe, expect, it } from 'vitest';
import { PoseMapper, edToDegrees, type PoseInputs } from '../../../../src/core/pose/PoseMapper';
import { DEFAULT_BASELINE } from '../../../../src/core/calibration/Calibrator';

const baseline = { ...DEFAULT_BASELINE, pitch: 0.4, yaw: 0, mouthGap: 0.05, approximate: false };
const features = { pitch: 0.4, yaw: 0, roll: 0, mouthGap: 0.05, eyeOpenness: 0.3, eyeDistancePx: 60 };

function inputs(o: Partial<PoseInputs> = {}): PoseInputs {
  return {
    now: 1000,
    breath: 0,
    eyeOpen: 1,
    features,
    baseline,
    talking: false,
    smiling: false,
    glow: 0,
    presence: 'present',
    wake: 1,
    raisedHand: false,
    reducedMotion: false,
    ...o,
  };
}

describe('edToDegrees', () => {
  it('maps a 0.05 ed nose shift to about 5°', () => {
    expect(edToDegrees(0.05)).toBeCloseTo(4.78, 1);
    expect(edToDegrees(-0.05)).toBeCloseTo(-4.78, 1);
    expect(edToDegrees(5)).toBe(90);
  });
});

describe('PoseMapper', () => {
  it('is neutral at the calibrated pose', () => {
    const p = new PoseMapper().map(inputs());
    expect(p.pitch).toBeCloseTo(0);
    expect(p.yaw).toBeCloseTo(0);
    expect(p.mouthOpen).toBe(0);
    expect(p.eyeOpen).toBe(1);
    expect(p.sparkle).toBe(false);
  });

  it('amplifies a ~5° nod into a ~15° character nod', () => {
    const p = new PoseMapper().map(inputs({ features: { ...features, pitch: 0.45 } }));
    expect(p.pitch).toBeCloseTo(14.3, 0);
    const r = new PoseMapper().map(inputs({ features: { ...features, pitch: 0.45 }, reducedMotion: true }));
    expect(r.pitch).toBeCloseTo(7.2, 0);
  });

  it('clamps extreme head angles', () => {
    const p = new PoseMapper().map(inputs({ features: { ...features, pitch: 2, yaw: -2 } }));
    expect(p.pitch).toBe(30);
    expect(p.yaw).toBe(-35);
  });

  it('opens the mouth only while talking', () => {
    const m = new PoseMapper();
    const open = { ...features, mouthGap: 0.4 };
    expect(m.map(inputs({ features: open })).mouthOpen).toBe(0); // yawning/chewing
    expect(m.map(inputs({ features: open, talking: true })).mouthOpen).toBeCloseTo(1);
    expect(m.map(inputs({ features: features, talking: true })).mouthOpen).toBe(0.15);
    const flap = m.map(inputs({ features: null, talking: true, now: 1000 }));
    expect(flap.mouthOpen).toBeGreaterThan(0);
  });

  it('adds sparkles for a laugh unless motion is reduced', () => {
    const m = new PoseMapper();
    expect(m.map(inputs({ smiling: true, talking: true, glow: 0.8 })).sparkle).toBe(true);
    expect(m.map(inputs({ smiling: true, talking: true, reducedMotion: true })).sparkle).toBe(false);
  });

  it('turns gesture events into decaying pulses', () => {
    const m = new PoseMapper();
    m.onGesture({ kind: 'nod', t: 1000, enthusiastic: false });
    expect(m.map(inputs({ now: 1000 })).nodPulse).toBe(1);
    expect(m.map(inputs({ now: 1325 })).nodPulse).toBeCloseTo(0.5);
    expect(m.map(inputs({ now: 2000 })).nodPulse).toBe(0);
    expect(m.map(inputs({ now: 999 })).nodPulse).toBe(0);
    m.onGesture({ kind: 'shake', t: 3000, enthusiastic: true });
    const p = m.map(inputs({ now: 3100 }));
    expect(p.shakePulse).toBeGreaterThan(0.8);
    expect(p.enthusiastic).toBe(true);
    expect(m.map(inputs({ now: 5000 })).enthusiastic).toBe(false);
    m.reset();
    expect(m.map(inputs({ now: 3100 })).shakePulse).toBe(0);
  });

  it('closes the eyes while away and passes presence through', () => {
    const p = new PoseMapper().map(inputs({ presence: 'away', wake: 0, raisedHand: true, breath: 2 }));
    expect(p.eyeOpen).toBe(0);
    expect(p.presence).toBe('away');
    expect(p.raisedHand).toBe(true);
    expect(p.breath).toBe(1);
  });
});
