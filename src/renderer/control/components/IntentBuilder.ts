import { conflictsFor } from '../../../core/intent/conflicts';
import { MATCH_ON, describeCondition, evaluateIntent } from '../../../core/intent/IntentMatcher';
import { type SignalContext, readSignal } from '../../../core/intent/signals';
import {
  ACTION_HINTS,
  DEFAULT_HOLD_MS,
  HOLD_MAX_MS,
  HOLD_MIN_MS,
  type IntentAction,
  type IntentCondition,
  type IntentDef,
  MAX_CONDITIONS,
  MAX_INTENT_NAME,
  actionProblem,
  newCustomId,
  usesBodySignals,
} from '../../../shared/intents';
import {
  INTENTS_GUIDE,
  SIGNALS,
  SIGNAL_GROUPS,
  type SignalGroup,
  type SignalId,
  type SignalInfo,
  signalInfo,
  stateLabel,
} from '../../../shared/signalCatalog';
import { type Component, h } from '../dom';
import { type IconName, icon } from '../icons';
import { actionPicker } from './IntentList';

export interface IntentBuilderDeps {
  intents(): readonly IntentDef[];
  /** Saves the whole intent list (priority order). */
  save(intents: IntentDef[]): void;
  /** Latest live signal context, or null before signals arrive. */
  liveContext(): SignalContext | null;
  openExternal(url: string): void;
}

type Mode = { kind: 'create' } | { kind: 'edit'; id: string } | { kind: 'duplicate'; id: string };

const GROUP_ICONS: Record<SignalGroup, IconName> = {
  speech: 'speech',
  headGaze: 'eye',
  face: 'face',
  presence: 'people',
  body: 'heart',
};

interface Draft {
  id: string;
  name: string;
  action: IntentAction;
  conditions: IntentCondition[];
  holdMs: number;
  /** Index in the list to insert at (create/duplicate) or keep (edit). */
  position: number;
}

/**
 * The custom intent builder: a catalogue of every Presage-derived signal (with its SDK
 * source, a link to Presage's documentation and its live value) on the left, and the
 * intent being built on the right, with a live match meter and conflict warnings.
 */
export class IntentBuilder implements Component {
  readonly el: HTMLDialogElement;
  private mode: Mode = { kind: 'create' };
  private draft: Draft = {
    id: '',
    name: '',
    action: 'cover',
    conditions: [],
    holdMs: DEFAULT_HOLD_MS,
    position: 0,
  };
  private query = '';
  private readonly title: HTMLElement;
  private readonly catalogue: HTMLElement;
  private readonly form: HTMLElement;
  private readonly conflicts: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly meterText: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly error: HTMLElement;
  private readonly liveEls = new Map<SignalId, HTMLElement>();

  constructor(private readonly deps: IntentBuilderDeps) {
    this.title = h('h2', { id: 'builder-title' }, 'New custom intent');
    const search = h('input', {
      type: 'search',
      id: 'signal-search',
      placeholder: 'Search signals',
      'aria-label': 'Search signals',
    });
    search.addEventListener('input', () => {
      this.query = search.value.trim().toLowerCase();
      this.renderCatalogue();
    });
    this.catalogue = h('div', { class: 'catalogue', id: 'signal-catalogue' });
    this.form = h('div', { class: 'builder-form' });
    this.conflicts = h('div', { class: 'builder-conflicts', id: 'builder-conflicts', 'aria-live': 'polite' });
    this.meter = h('span', { class: 'meter-fill' });
    this.meterText = h('p', { class: 'hint', id: 'builder-match' });
    this.error = h('p', { class: 'form-error', id: 'builder-error', role: 'alert' });
    this.saveBtn = h(
      'button',
      { type: 'button', class: 'primary', id: 'builder-save' },
      icon('check'),
      'Save intent',
    );
    this.saveBtn.addEventListener('click', () => this.commit());

    const close = h(
      'button',
      { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => this.close() },
      icon('close', 18),
    );
    this.el = h(
      'dialog',
      { class: 'builder', id: 'intent-builder', 'aria-labelledby': 'builder-title' },
      h(
        'header',
        { class: 'builder-head' },
        h(
          'div',
          {},
          this.title,
          h(
            'p',
            { class: 'hint' },
            'Pick Presage signals on the left, choose their states, then decide what the character does when they all hold.',
          ),
        ),
        close,
      ),
      h(
        'div',
        { class: 'builder-body' },
        h(
          'section',
          { class: 'builder-pane catalogue-pane', 'aria-label': 'Signals' },
          h('div', { class: 'search' }, icon('search'), search),
          this.catalogue,
        ),
        h(
          'section',
          { class: 'builder-pane intent-pane', 'aria-label': 'Your intent' },
          this.form,
          h(
            'div',
            { class: 'live-match' },
            h('h3', {}, 'Live match'),
            h('div', { class: 'meter' }, this.meter),
            this.meterText,
          ),
          h('div', {}, h('h3', {}, 'Conflicts with other intents'), this.conflicts),
        ),
      ),
      h(
        'footer',
        { class: 'builder-foot' },
        h(
          'a',
          {
            href: INTENTS_GUIDE,
            class: 'link-external',
            onclick: (e: Event) => {
              e.preventDefault();
              deps.openExternal(INTENTS_GUIDE);
            },
          },
          'How intents are evaluated',
          icon('external', 14),
        ),
        h('span', { class: 'spacer' }),
        this.error,
        h('button', { type: 'button', id: 'builder-cancel', onclick: () => this.close() }, 'Cancel'),
        this.saveBtn,
      ),
    );
    this.el.addEventListener('close', () => this.liveEls.clear());
  }

