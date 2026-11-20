// Live SDK spike (T06): runs the main-process SmartSpectra SDK on the test clip
// (file input) to learn the exact shape of decoded metrics. It prints field names,
// counts, landmark layout, validation codes and timing: never physiological values.
//
//   PRESAGE_API_KEY=... node scripts/live-probe.mjs [seconds=40]
//
// Budget-guarded: charges max(wall time, content seconds) to .presage-usage.json.
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reserve, settle, readLedger, usedSeconds } from './presage-budget.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clip = process.env.STANDIN_PROBE_VIDEO ?? join(root, 'test-assets', 'face.mp4');
const contentSeconds = Math.min(60, Number(process.argv[2] ?? 40));
const apiKey = process.env.PRESAGE_API_KEY;

if (!apiKey) throw new Error('PRESAGE_API_KEY is not set');
if (!existsSync(clip)) throw new Error(`missing ${clip}; run scripts/fetch-test-video.sh`);

const sdkMod = require('@smartspectra/node-sdk');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');
const {
  SmartSpectraSDK,
  faceMetrics,
  breathingMetrics,
  cardioMetrics,
  ValidationCode,
  SmartSpectraErrorCode,
} = sdkMod;
const codeName = (table, v) => Object.keys(table).find((k) => table[k] === v) ?? String(v);

const stats = {
  sdkVersion: SmartSpectraSDK.version,
  clip: clip.replace(root + '/', ''),
  contentSeconds,
  packets: 0,
  firstPacketAfterMs: null,
  fields: {},
  landmarkPointCounts: {},
  landmarkSample: null,
  landmarkCoordRange: { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  expressionTypes: {},
  blinkingDetected: 0,
  talkingDetected: 0,
  validation: {},
  errors: [],
  processingStatus: [],
};

function noteField(path, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return;
  const f = (stats.fields[path] ??= { packetsWithData: 0, samples: 0, keys: new Set() });
  f.packetsWithData++;
  f.samples += arr.length;
  for (const k of Object.keys(arr[0].toJSON ? arr[0].toJSON() : arr[0])) f.keys.add(k);
}

function onMetrics(buf) {
  const t = Date.now() - started;
  stats.packets++;
  stats.firstPacketAfterMs ??= t;
  const m = decodeMetrics(buf);
  const b = m.breathing ?? {};
  const c = m.cardio ?? {};
  const f = m.face ?? {};
  for (const [k, v] of Object.entries({
    ...prefix('breathing', b),
    ...prefix('cardio', c),
    ...prefix('face', f),
  }))
    noteField(k, v);
  for (const lm of f.landmarks ?? []) {
    const n = lm.value?.length ?? 0;
    stats.landmarkPointCounts[n] = (stats.landmarkPointCounts[n] ?? 0) + 1;
    if (!stats.landmarkSample && n > 0) stats.landmarkSample = lm.value.map((p) => [p.x, p.y]);
    for (const p of lm.value ?? []) {
      const r = stats.landmarkCoordRange;
      r.minX = Math.min(r.minX, p.x);
      r.maxX = Math.max(r.maxX, p.x);
      r.minY = Math.min(r.minY, p.y);
      r.maxY = Math.max(r.maxY, p.y);
    }
  }
  for (const e of f.expression ?? [])
    for (const s of e.scores ?? []) stats.expressionTypes[s.type] = (stats.expressionTypes[s.type] ?? 0) + 1;
  stats.blinkingDetected += (f.blinking ?? []).filter((x) => x.detected).length;
  stats.talkingDetected += (f.talking ?? []).filter((x) => x.detected).length;
}

function prefix(name, obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (Array.isArray(v)) out[`${name}.${k}`] = v;
  return out;
}

const runId = reserve('T06 live-probe (file input)', 60);
let started = Date.now();
const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...faceMetrics, ...breathingMetrics, ...cardioMetrics],
  enableTelemetry: false,
});
sdk.on('metrics', onMetrics);
sdk.on('validationStatus', (code, _ts, hint) => {
  const k = `${codeName(ValidationCode, code)}${hint ? ` (${hint})` : ''}`;
  stats.validation[k] = (stats.validation[k] ?? 0) + 1;
});
sdk.on('error', (code, message, retryable) =>
  stats.errors.push({ code: codeName(SmartSpectraErrorCode, code), message, retryable }),
);

const { ProcessingStatus } = sdkMod;
let wall;
try {
  sdk.useFile(clip, { interframeDelayMs: 33, maxDurationMs: contentSeconds * 1000 });
  // waitUntilComplete() blocks the event loop (and with it the metrics callbacks),
  // so wait asynchronously for the pipeline to return to idle, with a hard deadline.
  const finished = new Promise((resolve) => {
    let running = false;
    sdk.on('processingStatus', (s) => {
      stats.processingStatus.push(codeName(ProcessingStatus, s));
      if (s === ProcessingStatus.kRunning) running = true;
      if (running && (s === ProcessingStatus.kIdle || s === ProcessingStatus.kError)) resolve('completed');
    });
    setTimeout(() => resolve('deadline'), (contentSeconds + 12) * 1000);
  });
  started = Date.now();
  sdk.start();
  stats.completed = await finished;
  await sdk.stopAsync().catch(() => {});
} finally {
  wall = (Date.now() - started) / 1000;
  await sdk.destroy().catch(() => {});
  settle(runId, Math.max(wall, contentSeconds));
}

stats.wallSeconds = Math.round(wall * 10) / 10;
for (const f of Object.values(stats.fields)) f.keys = [...f.keys];
const out = join(root, 'test-assets', 'probe-summary.json');
writeFileSync(out, JSON.stringify(stats, null, 2));
const { landmarkSample: _omit, ...printable } = stats;
console.log(JSON.stringify(printable, null, 2));
console.log(`summary (with landmark sample) -> ${out}`);
console.log(`budget used so far: ${usedSeconds(readLedger()).toFixed(1)}s`);
