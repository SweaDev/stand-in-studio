import { describe, expect, it } from 'vitest';
import { FaceBoxTracker, faceBoxFrom } from '../../../src/core/features/faceBox';
import { syntheticFace } from '../../../src/core/features/syntheticFace';

describe('faceBoxFrom', () => {
  it('estimates the face from the eyes when the mesh outline is missing (synthetic faces)', () => {
    const b = faceBoxFrom(
      syntheticFace({ pitch: 0, yaw: 0, mouthGap: 0, eyeOpenness: 0.3, cx: 400, cy: 200, scale: 60 }),
    );
    expect(b?.cx).toBeCloseTo(400);
    expect(b?.cy).toBeCloseTo(200 + 18);
    expect(b?.h).toBeCloseTo(180);
    expect(b?.w).toBeCloseTo(138);
  });

  it('uses the mesh outline (forehead, chin, cheeks) on a full 478-point mesh', () => {
    const pts = syntheticFace({
      pitch: 0,
      yaw: 0,
      mouthGap: 0,
      eyeOpenness: 0.3,
      cx: 400,
      cy: 200,
      scale: 60,
    });
    pts[10] = { x: 400, y: 100 };
    pts[152] = { x: 400, y: 340 };
    pts[234] = { x: 310, y: 230 };
    pts[454] = { x: 490, y: 230 };
    const b = faceBoxFrom(pts);
    expect(b).toMatchObject({ w: 180, h: 240 });
    expect(b?.cx).toBeCloseTo(400);
    expect(b?.cy).toBeCloseTo(225);
  });

  it('rejects unknown layouts', () => {
    expect(faceBoxFrom([{ x: 1, y: 1 }])).toBeNull();
  });
});

describe('FaceBoxTracker', () => {
  it('smooths position quickly and size slowly, and goes stale', () => {
    const t = new FaceBoxTracker(150, 500, 800);
    t.push({ cx: 100, cy: 100, w: 100, h: 100 }, 0);
    t.push({ cx: 200, cy: 100, w: 200, h: 200 }, 150);
    const v = t.value(150);
    expect(v?.cx).toBeGreaterThan(150);
    expect(v?.w).toBeLessThan(140);
    expect(t.value(900)).not.toBeNull();
    expect(t.value(1000)).toBeNull();
    expect(t.last).not.toBeNull();
    t.push({ cx: 500, cy: 500, w: 50, h: 50 }, 2000);
    expect(t.value(2000)).toEqual({ cx: 500, cy: 500, w: 50, h: 50 });
  });
});
