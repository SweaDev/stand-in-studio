import { blinkingEye, boilSeed, glow, sketchEllipse, sketchPath, sketchPolygon, sparkle } from '../sketch';
import type { Ctx2D } from '../sketch';
import type { Character, DrawArgs, Ink } from './Character';
import { registerCharacter } from './registry';

const POT = '#c8553d';
const RIM = '#a8432f';
const LEAF = '#5c9e5a';
const LEAF_DARK = '#3f7d42';
const PETAL = '#f7b2bd';

/** One almond leaf from (x, y) at `angle` (radians, 0 = up), `len` long. */
function leaf(
  ctx: Ctx2D,
  x: number,
  y: number,
  len: number,
  angle: number,
  ink: Ink,
  seed: number,
  fill = LEAF,
): void {
  const w = len * 0.38;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const tipX = x + dx * len;
  const tipY = y + dy * len;
  const nx = -dy * w;
  const ny = dx * w;
  const mx = (x + tipX) / 2;
  const my = (y + tipY) / 2;
  sketchPath(
    ctx,
    [
      [x, y],
      [mx + nx, my + ny],
      [tipX, tipY],
      [mx - nx, my - ny],
      [x, y],
    ],
    {
      fill: ink.highContrast ? '#2a9d3a' : fill,
      stroke: ink.line,
      lineWidth: ink.lineWidth * 0.8,
      closed: true,
      seed,
      jitter: ink.jitter * len * 0.02,
    },
  );
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * len * 0.8, y + dy * len * 0.8);
  ctx.strokeStyle = ink.highContrast ? '#000' : LEAF_DARK;
  ctx.lineWidth = ink.lineWidth * 0.4;
  ctx.stroke();
}

/** Leaf-shaped eye: an almond that narrows to a line as it closes. */
function leafEye(ctx: Ctx2D, x: number, y: number, w: number, open: number, ink: Ink): void {
  if (open < 0.25) {
    blinkingEye(ctx, x, y, w / 2.4, 0, ink.line, ink.lineWidth);
    return;
  }
  const h = (w / 2) * 0.9 * open;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x, y - h, x + w / 2, y);
  ctx.quadraticCurveTo(x, y + h, x - w / 2, y);
  ctx.fillStyle = ink.line;
  ctx.fill();
}

/** A flower that opens with `bloom` 0..1. */
function flower(ctx: Ctx2D, x: number, y: number, r: number, bloom: number, ink: Ink): void {
  const petals = 5;
  const pr = r * (0.35 + 0.65 * bloom);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    sketchEllipse(ctx, x + Math.cos(a) * pr * 0.7, y + Math.sin(a) * pr * 0.7, pr * 0.55, pr * 0.55, {
      fill: ink.highContrast ? '#ff4fa3' : PETAL,
      stroke: ink.line,
      lineWidth: ink.lineWidth * 0.5,
      seed: 40 + i,
      jitter: 0,
    });
  }
  sketchEllipse(ctx, x, y, pr * 0.4, pr * 0.4, {
    fill: '#f6bd60',
    stroke: ink.line,
    lineWidth: ink.lineWidth * 0.5,
    jitter: 0,
  });
}

function wateringCan(ctx: Ctx2D, x: number, y: number, s: number, ink: Ink): void {
  sketchPolygon(
    ctx,
    [
      [x - s * 0.5, y - s * 0.3],
      [x + s * 0.3, y - s * 0.3],
      [x + s * 0.3, y + s * 0.4],
      [x - s * 0.5, y + s * 0.4],
    ],
    {
      fill: ink.highContrast ? '#fff' : '#8ecae6',
      stroke: ink.line,
      lineWidth: ink.lineWidth * 0.8,
      jitter: 0,
    },
  );
  sketchPath(
    ctx,
    [
      [x + s * 0.3, y],
      [x + s * 0.75, y - s * 0.45],
    ],
    { stroke: ink.line, lineWidth: ink.lineWidth * 1.4, jitter: 0 },
  );
  ctx.beginPath();
  ctx.arc(x - s * 0.1, y - s * 0.35, s * 0.28, Math.PI, 0);
  ctx.strokeStyle = ink.line;
  ctx.lineWidth = ink.lineWidth * 0.8;
  ctx.stroke();
}

/**
 * Houseplant (REQUIREMENT §3, priority): leaves rise and fall with breathing, leaf-eyes
 * blink, the whole plant nods and its leaves sway, the pot rim is the mouth, flowers open
 * for a smile, and the leaves droop beside a watering can when you step away. A leaf
 * waves as its raised hand.
 */
