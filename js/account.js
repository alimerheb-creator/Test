// Your Sixth Front account: sign in with an email and a password (or with Google, once it is switched on on the
// servers), pick a username, and that name is yours in online games. The first start asks once (or PLAY AS GUEST);
// ACCOUNT on the main menu any time after. The account lives on Sixth Front's servers (server/src/accounts.js); the
// game keeps only its session token, in the settings.
import { saveSettings } from './util.js';
import { SERVER_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ERRORS = {
  bad_email: 'That is not an email address.',
  bad_password: 'A password needs at least 8 characters.',
  bad_username: 'A username is 3 to 16 letters, numbers, spaces, dots, dashes or underscores.',
  email_taken: 'There is already an account with that email. Sign in instead.',
  name_taken: 'Someone already has that username. Try another.',
  wrong_login: 'Wrong email or password.',
  locked: 'Too many wrong passwords. Wait 15 minutes and try again.',
  signed_out: 'You were signed out. Sign in again.',
  network: 'Could not reach the servers. Check your internet connection.',
};

export class Account {
  constructor(game) {
    this.game = game;
    this.cfg = null;
    this.mode = 'login';
    this._build();
    this.sync();
    this.refresh();
  }

  get info() { return this.game.settings.account || null; }
  get signedIn() { return !!(this.info && this.info.token); }

  base() {
    let s = '';
    try { s = localStorage.getItem('sixthfront.mp.server') || ''; } catch (e) { /* no storage */ }
    return String(s || SERVER_URL).replace(/\/+$/, '').replace(/^ws/, 'http');
  }

  async api(path, body) {
    const a = this.info;
    let r;
    try {
      r = await fetch(`${this.base()}/v2/auth${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(a && a.token ? { authorization: `Bearer ${a.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) { throw Object.assign(new Error('network'), { code: 'network' }); }
    let j = {};
    try { j = await r.json(); } catch (e) { j = {}; }
    if (!r.ok && r.status !== 202) throw Object.assign(new Error(j.error || 'network'), { code: j.error || 'network' });
    return j;
  }

  // signed in (or out): the account is kept with the settings, and your username becomes your name everywhere
  _set(acc) {
    const s = this.game.settings;
    s.account = acc && acc.token ? { token: acc.token, name: acc.name || null, email: acc.email || null, provider: acc.provider || 'email' } : null;
    if (s.account && s.account.name) s.playerName = s.account.name;
    s.welcomed = true;
    saveSettings(s, true);
    this.sync();
  }

  // at the start: is the session still good, and has the username changed (on another device)?
  async refresh() {
    if (!this.signedIn) return;
    try {
      const me = await this.api('/me');
      const a = this.info;
      if (me.name && me.name !== a.name) { a.name = me.name; this.game.settings.playerName = me.name; saveSettings(this.game.settings, true); this.sync(); }
    } catch (e) {
      if (e.code === 'signed_out') this._set(null);
    }
  }

  // The name fields follow the account: your username, set in ACCOUNT instead of typed
  sync() {
    const a = this.info, name = a && a.name;
    for (const id of ['set-name', 'mp-name']) {
      const el = $(id);
      if (!el) continue;
      el.disabled = !!name;
      if (name) el.value = name;
      el.title = name ? 'Your username: change it in ACCOUNT' : '';
    }
    const b = $('btn-account');
    if (b) b.textContent = name ? `ACCOUNT · ${name}` : 'SIGN IN';
  }

  // ------------------------------------------------------------ the screen
  _build() {
    const g = this.game, ui = g.ui;
    const el = document.createElement('section');
    el.id = 'menu-account';
    el.className = 'screen';
    el.hidden = true;
    el.innerHTML = `<div class="acc-wrap">
      <header><p class="eyebrow" id="acc-eyebrow">YOUR ACCOUNT</p><h2 id="acc-title">SIGN IN</h2>
        <p class="acc-intro" id="acc-intro"></p></header>
      <div id="acc-out">
        <button id="acc-google" class="btn acc-google" hidden><span class="acc-g">G</span>CONTINUE WITH GOOGLE</button>
        <div class="acc-tabs"><button class="acc-tab sel" data-mode="login">SIGN IN</button><button class="acc-tab" data-mode="register">CREATE ACCOUNT</button></div>
        <form id="acc-form" autocomplete="on">
          <label class="acc-field">EMAIL<input id="acc-email" type="email" autocomplete="email" maxlength="254" spellcheck="false"></label>
          <label class="acc-field">PASSWORD<input id="acc-password" type="password" autocomplete="current-password" maxlength="128"></label>
          <label class="acc-field" id="acc-user-row" hidden>USERNAME<input id="acc-username" maxlength="16" autocomplete="username" spellcheck="false"></label>
          <button id="acc-submit" class="btn primary" type="submit">SIGN IN</button>
        </form>
      </div>
      <div id="acc-pick" hidden>
        <form id="acc-pick-form"><label class="acc-field">PICK YOUR USERNAME<input id="acc-pick-name" maxlength="16" spellcheck="false"></label>
        <button class="btn primary" type="submit">SAVE</button></form>
      </div>
      <div id="acc-in" hidden>
        <p class="acc-who" id="acc-who"></p>
        <form id="acc-rename-form"><label class="acc-field">CHANGE USERNAME<input id="acc-rename" maxlength="16" spellcheck="false"></label>
        <button class="btn" type="submit">SAVE</button></form>
        <button id="acc-signout" class="btn ghost">SIGN OUT</button>
      </div>
      <p class="acc-msg" id="acc-msg" role="status"></p>
      <div class="acc-foot"><button id="acc-guest" class="btn ghost">PLAY AS GUEST</button><button id="acc-back" class="btn ghost">BACK</button></div>
    </div>`;
    document.body.appendChild(el);
    ui.screens.account = el;
    const style = document.createElement('style');
    style.textContent = `
#menu-account { display: grid; justify-items: center; align-content: start; padding: calc(28px + var(--safe-t, 0px)) 16px calc(24px + var(--safe-b, 0px)); background: rgba(10, 12, 13, 0.92); overflow-y: auto; }
.acc-wrap { width: min(460px, 100%); display: flex; flex-direction: column; gap: 14px; }
.acc-wrap h2 { margin: 4px 0 6px; font-family: var(--font-display); font-weight: 900; font-size: clamp(2.2rem, 7vw, 3.2rem); letter-spacing: 0.04em; line-height: 0.95; }
.acc-intro { margin: 0; color: #c8ccc2; line-height: 1.5; font-size: 0.95rem; }
.acc-google { width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 14px; }
.acc-g { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #fff; color: #4285f4; font: 900 0.85rem var(--font-display); }
.acc-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.acc-tab { padding: 9px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line); color: var(--muted); font: 700 0.68rem var(--font-mono); letter-spacing: 0.16em; }
.acc-tab.sel { color: var(--text); border-color: var(--signal); background: rgba(255, 255, 255, 0.08); }
#acc-form, #acc-pick-form, #acc-rename-form { display: flex; flex-direction: column; gap: 10px; }
.acc-field { display: flex; flex-direction: column; gap: 5px; font-size: 0.66rem; letter-spacing: 0.2em; font-weight: 700; color: var(--muted); }
.acc-field input { width: 100%; padding: 11px 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--line-strong); color: var(--text); font-size: 1rem; border-radius: 0; user-select: text; -webkit-user-select: text; }
.acc-who { margin: 0; font-size: 1.05rem; line-height: 1.5; }
.acc-who b { color: var(--signal); }
.acc-msg { margin: 0; min-height: 1.2em; font-size: 0.9rem; color: var(--signal); }
.acc-msg.error { color: var(--enemy); }
.acc-foot { display: flex; gap: 10px; flex-wrap: wrap; }
#mm-account-chip { font: 700 0.62rem var(--font-mono); letter-spacing: 0.16em; color: var(--muted); }`;
    document.head.appendChild(style);

    // the main menu's ACCOUNT button
    const box = document.querySelector('#menu-main .mm-buttons');
    if (box) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.id = 'btn-account';
      b.addEventListener('click', () => { g.audio.unlock(); g.audio.click(); this.open(false); });
      box.appendChild(b);
    }
    // keys typed here are the form's, not the game's
    for (const i of el.querySelectorAll('input')) { i.addEventListener('keydown', (e) => e.stopPropagation()); i.addEventListener('keyup', (e) => e.stopPropagation()); }
    el.querySelector('.acc-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) { g.audio.click(); this.mode = b.dataset.mode; this._render(); }
    });
    $('acc-form').addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });
    $('acc-pick-form').addEventListener('submit', (e) => { e.preventDefault(); this._rename($('acc-pick-name').value); });
    $('acc-rename-form').addEventListener('submit', (e) => { e.preventDefault(); this._rename($('acc-rename').value); });
    $('acc-google').addEventListener('click', () => { g.audio.click(); this._google(); });
    $('acc-signout').addEventListener('click', async () => {
      g.audio.click();
      try { await this.api('/logout', {}); } catch (err) { /* signed out here anyway */ }
      this._set(null);
      this._msg('Signed out.');
      this._render();
    });
    $('acc-guest').addEventListener('click', () => { g.audio.click(); this._done(); });
    $('acc-back').addEventListener('click', () => { g.audio.click(); this._done(); });
    // the name fields follow the account whenever a screen opens
    const show = ui.show.bind(ui);
    ui.show = (name) => { show(name); this.sync(); };
  }

  // first: the welcome on a first start (with PLAY AS GUEST); otherwise from the main menu
  open(first) {
    this.first = !!first;
    this.game.ui.show('account');
    this._msg('');
    this._render();
    this.api('/config').then((c) => { this.cfg = c; this._render(); }).catch(() => {});
  }

  _render() {
    const a = this.info, first = this.first;
    const needName = a && !a.name;
    $('acc-out').hidden = !!a;
    $('acc-pick').hidden = !needName;
    $('acc-in').hidden = !a || needName;
    $('acc-google').hidden = !(this.cfg && this.cfg.google);
    for (const t of document.querySelectorAll('.acc-tab')) t.classList.toggle('sel', t.dataset.mode === this.mode);
    const reg = this.mode === 'register';
    $('acc-user-row').hidden = !reg;
    $('acc-password').autocomplete = reg ? 'new-password' : 'current-password';
    $('acc-submit').textContent = reg ? 'CREATE ACCOUNT' : 'SIGN IN';
    $('acc-eyebrow').textContent = first ? 'WELCOME, SOLDIER' : 'YOUR ACCOUNT';
    $('acc-title').textContent = a ? (needName ? 'YOUR USERNAME' : 'ACCOUNT') : first ? 'SIGN IN' : 'SIGN IN';
    $('acc-intro').textContent = a ? (needName ? 'Pick the name everyone sees in online games.' : '')
      : 'Sign in or create an account so your username is yours: it is the name everyone sees in online games.';
    if (a && !needName) {
      $('acc-who').innerHTML = `Signed in as <b>${esc(a.name)}</b>${a.email ? `<br><span style="color:var(--muted)">${esc(a.email)}</span>` : ''}`;
      $('acc-rename').value = a.name;
    }
    $('acc-guest').hidden = !!a || !first;
    $('acc-back').textContent = a ? (first ? 'CONTINUE' : 'BACK') : 'BACK';
    $('acc-back').hidden = !a && first;
  }

  _msg(text, error = false) { const m = $('acc-msg'); m.textContent = text || ''; m.classList.toggle('error', error); }
  _busy(on) { for (const b of document.querySelectorAll('#menu-account button')) b.disabled = on; }

  async _submit() {
    const reg = this.mode === 'register';
    const body = { email: $('acc-email').value.trim(), password: $('acc-password').value };
    if (reg) body.username = $('acc-username').value.trim();
    this._busy(true);
    this._msg(reg ? 'Creating your account…' : 'Signing in…');
    try {
      const acc = await this.api(reg ? '/register' : '/login', body);
      $('acc-password').value = '';
      this._set(acc);
      this._msg(reg ? `Welcome, ${acc.name}.` : `Welcome back, ${acc.name || 'soldier'}.`);
      this._render();
      if (this.first && acc.name) setTimeout(() => this._done(), 900);
    } catch (e) {
      this._msg(ERRORS[e.code] || 'Something went wrong. Try again.', true);
    } finally { this._busy(false); }
  }

  async _rename(name) {
    this._busy(true);
    try {
      const r = await this.api('/username', { username: String(name || '').trim() });
      const a = this.info;
      a.name = r.name;
      this._set(a);
      this._msg(`Your username is ${r.name}.`);
      this._render();
      if (this.first) setTimeout(() => this._done(), 900);
    } catch (e) {
      if (e.code === 'signed_out') this._set(null);
      this._msg(ERRORS[e.code] || 'Something went wrong. Try again.', true);
      this._render();
    } finally { this._busy(false); }
  }

  // Google: the sign-in happens in the browser (Google doesn't sign in inside apps' own web views); the game asks the
  // servers every two seconds whether it is done
  async _google() {
    const sid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    window.open(`${this.base()}/v2/auth/google/start?sid=${sid}`, '_blank');
    this._msg('Finish signing in with Google in your browser, then come back here…');
    const until = Date.now() + 5 * 60e3;
    clearInterval(this._poll);
    this._poll = setInterval(async () => {
      if (Date.now() > until || this.game.ui.screens.account.hidden) { clearInterval(this._poll); return; }
      try {
        const r = await this.api(`/poll?sid=${sid}`);
        if (!r.token) return;
        clearInterval(this._poll);
        this._set(r);
        this._msg(r.name ? `Welcome, ${r.name}.` : 'Signed in with Google. Now pick your username.');
        this._render();
        if (this.first && r.name) setTimeout(() => this._done(), 900);
      } catch (e) { /* not yet */ }
    }, 2000);
  }

  // leaving the screen: on a first start, on to the tutorial
  _done() {
    const g = this.game, s = g.settings;
    clearInterval(this._poll);
    const first = this.first;
    this.first = false;
    if (!s.welcomed) { s.welcomed = true; saveSettings(s, true); }
    g.ui.show('main');
    if (first && g.tutorial) g.tutorial.offer();
  }

  // the first start: welcome (sign in or play as guest), then the tutorial
  welcome() {
    const s = this.game.settings;
    if (!s.welcomed && !this.signedIn) this.open(true);
    else if (this.game.tutorial) this.game.tutorial.offer();
  }
}
