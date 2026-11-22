import { formatDuration } from '../../../shared/demos';
import { type Component, h } from '../dom';
import { icon } from '../icons';
import type { RecordedFeed } from './RecordedFeed';

/** Play/pause, scrub, time and loop for a recorded clip. Scrubbing is locked while saving. */
export class TransportBar implements Component {
  readonly el: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly scrub: HTMLInputElement;
  private readonly time: HTMLElement;
  private readonly loop: HTMLInputElement;
  private locked = false;

  constructor(
    private readonly clip: RecordedFeed,
    extra: (HTMLElement | null)[] = [],
  ) {
    this.playBtn = h('button', { type: 'button', class: 'icon-btn', id: 'clip-play', 'aria-label': 'Play' });
    this.playBtn.addEventListener('click', () => {
      if (this.clip.playing) this.clip.pause();
      else void this.clip.play();
    });
    this.scrub = h('input', {
      type: 'range',
      id: 'clip-scrub',
      min: 0,
      max: Math.max(1, Math.round(clip.durationMs)),
      step: 100,
      value: 0,
      'aria-label': 'Position in the clip',
    });
    this.scrub.addEventListener('input', () => this.clip.seek(Number(this.scrub.value)));
    this.time = h('span', { class: 'clip-time', id: 'clip-time' });
    this.loop = h('input', { type: 'checkbox', id: 'clip-loop', checked: clip.loop });
    this.loop.addEventListener('change', () => (this.clip.loop = this.loop.checked));
    this.el = h(
      'div',
      { class: 'transport', role: 'group', 'aria-label': `Recorded clip: ${clip.name}` },
      h('div', { class: 'transport-row' }, this.playBtn, this.scrub, this.time),
      h(
        'div',
        { class: 'transport-row' },
        h('span', { class: 'clip-name', title: clip.name }, clip.name),
        h('label', { class: 'clip-loop', for: 'clip-loop' }, this.loop, ' Loop'),
        ...extra,
      ),
    );
    clip.onChange(() => this.update());
    this.update();
  }

  /** While telemetry is saved the clip must play once, start to end. */
  lock(on: boolean): void {
    this.locked = on;
    this.update();
  }

  update(): void {
    const playing = this.clip.playing;
    this.playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 18));
    this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.playBtn.disabled = this.locked;
    this.scrub.disabled = this.locked;
    this.loop.disabled = this.locked;
    this.loop.checked = this.clip.loop;
    this.scrub.max = String(Math.max(1, Math.round(this.clip.durationMs)));
    this.scrub.value = String(Math.round(this.clip.mediaMs));
    this.time.textContent = `${formatDuration(this.clip.mediaMs)} / ${formatDuration(this.clip.durationMs)}`;
  }
}
