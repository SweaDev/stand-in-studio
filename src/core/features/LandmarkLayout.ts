/**
 * Landmark index layouts (Strategy). The SDK's layout is not documented; 3.5.0 delivers
 * 478 MediaPipe Face Mesh points (docs/sdk-notes.md). A dlib-68 layout is kept as a
 * fallback so a future SDK change degrades gracefully instead of breaking.
 *
 * "A" and "B" are the two sides as they appear in the image (A = image-left).
 */
export interface LandmarkLayout {
  readonly name: string;
  readonly noseTip: number;
  readonly eyeOuterA: number;
  readonly eyeOuterB: number;
  readonly eyeInnerA: number;
  readonly eyeInnerB: number;
  readonly upperLidA: number;
  readonly lowerLidA: number;
  readonly upperLidB: number;
  readonly lowerLidB: number;
  readonly innerLipUpper: number;
  readonly innerLipLower: number;
  readonly mouthCornerA: number;
  readonly mouthCornerB: number;
}

export const MEDIAPIPE_FACE_MESH: LandmarkLayout = Object.freeze({
  name: 'mediapipe-face-mesh',
  noseTip: 1,
  eyeOuterA: 33,
  eyeOuterB: 263,
  eyeInnerA: 133,
  eyeInnerB: 362,
  upperLidA: 159,
  lowerLidA: 145,
  upperLidB: 386,
  lowerLidB: 374,
  innerLipUpper: 13,
  innerLipLower: 14,
  mouthCornerA: 78,
  mouthCornerB: 308,
});

export const DLIB_68: LandmarkLayout = Object.freeze({
  name: 'dlib-68',
  noseTip: 30,
  eyeOuterA: 36,
  eyeOuterB: 45,
  eyeInnerA: 39,
  eyeInnerB: 42,
  upperLidA: 37,
  lowerLidA: 41,
  upperLidB: 44,
  lowerLidB: 46,
  innerLipUpper: 62,
  innerLipLower: 66,
  mouthCornerA: 60,
  mouthCornerB: 64,
});

/** Picks the layout from the number of points, or null when unknown. */
export function detectLayout(pointCount: number): LandmarkLayout | null {
  if (pointCount === 478 || pointCount === 468) return MEDIAPIPE_FACE_MESH;
  if (pointCount === 68) return DLIB_68;
  return null;
}