  get isOpen(): boolean {
    return this.el.open;
  }

  open(mode: Mode): void {
    this.mode = mode;
    const list = this.deps.intents();
    const taken = new Set(list.map((i) => i.id));
    const src = mode.kind === 'create' ? null : list.find((i) => i.id === mode.id);
    if (mode.kind === 'edit' && src) {
      this.draft = {
        id: src.id,
        name: src.name,
        action: src.action,
        conditions: src.conditions.map((c) => ({ ...c, states: [...c.states] })),
        holdMs: src.holdMs,
        position: list.indexOf(src),
      };
      this.title.textContent = `Edit “${src.name}”`;
    } else {
      const name = src ? `${src.name} (custom)`.slice(0, MAX_INTENT_NAME) : '';
      // New intents go just below "Away" (which only matches with no face).
      const awayAt = list.findIndex((i) => i.id === 'away');
      this.draft = {
        id: newCustomId(name || 'intent', taken),
        name,
        action: src?.action ?? 'cover',
        conditions: src ? src.conditions.map((c) => ({ ...c, states: [...c.states] })) : [],
        holdMs: src?.holdMs ?? DEFAULT_HOLD_MS,
        position: awayAt >= 0 ? awayAt + 1 : 0,
      };
      this.title.textContent = src ? `Duplicate “${src.name}”` : 'New custom intent';
    }
    this.renderCatalogue();
    this.renderForm();
    this.refresh();
    if (!this.el.open) this.el.showModal();
    (this.el.querySelector('#intent-name') as HTMLInputElement | null)?.focus();
  }

  close(): void {
    if (this.el.open) this.el.close();
  }

  /** Per-frame (throttled by the caller): live signal values and the match meter. */
  live(): void {
    if (!this.el.open) return;
    const ctx = this.deps.liveContext();
    for (const [id, el] of this.liveEls) {
      const text = ctx ? this.liveText(id, ctx) : 'Waiting for signals…';
      if (el.textContent !== text) el.textContent = text;
    }
    this.updateMeter(ctx);
  }

  // ------------------------------------------------------------------ rendering

  private liveText(id: SignalId, ctx: SignalContext): string {
    const r = readSignal(id, ctx);
    if (!r.available) return `Now: ${r.reason ?? 'unavailable'}`;
    let best = '';
    let m = -1;
    for (const s of signalInfo(id).states)
      if ((r.m[s.id] ?? 0) > m) {
        m = r.m[s.id] ?? 0;
        best = s.id;
      }
    return `Now: ${stateLabel(id, best)} · ${r.text}`;
  }

