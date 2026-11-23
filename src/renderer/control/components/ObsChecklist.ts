import { STAGE_WINDOW_TITLE } from '../../../shared/app';
import { EXTERNAL_LINKS } from '../../../shared/ipc';
import { type Component, h } from '../dom';

function captureSourceName(platform: string): string {
  if (platform === 'darwin') return 'macOS Screen Capture (method: Window Capture)';
  if (platform === 'linux') return 'Window Capture (Xcomposite), or Screen Capture (PipeWire) on Wayland';
  return 'Window Capture';
}

/**
 * The in-app 3-step OBS checklist (REQUIREMENT §7), with a Test pattern so you can
 * confirm the meeting sees the stage. The fallback is sharing the stage window.
 */
export class ObsChecklist implements Component {
  readonly el: HTMLElement;
  private readonly testBtn: HTMLButtonElement;

  /** The OBS steps (collapsible: optional when the Stand-In Camera is live). */
  readonly obsDetails: HTMLDetailsElement;

  constructor(
    platform: string,
    openExternal: (url: string) => void,
    onTestPattern: (on: boolean) => void,
    /** The native Stand-In Camera section, shown first (null: not offered). */
    nativeCamera: HTMLElement | null = null,
  ) {
    const link = (url: string, text: string) =>
      h('a', { href: url, onclick: (e: Event) => (e.preventDefault(), openExternal(url)) }, text);
    const step = (n: number, title: string, ...body: (Node | string | null)[]) =>
      h(
        'li',
        {},
        h(
          'label',
          { class: 'step' },
          h('input', { type: 'checkbox', id: `obs-step-${n}` }),
          h('strong', {}, title),
        ),
        h('div', { class: 'step-body' }, ...body),
      );
    let on = false;
    this.testBtn = h(
      'button',
      { type: 'button', id: 'test-pattern', 'aria-pressed': 'false' },
      'Show test pattern',
    );
    this.testBtn.addEventListener('click', () => {
      on = !on;
      this.testBtn.setAttribute('aria-pressed', String(on));
      this.testBtn.textContent = on ? 'Hide test pattern' : 'Show test pattern';
      onTestPattern(on);
    });
    this.el = h(
      'div',
      { class: 'obs' },
      h('h3', {}, 'Send the stage to your meeting'),
      nativeCamera,
      (this.obsDetails = h(
        'details',
        { class: 'obs-option', id: 'obs-option', open: true },
        h('summary', {}, nativeCamera ? 'Or use OBS Studio (any platform)' : 'With OBS Studio'),
        h(
          'ol',
          {},
          step(
            1,
            'Capture the stage in OBS Studio',
            'In ',
            link(EXTERNAL_LINKS.obs, 'OBS Studio'),
            `, add a source: ${captureSourceName(platform)}, and choose the window “${STAGE_WINDOW_TITLE}”. Fit it to the canvas (Ctrl+F in OBS).`,
            h(
              'p',
              { class: 'hint obs-renamed' },
              'Set up OBS before version 1.4? The window was called “Stand-In Stage”: pick it again under its new name.',
            ),
          ),
          step(
            2,
            'Start Virtual Camera',
            'Click “Start Virtual Camera” in OBS.',
            platform === 'linux'
              ? h(
                  'p',
                  { class: 'hint' },
                  'Linux: OBS needs the ',
                  link(EXTERNAL_LINKS.v4l2loopback, 'v4l2loopback'),
                  ' kernel module (Ubuntu: sudo apt install v4l2loopback-dkms).',
                )
              : null,
          ),
          step(
            3,
            'Pick “OBS Virtual Camera” in your meeting app',
            'In Zoom, Meet or Teams, choose OBS Virtual Camera as your camera. The meeting never touches your real webcam, so there is no camera conflict.',
          ),
        ),
      )),
      h('div', { class: 'row' }, this.testBtn),
      h(
        'p',
        { class: 'hint' },
        `Or share the “${STAGE_WINDOW_TITLE}” window as a screen share instead (any platform, no setup).`,
      ),
    );
  }
}
