import { describe, expect, it } from 'vitest';
import { promptFor } from '../../../src/renderer/control/components/CalibrationWizard';

describe('calibration prompts', () => {
  it('walks through framing, neutral, nod and smile', () => {
    expect(promptFor(0)).toMatch(/upper chest/);
    expect(promptFor(0.3)).toMatch(/normally/);
    expect(promptFor(0.55)).toMatch(/nod/);
    expect(promptFor(0.75)).toMatch(/smile/);
    expect(promptFor(1)).toMatch(/almost done/);
  });
});
