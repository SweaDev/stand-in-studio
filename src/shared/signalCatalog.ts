/**
 * The signals an intent can use. Every one comes from the Presage SmartSpectra SDK, either
 * directly (talking, expressions, validation status, cardio) or derived by Stand-In Studio
 * from the SDK's 478 face landmarks. Pure data shared by the engine, settings validation
 * and the intent builder UI; the measurement code lives in core/intent/signals.ts.
 */

export type SignalId =
  | 'talking'
  | 'headTurn'
  | 'headTilt'
  | 'gaze'
  | 'mouth'
  | 'expression'
  | 'eyes'
  | 'gesture'
  | 'faceInView'
  | 'people'
  | 'breathingRate'
  | 'pulse';

export type SignalGroup = 'speech' | 'headGaze' | 'face' | 'presence' | 'body';

export const SIGNAL_GROUPS: readonly { id: SignalGroup; label: string }[] = [
  { id: 'speech', label: 'Speech' },
  { id: 'headGaze', label: 'Head & gaze' },
  { id: 'face', label: 'Face' },
  { id: 'presence', label: 'Presence' },
  { id: 'body', label: 'Body (opt-in)' },
];

export interface SignalState {
  id: string;
  label: string;
  /** "Active" states are the departure from rest (used by tuning and wording). */
  active: boolean;
}

/** A tunable threshold on the signal's raw value. */
export interface SignalThreshold {
  default: number;
  min: number;
  max: number;
  unit: string;
}

export interface SignalInfo {
  id: SignalId;
  label: string;
  group: SignalGroup;
  /** One line for the catalogue card. */
  description: string;
  /** How the value is produced, shown under "How it works". */
  howItWorks: string;
  /** SDK field or code it comes from. */
  sdkSource: string;
  /** True when Stand-In Studio computes it from SDK landmarks (not a direct SDK output). */
  derived: boolean;
  /** Presage documentation for the underlying SDK output. */
  docUrl: string;
  states: readonly SignalState[];
  threshold?: SignalThreshold;
  /** Needs a visible face: such a condition implies "face in view = yes". */
  needsFace: boolean;
  /** Body (cardio/breathing-rate) signal: requested only on opt-in and can never raise the feed. */
  body: boolean;
}

/** Presage SmartSpectra documentation (checked 2026-11-22; SDK 3.5.0). */
export const PRESAGE_DOCS = Object.freeze({
  faceAnalysis: 'https://smartspectra.presagetech.com/docs/#face-analysis',
  face: 'https://smartspectra.presagetech.com/docs/data-types#face',
  landmarks: 'https://smartspectra.presagetech.com/docs/data-types#landmarks',
  expressions: 'https://smartspectra.presagetech.com/docs/data-types#expressiontype',
  breathingRate: 'https://smartspectra.presagetech.com/docs/#breathing-rate',
  pulseRate: 'https://smartspectra.presagetech.com/docs/#pulse-rate',
  validation: 'https://smartspectra.presagetech.com/docs/nodejs/api-reference#validationcode',
  metrics: 'https://smartspectra.presagetech.com/docs/#sdk-metric-capabilities',
});

/** How Stand-In Studio derives signals and evaluates intents (this repo). */
export const INTENTS_GUIDE = 'https://github.com/SweaDev/stand-in-studio/blob/main/docs/intents.md';

const s = (id: string, label: string, active = false): SignalState => ({ id, label, active });

