import { ACTION_LABELS, type IntentDef } from '../../shared/intents';
import { type SignalId, signalInfo } from '../../shared/signalCatalog';
import { describeCondition } from './IntentMatcher';

export type ConflictSeverity = 'error' | 'warning' | 'info';

export interface IntentConflict {
  severity: ConflictSeverity;
  /** The intent higher in the list (wins where both match). */
  winner: string;
  /** The intent lower in the list. */
  loser: string;
  /** Plain-language description of when both match. */
  overlap: string;
  message: string;
}

type Box = Map<SignalId, Set<string>>;

/**
 * An intent as a box in the discrete signal-state space: each constrained signal is limited
 * to its allowed states, every other signal is free. Face-based conditions imply the face is
 * in view.
 */
export function intentBox(def: Pick<IntentDef, 'conditions'>): Box {
  const box: Box = new Map();
  for (const c of def.conditions) box.set(c.signal, new Set(c.states));
  const impliesFace = def.conditions.some((c) => {
    const info = signalInfo(c.signal);
    return (
      info.needsFace || (info.faceStates !== undefined && c.states.every((s) => info.faceStates?.includes(s)))
    );
  });
  if (impliesFace) {
    const f = box.get('faceInView');
    box.set('faceInView', new Set(f ? [...f].filter((s) => s === 'yes') : ['yes']));
  }
  return box;
}

const allStates = (id: SignalId) => new Set(signalInfo(id).states.map((s) => s.id));
const statesOf = (box: Box, id: SignalId) => box.get(id) ?? allStates(id);

/** The region where both boxes match, or null when they can never match together. */
export function intersect(a: Box, b: Box): Box | null {
  const out: Box = new Map();
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const sa = statesOf(a, id);
    const both = new Set([...statesOf(b, id)].filter((s) => sa.has(s)));
    if (both.size === 0) return null;
    out.set(id, both);
  }
  return out;
}

/** True when every point of `inner` is also in `outer`. */
export function contains(outer: Box, inner: Box): boolean {
  for (const [id, states] of outer) {
    const si = statesOf(inner, id);
    for (const s of si) if (!states.has(s)) return false;
  }
  return true;
}

export function describeBox(box: Box): string {
  const parts: string[] = [];
  for (const [id, states] of box) {
    if (id === 'faceInView' && states.size === 1 && states.has('yes')) continue;
    if (states.size === allStates(id).size) continue;
    parts.push(describeCondition(id, [...states]));
  }
  return parts.length > 0 ? parts.join(', ') : 'always';
}

/**
 * Static conflict analysis over the enabled intents in priority order. Intents are checked
 * top to bottom and the first match wins, so:
 * - error: a lower intent is entirely covered by a higher one and can never win;
 * - warning: they overlap and do different things (the higher one wins there);
 * - info: they overlap but do the same thing.
 */
export function analyzeConflicts(intents: readonly IntentDef[]): IntentConflict[] {
  const list = intents.filter((i) => i.enabled && i.conditions.length > 0);
  const boxes = list.map(intentBox);
  const out: IntentConflict[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const hi = list[i] as IntentDef;
      const lo = list[j] as IntentDef;
      const both = intersect(boxes[i] as Box, boxes[j] as Box);
      if (!both) continue;
      const overlap = describeBox(both);
      if (contains(boxes[i] as Box, boxes[j] as Box)) {
        out.push({
          severity: 'error',
          winner: hi.id,
          loser: lo.id,
          overlap,
          message: `“${lo.name}” can never win: whenever it matches, “${hi.name}” above it matches too. Move it above “${hi.name}”, or add a condition that tells them apart.`,
        });
      } else if (hi.action !== lo.action) {
        out.push({
          severity: 'warning',
          winner: hi.id,
          loser: lo.id,
          overlap,
          message: `Both match when ${overlap}. “${hi.name}” is higher in the list, so it wins there (${ACTION_LABELS[hi.action]}, not ${ACTION_LABELS[lo.action]}).`,
        });
      } else {
        out.push({
          severity: 'info',
          winner: hi.id,
          loser: lo.id,
          overlap,
          message: `Both match when ${overlap}; they do the same thing (${ACTION_LABELS[hi.action]}).`,
        });
      }
    }
  }
  return out;
}

/** Conflicts that involve one intent (for the builder). */
export function conflictsFor(id: string, intents: readonly IntentDef[]): IntentConflict[] {
  return analyzeConflicts(intents).filter((c) => c.winner === id || c.loser === id);
}
