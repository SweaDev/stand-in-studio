// Presage SDK usage ledger. Every live run must go through withBudget(), which
// reserves the run's maximum duration up front (so a crash still counts the worst
// case) and replaces it with the measured time when the run ends. The cumulative
// cap is 900 s (15 min) by default.
//
//   node scripts/presage-budget.mjs status
//
// Ledger file: .presage-usage.json at the repo root (git-ignored), or $PRESAGE_LEDGER.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CAP_SECONDS = 900;

export function ledgerPath() {
  return (
    process.env.PRESAGE_LEDGER ?? join(dirname(fileURLToPath(import.meta.url)), '..', '.presage-usage.json')
  );
}

export function readLedger(path = ledgerPath()) {
  if (!existsSync(path)) return { capSeconds: DEFAULT_CAP_SECONDS, runs: [] };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return {
    capSeconds: data.capSeconds ?? DEFAULT_CAP_SECONDS,
    runs: Array.isArray(data.runs) ? data.runs : [],
  };
}

function writeLedger(ledger, path) {
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n');
}

export function usedSeconds(ledger) {
  return ledger.runs.reduce((sum, r) => sum + (Number(r.seconds) || 0), 0);
}

export function remainingSeconds(ledger) {
  return Math.max(0, ledger.capSeconds - usedSeconds(ledger));
}

/** Records a reservation of `maxSeconds`; throws when it would exceed the cap. Returns the run id. */
export function reserve(label, maxSeconds, path = ledgerPath()) {
  if (!(maxSeconds > 0)) throw new RangeError('maxSeconds must be positive');
  const ledger = readLedger(path);
  const remaining = remainingSeconds(ledger);
  if (maxSeconds > remaining) {
    throw new Error(
      `Presage budget exceeded: run "${label}" needs up to ${maxSeconds}s but only ${remaining.toFixed(1)}s of ${ledger.capSeconds}s remain`,
    );
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ledger.runs.push({ id, label, at: new Date().toISOString(), seconds: maxSeconds, status: 'reserved' });
  writeLedger(ledger, path);
  return id;
}

/** Replaces a reservation with the measured duration (never more than reserved). */
export function settle(id, actualSeconds, path = ledgerPath()) {
  const ledger = readLedger(path);
  const run = ledger.runs.find((r) => r.id === id);
  if (!run) throw new Error(`unknown budget run ${id}`);
  run.seconds = Math.min(run.seconds, Math.max(0, Math.round(actualSeconds * 10) / 10));
  run.status = 'settled';
  writeLedger(ledger, path);
  return run;
}

/**
 * Runs `fn(deadlineMs)` under a budget reservation. `fn` must stop the SDK before
 * `deadlineMs` (epoch ms). The measured wall time is recorded afterwards.
 */
export async function withBudget(label, maxSeconds, fn, path = ledgerPath()) {
  const id = reserve(label, maxSeconds, path);
  const started = Date.now();
  try {
    return await fn(started + maxSeconds * 1000);
  } finally {
    const run = settle(id, (Date.now() - started) / 1000, path);
    const ledger = readLedger(path);
    console.log(
      `[presage-budget] ${label}: ${run.seconds}s used; total ${usedSeconds(ledger).toFixed(1)}s of ${ledger.capSeconds}s`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ledger = readLedger();
  console.log(`Presage budget: used ${usedSeconds(ledger).toFixed(1)}s of ${ledger.capSeconds}s`);
  for (const r of ledger.runs) console.log(`  ${r.at}  ${r.label}  ${r.seconds}s  (${r.status})`);
}
