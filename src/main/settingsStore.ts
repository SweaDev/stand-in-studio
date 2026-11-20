import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type DeepPartial, type Settings, sanitizeSettings, updateSettings } from '../shared/settings';

/**
 * Persists the only things Stand-In Studio saves: character and mode settings. Values are
 * sanitised on read and write, so nothing else (keys, signals, calibration) can sneak in.
 */
export class SettingsStore {
  private current: Settings;

  constructor(private readonly file: string) {
    this.current = this.load();
  }

  get(): Settings {
    return this.current;
  }

  update(patch: DeepPartial<Settings>): Settings {
    this.current = updateSettings(this.current, patch);
    this.save();
    return this.current;
  }

  private load(): Settings {
    try {
      if (existsSync(this.file)) return sanitizeSettings(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch {
      // Corrupt file: fall back to defaults (and overwrite on next save).
    }
    return sanitizeSettings({});
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.current, null, 2));
    renameSync(tmp, this.file);
  }
}
