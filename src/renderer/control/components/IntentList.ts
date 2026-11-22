import { type IntentConflict, analyzeConflicts } from '../../../core/intent/conflicts';
import { describeCondition } from '../../../core/intent/IntentMatcher';
import {
  ACTION_HINTS,
  ACTION_LABELS,
  INTENT_ACTIONS,
  type IntentAction,
  type IntentDef,
  type IntentTuning,
  actionProblem,
} from '../../../shared/intents';
import { type Component, h } from '../dom';
import { icon } from '../icons';

export interface IntentListActions {
  /** The whole list changed (order, action, enabled, delete). */
  change(intents: IntentDef[]): void;
  tune(id: string): void;
  /** Open the intent builder (omitted until the builder exists). */
  edit?(id: string): void;
  duplicate?(id: string): void;
}

let uid = 0;

/** Segmented action picker; options a body-signal intent may not use are disabled. */
export function actionPicker(
  intent: Pick<IntentDef, 'conditions'>,
  value: IntentAction,
  label: string,
  onChange: (a: IntentAction) => void,
): HTMLElement {
  const name = `action-${uid++}`;
  return h(
    'fieldset',
    { class: 'segmented-compact' },
    h('legend', { class: 'sr-only' }, label),
    INTENT_ACTIONS.map((a) => {
      const problem = actionProblem(intent, a);
      const input = h('input', {
        type: 'radio',
        name,
        value: a,
        id: `${name}-${a}`,
        checked: a === value,
        disabled: problem !== null,
      });
      input.addEventListener('change', () => input.checked && onChange(a));
      return h(
        'label',
        { for: input.id, title: problem ?? ACTION_HINTS[a], class: `seg action-${a}` },
        input,
        ACTION_LABELS[a],
      );
    }),
  );
}

function conflictIcon(sev: IntentConflict['severity']) {
  return icon(sev === 'error' ? 'error' : sev === 'warning' ? 'warning' : 'info', 14);
}

/** The ordered intent list in the Auto tab. First match wins, so order matters. */
export class IntentList implements Component {
  readonly el: HTMLElement;
  private readonly list: HTMLOListElement;
  private readonly summary: HTMLElement;
  private intents: IntentDef[] = [];
  private tuning: Readonly<Record<string, IntentTuning>> = {};
  private activeId: string | null = null;
  private tuningId: string | null = null;

  constructor(private readonly actions: IntentListActions) {
    this.list = h('ol', {
      class: 'intent-list',
      id: 'intent-list',
      'aria-label': 'Intents, highest priority first',
    });
    this.summary = h('p', { class: 'hint', id: 'intent-conflicts-summary' });
    this.el = h(
      'div',
      { class: 'intents' },
      h(
        'p',
        { class: 'hint' },
        'Checked top to bottom: the first intent that matches decides what the character does. Use the arrows to reorder.',
      ),
      this.summary,
      this.list,
    );
  }

  /** Re-renders from settings (and the engine's in-memory tuning). */
  sync(intents: readonly IntentDef[], tuning: Readonly<Record<string, IntentTuning>>): void {
    this.intents = intents.map((i) => ({ ...i }));
    this.tuning = tuning;
    this.render();
  }

  /** Per-frame: highlights the active intent and shows recording progress. */
  live(activeId: string | null, tuning: { id: string; progress: number } | null): void {
    if (activeId !== this.activeId) {
      this.activeId = activeId;
      for (const li of this.list.children) {
        const on = (li as HTMLElement).dataset.id === activeId;
        li.classList.toggle('is-active', on);
        const badge = li.querySelector('.live-badge') as HTMLElement | null;
        if (badge) badge.hidden = !on;
      }
    }
    const id = tuning?.id ?? null;
    if (id !== this.tuningId) {
      this.tuningId = id;
      for (const btn of this.list.querySelectorAll<HTMLButtonElement>('.tune-btn')) {
        const mine = btn.dataset.id === id;
        btn.disabled = id !== null && !mine;
        btn.classList.toggle('is-recording', mine);
        const label = btn.querySelector('.label') as HTMLElement;
        label.textContent = mine ? 'Recording…' : 'Tune';
      }
    }
    if (tuning) {
      const bar = this.list.querySelector<HTMLElement>(
        `li[data-id="${CSS.escape(tuning.id)}"] .tune-progress`,
      );
      if (bar) {
        bar.hidden = false;
        bar.style.setProperty('--p', String(tuning.progress));
      }
    }
  }

  private commit(next: IntentDef[]): void {
    this.intents = next;
    this.actions.change(next);
    this.render();
  }

  private move(i: number, by: number): void {
    const j = i + by;
    if (j < 0 || j >= this.intents.length) return;
    const next = [...this.intents];
    [next[i], next[j]] = [next[j] as IntentDef, next[i] as IntentDef];
    this.commit(next);
    (
      this.list.children[j]?.querySelector(by < 0 ? '.move-up' : '.move-down') as HTMLButtonElement | null
    )?.focus();
  }

