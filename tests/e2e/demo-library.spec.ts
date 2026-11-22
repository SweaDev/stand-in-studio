import { expect, test } from '@playwright/test';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syntheticFace } from '../../src/core/features/syntheticFace';
import { launchApp, openTab, testClip } from './helpers';

/** Telemetry for a 10 s clip: present and listening for 5 s, then the chair is empty. */
function telemetryFile(dir: string): string {
  const frames = [];
  for (let tMs = 0; tMs <= 10_000; tMs += 50) {
    const away = tMs >= 5_000;
    frames.push({
      tMs,
      validation: away ? 'noFace' : 'ok',
      talking: false,
      ...(away ? {} : { landmarks: syntheticFace({ pitch: 0.4, yaw: 0, mouthGap: 0.02, eyeOpenness: 0.3 }) }),
    });
  }
  const file = join(dir, 'clip.telemetry.json');
  writeFileSync(
    file,
    JSON.stringify({
      format: 'standin-telemetry',
      version: 1,
      app: 'e2e',
      sdk: '3.5.0',
      createdAt: new Date().toISOString(),
      includesBody: false,
      video: { file: 'clip.webm', durationMs: 10_000, width: 320, height: 240 },
      frames,
    }),
  );
  return file;
}

test('Demo library: import, replay offline with intents deciding, rename, export and delete', async () => {
  const work = mkdtempSync(join(tmpdir(), 'standin-e2e-lib-'));
  const exportDir = join(work, 'exported');
  const { app, control } = await launchApp({ STANDIN_FAKE_SDK: '1', STANDIN_E2E_PICK_DIR: exportDir });
  try {
    await control.click('#consent-demo');
    await openTab(control, 'advanced');
    await expect(control.locator('#demo-folder')).toContainText('(default)');
    await expect(control.locator('#demo-list')).toContainText('No saved demos yet');

    // Import a video and its telemetry (as shared outside the repo).
    await control.locator('.demo-import summary').click();
    await control.setInputFiles('#demo-import-video', testClip(10));
    await control.setInputFiles('#demo-import-telemetry', telemetryFile(work));
    await control.click('#demo-import');
    await expect(control.locator('#demo-library-status')).toContainText('Imported');
    await expect(control.locator('.demo-row')).toHaveCount(1);

    // Play it: saved telemetry drives Auto, with no SDK.
    await control.locator('.demo-play').click();
    await expect(control.locator('#sensing-status')).toContainText('Replaying saved telemetry', {
      timeout: 15_000,
    });
    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          const id = await control.evaluate(
            () => (window as any).__standin.engine.debug?.intent.id ?? 'none',
          );
          seen.add(id);
          return seen.has('away');
        },
        { timeout: 15_000, intervals: [200] },
      )
      .toBe(true);
    expect(seen.has('listening')).toBe(true);
    expect(await control.evaluate(() => (window as any).__standin.app.fakeSdk.created)).toBe(0);

    // Rename, export, delete.
    await openTab(control, 'advanced');
    await control.locator('.demo-rename').click();
    await control.locator('.demo-rename-input').fill('Empty chair test');
    await control.locator('.demo-rename-input').press('Enter');
    await expect(control.locator('.demo-row')).toContainText('Empty chair test');
    await control.locator('.demo-export').click();
    await expect(control.locator('#demo-library-status')).toContainText('Exported');
    expect(existsSync(join(exportDir, 'empty-chair-test.webm'))).toBe(true);
    expect(existsSync(join(exportDir, 'empty-chair-test.telemetry.json'))).toBe(true);
    await control.locator('.demo-delete').click();
    await control.locator('.demo-delete').click();
    await expect(control.locator('#demo-list')).toContainText('No saved demos yet');
  } finally {
    await app.close();
  }
});

test('importing a file that is not telemetry is refused', async () => {
  const work = mkdtempSync(join(tmpdir(), 'standin-e2e-lib-'));
  const bad = join(work, 'bad.json');
  writeFileSync(bad, JSON.stringify({ hello: 'world' }));
  const { app, control } = await launchApp({});
  try {
    await control.click('#consent-demo');
    await openTab(control, 'advanced');
    await control.locator('.demo-import summary').click();
    await control.setInputFiles('#demo-import-video', testClip(4));
    await control.setInputFiles('#demo-import-telemetry', bad);
    await control.click('#demo-import');
    await expect(control.locator('#demo-library-status')).toContainText('Not a Stand-In telemetry file');
    await expect(control.locator('.demo-row')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
