import type { StudioEngine } from '../../../core/StudioEngine';
import type { Clock } from '../../../core/util/Clock';
import { DEMO_KEYS } from '../../../sensing/demo/DemoModel';
import { DemoSignalSource } from '../../../sensing/demo/DemoSignalSource';
import { ScriptPlayer } from '../../../sensing/demo/demoScript';
import type { FeedSource } from '../../../render/StageCompositor';
import { DemoFeed } from './DemoFeed';

/** Calibration in Demo mode is quick: the simulated person holds still. */
export const DEMO_CALIBRATION_MS = 3_000;

/**
 * Wires Demo mode together: simulated signals → engine, keyboard shortcuts, the scripted
 * meeting loop and the procedural sample feed.
 */
export class DemoController {
  readonly source: DemoSignalSource;
  readonly script: ScriptPlayer;
  private readonly feed: DemoFeed;
  private keys: AbortController | null = null;

  constructor(
    private readonly engine: StudioEngine,
    private readonly clock: Clock,
  ) {
    this.source = new DemoSignalSource(clock);
    this.feed = new DemoFeed(this.source.model);
    this.source.events.on('frame', (f) => engine.ingest(f));
    this.source.events.on('shieldTrigger', () => engine.simulateShieldTrigger());
    this.script = new ScriptPlayer(
      (step) => (step.type === 'release' ? this.source.release(step.action) : this.source.press(step.action)),
      () => this.source.model.reset(),
    );
  }

  async start(): Promise<void> {
    await this.source.start();
    this.engine.startCalibration(DEMO_CALIBRATION_MS);
  }

  async stop(): Promise<void> {
    this.keys?.abort();
    this.keys = null;
    this.script.stop();
    await this.source.stop();
  }

  /** Call every frame: advances the script and returns the sample feed. */
  frame(): FeedSource {
    const now = this.clock.now();
    this.script.update(now);
    return this.feed.source(now);
  }

  toggleScript(): void {
    if (this.script.isRunning) {
      this.script.stop();
      this.source.model.reset();
    } else {
      this.script.start(this.clock.now());
    }
  }

  /** Keyboard map (REQUIREMENT §8). Ignored while typing in a form field. */
  bindKeys(target: Window): void {
    if (this.keys) return;
    this.keys = new AbortController();
    const opts = { signal: this.keys.signal };
    const isTyping = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    target.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
        const action = DEMO_KEYS[e.key.toLowerCase()];
        if (action) this.source.press(action);
      },
      opts,
    );
    target.addEventListener(
      'keyup',
      (e) => {
        const action = DEMO_KEYS[e.key.toLowerCase()];
        if (action) this.source.release(action);
      },
      opts,
    );
  }
}
