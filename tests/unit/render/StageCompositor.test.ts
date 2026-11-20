import { describe, expect, it } from 'vitest';
import '../../../src/render/characters/Lantern';
import '../../../src/render/characters/Houseplant';
import { StageCompositor } from '../../../src/render/StageCompositor';
import { characterBox, coverCrop, feedBlurPx, feedRect } from '../../../src/render/layout';
import { NEUTRAL_POSE, type StageState } from '../../../src/shared/types';
import { mockCanvas } from './mockCanvas';

const base: StageState = {
  mode: 'blend',
  feedOpacity: 0.5,
  targetOpacity: 0.5,
  characterOpacity: 1,
  layout: 'over',
  cornerBadge: false,
  character: 'lantern',
  background: '#2b2d42',
  pose: NEUTRAL_POSE,
  badges: { speaking: false, raisedHand: false, backSoon: false },
  hidden: false,
  pinned: false,
  style: { reducedMotion: false, highContrast: false },
  testPattern: false,
};
const feed = { image: {} as CanvasImageSource, width: 960, height: 540 };

describe('layout', () => {
  it('places the character per mode and layout', () => {
    expect(characterBox(base, 1280, 720)).toMatchObject({ cx: 640 });
    const beside = characterBox({ ...base, layout: 'beside' }, 1280, 720);
    expect(beside.cy).toBeCloseTo(600);
    expect(feedRect({ ...base, layout: 'beside' }, 1280, 720).h).toBeCloseTo(480);
    expect(feedRect(base, 1280, 720)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    const cam = characterBox({ ...base, mode: 'camera' }, 1280, 720);
    expect(cam.cx).toBeGreaterThan(1000);
    const autoLow = characterBox({ ...base, mode: 'auto', feedOpacity: 0.2 }, 1280, 720);
    const autoHigh = characterBox({ ...base, mode: 'auto', feedOpacity: 1 }, 1280, 720);
    expect(autoLow.cx).toBe(640);
    expect(autoHigh.cx).toBeGreaterThan(1000);
    expect(autoHigh.size).toBeLessThan(autoLow.size);
  });

  it('crops the feed like object-fit: cover', () => {
    expect(coverCrop(1280, 720, { x: 0, y: 0, w: 1280, h: 720 })).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    const wide = coverCrop(1920, 720, { x: 0, y: 0, w: 1280, h: 720 });
    expect(wide.w).toBeCloseTo(1280);
    expect(wide.x).toBeCloseTo(320);
    const tall = coverCrop(1280, 720, { x: 0, y: 0, w: 1280, h: 480 });
    expect(tall.h).toBeCloseTo(480);
    expect(tall.y).toBeCloseTo(120);
  });

  it('blurs only below 30% opacity, more as it fades', () => {
    expect(feedBlurPx(0.3, 720)).toBe(0);
    expect(feedBlurPx(0.8, 720)).toBe(0);
    expect(feedBlurPx(0.15, 720)).toBeCloseTo(7);
    expect(feedBlurPx(0, 720)).toBeCloseTo(14);
  });
});

describe('StageCompositor', () => {
  const render = (s: StageState, f: typeof feed | null = feed) => {
    const { ctx, calls } = mockCanvas();
    new StageCompositor(ctx, 1280, 720).render(s, f, 1000);
    return calls;
  };

  it('draws background, feed, then character in that order', () => {
    const calls = render(base);
    const firstRect = calls.findIndex((c) => c.name === 'fillRect');
    const draw = calls.findIndex((c) => c.name === 'drawImage');
    const charStroke = calls.findIndex((c, i) => i > draw && c.name === 'stroke');
    expect(firstRect).toBeGreaterThanOrEqual(0);
    expect(draw).toBeGreaterThan(firstRect);
    expect(charStroke).toBeGreaterThan(draw);
    expect(calls.filter((c) => c.name === 'save').length).toBe(
      calls.filter((c) => c.name === 'restore').length,
    );
  });

  it('skips the feed at 0% and when absent; blurs faint feeds', () => {
    expect(render({ ...base, feedOpacity: 0 }).some((c) => c.name === 'drawImage')).toBe(false);
    expect(render(base, null).some((c) => c.name === 'drawImage')).toBe(false);
    const faint = render({ ...base, feedOpacity: 0.1 });
    expect(faint.some((c) => c.name === 'set:filter' && String(c.args[0]).startsWith('blur('))).toBe(true);
  });

  it('hides the character at 0 opacity and draws badges', () => {
    const calls = render({
      ...base,
      characterOpacity: 0,
      badges: { speaking: true, raisedHand: true, backSoon: true },
      style: { reducedMotion: true, highContrast: true },
    });
    const texts = calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    expect(texts).toEqual(['hand raised', 'back soon']);
    const ring = render({ ...base, badges: { speaking: true, raisedHand: false, backSoon: false } });
    expect(ring.filter((c) => c.name === 'arc').length).toBeGreaterThan(
      render(base).filter((c) => c.name === 'arc').length,
    );
  });

  it('draws only the test pattern when enabled', () => {
    const calls = render({ ...base, testPattern: true });
    expect(calls.some((c) => c.name === 'drawImage')).toBe(false);
    expect(calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toContain(
      'Stand-In Studio · test pattern',
    );
  });
});
