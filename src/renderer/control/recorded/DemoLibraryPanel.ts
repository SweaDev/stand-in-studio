import {
  type DemoLibraryListing,
  type DemoSummary,
  VIDEO_TYPES,
  formatDuration,
  videoExt,
} from '../../../shared/demos';
import type { DemoLibraryApi } from '../../../shared/ipc';
import { sanitizeTelemetry } from '../../../shared/telemetry';
import { type Component, h } from '../dom';
import { icon } from '../icons';

export interface DemoLibraryActions {
  /** Replays a saved demo now (restarts sensing). */
  play(id: string): void;
}

const ACCEPT_VIDEO = Object.keys(VIDEO_TYPES)
  .map((e) => `.${e}`)
  .join(',');

/**
 * Advanced → Demo library: where saved demos live (a folder the user approved, by default
 * the app's data folder), and play, rename, export, delete and import. Demos are never part
 * of the app's repository.
 */
export class DemoLibraryPanel implements Component {
  readonly el: HTMLElement;
  private readonly folder: HTMLElement;
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private readonly resetBtn: HTMLButtonElement;
  private confirmDelete: string | null = null;

  constructor(
    private readonly api: DemoLibraryApi,
    private readonly actions: DemoLibraryActions,
  ) {
    this.folder = h('code', { class: 'demo-folder', id: 'demo-folder' });
    this.list = h('ul', { class: 'demo-list', id: 'demo-list', 'aria-label': 'Saved demos' });
    this.status = h('p', { class: 'telemetry-status', id: 'demo-library-status', role: 'status' });
    this.resetBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn-small',
        id: 'demo-folder-default',
        onclick: () => void this.run(() => this.api.resetFolder()),
      },
      'Use default folder',
    );
    const importVideo = h('input', { type: 'file', id: 'demo-import-video', accept: ACCEPT_VIDEO });
    const importJson = h('input', {
      type: 'file',
      id: 'demo-import-telemetry',
      accept: '.json,application/json',
    });
    const importBtn = h(
      'button',
      { type: 'button', id: 'demo-import', class: 'btn-small' },
      icon('plus', 14),
      'Import',
    );
    importBtn.addEventListener('click', () => void this.importFiles(importVideo, importJson));
    this.el = h(
      'div',
      { class: 'group', id: 'group-demo-library' },
      h('h3', {}, 'Demo library'),
      h(
        'p',
        { class: 'hint' },
        'Saved demos (a clip plus the signals Presage read from it) replay offline, with no API use, from Demo mode on the start screen.',
      ),
      h(
        'div',
        { class: 'callout callout-warning', role: 'note' },
        icon('warning'),
        h(
          'p',
          {},
          h('strong', {}, 'Privacy: '),
          'demos contain your video and your face landmarks (face geometry), and pulse and breathing if you ticked them. They are kept only in this folder on this computer and are never uploaded. Share a demo only with people you trust.',
        ),
      ),
      h('p', { class: 'hint' }, 'Folder: ', this.folder),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn-small',
            id: 'demo-folder-change',
            onclick: () => void this.run(() => this.api.chooseFolder()),
          },
          'Change folder…',
        ),
        this.resetBtn,
        h(
          'button',
          {
            type: 'button',
            class: 'btn-small',
            id: 'demo-folder-open',
            onclick: () => void this.api.openFolder(),
          },
          icon('external', 14),
          'Open folder',
        ),
      ),
      this.list,
      h(
        'details',
        { class: 'demo-import' },
        h('summary', {}, 'Import a demo (video + telemetry file)'),
        h('div', { class: 'field' }, h('label', { for: 'demo-import-video' }, 'Video'), importVideo),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'demo-import-telemetry' }, 'Telemetry (.json)'),
          importJson,
        ),
        importBtn,
      ),
      this.status,
    );
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.render(await this.api.list());
    } catch (err) {
      this.say(`Could not read the demo library: ${(err as Error).message}`, 'error');
    }
  }

  private async run(fn: () => Promise<DemoLibraryListing | null>): Promise<void> {
    try {
      const l = await fn();
      if (l) this.render(l);
    } catch (err) {
      this.say((err as Error).message, 'error');
    }
  }

  private say(text: string, tone: 'ok' | 'error' | '' = ''): void {
    this.status.textContent = text;
    this.status.className = `telemetry-status${tone ? ` is-${tone}` : ''}`;
  }

  private render(l: DemoLibraryListing): void {
    this.folder.textContent = l.dir + (l.isDefault ? ' (default)' : '');
    this.resetBtn.hidden = l.isDefault;
    this.list.replaceChildren(
      ...l.demos.map((d) => this.row(d)),
      ...(l.demos.length === 0 ? [h('li', { class: 'hint' }, 'No saved demos yet.')] : []),
      ...l.broken.map((b) => h('li', { class: 'hint' }, `“${b}” could not be read and is skipped.`)),
    );
  }

  private row(d: DemoSummary): HTMLElement {
    const name = h('strong', {}, d.name);
    const title = h(
      'div',
      { class: 'demo-title' },
      name,
      h(
        'span',
        { class: 'demo-meta' },
        `${formatDuration(d.durationMs)} · ${d.frames} frames · ${(d.videoBytes / 1e6).toFixed(1)} MB${
          d.createdAt ? ` · ${new Date(d.createdAt).toLocaleDateString()}` : ''
        }`,
      ),
    );
    const btn = (label: string, cls: string, fn: () => void, ic?: Parameters<typeof icon>[0]) =>
      h(
        'button',
        { type: 'button', class: `btn-small ${cls}`, 'data-demo': d.id, onclick: fn },
        ...(ic ? [icon(ic, 14)] : []),
        label,
      );
    const confirming = this.confirmDelete === d.id;
    const rename = () => {
      const input = h('input', {
        value: d.name,
        'aria-label': 'New name',
        class: 'demo-rename-input',
        maxlength: 60,
      });
      const done = (save: boolean) =>
        void (save ? this.api.rename(d.id, input.value) : Promise.resolve(null))
          .then(() => this.refresh())
          .catch((e: Error) => this.say(e.message, 'error'));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      });
      input.addEventListener('blur', () => done(true));
      name.replaceWith(input);
      input.select();
    };
    return h(
      'li',
      { class: 'demo-row', 'data-demo': d.id },
      title,
      d.includesBody ? h('span', { class: 'chip chip-warning' }, icon('heart', 12), 'body signals') : null,
      btn('Play', 'demo-play', () => this.actions.play(d.id), 'play'),
      btn('Rename', 'demo-rename', rename, 'edit'),
      btn(
        'Export…',
        'demo-export',
        () =>
          void this.api
            .exportTo(d.id)
            .then((files) => files && this.say(`Exported to ${files.join(' and ')}.`, 'ok'))
            .catch((e: Error) => this.say(e.message, 'error')),
        'external',
      ),
      btn(
        confirming ? 'Confirm delete' : 'Delete',
        `demo-delete${confirming ? ' danger' : ''}`,
        () => {
          if (!confirming) {
            this.confirmDelete = d.id;
            void this.refresh();
            return;
          }
          this.confirmDelete = null;
          void this.api
            .delete(d.id)
            .then(() => this.say(`Deleted “${d.name}”.`, 'ok'))
            .catch((e: Error) => this.say(e.message, 'error'))
            .finally(() => void this.refresh());
        },
        'trash',
      ),
    );
  }

  private async importFiles(videoIn: HTMLInputElement, jsonIn: HTMLInputElement): Promise<void> {
    const video = videoIn.files?.[0];
    const json = jsonIn.files?.[0];
    if (!video || !json) {
      this.say('Choose both the video and its telemetry file.', 'error');
      return;
    }
    const ext = videoExt(video.name);
    if (!ext) {
      this.say('Choose a WebM, MP4, MOV, MKV or OGV video.', 'error');
      return;
    }
    try {
      const telemetry = sanitizeTelemetry(JSON.parse(await json.text()));
      const saved = await this.api.save({
        name: video.name.replace(/\.[^.]+$/, ''),
        telemetry,
        video: new Uint8Array(await video.arrayBuffer()),
        ext,
      });
      videoIn.value = '';
      jsonIn.value = '';
      this.say(`Imported “${saved.name}” (${saved.frames} frames).`, 'ok');
      await this.refresh();
    } catch (err) {
      this.say(`Not imported: ${(err as Error).message}`, 'error');
    }
  }
}
