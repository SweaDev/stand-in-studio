import type { Ctx2D } from './sketch';

const BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];

/** Moving test card so you can confirm the meeting sees the live stage. */
export function drawTestPattern(ctx: Ctx2D, W: number, H: number, t: number): void {
  const bw = W / BARS.length;
  BARS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * bw, 0, bw + 1, H * 0.7);
  });
  ctx.fillStyle = '#1d1b22';
  ctx.fillRect(0, H * 0.7, W, H * 0.3);
  // A dot sweeping left to right proves the picture is live, not frozen.
  const x = ((t / 4000) % 1) * W;
  ctx.beginPath();
  ctx.arc(x, H * 0.78, H * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = '#f2a65a';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(H * 0.06)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Stand-In Studio · test pattern', W / 2, H * 0.88);
  ctx.font = `${Math.round(H * 0.035)}px system-ui, sans-serif`;
  ctx.fillText(new Date().toLocaleTimeString(), W / 2, H * 0.95);
}
