import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  analyzeConflicts,
  conflictsFor,
  contains,
  intentBox,
  intersect,
} from '../../../../src/core/intent/conflicts';
import {
  IntentTracker,
  MATCH_ON,
  NONE_HOLD_MS,
  evaluateAll,
  evaluateIntent,
} from '../../../../src/core/intent/IntentMatcher';
import { EMPTY_CONTEXT, type SignalContext } from '../../../../src/core/intent/signals';
import { computeTuning } from '../../../../src/core/intent/tuning';
import {
  BUILT_IN_INTENTS,
  type IntentDef,
  actionProblem,
  defaultIntents,
  newCustomId,
  sanitizeIntents,
  sanitizeTuning,
} from '../../../../src/shared/intents';

const face: SignalContext = {
  ...EMPTY_CONTEXT,
  faceSeen: true,
  validation: 'ok',
  yaw: 0,
  pitch: 0,
  gaze: 0,
  mouthGap: 0,
  expressions: { neutral: 0.8 },
};

/** The first candidate in list order (what the tracker picks before holds). */
function winner(ctx: SignalContext, intents: readonly IntentDef[] = defaultIntents()): string | null {
  return evaluateAll(intents, ctx).find((e) => e.score >= MATCH_ON)?.id ?? null;
}

const custom = (over: Partial<IntentDef>): IntentDef => ({
  id: 'custom-x',
  name: 'Custom',
  builtIn: false,
  enabled: true,
  action: 'cover',
  conditions: [],
  holdMs: 700,
  ...over,
});

describe('built-in intents', () => {
  it.each([
    ['talking to the camera', { talkingShare: 0.9, mouthGap: 0.3 }, 'talkingInMeeting'],
    ['talking with the head turned', { talkingShare: 0.9, yaw: 0.4 }, 'talkingToOther'],
    ['listening quietly', {}, 'listening'],
    ['eating', { mouthGap: 0.45 }, 'eating'],
    ['eyes on another screen', { gaze: 0.3 }, 'lookingElsewhere'],
    ['someone stepping in', { multipleFacesShare: 0.7, talkingShare: 0.9 }, 'someoneElse'],
    [
      'no face',
      { faceSeen: false, validation: 'noFace' as const, yaw: null, gaze: null, mouthGap: null },
      'away',
    ],
  ])('%s → %s', (_name, over, expected) => {
    expect(winner({ ...face, ...over })).toBe(expected);
  });

  it('talking to the camera still reveals while validation flickers to "poor" (the reported bug)', () => {
    expect(winner({ ...face, talkingShare: 0.8, mouthGap: 0.35, yaw: 0.08, validation: 'poor' })).toBe(
      'talkingInMeeting',
    );
  });

  it('a face-based intent never matches without a face, even if its signals are ignored', () => {
    const e = evaluateIntent(custom({ conditions: [{ signal: 'gaze', states: ['onScreen'] }] }), {
      ...EMPTY_CONTEXT,
      gaze: null,
    });
    expect(e.score).toBe(0);
  });

  it('reports the condition that limited the score', () => {
    const e = evaluateIntent(BUILT_IN_INTENTS[5] as IntentDef, { ...face, talkingShare: 0.9, yaw: 0.4 });
    expect(e.limitedBy?.signal).toBe('headTurn');
    expect(e.candidate).toBe(false);
  });

  it('have no conflict errors or warnings among themselves', () => {
    const problems = analyzeConflicts(defaultIntents()).filter((c) => c.severity !== 'info');
    expect(problems).toEqual([]);
  });

  it('skip disabled intents', () => {
    const list = defaultIntents().map((i) => (i.id === 'talkingToOther' ? { ...i, enabled: false } : i));
    expect(winner({ ...face, talkingShare: 0.9, yaw: 0.4 }, list)).toBeNull();
  });
});

