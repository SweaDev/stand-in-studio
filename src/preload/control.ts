import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppInfo } from '../shared/ipc';

const info = ipcRenderer.sendSync(IPC.appInfo) as AppInfo;

/** The bridge exposed to the control renderer as `window.studio`. */
const studio = {
  info,
};

export type StudioBridge = typeof studio;

contextBridge.exposeInMainWorld('studio', studio);
