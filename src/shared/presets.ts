import type { DeepPartial, MeetingPreset, Settings } from './settings';

/** Captures the current mode and levels as a named preset (same name replaces). */
export function presetFrom(s: Settings, name: string): MeetingPreset {
  return {
    name: name.trim().slice(0, 40),
    mode: s.mode,
    blendOpacity: s.blend.opacity,
    autoMax: s.auto.max,
    autoListening: s.auto.listening,
  };
}

export function withPreset(list: readonly MeetingPreset[], p: MeetingPreset): MeetingPreset[] {
  return [...list.filter((x) => x.name !== p.name), p];
}

export function withoutPreset(list: readonly MeetingPreset[], name: string): MeetingPreset[] {
  return list.filter((x) => x.name !== name);
}

/** Settings patch that applies a preset. */
export function applyPreset(p: MeetingPreset): DeepPartial<Settings> {
  return {
    mode: p.mode,
    blend: { opacity: p.blendOpacity },
    auto: { max: p.autoMax, listening: Math.min(p.autoListening, p.autoMax) },
  };
}

export function describePreset(p: MeetingPreset): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (p.mode === 'auto') return `Auto, listening ${pct(p.autoListening)}, max ${pct(p.autoMax)}`;
  if (p.mode === 'blend') return `Blend ${pct(p.blendOpacity)}`;
  return p.mode === 'camera' ? 'Camera' : 'Character';
}
