import { type ApiKeyStatus, EXTERNAL_LINKS, type StudioApi } from '../../../shared/ipc';
import { type Component, h } from '../dom';

function describe(s: ApiKeyStatus): string {
  if (s.source === 'env') return 'Using the key from the PRESAGE_API_KEY environment variable.';
  if (s.source === 'pasted') return 'Using a pasted key, kept in memory until you quit.';
  return 'No key: Demo mode only.';
}

/**
 * Paste a Presage API key. It goes straight to the main process and is kept in memory
 * only; the field is cleared and the key is never shown again.
 */
export class ApiKeyPanel implements Component {
  readonly el: HTMLElement;
  private readonly status: HTMLElement;
  private readonly restart: HTMLButtonElement;

  constructor(
    private readonly api: StudioApi,
    usingCamera: boolean,
    onRestart: () => void,
  ) {
    this.status = h('p', { class: 'hint', id: 'api-key-status', 'aria-live': 'polite' });
    const input = h('input', {
      type: 'password',
      id: 'api-key-input',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Paste your Presage API key',
      'aria-label': 'Presage API key',
    });
    const save = h('button', { type: 'button', id: 'api-key-save' }, 'Use key');
    const clear = h('button', { type: 'button', id: 'api-key-clear' }, 'Forget pasted key');
    this.restart = h(
      'button',
      {
        type: 'button',
        class: 'primary',
        id: 'api-key-restart',
        hidden: true,
        onclick: () => onRestart(),
      },
      'Restart with my camera',
    );
    save.addEventListener('click', async () => {
      const s = await api.setApiKey(input.value);
      input.value = '';
      this.show(s, usingCamera);
    });
    clear.addEventListener('click', async () => this.show(await api.clearApiKey(), usingCamera));
    this.el = h(
      'div',
      { class: 'group', id: 'group-api-key' },
      h('h3', {}, 'Presage API key'),
      this.status,
      h('div', { class: 'row' }, input, save),
      h('div', { class: 'row' }, clear, this.restart),
      h(
        'p',
        { class: 'hint' },
        'Never saved to disk and never sent to the page. Get a key at ',
        h(
          'a',
          {
            href: EXTERNAL_LINKS.presageKey,
            onclick: (e: Event) => (e.preventDefault(), void api.openExternal(EXTERNAL_LINKS.presageKey)),
          },
          'physiology.presagetech.com',
        ),
        '.',
      ),
    );
    void api.apiKeyStatus().then((s) => this.show(s, usingCamera));
  }

  private show(s: ApiKeyStatus, usingCamera: boolean): void {
    this.status.textContent = describe(s);
    this.restart.hidden = usingCamera || !s.available;
  }
}
