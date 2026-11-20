/**
 * Scale-free face measurements for one landmark frame. Distances are in units of the
 * distance between the eye centres ("eye-distances", ed), so they don't depend on how
 * far the user sits from the camera.
 */
export interface FaceFeatures {
  /** Nose tip below the eye midpoint (roll-corrected), in ed. Grows when the chin dips. */
  pitch: number;
  /** Nose tip right of the eye midpoint (roll-corrected), in ed. */
  yaw: number;
  /** Head roll in radians (eye line angle). */
  roll: number;
  /** Inner-lip gap in ed. */
  mouthGap: number;
  /** Mean eyelid gap divided by eye width (0 = closed). */
  eyeOpenness: number;
  /** Eye-centre distance in pixels (for sanity checks). */
  eyeDistancePx: number;
}