  private renderCatalogue(): void {
    this.liveEls.clear();
    const used = new Set(this.draft.conditions.map((c) => c.signal));
    const full = this.draft.conditions.length >= MAX_CONDITIONS;
    const match = (s: SignalInfo) =>
      !this.query ||
      [s.label, s.description, s.sdkSource, ...s.states.map((x) => x.label)]
        .join(' ')
        .toLowerCase()
        .includes(this.query);
    const groups = SIGNAL_GROUPS.map((g) => {
      const signals = SIGNALS.filter((s) => s.group === g.id && match(s));
      if (signals.length === 0) return null;
      return h(
        'div',
        { class: 'signal-group' },
        h('h3', {}, icon(GROUP_ICONS[g.id], 14), g.label),
        signals.map((s) => {
          const live = h('p', { class: 'signal-live' }, 'Waiting for signals…');
          this.liveEls.set(s.id, live);
          const add = h(
            'button',
            {
              type: 'button',
              class: 'btn-small add-signal',
              id: `add-${s.id}`,
              disabled: used.has(s.id) || full,
              'aria-label': `Add ${s.label} condition`,
              onclick: () => this.addCondition(s.id),
            },
            used.has(s.id) ? icon('check', 14) : icon('plus', 14),
            used.has(s.id) ? 'Added' : 'Add',
          );
          return h(
            'article',
            { class: `signal-card${used.has(s.id) ? ' is-used' : ''}`, id: `signal-${s.id}` },
            h(
              'div',
              { class: 'signal-head' },
              h('span', { class: 'signal-name' }, s.label),
              h(
                'span',
                {
                  class: `chip ${s.derived ? 'chip-muted' : 'chip-ok'}`,
                  title: s.derived
                    ? 'Computed by Stand-In from SDK landmarks'
                    : 'Reported directly by the SDK',
                },
                s.derived ? 'Derived' : 'SDK',
              ),
              s.body
                ? h(
                    'span',
                    { class: 'chip chip-warning', title: 'Requests cardio metrics; can only cover you' },
                    'Opt-in',
                  )
                : null,
              h('span', { class: 'spacer' }),
              add,
            ),
            h('p', { class: 'signal-desc' }, s.description),
            live,
            h(
              'div',
              { class: 'signal-meta' },
              h('code', {}, s.sdkSource),
              h(
                'a',
                {
                  href: s.docUrl,
                  class: 'link-external',
                  'aria-label': `Presage documentation for ${s.label}`,
                  'data-doc': s.id,
                  onclick: (e: Event) => {
                    e.preventDefault();
                    this.deps.openExternal(s.docUrl);
                  },
                },
                'Docs',
                icon('external', 12),
              ),
            ),
            h('details', { class: 'how' }, h('summary', {}, 'How it works'), h('p', {}, s.howItWorks)),
          );
        }),
      );
    });
    const shown = groups.filter((g): g is HTMLDivElement => g !== null);
    this.catalogue.replaceChildren(
      ...(shown.length > 0 ? shown : [h('p', { class: 'hint' }, 'No signal matches your search.')]),
    );
    this.live();
  }

