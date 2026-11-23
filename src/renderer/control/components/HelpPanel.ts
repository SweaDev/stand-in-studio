import { COMMANDS } from '../../../core/stage/commands';
import { HOTKEYS, displayAccelerator } from '../../../shared/hotkeys';
import { EXTERNAL_LINKS } from '../../../shared/ipc';
import { INTENTS_GUIDE } from '../../../shared/signalCatalog';
import { type Component, h } from '../dom';
import { type IconName, icon } from '../icons';
import { DEMO_KEYS } from './Overrides';

export interface HelpActions {
  startTour(): void;
  openExternal(url: string): void;
}

/**
 * Help tab: getting started, what the modes do, every keyboard shortcut, how the stage
 * reaches the meeting, privacy in brief, and the tour again.
 */
export class HelpPanel implements Component {
  readonly el: HTMLElement;

  constructor(opts: { platform: string; version: string; demo: boolean }, a: HelpActions) {
    const link = (url: string, text: string) =>
      h(
        'a',
        {
          href: url,
          class: 'link-external',
          onclick: (e: Event) => {
            e.preventDefault();
            a.openExternal(url);
          },
        },
        text,
        icon('external', 14),
      );
    const section = (title: string, id: string, ...children: (HTMLElement | null)[]) =>
      h('div', { class: 'group help-section', id }, h('h3', {}, title), ...children);
    const step = (ico: IconName, title: string, text: string) =>
      h(
        'li',
        {},
        h('span', { class: 'help-step-icon', 'aria-hidden': 'true' }, icon(ico, 18)),
        h('div', {}, h('strong', {}, title), h('p', {}, text)),
      );
    const keyRow = (key: string, label: string) =>
      h('tr', {}, h('td', {}, h('kbd', {}, key)), h('td', {}, label));
    const help = 'F1 or ?';

    this.el = h(
      'div',
      { class: 'help-panel' },
      h(
        'div',
        { class: 'help-hero' },
        h(
          'div',
          {},
          h('strong', {}, 'New to Stand-In Studio?'),
          h('p', {}, 'A one-minute tour of the main window.'),
        ),
        h(
          'button',
          { type: 'button', class: 'primary', id: 'start-tour', onclick: () => a.startTour() },
          icon('sparkle', 16),
          'Take the tour',
        ),
      ),
      section(
        'Getting started',
        'help-start',
        h(
          'ol',
          { class: 'help-steps' },
          step(
            'video',
            'Choose the input',
            'Your camera, a video file or a demo. Switch any time in the Camera tab; the status bar shows what is on.',
          ),
          step(
            'sliders',
            'Decide how much of you shows',
            'Turn the dial or pick a mode. Auto moves the dial for you, from the intents in the Auto tab.',
          ),
          step(
            'broadcast',
            'Send the stage to your meeting',
            'Pick “Stand-In Camera” (Linux) or “OBS Virtual Camera” as your camera, or share the Virtual Stage window.',
          ),
          step('eye', 'Hide me, any time', 'One click or one shortcut shows only your character, instantly.'),
        ),
      ),
      section(
        'Modes',
        'help-modes',
        h(
          'dl',
          { class: 'help-modes' },
          h('dt', {}, 'Character'),
          h('dd', {}, 'Only the drawn character. Your video is at 0%.'),
          h('dt', {}, 'Camera'),
          h('dd', {}, 'Your video at 100%. Presage pauses: nothing is analysed.'),
          h('dt', {}, 'Blend'),
          h('dd', {}, 'Your video at the opacity on the dial, with the character over it.'),
          h('dt', {}, 'Auto'),
          h('dd', {}, 'Stand-In moves the dial from what you are doing, up to the max you set.'),
        ),
      ),
      section(
        'Keyboard shortcuts',
        'hotkey-help',
        h('p', { class: 'hint' }, 'Global: these work even while your meeting app has focus.'),
        h(
          'table',
          { class: 'keys-table' },
          h(
            'tbody',
            {},
            Object.values(COMMANDS).map((c) =>
              keyRow(displayAccelerator(HOTKEYS[c.name], opts.platform), c.label),
            ),
            keyRow(help, 'Open Help (this tab)'),
          ),
        ),
        h(
          'p',
          { class: 'hint' },
          opts.demo
            ? 'Demo mode keys (this window): act out a situation.'
            : 'Demo mode keys (this window, in Demo mode only):',
        ),
        h(
          'table',
          { class: 'keys-table' },
          h(
            'tbody',
            {},
            DEMO_KEYS.map(([k, l]) => keyRow(k, l)),
          ),
        ),
      ),
      section(
        'Sending to your meeting',
        'help-send',
        h(
          'p',
          {},
          'The meeting sees exactly what the Virtual Stage shows. On Linux the Stand-In Camera sends it as a webcam, after a one-time setup. On any platform, OBS can capture the Virtual Stage window and send it as “OBS Virtual Camera”, or you can share that window as a screen share. Use “Show test pattern” to check the meeting sees it.',
        ),
      ),
      section(
        'Privacy in brief',
        'help-privacy',
        h(
          'ul',
          { class: 'help-list' },
          h('li', {}, 'Frames are analysed on this computer by the Presage SDK; numbers never leave it.'),
          h('li', {}, 'Your body can only make Stand-In show less of you, never more.'),
          h('li', {}, 'Nothing is recorded unless you save a demo, and demos stay on this computer.'),
          h('li', {}, 'Turn the camera or Presage off from the status bar at any time.'),
        ),
      ),
      section(
        'Learn more',
        'help-links',
        h(
          'div',
          { class: 'row' },
          link(EXTERNAL_LINKS.guide, 'User guide'),
          link(INTENTS_GUIDE, 'How intents work'),
          link(EXTERNAL_LINKS.presagePrivacy, 'Presage telemetry and privacy'),
        ),
        h('p', { class: 'hint', id: 'help-version' }, `Stand-In Studio ${opts.version}`),
      ),
    );
  }
}
