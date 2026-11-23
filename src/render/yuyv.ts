/**
 * RGBA → packed YUYV (YUY2), BT.601 limited range, the format virtual cameras such as
 * v4l2loopback expect. Each pair of pixels shares one U and one V (their average).
 * This is the reference; the renderer normally converts on the GPU with the same maths.
 */
export function yuvFromRgb(r: number, g: number, b: number): [number, number, number] {
  const y = 16 + (65.481 * r + 128.553 * g + 24.966 * b) / 255;
  const u = 128 + (-37.797 * r - 74.203 * g + 112.0 * b) / 255;
  const v = 128 + (112.0 * r - 93.786 * g - 18.214 * b) / 255;
  return [y, u, v];
}

/**
 * Converts `width × height` RGBA pixels (width even) into `out` (width × height × 2 bytes).
 * The formulas above, inlined (no per-pixel allocation), fast enough for 1280×720 at 30 fps
 * when the GPU path is unavailable.
 */
export function rgbaToYuyv(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  out: Uint8Array,
): void {
  if (width % 2 !== 0) throw new Error('YUYV needs an even width');
  if (out.length < width * height * 2) throw new Error('output buffer too small');
  const n = width * height * 4;
  let o = 0;
  for (let i = 0; i < n; i += 8) {
    const r0 = rgba[i] as number;
    const g0 = rgba[i + 1] as number;
    const b0 = rgba[i + 2] as number;
    const r1 = rgba[i + 4] as number;
    const g1 = rgba[i + 5] as number;
    const b1 = rgba[i + 6] as number;
    const r = r0 + r1;
    const g = g0 + g1;
    const b = b0 + b1;
    // Y in [16, 235], U and V in [16, 240]; no clamping needed for 8-bit input.
    out[o] = ((4080 + 65.481 * r0 + 128.553 * g0 + 24.966 * b0 + 127.5) / 255) | 0;
    out[o + 1] = ((32640 + 0.5 * (-37.797 * r - 74.203 * g + 112.0 * b) + 127.5) / 255) | 0;
    out[o + 2] = ((4080 + 65.481 * r1 + 128.553 * g1 + 24.966 * b1 + 127.5) / 255) | 0;
    out[o + 3] = ((32640 + 0.5 * (112.0 * r - 93.786 * g - 18.214 * b) + 127.5) / 255) | 0;
    o += 4;
  }
}

/** GLSL for the same conversion: one output texel = (Y0, U, Y1, V) for two source pixels. */
export const YUYV_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D src;
out vec4 color;
vec3 yuv(vec3 c) {
  return vec3(
    16.0 + 65.481 * c.r + 128.553 * c.g + 24.966 * c.b,
    128.0 - 37.797 * c.r - 74.203 * c.g + 112.0 * c.b,
    128.0 + 112.0 * c.r - 93.786 * c.g - 18.214 * c.b) / 255.0;
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 a = yuv(texelFetch(src, ivec2(p.x * 2, p.y), 0).rgb);
  vec3 b = yuv(texelFetch(src, ivec2(p.x * 2 + 1, p.y), 0).rgb);
  color = vec4(a.x, (a.y + b.y) * 0.5, b.x, (a.z + b.z) * 0.5);
}`;

export const YUYV_VERTEX_SHADER = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;
