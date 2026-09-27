// Menus: main menu with settings, the deploy screen (class + spawn), pause and after-action report.
import { CLASSES, CLASS_ORDER, WEAPONS, GADGETS, DIFFICULTY, TEAMS } from './config.js';
import { saveSettings, formatTime } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = { main: $('menu-main'), deploy: $('menu-deploy'), pause: $('menu-pause'), end: $('menu-end') };
    this.selectedClass = game.settings.lastClass || 'assault';
    this.selectedSpawn = 'HQ';
    this.points = [];
    this.mapT = 0;
    this._buildMain();
    this._buildDeploy();
    this._buildPause();
    this._buildEnd();
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
  _buildDeploy() {
    const g = this.game;
    const wrap = $('dp-classes');
    wrap.innerHTML = '';
    for (const id of CLASS_ORDER) {
      const c = CLASSES[id];
      const p = WEAPONS[c.primary], gd = GADGETS[c.gadget];
      const b = document.createElement('button');
      b.className = 'class-card';
      b.id = `cls-${id}`;
      b.innerHTML = `<span class="cc-name">${c.name}</span>
        <span class="cc-kit"><b>${p.name}</b><i>${gd.name} · ${c.grenades}× FRAG</i></span>
        <span class="cc-blurb">${c.blurb}</span>`;
      b.addEventListener('click', () => { this.selectedClass = id; g.settings.lastClass = id; saveSettings(g.settings); g.audio.click(); this._refreshClasses(); });
      wrap.appendChild(b);
    }
    this._refreshClasses();
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
    for (const id of CLASS_ORDER) $(`cls-${id}`).classList.toggle('sel', id === this.selectedClass);
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
      return `<button class="spawn-btn${p.id === this.selectedSpawn ? ' sel' : ''}${p.type === 'squad' && !p.safe ? ' hot' : ''}" data-id="${p.id}"><b>${tag}</b><span>${p.label}${warn}</span></button>`;
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
    $('end-sub').textContent = `${TEAMS[winner].name} HOLD KARSA VALLEY · ${formatTime(g.mode.time)} · ${DIFFICULTY[g.settings.difficulty].label} AI`;
    const all = [...g.soldiers].sort((a, b) => b.stats.score - a.stats.score);
    const rank = all.indexOf(P) + 1;
    const st = P.stats;
    $('end-stats').innerHTML = [
      ['SCORE', st.score], ['RANK', `${rank}/${all.length}`], ['KILLS', st.kills], ['DEATHS', st.deaths],
      ['ASSISTS', st.assists], ['REVIVES', st.revives], ['CAPTURES', st.caps],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('end-mvp').innerHTML = all.slice(0, 3).map((s, i) => {
      const c = s.team === P.team ? 'f' : 'e';
      return `<li class="${c}"><em>${i + 1}</em><span>${s === P ? g.settings.playerName : s.name}</span><i>${s.cls.name}</i><b>${s.stats.score}</b></li>`;
    }).join('');
    this.show('end');
  }
}
