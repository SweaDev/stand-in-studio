import { type Component, h } from '../dom';
import { type IconName, icon } from '../icons';

export interface SaveDemoCardOptions {
  /** Ids: the start button, cancel button and status line (kept stable for tests). */
  ids: { start: string; cancel: string; status: string; card: string };
  icon: IconName;
  title: string;
  blurb: string;
  action: string;
  /** Label of the start button while it runs (e.g. "Stop and save"); null keeps it disabled. */
  runningAction: string | null;
  onStart(): void;
  onCancel(): void;
  onPlay(id: string): void;
}

/**
 * Saving a demo, made obvious: a card with what it does, one primary button, and while it
 * runs a REC indicator with a progress bar; when done, "Play it now".
 */
export class SaveDemoCard implements Component {
  readonly el: HTMLElement;
  private readonly start: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly rec: HTMLElement;
  private readonly play: HTMLButtonElement;
  private playId: string | null = null;
  private running = false;

  constructor(private readonly o: SaveDemoCardOptions) {
    this.start = h('button', {
      type: 'button',
      class: 'primary',
      id: o.ids.start,
      onclick: () => o.onStart(),
    });
    this.cancel = h(
      'button',
      { type: 'button', id: o.ids.cancel, hidden: true, onclick: () => o.onCancel() },
      'Cancel',
    );
    this.play = h(
      'button',
      {
        type: 'button',
        class: 'btn-small',
        id: `${o.ids.card}-play`,
        hidden: true,
        onclick: () => this.playId && o.onPlay(this.playId),
      },
      icon('play', 14),
      'Play it now',
    );
    this.status = h('span', { class: 'telemetry-status', id: o.ids.status, role: 'status' });
    this.bar = h('div', { class: 'progress-fill' });
    this.progress = h(
      'div',
      {
        class: 'progress',
        role: 'progressbar',
        'aria-label': o.title,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        hidden: true,
      },
      this.bar,
    );
    this.rec = h('span', { class: 'rec-badge', hidden: true }, h('span', { class: 'recording-dot' }), 'REC');
    this.el = h(
      'div',
      { class: 'save-card', id: o.ids.card },
      h('div', { class: 'save-card-icon', 'aria-hidden': 'true' }, icon(o.icon, 20)),
      h(
        'div',
        { class: 'save-card-body' },
        h('div', { class: 'save-card-head' }, h('strong', {}, o.title), this.rec),
        h('p', { class: 'save-card-blurb' }, o.blurb),
        this.progress,
        h('div', { class: 'save-card-status' }, this.status, this.play),
      ),
      h('div', { class: 'save-card-actions' }, this.start, this.cancel),
    );
    this.idle();
  }

  /** Ready to start. */
  idle(): void {
    this.running = false;
    this.el.classList.remove('is-running');
    this.start.disabled = false;
    this.start.hidden = false;
    this.start.classList.add('primary');
    this.start.classList.remove('danger');
    this.start.replaceChildren(icon('record', 16), this.o.action);
    this.cancel.hidden = true;
    this.rec.hidden = true;
    this.progress.hidden = true;
  }

  /** Running: REC on, progress (0..1, or null for an open-ended recording) and a status line. */
  run(text: string, progress: number | null): void {
    if (!this.running) {
      this.running = true;
      this.el.classList.add('is-running');
      this.rec.hidden = false;
      this.play.hidden = true;
      if (this.o.runningAction) {
        this.start.disabled = false;
        this.start.classList.remove('primary');
        this.start.classList.add('danger');
        this.start.replaceChildren(
          h('span', { class: 'recording-dot', 'aria-hidden': 'true' }),
          this.o.runningAction,
        );
        this.cancel.hidden = true;
      } else {
        this.start.hidden = true;
        this.cancel.hidden = false;
      }
    }
    this.progress.hidden = progress === null;
    if (progress !== null) {
      const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
      this.bar.style.width = `${pct}%`;
      this.progress.setAttribute('aria-valuenow', String(pct));
    }
    this.say(text);
  }

  /** Finished or failed: back to idle with a message (and "Play it now" after a save). */
  finish(text: string, tone: 'ok' | 'error', playId: string | null = null): void {
    this.idle();
    this.say(text, tone);
    this.playId = playId;
    this.play.hidden = playId === null;
  }

  say(text: string, tone: 'ok' | 'error' | '' = ''): void {
    if (this.status.textContent !== text) this.status.textContent = text;
    this.status.className = `telemetry-status${tone ? ` is-${tone}` : ''}`;
  }

  /** Disables starting (e.g. while another save runs). */
  setEnabled(on: boolean): void {
    if (!this.running) this.start.disabled = !on;
  }
}
