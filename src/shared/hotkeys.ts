import type { CommandName } from '../core/stage/commands';

/** Global hotkeys (Electron accelerators). They work even while a meeting app has focus. */
export const HOTKEYS: Readonly<Record<CommandName, string>> = Object.freeze({
  hideMe: 'CommandOrControl+Alt+H',
  pin: 'CommandOrControl+Alt+P',
  raiseHand: 'CommandOrControl+Alt+R',
  backSoon: 'CommandOrControl+Alt+B',
  cycleMode: 'CommandOrControl+Alt+M',
});

/** Human-readable accelerator for the current platform. */
export function displayAccelerator(acc: string, platform: string): string {
  const mac = platform === 'darwin';
  return acc
    .replace('CommandOrControl', mac ? '⌘' : 'Ctrl')
    .replace('Alt', mac ? '⌥' : 'Alt')
    .split('+')
    .join(mac ? '' : '+');
}
