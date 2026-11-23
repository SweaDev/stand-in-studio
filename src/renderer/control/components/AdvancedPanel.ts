import { type DeepPartial, type Settings, UI_OPTION_KEYS, type UiOptions } from '../../../shared/settings';
import { INTENTS_GUIDE } from '../../../shared/signalCatalog';
import { type Component, h } from '../dom';
import { icon } from '../icons';
import { toggle } from './fields';

export interface AdvancedActions {
  update(patch: DeepPartial<Settings>): void;
  /** Opens the intent builder (omitted until the builder exists). */
  createIntent?(): void;
  forgetTuning(): void;
  openExternal(url: string): void;
}

/** Advanced tab: custom intents, opt-in saving of learned data, and developer mode. */
export class AdvancedPanel implements Component {
  readonly el: HTMLElement;
  private readonly save: ReturnType<typeof toggle>;
  private readonly dev: ReturnType<typeof toggle>;
  private readonly ui = new Map<keyof UiOptions, ReturnType<typeof toggle>>();

  constructor(s: Settings, a: AdvancedActions) {
    const UI_LABELS: Record<keyof UiOptions, [string, string]> = {
      overrides: [
        'Override buttons',
        'Pin opacity, Raise hand, Back soon and Cycle mode next to Hide me. Their keyboard shortcuts always work.',
      ],
      intents: ['Intent list and builder', 'Reorder, switch, tune and edit the intents in the Auto tab.'],
      tuning: [
        'Calibration and intent tuning',
        'Calibration progress, Recalibrate and “Tune intents to you”.',
      ],
      meetingSetup: [
        'Ways to send the stage',
        'Stand-In Camera, OBS steps, the test pattern and screen sharing, under the preview.',
      ],
      presets: ['Meeting presets', 'Save and apply named presets in the Stage tab.'],
    };
    for (const k of UI_OPTION_KEYS) {
      const [label, hint] = UI_LABELS[k];
      this.ui.set(
        k,
        toggle(label, `ui-${k}`, s.ui[k], (v) => a.update({ ui: { [k]: v } }), hint),
      );
    }
    this.save = toggle('Save learned intent data on this computer', 'save-tuning', s.auto.saveTuning, (v) =>
      a.update({ auto: { saveTuning: v } }),
    );
    this.dev = toggle('Developer mode', 'developer-mode', s.advanced.developerMode, (v) =>
      a.update({ advanced: { developerMode: v } }),
    );
    const group = (title: string, id: string, ...children: (HTMLElement | null | undefined)[]) =>
      h('div', { class: 'group', id }, h('h3', {}, title), ...children);
    this.el = h(
      'div',
      { class: 'advanced-panel' },
      group(
        'Interface',
        'group-interface',
        h(
          'p',
          { class: 'hint' },
          'The main window shows the essentials: the dial, modes, live preview, Hide me and the status bar. Choose what else to show.',
        ),
        ...[...this.ui.values()].map((t) => t.el),
      ),
      a.createIntent &&
        group(
          'Custom intents',
          'group-custom-intents',
          h(
            'p',
            { class: 'hint' },
            'Build your own intent from Presage signals (talking, head turn, gaze, mouth, expressions, people in view and more) and choose what the character does.',
          ),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              { type: 'button', class: 'primary', id: 'create-intent', onclick: () => a.createIntent?.() },
              icon('plus'),
              'Create custom intent',
            ),
            h(
              'a',
              {
                href: INTENTS_GUIDE,
                class: 'link-external',
                onclick: (e: Event) => {
                  e.preventDefault();
                  a.openExternal(INTENTS_GUIDE);
                },
              },
              'How intents work',
              icon('external', 14),
            ),
          ),
        ),
      group(
        'Learned intent data',
        'group-save-tuning',
        this.save.el,
        h(
          'div',
          { class: 'callout callout-warning', role: 'note' },
          icon('warning'),
          h(
            'p',
            {},
            h('strong', {}, 'Privacy: '),
            'when on, the thresholds learned from your tuning recordings (typical head turn, gaze, mouth and expression levels) are stored in plain text in settings.json on this computer. No video and no raw signal values are stored. Turning this off deletes them. When off, tuning lasts until you quit.',
          ),
        ),
        h(
          'button',
          { type: 'button', id: 'forget-tuning', onclick: () => a.forgetTuning() },
          icon('trash'),
          'Forget learned data',
        ),
      ),
      group(
        'Developer mode',
        'group-developer',
        this.dev.el,
        h(
          'p',
          { class: 'hint' },
          'Shows a live decision log under the workspace: every signal’s value and state, every intent’s score and the condition that limited it, and how Auto picked the stage. It shows live values on this screen only. It is never saved, printed or shown on the stage.',
        ),
      ),
    );
  }

  sync(s: Settings): void {
    for (const [k, t] of this.ui) t.set(s.ui[k]);
    this.save.set(s.auto.saveTuning);
    this.dev.set(s.advanced.developerMode);
  }
}
