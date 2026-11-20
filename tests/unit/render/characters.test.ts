import { describe, expect, it } from 'vitest';
import '../../../src/render/characters/Lantern';
import '../../../src/render/characters/Houseplant';
import { characterOrDefault, getCharacter, listCharacters } from '../../../src/render/characters/registry';
import { inkFor } from '../../../src/render/characters/Character';
import { NEUTRAL_POSE, type CharacterPose, type StageStyle } from '../../../src/shared/types';
import { mockCanvas } from './mockCanvas';

const styles: StageStyle[] = [
  { reducedMotion: false, highContrast: false },
  { reducedMotion: true, highContrast: false },
  { reducedMotion: false, highContrast: true },
];

const poses: Partial<CharacterPose>[] = [
  {},
  { breath: 1, eyeOpen: 0, pitch: 20, yaw: -30, nodPulse: 0.5, enthusiastic: true },
  { talking: true, mouthOpen: 0.8, glow: 1, sparkle: true, shakePulse: 0.7 },
  { presence: 'away', eyeOpen: 0 },
  { presence: 'waking', wake: 0.5, raisedHand: true },
];

function draw(id: string, pose: Partial<CharacterPose>, style: StageStyle) {
  const { ctx, calls } = mockCanvas();
  const c = characterOrDefault(id as never);
  c.draw({
    ctx,
    cx: 160,
    cy: 90,
    size: 160,
    t: 1234,
    pose: { ...NEUTRAL_POSE, ...pose },
    style,
    ink: inkFor(style, 160),
  });
  return calls;
}

describe('characters', () => {
  it('shows the lantern "back soon" tag only when away', () => {
    const text = (calls: { name: string; args: unknown[] }[]) =>
      calls.filter((x) => x.name === 'fillText').map((x) => x.args[0]);
    expect(text(draw('lantern', {}, styles[0] as StageStyle))).not.toContain('back soon');
    expect(text(draw('lantern', { presence: 'away' }, styles[0] as StageStyle))).toContain('back soon');
  });

  it('registers the lantern', () => {
    expect(getCharacter('lantern')?.name).toBe('Paper lantern');
    expect(listCharacters().length).toBeGreaterThanOrEqual(1);
  });

  for (const c of ['lantern', 'houseplant']) {
    it(`${c} draws every pose in every style with balanced save/restore`, () => {
      for (const s of styles) {
        for (const p of poses) {
          const calls = draw(c, p, s);
          expect(calls.length).toBeGreaterThan(20);
          const saves = calls.filter((x) => x.name === 'save').length;
          expect(saves).toBe(calls.filter((x) => x.name === 'restore').length);
        }
      }
    });

    it(`${c} draws a different picture when away`, () => {
      const a = draw(c, {}, styles[0] as StageStyle);
      const b = draw(c, { presence: 'away' }, styles[0] as StageStyle);
      expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it(`${c} draws sparkles only when laughing`, () => {
      const n = (p: Partial<CharacterPose>) => draw(c, p, styles[0] as StageStyle).length;
      expect(n({ sparkle: true, talking: true })).toBeGreaterThan(n({ talking: true }));
    });
  }
});
