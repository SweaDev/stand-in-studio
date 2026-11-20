import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HeadPoseSmoother, computeFaceFeatures } from '../../../../src/core/features/faceGeometry';
import { syntheticFace } from '../../../../src/core/features/syntheticFace';
import { DLIB_68 } from '../../../../src/core/features/LandmarkLayout';

describe('computeFaceFeatures', () => {
  it('recovers the parameters of a synthetic face', () => {
    const f = computeFaceFeatures(syntheticFace({ pitch: 0.6, yaw: -0.1, mouthGap: 0.2, eyeOpenness: 0.3 }));
    expect(f).not.toBeNull();
    expect(f?.pitch).toBeCloseTo(0.6);
    expect(f?.yaw).toBeCloseTo(-0.1);
    expect(f?.mouthGap).toBeCloseTo(0.2);
    expect(f?.eyeOpenness).toBeCloseTo(0.3);
    expect(f?.eyeDistancePx).toBeCloseTo(60);
    expect(f?.roll).toBeCloseTo(0);
  });

  it('is invariant to roll, scale and position (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.3, max: 0.9, noNaN: true }),
        fc.double({ min: -0.4, max: 0.4, noNaN: true }),
        fc.double({ min: -0.6, max: 0.6, noNaN: true }),
        fc.double({ min: 20, max: 300, noNaN: true }),
        fc.double({ min: 0, max: 0.6, noNaN: true }),
        (pitch, yaw, roll, scale, mouthGap) => {
          const f = computeFaceFeatures(
            syntheticFace({ pitch, yaw, roll, scale, mouthGap, eyeOpenness: 0.25, cx: 300, cy: 200 }),
          );
          expect(f?.pitch).toBeCloseTo(pitch, 6);
          expect(f?.yaw).toBeCloseTo(yaw, 6);
          expect(f?.roll).toBeCloseTo(roll, 6);
          expect(f?.mouthGap).toBeCloseTo(mouthGap, 6);
          expect(f?.eyeOpenness).toBeCloseTo(0.25, 6);
        },
      ),
    );
  });

  it('supports the dlib-68 layout', () => {
    const f = computeFaceFeatures(
      syntheticFace({ pitch: 0.5, yaw: 0.05, mouthGap: 0, eyeOpenness: 0.2 }, DLIB_68),
    );
    expect(f?.pitch).toBeCloseTo(0.5);
    expect(f?.eyeOpenness).toBeCloseTo(0.2);
  });

  it('returns null for unknown or degenerate input', () => {
    expect(computeFaceFeatures([])).toBeNull();
    expect(computeFaceFeatures(Array.from({ length: 478 }, () => ({ x: 1, y: 1 })))).toBeNull();
    expect(
      computeFaceFeatures(
        Array.from({ length: 10 }, () => ({ x: 1, y: 1 })),
        DLIB_68,
      ),
    ).toBeNull();
  });
});

describe('HeadPoseSmoother', () => {
  it('smooths pitch and yaw but passes other features through', () => {
    const s = new HeadPoseSmoother(100);
    const base = { pitch: 0, yaw: 0, roll: 0, mouthGap: 0.1, eyeOpenness: 0.3, eyeDistancePx: 50 };
    s.update(base, 0);
    const out = s.update({ ...base, pitch: 1, yaw: -1, mouthGap: 0.5 }, 100);
    expect(out.pitch).toBeCloseTo(1 - Math.exp(-1));
    expect(out.yaw).toBeCloseTo(-(1 - Math.exp(-1)));
    expect(out.mouthGap).toBe(0.5);
    s.reset();
    expect(s.update({ ...base, pitch: 2 }, 200).pitch).toBe(2);
  });
});
