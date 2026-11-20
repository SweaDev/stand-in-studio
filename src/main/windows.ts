import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';
import { APP_NAME, STAGE_HEIGHT, STAGE_WIDTH, STAGE_WINDOW_TITLE } from '../shared/app';
import { STAGE_FRAME_NAME } from '../shared/ipc';

/** Absolute path of a file inside dist/, resolved from the bundled main script. */
export function distPath(...parts: string[]): string {
  return join(__dirname, '..', ...parts);
}

/**
 * Creates the control window: the app's main UI, which owns the camera, the engine and
 * the stage drawing. It may open exactly one child: the stage window.
 */
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

  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (frameName === STAGE_FRAME_NAME && url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          useContentSize: true,
          frame: false,
          title: STAGE_WINDOW_TITLE,
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
        },
      };
    }
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    // OBS captures by window title, so keep it fixed.
    child.setTitle(STAGE_WINDOW_TITLE);
    child.on('page-title-updated', (e) => e.preventDefault());
  });
  // Links (e.g. Presage privacy docs) open in the system browser, never in-app.
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  void win.loadFile(distPath('renderer', 'control', 'index.html'));
  app.on('before-quit', () => {
    for (const w of BrowserWindow.getAllWindows()) if (w !== win) w.destroy();
  });
  return win;
}
