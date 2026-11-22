import { type SignalId, isSignalId, signalInfo } from './signalCatalog';

/**
 * What the character does while an intent is active:
 * - reveal: your feed at your max, the character steps out of the way;
 * - blend: your feed at your listening level with the character over it;
 * - cover: the character fully covers you;
 * - backSoon: the character covers you and shows "back soon".
 */
export type IntentAction = 'reveal' | 'blend' | 'cover' | 'backSoon';
export const INTENT_ACTIONS: readonly IntentAction[] = ['reveal', 'blend', 'cover', 'backSoon'];

export const ACTION_LABELS: Readonly<Record<IntentAction, string>> = Object.freeze({
  reveal: 'Reveal me',
  blend: 'Blend',
  cover: 'Cover me',
  backSoon: 'Back soon',
});

export const ACTION_HINTS: Readonly<Record<IntentAction, string>> = Object.freeze({
  reveal: 'Your camera at your max; the character hides.',
  blend: 'Your camera at your listening level, the character over it.',
  cover: 'The character fully covers you.',
  backSoon: 'The character covers you and shows “back soon”.',
});

/** Actions that show more of you than the character alone. */
export function raises(action: IntentAction): boolean {
  return action === 'reveal' || action === 'blend';
}

/** "The signal is in one of these states." */
export interface IntentCondition {
  signal: SignalId;
  states: string[];
}

/**
 * An intent: all conditions hold (AND) → its action applies. Intents are checked in list
 * order; the first one that matches wins.
 */
export interface IntentDef {
  id: string;
  name: string;
  builtIn: boolean;
  enabled: boolean;
  action: IntentAction;
  conditions: IntentCondition[];
  /** How long it must match before it takes over (ms). */
  holdMs: number;
}

/** Per-intent thresholds learned from a short recording of the user acting it out. */
export interface IntentTuning {
  thresholds: Partial<Record<SignalId, number>>;
  /** Share of the recording in which the intent matched (0..1). */
  matched: number;
  /** Other intents that also matched during the recording, by id → share. */
  alsoMatched: Record<string, number>;
  recordedAt: number;
}

export const HOLD_MIN_MS = 300;
export const HOLD_MAX_MS = 3_000;
export const DEFAULT_HOLD_MS = 700;
export const MAX_CUSTOM_INTENTS = 12;
export const MAX_CONDITIONS = 6;
export const MAX_INTENT_NAME = 40;

const c = (signal: SignalId, ...states: string[]): IntentCondition => ({ signal, states });

/** Built-in intents, in their default priority order. */
export const BUILT_IN_INTENTS: readonly IntentDef[] = Object.freeze([
  {
    id: 'away',
    name: 'Away from the camera',
    builtIn: true,
    enabled: true,
    action: 'backSoon',
    conditions: [c('faceInView', 'no')],
    holdMs: 3_000,
  },
  {
    id: 'someoneElse',
    name: 'Someone else in view',
    builtIn: true,
    enabled: true,
    action: 'cover',
    conditions: [c('people', 'more')],
    holdMs: 700,
  },
  {
    id: 'talkingToOther',
    name: 'Talking to someone else',
    builtIn: true,
    enabled: true,
    action: 'cover',
    conditions: [c('talking', 'yes'), c('headTurn', 'left', 'right')],
    holdMs: 700,
  },
  {
    id: 'lookingElsewhere',
    name: 'Looking elsewhere',
    builtIn: true,
    enabled: true,
    action: 'cover',
    conditions: [c('talking', 'no'), c('gaze', 'away')],
    holdMs: 1_500,
  },
  {
    id: 'eating',
    name: 'Eating or yawning',
    builtIn: true,
    enabled: true,
    action: 'cover',
    conditions: [c('talking', 'no'), c('mouth', 'open')],
    holdMs: 1_500,
  },
  {
    id: 'talkingInMeeting',
    name: 'Talking in the meeting',
    builtIn: true,
    enabled: true,
    action: 'reveal',
    conditions: [c('talking', 'yes'), c('headTurn', 'centred'), c('gaze', 'onScreen'), c('people', 'justMe')],
    holdMs: 700,
  },
  {
    id: 'listening',
    name: 'Listening to others',
    builtIn: true,
    enabled: true,
    action: 'blend',
    conditions: [
      c('talking', 'no'),
      c('headTurn', 'centred'),
      c('gaze', 'onScreen'),
      c('mouth', 'closed'),
      c('people', 'justMe'),
    ],
    holdMs: 700,
  },
] as IntentDef[]);

const BUILT_IN_BY_ID = new Map(BUILT_IN_INTENTS.map((i) => [i.id, i]));

export function builtInIntent(id: string): IntentDef | undefined {
  return BUILT_IN_BY_ID.get(id);
}

/** A fresh copy of the built-in list (settings defaults). */
export function defaultIntents(): IntentDef[] {
  return BUILT_IN_INTENTS.map((i) => ({
    ...i,
    conditions: i.conditions.map((x) => ({ ...x, states: [...x.states] })),
  }));
}

