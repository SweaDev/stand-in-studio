import { describe, expect, it } from 'vitest';
import { StudioEngine } from '../../../src/core/StudioEngine';
import { FakeClock } from '../../../src/core/util/Clock';
import { syntheticFace } from '../../../src/core/features/syntheticFace';
import { DEFAULT_SETTINGS, updateSettings } from '../../../src/shared/settings';
import type { SignalFrame, StageState, ValidationState } from '../../../src/shared/types';

interface Situation {
  pitch?: number;
  yaw?: number;
  mouthGap?: number;
  talking?: boolean;
  happy?: number;
  validation?: ValidationState;
  face?: boolean;
}

/** Drives the engine at 20 Hz (SDK packet rate) and 30 Hz ticks for `ms`. */
function run(engine: StudioEngine, clock: FakeClock, ms: number, s: Situation = {}): StageState[] {
  const states: StageState[] = [];
  const end = clock.now() + ms;
  let nextPacket = clock.now();
  while (clock.now() < end) {
    if (clock.now() >= nextPacket) {
      const frame: SignalFrame = {
        t: clock.now(),
        validation: s.validation ?? (s.face === false ? 'noFace' : 'ok'),
        talking: s.talking ?? false,
        happy: s.happy ?? 0.1,
        expressions: { happy: s.happy ?? 0.1, neutral: 1 - (s.happy ?? 0.1) },
        breathingTrace: [Math.sin(clock.now() / 800)],
      };
      if (s.face !== false) {
        frame.landmarks = syntheticFace({
          pitch: s.pitch ?? 0.4,
          yaw: s.yaw ?? 0,
          mouthGap: s.mouthGap ?? (s.talking ? 0.2 : 0.02),
          eyeOpenness: 0.3,
        });
      }
      engine.ingest(frame);
      nextPacket += 50;
    }
    states.push(engine.tick());
    clock.advance(33);
  }
  return states;
}

function setup(mode: 'auto' | 'blend' | 'camera' | 'character' = 'auto') {
  const clock = new FakeClock(1000);
  const engine = new StudioEngine(updateSettings(DEFAULT_SETTINGS, { mode }), clock);
  engine.startCalibration();
  run(engine, clock, 16_000);
  expect(engine.calibrationStatus().phase).toBe('done');
  return { clock, engine };
}

const last = (xs: StageState[]) => xs[xs.length - 1] as StageState;

