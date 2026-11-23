import { blinkingEye, boilSeed, glow, sketchEllipse, sketchLine, sketchPath, sparkle } from '../sketch';
import type { Character, DrawArgs } from './Character';
import { registerCharacter } from './registry';

const PAPER = '#f4a259';
const PAPER_HC = '#ffd23f';
const CAP = '#5b3a29';
const FLAME = 'rgba(255,214,120,1)';

/**
 * Paper lantern (REQUIREMENT §3, priority): ribs widen as it breathes, ink-dot eyes blink,
 * it bobs on its string for nods and sways for shakes, a small painted mouth talks, the
 * candle flares warm for smiles, and it dims to an ember with a "back soon" tag when you
 * step away. The tassel is its raised hand.
 */
export const Lantern: Character = {
  id: 'lantern',
  name: 'Paper lantern',
  handProp: 'tassel',
  body: { w: 0.46, h: 0.65, dx: 0, dy: -0.096 },
  draw({ ctx, cx, cy, size: H, t, pose, style, ink }: DrawArgs) {
    const motion = style.reducedMotion ? 0.5 : 1;
    const away = pose.presence === 'away';
    const seed = (n: number) => boilSeed(n, t, ink.boil);
    const lw = ink.lineWidth;
    const j = ink.jitter;

    // Head motion: bob on the string (pitch, nod pulses) and sway (yaw, shakes).
    const idle = Math.sin(t / 1400) * 0.6 * motion;
    const bob =
      (pose.pitch / 30) * H * 0.07 +
      Math.sin(pose.nodPulse * Math.PI) * H * 0.05 * (pose.enthusiastic ? 1.6 : 1);
    const sway =
      ((pose.yaw * 0.5 + idle) * Math.PI) / 180 +
      Math.sin(pose.shakePulse * Math.PI * 3) * 0.12 * pose.shakePulse;
    const stretch = pose.presence === 'waking' ? Math.sin(pose.wake * Math.PI) * 0.08 : 0;
    const droop = away ? 0.06 : 0;

    const anchorY = cy - H * 0.5;
    const stringLen = H * 0.08 + bob + droop * H;
    const rx = H * 0.25 * (1 + 0.035 * 1.4 * pose.breath);
    const ry = H * 0.27 * (1 + stretch);
    const bodyY = stringLen + H * 0.06 + ry; // body centre, relative to the anchor

    ctx.save();
    ctx.translate(cx, anchorY);
    ctx.rotate(sway);

    // String and top cap.
    sketchLine(ctx, 0, -H * 0.05, 0, stringLen, {
      stroke: ink.line,
      lineWidth: lw * 0.7,
      seed: seed(3),
      jitter: j,
    });
    sketchPath(
      ctx,
      [
        [-rx * 0.45, stringLen],
        [rx * 0.45, stringLen],
        [rx * 0.4, stringLen + H * 0.07],
        [-rx * 0.4, stringLen + H * 0.07],
      ],
      {
        fill: ink.highContrast ? '#000' : CAP,
        stroke: ink.line,
        lineWidth: lw,
        closed: true,
        seed: seed(5),
        jitter: j * 0.6,
      },
    );

    // Candle light behind the paper: steady warmth, flaring with a smile, ember when away.
    const flame = away ? 0.12 : 0.45 + 0.55 * pose.glow;
    if (!ink.highContrast) glow(ctx, 0, bodyY, rx * (1.4 + pose.glow * 0.9), FLAME, flame * 0.75);

    // Body.
    sketchEllipse(ctx, 0, bodyY, rx, ry, {
      fill: ink.highContrast ? PAPER_HC : away ? '#b9875a' : PAPER,
      stroke: ink.line,
      lineWidth: lw,
      seed: seed(7),
      jitter: j * rx * 0.03,
    });
    if (!ink.highContrast) glow(ctx, 0, bodyY + ry * 0.1, rx * 0.9, 'rgba(255,240,200,1)', flame * 0.55);

    // Paper ribs: curved lines that spread as it breathes in.
    const ribs = 4;
    for (let i = 1; i <= ribs; i++) {
      const f = (i / (ribs + 1)) * 2 - 1; // -0.6 .. 0.6
      const x = f * rx * 0.92;
      sketchPath(
        ctx,
        [
          [x * 0.55, bodyY - ry * 0.93],
          [x, bodyY],
          [x * 0.55, bodyY + ry * 0.93],
        ],
        { stroke: ink.line, lineWidth: lw * 0.5, seed: seed(11 + i), jitter: j * 0.8, alpha: 0.55 },
      );
    }

    // Bottom cap and tassel (the raised hand).
    const bottom = bodyY + ry;
    sketchPath(
      ctx,
      [
        [-rx * 0.35, bottom - H * 0.01],
        [rx * 0.35, bottom - H * 0.01],
        [rx * 0.3, bottom + H * 0.05],
        [-rx * 0.3, bottom + H * 0.05],
      ],
      {
        fill: ink.highContrast ? '#000' : CAP,
        stroke: ink.line,
        lineWidth: lw,
        closed: true,
        seed: seed(17),
        jitter: j * 0.6,
      },
    );
    const tasselTop = bottom + H * 0.05;
    const raise = pose.raisedHand ? 1 : 0;
    const tx = raise * rx * 1.1;
    const ty = tasselTop + H * 0.14 - raise * H * 0.32;
    const wave = pose.raisedHand ? Math.sin(t / 180) * H * 0.02 * motion : 0;
    sketchPath(
      ctx,
      [
        [0, tasselTop],
        [tx * 0.6, tasselTop + (ty - tasselTop) * 0.4 + H * 0.03 * raise],
        [tx + wave, ty],
      ],
      { stroke: ink.highContrast ? '#000' : '#c0392b', lineWidth: lw * 1.6, seed: seed(19), jitter: j },
    );
    for (let k = -1; k <= 1; k++) {
      sketchLine(ctx, tx + wave, ty, tx + wave + k * H * 0.018, ty + H * 0.06 * (raise ? -1 : 1), {
        stroke: ink.highContrast ? '#000' : '#c0392b',
        lineWidth: lw * 0.9,
        seed: seed(23 + k),
        jitter: j * 0.5,
      });
    }

    // Face.
    const eyeY = bodyY - ry * 0.12 + (pose.pitch / 30) * ry * 0.12;
    const eyeDx = rx * 0.32;
    const faceX = (pose.yaw / 35) * rx * 0.18;
    const eyeR = Math.max(1.5, H * 0.022);
    const open = away ? 0 : pose.eyeOpen;
    blinkingEye(ctx, faceX - eyeDx, eyeY, eyeR, open, ink.line, lw);
    blinkingEye(ctx, faceX + eyeDx, eyeY, eyeR, open, ink.line, lw);

    // Rosy cheeks for a smile.
    if (pose.glow > 0.05 && !ink.highContrast) {
      for (const sx of [-1, 1]) {
        glow(
          ctx,
          faceX + sx * eyeDx * 1.35,
          eyeY + ry * 0.22,
          H * 0.04,
          'rgba(231,111,81,1)',
          pose.glow * 0.7,
        );
      }
    }

    const mouthY = eyeY + ry * 0.32;
    if (pose.talking && pose.mouthOpen > 0) {
      ctx.beginPath();
      ctx.ellipse(faceX, mouthY, rx * 0.12, Math.max(1, ry * 0.12 * pose.mouthOpen), 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.highContrast ? '#000' : '#7a2e1f';
      ctx.fill();
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 0.7;
      ctx.stroke();
    } else if (!away) {
      const curve = ry * (0.04 + 0.1 * pose.glow);
      ctx.beginPath();
      ctx.moveTo(faceX - rx * 0.12, mouthY);
      ctx.quadraticCurveTo(faceX, mouthY + curve, faceX + rx * 0.12, mouthY);
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 0.8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // "Back soon" tag hanging from the tassel.
    if (away) {
      const tagW = H * 0.3;
      const tagH = H * 0.1;
      const tagY = tasselTop + H * 0.02;
      sketchPath(
        ctx,
        [
          [-tagW / 2, tagY],
          [tagW / 2, tagY],
          [tagW / 2, tagY + tagH],
          [-tagW / 2, tagY + tagH],
        ],
        { fill: '#fdf6e3', stroke: ink.line, lineWidth: lw * 0.8, closed: true, seed: 29, jitter: j * 0.5 },
      );
      ctx.fillStyle = ink.line;
      ctx.font = `600 ${Math.round(tagH * 0.55)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('back soon', 0, tagY + tagH / 2);
    }

    // Laugh sparkles.
    if (pose.sparkle) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + t / 600;
        const r = rx * (1.25 + 0.15 * Math.sin(t / 200 + k));
        sparkle(ctx, Math.cos(a) * r, bodyY + Math.sin(a) * r * 0.9, H * 0.025, '#fff3b0');
      }
    }
    ctx.restore();
  },
};

registerCharacter(Lantern);
