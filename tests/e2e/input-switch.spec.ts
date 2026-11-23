import { expect, type Page, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, openTab, testClip } from './helpers';

const ENV = { PRESAGE_API_KEY: 'e2e-dummy-key', STANDIN_FAKE_CAMERA: '1', STANDIN_FAKE_SDK: '1' };
const sdk = (control: Page) => control.evaluate(() => ({ ...(window as any).__standin.app.fakeSdk }));

/** Minimal telemetry for a 4 s clip (a face in view throughout). */
function telemetry(dir: string): string {
  const frames = [];
  for (let tMs = 0; tMs <= 4_000; tMs += 100) frames.push({ tMs, validation: 'ok', talking: false });
  const file = join(dir, 'switch.telemetry.json');
  writeFileSync(
    file,
    JSON.stringify({
      format: 'standin-telemetry',
      version: 1,
      app: 'e2e',
      sdk: '3.5.0',
      createdAt: new Date().toISOString(),
      includesBody: false,
      video: { file: 'clip.webm', durationMs: 4_000, width: 320, height: 240 },
      frames,
    }),
  );
  return file;
}

test('the Camera tab switches the input in place: demo, camera, video file, saved demo and back', async () => {
  const work = mkdtempSync(join(tmpdir(), 'standin-e2e-switch-'));
  const { app, control } = await launchApp(ENV);
  try {
    await control.click('#consent-demo');
    await expect(control.locator('#pill-source')).toHaveText('Simulated demo');
    await expect.poll(() => app.windows().length).toBe(2);

    // Add a saved demo to switch to later.
    await openTab(control, 'advanced');
    await control.setInputFiles('#demo-import-video', testClip(4));
    await control.setInputFiles('#demo-import-telemetry', telemetry(work));
    await control.click('#demo-import');
    await expect(control.locator('#demo-list li')).toHaveCount(1, { timeout: 10_000 });

    // Demo → Camera.
    await openTab(control, 'camera');
    await expect(control.locator('#input-demo')).toHaveAttribute('aria-pressed', 'true');
    await expect(control.locator('#input-demo-pick')).toBeVisible();
    await control.click('#input-camera');
    await expect(control.locator('#pill-camera')).toHaveText('Camera on', { timeout: 15_000 });
    await expect(control.locator('.consent')).toHaveCount(0);
    await expect(control.locator('#tab-camera')).toHaveAttribute('aria-selected', 'true');
    await expect(control.locator('#input-camera')).toHaveAttribute('aria-pressed', 'true');
    await expect(control.locator('#input-demo-pick')).toBeHidden();
    await expect(control.locator('#pill-source')).toBeHidden();
    await expect(control.locator('#camera-select option')).not.toHaveCount(0);
    await expect(control.locator('#presage-readout')).toContainText('analysing your camera', {
      timeout: 10_000,
    });

    // Camera → Video file: the camera is released, Presage reads the file.
    await control.setInputFiles('#input-clip-file', testClip(4));
    await expect(control.locator('#pill-source')).toHaveText('Video file · e2e-clip-4s.webm', {
      timeout: 15_000,
    });
    await expect(control.locator('#pill-camera')).toBeHidden();
    await expect(control.locator('#presage-readout')).toContainText('e2e-clip-4s.webm', { timeout: 10_000 });
    await expect(control.locator('#presage-toggle')).toBeChecked();
    await control.locator('#presage-toggle').uncheck();
    await expect(control.locator('#pill-presage')).toHaveText('Presage off');

    // Video file → saved demo: no Presage session is created for it.
    const created = (await sdk(control)).created;
    await control.click('#input-demo');
    await expect(control.locator('#pill-source')).toHaveText('Simulated demo', { timeout: 15_000 });
    await control.selectOption('#input-demo-pick', { index: 1 });
    await expect(control.locator('#pill-source')).toContainText('Saved demo ·', { timeout: 15_000 });
    await expect(control.locator('#presage-readout')).toContainText('no Presage');
    expect((await sdk(control)).created).toBe(created);

    // Saved demo → simulated demo.
    await control.selectOption('#input-demo-pick', { index: 0 });
    await expect(control.locator('#pill-source')).toHaveText('Simulated demo', { timeout: 15_000 });
    // One Virtual Stage window throughout.
    expect(app.windows().length).toBe(2);
  } finally {
    await app.close();
  }
});
