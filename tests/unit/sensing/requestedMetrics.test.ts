import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { requestedMetrics } from '../../../src/sensing/requestedMetrics';
import { EXPRESSION_HAPPY, Metric, ValidationCodes } from '../../../src/sensing/metricTypes';

const require = createRequire(import.meta.url);
// The messages entry point is pure JS (protobufjs), safe to load in tests.
const { presage } = require('@smartspectra/node-sdk/messages');

describe('metric ids', () => {
  it('match the SDK enums', () => {
    const MT = presage.smartspectra.MetricType;
    for (const [name, id] of Object.entries(Metric)) expect(MT[name]).toBe(id);
    expect(presage.smartspectra.ExpressionType.HAPPY).toBe(EXPRESSION_HAPPY);
  });
  it('validation codes match the SDK constants', () => {
    // Not exported via the package map; load by absolute path (pure JS, no FFI).
    const pkgDir = dirname(require.resolve('@smartspectra/node-sdk/package.json'));
    const constants = require(join(pkgDir, 'js', 'constants.js'));
    expect(constants.ValidationCode.kOk).toBe(ValidationCodes.kOk);
    expect(constants.ValidationCode.kNoFaceFound).toBe(ValidationCodes.kNoFaceFound);
  });
});

describe('requestedMetrics', () => {
  it('requests face signals and chest breathing only by default', () => {
    const m = requestedMetrics({ comfortShield: false });
    expect(m).toEqual([
      Metric.FACE_LANDMARKS,
      Metric.BLINKING,
      Metric.TALKING,
      Metric.EXPRESSIONS,
      Metric.CHEST_BREATHING,
    ]);
    expect(m).not.toContain(Metric.PULSE_RATE);
    expect(m).not.toContain(Metric.BREATHING_RATE);
  });
  it('adds pulse and breathing rate only with the Comfort shield', () => {
    const m = requestedMetrics({ comfortShield: true });
    expect(m).toContain(Metric.PULSE_RATE);
    expect(m).toContain(Metric.BREATHING_RATE);
  });
});
