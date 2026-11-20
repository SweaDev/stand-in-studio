import { type Component } from '../dom';
import { keyStep, pointToValue, valueToAngle } from './dialMath';

const NS = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

function arcPath(r: number, from: number, to: number): string {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${100 + r * Math.cos(a)} ${100 + r * Math.sin(a)}`;
  };
  const large = to - from > 180 ? 1 : 0;
  return `M ${p(from)} A ${r} ${r} 0 ${large} 1 ${p(to)}`;
}

/**
 * The presence dial (REQUIREMENT §2): one big round control from fully stand-in (0%) to
 * fully you (100%). Turning it switches to Blend; in Auto the needle moves on its own. The
 * lantern icon brightens as more character shows; the face icon as more feed shows.
 */
export class PresenceDial implements Component {
  readonly el: HTMLElement;
  private readonly needle: SVGLineElement;
  private readonly fill: SVGPathElement;
  private readonly lantern: SVGGElement;
  private readonly face: SVGGElement;
  private readonly label: HTMLElement;
  private value = 0;
  /** Last value the user asked for; keyboard steps continue from it during a fade. */
  private requested: { v: number; at: number } | null = null;
  private dragging = false;

  constructor(onTurnRaw: (v: number) => void) {
    const onTurn = (v: number) => {
      this.requested = { v, at: performance.now() };
      onTurnRaw(v);
    };
    const root = svg('svg', { viewBox: '0 0 200 200', width: 240, height: 240, 'aria-hidden': 'true' });
    root.append(
      svg('path', {
        d: arcPath(80, -135, 135),
        stroke: '#4a4552',
        'stroke-width': 16,
        fill: 'none',
        'stroke-linecap': 'round',
      }),
    );
    this.fill = svg('path', {
      d: '',
      stroke: '#f2a65a',
      'stroke-width': 16,
      fill: 'none',
      'stroke-linecap': 'round',
    });
    root.append(this.fill);
    for (const v of [0.25, 0.5, 0.75]) {
      const a = ((valueToAngle(v) - 90) * Math.PI) / 180;
      root.append(
        svg('circle', { cx: 100 + 98 * Math.cos(a), cy: 100 + 98 * Math.sin(a), r: 2.5, fill: '#c9c1b4' }),
      );
    }
    // Lantern icon (left) and face icon (right).
    this.lantern = svg('g', { transform: 'translate(52 150)' });
    this.lantern.append(
      svg('ellipse', { cx: 0, cy: 0, rx: 11, ry: 13, fill: '#f4a259', stroke: '#2d2a32', 'stroke-width': 2 }),
      svg('rect', { x: -6, y: -17, width: 12, height: 5, fill: '#5b3a29' }),
    );
    this.face = svg('g', { transform: 'translate(148 150)' });
    this.face.append(
      svg('circle', { cx: 0, cy: -2, r: 11, fill: '#c69c7b', stroke: '#2d2a32', 'stroke-width': 2 }),
      svg('path', { d: 'M -14 14 Q 0 2 14 14', fill: '#3d5a80', stroke: '#2d2a32', 'stroke-width': 2 }),
    );
    this.needle = svg('line', {
      x1: 100,
      y1: 100,
      x2: 100,
      y2: 38,
      stroke: '#f4efe6',
      'stroke-width': 5,
      'stroke-linecap': 'round',
    });
    root.append(
      this.lantern,
      this.face,
      this.needle,
      svg('circle', { cx: 100, cy: 100, r: 9, fill: '#f4efe6' }),
    );

    this.label = document.createElement('div');
    this.label.className = 'dial-label';
    this.el = document.createElement('div');
    this.el.className = 'dial';
    this.el.id = 'presence-dial';
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-label', 'Presence dial: how much of your real video the meeting sees');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.el.append(root, this.label);

    const fromPointer = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      const v = pointToValue(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      onTurn(Math.round(v * 100) / 100);
    };
    root.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      root.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    root.addEventListener('pointermove', (e) => this.dragging && fromPointer(e));
    root.addEventListener('pointerup', () => (this.dragging = false));
    this.el.addEventListener('keydown', (e) => {
      const base =
        this.requested && performance.now() - this.requested.at < 1500 ? this.requested.v : this.value;
      const next = keyStep(e.key, base);
      if (next === null) return;
      e.preventDefault();
      onTurn(next);
    });
    this.set(0, 'character');
  }

  /** Shows what the meeting sees: called every frame with the displayed feed opacity. */
  set(v: number, modeLabel: string): void {
    const rounded = Math.round(v * 100);
    if (rounded === Math.round(this.value * 100) && this.label.dataset.mode === modeLabel) return;
    this.value = v;
    const angle = valueToAngle(v);
    this.needle.setAttribute('transform', `rotate(${angle} 100 100)`);
    this.fill.setAttribute('d', v > 0.005 ? arcPath(80, -135, angle) : '');
    this.lantern.setAttribute('opacity', String(0.35 + 0.65 * (1 - v)));
    this.face.setAttribute('opacity', String(0.35 + 0.65 * v));
    this.el.setAttribute('aria-valuenow', String(rounded));
    this.el.setAttribute('aria-valuetext', `${rounded}% of your video, ${modeLabel} mode`);
    this.label.dataset.mode = modeLabel;
    this.label.textContent = `${rounded}% you`;
  }
}
