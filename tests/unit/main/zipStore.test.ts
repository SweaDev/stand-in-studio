import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { crc32, readZip, writeZip } from '../../../src/main/zipStore';

const bytes = (s: string) => new TextEncoder().encode(s);
const hasUnzip = (() => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('zipStore', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips stored entries', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,8}\.(json|mp4)$/), { minLength: 1, maxLength: 4 }),
        fc.uint8Array({ maxLength: 2000 }),
        (names, data) => {
          const zip = writeZip(names.map((name, i) => ({ name, data: data.subarray(i) })));
          const back = readZip(zip, 1e6);
          expect([...back.keys()]).toEqual(names);
          names.forEach((n, i) => expect([...(back.get(n) as Uint8Array)]).toEqual([...data.subarray(i)]));
        },
      ),
    );
  });

  it.skipIf(!hasUnzip)('writes archives that standard unzip tools verify', () => {
    const dir = mkdtempSync(join(tmpdir(), 'standin-zip-'));
    const file = join(dir, 'x.zip');
    writeFileSync(
      file,
      writeZip([
        { name: 'telemetry.json', data: bytes('{"a":1}') },
        { name: 'video.mp4', data: new Uint8Array(500).fill(7) },
      ]),
    );
    expect(execFileSync('unzip', ['-t', file]).toString()).toContain('No errors detected');
  });

  it('reads archives made by other tools (Python zipfile, stored)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'standin-zip-'));
    const file = join(dir, 'py.zip');
    try {
      execFileSync('python3', [
        '-c',
        `import zipfile;z=zipfile.ZipFile(${JSON.stringify(file)},'w',zipfile.ZIP_STORED);z.writestr('meta.json','{}');z.writestr('SOURCE.txt','hi');z.close()`,
      ]);
    } catch {
      return; // no python here
    }
    const out = readZip(new Uint8Array(readFileSync(file)), 1e6);
    expect([...out.keys()].sort()).toEqual(['SOURCE.txt', 'meta.json']);
  });

  it('refuses traversal, compressed, truncated and corrupted archives', () => {
    expect(() => writeZip([{ name: '../x', data: bytes('x') }])).toThrow(/Bad entry name/);
    const good = writeZip([{ name: 'meta.json', data: bytes('{"name":"x"}') }]);
    expect(() => readZip(bytes('hello'), 1e6)).toThrow(/not a ZIP/);
    expect(() => readZip(good.subarray(0, 20), 1e6)).toThrow(/Not a valid demo file/);
    const evil = writeZip([{ name: 'aaaaaaaaa', data: bytes('x') }]);
    // Rename the entry to "../aaaaaa" in both headers.
    const patched = new Uint8Array(evil);
    const enc = bytes('../aaaaaa');
    for (let i = 0; i < patched.length - 9; i++)
      if (new TextDecoder().decode(patched.subarray(i, i + 9)) === 'aaaaaaaaa') patched.set(enc, i);
    expect(() => readZip(patched, 1e6)).toThrow(/unexpected entry/);
    const compressed = new Uint8Array(good);
    const cd = compressed.findIndex(
      (_, i) => new DataView(compressed.buffer).getUint32(i, true) === 0x02014b50,
    );
    compressed[cd + 10] = 8; // deflate
    expect(() => readZip(compressed, 1e6)).toThrow(/compressed/);
    const corrupt = new Uint8Array(good);
    corrupt[30 + 'meta.json'.length] = (corrupt[30 + 'meta.json'.length] as number) ^ 0xff;
    expect(() => readZip(corrupt, 1e6)).toThrow(/checksum/);
    expect(() => readZip(good, 3)).toThrow(/too large/);
  });
});
