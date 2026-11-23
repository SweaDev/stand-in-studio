import { expect, type Page, test } from '@playwright/test';
import { launchApp, testClip } from './helpers';

const ENV = { PRESAGE_API_KEY: 'e2e-dummy-key', STANDIN_FAKE_CAMERA: '1', STANDIN_FAKE_SDK: '1' };
const sdk = (control: Page) => control.evaluate(() => ({ ...(window as any).__standin.app.fakeSdk }));
const liveTracks = (control: Page) =>
  control.evaluate(
    () =>
      ((window as any).__standin.app.camera?.current?.getVideoTracks() ?? []).filter(
        (t: MediaStreamTrack) => t.readyState === 'live',
      ).length,
  );

test('the status bar shows the camera and what Presage reads; the camera and Presage switch off and on', async () => {
  const { app, control } = await launchApp(ENV);
  try {
    await control.click('#consent-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await expect(control.locator('#pill-camera')).toHaveAttribute('aria-pressed', 'true');
    await expect(control.locator('#pill-source')).toBeHidden();
    await expect(control.locator('#pill-presage')).toHaveText(/^Presage · /, { timeout: 10_000 });
    await expect(control.locator('#pill-presage')).toHaveClass(/is-analysing/);

    // Presage off: paused at once (no debounce), the camera stays on.
    await control.click('#pill-presage');
    await expect.poll(async () => (await sdk(control)).running).toBe(false);
    await expect(control.locator('#pill-presage')).toHaveText('Presage off');
    await expect(control.locator('#pill-presage')).toHaveAttribute('aria-pressed', 'false');
    await expect(control.locator('#sensing-status')).toContainText('turned off by you');
    expect(await liveTracks(control)).toBe(1);
    const before = (await sdk(control)).reports;
    await control.waitForTimeout(800);
    expect((await sdk(control)).reports).toBe(before);
    await control.click('#pill-presage');
    await expect.poll(async () => (await sdk(control)).running).toBe(true);
    await expect(control.locator('#pill-presage')).toHaveText(/^Presage · /);

    // Camera off (privacy shutter): the webcam is released, the SDK stops, only the character shows.
    await control.click('#pill-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera off');
    await expect(control.locator('#camera-off')).toBeVisible();
    expect(await liveTracks(control)).toBe(0);
    await expect.poll(async () => (await sdk(control)).running).toBe(false);
    await expect(control.locator('#pill-presage')).toHaveText('Presage off');
    await expect(control.locator('#pill-presage')).toBeDisabled();
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.engine.state.feedOpacity))
      .toBe(0);
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.engine.state.characterOpacity))
      .toBeGreaterThan(0.9);
    // Hide me is a separate choice, untouched by the shutter.
    await expect(control.locator('#cmd-hideMe')).toHaveAttribute('aria-pressed', 'false');

    // Back on: the same camera reopens and a new SDK session starts.
    await control.click('#camera-on');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await expect(control.locator('#camera-off')).toBeHidden();
    await expect.poll(async () => (await sdk(control)).running).toBe(true);
    expect((await sdk(control)).created).toBe(2);
    expect(await liveTracks(control)).toBe(1);
  } finally {
    await app.close();
  }
});

test('with a video file, Presage names the file and the webcam pill is not shown', async () => {
  const { app, control } = await launchApp({ PRESAGE_API_KEY: 'e2e-dummy-key', STANDIN_FAKE_SDK: '1' });
  try {
    await control.setInputFiles('#consent-clip-file', testClip(4));
    await expect(control.locator('#pill-source')).toHaveText('Video file · e2e-clip-4s.webm', {
      timeout: 15_000,
    });
    await expect(control.locator('#pill-presage')).toHaveText('Presage · e2e-clip-4s.webm', {
      timeout: 10_000,
    });
    await expect(control.locator('#pill-camera')).toBeHidden();
    await control.click('#pill-presage');
    await expect(control.locator('#pill-presage')).toHaveText('Presage off');
    await expect.poll(async () => (await sdk(control)).running).toBe(false);
  } finally {
    await app.close();
  }
});
