import type { StudioEngine } from '../../../core/StudioEngine';
import type { StageState } from '../../../shared/types';
import { StageCompositor, type FeedSource } from '../../../render/StageCompositor';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../../../shared/app';
import { drawRawPreview } from '../../../render/rawPreview';
import type { StageHost } from './StageHost';

const FRAME_MS = 1000 / 30;

/**
 * Drives the stage at 30 fps with a timer (not requestAnimationFrame, which pauses for
 * hidden windows): engine tick → compositor → stage canvas, plus a control-window
 * preview of the raw input, a small inset of the processed output, and a listener for UI
 * updates.
 */
export class StageLoop {
  private timer: number | undefined;
  private compositor: StageCompositor | null = null;
  private surface: HTMLCanvasElement | null = null;
  private insetCompositor: StageCompositor | null = null;
  private frames = 0;
  private fpsWindowStart = performance.now();
  fps = 0;

  constructor(
    private readonly engine: StudioEngine,
    private readonly host: StageHost,
    private readonly feed: () => FeedSource | null,
    /** Control-window previews: the raw input, and an inset of the Virtual Stage output. */
    private readonly previews: { raw: HTMLCanvasElement | null; inset: HTMLCanvasElement | null },
    private readonly onFrame: (s: StageState) => void = () => undefined,
    /** Runs before each engine tick (a replay feeds the frames due by now). */
    private readonly beforeTick: () => void = () => undefined,
  ) {}

  start(): void {
    if (this.timer !== undefined) return;
    this.timer = window.setInterval(() => this.frame(), FRAME_MS);
  }

  stop(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private frame(): void {
    this.beforeTick();
    const state = this.engine.tick();
    const t = performance.now();
    const surface = this.host.surface;
    if (surface !== this.surface) {
      this.surface = surface;
      const ctx = surface?.getContext('2d');
      this.compositor = ctx ? new StageCompositor(ctx, STAGE_WIDTH, STAGE_HEIGHT) : null;
    }
    const feed = this.feed();
    if (this.compositor) this.compositor.render(state, feed, t);

    if (this.frames % 2 === 0) {
      const { raw, inset } = this.previews;
      const rctx = raw?.getContext('2d');
      if (raw && rctx) drawRawPreview(rctx, raw.width, raw.height, feed);
      const ictx = inset?.getContext('2d');
      if (inset && ictx) {
        if (surface) {
          ictx.drawImage(surface, 0, 0, inset.width, inset.height);
        } else {
          // Virtual Stage window closed: still show what it would send.
          if (this.insetCompositor?.width !== inset.width) {
            this.insetCompositor = new StageCompositor(ictx, inset.width, inset.height);
          }
          this.insetCompositor.render(state, feed, t);
        }
      }
    }
    this.onFrame(state);

    this.frames++;
    if (t - this.fpsWindowStart >= 1000) {
      this.fps = (this.frames * 1000) / (t - this.fpsWindowStart);
      this.frames = 0;
      this.fpsWindowStart = t;
    }
  }
}