/** True when any condition uses a body (cardio / breathing-rate) signal. */
export function usesBodySignals(intent: Pick<IntentDef, 'conditions'>): boolean {
  return intent.conditions.some((x) => signalInfo(x.signal).body);
}

/** Why an action is not allowed for these conditions, or null. */
export function actionProblem(intent: Pick<IntentDef, 'conditions'>, action: IntentAction): string | null {
  if (raises(action) && usesBodySignals(intent))
    return 'Body signals (pulse, breathing rate) can only hide you, never reveal you.';
  return null;
}

const CUSTOM_ID = /^custom-[a-z0-9-]{1,40}$/;

export function newCustomId(name: string, taken: ReadonlySet<string>): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'intent';
  let id = `custom-${slug}`;
  for (let n = 2; taken.has(id); n++) id = `custom-${slug}-${n}`;
  return id;
}

function sanitizeConditions(raw: unknown): IntentCondition[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<SignalId>();
  const out: IntentCondition[] = [];
  for (const item of raw) {
    const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    if (!isSignalId(r.signal) || seen.has(r.signal)) continue;
    const allowed = signalInfo(r.signal).states.map((x) => x.id);
    const states = Array.isArray(r.states)
      ? allowed.filter((id) => (r.states as unknown[]).includes(id))
      : [];
    // A condition allowing no state or every state says nothing.
    if (states.length === 0 || states.length === allowed.length) continue;
    seen.add(r.signal);
    out.push({ signal: r.signal, states });
    if (out.length >= MAX_CONDITIONS) break;
  }
  return out;
}

function sanitizeAction(v: unknown, fallback: IntentAction): IntentAction {
  return typeof v === 'string' && (INTENT_ACTIONS as readonly string[]).includes(v)
    ? (v as IntentAction)
    : fallback;
}

function clampHold(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round(Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, v)))
    : fallback;
}

/**
 * Validates a stored intent list. Built-ins keep their fixed conditions (only action,
 * enabled and position are the user's); custom intents are checked against the signal
 * catalogue. Missing built-ins are appended in their default order.
 */
export function sanitizeIntents(raw: unknown): IntentDef[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: IntentDef[] = [];
  const ids = new Set<string>();
  let customs = 0;
  for (const item of list) {
    const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    if (typeof r.id !== 'string' || ids.has(r.id)) continue;
    const base = builtInIntent(r.id);
    if (base) {
      const action = sanitizeAction(r.action, base.action);
      out.push({
        ...base,
        conditions: base.conditions.map((x) => ({ ...x, states: [...x.states] })),
        enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
        action: actionProblem(base, action) ? base.action : action,
      });
      ids.add(r.id);
      continue;
    }
    if (!CUSTOM_ID.test(r.id) || customs >= MAX_CUSTOM_INTENTS) continue;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, MAX_INTENT_NAME) : '';
    const conditions = sanitizeConditions(r.conditions);
    if (!name || conditions.length === 0) continue;
    const action = sanitizeAction(r.action, 'cover');
    out.push({
      id: r.id,
      name,
      builtIn: false,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
      action: actionProblem({ conditions }, action) ? 'cover' : action,
      conditions,
      holdMs: clampHold(r.holdMs, DEFAULT_HOLD_MS),
    });
    ids.add(r.id);
    customs++;
  }
  // Built-ins missing from the stored list (e.g. added by an update) go at the end.
  for (const b of BUILT_IN_INTENTS) {
    if (ids.has(b.id)) continue;
    out.push({ ...b, conditions: b.conditions.map((x) => ({ ...x, states: [...x.states] })) });
  }
  return out;
}

/** Validates stored tuning; drops entries for unknown intents and out-of-range values. */
export function sanitizeTuning(raw: unknown, intents: readonly IntentDef[]): Record<string, IntentTuning> {
  const out: Record<string, IntentTuning> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const ids = new Set(intents.map((i) => i.id));
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ids.has(id) || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const thresholds: Partial<Record<SignalId, number>> = {};
    const th =
      r.thresholds && typeof r.thresholds === 'object' ? (r.thresholds as Record<string, unknown>) : {};
    for (const [sid, value] of Object.entries(th)) {
      if (!isSignalId(sid)) continue;
      const t = signalInfo(sid).threshold;
      if (!t || typeof value !== 'number' || !Number.isFinite(value)) continue;
      thresholds[sid] = Math.min(t.max, Math.max(t.min, value));
    }
    const share = (x: unknown) =>
      typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
    const also: Record<string, number> = {};
    if (r.alsoMatched && typeof r.alsoMatched === 'object')
      for (const [k, x] of Object.entries(r.alsoMatched as Record<string, unknown>))
        if (ids.has(k)) also[k] = share(x);
    out[id] = {
      thresholds,
      matched: share(r.matched),
      alsoMatched: also,
      recordedAt: typeof r.recordedAt === 'number' && Number.isFinite(r.recordedAt) ? r.recordedAt : 0,
    };
  }
  return out;
}
