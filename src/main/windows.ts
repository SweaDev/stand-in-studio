import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_NAME } from '../shared/app';

/** Absolute path of a file inside dist/, resolved from the bundled main script. */
export function distPath(...parts: string[]): string {
  return join(__dirname, '..', ...parts);
}

/** Creates the control window: the app's main UI, which also owns the camera and the engine. */
export function createControlWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#1d1b22',
    show: false,
    webPreferences: {
      preload: distPath('preload', 'control.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // The stage keeps rendering at 30 fps even when this window is minimised.
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  void win.loadFile(distPath('renderer', 'control', 'index.html'));
  return win;
}
