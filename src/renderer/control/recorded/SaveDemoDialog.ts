import { MAX_DEMO_NAME } from '../../../shared/demos';
import { type Component, h } from '../dom';
import { icon } from '../icons';

export interface SaveDemoChoice {
  name: string;
  includeBody: boolean;
}

/**
 * Asked before every save: what will be written, where, and whether pulse and breathing
 * are included (off unless ticked). Resolves null when cancelled.
 */
export class SaveDemoDialog implements Component {
  readonly el: HTMLDialogElement;
  private readonly nameInput: HTMLInputElement;
  private readonly body: HTMLInputElement;
  private readonly where: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly okBtn: HTMLButtonElement;
  private resolve: ((c: SaveDemoChoice | null) => void) | null = null;

  constructor() {
    this.nameInput = h('input', { id: 'demo-name', maxlength: MAX_DEMO_NAME, autocomplete: 'off' });
    this.body = h('input', { type: 'checkbox', id: 'demo-include-body' });
    this.where = h('code', { id: 'demo-save-where' });
    this.heading = h('h2', { id: 'save-demo-title' }, 'Save as a demo');
    this.okBtn = h('button', { type: 'button', class: 'primary', id: 'demo-save-confirm' }, 'Save');
    this.okBtn.addEventListener('click', () => this.finish(true));
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.finish(true);
    });
    this.el = h(
      'dialog',
      { class: 'save-demo', id: 'save-demo', 'aria-labelledby': 'save-demo-title' },
      this.heading,
      h(
        'div',
        { class: 'callout callout-warning', role: 'note' },
        icon('warning'),
        h(
          'div',
          {},
          h('p', {}, h('strong', {}, 'Privacy: '), 'this saves on this computer, in your demo library:'),
          h(
            'ul',
            {},
            h('li', {}, 'the video clip itself (your face, room and anything else in view);'),
            h(
              'li',
              {},
              'the signals Presage returned for it: face landmarks (the geometry of your face), talking, blinking, expressions and whether a face is in view.',
            ),
          ),
          h(
            'p',
            {},
            'Nothing is uploaded. Anyone who can read the folder can watch the clip and read the signals. You can delete a demo at any time in Advanced → Demo library.',
          ),
        ),
      ),
      h('p', { class: 'hint' }, 'Folder: ', this.where),
      h('div', { class: 'field' }, h('label', { for: 'demo-name' }, 'Name'), this.nameInput),
      h(
        'div',
        { class: 'field toggle' },
        h('label', { for: 'demo-include-body' }, this.body, ' Also save pulse and breathing rate'),
        h(
          'p',
          { class: 'hint' },
          'Off by default. These are health-related readings: only include them if you need them to test a body-signal intent or the Comfort shield. Presage is asked for them only while this demo is being recorded.',
        ),
      ),
      h(
        'div',
        { class: 'row dialog-actions' },
        h('button', { type: 'button', id: 'demo-save-cancel', onclick: () => this.finish(false) }, 'Cancel'),
        this.okBtn,
      ),
    );
    this.el.addEventListener('cancel', (e) => {
      e.preventDefault();
      this.finish(false);
    });
  }

  ask(opts: {
    title: string;
    action: string;
    name: string;
    folder: string;
    includeBody: boolean;
  }): Promise<SaveDemoChoice | null> {
    this.heading.textContent = opts.title;
    this.okBtn.textContent = opts.action;
    this.nameInput.value = opts.name;
    this.body.checked = opts.includeBody;
    this.where.textContent = opts.folder;
    if (!this.el.open) this.el.showModal();
    this.nameInput.select();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private finish(ok: boolean): void {
    const r = this.resolve;
    this.resolve = null;
    if (this.el.open) this.el.close();
    r?.(ok ? { name: this.nameInput.value.trim() || 'Untitled demo', includeBody: this.body.checked } : null);
  }
}
