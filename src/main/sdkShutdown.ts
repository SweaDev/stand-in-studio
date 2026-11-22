/**
 * Graceful SmartSpectra teardown before the app exits.
 *
 * The SDK relays native worker-thread callbacks into JS through koffi thunks that do not
 * keep Node alive. If Electron disposes the main isolate while a session is still running
 * (or still draining a stopAsync), the next relayed callback aborts the whole process
 * (`napi_throw` → SIGABRT). So the first quit request is deferred until every live
 * session has been stopped and destroyed, bounded by a timeout.
 */

/** The slice of a main-process SmartSpectraSDK instance needed to wind it down. */
export interface SdkSessionLike {
  stopAsync?: () => Promise<unknown>;
  destroy: () => unknown;
}

export interface ShutdownDeps {
  /** Live SDK instances (see sdkKeyInjection's registry). */
  sessions: () => readonly SdkSessionLike[];
  /** Tells the renderer to stop sensing (best effort, not awaited for long). */
  notifyRenderer?: () => void;
  /** Exits the app for real (app.exit). */
  exit: (code: number) => void;
  timeoutMs?: number;
  log?: (msg: string) => void;
}

export interface QuitEvent {
  preventDefault(): void;
}

/** Stops then destroys every session; never rejects. */
export async function teardownSessions(sessions: readonly SdkSessionLike[]): Promise<void> {
  await Promise.allSettled(
    sessions.map(async (s) => {
      try {
        await s.stopAsync?.();
      } catch {
        // A session that fails to stop is still destroyed below.
      }
      await s.destroy();
    }),
  );
}

/**
 * Returns a `before-quit` handler. The first call prevents the quit, tears the SDK down
 * and then exits; repeated quit requests while that runs are swallowed.
 */
export function createQuitHandler(deps: ShutdownDeps): (e: QuitEvent) => void {
  let phase: 'running' | 'stopping' | 'done' = 'running';
  const timeoutMs = deps.timeoutMs ?? 5_000;
  return (e) => {
    if (phase === 'done') return;
    e.preventDefault();
    if (phase === 'stopping') return;
    phase = 'stopping';
    const sessions = deps.sessions();
    deps.log?.(`[stand-in] quitting: stopping ${sessions.length} SDK session(s)`);
    try {
      deps.notifyRenderer?.();
    } catch {
      // The renderer may already be gone.
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    void Promise.race([teardownSessions(sessions).then(() => 'ok' as const), timeout]).then((r) => {
      if (timer) clearTimeout(timer);
      if (r === 'timeout') deps.log?.('[stand-in] SDK teardown timed out; exiting anyway');
      phase = 'done';
      deps.exit(0);
    });
  };
}
