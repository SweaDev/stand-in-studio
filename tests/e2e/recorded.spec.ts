import { expect, type Page, test } from '@playwright/test';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, testClip } from './helpers';

const ENV = { PRESAGE_API_KEY: 'e2e-dummy-key', STANDIN_FAKE_SDK: '1' };
const sdk = (control: Page) => control.evaluate(() => ({ ...(window as any).__standin.app.fakeSdk }));

test('a recorded clip is analysed like the camera, its telemetry is saved, and it replays offline on the next run', async () => {
  const clip = testClip(4);
  const profile = mkdtempSync(join(tmpdir(), 'standin-e2e-rec-'));
  let { app, control } = await launchApp(ENV, profile);
  try {
    await control.setInputFiles('#consent-clip-file', clip);
    await expect(control.locator('#clip-play')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await sdk(control)).reports).toBeGreaterThan(5);
    expect(await sdk(control)).toMatchObject({ created: 1, running: true });

    // Save telemetry: the privacy notice comes first, then the clip plays once.
    await control.click('#save-telemetry');
    await expect(control.locator('#save-demo')).toBeVisible();
    await expect(control.locator('#save-demo')).toContainText('face landmarks');
    await expect(control.locator('#demo-include-body')).not.toBeChecked();
    await control.fill('#demo-name', 'E2E clip');
    await control.click('#demo-save-confirm');
    await expect(control.locator('#clip-scrub')).toBeDisabled();
    await expect(control.locator('#telemetry-status')).toContainText('Saved “E2E clip”', { timeout: 20_000 });
    await expect(control.locator('#clip-scrub')).toBeEnabled();

    // On disk, in the app's data folder: video, telemetry and meta, and no body signals.
    const lib = join(profile, 'demos');
    const [id] = readdirSync(lib);
    expect(readdirSync(join(lib, id as string)).sort()).toEqual([
      'meta.json',
      'telemetry.json',
      'video.webm',
    ]);
    const t = JSON.parse(readFileSync(join(lib, id as string, 'telemetry.json'), 'utf8'));
    expect(t).toMatchObject({ format: 'standin-telemetry', includesBody: false });
    expect(t.frames.length).toBeGreaterThan(20);
    expect(readFileSync(join(lib, id as string, 'video.webm')).equals(readFileSync(clip))).toBe(true);

    // Pausing the clip pauses Presage too.
    if ((await control.locator('#clip-play').getAttribute('aria-label')) === 'Play')
      await control.click('#clip-play');
    await control.click('#clip-play');
    await expect.poll(async () => (await sdk(control)).running, { timeout: 5_000 }).toBe(false);
    await expect(control.locator('#sensing-status')).toContainText('the clip is paused');
  } finally {
    await app.close();
  }

  // Next run (same data folder): the saved demo is offered and replays with no SDK at all.
  ({ app, control } = await launchApp({ STANDIN_FAKE_SDK: '1' }, profile));
  try {
    await expect(control.locator('#consent-demo-pick')).toBeVisible();
    await expect(control.locator('#consent-demo-pick')).toContainText('E2E clip');
    await expect(control.locator('#consent-demo-pick')).toHaveValue(/e2e-clip-/);
    await control.click('#consent-demo');
    await expect(control.locator('#demo-badge')).toContainText('saved recording');
    await expect(control.locator('#sensing-status')).toContainText('Replaying saved telemetry');
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.app.replay?.emitted ?? 0))
      .toBeGreaterThan(10);
    expect(await sdk(control)).toMatchObject({ created: 0, starts: 0 });
    await expect(control.locator('#close-clip')).toHaveText('Close demo');
  } finally {
    await app.close();
  }
});

test('without an API key a recorded clip only plays through', async () => {
  const { app, control } = await launchApp({});
  try {
    await expect(control.locator('#consent-clip-hint')).toContainText('only plays through');
    await control.setInputFiles('#consent-clip-file', testClip(4));
    await expect(control.locator('#clip-play')).toBeVisible({ timeout: 15_000 });
    await expect(control.locator('#save-telemetry')).toHaveCount(0);
    await expect(control.locator('#sensing-status')).toContainText('without analysis');
  } finally {
    await app.close();
  }
});
