import type { FaceBox, Point } from '../../shared/types';
import { type LandmarkLayout, MEDIAPIPE_FACE_MESH, detectLayout } from './LandmarkLayout';

/** MediaPipe face-mesh points on the face outline: forehead top, chin, right and left cheek. */
const MESH = { top: 10, chin: 152, right: 234, left: 454 } as const;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Where the face is in the input frame (pixels of the analysed video), from one landmark
 * frame. With the full 478-point mesh it uses the face outline. Otherwise it estimates the
 * box from the eyes: a face is about 3 eye-distances tall and 2.3 wide, centred a little
 * below the eye line. Null for unknown layouts or degenerate geometry.
 */
export function faceBoxFrom(points: readonly Point[], layout?: LandmarkLayout | null): FaceBox | null {
  const L = layout ?? detectLayout(points.length);
  if (!L) return null;
  const oa = points[L.eyeOuterA];
  const ia = points[L.eyeInnerA];
  const ob = points[L.eyeOuterB];
  const ib = points[L.eyeInnerB];
  if (!oa || !ia || !ob || !ib) return null;
  const eyeA = mid(oa, ia);
  const eyeB = mid(ob, ib);
  const ed = dist(eyeA, eyeB);
  if (!(ed > 1e-6)) return null;

  if (L === MEDIAPIPE_FACE_MESH) {
    const top = points[MESH.top];
    const chin = points[MESH.chin];
    const right = points[MESH.right];
    const left = points[MESH.left];
    if (top && chin && right && left) {
      const h = dist(top, chin);
      const w = dist(right, left);
      // Synthetic or partial meshes leave the outline points piled up: fall back then.
      if (h > ed * 1.5 && w > ed * 1.2) {
        const c = mid(mid(top, chin), mid(right, left));
        return { cx: c.x, cy: c.y, w, h };
      }
    }
  }
  const eyes = mid(eyeA, eyeB);
  return { cx: eyes.x, cy: eyes.y + ed * 0.3, w: ed * 2.3, h: ed * 3 };
}

/**
 * Smooths face boxes over time (landmarks arrive ~20 times a second, slightly late), so the
 * character follows the face without jitter: position settles in ~150 ms, size in ~500 ms.
 * Reports null once no face has been seen for `staleMs`.
 */
export class FaceBoxTracker {
  private box: FaceBox | null = null;
  private at = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly posTauMs = 150,
    private readonly sizeTauMs = 500,
    private readonly staleMs = 800,
  ) {}

  push(b: FaceBox, now: number): void {
    const prev = this.box;
    if (!prev || now - this.at > this.staleMs) {
      this.box = { ...b };
    } else {
      const dt = Math.max(0, now - this.at);
      const kp = 1 - Math.exp(-dt / this.posTauMs);
      const ks = 1 - Math.exp(-dt / this.sizeTauMs);
      this.box = {
        cx: prev.cx + (b.cx - prev.cx) * kp,
        cy: prev.cy + (b.cy - prev.cy) * kp,
        w: prev.w + (b.w - prev.w) * ks,
        h: prev.h + (b.h - prev.h) * ks,
      };
    }
    this.at = now;
  }

  value(now: number): FaceBox | null {
    return this.box && now - this.at <= this.staleMs ? { ...this.box } : null;
  }

  /** The last face seen, however old (held while sensing is paused). */
  get last(): FaceBox | null {
    return this.box ? { ...this.box } : null;
  }

  reset(): void {
    this.box = null;
    this.at = Number.NEGATIVE_INFINITY;
  }
}