describe('StudioEngine (Auto, end to end)', () => {
  it('follows listening → talking → looking away → back', () => {
    const { clock, engine } = setup('auto');

    // Listening: settles at the 40% listening level.
    let s = run(engine, clock, 4000);
    expect(last(s).feedOpacity).toBeCloseTo(0.4, 2);
    expect(last(s).characterOpacity).toBe(1);

    // Talking: after 1 s sustained + 2 s hold, rises at ≤ 40%/s to 100%.
    s = run(engine, clock, 2900, { talking: true });
    expect(last(s).feedOpacity).toBeCloseTo(0.4, 2);
    s = run(engine, clock, 2000, { talking: true });
    expect(last(s).feedOpacity).toBeGreaterThan(0.6);
    s = run(engine, clock, 1500, { talking: true });
    expect(last(s).feedOpacity).toBe(1);
    expect(last(s).badges.speaking).toBe(true);
    expect(last(s).pose.mouthOpen).toBeGreaterThan(0.3);

    // Looking away: immediate drop once the 2 s timer fires.
    s = run(engine, clock, 2200, { yaw: 0.5 });
    const dropStart = last(s).targetOpacity;
    expect(dropStart).toBe(0);
    s = run(engine, clock, 2600, { yaw: 0.5 });
    expect(last(s).feedOpacity).toBe(0);

    // Back to listening: 2 s hold, then rises to 40%.
    s = run(engine, clock, 5000);
    expect(last(s).feedOpacity).toBeCloseTo(0.4, 2);
  });

  it('covers with the character when the face disappears, then wakes', () => {
    const { clock, engine } = setup('auto');
    run(engine, clock, 4000);
    // ~1 s filter + 3 s timer, then an immediate drop at ≤ 40%/s.
    let s = run(engine, clock, 5500, { face: false });
    expect(last(s).feedOpacity).toBeLessThan(0.1);
    expect(last(s).pose.presence).toBe('away');
    expect(last(s).badges.backSoon).toBe(true);
    // ~0.5 s for the validation filter to see "ok" again, then 1 s OK → wake-up stretch.
    s = run(engine, clock, 2000);
    expect(['waking', 'present']).toContain(last(s).pose.presence);
    s = run(engine, clock, 1500);
    expect(last(s).pose.presence).toBe('present');
  });

  it('drops to 0% while eating (mouth open without talking)', () => {
    const { clock, engine } = setup('auto');
    run(engine, clock, 4000);
    const s = run(engine, clock, 6000, { mouthGap: 0.45 });
    expect(last(s).feedOpacity).toBe(0);
    expect(last(s).pose.mouthOpen).toBe(0); // chewing never looks like speech
  });

  it('caps the feed at 15% when the Comfort shield triggers', () => {
    const clock = new FakeClock(0);
    const engine = new StudioEngine(
      updateSettings(DEFAULT_SETTINGS, { mode: 'auto', auto: { comfortShield: true } }),
      clock,
    );
    engine.startCalibration(1000);
    run(engine, clock, 1500);
    run(engine, clock, 3000, { talking: true });
    run(engine, clock, 4000, { talking: true });
    engine.simulateShieldTrigger();
    const s = run(engine, clock, 6000, { talking: true });
    expect(last(s).feedOpacity).toBeCloseTo(0.15, 2);
    expect(engine.debug?.shieldActive).toBe(true);
  });
});

