import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, passConsent } from './helpers';

const FRAME = 1280 * 720 * 2;
const stats = (file: string) =>
  existsSync(`${file}.json`) ? JSON.parse(readFileSync(`${file}.json`, 'utf8')) : { frames: 0 };
const meanDiff = (a: Buffer, b: Buffer) => {
  let s = 0;
  for (let i = 0; i < a.length; i += 97) s += Math.abs((a[i] as number) - (b[i] as number));
  return s / Math.ceil(a.length / 97);
};

test('the Stand-In Camera is on by default and sends the Virtual Stage as YUYV at ~30 fps', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'standin-vcam-')), 'frames.yuyv');
  const { app: electron, control } = await launchApp({ STANDIN_FAKE_VCAM: file });
  try {
    await passConsent(control);
    await expect(control.locator('#vcam-status')).toContainText('Live', { timeout: 10_000 });
    // OBS is offered as the optional alternative, folded away while the camera is live.
    await expect(control.locator('#obs-option')).not.toHaveAttribute('open', '');
    await expect(control.locator('.obs')).toContainText('screen share');

    const s0 = stats(file).frames;
    await control.waitForTimeout(5_000);
    const s1 = stats(file);
    expect(s1).toMatchObject({ width: 1280, height: 720, started: 1 });
    const sent = await control.evaluate(() => (window as any).__standin.app.vcamFeed.sent);
    console.log(`vcam: ${(s1.frames - s0) / 5} frames/s written, ${sent} sent`);
    expect((s1.frames - s0) / 5).toBeGreaterThan(20);
    expect(readFileSync(file).length).toBe(FRAME);
    const fps = await control.evaluate(() => (window as any).__standin.loop.fps);
    expect(fps).toBeGreaterThan(24);

    // GPU conversion agrees with the JS reference (rounding only) and keeps the orientation.
    const self = await control.evaluate(() => (window as any).__standin.app.vcamFeed.selfTest());
    expect(self.maxDiff).toBeLessThanOrEqual(2);
    const ms = await control.evaluate(() => (window as any).__standin.app.vcamFeed.convertMs);
    console.log(`vcam: ${self.backend}, ${ms.toFixed(2)} ms per frame, stage ${fps.toFixed(1)} fps`);

    // What the camera sends follows the stage: Hide me changes the picture.
    await control.locator('.mode-switch').getByRole('radio', { name: 'Camera' }).click();
    await control.waitForTimeout(1_500);
    const before = readFileSync(file);
    await control.click('#cmd-hideMe');
    await control.waitForTimeout(1_500);
    expect(meanDiff(before, readFileSync(file))).toBeGreaterThan(5);

    // Turning it off leaves meeting apps on the "Stand-In paused" picture.
    await control.click('#vcam-toggle');
    await expect(control.locator('#vcam-status')).toHaveText('Off');
    await expect.poll(() => stats(file).stopped).toBe(1);
    expect(stats(file).lastWasPausedFrame).toBe(true);
    await expect(control.locator('#obs-option')).toHaveAttribute('open', '');
    const off = stats(file).frames;
    await control.waitForTimeout(1_000);
    expect(stats(file).frames).toBe(off);
    const saved = await control.evaluate(() => (window as any).studio.getSettings());
    expect(saved.virtualCamera.enabled).toBe(false);
  } finally {
    await electron.close();
  }
});

test('the GPU (WebGL2) conversion matches the JS reference and keeps the stage at full rate', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'standin-vcam-')), 'frames.yuyv');
  const { app: electron, control } = await launchApp({ STANDIN_FAKE_VCAM: file, STANDIN_SWIFTSHADER: '1' });
  try {
    await passConsent(control);
    await expect(control.locator('#vcam-status')).toContainText('Live', { timeout: 10_000 });
    const self = await control.evaluate(() => (window as any).__standin.app.vcamFeed.selfTest());
    test.skip(self.backend !== 'webgl2', 'no WebGL2 here, even in software');
    expect(self.maxDiff).toBeLessThanOrEqual(2);
    await control.waitForTimeout(3_000);
    const ms = await control.evaluate(() => (window as any).__standin.app.vcamFeed.convertMs);
    const fps = await control.evaluate(() => (window as any).__standin.loop.fps);
    console.log(`vcam: webgl2 (software), ${ms.toFixed(2)} ms per frame, stage ${fps.toFixed(1)} fps`);
    expect(fps).toBeGreaterThan(24);
  } finally {
    await electron.close();
  }
});

test('without v4l2loopback the app shows how to install it, and OBS and screen share stay available', async () => {
  test.skip(process.platform !== 'linux', 'Linux backend only');
  const { app: electron, control } = await launchApp({});
  try {
    await passConsent(control);
    const status = control.locator('#vcam-status');
    await expect(status).not.toHaveText('Checking…');
    const text = await status.textContent();
    if (/not installed/.test(text ?? '')) {
      await expect(control.locator('.vcam-install')).toContainText('v4l2loopback-dkms');
    } else {
      // A machine with v4l2loopback: either setup is offered or the camera is live.
      expect(text).toMatch(/Needs one-time setup|Live/);
    }
    await expect(control.locator('#obs-option')).toBeVisible();
    await expect(control.locator('.obs')).toContainText('OBS Virtual Camera');
  } finally {
    await electron.close();
  }
});
