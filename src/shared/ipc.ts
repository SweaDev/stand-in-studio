/** IPC channel names shared by main and preload. */
export const IPC = Object.freeze({
  appInfo: 'studio:app-info',
});

/** Static facts about this run, fetched once by the preload. */
export interface AppInfo {
  platform: string;
  version: string;
  /** Running under the Playwright e2e harness (enables test hooks). */
  e2e: boolean;
}

/** Name of the stage window opened with window.open (main matches it). */
export const STAGE_FRAME_NAME = 'stand-in-stage';
