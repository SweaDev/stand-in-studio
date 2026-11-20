import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('control window opens with the app title', async () => {
  const { app, control } = await launchApp();
  try {
    await expect(control).toHaveTitle('Stand-In Studio');
    await expect(control.locator('h1')).toHaveText('Stand-In Studio');
    const isPackaged = await app.evaluate(({ app: a }) => a.isPackaged);
    expect(isPackaged).toBe(false);
  } finally {
    await app.close();
  }
});
