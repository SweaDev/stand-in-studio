import { blinkingEye, boilSeed, glow, sketchEllipse, sketchLine, sparkle } from '../sketch';
import type { Character, DrawArgs } from './Character';
import { registerCharacter } from './registry';

/** Puffs relative to the cloud centre: [dx, dy, r] in units of H. */
const PUFFS: [number, number, number][] = [
  [-0.24, 0.04, 0.15],
  [-0.1, -0.08, 0.19],
  [0.1, -0.1, 0.2],
  [0.25, 0.02, 0.15],
  [0, 0.06, 0.2],
];

/**
 * Cloud (REQUIREMENT §3): its puffs expand as it breathes, the eyes close, it dips for a
 * nod and wobbles for a shake, a soft "O" mouth talks, the sun peeks out for a smile, and
 * it fades to light mist when you step away. A small puff rises as its raised hand.
 */
export const Cloud: Character = {
  id: 'cloud',
  name: 'Cloud',
  handProp: 'puff',
  body: { w: 0.773, h: 0.525, dx: 0.003, dy: -0.021 },
  draw({ ctx, cx, cy, size: H, t, pose, style, ink }: DrawArgs) {
    const motion = style.reducedMotion ? 0.5 : 1;
    const away = pose.presence === 'away';
    const seed = (n: number) => boilSeed(n, t, ink.boil);
    const lw = ink.lineWidth;

    // The sun peeks out from behind for a smile.
    if (pose.glow > 0.02 && !away) {
      const sx = cx + H * 0.26;
      const sy = cy - H * 0.2 - pose.glow * H * 0.08;
      if (!ink.highContrast) glow(ctx, sx, sy, H * 0.3, 'rgba(255,214,90,1)', pose.glow * 0.8);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + t / 3000;
        sketchLine(
          ctx,
          sx + Math.cos(a) * H * 0.12,
          sy + Math.sin(a) * H * 0.12,
          sx + Math.cos(a) * H * 0.18,
          sy + Math.sin(a) * H * 0.18,
          {
            stroke: ink.highContrast ? '#000' : '#f6bd60',
            lineWidth: lw * 1.2,
            jitter: 0,
            alpha: pose.glow,
          },
        );
      }
      sketchEllipse(ctx, sx, sy, H * 0.1, H * 0.1, {
        fill: '#f6bd60',
        stroke: ink.line,
        lineWidth: lw,
        jitter: 0,
        alpha: Math.min(1, pose.glow * 1.5),
      });
    }

    const dip = (pose.pitch / 30) * H * 0.06 + Math.sin(pose.nodPulse * Math.PI) * H * 0.05;
    const wobble =
      ((pose.yaw * 0.3 * Math.PI) / 180) * motion +
      Math.sin(pose.shakePulse * Math.PI * 4) * 0.1 * pose.shakePulse;
    const drift = Math.sin(t / 1800) * H * 0.01 * motion;
    ctx.save();
    ctx.translate(cx + drift, cy + dip);
    ctx.rotate(wobble);
    const prev = ctx.globalAlpha;

    const swell = 1 + 0.035 * pose.breath * 1.5;
    // Away: an opaque, muted "mist" colour (transparency would show the overlapping puffs).
    const fill = ink.highContrast ? '#ffffff' : away ? '#a3abbb' : '#f4f6fb';
    // Outline pass, then fill pass, so overlapping puffs merge into one cloud.
    for (const [i, [dx, dy, r]] of PUFFS.entries()) {
      if (away && !ink.highContrast) break;
      sketchEllipse(ctx, dx * H, dy * H, r * H * swell + lw, r * H * swell + lw, {
        fill: ink.line,
        seed: seed(20 + i),
        jitter: ink.jitter * 1.5,
      });
    }
    for (const [i, [dx, dy, r]] of PUFFS.entries()) {
      sketchEllipse(ctx, dx * H, dy * H, r * H * swell, r * H * swell, {
        fill,
        seed: seed(20 + i),
        jitter: ink.jitter * 1.5,
      });
    }
    if (pose.raisedHand) {
      const wave = Math.sin(t / 220) * H * 0.02 * motion;
      sketchEllipse(ctx, H * 0.36 + wave, -H * 0.2, H * 0.08, H * 0.08, {
        fill,
        stroke: ink.line,
        lineWidth: lw,
        seed: seed(30),
      });
    }

    // Face.
    const fx = (pose.yaw / 35) * H * 0.04;
    const eyeY = -H * 0.02;
    const open = away ? 0 : pose.eyeOpen;
    blinkingEye(ctx, fx - H * 0.08, eyeY, H * 0.022, open, ink.line, lw);
    blinkingEye(ctx, fx + H * 0.08, eyeY, H * 0.022, open, ink.line, lw);
    if (pose.glow > 0.05 && !ink.highContrast) {
      for (const side of [-1, 1])
        glow(ctx, fx + side * H * 0.13, eyeY + H * 0.05, H * 0.035, 'rgba(244,143,177,1)', pose.glow);
    }
    const my = eyeY + H * 0.08;
    if (pose.talking && pose.mouthOpen > 0) {
      ctx.beginPath();
      ctx.ellipse(
        fx,
        my,
        H * 0.03 * (0.6 + 0.4 * pose.mouthOpen),
        H * 0.035 * pose.mouthOpen + 1,
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw;
      ctx.fillStyle = ink.highContrast ? '#000' : '#8e6c88';
      ctx.fill();
      ctx.stroke();
    } else if (!away) {
      ctx.beginPath();
      ctx.moveTo(fx - H * 0.035, my);
      ctx.quadraticCurveTo(fx, my + H * (0.02 + 0.03 * pose.glow), fx + H * 0.035, my);
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 0.8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = prev;

    // Mist lines when away.
    if (away) {
      for (let k = 0; k < 3; k++) {
        const y = H * (0.2 + k * 0.06);
        const x = Math.sin(t / 1500 + k) * H * 0.04 * motion;
        sketchLine(ctx, x - H * 0.22, y, x + H * 0.22, y, {
          stroke: '#dfe6ef',
          lineWidth: lw * 1.5,
          jitter: 0,
          alpha: 0.5,
        });
      }
    }
    ctx.restore();

    if (pose.sparkle) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.25 + t / 650;
        sparkle(ctx, cx + Math.cos(a) * H * 0.42, cy + Math.sin(a) * H * 0.3, H * 0.025, '#fff3b0');
      }
    }
  },
};

registerCharacter(Cloud);
