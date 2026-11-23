import { expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, openTab } from './helpers';

const ENV = { PRESAGE_API_KEY: 'e2e-dummy-key', STANDIN_FAKE_CAMERA: '1', STANDIN_FAKE_SDK: '1' };

test('Record a demo with the camera saves the clip and its telemetry after a privacy notice', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'standin-e2e-recorder-'));
  const { app, control } = await launchApp(ENV, profile);
  try {
    await control.click('#consent-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await openTab(control, 'camera');
    await control.click('#record-demo');
    await expect(control.locator('#save-demo')).toContainText('the video clip itself');
    await control.fill('#demo-name', 'Webcam take');
    await control.click('#demo-save-confirm');
    await expect(control.locator('#record-demo')).toContainText('Stop and save');
    await expect(control.locator('#record-status')).toContainText('Recording');
    await control.waitForTimeout(3_000);
    await control.click('#record-demo');
    await expect(control.locator('#record-status')).toContainText('Saved “Webcam take”', { timeout: 15_000 });

    const lib = join(profile, 'demos');
    const [id] = readdirSync(lib);
    const t = JSON.parse(readFileSync(join(lib, id as string, 'telemetry.json'), 'utf8'));
    expect(t.frames.length).toBeGreaterThan(20);
    expect(t.video.durationMs).toBeGreaterThan(2_500);
    expect(readFileSync(join(lib, id as string, 'video.webm')).length).toBeGreaterThan(1_000);

    // The recorded WebM plays back as a demo (duration recovered despite MediaRecorder),
    // switched to in place from the Camera tab.
    await control.click('#input-demo');
    await expect(control.locator('#input-demo-pick option')).toHaveCount(2, { timeout: 15_000 });
    await control.selectOption('#input-demo-pick', { index: 1 });
    await expect(control.locator('#clip-time')).toContainText(/\/ 0:0[3-4]/, { timeout: 15_000 });
  } finally {
    await app.close();
  }
});

test('recording cancelled at the privacy notice saves nothing', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'standin-e2e-recorder-'));
  const { app, control } = await launchApp(ENV, profile);
  try {
    await control.click('#consent-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await openTab(control, 'camera');
    await control.click('#record-demo');
    await control.click('#demo-save-cancel');
    await expect(control.locator('#record-demo')).toContainText('Record a demo');
    expect(
      await control.evaluate(() => (window as any).studio.demos.list().then((l: any) => l.demos.length)),
    ).toBe(0);
  } finally {
    await app.close();
  }
});
