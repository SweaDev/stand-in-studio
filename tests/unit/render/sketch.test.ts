import { describe, expect, it } from 'vitest';
import {
  blinkingEye,
  boilSeed,
  glow,
  inkDot,
  prng,
  sketchEllipse,
  sketchLine,
  sketchPath,
  sparkle,
} from '../../../src/render/sketch';
import { inkFor } from '../../../src/render/characters/Character';
import { mockCanvas } from './mockCanvas';

describe('prng', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = prng(42);
    const b = prng(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('boilSeed', () => {
  it('changes over time only when boiling', () => {
    expect(boilSeed(1, 0, false)).toBe(boilSeed(1, 1000, false));
    expect(boilSeed(1, 0, true)).not.toBe(boilSeed(1, 1000, true));
    expect(boilSeed(1, 0, true)).toBe(boilSeed(1, 100, true));
  });
});

describe('sketch primitives', () => {
  it('draw paths and restore alpha', () => {
    const { ctx, calls } = mockCanvas();
    sketchEllipse(ctx, 10, 10, 5, 5, { stroke: '#000', fill: '#fff', alpha: 0.5 });
    sketchPath(
      ctx,
      [
        [0, 0],
        [5, 5],
        [10, 0],
      ],
      { stroke: '#000', closed: true },
    );
    sketchPath(ctx, [[0, 0]], { stroke: '#000' }); // too short: no-op
    sketchLine(ctx, 0, 0, 10, 10, { stroke: '#000' });
    inkDot(ctx, 1, 1, 2, '#000');
    blinkingEye(ctx, 0, 0, 3, 1, '#000', 2);
    blinkingEye(ctx, 0, 0, 3, 0.1, '#000', 2);
    glow(ctx, 0, 0, 10, '#ff0', 0.5);
    glow(ctx, 0, 0, 10, '#ff0', 0);
    sparkle(ctx, 0, 0, 4, '#fff');
    expect(calls.filter((c) => c.name === 'stroke').length).toBeGreaterThanOrEqual(4);
    expect(calls.filter((c) => c.name === 'fill').length).toBeGreaterThanOrEqual(4);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('closed eyes draw a lash line instead of a dot', () => {
    const open = mockCanvas();
    blinkingEye(open.ctx, 0, 0, 3, 1, '#000', 2);
    const shut = mockCanvas();
    blinkingEye(shut.ctx, 0, 0, 3, 0, '#000', 2);
    expect(open.calls.some((c) => c.name === 'ellipse')).toBe(true);
    expect(shut.calls.some((c) => c.name === 'quadraticCurveTo')).toBe(true);
  });
});

describe('inkFor', () => {
  it('thickens and stills lines in high contrast; stops boiling in reduced motion', () => {
    const normal = inkFor({ reducedMotion: false, highContrast: false }, 220);
    const hc = inkFor({ reducedMotion: false, highContrast: true }, 220);
    const rm = inkFor({ reducedMotion: true, highContrast: false }, 220);
    expect(hc.lineWidth).toBeGreaterThan(normal.lineWidth * 2);
    expect(hc.jitter).toBe(0);
    expect(normal.boil).toBe(true);
    expect(rm.boil).toBe(false);
  });
});
