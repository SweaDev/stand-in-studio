import { Metric } from './metricTypes';

export interface MetricRequestOptions {
  comfortShield: boolean;
}

/**
 * Minimal metric request (REQUIREMENT §6): face signals and chest breathing always;
 * pulse and breathing rate only while the opt-in Comfort shield is on.
 */
export function requestedMetrics(opts: MetricRequestOptions): number[] {
  const metrics: number[] = [
    Metric.FACE_LANDMARKS,
    Metric.BLINKING,
    Metric.TALKING,
    Metric.EXPRESSIONS,
    Metric.CHEST_BREATHING,
  ];
  if (opts.comfortShield) metrics.push(Metric.PULSE_RATE, Metric.BREATHING_RATE);
  return metrics;
}