describe('StudioEngine (intents)', () => {
  /** Talking to the camera with SDK validation flicker and natural head motion. */
  function talkWithFlicker(engine: StudioEngine, clock: FakeClock, ms: number, yaw = 0): StageState[] {
    const states: StageState[] = [];
    const end = clock.now() + ms;
    let n = 0;
    while (clock.now() < end) {
      if (n++ % 2 === 0) {
        const t = clock.now();
        engine.ingest({
          t,
          // Half the reports are not OK (motion, light), as measured on good input.
          validation: n % 4 === 0 ? 'poor' : 'ok',
          talking: n % 7 !== 0,
          happy: 0.1,
          landmarks: syntheticFace({
            pitch: 0.4 + Math.sin(t / 300) * 0.06,
            yaw: yaw + Math.sin(t / 400) * 0.08,
            mouthGap: 0.05 + Math.abs(Math.sin(t / 90)) * 0.3,
            eyeOpenness: 0.3,
          }),
        });
      }
      states.push(engine.tick());
      clock.advance(33);
    }
    return states;
  }

  it('talking to the camera reveals you and stays revealed despite validation flicker (reported bug)', () => {
    const { clock, engine } = setup('auto');
    run(engine, clock, 3000);
    let s = talkWithFlicker(engine, clock, 6000);
    expect(last(s).feedOpacity).toBe(1);
    expect(last(s).characterOpacity).toBe(0);
    s = talkWithFlicker(engine, clock, 8000);
    expect(Math.min(...s.map((x) => x.feedOpacity))).toBe(1);
    expect(engine.debug?.intent.id).toBe('talkingInMeeting');
  });

  it('turning to talk to someone else covers you within a second', () => {
    const { clock, engine } = setup('auto');
    talkWithFlicker(engine, clock, 7000);
    let s = talkWithFlicker(engine, clock, 1000, 0.5);
    expect(last(s).targetOpacity).toBe(0);
    s = talkWithFlicker(engine, clock, 500, 0.5);
    expect(last(s).characterOpacity).toBeGreaterThan(0.9);
    expect(engine.debug?.intent.id).toBe('talkingToOther');
    expect(engine.debug?.trace.summary).toContain('Cover me ← Talking to someone else');
  });

  it('listening settles at the listening level and no face shows "back soon"', () => {
    const { clock, engine } = setup('auto');
    let s = run(engine, clock, 4000);
    expect(last(s).feedOpacity).toBeCloseTo(0.4, 2);
    expect(engine.debug?.intent.id).toBe('listening');
    s = run(engine, clock, 5000, { face: false });
    expect(engine.debug?.intent.id).toBe('away');
    expect(last(s).badges.backSoon).toBe(true);
  });

  it('uses custom intents in list order and learns thresholds from a recording', () => {
    const { clock, engine } = setup('auto');
    engine.setIntents([
      {
        id: 'custom-smile',
        name: 'Smiling',
        builtIn: false,
        enabled: true,
        action: 'reveal',
        conditions: [{ signal: 'expression', states: ['happy'] }],
        holdMs: 300,
      },
      ...engine.intentList,
    ]);
    run(engine, clock, 2000, { happy: 0.8 });
    expect(engine.debug?.intent.id).toBe('custom-smile');
    const events: string[] = [];
    engine.events.on('tuning', (t) => events.push(t.phase));
    engine.startTuning('custom-smile', 1000);
    run(engine, clock, 1200, { happy: 0.5 });
    expect(events).toEqual(['recording', 'done']);
    expect(engine.intentTuning['custom-smile']?.thresholds.expression).toBeCloseTo(0.6 * 0.4, 1);
    engine.setIntents(engine.intentList.filter((i) => i.id !== 'custom-smile'));
    expect(engine.intentTuning['custom-smile']).toBeUndefined();
  });

  it('the trace explains every intent and signal', () => {
    const { clock, engine } = setup('auto');
    run(engine, clock, 1000, { yaw: 0.5, talking: true });
    const t = engine.debug?.trace;
    expect(t?.signals.map((x) => x.id)).toContain('gaze');
    expect(t?.intents.find((i) => i.id === 'talkingInMeeting')?.limitedBy).toMatch(/head turn/);
    expect(t?.policy.feedTarget).toBeDefined();
  });
});

describe('StudioEngine (SDK paused in Camera mode)', () => {
  /** Ticks with no SDK data at all (the SDK is stopped). */
  function idle(engine: StudioEngine, clock: FakeClock, ms: number): StageState[] {
    const out: StageState[] = [];
    const end = clock.now() + ms;
    while (clock.now() < end) {
      out.push(engine.tick());
      clock.advance(33);
    }
    return out;
  }

  it('while paused there is no "back soon", no away pose, and late packets are ignored', () => {
    const { clock, engine } = setup('camera');
    run(engine, clock, 1000);
    engine.setSensing('paused');
    run(engine, clock, 500, { face: false }); // late packets after stop: ignored
    const s = idle(engine, clock, 8000);
    expect(last(s).feedOpacity).toBe(1);
    expect(last(s).badges.backSoon).toBe(false);
    expect(last(s).pose.presence).toBe('present');
    expect(engine.debug?.sensing).toBe('paused');
    expect(engine.debug?.trace.summary).toContain('sensing paused');
  });

  it('switching from Camera to Auto holds the feed while the SDK warms up, then follows intents', () => {
    const { clock, engine } = setup('camera');
    run(engine, clock, 1000);
    engine.setSensing('paused');
    idle(engine, clock, 3000);
    engine.setMode('auto');
    engine.setSensing('live');
    // Several seconds without data (models loading): no drop, no "Away".
    let s = idle(engine, clock, 6000);
    expect(Math.min(...s.map((x) => x.feedOpacity))).toBe(1);
    expect(s.some((x) => x.badges.backSoon)).toBe(false);
    expect(engine.debug?.sensing).toBe('warming');
    // Data arrives: listening quietly → the listening level.
    s = run(engine, clock, 6000);
    expect(engine.debug?.sensing).toBe('live');
    expect(engine.debug?.intent.id).toBe('listening');
    expect(last(s).feedOpacity).toBeCloseTo(0.4, 2);
  });

  it('gives up warming after 10 s without data, so a really empty chair still shows "back soon"', () => {
    const { clock, engine } = setup('auto');
    engine.setSensing('paused');
    engine.setSensing('live');
    const s = idle(engine, clock, 16_000);
    expect(engine.debug?.sensing).toBe('live');
    expect(last(s).badges.backSoon).toBe(true);
  });

  it('a pause interrupts calibration and tuning; calibration restarts on resume', () => {
    const clock = new FakeClock(0);
    const engine = new StudioEngine(DEFAULT_SETTINGS, clock);
    const phases: string[] = [];
    const tuning: string[] = [];
    engine.events.on('calibration', (c) => phases.push(c.phase));
    engine.events.on('tuning', (t) => tuning.push(t.phase));
    engine.startCalibration(3000);
    engine.startTuning('listening', 3000);
    run(engine, clock, 1000);
    engine.setSensing('paused');
    expect(engine.calibrationStatus().phase).toBe('idle');
    expect(tuning).toEqual(['recording', 'cancelled']);
    engine.setSensing('live');
    expect(engine.calibrationStatus().phase).toBe('collecting');
    run(engine, clock, 4000);
    expect(phases.at(-1)).toBe('done');
  });
});

