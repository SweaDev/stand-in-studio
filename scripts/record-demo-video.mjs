// Records the raw footage for the demo video: one scripted session of the real app on a
// virtual display, with a visible cursor (click ripples, keycap badges) drawn by an overlay
// this script injects. The control window and the Virtual Stage are captured separately
// with ffmpeg x11grab, and scene marks plus the active intent over time go to timeline.json
// for scripts/compose-demo-video.mjs.
//
//   node scripts/record-demo-video.mjs --demo <bundle.standin-demo.zip> --clip <video> --out <dir>
//                                      [--live-reserve 60] [--skip-live 1]
//
// Everything replays the saved demo (no API) except one scene, which opens the clip as a
// video file so Presage analyses it live (budget-guarded, --live-reserve seconds).
// --skip-live 1 leaves that scene out, so the run makes no SDK session at all; the
// composer can take the live shots from an earlier take. Needs Xvfb and ffmpeg. The
// footage stays in <dir>, outside the repo.
import { _electron as electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readLedger, reserve, settle, usedSeconds } from './presage-budget.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const opts = { 'live-reserve': '60' };
for (let i = 2; i < process.argv.length; i += 2)
  opts[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!opts.demo || !opts.clip || !opts.out) throw new Error('usage: --demo <zip> --clip <video> --out <dir>');
const out = resolve(opts.out);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Display: control window 1536×864 DIP at 1.25 = 1920×1080 px; stage 1280×720 DIP = 1600×900 px.
const SCALE = 1.25;
const DISPLAY = ':97';
const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', '3520x1080x24', '-nolisten', 'tcp'], {
  stdio: 'ignore',
});
await sleep(1500);
const env = { ...process.env, DISPLAY, STANDIN_E2E: '1' };
const profile = mkdtempSync(join(tmpdir(), 'standin-video-'));
const launch = (extra) =>
  electron.launch({
    executablePath: require('electron'),
    args: [root, '--no-sandbox', `--force-device-scale-factor=${SCALE}`, `--user-data-dir=${profile}`],
    env: { ...env, ...extra },
  });

// ---- Prepare the profile: import the demo, pick it, and settle the settings.
{
  const app = await launch({ PRESAGE_API_KEY: '' });
  const p = await app.firstWindow();
  await p.click('#consent-demo');
  await p.click('#tab-advanced');
  await p.setInputFiles('#demo-import-bundle', resolve(opts.demo));
  await p.click('#demo-import-bundle-btn');
  await p.waitForFunction(() =>
    /Imported/.test(document.querySelector('#demo-library-status')?.textContent ?? ''),
  );
  const id = await p.evaluate(async () => (await window.studio.demos.list()).demos[0].id);
  await p.evaluate(
    (lastDemo) =>
      window.studio.setSettings({
        mode: 'auto',
        character: 'lantern',
        background: '#2b2d42',
        recorded: { lastDemo },
        onboarding: { tourOffered: true },
        ui: { overrides: false, intents: false, tuning: true, meetingSetup: true, presets: true },
      }),
    id,
  );
  await app.close();
}

// ---- The recorded session.
const app = await launch({ STANDIN_FAKE_VCAM: '/dev/shm/standin-demo-vcam.yuv' });
const page = await app.firstWindow();
await page.waitForSelector('#consent-demo');
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setBounds({ x: 0, y: 0, width: 1536, height: 864 });
});
await sleep(800);

const CURSOR = `(() => {
  if (window.__demoCursor) return;
  const host = document.createElement('div');
  host.setAttribute('popover', 'manual');
  host.style.cssText = 'all:unset;position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;overflow:visible;display:block';
  host.innerHTML = '<svg id="dc" width="26" height="26" viewBox="0 0 24 24" style="position:absolute;left:0;top:0;transform:translate(-200px,-200px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))"><path d="M4 2.5l15 8.2-6.6 1.7-3.2 6.4z" fill="#fff" stroke="#16141a" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
    '<div id="dk" style="position:absolute;left:50%;bottom:56px;transform:translateX(-50%);opacity:0;transition:opacity .2s;font:700 22px Inter,system-ui,sans-serif;color:#fff;background:rgba(22,20,26,.9);border:1px solid rgba(255,255,255,.25);border-bottom-width:4px;border-radius:12px;padding:8px 16px;letter-spacing:.02em"></div>';
  document.body.append(host);
  host.showPopover();
  const c = host.querySelector('#dc');
  const ripple = (x, y) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:absolute;left:' + (x - 20) + 'px;top:' + (y - 20) + 'px;width:40px;height:40px;border-radius:50%;border:3px solid #f2a65a;background:rgba(242,166,90,.28);transform:scale(.35);opacity:1;transition:transform .5s ease-out,opacity .5s ease-out';
    host.append(r);
    requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = 'scale(1.5)'; r.style.opacity = '0'; }));
    setTimeout(() => r.remove(), 700);
  };
  addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
  addEventListener('mousedown', (e) => ripple(e.clientX, e.clientY), true);
  window.__demoRipple = ripple;
  window.__demoKey = (t) => { const k = host.querySelector('#dk'); k.textContent = t; k.style.opacity = '1'; clearTimeout(k._t); k._t = setTimeout(() => (k.style.opacity = '0'), 1600); };
  // Stay above modal dialogs (they join the top layer when opened).
  new MutationObserver(() => { try { host.hidePopover(); host.showPopover(); } catch {} })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  // Native tooltips would pop up as separate windows in the capture: drop them.
  addEventListener('mouseover', (e) => {
    for (let el = e.target; el && el.removeAttribute; el = el.parentElement)
      if (el.hasAttribute('title')) el.removeAttribute('title');
  }, true);
  window.__demoCursor = host;
})()`;
await page.evaluate(CURSOR);

