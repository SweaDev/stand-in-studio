import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_SETTINGS,
  parseCaptureProfile,
  sanitizeSettings,
  updateSettings,
} from '../../../src/shared/settings';

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and clamps ranges', () => {
    const s = sanitizeSettings({
      character: 'houseplant',
      background: '#112233',
      mode: 'blend',
      blend: { opacity: 7, layout: 'beside' },
      auto: { max: 0.8, listening: 0.95, comfortShield: true },
      camera: { badge: true, deviceId: 'abc', profile: '640x360' },
      accessibility: { reducedMotion: true, highContrast: true },
      apiKey: 'must-not-survive',
    });
    expect(s.character).toBe('houseplant');
    expect(s.blend).toEqual({ opacity: 1, layout: 'beside' });
    expect(s.auto).toEqual({ max: 0.8, listening: 0.8, comfortShield: true });
    expect(s.camera).toEqual({ badge: true, deviceId: 'abc', profile: '640x360' });
    expect(s.accessibility).toEqual({ reducedMotion: true, highContrast: true });
    expect('apiKey' in s).toBe(false);
  });

  it('rejects bad enums and colours', () => {
    const s = sanitizeSettings({ character: 'dragon', mode: 'x', background: 'red' });
    expect(s.character).toBe(DEFAULT_SETTINGS.character);
    expect(s.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(s.background).toBe(DEFAULT_SETTINGS.background);
  });

  it('sanitizes presets', () => {
    const s = sanitizeSettings({
      presets: [{ name: '  Stand-up ', mode: 'auto', autoListening: 0.3 }, { name: '' }, 'bad'],
    });
    expect(s.presets).toEqual([
      { name: 'Stand-up', mode: 'auto', blendOpacity: 0.5, autoMax: 1, autoListening: 0.3 },
    ]);
  });

  it('always yields a valid shape (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const s = sanitizeSettings(raw);
        expect(s.auto.listening).toBeLessThanOrEqual(s.auto.max);
        for (const v of [s.blend.opacity, s.auto.max, s.auto.listening]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(sanitizeSettings(s)).toEqual(s); // idempotent
      }),
    );
  });
});

describe('updateSettings', () => {
  it('deep-merges nested groups and revalidates', () => {
    const s = updateSettings(DEFAULT_SETTINGS, { auto: { listening: 0.25 }, mode: 'camera' });
    expect(s.auto).toEqual({ max: 1, listening: 0.25, comfortShield: false });
    expect(s.mode).toBe('camera');
    expect(updateSettings(s, { blend: { opacity: -1 } }).blend.opacity).toBe(0);
  });
});

describe('parseCaptureProfile', () => {
  it('parses width and height', () => {
    expect(parseCaptureProfile('960x540')).toEqual({ width: 960, height: 540 });
  });
});
