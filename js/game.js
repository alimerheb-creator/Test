// Game orchestrator: renderer, match lifecycle, main loop and camera modes.
import * as THREE from 'three';
import { DEFAULT_SETTINGS, BOT_NAMES, CLASS_ORDER, CLASSES, HQS, QUALITY, VEHICLES, ATMOSPHERE, RULES, VEGETATION, PLAY_HALF } from './config.js';
import { Emitter, loadSettings, saveSettings, rand, clamp } from './util.js';
import { World } from './world.js';
import { weatherMaterial } from './textures.js';
import { Buildings } from './buildings.js';
import { Towers } from './towers.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { Combat } from './weapons.js';
import { Soldier, clearSoldierModelCache } from './soldier.js';
import { BotBrain } from './ai.js';
import { Tank } from './vehicles.js';
import { PlayerController } from './player.js';
import { Conquest } from './conquest.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { PostFX } from './post.js';
import { Grass } from './grass.js';
import { SUN_DIR } from './world.js';
import { ModManager } from './mods.js';

export class Game extends Emitter {
  constructor() {
    super();
    this.settings = loadSettings(DEFAULT_SETTINGS);
    this.time = 0;
    this.state = 'loading';
    this.soldiers = [];
    this.vehicles = [];
    this.player = null;
    this.redeployT = 0;
    this.deathDelay = 0;
    this.menuAngle = 0.6;
    this.frames = 0;
    this._last = 0;
    this.timeScale = 1; // mods can slow down or speed up the whole simulation
  }

