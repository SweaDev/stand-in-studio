import { describe, expect, it } from 'vitest';
import { keyStep, pointToValue, valueToAngle } from '../../../src/renderer/control/components/dialMath';

describe('dial math', () => {
  it('maps values to a 270° sweep', () => {
    expect(valueToAngle(0)).toBe(-135);
    expect(valueToAngle(0.5)).toBe(0);
    expect(valueToAngle(1)).toBe(135);
    expect(valueToAngle(2)).toBe(135);
  });
  it('maps pointer positions back to values', () => {
    expect(pointToValue(0, -10)).toBeCloseTo(0.5);
    expect(pointToValue(10, 0)).toBeCloseTo(0.8333, 3);
    expect(pointToValue(-10, 0)).toBeCloseTo(0.1667, 3);
    expect(pointToValue(-1, 10)).toBe(0); // dead zone at the bottom clamps
    expect(pointToValue(1, 10)).toBe(1);
  });
  it('steps with the keyboard', () => {
    expect(keyStep('ArrowRight', 0.5)).toBe(0.55);
    expect(keyStep('ArrowDown', 0.02)).toBe(0);
    expect(keyStep('PageUp', 0.9)).toBe(1);
    expect(keyStep('Home', 0.5)).toBe(0);
    expect(keyStep('End', 0.5)).toBe(1);
    expect(keyStep('x', 0.5)).toBeNull();
  });
});
