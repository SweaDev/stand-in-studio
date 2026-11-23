import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('camera manager opens a physical (fake) camera at 30 fps and the chosen size', async () => {
  const { app, control } = await launchApp({ STANDIN_FAKE_CAMERA: '1' });
  try {
    await control.waitForFunction(() => (window as any).__standin);
    const result = await control.evaluate(async () => {
      const cam = new (window as any).__standin.CameraManager();
      const devices = await cam.list();
      await cam.open(null, '640x360');
      const s = cam.settings();
      const playing = !!cam.element && cam.element.videoWidth > 0;
      cam.close();
      return { devices: devices.length, width: s.width, height: s.height, fps: s.frameRate, playing };
    });
    expect(result.devices).toBeGreaterThan(0);
    expect(result).toMatchObject({ width: 640, height: 360, playing: true });
    expect(result.fps).toBeGreaterThan(0); // Chromium's default fake device runs at 20 fps
  } finally {
    await app.close();
  }
});
