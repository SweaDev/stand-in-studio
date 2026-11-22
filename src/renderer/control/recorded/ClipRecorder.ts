/** Longest clip the in-app recorder makes (it stops on its own). */
export const MAX_RECORDING_MS = 5 * 60_000;

const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/**
 * Records the camera stream to a WebM clip in memory (MediaRecorder), video only. Nothing
 * reaches the disk until the user's save goes through the demo library.
 */
export class ClipRecorder {
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private readonly done: Promise<Blob>;

  constructor(stream: MediaStream) {
    const video = new MediaStream(stream.getVideoTracks());
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(video, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : {});
    this.recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    this.done = new Promise((resolve, reject) => {
      this.recorder.addEventListener('stop', () => resolve(new Blob(this.chunks, { type: 'video/webm' })));
      this.recorder.addEventListener('error', () => reject(new Error('The recording failed.')));
    });
  }

  start(): void {
    this.recorder.start(1000);
  }

  get recording(): boolean {
    return this.recorder.state === 'recording';
  }

  /** Stops and returns the clip. */
  async stop(): Promise<Blob> {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.done;
  }
}
