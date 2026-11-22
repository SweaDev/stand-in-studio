import { describe, expect, it } from 'vitest';
import { containRect } from '../../../src/render/rawPreview';

describe('raw preview', () => {
  it('fits the whole feed, centred, without cropping', () => {
    expect(containRect(1280, 720, 960, 540)).toEqual({ x: 0, y: 0, w: 960, h: 540 });
    expect(containRect(640, 480, 960, 540)).toEqual({ x: 120, y: 0, w: 720, h: 540 });
    expect(containRect(1080, 1920, 960, 540)).toMatchObject({ y: 0, h: 540 });
    expect(containRect(0, 0, 960, 540)).toEqual({ x: 0, y: 0, w: 960, h: 540 });
  });
});
