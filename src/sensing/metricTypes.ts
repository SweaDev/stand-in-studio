/**
 * MetricType ids used by Stand-In Studio. They mirror
 * `presage.smartspectra.MetricType` from `@smartspectra/node-sdk/messages`
 * (checked by a unit test) so pure code doesn't have to load the SDK.
 */
export const Metric = Object.freeze({
  CHEST_BREATHING: 0,
  BREATHING_RATE: 2,
  FACE_LANDMARKS: 11,
  BLINKING: 12,
  TALKING: 13,
  EXPRESSIONS: 14,
  PULSE_RATE: 15,
});

/** Expression type id of HAPPY in `face.expression[].scores[].type`. */
export const EXPRESSION_HAPPY = 5;

/** ExpressionType ids (SDK 3.5.0) for the expressions intents use. */
export const EXPRESSION_TYPES = Object.freeze({ angry: 1, happy: 5, neutral: 6, sad: 7, surprise: 8 });

/** Validation codes (`ValidationCode`) the app treats specially. */
export const ValidationCodes = Object.freeze({ kOk: 0, kNoFaceFound: 1, kMultipleFacesFound: 2 });
