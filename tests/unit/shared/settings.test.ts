import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { defaultIntents } from '../../../src/shared/intents';
import {
  DEFAULT_SETTINGS,
  needsCardio,
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
    expect(s.auto).toMatchObject({ max: 0.8, listening: 0.8, comfortShield: true, saveTuning: false });
    expect(s.auto.intents.map((i) => i.id)).toEqual(defaultIntents().map((i) => i.id));
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
    expect(s.auto).toMatchObject({ max: 1, listening: 0.25, comfortShield: false });
    expect(s.mode).toBe('camera');
    expect(updateSettings(s, { blend: { opacity: -1 } }).blend.opacity).toBe(0);
  });
});

describe('parseCaptureProfile', () => {
  it('parses width and height', () => {
    expect(parseCaptureProfile('960x540')).toEqual({ width: 960, height: 540 });
  });
});

describe('lowerProfile', () => {
  it('steps down one resolution at a time', async () => {
    const { lowerProfile } = await import('../../../src/shared/settings');
    expect(lowerProfile('1280x720')).toBe('960x540');
    expect(lowerProfile('960x540')).toBe('640x360');
    expect(lowerProfile('640x360')).toBeNull();
  });
});

describe('intent settings', () => {
  const tuning = {
    listening: { thresholds: { headTurn: 0.3 }, matched: 0.9, alsoMatched: {}, recordedAt: 5 },
  };

  it('keeps learned tuning only while the opt-in is on', () => {
    const on = updateSettings(DEFAULT_SETTINGS, { auto: { saveTuning: true }, intentTuning: tuning });
    expect(on.intentTuning.listening?.thresholds.headTurn).toBe(0.3);
    const off = updateSettings(on, { auto: { saveTuning: false } });
    expect(off.intentTuning).toEqual({});
    // Without the opt-in, tuning is never stored even if sent.
    expect(updateSettings(DEFAULT_SETTINGS, { intentTuning: tuning }).intentTuning).toEqual({});
  });

  it('stores custom intents and their order; drops tuning of deleted intents', () => {
    const custom = {
      id: 'custom-hand',
      name: 'Hand on chin',
      builtIn: false,
      enabled: true,
      action: 'cover' as const,
      conditions: [{ signal: 'headTilt' as const, states: ['down'] }],
      holdMs: 1_000,
    };
    const s = updateSettings(DEFAULT_SETTINGS, {
      auto: { intents: [custom, ...DEFAULT_SETTINGS.auto.intents], saveTuning: true },
      intentTuning: { 'custom-hand': { ...tuning.listening } },
    });
    expect(s.auto.intents[0]).toEqual(custom);
    expect(s.intentTuning['custom-hand']).toBeDefined();
    const removed = updateSettings(s, { auto: { intents: DEFAULT_SETTINGS.auto.intents } });
    expect(removed.intentTuning['custom-hand']).toBeUndefined();
  });

  it('developer mode defaults off and cardio is needed only by the shield or a body-signal intent', () => {
    expect(DEFAULT_SETTINGS.advanced.developerMode).toBe(false);
    expect(
      updateSettings(DEFAULT_SETTINGS, { advanced: { developerMode: true } }).advanced.developerMode,
    ).toBe(true);
    expect(needsCardio(DEFAULT_SETTINGS)).toBe(false);
    expect(needsCardio(updateSettings(DEFAULT_SETTINGS, { auto: { comfortShield: true } }))).toBe(true);
    const pulse = {
      id: 'custom-pulse',
      name: 'Stressed',
      builtIn: false,
      enabled: true,
      action: 'cover' as const,
      conditions: [{ signal: 'pulse' as const, states: ['raised'] }],
      holdMs: 700,
    };
    const s = updateSettings(DEFAULT_SETTINGS, {
      auto: { intents: [pulse, ...DEFAULT_SETTINGS.auto.intents] },
    });
    expect(needsCardio(s)).toBe(true);
    expect(needsCardio(updateSettings(s, { auto: { intents: [{ ...pulse, enabled: false }] } }))).toBe(false);
  });
});
