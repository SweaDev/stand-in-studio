// Live check (T59): with the real SDK, Camera mode must stop all SDK traffic and leaving it
// must resume it. Counts validation reports (the SDK sends about one per analysed frame),
// never values.
//
//   node scripts/live-camera-pause.mjs [clip=test-assets/synthetic-960x540.mjpeg]
//
// Budget-guarded (scripts/presage-budget.mjs): at most 45 s are reserved.
import { _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readLedger, reserve, settle, usedSeconds } from './presage-budget.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clip = process.argv[2] ?? join(root, 'test-assets', 'synthetic-960x540.mjpeg');
if (!process.env.PRESAGE_API_KEY) throw new Error('PRESAGE_API_KEY is not set');
if (!existsSync(clip)) throw new Error(`missing ${clip}`);

const runId = reserve('T59 live camera-mode pause', 45);
let startedAt = null;
const result = { checks: {}, samples: {} };
const app = await electron.launch({
  executablePath: require('electron'),
  args: [root, '--no-sandbox', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'standin-pause-'))}`],
  env: { ...process.env, STANDIN_E2E: '1', STANDIN_FAKE_CAMERA: clip },
});
try {
  const page = await app.firstWindow();
  await page.evaluate(() => window.studio.setSettings({ mode: 'auto' }));
  await page.reload();
  await page.click('#consent-camera');
  startedAt = Date.now();
  const reports = () =>
    page.evaluate(() => {
      const s = window.__standin.app.presage?.stats;
      return { n: s ? s.ok + s.notOk : 0, status: window.__standin.app.presage?.status ?? null };
    });
  // Wait for the SDK to analyse frames (up to 15 s).
  let r = await reports();
  for (let i = 0; i < 30 && r.n < 20; i++) {
    await page.waitForTimeout(500);
    r = await reports();
  }
  result.samples.running = r;
  result.checks['SDK analyses frames in Auto'] = r.n >= 20 && r.status === 'running';

  await page.evaluate(() => window.__standin.app.setMode('camera'));
  await page.waitForTimeout(3_000); // debounce 1.5 s + stop
  const p1 = await reports();
  await page.waitForTimeout(4_000);
  const p2 = await reports();
  result.samples.paused = { p1, p2 };
  result.checks['Camera mode: SDK status is paused'] = p2.status === 'paused';
  result.checks['Camera mode: no frames analysed for 4 s'] = p2.n === p1.n;

  await page.evaluate(() => window.__standin.app.setMode('auto'));
  let q = await reports();
  for (let i = 0; i < 30 && q.n <= p2.n + 10; i++) {
    await page.waitForTimeout(500);
    q = await reports();
  }
  result.samples.resumed = q;
  result.checks['Back in Auto: SDK analyses frames again'] = q.n > p2.n + 10 && q.status === 'running';
  await page.click('#tab-camera').catch(() => undefined);
  await page.click('#back-to-start').catch(() => undefined);
  await page.waitForTimeout(500);
} finally {
  await app.close();
  const run = settle(runId, startedAt ? (Date.now() - startedAt) / 1000 : 0);
  console.log(
    `[presage-budget] ${run.label}: ${run.seconds}s; total ${usedSeconds(readLedger()).toFixed(1)}s of 900s`,
  );
}
console.log(JSON.stringify(result.samples));
let failed = 0;
for (const [name, ok] of Object.entries(result.checks)) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
process.exit(failed > 0 ? 1 : 0);
