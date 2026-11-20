import type { Presence, ValidationState } from '../../shared/types';
import { C } from '../constants';

/**
 * Presence state machine (REQUIREMENT §4): not OK or no face for 3 s → away ("back soon");
 * OK again for 1 s → a wake-up stretch → present.
 */
export class PresenceTracker {
  private state: Presence = 'present';
  private notOkSince: number | undefined;
  private okSince: number | undefined;
  private wakeStartedAt = 0;

  update(validation: ValidationState, now: number): Presence {
    const ok = validation === 'ok';
    if (ok) {
      this.notOkSince = undefined;
      this.okSince ??= now;
    } else {
      this.okSince = undefined;
      this.notOkSince ??= now;
    }

    switch (this.state) {
      case 'present':
        if (!ok && now - (this.notOkSince as number) >= C.AWAY_AFTER_MS) this.state = 'away';
        break;
      case 'away':
        if (ok && now - (this.okSince as number) >= C.BACK_AFTER_MS) {
          this.state = 'waking';
          this.wakeStartedAt = now;
        }
        break;
      case 'waking':
        if (!ok && now - (this.notOkSince as number) >= C.AWAY_AFTER_MS) this.state = 'away';
        else if (now - this.wakeStartedAt >= C.WAKE_STRETCH_MS) this.state = 'present';
        break;
    }
    return this.state;
  }

  get presence(): Presence {
    return this.state;
  }

  /** 0..1 progress of the wake-up stretch (1 when not waking). */
  wakeProgress(now: number): number {
    if (this.state !== 'waking') return this.state === 'present' ? 1 : 0;
    return Math.min(1, (now - this.wakeStartedAt) / C.WAKE_STRETCH_MS);
  }

  /** Starts in the away state (e.g. before the first face is seen). */
  reset(state: Presence = 'present'): void {
    this.state = state;
    this.notOkSince = undefined;
    this.okSince = undefined;
  }
}
