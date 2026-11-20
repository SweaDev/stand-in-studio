import type { Ctx2D } from './sketch';
import type { Box } from './layout';

function pill(ctx: Ctx2D, x: number, y: number, text: string, H: number, bg: string, fg: string): void {
  const fs = Math.round(H * 0.032);
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width + fs * 1.6;
  const h = fs * 1.9;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

/** Soft "speaking" ring around the character (visible even on a muted call). */
export function speakingRing(
  ctx: Ctx2D,
  box: Box,
  t: number,
  highContrast: boolean,
  reducedMotion: boolean,
): void {
  const pulse = reducedMotion ? 0 : Math.sin(t / 220) * 0.03;
  const r = box.size * (0.56 + pulse);
  ctx.beginPath();
  ctx.arc(box.cx, box.cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = highContrast ? '#00c853' : 'rgba(129, 230, 160, 0.9)';
  ctx.lineWidth = Math.max(3, box.size * (highContrast ? 0.04 : 0.025));
  ctx.stroke();
}

/** Simple raised-hand glyph in a round badge. */
export function raisedHandBadge(ctx: Ctx2D, x: number, y: number, r: number, highContrast: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = highContrast ? '#ffd600' : '#f6bd60';
  ctx.fill();
  ctx.strokeStyle = '#2d2a32';
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.stroke();
  // Palm and four fingers.
  ctx.fillStyle = '#2d2a32';
  ctx.beginPath();
  ctx.roundRect(x - r * 0.32, y - r * 0.05, r * 0.64, r * 0.55, r * 0.15);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.roundRect(x - r * 0.32 + i * r * 0.165, y - r * 0.55, r * 0.13, r * 0.6, r * 0.06);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(x + r * 0.22, y - r * 0.05, r * 0.32, r * 0.13, r * 0.06);
  ctx.fill();
}

export function backSoonBadge(ctx: Ctx2D, W: number, H: number, highContrast: boolean): void {
  pill(ctx, W / 2, H * 0.94, 'back soon', H, highContrast ? '#000' : 'rgba(29,27,34,0.75)', '#fff');
}

export function handBadgeText(ctx: Ctx2D, x: number, y: number, H: number, highContrast: boolean): void {
  pill(ctx, x, y, 'hand raised', H, highContrast ? '#000' : 'rgba(29,27,34,0.75)', '#fff');
}
