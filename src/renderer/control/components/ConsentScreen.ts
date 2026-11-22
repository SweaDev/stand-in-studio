import { type DemoSummary, VIDEO_TYPES, formatDuration } from '../../../shared/demos';
import { EXTERNAL_LINKS } from '../../../shared/ipc';
import { type Component, h } from '../dom';
import { icon } from '../icons';

/** camera: live webcam; demo: simulated person; clip: a video file; replay: a saved demo. */
export type ConsentChoice = 'camera' | 'demo' | { kind: 'clip'; file: File } | { kind: 'replay'; id: string };

const ACCEPT = Object.keys(VIDEO_TYPES)
  .map((e) => `.${e}`)
  .join(',');

/**
 * Plain-language consent (REQUIREMENT §6). Shown at every launch; the camera starts only
 * after "Start with my camera".
 */
export class ConsentScreen implements Component {
  readonly el: HTMLElement;

  constructor(
    opts: {
      cameraAvailable: boolean;
      openExternal: (url: string) => void;
      /** Saved demos in the library (newest first). */
      demos?: DemoSummary[];
      /** The demo picked last time, selected by default. */
      lastDemo?: string | null;
    },
    onChoice: (c: ConsentChoice) => void,
  ) {
    const link = (url: string, text: string) =>
      h(
        'a',
        {
          href: url,
          onclick: (e: Event) => {
            e.preventDefault();
            opts.openExternal(url);
          },
        },
        text,
      );
    const fileInput = h('input', {
      type: 'file',
      id: 'consent-clip-file',
      accept: ACCEPT,
      hidden: true,
      'aria-label': 'Choose a video file',
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) onChoice({ kind: 'clip', file });
    });
    const demos = opts.demos ?? [];
    const picker =
      demos.length > 0
        ? h(
            'select',
            { id: 'consent-demo-pick', 'aria-label': 'Which demo' },
            h('option', { value: '' }, 'Simulated person (built in)'),
            ...demos.map((d) =>
              h(
                'option',
                { value: d.id, selected: d.id === opts.lastDemo },
                `${d.name} · ${formatDuration(d.durationMs)}${d.includesBody ? ' · body signals' : ''}`,
              ),
            ),
          )
        : null;
    this.el = h(
      'section',
      { class: 'consent', 'aria-labelledby': 'consent-title', role: 'dialog', 'aria-modal': 'true' },
      h('h2', { id: 'consent-title' }, 'Before your camera starts'),
      h(
        'p',
        { class: 'lead' },
        'Stand-In Studio lets you decide how much of you each call sees. Here is exactly what happens.',
      ),
      h(
        'ul',
        {},
        h('li', {}, h('strong', {}, 'Character mode'), ' sends only the drawn character to the meeting.'),
        h(
          'li',
          {},
          h('strong', {}, 'Camera, Blend and Auto'),
          ' send ',
          h('strong', {}, 'your real video'),
          ', at the opacity shown on the dial, to the meeting through OBS.',
        ),
        h(
          'li',
          {},
          'In ',
          h('strong', {}, 'Camera mode the Presage SDK is paused'),
          ': your video passes straight through and nothing is analysed.',
        ),
        h(
          'li',
          {},
          'What is read from the camera, and why: your face landmarks (head pose and eye gaze, mouth opening), blinking, talking, expressions, ',
          'chest breathing, and whether a face (or more than one) is in view. These move the character and, through the Auto intents, the dial. Nothing else.',
        ),
        h(
          'li',
          {},
          'Pulse and breathing rate are requested ',
          h(
            'strong',
            {},
            'only if you switch on the Comfort shield (or turn on a custom intent that uses them)',
          ),
          ', and are only ever used to ',
          h('em', {}, 'lower'),
          ' how much of you is shown. Your body can only make Stand-In show less of you, never more.',
        ),
        h(
          'li',
          {},
          'Frames are processed on this computer by the Presage SmartSpectra SDK. ',
          h('strong', {}, 'Nothing is recorded unless you ask'),
          ': no video, images, audio, landmarks or signal values are stored. Calibration and intent tuning live in memory and are discarded on quit. Only your character, mode and intent settings are saved, plus learned intent thresholds if you opt in under Advanced.',
        ),
        h(
          'li',
          {},
          'If you choose ',
          h('strong', {}, 'Record a demo'),
          ' or ',
          h('strong', {}, 'Save telemetry'),
          ', the clip and the signals Presage returned for it (face landmarks, talking, blinking, expressions, face in view; pulse and breathing only if you tick them) are saved on this computer in your demo library. You are asked every time, nothing is uploaded, and you can delete demos in Advanced.',
        ),
        h(
          'li',
          {},
          'Presage telemetry is switched off. The SDK contacts Presage only to check the API key. See ',
          link(EXTERNAL_LINKS.presagePrivacy, "Presage's Telemetry and Privacy page"),
          '.',
        ),
        h('li', {}, 'No numbers are ever shown or sent, and Stand-In Studio never labels your feelings.'),
        h(
          'li',
          {},
          'Honest note: others may notice your video fading and wonder why. Fades have many everyday causes (listening, looking away, eating, stepping out), and the Comfort shield is off by default.',
        ),
        h('li', {}, 'You can stop the camera at any time, and "Hide me" always shows only the character.'),
        h('li', {}, 'This is not a medical or wellness tool and makes no diagnosis.'),
      ),
      h(
        'div',
        { class: 'row consent-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'primary',
            id: 'consent-camera',
            disabled: !opts.cameraAvailable,
            onclick: () => onChoice('camera'),
          },
          'Start with my camera',
        ),
        h(
          'button',
          { type: 'button', id: 'consent-clip', onclick: () => fileInput.click() },
          icon('play', 16),
          'Use a recorded video…',
        ),
        fileInput,
        h(
          'button',
          {
            type: 'button',
            id: 'consent-demo',
            onclick: () => {
              const id = picker?.value ?? '';
              onChoice(id ? { kind: 'replay', id } : 'demo');
            },
          },
          'Try Demo mode (no camera)',
        ),
        picker
          ? h(
              'label',
              { class: 'demo-pick', for: 'consent-demo-pick' },
              h('span', { class: 'hint' }, 'Demo:'),
              picker,
            )
          : null,
      ),
      h(
        'p',
        { class: 'hint', id: 'consent-clip-hint' },
        opts.cameraAvailable
          ? 'A recorded video is analysed by Presage like your camera, so you can save its telemetry as a demo that replays offline, with no API use, on later runs. To record a new clip, start with your camera and use Record a demo.'
          : 'Without an API key a recorded video only plays through; add a key to analyse it and save its telemetry as a demo.',
      ),
      opts.cameraAvailable
        ? null
        : h(
            'p',
            { class: 'hint', id: 'consent-nokey' },
            'Using your camera needs a Presage API key: set the PRESAGE_API_KEY environment variable, or paste a key in Settings after starting Demo mode. Get one at ',
            link(EXTERNAL_LINKS.presageKey, 'physiology.presagetech.com'),
            '.',
          ),
    );
  }
}
