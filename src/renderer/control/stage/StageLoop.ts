import type { StudioEngine } from '../../../core/StudioEngine';
import type { StageState } from '../../../shared/types';
import { StageCompositor, type FeedSource } from '../../../render/StageCompositor';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../../../shared/app';
import type { StageHost } from './StageHost';

const FRAME_MS = 1000 / 30;

/**
 * Drives the stage at 30 fps with a timer (not requestAnimationFrame, which pauses for
 * hidden windows): engine tick → compositor → stage canvas, plus a control-window
 * thumbnail and a listener for UI updates.
 */
export class StageLoop {
  private timer: number | undefined;
  private compositor: StageCompositor | null = null;
  private surface: HTMLCanvasElement | null = null;
  private frames = 0;
  private fpsWindowStart = performance.now();
  fps = 0;

  constructor(
    private readonly engine: StudioEngine,
    private readonly host: StageHost,
    private readonly feed: () => FeedSource | null,
    private readonly thumbnail: HTMLCanvasElement | null,
    private readonly onFrame: (s: StageState) => void = () => undefined,
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

    if (this.thumbnail && this.frames % 2 === 0) {
      const tctx = this.thumbnail.getContext('2d');
      if (tctx) {
        if (surface) {
          tctx.drawImage(surface, 0, 0, this.thumbnail.width, this.thumbnail.height);
        } else {
          // Stage window closed: still preview what it would show.
          new StageCompositor(tctx, this.thumbnail.width, this.thumbnail.height).render(state, feed, t);
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
