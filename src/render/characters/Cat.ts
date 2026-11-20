import { boilSeed, closedEye, glow, sketchEllipse, sketchPolygon, sparkle } from '../sketch';
import type { Character, DrawArgs } from './Character';
import { registerCharacter } from './registry';

const FUR = '#e9a35a';
const FUR_HC = '#ffb347';
const INNER_EAR = '#f3c4b3';

/**
 * Cat (REQUIREMENT §3): the belly rises with breathing, a slow cat blink, head nods and an
 * ear flick for shakes, a small "mew" mouth, purr lines and rosy cheeks for smiles, and it
 * curls up asleep when you step away. A paw is its raised hand.
 */
export const Cat: Character = {
  id: 'cat',
  name: 'Cat',
  handProp: 'paw',
  draw({ ctx, cx, cy, size: H, t, pose, style, ink }: DrawArgs) {
    const motion = style.reducedMotion ? 0.5 : 1;
    const seed = (n: number) => boilSeed(n, t, ink.boil);
    const lw = ink.lineWidth;
    const fur = ink.highContrast ? FUR_HC : FUR;
    const stroke = { stroke: ink.line, lineWidth: lw, jitter: ink.jitter * 1.2 };

    if (pose.presence === 'away') {
      // Curled up asleep.
      const by = cy + H * 0.22;
      sketchEllipse(ctx, cx, by, H * 0.34, H * 0.2 * (1 + 0.03 * pose.breath), {
        ...stroke,
        fill: fur,
        seed: seed(1),
      });
      sketchEllipse(ctx, cx - H * 0.2, by - H * 0.04, H * 0.14, H * 0.12, {
        ...stroke,
        fill: fur,
        seed: seed(2),
      });
      closedEye(ctx, cx - H * 0.24, by - H * 0.05, H * 0.05, ink.line, lw);
      closedEye(ctx, cx - H * 0.15, by - H * 0.05, H * 0.05, ink.line, lw);
      ctx.beginPath();
      ctx.moveTo(cx + H * 0.3, by + H * 0.05);
      ctx.quadraticCurveTo(cx + H * 0.1, by + H * 0.26, cx - H * 0.18, by + H * 0.12);
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 2.4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.fillStyle = ink.highContrast ? '#000' : '#f4efe6';
      ctx.font = `700 ${Math.round(H * 0.08)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('z', cx + H * 0.05, by - H * 0.2 - Math.sin(t / 600) * H * 0.02 * motion);
      ctx.fillText('z', cx + H * 0.13, by - H * 0.3 - Math.sin(t / 600 + 1) * H * 0.02 * motion);
      return;
    }

    const stretch = pose.presence === 'waking' ? Math.sin(pose.wake * Math.PI) * 0.1 : 0;
    // Body with a belly that rises and falls.
    const bodyY = cy + H * 0.2;
    sketchEllipse(ctx, cx, bodyY, H * 0.25 * (1 + 0.035 * pose.breath), H * 0.27 * (1 + stretch), {
      ...stroke,
      fill: fur,
      seed: seed(3),
    });
    sketchEllipse(ctx, cx, bodyY + H * 0.05, H * 0.13 * (1 + 0.05 * pose.breath), H * 0.16, {
      fill: ink.highContrast ? '#fff' : '#f6dcc0',
      seed: seed(4),
      jitter: 0,
    });
    // Tail.
    ctx.beginPath();
    ctx.moveTo(cx + H * 0.2, bodyY + H * 0.2);
    ctx.quadraticCurveTo(
      cx + H * 0.45,
      bodyY + H * 0.1,
      cx + H * 0.38,
      bodyY - H * 0.12 + Math.sin(t / 700) * H * 0.03 * motion,
    );
    ctx.strokeStyle = ink.line;
    ctx.lineWidth = lw * 2.6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Raised paw.
    if (pose.raisedHand) {
      const wave = Math.sin(t / 200) * H * 0.02 * motion;
      sketchEllipse(ctx, cx + H * 0.27 + wave, cy - H * 0.12, H * 0.06, H * 0.12, {
        ...stroke,
        fill: fur,
        seed: seed(5),
      });
    }

    // Head: nods with pitch, turns with yaw.
    ctx.save();
    const headY = cy - H * 0.16 + (pose.pitch / 30) * H * 0.05 + Math.sin(pose.nodPulse * Math.PI) * H * 0.04;
    const headX = cx + (pose.yaw / 35) * H * 0.04;
    ctx.translate(headX, headY);
    ctx.rotate((pose.yaw * 0.25 * Math.PI) / 180);
    const hr = H * 0.2;
    // Ears (one flicks on a shake).
    const flick = Math.sin(pose.shakePulse * Math.PI * 4) * 0.35 * pose.shakePulse;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * hr * 0.6, -hr * 0.6);
      ctx.rotate(side === 1 ? flick : 0);
      sketchPolygon(
        ctx,
        [
          [-hr * 0.32, hr * 0.15],
          [side * hr * 0.12, -hr * 0.5],
          [hr * 0.32, hr * 0.15],
        ],
        { ...stroke, fill: fur, seed: seed(6 + side) },
      );
      sketchPolygon(
        ctx,
        [
          [-hr * 0.15, hr * 0.08],
          [side * hr * 0.08, -hr * 0.28],
          [hr * 0.15, hr * 0.08],
        ],
        { fill: INNER_EAR, seed: seed(8 + side), jitter: 0 },
      );
      ctx.restore();
    }
    sketchEllipse(ctx, 0, 0, hr * 1.05, hr, { ...stroke, fill: fur, seed: seed(10) });

    // Eyes: a slow cat blink (eyes narrow gently).
    const ey = -hr * 0.1;
    for (const side of [-1, 1]) {
      const ex = side * hr * 0.42;
      if (pose.eyeOpen < 0.35) closedEye(ctx, ex, ey, hr * 0.32, ink.line, lw);
      else {
        ctx.beginPath();
        ctx.ellipse(ex, ey, hr * 0.13, hr * 0.17 * pose.eyeOpen, 0, 0, Math.PI * 2);
        ctx.fillStyle = ink.highContrast ? '#000' : '#4c7a34';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ex, ey, hr * 0.04, hr * 0.13 * pose.eyeOpen, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#1b1b1b';
        ctx.fill();
      }
    }
    // Nose and mouth.
    ctx.fillStyle = ink.highContrast ? '#000' : '#d8737f';
    ctx.beginPath();
    ctx.moveTo(-hr * 0.08, hr * 0.18);
    ctx.lineTo(hr * 0.08, hr * 0.18);
    ctx.lineTo(0, hr * 0.27);
    ctx.fill();
    if (pose.talking && pose.mouthOpen > 0) {
      ctx.beginPath();
      ctx.ellipse(0, hr * 0.42, hr * 0.12, Math.max(1, hr * 0.16 * pose.mouthOpen), 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.highContrast ? '#000' : '#7a2e1f';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-hr * 0.18, hr * 0.32);
      ctx.quadraticCurveTo(-hr * 0.09, hr * 0.42, 0, hr * 0.28);
      ctx.quadraticCurveTo(hr * 0.09, hr * 0.42, hr * 0.18, hr * 0.32);
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
    }
    // Whiskers.
    for (const side of [-1, 1]) {
      for (const k of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * hr * 0.35, hr * 0.25 + k * hr * 0.05);
        ctx.lineTo(side * hr * 0.95, hr * 0.2 + k * hr * 0.12);
        ctx.strokeStyle = ink.line;
        ctx.lineWidth = lw * 0.5;
        ctx.stroke();
      }
    }
    // Smile: rosy cheeks and purr lines.
    if (pose.glow > 0.05) {
      if (!ink.highContrast) {
        for (const side of [-1, 1])
          glow(ctx, side * hr * 0.6, hr * 0.25, hr * 0.22, 'rgba(231,111,81,1)', pose.glow * 0.7);
      }
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 0.7;
      for (let k = 0; k < 3; k++) {
        const r = hr * (1.25 + k * 0.15 + (style.reducedMotion ? 0 : Math.sin(t / 120 + k) * 0.03));
        ctx.globalAlpha = pose.glow * 0.6;
        ctx.beginPath();
        ctx.arc(0, hr * 0.1, r, -0.35, 0.35);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, hr * 0.1, r, Math.PI - 0.35, Math.PI + 0.35);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (pose.sparkle) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.25 + t / 650;
        sparkle(
          ctx,
          cx + Math.cos(a) * H * 0.38,
          cy - H * 0.05 + Math.sin(a) * H * 0.32,
          H * 0.025,
          '#fff3b0',
        );
      }
    }
  },
};

registerCharacter(Cat);
