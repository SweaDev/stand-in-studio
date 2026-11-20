import { BrowserWindow, app, ipcMain } from 'electron';
import { IPC, type AppInfo } from '../shared/ipc';
import { createControlWindow } from './windows';

/** Application entry point: owns the lifecycle of the control window. */
function bootstrap(): void {
  const info: AppInfo = {
    platform: process.platform,
    version: app.getVersion(),
    e2e: process.env.STANDIN_E2E === '1',
  };
  ipcMain.on(IPC.appInfo, (e) => {
    e.returnValue = info;
  });

  app.whenReady().then(() => {
    const control = createControlWindow();
    control.on('closed', () => app.quit());
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}

bootstrap();
