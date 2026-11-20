import { expect, test } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

test('OBS checklist names the stage window and the test pattern reaches the stage', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await expect(control.locator('.obs')).toContainText('“Stand-In Stage”');
    await expect(control.locator('.obs')).toContainText('Start Virtual Camera');
    await expect(control.locator('.obs')).toContainText('OBS Virtual Camera');
    await expect(control.locator('.obs')).toContainText('v4l2loopback');
    await control.click('#test-pattern');
    await expect(control.locator('#test-pattern')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.engine.state?.testPattern))
      .toBe(true);
    await control.click('#test-pattern');
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.engine.state?.testPattern))
      .toBe(false);
  } finally {
    await app.close();
  }
});
