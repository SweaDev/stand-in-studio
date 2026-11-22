import type { DecisionTrace } from '../../../core/intent/DecisionTrace';
import { RingBuffer } from '../../../core/util/RingBuffer';
import { ACTION_LABELS } from '../../../shared/intents';
import { type Component, h } from '../dom';
import { icon } from '../icons';
import { actionChip } from './CurrentIntentCard';

export const LOG_CAPACITY = 1_000;
const HEARTBEAT_MS = 500;
const SNAPSHOT_MS = 200;
const VISIBLE_ROWS = 200;

/** What makes a new log row: a change in any of these, or the heartbeat. */
export function traceKey(t: DecisionTrace): string {
  return [
    t.mode,
    t.current.id,
    t.current.action,
    t.pending?.id ?? '-',
    Math.round(t.policy.feedTarget * 100),
    t.policy.override ?? '-',
    t.policy.raisePendingMs === null ? '-' : 'raise',
    t.tuning?.id ?? '-',
  ].join('|');
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Developer mode: a live log of how Auto decides, in the control window only. It keeps the
 * last 1,000 evaluations in memory; nothing is written to disk, printed or sent to the stage.
 */
export class DecisionLog implements Component {
  readonly el: HTMLElement;
  private readonly rows = new RingBuffer<DecisionTrace>(LOG_CAPACITY);
  private readonly tbody: HTMLTableSectionElement;
  private readonly signalsBody: HTMLTableSectionElement;
  private readonly intentsBody: HTMLTableSectionElement;
  private readonly summary: HTMLElement;
  private readonly count: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly filter: HTMLSelectElement;
  private readonly body: HTMLElement;
  private paused = false;
  private lastKey = '';
  private lastRowAt = Number.NEGATIVE_INFINITY;
  private lastSnapshotAt = Number.NEGATIVE_INFINITY;
  private startedAt: number | null = null;
  private filterId = '';
  private knownIntents = '';

  constructor() {
    this.tbody = h('tbody', { id: 'devlog-rows' });
    this.signalsBody = h('tbody', {});
    this.intentsBody = h('tbody', {});
    this.summary = h('p', { class: 'devlog-summary', id: 'devlog-summary', 'aria-live': 'off' });
    this.count = h('span', { class: 'chip chip-muted', id: 'devlog-count' }, '0 rows');
    this.pauseBtn = h(
      'button',
      { type: 'button', class: 'btn-small', id: 'devlog-pause', 'aria-pressed': 'false' },
      icon('pause', 14),
      'Pause',
    );
    this.pauseBtn.addEventListener('click', () => this.setPaused(!this.paused));
    this.filter = h('select', { id: 'devlog-filter', 'aria-label': 'Show rows for' });
    this.filter.addEventListener('change', () => {
      this.filterId = this.filter.value;
      this.renderRows();
    });
    const toggle = h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        id: 'devlog-collapse',
        'aria-expanded': 'true',
        'aria-label': 'Collapse log',
      },
      icon('down', 16),
    );
    this.body = h(
      'div',
      { class: 'devlog-body', id: 'devlog-body' },
      h(
        'div',
        { class: 'devlog-now' },
        h('h3', {}, 'Signals now'),
        h(
          'table',
          { class: 'devlog-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Signal'), h('th', {}, 'Value'), h('th', {}, 'State'))),
          this.signalsBody,
        ),
        h('h3', {}, 'Intents now (priority order)'),
        h(
          'table',
          { class: 'devlog-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Intent'), h('th', {}, 'Score'), h('th', {}, 'Limited by'))),
          this.intentsBody,
        ),
      ),
      h(
        'div',
        { class: 'devlog-history' },
        h('h3', {}, 'Decisions (newest first)'),
        h(
          'div',
          { class: 'devlog-scroll' },
          h(
            'table',
            { class: 'devlog-table devlog-rows' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', {}, 'Time'),
                h('th', {}, 'Action'),
                h('th', {}, 'Feed'),
                h('th', {}, 'Why'),
              ),
            ),
            this.tbody,
          ),
        ),
      ),
    );
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Collapse log' : 'Expand log');
      toggle.replaceChildren(icon(open ? 'down' : 'up', 16));
      this.body.hidden = !open;
    });
    this.el = h(
      'section',
      { class: 'devlog', id: 'devlog', 'aria-label': 'Developer decision log', hidden: true },
      h(
        'header',
        { class: 'devlog-head' },
        h('span', { class: 'devlog-title' }, icon('terminal', 16), 'Decision log'),
        h('span', { class: 'chip chip-warning' }, 'Developer mode · this screen only'),
        this.count,
        h('span', { class: 'spacer' }),
        this.filter,
        this.pauseBtn,
        h(
          'button',
          { type: 'button', class: 'btn-small', id: 'devlog-clear', onclick: () => this.clear() },
          icon('trash', 14),
          'Clear',
        ),
        h(
          'button',
          { type: 'button', class: 'btn-small', id: 'devlog-copy', onclick: () => void this.copy() },
          icon('clipboard', 14),
          'Copy JSON lines',
        ),
        toggle,
      ),
      this.summary,
      this.body,
    );
  }

  get enabled(): boolean {
    return !this.el.hidden;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.el.hidden = !on;
    if (!on) this.clear();
  }

  get size(): number {
    return this.rows.size;
  }

  /** Visible rows as JSON lines (what Copy puts on the clipboard). */
  jsonLines(): string {
    return this.visible()
      .map((t) => JSON.stringify(t))
      .join('\n');
  }

  /** Feed every engine trace; the log decides when to add a row. */
  push(t: DecisionTrace | undefined): void {
    if (!t || !this.enabled) return;
    this.startedAt ??= t.t;
    this.syncFilter(t);
    if (t.t - this.lastSnapshotAt >= SNAPSHOT_MS) {
      this.lastSnapshotAt = t.t;
      this.renderSnapshot(t);
      if (this.summary.textContent !== t.summary) this.summary.textContent = t.summary;
    }
    if (this.paused) return;
    const key = traceKey(t);
    if (key === this.lastKey && t.t - this.lastRowAt < HEARTBEAT_MS) return;
    this.lastKey = key;
    this.lastRowAt = t.t;
    this.rows.push(t);
    if (this.matches(t)) this.tbody.prepend(this.row(t));
    while (this.tbody.children.length > VISIBLE_ROWS) this.tbody.lastElementChild?.remove();
    this.count.textContent = `${this.rows.size} rows`;
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    this.pauseBtn.setAttribute('aria-pressed', String(p));
    this.pauseBtn.replaceChildren(icon(p ? 'play' : 'pause', 14), p ? 'Resume' : 'Pause');
  }

  private clear(): void {
    this.rows.clear();
    this.tbody.replaceChildren();
    this.lastKey = '';
    this.count.textContent = '0 rows';
  }

  private matches(t: DecisionTrace): boolean {
    return !this.filterId || t.current.id === this.filterId || t.pending?.id === this.filterId;
  }

  private visible(): DecisionTrace[] {
    return this.rows.toArray().filter((t) => this.matches(t));
  }

  private syncFilter(t: DecisionTrace): void {
    const names = t.intents.map((i) => `${i.id}:${i.name}`).join('|');
    if (names === this.knownIntents) return;
    this.knownIntents = names;
    const current = this.filter.value;
    this.filter.replaceChildren(
      h('option', { value: '' }, 'All intents'),
      ...t.intents.map((i) => h('option', { value: i.id }, i.name)),
    );
    this.filter.value = t.intents.some((i) => i.id === current) ? current : '';
    this.filterId = this.filter.value;
  }

  private renderRows(): void {
    this.tbody.replaceChildren(
      ...this.visible()
        .slice(-VISIBLE_ROWS)
        .reverse()
        .map((t) => this.row(t)),
    );
  }

  private row(t: DecisionTrace): HTMLTableRowElement {
    const secs = ((t.t - (this.startedAt ?? t.t)) / 1000).toFixed(2);
    return h(
      'tr',
      { class: `action-row action-${t.current.action}` },
      h('td', { class: 'mono' }, `+${secs}s`),
      h('td', {}, actionChip(t.current.action)),
      h('td', { class: 'mono' }, pct(t.policy.feedTarget)),
      h('td', { class: 'why' }, t.summary),
    );
  }

  private renderSnapshot(t: DecisionTrace): void {
    this.signalsBody.replaceChildren(
      ...t.signals.map((s) =>
        h(
          'tr',
          { class: s.available ? '' : 'is-na' },
          h('td', {}, s.label),
          h('td', { class: 'mono' }, s.text),
          h(
            'td',
            {},
            s.available
              ? h(
                  'span',
                  { class: 'state' },
                  s.state,
                  h(
                    'span',
                    { class: 'mini-meter' },
                    h('span', { style: `width:${Math.round(s.membership * 100)}%` }),
                  ),
                )
              : s.ignored
                ? 'ignored'
                : '—',
          ),
        ),
      ),
    );
    this.intentsBody.replaceChildren(
      ...t.intents.map((i) =>
        h(
          'tr',
          { class: `${i.id === t.current.id ? 'is-current' : ''}${i.candidate ? ' is-candidate' : ''}` },
          h('td', {}, i.name, ' ', h('span', { class: 'faint' }, `→ ${ACTION_LABELS[i.action]}`)),
          h(
            'td',
            { class: 'mono' },
            i.score.toFixed(2),
            h('span', { class: 'mini-meter' }, h('span', { style: `width:${Math.round(i.score * 100)}%` })),
          ),
          h('td', { class: 'mono small' }, i.limitedBy ?? '—'),
        ),
      ),
    );
  }

  private async copy(): Promise<void> {
    const text = this.jsonLines();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = h('textarea', { class: 'sr-only', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }
}
