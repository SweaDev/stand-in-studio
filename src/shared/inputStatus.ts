import type { SourceStatus } from '../sensing/SignalSource';

/** What feeds the stage and the Presage SDK. */
export type InputSource = 'camera' | 'clip' | 'replay' | 'demo';

/** Why Presage is not analysing right now. */
export type PresagePause = 'cameraMode' | 'clipPaused' | 'user' | null;

export interface InputFacts {
  source: InputSource;
  /** Camera label, clip file name or saved-demo name. */
  name: string;
  /** Camera source only: the privacy shutter is closed (webcam released). */
  shutter: boolean;
  /** The Presage SDK session's status, or null when there is none (demo, replay, no key). */
  presage: SourceStatus | null;
  /** Why it is paused (when its status is 'paused'). */
  pause: PresagePause;
  /** An API key is available. */
  apiKey: boolean;
}

export type Tone = 'live' | 'on' | 'off' | 'muted' | 'warn';

export interface Pill {
  text: string;
  /** Longer description for the tooltip and screen readers. */
  detail: string;
  tone: Tone;
}

export interface InputStatus {
  source: Pill;
  camera: Pill;
  presage: Pill;
  /** The Presage toggle is meaningful (a session exists or the shutter can bring one back). */
  presageToggle: boolean;
  /** Presage is analysing frames right now. */
  analysing: boolean;
}

const SOURCE_LABEL: Record<InputSource, string> = {
  camera: 'Camera',
  clip: 'Video file',
  replay: 'Saved demo',
  demo: 'Simulated demo',
};

/** The texts of the status bar and the Camera tab readout (pure, unit-tested). */
export function describeInput(f: InputFacts): InputStatus {
  const what = f.name || SOURCE_LABEL[f.source].toLowerCase();
  const source: Pill = {
    text: f.source === 'demo' ? SOURCE_LABEL.demo : `${SOURCE_LABEL[f.source]} · ${what}`,
    detail: `Input: ${f.source === 'demo' ? 'the built-in simulated person' : what}`,
    tone: 'on',
  };
  const camera: Pill =
    f.source !== 'camera'
      ? { text: 'Camera off', detail: 'Your webcam is not in use', tone: 'muted' }
      : f.shutter
        ? {
            text: 'Camera off',
            detail: 'Camera off: the webcam is released and only the character is shown',
            tone: 'off',
          }
        : { text: 'Camera on', detail: `Camera on: ${what}`, tone: 'live' };

  let presage: Pill;
  let analysing = false;
  if (f.source === 'replay') {
    presage = {
      text: 'Replaying telemetry',
      detail: 'Saved telemetry drives the character: no Presage, no API use',
      tone: 'muted',
    };
  } else if (f.source === 'demo') {
    presage = {
      text: 'Simulated signals',
      detail: 'Demo mode: simulated signals, no Presage, no API use',
      tone: 'muted',
    };
  } else if (!f.apiKey) {
    presage = {
      text: 'Presage off · no API key',
      detail: 'Add a Presage API key in the Camera tab to analyse this input',
      tone: 'warn',
    };
  } else if (f.source === 'camera' && f.shutter) {
    presage = { text: 'Presage off', detail: 'Presage is off while the camera is off', tone: 'off' };
  } else if (f.presage === 'paused') {
    const why =
      f.pause === 'user' ? 'turned off by you' : f.pause === 'cameraMode' ? 'Camera mode' : 'clip paused';
    presage = {
      text: f.pause === 'user' ? 'Presage off' : `Presage paused · ${why}`,
      detail: `Presage is not analysing (${why}): nothing is sent to it`,
      tone: f.pause === 'user' ? 'off' : 'muted',
    };
  } else if (f.presage === 'running' || f.presage === 'starting') {
    analysing = f.presage === 'running';
    presage = {
      text: f.presage === 'running' ? `Presage · ${what}` : 'Presage starting…',
      detail: `Presage is analysing ${f.source === 'camera' ? 'your camera' : 'the video file'}: ${what}`,
      tone: 'live',
    };
  } else if (f.presage === 'error') {
    presage = {
      text: 'Presage error',
      detail: 'Presage stopped with an error: see the message above',
      tone: 'warn',
    };
  } else {
    presage = { text: 'Presage off', detail: 'Presage is not running', tone: 'off' };
  }
  const presageToggle =
    f.apiKey && (f.source === 'camera' || f.source === 'clip') && !(f.source === 'camera' && f.shutter);
  return { source, camera, presage, presageToggle, analysing };
}
