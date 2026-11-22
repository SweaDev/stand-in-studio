import { type Component, h } from '../dom';

export interface TabSpec {
  id: string;
  label: string;
  content: (HTMLElement | null)[];
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys, Home and End move between tabs,
 * and only the selected panel is in the tab order.
 */
export class SettingsTabs implements Component {
  readonly el: HTMLElement;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly panels: HTMLElement[] = [];
  private readonly listeners: ((id: string) => void)[] = [];

  constructor(specs: readonly TabSpec[], selected = specs[0]?.id) {
    const list = h('div', { class: 'tablist', role: 'tablist', 'aria-label': 'Settings' });
    for (const s of specs) {
      const tab = h(
        'button',
        {
          type: 'button',
          role: 'tab',
          id: `tab-${s.id}`,
          class: 'tab',
          'aria-controls': `panel-${s.id}`,
        },
        s.label,
      );
      tab.addEventListener('click', () => this.select(s.id, true));
      tab.addEventListener('keydown', (e) => this.onKey(e as KeyboardEvent));
      const panel = h(
        'div',
        {
          role: 'tabpanel',
          id: `panel-${s.id}`,
          class: 'tabpanel',
          'aria-labelledby': `tab-${s.id}`,
          tabindex: 0,
        },
        ...s.content,
      );
      list.append(tab);
      this.tabs.push(tab);
      this.panels.push(panel);
    }
    this.el = h('div', { class: 'tabs' }, list, ...this.panels);
    if (selected) this.select(selected);
  }

  onSelect(fn: (id: string) => void): void {
    this.listeners.push(fn);
  }

  get selected(): string {
    return this.tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.id.replace(/^tab-/, '') ?? '';
  }

  select(id: string, focus = false): void {
    this.tabs.forEach((t, i) => {
      const on = t.id === `tab-${id}`;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      (this.panels[i] as HTMLElement).hidden = !on;
      if (on && focus) t.focus();
    });
    this.listeners.forEach((fn) => fn(id));
  }

  private onKey(e: KeyboardEvent): void {
    const i = this.tabs.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    const n = this.tabs.length;
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    this.select((this.tabs[next] as HTMLElement).id.replace(/^tab-/, ''), true);
  }
}
