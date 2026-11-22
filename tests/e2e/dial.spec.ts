import { expect, test } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

test('presence dial and mode switch drive the stage and persist', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    const dial = control.getByRole('slider', { name: /Presence dial/ });
    await expect(dial).toBeVisible();

    await control.locator('.mode-switch').getByRole('radio', { name: 'Character' }).click();
    await expect(control.locator('.mode-switch').getByRole('radio', { name: 'Character' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect.poll(() => dial.getAttribute('aria-valuenow')).toBe('0');

    await control.locator('.mode-switch').getByRole('radio', { name: 'Camera' }).click();
    await expect.poll(() => dial.getAttribute('aria-valuenow')).toBe('100');

    // Keyboard on the dial switches to Blend.
    await dial.focus();
    await control.keyboard.press('Home');
    await control.keyboard.press('PageUp');
    await expect(control.locator('.mode-switch').getByRole('radio', { name: 'Blend' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect.poll(() => dial.getAttribute('aria-valuenow')).toBe('25');

    // Dragging the dial: the top of the dial is 50%.
    const box = (await control.locator('#presence-dial svg').boundingBox())!;
    await control.mouse.click(box.x + box.width / 2, box.y + 12);
    await expect.poll(() => dial.getAttribute('aria-valuenow')).toBe('50');

    const saved = await control.evaluate(() => (window as any).studio.getSettings());
    expect(saved.mode).toBe('blend');
    expect(saved.blend.opacity).toBeCloseTo(0.5, 1);
  } finally {
    await app.close();
  }
});
