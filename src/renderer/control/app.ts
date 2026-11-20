import '../../render/characters';
import { StudioEngine } from '../../core/StudioEngine';
import { SystemClock } from '../../core/util/Clock';
import { APP_NAME } from '../../shared/app';
import { DEFAULT_SETTINGS, updateSettings } from '../../shared/settings';
import type { CharacterId, Mode } from '../../shared/types';
import { bridge } from './bridge';
import { DemoController } from './demo/DemoController';
import { StageHost } from './stage/StageHost';
import { StageLoop } from './stage/StageLoop';

/** Control-window entry point. */
function main(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app root');
  root.innerHTML = `
    <header>
      <h1>${APP_NAME}</h1>
      <span class="demo-badge" id="demo-badge" role="status">DEMO – simulated signals</span>
      <p>Decide how much of you each call sees.</p>
    </header>
    <section class="preview">
      <canvas id="thumb" width="480" height="270" aria-label="Live preview of what the meeting sees"></canvas>
      <div class="row">
        <button id="open-stage" type="button">Open stage window</button>
        <button id="script" type="button" aria-pressed="false">Play scripted meeting</button>
      </div>
      <p class="caption" id="caption" aria-live="polite"></p>
      <p class="keys">Demo keys: <kbd>N</kbd> nod · <kbd>S</kbd> shake · <kbd>T</kbd> hold to talk · <kbd>B</kbd> blink ·
        <kbd>H</kbd> smile · <kbd>E</kbd> eat · <kbd>L</kbd> look away · <kbd>A</kbd> step away · <kbd>P</kbd> Comfort-shield trigger</p>
    </section>`;

  const clock = new SystemClock();
  const engine = new StudioEngine(updateSettings(DEFAULT_SETTINGS, { mode: 'auto' }), clock);
  const demo = new DemoController(engine, clock);
  const host = new StageHost();
  const thumb = document.getElementById('thumb') as HTMLCanvasElement;
  const caption = document.getElementById('caption') as HTMLElement;
  const scriptBtn = document.getElementById('script') as HTMLButtonElement;
  const loop = new StageLoop(
    engine,
    host,
    () => demo.frame(),
    thumb,
    () => {
      const text = demo.script.caption;
      if (caption.textContent !== text) caption.textContent = text;
    },
  );
  host.open();
  void demo.start();
  demo.bindKeys(window);
  loop.start();
  document.getElementById('open-stage')?.addEventListener('click', () => host.open());
  scriptBtn.addEventListener('click', () => {
    demo.toggleScript();
    scriptBtn.setAttribute('aria-pressed', String(demo.script.isRunning));
    scriptBtn.textContent = demo.script.isRunning ? 'Stop scripted meeting' : 'Play scripted meeting';
  });

  if (bridge().info.e2e) {
    // Test hooks for Playwright (only under STANDIN_E2E=1).
    Object.assign(window, {
      __standin: {
        engine,
        loop,
        host,
        demo,
        setCharacter: (id: CharacterId) =>
          engine.applySettings(updateSettings(engine.currentSettings, { character: id })),
        setMode: (m: Mode) => engine.setMode(m),
        /** Renders the current stage into a tile (default 320×180) and returns a PNG data URL. */
        tile: (w = 320, h = 180) => {
          const src = host.surface;
          if (!src) return null;
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d')?.drawImage(src, 0, 0, w, h);
          return c.toDataURL('image/png');
        },
      },
    });
  }
}

main();
