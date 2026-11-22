import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IntentPolicy, feedFor } from '../../../../src/core/auto/IntentPolicy';
import { INTENT_ACTIONS, type IntentAction } from '../../../../src/shared/intents';

const input = (over: Partial<Parameters<IntentPolicy['update']>[0]> = {}) => ({
  now: 0,
  action: 'blend' as IntentAction,
  max: 1,
  listening: 0.4,
  shieldCap: null,
  ...over,
});

describe('IntentPolicy', () => {
  it('maps actions to feed levels', () => {
    expect(feedFor('reveal', 0.8, 0.4)).toBe(0.8);
    expect(feedFor('blend', 0.3, 0.4)).toBe(0.3);
    expect(feedFor('cover', 1, 0.4)).toBe(0);
    expect(feedFor('backSoon', 1, 0.4)).toBe(0);
  });

  it('covers at once but waits 2 s before revealing; the character hides only when revealed', () => {
    const p = new IntentPolicy(0.4);
    expect(p.update(input({ now: 0, action: 'cover' })).target).toBe(0);
    let d = p.update(input({ now: 100, action: 'reveal' }));
    expect(d.target).toBe(0);
    expect(d.character).toBe(1);
    expect(d.raisePendingMs).toBe(0);
    d = p.update(input({ now: 2_099, action: 'reveal' }));
    expect(d.target).toBe(0);
    d = p.update(input({ now: 2_100, action: 'reveal' }));
    expect(d).toMatchObject({ target: 1, character: 0, action: 'reveal', raisePendingMs: null });
  });

  it('the Comfort shield caps a reveal and keeps the character on stage', () => {
    const p = new IntentPolicy(0);
    p.update(input({ now: 0, action: 'reveal', shieldCap: 0.15 }));
    const d = p.update(input({ now: 2_000, action: 'reveal', shieldCap: 0.15 }));
    expect(d).toMatchObject({ target: 0.15, character: 1, capped: true });
  });

  it('a lower max applies immediately', () => {
    const p = new IntentPolicy(1);
    expect(p.update(input({ action: 'reveal', max: 0.5 })).target).toBe(0.5);
  });

  it('invariant: never above max or the shield cap, and never raises without the hold (property)', () => {
    const step = fc.record({
      dt: fc.integer({ min: 0, max: 1_500 }),
      action: fc.constantFrom(...INTENT_ACTIONS),
      max: fc.double({ min: 0, max: 1, noNaN: true }),
      listening: fc.double({ min: 0, max: 1, noNaN: true }),
      cap: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
    });
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 40 }), (steps) => {
        const p = new IntentPolicy(0.4);
        let now = 0;
        let prev = 0.4;
        let raiseSince: number | null = null;
        for (const s of steps) {
          now += s.dt;
          const d = p.update({ now, action: s.action, max: s.max, listening: s.listening, shieldCap: s.cap });
          expect(d.target).toBeLessThanOrEqual(s.max + 1e-9);
          if (s.cap !== null) expect(d.target).toBeLessThanOrEqual(s.cap + 1e-9);
          if (d.target > prev + 1e-3) {
            expect(raiseSince).not.toBeNull();
            expect(now - (raiseSince as number)).toBeGreaterThanOrEqual(2_000);
          }
          raiseSince = d.raisePendingMs !== null ? now - d.raisePendingMs : null;
          if (d.character === 0) expect(d.action).toBe('reveal');
          prev = d.target;
        }
      }),
    );
  });
});
