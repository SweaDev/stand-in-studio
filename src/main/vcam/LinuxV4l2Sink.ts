import { closeSync, constants, openSync, write } from 'node:fs';
import {
  CAPABILITY_SIZE,
  VIDIOC_QUERYCAP,
  VIDIOC_S_FMT,
  VIDIOC_S_PARM,
  VIDIOC_STREAMOFF,
  VIDIOC_STREAMON,
  canOutput,
  decodeCapability,
  encodeBufType,
  encodeOutputParm,
  encodeYuyvFormat,
} from './v4l2';
import { type LoopbackDevice, orderDevices } from './linuxDevices';
import type { VirtualCameraSink } from './sink';
import type * as Koffi from 'koffi';

/** File-descriptor operations on a V4L2 node (real: fs + libc ioctl; tests: a fake). */
export interface DeviceIo {
  open(path: string): number;
  ioctl(fd: number, request: number, arg: Buffer): number;
  write(fd: number, data: Uint8Array): Promise<void>;
  close(fd: number): void;
}

let ioctlFn: ((fd: number, req: number, arg: Buffer) => number) | null = null;

/** libc ioctl through koffi (already shipped for the SmartSpectra SDK), loaded on first use. */
function libcIoctl(fd: number, req: number, arg: Buffer): number {
  if (!ioctlFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof Koffi;
    const libc = koffi.load('libc.so.6');
    const f = libc.func('int ioctl(int fd, unsigned long request, ...)');
    ioctlFn = (d, r, a) => f(d, r, 'uint8_t *', a) as number;
  }
  return ioctlFn(fd, req, arg);
}

export const realDeviceIo: DeviceIo = {
  open: (path) => openSync(path, constants.O_RDWR),
  ioctl: libcIoctl,
  write: (fd, data) =>
    new Promise((resolve, reject) => {
      const send = (off: number) =>
        write(fd, data, off, data.length - off, null, (err, n) => {
          if (err) reject(err);
          else if (off + n < data.length && n > 0) send(off + n);
          else resolve();
        });
      send(0);
    }),
  close: (fd) => closeSync(fd),
};

/**
 * The native virtual camera on Linux: writes packed YUYV frames into a v4l2loopback
 * output device, the way OBS's own virtual camera does (S_FMT, S_PARM, write()), and
 * prefers the "Stand-In Camera" device made by the one-time setup.
 */
export class LinuxV4l2Sink implements VirtualCameraSink {
  private fd: number | null = null;
  private streamOn = false;
  private busy = false;
  private frameBytes = 0;
  frames = 0;
  dropped = 0;

  constructor(
    private readonly devices: () => LoopbackDevice[],
    private readonly io: DeviceIo = realDeviceIo,
  ) {}

  async start(width: number, height: number, fps: number): Promise<{ device: string; label: string }> {
    if (this.fd !== null) await this.stop();
    const candidates = orderDevices(this.devices());
    if (candidates.length === 0) throw new Error('No v4l2loopback device. Set up the Stand-In Camera first.');
    const problems: string[] = [];
    for (const dev of candidates) {
      let fd: number;
      try {
        fd = this.io.open(dev.path);
      } catch (err) {
        problems.push(`${dev.path}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
        continue;
      }
      try {
        const cap = Buffer.alloc(CAPABILITY_SIZE);
        if (this.io.ioctl(fd, VIDIOC_QUERYCAP, cap) < 0) throw new Error('not a V4L2 device');
        // With exclusive_caps=1 a device that already has a writer (e.g. OBS) shows capture only.
        if (!canOutput(decodeCapability(cap))) throw new Error('in use by another app');
        // v4l2loopback 0.12–0.13 needs STREAMON before formats stick (OBS does the same).
        const type = encodeBufType();
        this.streamOn = this.io.ioctl(fd, VIDIOC_STREAMON, type) >= 0;
        if (this.io.ioctl(fd, VIDIOC_S_FMT, encodeYuyvFormat(width, height)) < 0)
          throw new Error('rejected 1280×720 YUYV');
        this.io.ioctl(fd, VIDIOC_S_PARM, encodeOutputParm(fps)); // best effort
        this.fd = fd;
        this.frameBytes = width * height * 2;
        this.frames = 0;
        this.dropped = 0;
        return { device: dev.path, label: dev.label };
      } catch (err) {
        problems.push(`${dev.path} (${dev.label}): ${(err as Error).message}`);
        this.io.close(fd);
      }
    }
    throw new Error(`No usable virtual camera device. ${problems.join('; ')}`);
  }

  writeFrame(frame: Uint8Array): void {
    const fd = this.fd;
    if (fd === null || frame.byteLength !== this.frameBytes) return;
    if (this.busy) {
      this.dropped++;
      return;
    }
    this.busy = true;
    this.io
      .write(fd, frame)
      .then(() => this.frames++)
      .catch(() => this.dropped++)
      .finally(() => (this.busy = false));
  }

  async stop(lastFrame?: Uint8Array): Promise<void> {
    const fd = this.fd;
    if (fd === null) return;
    this.fd = null;
    try {
      if (lastFrame && lastFrame.byteLength === this.frameBytes) await this.io.write(fd, lastFrame);
    } catch {
      // The device may already be gone; closing is what matters.
    }
    if (this.streamOn) this.io.ioctl(fd, VIDIOC_STREAMOFF, encodeBufType());
    this.streamOn = false;
    this.io.close(fd);
  }
}
