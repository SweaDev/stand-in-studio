import type { BrowserWindow } from 'electron';
import { app, ipcMain, session, shell } from 'electron';
import { join } from 'node:path';
import { IPC, isAllowedExternal, type AppInfo } from '../shared/ipc';
import type { DeepPartial, Settings } from '../shared/settings';
import { ApiKeyStore } from './apiKey';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { bindSdk } from './sdkBridge';
import { liveSdkSessions } from './sdkKeyInjection';
import { createQuitHandler } from './sdkShutdown';
import { installPermissionHandlers } from './permissions';
import { SettingsStore } from './settingsStore';
import { createControlWindow } from './windows';

/**
 * Test-only fake camera (STANDIN_FAKE_CAMERA=1, or a path to an .mjpeg/.y4m clip). Never
 * set in normal use.
 */
function configureFakeCamera(): void {
  const fake = process.env.STANDIN_FAKE_CAMERA;
  if (!fake) return;
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  if (fake !== '1') app.commandLine.appendSwitch('use-file-for-fake-video-capture', fake);
}

/** Application entry point: owns windows, settings and IPC. */
function bootstrap(): void {
  configureFakeCamera();
  const info: AppInfo = {
    platform: process.platform,
    version: app.getVersion(),
    e2e: process.env.STANDIN_E2E === '1',
    forceDemo: process.env.STANDIN_DEMO === '1',
    fakeSdk: process.env.STANDIN_E2E === '1' && process.env.STANDIN_FAKE_SDK === '1',
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
  const keys = new ApiKeyStore();
  let sdkAvailable = false;
  // The renderer learns only whether a key exists, never the key itself.
  ipcMain.handle(IPC.apiKeyStatus, () => ({
    ...keys.status(),
    available: sdkAvailable && keys.status().available,
  }));
  ipcMain.handle(IPC.apiKeySet, (_e, key: unknown) => ({
    ...keys.set(key),
    available: sdkAvailable && keys.status().available,
  }));
  ipcMain.handle(IPC.apiKeyClear, () => ({
    ...keys.clear(),
    available: sdkAvailable && keys.status().available,
  }));

  app.whenReady().then(() => {
    installPermissionHandlers(session.defaultSession, (wc) => wc === control?.webContents);
    control = createControlWindow();
    sdkAvailable = bindSdk(control, () => keys.get());
    const taken = registerHotkeys(() => control);
    if (taken.length > 0)
      console.warn(`[stand-in] hotkeys already in use by another app: ${taken.join(', ')}`);
    control.on('closed', () => {
      control = null;
      app.quit();
    });
  });

  // Stop and destroy SDK sessions before Electron tears down the isolate (see sdkShutdown).
  app.on(
    'before-quit',
    createQuitHandler({
      sessions: liveSdkSessions,
      notifyRenderer: () => {
        if (control && !control.isDestroyed()) control.webContents.send(IPC.appQuitting);
      },
      exit: (code) => app.exit(code),
      log: (m) => console.info(m),
    }),
  );
  app.on('will-quit', () => unregisterHotkeys());
  app.on('window-all-closed', () => app.quit());
}

bootstrap();
