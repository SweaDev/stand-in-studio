/**
 * The few V4L2 definitions a v4l2loopback *output* needs (64-bit Linux layouts), as plain
 * Buffer encoders and decoders, so they can be tested without a device.
 */

/** _IOR('V', 0, struct v4l2_capability) */
export const VIDIOC_QUERYCAP = 0x80685600;
/** _IOWR('V', 5, struct v4l2_format) */
export const VIDIOC_S_FMT = 0xc0d05605;
/** _IOWR('V', 22, struct v4l2_streamparm) */
export const VIDIOC_S_PARM = 0xc0cc5616;
/** _IOW('V', 18, int) */
export const VIDIOC_STREAMON = 0x40045612;
/** _IOW('V', 19, int) */
export const VIDIOC_STREAMOFF = 0x40045613;

export const V4L2_CAP_VIDEO_OUTPUT = 0x00000002;
export const V4L2_BUF_TYPE_VIDEO_OUTPUT = 2;
export const V4L2_FIELD_NONE = 1;
export const V4L2_COLORSPACE_SRGB = 8;
/** fourcc('Y','U','Y','V') */
export const V4L2_PIX_FMT_YUYV = 0x56595559;

export const CAPABILITY_SIZE = 104;
export const FORMAT_SIZE = 208;
export const STREAMPARM_SIZE = 204;

/** Builds an ioctl request number (asm-generic layout, used by x86-64 and arm64). */
export function ioc(dir: 'r' | 'w' | 'rw', type: string, nr: number, size: number): number {
  const d = dir === 'r' ? 2 : dir === 'w' ? 1 : 3;
  return ((d << 30) | (size << 16) | (type.charCodeAt(0) << 8) | nr) >>> 0;
}

export interface Capability {
  driver: string;
  card: string;
  capabilities: number;
  deviceCaps: number;
}

const cstr = (b: Buffer, start: number, len: number) => {
  const s = b.subarray(start, start + len);
  const end = s.indexOf(0);
  return s.subarray(0, end < 0 ? len : end).toString('utf8');
};

export function decodeCapability(b: Buffer): Capability {
  if (b.length < CAPABILITY_SIZE) throw new Error('short v4l2_capability');
  return {
    driver: cstr(b, 0, 16),
    card: cstr(b, 16, 32),
    capabilities: b.readUInt32LE(84),
    deviceCaps: b.readUInt32LE(88),
  };
}

/** The capabilities that apply to this device node (device_caps when the driver sets it). */
export function canOutput(c: Capability): boolean {
  const DEVICE_CAPS = 0x80000000;
  const caps = c.capabilities & DEVICE_CAPS ? c.deviceCaps : c.capabilities;
  return (caps & V4L2_CAP_VIDEO_OUTPUT) !== 0;
}

/** struct v4l2_format for a packed YUYV output of the given size. */
export function encodeYuyvFormat(width: number, height: number): Buffer {
  const b = Buffer.alloc(FORMAT_SIZE);
  b.writeUInt32LE(V4L2_BUF_TYPE_VIDEO_OUTPUT, 0);
  // union fmt starts at 8 (the union holds pointers, so it is 8-byte aligned).
  b.writeUInt32LE(width, 8);
  b.writeUInt32LE(height, 12);
  b.writeUInt32LE(V4L2_PIX_FMT_YUYV, 16);
  b.writeUInt32LE(V4L2_FIELD_NONE, 20);
  b.writeUInt32LE(width * 2, 24); // bytesperline
  b.writeUInt32LE(width * height * 2, 28); // sizeimage
  b.writeUInt32LE(V4L2_COLORSPACE_SRGB, 32);
  return b;
}

/** struct v4l2_streamparm for an output at `fps` frames per second. */
export function encodeOutputParm(fps: number): Buffer {
  const b = Buffer.alloc(STREAMPARM_SIZE);
  b.writeUInt32LE(V4L2_BUF_TYPE_VIDEO_OUTPUT, 0);
  // v4l2_outputparm: capability, outputmode, timeperframe { numerator, denominator }
  b.writeUInt32LE(0x1000, 4); // V4L2_CAP_TIMEPERFRAME
  b.writeUInt32LE(1, 12);
  b.writeUInt32LE(Math.round(fps), 16);
  return b;
}

export function encodeBufType(): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(V4L2_BUF_TYPE_VIDEO_OUTPUT, 0);
  return b;
}
