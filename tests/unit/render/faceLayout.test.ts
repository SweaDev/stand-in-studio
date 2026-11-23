import { describe, expect, it } from 'vitest';
import {
  characterAlpha,
  characterBox,
  DEFAULT_BODY,
  coverCrop,
  faceCharacterBox,
  feedCrop,
  feedRect,
  followsFace,
} from '../../../src/render/layout';
import { NEUTRAL_POSE, type StageState } from '../../../src/shared/types';

const src = { width: 1280, height: 720 };
const face = { cx: 640, cy: 250, w: 220, h: 300 };
const s: StageState = {
  mode: 'auto',
  feedOpacity: 0.4,
  targetOpacity: 0.4,
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
  face,
  faceAnchor: { follow: true, size: 1, offsetX: 0, offsetY: 0, opacity: 1 },
  zoom: 0,
};

describe('face-following character', () => {
  it('follows the face in Auto and Blend (Over), not in Character, Camera or Beside', () => {
    expect(followsFace(s)).toBe(true);
    expect(followsFace({ ...s, mode: 'blend' })).toBe(true);
    expect(followsFace({ ...s, mode: 'blend', layout: 'beside' })).toBe(false);
    expect(followsFace({ ...s, mode: 'character' })).toBe(false);
    expect(followsFace({ ...s, mode: 'camera' })).toBe(false);
    expect(followsFace({ ...s, face: null })).toBe(false);
    expect(followsFace({ ...s, faceAnchor: { ...s.faceAnchor, follow: false } })).toBe(false);
  });

  it('sits on the face, mapped through the same crop as the feed, sized from it', () => {
    // 1280×720 source on a 1280×720 stage: no crop, face maps 1:1.
    const b = faceCharacterBox(s, 1280, 720, src);
    expect(b).toMatchObject({ cx: 640, cy: 250 });
    // Size 100%: the body (half the box here) just covers the face's larger side.
    expect(b?.size).toBeCloseTo(300 / DEFAULT_BODY.h);
    // A 4:3 source is cropped top and bottom to cover 16:9: the face moves with the crop.
    const crop = coverCrop(960, 720, feedRect(s, 1280, 720));
    const b43 = faceCharacterBox({ ...s, face: { ...face, cx: 480, cy: 360 } }, 1280, 720, {
      width: 960,
      height: 720,
    });
    expect(b43?.cx).toBeCloseTo(640);
    expect(b43?.cy).toBeCloseTo((360 - crop.y) * (720 / crop.h));
  });

  it('applies the size and the offset (in face widths and heights)', () => {
    const b = faceCharacterBox(
      { ...s, faceAnchor: { ...s.faceAnchor, size: 0.5, offsetX: 0.5, offsetY: -0.25 } },
      1280,
      720,
      src,
    );
    expect(b?.cx).toBeCloseTo(640 + 110);
    expect(b?.cy).toBeCloseTo(250 - 75);
    expect(b?.size).toBeCloseTo((300 / DEFAULT_BODY.h) * 0.5);
  });

  it('opacity over the face mirrors the dial, capped by the setting', () => {
    expect(characterAlpha(s, src)).toBeCloseTo(0.6);
    expect(characterAlpha({ ...s, feedOpacity: 1 }, src)).toBeCloseTo(0);
    expect(characterAlpha({ ...s, feedOpacity: 0 }, src)).toBeCloseTo(1);
    expect(
      characterAlpha({ ...s, feedOpacity: 0, faceAnchor: { ...s.faceAnchor, opacity: 0.7 } }, src),
    ).toBeCloseTo(0.7);
    // Not following: the engine's value.
    expect(characterAlpha({ ...s, mode: 'character' }, src)).toBe(1);
    expect(characterAlpha(s, null)).toBe(1);
  });

  it('sits on the face while the feed shows, and glides to the centre as it fades to 0%', () => {
    expect(characterBox(s, 1280, 720, src)).toMatchObject({ cx: 640, cy: 250 });
    const covered = characterBox({ ...s, feedOpacity: 0 }, 1280, 720, src);
    expect(covered).toEqual(characterBox({ ...s, feedOpacity: 0, face: null, mode: 'character' }, 1280, 720));
  });

  it('falls back to the usual placement without a face or a feed', () => {
    expect(characterBox({ ...s, face: null }, 1280, 720, src)).toEqual(
      characterBox({ ...s, face: null }, 1280, 720),
    );
    expect(characterBox(s, 1280, 720)).not.toMatchObject({ cx: 640, cy: 250 });
  });
});

describe('lip-reading zoom', () => {
  it('crops toward the face as zoom eases in, staying inside the frame', () => {
    const dst = feedRect(s, 1280, 720);
    expect(feedCrop(s, src, dst)).toEqual(coverCrop(1280, 720, dst));
    const z = feedCrop({ ...s, zoom: 1 }, src, dst);
    expect(z.h).toBeCloseTo(300 / 0.6);
    expect(z.w / z.h).toBeCloseTo(16 / 9);
    expect(z.x).toBeGreaterThanOrEqual(0);
    expect(z.y).toBeGreaterThanOrEqual(0);
    expect(z.x + z.w).toBeLessThanOrEqual(1280 + 1e-6);
    expect(z.y + z.h).toBeLessThanOrEqual(720 + 1e-6);
    const half = feedCrop({ ...s, zoom: 0.5 }, src, dst);
    expect(half.h).toBeLessThan(720);
    expect(half.h).toBeGreaterThan(z.h);
  });

  it('moves the character to a corner badge while zoomed', () => {
    const b = characterBox({ ...s, zoom: 1, feedOpacity: 1 }, 1280, 720, src);
    expect(b).toMatchObject({ cx: 1280 - 720 * 0.2, cy: 720 - 720 * 0.19 });
    expect(characterAlpha({ ...s, zoom: 1, feedOpacity: 1 }, src)).toBe(1);
  });
});
