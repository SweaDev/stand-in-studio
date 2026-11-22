import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { type DecodedMetrics, mapMetrics, mapValidation } from '../../../src/sensing/metricsMapper';

const require = createRequire(import.meta.url);
const { Metrics, decodeMetrics } = require('@smartspectra/node-sdk/messages');

/** Round-trips a plain object through the real protobuf schema, like an SDK packet. */
function packet(obj: object): DecodedMetrics {
  const buf: Uint8Array = Metrics.encode(Metrics.fromObject(obj)).finish();
  return decodeMetrics(buf);
}

const landmarks = Array.from({ length: 478 }, (_, i) => ({ x: i, y: i * 2 }));

describe('mapMetrics', () => {
  it('maps a full face + breathing packet', () => {
    const m = packet({
      breathing: {
        upperTrace: [
          { value: 0.1, timestamp: 1 },
          { value: 0.3, timestamp: 2 },
        ],
      },
      face: {
        landmarks: [{ value: [{ x: 1, y: 1 }] }, { value: landmarks, stable: true }],
        blinking: [{ detected: false }, { detected: true }],
        talking: [{ detected: true }, { detected: false }],
        expression: [
          {
            scores: [
              { type: 5, confidence: 72 },
              { type: 6, confidence: 20 },
            ],
          },
        ],
      },
    });
    const f = mapMetrics(m, 1234);
    expect(f.t).toBe(1234);
    expect(f.breathingTrace?.map((v) => +v.toFixed(3))).toEqual([0.1, 0.3]);
    expect(f.blink).toBe(true);
    expect(f.talking).toBe(false); // latest sample wins
    expect(f.landmarks).toHaveLength(478);
    expect(f.landmarks?.[10]).toEqual({ x: 10, y: 20 });
    expect(f.happy).toBeCloseTo(0.72);
    expect(f.expressions?.happy).toBeCloseTo(0.72);
    expect(f.expressions?.neutral).toBeCloseTo(0.2);
    expect(f.expressions?.sad).toBe(0);
    expect(f.pulseRate).toBeUndefined();
  });

  it('treats omitted defaults as false/0 and leaves absent fields undefined', () => {
    const f = mapMetrics(packet({ face: { blinking: [{}], talking: [{}] } }), 0);
    expect(f.blink).toBe(false);
    expect(f.talking).toBe(false);
    expect(f.landmarks).toBeUndefined();
    expect(f.happy).toBeUndefined();
    expect(f.breathingTrace).toBeUndefined();
    expect(mapMetrics(packet({}), 0)).toEqual({ t: 0 });
  });

  it('happy is 0 when the HAPPY score is missing', () => {
    const f = mapMetrics(packet({ face: { expression: [{ scores: [{ type: 6, confidence: 90 }] }] } }), 0);
    expect(f.happy).toBe(0);
  });

  it('maps cardio and breathing rate with confidence rules', () => {
    const f = mapMetrics(
      packet({
        cardio: {
          pulseRate: [
            { value: 70, confidence: 30 },
            { value: 72, confidence: 41 },
          ],
        },
        breathing: { rate: [{ value: 14 }] },
      }),
      0,
    );
    expect(f.pulseRate).toEqual({ value: 72, confident: true });
    expect(f.breathingRate).toEqual({ value: 14, confident: false });
    const g = mapMetrics(packet({ breathing: { rate: [{ value: 15, stable: true }] } }), 0);
    expect(g.breathingRate?.confident).toBe(true);
    const h = mapMetrics(packet({ cardio: { pulseRate: [{ value: 0 }] } }), 0);
    expect(h.pulseRate).toBeUndefined();
  });
});

describe('mapValidation', () => {
  it('maps codes to coarse states', () => {
    expect(mapValidation(0)).toBe('ok');
    expect(mapValidation(1)).toBe('noFace');
    for (const c of [2, 3, 5, 7, 11, 12, 17]) expect(mapValidation(c)).toBe('poor');
  });
});
