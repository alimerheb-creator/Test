// Menus: main menu with settings, the deploy screen (class + spawn), pause and after-action report.
import { CLASSES, CLASS_ORDER, WEAPONS, GADGETS, DIFFICULTY, TEAMS, MAP } from './config.js';
import { saveSettings, formatTime, esc } from './util.js';
import { parseMod, slugify } from './mods.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = { main: $('menu-main'), deploy: $('menu-deploy'), pause: $('menu-pause'), end: $('menu-end'), mods: $('menu-mods') };
    this.selectedClass = game.settings.lastClass || 'assault';
    this.selectedSpawn = 'HQ';
    this.points = [];
    this.mapT = 0;
    this._buildMain();
    this._buildDeploy();
    this._buildPause();
    this._buildEnd();
    this._buildMods();
    this._buildBattles();
  }

  show(name) {
    for (const k of Object.keys(this.screens)) this.screens[k].hidden = k !== name;
    document.body.classList.toggle('in-menu', !!name);
    if (name === 'pause') {
      const s = this.game.settings;
      $('pause-sens').value = String(s.sensitivity);
      $('pause-tsens').value = String(s.touchSens);
      $('pause-quality').value = String(s.quality);
      this._syncChecks();
    }
  }

  // ------------------------------------------------------------ main menu
  _buildMain() {
    const g = this.game, s = g.settings;
    const bind = (id, key, parse = (v) => v, after) => {
      const el = $(id);
      el.value = String(s[key]);
      el.addEventListener('input', () => {
        s[key] = parse(el.value);
        saveSettings(s);
        if (after) after();
      });
    };
    bind('set-name', 'playerName', (v) => v.trim().slice(0, 16) || 'Recruit');
    bind('set-bots', 'botsPerTeam', Number);
    bind('set-diff', 'difficulty');
    bind('set-tickets', 'tickets', Number);
    bind('set-sens', 'sensitivity', Number, () => { $('sens-val').textContent = s.sensitivity.toFixed(2); });
    bind('set-fov', 'fov', Number, () => { $('fov-val').textContent = `${s.fov}°`; });
    bind('set-quality', 'quality', (v) => v, () => g.applyQuality());
    bind('set-vol', 'volume', Number, () => { g.audio.setVolume(s.volume); $('vol-val').textContent = `${Math.round(s.volume * 100)}%`; });
    bind('set-tsens', 'touchSens', Number, () => { g.input.touchSens = s.touchSens; this._syncLabels(); });
    bind('set-bscale', 'buttonScale', Number, () => { this.applyTouchLayout(); this._syncLabels(); });
    const check = (id, key) => {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => { s[key] = el.checked; saveSettings(s); this._syncChecks(); });
    };
    check('set-assist', 'aimAssist');
    check('set-autofire', 'autoFire');
    check('set-vibe', 'vibration');
    this._syncLabels();
    $('btn-play').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.click();
      g.startMatch();
    });
  }

  _syncLabels() {
    const s = this.game.settings;
    $('sens-val').textContent = s.sensitivity.toFixed(2);
    $('fov-val').textContent = `${s.fov}°`;
    $('vol-val').textContent = `${Math.round(s.volume * 100)}%`;
    $('tsens-val').textContent = s.touchSens.toFixed(2);
    $('bscale-val').textContent = `${Math.round(s.buttonScale * 100)}%`;
  }

  _syncChecks() {
    const s = this.game.settings;
    for (const [id, key] of [['set-assist', 'aimAssist'], ['set-autofire', 'autoFire'], ['set-vibe', 'vibration'], ['pause-assist', 'aimAssist'], ['pause-autofire', 'autoFire']]) {
      const el = $(id);
      if (el) el.checked = !!s[key];
    }
  }

  applyTouchLayout() {
    document.documentElement.style.setProperty('--ts', String(this.game.settings.buttonScale || 1));
  }

  // ------------------------------------------------------------ deploy
  // Class cards come from CLASS_ORDER, which mods can extend
  renderClassCards() {
    const g = this.game;
    const wrap = $('dp-classes');
    wrap.textContent = '';
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      if (!c) continue;
      const p = WEAPONS[c.primary], gd = GADGETS[c.gadget];
      const b = document.createElement('button');
      b.className = 'class-card';
      b.id = `cls-${id}`;
      const span = (cls, text) => { const e = document.createElement('span'); e.className = cls; e.textContent = text; return e; };
      const kit = span('cc-kit', '');
      const kb = document.createElement('b'); kb.textContent = p ? p.name : '';
      const ki = document.createElement('i'); ki.textContent = `${gd ? gd.name : ''} · ${c.grenades}× FRAG`;
      kit.append(kb, ki);
      b.append(span('cc-name', c.name), kit, span('cc-blurb', c.blurb || ''));
      b.addEventListener('click', () => { this.selectedClass = id; g.settings.lastClass = id; saveSettings(g.settings); g.audio.click(); this._refreshClasses(); });
      wrap.appendChild(b);
    }
    this._refreshClasses();
  }

  _buildDeploy() {
    const g = this.game;
    this.renderClassCards();
    $('btn-deploy').addEventListener('click', () => this._deploy());
    $('btn-deploy-menu').addEventListener('click', () => { g.audio.click(); g.quitToMenu(); });
    const canvas = $('dp-map');
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      for (const h of g.hud.spawnHit || []) {
        if (Math.hypot(h.x - x, h.y - y) < h.r) { this.selectedSpawn = h.id; g.audio.click(); this._renderSpawnList(); break; }
      }
    });
  }

  _refreshClasses() {
    for (const id of CLASS_ORDER) { const el = $(`cls-${id}`); if (el) el.classList.toggle('sel', id === this.selectedClass); }
  }

  // ------------------------------------------------------------ mods
  // A map mod was switched on or off: the page restarts to build the new battlefield
  showRestart() {
    const l = document.getElementById('loading');
    if (!l) return;
    l.classList.remove('done', 'error');
    const label = document.getElementById('load-label');
    if (label) label.textContent = 'Building the new map';
  }

  updateModsButton() {
    const n = this.game.mods.activeCount;
    $('btn-mods').textContent = n ? `MODS · ${n} ON` : 'MODS';
  }

  _buildMods() {
    const g = this.game;
    this.modsDirty = false;
    $('btn-mods').addEventListener('click', () => { g.audio.unlock(); g.audio.click(); this.openMods(); });
    $('btn-mods-done').addEventListener('click', () => { g.audio.click(); this.closeMods(); });
    $('mod-file').addEventListener('change', async (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = '';
      for (const f of files) {
        try {
          if (f.size > 256 * 1024) throw new Error('file is larger than 256 KB');
          this._addModText(await f.text(), f.name);
        } catch (err) {
          this._modMsg(`Could not import ${f.name}: ${err.message}`, true);
        }
      }
    });
    $('btn-mod-paste').addEventListener('click', () => { $('mod-paste').hidden = false; $('mod-paste-text').focus(); });
    $('btn-mod-paste-cancel').addEventListener('click', () => { $('mod-paste').hidden = true; });
    $('btn-mod-paste-add').addEventListener('click', () => {
      try {
        this._addModText($('mod-paste-text').value, 'pasted mod');
        $('mod-paste-text').value = '';
        $('mod-paste').hidden = true;
      } catch (err) {
        this._modMsg(`That text isn't a valid mod: ${err.message}`, true);
      }
    });
    $('mod-list').addEventListener('click', (e) => this._modListClick(e));
    $('mod-list').addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('input[data-toggle]')) { g.mods.setEnabled(t.dataset.toggle, t.checked); this.modsDirty = true; this._previewMods(); }
    });
    $('mod-examples').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-file]');
      if (!b) return;
      b.disabled = true;
      try {
        const res = await fetch(`mods/${b.dataset.file}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this._addModText(await res.text(), b.dataset.file);
      } catch (err) {
        this._modMsg(`Could not load example: ${err.message}`, true);
        b.disabled = false;
      }
    });
  }

  _modMsg(text, error = false) {
    const m = $('mod-msg');
    m.textContent = text;
    m.classList.toggle('error', error);
  }

  _addModText(text, source) {
    const g = this.game;
    parseMod(text);
    const entry = g.mods.add(text);
    this.modsDirty = true;
    this._previewMods();
    const saved = g.mods.storageOk ? '' : ' It will only last until you close the game (storage is unavailable here).';
    const bad = entry.status === 'error' ? ' It has errors, see below.' : entry.status === 'warn' ? ' Some settings were adjusted, see below.' : '';
    this._modMsg(`Added "${entry.name}" from ${source}.${bad}${saved}`, entry.status === 'error');
    this.game.audio.capture();
  }

  _modListClick(e) {
    const g = this.game;
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'remove') {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'CONFIRM REMOVE'; return; }
      g.mods.remove(id);
      this._modMsg('Mod removed.');
    } else if (b.dataset.act === 'up') g.mods.move(id, -1);
    else if (b.dataset.act === 'down') g.mods.move(id, 1);
    this.modsDirty = true;
    this._previewMods();
  }

  // Re-validate so the list shows up-to-date warnings before the player leaves the screen
  _previewMods() {
    this.game.mods.applyAll();
    this.renderModList();
  }

  closeMods() {
    if (this.modsDirty) this.game.reloadMods();
    this.modsDirty = false;
    this.show('main');
  }

  openMods() {
    this.show('mods');
    this._modMsg('');
    this.renderModList();
    this._loadExamples();
  }

  renderModList() {
    const g = this.game;
    const list = g.mods.list;
    const statusText = { ok: 'ACTIVE', off: 'OFF', warn: 'ACTIVE · CHECK NOTES', error: 'ERROR', standby: 'ON · NOT IN THIS BATTLE' };
    $('mod-list').innerHTML = list.length ? list.map((m, i) => `
      <li class="mod-item ${m.status}">
        <div class="mod-top">
          <label class="check" for="mod-t-${esc(m.id)}"><input id="mod-t-${esc(m.id)}" type="checkbox" data-toggle="${esc(m.id)}" ${m.enabled ? 'checked' : ''}>
            <span class="mod-name">${esc(m.name)}</span></label>
          <span class="mod-status">${statusText[m.status] || ''}</span>
        </div>
        <p class="mod-meta">${esc([m.version && 'v' + m.version, m.author && 'by ' + m.author, m.hasScript && 'has script', m.hasMap && 'new map (the game restarts when you switch it)'].filter(Boolean).join(' · '))}</p>
        ${m.description ? `<p class="mod-desc">${esc(m.description)}</p>` : ''}
        ${m.messages.length ? `<ul class="mod-notes">${m.messages.slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}${m.messages.length > 12 ? `<li>…and ${m.messages.length - 12} more</li>` : ''}</ul>` : ''}
        <div class="mod-buttons">
          <button class="btn ghost small" data-act="up" data-id="${esc(m.id)}" ${i === 0 ? 'disabled' : ''}>UP</button>
          <button class="btn ghost small" data-act="down" data-id="${esc(m.id)}" ${i === list.length - 1 ? 'disabled' : ''}>DOWN</button>
          <button class="btn ghost small danger" data-act="remove" data-id="${esc(m.id)}">REMOVE</button>
        </div>
      </li>`).join('') : '<li class="mod-empty">No mods installed yet. Import a mod file or add one of the examples below.</li>';
    this._renderExamples();
    this.updateModsButton();
    if (!g.mods.storageOk) this._modMsg('Your mod list could not be saved on this device (its storage is full or blocked), so these changes will be gone the next time the game starts.', true);
  }

  async _loadExamples() {
    if (this.examples) { this._renderExamples(); return; }
    if (!this._examplesLoading) {
      this._examplesLoading = (async () => {
        try {
          const res = await fetch('mods/index.json');
          if (!res.ok) throw new Error(String(res.status));
          const idx = await res.json();
          this.examples = Array.isArray(idx.mods) ? idx.mods.filter((m) => m && typeof m.file === 'string' && /^[\w.-]+$/.test(m.file)) : [];
        } catch (e) {
          this.examples = [];
        }
      })();
    }
    await this._examplesLoading;
    this._renderExamples();
  }

  // ------------------------------------------------------------ battle picker (main menu)
  // NORMAL is the base game; every other card is a battle mod, installed or shipped in the mods folder
  _buildBattles() {
    $('mm-battle').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-battle]');
      if (b) this._pickBattle(b.dataset.battle);
    });
    this.renderBattles();
    this._loadExamples().then(() => { this.renderBattles(); this._updateExamples(); });
  }

  battleChoices() {
    const out = [{ id: 'normal', name: 'NORMAL', blurb: 'Infantry and tanks', order: 0 }];
    const seen = new Set(['normal']);
    for (const m of this.game.mods.list) {
      if (!m.battle || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ id: m.id, name: m.battle.name, blurb: m.battle.blurb, order: m.battle.order });
    }
    for (const e of this.examples || []) {
      const id = slugify(e.id || e.name);
      if (!e.battle || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: String(e.battle.name || e.name).toUpperCase().slice(0, 16), blurb: String(e.battle.blurb || ''), order: Number(e.battle.order) || 50 });
    }
    return out.sort((a, b) => a.order - b.order);
  }

  renderBattles() {
    const cur = this.game.mods.currentBattle();
    $('mm-battle').innerHTML = this.battleChoices().map((c) => `<button class="bt-card${c.id === cur ? ' sel' : ''}" data-battle="${esc(c.id)}" aria-pressed="${c.id === cur}">
      <b>${esc(c.name)}</b><span>${esc(c.blurb || '')}</span></button>`).join('');
  }

  _battleMsg(text, error = false) {
    const m = $('mm-battle-msg');
    m.hidden = !text;
    m.textContent = text || '';
    m.classList.toggle('error', error);
  }

  // Installs a mod shipped in the game's mods folder (when it isn't installed yet) and switches it on
  async _ensureMod(id) {
    const mods = this.game.mods;
    let m = mods.list.find((x) => x.id === id);
    if (!m) {
      await this._loadExamples();
      const ex = (this.examples || []).find((e) => slugify(e.id || e.name) === id);
      if (!ex) throw new Error(`the "${id}" mod isn't installed`);
      const res = await fetch(`mods/${ex.file}`);
      if (!res.ok) throw new Error(`could not load ${ex.file} (HTTP ${res.status})`);
      m = mods.add(await res.text());
    }
    if (!m.enabled) mods.setEnabled(id, true);
    return m;
  }

  async _pickBattle(id) {
    const g = this.game, mods = g.mods;
    if (this._picking) return;
    g.audio.unlock();
    g.audio.click();
    if (id === mods.currentBattle()) return;
    this._picking = true;
    const cards = [...$('mm-battle').querySelectorAll('button')];
    cards.forEach((b) => { b.disabled = true; });
    try {
      if (id !== 'normal') {
        const m = await this._ensureMod(id);
        if (!m.battle) throw new Error(`"${m.name}" is not a battle`);
        for (const need of m.battle.needs) await this._ensureMod(need);
      }
      this._battleMsg('');
      g.setBattle(id);
    } catch (e) {
      this._battleMsg(`Could not switch battles: ${e.message}`, true);
    } finally {
      this._picking = false;
      cards.forEach((b) => { b.disabled = false; });
      this.renderBattles();
    }
  }

  // Mods that came from the game's mods folder are kept up to date: when the game ships a newer version of one
  // you installed, the new one replaces it (switched on or off as before)
  async _updateExamples() {
    const g = this.game, mods = g.mods;
    const newer = (a, b) => {
      const pa = String(a || '0').split('.').map(Number), pb = String(b || '0').split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0; }
      return false;
    };
    let changed = false;
    for (const ex of this.examples || []) {
      const m = mods.list.find((x) => x.id === slugify(ex.id || ex.name));
      if (!m || !ex.version || !newer(ex.version, m.version)) continue;
      try {
        const res = await fetch(`mods/${ex.file}`);
        if (!res.ok) continue;
        const text = await res.text();
        const e = mods._entry(text, m.enabled);
        if (!e || e.id !== m.id || !newer(e.version, m.version)) continue;
        mods.add(text);
        changed = true;
      } catch (err) { /* offline: keep the installed copy */ }
    }
    if (!changed) return;
    if (g.state === 'menu' && this.screens.mods.hidden) g.reloadMods();
    else this.modsDirty = true;
    this.renderBattles();
  }

  _renderExamples() {
    const ex = this.examples || [];
    $('mod-examples-title').hidden = !ex.length;
    const installed = new Set(this.game.mods.list.map((m) => m.id));
    $('mod-examples').innerHTML = ex.map((m) => {
      const have = installed.has(slugify(m.id || m.name));
      return `<li class="mod-item example">
        <div class="mod-top"><span class="mod-name">${esc(m.name)}</span>
          <button class="btn small ${have ? 'ghost' : 'primary'}" data-file="${esc(m.file)}">${have ? 'REINSTALL' : 'ADD'}</button></div>
        <p class="mod-desc">${esc(m.description || '')}</p>
      </li>`;
    }).join('');
  }

  showDeploy() {
    this.show('deploy');
    this.mapT = 0;
    this.updateDeploy(0);
  }

  _renderSpawnList() {
    const list = $('dp-spawns');
    const html = this.points.map((p) => {
      const tag = p.type === 'hq' ? 'HQ' : p.type === 'flag' ? p.id : 'SQUAD';
      const warn = p.type === 'squad' && !p.safe ? ' <em>IN COMBAT</em>' : '';
      return `<button class="spawn-btn${p.id === this.selectedSpawn ? ' sel' : ''}${p.type === 'squad' && !p.safe ? ' hot' : ''}" data-id="${esc(p.id)}"><b>${esc(tag)}</b><span>${esc(p.label)}${warn}</span></button>`;
    }).join('');
    if (list.dataset.html !== html) {
      list.innerHTML = html;
      list.dataset.html = html;
      list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        this.selectedSpawn = b.dataset.id;
        this.game.audio.click();
        this._renderSpawnList();
      }));
    }
  }

  selectedPoint() {
    return this.points.find((p) => p.id === this.selectedSpawn) || this.points[0];
  }

  updateDeploy(dt) {
    const g = this.game, P = g.player;
    this.mapT -= dt;
    if (this.mapT > 0) return;
    this.mapT = 0.15;
    this.points = g.mode.spawnPoints(P.team, true).filter((p) => p.type !== 'squad' || p.safe || true);
    if (!this.points.some((p) => p.id === this.selectedSpawn)) this.selectedSpawn = 'HQ';
    this._renderSpawnList();
    g.hud.drawFullMap($('dp-map'), { points: this.points, selected: this.selectedSpawn });
    const t = g.mode.tickets;
    $('dp-tk0').textContent = Math.ceil(t[P.team]);
    $('dp-tk1').textContent = Math.ceil(t[1 - P.team]);
    const btn = $('btn-deploy');
    const wait = g.redeployT > 0;
    btn.disabled = wait;
    btn.textContent = wait ? `REDEPLOY IN ${Math.ceil(g.redeployT)}` : 'DEPLOY';
    const flags = g.mode.flags.map((f) => {
      const c = f.owner < 0 ? 'n' : f.owner === P.team ? 'f' : 'e';
      return `<span class="fc ${c}">${f.id}</span>`;
    }).join('');
    const fe = $('dp-flags');
    if (fe.dataset.html !== flags) { fe.innerHTML = flags; fe.dataset.html = flags; }
  }

  _deploy() {
    const g = this.game;
    if (g.redeployT > 0) return;
    g.audio.unlock();
    g.audio.click();
    g.deployPlayer(this.selectedClass, this.selectedPoint());
  }

  // ------------------------------------------------------------ pause
  _buildPause() {
    const g = this.game;
    $('btn-resume').addEventListener('click', () => { g.audio.click(); g.resume(); });
    $('btn-redeploy').addEventListener('click', () => { g.audio.click(); g.suicideRedeploy(); });
    $('btn-quit').addEventListener('click', () => { g.audio.click(); g.quitToMenu(); });
    const s = g.settings;
    const mirror = (id, key, mainId, after) => {
      const el = $(id);
      el.value = String(s[key]);
      el.addEventListener('input', () => {
        s[key] = el.type === 'range' ? Number(el.value) : el.value;
        $(mainId).value = el.value;
        saveSettings(s);
        this._syncLabels();
        if (after) after();
      });
    };
    mirror('pause-sens', 'sensitivity', 'set-sens');
    mirror('pause-tsens', 'touchSens', 'set-tsens', () => { g.input.touchSens = s.touchSens; });
    mirror('pause-quality', 'quality', 'set-quality', () => g.applyQuality());
    for (const [id, key] of [['pause-assist', 'aimAssist'], ['pause-autofire', 'autoFire']]) {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => { s[key] = el.checked; saveSettings(s); this._syncChecks(); });
    }
  }

  // ------------------------------------------------------------ after-action
  _buildEnd() {
    const g = this.game;
    $('btn-again').addEventListener('click', () => { g.audio.click(); g.startMatch(); });
    $('btn-end-menu').addEventListener('click', () => { g.audio.click(); g.quitToMenu(); });
  }

  showEnd(winner) {
    const g = this.game, P = g.player;
    const won = winner === P.team;
    const h = $('end-title');
    h.textContent = won ? 'VICTORY' : 'DEFEAT';
    h.className = won ? 'win' : 'loss';
    $('end-sub').textContent = `${TEAMS[winner].name} HOLD ${MAP.name} · ${formatTime(g.mode.time)} · ${DIFFICULTY[g.settings.difficulty].label} AI`;
    const all = [...g.soldiers].sort((a, b) => b.stats.score - a.stats.score);
    const rank = all.indexOf(P) + 1;
    const st = P.stats;
    $('end-stats').innerHTML = [
      ['SCORE', st.score], ['RANK', `${rank}/${all.length}`], ['KILLS', st.kills], ['DEATHS', st.deaths],
      ['ASSISTS', st.assists], ['REVIVES', st.revives], ['CAPTURES', st.caps],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('end-mvp').innerHTML = all.slice(0, 3).map((s, i) => {
      const c = s.team === P.team ? 'f' : 'e';
      return `<li class="${c}"><em>${i + 1}</em><span>${esc(s === P ? g.settings.playerName : s.name)}</span><i>${esc(s.cls.name)}</i><b>${s.stats.score}</b></li>`;
    }).join('');
    this.show('end');
  }
}