describe('IntentTracker', () => {
  const evals = (ctx: SignalContext) => evaluateAll(defaultIntents(), ctx);
  const hold = (id: string | null) =>
    id === null ? NONE_HOLD_MS : (BUILT_IN_INTENTS.find((i) => i.id === id)?.holdMs ?? 700);

  it('switches only after the newcomer held for its hold time', () => {
    const t = new IntentTracker();
    t.update(evals(face), hold, 0);
    expect(t.update(evals(face), hold, 700).current).toBe('listening');
    const talking = { ...face, talkingShare: 0.9 };
    const s = t.update(evals(talking), hold, 1_000);
    expect(s.current).toBe('listening');
    expect(s.pending?.id).toBe('talkingInMeeting');
    expect(t.update(evals(talking), hold, 1_700).current).toBe('talkingInMeeting');
  });

  it('keeps the current intent between MATCH_OFF and MATCH_ON (hysteresis)', () => {
    const t = new IntentTracker();
    const talking = { ...face, talkingShare: 0.9 };
    t.update(evals(talking), hold, 0);
    t.update(evals(talking), hold, 800);
    // talking share 0.5 → talking membership 0.75 … then 0.42 → 0.55 (below ON, above OFF).
    expect(t.update(evals({ ...face, talkingShare: 0.42 }), hold, 900).current).toBe('talkingInMeeting');
    expect(t.update(evals({ ...face, talkingShare: 0.42 }), hold, 3_000).current).toBe('talkingInMeeting');
  });

  it('falls back to none when nothing matches', () => {
    const t = new IntentTracker();
    const ambiguous = { ...face, talkingShare: 0.4 };
    t.update(evals(ambiguous), hold, 0);
    expect(t.update(evals(ambiguous), hold, NONE_HOLD_MS).current).toBeNull();
  });

  it('drops a removed intent at once', () => {
    const t = new IntentTracker();
    t.update(evals(face), hold, 0);
    t.update(evals(face), hold, 700);
    const without = defaultIntents().filter((i) => i.id !== 'listening');
    expect(t.update(evaluateAll(without, face), hold, 710).current).toBeNull();
  });
});

describe('conflict analysis', () => {
  const list = (...xs: IntentDef[]) => [...xs];
  const talkYes = { signal: 'talking' as const, states: ['yes'] };

  it('flags a lower intent shadowed by a broader one above it as an error', () => {
    const broad = custom({ id: 'custom-a', name: 'A', conditions: [talkYes] });
    const narrow = custom({
      id: 'custom-b',
      name: 'B',
      action: 'reveal',
      conditions: [talkYes, { signal: 'expression', states: ['happy'] }],
    });
    const [c] = analyzeConflicts(list(broad, narrow));
    expect(c?.severity).toBe('error');
    expect(c?.loser).toBe('custom-b');
    // In the other order it is a warning: the narrow one wins where they overlap.
    const [w] = analyzeConflicts(list(narrow, broad));
    expect(w?.severity).toBe('warning');
    expect(w?.message).toContain('expression = happy');
  });

  it('identical conditions are an error, same-action overlaps are info, disjoint is silent', () => {
    const a = custom({ id: 'custom-a', name: 'A', conditions: [talkYes] });
    expect(analyzeConflicts(list(a, { ...a, id: 'custom-b', name: 'B' }))[0]?.severity).toBe('error');
    const b = custom({ id: 'custom-b', name: 'B', conditions: [{ signal: 'mouth', states: ['open'] }] });
    expect(analyzeConflicts(list(a, b))[0]?.severity).toBe('info');
    const c = custom({ id: 'custom-c', name: 'C', conditions: [{ signal: 'talking', states: ['no'] }] });
    expect(analyzeConflicts(list(a, c))).toEqual([]);
  });

  it('a face-based intent never conflicts with "face in view = no"', () => {
    const away = BUILT_IN_INTENTS[0] as IntentDef;
    const smile = custom({ conditions: [{ signal: 'expression', states: ['happy'] }] });
    expect(conflictsFor('custom-x', [away, smile])).toEqual([]);
  });

  it('box algebra: intersection is contained in both (property)', () => {
    const signals = ['talking', 'mouth', 'headTurn'] as const;
    const states: Record<string, string[]> = {
      talking: ['yes', 'no'],
      mouth: ['open', 'closed'],
      headTurn: ['centred', 'left', 'right'],
    };
    const cond = fc
      .constantFrom(...signals)
      .chain((s) =>
        fc.subarray(states[s] as string[], { minLength: 1 }).map((st) => ({ signal: s, states: st })),
      );
    const intent = fc
      .uniqueArray(cond, { selector: (c) => c.signal, maxLength: 3 })
      .map((conditions) => ({ conditions }));
    fc.assert(
      fc.property(intent, intent, (a, b) => {
        const both = intersect(intentBox(a), intentBox(b));
        if (both) {
          expect(contains(intentBox(a), both)).toBe(true);
          expect(contains(intentBox(b), both)).toBe(true);
        }
      }),
    );
  });
});

