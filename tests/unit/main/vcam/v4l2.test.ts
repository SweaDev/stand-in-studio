import { mkdirSync, mkdtempSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_SIZE,
  FORMAT_SIZE,
  STREAMPARM_SIZE,
  V4L2_PIX_FMT_YUYV,
  VIDIOC_QUERYCAP,
  VIDIOC_STREAMOFF,
  VIDIOC_STREAMON,
  VIDIOC_S_FMT,
  VIDIOC_S_PARM,
  canOutput,
  decodeCapability,
  encodeOutputParm,
  encodeYuyvFormat,
  ioc,
} from '../../../../src/main/vcam/v4l2';
import { orderDevices, probeHost } from '../../../../src/main/vcam/linuxDevices';
import { realDeviceIo } from '../../../../src/main/vcam/LinuxV4l2Sink';
import { SETUP_SCRIPT } from '../../../../src/main/vcam/setupScript';

describe('V4L2 definitions', () => {
  it('ioctl numbers match the kernel headers (64-bit)', () => {
    expect(ioc('r', 'V', 0, CAPABILITY_SIZE)).toBe(VIDIOC_QUERYCAP);
    expect(ioc('rw', 'V', 5, FORMAT_SIZE)).toBe(VIDIOC_S_FMT);
    expect(ioc('rw', 'V', 22, STREAMPARM_SIZE)).toBe(VIDIOC_S_PARM);
    expect(ioc('w', 'V', 18, 4)).toBe(VIDIOC_STREAMON);
    expect(ioc('w', 'V', 19, 4)).toBe(VIDIOC_STREAMOFF);
    expect(V4L2_PIX_FMT_YUYV).toBe(Buffer.from('YUYV').readUInt32LE(0));
  });

  it('encodes a 1280×720 YUYV output format and 30 fps', () => {
    const f = encodeYuyvFormat(1280, 720);
    expect(f.length).toBe(208);
    expect([0, 8, 12, 16, 20, 24, 28].map((o) => f.readUInt32LE(o))).toEqual([
      2,
      1280,
      720,
      V4L2_PIX_FMT_YUYV,
      1,
      2560,
      1280 * 720 * 2,
    ]);
    const p = encodeOutputParm(30);
    expect([p.readUInt32LE(0), p.readUInt32LE(12), p.readUInt32LE(16)]).toEqual([2, 1, 30]);
  });

  it('decodes capabilities and prefers device_caps', () => {
    const b = Buffer.alloc(CAPABILITY_SIZE);
    b.write('v4l2 loopback', 0);
    b.write('Stand-In Camera', 16);
    b.writeUInt32LE(0x80000003, 84); // capture | output | DEVICE_CAPS
    b.writeUInt32LE(0x00000001, 88); // this node: capture only (a writer is attached)
    const c = decodeCapability(b);
    expect(c).toMatchObject({ driver: 'v4l2 loopback', card: 'Stand-In Camera' });
    expect(canOutput(c)).toBe(false);
    b.writeUInt32LE(0x00000002, 88);
    expect(canOutput(decodeCapability(b))).toBe(true);
  });

  it('calls libc ioctl through koffi without crashing (ENOTTY on a plain file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'standin-ioctl-'));
    const file = join(dir, 'x');
    writeFileSync(file, 'x');
    const fd = openSync(file, 'r');
    try {
      expect(realDeviceIo.ioctl(fd, VIDIOC_QUERYCAP, Buffer.alloc(CAPABILITY_SIZE))).toBe(-1);
    } finally {
      closeSync(fd);
    }
  });
});

describe('loopback devices', () => {
  it('reads labels from sysfs and puts the Stand-In Camera first', () => {
    const sys = mkdtempSync(join(tmpdir(), 'standin-sys-'));
    const v = join(sys, 'devices', 'virtual', 'video4linux');
    for (const [n, label] of [
      ['video10', 'OBS Virtual Camera'],
      ['video11', 'Stand-In Camera'],
      ['notvideo', 'x'],
    ] as const) {
      mkdirSync(join(v, n), { recursive: true });
      writeFileSync(join(v, n, 'name'), `${label}\n`);
    }
    const host = probeHost(sys);
    expect(host.moduleLoaded).toBe(false);
    expect(host.devices.map((d) => d.path)).toEqual(['/dev/video10', '/dev/video11']);
    expect(orderDevices(host.devices).map((d) => d.label)).toEqual(['Stand-In Camera', 'OBS Virtual Camera']);
    mkdirSync(join(sys, 'module', 'v4l2loopback'), { recursive: true });
    expect(probeHost(sys).moduleLoaded).toBe(true);
    expect(probeHost(join(sys, 'missing'))).toEqual({ moduleLoaded: false, devices: [] });
  });
});

describe('setup script', () => {
  it('is fixed text that persists the module, keeps OBS working and never overrides other options', () => {
    expect(SETUP_SCRIPT).not.toMatch(/\$\{|`/);
    expect(SETUP_SCRIPT).toContain('/etc/modules-load.d/stand-in-camera.conf');
    expect(SETUP_SCRIPT).toContain('card_label="Stand-In Camera","OBS Virtual Camera"');
    expect(SETUP_SCRIPT).toContain('exclusive_caps=1,1');
    expect(SETUP_SCRIPT).toContain('if [ -z "$other" ]');
    expect(SETUP_SCRIPT).toContain('modprobe v4l2loopback');
    expect(SETUP_SCRIPT).toContain('STANDIN:not-installed');
  });
});
