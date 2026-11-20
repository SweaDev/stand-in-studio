/** Dial geometry: 0% at -135°, 100% at +135° (0° = straight up). */
export const DIAL_SWEEP = 270;

export function valueToAngle(v: number): number {
  return -DIAL_SWEEP / 2 + Math.min(1, Math.max(0, v)) * DIAL_SWEEP;
}

/** Converts a pointer position (relative to the dial centre, y down) to a value 0..1. */
export function pointToValue(dx: number, dy: number): number {
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise positive
  if (deg > 135) deg = 135;
  if (deg < -135) deg = -135;
  return (deg + DIAL_SWEEP / 2) / DIAL_SWEEP;
}

/** Keyboard steps for the dial slider. */
export function keyStep(key: string, v: number): number | null {
  const steps: Record<string, number> = {
    ArrowRight: 0.05,
    ArrowUp: 0.05,
    ArrowLeft: -0.05,
    ArrowDown: -0.05,
    PageUp: 0.25,
    PageDown: -0.25,
  };
  if (key === 'Home') return 0;
  if (key === 'End') return 1;
  const s = steps[key];
  return s === undefined ? null : Math.min(1, Math.max(0, Math.round((v + s) * 100) / 100));
}
