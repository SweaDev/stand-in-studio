import { COMMANDS, type CommandName } from '../../../core/stage/commands';
import { HOTKEYS, displayAccelerator } from '../../../shared/hotkeys';
import { type Component, h } from '../dom';

export interface OverrideFlags {
  hidden: boolean;
  pinned: boolean;
  raisedHand: boolean;
  backSoon: boolean;
}

const FLAG: Partial<Record<CommandName, keyof OverrideFlags>> = {
  hideMe: 'hidden',
  pin: 'pinned',
  raiseHand: 'raisedHand',
  backSoon: 'backSoon',
};

/** Override buttons (Hide me, Pin, Raise hand, Back soon, Cycle mode) with their hotkeys. */
export class OverrideBar implements Component {
  readonly el: HTMLElement;
  private readonly buttons = new Map<CommandName, HTMLButtonElement>();

  constructor(platform: string, run: (c: CommandName) => void) {
    this.el = h('div', { class: 'row overrides', role: 'group', 'aria-label': 'Overrides' });
    for (const c of Object.values(COMMANDS)) {
      const key = displayAccelerator(HOTKEYS[c.name], platform);
      const b = h(
        'button',
        {
          type: 'button',
          id: `cmd-${c.name}`,
          class: c.name === 'hideMe' ? 'hide-me' : undefined,
          'aria-pressed': FLAG[c.name] ? 'false' : undefined,
          title: `${c.label} (${key})`,
          'aria-keyshortcuts': key,
          onclick: () => run(c.name),
        },
        c.label,
        h('kbd', {}, key),
      );
      this.buttons.set(c.name, b);
      this.el.append(b);
    }
  }

  /** Compact: only Hide me is shown (the other overrides keep their hotkeys). */
  setCompact(compact: boolean): void {
    for (const [name, b] of this.buttons) if (name !== 'hideMe') b.hidden = compact;
    this.el.classList.toggle('is-compact', compact);
  }

  set(flags: OverrideFlags): void {
    for (const [name, flag] of Object.entries(FLAG) as [CommandName, keyof OverrideFlags][]) {
      const b = this.buttons.get(name);
      const v = String(flags[flag]);
      if (b && b.getAttribute('aria-pressed') !== v) b.setAttribute('aria-pressed', v);
    }
  }
}

/** Demo mode's keys (control window only): each acts out one situation. */
export const DEMO_KEYS: readonly (readonly [string, string])[] = [
  ['N', 'nod'],
  ['S', 'shake'],
  ['T', 'hold to talk'],
  ['B', 'blink'],
  ['H', 'smile'],
  ['E', 'eat'],
  ['L', 'look away'],
  ['O', 'talk to someone off to the side'],
  ['A', 'step away'],
  ['P', 'raise the Comfort-shield trigger'],
];