let cur = { x: 768, y: 600 };
const glide = async (x, y, ms = 650) => {
  const steps = Math.max(10, Math.round(ms / 18));
  const { x: sx, y: sy } = cur;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
    await sleep(ms / steps - 4);
  }
  cur = { x, y };
};
const box = async (sel) => {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  return el.boundingBox();
};
const to = async (sel, ms, dx = 0.5, dy = 0.5) => {
  const b = await box(sel);
  await glide(b.x + b.width * dx, b.y + b.height * dy, ms);
};
const click = async (sel, ms) => {
  await to(sel, ms);
  await sleep(220);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(350);
};
/** Shows a press without a native click (e.g. a button that would open a system dialog). */
const press = async (sel) => {
  await to(sel);
  await sleep(200);
  await page.evaluate(([x, y]) => window.__demoRipple(x, y), [cur.x, cur.y]);
  await sleep(300);
};
const key = (label) => page.evaluate((t) => window.__demoKey(t), label);
/** Puts the Virtual Stage window beside the control window (it reopens on every input switch). */
const placeStage = async () => {
  for (let i = 0; i < 50; i++) {
    const done = await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows())
        if (w.getTitle() === 'Stand-In Virtual Stage') {
          w.setBounds({ x: 1536, y: 0, width: 1280, height: 720 });
          return true;
        }
      return false;
    });
    if (done) return;
    await sleep(100);
  }
};

