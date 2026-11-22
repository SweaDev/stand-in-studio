/* eslint-disable @typescript-eslint/no-require-imports -- loaded by path after the package exports map */
import { dirname, join } from 'node:path';

import type { SdkSessionLike } from './sdkShutdown';

interface SdkInstance {
  stopAsync?(): Promise<unknown>;
  destroy(): unknown;
}
type SdkCtor = new (opts?: Record<string, unknown>) => SdkInstance;
interface SdkModule {
  SmartSpectraSDK: SdkCtor & { __standinKeyInjected?: boolean };
}

/** Absolute path of the SDK's internal module that defines SmartSpectraSDK (3.5.0 layout). */
export function sdkInternalPath(file: string): string {
  return join(dirname(require.resolve('@smartspectra/node-sdk/package.json')), 'js', ...file.split('/'));
}

/**
 * Decorator: replaces the SDK class the IPC bridge instantiates with a subclass that
 * injects the API key held in main and forces telemetry off. The renderer therefore sends
 * `apiKey: ''` and the key never leaves this process.
 *
 * Must run before `@smartspectra/node-sdk/main` is first required, because that module
 * destructures `SmartSpectraSDK` from `../smartspectra` when it loads (SDK 3.5.0, pinned;
 * tests/unit/main/sdkInternals.test.ts guards this).
 */
/** SDK instances the IPC bridge created and has not finished destroying. */
const live = new Set<SdkSessionLike>();

/** Live main-process SDK instances, for graceful teardown on quit. */
export function liveSdkSessions(): SdkSessionLike[] {
  return [...live];
}

export function installKeyInjection(
  getKey: () => string | null,
  log: (msg: string) => void = () => undefined,
): void {
  const mod = require(sdkInternalPath('smartspectra.js')) as SdkModule;
  const Base = mod.SmartSpectraSDK;
  if (Base.__standinKeyInjected) return;
  class KeyInjectingSDK extends Base {
    static override __standinKeyInjected = true;
    constructor(opts: Record<string, unknown> = {}) {
      super({ ...opts, apiKey: getKey() ?? '', enableTelemetry: false });
      live.add(this);
      log(`[stand-in] sdk session created (${live.size} live)`);
    }

    override destroy(): unknown {
      const done = super.destroy();
      void Promise.resolve(done)
        .catch(() => undefined)
        .then(() => {
          if (live.delete(this)) log(`[stand-in] sdk session destroyed (${live.size} live)`);
        });
      return done;
    }
  }
  mod.SmartSpectraSDK = KeyInjectingSDK;
}
