import { expect, test } from '@playwright/test';
import { launchApp, openTab, passConsent } from './helpers';

test('developer mode shows a live decision log in the control window only', async () => {
  const { app, control } = await launchApp();
  let output = '';
  app.process().stdout?.on('data', (d) => (output += d.toString()));
  app.process().stderr?.on('data', (d) => (output += d.toString()));
  try {
    await passConsent(control);
    await expect(control.locator('#devlog')).toBeHidden();
    await openTab(control, 'advanced');
    await control.getByLabel('Developer mode').check();
    await expect(control.locator('#devlog')).toBeVisible();
    await expect(control.locator('#devlog-summary')).toContainText('← Listening to others');

    // Talking to someone off to the side (Demo O): the log records the switch and why.
    await control.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await control.keyboard.press('o');
    await expect(control.locator('#devlog-rows')).toContainText('Cover me ← Talking to someone else', {
      timeout: 6_000,
    });
    await expect(control.locator('#devlog-rows tr').first()).toContainText('Cover me');

    // Pause stops new rows; the filter narrows to one intent.
    await control.click('#devlog-pause');
    const n = await control.locator('#devlog-rows tr').count();
    await control.waitForTimeout(1_200);
    expect(await control.locator('#devlog-rows tr').count()).toBe(n);
    await control.click('#devlog-pause');
    await control.selectOption('#devlog-filter', 'talkingToOther');
    await expect(control.locator('#devlog-rows tr').first()).toContainText('Talking to someone else');

    // Copy puts JSON lines with the full trace on the clipboard.
    await app.evaluate(({ clipboard }) => clipboard.clear());
    await control.bringToFront();
    await control.click('#devlog-copy');
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).not.toBe('');
    const lines = (await app.evaluate(({ clipboard }) => clipboard.readText())).split('\n');
    const first = JSON.parse(lines[0] as string);
    expect(first.signals.map((s: any) => s.id)).toContain('gaze');
    expect(first.intents.length).toBeGreaterThan(5);
    expect(first.policy).toHaveProperty('feedTarget');

    // Never on the stage window, never printed.
    const stage = app.windows().find((w) => w !== control);
    if (stage)
      expect(await stage.evaluate(() => document.body.textContent ?? '')).not.toContain('Decision log');
    expect(output).not.toContain('Talking to someone else');
    expect(output).not.toContain('talkingShare');

    // Turning it off hides and clears the log.
    await control.getByLabel('Developer mode').uncheck();
    await expect(control.locator('#devlog')).toBeHidden();
    await expect(control.locator('#devlog-count')).toHaveText('0 rows');
  } finally {
    await app.close();
  }
});
