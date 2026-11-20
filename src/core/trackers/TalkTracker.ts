import { C } from '../constants';

/**
 * Debounced talking state. The SDK flag drops briefly between words, so talking ends only
 * after `releaseMs` of silence; `sustainedMs` measures the current talking run (Auto needs
 * talking sustained for over 1 s).
 */
export class TalkTracker {
  private since: number | undefined;
  private lastTrueAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly releaseMs = 600) {}

  update(talking: boolean | undefined, now: number): void {
    if (talking === true) {
      if (this.since === undefined) this.since = now;
      this.lastTrueAt = now;
    } else if (talking === false || talking === undefined) {
      if (this.since !== undefined && now - this.lastTrueAt > this.releaseMs) this.since = undefined;
    }
  }

  isTalking(now: number): boolean {
    if (this.since !== undefined && now - this.lastTrueAt > this.releaseMs) this.since = undefined;
    return this.since !== undefined;
  }

  sustainedMs(now: number): number {
    return this.isTalking(now) ? now - (this.since as number) : 0;
  }

  isSustained(now: number): boolean {
    return this.sustainedMs(now) > C.TALK_SUSTAIN_MS;
  }

  /** Time since the last positive talking sample. */
  sinceLastTalk(now: number): number {
    return now - this.lastTrueAt;
  }

  reset(): void {
    this.since = undefined;
    this.lastTrueAt = Number.NEGATIVE_INFINITY;
  }
}
