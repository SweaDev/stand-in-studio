import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuitHandler, teardownSessions, type SdkSessionLike } from '../../../src/main/sdkShutdown';

function fakeSession(log: string[], name: string, stopMs = 0): SdkSessionLike {
  return {
    stopAsync: () =>
      new Promise((r) =>
        setTimeout(() => {
          log.push(`${name}:stopped`);
          r(undefined);
        }, stopMs),
      ),
    destroy: () => {
      log.push(`${name}:destroyed`);
      return Promise.resolve();
    },
  };
}

const event = () => ({ preventDefault: vi.fn() });

describe('SDK teardown on quit', () => {
  afterEach(() => vi.useRealTimers());

  it('stops each session before destroying it', async () => {
    const log: string[] = [];
    await teardownSessions([fakeSession(log, 'a'), fakeSession(log, 'b')]);
    expect(log.indexOf('a:stopped')).toBeLessThan(log.indexOf('a:destroyed'));
    expect(log.indexOf('b:stopped')).toBeLessThan(log.indexOf('b:destroyed'));
  });

  it('still destroys a session whose stop fails', async () => {
    const destroy = vi.fn();
    await teardownSessions([{ stopAsync: () => Promise.reject(new Error('x')), destroy }]);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('defers the quit until teardown finished, then exits once', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const exit = vi.fn((code: number) => log.push(`exit:${code}`));
    const notifyRenderer = vi.fn();
    const onQuit = createQuitHandler({
      sessions: () => [fakeSession(log, 's', 1_000)],
      exit,
      notifyRenderer,
    });
    const first = event();
    onQuit(first);
    expect(first.preventDefault).toHaveBeenCalled();
    expect(notifyRenderer).toHaveBeenCalledOnce();
    // A second quit request while stopping is swallowed.
    const again = event();
    onQuit(again);
    expect(again.preventDefault).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log).toEqual(['s:stopped', 's:destroyed', 'exit:0']);
    // After teardown the real quit (app.exit) is not intercepted.
    const final = event();
    onQuit(final);
    expect(final.preventDefault).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('exits after the timeout if a session hangs', async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const hang: SdkSessionLike = { stopAsync: () => new Promise(() => undefined), destroy: vi.fn() };
    createQuitHandler({ sessions: () => [hang], exit, timeoutMs: 5_000 })(event());
    await vi.advanceTimersByTimeAsync(4_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits at once when no session is live', async () => {
    const exit = vi.fn();
    createQuitHandler({ sessions: () => [], exit })(event());
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  });
});
