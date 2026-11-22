import type { FeedSource } from './StageCompositor';
import type { Ctx2D } from './sketch';

/** Where a feed of the given size fits inside the box, whole and centred (letterboxed). */
export function containRect(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  if (srcW <= 0 || srcH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const s = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/**
 * The control window's "Live input" preview: the raw camera, clip or demo video, whole and
 * unprocessed (no opacity, character or badges). The processed picture is the Virtual Stage.
 */
export function drawRawPreview(ctx: Ctx2D, width: number, height: number, feed: FeedSource | null): void {
  ctx.fillStyle = '#0d0c10';
  ctx.fillRect(0, 0, width, height);
  if (!feed) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 ${Math.round(height / 18)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Waiting for video…', width / 2, height / 2);
    return;
  }
  const r = containRect(feed.width, feed.height, width, height);
  ctx.drawImage(feed.image, r.x, r.y, r.w, r.h);
}
