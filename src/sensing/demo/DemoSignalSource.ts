import { Emitter } from '../../core/util/Emitter';
import type { Clock } from '../../core/util/Clock';
import type { SignalSource, SignalSourceEvents, SourceStatus } from '../SignalSource';
import { type DemoAction, DemoModel } from './DemoModel';

const PACKET_MS = 50; // ~20 packets per second, like the SDK

/** Demo mode: simulated signals at the SDK's packet rate, driven by keys or a script. */
export class DemoSignalSource implements SignalSource {
  readonly kind = 'demo' as const;
  readonly events = new Emitter<SignalSourceEvents>();
  readonly model = new DemoModel();
  private timer: ReturnType<typeof setInterval> | undefined;
  private _status: SourceStatus = 'idle';

  constructor(private readonly clock: Clock) {}

  get status(): SourceStatus {
    return this._status;
  }

  async start(): Promise<void> {
    if (this.timer) return;
    this.timer = setInterval(() => this.events.emit('frame', this.model.frame(this.clock.now())), PACKET_MS);
    this.setStatus('running');
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.setStatus('stopped');
  }

  /** A key went down (or a scripted step fired). */
  press(action: DemoAction): void {
    if (action === 'shield') {
      this.events.emit('shieldTrigger', undefined);
      return;
    }
    if (action === 'talk') {
      this.model.talking = true;
      return;
    }
    this.model.trigger(action, this.clock.now());
  }

  /** A key came up: only talking is hold-to-talk. */
  release(action: DemoAction): void {
    if (action === 'talk') this.model.talking = false;
  }

  private setStatus(s: SourceStatus): void {
    this._status = s;
    this.events.emit('status', s);
  }
}
