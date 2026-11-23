// Post-production for the demo video: turns the raw footage from record-demo-video.mjs into
// a ~3-minute 1080p film with title and closing cards, framed app shots with cross-fades,
// a side-by-side of the raw input and the Virtual Stage, Auto lower thirds, burned-in
// subtitles (plus an SRT) and the music from make-music.mjs.
//
//   node scripts/compose-demo-video.mjs --raw <dir> --clip <video> --music <wav> --out <dir>
//                                       [--raw-live <dir>] [--narration <dir> [--reuse 1]]
//
// --narration takes the output folder of narrate-demo-video.mjs (narration.wav and
// captions.json) and writes stand-in-studio-demo-narrated.mp4: the same picture, captions
// that match the voice, and the music ducked under it. --reuse 1 keeps shots already
// rendered in <out>/work.
//
// Shot times are relative to the scene marks in timeline.json (see record-demo-video.mjs).
// The live-analysis shots (live: true) use absolute times in --raw-live, an earlier take
// that included the live scene (default: --raw).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const opts = {};
for (let i = 2; i < process.argv.length; i += 2)
  opts[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
for (const k of ['raw', 'clip', 'music', 'out'])
  if (!opts[k]) throw new Error('usage: --raw <dir> --clip <video> --music <wav> --out <dir>');
const RAW = resolve(opts.raw);
const OUT = resolve(opts.out);
const WORK = join(OUT, 'work');
mkdirSync(WORK, { recursive: true });
const timeline = JSON.parse(readFileSync(join(RAW, 'timeline.json'), 'utf8'));
const CTRL = join(RAW, 'raw-control.mkv');
const STAGE = join(RAW, 'raw-stage.mkv');
const LIVE_CTRL = join(resolve(opts['raw-live'] ?? RAW), 'raw-control.mkv');
const markAt = (name) => {
  const m = timeline.marks.find((x) => x.name === name);
  if (!m) throw new Error(`no mark ${name} in timeline.json`);
  return m.t;
};
const CLIP = resolve(opts.clip);
const ff = (args) =>
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// ---- Layout (1920×1080).
const W = 1920;
const H = 1080;
const MENU = 34; // the native menu bar at the top of the control capture is cropped away
const F = { x: 96, y: 36, w: 1728, h: 942 }; // framed control window (1920×1046 aspect)
const SF = { x: 123, y: 36, w: 1674, h: 942 }; // framed stage (16:9)
const P = { x: 64, y: 262, w: 864, h: 486 }; // side-by-side panels
const P2 = { x: 992, y: 262, w: 864, h: 486 };
const PIP = { x: 1236, y: 604, w: 560, h: 315 }; // stage picture-in-picture
const PIPC = { x: 1236, y: 610, w: 560, h: 305 }; // control picture-in-picture
const ACCENT = '#f2a65a';

// ---- Shots (times are seconds in the raw recordings). Fades are into the shot.
const SHOTS = [
  { id: 'title', type: 'card', card: 'title', dur: 6.5, fade: 0 },
  { id: 'problem', type: 'problem', dur: 10, fade: 0.6 },
  { id: 'start', type: 'ctrl', mark: 'start', at: 0.15, dur: 12.5, fade: 0.6 },
  {
    id: 'status',
    type: 'ctrl',
    mark: 'workspace',
    at: 0.3,
    dur: 5,
    crop: { x: 960, y: MENU, w: 960, h: 523 },
    fade: 0.6,
  },
  { id: 'workspace', type: 'ctrl', mark: 'workspace', at: 5.8, dur: 10, fade: 0.35 },
  {
    id: 'auto',
    type: 'sbs',
    mark: 'auto',
    at: 0.05,
    dur: 41,
    fade: 0.6,
    title: 'Auto mode, on my recorded clip',
    left: ['Your camera', '· raw input'],
  },
  { id: 'controls', type: 'ctrl', mark: 'controls', at: 0.35, dur: 13.5, pip: true, fade: 0.6 },
  { id: 'characters', type: 'stage', mark: 'characters', at: 3.0, dur: 13, fade: 0.6 },
  {
    id: 'anchor',
    type: 'sbs2',
    mark: 'anchor',
    at: 0.8,
    dur: 12,
    crop: { x: 930, y: 220, w: 990, h: 557 },
    fade: 0.35,
    title: 'Sized from your face on screen',
    left: ['Stage tab', '· Follow my face'],
  },
  {
    id: 'lip',
    type: 'sbs2',
    mark: 'lip',
    at: 5,
    dur: 13.5,
    crop: { x: 1200, y: 500, w: 720, h: 405 },
    fade: 0.6,
    title: 'Accessibility: lip-reading zoom',
    left: ['Stage tab', '· Accessibility'],
  },
  { id: 'interface', type: 'ctrl', mark: 'intents', at: 0.45, dur: 5.5, speed: 2, fade: 0.6 },
  { id: 'builder', type: 'ctrl', mark: 'intents', at: 23.45, dur: 5.5, speed: 2.5, fade: 0.35 },
  { id: 'live', type: 'ctrl', live: true, start: 187, dur: 5, fade: 0.6 },
  {
    id: 'consent',
    type: 'ctrl',
    live: true,
    start: 196,
    dur: 5,
    crop: { x: 390, y: 240, w: 1120, h: 610 },
    fade: 0.35,
  },
  {
    id: 'saving',
    type: 'ctrl',
    live: true,
    start: 209,
    dur: 5,
    crop: { x: 360, y: 520, w: 960, h: 523 },
    fade: 0.35,
  },
  {
    id: 'presageOff',
    type: 'ctrl',
    live: true,
    start: 222,
    dur: 5,
    crop: { x: 1040, y: 560, w: 880, h: 480 },
    fade: 0.35,
  },
  { id: 'send', type: 'ctrl', mark: 'send', at: 0, dur: 5, fade: 0.6 },
  { id: 'help', type: 'ctrl', mark: 'send', at: 11, dur: 6, speed: 1.25, fade: 0.35 },
  { id: 'closing', type: 'card', card: 'closing', dur: 8, fade: 0.6 },
];
for (const s of SHOTS) if (s.mark) s.start = +(markAt(s.mark) + s.at).toFixed(2);

// Subtitles per shot: [from, to, text] in seconds from the shot's start.
const SUBS = {
  problem: [
    [0.5, 4.6, 'Video calls ask us to be on camera, and watched, for hours.'],
    [4.8, 9.6, 'Turn the camera off, and every nod and smile is lost.'],
  ],
  start: [
    [0.3, 4.2, 'Stand-In Studio adds a dial between camera on and camera off.'],
    [4.4, 8.2, 'The start screen says plainly what is read, sent and stored.'],
    [8.4, 12.2, 'Here I replay a saved demo: my own clip, with the signals Presage read from it.'],
  ],
  status: [[0.2, 4.8, 'The status bar shows the input, what Presage reads, and the Stand-In Camera.']],
  workspace: [
    [0.2, 5.0, 'The big preview is the raw input. The inset is what the meeting sees.'],
    [5.2, 9.8, 'The dial shows how much of you is visible, right now.'],
  ],
  auto: [
    [0.4, 6.0, 'Auto mode moves the dial for you, from what Presage sees.'],
    [6.4, 12.6, 'Listening: the lantern sits over my face, its opacity mirroring the dial.'],
    [13.2, 21.4, 'Turning to talk to someone off camera: the lantern covers me completely.'],
    [22.6, 29.4, 'Talking to the meeting: Stand-In reveals me, after a short hold.'],
    [29.8, 35.4, 'Body signals can only lower how much of me is shown, never raise it.'],
    [35.8, 40.6, 'Every intent is mine to change, reorder or tune.'],
  ],
  controls: [
    [0.3, 4.2, 'Hide me covers you instantly, with one click…'],
    [4.4, 8.2, '…or a global hotkey that works while your meeting app has focus.'],
    [8.5, 13.2, 'Or pick a mode yourself: Character, Camera, Blend or Auto.'],
  ],
  characters: [
    [0.3, 6.2, 'Hand-drawn characters mirror your nods, blinks, breathing and smiles.'],
    [6.5, 12.6, 'Each one follows your face, using the face position Presage reads.'],
  ],
  anchor: [
    [0.3, 6.0, 'Its size comes from your face on screen: 100% covers it, and you can go smaller.'],
    [6.2, 11.6, 'Nudge it up, down or sideways, and cap its opacity over your face.'],
  ],
  lip: [
    [0.3, 6.4, 'New accessibility option: lip-reading zoom, off by default.'],
    [6.7, 13.2, 'While I talk, Auto shows my face at 100%, zoomed in, so people can read my lips.'],
  ],
  interface: [[0.3, 5.2, 'Advanced → Interface shows the intent list when you need it.']],
  builder: [[0.2, 5.2, 'The intent builder turns Presage signals into your own rules.']],
  live: [[0.2, 4.8, 'With an API key, a video file is analysed live by Presage, just like a webcam.']],
  consent: [[0.2, 4.8, 'Saving a demo asks first, every time. Pulse and breathing stay off by default.']],
  saving: [[0.2, 4.8, 'The clip plays once while its signals are saved on this computer.']],
  presageOff: [[0.2, 4.8, 'Presage can be turned off at any moment: then nothing is analysed.']],
  send: [[0.2, 4.8, 'On Linux, the Stand-In Camera shows up in Meet, Zoom or Teams. OBS works everywhere.']],
  help: [
    [0.2, 2.9, 'Help lists every shortcut, with a one-minute tour.'],
    [3.1, 5.8, 'Frames are processed on this computer. Numbers never leave it.'],
  ],
};

const ACTION = {
  listening: 'Blend',
  talkingInMeeting: 'Reveal me',
  talkingToOther: 'Cover me',
  turnedAway: 'Cover me',
  lookingElsewhere: 'Cover me',
  away: 'Back soon',
  someoneElse: 'Cover me',
  eating: 'Cover me',
};

// ---- 1. Cards, backdrops, masks and overlays, rendered from HTML.
const BASE = `*{box-sizing:border-box;margin:0}body{width:${W}px;height:${H}px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#f4efe6;-webkit-font-smoothing:antialiased}`;
const BG = `background:radial-gradient(900px 600px at 12% 0%,rgba(242,166,90,.16),transparent 70%),radial-gradient(900px 700px at 100% 100%,rgba(199,166,255,.12),transparent 70%),linear-gradient(160deg,#1b1820,#121016)`;
const MARK = (s) =>
  `<div style="width:${s}px;height:${s}px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffe2b8 0 18%,transparent 19%),conic-gradient(from 210deg,${ACCENT} 0 58%,#6d6477 58% 100%);box-shadow:0 0 0 ${s / 12}px #28242e"></div>`;
const box = (r, extra = '') =>
  `<div style="position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;${extra}"></div>`;
const label = (x, y, text, sub = '') =>
  `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;gap:12px;align-items:center;font-size:26px;font-weight:700"><span style="width:10px;height:10px;border-radius:50%;background:${ACCENT}"></span>${text}<span style="font-weight:500;color:#bdb4a7">${sub}</span></div>`;
const ring = (r, rad, text) =>
  `<div style="position:absolute;left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w + 6}px;height:${r.h + 6}px;border-radius:${rad + 3}px;border:3px solid rgba(242,166,90,.85);box-shadow:0 18px 50px rgba(0,0,0,.6)"></div><div style="position:absolute;left:${r.x}px;top:${r.y - 40}px;font:700 20px Inter;padding:4px 12px;border-radius:999px;background:rgba(22,20,26,.92);border:1px solid rgba(242,166,90,.6)">${text}</div>`;
const shadow = (r, rad) =>
  box(
    r,
    `border-radius:${rad}px;background:#000;box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08)`,
  );
const ASSETS = {
  'title.png': `<body style="${BG};display:grid;place-items:center"><div style="display:flex;flex-direction:column;align-items:center;gap:30px">${MARK(150)}<div style="font-size:120px;font-weight:800;letter-spacing:-.02em">Stand-In Studio</div><div style="font-size:44px;color:#bdb4a7">A presence dial for video calls</div><div style="margin-top:40px;font-size:26px;color:#a69eae;letter-spacing:.06em;text-transform:uppercase">Built with the Presage SmartSpectra SDK</div></div></body>`,
  'closing.png': `<body style="${BG};display:grid;place-items:center"><div style="display:flex;flex-direction:column;align-items:center;gap:34px;text-align:center">${MARK(96)}<div style="font-size:62px;font-weight:800;line-height:1.2;max-width:1400px">Your body can only make Stand-In<br>show <span style="color:${ACCENT}">less</span> of you, never more.</div><div style="font-size:34px;color:#bdb4a7">Numbers never leave your computer.</div><div style="margin-top:30px;font-size:34px;font-weight:700;color:${ACCENT}">github.com/SweaDev/stand-in-studio</div><div style="font-size:22px;color:#a69eae">Stand-In Studio · Presage SmartSpectra SDK Challenge · Music: original, generated in code</div></div></body>`,
  'bg-frame.png': `<body style="${BG}">${shadow(F, 18)}</body>`,
  'bg-stage.png': `<body style="${BG}">${shadow(SF, 18)}</body>`,
  'bg-problem.png': `<body style="${BG}"><div style="position:absolute;left:0;right:0;top:110px;text-align:center;font-size:44px;font-weight:800">Video calls today: all or nothing</div>${box(P, 'border-radius:16px;background:#0c0b0e;box-shadow:0 30px 80px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08);display:grid;place-items:center')}<svg style="position:absolute;left:${P.x + P.w / 2 - 60}px;top:${P.y + P.h / 2 - 80}px" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#4f4858" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M9 5h6l2 2h4v10M21 19H3V7h3M10 10.5a3 3 0 0 0 4 4"/></svg>${shadow(P2, 16)}</body>`,
  'ov-problem.png': `<body style="background:transparent">${label(P.x, P.y + P.h + 24, 'Camera off', '· every nod and smile lost')}${label(P2.x, P2.y + P2.h + 24, 'Camera on', '· watched, for hours')}</body>`,
  'ov-pip-stage.png': `<body style="background:transparent">${ring(PIP, 14, 'Virtual Stage · what the meeting sees')}</body>`,
  'ov-pip-control.png': `<body style="background:transparent">${ring(PIPC, 14, 'Control window')}</body>`,
};
for (const s of SHOTS)
  if (s.type === 'sbs' || s.type === 'sbs2')
    ASSETS[`bg-sbs-${s.id}.png`] =
      `<body style="${BG}"><div style="position:absolute;left:0;right:0;top:110px;text-align:center;font-size:44px;font-weight:800">${s.title}</div>${shadow(P, 16)}${shadow(P2, 16)}${label(P.x, P.y - 52, s.left[0], s.left[1])}${label(P2.x, P2.y - 52, 'What the meeting sees', '· Virtual Stage')}</body>`;
const MASKS = {
  'mask-frame.png': [F.w, F.h, 18],
  'mask-stage.png': [SF.w, SF.h, 18],
  'mask-panel.png': [P.w, P.h, 16],
  'mask-pip.png': [PIP.w, PIP.h, 14],
  'mask-pipc.png': [PIPC.w, PIPC.h, 14],
};
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [name, html] of Object.entries(ASSETS)) {
    await page.setContent(`<style>${BASE}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(WORK, name), omitBackground: name.startsWith('ov-') });
  }
  for (const [name, [w, h, r]] of Object.entries(MASKS)) {
    const p2 = await browser.newPage({ viewport: { width: w, height: h } });
    await p2.setContent(
      `<body style="margin:0;background:#000"><div style="width:${w}px;height:${h}px;border-radius:${r}px;background:#fff"></div></body>`,
    );
    await p2.screenshot({ path: join(WORK, name) });
    await p2.close();
  }
  await browser.close();
}

// ---- 2. One file per shot.
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', '30', '-an'];
const img = (name) => ['-loop', '1', '-framerate', '30', '-i', join(WORK, name)];
const clipAt = (file, start, dur, speed = 1) => ['-ss', String(start), '-t', String(dur * speed), '-i', file];
const framed = (src, r, mask, extraIn = '') =>
  `[${src}]${extraIn}scale=${r.w}:${r.h}:flags=lanczos,format=rgba[s${src}];[${mask}]format=gray,scale=${r.w}:${r.h}[m${src}];[s${src}][m${src}]alphamerge[a${src}]`;

function renderShot(s, i) {
  const out = join(WORK, `shot-${String(i).padStart(2, '0')}-${s.id}.mp4`);
  if (opts.reuse === '1' && existsSync(out)) return out;
  const speed = s.speed ?? 1;
  const pts = speed === 1 ? '' : `setpts=PTS/${speed},`;
  let inputs;
  let graph;
  if (s.type === 'card') {
    inputs = ['-loop', '1', '-framerate', '30', '-i', join(WORK, `${s.card}.png`)];
    const frames = Math.round(s.dur * 30);
    graph = `[0]scale=2880:1620,zoompan=z='1+0.035*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30[v]`;
  } else if (s.type === 'problem') {
    inputs = [
      ...img('bg-problem.png'),
      ...clipAt(CLIP, 47, s.dur),
      ...img('mask-panel.png'),
      ...img('ov-problem.png'),
    ];
    graph = `${framed(1, P2, 2)};[0][a1]overlay=${P2.x}:${P2.y}[b];[b][3]overlay=0:0[v]`;
  } else if (s.type === 'ctrl') {
    const c = s.crop ?? { x: 0, y: MENU, w: 1920, h: 1046 };
    inputs = [
      ...img('bg-frame.png'),
      ...clipAt(s.live ? LIVE_CTRL : CTRL, s.start, s.dur, speed),
      ...img('mask-frame.png'),
    ];
    graph = `${framed(1, F, 2, `${pts}crop=${c.w}:${c.h}:${c.x}:${c.y},`)};[0][a1]overlay=${F.x}:${F.y}[b]`;
    if (s.pip) {
      inputs.push(
        ...clipAt(STAGE, s.start, s.dur, speed),
        ...img('mask-pip.png'),
        ...img('ov-pip-stage.png'),
      );
      graph += `;${framed(3, PIP, 4, pts)};[b][a3]overlay=${PIP.x}:${PIP.y}[b2];[b2][5]overlay=0:0[v]`;
    } else graph += ';[b]null[v]';
  } else if (s.type === 'stage') {
    inputs = [
      ...img('bg-stage.png'),
      ...clipAt(STAGE, s.start, s.dur),
      ...img('mask-stage.png'),
      ...clipAt(CTRL, s.start, s.dur),
      ...img('mask-pipc.png'),
      ...img('ov-pip-control.png'),
    ];
    graph = `${framed(1, SF, 2)};[0][a1]overlay=${SF.x}:${SF.y}[b];${framed(3, PIPC, 4, `crop=1920:1046:0:${MENU},`)};[b][a3]overlay=${PIPC.x}:${PIPC.y}[b2];[b2][5]overlay=0:0[v]`;
  } else if (s.type === 'sbs') {
    // The clip's media time ran at the recording's pace: media ms ≈ (t − offset) × 1000.
    const near = timeline.samples.filter((x) => x.t >= s.start && x.ms >= 0)[0];
    const clipStart = near.ms / 1000 - (near.t - s.start);
    inputs = [
      ...img(`bg-sbs-${s.id}.png`),
      ...clipAt(CLIP, clipStart, s.dur),
      ...img('mask-panel.png'),
      ...clipAt(STAGE, s.start, s.dur),
      ...img('mask-panel.png'),
    ];
    graph = `${framed(1, P, 2)};[0][a1]overlay=${P.x}:${P.y}[b];${framed(3, P2, 4)};[b][a3]overlay=${P2.x}:${P2.y}[v]`;
  } else if (s.type === 'sbs2') {
    // A region of the control window (left) beside the Virtual Stage (right).
    const c = s.crop;
    inputs = [
      ...img(`bg-sbs-${s.id}.png`),
      ...clipAt(CTRL, s.start, s.dur),
      ...img('mask-panel.png'),
      ...clipAt(STAGE, s.start, s.dur),
      ...img('mask-panel.png'),
    ];
    graph = `${framed(1, P, 2, `crop=${c.w}:${c.h}:${c.x}:${c.y},`)};[0][a1]overlay=${P.x}:${P.y}[b];${framed(3, P2, 4)};[b][a3]overlay=${P2.x}:${P2.y}[v]`;
  }
  ff([...inputs, '-filter_complex', graph, '-map', '[v]', '-t', String(s.dur), ...ENC, out]);
  return out;
}
const files = SHOTS.map((s, i) => {
  process.stdout.write(`shot ${i + 1}/${SHOTS.length} ${s.id}\n`);
  return renderShot(s, i);
});

