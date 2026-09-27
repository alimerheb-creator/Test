// Builds a self-contained, offline copy of the game for the Android app (or any static host):
// one bundled script (three.js included), local fonts, no import maps or CDN requests.
//   node android/prepare-web.mjs [outDir]      (default: android/build/assets/www)
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'android/build/assets/www'));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'css'), { recursive: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

await build({
  entryPoints: [join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020', 'chrome80'],
  outfile: join(out, 'game.js'),
  legalComments: 'eof',
  logLevel: 'warning',
});

cpSync(join(root, 'css/style.css'), join(out, 'css/style.css'));
cpSync(join(root, 'android/fonts'), join(out, 'fonts'), { recursive: true });
cpSync(join(root, 'mods'), join(out, 'mods'), { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="preconnect"[^>]*>\n/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n/, '')
  .replace('<script type="module" src="js/main.js"></script>', '<script src="game.js"></script>');
if (html.includes('importmap') || html.includes('type="module"') || html.includes('googleapis')) {
  throw new Error('index.html transform failed: CDN or module references remain');
}
writeFileSync(join(out, 'index.html'), html);
console.log(`web build written to ${out}`);