export const SIGNALS: readonly SignalInfo[] = Object.freeze([
  {
    id: 'talking',
    label: 'Talking',
    group: 'speech',
    description: 'Whether your mouth is moving like speech, seen on camera (no microphone).',
    howItWorks:
      'The SDK reports face.talking about 15 times a second. Stand-In smooths it over the last 1.5 s, so short pauses between words still count as talking.',
    sdkSource: 'face.talking',
    derived: false,
    docUrl: PRESAGE_DOCS.face,
    states: [s('yes', 'Talking', true), s('no', 'Not talking')],
    needsFace: true,
    body: false,
  },
  {
    id: 'headTurn',
    label: 'Head turn',
    group: 'headGaze',
    description: 'Turning your head left or right, compared with your calibrated pose.',
    howItWorks:
      'From the landmarks: the nose tip against the midpoint of the eyes, divided by the distance between the eyes, relative to calibration. Left and right are as seen in the preview.',
    sdkSource: 'face.landmarks (nose tip, eye corners)',
    derived: true,
    docUrl: PRESAGE_DOCS.landmarks,
    states: [
      s('centred', 'Facing the screen'),
      s('left', 'Turned left', true),
      s('right', 'Turned right', true),
    ],
    threshold: { default: 0.18, min: 0.06, max: 0.6, unit: 'eye-distances' },
    needsFace: true,
    body: false,
  },
  {
    id: 'headTilt',
    label: 'Head tilt',
    group: 'headGaze',
    description: 'Looking down (desk, phone) or up, compared with your calibrated pose.',
    howItWorks:
      'From the landmarks: how far the nose tip sits below the eye midpoint, in eye-distances, relative to calibration.',
    sdkSource: 'face.landmarks (nose tip, eye corners)',
    derived: true,
    docUrl: PRESAGE_DOCS.landmarks,
    states: [s('level', 'Level'), s('down', 'Looking down', true), s('up', 'Looking up', true)],
    threshold: { default: 0.15, min: 0.05, max: 0.5, unit: 'eye-distances' },
    needsFace: true,
    body: false,
  },
  {
    id: 'gaze',
    label: 'Eye gaze',
    group: 'headGaze',
    description: 'Whether your eyes point at the screen or away, even with your head still.',
    howItWorks:
      'From the iris landmarks (468 and 473 in the 478-point mesh): each iris centre against its eye corners, divided by the eye width, relative to calibration. Unavailable when the SDK sends no iris points.',
    sdkSource: 'face.landmarks (iris centres, eye corners)',
    derived: true,
    docUrl: PRESAGE_DOCS.landmarks,
    states: [s('onScreen', 'On screen'), s('away', 'Looking away', true)],
    threshold: { default: 0.12, min: 0.04, max: 0.4, unit: 'eye-widths' },
    needsFace: true,
    body: false,
  },
  {
    id: 'mouth',
    label: 'Mouth',
    group: 'face',
    description: 'Mouth open or closed (eating, yawning, speaking).',
    howItWorks:
      'From the landmarks: the gap between the inner lips, in eye-distances, above your calibrated closed-mouth gap.',
    sdkSource: 'face.landmarks (inner lips)',
    derived: true,
    docUrl: PRESAGE_DOCS.landmarks,
    states: [s('closed', 'Closed'), s('open', 'Open', true)],
    threshold: { default: 0.25, min: 0.08, max: 0.8, unit: 'eye-distances' },
    needsFace: true,
    body: false,
  },
  {
    id: 'expression',
    label: 'Expression',
    group: 'face',
    description: 'The SDK’s facial expression scores: happy, surprised, sad, angry or neutral.',
    howItWorks:
      'The SDK scores eight expressions from 0 to 100 about 20 times a second. A state matches when its score passes the threshold; happy is measured above your calibrated resting level.',
    sdkSource: 'face.expression',
    derived: false,
    docUrl: PRESAGE_DOCS.expressions,
    states: [
      s('neutral', 'Neutral'),
      s('happy', 'Happy', true),
      s('surprise', 'Surprised', true),
      s('sad', 'Sad', true),
      s('angry', 'Angry', true),
    ],
    threshold: { default: 0.3, min: 0.1, max: 0.9, unit: 'score' },
    needsFace: true,
    body: false,
  },
  {
    id: 'eyes',
    label: 'Eyes',
    group: 'face',
    description: 'Eyes closed for longer than a blink (resting, drowsy).',
    howItWorks:
      'face.blinking from the SDK, backed up by eye openness from the eyelid landmarks. "Closed" means closed for longer than the threshold.',
    sdkSource: 'face.blinking + face.landmarks (eyelids)',
    derived: true,
    docUrl: PRESAGE_DOCS.face,
    states: [s('open', 'Open'), s('closed', 'Closed', true)],
    threshold: { default: 1_000, min: 400, max: 5_000, unit: 'ms' },
    needsFace: true,
    body: false,
  },
  {
    id: 'gesture',
    label: 'Nod or shake',
    group: 'headGaze',
    description: 'A recent nod (yes) or head shake (no).',
    howItWorks:
      'From the landmarks: a quick pitch (nod) or yaw (shake) dip of at least 0.05 eye-distances that returns within 700 ms. The state stays on for 1.5 s after the gesture.',
    sdkSource: 'face.landmarks (nose tip, eye corners)',
    derived: true,
    docUrl: PRESAGE_DOCS.landmarks,
    states: [s('still', 'Still'), s('nodding', 'Nodding', true), s('shaking', 'Shaking', true)],
    needsFace: true,
    body: false,
  },
  {
    id: 'faceInView',
    label: 'Face in view',
    group: 'presence',
    description: 'Whether the SDK finds a face at all.',
    howItWorks:
      'From the SDK validation status: kNoFaceFound for most of the last 1.5 s means no face is in view.',
    sdkSource: 'validationStatus (kNoFaceFound)',
    derived: false,
    docUrl: PRESAGE_DOCS.validation,
    states: [s('yes', 'In view'), s('no', 'No face', true)],
    needsFace: false,
    body: false,
  },
  {
    id: 'people',
    label: 'People in view',
    group: 'presence',
    description: 'Someone else stepped into the camera’s view.',
    howItWorks:
      'From the SDK validation status: kMultipleFacesFound in part of the last 1.5 s means more than one face is in view.',
    sdkSource: 'validationStatus (kMultipleFacesFound)',
    derived: false,
    docUrl: PRESAGE_DOCS.validation,
    states: [s('justMe', 'Just me'), s('more', 'More than one', true)],
    threshold: { default: 0.3, min: 0.1, max: 0.9, unit: 'share of frames' },
    needsFace: false,
    body: false,
  },
  {
    id: 'breathingRate',
    label: 'Breathing rate',
    group: 'body',
    description: 'Breathing faster than your own baseline. Requests breathing rate from the SDK.',
    howItWorks:
      'The SDK’s breathing rate (breaths per minute, averaged over many seconds) against a baseline learned over your first 30 s. Body signals can only hide you, never reveal you.',
    sdkSource: 'breathing.rate',
    derived: false,
    docUrl: PRESAGE_DOCS.breathingRate,
    states: [s('near', 'Near baseline'), s('raised', 'Raised', true)],
    threshold: { default: 5, min: 2, max: 20, unit: 'breaths/min above baseline' },
    needsFace: false,
    body: true,
  },
  {
    id: 'pulse',
    label: 'Pulse',
    group: 'body',
    description: 'Pulse higher than your own baseline. Requests pulse rate from the SDK.',
    howItWorks:
      'The SDK’s pulse rate (averaged over many seconds) against a baseline learned over your first 30 s. Body signals can only hide you, never reveal you.',
    sdkSource: 'cardio.pulseRate',
    derived: false,
    docUrl: PRESAGE_DOCS.pulseRate,
    states: [s('near', 'Near baseline'), s('raised', 'Raised', true)],
    threshold: { default: 12, min: 4, max: 40, unit: 'bpm above baseline' },
    needsFace: false,
    body: true,
  },
] as SignalInfo[]);

const BY_ID = new Map(SIGNALS.map((x) => [x.id, x]));

export function signalInfo(id: SignalId): SignalInfo {
  const info = BY_ID.get(id);
  if (!info) throw new Error(`unknown signal ${id}`);
  return info;
}

export function isSignalId(v: unknown): v is SignalId {
  return typeof v === 'string' && BY_ID.has(v as SignalId);
}

export function stateLabel(signal: SignalId, state: string): string {
  return signalInfo(signal).states.find((x) => x.id === state)?.label ?? state;
}
