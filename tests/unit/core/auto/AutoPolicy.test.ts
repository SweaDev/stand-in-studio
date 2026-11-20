import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AutoPolicy, candidateTarget } from '../../../../src/core/auto/AutoPolicy';
import type { AutoContext } from '../../../../src/core/auto/rules';

const listening: AutoContext = {
  now: 0,
  faceOk: true,
  facingScreen: true,
  talkingSustained: false,
  talking: false,
  lookingAwayMs: 0,
  eatingMs: 0,
  poorFramingMs: 0,
  noFaceMs: 0,
  shieldCap: null,
  max: 1,
  listening: 0.4,
};

const ctx = (o: Partial<AutoContext>): AutoContext => ({ ...listening, ...o });

describe('candidateTarget', () => {
  it('maps each situation to its target', () => {
    expect(candidateTarget(listening, 0.4).candidate).toBe(0.4);
    expect(candidateTarget(ctx({ talking: true, talkingSustained: true }), 0.4).candidate).toBe(1);
    expect(candidateTarget(ctx({ talking: true, talkingSustained: true, max: 0.7 }), 0.4).candidate).toBe(
      0.7,
    );
    expect(candidateTarget(ctx({ lookingAwayMs: 2100, facingScreen: false }), 0.4)).toMatchObject({
      candidate: 0,
      immediate: true,
      reasons: ['lookAway'],
    });
    expect(candidateTarget(ctx({ eatingMs: 1600 }), 0.4)).toMatchObject({ candidate: 0, immediate: false });
    expect(candidateTarget(ctx({ faceOk: false, poorFramingMs: 600 }), 0.4).candidate).toBe(0);
    expect(candidateTarget(ctx({ faceOk: false, noFaceMs: 3100 }), 0.4)).toMatchObject({
      candidate: 0,
      immediate: true,
    });
    expect(
      candidateTarget(ctx({ talking: true, talkingSustained: true, shieldCap: 0.15 }), 0.4),
    ).toMatchObject({ candidate: 0.15, reasons: ['comfortShield'] });
  });

  it('keeps the current target when no raising rule applies', () => {
    // Talking but not yet sustained: neither talking nor listening applies.
    expect(candidateTarget(ctx({ talking: true }), 0.4).candidate).toBe(0.4);
    // Turning a little without crossing the look-away timer.
    expect(candidateTarget(ctx({ facingScreen: false, lookingAwayMs: 500 }), 0.8).candidate).toBe(0.8);
  });

  it('never lets a cap raise the target', () => {
    expect(candidateTarget(ctx({ facingScreen: false, shieldCap: 0.15 }), 0.05).candidate).toBe(0.05);
  });
});

const arbCtx = fc.record({
  now: fc.constant(0),
  faceOk: fc.boolean(),
  facingScreen: fc.boolean(),
  talkingSustained: fc.boolean(),
  talking: fc.boolean(),
  lookingAwayMs: fc.integer({ min: 0, max: 10_000 }),
  eatingMs: fc.integer({ min: 0, max: 10_000 }),
  poorFramingMs: fc.integer({ min: 0, max: 10_000 }),
  noFaceMs: fc.integer({ min: 0, max: 10_000 }),
  shieldCap: fc.option(fc.constant(0.15), { nil: null }),
  max: fc.double({ min: 0, max: 1, noNaN: true }),
  listening: fc.double({ min: 0, max: 1, noNaN: true }),
});
const arbLevel = fc.double({ min: 0, max: 1, noNaN: true });