// ---- Capture.
const grab = (file, size, offset) =>
  spawn(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'x11grab',
      '-framerate',
      '30',
      '-video_size',
      size,
      '-i',
      `${DISPLAY}.0+${offset}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '14',
      '-pix_fmt',
      'yuv420p',
      file,
    ],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  );
const recs = [
  grab(join(out, 'raw-control.mkv'), '1920x1080', '0,0'),
  grab(join(out, 'raw-stage.mkv'), '1600x900', '1920,0'),
];
const t0 = Date.now() + 150; // x11grab starts within a frame or two
const marks = [];
const mark = (name) => {
  marks.push({ name, t: +((Date.now() - t0) / 1000).toFixed(2) });
  console.log(`mark ${name} @ ${marks.at(-1).t}s`);
};
const samples = [];
const sampler = setInterval(async () => {
  try {
    const s = await page.evaluate(() => {
      const a = window.__standin?.app;
      const d = window.__standin?.engine.debug;
      return {
        ms: Math.round(a?.clip?.mediaMs ?? -1),
        intent: d?.intent.name ?? '',
        id: d?.intent.id ?? '',
        feed: +(window.__standin?.engine.state?.feedOpacity ?? 0).toFixed(2),
        sensing: d?.sensing ?? '',
        mode: window.__standin?.engine.state?.mode ?? '',
      };
    });
    samples.push({ t: +((Date.now() - t0) / 1000).toFixed(2), ...s });
  } catch {
    /* page busy */
  }
}, 200);

try {
  await sleep(1200);
  // S3 · start screen.
  mark('start');
  await to('.key-points li:nth-child(1)', 900, 0.3);
  await sleep(700);
  await to('.key-points li:nth-child(3)', 700, 0.3);
  await sleep(900);
  await click('#consent-more summary', 700);
  await sleep(2200);
  await click('#consent-more summary', 500);
  await sleep(600);
  await to('#card-clip', 700);
  await sleep(800);
  await to('#consent-demo-pick', 800);
  await sleep(1500);
  await click('#consent-demo', 600);
  mark('start-end');

  // S4 · the workspace and the Virtual Stage.
  await page.waitForSelector('#pill-source');
  await placeStage();
  await sleep(1000);
  mark('workspace');
  await to('#pill-source', 800);
  await sleep(1300);
  await to('#pill-presage', 500);
  await sleep(1300);
  await to('#pill-vcam', 500);
  await sleep(1300);
  await to('.thumb-frame', 800, 0.35, 0.45);
  await sleep(1500);
  await to('#stage-inset-btn', 700);
  await sleep(1600);
  await to('#presence-dial', 900);
  await sleep(1500);
  mark('workspace-end');

  // S5 · Auto on the clip (listening → turned to the side → talking → listening).
  await page.evaluate(() => window.__standin.app.clip.seek(22_000));
  await glide(1200, 760, 600);
  await sleep(2500);
  mark('auto');
  await sleep(47_000);
  mark('auto-end');

  // S6 · Hide me, the hotkey, and modes.
  mark('controls');
  await click('#cmd-hideMe', 800);
  await sleep(2200);
  await click('#cmd-hideMe', 300);
  await sleep(1500);
  await key('Ctrl + Alt + H');
  await page.evaluate(() => window.__standin.app.runCommand('hideMe'));
  await sleep(2000);
  await key('Ctrl + Alt + H');
  await page.evaluate(() => window.__standin.app.runCommand('hideMe'));
  await sleep(1300);
  await click('#mode-character', 800);
  await sleep(1800);
  await click('#mode-blend', 400);
  await sleep(1800);
  await click('#mode-auto', 400);
  await sleep(1200);
  mark('controls-end');

  // S7 · characters on the same footage.
  mark('characters');
  await click('#tab-stage', 900);
  await sleep(700);
  for (const name of ['Houseplant', 'Cat', 'Cloud', 'Paper lantern']) {
    await click(`#panel-stage label:has-text("${name}")`, 600);
    await sleep(2300);
  }
  mark('characters-end');

  // S8 · intents: show the list (Advanced → Interface), then the builder.
  mark('intents');
  await click('#tab-advanced', 800);
  await sleep(600);
  await to('#group-interface', 600, 0.5, 0.2);
  await sleep(700);
  await click('#ui-intents', 700);
  await sleep(700);
  await click('#tab-auto', 700);
  await sleep(500);
  await page.evaluate(() =>
    document.querySelector('#group-intents')?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
  );
  await to('#group-intents', 700, 0.5, 0.35);
  await sleep(2200);
  await click('#new-intent', 700);
  await sleep(800);
  await click('#intent-name', 600);
  await page.keyboard.type('Checking my phone', { delay: 55 });
  await sleep(400);
  await click('#add-headTilt', 700);
  await sleep(900);
  await click('#add-talking', 600);
  await sleep(1600);
  await click('#builder-cancel', 700);
  await sleep(600);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) if (el.scrollTop) el.scrollTop = 0;
  });
  mark('intents-end');

  // S9 · live: the clip as a video file, analysed by Presage (budget-guarded).
  mark('live');
  if (opts['skip-live'] !== '1') {
    await click('#tab-camera', 800);
    await sleep(600);
    await press('#input-clip');
    const runId = reserve('T82 demo video: live analysis scene', Number(opts['live-reserve']));
    const liveStart = Date.now();
    try {
      await page.setInputFiles('#input-clip-file', resolve(opts.clip));
      await page.waitForFunction(
        () => /^Presage · /.test(document.querySelector('#pill-presage')?.textContent ?? ''),
        null,
        { timeout: 25_000 },
      );
      await placeStage();
      await to('#pill-presage', 700);
      await sleep(1800);
      await click('#save-telemetry', 800);
      await page.waitForSelector('#save-demo[open]');
      await sleep(1500);
      await to('#demo-include-body', 600);
      await sleep(900);
      await click('#demo-save-confirm', 600);
      await sleep(6500);
      await click('#cancel-telemetry', 600);
      await sleep(1200);
      await click('#pill-presage', 800);
      await sleep(2000);
      await click('#pill-presage', 300);
      await sleep(1500);
      // Back to the saved demo: no API from here on.
      await click('#input-demo', 800);
      await page.waitForFunction(
        () => document.querySelector('#pill-source')?.textContent === 'Simulated demo',
      );
      await placeStage();
      await sleep(800);
    } finally {
      const run = settle(runId, (Date.now() - liveStart) / 1000);
      console.log(
        `[presage-budget] ${run.label}: ${run.seconds}s; total ${usedSeconds(readLedger()).toFixed(1)}s`,
      );
    }
    await page.selectOption('#input-demo-pick', { index: 1 });
    await page.waitForFunction(() =>
      /^Saved demo/.test(document.querySelector('#pill-source')?.textContent ?? ''),
    );
    await placeStage();
  }
  mark('live-end');

  // S10 · sending to the meeting, and Help.
  mark('send');
  await page.evaluate(() =>
    document.querySelector('#vcam')?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
  );
  await sleep(900);
  await to('#vcam-status', 700);
  await sleep(1800);
  await to('#obs-option summary', 700);
  await sleep(1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(800);
  await click('#show-help', 800);
  await sleep(1500);
  await click('#start-tour', 700);
  await sleep(2600);
  await click('#tour-next', 500);
  await sleep(2400);
  await page.keyboard.press('Escape');
  await sleep(800);
  mark('send-end');
  await sleep(1000);
} finally {
  clearInterval(sampler);
  for (const r of recs) r.stdin.end('q');
  await sleep(2500);
  writeFileSync(join(out, 'timeline.json'), JSON.stringify({ scale: SCALE, marks, samples }, null, 1));
  await app.close().catch(() => undefined);
  xvfb.kill();
}
console.log(`raw footage and timeline written to ${out}`);
