// Captures README/POST media in Demo mode (no camera, no API key, no real person):
// screenshots of the control window, a 2×2 character grid, Auto states, the intent
// builder, the developer decision log, a step of the tour, the recorded-clip view and a short recording of the
// scripted meeting. The recorded-clip view plays a clip of Demo mode's simulated sample feed
// (made here, never kept) with the e2e fake SDK, so no Presage contact and no real person.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/capture-media.mjs [--demo <bundle.zip> --clip <video>]
//
// With --demo, the start screen, control window, Camera tab, tour, Auto states, builder,
// decision log and recorded-clip shots are re-taken on that saved demo (offline replay, no
// API) and its video; the characters grid and the scripted-meeting recording stay on the
// simulated person.
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cli = {};
for (let i = 2; i < process.argv.length; i += 2)
  cli[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'media');
const tmp = mkdtempSync(join(tmpdir(), 'standin-media-'));
mkdirSync(out, { recursive: true });

const app = await electron.launch({
  executablePath: require('electron'),
  args: [root, '--no-sandbox', `--user-data-dir=${join(tmp, 'profile')}`],
  env: { ...process.env, STANDIN_E2E: '1', PRESAGE_API_KEY: '' },
  recordVideo: { dir: join(tmp, 'video'), size: { width: 1280, height: 720 } },
});
const control = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
await control.waitForTimeout(500);
await control.screenshot({ path: join(out, 'consent.png') });
await control.click('#consent-demo');
await control.waitForTimeout(4500);
// The default (essentials) window, plus the intent list the post describes.
await control.evaluate(() => window.__standin.app.updateSettings({ ui: { intents: true } }));

const tile = async (name, w = 640, h = 360) => {
  const url = await control.evaluate(([a, b]) => window.__standin.tile(a, b), [w, h]);
  const file = join(tmp, `${name}.png`);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
};
const ff = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

// 2×2 grid of the four characters (Character mode, mid-breath, smiling).
await control.locator('.mode-switch').getByRole('radio', { name: 'Character' }).click();
const tiles = [];
for (const id of ['lantern', 'houseplant', 'cat', 'cloud']) {
  await control.evaluate((c) => window.__standin.setCharacter(c), id);
  await control.keyboard.press('h');
  await control.waitForTimeout(900);
  tiles.push(await tile(`char-${id}`));
}
ff(
  ...tiles.flatMap((t) => ['-i', t]),
  '-filter_complex',
  '[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0',
  join(out, 'characters.png'),
);

// Auto states with the lantern: listening, speaking, looking away.
await control.evaluate(() => window.__standin.setCharacter('lantern'));
await control.locator('.mode-switch').getByRole('radio', { name: 'Auto' }).click();
await control.waitForTimeout(3500);
const listening = await tile('auto-listening');
await control.keyboard.down('t');
await control.waitForTimeout(5500);
const speaking = await tile('auto-speaking');
await control.keyboard.up('t');
await control.keyboard.press('a');
await control.waitForTimeout(6000);
const away = await tile('auto-away');
await control.keyboard.press('a');
ff(
  '-i',
  listening,
  '-i',
  speaking,
  '-i',
  away,
  '-filter_complex',
  'hstack=inputs=3',
  join(out, 'auto-states.png'),
);

// Control window with the scripted meeting running, then record the stage for 30 s.
await control.waitForTimeout(3000);
await control.click('#script');
await control.waitForTimeout(6_000);
// Record 6 s of the simulated sample feed for the recorded-clip screenshot below.
const clipB64 = await control.evaluate(async () => {
  const canvas = window.__standin.app.demo.frame().image;
  const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8' });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start();
  await new Promise((r) => setTimeout(r, 6_000));
  rec.stop();
  await done;
  const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
});
const clipFile = join(tmp, 'sample-feed.webm');
writeFileSync(clipFile, Buffer.from(clipB64, 'base64'));
const toTop = (page) =>
  page.evaluate(() => {
    for (const el of [document.scrollingElement, ...document.querySelectorAll('*')])
      if (el?.scrollTop) el.scrollTop = 0;
  });
await toTop(control);
await control.waitForTimeout(300);
await control.screenshot({ path: join(out, 'control.png') });

// The interactive tour, on its status-bar step.
await control.evaluate(() => window.__standin.app.startTour());
await control.waitForTimeout(600);
await control.screenshot({ path: join(out, 'tour.png') });
await control.keyboard.press('Escape');
await toTop(control);

// Intent builder (Advanced → Create custom intent) with a half-built intent.
await control.click('#tab-advanced');
await control.click('#create-intent');
await control.fill('#intent-name', 'Checking my phone');
await control.click('#add-headTilt');
await control.click('#add-talking');
await control.locator('[data-signal="talking"] [data-state="yes"]').click();
await control.locator('[data-signal="talking"] [data-state="no"]').click();
await control.waitForTimeout(800);
await control.screenshot({ path: join(out, 'builder.png') });
await control.click('#builder-cancel');

// Developer mode decision log.
await control.check('#developer-mode');
await control.evaluate(() => document.activeElement?.blur());
await control.waitForTimeout(4_000);
await control.locator('#devlog').scrollIntoViewIfNeeded();
await control.locator('#devlog').screenshot({ path: join(out, 'devlog.png') });
await control.click('#tab-auto');
await control.waitForTimeout(2_000);
const stage = app.windows().find((p) => p !== control);
const videoPath = await stage?.video()?.path();
await app.close();