describe('tuning', () => {
  it('lowers an active threshold to the user’s own movement and reports the match share', () => {
    const intent = BUILT_IN_INTENTS[2] as IntentDef; // talking + head turned
    const samples = Array.from({ length: 30 }, () => ({ ...face, talkingShare: 0.9, yaw: 0.12 }));
    expect(evaluateIntent(intent, samples[0] as SignalContext).candidate).toBe(false);
    const tuning = computeTuning(intent, samples, defaultIntents(), 1);
    expect(tuning.thresholds.headTurn).toBeCloseTo(0.072, 3);
    expect(tuning.matched).toBe(1);
    expect(evaluateIntent(intent, samples[0] as SignalContext, tuning).candidate).toBe(true);
  });

  it('widens a rest threshold and lists other intents that also matched', () => {
    const intent = BUILT_IN_INTENTS[5] as IntentDef; // talking in the meeting
    const samples = Array.from({ length: 30 }, (_, i) => ({
      ...face,
      talkingShare: 0.9,
      yaw: (i % 10) * 0.025,
    }));
    const tuning = computeTuning(intent, samples, defaultIntents(), 1);
    expect(tuning.thresholds.headTurn).toBeGreaterThan(0.2);
    expect(tuning.alsoMatched.talkingToOther).toBeGreaterThan(0);
  });
});

describe('intent settings validation', () => {
  it('restores missing built-ins, keeps the user’s order, action and enabled flags', () => {
    const stored = [
      { id: 'listening', action: 'cover', enabled: false },
      {
        id: 'custom-wave',
        name: 'Waving',
        action: 'reveal',
        conditions: [{ signal: 'gesture', states: ['shaking'] }],
      },
    ];
    const out = sanitizeIntents(stored);
    expect(out.map((i) => i.id).slice(0, 2)).toEqual(['listening', 'custom-wave']);
    expect(out[0]).toMatchObject({ action: 'cover', enabled: false, builtIn: true });
    // Built-in conditions are fixed by the app, not by the file.
    expect(out[0]?.conditions).toEqual(BUILT_IN_INTENTS[6]?.conditions);
    expect(out).toHaveLength(BUILT_IN_INTENTS.length + 1);
  });

  it('drops invalid custom intents and conditions', () => {
    const out = sanitizeIntents([
      { id: 'evil', name: 'x', conditions: [{ signal: 'talking', states: ['yes'] }] },
      { id: 'custom-empty', name: 'Empty', conditions: [{ signal: 'nope', states: ['x'] }] },
      { id: 'custom-all', name: 'All', conditions: [{ signal: 'talking', states: ['yes', 'no'] }] },
      {
        id: 'custom-ok',
        name: '  Fine  ',
        holdMs: 99_999,
        conditions: [{ signal: 'mouth', states: ['open', 'bogus'] }],
      },
    ]);
    const customs = out.filter((i) => !i.builtIn);
    expect(customs).toHaveLength(1);
    expect(customs[0]).toMatchObject({
      name: 'Fine',
      holdMs: 3_000,
      conditions: [{ signal: 'mouth', states: ['open'] }],
    });
  });

  it('never lets a body-signal intent reveal or blend', () => {
    const out = sanitizeIntents([
      {
        id: 'custom-pulse',
        name: 'Stressed',
        action: 'reveal',
        conditions: [{ signal: 'pulse', states: ['raised'] }],
      },
    ]);
    expect(out.find((i) => i.id === 'custom-pulse')?.action).toBe('cover');
    expect(actionProblem({ conditions: [{ signal: 'pulse', states: ['raised'] }] }, 'blend')).toMatch(
      /only hide/,
    );
    expect(actionProblem({ conditions: [{ signal: 'pulse', states: ['raised'] }] }, 'cover')).toBeNull();
  });

  it('caps custom intents and makes unique ids', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `custom-n${i}`,
      name: `N${i}`,
      conditions: [{ signal: 'talking', states: ['yes'] }],
    }));
    expect(sanitizeIntents(many).filter((i) => !i.builtIn)).toHaveLength(12);
    expect(newCustomId('Hand up!', new Set(['custom-hand-up']))).toBe('custom-hand-up-2');
  });

  it('sanitizes tuning against the intents and threshold ranges', () => {
    const intents = defaultIntents();
    const out = sanitizeTuning(
      {
        listening: { thresholds: { headTurn: 99, bogus: 1, talking: 0.5 }, matched: 2 },
        gone: { thresholds: {} },
      },
      intents,
    );
    expect(Object.keys(out)).toEqual(['listening']);
    expect(out.listening?.thresholds).toEqual({ headTurn: 0.6 });
    expect(out.listening?.matched).toBe(1);
  });
});
