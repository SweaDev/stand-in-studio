import { describe, expect, it } from 'vitest';
import { DLIB_68, MEDIAPIPE_FACE_MESH, detectLayout } from '../../../../src/core/features/LandmarkLayout';

describe('detectLayout', () => {
  it('recognises MediaPipe (with and without iris points) and dlib', () => {
    expect(detectLayout(478)).toBe(MEDIAPIPE_FACE_MESH);
    expect(detectLayout(468)).toBe(MEDIAPIPE_FACE_MESH);
    expect(detectLayout(68)).toBe(DLIB_68);
    expect(detectLayout(0)).toBeNull();
    expect(detectLayout(100)).toBeNull();
  });
  it('uses indices inside the point range', () => {
    for (const [layout, n] of [
      [MEDIAPIPE_FACE_MESH, 468],
      [DLIB_68, 68],
    ] as const) {
      for (const [k, v] of Object.entries(layout)) {
        if (k === 'name') continue;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
      }
    }
  });
});