describe('Auto invariant (property)', () => {
  it('the candidate never exceeds the user max', () => {
    fc.assert(
      fc.property(arbCtx, arbLevel, (c, committed) => {
        const { candidate } = candidateTarget(c, committed);
        expect(candidate).toBeGreaterThanOrEqual(0);
        expect(candidate).toBeLessThanOrEqual(c.max + 1e-12);
      }),
    );
  });

  it('body and situation triggers can only lower the target', () => {
    fc.assert(
      fc.property(
        arbCtx,
        arbLevel,
        fc.record({
          lookingAwayMs: fc.integer({ min: 0, max: 10_000 }),
          eatingMs: fc.integer({ min: 0, max: 10_000 }),
          poorFramingMs: fc.integer({ min: 0, max: 10_000 }),
          noFaceMs: fc.integer({ min: 0, max: 10_000 }),
          shield: fc.boolean(),
        }),
        (c, committed, more) => {
          const worse: AutoContext = {
            ...c,
            lookingAwayMs: c.lookingAwayMs + more.lookingAwayMs,
            eatingMs: c.eatingMs + more.eatingMs,
            poorFramingMs: c.poorFramingMs + more.poorFramingMs,
            noFaceMs: c.noFaceMs + more.noFaceMs,
            shieldCap: more.shield ? 0.15 : c.shieldCap,
          };
          expect(candidateTarget(worse, committed).candidate).toBeLessThanOrEqual(
            candidateTarget(c, committed).candidate + 1e-12,
          );
        },
      ),
    );
  });

  it('the target only rises above the current level through talking or listening', () => {
    fc.assert(
      fc.property(arbCtx, arbLevel, (c, committed) => {
        const r = candidateTarget(c, committed);
        if (r.candidate > Math.min(committed, c.max) + 1e-12) {
          expect(r.reasons.every((x) => x === 'talking' || x === 'listening')).toBe(true);
          expect(c.faceOk && c.facingScreen).toBe(true);
        }
      }),
    );
  });

  it('the policy target stays within [0, max] over random sequences', () => {
    fc.assert(
      fc.property(fc.array(arbCtx, { maxLength: 40 }), arbLevel, (seq, initial) => {
        const p = new AutoPolicy(initial);
        let now = 0;
        for (const c of seq) {
          now += 700;
          const d = p.update({ ...c, now });
          expect(d.target).toBeGreaterThanOrEqual(0);
          expect(d.target).toBeLessThanOrEqual(c.max + 1e-12);
        }
      }),
    );
  });
});

describe('AutoPolicy', () => {
  it('waits for a new target to hold 2 s before committing', () => {
    const p = new AutoPolicy(0.4);
    const talk = { talking: true, talkingSustained: true };
    expect(p.update(ctx({ ...talk, now: 0 })).target).toBe(0.4);
    expect(p.update(ctx({ ...talk, now: 1999 })).target).toBe(0.4);
    const d = p.update(ctx({ ...talk, now: 2000 }));
    expect(d.target).toBe(1);
    expect(d.reasons).toEqual(['talking']);
  });

  it('restarts the hold when the candidate changes', () => {
    const p = new AutoPolicy(0.4);
    p.update(ctx({ talking: true, talkingSustained: true, now: 0 }));
    p.update(ctx({ eatingMs: 1600, now: 1500 }));
    expect(p.update(ctx({ eatingMs: 3000, now: 3000 })).target).toBe(0.4);
    expect(p.update(ctx({ eatingMs: 3600, now: 3500 })).target).toBe(0);
  });

  it('drops immediately for no face and looking away', () => {
    const p = new AutoPolicy(1);
    expect(p.update(ctx({ faceOk: false, noFaceMs: 3001, now: 10 })).target).toBe(0);
    const q = new AutoPolicy(1);
    expect(q.update(ctx({ facingScreen: false, lookingAwayMs: 2001, now: 10 })).target).toBe(0);
  });

  it('cancels a pending change when the candidate returns', () => {
    const p = new AutoPolicy(0.4);
    p.update(ctx({ eatingMs: 1600, now: 0 }));
    p.update(ctx({ now: 1000 }));
    expect(p.update(ctx({ eatingMs: 1600, now: 2500 })).target).toBe(0.4);
  });

  it('applies a lowered max at once', () => {
    const p = new AutoPolicy(1);
    expect(p.update(ctx({ max: 0.5, listening: 0.4, now: 0 })).target).toBe(0.5);
    p.reset(0.2);
    expect(p.target).toBe(0.2);
  });
});
