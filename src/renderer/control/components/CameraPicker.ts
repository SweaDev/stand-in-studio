import type { CameraDevice } from '../../../sensing/cameraFilter';
import { CAPTURE_PROFILES, type CaptureProfile } from '../../../shared/settings';
import { type Component, h } from '../dom';

/** Camera and capture-resolution selectors (virtual cameras are never listed). */
export class CameraPicker implements Component {
  readonly el: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly profile: HTMLSelectElement;

  constructor(onChange: (deviceId: string, profile: CaptureProfile) => void) {
    this.select = h('select', { id: 'camera-select', 'aria-label': 'Camera' });
    this.profile = h(
      'select',
      { id: 'profile-select', 'aria-label': 'Capture resolution' },
      CAPTURE_PROFILES.map((p) => h('option', { value: p }, p.replace('x', ' × '))),
    );
    const fire = () => onChange(this.select.value, this.profile.value as CaptureProfile);
    this.select.addEventListener('change', fire);
    this.profile.addEventListener('change', fire);
    this.el = h(
      'div',
      { class: 'field camera-picker' },
      h('label', { for: 'camera-select' }, 'Camera'),
      this.select,
      h('label', { for: 'profile-select' }, 'Resolution'),
      this.profile,
      h(
        'p',
        { class: 'hint' },
        'Only physical cameras are listed: OBS and other virtual cameras are hidden to avoid feedback loops.',
      ),
    );
  }

  setDevices(devices: CameraDevice[], selected: string | null, profile: CaptureProfile): void {
    this.select.replaceChildren(
      ...(devices.length > 0
        ? devices.map((d) => h('option', { value: d.deviceId, selected: d.deviceId === selected }, d.label))
        : [h('option', { value: '' }, 'No camera found')]),
    );
    this.select.disabled = devices.length === 0;
    this.profile.value = profile;
  }
}
