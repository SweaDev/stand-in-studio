import { h } from '../dom';

let uid = 0;

/** Labelled range input showing a percentage. */
export function percentSlider(
  label: string,
  id: string,
  value: number,
  onInput: (v: number) => void,
): { el: HTMLElement; set: (v: number) => void } {
  const out = h('output', { for: id }, `${Math.round(value * 100)}%`);
  const input = h('input', { type: 'range', id, min: 0, max: 100, step: 1, value: Math.round(value * 100) });
  input.addEventListener('input', () => {
    out.textContent = `${input.value}%`;
    onInput(Number(input.value) / 100);
  });
  return {
    el: h('div', { class: 'field' }, h('label', { for: id }, label, ' ', out), input),
    set: (v: number) => {
      input.value = String(Math.round(v * 100));
      out.textContent = `${input.value}%`;
    },
  };
}

/** Labelled checkbox toggle. */
export function toggle(
  label: string,
  id: string,
  checked: boolean,
  onChange: (v: boolean) => void,
  hint?: string,
): { el: HTMLElement; set: (v: boolean) => void } {
  const input = h('input', { type: 'checkbox', id, checked });
  input.addEventListener('change', () => onChange(input.checked));
  return {
    el: h(
      'div',
      { class: 'field toggle' },
      h('label', { for: id }, input, ' ', label),
      hint ? h('p', { class: 'hint' }, hint) : null,
    ),
    set: (v: boolean) => {
      input.checked = v;
    },
  };
}

/** Segmented single choice (radio inputs). */
export function choice<T extends string>(
  legend: string,
  options: readonly { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): { el: HTMLElement; set: (v: T) => void } {
  const name = `choice-${uid++}`;
  const inputs = options.map((o) => {
    const input = h('input', {
      type: 'radio',
      name,
      value: o.value,
      id: `${name}-${o.value}`,
      checked: o.value === value,
    });
    input.addEventListener('change', () => input.checked && onChange(o.value));
    return { o, input };
  });
  return {
    el: h(
      'fieldset',
      { class: 'field segmented' },
      h('legend', {}, legend),
      inputs.map(({ o, input }) => h('label', { for: input.id }, input, o.label)),
    ),
    set: (v: T) => inputs.forEach(({ o, input }) => (input.checked = o.value === v)),
  };
}
