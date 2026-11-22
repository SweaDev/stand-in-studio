import type { FeedSource } from '../../../render/StageCompositor';

/**
 * A recorded clip playing in a muted <video>: the stage draws from it, and (with an API
 * key) the Presage SDK analyses its captured stream exactly as it would a webcam. The clip
 * stays in memory as a blob URL; nothing is written unless the user saves a demo.
 */
export class RecordedFeed {
  readonly video: HTMLVideoElement;
  private readonly url: string;
  private captured: MediaStream | null = null;
  private readonly listeners: (() => void)[] = [];
  private readonly playListeners: (() => void)[] = [];

  private constructor(
    readonly blob: Blob,
    readonly name: string,
    readonly ext: string,
  ) {
    this.url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.loop = true;
    v.preload = 'auto';
    v.src = this.url;
    for (const ev of ['play', 'pause', 'ended', 'seeked', 'timeupdate'])
      v.addEventListener(ev, () => this.listeners.forEach((fn) => fn()));
    for (const ev of ['play', 'playing', 'pause', 'ended'])
      v.addEventListener(ev, () => this.playListeners.forEach((fn) => fn()));
    this.video = v;
  }

  /** Loads the clip; rejects if Chromium cannot decode it. */
  static async open(blob: Blob, name: string, ext: string): Promise<RecordedFeed> {
    const feed = new RecordedFeed(blob, name, ext);
    await new Promise<void>((resolve, reject) => {
      const v = feed.video;
      v.addEventListener('loadeddata', () => resolve(), { once: true });
      v.addEventListener(
        'error',
        () =>
          reject(new Error(`This video could not be played (${v.error?.message || 'unsupported format'}).`)),
        { once: true },
      );
    }).catch((err) => {
      feed.close();
      throw err;
    });
    return feed;
  }

  /** Any change to playback (play, pause, seek, end, time). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Playback started, paused or ended (not time updates). */
  onPlayState(fn: () => void): void {
    this.playListeners.push(fn);
  }

  feed(): FeedSource | null {
    const v = this.video;
    return v.videoWidth > 0 && v.readyState >= 2
      ? { image: v, width: v.videoWidth, height: v.videoHeight }
      : null;
  }

  /** The clip's frames as a MediaStream (for the SDK's useMediaStream). */
  stream(): MediaStream {
    const v = this.video as HTMLVideoElement & { captureStream(): MediaStream };
    this.captured ??= v.captureStream();
    return this.captured;
  }

  get mediaMs(): number {
    return this.video.currentTime * 1000;
  }

  get durationMs(): number {
    const d = this.video.duration;
    return Number.isFinite(d) ? d * 1000 : 0;
  }

  get playing(): boolean {
    return !this.video.paused && !this.video.ended;
  }

  get width(): number {
    return this.video.videoWidth;
  }

  get height(): number {
    return this.video.videoHeight;
  }

  async play(): Promise<void> {
    await this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  seek(ms: number): void {
    this.video.currentTime = Math.max(0, Math.min(this.durationMs, ms)) / 1000;
  }

  set loop(on: boolean) {
    this.video.loop = on;
  }

  get loop(): boolean {
    return this.video.loop;
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.blob.arrayBuffer());
  }

  close(): void {
    this.video.pause();
    this.captured?.getTracks().forEach((t) => t.stop());
    this.captured = null;
    this.video.removeAttribute('src');
    this.video.load();
    URL.revokeObjectURL(this.url);
  }
}
