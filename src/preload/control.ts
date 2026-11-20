import { contextBridge, ipcRenderer } from 'electron';
import type { CommandName } from '../core/stage/commands';
import { isCommandName } from '../core/stage/commands';
import { IPC, type AppInfo, type StudioApi } from '../shared/ipc';
// The SmartSpectra SDK's own bridge (exposes window.__smartspectraBridge for the renderer SDK).
import '@smartspectra/node-sdk/preload';

const info = ipcRenderer.sendSync(IPC.appInfo) as AppInfo;

/** The bridge exposed to the control renderer as `window.studio`. The API key never crosses it. */
const studio: StudioApi = {
  info,
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  setSettings: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
  onCommand: (fn) => {
    const listener = (_e: unknown, name: unknown) => {
      if (isCommandName(name)) fn(name as CommandName);
    };
    ipcRenderer.on(IPC.command, listener);
    return () => ipcRenderer.removeListener(IPC.command, listener);
  },
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  apiKeyStatus: () => ipcRenderer.invoke(IPC.apiKeyStatus),
  setApiKey: (key) => ipcRenderer.invoke(IPC.apiKeySet, key),
  clearApiKey: () => ipcRenderer.invoke(IPC.apiKeyClear),
};

export type StudioBridge = StudioApi;

contextBridge.exposeInMainWorld('studio', studio);
