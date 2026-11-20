import type { CalibrationStatus } from '../../../core/StudioEngine';
import { type Component, h } from '../dom';

/** Prompts across the calibration window (REQUIREMENT §4), by progress fraction. */
export const CALIBRATION_PROMPTS: readonly { from: number; text: string }[] = [
  { from: 0, text: 'Sit so your face and upper chest are in view.' },
  { from: 0.15, text: 'Look at the screen as you normally would.' },
  { from: 0.5, text: 'Now nod once.' },
  { from: 0.7, text: 'And smile once.' },
  { from: 0.88, text: 'Relax… almost done.' },
];

export function promptFor(progress: number): string {
  let text = CALIBRATION_PROMPTS[0]?.text ?? '';
  for (const p of CALIBRATION_PROMPTS) if (progress >= p.from) text = p.text;
  return text;
}

/**
 * Calibration panel: shown while calibration collects. Everything it measures (neutral
 * pose, closed mouth, resting expression, blinks) stays in memory and is discarded on quit.
 */
export class CalibrationWizard implements Component {
  readonly el: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly bar: HTMLProgressElement;
  private readonly hint: HTMLElement;
  private readonly done: HTMLElement;
  private phase = '';

  constructor(onRecalibrate: () => void) {
    this.prompt = h('p', { class: 'cal-prompt', id: 'cal-prompt', 'aria-live': 'polite' });
    this.bar = h('progress', {
      id: 'cal-progress',
      max: 100,
      value: 0,
      'aria-label': 'Calibration progress',
    });
    this.hint = h('p', { class: 'hint', id: 'cal-hint' });
    this.done = h(
      'div',
      { class: 'row cal-done', hidden: true },
      h('span', { id: 'cal-status' }, 'Calibrated to you.'),
      h('button', { type: 'button', id: 'recalibrate', onclick: () => onRecalibrate() }, 'Recalibrate'),
    );
    this.el = h(
      'div',
      { class: 'calibration', id: 'calibration' },
      h('h3', {}, 'Calibration'),
      h('div', { class: 'cal-active' }, this.prompt, this.bar, this.hint),
      this.done,
    );
  }

  update(s: CalibrationStatus, sdkHint: string): void {
    if (s.phase !== this.phase) {
      this.phase = s.phase;
      const active = s.phase === 'collecting';
      (this.el.querySelector('.cal-active') as HTMLElement).hidden = !active;
      this.done.hidden = s.phase !== 'done';
      this.el.classList.toggle('active', active);
      if (s.phase === 'done') {
        (this.done.querySelector('#cal-status') as HTMLElement).textContent = s.approximate
          ? 'Calibrated roughly (your face was hard to see). Recalibrate for better results.'
          : 'Calibrated to you.';
      }
    }
    if (s.phase !== 'collecting') return;
    const pct = Math.round(s.progress * 100);
    if (this.bar.value !== pct) this.bar.value = pct;
    const text = promptFor(s.progress);
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    if (this.hint.textContent !== sdkHint) this.hint.textContent = sdkHint;
  }
}
