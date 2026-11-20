/**
 * Time source in milliseconds. Every time-dependent module takes a Clock (or a `now`
 * argument) so that behaviour is deterministic under test.
 */
export interface Clock {
  now(): number;
}

/** Monotonic wall clock backed by `performance.now()`. */
export class SystemClock implements Clock {
  now(): number {
    return performance.now();
  }
}

/** Manually advanced clock for tests and scripted simulations. */
export class FakeClock implements Clock {
  private t: number;

  constructor(startMs = 0) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): number {
    if (ms < 0) throw new RangeError('FakeClock cannot go backwards');
    this.t += ms;
    return this.t;
  }

  set(ms: number): void {
    if (ms < this.t) throw new RangeError('FakeClock cannot go backwards');
    this.t = ms;
  }
}
