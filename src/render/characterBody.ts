import { NEUTRAL_POSE } from '../shared/types';
import type { Character } from './characters/Character';
import { inkFor } from './characters/Character';

/**
 * The part of a character that covers a face, as fractions of its box size: width and
 * height of the solid body, and its centre's offset from the box centre. Thin parts
 * (strings, tassels, stems) are left out: a row or column counts only when it is at least
 * a quarter as full as the fullest one.
 */
export interface Body {
  w: number;
  h: number;
  dx: number;
  dy: number;
}

/** Measures a character's body by drawing it (browser only; used by tests and tooling). */
export function measureBody(c: Character, size = 400): Body {
  const N = Math.round(size * 2);
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const style = { reducedMotion: true, highContrast: false };
  c.draw({ ctx, cx: N / 2, cy: N / 2, size, t: 0, pose: NEUTRAL_POSE, style, ink: inkFor(style, size) });
  const { data } = ctx.getImageData(0, 0, N, N);
  const rows = new Array<number>(N).fill(0);
  const cols = new Array<number>(N).fill(0);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if ((data[(y * N + x) * 4 + 3] ?? 0) > 128) {
        rows[y] = (rows[y] ?? 0) + 1;
        cols[x] = (cols[x] ?? 0) + 1;
      }
  const span = (v: number[]) => {
    const max = Math.max(...v);
    const first = v.findIndex((n) => n >= max / 4);
    const last = v.length - 1 - [...v].reverse().findIndex((n) => n >= max / 4);
    return [first, last] as const;
  };
  const [y0, y1] = span(rows);
  const [x0, x1] = span(cols);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    w: r((x1 - x0 + 1) / size),
    h: r((y1 - y0 + 1) / size),
    dx: r(((x0 + x1) / 2 - N / 2) / size),
    dy: r(((y0 + y1) / 2 - N / 2) / size),
  };
}
