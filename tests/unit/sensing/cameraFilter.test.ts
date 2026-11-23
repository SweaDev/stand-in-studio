import { describe, expect, it } from 'vitest';
import { isVirtualCamera, physicalCameras, pickCamera } from '../../../src/sensing/cameraFilter';

const devices = [
  { deviceId: 'obs', label: 'OBS Virtual Camera' },
  { deviceId: 'loop', label: 'Dummy video device (0x0000)' },
  { deviceId: 'v4l', label: 'v4l2loopback: OBS Cam' },
  { deviceId: 'hd', label: 'HD Pro Webcam C920 (046d:082d)' },
  { deviceId: 'face', label: 'FaceTime HD Camera' },
  { deviceId: 'fake', label: 'fake_device_0' },
];

describe('cameraFilter', () => {
  it('recognises virtual cameras', () => {
    expect(isVirtualCamera('OBS Virtual Camera')).toBe(true);
    expect(isVirtualCamera('Snap Camera')).toBe(true);
    expect(isVirtualCamera('Integrated Camera')).toBe(false);
  });

  it('keeps only physical cameras in order', () => {
    expect(physicalCameras(devices).map((d) => d.deviceId)).toEqual(['hd', 'face', 'fake']);
  });

  it('prefers the saved camera when still present', () => {
    expect(pickCamera(devices, 'face')?.deviceId).toBe('face');
    expect(pickCamera(devices, 'gone')?.deviceId).toBe('hd');
    expect(pickCamera(devices, 'obs')?.deviceId).toBe('hd');
    expect(pickCamera(devices.slice(0, 3), null)).toBeNull();
  });
});

describe('the app never captures its own virtual camera', () => {
  it('treats "Stand-In Camera" as virtual, but not a fake-camera path that merely contains stand-in', () => {
    expect(isVirtualCamera('Stand-In Camera')).toBe(true);
    expect(isVirtualCamera('Stand-In Camera (/dev/video40)')).toBe(true);
    expect(isVirtualCamera('/home/u/stand-in-studio/test-assets/face.mjpeg')).toBe(false);
  });
});
