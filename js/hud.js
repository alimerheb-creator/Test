// In-game HUD: tickets & flags, minimap, ammo, killfeed, score popups, crosshair,
// hitmarkers, damage direction, world markers, scoreboard and the full-screen map.
import * as THREE from 'three';
import { TEAMS, SQUAD_COLOR, PLAY_HALF, BUILDINGS, ROADS, HQS, SQUAD_NAMES, VEHICLES, RULES, MAP, FLAGS } from './config.js';
import { clamp, wrapAngle, yawTo, formatTime, esc } from './util.js';

const $ = (id) => document.getElementById(id);
const MAP_HALF = PLAY_HALF + 12;
const _p = new THREE.Vector3();

const COL = { friend: '#3fa9f5', enemy: '#ff4b3a', squad: SQUAD_COLOR, neutral: '#c9ccc4', signal: '#f2b33d', white: '#e8eae3' };

function teamColor(team, viewer) {
  if (team < 0) return COL.neutral;
  return team === viewer ? COL.friend : COL.enemy;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.overlay = $('overlay');
    this.octx = this.overlay.getContext('2d');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.el = {
      tk: [$('tk0'), $('tk1')], tkb: [$('tkb0'), $('tkb1')], flags: $('flag-row'),
      killfeed: $('killfeed'), banner: $('banner'), toast: $('toast'), popups: $('popups'),
      capture: $('capture'), capLabel: $('cap-label'), capFill: $('cap-fill'),
      prompt: $('prompt'), promptText: $('prompt-text'), promptFill: $('prompt-fill'),
      wname: $('w-name'), wmag: $('w-mag'), wres: $('w-res'), wmode: $('w-mode'), wch: $('w-ch'), wpips: $('w-pips'), wreload: $('w-reload'), gadget: $('w-gadget'), nades: $('w-nades'),
      hp: $('hp-fill'), hpNum: $('hp-num'), squad: $('squad-list'),
      vehicle: $('vehicle-hud'), vhp: $('v-hp'), vhpNum: $('v-hp-num'), vweap: $('v-weap'), vreload: $('v-reload'),
      weapon: $('weapon-block'), oob: $('oob'), oobT: $('oob-t'),
      downed: $('downed'), downedBy: $('downed-by'), downedT: $('downed-t'),
      scoreboard: $('scoreboard'), bigmap: $('bigmap'), bigmapCanvas: $('bigmap-canvas'),
      scope: $('scope'), vignette: $('vignette'), suppress: $('suppress'), squadName: $('squad-name'),
      ctxBtn: $('t-context'), ctxLabel: $('t-context-label'), giveUp: $('btn-giveup'),
    };
    this.vibeT = 0;
    const giveUp = (e) => {
      e.preventDefault();
      const P = this.game.player;
      if (P && P.state === 'downed' && this.game.playerCtl.deathT > 0.6) P.bleedOut();
    };
    this.el.giveUp.addEventListener('click', giveUp);
    this.el.giveUp.addEventListener('touchstart', giveUp, { passive: false });
    this.hit = { t: 0, head: false, kill: false, veh: false };
    this.dmgMarks = [];
    this.suppression = 0;
    this.popTotal = 0;
    this.popTotalT = 0;
    this.last = {};
    this.flagEls = [];
    this.sbT = 0;
    this.bannerT = 0;
    this.toastT = 0;
    this.hurtFlash = 0;
    this._buildMapImage();
    this._buildFlagRow();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    game.on('kill', (e) => this._onKill(e));
    game.on('damage', (e) => this._onDamage(e));
    game.on('vehicleDamage', (e) => {
      if (e.vehicle.driver === game.player && e.attacker) this._addDamageMark(e.attacker.pos);
    });
    game.on('score', (e) => this._popup(e.pts, e.label));
    game.on('flag', (e) => this._onFlag(e));
    game.on('revive', (e) => { if (e.soldier === game.player) this.banner(e.by ? 'REVIVED BY ' + e.by.name.toUpperCase() : 'REVIVED', COL.squad); });
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.overlay.width = Math.floor(window.innerWidth * dpr);
    this.overlay.height = Math.floor(window.innerHeight * dpr);
    const ms = this.mini.clientWidth || 190;
    this.mini.width = Math.floor(ms * dpr);
    this.mini.height = Math.floor(ms * dpr);
  }

  // Team and vehicle names can be renamed by mods
  updateLabels() {
    for (const t of [0, 1]) {
      const n = TEAMS[t].name;
      const a = document.getElementById('team-name-' + t), b = document.getElementById('dp-name-' + t);
      if (a) a.textContent = n;
      if (b) b.textContent = n;
    }
    const vt = document.getElementById('vh-title');
    if (vt) vt.textContent = VEHICLES.tank.name;
    const eb = document.getElementById('mm-eyebrow');
    if (eb) {
      const parts = FLAGS.length ? ['CONQUEST', MAP.name, `${FLAGS.length} OBJECTIVE${FLAGS.length === 1 ? '' : 'S'}`] : ['TEAM DEATHMATCH', MAP.name, 'NO OBJECTIVES'];
      eb.innerHTML = parts.map(esc).join(' <span>·</span> ');
    }
    this.last.sb = null;
  }

  show(v) {
    this.root.hidden = !v;
    this.overlay.hidden = !v;
    if (!v) {
      document.body.classList.remove('downed');
      this.last.downed = false;
      this.el.scope.hidden = true;
      this.el.vignette.style.opacity = '0';
      this.el.suppress.style.opacity = '0';
      this.hurtFlash = 0;
      this.suppression = 0;
      this.dmgMarks.length = 0;
    }
  }

  // ------------------------------------------------------------ map image
  _buildMapImage() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const w = this.game.world;
    const d = img.data;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = -MAP_HALF + ((i + 0.5) / S) * MAP_HALF * 2;
        const z = -MAP_HALF + ((j + 0.5) / S) * MAP_HALF * 2;
        const h = w.heightAt(x, z);
        const hx = w.heightAt(x + 2, z) - h, hz = w.heightAt(x, z + 2) - h;
        const shade = clamp(0.78 - hx * 0.09 - hz * 0.06 + h * 0.004, 0.4, 1.1);
        const k = (j * S + i) * 4;
        d[k] = 58 * shade + 20; d[k + 1] = 64 * shade + 20; d[k + 2] = 50 * shade + 18; d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const toPx = (v) => ((v + MAP_HALF) / (MAP_HALF * 2)) * S;
    g.strokeStyle = 'rgba(190,180,160,0.55)';
    g.lineWidth = 3;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of ROADS) {
      g.beginPath();
      r.forEach(([x, z], k) => (k ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
      g.stroke();
    }
    g.fillStyle = 'rgba(214,206,190,0.85)';
    g.strokeStyle = 'rgba(30,30,30,0.6)';
    g.lineWidth = 1;
    for (const b of BUILDINGS) {
      const hw = (b[2] * 2.5) / 2, hd = (b[3] * 2.5) / 2;
      g.fillRect(toPx(b[0] - hw), toPx(b[1] - hd), (hw * 2 * S) / (MAP_HALF * 2), (hd * 2 * S) / (MAP_HALF * 2));
      g.strokeRect(toPx(b[0] - hw), toPx(b[1] - hd), (hw * 2 * S) / (MAP_HALF * 2), (hd * 2 * S) / (MAP_HALF * 2));
    }
    // out of bounds shading
    g.strokeStyle = 'rgba(255,75,58,0.5)';
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.strokeRect(toPx(-PLAY_HALF), toPx(-PLAY_HALF), toPx(PLAY_HALF) - toPx(-PLAY_HALF), toPx(PLAY_HALF) - toPx(-PLAY_HALF));
    g.setLineDash([]);
    this.mapImg = c;
  }

  _buildFlagRow() {
    const row = this.el.flags;
    row.innerHTML = '';
    for (const f of this.game.mode.flags) {
      const d = document.createElement('div');
      d.className = 'flag-chip';
      d.innerHTML = `<i></i><span>${f.id}</span>`;
      row.appendChild(d);
      this.flagEls.push(d);
    }
  }

  // ------------------------------------------------------------ events
  _onKill({ victim, killer, weapon, headshot }) {
    const g = this.game, P = g.player;
    const row = document.createElement('div');
    row.className = 'kf-row';
    const name = (s) => {
      const span = document.createElement('span');
      const c = s === P ? COL.signal : s.team === P.team ? (s.squad === P.squad ? COL.squad : COL.friend) : COL.enemy;
      span.style.color = c;
      span.textContent = s === P ? g.settings.playerName : s.name;
      return span;
    };
    if (killer) row.appendChild(name(killer));
    const w = document.createElement('em');
    w.textContent = (weapon || 'KILLED') + (headshot ? ' ◎' : '');
    row.appendChild(w);
    row.appendChild(name(victim));
    this.el.killfeed.prepend(row);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 5500);
    setTimeout(() => row.remove(), 6500);
    if (killer === P && victim !== P) {
      g.audio.kill();
    }
    if (victim === P) {
      this.killedBy = killer;
      this.killedWeapon = weapon;
    }
  }

  _onDamage({ victim, attacker, amount }) {
    const g = this.game;
    if (victim !== g.player) return;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 40);
    g.audio.hurt();
    if (g.time - this.vibeT > 0.15) { this.vibeT = g.time; g.vibrate(amount > 40 ? 70 : 28); }
    if (attacker && attacker !== victim) this._addDamageMark(attacker.pos);
  }

  _addDamageMark(pos) {
    const P = this.game.player;
    const yaw = yawTo(pos.x - P.pos.x, pos.z - P.pos.z);
    this.dmgMarks.push({ yaw, t: 1.4 });
    if (this.dmgMarks.length > 6) this.dmgMarks.shift();
  }

  _onFlag({ flag, team, type, lost }) {
    const P = this.game.player;
    if (!P || P.state === 'inactive') return;
    if (type === 'captured') {
      if (team === P.team) { this.banner(`OBJECTIVE ${flag.id} CAPTURED`, COL.friend); this.game.audio.capture(); }
      else { this.banner(`OBJECTIVE ${flag.id} LOST`, COL.enemy); this.game.audio.lost(); }
    } else if (type === 'neutralized') {
      if (lost === P.team) { this.banner(`WE LOST CONTROL OF ${flag.id}`, COL.enemy); this.game.audio.lost(); }
      else this.banner(`OBJECTIVE ${flag.id} NEUTRALIZED`, COL.white);
    }
  }

  banner(text, color = COL.white) {
    const b = this.el.banner;
    b.textContent = text;
    b.style.color = color;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    this.bannerT = 3;
  }

  toast(text) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('show');
    this.toastT = 1.6;
  }

  _popup(pts, label) {
    const d = document.createElement('div');
    d.className = 'pop';
    d.innerHTML = `<b>+${esc(pts)}</b> ${esc(label)}`;
    this.el.popups.appendChild(d);
    while (this.el.popups.children.length > 5) this.el.popups.firstChild.remove();
    setTimeout(() => d.remove(), 2600);
    this.popTotal = this.popTotalT > 0 ? this.popTotal + pts : pts;
    this.popTotalT = 3;
  }

  hitmarker(head, kill, veh = false) {
    this.hit.t = kill ? 0.45 : 0.18;
    this.hit.head = head;
    this.hit.kill = kill;
    this.hit.veh = veh;
    if (!veh) this.game.audio.hit(head || kill);
    if (kill) this.game.vibrate([18, 30, 18]);
  }

  suppress(a) { this.suppression = Math.min(1, this.suppression + a * 0.35); }

  setPrompt(text, progress = -1) {
    const p = this.el.prompt;
    if (!text) { if (!p.hidden) p.hidden = true; return; }
    p.hidden = false;
    if (this.last.prompt !== text) { this.el.promptText.textContent = text; this.last.prompt = text; }
    this.el.promptFill.style.width = progress >= 0 ? `${Math.min(1, progress) * 100}%` : '0%';
  }

  // What the gun in hand is doing right now, for the fire-mode line
  _gunStatus(gun) {
    const d = gun.def, type = gun.type;
    switch (gun.stage) {
      case 'out': return type === 'box' ? 'OPENING COVER' : gun.droppedEmpty ? 'DROPPING MAG' : 'MAG OUT';
      case 'in': return type === 'box' ? 'LOADING BELT' : 'INSERTING MAG';
      case 'charge': return type === 'shell' ? 'PUMPING' : d.kind === 'bolt' ? 'WORKING BOLT' : d.model === 'pistol' ? 'SLIDE RELEASE' : 'CHAMBERING';
      case 'start': case 'shell': return `LOADING ${gun.mag}/${d.mag}`;
      case 'end': return 'READY';
    }
    if (gun.cycleT > 0 || (d.kind === 'bolt' && gun.cool > 0.15)) return type === 'shell' ? 'PUMPING' : 'CYCLING BOLT';
    if (gun.magOut) return gun.reserve > 0 ? 'NO MAG · RELOAD' : 'NO MAG';
    if (!gun.ready && gun.mag > 0) return 'CHAMBER A ROUND · RELOAD';
    if (gun.empty) return gun.reserve > 0 ? 'EMPTY · RELOAD' : 'OUT OF AMMO';
    return d.kind === 'auto' ? 'AUTO' : d.kind === 'bolt' ? 'BOLT' : 'SEMI';
  }

  // One pip per spare magazine, filled to how many rounds it holds
  _pips(gun) {
    let key = '';
    let levels = null;
    if (gun && gun.type !== 'shell') { levels = gun.pouchLevels(10); key = levels.map((l) => Math.round(l * 20)).join(','); }
    if (key === this._pipKey) return;
    this._pipKey = key;
    const el = this.el.wpips;
    el.textContent = '';
    if (!levels) return;
    for (const l of levels) {
      const i = document.createElement('i');
      const b = document.createElement('b');
      b.style.height = Math.round(l * 100) + '%';
      i.appendChild(b);
      el.appendChild(i);
    }
  }

  _reloadBar(gun) {
    const on = !!(gun && gun.reloading);
    if (on !== this._reloadOn) { this._reloadOn = on; this.el.wreload.classList.toggle('on', on); }
    if (!on) return;
    const p = gun.reloadP;
    this.el.wreload.firstChild.style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
  }

  _set(key, el, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el.textContent = value;
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const g = this.game, P = g.player, mode = g.mode;
    if (!P) return;
    // tickets & flags
    for (let t = 0; t < 2; t++) {
      const tk = Math.ceil(mode.tickets[t]);
      this._set('tk' + t, this.el.tk[t], String(tk));
      const pct = (mode.tickets[t] / mode.maxTickets) * 100;
      if (Math.abs((this.last['tkb' + t] || 0) - pct) > 0.2) { this.el.tkb[t].style.width = pct + '%'; this.last['tkb' + t] = pct; }
    }
    mode.flags.forEach((f, i) => {
      const el = this.flagEls[i];
      const c = teamColor(f.owner, P.team);
      const key = `${f.owner}|${Math.round(Math.abs(f.progress) * 20)}|${f.contested}|${f.capturing}`;
      if (this.last['f' + i] !== key) {
        this.last['f' + i] = key;
        el.style.setProperty('--c', c);
        el.style.setProperty('--p', Math.abs(f.progress));
        const capC = f.progress > 0 ? teamColor(0, P.team) : f.progress < 0 ? teamColor(1, P.team) : COL.neutral;
        el.style.setProperty('--cap', capC);
        el.classList.toggle('contested', f.contested || (f.capturing >= 0 && f.capturing !== f.owner));
        el.classList.toggle('mine', f.owner === P.team);
      }
    });

    // weapon block
    const inTank = P.vehicle && P.state === 'alive';
    this.el.weapon.hidden = !!inTank;
    this.el.vehicle.hidden = !inTank;
    if (inTank) {
      const v = P.vehicle;
      const pct = Math.max(0, v.health / v.maxHealth);
      this.el.vhp.style.width = pct * 100 + '%';
      this._set('vhpn', this.el.vhpNum, String(Math.ceil(pct * 100)));
      const w = g.playerCtl.tankWeapon === 0 ? '120MM CANNON' : `COAX MG  ${v.coax.reloading ? 'RELOADING' : v.coax.mag}`;
      this._set('vw', this.el.vweap, w);
      this.el.vreload.style.width = (g.playerCtl.tankWeapon === 0 ? clamp(1 - v.reload / VEHICLES.tank.reload, 0, 1) : 1) * 100 + '%';
    } else if (P.state === 'alive') {
      if (P.slot < 2) {
        const gun = P.gun;
        this._set('wn', this.el.wname, gun.def.name);
        this._set('wm', this.el.wmag, gun.magOut ? '--' : String(gun.mag));
        this._set('wch', this.el.wch, gun.chamber > 0 ? '+1' : '');
        this._set('wr', this.el.wres, String(gun.reserve));
        this._set('wmode', this.el.wmode, this._gunStatus(gun));
        this.el.wmag.classList.toggle('low', gun.rounds <= gun.def.mag * 0.25);
        this._pips(gun);
        this._reloadBar(gun);
      } else {
        this._set('wn', this.el.wname, P.gadget.name);
        this._set('wm', this.el.wmag, String(P.gadgetAmmo));
        this._set('wch', this.el.wch, '');
        this._pips(null);
        this._reloadBar(null);
        this._set('wr', this.el.wres, '');
        this._set('wmode', this.el.wmode, P.gadget.id === 'c4' ? 'RMB DETONATE' : P.gadgetCd > 0 ? 'READYING' : 'READY');
        this.el.wmag.classList.toggle('low', P.gadgetAmmo === 0);
      }
      const gd = P.gadget.recharge && P.gadgetCd > 0 ? `${P.gadget.name} ${Math.ceil(P.gadgetCd)}s` : `${P.gadget.name} ×${P.gadgetAmmo}`;
      this._set('gd', this.el.gadget, `[3] ${gd}`);
      this._set('nd', this.el.nades, `[G] FRAG ×${P.grenades}`);
    }
    const hpMax = RULES.playerHealth;
    const hp = P.state === 'alive' ? Math.max(0, P.health) : 0;
    const hpPct = Math.min(100, (hp / hpMax) * 100);
    this.el.hp.style.width = hpPct + '%';
    this.el.hp.classList.toggle('low', hpPct < 35);
    this._set('hpn', this.el.hpNum, String(Math.ceil(hp)));

    // touch context button (revive / tank / detonate) and downed state
    if (g.input.touchMode) {
      const ctx = P.state === 'alive' ? g.playerCtl.context : null;
      const btn = this.el.ctxBtn;
      if (!ctx) { if (!btn.hidden) btn.hidden = true; }
      else {
        btn.hidden = false;
        if (this.last.ctx !== ctx.label) { this.last.ctx = ctx.label; this.el.ctxLabel.textContent = ctx.label; btn.dataset.kind = ctx.kind; }
        btn.style.setProperty('--p', String(ctx.progress || 0));
      }
    }
    const downedNow = P.state === 'downed';
    if (this.last.downed !== downedNow) { this.last.downed = downedNow; document.body.classList.toggle('downed', downedNow); }

    // capture status
    let inFlag = null;
    if (P.state === 'alive') {
      for (const f of mode.flags) {
        if (Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.radius && Math.abs(P.pos.y - f.y) < 12) { inFlag = f; break; }
      }
    }
    if (inFlag) {
      this.el.capture.hidden = false;
      const mine = P.team === 0 ? inFlag.progress : -inFlag.progress;
      let label;
      if (inFlag.contested && inFlag.counts[0] === inFlag.counts[1]) label = `CONTESTED ${inFlag.id}`;
      else if (inFlag.owner === P.team && mine >= 0.999) label = `DEFENDING ${inFlag.id}`;
      else if (inFlag.capturing === P.team) label = `CAPTURING ${inFlag.id}`;
      else label = `LOSING ${inFlag.id}`;
      this._set('cap', this.el.capLabel, `${label} · ${inFlag.name}`);
      this.el.capFill.style.width = Math.abs(inFlag.progress) * 100 + '%';
      this.el.capFill.style.background = inFlag.progress === 0 ? COL.neutral : (inFlag.progress > 0) === (P.team === 0) ? COL.friend : COL.enemy;
    } else this.el.capture.hidden = true;

    // out of bounds
    const oob = g.playerCtl.oobT;
    this.el.oob.hidden = !(oob > 0);
    if (oob > 0) this._set('oob', this.el.oobT, String(Math.max(0, Math.ceil(10 - oob))));

    // downed
    const down = P.state === 'downed';
    this.el.downed.hidden = !down;
    if (down) {
      const k = this.killedBy;
      this._set('dby', this.el.downedBy, k ? `${k.name.toUpperCase()} · ${this.killedWeapon || ''}` : (this.killedWeapon || 'KILLED IN ACTION'));
      this._set('dt', this.el.downedT, String(Math.max(0, Math.ceil(P.downedT))));
    }

    // squad list
    this.sbT -= dt;
    if (this.sbT <= 0) {
      this.sbT = 0.5;
      this._squadList();
      if (!this.el.scoreboard.hidden) this._scoreboard();
    }
    const showSb = g.input.down('scoreboard') || g.mode.over;
    if (showSb && this.el.scoreboard.hidden) { this.el.scoreboard.hidden = false; this._scoreboard(); }
    else if (!showSb && !this.el.scoreboard.hidden) this.el.scoreboard.hidden = true;
    const showMap = g.input.down('map');
    this.el.bigmap.hidden = !showMap;
    if (showMap) this.drawFullMap(this.el.bigmapCanvas, {});

    // timers
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    this.popTotalT -= dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.suppression = Math.max(0, this.suppression - dt * 0.5);
    const lowHp = P.state === 'alive' ? clamp((0.5 - P.health / RULES.playerHealth) / 0.5, 0, 1) : 0;
    this.el.vignette.style.opacity = String(clamp(lowHp * 0.7 + this.hurtFlash * 0.5, 0, 1));
    this.el.suppress.style.opacity = String(this.suppression * 0.85);
    if (lowHp > 0.6 && P.state === 'alive') {
      this.heartT = (this.heartT || 0) - dt;
      if (this.heartT <= 0) { this.heartT = 1.1; g.audio.heartbeat(); }
    }

    const scoped = P.state === 'alive' && !P.vehicle && P.slot === 0 && P.gun.def.scope && P.adsT > 0.85;
    this.el.scope.hidden = !scoped;

    this._drawMinimap();
    this._drawOverlay(dt);
  }

  _squadList() {
    const g = this.game, P = g.player;
    const mates = g.soldiers.filter((s) => s.team === P.team && s.squad === P.squad);
    this._set('sqn', this.el.squadName, `SQUAD ${SQUAD_NAMES[P.squad] || ''}`);
    const html = mates.map((s) => {
      const st = s.state === 'alive' ? (s.vehicle ? 'TANK' : s.classId.slice(0, 3).toUpperCase()) : s.state === 'downed' ? 'DOWN' : 'KIA';
      const cls = s === P ? 'me' : s.state !== 'alive' ? 'out' : '';
      return `<li class="${cls}"><span>${esc(s === P ? g.settings.playerName : s.name)}</span><em>${st}</em></li>`;
    }).join('');
    if (this.last.squad !== html) { this.el.squad.innerHTML = html; this.last.squad = html; }
  }

  _scoreboard() {
    const g = this.game, P = g.player;
    const cols = [0, 1].map((t) => {
      const list = g.soldiers.filter((s) => s.team === t).sort((a, b) => b.stats.score - a.stats.score);
      const rows = list.map((s, i) => {
        const me = s === P ? ' class="me"' : s.team === P.team && s.squad === P.squad ? ' class="sq"' : '';
        const st = s.state === 'alive' ? '' : s.state === 'downed' ? '✚' : '✕';
        return `<tr${me}><td>${i + 1}</td><td>${esc(s === P ? g.settings.playerName : s.name)} <i>${st}</i></td><td>${esc(s.cls.name.slice(0, 3))}</td><td>${s.stats.score}</td><td>${s.stats.kills}</td><td>${s.stats.deaths}</td><td>${s.stats.assists}</td></tr>`;
      }).join('');
      const tk = Math.ceil(g.mode.tickets[t]);
      return `<div class="sb-team t${t === P.team ? 'f' : 'e'}"><h3><span>${esc(TEAMS[t].name)}</span><b>${tk}</b></h3>
        <table><thead><tr><th>#</th><th>NAME</th><th>CLS</th><th>SCORE</th><th>K</th><th>D</th><th>A</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    });
    const html = `<div class="sb-head"><span>${esc(this.game.mode.flags.length ? 'CONQUEST' : 'TEAM DEATHMATCH')} · ${esc(MAP.name)}</span><span>${formatTime(g.mode.time)}</span></div><div class="sb-cols">${cols[P.team]}${cols[1 - P.team]}</div>`;
    if (this.last.sb !== html) { this.el.scoreboard.innerHTML = html; this.last.sb = html; }
  }

  // ------------------------------------------------------------ minimap
  _drawMinimap() {
    const g = this.game, P = g.player, ctx = this.mctx;
    const W = this.mini.width, H = this.mini.height;
    const dpr = this.dpr;
    const range = P.vehicle ? 140 : 105;
    const scale = (W / 2) / range;
    const cx = W / 2, cy = H / 2;
    const yaw = P.vehicle && P.state === 'alive' ? g.playerCtl.camYaw : P.yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const px = P.pos.x, pz = P.pos.z;
    const toS = (x, z) => {
      const dx = (x - px) * scale, dz = (z - pz) * scale;
      return [cx + dx * cos - dz * sin, cy + dx * sin + dz * cos];
    };
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1b1f1c';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, cy);
    ctx.rotate(yaw);
    ctx.scale(scale, scale);
    ctx.translate(-px, -pz);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.mapImg, -MAP_HALF, -MAP_HALF, MAP_HALF * 2, MAP_HALF * 2);
    ctx.globalAlpha = 1;
    // flag zones
    for (const f of g.mode.flags) {
      ctx.beginPath();
      ctx.arc(f.x, f.z, f.radius, 0, Math.PI * 2);
      ctx.fillStyle = teamColor(f.owner, P.team) + '33';
      ctx.fill();
      ctx.lineWidth = 1.2 / scale * dpr;
      ctx.strokeStyle = teamColor(f.owner, P.team);
      ctx.stroke();
    }
    ctx.restore();

    // view cone
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, W * 0.42, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    ctx.closePath();
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.42);
    grad.addColorStop(0, 'rgba(232,234,227,0.22)');
    grad.addColorStop(1, 'rgba(232,234,227,0)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    const now = g.time;
    const r = 3.2 * dpr;
    // vehicles
    for (const v of g.vehicles) {
      if (!v.exists) continue;
      const friendly = v.team === P.team;
      if (!friendly && !(v.miniUntil > now || v.spottedUntil > now || (v.driver && now - v.driver.lastFireT < 1.5))) continue;
      const [x, y] = toS(v.pos.x, v.pos.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(yaw - v.yaw);
      ctx.fillStyle = !v.alive ? '#555' : friendly ? COL.friend : COL.enemy;
      ctx.fillRect(-4 * dpr, -6 * dpr, 8 * dpr, 12 * dpr);
      ctx.fillRect(-1 * dpr, -11 * dpr, 2 * dpr, 6 * dpr);
      ctx.restore();
    }
    // soldiers
    for (const s of g.soldiers) {
      if (s === P || s.state !== 'alive' || s.vehicle) continue;
      const friendly = s.team === P.team;
      if (!friendly && !(s.miniUntil > now || s.spottedUntil > now)) continue;
      const [x, y] = toS(s.pos.x, s.pos.z);
      ctx.fillStyle = friendly ? (s.squad === P.squad ? COL.squad : COL.friend) : COL.enemy;
      if (friendly) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(yaw - s.yaw);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, r); ctx.lineTo(-r, r);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // downed teammates
    for (const s of g.soldiers) {
      if (s.state !== 'downed' || s.team !== P.team) continue;
      const [x, y] = toS(s.pos.x, s.pos.z);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 1 * dpr, y - 4 * dpr, 2 * dpr, 8 * dpr);
      ctx.fillRect(x - 4 * dpr, y - 1 * dpr, 8 * dpr, 2 * dpr);
    }
    // flag letters (kept upright, clamped to the rim)
    ctx.font = `700 ${11 * dpr}px "Saira Semi Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of g.mode.flags) {
      let [x, y] = toS(f.x, f.z);
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), lim = W / 2 - 11 * dpr;
      if (d > lim) { x = cx + (dx / d) * lim; y = cy + (dy / d) * lim; }
      ctx.fillStyle = 'rgba(12,15,17,0.85)';
      ctx.fillRect(x - 8 * dpr, y - 8 * dpr, 16 * dpr, 16 * dpr);
      ctx.strokeStyle = teamColor(f.owner, P.team);
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x - 8 * dpr, y - 8 * dpr, 16 * dpr, 16 * dpr);
      ctx.fillStyle = teamColor(f.owner, P.team);
      ctx.fillText(f.id, x, y + 0.5 * dpr);
    }
    // player arrow
    ctx.fillStyle = COL.white;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7 * dpr);
    ctx.lineTo(cx + 5 * dpr, cy + 5 * dpr);
    ctx.lineTo(cx, cy + 2.5 * dpr);
    ctx.lineTo(cx - 5 * dpr, cy + 5 * dpr);
    ctx.closePath();
    ctx.fill();
    // compass N (world -Z rotates with the map)
    const nr = W / 2 - 8 * dpr;
    ctx.fillStyle = COL.signal;
    ctx.font = `700 ${10 * dpr}px "Saira Semi Condensed", sans-serif`;
    ctx.fillText('N', cx + Math.sin(yaw) * nr, cy - Math.cos(yaw) * nr);
  }

  // Full-screen/deploy map. opts.points: spawn points, opts.selected: id
  drawFullMap(canvas, opts = {}) {
    const g = this.game, P = g.player;
    const dpr = this.dpr;
    const size = Math.floor(Math.min(canvas.clientWidth, canvas.clientHeight || canvas.clientWidth) * dpr);
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    const ctx = canvas.getContext('2d');
    const k = size / (MAP_HALF * 2);
    const toS = (x, z) => [(x + MAP_HALF) * k, (z + MAP_HALF) * k];
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.mapImg, 0, 0, size, size);
    const team = P ? P.team : 0;
    // HQs
    HQS.forEach((q, t) => {
      const [x, y] = toS(q.x, q.z);
      ctx.fillStyle = teamColor(t, team);
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(x, y, 14 * k, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of g.mode.flags) {
      const [x, y] = toS(f.x, f.z);
      ctx.beginPath();
      ctx.arc(x, y, f.radius * k, 0, Math.PI * 2);
      ctx.fillStyle = teamColor(f.owner, team) + '40';
      ctx.fill();
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = teamColor(f.owner, team);
      ctx.stroke();
    }
    const now = g.time;
    for (const v of g.vehicles) {
      if (!v.alive || (v.team !== team && !(v.spottedUntil > now || v.miniUntil > now))) continue;
      const [x, y] = toS(v.pos.x, v.pos.z);
      ctx.fillStyle = teamColor(v.team, team);
      ctx.fillRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr);
    }
    for (const s of g.soldiers) {
      if (s.state !== 'alive' || s.vehicle || s === P) continue;
      if (s.team !== team && !(s.miniUntil > now || s.spottedUntil > now)) continue;
      const [x, y] = toS(s.pos.x, s.pos.z);
      ctx.fillStyle = s.team === team ? (P && s.squad === P.squad ? COL.squad : COL.friend) : COL.enemy;
      ctx.beginPath(); ctx.arc(x, y, 2.6 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    if (P && P.state === 'alive') {
      const [x, y] = toS(P.pos.x, P.pos.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-P.yaw);
      ctx.fillStyle = COL.signal;
      ctx.beginPath(); ctx.moveTo(0, -7 * dpr); ctx.lineTo(5 * dpr, 5 * dpr); ctx.lineTo(-5 * dpr, 5 * dpr); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.font = `700 ${13 * dpr}px "Saira Semi Condensed", sans-serif`;
    for (const f of g.mode.flags) {
      const [x, y] = toS(f.x, f.z);
      ctx.fillStyle = 'rgba(12,15,17,0.85)';
      ctx.fillRect(x - 10 * dpr, y - 10 * dpr, 20 * dpr, 20 * dpr);
      ctx.strokeStyle = teamColor(f.owner, team);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x - 10 * dpr, y - 10 * dpr, 20 * dpr, 20 * dpr);
      ctx.fillStyle = teamColor(f.owner, team);
      ctx.fillText(f.id, x, y + 1);
    }
    // spawn points for the deploy screen
    this.spawnHit = [];
    if (opts.points) {
      for (const pt of opts.points) {
        const [x, y] = toS(pt.x, pt.z);
        const sel = opts.selected === pt.id;
        const r = (pt.type === 'squad' ? 7 : 13) * dpr;
        ctx.lineWidth = (sel ? 3 : 1.5) * dpr;
        ctx.strokeStyle = sel ? COL.signal : 'rgba(232,234,227,0.9)';
        ctx.beginPath(); ctx.arc(x, y, r + 4 * dpr, 0, Math.PI * 2); ctx.stroke();
        if (pt.type === 'squad') {
          ctx.fillStyle = COL.squad;
          ctx.beginPath(); ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2); ctx.fill();
        } else if (pt.type === 'hq') {
          ctx.fillStyle = COL.friend;
          ctx.font = `800 ${11 * dpr}px "Saira Semi Condensed", sans-serif`;
          ctx.fillText('HQ', x, y + 1);
        }
        this.spawnHit.push({ id: pt.id, x: x / dpr, y: y / dpr, r: (r + 8 * dpr) / dpr });
      }
    }
  }

  // ------------------------------------------------------------ overlay (crosshair, markers)
  _project(x, y, z) {
    _p.set(x, y, z).project(this.game.camera);
    const W = this.overlay.width, H = this.overlay.height;
    return { x: (_p.x * 0.5 + 0.5) * W, y: (-_p.y * 0.5 + 0.5) * H, behind: _p.z > 1 };
  }

  _drawOverlay(dt) {
    const g = this.game, P = g.player, ctx = this.octx;
    const W = this.overlay.width, H = this.overlay.height, dpr = this.dpr;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const cam = g.camera;
    const now = g.time;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Flag markers
    for (const f of g.mode.flags) {
      const pr = this._project(f.x, f.y + 11, f.z);
      if (pr.behind) continue;
      const dist = Math.hypot(cam.position.x - f.x, cam.position.z - f.z);
      const inside = P.state === 'alive' && Math.hypot(P.pos.x - f.x, P.pos.z - f.z) < f.radius;
      const sz = (inside ? 15 : 12) * dpr;
      const c = teamColor(f.owner, P.team);
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.fillStyle = 'rgba(12,15,17,0.7)';
      ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
      if (Math.abs(f.progress) > 0 && Math.abs(f.progress) < 1) {
        const capC = (f.progress > 0) === (P.team === 0) ? COL.friend : COL.enemy;
        ctx.fillStyle = capC + '88';
        const hgt = sz * 2 * Math.abs(f.progress);
        ctx.fillRect(-sz, sz - hgt, sz * 2, hgt);
      }
      ctx.strokeStyle = c;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
      ctx.fillStyle = c;
      ctx.font = `700 ${(inside ? 16 : 13) * dpr}px "Saira Semi Condensed", sans-serif`;
      ctx.fillText(f.id, 0, 1 * dpr);
      ctx.font = `600 ${10 * dpr}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = 'rgba(232,234,227,0.85)';
      ctx.fillText(`${Math.round(dist)}m`, 0, sz + 9 * dpr);
      ctx.restore();
    }

    // Soldier markers
    for (const s of g.soldiers) {
      if (s === P || s.vehicle) continue;
      const friendly = s.team === P.team;
      if (s.state === 'downed' && friendly) {
        const d = s.pos.distanceTo(cam.position);
        if (d > 60) continue;
        const pr = this._project(s.pos.x, s.pos.y + 0.9, s.pos.z);
        if (pr.behind) continue;
        ctx.fillStyle = 'rgba(12,15,17,0.7)';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 10 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(pr.x - 1.5 * dpr, pr.y - 6 * dpr, 3 * dpr, 12 * dpr);
        ctx.fillRect(pr.x - 6 * dpr, pr.y - 1.5 * dpr, 12 * dpr, 3 * dpr);
        ctx.font = `600 ${10 * dpr}px "IBM Plex Mono", monospace`;
        ctx.fillText(`${Math.ceil(s.downedT)}`, pr.x, pr.y + 18 * dpr);
        continue;
      }
      if (s.state !== 'alive') continue;
      if (!friendly && !(s.spottedUntil > now)) continue;
      const d = s.pos.distanceTo(cam.position);
      if (friendly && d > 120 && s.squad !== P.squad) continue;
      const pr = this._project(s.pos.x, s.pos.y + s.eyeH + 0.55, s.pos.z);
      if (pr.behind) continue;
      const c = friendly ? (s.squad === P.squad ? COL.squad : COL.friend) : COL.enemy;
      const a = friendly ? clamp(1.2 - d / 120, 0.35, 1) : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1 * dpr;
      const sz = (friendly ? 5 : 6) * dpr;
      ctx.beginPath();
      if (friendly) { ctx.moveTo(pr.x - sz, pr.y - sz * 0.8); ctx.lineTo(pr.x + sz, pr.y - sz * 0.8); ctx.lineTo(pr.x, pr.y + sz * 0.6); }
      else { ctx.moveTo(pr.x, pr.y - sz); ctx.lineTo(pr.x + sz, pr.y); ctx.lineTo(pr.x, pr.y + sz); ctx.lineTo(pr.x - sz, pr.y); }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const near = Math.abs(pr.x - cx) < 90 * dpr && Math.abs(pr.y - cy) < 70 * dpr;
      if ((friendly && s.squad === P.squad && d < 80) || near) {
        ctx.font = `600 ${11 * dpr}px "Saira Semi Condensed", sans-serif`;
        ctx.fillText(s.name, pr.x, pr.y - 12 * dpr);
      }
      ctx.globalAlpha = 1;
    }
    // Tanks
    for (const v of g.vehicles) {
      if (!v.alive || v === P.vehicle) continue;
      const friendly = v.team === P.team;
      if (!friendly && !(v.spottedUntil > now)) continue;
      const pr = this._project(v.pos.x, v.pos.y + 4, v.pos.z);
      if (pr.behind) continue;
      ctx.strokeStyle = friendly ? COL.friend : COL.enemy;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(pr.x - 9 * dpr, pr.y - 6 * dpr, 18 * dpr, 12 * dpr);
      ctx.fillStyle = friendly ? COL.friend : COL.enemy;
      ctx.font = `700 ${9 * dpr}px "IBM Plex Mono", monospace`;
      ctx.fillText(friendly && !v.driver ? 'EMPTY' : 'TANK', pr.x, pr.y + 16 * dpr);
    }

    // Damage direction
    for (let i = this.dmgMarks.length - 1; i >= 0; i--) {
      const m = this.dmgMarks[i];
      m.t -= dt;
      if (m.t <= 0) { this.dmgMarks.splice(i, 1); continue; }
      const camYaw = P.vehicle && P.state === 'alive' ? g.playerCtl.camYaw : P.yaw;
      const rel = wrapAngle(m.yaw - camYaw);
      const R = Math.min(W, H) * 0.16;
      const ang = -Math.PI / 2 - rel;
      ctx.strokeStyle = `rgba(255,60,40,${clamp(m.t, 0, 1) * 0.85})`;
      ctx.lineWidth = 7 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, R, ang - 0.28, ang + 0.28);
      ctx.stroke();
    }

    if (P.state !== 'alive') return;

    // Crosshair
    if (P.vehicle) {
      const v = P.vehicle;
      ctx.strokeStyle = 'rgba(232,234,227,0.9)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(cx, cy, 16 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 28 * dpr, cy); ctx.lineTo(cx - 18 * dpr, cy);
      ctx.moveTo(cx + 18 * dpr, cy); ctx.lineTo(cx + 28 * dpr, cy);
      ctx.moveTo(cx, cy + 18 * dpr); ctx.lineTo(cx, cy + 28 * dpr);
      ctx.stroke();
      // Where the barrel actually points
      const tip = v.barrelTip(_q);
      const d = v.aimDir(_r);
      const h = g.world.raycast(tip.x, tip.y, tip.z, d.x, d.y, d.z, 450, true);
      const t = h.hit ? h.t : 450;
      const pr = this._project(tip.x + d.x * t, tip.y + d.y * t, tip.z + d.z * t);
      if (!pr.behind) {
        ctx.strokeStyle = v.reload > 0 ? 'rgba(255,90,60,0.9)' : 'rgba(124,227,91,0.95)';
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(pr.x - 5 * dpr, pr.y - 5 * dpr, 10 * dpr, 10 * dpr);
      }
      if (g.playerCtl.tankWeapon === 0 && v.reload > 0) {
        ctx.strokeStyle = 'rgba(242,179,61,0.9)';
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, 22 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - v.reload / VEHICLES.tank.reload));
        ctx.stroke();
      }
    } else {
      const ads = P.adsT;
      const scoped = P.slot === 0 && P.gun.def.scope;
      if (P.slot < 2 && !(scoped && ads > 0.5)) {
        const spread = g.playerCtl.currentSpread();
        const px = (Math.tan(spread) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * (H / 2);
        const gap = Math.max(4 * dpr, px);
        const len = 7 * dpr;
        const alpha = 1 - ads;
        if (alpha > 0.02) {
          ctx.strokeStyle = `rgba(232,234,227,${0.9 * alpha})`;
          ctx.lineWidth = 2 * dpr;
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 2 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
          ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
          ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
          ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(232,234,227,${0.9 * alpha})`;
          ctx.fillRect(cx - 1 * dpr, cy - 1 * dpr, 2 * dpr, 2 * dpr);
        }
        if (ads > 0.8) {
          ctx.fillStyle = 'rgba(255,48,32,0.95)';
          ctx.beginPath(); ctx.arc(cx, cy, 1.8 * dpr, 0, Math.PI * 2); ctx.fill();
        }
      } else if (P.slot === 2) {
        ctx.strokeStyle = 'rgba(232,234,227,0.85)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.arc(cx, cy, 10 * dpr, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(232,234,227,0.9)';
        ctx.fillRect(cx - 1 * dpr, cy - 1 * dpr, 2 * dpr, 2 * dpr);
      }
    }

    // Hitmarker
    if (this.hit.t > 0) {
      this.hit.t -= dt;
      const a = clamp(this.hit.t / 0.18, 0, 1);
      const s = (this.hit.kill ? 11 : 8) * dpr, gap = 4 * dpr;
      ctx.strokeStyle = this.hit.veh ? `rgba(180,180,180,${a})` : this.hit.kill ? `rgba(255,60,40,${a})` : this.hit.head ? `rgba(242,179,61,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = (this.hit.kill ? 3 : 2) * dpr;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(cx + sx * gap, cy + sy * gap);
        ctx.lineTo(cx + sx * (gap + s), cy + sy * (gap + s));
      }
      ctx.stroke();
    }

    // Running score total
    if (this.popTotalT > 0) {
      ctx.globalAlpha = clamp(this.popTotalT, 0, 1);
      ctx.fillStyle = COL.signal;
      ctx.font = `700 ${22 * dpr}px "Saira Semi Condensed", sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`+${this.popTotal}`, cx + 60 * dpr, cy - 30 * dpr);
      ctx.globalAlpha = 1;
    }
  }
}

const _q = new THREE.Vector3(), _r = new THREE.Vector3();
