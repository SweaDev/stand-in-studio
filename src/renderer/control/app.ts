import type { CharacterId, Mode } from '../../shared/types';
import { updateSettings } from '../../shared/settings';
import { bridge } from './bridge';
import { ControlApp } from './ControlApp';
import { CameraManager } from './camera/CameraManager';
import { measureBody } from '../../render/characterBody';
import { getCharacter } from '../../render/characters/registry';

/** Control-window entry point. */
async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app root');
  const api = bridge();
  const app = new ControlApp(root, api, await api.getSettings());
  await app.start();

  if (api.info.e2e) {
    // Test hooks for Playwright (only under STANDIN_E2E=1).
    Object.assign(window, {
      __standin: {
        app,
        get engine() {
          return app.engine;
        },
        get loop() {
          return app.loop;
        },
        get host() {
          return app.host;
        },
        get demo() {
          return app.demo;
        },
        setCharacter: (id: CharacterId) =>
          app.engine.applySettings(updateSettings(app.engine.currentSettings, { character: id })),
        setMode: (m: Mode) => app.engine.setMode(m),
        CameraManager,
        /** Measures a character's face-covering body (fractions of its box size). */
        characterBody: (id: CharacterId) => {
          const c = getCharacter(id);
          return c ? { measured: measureBody(c), declared: c.body } : null;
        },
        /** Renders the current stage into a tile (default 320×180) and returns a PNG data URL. */
        tile: (w = 320, h = 180) => {
          const src = app.host.surface;
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

void main();
