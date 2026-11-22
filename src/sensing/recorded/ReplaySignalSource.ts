import { Emitter } from '../../core/util/Emitter';
import type { Clock } from '../../core/util/Clock';
import type { TelemetryFile, TelemetryFrame } from '../../shared/telemetry';
import type { SignalFrame } from '../../shared/types';
import type { SignalSource, SignalSourceEvents, SourceStatus } from '../SignalSource';

/** A jump back of more than this (ms) counts as a seek or loop. */
const BACK_JUMP_MS = 250;
/** A jump forward of more than this (ms) skips the frames in between. */
const SKIP_MS = 1_500;

/**
 * Offline replay of saved telemetry, synchronised to the clip: every `sync(mediaMs)` emits
 * the saved frames up to that media time, stamped with the current clock. It never uses the
 * Presage SDK. A seek back or a loop calls `onRewind` (the engine drops its signal history)
 * and continues from there; a big jump forward skips the frames in between.
 */
export class ReplaySignalSource implements SignalSource {
  readonly kind = 'replay' as const;
  readonly events = new Emitter<SignalSourceEvents>();
  private _status: SourceStatus = 'idle';
  private cursor = 0;
  private lastMs = -1;
  /** Frames emitted so far (diagnostics). */
  emitted = 0;

  constructor(
    readonly telemetry: TelemetryFile,
    private readonly clock: Clock,
    private readonly onRewind: () => void = () => undefined,
  ) {}

  get status(): SourceStatus {
    return this._status;
  }

  async start(): Promise<void> {
    this.setStatus('running');
  }

  async stop(): Promise<void> {
    this.setStatus('stopped');
  }

  /** Call every stage frame with the clip's media time (ms). */
  sync(mediaMs: number): void {
    if (this._status !== 'running' || !Number.isFinite(mediaMs)) return;
    const frames = this.telemetry.frames;
    if (mediaMs + BACK_JUMP_MS < this.lastMs) {
      this.cursor = firstAfter(frames, mediaMs - SKIP_MS);
      this.onRewind();
    } else if (mediaMs - this.lastMs > SKIP_MS) {
      // Jumped ahead: start shortly before the new position, like a live SDK warming up.
      this.cursor = Math.max(this.cursor, firstAfter(frames, mediaMs - SKIP_MS));
    }
    this.lastMs = mediaMs;
    const t = this.clock.now();
    while (this.cursor < frames.length && (frames[this.cursor] as TelemetryFrame).tMs <= mediaMs) {
      const { tMs: _ms, ...rest } = frames[this.cursor] as TelemetryFrame;
      this.cursor++;
      this.emitted++;
      this.events.emit('frame', { ...rest, t } as SignalFrame);
    }
  }

  private setStatus(s: SourceStatus): void {
    this._status = s;
    this.events.emit('status', s);
  }
}

/** Index of the first frame with tMs > ms (binary search). */
export function firstAfter(frames: readonly TelemetryFrame[], ms: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((frames[mid] as TelemetryFrame).tMs <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
