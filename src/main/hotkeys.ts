import { type BrowserWindow, globalShortcut } from 'electron';
import { COMMAND_NAMES } from '../core/stage/commands';
import { HOTKEYS } from '../shared/hotkeys';
import { IPC } from '../shared/ipc';

/**
 * Registers the global hotkeys and forwards each as a command to the control window.
 * Returns the commands whose shortcut was taken by another app.
 */
export function registerHotkeys(target: () => BrowserWindow | null): string[] {
  const failed: string[] = [];
  for (const name of COMMAND_NAMES) {
    const ok = globalShortcut.register(HOTKEYS[name], () => target()?.webContents.send(IPC.command, name));
    if (!ok) failed.push(name);
  }
  return failed;
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
