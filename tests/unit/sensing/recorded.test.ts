import { describe, expect, it } from 'vitest';
import { StudioEngine } from '../../../src/core/StudioEngine';
import { FakeClock } from '../../../src/core/util/Clock';
import { syntheticFace } from '../../../src/core/features/syntheticFace';
import { DEFAULT_SETTINGS, updateSettings } from '../../../src/shared/settings';
import { sanitizeTelemetry } from '../../../src/shared/telemetry';
import type { SignalFrame } from '../../../src/shared/types';
import { TelemetryRecorder } from '../../../src/sensing/recorded/TelemetryRecorder';
import { ReplaySignalSource, firstAfter } from '../../../src/sensing/recorded/ReplaySignalSource';

const VIDEO = { file: 'clip.webm', durationMs: 40_000, width: 960, height: 540 };
const META = { app: 'test', sdk: '3.5.0', video: VIDEO };

/** A scripted person: listening, then talking, then away, then back. */
function frameAt(ms: number, t: number): SignalFrame {
  const talking = ms >= 20_000 && ms < 27_000;
  const away = ms >= 29_000 && ms < 34_000;
  const f: SignalFrame = {
    t,
    validation: away ? 'noFace' : 'ok',
    talking,
    happy: 0.1,
    expressions: { happy: 0.1, neutral: 0.9 },
    pulseRate: { value: 70, confident: true },
  };
  if (!away)
    f.landmarks = syntheticFace({ pitch: 0.4, yaw: 0, mouthGap: talking ? 0.2 : 0.02, eyeOpenness: 0.3 });
  return f;
}

/** Plays the clip "live": packets at 20 Hz, ticks at 30 Hz; returns the intent per tick. */
function liveRun(recorder: TelemetryRecorder | null) {
  const clock = new FakeClock(1000);
  const engine = new StudioEngine(updateSettings(DEFAULT_SETTINGS, { mode: 'auto' }), clock);
  const start = clock.now();
  engine.startCalibration();
  const intents: string[] = [];
  let next = start;
  while (clock.now() - start < VIDEO.durationMs) {
    if (clock.now() >= next) {
      const f = frameAt(clock.now() - start, clock.now());
      engine.ingest(f);
      recorder?.push(f);
      next += 50;
    }
    engine.tick();
    intents.push(engine.debug?.intent.id ?? 'none');
    clock.advance(33);
  }
  return intents;
}

function replayRun(source: (clock: FakeClock, engine: StudioEngine) => ReplaySignalSource) {
  const clock = new FakeClock(1000);
  const engine = new StudioEngine(updateSettings(DEFAULT_SETTINGS, { mode: 'auto' }), clock);
  const replay = source(clock, engine);
  replay.events.on('frame', (f) => engine.ingest(f));
  void replay.start();
  const start = clock.now();
  engine.startCalibration();
  const intents: string[] = [];
  while (clock.now() - start < VIDEO.durationMs) {
    replay.sync(clock.now() - start);
    engine.tick();
    intents.push(engine.debug?.intent.id ?? 'none');
    clock.advance(33);
  }
  return { intents, replay };
}

/** Consecutive duplicates removed: the order in which intents took over. */
const sequence = (xs: string[]) => xs.filter((x, i) => x !== xs[i - 1]);

describe('TelemetryRecorder', () => {
  it('stamps frames with media time and drops body signals by default', () => {
    let media = 0;
    const r = new TelemetryRecorder({ mediaTime: () => media, includeBody: false });
    r.push({ t: 9999, talking: true, pulseRate: { value: 80, confident: true } });
    media = 120.4;
    r.push({ t: 10_100, validation: 'ok' });
    const file = r.finish(META);
    expect(file.frames).toEqual([
      { tMs: 0, talking: true },
      { tMs: 120, validation: 'ok' },
    ]);
    expect(file.includesBody).toBe(false);
  });

  it('aborts when the clip jumps back (seek or loop) while saving', () => {
    let media = 5000;
    const r = new TelemetryRecorder({ mediaTime: () => media, includeBody: false });
    r.push({ t: 0, talking: true });
    media = 100;
    r.push({ t: 1, talking: true });
    expect(r.aborted).toMatch(/jumped back/);
    expect(() => r.finish(META)).toThrow(/jumped back/);
  });

  it('refuses to save an empty recording', () => {
    const r = new TelemetryRecorder({ mediaTime: () => 0, includeBody: false });
    expect(() => r.finish(META)).toThrow(/no signals/);
  });
});

