import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_FRAMES,
  TELEMETRY_FORMAT,
  TELEMETRY_VERSION,
  sanitizeTelemetry,
  stripBody,
  toTelemetryFrame,
} from '../../../src/shared/telemetry';

const file = (frames: unknown[], extra: Record<string, unknown> = {}) => ({
  format: TELEMETRY_FORMAT,
  version: TELEMETRY_VERSION,
  app: '1.3.0',
  sdk: '3.5.0',
  createdAt: '2026-11-22T00:00:00.000Z',
  includesBody: false,
  video: { file: 'clip.webm', durationMs: 5000, width: 960, height: 540 },
  frames,
  ...extra,
});

describe('telemetry format', () => {
  it('drops body signals unless the user opted in', () => {
    const frame = {
      t: 5,
      talking: true,
      pulseRate: { value: 70, confident: true },
      breathingRate: { value: 14, confident: false },
      breathingTrace: [0.1, 0.2],
    };
    expect(toTelemetryFrame(frame, 100, false)).toEqual({ tMs: 100, talking: true });
    expect(toTelemetryFrame(frame, 100, true)?.pulseRate).toEqual({ value: 70, confident: true });
    expect(toTelemetryFrame({ t: 1, pulseRate: { value: 60, confident: true } }, 5, false)).toBeNull();
  });

  it('a file that says it has no body signals never yields them, even if edited in', () => {
    const t = sanitizeTelemetry(
      file([{ tMs: 0, talking: false, pulseRate: { value: 99, confident: true } }]),
    );
    expect(t.frames[0]).toEqual({ tMs: 0, talking: false });
  });

  it('sorts frames, drops malformed ones and clamps scores', () => {
    const t = sanitizeTelemetry(
      file([
        { tMs: 200, happy: 3 },
        { tMs: -1, talking: true },
        { tMs: 'x' },
        { tMs: 100, validation: 'ok', landmarks: [{ x: 1, y: 2 }], expressions: { happy: 0.5, bogus: 1 } },
        { tMs: 150, validation: 'weird' },
      ]),
    );
    expect(t.frames.map((f) => f.tMs)).toEqual([100, 200]);
    expect(t.frames[1]?.happy).toBe(1);
    expect(t.frames[0]?.expressions).toEqual({ happy: 0.5 });
  });

  it('rejects files that are not telemetry', () => {
    expect(() => sanitizeTelemetry({})).toThrow(/Not a Stand-In telemetry/);
    expect(() => sanitizeTelemetry(file([], { version: 9 }))).toThrow(/version/);
    expect(() => sanitizeTelemetry(file([]))).toThrow(/no usable frames/);
    expect(() => sanitizeTelemetry(file(new Array(MAX_FRAMES + 1).fill({ tMs: 0 })))).toThrow(/too large/);
  });

  it('never keeps a path in the video file name', () => {
    const t = sanitizeTelemetry(file([{ tMs: 0, talking: true }], { video: { file: '../../etc/passwd' } }));
    expect(t.video.file).not.toMatch(/[/\\]/);
    expect(t.video.durationMs).toBe(0);
  });

  it('round-trips through JSON unchanged', () => {
    const frameArb = fc.record(
      {
        tMs: fc.integer({ min: 0, max: 600_000 }),
        talking: fc.boolean(),
        blink: fc.boolean(),
        validation: fc.constantFrom('ok', 'noFace', 'poor'),
        happy: fc.double({ min: 0, max: 1, noNaN: true }),
        landmarks: fc.array(
          fc.record({
            x: fc.double({ noNaN: true, min: -1e4, max: 1e4 }),
            y: fc.double({ noNaN: true, min: -1e4, max: 1e4 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
      },
      { requiredKeys: ['tMs', 'talking'] },
    );
    fc.assert(
      fc.property(fc.array(frameArb, { minLength: 1, maxLength: 30 }), (frames) => {
        const a = sanitizeTelemetry(file(frames));
        const b = sanitizeTelemetry(JSON.parse(JSON.stringify(a)));
        expect(b).toEqual(a);
        expect(a.frames.every((f) => stripBody(f) === f || !('pulseRate' in f))).toBe(true);
      }),
    );
  });
});
