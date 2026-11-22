import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DemoLibrary } from '../../../src/main/demoLibrary';
import { writeZip } from '../../../src/main/zipStore';
import { cleanName, videoExt } from '../../../src/shared/demos';
import { DEFAULT_SETTINGS, sanitizeSettings, updateSettings } from '../../../src/shared/settings';

const telemetry = (extra: Record<string, unknown> = {}) => ({
  format: 'standin-telemetry',
  version: 1,
  app: '1.3.0',
  sdk: '3.5.0',
  createdAt: '2026-11-22T00:00:00.000Z',
  includesBody: false,
  video: { file: 'clip.webm', durationMs: 4000, width: 960, height: 540 },
  frames: [
    { tMs: 0, talking: false, validation: 'ok' },
    { tMs: 50, talking: true, pulseRate: { value: 70, confident: true } },
  ],
  ...extra,
});
const video = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
const tmp = () => mkdtempSync(join(tmpdir(), 'standin-demos-'));
let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 22, 12, 0, tick++));

describe('DemoLibrary', () => {
  it('saves, lists, loads and survives a "rebuild" (a new library on the same folder)', () => {
    const root = tmp();
    const lib = new DemoLibrary(root, true, clock);
    expect(lib.list().demos).toEqual([]);
    const s = lib.save({ name: 'Stand-up: me talking', telemetry: telemetry(), video, ext: 'webm' });
    expect(s.id).toMatch(/^stand-up-me-talking-\d{8}-\d{6}$/);
    expect(s).toMatchObject({
      frames: 2,
      includesBody: false,
      durationMs: 4000,
      videoFile: 'video.webm',
      videoBytes: 7,
    });
    expect(readdirSync(join(root, s.id)).sort()).toEqual(['meta.json', 'telemetry.json', 'video.webm']);
    // Body signals were not opted in, so they are not on disk either.
    expect(readFileSync(join(root, s.id, 'telemetry.json'), 'utf8')).not.toContain('pulseRate');

    const again = new DemoLibrary(root, true, clock);
    const listing = again.list();
    expect(listing.demos.map((d) => d.id)).toEqual([s.id]);
    expect(listing.isDefault).toBe(true);
    const loaded = again.load(s.id);
    expect(loaded.mime).toBe('video/webm');
    expect([...loaded.video]).toEqual([...video]);
  });

  it('newest first; duplicate names get distinct ids; rename and delete', () => {
    const lib = new DemoLibrary(tmp(), false, () => new Date(Date.UTC(2026, 0, 1)));
    const a = lib.save({ name: 'Same', telemetry: telemetry(), video, ext: 'mp4' });
    const b = lib.save({ name: 'Same', telemetry: telemetry(), video, ext: 'mp4' });
    expect(a.id).not.toBe(b.id);
    expect(lib.rename(a.id, '  Renamed  ').name).toBe('Renamed');
    lib.delete(b.id);
    expect(lib.list().demos.map((d) => d.name)).toEqual(['Renamed']);
  });

  it('rejects ids that would leave the library', () => {
    const lib = new DemoLibrary(tmp());
    for (const id of ['../x', '..', '/etc', 'a/b', 'A', '', 42, null]) {
      expect(() => lib.load(id as string)).toThrow(/Unknown demo/);
      expect(() => lib.delete(id as string)).toThrow(/Unknown demo/);
    }
  });

  it('validates what it saves: telemetry, video type and size', () => {
    const lib = new DemoLibrary(tmp());
    expect(() => lib.save({ name: 'x', telemetry: { nope: 1 }, video, ext: 'webm' })).toThrow(/telemetry/);
    expect(() => lib.save({ name: 'x', telemetry: telemetry(), video, ext: 'exe' })).toThrow(/video type/);
    expect(() =>
      lib.save({ name: 'x', telemetry: telemetry(), video: new Uint8Array(0), ext: 'webm' }),
    ).toThrow(/empty/);
    expect(lib.list().demos).toEqual([]);
  });

  it('lists broken folders without deleting them, and ignores unrelated files', () => {
    const root = tmp();
    mkdirSync(join(root, 'broken-1'));
    writeFileSync(join(root, 'broken-1', 'meta.json'), '{');
    writeFileSync(join(root, 'notes.txt'), 'hi');
    const lib = new DemoLibrary(root);
    expect(lib.list()).toMatchObject({ demos: [], broken: ['broken-1'] });
    expect(readdirSync(root).sort()).toEqual(['broken-1', 'notes.txt']);
  });

  it('exports one bundle file to share, plus the video and telemetry loose', () => {
    const lib = new DemoLibrary(tmp());
    const s = lib.save({ name: 'Share me', telemetry: telemetry(), video, ext: 'webm' });
    const out = tmp();
    const files = lib.exportTo(s.id, out);
    expect(files.map((f) => f.slice(out.length + 1))).toEqual([
      'share-me.standin-demo.zip',
      'share-me.webm',
      'share-me.telemetry.json',
    ]);
    expect(JSON.parse(readFileSync(files[2] as string, 'utf8')).format).toBe('standin-telemetry');

    // The bundle alone recreates the demo in another library (another computer).
    const other = new DemoLibrary(tmp(), true, clock);
    const imported = other.importBundle(new Uint8Array(readFileSync(files[0] as string)));
    expect(imported).toMatchObject({ name: 'Share me', frames: 2, videoFile: 'video.webm' });
    expect([...other.load(imported.id).video]).toEqual([...video]);
    expect(other.load(imported.id).telemetry).toEqual(lib.load(s.id).telemetry);
  });

  it('refuses bundles without a video or telemetry, or with bad telemetry', () => {
    const lib = new DemoLibrary(tmp());
    const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
    expect(() => lib.importBundle(new Uint8Array(0))).toThrow(/empty/);
    expect(() => lib.importBundle(new TextEncoder().encode('not a zip at all'))).toThrow(/not a ZIP/);
    expect(() => lib.importBundle(writeZip([{ name: 'telemetry.json', data: enc(telemetry()) }]))).toThrow(
      /no video/,
    );
    expect(() => lib.importBundle(writeZip([{ name: 'video.mp4', data: video }]))).toThrow(/no telemetry/);
    expect(() =>
      lib.importBundle(
        writeZip([
          { name: 'video.mp4', data: video },
          { name: 'telemetry.json', data: enc({ x: 1 }) },
        ]),
      ),
    ).toThrow(/Not a Stand-In telemetry/);
    expect(lib.list().demos).toEqual([]);
  });
});

describe('demo helpers and settings', () => {
  it('video types and names', () => {
    expect(videoExt('a.WEBM')).toBe('webm');
    expect(videoExt('a.mp4')).toBe('mp4');
    expect(videoExt('a.exe')).toBeNull();
    expect(cleanName('\u0000 hi\nthere ')).toBe('hi there');
    expect(cleanName('')).toBe('Untitled demo');
  });

  it('recorded settings default off and are sanitised', () => {
    expect(DEFAULT_SETTINGS.recorded).toEqual({ libraryDir: null, saveBody: false, lastDemo: null });
    const s = sanitizeSettings({ recorded: { libraryDir: 5, saveBody: 'yes', lastDemo: '../x' } });
    expect(s.recorded).toEqual({ libraryDir: null, saveBody: false, lastDemo: null });
    expect(updateSettings(DEFAULT_SETTINGS, { recorded: { saveBody: true } }).recorded.saveBody).toBe(true);
  });
});
