// Live check (T65): a recorded clip analysed by the real SDK, its telemetry saved to the
// demo library, then replayed on the next launch with no API key at all. Compares the
// intents Auto chose live with those it chose from the saved telemetry. Prints counts and
// intent ids only, never signal values.
//
//   node scripts/live-recorded.mjs <clip.mp4|webm> [outDir] [--name "Demo name"]
//                                  [--reserve seconds] [--label "ledger label"]
//
// With outDir, the saved demo is exported there through Advanced → Demo library: the
// single-file <name>.standin-demo.zip plus the loose video and telemetry.
//
// Budget-guarded (scripts/presage-budget.mjs): --reserve seconds (default 90) are reserved
// before the SDK starts. The clip, the demo library and the exported files stay outside
// the repo.
import { _electron as electron } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readLedger, reserve, settle, usedSeconds } from './presage-budget.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const positional = [];
const opts = { reserve: '90', label: 'T65 live recorded clip + telemetry save', name: '' };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) opts[a.slice(2)] = process.argv[++i];
  else positional.push(a);
}
const [clip, outDir] = positional;
if (!clip || !existsSync(clip)) throw new Error('usage: live-recorded.mjs <clip> [outDir] [--name n]');
const demoName = opts.name || basename(clip).replace(/\.[^.]+$/, '');
if (!process.env.PRESAGE_API_KEY) throw new Error('PRESAGE_API_KEY is not set');
const profile = mkdtempSync(join(tmpdir(), 'standin-live-rec-'));
const launch = (env) =>
  electron.launch({
    executablePath: require('electron'),
    args: [root, '--no-sandbox', `--user-data-dir=${profile}`],
    env: { ...process.env, STANDIN_E2E: '1', ...env },
  });
const sample = (page) =>
  page.evaluate(() => {
    const a = window.__standin.app;
    return {
      ms: Math.round(a.clip?.mediaMs ?? -1),
      intent: window.__standin.engine.debug?.intent.id ?? 'none',
      sensing: window.__standin.engine.debug?.sensing ?? 'live',
    };
  });

const result = { checks: {}, info: {} };
const runId = reserve(opts.label, Number(opts.reserve));
let startedAt = null;
let live = [];
let app = await launch({});
try {
  const page = await app.firstWindow();
  await page.evaluate(() => window.studio.setSettings({ mode: 'auto' }));
  await page.reload();
  await page.setInputFiles('#consent-clip-file', clip);
  startedAt = Date.now();
  await page.waitForSelector('#save-telemetry', { timeout: 15_000 });
  // Let the SDK warm up on the looping clip before the saved pass starts.
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => window.__standin.app.presage?.stats.packets ?? 0)) > 0) break;
    await page.waitForTimeout(500);
  }
  await page.click('#save-telemetry');
  await page.fill('#demo-name', demoName);
  await page.click('#demo-save-confirm');
  const clipMs = await page.evaluate(() => window.__standin.app.clip?.durationMs ?? 60_000);
  const deadline = Date.now() + clipMs + 15_000;
  while (Date.now() < deadline) {
    const status = await page.textContent('#telemetry-status');
    if (/^(Saved|Telemetry not saved)/.test(status ?? '')) break;
    live.push(await sample(page));
    await page.waitForTimeout(250);
  }
  const status = (await page.textContent('#telemetry-status')) ?? '';
  result.checks['telemetry saved from the live SDK'] = status.startsWith('Saved');
  result.info.status = status.replace(/“.*”/, '“…”');
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

const lib = join(profile, 'demos');
const [id] = existsSync(lib) ? readdirSync(lib) : [];
if (id) {
  const t = JSON.parse(readFileSync(join(lib, id, 'telemetry.json'), 'utf8'));
  const count = (k) => t.frames.filter((f) => f[k] !== undefined).length;
  result.info.frames = t.frames.length;
  result.info.withLandmarks = count('landmarks');
  result.info.withTalking = count('talking');
  result.info.withValidation = count('validation');
  result.info.talkingShare = +(
    t.frames.filter((f) => f.talking === true).length / Math.max(1, count('talking'))
  ).toFixed(2);
  result.checks['telemetry has face landmarks and talking'] =
    result.info.withLandmarks > 100 && result.info.withTalking > 100;
  result.checks['no body signals saved by default'] = !t.frames.some(
    (f) => f.pulseRate || f.breathingRate || f.breathingTrace,
  );
}

// Next launch, no API key: replay the saved demo offline.
let replay = [];
if (outDir) mkdirSync(outDir, { recursive: true });
app = await launch({ PRESAGE_API_KEY: '', STANDIN_FAKE_SDK: '1', STANDIN_E2E_PICK_DIR: outDir ?? '' });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('#consent-demo-pick', { timeout: 10_000 });
  await page.click('#consent-demo');
  await page.waitForSelector('#clip-play', { timeout: 15_000 });
  let last = -1;
  const clipMs = await page.evaluate(() => window.__standin.app.clip?.durationMs ?? 60_000);
  const deadline = Date.now() + clipMs + 15_000;
  while (Date.now() < deadline) {
    const s = await sample(page);
    if (s.ms + 1000 < last) break; // looped: one pass done
    last = s.ms;
    replay.push(s);
    await page.waitForTimeout(250);
  }
  result.checks['replay used no SDK session'] =
    (await page.evaluate(() => window.__standin.app.fakeSdk.created)) === 0;
  result.info.replayFramesEmitted = await page.evaluate(() => window.__standin.app.replay?.emitted ?? 0);
  if (outDir) {
    // Export through the real UI: the single-file bundle plus loose copies.
    await page.click('#tab-advanced');
    await page.locator('.demo-export').first().click();
    await page.waitForFunction(
      () => /Exported/.test(document.querySelector('#demo-library-status')?.textContent ?? ''),
      null,
      { timeout: 30_000 },
    );
    result.info.exported = readdirSync(outDir);
  }
} finally {
  await app.close();
}

// Compare intents at the same media time (after the first 5 s of calibration and warm-up).
const at = (trace, ms) =>
  trace.reduce((best, s) => (Math.abs(s.ms - ms) < Math.abs(best.ms - ms) ? s : best), trace[0]);
let same = 0;
let n = 0;
for (const s of live) {
  if (s.ms < 5_000 || s.sensing !== 'live') continue;
  const r = at(replay, s.ms);
  if (!r || Math.abs(r.ms - s.ms) > 400) continue;
  n++;
  if (r.intent === s.intent) same++;
}
const seq = (xs) => xs.map((x) => x.intent).filter((x, i, a) => x !== a[i - 1]);
result.info.liveSequence = seq(live).join(' → ');
result.info.replaySequence = seq(replay).join(' → ');
result.info.agreement = n ? +(same / n).toFixed(2) : 0;
result.info.compared = n;
result.checks['replay agrees with live intents (≥ 80% of samples)'] = n > 50 && same / n >= 0.8;
console.log(JSON.stringify(result.info, null, 2));
let failed = 0;
for (const [name, ok] of Object.entries(result.checks)) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
