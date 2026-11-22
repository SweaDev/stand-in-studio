/* eslint-disable @typescript-eslint/no-require-imports -- the SDK must load lazily, after key injection */
import type { BrowserWindow } from 'electron';
import type * as SdkMain from '@smartspectra/node-sdk/main';
import { installKeyInjection } from './sdkKeyInjection';

/**
 * Wires the SmartSpectra IPC bridge for a window, with the key injected in main. Returns
 * false (and the app runs Demo-only) if the SDK can't load on this machine.
 */
export function bindSdk(win: BrowserWindow, getKey: () => string | null): boolean {
  try {
    installKeyInjection(getKey, (m) => console.info(m));
    const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main') as typeof SdkMain;
    bindSmartSpectraIpc(win, {
      logger: (level, msg) => {
        if (level !== 'info') console.warn(`[smartspectra] ${level}: ${msg}`);
      },
    });
    return true;
  } catch (err) {
    console.warn(`[stand-in] SmartSpectra SDK unavailable: ${(err as Error).message}`);
    return false;
  }
}
