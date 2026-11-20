import { type Component, h } from '../dom';

/** A dismissible status line for sensing problems, with an optional action. */
export class StatusBanner implements Component {
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly action: HTMLButtonElement;
  private onAction: (() => void) | null = null;

  constructor() {
    this.text = h('span', { id: 'status-text' });
    this.action = h('button', { type: 'button', id: 'status-action', hidden: true });
    this.action.addEventListener('click', () => this.onAction?.());
    this.el = h(
      'div',
      { class: 'banner', id: 'status-banner', role: 'alert', hidden: true },
      this.text,
      this.action,
    );
  }

  show(message: string, action?: { label: string; run: () => void }): void {
    this.text.textContent = message;
    this.action.hidden = !action;
    this.action.textContent = action?.label ?? '';
    this.onAction = action?.run ?? null;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
