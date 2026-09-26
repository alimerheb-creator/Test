// Entry point: boot the game and drive the loading screen.
import { Game } from './game.js';

const bar = document.getElementById('load-fill');
const label = document.getElementById('load-label');
const loading = document.getElementById('loading');

function fail(err) {
  console.error(err);
  label.textContent = 'Could not start: ' + (err && err.message ? err.message : err);
  loading.classList.add('error');
}

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
