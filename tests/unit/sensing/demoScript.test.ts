import { describe, expect, it } from 'vitest';
import {
  MEETING_SCRIPT,
  SCRIPT_MS,
  ScriptPlayer,
  type ScriptStep,
} from '../../../src/sensing/demo/demoScript';
import { DemoModel } from '../../../src/sensing/demo/DemoModel';
import { StudioEngine } from '../../../src/core/StudioEngine';
import { FakeClock } from '../../../src/core/util/Clock';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';

describe('MEETING_SCRIPT', () => {
  it('is ordered, within 60 s, and balanced (toggles return to rest)', () => {
    const times = MEETING_SCRIPT.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Math.max(...times)).toBeLessThan(SCRIPT_MS);
    const count = (a: string) => MEETING_SCRIPT.filter((s) => s.action === a).length;
    for (const toggle of ['lookAway', 'eat', 'away', 'talk']) expect(count(toggle) % 2).toBe(0);
  });
});

describe('ScriptPlayer', () => {
  it('fires steps in order and loops', () => {
    const fired: ScriptStep[] = [];
    let loops = 0;
    const p = new ScriptPlayer(
      (s) => fired.push(s),
      () => loops++,
    );
    p.update(0);
    expect(fired).toHaveLength(0);
    p.start(1000);
    expect(p.isRunning).toBe(true);
    p.update(1000);
    expect(fired).toHaveLength(1);
    p.update(1000 + SCRIPT_MS - 1);
    expect(fired).toHaveLength(MEETING_SCRIPT.length);
    expect(p.position(1000 + 30_000)).toBe(30);
    p.update(1000 + SCRIPT_MS + 1);
    expect(loops).toBe(2);
    expect(fired).toHaveLength(MEETING_SCRIPT.length + 1);
    p.stop();
    expect(p.caption).toBe('');
    expect(p.position(0)).toBe(0);
  });

  it('drives Auto end to end through a whole loop', () => {
    const clock = new FakeClock(0);
    const engine = new StudioEngine(DEFAULT_SETTINGS, clock);
    const model = new DemoModel();
    const player = new ScriptPlayer((s) => {
      if (s.action === 'talk') model.talking = s.type === 'press';
      else model.trigger(s.action, clock.now());
    });
    engine.startCalibration(3000);
    for (let t = 0; t < 3500; t += 50) {
      engine.ingest(model.frame(clock.now()));
      engine.tick();
      clock.advance(50);
    }
    player.start(clock.now());
    const samples: Record<string, number> = {};
    const at = (sec: number) =>
      clock.now() >= player.position(0) && Math.abs(player.position(clock.now()) - sec) < 0.03;
    for (let i = 0; i < SCRIPT_MS / 50; i++) {
      player.update(clock.now());
      engine.ingest(model.frame(clock.now()));
      const s = engine.tick();
      for (const sec of [10, 20, 34, 43, 52]) if (at(sec)) samples[sec] = s.feedOpacity;
      clock.advance(50);
    }
    expect(samples[10]).toBeCloseTo(0.4, 1); // listening
    expect(samples[20]).toBeGreaterThan(0.9); // talking
    expect(samples[34]).toBeLessThan(0.05); // looking away
    expect(samples[43]).toBeLessThan(0.05); // eating
    expect(samples[52]).toBeLessThan(0.05); // stepped out
  });
});
