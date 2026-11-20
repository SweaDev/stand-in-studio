import { STAGE_HEIGHT, STAGE_WIDTH, STAGE_WINDOW_TITLE } from '../../../shared/app';
import { STAGE_FRAME_NAME } from '../../../shared/ipc';

/**
 * Owns the stage window: a same-origin about:blank child of the control window, so this
 * renderer can draw the shared camera stream straight into its canvas. OBS captures it by
 * its title, "Stand-In Stage".
 */
export class StageHost {
  private win: Window | null = null;
  private canvas: HTMLCanvasElement | null = null;

  /** Opens the stage window (or focuses it if already open). */
  open(): HTMLCanvasElement | null {
    if (this.win && !this.win.closed && this.canvas) {
      this.win.focus();
      return this.canvas;
    }
    const w = window.open('about:blank', STAGE_FRAME_NAME);
    if (!w) return null;
    const doc = w.document;
    doc.title = STAGE_WINDOW_TITLE;
    doc.body.innerHTML = '';
    const style = doc.createElement('style');
    style.textContent = `
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: none; }
      canvas { width: 100vw; height: 100vh; object-fit: contain; display: block; -webkit-app-region: drag; }`;
    doc.head.append(style);
    const canvas = doc.createElement('canvas');
    canvas.id = 'stage';
    canvas.width = STAGE_WIDTH;
    canvas.height = STAGE_HEIGHT;
    doc.body.append(canvas);
    this.win = w;
    this.canvas = canvas;
    return canvas;
  }

  /** The stage canvas, or null if the window was closed. */
  get surface(): HTMLCanvasElement | null {
    if (!this.win || this.win.closed) {
      this.win = null;
      this.canvas = null;
    }
    return this.canvas;
  }

  get isOpen(): boolean {
    return this.surface !== null;
  }

  close(): void {
    this.win?.close();
    this.win = null;
    this.canvas = null;
  }
}
