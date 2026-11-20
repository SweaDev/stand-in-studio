import type { StageState } from '../shared/types';
import { C } from '../core/constants';
import { clamp01, lerp } from '../core/util/math';

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
export function characterBox(s: StageState, W: number, H: number): Box {
  const centre: Box = { cx: W / 2, cy: H * 0.52, size: H * 0.78 };
  const corner: Box = { cx: W - H * 0.2, cy: H - H * 0.19, size: H * 0.28 };
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
