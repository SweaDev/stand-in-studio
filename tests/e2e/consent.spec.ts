import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('consent comes first: no stage window and no signals until a choice is made', async () => {
  const { app, control } = await launchApp();
  try {
    await expect(control.getByRole('dialog', { name: 'Before your camera starts' })).toBeVisible();
    const text = await control.locator('.consent').innerText();
    for (const phrase of [
      'Character mode',
      'your real video',
      'only if you switch on the Comfort shield (or turn on a custom intent that uses them)',
      'Nothing is recorded',
      'telemetry is switched off',
      'others may notice your video fading',
      'not a medical',
    ]) {
      expect(text).toContain(phrase);
    }
    // No key in the e2e environment: camera is unavailable, Demo is offered.
    await expect(control.locator('#consent-camera')).toBeDisabled();
    await expect(control.locator('#consent-nokey')).toBeVisible();
    await control.waitForTimeout(500);
    expect(app.windows().length).toBe(1);
    const running = await control.evaluate(() => (window as any).__standin.demo);
    expect(running).toBeNull();
    await control.click('#consent-demo');
    await expect.poll(() => app.windows().length).toBe(2);
    await expect(control.locator('.consent')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
