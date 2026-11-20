import { expect, test } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

test('save, apply and delete a meeting preset', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await control.getByRole('radio', { name: 'Auto' }).click();
    await control.locator('#auto-listening').fill('30');
    await control.fill('#preset-name', 'Stand-up');
    await control.click('#preset-save');
    await expect(control.locator('#presets-list')).toContainText('Stand-up · Auto, listening 30%');

    await control.getByRole('radio', { name: 'Camera' }).click();
    await control.getByRole('button', { name: 'Apply Stand-up' }).click();
    await expect(control.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
    const saved = await control.evaluate(() => (window as any).studio.getSettings());
    expect(saved.presets).toHaveLength(1);
    expect(saved.auto.listening).toBeCloseTo(0.3);

    await control.getByRole('button', { name: 'Delete Stand-up' }).click();
    await expect(control.locator('#presets-list')).not.toContainText('Stand-up');
  } finally {
    await app.close();
  }
});
