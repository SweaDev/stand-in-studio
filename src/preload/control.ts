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
  onQuitting: (fn) => {
    const listener = () => fn();
    ipcRenderer.on(IPC.appQuitting, listener);
    return () => ipcRenderer.removeListener(IPC.appQuitting, listener);
  },
  demos: {
    list: () => ipcRenderer.invoke(IPC.demosList),
    load: (id) => ipcRenderer.invoke(IPC.demoLoad, id),
    save: (req) => ipcRenderer.invoke(IPC.demoSave, req),
    rename: (id, name) => ipcRenderer.invoke(IPC.demoRename, id, name),
    delete: (id) => ipcRenderer.invoke(IPC.demoDelete, id),
    exportTo: (id) => ipcRenderer.invoke(IPC.demoExport, id),
    importBundle: (bytes) => ipcRenderer.invoke(IPC.demoImportBundle, bytes),
    chooseFolder: () => ipcRenderer.invoke(IPC.demoChooseFolder),
    resetFolder: () => ipcRenderer.invoke(IPC.demoResetFolder),
    openFolder: () => ipcRenderer.invoke(IPC.demoOpenFolder),
  },
  vcam: {
    status: () => ipcRenderer.invoke(IPC.vcamStatus),
    setup: () => ipcRenderer.invoke(IPC.vcamSetup),
    start: () => ipcRenderer.invoke(IPC.vcamStart),
    stop: (pausedFrame) => ipcRenderer.invoke(IPC.vcamStop, pausedFrame),
    setPausedFrame: (frame) => ipcRenderer.send(IPC.vcamPausedFrame, frame),
    sendFrame: (frame) => ipcRenderer.send(IPC.vcamFrame, frame),
  },
};

export type StudioBridge = StudioApi;

contextBridge.exposeInMainWorld('studio', studio);
