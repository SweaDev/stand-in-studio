import { expect, test } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

test('hotkey commands from main toggle overrides; Hide me wins at once', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await control.locator('.mode-switch').getByRole('radio', { name: 'Camera' }).click();
    const feed = () => control.evaluate(() => (window as any).__standin.engine.state?.feedOpacity ?? -1);
    await expect.poll(feed).toBe(1);

    // Simulate the global shortcut: main sends the command over IPC.
    const send = (name: string) =>
      app.evaluate(({ BrowserWindow }, n) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Stand-In Studio');
        w?.webContents.send('studio:command', n);
      }, name);
    await send('hideMe');
    await expect.poll(feed, { timeout: 500 }).toBe(0);
    await expect(control.locator('#cmd-hideMe')).toHaveAttribute('aria-pressed', 'true');
    await send('hideMe');
    await send('raiseHand');
    await expect(control.locator('#cmd-raiseHand')).toHaveAttribute('aria-pressed', 'true');
    await send('cycleMode');
    await expect(control.locator('.mode-switch').getByRole('radio', { name: 'Blend' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await send('nonsense');

    await control.click('#show-help');
    await expect(control.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(control.locator('#hotkey-help')).toContainText('Ctrl+Alt+H');
    await expect(control.locator('#hotkey-help')).toContainText('hold to talk');
  } finally {
    await app.close();
  }
});
