// Reproduces the user's crash path (T49): Demo mode → paste the API key → Start with my
// camera → run → close the control window. Reports how the Electron process ended and
// whether the native `napi_throw` abort appeared on stderr.
//
//   node scripts/repro-quit.mjs <label> [seconds=25]
//
// Budget-guarded (scripts/presage-budget.mjs). Prints counters and lifecycle lines only.
import { _electron as electron } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readLedger, reserve, settle, usedSeconds } from './presage-budget.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [label = 'repro-quit', secondsArg = '25'] = process.argv.slice(2);
const seconds = Math.min(40, Number(secondsArg));
const clip = join(root, 'test-assets', 'face-960x540.mjpeg');
const key = process.env.PRESAGE_API_KEY;
if (!key) throw new Error('PRESAGE_API_KEY is not set');
if (!existsSync(clip)) throw new Error(`missing ${clip}; run scripts/fetch-test-video.sh`);

const runId = reserve(label, seconds + 20);
let startedAt = null;

const env = { ...process.env, STANDIN_E2E: '1', STANDIN_FAKE_CAMERA: clip };
delete env.PRESAGE_API_KEY; // the user pasted the key in the UI
const app = await electron.launch({
  executablePath: require('electron'),
  args: [root, '--no-sandbox', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'standin-repro-'))}`],
  env,
});
const proc = app.process();
let stderr = '';
proc.stderr?.on('data', (d) => (stderr += d.toString()));
proc.stdout?.on('data', (d) => (stderr += d.toString()));
const exited = new Promise((resolve) => proc.on('exit', (code, signal) => resolve({ code, signal })));
let packets = 0;
try {
  const page = await app.firstWindow();
  await page.click('#consent-demo');
  await page.fill('#api-key-input', key);
  await page.click('#api-key-save');
  await page.click('#api-key-restart');
  await page.click('#consent-camera');
  startedAt = Date.now();
  await page.waitForTimeout(seconds * 1000);
  packets = await page.evaluate(() => window.__standin.app.presage?.stats.packets ?? 0);
  // Close the control window the way a user does (title-bar ×), not app.close().
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => !w.getParentWindow() && w.getTitle() !== 'Stand-In Stage')
      ?.close(),
  );
} catch (err) {
  console.error(`repro step failed: ${err.message}`);
}
const end = await Promise.race([
  exited,
  new Promise((r) => setTimeout(() => r({ code: 'timeout' }), 15_000)),
]);
const stoppedAt = Date.now();
if (end.code === 'timeout') proc.kill('SIGKILL');
const run = settle(runId, startedAt ? (stoppedAt - startedAt) / 1000 : 0);
console.log(
  `[presage-budget] ${run.label}: ${run.seconds}s; total ${usedSeconds(readLedger()).toFixed(1)}s of 900s`,
);
const lifecycle = stderr.split('\n').filter((l) => l.includes('[stand-in]'));
const result = {
  packets,
  exit: end,
  napiThrow: stderr.includes('napi_throw'),
  sigabrt: end.signal === 'SIGABRT' || /SIGABRT/.test(stderr),
  lifecycle,
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.napiThrow || result.sigabrt || end.code !== 0 ? 1 : 0);
