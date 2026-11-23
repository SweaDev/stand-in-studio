/** The native virtual camera ("Stand-In Camera"), shared by main and renderer. */

export const VCAM_WIDTH = 1280;
export const VCAM_HEIGHT = 720;
export const VCAM_FPS = 30;
/** Packed YUYV: 2 bytes per pixel. */
export const VCAM_FRAME_BYTES = VCAM_WIDTH * VCAM_HEIGHT * 2;

/**
 * unsupported: no native backend on this platform yet (use OBS);
 * notInstalled: the v4l2loopback package is missing;
 * needsSetup: installed, but no loopback device yet (one-time setup);
 * ready: a device is there; live: frames are being sent.
 */
export type VcamState = 'unsupported' | 'notInstalled' | 'needsSetup' | 'ready' | 'live';

export interface VcamStatus {
  state: VcamState;
  /** The device and its label while live (or the one that would be used when ready). */
  device?: string;
  label?: string;
  /** Last error, in plain words. */
  error?: string;
  /** Install commands when notInstalled. */
  install?: { distro: string; command: string }[];
}

export interface VcamSetupResult {
  ok: boolean;
  /** cancelled: the password prompt was dismissed. */
  reason?: 'cancelled' | 'notInstalled' | 'failed' | 'unsupported';
  message?: string;
  status: VcamStatus;
}
