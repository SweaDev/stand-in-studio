import { C } from '../constants';

/** Below this calibrated eye openness the landmarks are too coarse for a blink backup. */
export const MIN_BACKUP_OPENNESS = 0.12;

export interface BlinkInput {
  /** SDK `face.blinking` detection for this packet. */
  sdkBlink?: boolean;
  /** Eye openness from landmarks (backup signal). */
  eyeOpenness?: number;
}

/**
 * Detects blinks (REQUIREMENT §4): the SDK's blink flag is primary (rising edge, since one
 * blink spans several samples); eye openness from landmarks is the backup when it drops
 * below 60% of the calibrated level. Each blink animates for 140 ms, followed by a 250 ms
 * refractory period.
 */
export class BlinkDetector {
  private lastStart = Number.NEGATIVE_INFINITY;
  private prevSdk = false;
  private prevBackup = false;

  /** Returns true when a new blink starts at `now`. */
  update(input: BlinkInput, calibratedOpenness: number | null, now: number): boolean {
    const sdkEdge = input.sdkBlink === true && !this.prevSdk;
    if (input.sdkBlink !== undefined) this.prevSdk = input.sdkBlink;

    let backupEdge = false;
    if (
      input.eyeOpenness !== undefined &&
      calibratedOpenness !== null &&
      calibratedOpenness >= MIN_BACKUP_OPENNESS
    ) {
      const closed = input.eyeOpenness < calibratedOpenness * C.BLINK_BACKUP_RATIO;
      backupEdge = closed && !this.prevBackup;
      this.prevBackup = closed;
    }

    if (!(sdkEdge || backupEdge)) return false;
    if (now - this.lastStart < C.BLINK_MS + C.BLINK_REFRACTORY_MS) return false;
    this.lastStart = now;
    return true;
  }

  /** Forces a blink (Demo mode); respects the refractory period. */
  trigger(now: number): boolean {
    if (now - this.lastStart < C.BLINK_MS + C.BLINK_REFRACTORY_MS) return false;
    this.lastStart = now;
    return true;
  }

  /** Eye openness for the character, 1 = open: closes and reopens over 140 ms. */
  eyeOpen(now: number): number {
    const dt = now - this.lastStart;
    if (dt < 0 || dt >= C.BLINK_MS) return 1;
    const half = C.BLINK_MS / 2;
    return dt < half ? 1 - dt / half : (dt - half) / half;
  }

  reset(): void {
    this.lastStart = Number.NEGATIVE_INFINITY;
    this.prevSdk = false;
    this.prevBackup = false;
  }
}
