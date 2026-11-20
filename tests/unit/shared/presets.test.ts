import { describe, expect, it } from 'vitest';
import {
  applyPreset,
  describePreset,
  presetFrom,
  withPreset,
  withoutPreset,
} from '../../../src/shared/presets';
import { DEFAULT_SETTINGS, updateSettings } from '../../../src/shared/settings';

describe('presets', () => {
  it('captures, replaces, removes and applies presets', () => {
    const s = updateSettings(DEFAULT_SETTINGS, { mode: 'auto', auto: { listening: 0.3 } });
    const p = presetFrom(s, '  Stand-up ');
    expect(p).toEqual({ name: 'Stand-up', mode: 'auto', blendOpacity: 0.5, autoMax: 1, autoListening: 0.3 });
    let list = withPreset([], p);
    list = withPreset(list, { ...p, autoListening: 0.2 });
    expect(list).toHaveLength(1);
    expect(list[0]?.autoListening).toBe(0.2);
    expect(applyPreset(p)).toEqual({
      mode: 'auto',
      blend: { opacity: 0.5 },
      auto: { max: 1, listening: 0.3 },
    });
    expect(withoutPreset(list, 'Stand-up')).toEqual([]);
  });
  it('describes presets', () => {
    const base = { name: 'x', blendOpacity: 0.25, autoMax: 0.8, autoListening: 0.3 };
    expect(describePreset({ ...base, mode: 'auto' })).toBe('Auto, listening 30%, max 80%');
    expect(describePreset({ ...base, mode: 'blend' })).toBe('Blend 25%');
    expect(describePreset({ ...base, mode: 'camera' })).toBe('Camera');
    expect(describePreset({ ...base, mode: 'character' })).toBe('Character');
  });
});
