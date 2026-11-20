import { computeFaceFeatures } from '../../../core/features/faceGeometry';
import type { DemoModel } from '../../../sensing/demo/DemoModel';
import { drawSampleFeed } from '../../../render/sampleFeed';
import type { FeedSource } from '../../../render/StageCompositor';

const W = 960;
const H = 540;

/** Canvas "camera" for Demo mode, redrawn from the simulated person each frame. */
export class DemoFeed {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly model: DemoModel) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  source(now: number): FeedSource {
    const frame = this.model.frame(now);
    const f = frame.landmarks ? computeFaceFeatures(frame.landmarks) : null;
    drawSampleFeed(
      this.ctx,
      W,
      H,
      {
        pitch: f ? f.pitch - 0.4 : 0,
        yaw: f ? f.yaw : 0,
        mouthOpen: f ? Math.min(1, f.mouthGap / 0.3) : 0,
        present: frame.validation !== 'noFace',
      },
      now,
    );
    return { image: this.canvas, width: W, height: H };
  }
}
