import { type BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '../shared/ipc';
import type { DemoSaveRequest } from '../shared/demos';
import { DemoLibrary } from './demoLibrary';
import type { SettingsStore } from './settingsStore';

/**
 * Wires the demo library to IPC. The library folder comes from settings (a folder the user
 * picked in a native dialog) or defaults to `<userData>/demos`; the renderer cannot set it.
 * E2E runs may answer the folder dialogs with STANDIN_E2E_PICK_DIR.
 */
export function bindDemoLibrary(opts: {
  userData: string;
  settings: () => SettingsStore;
  window: () => BrowserWindow | null;
  e2ePickDir?: string;
}): void {
  const library = () => {
    const dir = opts.settings().get().recorded.libraryDir;
    return dir ? new DemoLibrary(dir) : new DemoLibrary(join(opts.userData, 'demos'), true);
  };
  const pickFolder = async (title: string, create: boolean): Promise<string | null> => {
    if (opts.e2ePickDir) return opts.e2ePickDir;
    const win = opts.window();
    const props: ('openDirectory' | 'createDirectory')[] = create
      ? ['openDirectory', 'createDirectory']
      : ['openDirectory'];
    const r = win
      ? await dialog.showOpenDialog(win, { title, properties: props })
      : await dialog.showOpenDialog({ title, properties: props });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  };

  ipcMain.handle(IPC.demosList, () => library().list());
  ipcMain.handle(IPC.demoLoad, (_e, id: unknown) => library().load(String(id)));
  ipcMain.handle(IPC.demoSave, (_e, req: DemoSaveRequest) => {
    const video = req?.video instanceof Uint8Array ? req.video : new Uint8Array(0);
    return library().save({ ...req, video });
  });
  ipcMain.handle(IPC.demoRename, (_e, id: unknown, name: unknown) =>
    library().rename(String(id), String(name)),
  );
  ipcMain.handle(IPC.demoDelete, (_e, id: unknown) => {
    library().delete(String(id));
    if (opts.settings().get().recorded.lastDemo === id)
      opts.settings().update({ recorded: { lastDemo: null } });
  });
  ipcMain.handle(IPC.demoExport, async (_e, id: unknown) => {
    const lib = library();
    lib.summary(String(id)); // fail before showing a dialog for an unknown demo
    const dir = await pickFolder('Export demo video and telemetry to…', true);
    return dir ? lib.exportTo(String(id), dir) : null;
  });
  ipcMain.handle(IPC.demoChooseFolder, async () => {
    const dir = await pickFolder('Keep saved demos in…', true);
    if (!dir) return null;
    opts.settings().update({ recorded: { libraryDir: dir, lastDemo: null } });
    return library().list();
  });
  ipcMain.handle(IPC.demoResetFolder, () => {
    opts.settings().update({ recorded: { libraryDir: null, lastDemo: null } });
    return library().list();
  });
  ipcMain.handle(IPC.demoOpenFolder, async () => {
    const { root } = library();
    mkdirSync(root, { recursive: true });
    await shell.openPath(root);
  });
}
