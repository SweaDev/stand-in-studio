import { applyPreset, describePreset, presetFrom, withPreset, withoutPreset } from '../../../shared/presets';
import type { DeepPartial, Settings } from '../../../shared/settings';
import { type Component, h } from '../dom';

/** Per-meeting presets ("stand-up: Auto, listening 30%"). */
export class PresetPanel implements Component {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;

  constructor(
    private readonly get: () => Settings,
    private readonly update: (p: DeepPartial<Settings>) => void,
  ) {
    const name = h('input', {
      type: 'text',
      id: 'preset-name',
      placeholder: 'e.g. Stand-up',
      maxlength: 40,
      'aria-label': 'Preset name',
    });
    const save = h('button', { type: 'button', id: 'preset-save' }, 'Save current');
    save.addEventListener('click', () => {
      if (!name.value.trim()) return name.focus();
      this.update({ presets: withPreset(this.get().presets, presetFrom(this.get(), name.value)) });
      name.value = '';
    });
    this.list = h('ul', { class: 'presets-list', id: 'presets-list' });
    this.el = h(
      'div',
      { class: 'group', id: 'group-presets' },
      h('h3', {}, 'Meeting presets'),
      this.list,
      h('div', { class: 'row' }, name, save),
    );
    this.sync(get());
  }

  sync(s: Settings): void {
    this.list.replaceChildren(
      ...(s.presets.length === 0
        ? [h('li', { class: 'hint' }, 'Save your current mode and levels for a kind of meeting.')]
        : s.presets.map((p) =>
            h(
              'li',
              {},
              h('span', {}, h('strong', {}, p.name), ' · ', describePreset(p)),
              h(
                'span',
                { class: 'row' },
                h(
                  'button',
                  {
                    type: 'button',
                    'aria-label': `Apply ${p.name}`,
                    onclick: () => this.update(applyPreset(p)),
                  },
                  'Apply',
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    'aria-label': `Delete ${p.name}`,
                    onclick: () => this.update({ presets: withoutPreset(this.get().presets, p.name) }),
                  },
                  'Delete',
                ),
              ),
            ),
          )),
    );
  }
}
