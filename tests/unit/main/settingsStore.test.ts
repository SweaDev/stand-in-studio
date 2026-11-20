import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore } from '../../../src/main/settingsStore';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';
import { EXTERNAL_LINKS, isAllowedExternal } from '../../../src/shared/ipc';

describe('SettingsStore', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'settings-'));
    file = join(dir, 'nested', 'settings.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts with defaults and persists updates', () => {
    const s = new SettingsStore(file);
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
    s.update({ character: 'houseplant', auto: { listening: 0.3 } });
    const again = new SettingsStore(file);
    expect(again.get().character).toBe('houseplant');
    expect(again.get().auto.listening).toBe(0.3);
  });

  it('never writes anything but sanitised settings', () => {
    const s = new SettingsStore(file);
    s.update({ apiKey: 'secret', pulse: 80 } as never);
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('pulse');
  });

  it('recovers from a corrupt file', () => {
    const s = new SettingsStore(file);
    s.update({});
    writeFileSync(file, '{not json');
    expect(new SettingsStore(file).get()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('external links', () => {
  it('allows only the known pages', () => {
    expect(isAllowedExternal(EXTERNAL_LINKS.presagePrivacy)).toBe(true);
    expect(isAllowedExternal('https://evil.example')).toBe(false);
  });
});
