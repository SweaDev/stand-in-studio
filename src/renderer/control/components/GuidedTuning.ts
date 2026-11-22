import type { StudioEngine, TuningStatus } from '../../../core/StudioEngine';
import { type Component, h } from '../dom';
import { icon } from '../icons';

/** The guided steps: built-in intents and how to act each one out. */
export const GUIDED_STEPS: readonly { id: string; prompt: string }[] = [
  { id: 'talkingInMeeting', prompt: 'Look at the screen and talk as if to the meeting.' },
  { id: 'listening', prompt: 'Look at the screen and listen quietly.' },
  { id: 'talkingToOther', prompt: 'Turn your head to one side and talk to someone there.' },
  { id: 'turnedAway', prompt: 'Turn away from the screen and stay quiet.' },
];

/**
 * After calibration: walks through the main built-in intents, recording each for 6 s so
 * its thresholds fit how you actually move. Each step can be skipped.
 */
export class GuidedTuning implements Component {
  readonly el: HTMLElement;
  private readonly start: HTMLButtonElement;
  private readonly active: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly step: HTMLElement;
  private readonly bar: HTMLProgressElement;
  private index = -1;

  constructor(
    private readonly engine: StudioEngine,
    private readonly hasIntent: (id: string) => boolean,
  ) {
    this.start = h(
      'button',
      { type: 'button', id: 'guided-tuning', class: 'btn-small', onclick: () => this.begin() },
      icon('record', 14),
      'Tune intents to you',
    );
    this.prompt = h('p', { class: 'cal-prompt', id: 'guided-prompt', 'aria-live': 'polite' });
    this.step = h('p', { class: 'hint', id: 'guided-step' });
    this.bar = h('progress', { max: 100, value: 0, 'aria-label': 'Tuning progress' });
    this.active = h(
      'div',
      { class: 'guided-active', hidden: true },
      this.step,
      this.prompt,
      this.bar,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { type: 'button', class: 'btn-small', id: 'guided-skip', onclick: () => this.next() },
          'Skip',
        ),
        h(
          'button',
          { type: 'button', class: 'btn-small', id: 'guided-stop', onclick: () => this.stop() },
          'Stop',
        ),
      ),
    );
    this.el = h(
      'div',
      { class: 'guided', id: 'guided' },
      h('p', { class: 'hint' }, 'Optional: act out four situations for 6 s each so Auto fits how you move.'),
      this.start,
      this.active,
    );
    engine.events.on('tuning', (t) => this.onTuning(t));
  }

  private steps() {
    return GUIDED_STEPS.filter((s) => this.hasIntent(s.id));
  }

  private begin(): void {
    this.index = -1;
    this.start.hidden = true;
    this.active.hidden = false;
    this.el.classList.add('active');
    this.next();
  }

  private next(): void {
    const steps = this.steps();
    this.index++;
    const s = steps[this.index];
    if (!s) {
      this.stop();
      return;
    }
    this.step.textContent = `Step ${this.index + 1} of ${steps.length}`;
    this.prompt.textContent = s.prompt;
    this.bar.value = 0;
    this.engine.startTuning(s.id);
  }

  private stop(): void {
    this.engine.cancelTuning();
    this.index = -1;
    this.start.hidden = false;
    this.active.hidden = true;
    this.el.classList.remove('active');
  }

  /** Per-frame progress. */
  update(): void {
    const t = this.engine.tuningActive;
    if (this.index >= 0 && t) this.bar.value = Math.round(t.progress * 100);
  }

  private onTuning(t: TuningStatus): void {
    if (this.index < 0) return;
    const current = this.steps()[this.index];
    if (t.phase === 'done' && current && t.id === current.id) this.next();
  }
}
