import { expect, test, type Page } from '@playwright/test';
import { launchApp, passConsent } from './helpers';

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__standin.engine.state;
    if (!s) return { feed: -1, speaking: false, presence: 'none', mode: 'none' };
    return { feed: s.feedOpacity, speaking: s.badges.speaking, presence: s.pose.presence, mode: s.mode };
  });

test('Demo mode: badge in the control window only, keys drive Auto end to end', async () => {
  const { app, control } = await launchApp();
  try {
    await expect(control.locator('#demo-badge')).toBeHidden();
    await passConsent(control);
    await expect(control.locator('#demo-badge')).toHaveText('DEMO – simulated signals');
    // The badge must never reach the stage: the stage window holds only the canvas.
    await expect.poll(() => app.windows().length).toBe(2);
    const stageHtml = await control.evaluate(
      () => (window as any).__standin.host.surface.ownerDocument.body.innerHTML,
    );
    expect(stageHtml).not.toContain('DEMO');

    // Calibrate (3 s in Demo), then listen: settles at the 40% listening level.
    await expect.poll(async () => (await state(control)).feed, { timeout: 12_000 }).toBeCloseTo(0.4, 1);

    // Hold T to talk: the speaker is shown.
    await control.keyboard.down('t');
    await expect.poll(async () => (await state(control)).speaking, { timeout: 3000 }).toBe(true);
    await expect.poll(async () => (await state(control)).feed, { timeout: 8000 }).toBeGreaterThan(0.95);
    await control.keyboard.up('t');

    // Look away (L toggles): the character covers.
    await control.keyboard.press('l');
    await expect.poll(async () => (await state(control)).feed, { timeout: 8000 }).toBeLessThan(0.02);
    await control.keyboard.press('l');

    // Step away (A toggles): "back soon".
    await control.keyboard.press('a');
    await expect.poll(async () => (await state(control)).presence, { timeout: 8000 }).toBe('away');
    await control.keyboard.press('a');

    // The scripted meeting loop starts and shows captions.
    await control.click('#script');
    await expect(control.locator('#script')).toHaveAttribute('aria-pressed', 'true');
    await expect(control.locator('#caption')).not.toBeEmpty();
  } finally {
    await app.close();
  }
});
