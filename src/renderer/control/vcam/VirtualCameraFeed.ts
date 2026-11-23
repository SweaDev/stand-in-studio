import { VCAM_FRAME_BYTES, VCAM_HEIGHT, VCAM_WIDTH } from '../../../shared/vcam';
import type { VirtualCameraApi } from '../../../shared/ipc';
import { YuyvConverter } from './YuyvConverter';

/** The still picture apps keep showing when the camera stops or the app quits. */
export function drawPausedFrame(ctx: OffscreenCanvasRenderingContext2D, background: string): void {
  const w = VCAM_WIDTH;
  const h = VCAM_HEIGHT;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.fillText('Stand-In paused', w / 2, h / 2 - 20);
  ctx.font = '400 30px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('back in a moment', w / 2, h / 2 + 44);
}

/**
 * Sends the Virtual Stage picture to the native virtual camera, one YUYV frame per stage
 * frame, converted on the GPU. Frames are only produced while the camera is live.
 */
export class VirtualCameraFeed {
  private readonly converter: YuyvConverter;
  private readonly buffers = [new Uint8Array(VCAM_FRAME_BYTES), new Uint8Array(VCAM_FRAME_BYTES)];
  private flip = 0;
  live = false;
  /** Frames sent and the mean conversion time (ms), for diagnostics. */
  sent = 0;
  convertMs = 0;

  constructor(
    private readonly api: VirtualCameraApi,
    forceJs = false,
  ) {
    this.converter = new YuyvConverter(VCAM_WIDTH, VCAM_HEIGHT, forceJs);
  }

  get backend(): 'webgl2' | 'js' {
    return this.converter.backend;
  }

  /** The "paused" frame for this background, handed to main for stop and quit. */
  pausedFrame(background: string): Uint8Array {
    const c = new OffscreenCanvas(VCAM_WIDTH, VCAM_HEIGHT);
    drawPausedFrame(c.getContext('2d') as OffscreenCanvasRenderingContext2D, background);
    const out = new Uint8Array(VCAM_FRAME_BYTES);
    this.converter.convert(c, out);
    return out;
  }

  /**
   * Diagnostics: converts a colour test card with the active backend and with the JS
   * reference, and returns the largest byte difference (0–2 is rounding).
   */
  selfTest(): { backend: string; maxDiff: number } {
    const c = new OffscreenCanvas(VCAM_WIDTH, VCAM_HEIGHT);
    const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, VCAM_WIDTH, VCAM_HEIGHT);
    g.addColorStop(0, '#ff0000');
    g.addColorStop(0.33, '#00ff00');
    g.addColorStop(0.66, '#0000ff');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VCAM_WIDTH, VCAM_HEIGHT);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 200, 100); // a corner marker checks the orientation (top-left)
    const a = new Uint8Array(VCAM_FRAME_BYTES);
    const b = new Uint8Array(VCAM_FRAME_BYTES);
    this.converter.convert(c, a);
    new YuyvConverter(VCAM_WIDTH, VCAM_HEIGHT, true).convert(c, b);
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++)
      maxDiff = Math.max(maxDiff, Math.abs((a[i] as number) - (b[i] as number)));
    return { backend: this.converter.backend, maxDiff };
  }

  /** Called every stage frame with the full-size Virtual Stage picture. */
  push(source: CanvasImageSource): void {
    if (!this.live) return;
    const t = performance.now();
    const out = this.buffers[(this.flip ^= 1)] as Uint8Array;
    this.converter.convert(source, out);
    this.api.sendFrame(out);
    const dt = performance.now() - t;
    this.convertMs = this.sent === 0 ? dt : this.convertMs * 0.95 + dt * 0.05;
    this.sent++;
  }
}
