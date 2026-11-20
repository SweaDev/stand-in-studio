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

  set(flags: OverrideFlags): void {
    for (const [name, flag] of Object.entries(FLAG) as [CommandName, keyof OverrideFlags][]) {
      const b = this.buttons.get(name);
      const v = String(flags[flag]);
      if (b && b.getAttribute('aria-pressed') !== v) b.setAttribute('aria-pressed', v);
    }
  }
}

/** Dialog listing every shortcut, including Demo-mode keys. */
export class HotkeyHelp implements Component {
  readonly el: HTMLDialogElement;

  constructor(platform: string, demo: boolean) {
    const rows = Object.values(COMMANDS).map((c) =>
      h(
        'tr',
        {},
        h('td', {}, h('kbd', {}, displayAccelerator(HOTKEYS[c.name], platform))),
        h('td', {}, c.label),
      ),
    );
    const demoKeys: [string, string][] = [
      ['N', 'nod'],
      ['S', 'shake'],
      ['T', 'hold to talk'],
      ['B', 'blink'],
      ['H', 'smile'],
      ['E', 'eat'],
      ['L', 'look away'],
      ['A', 'step away'],
      ['P', 'raise the Comfort-shield trigger'],
    ];
    this.el = h(
      'dialog',
      { id: 'hotkey-help', 'aria-labelledby': 'hotkey-title' },
      h('h2', { id: 'hotkey-title' }, 'Keyboard shortcuts'),
      h('p', { class: 'hint' }, 'Global: these work even while your meeting app has focus.'),
      h('table', {}, h('tbody', {}, rows)),
      demo
        ? h(
            'div',
            {},
            h('h3', {}, 'Demo mode keys (this window)'),
            h(
              'table',
              {},
              h(
                'tbody',
                {},
                demoKeys.map(([k, l]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, l))),
              ),
            ),
          )
        : null,
      h('form', { method: 'dialog' }, h('button', { type: 'submit', class: 'primary' }, 'Close')),
    );
  }

  open(): void {
    this.el.showModal();
  }
}
