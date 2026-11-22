import type { Point } from '../../shared/types';
import { type LandmarkLayout, MEDIAPIPE_FACE_MESH } from './LandmarkLayout';

/** Parameters for a synthetic face, in the same units computeFaceFeatures reports. */
export interface SyntheticFaceParams {
  /** Nose tip below eye midpoint, in eye-distances (≈0.55 at rest). */
  pitch: number;
  /** Nose tip right of eye midpoint, in eye-distances. */
  yaw: number;
  /** Head roll (radians). */
  roll?: number;
  /** Inner-lip gap in eye-distances. */
  mouthGap: number;
  /** Eyelid gap / eye width. */
  eyeOpenness: number;
  /** Eye-in-head gaze offset in eye-widths (iris points; 478 layout only). */
  gazeX?: number;
  gazeY?: number;
  /** Eye distance in pixels. */
  scale?: number;
  /** Eye midpoint position in pixels. */
  cx?: number;
  cy?: number;
}

/**
 * Builds a landmark array (MediaPipe 478 layout by default) whose key points produce the
 * requested features. Used by tests and by Demo mode to drive the real feature pipeline.
 */
export function syntheticFace(
  params: SyntheticFaceParams,
  layout: LandmarkLayout = MEDIAPIPE_FACE_MESH,
): Point[] {
  const { pitch, yaw, mouthGap, eyeOpenness } = params;
  const roll = params.roll ?? 0;
  const ed = params.scale ?? 60;
  const cx = params.cx ?? 480;
  const cy = params.cy ?? 230;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  // Local face coordinates in eye-distances: x right, y down, origin at eye midpoint.
  const at = (x: number, y: number): Point => ({
    x: cx + (x * c - y * s) * ed,
    y: cy + (x * s + y * c) * ed,
  });

  const count = layout === MEDIAPIPE_FACE_MESH ? 478 : 68;
  const pts: Point[] = Array.from({ length: count }, () => at(0, 0.3));
  const eyeW = 0.5; // eye width in ed
  const lid = (eyeOpenness * eyeW) / 2;
  pts[layout.eyeOuterA] = at(-0.5 - eyeW / 2, 0);
  pts[layout.eyeInnerA] = at(-0.5 + eyeW / 2, 0);
  pts[layout.eyeInnerB] = at(0.5 - eyeW / 2, 0);
  pts[layout.eyeOuterB] = at(0.5 + eyeW / 2, 0);
  pts[layout.upperLidA] = at(-0.5, -lid);
  pts[layout.lowerLidA] = at(-0.5, lid);
  pts[layout.upperLidB] = at(0.5, -lid);
  pts[layout.lowerLidB] = at(0.5, lid);
  pts[layout.noseTip] = at(yaw, pitch);
  const mouthY = pitch + 0.45;
  pts[layout.innerLipUpper] = at(yaw * 0.8, mouthY - mouthGap / 2);
  pts[layout.innerLipLower] = at(yaw * 0.8, mouthY + mouthGap / 2);
  pts[layout.mouthCornerA] = at(yaw * 0.8 - 0.4, mouthY);
  pts[layout.mouthCornerB] = at(yaw * 0.8 + 0.4, mouthY);
  const gx = (params.gazeX ?? 0) * eyeW;
  const gy = (params.gazeY ?? 0) * eyeW;
  if (layout.irisA !== undefined) pts[layout.irisA] = at(-0.5 + gx, gy);
  if (layout.irisB !== undefined) pts[layout.irisB] = at(0.5 + gx, gy);
  return pts;
}
