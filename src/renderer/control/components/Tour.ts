import { h } from '../dom';
import { icon } from '../icons';

export interface TourStep {
  /** The element to spotlight (a step whose target is missing or hidden is skipped). */
  target: () => HTMLElement | null;
  title: string;
  body: string;
  /** Runs before the step is shown (e.g. selects a tab). */
  before?: () => void;
}

const GAP = 12;

function visible(el: HTMLElement | null): el is HTMLElement {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * A small dependency-free spotlight tour: dims the window except one element, with a
 * popover that explains it. Keyboard: ← and → step, Esc ends; focus stays in the popover.
 */
export class Tour {
  readonly el: HTMLElement;
  private readonly spot: HTMLElement;
  private readonly pop: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly count: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private i = -1;
  /** The steps whose target is on screen when the tour starts. */
  private active: TourStep[] = [];
  private readonly reposition = () => this.place();
  private returnFocus: HTMLElement | null = null;

  constructor(
    private readonly steps: TourStep[],
    private readonly onEnd: (completed: boolean) => void,
  ) {
    this.spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
    this.title = h('h2', { id: 'tour-title' });
    this.body = h('p', { id: 'tour-body' });
    this.count = h('span', { class: 'tour-count', id: 'tour-count' });
    this.back = h('button', { type: 'button', id: 'tour-back', onclick: () => this.go(-1) }, 'Back');
    this.next = h('button', { type: 'button', class: 'primary', id: 'tour-next', onclick: () => this.go(1) });
    const skip = h(
      'button',
      {
        type: 'button',
        class: 'icon-btn tour-skip',
        id: 'tour-skip',
        'aria-label': 'End the tour',
        onclick: () => this.end(false),
      },
      icon('close', 16),
    );
    this.pop = h(
      'div',
      {
        class: 'tour-pop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'tour-title',
        'aria-describedby': 'tour-body',
      },
      h('div', { class: 'tour-head' }, this.count, skip),
      this.title,
      this.body,
      h('div', { class: 'tour-actions' }, this.back, this.next),
    );
    this.el = h('div', { class: 'tour', id: 'tour' }, h('div', { class: 'tour-block' }), this.spot, this.pop);
    this.el.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen(): boolean {
    return this.el.isConnected;
  }

  start(): void {
    if (this.isOpen) return;
    this.returnFocus = document.activeElement as HTMLElement | null;
    document.body.append(this.el);
    window.addEventListener('resize', this.reposition);
    window.addEventListener('scroll', this.reposition, true);
    // Steps behind a tab (with `before`) are kept: their tab is selected when shown.
    this.active = this.steps.filter((s) => s.before !== undefined || visible(s.target()));
    this.i = -1;
    this.go(1);
  }

  private go(dir: 1 | -1): void {
    const i = this.i + dir;
    if (i >= this.active.length) return this.end(true);
    if (i < 0) return;
    this.i = i;
    const s = this.active[i] as TourStep;
    s.before?.();
    this.count.textContent = `${i + 1} of ${this.active.length}`;
    this.title.textContent = s.title;
    this.body.textContent = s.body;
    this.back.disabled = i === 0;
    this.next.textContent = i === this.active.length - 1 ? 'Done' : 'Next';
    s.target()?.scrollIntoView({ block: 'center', inline: 'nearest' });
    this.place();
    this.next.focus();
  }

  private place(): void {
    const t = this.active[this.i]?.target() ?? null;
    if (!visible(t)) return;
    const r = t.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.spot.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = Math.min(360, vw - 2 * GAP);
    this.pop.style.width = `${pw}px`;
    const ph = this.pop.offsetHeight;
    const clampTop = (t: number) => Math.max(GAP, Math.min(vh - ph - GAP, t));
    const clampLeft = (l: number) => Math.max(GAP, Math.min(vw - pw - GAP, l));
    let top: number;
    let left: number;
    if (r.bottom + pad + GAP + ph <= vh - GAP) {
      top = r.bottom + pad + GAP; // below
      left = clampLeft(r.left + r.width / 2 - pw / 2);
    } else if (r.top - pad - GAP - ph >= GAP) {
      top = r.top - pad - GAP - ph; // above
      left = clampLeft(r.left + r.width / 2 - pw / 2);
    } else if (r.right + pad + GAP + pw <= vw - GAP) {
      left = r.right + pad + GAP; // right
      top = clampTop(r.top);
    } else if (r.left - pad - GAP - pw >= GAP) {
      left = r.left - pad - GAP - pw; // left
      top = clampTop(r.top);
    } else {
      left = clampLeft(r.left + GAP);
      top = clampTop(r.top + GAP);
    }
    this.pop.style.left = `${left}px`;
    this.pop.style.top = `${top}px`;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.end(false);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.go(-1);
    } else if (e.key === 'Tab') {
      // Keep focus in the popover.
      const f = [...this.pop.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      const at = f.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      const n = (at + (e.shiftKey ? -1 : 1) + f.length) % f.length;
      f[n]?.focus();
    }
    e.stopPropagation();
  }

  end(completed: boolean): void {
    if (!this.isOpen) return;
    window.removeEventListener('resize', this.reposition);
    window.removeEventListener('scroll', this.reposition, true);
    this.el.remove();
    this.returnFocus?.focus?.();
    this.onEnd(completed);
  }
}
