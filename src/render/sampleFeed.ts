import type { Ctx2D } from './sketch';

export interface SamplePerson {
  /** Nod/tilt in eye-distances relative to neutral (≈0 at rest). */
  pitch: number;
  yaw: number;
  mouthOpen: number;
  present: boolean;
}

/**
 * Procedural stand-in for a webcam in Demo mode: a softly lit room with a person-shaped
 * silhouette that follows the simulated signals. No video files or photos are shipped.
 */
export function drawSampleFeed(ctx: Ctx2D, W: number, H: number, p: SamplePerson, t: number): void {
  const wall = ctx.createLinearGradient(0, 0, W, H);
  wall.addColorStop(0, '#d9c8b4');
  wall.addColorStop(1, '#9c8b7a');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // Window light and a shelf, for depth.
  ctx.fillStyle = 'rgba(255, 250, 230, 0.55)';
  ctx.fillRect(W * 0.06, H * 0.1, W * 0.2, H * 0.42);
  ctx.strokeStyle = 'rgba(120, 100, 80, 0.6)';
  ctx.lineWidth = H * 0.01;
  ctx.strokeRect(W * 0.06, H * 0.1, W * 0.2, H * 0.42);
  ctx.fillStyle = '#7a5c43';
  ctx.fillRect(W * 0.7, H * 0.3, W * 0.25, H * 0.025);
  ctx.fillStyle = '#5c9e5a';
  ctx.beginPath();
  ctx.arc(W * 0.76, H * 0.27, H * 0.04, 0, Math.PI * 2);
  ctx.fill();

  if (!p.present) return;
  const sway = Math.sin(t / 2100) * W * 0.004;
  const cx = W * 0.5 + p.yaw * W * 0.25 + sway;
  const headY = H * 0.42 + p.pitch * H * 0.35;
  const headR = H * 0.15;

  // Shoulders and chest.
  ctx.fillStyle = '#3d5a80';
  ctx.beginPath();
  ctx.ellipse(W * 0.5 + sway, H * 1.02, W * 0.26, H * 0.36, 0, Math.PI, 0);
  ctx.fill();
  // Neck.
  ctx.fillStyle = '#c69c7b';
  ctx.fillRect(cx - headR * 0.35, headY + headR * 0.6, headR * 0.7, headR * 0.8);
  // Head and hair.
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR * 0.82, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b2a20';
  ctx.beginPath();
  ctx.ellipse(cx, headY - headR * 0.45, headR * 0.88, headR * 0.6, 0, Math.PI, 0);
  ctx.fill();
  // Simple features.
  const fx = cx + p.yaw * headR * 0.6;
  ctx.fillStyle = '#2d2a32';
  for (const dx of [-0.32, 0.32]) {
    ctx.beginPath();
    ctx.arc(fx + dx * headR, headY - headR * 0.05, headR * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#7a2e1f';
  ctx.beginPath();
  ctx.ellipse(
    fx,
    headY + headR * 0.45,
    headR * 0.22,
    Math.max(1, headR * 0.2 * p.mouthOpen + 1),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}
