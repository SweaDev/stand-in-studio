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
    await expect(control.locator('#pill-source')).toContainText('Saved demo · E2E clip');
    await expect(control.locator('#pill-presage')).toHaveText('Replaying telemetry');
    await expect(control.locator('#sensing-status')).toContainText('Replaying saved telemetry');
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.app.replay?.emitted ?? 0))
      .toBeGreaterThan(10);
    expect(await sdk(control)).toMatchObject({ created: 0, starts: 0 });
    await expect(control.locator('#change-input')).toBeVisible();
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
    await expect(control.locator('#save-card-note')).toContainText('add a Presage API key');
    await expect(control.locator('#sensing-status')).toContainText('without analysis');
  } finally {
    await app.close();
  }
});

test('"Save its telemetry as a demo" on the start screen asks first, then saves the clip as it plays', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'standin-e2e-rec-start-'));
  const { app, control } = await launchApp(ENV, profile);
  try {
    await control.check('#consent-save-telemetry');
    await control.setInputFiles('#consent-clip-file', testClip(4));
    // The privacy notice still comes first, every time.
    await expect(control.locator('#save-demo')).toBeVisible({ timeout: 15_000 });
    await control.fill('#demo-name', 'From the start screen');
    await control.click('#demo-save-confirm');
    // While it saves: REC, a progress bar and Cancel.
    await expect(control.locator('#save-card .rec-badge')).toBeVisible();
    await expect(control.locator('#save-card .progress')).toBeVisible();
    await expect(control.locator('#cancel-telemetry')).toBeVisible();
    await expect(control.locator('#save-telemetry')).toBeHidden();
    await expect
      .poll(async () => Number(await control.locator('#save-card .progress').getAttribute('aria-valuenow')))
      .toBeGreaterThan(20);
    await expect(control.locator('#telemetry-status')).toContainText('Saved “From the start screen”', {
      timeout: 20_000,
    });
    await expect(control.locator('#save-card .rec-badge')).toBeHidden();
    expect(readdirSync(join(profile, 'demos'))).toHaveLength(1);
    // Play it now: replays the saved demo in place, offline.
    await control.click('#save-card-play');
    await expect(control.locator('#pill-source')).toHaveText('Saved demo · From the start screen', {
      timeout: 15_000,
    });
  } finally {
    await app.close();
  }
});
