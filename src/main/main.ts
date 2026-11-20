import type { BrowserWindow } from 'electron';
import { app, ipcMain, session, shell } from 'electron';
import { join } from 'node:path';
import { IPC, isAllowedExternal, type AppInfo, type ApiKeyStatus } from '../shared/ipc';
import type { DeepPartial, Settings } from '../shared/settings';
import { installPermissionHandlers } from './permissions';
import { SettingsStore } from './settingsStore';
import { createControlWindow } from './windows';

/** Application entry point: owns windows, settings and IPC. */
function bootstrap(): void {
  const info: AppInfo = {
    platform: process.platform,
    version: app.getVersion(),
    e2e: process.env.STANDIN_E2E === '1',
    forceDemo: process.env.STANDIN_DEMO === '1',
  };
  let control: BrowserWindow | null = null;
  let store: SettingsStore | null = null;
  const settings = () => (store ??= new SettingsStore(join(app.getPath('userData'), 'settings.json')));

  ipcMain.on(IPC.appInfo, (e) => {
    e.returnValue = info;
  });
  ipcMain.handle(IPC.settingsGet, () => settings().get());
  ipcMain.handle(IPC.settingsSet, (_e, patch: DeepPartial<Settings>) => settings().update(patch ?? {}));
  ipcMain.handle(IPC.openExternal, async (_e, url: unknown) => {
    if (typeof url !== 'string' || !isAllowedExternal(url)) return false;
    await shell.openExternal(url);
    return true;
  });
  // Placeholder until the API key module lands (T35): no key is ever available.
  const noKey: ApiKeyStatus = { available: false, source: null };
  ipcMain.handle(IPC.apiKeyStatus, () => noKey);
  ipcMain.handle(IPC.apiKeySet, () => noKey);
  ipcMain.handle(IPC.apiKeyClear, () => noKey);

  app.whenReady().then(() => {
    installPermissionHandlers(session.defaultSession, (wc) => wc === control?.webContents);
    control = createControlWindow();
    control.on('closed', () => {
      control = null;
      app.quit();
    });
  });

  app.on('window-all-closed', () => app.quit());
}

bootstrap();
