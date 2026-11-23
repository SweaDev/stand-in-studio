import { expect, test } from '@playwright/test';
import { launchApp, openTab, passConsent } from './helpers';

const state = (control: any) =>
  control.evaluate(() => {
    const s = (window as any).__standin?.engine.state;
    if (!s) return { face: null, anchor: null, zoom: -1, lip: null };
    return { face: s.face, anchor: s.faceAnchor, zoom: s.zoom, lip: s.style };
  });

test('the character follows the face by default; size, opacity and offset are adjustable and saved', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await expect.poll(async () => (await state(control)).face).not.toBeNull();
    expect((await state(control)).anchor).toMatchObject({ follow: true, size: 1, opacity: 1 });
    await openTab(control, 'stage');
    await expect(control.locator('#face-follow')).toBeChecked();
    await expect(control.locator('#face-anchor-options')).toBeVisible();
    await control.locator('#face-size').fill('0.6');
    await control.locator('#face-offset-y').fill('-0.25');
    await control.locator('#face-opacity').fill('70');
    await expect
      .poll(async () => (await state(control)).anchor)
      .toMatchObject({ size: 0.6, offsetY: -0.25, opacity: 0.7 });
    await control.click('#face-reset');
    await expect
      .poll(async () => (await state(control)).anchor)
      .toMatchObject({ size: 1, offsetY: 0, opacity: 1 });
    await control.uncheck('#face-follow');
    await expect(control.locator('#face-anchor-options')).toBeHidden();
    const saved = await control.evaluate(() => (window as any).studio.getSettings());
    expect(saved.faceAnchor.follow).toBe(false);
  } finally {
    await app.close();
  }
});

test('lip-reading zoom is an opt-in accessibility setting, off by default', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await openTab(control, 'stage');
    await expect(control.locator('#lip-reading')).not.toBeChecked();
    await control.check('#lip-reading');
    await expect
      .poll(() =>
        control.evaluate(() => (window as any).studio.getSettings().then((s: any) => s.accessibility)),
      )
      .toMatchObject({ lipReading: true });
    // Demo: hold T to talk; once Auto commits to revealing you, the stage zooms to the face.
    await control.locator('body').click({ position: { x: 5, y: 5 } });
    await control.keyboard.down('t');
    await expect.poll(async () => (await state(control)).zoom, { timeout: 12_000 }).toBe(1);
    await expect
      .poll(() => control.evaluate(() => (window as any).__standin.engine.state.targetOpacity))
      .toBe(1);
    await control.keyboard.up('t');
    await expect.poll(async () => (await state(control)).zoom, { timeout: 12_000 }).toBe(0);
  } finally {
    await app.close();
  }
});

test('each character declares the body it actually draws (so 100% covers the face)', async () => {
  const { app, control } = await launchApp();
  try {
    await control.waitForFunction(() => (window as any).__standin);
    for (const id of ['lantern', 'houseplant', 'cat', 'cloud']) {
      const r = await control.evaluate((c) => (window as any).__standin.characterBody(c), id);
      for (const k of ['w', 'h', 'dx', 'dy'] as const)
        expect(Math.abs(r.measured[k] - r.declared[k]), `${id}.${k}`).toBeLessThan(0.03);
    }
  } finally {
    await app.close();
  }
});