describe('ReplaySignalSource', () => {
  it('replaying saved telemetry reproduces the live intent sequence, without the SDK', () => {
    let media = 0;
    const clockStart = 1000;
    const rec = new TelemetryRecorder({ mediaTime: () => media, includeBody: false });
    // The recorder reads media time from the live clock.
    const live = liveRun({
      push: (f: SignalFrame) => {
        media = f.t - clockStart;
        rec.push(f);
      },
    } as unknown as TelemetryRecorder);
    const saved = sanitizeTelemetry(JSON.parse(JSON.stringify(rec.finish(META))));
    const { intents } = replayRun((clock) => new ReplaySignalSource(saved, clock));
    expect(sequence(live)).toContain('talkingInMeeting');
    expect(sequence(live)).toContain('away');
    expect(sequence(intents)).toEqual(sequence(live));
    // Per-tick agreement is near-perfect (frames land on ticks instead of between them).
    const same = intents.filter((x, i) => x === live[i]).length;
    expect(same / live.length).toBeGreaterThan(0.97);
  });

  it('a rewind (loop or seek back) clears signal history and continues from there', () => {
    const frames = Array.from({ length: 100 }, (_, i) => ({ tMs: i * 100, talking: true }));
    const saved = sanitizeTelemetry({ format: 'standin-telemetry', version: 1, frames });
    const clock = new FakeClock(0);
    let rewinds = 0;
    const r = new ReplaySignalSource(saved, clock, () => rewinds++);
    const got: number[] = [];
    r.events.on('frame', () => got.push(clock.now()));
    void r.start();
    r.sync(950);
    expect(got).toHaveLength(10);
    r.sync(9_950); // jump ahead: skips to 1.5 s before
    expect(got.length).toBeLessThan(10 + 20);
    const before = got.length;
    r.sync(0); // loop back
    expect(rewinds).toBe(1);
    expect(got.length).toBe(before + 1);
    r.sync(450);
    expect(got.length).toBe(before + 5);
  });

  it('emits nothing until started, nor after stop', () => {
    const saved = sanitizeTelemetry({
      format: 'standin-telemetry',
      version: 1,
      frames: [{ tMs: 0, talking: true }],
    });
    const r = new ReplaySignalSource(saved, new FakeClock(0));
    let n = 0;
    r.events.on('frame', () => n++);
    r.sync(10);
    expect(n).toBe(0);
    void r.start();
    r.sync(10);
    void r.stop();
    r.sync(20);
    expect(n).toBe(1);
  });

  it('firstAfter is a correct binary search', () => {
    const fs = [0, 10, 10, 20].map((tMs) => ({ tMs }));
    expect([-1, 0, 5, 10, 15, 20, 25].map((m) => firstAfter(fs, m))).toEqual([0, 1, 1, 3, 3, 4, 4]);
  });
});

describe('StudioEngine.resetSignals', () => {
  it('a rewind holds the current level instead of jumping to Away', () => {
    const clock = new FakeClock(0);
    const engine = new StudioEngine(updateSettings(DEFAULT_SETTINGS, { mode: 'auto' }), clock);
    for (let i = 0; i < 300; i++) {
      engine.ingest(frameAt(1000, clock.now()));
      engine.tick();
      clock.advance(50);
    }
    const before = engine.tick().feedOpacity;
    engine.resetSignals();
    engine.tick();
    expect(engine.debug?.sensing).toBe('warming');
    for (let i = 0; i < 40; i++) {
      expect(engine.tick().badges.backSoon).toBe(false);
      clock.advance(50);
    }
    expect(engine.tick().feedOpacity).toBeCloseTo(before, 2);
  });
});
