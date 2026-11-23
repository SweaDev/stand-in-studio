import type { BrowserWindow } from 'electron';
import { app, ipcMain, session, shell } from 'electron';
import { join } from 'node:path';
import { IPC, isAllowedExternal, type AppInfo } from '../shared/ipc';
import type { DeepPartial, Settings } from '../shared/settings';
import { ApiKeyStore } from './apiKey';
import { bindDemoLibrary } from './demoIpc';
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
import { bindSdk } from './sdkBridge';
import { liveSdkSessions } from './sdkKeyInjection';
import { createQuitHandler } from './sdkShutdown';
import { installPermissionHandlers } from './permissions';
import { SettingsStore } from './settingsStore';
import { createControlWindow } from './windows';
import { FileSink } from './vcam/FileSink';
import { LinuxV4l2Sink } from './vcam/LinuxV4l2Sink';
import { probeHost } from './vcam/linuxDevices';
import { VirtualCameraService } from './vcam/VirtualCameraService';

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

/** E2E only (STANDIN_E2E=1 STANDIN_SWIFTSHADER=1): software WebGL on GPU-less test machines. */
function configureSoftwareGl(): void {
  if (process.env.STANDIN_E2E === '1' && process.env.STANDIN_SWIFTSHADER === '1')
    app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

/** Application entry point: owns windows, settings and IPC. */
function bootstrap(): void {
  configureFakeCamera();
  configureSoftwareGl();
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
  ipcMain.handle(IPC.settingsSet, (_e, patch: DeepPartial<Settings>) => {
    // The demo library folder is set only from a native folder dialog (demoIpc), never by the page.
    const { recorded, ...rest } = patch ?? {};
    const safe: DeepPartial<Settings> = { ...rest };
    if (recorded && typeof recorded === 'object') {
      const { libraryDir: _dir, ...r } = recorded;
      safe.recorded = r;
    }
    return settings().update(safe);
  });
  bindDemoLibrary({
    userData: app.getPath('userData'),
    settings,
    window: () => control,
    e2ePickDir: info.e2e ? process.env.STANDIN_E2E_PICK_DIR : undefined,
  });
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

  // The Stand-In Camera: v4l2loopback on Linux; other platforms use OBS for now.
  const fakeVcam = info.e2e ? process.env.STANDIN_FAKE_VCAM : undefined;
  const vcam = new VirtualCameraService({
    platform: process.platform,
    sink: fakeVcam
      ? new FileSink(fakeVcam)
      : process.platform === 'linux'
        ? new LinuxV4l2Sink(() => probeHost().devices)
        : null,
    deviceless: Boolean(fakeVcam),
  });
  let pausedFrame: Uint8Array | undefined;
  const bytes = (v: unknown) => (v instanceof Uint8Array ? v : undefined);
  ipcMain.handle(IPC.vcamStatus, () => vcam.status());
  ipcMain.handle(IPC.vcamSetup, () => vcam.setup());
  ipcMain.handle(IPC.vcamStart, () => vcam.start());
  ipcMain.handle(IPC.vcamStop, (_e, frame: unknown) => vcam.stop(bytes(frame) ?? pausedFrame));
  ipcMain.on(IPC.vcamPausedFrame, (_e, frame: unknown) => {
    pausedFrame = bytes(frame) ?? pausedFrame;
  });
  ipcMain.on(IPC.vcamFrame, (e, frame: unknown) => {
    if (e.sender === control?.webContents) {
      const f = bytes(frame);
      if (f) vcam.frame(f);
    }
  });

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
      // Leave meeting apps on the "paused" picture rather than a frozen last frame.
      alsoBeforeExit: () => vcam.stop(pausedFrame),
      log: (m) => console.info(m),
    }),
  );
  app.on('will-quit', () => unregisterHotkeys());
  app.on('window-all-closed', () => app.quit());
}

bootstrap();
