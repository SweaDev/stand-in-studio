import type { ValidationState } from '../../shared/types';
import { TimeWindow } from '../util/RingBuffer';

/**
 * The SDK reports a validation code about once per frame, and non-OK codes flicker even on
 * good input (docs/sdk-notes.md: ~30% "too dark" on a well-lit interview). This filter
 * reports the dominant state over a short window instead of the latest code.
 */
export class ValidationFilter {
  private readonly window: TimeWindow<ValidationState>;
  private current: ValidationState = 'noFace';

  constructor(
    windowMs = 1_500,
    private readonly okShare = 0.35,
    private readonly noFaceShare = 0.6,
  ) {
    this.window = new TimeWindow(windowMs);
  }

  push(state: ValidationState, now: number): ValidationState {
    this.window.push(now, state);
    return this.evaluate(now);
  }

  evaluate(now: number): ValidationState {
    this.window.prune(now);
    const vals = this.window.values();
    if (vals.length === 0) {
      // No validation at all for a while means no frames are being analysed.
      this.current = 'noFace';
      return this.current;
    }
    const share = (s: ValidationState) => vals.filter((v) => v === s).length / vals.length;
    if (share('noFace') >= this.noFaceShare) this.current = 'noFace';
    else if (share('ok') >= this.okShare) this.current = 'ok';
    else this.current = 'poor';
    return this.current;
  }

  get state(): ValidationState {
    return this.current;
  }

  reset(): void {
    this.window.clear();
    this.current = 'noFace';
  }
}
