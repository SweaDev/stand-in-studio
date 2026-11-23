import { renameSync, writeFileSync } from 'node:fs';

/** Write-then-rename, so a reader never sees a half-written file. */
function atomicWrite(file: string, data: string | Uint8Array): void {
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}
import type { VirtualCameraSink } from './sink';

/**
 * E2E stand-in for the virtual camera (STANDIN_E2E=1 and STANDIN_FAKE_VCAM=<file>): keeps
 * the latest frame in <file> and counters in <file>.json, so tests can check what a meeting
 * app would receive without a kernel module.
 */
export class FileSink implements VirtualCameraSink {
  frames = 0;
  dropped = 0;
  private open = false;
  private size = 0;
  private stats = { started: 0, stopped: 0, frames: 0, lastWasPausedFrame: false, width: 0, height: 0 };

  constructor(private readonly file: string) {}

  private flush(): void {
    atomicWrite(`${this.file}.json`, JSON.stringify({ ...this.stats, frames: this.frames }));
  }

  async start(width: number, height: number): Promise<{ device: string; label: string }> {
    this.open = true;
    this.size = width * height * 2;
    this.stats = { ...this.stats, started: this.stats.started + 1, width, height, lastWasPausedFrame: false };
    this.flush();
    return { device: this.file, label: 'Stand-In Camera' };
  }

  writeFrame(frame: Uint8Array): void {
    if (!this.open || frame.byteLength !== this.size) return;
    atomicWrite(this.file, frame);
    this.frames++;
    if (this.frames % 5 === 0) this.flush();
  }

  async stop(lastFrame?: Uint8Array): Promise<void> {
    if (!this.open) return;
    this.open = false;
    if (lastFrame && lastFrame.byteLength === this.size) {
      atomicWrite(this.file, lastFrame);
      this.stats.lastWasPausedFrame = true;
    }
    this.stats.stopped++;
    this.flush();
  }
}
