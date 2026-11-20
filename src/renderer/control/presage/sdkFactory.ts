import { SmartSpectraSDK } from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import type { DecodedMetrics } from '../../../sensing/metricsMapper';
import type { SdkFactory, SdkLike } from '../../../sensing/presage/PresageSignalSource';

/** Real SmartSpectra renderer SDK (talks to main through the preload bridge). */
export const realSdkFactory: SdkFactory = {
  create: (options) => new SmartSpectraSDK({ ...options, sendTimeoutMs: 30_000 }) as unknown as SdkLike,
  decode: (buf) => decodeMetrics(buf) as unknown as DecodedMetrics,
};
