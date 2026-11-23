import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

// Uses the real SDK with an invalid key: Presage rejects it (no measurement happens).
// Needs network access to Presage, so it is skipped in CI.
test.skip(!!process.env.CI, 'needs network access to Presage');

test('camera path: same stream for SDK and stage; a rejected key offers Demo mode', async () => {
  const { app, control } = await launchApp({ PRESAGE_API_KEY: 'invalid-e2e-key', STANDIN_FAKE_CAMERA: '1' });
  try {
    await control.click('#consent-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await expect(control.locator('#camera-select option')).not.toHaveCount(0);
    await expect(control.locator('#status-banner')).toBeVisible({ timeout: 45_000 });
    await expect(control.locator('#status-text')).toContainText(/API key|Presage/);
    await expect(control.locator('#status-action')).toHaveText('Continue in Demo mode');
    // The stage still shows the character and the camera feed is drawable.
    const feed = await control.evaluate(() => (window as any).__standin.app.camera.element.videoWidth);
    expect(feed).toBeGreaterThan(0);
    await control.click('#status-action');
    await expect(control.locator('#consent-demo')).toBeVisible();
  } finally {
    await app.close();
  }
});
