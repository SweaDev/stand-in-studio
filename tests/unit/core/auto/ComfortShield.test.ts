import { describe, expect, it } from 'vitest';
import { ComfortShield } from '../../../../src/core/auto/ComfortShield';

const pulse = (value: number, confident = true) => ({ pulseRate: { value, confident } });
const breathing = (value: number, confident = true) => ({ breathingRate: { value, confident } });

/** Feeds a reading every 3 s from `from` to `to`. */
function feed(s: ComfortShield, from: number, to: number, input: object): number | null {
  let cap: number | null = null;
  for (let t = from; t <= to; t += 3000) cap = s.update(input, t);
  return cap;
}

describe('ComfortShield', () => {
  it('does nothing while disabled', () => {
    const s = new ComfortShield();
    expect(s.update(pulse(150), 0)).toBeNull();
    expect(s.isEnabled).toBe(false);
  });

  it('learns a baseline over 30 s before it can trigger', () => {
    const s = new ComfortShield();
    s.setEnabled(true, 0);
    expect(feed(s, 0, 27_000, pulse(70))).toBeNull();
    expect(s.ready).toBe(false);
    s.update(pulse(70), 30_000);
    expect(s.ready).toBe(true);
  });

  it('caps at 15% when pulse is 12+ bpm above baseline, recovers after 20 s near baseline', () => {
    const s = new ComfortShield();
    s.setEnabled(true, 0);
    feed(s, 0, 30_000, pulse(70));
    expect(s.update(pulse(80), 33_000)).toBeNull();
    expect(s.update(pulse(83), 36_000)).toBe(0.15);
    expect(s.active).toBe(true);
    expect(s.update(pulse(78), 39_000)).toBe(0.15); // between near and trigger: stays
    expect(feed(s, 42_000, 60_000, pulse(74))).toBe(0.15);
    expect(s.update(pulse(74), 62_000)).toBeNull();
    expect(s.active).toBe(false);
  });

  it('triggers on breathing rate 5+/min above baseline', () => {
    const s = new ComfortShield();
    s.setEnabled(true, 0);
    feed(s, 0, 30_000, breathing(14));
    expect(s.update(breathing(19.5), 33_000)).toBe(0.15);
  });

  it('ignores readings without confidence', () => {
    const s = new ComfortShield();
    s.setEnabled(true, 0);
    feed(s, 0, 30_000, pulse(70));
    expect(s.update(pulse(120, false), 33_000)).toBeNull();
  });

  it('resets its baseline when toggled and supports a simulated trigger', () => {
    const s = new ComfortShield();
    s.simulateTrigger(0);
    expect(s.active).toBe(false);
    s.setEnabled(true, 0);
    s.simulateTrigger(100);
    expect(s.update({}, 200)).toBe(0.15);
    expect(s.update({}, 20_300)).toBeNull();
    s.setEnabled(false, 30_000);
    expect(s.ready).toBe(false);
    s.setEnabled(false, 30_001);
    expect(s.update(pulse(150), 40_000)).toBeNull();
  });

  it('releases when readings go stale', () => {
    const s = new ComfortShield();
    s.setEnabled(true, 0);
    feed(s, 0, 30_000, pulse(70));
    s.update(pulse(90), 31_000);
    expect(s.update({}, 50_000)).toBe(0.15);
    expect(s.update({}, 62_000)).toBe(0.15); // stale from 61 s: near counting starts
    expect(s.update({}, 82_000)).toBeNull();
  });
});
