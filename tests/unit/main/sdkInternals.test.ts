import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('@smartspectra/node-sdk/package.json'));

/**
 * The key-injection decorator (src/main/sdkKeyInjection.ts) relies on SDK 3.5.0 internals.
 * If an upgrade changes them, this test fails before a key could leak or break.
 */
describe('SmartSpectra SDK internals used for key injection', () => {
  it('is the pinned version', () => {
    expect(require('@smartspectra/node-sdk/package.json').version).toBe('3.5.0');
  });

  it('main bridge builds the SDK from ../smartspectra with sanitized renderer options', () => {
    const src = readFileSync(join(pkgDir, 'js', 'main', 'index.js'), 'utf8');
    expect(src).toMatch(/\}\s*=\s*require\('\.\.\/smartspectra'\)/);
    expect(src).toContain('new SmartSpectraSDK(sanitizeOptions(data.options))');
  });

  it('smartspectra.js exports SmartSpectraSDK on module.exports', () => {
    const src = readFileSync(join(pkgDir, 'js', 'smartspectra.js'), 'utf8');
    expect(src).toMatch(/module\.exports\s*=\s*\{[^}]*SmartSpectraSDK/s);
  });
});