// ---- 3. Timing: each shot starts where the previous ends minus the fade into it.
let t = 0;
const starts = SHOTS.map((s, i) => {
  if (i > 0) t -= s.fade;
  const at = t;
  t += s.dur;
  return at;
});
const TOTAL = t;

// ---- 4. Subtitles (ASS for burning, SRT for uploads) and Auto lower thirds.
const ts = (x) => {
  const cs = Math.round(x * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor(cs / 6000) % 60;
  const sec = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const srtTs = (x) =>
  ts(x)
    .replace(/^(\d+):/, (_, h) => `${String(h).padStart(2, '0')}:`)
    .replace('.', ',') + '0';
const subs = [];
SHOTS.forEach((s, i) => {
  for (const [a, b, text] of SUBS[s.id] ?? []) subs.push({ from: starts[i] + a, to: starts[i] + b, text });
});
const lower = [];
{
  const i = SHOTS.findIndex((s) => s.type === 'sbs');
  const s = SHOTS[i];
  const seg = [];
  for (const x of timeline.samples) {
    if (x.t < s.start || x.t > s.start + s.dur || !x.id) continue;
    const last = seg.at(-1);
    if (last && last.id === x.id) last.to = x.t;
    else seg.push({ id: x.id, name: x.intent, from: x.t, to: x.t });
  }
  // Fold flickers (< 1.4 s) into the intent before them, so the label reads calmly.
  const calm = [];
  for (const g of seg) {
    const prev = calm.at(-1);
    if (prev && (g.to - g.from < 1.4 || prev.id === g.id)) prev.to = g.to;
    else calm.push({ ...g });
  }
  for (const g of calm)
    lower.push({
      from: starts[i] + Math.max(0.5, g.from - s.start),
      to: starts[i] + Math.min(s.dur - 0.3, g.to - s.start + 0.2),
      name: g.name,
      action: ACTION[g.id] ?? '',
    });
}
const assHead = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter,38,&H00FFFFFF,&H00FFFFFF,&H2A1A1416,&H2A1A1416,0,0,0,0,100,100,0,0,3,14,0,2,120,120,26,1
Style: Lower,Inter,40,&H00FFFFFF,&H00FFFFFF,&H1A1A1416,&H1A1A1416,1,0,0,0,100,100,0,0,3,16,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const esc = (x) => x.replace(/\{/g, '(').replace(/\}/g, ')');
const subLines = subs.map((x) => `Dialogue: 0,${ts(x.from)},${ts(x.to)},Sub,,0,0,0,,${esc(x.text)}`);
const lowerLines = lower.map(
  (x) =>
    `Dialogue: 1,${ts(x.from)},${ts(x.to)},Lower,,0,0,0,,{\\pos(${P2.x + P2.w / 2},${P2.y + P2.h + 64})\\fad(200,200)}{\\c&H5AA6F2&}Auto · {\\c&HFFFFFF&}${esc(x.name)}{\\c&HA7B4BD&\\b0}  →  ${esc(x.action)}`,
);
writeFileSync(join(WORK, 'full.ass'), assHead + [...lowerLines, ...subLines].join('\n') + '\n');
writeFileSync(join(WORK, 'clean.ass'), assHead + lowerLines.join('\n') + '\n');
writeFileSync(
  join(OUT, 'stand-in-studio-demo.srt'),
  subs.map((x, i) => `${i + 1}\n${srtTs(x.from)} --> ${srtTs(x.to)}\n${x.text}\n`).join('\n'),
);

// ---- 5. Cross-fade the shots, burn the subtitles, add the music.
const xf = [];
let last = '0:v';
let len = SHOTS[0].dur;
for (let i = 1; i < SHOTS.length; i++) {
  const d = SHOTS[i].fade;
  const label = `x${i}`;
  xf.push(`[${last}][${i}:v]xfade=transition=fade:duration=${d}:offset=${(len - d).toFixed(3)}[${label}]`);
  last = label;
  len += SHOTS[i].dur - d;
}
const audioIn = files.length;
const music = `[${audioIn}:a]highpass=f=30,atrim=0:${TOTAL.toFixed(2)},afade=t=in:d=1.5,afade=t=out:st=${(TOTAL - 5).toFixed(2)}:d=5,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000[a]`;
const fontsdir = '/usr/share/fonts/opentype/inter';
const outputs = [
  { name: 'stand-in-studio-demo.mp4', ass: 'full.ass', audio: music, extra: [] },
  { name: 'stand-in-studio-demo-clean.mp4', ass: 'clean.ass', audio: music, extra: [] },
];
if (opts.narration) {
  // Captions that match the voice, plus the Auto lower thirds.
  const dir = resolve(opts.narration);
  const captions = JSON.parse(readFileSync(join(dir, 'captions.json'), 'utf8'));
  const lines = captions.map((c) => `Dialogue: 0,${ts(c.from)},${ts(c.to)},Sub,,0,0,0,,${esc(c.text)}`);
  writeFileSync(join(WORK, 'narrated.ass'), assHead + [...lowerLines, ...lines].join('\n') + '\n');
  // Music lower overall, and ducked further under the voice (side-chain), then the mix
  // normalised to -16 LUFS.
  const T = TOTAL.toFixed(2);
  const ducked =
    `[${audioIn}:a]highpass=f=30,atrim=0:${T},afade=t=in:d=1.5,afade=t=out:st=${(TOTAL - 5).toFixed(2)}:d=5,volume=-14dB[m];` +
    `[${audioIn + 1}:a]atrim=0:${T},asplit=2[v1][v2];` +
    `[m][v2]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=500[md];` +
    `[md][v1]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`;
  outputs.length = 0;
  outputs.push({
    name: 'stand-in-studio-demo-narrated.mp4',
    ass: 'narrated.ass',
    audio: ducked,
    extra: ['-i', join(dir, 'narration.wav')],
  });
}
for (const o of outputs) {
  const graph = `${xf.join(';')};[${last}]subtitles=${join(WORK, o.ass)}:fontsdir=${fontsdir},fade=t=out:st=${(TOTAL - 1).toFixed(2)}:d=1[v];${o.audio}`;
  ff([
    ...files.flatMap((f) => ['-i', f]),
    '-i',
    resolve(opts.music),
    ...o.extra,
    '-filter_complex',
    graph,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-t',
    TOTAL.toFixed(2),
    join(OUT, o.name),
  ]);
}
writeFileSync(
  join(OUT, 'shots.json'),
  JSON.stringify(
    SHOTS.map((s, i) => ({ id: s.id, at: +starts[i].toFixed(2), dur: s.dur })),
    null,
    1,
  ),
);
console.log(`demo video: ${TOTAL.toFixed(1)} s → ${OUT}`);
