import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeFaceFeatures } from '../../../../src/core/features/faceGeometry';
import { syntheticFace } from '../../../../src/core/features/syntheticFace';
import { DLIB_68 } from '../../../../src/core/features/LandmarkLayout';
import { EMPTY_CONTEXT, type SignalContext, readSignal, softStep } from '../../../../src/core/intent/signals';
import { SIGNALS, signalInfo } from '../../../../src/shared/signalCatalog';
import { isAllowedExternal } from '../../../../src/shared/ipc';

const face: SignalContext = {
  ...EMPTY_CONTEXT,
  faceSeen: true,
  validation: 'ok',
  yaw: 0,
  pitch: 0,
  gaze: 0,
  mouthGap: 0,
};

describe('signal catalogue', () => {
  it('every signal has states, a description and an allowed documentation link', () => {
    for (const s of SIGNALS) {
      expect(s.states.length).toBeGreaterThanOrEqual(2);
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.howItWorks.length).toBeGreaterThan(10);
      expect(isAllowedExternal(s.docUrl), s.id).toBe(true);
      expect(
        s.states.some((x) => x.active),
        s.id,
      ).toBe(true);
    }
  });

  it('only body signals are flagged as body and none of them need a face', () => {
    expect(SIGNALS.filter((s) => s.body).map((s) => s.id)).toEqual(['breathingRate', 'pulse']);
    for (const s of SIGNALS.filter((x) => x.body)) expect(s.needsFace).toBe(false);
  });
});

describe('softStep', () => {
  it('is 0.5 at the threshold and monotonic (property)', () => {
    expect(softStep(0.2, 0.2)).toBeCloseTo(0.5);
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 2, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (v, d) => {
          expect(softStep(v + d, 0.2)).toBeGreaterThanOrEqual(softStep(v, 0.2) - 1e-12);
        },
      ),
    );
  });
});

describe('readSignal', () => {
  it('reads head turn left, right and centred against the threshold', () => {
    expect(readSignal('headTurn', { ...face, yaw: 0 }).m.centred).toBeGreaterThan(0.9);
    expect(readSignal('headTurn', { ...face, yaw: 0.4 }).m.right).toBeGreaterThan(0.9);
    expect(readSignal('headTurn', { ...face, yaw: -0.4 }).m.left).toBeGreaterThan(0.9);
    // A tuned (lower) threshold makes a smaller turn count.
    expect(readSignal('headTurn', { ...face, yaw: 0.12 }).m.right).toBeLessThan(0.1);
    expect(readSignal('headTurn', { ...face, yaw: 0.12 }, 0.08).m.right).toBeGreaterThan(0.9);
  });

  it('smooths talking over the window share', () => {
    expect(readSignal('talking', { ...face, talkingShare: 0.8 }).m.yes).toBe(1);
    expect(readSignal('talking', { ...face, talkingShare: 0.1 }).m.no).toBe(1);
  });

  it('blocks face signals without a face, but ignores gaze when the layout has no iris', () => {
    const none = { ...EMPTY_CONTEXT };
    for (const s of SIGNALS.filter((x) => x.needsFace)) {
      const r = readSignal(s.id, none);
      expect(r.available).toBe(false);
      expect(Math.max(...Object.values(r.m))).toBe(0);
    }
    const r = readSignal('gaze', { ...face, gaze: null });
    expect(r.ignored).toBe(true);
    expect(r.m.onScreen).toBe(1);
  });

  it('reads presence, people, expression, gestures and body signals', () => {
    expect(readSignal('faceInView', { ...EMPTY_CONTEXT, validation: 'noFace' }).m.no).toBe(1);
    expect(readSignal('faceInView', { ...face }).m.yes).toBe(1);
    expect(readSignal('people', { ...face, multipleFacesShare: 0.6 }).m.more).toBeGreaterThan(0.9);
    expect(
      readSignal('expression', { ...face, expressions: { happy: 0.7, neutral: 0.1 } }).m.happy,
    ).toBeGreaterThan(0.9);
    expect(readSignal('expression', face).available).toBe(false);
    expect(readSignal('gesture', { ...face, sinceNodMs: 200 }).m.nodding).toBe(1);
    expect(readSignal('gesture', face).m.still).toBe(1);
    expect(readSignal('pulse', face).available).toBe(false);
    expect(readSignal('pulse', { ...face, pulseDelta: 20 }).m.raised).toBeGreaterThan(0.9);
    expect(readSignal('eyes', { ...face, eyesClosedMs: 2_000 }).m.closed).toBeGreaterThan(0.9);
  });

  it('uses the catalogue default threshold', () => {
    const thr = signalInfo('mouth').threshold!.default;
    expect(readSignal('mouth', { ...face, mouthGap: thr }).m.open).toBeCloseTo(0.5);
  });
});

describe('iris gaze from landmarks', () => {
  it('recovers the gaze offset of a synthetic 478-point face', () => {
    const f = computeFaceFeatures(
      syntheticFace({ pitch: 0.4, yaw: 0, mouthGap: 0.02, eyeOpenness: 0.3, gazeX: 0.15, gazeY: -0.05 }),
    );
    expect(f?.gazeX).toBeCloseTo(0.15, 5);
    expect(f?.gazeY).toBeCloseTo(-0.05, 5);
  });

  it('is absent for layouts without iris points', () => {
    const f = computeFaceFeatures(
      syntheticFace({ pitch: 0.4, yaw: 0, mouthGap: 0.02, eyeOpenness: 0.3 }, DLIB_68),
    );
    expect(f?.gazeX).toBeUndefined();
  });
});
