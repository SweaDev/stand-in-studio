import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('consent comes first: no stage window and no signals until a choice is made', async () => {
  const { app, control } = await launchApp();
  try {
    await expect(control.getByRole('dialog', { name: 'Before your camera starts' })).toBeVisible();
    // Five key points up front: everything REQUIREMENT §6 asks the screen to state.
    const short = await control.locator('.consent').innerText();
    for (const phrase of [
      'Character mode',
      'send your real video',
      'Pulse and breathing only if you switch on the Comfort shield',
      'Nothing is recorded unless you save a demo',
      'others may notice your video fading',
      'not a medical',
    ]) {
      expect(short).toContain(phrase);
    }
    // Every detail one click away.
    await expect(control.locator('#consent-more')).not.toHaveAttribute('open', '');
    expect(short).not.toContain('telemetry is switched off');
    await control.click('#consent-more summary');
    const text = await control.locator('#consent-more').innerText();
    for (const phrase of [
      'only if you switch on the Comfort shield (or turn on a custom intent that uses them)',
      'Nothing is recorded unless you ask',
      'telemetry is switched off',
      'Honest note: others may notice your video fading',
      'not a medical',
    ]) {
      expect(text).toContain(phrase);
    }
    // Three ways to start.
    await expect(control.locator('.source-card')).toHaveCount(3);
    await expect(control.locator('#consent-save-telemetry')).toHaveCount(0);
    // No key in the e2e environment: camera is unavailable, Demo is offered.
    await expect(control.locator('#consent-camera')).toBeDisabled();
    await expect(control.locator('#consent-nokey')).toBeVisible();
    await control.waitForTimeout(500);
    expect(app.windows().length).toBe(1);
    const running = await control.evaluate(() => (window as any).__standin.demo);
    expect(running).toBeNull();
    await control.click('#consent-demo');
    await expect.poll(() => app.windows().length).toBe(2);
    await expect(control.locator('.consent')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
