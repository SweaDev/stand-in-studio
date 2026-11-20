/**
 * Hand-drawn-style canvas primitives. Strokes wobble with a seeded PRNG so a drawing is
 * stable from frame to frame; with `boil` the wobble re-seeds a few times per second for
 * a lively, hand-animated look (disabled under reduced motion).
 */

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Small deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrokeStyle {
  stroke?: string;
  fill?: string;
  lineWidth?: number;
  /** Wobble amplitude in px. */
  jitter?: number;
  seed?: number;
  alpha?: number;
}

/** Seed that changes ~6 times per second when boiling, constant otherwise. */
export function boilSeed(base: number, t: number, boil: boolean): number {
  return boil ? base + Math.floor(t / 160) * 7919 : base;
}

function paint(ctx: Ctx2D, s: StrokeStyle): void {
  const prevAlpha = ctx.globalAlpha;
  if (s.alpha !== undefined) ctx.globalAlpha = prevAlpha * s.alpha;
  if (s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.stroke) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.lineWidth ?? 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = prevAlpha;
}

/** A wobbly closed ellipse. */
export function sketchEllipse(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  s: StrokeStyle = {},
): void {
  const rnd = prng(s.seed ?? 1);
  const j = s.jitter ?? Math.min(rx, ry) * 0.04;
  const n = 28;
  const offsets = Array.from({ length: n }, () => (rnd() - 0.5) * 2 * j);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const o = offsets[i % n] as number;
    const x = cx + Math.cos(a) * (rx + o);
    const y = cy + Math.sin(a) * (ry + o);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  paint(ctx, s);
}

/** A wobbly polyline or polygon through the given points (smoothed with quadratic curves). */
export function sketchPath(
  ctx: Ctx2D,
  points: readonly [number, number][],
  s: StrokeStyle & { closed?: boolean } = {},
): void {
  if (points.length < 2) return;
  const rnd = prng(s.seed ?? 1);
  const j = s.jitter ?? 1.2;
  const pts = points.map(([x, y]) => [x + (rnd() - 0.5) * 2 * j, y + (rnd() - 0.5) * 2 * j] as const);
  ctx.beginPath();
  const first = pts[0] as readonly [number, number];
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as readonly [number, number];
    const q = pts[i + 1] as readonly [number, number];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  const lastPt = pts[pts.length - 1] as readonly [number, number];
  ctx.lineTo(lastPt[0], lastPt[1]);
  if (s.closed) ctx.closePath();
  paint(ctx, s);
}

/** A slightly wobbly straight line. */
export function sketchLine(
  ctx: Ctx2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  s: StrokeStyle = {},
): void {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  sketchPath(
    ctx,
    [
      [x1, y1],
      [mx, my],
      [x2, y2],
    ],
    s,
  );
}

/** A filled ink dot. */
export function inkDot(ctx: Ctx2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A closed eye: a short downward-curving lash line. */
export function closedEye(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  color: string,
  lineWidth: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.quadraticCurveTo(x, y + w * 0.45, x + w / 2, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** An eye that blinks: dot when open, squashing to a closed line as openness → 0. */
export function blinkingEye(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  openness: number,
  color: string,
  lineWidth: number,
): void {
  if (openness < 0.25) {
    closedEye(ctx, x, y, r * 2.4, color, lineWidth);
    return;
  }
  ctx.beginPath();
  ctx.ellipse(x, y, r, Math.max(0.6, r * openness), 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Soft radial glow (used for candle flare, sun, warmth). */
export function glow(ctx: Ctx2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = prev;
}

/** Four-point sparkle star. */
export function sparkle(ctx: Ctx2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fillStyle = color;
  ctx.fill();
}
