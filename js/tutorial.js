// The tutorial: on a first start (after signing in or PLAY AS GUEST) a short battle that teaches the basics one step
// at a time: look, move, sprint, jump, crouch, aim, shoot, reload, throw a grenade, take a flag. Each step ends when
// you have done it. The enemy holds back until the flag. TUTORIAL on the main menu plays it again.
import { saveSettings, rand } from './util.js';

const $ = (id) => document.getElementById(id);
const STEPS = [
  { pc: 'Move the mouse to look around.', touch: 'Drag on the right half of the screen to look around.', done: (t) => t.turned > 2.2, of: (t) => t.turned / 2.2 },
  { pc: 'Walk with W A S D.', touch: 'Walk with the stick on the left.', done: (t) => t.walked > 8, of: (t) => t.walked / 8 },
  { pc: 'Hold SHIFT while you walk forward to sprint.', touch: 'Press SPRINT while you walk.', done: (t) => t.sprinted > 1.2, of: (t) => t.sprinted / 1.2 },
  { pc: 'Press SPACE to jump.', touch: 'Press JUMP.', done: (t) => t.jumped },
  { pc: 'Press C to crouch (Z to go prone).', touch: 'Press CROUCH.', done: (t) => t.crouched },
  { pc: 'Hold the RIGHT mouse button to aim down the sights.', touch: 'Press AIM to aim down the sights.', done: (t) => t.aimed > 0.6, of: (t) => t.aimed / 0.6 },
  { pc: 'Click the LEFT mouse button to shoot. Fire a few shots.', touch: 'Press FIRE. Fire a few shots.', done: (t) => t.shots >= 5, of: (t) => t.shots / 5 },
  { pc: 'Press R to reload.', touch: 'Press RELOAD.', done: (t) => t.reloaded },
  { pc: 'Press G to throw a grenade.', touch: 'Press NADE to throw a grenade.', done: (t) => t.nade },
  { pc: 'Take a flag: run to the nearest one (its letter is on your screen) and stay in its ring until it is yours.',
    touch: 'Take a flag: run to the nearest one (its letter is on your screen) and stay in its ring until it is yours.', done: (t) => t.flag, flag: true },
  { pc: 'Well done, soldier. Now win the battle: take the flags and drain their tickets. The enemy is coming!',
    touch: 'Well done, soldier. Now win the battle: take the flags and drain their tickets. The enemy is coming!', done: (t) => t.endT > 7, last: true },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.on = false;
    this._build();
    // a tutorial asked for before the page restarted (to switch to the NORMAL battle)
    let again = false;
    try { again = sessionStorage.getItem('sixthfront.tutorial') === '1'; sessionStorage.removeItem('sixthfront.tutorial'); } catch (e) { /* no storage */ }
    if (again) setTimeout(() => this.start(), 800);
  }

  _build() {
    const g = this.game;
    const style = document.createElement('style');
    style.textContent = `
#tut-panel { position: fixed; top: calc(70px + var(--safe-t, 0px)); left: 50%; transform: translateX(-50%); z-index: 8; width: min(560px, calc(100vw - 32px));
  background: rgba(13, 16, 18, 0.82); border-left: 3px solid var(--signal); padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
#tut-panel[hidden] { display: none; }
#tut-head { display: flex; justify-content: space-between; align-items: center; font: 700 0.62rem var(--font-mono); letter-spacing: 0.18em; color: var(--signal); }
#tut-skip { pointer-events: auto; background: none; border: 1px solid var(--line-strong); color: var(--muted); font: 700 0.6rem var(--font-mono); letter-spacing: 0.14em; padding: 3px 8px; }
#tut-text { margin: 0; font-size: 1rem; line-height: 1.4; color: #eef0ea; }
#tut-bar { height: 3px; background: rgba(255, 255, 255, 0.12); }
#tut-fill { height: 100%; width: 0; background: var(--signal); transition: width 0.2s; }
#tut-offer { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(6, 8, 9, 0.72); padding: 16px; }
#tut-offer[hidden] { display: none; }
#tut-offer .box { width: min(440px, 100%); background: #14181b; border-top: 3px solid var(--signal); padding: 22px; display: flex; flex-direction: column; gap: 12px; }
#tut-offer h2 { margin: 0; font-family: var(--font-display); font-weight: 900; font-size: 2rem; letter-spacing: 0.04em; }
#tut-offer p { margin: 0; color: #c8ccc2; line-height: 1.5; }
#tut-offer .row { display: flex; gap: 10px; flex-wrap: wrap; }`;
    document.head.appendChild(style);
    const panel = document.createElement('div');
    panel.id = 'tut-panel';
    panel.hidden = true;
    panel.innerHTML = '<div id="tut-head"><span id="tut-step">TUTORIAL</span><button id="tut-skip">SKIP TUTORIAL</button></div><p id="tut-text"></p><div id="tut-bar"><div id="tut-fill"></div></div>';
    document.body.appendChild(panel);
    const offer = document.createElement('div');
    offer.id = 'tut-offer';
    offer.hidden = true;
    offer.innerHTML = `<div class="box"><p class="eyebrow">NEW HERE?</p><h2>TUTORIAL</h2>
      <p>Learn the basics in a short battle: moving, aiming, shooting, grenades and taking a flag. About two minutes.</p>
      <div class="row"><button id="tut-go" class="btn primary">START TUTORIAL</button><button id="tut-no" class="btn ghost">SKIP</button></div></div>`;
    document.body.appendChild(offer);
    $('tut-go').addEventListener('click', () => { g.audio.unlock(); g.audio.click(); offer.hidden = true; this.start(); });
    $('tut-no').addEventListener('click', () => { g.audio.click(); offer.hidden = true; this._finish(); });
    $('tut-skip').addEventListener('click', () => { g.audio.click(); this.stop(true); });
    // SKIP TUTORIAL in the pause menu too (on a computer the mouse is locked to the game while you play)
    const quit = $('btn-quit');
    if (quit) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.id = 'btn-tut-skip';
      b.hidden = true;
      b.textContent = 'SKIP TUTORIAL';
      b.addEventListener('click', () => { g.audio.click(); this.stop(true); if (g.state === 'paused') g.resume(); });
      quit.parentNode.insertBefore(b, quit);
    }
    // TUTORIAL on the main menu
    const box = document.querySelector('#menu-main .mm-buttons');
    if (box) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.id = 'btn-tutorial';
      b.textContent = 'TUTORIAL';
      b.addEventListener('click', () => { g.audio.unlock(); g.audio.click(); this.start(); });
      box.appendChild(b);
    }
  }

  // after the welcome on a first start
  offer() {
    if (this.game.settings.tutorialDone) return;
    $('tut-offer').hidden = false;
  }

  start() {
    const g = this.game;
    // the basics are taught in the NORMAL battle: another one switches first (the page restarts and comes back here)
    if (g.mods.currentBattle() !== 'normal') {
      try { sessionStorage.setItem('sixthfront.tutorial', '1'); } catch (e) { /* no storage */ }
      if (g.ui._pickBattle) g.ui._pickBattle('normal'); else g.setBattle('normal');
      return;
    }
    if (g.__mp && g.__mp.on) return;
    this.on = true;
    this.step = 0;
    this.t = { turned: 0, walked: 0, sprinted: 0, jumped: false, crouched: false, aimed: 0, shots: 0, reloaded: false, nade: false, flag: false, endT: 0 };
    this.last = null;
    g.startMatch();
    // the enemy holds back until the flag
    const P = g.player;
    for (const s of g.soldiers) if (s.team !== P.team && !s.isPlayer) { s.state = 'dead'; s.respawnT = 1e6; }
    // straight in: deploy at the HQ
    setTimeout(() => { if (this.on && g.state === 'deploy') { const b = $('btn-deploy'); if (b) b.click(); } }, 400);
    $('tut-panel').hidden = false;
    $('tut-skip').textContent = g.isTouch ? 'SKIP TUTORIAL' : 'ESC · SKIP TUTORIAL';
    $('btn-tut-skip').hidden = false;
    this._show();
  }

  stop(skipped) {
    if (!this.on) return;
    this.on = false;
    $('tut-panel').hidden = true;
    $('btn-tut-skip').hidden = true;
    this._release();
    this._finish();
    if (skipped) this.game.hud.toast('TUTORIAL SKIPPED · TUTORIAL ON THE MAIN MENU PLAYS IT AGAIN');
  }

  _finish() {
    const s = this.game.settings;
    if (!s.tutorialDone) { s.tutorialDone = true; saveSettings(s, true); }
  }

  // the enemy comes in
  _release() {
    const g = this.game, P = g.player;
    for (const s of g.soldiers) if (s.team !== P.team && !s.isPlayer && s.state === 'dead' && s.respawnT > 1000) s.respawnT = rand(2, 9);
  }

  _show() {
    const st = STEPS[this.step], touch = this.game.isTouch;
    $('tut-step').textContent = st.last ? 'TUTORIAL · DONE' : `TUTORIAL · ${this.step + 1} / ${STEPS.length - 1}`;
    $('tut-text').textContent = touch ? st.touch : st.pc;
    $('tut-fill').style.width = '0%';
  }

  // every frame: what you did, and on to the next step when this one is done
  update(dt) {
    if (!this.on) return;
    const g = this.game, P = g.player;
    if (g.state === 'menu' || !P) { this.stop(false); return; }
    $('tut-panel').hidden = g.state !== 'playing';
    if (g.state !== 'playing' || P.state !== 'alive') return;
    const t = this.t, L = this.last;
    const gun = P.guns && P.guns[0];
    if (L) {
      t.turned += Math.abs(P.yaw - L.yaw) + Math.abs(P.pitch - L.pitch);
      const dx = P.pos.x - L.x, dz = P.pos.z - L.z, d = Math.hypot(dx, dz);
      if (d < 3) t.walked += d;
      if (P.sprinting) t.sprinted += dt;
      if (!P.onGround && P.pos.y > L.y + 0.02) t.jumped = true;
      if (P.stance > 0) t.crouched = true;
      if (P.adsT > 0.8) t.aimed += dt;
      if (gun && gun.mag < L.mag) t.shots += L.mag - gun.mag;
      if (gun && gun.reloading) t.reloaded = true;
      if (P.grenades < L.nades) t.nade = true;
    }
    this.last = { yaw: P.yaw, pitch: P.pitch, x: P.pos.x, y: P.pos.y, z: P.pos.z, mag: gun ? gun.mag : 0, nades: P.grenades };
    const st = STEPS[this.step];
    if (st.flag) {
      const flags = g.mode.flags || [];
      if (!flags.length || flags.some((f) => f.owner === P.team && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.radius + 4)) t.flag = true;
      const f = flags.filter((x) => x.owner !== P.team).sort((a, b) => Math.hypot(P.pos.x - a.x, P.pos.z - a.z) - Math.hypot(P.pos.x - b.x, P.pos.z - b.z))[0];
      if (f) $('tut-fill').style.width = `${Math.round(Math.max(0, (P.team === 0 ? f.progress : -f.progress)) * 100)}%`;
    }
    if (st.last) t.endT += dt;
    if (st.of) $('tut-fill').style.width = `${Math.round(Math.min(1, st.of(t)) * 100)}%`;
    if (!st.done(t)) return;
    g.audio.click();
    if (st.last) { this.stop(false); return; }
    this.step++;
    // the last steps: the enemy is on its way
    if (STEPS[this.step].last) this._release();
    if (st.flag) g.hud.toast('FLAG TAKEN');
    this._show();
  }
}
