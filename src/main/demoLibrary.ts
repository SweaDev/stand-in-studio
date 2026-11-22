import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  DEMO_ID,
  type DemoLibraryListing,
  type DemoLoaded,
  type DemoSaveRequest,
  type DemoSummary,
  MAX_DEMO_NOTES,
  MAX_VIDEO_BYTES,
  VIDEO_TYPES,
  BUNDLE_SUFFIX,
  cleanName,
} from '../shared/demos';
import { type TelemetryFile, sanitizeTelemetry } from '../shared/telemetry';
import { readZip, writeZip } from './zipStore';

const META = 'meta.json';
const TELEMETRY = 'telemetry.json';

interface Meta {
  name: string;
  notes: string;
  createdAt: string;
  videoFile: string;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'demo'
  );
}

/**
 * The demo library: one folder per saved demo, inside a folder the user approved (by
 * default the app's data directory, which survives rebuilds and reinstalls). Each demo
 * holds `video.<ext>`, `telemetry.json` and `meta.json`. Every id is checked and every path
 * resolved inside the library, so a renderer can never reach other files.
 */
export class DemoLibrary {
  readonly root: string;

  constructor(
    root: string,
    readonly isDefault = false,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.root = resolve(root);
  }

  private dirOf(id: unknown): string {
    if (typeof id !== 'string' || !DEMO_ID.test(id)) throw new Error('Unknown demo.');
    const dir = resolve(this.root, id);
    if (!dir.startsWith(this.root + sep)) throw new Error('Unknown demo.');
    return dir;
  }

  list(): DemoLibraryListing {
    const demos: DemoSummary[] = [];
    const broken: string[] = [];
    if (existsSync(this.root)) {
      for (const e of readdirSync(this.root, { withFileTypes: true })) {
        if (!e.isDirectory() || !DEMO_ID.test(e.name) || e.name.endsWith('-partial')) continue;
        try {
          demos.push(this.summary(e.name));
        } catch {
          broken.push(e.name);
        }
      }
    }
    demos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { dir: this.root, isDefault: this.isDefault, demos, broken };
  }

