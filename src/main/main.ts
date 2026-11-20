import { app, BrowserWindow } from 'electron';
import { createControlWindow } from './windows';

/** Application entry point: owns the lifecycle of the control window. */
function bootstrap(): void {
  app.whenReady().then(() => {
    createControlWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

bootstrap();
