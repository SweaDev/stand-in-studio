import { expect, test } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

test('Camera mode can keep the character as a corner badge; a laugh adds sparkles', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    const state = () =>
      control.evaluate(() => {
        const s = (window as any).__standin.engine.state;
        return s
          ? { char: s.characterOpacity, corner: s.cornerBadge, sparkle: s.pose.sparkle, feed: s.feedOpacity }
          : null;
      });
    await control.getByRole('radio', { name: 'Camera' }).click();
    await expect.poll(async () => (await state())?.char).toBe(0);
    await control.getByLabel('Character badge in Camera mode').check();
    await expect.poll(async () => (await state())?.char).toBe(1);
    await expect.poll(async () => (await state())?.corner).toBe(true);
    await expect.poll(async () => (await state())?.feed).toBe(1);

    // Laugh: smile while talking (Demo keys H + hold T).
    await control.getByRole('radio', { name: 'Character' }).click();
    await control.waitForTimeout(3500); // demo calibration
    await control.keyboard.down('t');
    await control.keyboard.press('h');
    await expect.poll(async () => (await state())?.sparkle, { timeout: 4000 }).toBe(true);
    await control.keyboard.up('t');
  } finally {
    await app.close();
  }
});
