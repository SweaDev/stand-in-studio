import { expect, test } from '@playwright/test';
import { launchApp, openTab, passConsent } from './helpers';

test('the main window shows the essentials by default; Advanced → Interface shows the rest, and it is saved', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    // Essentials: dial, modes, Hide me, status bar.
    await expect(control.locator('#presence-dial')).toBeVisible();
    await expect(control.locator('#cmd-hideMe')).toBeVisible();
    await expect(control.locator('#pill-source')).toBeVisible();
    // Hidden by default: the other override buttons and the intent list.
    for (const id of ['cmd-pin', 'cmd-raiseHand', 'cmd-backSoon', 'cmd-cycleMode'])
      await expect(control.locator(`#${id}`)).toBeHidden();
    await expect(control.locator('#group-intents')).toBeHidden();
    await expect(control.locator('#current-intent')).toBeVisible();
    // Shown by default: calibration, ways to send the stage, presets.
    await expect(control.locator('.obs')).toBeVisible();

    await openTab(control, 'advanced');
    await control.check('#ui-overrides');
    await control.check('#ui-intents');
    await control.uncheck('#ui-meetingSetup');
    await expect(control.locator('#cmd-pin')).toBeVisible();
    await expect(control.locator('.obs')).toBeHidden();
    await openTab(control, 'auto');
    await expect(control.locator('#group-intents')).toBeVisible();
    const saved = await control.evaluate(() => (window as any).studio.getSettings());
    expect(saved.ui).toEqual({
      overrides: true,
      intents: true,
      tuning: true,
      meetingSetup: false,
      presets: true,
    });
  } finally {
    await app.close();
  }
});

test('creating a custom intent from Advanced reveals the intent list', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await openTab(control, 'advanced');
    await control.click('#create-intent');
    await expect(control.locator('#ui-intents')).toBeChecked();
    await expect(control.locator('#group-intents')).toHaveCount(1);
    await expect
      .poll(() => control.evaluate(() => (window as any).studio.getSettings().then((s: any) => s.ui.intents)))
      .toBe(true);
  } finally {
    await app.close();
  }
});
