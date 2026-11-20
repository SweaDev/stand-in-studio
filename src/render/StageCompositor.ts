import type { StageState } from '../shared/types';
import { backSoonBadge, handBadgeText, raisedHandBadge, speakingRing } from './badges';
import { inkFor } from './characters/Character';
import { characterOrDefault } from './characters/registry';
import { characterBox, coverCrop, feedBlurPx, feedRect } from './layout';
import type { Ctx2D } from './sketch';
import { drawTestPattern } from './testPattern';

export interface FeedSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Draws one stage frame. Layer order (REQUIREMENT §2), bottom to top: background colour,
 * camera feed at opacity α (soft blur below 30%), character, badges.
 */
export class StageCompositor {
  constructor(
    private readonly ctx: Ctx2D,
    readonly width: number,
    readonly height: number,
  ) {}

  render(s: StageState, feed: FeedSource | null, t: number): void {
    const { ctx, width: W, height: H } = this;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = 'none';

    if (s.testPattern) {
      drawTestPattern(ctx, W, H, t);
      ctx.restore();
      return;
    }

    // 1. Background.
    ctx.fillStyle = s.style.highContrast ? '#ffffff' : s.background;
    ctx.fillRect(0, 0, W, H);
    if (!s.style.highContrast) {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.1, W / 2, H / 2, W * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Feed.
    if (feed && s.feedOpacity > 0.001 && feed.width > 0 && feed.height > 0) {
      const dst = feedRect(s, W, H);
      const src = coverCrop(feed.width, feed.height, dst);
      const blur = feedBlurPx(s.feedOpacity, H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dst.x, dst.y, dst.w, dst.h);
      ctx.clip();
      ctx.globalAlpha = s.feedOpacity;
      if (blur > 0) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      ctx.drawImage(feed.image, src.x, src.y, src.w, src.h, dst.x, dst.y, dst.w, dst.h);
      ctx.restore();
    }

    // 3. Character.
    const box = characterBox(s, W, H);
    if (s.characterOpacity > 0.001) {
      ctx.save();
      ctx.globalAlpha = s.characterOpacity;
      characterOrDefault(s.character).draw({
        ctx,
        cx: box.cx,
        cy: box.cy,
        size: box.size,
        t,
        pose: s.pose,
        style: s.style,
        ink: inkFor(s.style, box.size),
      });
      ctx.restore();
    }

    // 4. Badges.
    if (s.badges.speaking && s.characterOpacity > 0.001) {
      speakingRing(ctx, box, t, s.style.highContrast, s.style.reducedMotion);
    }
    if (s.badges.raisedHand) {
      const r = H * 0.055;
      raisedHandBadge(ctx, W - r * 1.6, r * 1.6, r, s.style.highContrast);
      handBadgeText(ctx, W - r * 1.6, r * 3.6, H, s.style.highContrast);
    }
    if (s.badges.backSoon) backSoonBadge(ctx, W, H, s.style.highContrast);
    ctx.restore();
  }
}
