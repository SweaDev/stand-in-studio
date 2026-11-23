import { expect, test } from '@playwright/test';
import { launchApp, passConsent, openTab } from './helpers';

test('settings panel changes the stage and persists only settings', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await openTab(control, 'stage');
    await control.getByLabel('Houseplant').check();
    await control.locator('#preset-75').click();
    await control.getByLabel('Beside').check();
    await control.getByLabel('High contrast').check();
    await openTab(control, 'auto');
    await control.getByLabel('Comfort shield').check();
    await openTab(control, 'stage');
    await control.getByLabel('Background #264653').click();

    await expect
      .poll(() =>
        control.evaluate(() => {
          const s = (window as any).__standin.engine.state;
          return s && [s.character, s.mode, s.layout, s.style.highContrast, s.background].join(',');
        }),
      )
      .toBe('houseplant,blend,beside,true,#264653');
    await expect.poll(() => control.locator('#presence-dial').getAttribute('aria-valuenow')).toBe('75');

    const saved = await control.evaluate(() => (window as any).studio.getSettings());
    expect(saved).toMatchObject({
      character: 'houseplant',
      background: '#264653',
      mode: 'blend',
      blend: { opacity: 0.75, layout: 'beside' },
      auto: { comfortShield: true },
      accessibility: { highContrast: true },
    });
    expect(Object.keys(saved).sort()).toEqual(
      [
        'accessibility',
        'advanced',
        'auto',
        'background',
        'blend',
        'camera',
        'character',
        'faceAnchor',
        'intentTuning',
        'mode',
        'presets',
        'onboarding',
        'recorded',
        'ui',
        'virtualCamera',
      ].sort(),
    );
    // Recorded clips and their telemetry live in the demo library, never in settings.
    expect(saved.recorded).toEqual({ libraryDir: null, saveBody: false, lastDemo: null });
    // Learned intent tuning is never saved unless the user opts in.
    expect(saved.intentTuning).toEqual({});
  } finally {
    await app.close();
  }
});
