export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * Labels of virtual cameras. Feeding Stand-In Studio its own OBS output would create a
 * feedback loop, and virtual devices may not hold 30 fps (REQUIREMENT §10).
 */
const VIRTUAL = [
  /obs/i,
  /virtual/i,
  /v4l2 ?loopback/i,
  /dummy/i,
  /snap camera/i,
  /manycam/i,
  /xsplit/i,
  /e2esoft/i,
  /splitcam/i,
  /nvidia broadcast/i,
  /camo/i,
  // Our own virtual camera (anchored: a fake camera's file path may contain "stand-in").
  /^stand-in camera\b/i,
];

export function isVirtualCamera(label: string): boolean {
  return VIRTUAL.some((re) => re.test(label));
}

/** Physical cameras only, in the order the system lists them. */
export function physicalCameras<T extends CameraDevice>(devices: readonly T[]): T[] {
  return devices.filter((d) => !isVirtualCamera(d.label));
}

/** The saved camera if it is still present and physical, else the first physical one. */
export function pickCamera<T extends CameraDevice>(devices: readonly T[], savedId: string | null): T | null {
  const physical = physicalCameras(devices);
  return physical.find((d) => d.deviceId === savedId) ?? physical[0] ?? null;
}
