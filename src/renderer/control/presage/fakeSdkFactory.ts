import type { SdkFactory, SdkLike } from '../../../sensing/presage/PresageSignalSource';

/** Counters the e2e tests read through `window.__standinFakeSdk`. */
export interface FakeSdkStats {
  created: number;
  starts: number;
  stops: number;
  running: boolean;
  /** Validation reports emitted (stand-in for "frames analysed"). */
  reports: number;
}

/**
 * E2E-only stand-in for the SmartSpectra renderer SDK (STANDIN_E2E=1 and STANDIN_FAKE_SDK=1):
 * while started it reports `kOk` validation 20 times a second, so tests can see exactly
 * when the app has the SDK analysing frames. It never contacts Presage.
 */
export function createFakeSdkFactory(stats: FakeSdkStats): SdkFactory {
  return {
    create: () => {
      stats.created++;
      const handlers = new Map<string, (...a: never[]) => void>();
      let timer: ReturnType<typeof setInterval> | undefined;
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = undefined;
        stats.running = false;
      };
      const sdk = {
        useMediaStream: () => sdk,
        start: async () => {
          stats.starts++;
          stats.running = true;
          timer ??= setInterval(() => {
            stats.reports++;
            (handlers.get('validationStatus') as ((c: number, t: number, h: string) => void) | undefined)?.(
              0,
              Date.now() * 1000,
              '',
            );
          }, 50);
        },
        stop: async () => {
          stats.stops++;
          stop();
        },
        reset: async () => undefined,
        destroy: stop,
        on: (event: string, cb: (...a: never[]) => void) => {
          handlers.set(event, cb);
          return sdk;
        },
      };
      return sdk as unknown as SdkLike;
    },
    decode: () => ({}),
  };
}
