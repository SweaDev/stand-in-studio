import type { StageState } from '../shared/types';
import { C } from '../core/constants';
import { clamp, clamp01, easeInOutCubic, lerp } from '../core/util/math';
import type { Body } from './characterBody';
import { getCharacter } from './characters/registry';

export interface Box {
  cx: number;
  cy: number;
  size: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the character sits on a W×H stage:
 * - Over (Blend) / Character: centred and large, feed dimmed behind;
 * - Beside (Blend): lower third, feed above;
 * - Auto: glides from centre (feed hidden) to the lower-right corner as more of the feed
 *   shows, so a speaker is never covered by their own stand-in;
 * - Camera with the badge: small in a corner.
 */
export function characterBox(s: StageState, W: number, H: number, src?: SourceSize | null): Box {
  const centre: Box = { cx: W / 2, cy: H * 0.52, size: H * 0.78 };
  const corner: Box = { cx: W - H * 0.2, cy: H - H * 0.19, size: H * 0.28 };
  if (src) {
    const onFace = faceCharacterBox(s, W, H, src);
    // Lip-reading zoom: the character steps aside to a corner badge, off your mouth.
    if (s.zoom > 0.001) {
      const from = onFace ?? centre;
      const k = easeInOutCubic(clamp01(s.zoom));
      return {
        cx: lerp(from.cx, corner.cx, k),
        cy: lerp(from.cy, corner.cy, k),
        size: lerp(from.size, corner.size, k),
      };
    }
    if (onFace) {
      // Nothing to overlap at 0%: glide to the centre as the feed fades out.
      const k = easeInOutCubic(clamp01(s.feedOpacity / 0.3));
      return {
        cx: lerp(centre.cx, onFace.cx, k),
        cy: lerp(centre.cy, onFace.cy, k),
        size: lerp(centre.size, onFace.size, k),
      };
    }
  }
  if (s.mode === 'camera') return corner;
  if (s.mode === 'blend' && s.layout === 'beside') return { cx: W / 2, cy: H * (5 / 6), size: H / 3 };
  if (s.mode === 'auto') {
    const k = clamp01((s.feedOpacity - 0.3) / 0.6);
    return {
      cx: lerp(centre.cx, corner.cx, k),
      cy: lerp(centre.cy, corner.cy, k),
      size: lerp(centre.size, corner.size, k),
    };
  }
  return centre;
}

/** Region the camera feed fills. */
export function feedRect(s: StageState, W: number, H: number): Rect {
  if (s.mode === 'blend' && s.layout === 'beside') return { x: 0, y: 0, w: W, h: (H * 2) / 3 };
  return { x: 0, y: 0, w: W, h: H };
}

/** Source crop so the feed covers `dst` without distortion (CSS object-fit: cover). */
export function coverCrop(srcW: number, srcH: number, dst: Rect): Rect {
  const srcAspect = srcW / srcH;
  const dstAspect = dst.w / dst.h;
  if (srcAspect > dstAspect) {
    const w = srcH * dstAspect;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / dstAspect;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

/** Blur radius (px at 720p) that makes a faint feed read as atmosphere, not a ghost. */
export function feedBlurPx(opacity: number, H: number): number {
  if (opacity >= C.BLUR_BELOW) return 0;
  return ((C.BLUR_BELOW - opacity) / C.BLUR_BELOW) * 14 * (H / 720);
}

/** Pixel size of the feed being drawn (the analysed input frame). */
export interface SourceSize {
  width: number;
  height: number;
}

/** The character follows the face in Blend (Over) and Auto when a face is known. */
export function followsFace(s: StageState): boolean {
  return (
    s.faceAnchor.follow &&
    s.face !== null &&
    (s.mode === 'auto' || (s.mode === 'blend' && s.layout === 'over'))
  );
}

/**
 * Source crop of the feed: cover-fit, eased toward a face close-up by the lip-reading zoom
 * (the face, with room for the chin and mouth, fills about 60% of the height).
 */
export function feedCrop(s: StageState, src: SourceSize, dst: Rect): Rect {
  const cover = coverCrop(src.width, src.height, dst);
  if (!(s.zoom > 0.001) || !s.face) return cover;
  const aspect = dst.w / dst.h;
  let h = Math.min(cover.h, s.face.h / 0.6);
  let w = h * aspect;
  if (w > cover.w) {
    w = cover.w;
    h = w / aspect;
  }
  const x = clamp(s.face.cx - w / 2, 0, Math.max(0, src.width - w));
  const y = clamp(s.face.cy + s.face.h * 0.08 - h / 2, 0, Math.max(0, src.height - h));
  const k = easeInOutCubic(clamp01(s.zoom));
  return { x: lerp(cover.x, x, k), y: lerp(cover.y, y, k), w: lerp(cover.w, w, k), h: lerp(cover.h, h, k) };
}

/** Used when a character's body is unknown (e.g. in tests without characters loaded). */
export const DEFAULT_BODY: Body = { w: 0.5, h: 0.5, dx: 0, dy: 0 };

/** The character over the face (sized from it, with the user's offset), or null. */
export function faceCharacterBox(s: StageState, W: number, H: number, src: SourceSize): Box | null {
  if (!followsFace(s) || !s.face) return null;
  const dst = feedRect(s, W, H);
  const crop = feedCrop(s, src, dst);
  const sx = dst.w / crop.w;
  const sy = dst.h / crop.h;
  const fx = dst.x + (s.face.cx - crop.x) * sx;
  const fy = dst.y + (s.face.cy - crop.y) * sy;
  const fw = s.face.w * sx;
  const fh = s.face.h * sy;
  const a = s.faceAnchor;
  // Size 100%: the character's solid body just covers the face on screen.
  const body = getCharacter(s.character)?.body ?? DEFAULT_BODY;
  const size = Math.max(fw / body.w, fh / body.h) * a.size;
  return {
    cx: fx + a.offsetX * fw - body.dx * size,
    cy: fy + a.offsetY * fh - body.dy * size,
    size,
  };
}

/**
 * Character opacity on the stage. Over the face it mirrors the dial (40% you = 60%
 * character), capped by the user's "opacity over face"; elsewhere it is the engine's value.
 */
export function characterAlpha(s: StageState, src?: SourceSize | null): number {
  if (!src || !followsFace(s) || s.zoom > 0.5) return s.characterOpacity;
  return s.characterOpacity * Math.min(s.faceAnchor.opacity, 1 - s.feedOpacity);
}
