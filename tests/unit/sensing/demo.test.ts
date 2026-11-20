import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_KEYS, DemoModel } from '../../../src/sensing/demo/DemoModel';
import { DemoSignalSource } from '../../../src/sensing/demo/DemoSignalSource';
import { computeFaceFeatures } from '../../../src/core/features/faceGeometry';
import { FakeClock } from '../../../src/core/util/Clock';

describe('DemoModel', () => {
  it('maps the documented keys', () => {
    expect(Object.keys(DEMO_KEYS).sort()).toEqual(['a', 'b', 'e', 'h', 'l', 'n', 'p', 's', 't']);
  });

  it('produces a calm, face-ok frame at rest', () => {
    const f = new DemoModel().frame(1000);
    expect(f.validation).toBe('ok');
    expect(f.talking).toBe(false);
    const feat = computeFaceFeatures(f.landmarks ?? []);
    expect(feat?.pitch).toBeCloseTo(0.4, 1);
    expect(feat?.mouthGap).toBeCloseTo(0.02, 2);
  });

  it('nods, shakes, looks away, talks, eats, smiles, blinks and steps away', () => {
    const m = new DemoModel();
    const feat = (t: number) => computeFaceFeatures(m.frame(t).landmarks ?? []);
    m.trigger('nod', 10_000);
    expect(feat(10_225)?.pitch).toBeGreaterThan(0.48);
    m.trigger('shake', 20_000);
    expect(Math.abs(feat(20_160)?.yaw ?? 0)).toBeGreaterThan(0.08);
    m.trigger('lookAway', 21_000);
    expect(feat(21_000)?.yaw).toBeGreaterThan(0.5);
    m.trigger('lookAway', 21_100);
    m.trigger('talk', 22_000);
    expect(m.frame(22_000).talking).toBe(true);
    m.trigger('talk', 22_100);
    m.trigger('eat', 23_000);
    expect(feat(23_000)?.mouthGap).toBeGreaterThan(0.3);
    expect(m.frame(23_000).talking).toBe(false);
    m.trigger('smile', 24_000);
    expect(m.frame(24_100).happy).toBeGreaterThan(0.8);
    expect(m.frame(27_000).happy).toBeLessThan(0.2);
    m.trigger('blink', 28_000);
    expect(m.frame(28_050).blink).toBe(true);
    m.trigger('away', 29_000);
    const away = m.frame(29_000);
    expect(away.validation).toBe('noFace');
    expect(away.landmarks).toBeUndefined();
    m.trigger('shield', 0);
    m.reset();
    expect(m.away).toBe(false);
  });

  it('blinks naturally every few seconds', () => {
    const m = new DemoModel();
    let blinks = 0;
    for (let t = 0; t < 20_000; t += 50) if (m.frame(t).blink) blinks++;
    expect(blinks).toBeGreaterThanOrEqual(4);
  });
});

describe('DemoSignalSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emits ~20 frames per second and handles hold-to-talk and the shield key', async () => {
    const clock = new FakeClock(0);
    const src = new DemoSignalSource(clock);
    const frames: boolean[] = [];
    let shield = 0;
    const statuses: string[] = [];
    src.events.on('frame', (f) => frames.push(f.talking ?? false));
    src.events.on('shieldTrigger', () => shield++);
    src.events.on('status', (s) => statuses.push(s));
    await src.start();
    await src.start();
    src.press('talk');
    vi.advanceTimersByTime(1000);
    src.release('talk');
    vi.advanceTimersByTime(100);
    src.press('shield');
    src.press('nod');
    await src.stop();
    expect(frames.length).toBe(22);
    expect(frames.slice(0, 20).every(Boolean)).toBe(true);
    expect(frames[21]).toBe(false);
    expect(shield).toBe(1);
    expect(statuses).toEqual(['running', 'stopped']);
    expect(src.status).toBe('stopped');
  });
});
