import { Emitter } from '../../core/util/Emitter';
import type { Clock } from '../../core/util/Clock';
import { type DecodedMetrics, mapMetrics, mapValidation } from '../metricsMapper';
import { ValidationCodes } from '../metricTypes';
import { requestedMetrics } from '../requestedMetrics';
import type { SignalSource, SignalSourceEvents, SourceError, SourceStatus } from '../SignalSource';

/** The slice of the renderer SDK this adapter uses (see @smartspectra/node-sdk/renderer). */
export interface SdkLike {
  useMediaStream(stream: MediaStream): unknown;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  destroy(): void;
  on(event: 'metrics', cb: (buf: Uint8Array, ts: number) => void): unknown;
  on(event: 'validationStatus', cb: (code: number, ts: number, hint: string) => void): unknown;
  on(event: 'error', cb: (code: number, message: string, retryable: boolean) => void): unknown;
}

export interface SdkOptions {
  apiKey: string;
  requestedMetrics: number[];
  enableTelemetry: false;
}

export interface SdkFactory {
  create(options: SdkOptions): SdkLike;
  decode(buf: Uint8Array): DecodedMetrics;
}

/** SmartSpectraErrorCode values (SDK 3.5.0) mapped to user-facing reasons. */
const ERROR_REASONS: Record<number, string> = {
  2: 'auth',
  3: 'config',
  4: 'credits',
  5: 'network',
  6: 'server',
  7: 'camera',
  13: 'auth',
  14: 'lowFrameRate',
};

const MESSAGES: Record<string, string> = {
  auth: 'Presage did not accept the API key. Check the key, or continue in Demo mode.',
  credits: 'Your Presage credits are used up. You can continue in Demo mode.',
  network: 'Could not reach Presage to check the API key. Retrying…',
  server: 'Presage had a problem. Retrying…',
  camera: 'The camera stopped delivering video.',
  lowFrameRate: 'The camera frame rate dropped too low for sensing. Retrying…',
  config: 'The SDK rejected the requested signals.',
};

export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

/**
 * Adapter: SmartSpectra renderer SDK → SignalFrames. Uses the app's own camera stream
 * (`useMediaStream`), requests only what the settings need, keeps telemetry off, and never
 * attaches a `videoOutput` listener. The API key is injected in main (sdkKeyInjection), so
 * the renderer passes an empty string.
 */
export class PresageSignalSource implements SignalSource {
  readonly kind = 'presage' as const;
  readonly events = new Emitter<SignalSourceEvents>();
  private sdk: SdkLike | null = null;
  private _status: SourceStatus = 'idle';
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private comfortShield: boolean;
  private paused = false;
  /** Metrics changed while paused: rebuild the SDK on resume. */
  private reconfigure = false;
  /** Latest validation hint from the SDK (shown during calibration only). */
  lastHint = '';
  /** Diagnostic counters: how many packets carried each signal. Counts only, never values. */
  readonly stats = {
    packets: 0,
    landmarks: 0,
    breathing: 0,
    talking: 0,
    blinks: 0,
    expressions: 0,
    ok: 0,
    notOk: 0,
  };

  constructor(
    private readonly stream: MediaStream,
    opts: { comfortShield: boolean },
    private readonly factory: SdkFactory,
    private readonly clock: Clock,
  ) {
    this.comfortShield = opts.comfortShield;
  }

