import type { VcamStatus } from '../../../shared/vcam';
import { type Component, h } from '../dom';
import { icon } from '../icons';

export interface VirtualCameraActions {
  setEnabled(on: boolean): void;
  setup(): void;
}

/**
 * The native "Stand-In Camera" option: a toggle, its live status, the one-time setup
 * button and, if v4l2loopback is missing, the commands to install it.
 */
export class VirtualCameraPanel implements Component {
  readonly el: HTMLElement;
  private readonly toggle: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly setupBox: HTMLElement;
  private readonly setupBtn: HTMLButtonElement;
  private readonly installBox: HTMLElement;
  private readonly message: HTMLElement;

  constructor(enabled: boolean, a: VirtualCameraActions) {
    this.toggle = h('input', { type: 'checkbox', class: 'switch', id: 'vcam-toggle', checked: enabled });
    this.toggle.addEventListener('change', () => a.setEnabled(this.toggle.checked));
    this.status = h('span', { class: 'chip chip-muted', id: 'vcam-status', role: 'status' }, 'Checking…');
    this.setupBtn = h('button', { type: 'button', class: 'primary', id: 'vcam-setup' }, 'Set up camera');
    this.setupBtn.addEventListener('click', () => a.setup());
    this.setupBox = h(
      'div',
      { class: 'callout callout-info vcam-setup', hidden: true },
      icon('info'),
      h(
        'div',
        {},
        h(
          'p',
          {},
          h('strong', {}, 'One-time setup. '),
          'Adds a “Stand-In Camera” (and an “OBS Virtual Camera”, so OBS keeps working) that load at every start-up. Your system asks for your password once.',
        ),
        this.setupBtn,
      ),
    );
    this.installBox = h('div', { class: 'callout callout-warning vcam-install', hidden: true });
    this.message = h('p', { class: 'telemetry-status', id: 'vcam-message', role: 'status' });
    this.el = h(
      'div',
      { class: 'vcam', id: 'vcam' },
      h(
        'div',
        { class: 'vcam-head' },
        h(
          'label',
          { class: 'switch-wrap', for: 'vcam-toggle' },
          this.toggle,
          h('strong', {}, 'Stand-In Camera'),
          h('span', { class: 'hint' }, ' · a virtual webcam, no OBS needed'),
        ),
        this.status,
      ),
      h(
        'p',
        { class: 'hint' },
        'Pick “Stand-In Camera” as the camera in Meet, Zoom or Teams. It sends exactly what the Virtual Stage shows.',
      ),
      this.setupBox,
      this.installBox,
      this.message,
    );
  }

  setEnabled(on: boolean): void {
    this.toggle.checked = on;
  }

  setBusy(busy: boolean): void {
    this.setupBtn.disabled = busy;
    this.setupBtn.textContent = busy ? 'Waiting for your password…' : 'Set up camera';
  }

  say(text: string, tone: 'ok' | 'error' | '' = ''): void {
    this.message.textContent = text;
    this.message.className = `telemetry-status${tone ? ` is-${tone}` : ''}`;
  }

  update(s: VcamStatus, enabled: boolean): void {
    const chip = (text: string, cls: string) => {
      this.status.textContent = text;
      this.status.className = `chip ${cls}`;
    };
    if (s.state === 'live') chip(`Live · ${s.label ?? 'Stand-In Camera'}`, 'chip-ok');
    else if (!enabled) chip('Off', 'chip-muted');
    else if (s.state === 'ready') chip('Starting…', 'chip-muted');
    else if (s.state === 'needsSetup') chip('Needs one-time setup', 'chip-warning');
    else if (s.state === 'notInstalled') chip('v4l2loopback not installed', 'chip-warning');
    else chip('Not available', 'chip-muted');
    this.setupBox.hidden = !(enabled && s.state === 'needsSetup');
    this.installBox.hidden = !(enabled && s.state === 'notInstalled');
    if (!this.installBox.hidden && s.install) {
      this.installBox.replaceChildren(
        icon('warning'),
        h(
          'div',
          {},
          h(
            'p',
            {},
            'The Stand-In Camera needs the v4l2loopback kernel module (OBS’s virtual camera uses it too). Install it once, then press Check again:',
          ),
          h(
            'ul',
            { class: 'install-list' },
            ...s.install.map((i) => h('li', {}, h('span', {}, `${i.distro}: `), h('code', {}, i.command))),
          ),
          h(
            'p',
            { class: 'hint' },
            'With Secure Boot on, the installer asks you to enrol a signing key on the next reboot.',
          ),
          h('button', { type: 'button', class: 'btn-small', id: 'vcam-recheck' }, 'Check again'),
        ),
      );
    }
    if (s.error && s.state !== 'live') this.say(s.error, 'error');
  }

  onRecheck(fn: () => void): void {
    this.installBox.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'vcam-recheck') fn();
    });
  }
}
