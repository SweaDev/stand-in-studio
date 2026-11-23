// Bundles the three Electron entry points (main, preload, renderer) with esbuild
// and copies static renderer assets into dist/.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const watch = process.argv.includes('--watch');
const dev = watch || process.env.NODE_ENV === 'development';

rmSync(out, { recursive: true, force: true });

const common = {
  bundle: true,
  sourcemap: dev ? 'inline' : false,
  logLevel: 'warning',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
};

/** Static files (html, css) copied verbatim next to the renderer bundles. */
const staticDirs = [['src/renderer/control/static', 'renderer/control']];

await Promise.all([
  build({
    ...common,
    entryPoints: { main: 'src/main/main.ts' },
    outdir: join(out, 'main'),
    platform: 'node',
    format: 'cjs',
    // The SDK (and koffi, used for V4L2 ioctls) load native libraries relative to their own
    // packages, so they must stay in node_modules.
    external: ['electron', 'koffi', '@smartspectra/node-sdk', '@smartspectra/node-sdk/*'],
    define: {},
  }),
  build({
    ...common,
    entryPoints: { control: 'src/preload/control.ts' },
    outdir: join(out, 'preload'),
    platform: 'node',
    format: 'cjs',
    // Sandboxed preloads may only require('electron'); everything else is bundled in.
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: { app: 'src/renderer/control/app.ts' },
    outdir: join(out, 'renderer/control'),
    platform: 'browser',
    format: 'iife',
  }),
]);

for (const [from, to] of staticDirs) {
  mkdirSync(join(out, to), { recursive: true });
  cpSync(join(root, from), join(out, to), { recursive: true });
}
console.log(`built dist/ (${dev ? 'development' : 'production'})`);
