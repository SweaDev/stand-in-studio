import type { Point } from '../../shared/types';
import { ExpSmoother } from '../util/math';
import type { FaceFeatures } from './FaceFeatures';
import { type LandmarkLayout, detectLayout } from './LandmarkLayout';

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Rotates vector v by -angle (undoes head roll). */
function unroll(v: Point, angle: number): Point {
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Computes scale-free features from one landmark frame (REQUIREMENT §4): pitch and yaw
 * from the nose tip vs the eye midpoint, divided by the eye distance; inner-lip gap; and
 * eye openness. Returns null for unknown layouts or degenerate geometry.
 */
export function computeFaceFeatures(
  points: readonly Point[],
  layout?: LandmarkLayout | null,
): FaceFeatures | null {
  const L = layout ?? detectLayout(points.length);
  if (!L) return null;
  const p = (i: number): Point | undefined => points[i];
  const oa = p(L.eyeOuterA);
  const ia = p(L.eyeInnerA);
  const ob = p(L.eyeOuterB);
  const ib = p(L.eyeInnerB);
  const nose = p(L.noseTip);
  const lu = p(L.innerLipUpper);
  const ll = p(L.innerLipLower);
  const ua = p(L.upperLidA);
  const la = p(L.lowerLidA);
  const ub = p(L.upperLidB);
  const lb = p(L.lowerLidB);
  if (!oa || !ia || !ob || !ib || !nose || !lu || !ll || !ua || !la || !ub || !lb) return null;

  const eyeA = mid(oa, ia);
  const eyeB = mid(ob, ib);
  const ed = dist(eyeA, eyeB);
  if (!(ed > 1e-6)) return null;
  const roll = Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x);
  const eyeMid = mid(eyeA, eyeB);
  const n = unroll({ x: nose.x - eyeMid.x, y: nose.y - eyeMid.y }, roll);
  const widthA = dist(oa, ia);
  const widthB = dist(ob, ib);
  const openA = widthA > 0 ? dist(ua, la) / widthA : 0;
  const openB = widthB > 0 ? dist(ub, lb) / widthB : 0;

  const features: FaceFeatures = {
    pitch: n.y / ed,
    yaw: n.x / ed,
    roll,
    mouthGap: dist(lu, ll) / ed,
    eyeOpenness: (openA + openB) / 2,
    eyeDistancePx: ed,
  };
  // Iris points exist only in the 478-point mesh (468 + 10 iris points).
  const irA = L.irisA !== undefined ? p(L.irisA) : undefined;
  const irB = L.irisB !== undefined ? p(L.irisB) : undefined;
  if (irA && irB && points.length >= 478 && widthA > 0 && widthB > 0) {
    const ga = unroll({ x: irA.x - eyeA.x, y: irA.y - eyeA.y }, roll);
    const gb = unroll({ x: irB.x - eyeB.x, y: irB.y - eyeB.y }, roll);
    features.gazeX = (ga.x / widthA + gb.x / widthB) / 2;
    features.gazeY = (ga.y / widthA + gb.y / widthB) / 2;
  }
  return features;
}

/** Light smoothing of head pose so jittery landmarks don't shake the character. */
export class HeadPoseSmoother {
  private readonly pitch: ExpSmoother;
  private readonly yaw: ExpSmoother;

  constructor(tauMs = 60) {
    this.pitch = new ExpSmoother(tauMs);
    this.yaw = new ExpSmoother(tauMs);
  }

  update(f: FaceFeatures, now: number): FaceFeatures {
    return { ...f, pitch: this.pitch.update(f.pitch, now), yaw: this.yaw.update(f.yaw, now) };
  }

  reset(): void {
    this.pitch.reset();
    this.yaw.reset();
  }
}
