import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Card label the one-time setup gives the app's own loopback device. */
export const STAND_IN_LABEL = 'Stand-In Camera';

export interface LoopbackDevice {
  /** /dev/videoN */
  path: string;
  /** Card label (what Meet and Zoom list). */
  label: string;
}

/** What the host looks like, read without root and without opening any camera. */
export interface HostProbe {
  /** v4l2loopback is loaded (/sys/module/v4l2loopback). */
  moduleLoaded: boolean;
  /** Loopback devices: virtual video4linux nodes, from sysfs. */
  devices: LoopbackDevice[];
}

/**
 * Lists v4l2loopback devices from sysfs. Loopback nodes are virtual devices, so real
 * webcams (under a USB or PCI path) are never touched.
 */
export function probeHost(sys = '/sys'): HostProbe {
  const dir = join(sys, 'devices', 'virtual', 'video4linux');
  const devices: LoopbackDevice[] = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (!/^video\d+$/.test(name)) continue;
      let label = name;
      try {
        label = readFileSync(join(dir, name, 'name'), 'utf8').trim() || name;
      } catch {
        // No name file: keep the node name.
      }
      devices.push({ path: `/dev/${name}`, label });
    }
  }
  devices.sort((a, b) => Number(a.path.slice(10)) - Number(b.path.slice(10)));
  return { moduleLoaded: existsSync(join(sys, 'module', 'v4l2loopback')), devices };
}

/** The app's own device first, then any other loopback device (e.g. OBS's), by number. */
export function orderDevices(devices: readonly LoopbackDevice[]): LoopbackDevice[] {
  return [...devices].sort((a, b) => {
    const pa = a.label === STAND_IN_LABEL ? 0 : 1;
    const pb = b.label === STAND_IN_LABEL ? 0 : 1;
    return pa - pb || Number(a.path.replace(/\D/g, '')) - Number(b.path.replace(/\D/g, ''));
  });
}
