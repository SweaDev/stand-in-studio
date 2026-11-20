import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { launchApp, passConsent } from './helpers';

test('consent and workspace have no serious accessibility violations', async () => {
  const { app, control } = await launchApp();
  try {
    // axe-core injected through evaluate (Electron pages can't host @axe-core/playwright).
    const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    const scan = async (): Promise<string[]> => {
      await control.evaluate(axeSource);
      return control.evaluate(async () => {
        const r = await (window as any).axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] });
        return r.violations
          .filter((v: any) => v.impact === 'serious' || v.impact === 'critical')
          .map((v: any) => `${v.id}: ${v.nodes.map((n: any) => n.target.join(' ')).join(', ')}`);
      });
    };
    expect(await scan()).toEqual([]);
    await passConsent(control);
    await expect(control.locator('#presence-dial')).toBeVisible();
    expect(await scan()).toEqual([]);
    await control.click('#show-help');
    expect(await scan()).toEqual([]);
  } finally {
    await app.close();
  }
});

test('everything is reachable by keyboard: Tab reaches the dial, modes and overrides', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await control.keyboard.press('Tab');
      const id = await control.evaluate(() => document.activeElement?.id ?? '');
      if (id) seen.add(id);
    }
    for (const id of ['presence-dial', 'open-stage', 'cmd-hideMe', 'test-pattern'])
      expect(seen).toContain(id);
    expect([...seen].some((id) => id.startsWith('mode-'))).toBe(true);
  } finally {
    await app.close();
  }
});

test('no camera: a clear message and a way into Demo mode', async () => {
  // A key is "available" but this machine has no camera (no fake device).
  const { app, control } = await launchApp({ PRESAGE_API_KEY: 'any-key-for-no-camera-test' });
  try {
    await control.click('#consent-camera');
    await expect(control.locator('#status-text')).toContainText('Could not open the camera', {
      timeout: 15_000,
    });
    await control.click('#status-action');
    await expect(control.locator('#demo-badge')).toBeVisible();
  } finally {
    await app.close();
  }
});
