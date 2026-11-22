import { expect, type Page, test } from '@playwright/test';
import { launchApp, openTab, passConsent } from './helpers';

const saved = (control: Page) => control.evaluate(() => (window as any).studio.getSettings());

test('build a custom intent from Presage signals, see conflicts, save, edit and delete it', async () => {
  const { app, control } = await launchApp();
  try {
    // Record external links instead of opening a browser.
    await app.evaluate(({ shell }) => {
      (globalThis as any).__opened = [];
      shell.openExternal = async (url: string) => {
        (globalThis as any).__opened.push(url);
      };
    });
    await passConsent(control);
    await openTab(control, 'advanced');
    await control.click('#create-intent');
    const dlg = control.locator('#intent-builder');
    await expect(dlg).toBeVisible();
    await expect(control.locator('#builder-save')).toBeDisabled();

    // The catalogue lists every signal with its SDK source and a docs link.
    await expect(dlg.locator('.signal-card')).toHaveCount(12);
    await expect(dlg.locator('#signal-gaze')).toContainText('face.landmarks (iris centres, eye corners)');
    await expect(dlg.locator('#signal-talking .signal-live')).toContainText('Now:');
    await dlg.locator('[data-doc="talking"]').click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).__opened))
      .toEqual(['https://smartspectra.presagetech.com/docs/data-types#face']);

    // Search narrows the catalogue.
    await control.fill('#signal-search', 'iris');
    await expect(dlg.locator('.signal-card')).toHaveCount(1);
    await control.fill('#signal-search', '');

    // Build "Laughing": talking + happy → reveal. It overlaps "Talking to someone else".
    await control.fill('#intent-name', 'Laughing');
    await control.click('#add-talking');
    await control.click('#add-expression');
    await expect(dlg.locator('[data-signal="expression"] .state-chip[aria-pressed="true"]')).toHaveCount(4);
    for (const st of ['surprise', 'sad', 'angry'])
      await dlg.locator(`[data-signal="expression"] [data-state="${st}"]`).click();
    await dlg.locator('.segmented-compact').getByText('Reveal me').click();
    await expect(control.locator('#builder-conflicts')).toContainText('Both match when');
    await expect(control.locator('#builder-conflicts .conflict-warning').first()).toBeVisible();

    // Save: it goes just below "Away", above the intents it overlaps.
    await control.click('#builder-save');
    await expect(dlg).toBeHidden();
    let s = await saved(control);
    expect(s.auto.intents[1]).toMatchObject({
      name: 'Laughing',
      action: 'reveal',
      conditions: [
        { signal: 'talking', states: ['yes'] },
        { signal: 'expression', states: ['happy'] },
      ],
    });

    // Edit from the list; a body signal forbids revealing.
    await openTab(control, 'auto');
    await control.getByRole('button', { name: 'Edit Laughing' }).click();
    await control.fill('#intent-name', 'Laughing out loud');
    await control.click('#add-pulse');
    await expect(dlg.locator('.callout-info')).toContainText('can only cover you');
    await expect(dlg.locator('.segmented-compact input[value="reveal"]')).toBeDisabled();
    await control.click('#builder-save');
    s = await saved(control);
    expect(s.auto.intents[1]).toMatchObject({ name: 'Laughing out loud', action: 'cover' });

    // A duplicate that sits below an identical intent can never win: saving is blocked.
    await control
      .getByRole('button', { name: 'Duplicate Talking to someone else as a custom intent' })
      .click();
    await control.selectOption('#intent-position', { label: 'At the bottom' });
    await expect(control.locator('#builder-conflicts .conflict-error')).toBeVisible();
    await expect(control.locator('#builder-save')).toBeDisabled();
    await control.click('#builder-cancel');

    // Delete.
    await control.getByRole('button', { name: 'Delete Laughing out loud' }).click();
    await expect
      .poll(async () => (await saved(control)).auto.intents.some((i: any) => !i.builtIn))
      .toBe(false);
  } finally {
    await app.close();
  }
});

test('Demo O key (talking to someone off to the side) covers you; guided tuning walks the steps', async () => {
  const { app, control } = await launchApp();
  try {
    await passConsent(control);
    await control.keyboard.press('o');
    await expect(control.locator('#current-intent')).toHaveText('Talking to someone else', {
      timeout: 6_000,
    });
    await control.keyboard.press('o');
    await control.click('#guided-tuning');
    await expect(control.locator('#guided-step')).toHaveText('Step 1 of 4');
    await control.click('#guided-skip');
    await expect(control.locator('#guided-step')).toHaveText('Step 2 of 4');
    await control.click('#guided-stop');
    await expect(control.locator('#guided-tuning')).toBeVisible();
  } finally {
    await app.close();
  }
});
