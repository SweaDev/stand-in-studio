import { describe, expect, it } from 'vitest';
import { SmileDetector } from '../../../../src/core/trackers/SmileDetector';
import { TalkTracker } from '../../../../src/core/trackers/TalkTracker';
import { ValidationFilter } from '../../../../src/core/trackers/ValidationFilter';
import { PresenceTracker } from '../../../../src/core/trackers/PresenceTracker';

describe('SmileDetector', () => {
  it('turns on above rest + 0.25 after 400 ms and off below rest + 0.15', () => {
    const s = new SmileDetector();
    const rest = 0.2;
    expect(s.update(0.5, rest, 0)).toBe(false);
    expect(s.update(0.5, rest, 399)).toBe(false);
    expect(s.update(0.5, rest, 400)).toBe(true);
    expect(s.update(0.4, rest, 500)).toBe(true); // between thresholds
    expect(s.update(0.3, rest, 600)).toBe(false);
  });

  it('is relative to the resting level', () => {
    const s = new SmileDetector();
    s.update(0.5, 0.4, 0);
    expect(s.update(0.5, 0.4, 1000)).toBe(false);
  });

  it('glows smoothly while smiling and fades after', () => {
    const s = new SmileDetector();
    for (let t = 0; t <= 2000; t += 50) s.update(0.9, 0.1, t);
    let g = 0;
    for (let t = 0; t <= 2000; t += 50) g = s.glow(t);
    expect(g).toBeGreaterThan(0.9);
    s.update(0, 0.1, 2100);
    for (let t = 2100; t <= 4000; t += 50) g = s.glow(t);
    expect(g).toBeLessThan(0.01);
    expect(s.update(undefined, 0.1, 4100)).toBe(false);
    s.force(true);
    expect(s.smiling).toBe(true);
    s.reset();
    expect(s.smiling).toBe(false);
  });
});

describe('TalkTracker', () => {
  it('debounces gaps between words and measures sustained talking', () => {
    const t = new TalkTracker(600);
    t.update(true, 0);
    t.update(false, 300);
    t.update(true, 700); // 400 ms gap < 600 ms release
    expect(t.isTalking(800)).toBe(true);
    expect(t.sustainedMs(1100)).toBe(1100);
    expect(t.isSustained(1000)).toBe(false);
    expect(t.isSustained(1001)).toBe(true);
    t.update(true, 1300);
    t.update(false, 1400);
    expect(t.isTalking(1400)).toBe(true);
    expect(t.isTalking(1901)).toBe(false);
    expect(t.sustainedMs(2000)).toBe(0);
    expect(t.sinceLastTalk(2000)).toBe(700);
    t.reset();
    expect(t.isTalking(2000)).toBe(false);
  });

  it('treats missing samples like silence', () => {
    const t = new TalkTracker(100);
    t.update(true, 0);
    t.update(undefined, 200);
    expect(t.isTalking(200)).toBe(false);
  });
});

describe('ValidationFilter', () => {
  it('stays ok when non-OK codes flicker on good input', () => {
    const f = new ValidationFilter();
    // ~1 in 3 frames reports a non-OK code, as measured on a good clip.
    for (let i = 0; i < 90; i++) f.push(i % 3 === 0 ? 'poor' : 'ok', i * 33);
    expect(f.state).toBe('ok');
  });

  it('reports poor or noFace when they dominate', () => {
    const f = new ValidationFilter();
    for (let i = 0; i < 60; i++) f.push(i % 5 === 0 ? 'ok' : 'poor', i * 33);
    expect(f.state).toBe('poor');
    for (let i = 60; i < 120; i++) f.push('noFace', i * 33);
    expect(f.state).toBe('noFace');
  });

  it('falls back to noFace when validation stops arriving', () => {
    const f = new ValidationFilter();
    f.push('ok', 0);
    expect(f.evaluate(100)).toBe('ok');
    expect(f.evaluate(5000)).toBe('noFace');
    f.reset();
    expect(f.state).toBe('noFace');
  });
});

describe('PresenceTracker', () => {
  it('goes away after 3 s with no face and wakes after 1 s with one', () => {
    const p = new PresenceTracker();
    expect(p.update('ok', 0)).toBe('present');
    expect(p.wakeProgress(0)).toBe(1);
    expect(p.update('noFace', 1000)).toBe('present');
    expect(p.update('noFace', 3999)).toBe('present');
    expect(p.update('noFace', 4000)).toBe('away');
    expect(p.wakeProgress(4000)).toBe(0);
    expect(p.update('ok', 5000)).toBe('away');
    expect(p.update('ok', 6000)).toBe('waking');
    expect(p.wakeProgress(6600)).toBeCloseTo(0.5);
    expect(p.update('ok', 7200)).toBe('present');
  });

  it('a face rated poor (cropped, too close, dim) still counts as present', () => {
    const p = new PresenceTracker();
    p.update('ok', 0);
    for (let t = 100; t <= 10_000; t += 100) expect(p.update('poor', t)).toBe('present');
    p.reset('away');
    p.update('poor', 20_000);
    expect(p.update('poor', 21_000)).toBe('waking');
  });

  it('falls back to away when the face is lost again while waking', () => {
    const p = new PresenceTracker();
    p.reset('away');
    p.update('ok', 0);
    expect(p.update('ok', 1000)).toBe('waking');
    p.update('noFace', 1100);
    expect(p.update('noFace', 4100)).toBe('away');
    expect(p.presence).toBe('away');
  });
});
