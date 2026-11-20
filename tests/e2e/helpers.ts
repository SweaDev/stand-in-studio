import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  control: Page;
}

/** Launches the built app. Containers and CI run as root, which needs --no-sandbox. */
export async function launchApp(env: Record<string, string> = {}): Promise<LaunchedApp> {
  const root = join(__dirname, '..', '..');
  // A fresh profile per run, so saved settings never leak between tests.
  const args = [root, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'standin-e2e-'))}`];
  if (process.getuid?.() === 0 || process.env.CI) args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    cwd: root,
    env: { ...process.env, STANDIN_E2E: '1', PRESAGE_API_KEY: '', ...env } as Record<string, string>,
  });
  const control = await app.firstWindow();
  await control.waitForLoadState('domcontentloaded');
  return { app, control };
}

/** Clicks through the consent screen with the given choice. */
export async function passConsent(control: Page, choice: 'demo' | 'camera' = 'demo'): Promise<void> {
  await control.click(choice === 'demo' ? '#consent-demo' : '#consent-camera');
}