  private render(): void {
    const conflicts = analyzeConflicts(this.intents);
    const serious = conflicts.filter((c) => c.severity !== 'info');
    const errors = serious.filter((c) => c.severity === 'error').length;
    this.summary.textContent =
      serious.length === 0
        ? 'No conflicts between enabled intents.'
        : `${errors > 0 ? `${errors} error${errors > 1 ? 's' : ''}, ` : ''}${serious.length - errors} overlap warning${serious.length - errors === 1 ? '' : 's'}. Expand an intent to see details.`;
    this.summary.className = `hint conflict-summary${errors > 0 ? ' has-error' : serious.length > 0 ? ' has-warning' : ''}`;

    this.list.replaceChildren(
      ...this.intents.map((intent, i) => {
        const mine = conflicts.filter((c) => c.loser === intent.id || c.winner === intent.id);
        const visible = mine.filter((c) => c.severity !== 'info');
        const tuned = this.tuning[intent.id];
        const toggle = h('input', {
          type: 'checkbox',
          class: 'switch',
          id: `intent-enabled-${intent.id}`,
          checked: intent.enabled,
          'aria-label': `${intent.name} enabled`,
        });
        toggle.addEventListener('change', () =>
          this.commit(this.intents.map((x) => (x.id === intent.id ? { ...x, enabled: toggle.checked } : x))),
        );
        const iconBtn = (
          cls: string,
          name: Parameters<typeof icon>[0],
          label: string,
          onclick: () => void,
          disabled = false,
        ) =>
          h(
            'button',
            {
              type: 'button',
              class: `icon-btn ${cls}`,
              'aria-label': label,
              title: label,
              disabled,
              onclick,
            },
            icon(name),
          );
        const tuneBtn = h(
          'button',
          {
            type: 'button',
            class: 'btn-small tune-btn',
            'data-id': intent.id,
            title: 'Act this intent out for 6 seconds to fit its thresholds to you',
            onclick: () => this.actions.tune(intent.id),
          },
          icon('record', 14),
          h('span', { class: 'label' }, 'Tune'),
        );
        // Same-action overlaps are harmless; they are listed in the builder, not here.
        const conflictsEl =
          visible.length > 0
            ? h(
                'details',
                { class: 'intent-conflicts' },
                h('summary', {}, `${visible.length} conflict${visible.length > 1 ? 's' : ''}`),
                h(
                  'ul',
                  {},
                  visible.map((c) =>
                    h(
                      'li',
                      { class: `conflict conflict-${c.severity}` },
                      conflictIcon(c.severity),
                      h('span', {}, c.message),
                    ),
                  ),
                ),
              )
            : null;
        const worst = visible.some((c) => c.severity === 'error')
          ? 'error'
          : visible.length > 0
            ? 'warning'
            : null;
        return h(
          'li',
          {
            class: `intent-card${intent.enabled ? '' : ' is-disabled'}${intent.id === this.activeId ? ' is-active' : ''}`,
            'data-id': intent.id,
            id: `intent-${intent.id}`,
          },
          h(
            'div',
            { class: 'intent-head' },
            h('span', { class: 'intent-rank', 'aria-hidden': 'true' }, String(i + 1)),
            h('span', { class: 'intent-name' }, intent.name),
            h('span', { class: 'chip chip-muted' }, intent.builtIn ? 'Built-in' : 'Custom'),
            h('span', { class: 'chip chip-live live-badge', hidden: intent.id !== this.activeId }, 'Active'),
            worst
              ? h(
                  'span',
                  { class: `chip chip-${worst}`, title: 'See conflicts below' },
                  conflictIcon(worst),
                  worst === 'error' ? 'Never wins' : 'Overlaps',
                )
              : null,
            h(
              'label',
              { class: 'switch-wrap', for: toggle.id },
              toggle,
              h('span', { class: 'sr-only' }, 'Enabled'),
            ),
          ),
          h(
            'ul',
            { class: 'condition-chips', 'aria-label': 'Conditions' },
            intent.conditions.map((c) =>
              h('li', { class: 'chip chip-condition' }, describeCondition(c.signal, c.states)),
            ),
          ),
          actionPicker(intent, intent.action, `Action for ${intent.name}`, (a) =>
            this.commit(this.intents.map((x) => (x.id === intent.id ? { ...x, action: a } : x))),
          ),
          h(
            'div',
            { class: 'intent-foot' },
            tuneBtn,
            tuned
              ? h(
                  'span',
                  { class: 'chip chip-ok', title: 'Thresholds fitted to you from a recording' },
                  `Tuned · matched ${Math.round(tuned.matched * 100)}%`,
                )
              : h(
                  'span',
                  { class: 'chip chip-muted', title: 'Using default thresholds' },
                  'Default thresholds',
                ),
            h('span', { class: 'spacer' }),
            iconBtn('move-up', 'up', `Move ${intent.name} up`, () => this.move(i, -1), i === 0),
            iconBtn(
              'move-down',
              'down',
              `Move ${intent.name} down`,
              () => this.move(i, 1),
              i === this.intents.length - 1,
            ),
            intent.builtIn
              ? this.actions.duplicate &&
                  iconBtn('dup-btn', 'copy', `Duplicate ${intent.name} as a custom intent`, () =>
                    this.actions.duplicate?.(intent.id),
                  )
              : this.actions.edit &&
                  iconBtn('edit-btn', 'edit', `Edit ${intent.name}`, () => this.actions.edit?.(intent.id)),
            intent.builtIn
              ? null
              : iconBtn('delete-btn', 'trash', `Delete ${intent.name}`, () =>
                  this.commit(this.intents.filter((x) => x.id !== intent.id)),
                ),
          ),
          h('div', { class: 'tune-progress', hidden: true, role: 'presentation' }),
          conflictsEl,
        );
      }),
    );
    // Re-apply live state on the new nodes.
    const active = this.activeId;
    const tuning = this.tuningId;
    this.activeId = null;
    this.tuningId = null;
    this.live(active, tuning ? { id: tuning, progress: 0 } : null);
  }
}
