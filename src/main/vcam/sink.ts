/** Where the Virtual Stage picture goes as a camera (a native backend per platform). */
export interface VirtualCameraSink {
  /** Opens the camera for frames of the given size; resolves with what other apps see. */
  start(width: number, height: number, fps: number): Promise<{ device: string; label: string }>;
  /** One packed YUYV frame (width × height × 2 bytes). Dropped if the previous is still being written. */
  writeFrame(frame: Uint8Array): void;
  /** Writes a final frame (if given) and closes the camera. */
  stop(lastFrame?: Uint8Array): Promise<void>;
  readonly frames: number;
  readonly dropped: number;
}
