import { EXTERNAL_LINKS } from '../../../shared/ipc';
import { type Component, h } from '../dom';

export type ConsentChoice = 'camera' | 'demo';

/**
 * Plain-language consent (REQUIREMENT §6). Shown at every launch; the camera starts only
 * after "Start with my camera".
 */
export class ConsentScreen implements Component {
  readonly el: HTMLElement;

  constructor(
    opts: { cameraAvailable: boolean; openExternal: (url: string) => void },
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
          h('strong', {}, 'Nothing is recorded'),
          ': no video, images, audio, landmarks or signal values are stored. Calibration and intent tuning live in memory and are discarded on quit. Only your character, mode and intent settings are saved, plus learned intent thresholds if you opt in under Advanced.',
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
        { class: 'row' },
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
          { type: 'button', id: 'consent-demo', onclick: () => onChoice('demo') },
          'Try Demo mode (no camera)',
        ),
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
