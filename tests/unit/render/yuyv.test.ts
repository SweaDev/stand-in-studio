import { describe, expect, it } from 'vitest';
import { rgbaToYuyv } from '../../../src/render/yuyv';

const px = (...rgb: number[][]) =>
  new Uint8ClampedArray(rgb.flatMap(([r, g, b]) => [r as number, g as number, b as number, 255]));

describe('RGBA → YUYV (BT.601 limited range)', () => {
  it('maps reference colours to the textbook values', () => {
    const out = new Uint8Array(4);
    const at = (a: number[], b: number[]) => {
      rgbaToYuyv(px(a, b), 2, 1, out);
      return [...out];
    };
    expect(at([0, 0, 0], [0, 0, 0])).toEqual([16, 128, 16, 128]);
    expect(at([255, 255, 255], [255, 255, 255])).toEqual([235, 128, 235, 128]);
    expect(at([255, 0, 0], [255, 0, 0])).toEqual([81, 90, 81, 240]);
    expect(at([0, 0, 255], [0, 0, 255])).toEqual([41, 240, 41, 110]);
    // Two different pixels share averaged chroma.
    expect(at([0, 0, 0], [255, 255, 255])).toEqual([16, 128, 235, 128]);
  });

  it('checks sizes', () => {
    expect(() => rgbaToYuyv(px([0, 0, 0]), 1, 1, new Uint8Array(2))).toThrow(/even width/);
    expect(() => rgbaToYuyv(px([0, 0, 0], [0, 0, 0]), 2, 1, new Uint8Array(3))).toThrow(/too small/);
  });
});
