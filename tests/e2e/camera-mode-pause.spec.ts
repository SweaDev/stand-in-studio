import { expect, type Page, test } from '@playwright/test';
import { launchApp } from './helpers';

const ENV = { PRESAGE_API_KEY: 'e2e-dummy-key', STANDIN_FAKE_CAMERA: '1', STANDIN_FAKE_SDK: '1' };
const sdk = (control: Page) => control.evaluate(() => ({ ...(window as any).__standin.app.fakeSdk }));
const mode = (control: Page, name: string) =>
  control.locator('.mode-switch').getByRole('radio', { name }).click();

test('Camera mode pauses the Presage SDK (after a short debounce) and leaving it resumes', async () => {
  const { app, control } = await launchApp(ENV);
  try {
    await control.click('#consent-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await expect.poll(async () => (await sdk(control)).reports).toBeGreaterThan(10);
    expect(await sdk(control)).toMatchObject({ created: 1, starts: 1, stops: 0, running: true });

    // Cycling through Camera quickly never stops the SDK.
    await mode(control, 'Camera');
    await control.waitForTimeout(400);
    await mode(control, 'Blend');
    await control.waitForTimeout(2_000);
    expect(await sdk(control)).toMatchObject({ stops: 0, running: true });

    // Staying in Camera mode pauses it: no more frames are analysed.
    await mode(control, 'Camera');
    await expect.poll(async () => (await sdk(control)).running, { timeout: 5_000 }).toBe(false);
    await expect(control.locator('#sensing-status')).toBeVisible();
    await expect(control.locator('#current-intent-note')).toContainText('Presage is paused');
    const before = (await sdk(control)).reports;
    await control.waitForTimeout(1_500);
    expect((await sdk(control)).reports).toBe(before);
    // The stage shows your camera, not an empty chair.
    const st = await control.evaluate(() => (window as any).__standin.engine.state);
    expect(st.badges.backSoon).toBe(false);
    expect(st.pose.presence).toBe('present');

    // Leaving Camera mode resumes the same SDK at once.
    await mode(control, 'Auto');
    await expect.poll(async () => (await sdk(control)).running).toBe(true);
    expect(await sdk(control)).toMatchObject({ created: 1, starts: 2, stops: 1 });
    await expect(control.locator('#sensing-status')).toBeHidden();
  } finally {
    await app.close();
  }
});

test('starting the camera while already in Camera mode never starts the SDK until you leave it', async () => {
  const { app, control } = await launchApp(ENV);
  try {
    await control.evaluate(() => (window as any).studio.setSettings({ mode: 'camera' }));
    await control.reload();
    await control.click('#consent-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await expect(control.locator('#sensing-status')).toBeVisible();
    await control.waitForTimeout(1_000);
    expect(await sdk(control)).toMatchObject({ created: 1, starts: 0, reports: 0 });
    await mode(control, 'Character');
    await expect.poll(async () => (await sdk(control)).starts).toBe(1);
    // Calibration, interrupted by the pause, starts once sensing does.
    await expect(control.locator('#cal-prompt')).toBeVisible();
  } finally {
    await app.close();
  }
});
