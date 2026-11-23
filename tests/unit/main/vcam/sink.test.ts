import { describe, expect, it } from 'vitest';
import { type DeviceIo, LinuxV4l2Sink } from '../../../../src/main/vcam/LinuxV4l2Sink';
import { VirtualCameraService } from '../../../../src/main/vcam/VirtualCameraService';
import {
  CAPABILITY_SIZE,
  VIDIOC_QUERYCAP,
  VIDIOC_STREAMOFF,
  VIDIOC_STREAMON,
  VIDIOC_S_FMT,
} from '../../../../src/main/vcam/v4l2';
import { VCAM_FRAME_BYTES } from '../../../../src/shared/vcam';

/** A fake loopback driver: per-path output capability, records ioctls and writes. */
function fakeIo(outputs: Record<string, boolean>) {
  const log: string[] = [];
  const fds = new Map<number, string>();
  let next = 10;
  const pending: (() => void)[] = [];
  const io: DeviceIo = {
    open: (p) => {
      if (!(p in outputs)) throw Object.assign(new Error('nope'), { code: 'ENOENT' });
      fds.set(next, p);
      return next++;
    },
    ioctl: (fd, req, arg) => {
      log.push(`${fds.get(fd)} ${req.toString(16)}`);
      if (req === VIDIOC_QUERYCAP) {
        arg.fill(0, 0, CAPABILITY_SIZE);
        arg.writeUInt32LE(0x80000000, 84);
        arg.writeUInt32LE(outputs[fds.get(fd) as string] ? 2 : 1, 88);
      }
      return 0;
    },
    write: (fd) =>
      new Promise<void>((resolve) => {
        log.push(`${fds.get(fd)} write`);
        pending.push(resolve);
      }),
    close: (fd) => log.push(`${fds.get(fd)} close`),
  };
  return { io, log, flush: () => pending.splice(0).forEach((r) => r()) };
}
const devices = [
  { path: '/dev/video10', label: 'OBS Virtual Camera' },
  { path: '/dev/video11', label: 'Stand-In Camera' },
];
const frame = () => new Uint8Array(VCAM_FRAME_BYTES);
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('LinuxV4l2Sink', () => {
  it('opens the Stand-In Camera first, sets YUYV 1280×720, and streams', async () => {
    const f = fakeIo({ '/dev/video10': true, '/dev/video11': true });
    const sink = new LinuxV4l2Sink(() => devices, f.io);
    expect(await sink.start(1280, 720, 30)).toEqual({ device: '/dev/video11', label: 'Stand-In Camera' });
    expect(f.log).toEqual([
      `/dev/video11 ${VIDIOC_QUERYCAP.toString(16)}`,
      `/dev/video11 ${VIDIOC_STREAMON.toString(16)}`,
      `/dev/video11 ${VIDIOC_S_FMT.toString(16)}`,
      '/dev/video11 c0cc5616',
    ]);
  });

  it('skips a device another app is already writing to (exclusive_caps shows capture only)', async () => {
    const f = fakeIo({ '/dev/video10': true, '/dev/video11': false });
    const sink = new LinuxV4l2Sink(() => devices, f.io);
    expect((await sink.start(1280, 720, 30)).device).toBe('/dev/video10');
    expect(f.log).toContain('/dev/video11 close');
  });

  it('explains when no device can be used', async () => {
    const sink = new LinuxV4l2Sink(
      () => devices,
      fakeIo({ '/dev/video10': false, '/dev/video11': false }).io,
    );
    await expect(sink.start(1280, 720, 30)).rejects.toThrow(/in use by another app/);
    await expect(new LinuxV4l2Sink(() => [], fakeIo({}).io).start(1280, 720, 30)).rejects.toThrow(
      /Set up the Stand-In Camera/,
    );
  });

  it('drops frames while a write is pending instead of queueing; ignores wrong sizes', async () => {
    const f = fakeIo({ '/dev/video11': true });
    const sink = new LinuxV4l2Sink(() => [devices[1] as (typeof devices)[0]], f.io);
    await sink.start(1280, 720, 30);
    sink.writeFrame(frame());
    sink.writeFrame(frame());
    sink.writeFrame(new Uint8Array(10));
    expect(sink.dropped).toBe(1);
    f.flush();
    await tick();
    expect(sink.frames).toBe(1);
    const stopping = sink.stop(frame());
    await tick();
    f.flush();
    await stopping;
    expect(f.log.slice(-3)).toEqual([
      '/dev/video11 write',
      `/dev/video11 ${VIDIOC_STREAMOFF.toString(16)}`,
      '/dev/video11 close',
    ]);
  });
});

describe('VirtualCameraService', () => {
  const host =
    (devs: typeof devices, loaded = devs.length > 0) =>
    () => ({ moduleLoaded: loaded, devices: devs });
  const sink = () => new LinuxV4l2Sink(() => [], fakeIo({}).io);

  it('reports unsupported, notInstalled, needsSetup and ready', async () => {
    expect((await new VirtualCameraService({ platform: 'win32', sink: null }).status()).state).toBe(
      'unsupported',
    );
    const missing = new VirtualCameraService({
      platform: 'linux',
      sink: sink(),
      probe: host([]),
      run: async () => ({ code: 1, out: '' }),
    });
    const s = await missing.status();
    expect(s.state).toBe('notInstalled');
    expect(s.install?.[0]?.command).toContain('v4l2loopback-dkms');
    const installed = new VirtualCameraService({
      platform: 'linux',
      sink: sink(),
      probe: host([]),
      run: async () => ({ code: 0, out: '' }),
    });
    expect((await installed.status()).state).toBe('needsSetup');
    const ready = new VirtualCameraService({ platform: 'linux', sink: sink(), probe: host(devices) });
    expect(await ready.status()).toMatchObject({ state: 'ready', label: 'Stand-In Camera' });
  });

  it('setup runs the fixed script through pkexec and maps its outcomes', async () => {
    const calls: string[][] = [];
    const svc = (code: number, out: string) =>
      new VirtualCameraService({
        platform: 'linux',
        sink: sink(),
        probe: host([]),
        run: async (file, args) => {
          calls.push([file, ...args]);
          return file === 'pkexec' ? { code, out } : { code: 0, out: '' };
        },
      });
    expect((await svc(0, 'STANDIN:ok\n').setup()).ok).toBe(true);
    expect(calls[0]?.slice(0, 3)).toEqual(['pkexec', '/bin/sh', '-c']);
    expect((await svc(126, '').setup()).reason).toBe('cancelled');
    expect((await svc(3, 'STANDIN:not-installed').setup()).reason).toBe('notInstalled');
    const failed = await svc(1, 'modprobe: ERROR: could not insert').setup();
    expect(failed).toMatchObject({ ok: false, reason: 'failed' });
    expect(failed.message).toContain('could not insert');
    expect((await new VirtualCameraService({ platform: 'darwin', sink: null }).setup()).reason).toBe(
      'unsupported',
    );
  });
});
