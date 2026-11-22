import { expect, type Page, test } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

/** Mean absolute RGB difference (0..255) between the raw preview and the Virtual Stage inset. */
const diff = (control: Page) =>
  control.evaluate(() => {
    const small = (id: string) => {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 18;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      ctx.drawImage(document.getElementById(id) as HTMLCanvasElement, 0, 0, 32, 18);
      return ctx.getImageData(0, 0, 32, 18).data;
    };
    const a = small('thumb');
    const b = small('stage-inset');
    let sum = 0;
    for (let i = 0; i < a.length; i += 4)
      for (let k = 0; k < 3; k++) sum += Math.abs((a[i + k] as number) - (b[i + k] as number));
    return sum / ((a.length / 4) * 3);
  });
const mode = (control: Page, name: string) =>
  control.locator('.mode-switch').getByRole('radio', { name }).click();
const stageWindows = (control: Page) =>
  control.evaluate(() => ((window as any).__standin.app.host.isOpen ? 1 : 0));

test('the main preview shows the raw input; the inset shows the processed Virtual Stage', async () => {
  const { control, app } = await launchApp();
  try {
    await passConsent(control);
    await expect(control.locator('.thumb-label')).toHaveText('Live input · simulated demo');
    // Camera mode: the output is the plain feed, so raw and inset look alike.
    await mode(control, 'Camera');
    await control.waitForTimeout(1500);
    expect(await diff(control)).toBeLessThan(25);
    // Hide me: the output is only the character, while the raw preview still shows the feed.
    await control.click('#cmd-hideMe');
    await control.waitForTimeout(1500);
    expect(await diff(control)).toBeGreaterThan(25);
  } finally {
    await app.close();
  }
});

test('Open/Close Virtual Stage Window follows the window, however it is closed', async () => {
  const { control, app } = await launchApp();
  try {
    await passConsent(control);
    const btn = control.locator('#open-stage');
    await expect(btn).toHaveText('Close Virtual Stage Window');
    await expect.poll(() => app.windows().length).toBe(2);

    await btn.click();
    await expect(btn).toHaveText('Open Virtual Stage Window');
    await expect.poll(() => app.windows().length).toBe(1);
    // The inset still previews the output while the window is closed.
    await expect.poll(() => stageWindows(control)).toBe(0);

    await btn.click();
    await expect(btn).toHaveText('Close Virtual Stage Window');
    await expect.poll(() => app.windows().length).toBe(2);

    // Closed outside the app (e.g. the window manager's menu): the label follows.
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'Stand-In Virtual Stage')
        ?.close(),
    );
    await expect(btn).toHaveText('Open Virtual Stage Window');

    // The inset reopens it.
    await control.click('#stage-inset-btn');
    await expect(btn).toHaveText('Close Virtual Stage Window');
    await expect.poll(() => app.windows().length).toBe(2);
  } finally {
    await app.close();
  }
});
