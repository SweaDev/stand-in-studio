import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import {
  PresageSignalSource,
  RETRY_DELAYS_MS,
  type SdkFactory,
  type SdkLike,
  type SdkOptions,
} from '../../../src/sensing/presage/PresageSignalSource';
import type { DecodedMetrics } from '../../../src/sensing/metricsMapper';
import { Metric } from '../../../src/sensing/metricTypes';
import { FakeClock } from '../../../src/core/util/Clock';
import type { SignalFrame } from '../../../src/shared/types';

const require = createRequire(import.meta.url);
const { Metrics, decodeMetrics } = require('@smartspectra/node-sdk/messages');

class FakeSdk implements SdkLike {
  handlers: Record<string, (...a: never[]) => void> = {};
  stream: unknown = null;
  started = 0;
  stopped = 0;
  resets = 0;
  destroyed = false;
  failStart: { code: number; retryable: boolean } | null = null;
  constructor(readonly options: SdkOptions) {}
  useMediaStream(s: unknown) {
    this.stream = s;
    return this;
  }
  async start() {
    this.started++;
    if (this.failStart) throw Object.assign(new Error('nope'), this.failStart);
  }
  async stop() {
    this.stopped++;
  }
  async reset() {
    this.resets++;
  }
  destroy() {
    this.destroyed = true;
  }
  on(event: string, cb: (...a: never[]) => void) {
    this.handlers[event] = cb;
    return this;
  }
  emit(event: string, ...args: unknown[]) {
    (this.handlers[event] as unknown as (...a: unknown[]) => void)(...args);
  }
}

function setup(comfortShield = false) {
  const sdks: FakeSdk[] = [];
  const factory: SdkFactory = {
    create: (o) => {
      const s = new FakeSdk(o);
      sdks.push(s);
      return s;
    },
    decode: (buf) => decodeMetrics(buf) as DecodedMetrics,
  };
  const clock = new FakeClock(500);
  const stream = { id: 'stream' } as unknown as MediaStream;
  const src = new PresageSignalSource(stream, { comfortShield }, factory, clock);
  const frames: SignalFrame[] = [];
  const errors: unknown[] = [];
  const statuses: string[] = [];
  src.events.on('frame', (f) => frames.push(f));
  src.events.on('error', (e) => errors.push(e));
  src.events.on('status', (s) => statuses.push(s));
  return { sdks, src, frames, errors, statuses, stream };
}

describe('PresageSignalSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts the SDK on the app stream with minimal metrics, empty key and telemetry off', async () => {
    const { sdks, src, statuses, stream } = setup();
    await src.start();
    const sdk = sdks[0] as FakeSdk;
    expect(sdk.options).toEqual({
      apiKey: '',
      requestedMetrics: [
        Metric.FACE_LANDMARKS,
        Metric.BLINKING,
        Metric.TALKING,
        Metric.EXPRESSIONS,
        Metric.CHEST_BREATHING,
      ],
      enableTelemetry: false,
    });
    expect(sdk.stream).toBe(stream);
    expect(Object.keys(sdk.handlers).sort()).toEqual(['error', 'metrics', 'validationStatus']);
    expect(statuses).toEqual(['starting', 'running']);
    await src.start(); // idempotent
    expect(sdks).toHaveLength(1);
  });

  it('maps metrics packets and validation events to frames', async () => {
    const { sdks, src, frames } = setup();
    await src.start();
    const buf = Metrics.encode(Metrics.fromObject({ face: { talking: [{ detected: true }] } })).finish();
    (sdks[0] as FakeSdk).emit('metrics', buf, 1);
    (sdks[0] as FakeSdk).emit('metrics', new Uint8Array([255, 255, 255]), 2); // malformed: dropped
    (sdks[0] as FakeSdk).emit('validationStatus', 1, 3, 'No face');
    (sdks[0] as FakeSdk).emit('validationStatus', 2, 4, 'Multiple faces');
    expect(frames).toEqual([
      { t: 500, talking: true },
      { t: 500, validation: 'noFace', multipleFaces: false },
      { t: 500, validation: 'poor', multipleFaces: true },
    ]);
    expect(src.lastHint).toBe('Multiple faces');
  });

  it('reconfigures with cardio metrics only when the Comfort shield is on', async () => {
    const { sdks, src } = setup();
    await src.setComfortShield(false);
    await src.start();
    await src.setComfortShield(true);
    expect(sdks).toHaveLength(2);
    expect((sdks[0] as FakeSdk).destroyed).toBe(true);
    expect((sdks[1] as FakeSdk).options.requestedMetrics).toContain(Metric.PULSE_RATE);
    expect(src.requested).toContain(Metric.BREATHING_RATE);
  });

  it('stops for good on auth or credit errors', async () => {
    const { sdks, src, errors, statuses } = setup();
    await src.start();
    (sdks[0] as FakeSdk).emit('error', 2, 'auth failed', false);
    expect(errors).toEqual([expect.objectContaining({ reason: 'auth', retrying: false })]);
    expect(statuses.at(-1)).toBe('error');
    (sdks[0] as FakeSdk).emit('error', 4, 'credits', false);
    expect(errors.at(-1)).toMatchObject({ reason: 'credits' });
  });

  it('retries retryable errors with back-off, then gives up', async () => {
    const { sdks, src, errors, statuses } = setup();
    await src.start();
    const sdk = sdks[0] as FakeSdk;
    sdk.emit('error', 14, 'low fps', true);
    expect(errors.at(-1)).toMatchObject({ reason: 'lowFrameRate', retrying: true });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(sdk.resets).toBe(1);
    expect(sdk.started).toBe(2);
    sdk.emit('error', 5, 'net', true);
    sdk.emit('error', 5, 'net', true);
    sdk.emit('error', 5, 'net', true);
    expect(errors.at(-1)).toMatchObject({ reason: 'network', retrying: false });
    expect(statuses.at(-1)).toBe('error');
    await src.stop();
    expect(sdk.destroyed).toBe(true);
    expect(statuses.at(-1)).toBe('stopped');
  });

  it('reports a start that throws (e.g. bad key) as an error', async () => {
    const factory: SdkFactory = {
      create: (o) => Object.assign(new FakeSdk(o), { failStart: { code: 2, retryable: false } }),
      decode: (buf) => decodeMetrics(buf) as DecodedMetrics,
    };
    const src = new PresageSignalSource(
      {} as MediaStream,
      { comfortShield: false },
      factory,
      new FakeClock(),
    );
    const errors: unknown[] = [];
    src.events.on('error', (e) => errors.push(e));
    await src.start();
    expect(errors).toEqual([expect.objectContaining({ reason: 'auth', retrying: false })]);
    expect(src.status).toBe('error');
  });
});
