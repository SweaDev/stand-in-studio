import type { CameraDevice } from '../../../sensing/cameraFilter';
import { type DemoSummary, VIDEO_TYPES, formatDuration } from '../../../shared/demos';
import { EXTERNAL_LINKS } from '../../../shared/ipc';
import { type Component, h } from '../dom';
import { type IconName, icon } from '../icons';

/**
 * camera: live webcam; demo: simulated person; clip: a video file (optionally saving its
 * telemetry as a demo); replay: a saved demo.
 */
export type ConsentChoice =
  'camera' | 'demo' | { kind: 'clip'; file: File; saveTelemetry?: boolean } | { kind: 'replay'; id: string };

const ACCEPT = Object.keys(VIDEO_TYPES)
  .map((e) => `.${e}`)
  .join(',');

/**
 * Plain-language consent (REQUIREMENT §6), shown at every launch. Five key points up front,
 * every detail one click away, then three ways to start. The camera starts only after
 * "Start with my camera".
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
      /** Lists physical cameras (a picker is shown when there is more than one). */
      listCameras?: () => Promise<CameraDevice[]>;
      /** The camera used last time. */
      cameraId?: string | null;
      /** Remembers the camera picked here. */
      pickCamera?: (deviceId: string) => void;
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
    const point = (ico: IconName, strong: string, rest: string) =>
      h(
        'li',
        {},
        h('span', { class: 'point-icon', 'aria-hidden': 'true' }, icon(ico, 18)),
        h('span', {}, h('strong', {}, strong), ' ', rest),
      );

    // ---- Camera card
    const cameraSelect = h('select', { id: 'consent-camera-pick', 'aria-label': 'Which camera' });
    const cameraRow = h('div', { class: 'card-field', hidden: true }, cameraSelect);
    if (opts.cameraAvailable && opts.listCameras) {
      void opts
        .listCameras()
        .then((cams) => {
          if (cams.length < 2) return;
          cameraSelect.replaceChildren(
            ...cams.map((c) =>
              h('option', { value: c.deviceId, selected: c.deviceId === opts.cameraId }, c.label),
            ),
          );
          cameraRow.hidden = false;
        })
        .catch(() => undefined);
    }
    cameraSelect.addEventListener('change', () => opts.pickCamera?.(cameraSelect.value));

    // ---- Video file card
    const saveTelemetry = h('input', { type: 'checkbox', id: 'consent-save-telemetry' });
    const fileInput = h('input', {
      type: 'file',
      id: 'consent-clip-file',
      accept: ACCEPT,
      hidden: true,
      'aria-label': 'Choose a video file',
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) onChoice({ kind: 'clip', file, saveTelemetry: saveTelemetry.checked });
    });

    // ---- Demo card
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

    const sourceCard = (
      id: string,
      ico: IconName,
      title: string,
      blurb: string,
      ...body: (HTMLElement | null)[]
    ) =>
      h(
        'div',
        { class: 'source-card', id },
        h('div', { class: 'source-icon', 'aria-hidden': 'true' }, icon(ico, 22)),
        h('h3', {}, title),
        h('p', { class: 'source-blurb' }, blurb),
        ...body,
      );

    this.el = h(
      'section',
      { class: 'consent', 'aria-labelledby': 'consent-title', role: 'dialog', 'aria-modal': 'true' },
      h('h2', { id: 'consent-title' }, 'Before your camera starts'),
      h('p', { class: 'lead' }, 'Stand-In Studio lets you decide how much of you each call sees. In short:'),
      h(
        'ul',
        { class: 'key-points' },
        point('user', 'Character mode', 'sends only the drawn character to the meeting.'),
        point(
          'video',
          'Camera, Blend and Auto',
          'send your real video, exactly as the Virtual Stage shows it, at the opacity on the dial.',
        ),
        point(
          'scan',
          'Your face movement is read on this computer.',
          'Pulse and breathing only if you switch on the Comfort shield (or an intent that uses them), and they can only show less of you.',
        ),
        point(
          'shield',
          'Nothing is recorded unless you save a demo.',
          'Turn the camera or Presage off any time; Hide me always shows only the character.',
        ),
        point(
          'info',
          'Honest note:',
          'others may notice your video fading. This is not a medical or wellness tool.',
        ),
      ),
      h(
        'details',
        { class: 'consent-more', id: 'consent-more' },
        h('summary', {}, 'All privacy details'),
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
            ', at the opacity shown on the dial, to the meeting: through the Stand-In Camera (a virtual webcam on Linux), OBS, or a screen share of the Virtual Stage window. Each sends exactly what the Virtual Stage shows.',
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
      ),
      h(
        'div',
        { class: 'source-cards', role: 'group', 'aria-label': 'How to start' },
        sourceCard(
          'card-camera',
          'camera',
          'Your camera',
          'Live, analysed by Presage on this computer.',
          cameraRow,
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
        ),
        sourceCard(
          'card-clip',
          'video',
          'A video file',
          opts.cameraAvailable
            ? 'Analysed like your camera. Save its telemetry to replay it offline later.'
            : 'Plays through without analysis (no API key).',
          opts.cameraAvailable
            ? h(
                'label',
                { class: 'check card-field', for: 'consent-save-telemetry' },
                saveTelemetry,
                'Save its telemetry as a demo',
              )
            : null,
          h(
            'button',
            { type: 'button', id: 'consent-clip', onclick: () => fileInput.click() },
            icon('folder', 16),
            'Choose a video…',
          ),
          fileInput,
        ),
        sourceCard(
          'card-demo',
          'film',
          'Demo mode',
          demos.length > 0
            ? 'A simulated person, or one of your saved demos. No camera, no API use.'
            : 'A simulated person. No camera, no API use.',
          picker ? h('div', { class: 'card-field' }, picker) : null,
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
            'Try Demo mode',
          ),
        ),
      ),
      h(
        'p',
        { class: 'hint', id: 'consent-clip-hint' },
        opts.cameraAvailable
          ? 'Saved demos replay offline with no API use, so you can test and tune intents on the same footage. Record one from your camera in the Camera tab.'
          : 'Without an API key a recorded video only plays through; add a key to analyse it and save its telemetry as a demo.',
      ),
      opts.cameraAvailable
        ? null
        : h(
            'div',
            { class: 'callout callout-info', id: 'consent-nokey', role: 'note' },
            icon('info'),
            h(
              'p',
              {},
              h('strong', {}, 'No Presage API key. '),
              'Set the PRESAGE_API_KEY environment variable, or paste a key in the Camera tab after starting Demo mode. Get one at ',
              link(EXTERNAL_LINKS.presageKey, 'physiology.presagetech.com'),
              '.',
            ),
          ),
    );
  }
}