export const Houseplant: Character = {
  id: 'houseplant',
  name: 'Houseplant',
  handProp: 'leaf',
  draw({ ctx, cx, cy, size: H, t, pose, style, ink }: DrawArgs) {
    const motion = style.reducedMotion ? 0.5 : 1;
    const away = pose.presence === 'away';
    const seed = (n: number) => boilSeed(n, t, ink.boil);
    const lw = ink.lineWidth;

    const baseY = cy + H * 0.48;
    const potH = H * 0.36;
    const potTop = baseY - potH;
    const potW = H * 0.42;

    // The whole plant pivots on the pot's base: nods (pitch) and turns (yaw).
    const nod =
      ((pose.pitch * 0.45 + Math.sin(pose.nodPulse * Math.PI) * 7 * (pose.enthusiastic ? 1.5 : 1)) *
        Math.PI) /
      180;
    const stretch = pose.presence === 'waking' ? Math.sin(pose.wake * Math.PI) * 0.1 : 0;
    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(nod * 0.35);
    ctx.translate(-cx, -baseY);

    // Leaves (behind the pot rim). Breath lifts them; away makes them droop.
    const sway =
      ((pose.yaw / 35) * 0.25 + Math.sin(pose.shakePulse * Math.PI * 3) * 0.3 * pose.shakePulse) * motion;
    const idle = Math.sin(t / 1300) * 0.04 * motion;
    const lift = pose.breath * 0.12;
    const stemX = cx;
    const stemY = potTop + H * 0.02;
    const leafLen = H * 0.36 * (1 + stretch);
    const leaves: [number, number][] = [
      [-1.3, 0.9],
      [-0.7, 1.05],
      [0, 1.15],
      [0.7, 1.05],
      [1.3, 0.9],
    ];
    leaves.forEach(([a, l], i) => {
      // Breathing in lifts the leaves (narrower spread); away makes them hang outwards.
      const spread = away ? (a === 0 ? 0.5 : Math.sign(a) * (1.9 + Math.abs(a) * 0.3)) : a * (1 - lift);
      const angle = spread + sway + idle * (i % 2 ? 1 : -1);
      leaf(ctx, stemX + a * H * 0.03, stemY, leafLen * l, angle, ink, seed(50 + i), i % 2 ? LEAF_DARK : LEAF);
    });

    // Flowers open with a smile.
    if (!away) {
      const bloom = pose.glow;
      flower(ctx, stemX - H * 0.14, stemY - leafLen * 0.85, H * 0.06, bloom, ink);
      flower(ctx, stemX + H * 0.16, stemY - leafLen * 0.75, H * 0.05, bloom * 0.9, ink);
    }

    // Raised hand: one leaf lifted high, waving.
    if (pose.raisedHand) {
      const wave = Math.sin(t / 200) * 0.25 * motion;
      leaf(ctx, cx + potW * 0.45, potTop + H * 0.05, leafLen * 1.15, 0.35 + wave, ink, seed(61));
    }

    // Pot.
    sketchPolygon(
      ctx,
      [
        [cx - potW / 2, potTop],
        [cx + potW / 2, potTop],
        [cx + potW * 0.38, baseY],
        [cx - potW * 0.38, baseY],
      ],
      {
        fill: ink.highContrast ? '#ff7b00' : POT,
        stroke: ink.line,
        lineWidth: lw,
        seed: seed(70),
        jitter: ink.jitter,
      },
    );
    // Rim: the mouth lives here.
    const rimH = H * 0.07;
    sketchPolygon(
      ctx,
      [
        [cx - potW * 0.56, potTop - rimH * 0.2],
        [cx + potW * 0.56, potTop - rimH * 0.2],
        [cx + potW * 0.54, potTop + rimH],
        [cx - potW * 0.54, potTop + rimH],
      ],
      {
        fill: ink.highContrast ? '#d35400' : RIM,
        stroke: ink.line,
        lineWidth: lw,
        seed: seed(72),
        jitter: ink.jitter,
      },
    );

    // Face on the pot.
    const faceX = cx + (pose.yaw / 35) * potW * 0.12;
    const eyeY = potTop + rimH + potH * 0.28 + (pose.pitch / 30) * potH * 0.08;
    const eyeW = H * 0.07;
    leafEye(ctx, faceX - potW * 0.18, eyeY, eyeW, away ? 0 : pose.eyeOpen, ink);
    leafEye(ctx, faceX + potW * 0.18, eyeY, eyeW, away ? 0 : pose.eyeOpen, ink);
    if (pose.glow > 0.05 && !ink.highContrast) {
      for (const sx of [-1, 1])
        glow(
          ctx,
          faceX + sx * potW * 0.3,
          eyeY + H * 0.04,
          H * 0.035,
          'rgba(255,170,150,1)',
          pose.glow * 0.8,
        );
    }
    const mouthY = potTop + rimH * 0.45;
    if (pose.talking && pose.mouthOpen > 0) {
      ctx.beginPath();
      ctx.ellipse(faceX, mouthY, potW * 0.12, Math.max(1, rimH * 0.9 * pose.mouthOpen), 0, 0, Math.PI * 2);
      ctx.fillStyle = ink.highContrast ? '#000' : '#4a1c14';
      ctx.fill();
    } else if (!away) {
      ctx.beginPath();
      ctx.moveTo(faceX - potW * 0.1, eyeY + H * 0.05);
      ctx.quadraticCurveTo(faceX, eyeY + H * (0.06 + 0.04 * pose.glow), faceX + potW * 0.1, eyeY + H * 0.05);
      ctx.strokeStyle = ink.line;
      ctx.lineWidth = lw * 0.8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();

    if (away) wateringCan(ctx, cx + potW * 0.95, baseY - H * 0.25, H * 0.2, ink);

    if (pose.sparkle) {
      for (let k = 0; k < 5; k++) {
        const a = k * 1.25 + t / 650;
        sparkle(
          ctx,
          cx + Math.cos(a) * H * 0.38,
          cy - H * 0.05 + Math.sin(a) * H * 0.3,
          H * 0.025,
          '#fff3b0',
        );
      }
    }
  },
};

registerCharacter(Houseplant);