  private renderForm(): void {
    const d = this.draft;
    const name = h('input', {
      type: 'text',
      id: 'intent-name',
      value: d.name,
      maxlength: MAX_INTENT_NAME,
      placeholder: 'e.g. Checking my phone',
      autocomplete: 'off',
    });
    name.addEventListener('input', () => {
      d.name = name.value;
      this.refresh();
    });

    const conditions =
      d.conditions.length === 0
        ? h(
            'div',
            { class: 'empty-state' },
            icon('sparkle', 20),
            h(
              'p',
              {},
              'No conditions yet. Add signals from the catalogue: all of them must hold for the intent to match.',
            ),
          )
        : h(
            'ol',
            { class: 'condition-list', id: 'condition-list' },
            d.conditions.map((c, i) => {
              const info = signalInfo(c.signal);
              return h(
                'li',
                { class: 'condition-row', 'data-signal': c.signal },
                h(
                  'div',
                  { class: 'condition-head' },
                  i > 0 ? h('span', { class: 'and' }, 'AND') : null,
                  h('span', { class: 'signal-name' }, info.label),
                  h('span', { class: 'spacer' }),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'icon-btn',
                      'aria-label': `Remove ${info.label} condition`,
                      onclick: () => this.removeCondition(c.signal),
                    },
                    icon('close', 14),
                  ),
                ),
                h(
                  'div',
                  { class: 'state-chips', role: 'group', 'aria-label': `${info.label} is any of` },
                  info.states.map((st) =>
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'state-chip',
                        'aria-pressed': String(c.states.includes(st.id)),
                        'data-state': st.id,
                        onclick: () => this.toggleState(c.signal, st.id),
                      },
                      st.label,
                    ),
                  ),
                ),
              );
            }),
          );

    const hold = h('input', {
      type: 'range',
      id: 'intent-hold',
      min: HOLD_MIN_MS,
      max: HOLD_MAX_MS,
      step: 100,
      value: d.holdMs,
    });
    const holdOut = h('output', { for: 'intent-hold' }, `${(d.holdMs / 1000).toFixed(1)} s`);
    hold.addEventListener('input', () => {
      d.holdMs = Number(hold.value);
      holdOut.textContent = `${(d.holdMs / 1000).toFixed(1)} s`;
    });

    const list = this.deps.intents().filter((i) => i.id !== d.id);
    const position = h(
      'select',
      { id: 'intent-position', 'aria-label': 'Priority' },
      list.map((i, idx) => h('option', { value: String(idx) }, `Above “${i.name}”`)),
      h('option', { value: String(list.length) }, 'At the bottom'),
    );
    position.value = String(Math.min(d.position, list.length));
    position.addEventListener('change', () => {
      d.position = Number(position.value);
      this.refresh();
    });

    const bodyNote = usesBodySignals(d)
      ? h(
          'div',
          { class: 'callout callout-info', role: 'note' },
          icon('info'),
          h(
            'p',
            {},
            'This intent uses a body signal, so the SDK will be asked for pulse and breathing rate while it is enabled, and it can only cover you.',
          ),
        )
      : null;
    const actionHint = h('p', { class: 'hint', id: 'action-hint' }, ACTION_HINTS[d.action]);
    this.form.replaceChildren(
      h('div', { class: 'field' }, h('label', { for: 'intent-name' }, 'Name'), name),
      h('div', { class: 'field' }, h('h3', {}, 'When all of these hold'), conditions),
      h(
        'div',
        { class: 'field-grid' },
        h('div', { class: 'field' }, h('label', { for: 'intent-hold' }, 'Hold for ', holdOut), hold),
        h('div', { class: 'field' }, h('label', { for: 'intent-position' }, 'Priority'), position),
      ),
      h(
        'div',
        { class: 'field' },
        h('h3', {}, 'Then the character'),
        actionPicker(d, d.action, 'Action', (a) => {
          d.action = a;
          actionHint.textContent = ACTION_HINTS[a];
          this.refresh();
        }),
        actionHint,
        bodyNote,
      ),
    );
  }

  // ------------------------------------------------------------------ edits

  private addCondition(signal: SignalId): void {
    const info = signalInfo(signal);
    if (this.draft.conditions.some((c) => c.signal === signal)) return;
    // Start with the "active" states (turned, open, raised…): the usual reason to add a signal.
    const states = info.states.filter((s) => s.active).map((s) => s.id);
    this.draft.conditions.push({
      signal,
      states: states.length < info.states.length ? states : [info.states[0]?.id ?? ''],
    });
    if (actionProblem(this.draft, this.draft.action)) this.draft.action = 'cover';
    this.renderCatalogue();
    this.renderForm();
    this.refresh();
    (this.form.querySelector(`[data-signal="${signal}"] .state-chip`) as HTMLElement | null)?.focus();
  }

  private removeCondition(signal: SignalId): void {
    this.draft.conditions = this.draft.conditions.filter((c) => c.signal !== signal);
    this.renderCatalogue();
    this.renderForm();
    this.refresh();
  }

  private toggleState(signal: SignalId, state: string): void {
    const c = this.draft.conditions.find((x) => x.signal === signal);
    if (!c) return;
    c.states = c.states.includes(state) ? c.states.filter((s) => s !== state) : [...c.states, state];
    const order = signalInfo(signal).states.map((s) => s.id);
    c.states.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const btn of this.form.querySelectorAll<HTMLElement>(`[data-signal="${signal}"] .state-chip`))
      btn.setAttribute('aria-pressed', String(c.states.includes(btn.dataset.state ?? '')));
    this.refresh();
  }

  // ------------------------------------------------------------------ validation

  private candidateIntent(): IntentDef {
    const d = this.draft;
    return {
      id: d.id,
      name: d.name.trim() || 'This intent',
      builtIn: false,
      enabled: true,
      action: d.action,
      conditions: d.conditions.map((c) => ({ ...c, states: [...c.states] })),
      holdMs: d.holdMs,
    };
  }

  /** The intent list as it would be after saving. */
  private candidateList(): IntentDef[] {
    const list = this.deps.intents().filter((i) => i.id !== this.draft.id);
    const at = Math.min(this.draft.position, list.length);
    return [...list.slice(0, at), this.candidateIntent(), ...list.slice(at)];
  }

  private problems(): string[] {
    const d = this.draft;
    const out: string[] = [];
    if (!d.name.trim()) out.push('Give the intent a name.');
    if (d.conditions.length === 0) out.push('Add at least one condition.');
    for (const c of d.conditions) {
      const info = signalInfo(c.signal);
      if (c.states.length === 0) out.push(`Pick at least one state for ${info.label}.`);
      else if (c.states.length === info.states.length)
        out.push(`${info.label}: allowing every state always matches; drop the condition or narrow it.`);
    }
    const p = actionProblem(d, d.action);
    if (p) out.push(p);
    return out;
  }

  private refresh(): void {
    const problems = this.problems();
    const list = this.candidateList();
    const conflicts = problems.length === 0 ? conflictsFor(this.draft.id, list) : [];
    const blocking = conflicts.some((c) => c.severity === 'error' && c.loser === this.draft.id);
    if (problems.length > 0) {
      this.conflicts.replaceChildren(
        h('p', { class: 'hint' }, 'Conflicts are checked once the intent is complete.'),
      );
    } else if (conflicts.length === 0) {
      this.conflicts.replaceChildren(
        h('p', { class: 'conflict-none' }, icon('check', 14), 'No overlap with other enabled intents.'),
      );
    } else {
      this.conflicts.replaceChildren(
        h(
          'ul',
          { class: 'conflict-list' },
          conflicts.map((c) =>
            h(
              'li',
              { class: `conflict conflict-${c.severity}` },
              icon(c.severity === 'error' ? 'error' : c.severity === 'warning' ? 'warning' : 'info', 14),
              h('span', {}, c.message),
            ),
          ),
        ),
      );
    }
    this.error.textContent =
      problems[0] ?? (blocking ? 'This intent could never win where it is: move it up.' : '');
    this.saveBtn.disabled = problems.length > 0 || blocking;
    this.updateMeter(this.deps.liveContext());
  }

  private updateMeter(ctx: SignalContext | null): void {
    if (this.draft.conditions.length === 0 || !ctx) {
      this.meter.style.width = '0%';
      this.meterText.textContent = ctx
        ? 'Add conditions to see whether they match right now.'
        : 'Live match needs the camera or Demo mode running.';
      return;
    }
    const e = evaluateIntent(this.candidateIntent(), ctx);
    this.meter.style.width = `${Math.round(e.score * 100)}%`;
    this.meter.classList.toggle('is-match', e.score >= MATCH_ON);
    const text =
      e.score >= MATCH_ON
        ? `Matches now (${Math.round(e.score * 100)}%).`
        : e.limitedBy
          ? `Not matching (${Math.round(e.score * 100)}%): ${describeCondition(e.limitedBy.signal, e.limitedBy.states)} is ${Math.round(e.limitedBy.membership * 100)}%.`
          : 'Not matching.';
    if (this.meterText.textContent !== text) this.meterText.textContent = text;
  }

  private commit(): void {
    if (this.problems().length > 0) return;
    const next = this.candidateList().map((i) =>
      i.id === this.draft.id ? { ...i, name: this.draft.name.trim() } : i,
    );
    const prev = this.deps.intents().find((i) => i.id === this.draft.id);
    if (prev) {
      const updated = next.find((i) => i.id === prev.id);
      if (updated) updated.enabled = prev.enabled;
    }
    this.deps.save(next);
    this.close();
  }
}
