import { expect, test } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, passConsent } from './helpers';

const TOUR = { STANDIN_E2E_TOUR: '1' };

test('first run offers the tour once; "Not now" is remembered', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'standin-e2e-tour-'));
  let { app, control } = await launchApp(TOUR, profile);
  try {
    // Never on the start screen: only once you are in.
    await expect(control.locator('#tour-offer')).toHaveCount(0);
    await passConsent(control);
    await expect(control.locator('#tour-offer')).toBeVisible();
    await control.click('#tour-offer-skip');
    await expect(control.locator('#tour-offer')).toHaveCount(0);
    await expect
      .poll(() => control.evaluate(() => (window as any).studio.getSettings().then((s: any) => s.onboarding)))
      .toEqual({ tourOffered: true });
  } finally {
    await app.close();
  }
  ({ app, control } = await launchApp(TOUR, profile));
  try {
    await passConsent(control);
    await expect(control.locator('#presence-dial')).toBeVisible();
    await control.waitForTimeout(500);
    await expect(control.locator('#tour-offer')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('the tour walks the main window step by step and ends on Help; it can be re-run from Help', async () => {
  const { app, control } = await launchApp(TOUR);
  try {
    await passConsent(control);
    await control.click('#tour-offer-start');
    await expect(control.locator('#tour')).toBeVisible();
    await expect(control.locator('#tour-offer')).toHaveCount(0);
    await expect(control.locator('#tour-count')).toHaveText('1 of 8');
    await expect(control.locator('#tour-title')).toHaveText('Your status at a glance');
    await expect(control.locator('#tour-back')).toBeDisabled();
    await expect(control.locator('#tour-next')).toBeFocused();
    const titles: string[] = [];
    for (let i = 0; i < 8; i++) {
      titles.push((await control.locator('#tour-title').textContent()) ?? '');
      // The spotlight sits on a real element.
      const spot = await control.locator('.tour-spot').boundingBox();
      expect(spot?.width ?? 0).toBeGreaterThan(20);
      if (i === 5) await expect(control.locator('#tab-camera')).toHaveAttribute('aria-selected', 'true');
      if (i < 7) await control.keyboard.press('ArrowRight');
    }
    expect(new Set(titles).size).toBe(8);
    await expect(control.locator('#tour-next')).toHaveText('Done');
    await control.keyboard.press('ArrowLeft');
    await expect(control.locator('#tour-count')).toHaveText('7 of 8');
    await control.click('#tour-next');
    await control.click('#tour-next');
    await expect(control.locator('#tour')).toHaveCount(0);
    await expect(control.locator('#tab-help')).toHaveAttribute('aria-selected', 'true');

    // Again from Help; Esc ends it.
    await control.click('#start-tour');
    await expect(control.locator('#tour-count')).toHaveText('1 of 8');
    await control.keyboard.press('Escape');
    await expect(control.locator('#tour')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Help lists every shortcut; F1 and ? open it; hidden parts are skipped by the tour', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    // Not offered under the e2e harness unless asked for.
    await expect(control.locator('#tour-offer')).toHaveCount(0);
    await control.click('#tab-auto');
    await control.locator('body').click({ position: { x: 5, y: 5 } });
    await control.keyboard.press('F1');
    await expect(control.locator('#tab-help')).toHaveAttribute('aria-selected', 'true');
    for (const text of ['Ctrl+Alt+H', 'Hide me', 'Raise hand', 'hold to talk', 'F1 or ?'])
      await expect(control.locator('#hotkey-help')).toContainText(text);
    await expect(control.locator('#help-version')).toContainText('Stand-In Studio');
    await control.click('#tab-auto');
    await control.locator('body').click({ position: { x: 5, y: 5 } });
    await control.keyboard.press('Shift+Slash');
    await expect(control.locator('#tab-help')).toHaveAttribute('aria-selected', 'true');

    // With "Ways to send the stage" hidden, the tour has one step less.
    await control.evaluate(() =>
      (window as any).__standin.app.updateSettings({ ui: { meetingSetup: false } }),
    );
    await control.click('#start-tour');
    await expect(control.locator('#tour-count')).toHaveText('1 of 7');
  } finally {
    await app.close();
  }
});
