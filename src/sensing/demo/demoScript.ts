import type { DemoAction } from './DemoModel';

export interface ScriptStep {
  at: number;
  action: DemoAction;
  /** 'press' for momentary actions/toggles; 'release' ends hold-to-talk. */
  type: 'press' | 'release';
  caption: string;
}

/** Length of one loop of the scripted meeting (REQUIREMENT §8). */
export const SCRIPT_MS = 60_000;

const s = (
  at: number,
  action: DemoAction,
  caption: string,
  type: 'press' | 'release' = 'press',
): ScriptStep => ({
  at: at * 1000,
  action,
  type,
  caption,
});

/**
 * A 60-second meeting: listening, nodding, talking, looking away, eating and stepping out,
 * which shows Auto mode end to end.
 */
export const MEETING_SCRIPT: readonly ScriptStep[] = [
  s(0, 'blink', 'Listening: the feed settles at the listening level'),
  s(5, 'nod', 'A nod reads as a clear character nod'),
  s(7.5, 'nod', 'Two nods: an enthusiastic nod'),
  s(8.3, 'nod', 'Two nods: an enthusiastic nod'),
  s(11, 'talk', 'Speaking: after a moment, you appear'),
  s(17, 'smile', 'A laugh while talking adds sparkles'),
  s(21, 'talk', 'Back to listening', 'release'),
  s(25, 'shake', 'A head shake sways the character'),
  s(29, 'lookAway', 'Looking away: the character covers for you'),
  s(35, 'lookAway', 'Facing the screen again'),
  s(38, 'eat', 'Eating at your desk: no chewing on camera'),
  s(44, 'eat', 'Done eating'),
  s(46, 'away', 'Stepping out: "back soon"'),
  s(53, 'away', 'Back: a wake-up stretch'),
  s(57, 'smile', 'A smile makes it glow'),
];

/** Plays the script on a loop; call `update(now)` regularly. */
export class ScriptPlayer {
  private startedAt = 0;
  private next = 0;
  private running = false;
  caption = '';

  constructor(
    private readonly onStep: (step: ScriptStep) => void,
    private readonly onLoop: () => void = () => undefined,
    private readonly script: readonly ScriptStep[] = MEETING_SCRIPT,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(now: number): void {
    this.running = true;
    this.startedAt = now;
    this.next = 0;
    this.onLoop();
  }

  stop(): void {
    this.running = false;
    this.caption = '';
  }

  /** Seconds into the current loop. */
  position(now: number): number {
    return this.running ? (now - this.startedAt) / 1000 : 0;
  }

  update(now: number): void {
    if (!this.running) return;
    if (now - this.startedAt >= SCRIPT_MS) {
      this.startedAt += SCRIPT_MS;
      this.next = 0;
      this.onLoop();
    }
    const elapsed = now - this.startedAt;
    while (this.next < this.script.length && (this.script[this.next] as ScriptStep).at <= elapsed) {
      const step = this.script[this.next] as ScriptStep;
      this.caption = step.caption;
      this.onStep(step);
      this.next++;
    }
  }
}
