import { type DemoSummary, VIDEO_TYPES, formatDuration } from '../../../shared/demos';
import type { InputSource, InputStatus } from '../../../shared/inputStatus';
import { type Component, h } from '../dom';
import { type IconName, icon } from '../icons';
import type { ConsentChoice } from './ConsentScreen';

export interface InputPanelActions {
  /** Switches the input in place (consent was already given this launch). */
  switchTo(choice: ConsentChoice): void;
  /** Turns Presage analysis off (true) or back on. */
  setPresageOff(off: boolean): void;
  /** Stops everything and returns to the start screen. */
  backToStart(): void;
}

type Kind = 'camera' | 'clip' | 'demo';

const ACCEPT = Object.keys(VIDEO_TYPES)
  .map((e) => `.${e}`)
  .join(',');

const KINDS: { kind: Kind; label: string; icon: IconName }[] = [
  { kind: 'camera', label: 'Camera', icon: 'camera' },
  { kind: 'clip', label: 'Video file', icon: 'video' },
  { kind: 'demo', label: 'Demo', icon: 'film' },
];

/**
 * Camera tab, top: what feeds the stage and Presage. Switches between the camera, a video
 * file and a demo (simulated or saved) without going back to the start screen, and shows
 * exactly what Presage is reading, with its on/off switch.
 */
export class InputPanel implements Component {
  readonly el: HTMLElement;
  private readonly buttons = new Map<Kind, HTMLButtonElement>();
  private readonly demoPick: HTMLSelectElement;
  private readonly readout: HTMLElement;
  private readonly readoutText: HTMLElement;
  private readonly presageSwitch: HTMLInputElement;
  private readonly presageRow: HTMLElement;
  private last = '';

  constructor(
    current: InputSource,
    opts: { apiKey: boolean; replayId?: string | null },
    private readonly a: InputPanelActions,
    /** Slot for the camera device picker (shown under the source choice). */
    devicePicker: HTMLElement | null,
  ) {
    const kind: Kind = current === 'replay' ? 'demo' : current;
    const file = h('input', {
      type: 'file',
      id: 'input-clip-file',
      accept: ACCEPT,
      hidden: true,
      'aria-label': 'Choose a video file',
    });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) a.switchTo({ kind: 'clip', file: f });
      file.value = '';
    });
    this.demoPick = h(
      'select',
      { id: 'input-demo-pick', 'aria-label': 'Which demo' },
      h('option', { value: '' }, 'Simulated person (built in)'),
    );
    if (opts.replayId) this.demoPick.dataset.current = opts.replayId;
    this.demoPick.addEventListener('change', () => {
      if (kind === 'demo') this.pickDemo();
    });
    const group = h('div', { class: 'segmented', id: 'input-source', role: 'group', 'aria-label': 'Input' });
    for (const k of KINDS) {
      const disabled = k.kind === 'camera' && !opts.apiKey;
      const b = h(
        'button',
        {
          type: 'button',
          id: `input-${k.kind}`,
          'aria-pressed': String(k.kind === kind),
          disabled,
          // Stays disabled when transitions re-enable controls.
          'data-locked': disabled ? 'true' : undefined,
          title: disabled ? 'Using your camera needs a Presage API key (below)' : undefined,
        },
        icon(k.icon, 16),
        k.label,
      );
      b.addEventListener('click', () => {
        if (k.kind === 'clip') file.click();
        else if (k.kind === 'demo') {
          if (kind !== 'demo') a.switchTo('demo');
        } else if (k.kind !== kind) a.switchTo('camera');
      });
      this.buttons.set(k.kind, b);
      group.append(b);
    }
    this.presageSwitch = h('input', {
      type: 'checkbox',
      class: 'switch',
      id: 'presage-toggle',
      checked: true,
    });
    this.presageSwitch.addEventListener('change', () => a.setPresageOff(!this.presageSwitch.checked));
    this.presageRow = h(
      'label',
      { class: 'switch-wrap', for: 'presage-toggle' },
      this.presageSwitch,
      h('span', {}, 'Analyse with Presage'),
    );
    this.readoutText = h('span', { id: 'presage-readout' });
    this.readout = h(
      'div',
      { class: 'readout', role: 'status' },
      icon('scan', 18),
      h('div', { class: 'readout-body' }, this.readoutText, this.presageRow),
    );
    this.el = h(
      'div',
      { class: 'group input-panel', id: 'group-input' },
      h('h3', {}, 'Input'),
      h(
        'p',
        { class: 'hint input-lead' },
        'What feeds the Virtual Stage and Presage. Switching keeps you here: no need to go back to the start screen.',
      ),
      group,
      file,
      h(
        'div',
        { class: 'field demo-pick-row', hidden: kind !== 'demo' },
        h('label', { for: 'input-demo-pick' }, 'Demo to play'),
        this.demoPick,
      ),
      devicePicker,
      this.readout,
      opts.apiKey
        ? null
        : h(
            'p',
            { class: 'hint', id: 'input-nokey' },
            'Camera input and live analysis need a Presage API key: paste one below.',
          ),
      h(
        'div',
        { class: 'row input-actions' },
        h(
          'button',
          { type: 'button', id: 'back-to-start', onclick: () => a.backToStart() },
          icon('arrowLeft', 16),
          'Back to start screen',
        ),
      ),
    );
  }

  private pickDemo(): void {
    const id = this.demoPick.value;
    this.a.switchTo(id ? { kind: 'replay', id } : 'demo');
  }

  /** Lists the saved demos in the Demo picker. */
  setDemos(demos: DemoSummary[]): void {
    const current = this.demoPick.dataset.current ?? '';
    this.demoPick.replaceChildren(
      h('option', { value: '' }, 'Simulated person (built in)'),
      ...demos.map((d) =>
        h(
          'option',
          { value: d.id, selected: d.id === current },
          `${d.name} · ${formatDuration(d.durationMs)}`,
        ),
      ),
    );
  }

  /** Updates the Presage readout and switch (cheap when nothing changed). */
  update(s: InputStatus, presageOff: boolean): void {
    const key = `${s.presage.detail}|${s.presageToggle}|${presageOff}`;
    if (key === this.last) return;
    this.last = key;
    this.readoutText.textContent = s.presage.detail;
    this.readout.dataset.tone = s.presage.tone;
    this.presageRow.hidden = !s.presageToggle;
    this.presageSwitch.checked = !presageOff;
  }
}
