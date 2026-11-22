import type { SignalFrame } from '../../shared/types';
import {
  type TelemetryFile,
  type TelemetryFrame,
  type TelemetryVideo,
  TELEMETRY_FORMAT,
  TELEMETRY_VERSION,
  toTelemetryFrame,
} from '../../shared/telemetry';

export interface TelemetryRecorderOptions {
  /** Media time of the clip right now, in ms (video.currentTime, or recorder elapsed time). */
  mediaTime: () => number;
  /** Keep pulse and breathing (the user opted in). */
  includeBody: boolean;
}

/**
 * Collects SignalFrames from a live Presage source while a clip plays once, stamping each
 * with the clip's media time on arrival (so the SDK's real latency is part of the record).
 * Media time must only move forward: a seek or loop back aborts the recording.
 */
export class TelemetryRecorder {
  private readonly frames: TelemetryFrame[] = [];
  private lastMs = 0;
  private _aborted: string | null = null;
  private finished = false;

  constructor(private readonly opts: TelemetryRecorderOptions) {}

  /** Feed every frame the live source emits. */
  push(frame: SignalFrame): void {
    if (this.finished || this._aborted) return;
    const ms = this.opts.mediaTime();
    if (!Number.isFinite(ms)) return;
    if (ms + 250 < this.lastMs) {
      this.abort('The clip jumped back while telemetry was being saved. Start again from the beginning.');
      return;
    }
    this.lastMs = Math.max(this.lastMs, ms);
    const f = toTelemetryFrame(frame, this.lastMs, this.opts.includeBody);
    if (f) this.frames.push(f);
  }

  abort(reason: string): void {
    if (!this.finished) this._aborted ??= reason;
  }

  get aborted(): string | null {
    return this._aborted;
  }

  get count(): number {
    return this.frames.length;
  }

  /** Media time of the newest frame (ms). */
  get progressMs(): number {
    return this.lastMs;
  }

  /** Ends the recording and returns the file. Throws if it was aborted or is empty. */
  finish(meta: { app: string; sdk: string; video: TelemetryVideo; now?: Date }): TelemetryFile {
    this.finished = true;
    if (this._aborted) throw new Error(this._aborted);
    if (this.frames.length === 0)
      throw new Error('Presage sent no signals for this clip, so there is nothing to save.');
    return {
      format: TELEMETRY_FORMAT,
      version: TELEMETRY_VERSION,
      app: meta.app,
      sdk: meta.sdk,
      createdAt: (meta.now ?? new Date()).toISOString(),
      includesBody: this.opts.includeBody,
      video: meta.video,
      frames: [...this.frames],
    };
  }
}
