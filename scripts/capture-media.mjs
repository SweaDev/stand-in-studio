// Captures README/POST media in Demo mode (no camera, no API key, no real person):
// screenshots of the control window, a 2×2 character grid, Auto states and a short
// recording of the scripted meeting on the stage.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/capture-media.mjs
import { _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
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
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 860));
await control.waitForTimeout(500);
await control.screenshot({ path: join(out, 'consent.png') });
await control.click('#consent-demo');
await control.waitForTimeout(4500);

const tile = async (name, w = 640, h = 360) => {
  const url = await control.evaluate(([a, b]) => window.__standin.tile(a, b), [w, h]);
  const file = join(tmp, `${name}.png`);
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  return file;
};
const ff = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);

// 2×2 grid of the four characters (Character mode, mid-breath, smiling).
await control.getByRole('radio', { name: 'Character' }).click();
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
await control.getByRole('radio', { name: 'Auto' }).click();
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
await control.waitForTimeout(12_000);
await control.screenshot({ path: join(out, 'control.png') });
await control.waitForTimeout(18_000);
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
console.log(`media written to ${out}`);
