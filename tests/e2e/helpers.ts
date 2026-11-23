import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  control: Page;
}

/** Launches the built app. Containers and CI run as root, which needs --no-sandbox. */
export async function launchApp(
  env: Record<string, string> = {},
  userDataDir?: string,
): Promise<LaunchedApp> {
  const root = join(__dirname, '..', '..');
  // A fresh profile per run, so saved settings never leak between tests.
  const args = [root, `--user-data-dir=${userDataDir ?? mkdtempSync(join(tmpdir(), 'standin-e2e-'))}`];
  if (process.getuid?.() === 0 || process.env.CI) args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    cwd: root,
    env: { ...process.env, STANDIN_E2E: '1', PRESAGE_API_KEY: '', STANDIN_FAKE_CAMERA: '', ...env } as Record<
      string,
      string
    >,
  });
  const control = await app.firstWindow();
  await control.waitForLoadState('domcontentloaded');
  return { app, control };
}

/** Clicks through the consent screen with the given choice. */
export async function passConsent(control: Page, choice: 'demo' | 'camera' = 'demo'): Promise<void> {
  await control.click(choice === 'demo' ? '#consent-demo' : '#consent-camera');
}

/** Opens a settings tab: 'auto' | 'stage' | 'camera' | 'advanced'. */
export async function openTab(control: Page, id: 'auto' | 'stage' | 'camera' | 'advanced'): Promise<void> {
  await control.click(`#tab-${id}`);
}

/**
 * A short synthetic WebM clip for the recorded-input tests, generated with ffmpeg into the
 * git-ignored test-assets folder (no video is ever kept in the repo).
 */
export function testClip(seconds = 4): string {
  const dir = join(__dirname, '..', '..', 'test-assets');
  const file = join(dir, `e2e-clip-${seconds}s.webm`);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=320x240:rate=30:duration=${seconds}`,
      '-c:v',
      'libvpx',
      '-b:v',
      '300k',
      '-pix_fmt',
      'yuv420p',
      file,
    ]);
  }
  return file;
}

/** Shows every optional part of the main window (Advanced → Interface). */
export async function showAllUi(control: Page): Promise<void> {
  await control.evaluate(() =>
    (window as any).__standin.app.updateSettings({
      ui: { overrides: true, intents: true, tuning: true, meetingSetup: true, presets: true },
    }),
  );
}