describe('StudioEngine (modes and overrides)', () => {
  it('cross-fades between modes', () => {
    const { clock, engine } = setup('character');
    let s = run(engine, clock, 500);
    expect(last(s).feedOpacity).toBe(0);
    engine.setMode('camera');
    s = run(engine, clock, 200);
    expect(last(s).feedOpacity).toBeGreaterThan(0);
    expect(last(s).feedOpacity).toBeLessThan(1);
    s = run(engine, clock, 400);
    expect(last(s).feedOpacity).toBe(1);
    expect(last(s).characterOpacity).toBe(0);
  });

  it('turning the dial switches to Blend; Hide me wins instantly; Pin freezes', () => {
    const { clock, engine } = setup('camera');
    run(engine, clock, 1000);
    engine.setDial(0.25);
    let s = run(engine, clock, 600);
    expect(engine.currentMode).toBe('blend');
    expect(last(s).feedOpacity).toBeCloseTo(0.25);
    engine.toggleHide();
    s = run(engine, clock, 34);
    expect(last(s).feedOpacity).toBe(0);
    expect(last(s).hidden).toBe(true);
    engine.toggleHide();
    run(engine, clock, 600);
    engine.setMode('auto');
    engine.togglePin();
    s = run(engine, clock, 6000, { talking: true });
    expect(last(s).feedOpacity).toBeCloseTo(0.25);
    expect(last(s).pinned).toBe(true);
    engine.togglePin();
    engine.toggleRaiseHand();
    engine.toggleBackSoon();
    s = run(engine, clock, 600);
    expect(last(s).badges.raisedHand).toBe(true);
    expect(last(s).badges.backSoon).toBe(true);
    expect(last(s).feedOpacity).toBe(0);
    engine.cycleMode();
    expect(engine.currentMode).toBe('character');
  });

  it('applies settings, test pattern and clears calibration', () => {
    const { clock, engine } = setup('auto');
    engine.applySettings(updateSettings(engine.currentSettings, { mode: 'camera', character: 'houseplant' }));
    engine.setTestPattern(true);
    const s = run(engine, clock, 600);
    expect(last(s).mode).toBe('camera');
    expect(last(s).character).toBe('houseplant');
    expect(last(s).testPattern).toBe(true);
    const events: string[] = [];
    engine.events.on('calibration', (c) => events.push(c.phase));
    engine.clearCalibration();
    expect(events).toEqual(['idle']);
    expect(engine.calibrationMs).toBe(15_000);
    expect(engine.state).not.toBeNull();
  });
});
