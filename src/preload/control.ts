import { contextBridge } from 'electron';

/** Minimal bridge exposed to the control renderer; grows with the typed IPC API in T28. */
const studio = {
  platform: process.platform,
};

export type StudioBridge = typeof studio;

contextBridge.exposeInMainWorld('studio', studio);
