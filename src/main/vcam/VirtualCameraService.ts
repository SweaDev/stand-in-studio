import { execFile } from 'node:child_process';
import { VCAM_FPS, VCAM_HEIGHT, VCAM_WIDTH, type VcamSetupResult, type VcamStatus } from '../../shared/vcam';
import { type HostProbe, orderDevices, probeHost } from './linuxDevices';
import { INSTALL_HELP, SETUP_SCRIPT } from './setupScript';
import type { VirtualCameraSink } from './sink';

export interface ServiceDeps {
  platform: string;
  sink: VirtualCameraSink | null;
  /** The sink needs no device (the e2e file sink): always ready. */
  deviceless?: boolean;
  probe?: () => HostProbe;
  /** Runs a command; resolves with exit code and output (never rejects). */
  run?: (file: string, args: string[]) => Promise<{ code: number; out: string }>;
}

const runCommand = (file: string, args: string[]) =>
  new Promise<{ code: number; out: string }>((resolve) => {
    execFile(
      file,
      args,
      { env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/sbin:/usr/sbin` }, timeout: 120_000 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ code, out: `${stdout}${stderr}` });
      },
    );
  });

/**
 * The Stand-In Camera in main: reports whether it can run, performs the one-time setup on
 * request (pkexec, the user's own password prompt), and forwards frames to the sink.
 */
export class VirtualCameraService {
  private live: { device: string; label: string } | null = null;
  private lastError: string | undefined;
  private readonly probe: () => HostProbe;
  private readonly run: (file: string, args: string[]) => Promise<{ code: number; out: string }>;

  constructor(private readonly deps: ServiceDeps) {
    this.probe = deps.probe ?? (() => probeHost());
    this.run = deps.run ?? runCommand;
  }

  get supported(): boolean {
    return this.deps.sink !== null;
  }

  async status(): Promise<VcamStatus> {
    const error = this.lastError;
    if (!this.deps.sink) return { state: 'unsupported', error };
    if (this.live) return { state: 'live', ...this.live };
    if (this.deps.deviceless || this.deps.platform !== 'linux') return { state: 'ready', error };
    const host = this.probe();
    const [first] = orderDevices(host.devices);
    if (first) return { state: 'ready', device: first.path, label: first.label, error };
    if (host.moduleLoaded || (await this.run('modinfo', ['v4l2loopback'])).code === 0)
      return { state: 'needsSetup', error };
    return { state: 'notInstalled', install: [...INSTALL_HELP], error };
  }

  /** One-time setup through pkexec. The script is constant text (see setupScript.ts). */
  async setup(): Promise<VcamSetupResult> {
    if (this.deps.platform !== 'linux' || !this.deps.sink)
      return { ok: false, reason: 'unsupported', status: await this.status() };
    const r = await this.run('pkexec', ['/bin/sh', '-c', SETUP_SCRIPT]);
    if (r.code === 0 && r.out.includes('STANDIN:ok')) {
      this.lastError = undefined;
      return { ok: true, status: await this.status() };
    }
    if (r.code === 3 || r.out.includes('STANDIN:not-installed'))
      return { ok: false, reason: 'notInstalled', status: await this.status() };
    // pkexec: 126 = the password dialog was dismissed, 127 = not authorised.
    if (r.code === 126 || r.code === 127)
      return { ok: false, reason: 'cancelled', message: 'Setup was cancelled.', status: await this.status() };
    const message = `Setup failed (exit ${r.code}). ${r.out.trim().split('\n').slice(-2).join(' ')}`.trim();
    this.lastError = message;
    return { ok: false, reason: 'failed', message, status: await this.status() };
  }

  async start(): Promise<VcamStatus> {
    const sink = this.deps.sink;
    if (!sink) return this.status();
    try {
      this.live = await sink.start(VCAM_WIDTH, VCAM_HEIGHT, VCAM_FPS);
      this.lastError = undefined;
    } catch (err) {
      this.live = null;
      this.lastError = (err as Error).message;
    }
    return this.status();
  }

  frame(data: Uint8Array): void {
    if (this.live) this.deps.sink?.writeFrame(data);
  }

  /** Stops sending; `lastFrame` (the "paused" picture) is what apps keep showing. */
  async stop(lastFrame?: Uint8Array): Promise<VcamStatus> {
    if (this.live) {
      this.live = null;
      await this.deps.sink?.stop(lastFrame);
    }
    return this.status();
  }

  get isLive(): boolean {
    return this.live !== null;
  }
}
