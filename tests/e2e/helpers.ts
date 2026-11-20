import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'node:path';

export interface LaunchedApp {
  app: ElectronApplication;
  control: Page;
}

/** Launches the built app. Containers and CI run as root, which needs --no-sandbox. */
export async function launchApp(env: Record<string, string> = {}): Promise<LaunchedApp> {
  const root = join(__dirname, '..', '..');
  const args = [root];
  if (process.getuid?.() === 0 || process.env.CI) args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    cwd: root,
    env: { ...process.env, STANDIN_E2E: '1', ...env } as Record<string, string>,
  });
  const control = await app.firstWindow();
  await control.waitForLoadState('domcontentloaded');
  return { app, control };
}
