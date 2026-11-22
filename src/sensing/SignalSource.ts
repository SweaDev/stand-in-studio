import type { Emitter } from '../core/util/Emitter';
import type { SignalFrame } from '../shared/types';

export type SourceKind = 'presage' | 'demo';

/** `paused`: configured but not analysing frames (Camera mode never uses the SDK). */
export type SourceStatus = 'idle' | 'starting' | 'running' | 'paused' | 'stopped' | 'error';

export interface SourceError {
  message: string;
  /** Machine-readable reason, e.g. 'auth', 'credits', 'camera', 'network', 'unknown'. */
  reason: string;
  /** The source will retry on its own. */
  retrying: boolean;
}

export interface SignalSourceEvents {
  frame: SignalFrame;
  status: SourceStatus;
  error: SourceError;
  /** Demo only: the "P" key raises the Comfort-shield trigger. */
  shieldTrigger: undefined;
}

/**
 * Adapter interface: anything that produces SignalFrames for the engine. Implemented by
 * the Presage SDK adapter and by Demo mode's simulated signals.
 */
export interface SignalSource {
  readonly kind: SourceKind;
  readonly events: Emitter<SignalSourceEvents>;
  readonly status: SourceStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
}
