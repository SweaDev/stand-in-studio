import { listCharacters } from '../../../render/characters';
import { BACKGROUNDS, type DeepPartial, type Settings } from '../../../shared/settings';
import type { BlendLayout, CharacterId } from '../../../shared/types';
import { type Component, h } from '../dom';
import { choice, percentSlider, rangeSlider, toggle } from './fields';

export interface ModePanelActions {
  update(patch: DeepPartial<Settings>): void;
  /** Blend opacity changes act like turning the dial (they switch to Blend). */
  setBlend(v: number): void;
}

/** Settings for each mode, the character, and accessibility (REQUIREMENT §2–§3, §5). */
export class ModePanel implements Component {
  readonly el: HTMLElement;
  /** Each settings group, so the tabs can place them. */
  readonly groups: Record<'character' | 'blend' | 'auto' | 'camera' | 'a11y', HTMLElement>;
  private readonly syncers: ((s: Settings) => void)[] = [];

  constructor(s: Settings, a: ModePanelActions) {
    // Blend
    const blend = percentSlider('Blend opacity', 'blend-opacity', s.blend.opacity, (v) => a.setBlend(v));
    const presets = h(
      'div',
      { class: 'row presets', role: 'group', 'aria-label': 'Blend presets' },
      [0.25, 0.5, 0.75].map((v) =>
        h('button', { type: 'button', id: `preset-${v * 100}`, onclick: () => a.setBlend(v) }, `${v * 100}%`),
      ),
    );
    const layout = choice<BlendLayout>(
      'Layout',
      [
        { value: 'over', label: 'Over' },
        { value: 'beside', label: 'Beside' },
      ],
      s.blend.layout,
      (v) => a.update({ blend: { layout: v } }),
    );
    this.syncers.push((x) => {
      blend.set(x.blend.opacity);
      layout.set(x.blend.layout);
    });

    // Auto
    const max = percentSlider('Your max', 'auto-max', s.auto.max, (v) => a.update({ auto: { max: v } }));
    const listening = percentSlider('Listening level', 'auto-listening', s.auto.listening, (v) =>
      a.update({ auto: { listening: v } }),
    );
    const shield = toggle(
      'Comfort shield',
      'comfort-shield',
      s.auto.comfortShield,
      (v) => a.update({ auto: { comfortShield: v } }),
      'Opt-in. Requests pulse and breathing rate, and only ever lowers your video (to at most 15%) while they run well above your own baseline. No numbers are shown or sent.',
    );
    this.syncers.push((x) => {
      max.set(x.auto.max);
      listening.set(x.auto.listening);
      shield.set(x.auto.comfortShield);
    });

    // Camera
    const badge = toggle('Character badge in Camera mode', 'camera-badge', s.camera.badge, (v) =>
      a.update({ camera: { badge: v } }),
    );
    this.syncers.push((x) => badge.set(x.camera.badge));

    // Character and background
    const character = choice<CharacterId>(
      'Character',
      listCharacters().map((c) => ({ value: c.id, label: c.name })),
      s.character,
      (v) => a.update({ character: v }),
    );
    const swatches = h(
      'div',
      { class: 'row swatches', role: 'group', 'aria-label': 'Background colour' },
      BACKGROUNDS.map((c) =>
        h('button', {
          type: 'button',
          class: 'swatch',
          style: `background:${c}`,
          'aria-label': `Background ${c}`,
          'data-colour': c,
          onclick: () => a.update({ background: c }),
        }),
      ),
    );
    // Over your face (Blend and Auto)
    const follow = toggle(
      'Follow my face',
      'face-follow',
      s.faceAnchor.follow,
      (v) => a.update({ faceAnchor: { follow: v } }),
      'In Blend and Auto the character sits over your face, using the face position Presage reads. Its opacity mirrors the dial.',
    );
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
    const faceSize = rangeSlider(
      'Size (100% covers your face)',
      'face-size',
      { value: s.faceAnchor.size, min: 0.25, max: 1, step: 0.05, format: pct },
      (v) => a.update({ faceAnchor: { size: v } }),
    );
    const faceOpacity = percentSlider('Opacity over face', 'face-opacity', s.faceAnchor.opacity, (v) =>
      a.update({ faceAnchor: { opacity: v } }),
    );
    const offsetX = rangeSlider(
      'Left / right',
      'face-offset-x',
      { value: s.faceAnchor.offsetX, min: -1, max: 1, step: 0.05, format: signed },
      (v) => a.update({ faceAnchor: { offsetX: v } }),
    );
    const offsetY = rangeSlider(
      'Up / down',
      'face-offset-y',
      { value: s.faceAnchor.offsetY, min: -1, max: 1, step: 0.05, format: signed },
      (v) => a.update({ faceAnchor: { offsetY: v } }),
    );
    const faceTuning = h(
      'div',
      { class: 'face-anchor', id: 'face-anchor-options' },
      faceSize.el,
      faceOpacity.el,
      offsetX.el,
      offsetY.el,
      h(
        'button',
        {
          type: 'button',
          class: 'btn-small',
          id: 'face-reset',
          onclick: () => a.update({ faceAnchor: { size: 1, offsetX: 0, offsetY: 0, opacity: 1 } }),
        },
        'Reset position',
      ),
    );
    this.syncers.push((x) => {
      follow.set(x.faceAnchor.follow);
      faceSize.set(x.faceAnchor.size);
      faceOpacity.set(x.faceAnchor.opacity);
      offsetX.set(x.faceAnchor.offsetX);
      offsetY.set(x.faceAnchor.offsetY);
      faceTuning.hidden = !x.faceAnchor.follow;
    });

    this.syncers.push((x) => {
      character.set(x.character);
      swatches
        .querySelectorAll('button')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.colour === x.background)));
    });

    // Accessibility
    const reduced = toggle(
      'Reduced motion',
      'reduced-motion',
      s.accessibility.reducedMotion,
      (v) => a.update({ accessibility: { reducedMotion: v } }),
      'Half the movement, no sparkles.',
    );
    const contrast = toggle(
      'High contrast',
      'high-contrast',
      s.accessibility.highContrast,
      (v) => a.update({ accessibility: { highContrast: v } }),
      'Thick outlines on a flat background.',
    );
    const lipReading = toggle(
      'Lip-reading zoom (Auto)',
      'lip-reading',
      s.accessibility.lipReading,
      (v) => a.update({ accessibility: { lipReading: v } }),
      'For people who read lips: while Auto shows you talking to the meeting, your face is shown at 100% (above Your max) and zoomed in, and the character steps aside to a corner. Off by default.',
    );
    this.syncers.push((x) => {
      reduced.set(x.accessibility.reducedMotion);
      contrast.set(x.accessibility.highContrast);
      lipReading.set(x.accessibility.lipReading);
    });

    const group = (title: string, id: string, ...children: HTMLElement[]) =>
      h('div', { class: 'group', id }, h('h3', {}, title), ...children);
    this.groups = {
      character: group('Character', 'group-character', character.el, swatches, follow.el, faceTuning),
      blend: group('Blend', 'group-blend', blend.el, presets, layout.el),
      auto: group('Auto levels', 'group-auto', max.el, listening.el, shield.el),
      camera: group('Camera mode', 'group-camera', badge.el),
      a11y: group('Accessibility', 'group-a11y', reduced.el, contrast.el, lipReading.el),
    };
    this.el = h('div', { class: 'mode-panel' }, ...Object.values(this.groups));
    this.sync(s);
  }

  /** Reflects settings changed elsewhere (dial, hotkeys, presets). */
  sync(s: Settings): void {
    this.syncers.forEach((fn) => fn(s));
  }
}
