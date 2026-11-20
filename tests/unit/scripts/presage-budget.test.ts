import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error -- plain ESM script without type declarations
import * as budget from '../../../scripts/presage-budget.mjs';

describe('presage-budget ledger', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-'));
    path = join(dir, 'ledger.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts empty with a 900 s cap', () => {
    const l = budget.readLedger(path);
    expect(l.capSeconds).toBe(900);
    expect(budget.usedSeconds(l)).toBe(0);
  });

  it('reserves, then settles to the measured time', () => {
    const id = budget.reserve('probe', 60, path);
    expect(budget.usedSeconds(budget.readLedger(path))).toBe(60);
    budget.settle(id, 42.04, path);
    expect(budget.usedSeconds(budget.readLedger(path))).toBe(42);
  });

  it('never settles above the reservation', () => {
    const id = budget.reserve('probe', 10, path);
    budget.settle(id, 99, path);
    expect(budget.usedSeconds(budget.readLedger(path))).toBe(10);
  });

  it('refuses runs that would exceed the cap', () => {
    budget.reserve('a', 850, path);
    expect(() => budget.reserve('b', 60, path)).toThrow(/budget exceeded/);
    expect(() => budget.reserve('c', 0, path)).toThrow();
    expect(budget.remainingSeconds(budget.readLedger(path))).toBe(50);
  });

  it('withBudget records time even when the run throws', async () => {
    await expect(
      budget.withBudget(
        'boom',
        30,
        async () => {
          throw new Error('fail');
        },
        path,
      ),
    ).rejects.toThrow('fail');
    const l = budget.readLedger(path);
    expect(l.runs[0].status).toBe('settled');
    expect(l.runs[0].seconds).toBeLessThan(1);
  });

  it('withBudget passes a deadline', async () => {
    const before = Date.now();
    const deadline = await budget.withBudget('ok', 5, async (d: number) => d, path);
    expect(deadline).toBeGreaterThanOrEqual(before + 5000);
  });
});
