import type { Mode } from '../../../shared/types';
import { MODES } from '../../../shared/types';
import { type Component, h } from '../dom';

export const MODE_LABELS: Record<Mode, string> = {
  character: 'Character',
  camera: 'Camera',
  blend: 'Blend',
  auto: 'Auto',
};

const HINTS: Record<Mode, string> = {
  character: 'Only the character. Your video is at 0%.',
  camera: 'Your webcam at 100%; the character is hidden.',
  blend: 'Your video at the opacity you choose, with the character overlaid.',
  auto: 'Stand-In moves the dial for you from your live signals.',
};

/** Mode switch: a radio group of the four modes. */
export class ModeSwitch implements Component {
  readonly el: HTMLElement;
  private readonly buttons = new Map<Mode, HTMLButtonElement>();
  private readonly hint: HTMLElement;
  private mode: Mode | null = null;

  constructor(onSelect: (m: Mode) => void) {
    this.hint = h('p', { class: 'hint', id: 'mode-hint' });
    const group = h('div', { class: 'mode-switch', role: 'radiogroup', 'aria-label': 'Mode' });
    for (const m of MODES) {
      const b = h(
        'button',
        { type: 'button', role: 'radio', id: `mode-${m}`, 'aria-checked': 'false' },
        MODE_LABELS[m],
      );
      b.addEventListener('click', () => onSelect(m));
      b.addEventListener('keydown', (e) => {
        const i = MODES.indexOf(m);
        const next =
          e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
              ? -1
              : 0;
        if (!next) return;
        e.preventDefault();
        const target = MODES[(i + next + MODES.length) % MODES.length] as Mode;
        onSelect(target);
        this.buttons.get(target)?.focus();
      });
      this.buttons.set(m, b);
      group.append(b);
    }
    this.el = h('div', {}, group, this.hint);
  }

  set(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const [m, b] of this.buttons) {
      b.setAttribute('aria-checked', String(m === mode));
      b.tabIndex = m === mode ? 0 : -1;
    }
    this.hint.textContent = HINTS[mode];
  }
}
