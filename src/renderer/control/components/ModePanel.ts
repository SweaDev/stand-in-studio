import { listCharacters } from '../../../render/characters';
import { BACKGROUNDS, type DeepPartial, type Settings } from '../../../shared/settings';
import type { BlendLayout, CharacterId } from '../../../shared/types';
import { type Component, h } from '../dom';
import { choice, percentSlider, toggle } from './fields';

export interface ModePanelActions {
  update(patch: DeepPartial<Settings>): void;
  /** Blend opacity changes act like turning the dial (they switch to Blend). */
  setBlend(v: number): void;
}

/** Settings for each mode, the character, and accessibility (REQUIREMENT §2–§3, §5). */
export class ModePanel implements Component {
  readonly el: HTMLElement;
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
    this.syncers.push((x) => {
      reduced.set(x.accessibility.reducedMotion);
      contrast.set(x.accessibility.highContrast);
    });

    const group = (title: string, id: string, ...children: HTMLElement[]) =>
      h('div', { class: 'group', id }, h('h3', {}, title), ...children);
    this.el = h(
      'div',
      { class: 'mode-panel' },
      group('Character', 'group-character', character.el, swatches),
      group('Blend', 'group-blend', blend.el, presets, layout.el),
      group('Auto', 'group-auto', max.el, listening.el, shield.el),
      group('Camera', 'group-camera', badge.el),
      group('Accessibility', 'group-a11y', reduced.el, contrast.el),
    );
    this.sync(s);
  }

  /** Reflects settings changed elsewhere (dial, hotkeys, presets). */
  sync(s: Settings): void {
    this.syncers.forEach((fn) => fn(s));
  }
}
