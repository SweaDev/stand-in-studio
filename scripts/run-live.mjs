// Live run of the real app (T38/T39/T45): Electron + Chromium fake camera fed from the
// public-domain test clip + the real SmartSpectra SDK with PRESAGE_API_KEY.
//
//   node scripts/run-live.mjs <label> <seconds> [profile=960x540]
//
// Budget-guarded (scripts/presage-budget.mjs). Prints counters and timings only, never
// physiological values. Exits non-zero if the expected signals did not arrive.
import { _electron as electron } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readLedger, reserve, settle, usedSeconds } from './presage-budget.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [label = 'live', secondsArg = '60', profile = '960x540'] = process.argv.slice(2);
const seconds = Math.min(120, Number(secondsArg));
const clip = join(root, 'test-assets', `face-${profile}.mjpeg`);
if (!process.env.PRESAGE_API_KEY) throw new Error('PRESAGE_API_KEY is not set');
if (!existsSync(clip)) throw new Error(`missing ${clip}; run scripts/fetch-test-video.sh`);

// Reserve the worst case up front; settle to the time the SDK actually ran (from its first
// 'starting' status to stop). If the SDK never started, nothing reached Presage: 0 s.
const runId = reserve(`${label} (${profile})`, seconds + 15);
let sdkStartedAt = null;
let sdkStoppedAt = null;
const deadline = Date.now() + (seconds + 15) * 1000;
const result = await (async () => {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [root, '--no-sandbox', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'standin-live-'))}`],
    env: { ...process.env, STANDIN_E2E: '1', STANDIN_FAKE_CAMERA: clip },
  });
  try {
    const page = await app.firstWindow();
    await page.evaluate((p) => window.studio.setSettings({ camera: { profile: p }, mode: 'auto' }), profile);
    await page.reload();
    await page.click('#consent-camera');
    const started = Date.now();
    sdkStartedAt = Date.now();
    const samples = [];
    while (Date.now() - started < seconds * 1000 && Date.now() < deadline - 5000) {
      await page.waitForTimeout(1000);
      samples.push(
        await page.evaluate(() => {
          const a = window.__standin.app;
          const s = a.engine.state;
          return {
            t: performance.now(),
            stats: { ...a.presage?.stats },
            status: a.presage?.status,
            stageFps: a.loop.fps,
            feed: s?.feedOpacity ?? null,
            speaking: s?.badges.speaking ?? false,
            presence: s?.pose.presence ?? null,
            cal: a.engine.calibrationStatus().phase,
            capture: a.camera?.settings()
              ? `${a.camera.settings().width}x${a.camera.settings().height}@${Math.round(a.camera.settings().frameRate)}`
              : null,
            banner:
              document.getElementById('status-banner')?.hidden === false
                ? document.getElementById('status-text')?.textContent
                : null,
          };
        }),
      );
    }
    if (!samples.some((s) => s.status)) sdkStartedAt = null; // SDK never started
    await page.click('#stop-camera').catch(() => undefined);
    await page.waitForTimeout(500);
    sdkStoppedAt = Date.now();
    return samples;
  } finally {
    await app.close();
    sdkStoppedAt ??= Date.now();
    const billed = sdkStartedAt ? (sdkStoppedAt - sdkStartedAt) / 1000 : 0;
    const run = settle(runId, billed);
    console.log(
      `[presage-budget] ${run.label}: ${run.seconds}s; total ${usedSeconds(readLedger()).toFixed(1)}s of 900s`,
    );
  }
})();

const first = result.find((s) => s.stats.packets > 0);
const last = result[result.length - 1];
const span = first ? (last.t - first.t) / 1000 : 0;
const summary = {
  label,
  profile,
  capture: last.capture,
  status: last.status,
  banner: last.banner,
  firstPacketAfterS: first ? result.indexOf(first) + 1 : null,
  packetsPerS: span > 0 ? +((last.stats.packets - first.stats.packets) / span).toFixed(1) : 0,
  stageFps: +(result.reduce((a, s) => a + s.stageFps, 0) / result.length).toFixed(1),
  counts: last.stats,
  calibration: last.cal,
  presence: last.presence,
  speakingSeen: result.some((s) => s.speaking),
  maxFeed: Math.max(...result.map((s) => s.feed ?? 0)),
};
console.log(JSON.stringify(summary, null, 2));
const ok =
  summary.counts.packets > 0 &&
  summary.counts.landmarks > 0 &&
  summary.counts.breathing > 0 &&
  summary.counts.ok > 0 &&
  summary.status === 'running';
if (!ok) {
  console.error('LIVE CHECK FAILED: expected landmarks, breathing samples and kOk validation from the SDK');
  process.exit(1);
}