  get status(): SourceStatus {
    return this._status;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Configures the SDK on the camera stream and starts analysing frames. With
   * `{ paused: true }` it configures only, so nothing is sent to the SDK until resume().
   */
  async start(opts: { paused?: boolean } = {}): Promise<void> {
    if (this.sdk) return;
    this.paused = opts.paused === true;
    this.setStatus(this.paused ? 'paused' : 'starting');
    const sdk = this.factory.create({
      apiKey: '',
      requestedMetrics: requestedMetrics({ comfortShield: this.comfortShield }),
      enableTelemetry: false,
    });
    this.sdk = sdk;
    sdk.on('metrics', (buf) => {
      try {
        const frame = mapMetrics(this.factory.decode(buf), this.clock.now());
        const st = this.stats;
        st.packets++;
        if (frame.landmarks) st.landmarks++;
        if (frame.breathingTrace?.length) st.breathing++;
        if (frame.talking) st.talking++;
        if (frame.blink) st.blinks++;
        if (frame.happy !== undefined) st.expressions++;
        this.events.emit('frame', frame);
        this.retries = 0;
      } catch {
        // A malformed packet is dropped; the next one will do.
      }
    });
    sdk.on('validationStatus', (code, _ts, hint) => {
      this.lastHint = hint ?? '';
      if (code === 0) this.stats.ok++;
      else this.stats.notOk++;
      this.events.emit('frame', {
        t: this.clock.now(),
        validation: mapValidation(code),
        multipleFaces: code === ValidationCodes.kMultipleFacesFound,
      });
    });
    sdk.on('error', (code, message, retryable) => this.onError(code, message, retryable));
    sdk.useMediaStream(this.stream);
    if (this.paused) return;
    try {
      await sdk.start();
      if (this.sdk === sdk) this.setStatus('running');
    } catch (err) {
      const e = err as { code?: number; message?: string; retryable?: boolean };
      this.onError(e.code ?? -1, e.message ?? String(err), e.retryable ?? false);
    }
  }

  /**
   * Stops frame analysis but keeps the configured SDK (the camera stream itself keeps
   * running for the preview and the stage). Used while the stage is in Camera mode.
   */
  async pause(): Promise<void> {
    if (!this.sdk || this.paused) return;
    this.paused = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.setStatus('paused');
    await this.sdk.stop().catch(() => undefined);
  }

  /** Resumes frame analysis after pause() (or a paused start()). */
  async resume(): Promise<void> {
    if (!this.sdk || !this.paused) return;
    this.paused = false;
    if (this.reconfigure) {
      this.reconfigure = false;
      await this.stop();
      await this.start();
      return;
    }
    const sdk = this.sdk;
    this.setStatus('starting');
    try {
      await sdk.start();
      if (this.sdk === sdk && !this.paused) this.setStatus('running');
    } catch (err) {
      const e = err as { code?: number; message?: string; retryable?: boolean };
      this.onError(e.code ?? -1, e.message ?? String(e), e.retryable ?? false);
    }
  }

  async stop(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.paused = false;
    const sdk = this.sdk;
    this.sdk = null;
    if (sdk) {
      await sdk.stop().catch(() => undefined);
      sdk.destroy();
    }
    this.setStatus('stopped');
  }

  /** Re-requests metrics when the Comfort shield is switched (cardio only when on). */
  async setComfortShield(on: boolean): Promise<void> {
    if (on === this.comfortShield) return;
    this.comfortShield = on;
    if (this.paused) {
      this.reconfigure = true;
      return;
    }
    if (this.sdk) {
      await this.stop();
      await this.start();
    }
  }

  get requested(): number[] {
    return requestedMetrics({ comfortShield: this.comfortShield });
  }

  private onError(code: number, message: string, retryable: boolean): void {
    // A paused SDK analyses nothing; late errors from stopping it are not the user's problem.
    if (this.paused) return;
    const reason = ERROR_REASONS[code] ?? 'unknown';
    const canRetry = retryable && this.retries < RETRY_DELAYS_MS.length;
    const err: SourceError = { reason, message: MESSAGES[reason] ?? message, retrying: canRetry };
    this.events.emit('error', err);
    if (!canRetry) {
      this.setStatus('error');
      return;
    }
    const delay = RETRY_DELAYS_MS[this.retries] as number;
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      const sdk = this.sdk;
      if (!sdk || this.paused) return;
      void sdk
        .reset()
        .then(() => sdk.start())
        .then(() => this.sdk === sdk && this.setStatus('running'))
        .catch((e: { code?: number; message?: string; retryable?: boolean }) =>
          this.onError(e.code ?? -1, e.message ?? String(e), e.retryable ?? false),
        );
    }, delay);
  }

  private setStatus(s: SourceStatus): void {
    if (s === this._status) return;
    this._status = s;
    this.events.emit('status', s);
  }
}
