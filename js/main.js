// Entry point: boot the game and drive the loading screen.
import { Game } from './game.js';
import { DEFAULT_SETTINGS } from './config.js';
import { loadSettings, saveSettings } from './util.js';

const bar = document.getElementById('load-fill');
const label = document.getElementById('load-label');
const loading = document.getElementById('loading');

// The graphics would not start (a graphics context that was refused or lost: a device asked for more than it can
// draw, like an iPad drawing every pixel of its screen at a desktop setting): once, start again on the lowest setting
export function lighterGraphics(why) {
  let tried = false;
  try { tried = sessionStorage.getItem('sixthfront.safe') === why; sessionStorage.setItem('sixthfront.safe', why); } catch (e) { /* no storage */ }
  if (tried) return false;
  const s = loadSettings(DEFAULT_SETTINGS);
  s.quality = s.quality === 'ultra' ? 'high' : s.quality === 'high' ? 'medium' : 'low';
  saveSettings(s, true);
  label.textContent = 'Starting again with lighter graphics…';
  loading.classList.remove('done', 'error');
  setTimeout(() => location.reload(), 400);
  return true;
}

function fail(err) {
  console.error(err);
  const msg = err && err.message ? err.message : String(err);
  if (/WebGL|shader|context|GPU/i.test(msg) && lighterGraphics('start')) return;
  label.textContent = 'Could not start: ' + msg;
  loading.classList.add('error');
}
window.__sfLighter = lighterGraphics;

try {
  const game = new Game();
  window.__game = game;
  game.init((p, text) => {
    bar.style.width = `${Math.round(p * 100)}%`;
    label.textContent = text;
    if (p >= 1) setTimeout(() => loading.classList.add('done'), 150);
  }).catch(fail);
} catch (e) {
  fail(e);
}
