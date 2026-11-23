import type { InputStatus, Pill, Tone } from '../../../shared/inputStatus';
import type { VcamState } from '../../../shared/vcam';
import { type Component, h } from '../dom';
import { type IconName, icon } from '../icons';

export interface StatusBarActions {
  /** Opens the Camera tab (where the input is chosen). */
  showInput(): void;
  /** Privacy shutter: true turns the camera off. */
  setCameraOff(off: boolean): void;
  /** Turns Presage analysis off (true) or back on. */
  setPresageOff(off: boolean): void;
  /** Turns the Stand-In Camera on or off. */
  setVcam(on: boolean): void;
}

interface PillEl {
  el: HTMLButtonElement;
  text: HTMLElement;
  last: string;
}

const VCAM_TEXT: Record<VcamState, [string, Tone]> = {
  unsupported: ['', 'muted'],
  notInstalled: ['Stand-In Camera · not installed', 'warn'],
  needsSetup: ['Stand-In Camera · set up', 'warn'],
  ready: ['Stand-In Camera off', 'off'],
  live: ['Stand-In Camera on', 'live'],
};

/**
 * The header status bar: what the input is, whether the webcam is on, what Presage is
 * reading, and whether the Stand-In Camera is sending. Each pill is also its toggle.
 */
export class StatusBar implements Component {
  readonly el: HTMLElement;
  private readonly source: PillEl;
  private readonly camera: PillEl;
  private readonly presage: PillEl;
  private readonly vcam: PillEl;

  constructor(a: StatusBarActions) {
    const pill = (id: string, ico: IconName, onClick: (p: PillEl) => void): PillEl => {
      const text = h('span', { class: 'pill-text' });
      const el = h(
        'button',
        { type: 'button', class: 'pill', id: `pill-${id}` },
        h('span', { class: 'pill-dot', 'aria-hidden': 'true' }),
        icon(ico, 15),
        text,
      );
      const p: PillEl = { el, text, last: '' };
      el.addEventListener('click', () => onClick(p));
      return p;
    };
    this.source = pill('source', 'video', () => a.showInput());
    this.camera = pill('camera', 'camera', (p) =>
      a.setCameraOff(p.el.getAttribute('aria-pressed') === 'true'),
    );
    this.presage = pill('presage', 'scan', (p) =>
      a.setPresageOff(p.el.getAttribute('aria-pressed') === 'true'),
    );
    this.vcam = pill('vcam', 'broadcast', (p) => a.setVcam(p.el.getAttribute('aria-pressed') !== 'true'));
    this.vcam.el.hidden = true;
    this.el = h(
      'div',
      { class: 'status-bar', role: 'group', 'aria-label': 'Input and output status' },
      this.source.el,
      this.camera.el,
      this.presage.el,
      this.vcam.el,
    );
  }

  private apply(p: PillEl, pill: Pill, pressed: boolean | null, disabled = false): void {
    const key = `${pill.text}|${pill.tone}|${pressed}|${disabled}`;
    if (key === p.last) return;
    p.last = key;
    p.text.textContent = pill.text;
    p.el.dataset.tone = pill.tone;
    p.el.title = pill.detail;
    p.el.setAttribute('aria-label', pill.detail);
    if (pressed === null) p.el.removeAttribute('aria-pressed');
    else p.el.setAttribute('aria-pressed', String(pressed));
    p.el.disabled = disabled;
  }

  /** Updates every pill (cheap: only touches the DOM when something changed). */
  update(s: InputStatus, cameraInUse: boolean, vcam: { state: VcamState; enabled: boolean }): void {
    // With the camera as input, the camera and Presage pills already say it all.
    this.source.el.hidden = cameraInUse;
    if (!cameraInUse) this.apply(this.source, s.source, null);
    this.camera.el.hidden = !cameraInUse;
    if (cameraInUse) {
      const on = s.camera.tone === 'live';
      this.apply(
        this.camera,
        { ...s.camera, detail: `${s.camera.detail}. Click to turn the camera ${on ? 'off' : 'on'}.` },
        on,
      );
    }
    const analysing = s.presage.tone === 'live';
    this.apply(
      this.presage,
      s.presageToggle
        ? {
            ...s.presage,
            detail: `${s.presage.detail}. Click to turn Presage ${analysing || s.presage.tone === 'muted' ? 'off' : 'on'}.`,
          }
        : s.presage,
      s.presageToggle ? s.presage.tone !== 'off' : null,
      !s.presageToggle,
    );
    this.presage.el.classList.toggle('is-analysing', s.analysing);
    this.vcam.el.hidden = vcam.state === 'unsupported';
    if (vcam.state !== 'unsupported') {
      const [text, tone] = VCAM_TEXT[vcam.state];
      const detail =
        vcam.state === 'live'
          ? 'The Stand-In Camera is sending the Virtual Stage to your meeting. Click to stop it.'
          : vcam.state === 'ready'
            ? 'The Stand-In Camera is off. Click to start it.'
            : 'The Stand-In Camera needs a one-time setup: click to see how.';
      this.apply(
        this.vcam,
        { text, tone, detail },
        vcam.state === 'ready' || vcam.state === 'live' ? vcam.state === 'live' : null,
      );
    }
  }
}
