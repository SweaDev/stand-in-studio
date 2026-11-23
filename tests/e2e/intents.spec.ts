import { expect, type Page, test } from '@playwright/test';
import { launchApp, openTab, passConsent, showAllUi } from './helpers';

const saved = (control: Page) => control.evaluate(() => (window as any).studio.getSettings());

test('Auto tab shows the active intent and lets you change, reorder and disable intents', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await showAllUi(control);
    await expect(control.locator('#tab-auto')).toHaveAttribute('aria-selected', 'true');
    // Demo: listening quietly → "Listening to others", highlighted in the list.
    await expect(control.locator('#current-intent')).toHaveText('Listening to others', { timeout: 15_000 });
    await expect(control.locator('#intent-listening')).toHaveClass(/is-active/);
    await expect(control.locator('#intent-conflicts-summary')).toHaveText(
      'No conflicts between enabled intents.',
    );

    // Hold T (talk) in Demo: Talking in the meeting takes over.
    await control.keyboard.down('t');
    await expect(control.locator('#current-intent')).toHaveText('Talking in the meeting', { timeout: 5_000 });
    await control.keyboard.up('t');

    // Change an action and persist it.
    await control.locator('#intent-eating').getByText('Back soon').click();
    await expect
      .poll(async () => (await saved(control)).auto.intents.find((i: any) => i.id === 'eating').action)
      .toBe('backSoon');

    // Reorder: move Listening up one place.
    await control.getByRole('button', { name: 'Move Listening to others up' }).click();
    await expect
      .poll(async () => (await saved(control)).auto.intents.map((i: any) => i.id).slice(-2))
      .toEqual(['listening', 'talkingInMeeting']);

    // Disable an intent.
    await control.getByLabel('Someone else in view enabled').uncheck();
    await expect
      .poll(async () => (await saved(control)).auto.intents.find((i: any) => i.id === 'someoneElse').enabled)
      .toBe(false);

    // Tabs are keyboard operable.
    await control.locator('#tab-auto').focus();
    await control.keyboard.press('ArrowRight');
    await expect(control.locator('#tab-stage')).toHaveAttribute('aria-selected', 'true');
    await expect(control.locator('#panel-stage')).toBeVisible();
    await openTab(control, 'advanced');
    await expect(control.locator('#save-tuning')).not.toBeChecked();
  } finally {
    await app.close();
  }
});

test('tuning an intent records for 6 s and stays in memory unless saving is on', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await showAllUi(control);
    await control.locator('#intent-listening .tune-btn').click();
    await expect(control.locator('#intent-listening .tune-btn')).toHaveText('Recording…');
    await expect(control.locator('#intent-listening')).toContainText('Tuned · matched', { timeout: 10_000 });
    expect((await saved(control)).intentTuning).toEqual({});

    await openTab(control, 'advanced');
    await control.getByLabel('Save learned intent data on this computer').check();
    await openTab(control, 'auto');
    await control.locator('#intent-listening .tune-btn').click();
    await expect
      .poll(async () => Object.keys((await saved(control)).intentTuning), { timeout: 10_000 })
      .toEqual(['listening']);
    await openTab(control, 'advanced');
    await control.getByLabel('Save learned intent data on this computer').uncheck();
    await expect.poll(async () => (await saved(control)).intentTuning).toEqual({});
  } finally {
    await app.close();
  }
});