  private readMeta(dir: string): Meta {
    const raw = JSON.parse(readFileSync(join(dir, META), 'utf8')) as Record<string, unknown>;
    const videoFile = typeof raw.videoFile === 'string' ? raw.videoFile : '';
    const m = /^video\.([a-z0-9]+)$/.exec(videoFile);
    if (!m || !((m[1] as string) in VIDEO_TYPES)) throw new Error('Bad demo video.');
    return {
      name: cleanName(raw.name),
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, MAX_DEMO_NOTES) : '',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt.slice(0, 40) : '',
      videoFile,
    };
  }

  private readTelemetry(dir: string): TelemetryFile {
    return sanitizeTelemetry(JSON.parse(readFileSync(join(dir, TELEMETRY), 'utf8')));
  }

  summary(id: string): DemoSummary {
    const dir = this.dirOf(id);
    const meta = this.readMeta(dir);
    const t = this.readTelemetry(dir);
    return {
      id,
      name: meta.name,
      notes: meta.notes,
      createdAt: meta.createdAt,
      durationMs: t.video.durationMs,
      frames: t.frames.length,
      includesBody: t.includesBody,
      videoFile: meta.videoFile,
      videoBytes: statSync(join(dir, meta.videoFile)).size,
    };
  }

  load(id: string): DemoLoaded {
    const summary = this.summary(id);
    const dir = this.dirOf(id);
    const ext = summary.videoFile.split('.').pop() as string;
    return {
      summary,
      telemetry: this.readTelemetry(dir),
      video: new Uint8Array(readFileSync(join(dir, summary.videoFile))),
      mime: VIDEO_TYPES[ext] as string,
    };
  }

  save(req: DemoSaveRequest): DemoSummary {
    const telemetry = sanitizeTelemetry(req.telemetry);
    if (typeof req.ext !== 'string' || !(req.ext in VIDEO_TYPES)) throw new Error('Unsupported video type.');
    if (!(req.video instanceof Uint8Array) || req.video.byteLength === 0)
      throw new Error('The video is empty.');
    if (req.video.byteLength > MAX_VIDEO_BYTES) throw new Error('The video is larger than 1 GB.');
    const name = cleanName(req.name);
    const created = this.now();
    const stamp = created
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..*$/, '')
      .replace('T', '-')
      .toLowerCase();
    let id = `${slug(name)}-${stamp}`;
    for (let n = 2; existsSync(join(this.root, id)); n++) id = `${slug(name)}-${stamp}-${n}`;
    const dir = this.dirOf(id);
    // Write into a temporary folder and rename, so a crash never leaves half a demo.
    const tmp = this.dirOf(`${id}-partial`.slice(0, 80));
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const videoFile = `video.${req.ext}`;
    writeFileSync(join(tmp, videoFile), req.video);
    writeFileSync(join(tmp, TELEMETRY), JSON.stringify(telemetry));
    const meta: Meta = {
      name,
      notes: typeof req.notes === 'string' ? req.notes.slice(0, MAX_DEMO_NOTES) : '',
      createdAt: created.toISOString(),
      videoFile,
    };
    writeFileSync(join(tmp, META), JSON.stringify(meta, null, 2));
    renameSync(tmp, dir);
    return this.summary(id);
  }

  rename(id: string, name: string): DemoSummary {
    const dir = this.dirOf(id);
    const meta = { ...this.readMeta(dir), name: cleanName(name) };
    writeFileSync(join(dir, META), JSON.stringify(meta, null, 2));
    return this.summary(id);
  }

  delete(id: string): void {
    const dir = this.dirOf(id);
    if (existsSync(join(dir, META)) || existsSync(join(dir, TELEMETRY)))
      rmSync(dir, { recursive: true, force: true });
  }

  /** One-file bundle of a demo (stored ZIP: video, telemetry.json, meta.json). */
  bundle(id: string): Uint8Array {
    const dir = this.dirOf(id);
    const meta = this.readMeta(dir);
    return writeZip([
      { name: meta.videoFile, data: readFileSync(join(dir, meta.videoFile)) },
      { name: TELEMETRY, data: readFileSync(join(dir, TELEMETRY)) },
      { name: META, data: new TextEncoder().encode(JSON.stringify(meta, null, 2)) },
    ]);
  }

  /** Adds a demo from a `.standin-demo.zip` bundle (validated like any save). */
  importBundle(bytes: Uint8Array): DemoSummary {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('The demo file is empty.');
    const files = readZip(bytes, MAX_VIDEO_BYTES);
    const videoName = [...files.keys()].find(
      (n) => /^video\.[a-z0-9]+$/.test(n) && n.split('.')[1]! in VIDEO_TYPES,
    );
    if (!videoName) throw new Error('The demo file has no video (video.mp4, video.webm, …).');
    const telemetry = files.get(TELEMETRY);
    if (!telemetry) throw new Error('The demo file has no telemetry.json.');
    let meta: Record<string, unknown> = {};
    try {
      const m = files.get(META);
      if (m) meta = JSON.parse(new TextDecoder().decode(m)) as Record<string, unknown>;
    } catch {
      // A broken meta.json only loses the name and notes.
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(telemetry));
    } catch {
      throw new Error('The telemetry in the demo file is not valid JSON.');
    }
    return this.save({
      name: cleanName(meta.name),
      notes: typeof meta.notes === 'string' ? meta.notes : '',
      telemetry: parsed,
      video: files.get(videoName) as Uint8Array,
      ext: videoName.split('.')[1] as string,
    });
  }

  /**
   * Exports into `target` (a folder the user picked): `<name>.standin-demo.zip`, one file
   * to share, plus the video and telemetry as loose files to inspect.
   */
  exportTo(id: string, target: string): string[] {
    const summary = this.summary(id);
    const dir = this.dirOf(id);
    const base = slug(summary.name);
    const ext = summary.videoFile.split('.').pop() as string;
    mkdirSync(target, { recursive: true });
    const zip = join(target, `${base}${BUNDLE_SUFFIX}`);
    writeFileSync(zip, this.bundle(id));
    const video = join(target, `${base}.${ext}`);
    const json = join(target, `${base}.telemetry.json`);
    copyFileSync(join(dir, summary.videoFile), video);
    copyFileSync(join(dir, TELEMETRY), json);
    return [zip, video, json];
  }
}
