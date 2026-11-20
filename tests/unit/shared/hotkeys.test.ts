import { describe, expect, it } from 'vitest';
import { HOTKEYS, displayAccelerator } from '../../../src/shared/hotkeys';
import { COMMAND_NAMES } from '../../../src/core/stage/commands';

describe('hotkeys', () => {
  it('has a unique accelerator for every command', () => {
    const accs = COMMAND_NAMES.map((n) => HOTKEYS[n]);
    expect(new Set(accs).size).toBe(COMMAND_NAMES.length);
  });
  it('formats per platform', () => {
    expect(displayAccelerator('CommandOrControl+Alt+H', 'linux')).toBe('Ctrl+Alt+H');
    expect(displayAccelerator('CommandOrControl+Alt+H', 'darwin')).toBe('⌘⌥H');
  });
});