  async init(progress = () => {}) {
    const canvas = document.getElementById('game');
    this.canvas = canvas;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.isTouch = !!(coarse && 'ontouchstart' in window);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    // (no blocking check of every shader as it compiles: it stalls the frame; the driver compiles in the background)
    renderer.debug.checkShaderErrors = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = this.qualityPreset().shadows > 0;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 1500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // Snapshot the untouched config before anything reads it, so mods can always be undone
    this.mods = new ModManager(this);
    await this.mods.recoverMissing();
    // Map mods change the battlefield itself, so they go in before the world is built
    this.mods.applyMap();
    const step = () => new Promise((r) => setTimeout(r, 0));
    progress(0.1, 'Surveying terrain');
    await step();
    this.world = new World(this);
    // weathered painted steel for mods' ships and vehicles (see textures.js)
    this.weatherMaterial = (m, o) => weatherMaterial(m, this.world.tex && this.world.tex.grime, o);
    this.world.build();
    progress(0.45, 'Raising the town');
    await step();
    this.effects = new Effects(this);
    this.buildings = new Buildings(this);
    this.buildings.generate();
    this.towers = new Towers(this);
    this.towers.generate();
    this.grass = new Grass(this);
    this.post = new PostFX(renderer);
    progress(0.65, 'Arming both sides');
    await step();
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(canvas);
    this.combat = new Combat(this);
    this.mode = new Conquest(this);
    this.vehicles = [new Tank(this, 0, 0), new Tank(this, 0, 1), new Tank(this, 1, 0), new Tank(this, 1, 1)];
    this.playerCtl = new PlayerController(this);
    this.hud = new HUD(this);
    this.ui = new UI(this);
    progress(0.8, 'Loading mods');
    this.mods.applyAll();
    this.onModsApplied();
    progress(0.85, 'Briefing squads');
    await step();

    this.applyQuality();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.input.touchMode && !this.input.lockFailed) this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing' && (this.input.lockFailed || this.input.touchMode || e.code === 'KeyP')) this.pause();
        else if (this.state === 'paused' && e.code === 'KeyP') this.resume();
      }
    });
    const touchBtn = document.getElementById('touch-pause');
    if (touchBtn) touchBtn.addEventListener('click', () => { if (this.state === 'playing') this.pause(); });
    if (this.isTouch) this.input.setupTouch(document.getElementById('touch'));
    this.input.touchSens = this.settings.touchSens;
    this.ui.applyTouchLayout();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.onAppPause(); else this.onAppResume(); });

    this.on('bleedout', (s) => { if (s === this.player) this.deathDelay = 1.2; });
    this.on('kill', (e) => { if (e.victim === this.player && e.victim.state === 'dead') this.deathDelay = 2.2; });
    this.on('matchEnd', () => {
      setTimeout(() => {
        if (this.state === 'menu') return;
        this.state = 'ended';
        this.input.enabled = false;
        this.input.exitLock();
        this.hud.show(false);
        this.ui.showEnd(this.mode.winner);
      }, 3500);
    });

    // A live battle plays behind the main menu
    this.newMatch();
    this.state = 'menu';
    this.ui.show('main');
    progress(1, 'Ready');
    requestAnimationFrame((t) => this._loop(t));
  }

  qualityName() {
    const q = this.settings.quality;
    return QUALITY[q] ? q : this.isTouch ? 'medium' : 'high';
  }

  qualityPreset() { return QUALITY[this.qualityName()]; }

  applyQuality() {
    const Q = this.qualityPreset();
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, Q.pixelRatio));
    const shadows = Q.shadows > 0;
    const sun = this.world.sun;
    const needsRecompile = this.renderer.shadowMap.enabled !== shadows;
    this.renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    this.world.setShadowQuality(Math.max(512, Q.shadows), Q.shadowExtent);
    if (needsRecompile) this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.grass.setCount(Math.round(Q.grass * VEGETATION.grass));
    this.post.configure({ samples: Q.msaa, bloom: Q.bloom, ao: Q.ao });
    this.usePost = Q.post;
    this._resize();
  }

  _resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.playerCtl) {
      this.playerCtl.vmCam.aspect = w / h;
      this.playerCtl.vmCam.updateProjectionMatrix();
    }
    if (this.post) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.post.setSize(size.x, size.y);
    }
    if (this.effects) this.effects.setScale(this.renderer.domElement.height, this.camera.fov);
  }

  // Refresh everything that caches config values after mods were (re)applied
  onModsApplied() {
    clearSoldierModelCache();
    this.playerCtl.clearViewmodels();
    for (const v of this.vehicles) v.rebuildModel();
    const atm = this.world.applyAtmosphere(ATMOSPHERE);
    this.exposure = atm.exposure;
    this.renderer.toneMappingExposure = atm.exposure;
    this.playerCtl.setViewmodelLight(atm.viewmodelLight ?? 1);
    if (this.post) this.post.setExposure(atm.exposure);
    if (!CLASSES[this.ui.selectedClass] || !CLASS_ORDER.includes(this.ui.selectedClass)) this.ui.selectedClass = CLASS_ORDER[0];
    this.ui.renderClassCards();
    this.ui.updateModsButton();
    this.ui.renderBattles();
    this.hud.updateLabels();
  }

  // Re-apply the mod list (called when leaving the mods screen) and restart the background battle
  reloadMods() {
    // A different map needs a fresh world: restart the page (the mod list is already saved)
    if (this.mods.mapChanged()) {
      this.ui.showRestart();
      setTimeout(() => location.reload(), 60);
      return;
    }
    this.mods.applyAll();
    this.onModsApplied();
    if (this.state === 'menu') this.newMatch();
  }

  // The main menu's battle picker: 'normal' or a battle mod's id. A different battlefield restarts the page.
  // opts.map and opts.mode pick one of the battle's maps and modes
  setBattle(id, opts = {}) {
    id = id || 'normal';
    this.settings.battleType = id;
    if (opts.map) this.settings.battleMaps = { ...(this.settings.battleMaps || {}), [id]: opts.map };
    if (opts.mode) this.settings.battleModes = { ...(this.settings.battleModes || {}), [id]: opts.mode };
    saveSettings(this.settings, true);
    this.reloadMods();
  }

  // Ground or sea surface, whichever is higher
  surfaceAt(x, z) {
    const h = this.world.heightAt(x, z), w = this.world.water;
    return w !== null && w > h ? w : h;
  }

  vibrate(pattern) {
    if (!this.isTouch || !this.settings.vibration || this.state !== 'playing') return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  }

  // Android back button / app lifecycle hooks (also used by the web page's visibility events)
  onBack() {
    if (this.state === 'menu' && !this.ui.screens.mods.hidden) { this.ui.closeMods(); return 'menu'; }
    if (this.state === 'playing') { this.pause(); return 'paused'; }
    if (this.state === 'paused') { this.resume(); return 'resumed'; }
    if (this.state === 'deploy' || this.state === 'ended') { this.quitToMenu(); return 'menu'; }
    return 'exit';
  }

  onAppPause() {
    if (this.state === 'playing') this.pause();
    try { if (this.audio.ctx) this.audio.ctx.suspend(); } catch (e) { /* ignore */ }
  }

  onAppResume() {
    try { if (this.audio.ctx) this.audio.ctx.resume(); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ match lifecycle
  newMatch() {
    const st = this.settings;
    for (const s of this.soldiers) s.dispose();
    this.soldiers = [];
    this.effects.clear();
    this.combat.clear();
    this.buildings.reset();
    this.towers.reset();
    this.world.reset();
    this.mode.reset(RULES.startTickets > 0 ? RULES.startTickets : st.tickets);
    this.time = 0;
    this.timeScale = 1;
    for (const v of this.vehicles) {
      v.exists = false; v.alive = false; v.driver = null; v.claimedBy = null; v.hull.visible = false;
    }
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let ni = 0;
    // (the side you picked on the deploy screen; Multiplayer and Career Mode missions set it themselves)
    const side = st.side === 1 ? 1 : 0;
    const P = new Soldier(this, { team: side, name: st.playerName, isPlayer: true, squad: 0, classId: this.ui ? this.ui.selectedClass : 'assault' });
    this.player = P;
    this.soldiers.push(P);
    const n = Math.max(4, st.botsPerTeam);
    for (let team = 0; team < 2; team++) {
      const count = team === side ? n - 1 : n;
      for (let i = 0; i < count; i++) {
        const idx = team === side ? i + 1 : i;
        const s = new Soldier(this, {
          team, name: names[ni++ % names.length], squad: Math.floor(idx / 4), classId: CLASS_ORDER[(idx + team) % CLASS_ORDER.length],
        });
        new BotBrain(this, s);
        s.state = 'dead';
        s.respawnT = rand(0.2, 3.5);
        s.bodyT = 99;
        this.soldiers.push(s);
      }
    }
    const tanksPerSide = Math.max(0, Math.min(2, n >= 10 ? VEHICLES.tank.perTeam : Math.min(1, VEHICLES.tank.perTeam)));
    for (const v of this.vehicles) if (v.slot < tanksPerSide) v.spawn();
    this.playerCtl.attach(P);
    this.hud.updateLabels();
    this.redeployT = 0;
    this.deathDelay = 0;
    this.playerCtl.deathYaw = undefined;
    this.emit('matchStart', this);
  }

  startMatch() {
    this.newMatch();
    this.openDeploy(0);
  }

  openDeploy(wait = 0) {
    this.state = 'deploy';
    this.redeployT = wait;
    this.input.enabled = false;
    this.input.exitLock();
    this.hud.show(false);
    this.hud.setPrompt(null);
    this.ui.showDeploy();
  }

  deployPlayer(classId, point) {
    const P = this.player;
    if (P.state === 'alive' || P.state === 'downed') return;
    P.setClass(classId);
    const sp = this.mode.spawnPos(point, P.team);
    P.spawn(sp.x, sp.y, sp.z, sp.yaw);
    this.playerCtl.attach(P);
    this.input.resetToggles();
    this.state = 'playing';
    this.ui.show(null);
    this.hud.show(true);
    this.input.enabled = true;
    this.input.requestLock();
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.effects.setScale(this.renderer.domElement.height, this.camera.fov);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.exitLock();
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.show(null);
    this.input.enabled = true;
    this.input.requestLock();
  }

  suicideRedeploy() {
    const P = this.player;
    this.state = 'playing';
    if (P.state === 'alive') P.takeDamage(999, null, { weapon: 'REDEPLOY', force: true, noRevive: true });
    else if (P.state === 'downed') P.bleedOut();
    this.openDeploy(3);
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.exitLock();
    this.hud.show(false);
    const P = this.player;
    if (P && P.vehicle) P.vehicle.removeDriver(P, true);
    if (P) P.state = 'inactive';
    this.ui.show('main');
  }

  // ------------------------------------------------------------ loop
  _loop(t) {
    requestAnimationFrame((tt) => this._loop(tt));
    const dt = Math.min(0.05, this._last ? (t - this._last) / 1000 : 0.016);
    if (this._last) this._dynRes(t - this._last);
    this._last = t;
    try {
      this.frame(dt);
    } catch (e) {
      console.error(e);
    }
  }

  // Dynamic resolution: when the frames come too slowly for a while (the graphics can't keep up), draw the next
  // ones a step lower in resolution, down to 70% of the quality's own; when there's room again, step back up. The
  // picture stays the same, only a touch softer while the load is heavy.
  _dynRes(ms) {
    if (this.state !== 'playing' || ms > 250) { this._drsT = 0; this._ft = 0; return; }
    this._ft = this._ft ? this._ft * 0.94 + ms * 0.06 : ms;
    this._drsT = (this._drsT || 0) + ms / 1000;
    if (this._drsT < 2) return;
    const Q = this.qualityPreset(), top = Math.min(window.devicePixelRatio || 1, Q.pixelRatio), cur = this.renderer.getPixelRatio();
    let next = cur;
    if (this._ft > 1000 / 42) next = Math.max(top * 0.7, cur - top * 0.1);
    else if (this._ft < 1000 / 56) next = Math.min(top, cur + top * 0.1);
    if (Math.abs(next - cur) < 0.01) return;
    this._drsT = 0;
    this.renderer.setPixelRatio(next);
    this._resize();
  }

  // One tick. `render` can be switched off to fast-forward the simulation.
  frame(dt, render = true) {
    const P = this.player;
    if (this.timeScale !== 1) dt *= this.timeScale;
    this.frames++;
    if (this.state !== 'paused') {
      this.time += dt;
      if (this.state === 'playing') this.playerCtl.update(dt);
      for (const s of this.soldiers) if (s.brain) s.brain.update(dt);
      for (const s of this.soldiers) s.update(dt);
      for (const v of this.vehicles) v.update(dt);
      this.combat.update(dt);
      this.mode.update(dt);
      this.buildings.update(dt);
      this.towers.update(dt);
      this.effects.update(dt);
      // soft contact shadows under what's beyond the sun's shadow map (it reaches about its extent from the camera)
      if (this.renderer.shadowMap.enabled) this.effects.updateBlobs(this.qualityPreset().shadowExtent, 420);
      else this.effects.updateBlobs(0, 160);
      for (const s of this.soldiers) if (s.throwCd > 0) s.throwCd -= dt;
      this.audio.ambient(dt);
      this._engineSound();
      this.emit('tick', dt);

      if (this.state === 'playing' && P.state === 'dead') {
        this.deathDelay -= dt;
        if (this.deathDelay <= 0) this.openDeploy(4);
      }
      if (this.state === 'deploy' && this.redeployT > 0) this.redeployT -= dt;
    }

    const cam = this.camera;
    if (this.state === 'playing' || this.state === 'paused') this.playerCtl.updateCamera(dt);
    else if (this.state === 'deploy') this._deployCam(dt);
    else this._menuCam(dt);

    this.world.updateSky(cam.position);
    this.world.updateWater(dt);
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _v.copy(cam.position).addScaledVector(_f, 40);
    this.world.updateShadow(_v);
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y);

    if (this.state === 'playing' || this.state === 'paused') this.hud.update(dt);
    else if (this.state === 'deploy') this.ui.updateDeploy(dt);

    this.grass.update(cam.position, this.time);
    if (render) {
      const r = this.renderer;
      const pc = this.playerCtl;
      const showVM = (this.state === 'playing' || this.state === 'paused') && P.state === 'alive' && !P.vehicle && pc.vmRoot.visible;
      if (showVM) { pc.vmScene.environment = this.scene.environment; pc.vmScene.environmentIntensity = this.scene.environmentIntensity ?? 0.55; }
      if (this.usePost) {
        this._postParams(dt);
        this.post.render(this.scene, cam, showVM ? { scene: pc.vmScene, cam: pc.vmCam } : null, this.fx);
      } else {
        r.setRenderTarget(null);
        r.clear();
        r.render(this.scene, cam);
        if (showVM) { r.clearDepth(); r.render(pc.vmScene, pc.vmCam); }
      }
    }
    this.input.endFrame();
  }

  // Values the post-processing pass needs: sun glare position/visibility, sun shafts, speed blur and damage
  // feedback. (Mods set game.motionBlur, 0..1, for speed: the aircraft do while you fly fast.)
  _postParams(dt) {
    const fx = this.fx || (this.fx = { time: 0, hurt: 0, lowHp: 0, sunPos: new THREE.Vector2(), sunVis: 0, sunCheck: 0, sunTarget: 0 });
    fx.time = this.time;
    const cam = this.camera, P = this.player;
    const playing = (this.state === 'playing' || this.state === 'paused') && P && P.state === 'alive';
    fx.hurt = playing ? this.hud.hurtFlash : 0;
    fx.lowHp = playing ? Math.max(0, Math.min(1, (0.45 - P.health / P.maxHealth) / 0.45)) : 0;
    _v.copy(cam.position).addScaledVector(SUN_DIR, 900).project(cam);
    const onScreen = _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
    fx.sunPos.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    fx.sunCheck -= dt;
    if (fx.sunCheck <= 0) {
      fx.sunCheck = 0.1;
      const p = cam.position;
      fx.sunTarget = onScreen && !this.world.raycast(p.x, p.y, p.z, SUN_DIR.x, SUN_DIR.y, SUN_DIR.z, 400, true).hit ? 1 : 0;
      const edge = Math.max(Math.abs(_v.x), Math.abs(_v.y));
      fx.sunTarget *= Math.max(0, 1 - Math.max(0, edge - 0.8) / 0.4);
    }
    if (!onScreen) fx.sunTarget = 0;
    fx.sunVis += (fx.sunTarget - fx.sunVis) * Math.min(1, dt * 8);
    // sun shafts: strongest looking toward a bright sun, gone when it's behind you or the sky is dull
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const facing = THREE.MathUtils.smoothstep(_f.dot(SUN_DIR), 0.25, 0.8);
    fx.rays = facing * THREE.MathUtils.clamp((this.world.sun.intensity - 1.3) / 1.8, 0, 1) * (_v.z < 1 ? 1 : 0) * 0.75;
    // the sunlit haze: the sun's colour, as strong as the sun is, spread over the fog's distance
    fx.sunDir = SUN_DIR;
    const sl = this.world.sun, hzk = 0.035 * Math.min(4, sl.intensity) * (this.world.atmosphere && this.world.atmosphere.haze !== undefined ? +this.world.atmosphere.haze : 1);
    (fx.hazeCol || (fx.hazeCol = new THREE.Vector3())).set(sl.color.r * hzk, sl.color.g * hzk, sl.color.b * hzk);
    fx.hazeDist = Math.max(250, this.scene.fog ? this.scene.fog.far * 0.9 : 900);
    // heat haze: the strongest sources on screen, as screen position, radius and strength
    const E = this.effects, hs = [];
    for (const h of E.heatList) hs.push(h);
    for (const h of E.heatTimed) hs.push({ x: h.x, y: h.y, z: h.z, r: h.r * (1.2 - h.t / h.d * 0.4), k: h.k * (h.t / h.d) });
    const cand = [];
    for (const h of hs) {
      _v.set(h.x, h.y, h.z);
      const dist = _v.distanceTo(cam.position);
      if (dist < 1 || dist > 450) continue;
      _v.project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.4 || Math.abs(_v.y) > 1.4) continue;
      const r = (h.r * cam.projectionMatrix.elements[5] * 0.5) / dist, k = h.k * (1 - dist / 450);
      if (r > 0.004) cand.push([_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, Math.min(r, 0.6), k]);
    }
    cand.sort((a, b) => b[2] * b[3] - a[2] * a[3]);
    fx.heat = fx.heat || Array.from({ length: 8 }, () => new THREE.Vector4());
    fx.heatN = Math.min(8, cand.length);
    for (let i = 0; i < fx.heatN; i++) fx.heat[i].set(...cand[i]);
    E.heatList.length = 0;
    const blur = playing ? (this.motionBlur || 0) : 0;
    fx.blur = (fx.blur || 0) + (blur - (fx.blur || 0)) * Math.min(1, dt * 4);
  }

  _engineSound() {
    const cam = this.camera.position;
    let best = Infinity, thr = 0;
    for (const v of this.vehicles) {
      if (!v.alive || !v.driver) continue;
      const d = v === this.player.vehicle ? 0 : v.pos.distanceTo(cam);
      if (d < best) { best = d; thr = Math.max(0.3, Math.abs(v.speed) / 11); }
    }
    this.audio.setEngine(best < 90, best, thr);
  }

  _menuCam(dt) {
    this.menuAngle += dt * 0.035;
    const a = this.menuAngle;
    const cam = this.camera;
    // bigger maps get a wider, higher orbit
    const k = clamp(PLAY_HALF / 240, 1, 2.6);
    const r = 105 * k;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    cam.position.set(x, Math.max(this.surfaceAt(x, z), this.surfaceAt(0, 0)) + 42 * Math.sqrt(k), z);
    cam.lookAt(0, this.surfaceAt(0, 0) + 6, 0);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); this.effects.setScale(this.renderer.domElement.height, cam.fov); }
  }

  _deployCam(dt) {
    const cam = this.camera;
    const pt = this.ui.selectedPoint ? this.ui.selectedPoint() : null;
    const tx = pt ? pt.x : HQS[0].x, tz = pt ? pt.z : HQS[0].z;
    const ty = this.surfaceAt(tx, tz);
    const toCenter = Math.atan2(-tx, -tz);
    _v.set(tx - Math.sin(toCenter) * 60, ty + 55, tz - Math.cos(toCenter) * 60);
    cam.position.lerp(_v, Math.min(1, dt * 2.5));
    _t.set(tx, ty + 2, tz);
    cam.lookAt(_t);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); this.effects.setScale(this.renderer.domElement.height, cam.fov); }
  }
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
