import { describe, expect, it, vi } from 'vitest';
import {
  Overrides,
  modeState,
  nextMode,
  resolveStage,
  type ModeContext,
} from '../../../../src/core/stage/ModeController';
import { COMMANDS, COMMAND_NAMES, isCommandName } from '../../../../src/core/stage/commands';
import { DEFAULT_SETTINGS, updateSettings } from '../../../../src/shared/settings';

const ctx = (o: Partial<ModeContext> = {}): ModeContext => ({
  settings: updateSettings(DEFAULT_SETTINGS, { blend: { opacity: 0.6 }, auto: { max: 0.8 } }),
  autoTarget: 1,
  ...o,
});

describe('mode states', () => {
  it('give each mode its feed and character targets', () => {
    const c = ctx();
    expect(modeState('character').feedTarget(c)).toBe(0);
    expect(modeState('character').characterTarget(c)).toBe(1);
    expect(modeState('camera').feedTarget(c)).toBe(1);
    expect(modeState('camera').characterTarget(c)).toBe(0);
    expect(modeState('blend').feedTarget(c)).toBe(0.6);
    expect(modeState('auto').feedTarget(c)).toBe(0.8); // capped by max
    expect(modeState('auto').transition).toBe('rate');
    expect(modeState('blend').transition).toBe('fade');
  });

  it('keeps the character as a corner badge in Camera mode when enabled', () => {
    const c = ctx({ settings: updateSettings(DEFAULT_SETTINGS, { camera: { badge: true } }) });
    expect(modeState('camera').characterTarget(c)).toBe(1);
  });

  it('cycles through all modes', () => {
    expect(nextMode('character')).toBe('camera');
    expect(nextMode('camera')).toBe('blend');
    expect(nextMode('blend')).toBe('auto');
    expect(nextMode('auto')).toBe('character');
  });
});

describe('resolveStage', () => {
  it('applies Hide me > Back soon > Pin > mode', () => {
    const o = new Overrides();
    expect(resolveStage('camera', ctx(), o)).toEqual({
      feedTarget: 1,
      characterTarget: 0,
      transition: 'fade',
    });
    o.togglePin(0.42);
    expect(resolveStage('auto', ctx(), o).feedTarget).toBe(0.42);
    o.toggleBackSoon();
    expect(resolveStage('auto', ctx(), o)).toEqual({ feedTarget: 0, characterTarget: 1, transition: 'fade' });
    o.toggleHide();
    expect(resolveStage('camera', ctx(), o)).toEqual({
      feedTarget: 0,
      characterTarget: 1,
      transition: 'instant',
    });
    o.toggleHide();
    o.toggleBackSoon();
    o.clearPin();
    expect(resolveStage('blend', ctx(), o).feedTarget).toBe(0.6);
  });

  it('toggles raised hand', () => {
    const o = new Overrides();
    o.toggleRaiseHand();
    expect(o.raisedHand).toBe(true);
  });
});

describe('commands', () => {
  it('dispatches each command to its receiver method', () => {
    const r = {
      toggleHide: vi.fn(),
      togglePin: vi.fn(),
      toggleRaiseHand: vi.fn(),
      toggleBackSoon: vi.fn(),
      cycleMode: vi.fn(),
    };
    for (const n of COMMAND_NAMES) COMMANDS[n].execute(r);
    for (const fn of Object.values(r)) expect(fn).toHaveBeenCalledTimes(1);
    expect(isCommandName('pin')).toBe(true);
    expect(isCommandName('rm -rf')).toBe(false);
    expect(COMMANDS.hideMe.label).toBe('Hide me');
  });
});
