import { expect, test } from '@playwright/test';
import { launchApp, openTab } from './helpers';

const KEY = 'standin-e2e-dummy-key-0123456789';

test('the API key stays in main: the renderer only sees whether one exists', async () => {
  const { app, control } = await launchApp({ PRESAGE_API_KEY: KEY });
  try {
    await expect(control.locator('#consent-camera')).toBeEnabled();
    const leak = await control.evaluate(async (k) => {
      const status = await (window as any).studio.apiKeyStatus();
      const surfaces = [
        JSON.stringify(status),
        JSON.stringify((window as any).studio),
        document.documentElement.outerHTML,
      ];
      return { status, leaked: surfaces.some((s) => s.includes(k)) };
    }, KEY);
    expect(leak.status).toEqual({ available: true, source: 'env' });
    expect(leak.leaked).toBe(false);
    // Main removed it from its own environment too.
    expect(await app.evaluate(() => process.env.PRESAGE_API_KEY)).toBeUndefined();
  } finally {
    await app.close();
  }
});

test('a pasted key goes to main, the field is cleared and the camera is offered', async () => {
  const { app, control } = await launchApp();
  try {
    await control.click('#consent-demo');
    await openTab(control, 'camera');
    await expect(control.locator('#api-key-status')).toHaveText('No key: Demo mode only.');
    await control.fill('#api-key-input', KEY);
    await control.click('#api-key-save');
    await expect(control.locator('#api-key-status')).toContainText('pasted key');
    await expect(control.locator('#api-key-input')).toHaveValue('');
    await expect(control.locator('#api-key-restart')).toBeVisible();
    const html = await control.evaluate(() => document.documentElement.outerHTML);
    expect(html).not.toContain(KEY);
    await control.click('#api-key-restart');
    await expect(control.locator('#consent-camera')).toBeEnabled();
  } finally {
    await app.close();
  }
});
