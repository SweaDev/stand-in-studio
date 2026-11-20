import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './helpers';

const outDir = join(__dirname, '..', '..', 'test-results', 'tiles');

test('opens a frameless "Stand-In Stage" window and draws both priority characters', async () => {
  const { app, control } = await launchApp();
  try {
    await expect.poll(() => app.windows().length).toBe(2);
    const titles = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({ title: w.getTitle(), size: w.getContentSize() })),
    );
    expect(titles).toContainEqual({ title: 'Stand-In Stage', size: [1280, 720] });

    mkdirSync(outDir, { recursive: true });
    for (const id of ['lantern', 'houseplant']) {
      await control.evaluate((c) => (window as any).__standin.setCharacter(c), id);
      await control.waitForTimeout(400);
      const url: string = await control.evaluate(() => (window as any).__standin.tile(320, 180));
      expect(url).toMatch(/^data:image\/png;base64,/);
      const png = Buffer.from(url.split(',')[1] as string, 'base64');
      expect(png.length).toBeGreaterThan(3000); // a real drawing, not a blank tile
      writeFileSync(join(outDir, `${id}.png`), png);
    }
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.loop.fps as number), { timeout: 5000 })
      .toBeGreaterThan(20);
  } finally {
    await app.close();
  }
});
