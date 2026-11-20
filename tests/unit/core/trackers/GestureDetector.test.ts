import { describe, expect, it } from 'vitest';
import { GestureDetector, type GestureEvent } from '../../../../src/core/trackers/GestureDetector';

/** Plays a piecewise-linear signal through the detector at 20 Hz and collects events. */
function play(d: GestureDetector, keys: [number, number][], step = 50): GestureEvent[] {
  const events: GestureEvent[] = [];
  for (let k = 0; k < keys.length - 1; k++) {
    const [t0, v0] = keys[k] as [number, number];
    const [t1, v1] = keys[k + 1] as [number, number];
    for (let t = t0; t < t1; t += step) {
      const e = d.update(v0 + ((v1 - v0) * (t - t0)) / (t1 - t0), t);
      if (e) events.push(e);
    }
  }
  return events;
}

describe('GestureDetector (nod)', () => {
  it('detects a quick dip that returns within 700 ms', () => {
    const d = new GestureDetector('nod', { direction: 'positive' });
    const ev = play(d, [
      [0, 0],
      [1000, 0],
      [1200, 0.08],
      [1450, 0],
      [2500, 0],
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.kind).toBe('nod');
    expect(ev[0]?.enthusiastic).toBe(false);
  });

  it('ignores small movements and upward excursions', () => {
    const d = new GestureDetector('nod', { direction: 'positive' });
    expect(
      play(d, [
        [0, 0],
        [1000, 0],
        [1200, 0.03],
        [1400, 0],
        [2000, -0.1],
        [2300, 0],
        [3000, 0],
      ]),
    ).toHaveLength(0);
  });

  it('ignores a slow look-down that does not return in time', () => {
    const d = new GestureDetector('nod', { direction: 'positive' });
    expect(
      play(d, [
        [0, 0],
        [1000, 0],
        [1100, 0.15],
        [2500, 0.15],
        [2700, 0],
        [4000, 0],
      ]),
    ).toHaveLength(0);
  });

  it('flags two nods within 1.5 s as enthusiastic', () => {
    const d = new GestureDetector('nod', { direction: 'positive' });
    const ev = play(d, [
      [0, 0],
      [1000, 0],
      [1150, 0.08],
      [1350, 0],
      [1500, 0.08],
      [1700, 0],
      [3000, 0],
    ]);
    expect(ev.map((e) => e.enthusiastic)).toEqual([false, true]);
  });

  it('tolerates slow posture drift', () => {
    const d = new GestureDetector('nod', { direction: 'positive' });
    expect(
      play(d, [
        [0, 0],
        [20_000, 0.3],
      ]),
    ).toHaveLength(0);
    const ev = play(d, [
      [20_000, 0.3],
      [20_200, 0.38],
      [20_400, 0.3],
      [21_000, 0.3],
    ]);
    expect(ev).toHaveLength(1);
  });

  it('re-anchors after a long hold', () => {
    const d = new GestureDetector('nod', { direction: 'positive' });
    play(d, [
      [0, 0],
      [500, 0],
      [600, 0.2],
      [5000, 0.2],
    ]);
    const ev = play(d, [
      [5000, 0.2],
      [5200, 0.28],
      [5400, 0.2],
      [6000, 0.2],
    ]);
    expect(ev).toHaveLength(1);
    d.reset();
  });
});

describe('GestureDetector (shake)', () => {
  it('detects excursions in both directions', () => {
    const d = new GestureDetector('shake', { direction: 'both' });
    const ev = play(d, [
      [0, 0],
      [1000, 0],
      [1150, -0.07],
      [1350, 0],
      [3000, 0],
    ]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.kind).toBe('shake');
  });
});
