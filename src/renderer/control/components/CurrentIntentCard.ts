import type { EngineDebug } from '../../../core/StudioEngine';
import { ACTION_LABELS, type IntentAction } from '../../../shared/intents';
import type { Mode } from '../../../shared/types';
import { type Component, h } from '../dom';

/** A coloured chip for an intent action. */
export function actionChip(action: IntentAction): HTMLElement {
  return h('span', { class: `chip action-chip action-${action}` }, ACTION_LABELS[action]);
}

const MODE_NAMES: Record<Mode, string> = {
  character: 'Character',
  camera: 'Camera',
  blend: 'Blend',
  auto: 'Auto',
};

/**
 * Live card in the Auto tab: which intent Auto is acting on, how sure it is, and what it is
 * waiting for. Shown in the control window only.
 */
export class CurrentIntentCard implements Component {
  readonly el: HTMLElement;
  private readonly name: HTMLElement;
  private readonly chipSlot: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly score: HTMLElement;
  private readonly note: HTMLElement;
  private lastKey = '';

  constructor() {
    this.name = h('p', { class: 'current-name', id: 'current-intent' }, 'Waiting for signals…');
    this.chipSlot = h('span', { class: 'current-chip' });
    this.bar = h('span', { class: 'meter-fill' });
    this.score = h('span', { class: 'current-score' });
    this.note = h('p', { class: 'current-note', id: 'current-intent-note', 'aria-live': 'polite' });
    this.el = h(
      'section',
      { class: 'current-intent card-accent', 'aria-labelledby': 'current-intent-title' },
      h('p', { class: 'eyebrow', id: 'current-intent-title' }, 'Auto is acting on'),
      h('div', { class: 'current-head' }, this.name, this.chipSlot),
      h('div', { class: 'meter', role: 'img', 'aria-label': 'Match confidence' }, this.bar),
      h('div', { class: 'current-foot' }, this.note, this.score),
    );
  }

  /** `pausedWhy` explains a pause (defaults to Camera mode). */
  update(debug: EngineDebug | null, mode: Mode, pausedWhy?: string): void {
    if (!debug) return;
    const t = debug.trace;
    const intent = debug.intent;
    let note: string;
    if (debug.sensing === 'paused')
      note =
        pausedWhy ??
        'Presage is paused: Camera mode passes your video straight through, so nothing is analysed.';
    else if (debug.sensing === 'warming') note = 'Waiting for signals; Auto holds the current level.';
    else if (mode !== 'auto') note = `Auto is off: ${MODE_NAMES[mode]} mode decides the stage.`;
    else if (t.policy.override === 'hidden') note = 'Hide me is on: the character covers you.';
    else if (t.policy.override === 'pinned') note = 'Pinned: Auto will not change the opacity.';
    else if (t.policy.override === 'backSoon') note = 'Back soon is on.';
    else if (t.pending)
      note = `Switching to ${t.pending.name} in ${((t.pending.holdMs - t.pending.elapsedMs) / 1000).toFixed(1)} s`;
    else if (t.policy.raisePendingMs !== null)
      note = `Showing more of you in ${((t.policy.holdMs - t.policy.raisePendingMs) / 1000).toFixed(1)} s`;
    else if (t.policy.shieldCap !== null && debug.shieldActive)
      note = 'Comfort shield is limiting your video.';
    else if (intent.id === null) note = 'No intent matches, so Auto blends at your listening level.';
    else note = `Feed ${Math.round(t.policy.feedTarget * 100)}%`;
    const score = intent.score ?? 0;
    const key = `${intent.id}|${intent.action}|${note}|${Math.round(score * 20)}|${mode}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.name.textContent = intent.name;
    this.chipSlot.replaceChildren(actionChip(intent.action));
    this.bar.style.width = `${Math.round(score * 100)}%`;
    this.score.textContent = intent.score === null ? '' : `${Math.round(score * 100)}% match`;
    this.note.textContent = note;
    this.el.classList.toggle('is-off', mode !== 'auto');
  }
}
