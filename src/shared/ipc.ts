import type { CommandName } from '../core/stage/commands';
import type { DeepPartial, Settings } from './settings';
import { INTENTS_GUIDE, PRESAGE_DOCS } from './signalCatalog';

/** IPC channel names shared by main and preload. */
export const IPC = Object.freeze({
  appInfo: 'studio:app-info',
  settingsGet: 'studio:settings-get',
  settingsSet: 'studio:settings-set',
  command: 'studio:command',
  openExternal: 'studio:open-external',
  apiKeyStatus: 'studio:api-key-status',
  apiKeySet: 'studio:api-key-set',
  apiKeyClear: 'studio:api-key-clear',
  appQuitting: 'studio:app-quitting',
});

/** Static facts about this run, fetched once by the preload. */
export interface AppInfo {
  platform: string;
  version: string;
  /** Running under the Playwright e2e harness (enables test hooks). */
  e2e: boolean;
  /** Force Demo mode even if a key is available (STANDIN_DEMO=1). */
  forceDemo: boolean;
  /** E2E only: use a fake SDK in the renderer (STANDIN_E2E=1 and STANDIN_FAKE_SDK=1). */
  fakeSdk: boolean;
}

/** Whether a Presage API key is available in the main process. Never the key itself. */
export interface ApiKeyStatus {
  available: boolean;
  source: 'env' | 'pasted' | null;
}

/** The API the preload exposes to the control renderer as `window.studio`. */
export interface StudioApi {
  info: AppInfo;
  getSettings(): Promise<Settings>;
  setSettings(patch: DeepPartial<Settings>): Promise<Settings>;
  onCommand(fn: (name: CommandName) => void): () => void;
  openExternal(url: string): Promise<boolean>;
  apiKeyStatus(): Promise<ApiKeyStatus>;
  setApiKey(key: string): Promise<ApiKeyStatus>;
  clearApiKey(): Promise<ApiKeyStatus>;
  /** Main is about to quit: stop sensing now. */
  onQuitting(fn: () => void): () => void;
}

/** Name of the stage window opened with window.open (main matches it). */
export const STAGE_FRAME_NAME = 'stand-in-stage';

/** External pages the app may open in the system browser. */
export const EXTERNAL_LINKS = Object.freeze({
  presagePrivacy: 'https://smartspectra.presagetech.com/docs/telemetry-and-privacy',
  presageKey: 'https://physiology.presagetech.com/auth/login',
  obs: 'https://obsproject.com/download',
  v4l2loopback: 'https://github.com/umlaeute/v4l2loopback',
});

/** Every page the app may open: fixed links plus the signal documentation. */
const ALLOWED_EXTERNAL: ReadonlySet<string> = new Set([
  ...Object.values(EXTERNAL_LINKS),
  ...Object.values(PRESAGE_DOCS),
  INTENTS_GUIDE,
]);

export function isAllowedExternal(url: string): boolean {
  return ALLOWED_EXTERNAL.has(url);
}