if (videoPath) {
  // Last ~30 s of the stage recording (the scripted meeting), small enough for the repo.
  ff(
    '-sseof',
    '-30',
    '-i',
    videoPath,
    '-vf',
    'scale=640:360,fps=20',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '350k',
    '-an',
    join(out, 'demo.webm'),
  );
  ff(
    '-sseof',
    '-30',
    '-i',
    videoPath,
    '-vf',
    'scale=480:270,fps=10',
    '-frames:v',
    '1',
    join(out, 'stage-frame.png'),
  );
}
// Recorded-clip view: Live input preview, Virtual Stage inset, transport and the Save-as-demo card.
const app2 = await electron.launch({
  executablePath: require('electron'),
  args: [root, '--no-sandbox', `--user-data-dir=${join(tmp, 'profile2')}`],
  env: { ...process.env, STANDIN_E2E: '1', STANDIN_FAKE_SDK: '1', PRESAGE_API_KEY: 'media-dummy-key' },
});
const c2 = await app2.firstWindow();
await app2.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
await c2.setInputFiles('#consent-clip-file', cli.clip ? cli.clip : clipFile);
await c2.waitForSelector('#clip-play');
await c2.locator('.mode-switch').getByRole('radio', { name: 'Blend' }).click();
await c2.waitForTimeout(2_500);
await toTop(c2);
const top = await c2.locator('.preview').boundingBox();
const bottom = await c2.locator('.transport').boundingBox();
const pad = 12;
await c2.screenshot({
  path: join(out, 'recorded.png'),
  clip: { x: top.x, y: top.y, width: top.width, height: bottom.y + bottom.height + pad - top.y },
});
await app2.close();

if (cli.demo) {
  // ---- The same shots on a saved demo of a real person (offline replay: no API).
  const launch3 = () =>
    electron.launch({
      executablePath: require('electron'),
      args: [root, '--no-sandbox', `--user-data-dir=${join(tmp, 'profile3')}`],
      env: { ...process.env, STANDIN_E2E: '1', PRESAGE_API_KEY: '' },
    });
  let app3 = await launch3();
  let c3 = await app3.firstWindow();
  await c3.click('#consent-demo');
  await c3.click('#tab-advanced');
  await c3.setInputFiles('#demo-import-bundle', cli.demo);
  await c3.click('#demo-import-bundle-btn');
  await c3.waitForFunction(() =>
    /Imported/.test(document.querySelector('#demo-library-status')?.textContent ?? ''),
  );
  const id = await c3.evaluate(async () => (await window.studio.demos.list()).demos[0].id);
  await c3.evaluate((lastDemo) => window.studio.setSettings({ recorded: { lastDemo }, mode: 'auto' }), id);
  await app3.close();
  app3 = await launch3();
  c3 = await app3.firstWindow();
  await app3.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  await c3.waitForTimeout(700);
  await c3.screenshot({ path: join(out, 'consent.png') });
  await c3.click('#consent-demo');
  await c3.waitForSelector('#clip-play');
  const at = async (ms, settle) => {
    await c3.evaluate((m) => window.__standin.app.clip.seek(m), ms);
    await c3.waitForTimeout(settle);
  };
  const tile3 = async (name) => {
    const url = await c3.evaluate(() => window.__standin.tile(640, 360));
    const file = join(tmp, `${name}.png`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    return file;
  };
  // Auto on the clip: listening (blend), turned to the side (covered), talking (revealed).
  await at(22_000, 8_000);
  const s1 = await tile3('demo-listening');
  await at(38_000, 7_000);
  const s2 = await tile3('demo-turned');
  await at(49_500, 7_500);
  const s3 = await tile3('demo-talking');
  ff('-i', s1, '-i', s2, '-i', s3, '-filter_complex', 'hstack=inputs=3', join(out, 'auto-states.png'));
  // Control window, talking in the meeting, with the intent list shown.
  await c3.evaluate(() => window.__standin.app.updateSettings({ ui: { intents: true } }));
  await at(50_000, 6_500);
  await toTop(c3);
  await c3.screenshot({ path: join(out, 'control.png') });
  await c3.evaluate(() => window.__standin.app.startTour());
  await c3.waitForTimeout(600);
  await c3.screenshot({ path: join(out, 'tour.png') });
  await c3.keyboard.press('Escape');
  await toTop(c3);
  await c3.click('#tab-camera');
  await c3.waitForTimeout(500);
  await c3.locator('.settings').screenshot({ path: join(out, 'camera-tab.png') });
  await c3.click('#tab-advanced');
  await c3.click('#create-intent');
  await c3.fill('#intent-name', 'Checking my phone');
  await c3.click('#add-headTilt');
  await c3.click('#add-talking');
  await c3.locator('[data-signal="talking"] [data-state="yes"]').click();
  await c3.locator('[data-signal="talking"] [data-state="no"]').click();
  await c3.waitForTimeout(800);
  await c3.screenshot({ path: join(out, 'builder.png') });
  await c3.click('#builder-cancel');
  await c3.check('#developer-mode');
  await c3.evaluate(() => document.activeElement?.blur());
  await at(49_000, 4_000);
  await c3.locator('#devlog').scrollIntoViewIfNeeded();
  await c3.locator('#devlog').screenshot({ path: join(out, 'devlog.png') });
  await app3.close();
}
rmSync(tmp, { recursive: true, force: true });
console.log(`media written to ${out}`);
