// Game orchestrator: renderer, match lifecycle, main loop and camera modes.
import * as THREE from 'three';
import { DEFAULT_SETTINGS, BOT_NAMES, CLASS_ORDER, HQS } from './config.js';
import { Emitter, loadSettings, rand } from './util.js';
import { World } from './world.js';
import { Buildings } from './buildings.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { Combat } from './weapons.js';
import { Soldier } from './soldier.js';
import { BotBrain } from './ai.js';
import { Tank } from './vehicles.js';
import { PlayerController } from './player.js';
import { Conquest } from './conquest.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';

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
  }

  async init(progress = () => {}) {
    const canvas = document.getElementById('game');
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = this.settings.quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 1500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const step = () => new Promise((r) => setTimeout(r, 0));
    progress(0.1, 'Surveying terrain');
    await step();
    this.world = new World(this);
    this.world.build();
    progress(0.45, 'Raising the town');
    await step();
    this.effects = new Effects(this);
    this.buildings = new Buildings(this);
    this.buildings.generate();
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
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && 'ontouchstart' in window) this.input.setupTouch(document.getElementById('touch'));

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

  applyQuality() {
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 1.75) : q === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 0.75));
    const shadows = q !== 'low';
    const sun = this.world.sun;
    const size = q === 'high' ? 2048 : 1024;
    if (this.renderer.shadowMap.enabled !== shadows || sun.shadow.mapSize.x !== size) {
      this.renderer.shadowMap.enabled = shadows;
      sun.castShadow = shadows;
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    }
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
    if (this.effects) this.effects.setScale(this.renderer.domElement.height, this.camera.fov);
  }

  // ------------------------------------------------------------ match lifecycle
  newMatch() {
    const st = this.settings;
    for (const s of this.soldiers) s.dispose();
    this.soldiers = [];
    this.effects.clear();
    this.combat.clear();
    this.buildings.reset();
    this.world.reset();
    this.mode.reset(st.tickets);
    this.time = 0;
    for (const v of this.vehicles) {
      v.exists = false; v.alive = false; v.driver = null; v.claimedBy = null; v.hull.visible = false;
    }
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let ni = 0;
    const P = new Soldier(this, { team: 0, name: st.playerName, isPlayer: true, squad: 0, classId: this.ui ? this.ui.selectedClass : 'assault' });
    this.player = P;
    this.soldiers.push(P);
    const n = Math.max(4, st.botsPerTeam);
    for (let team = 0; team < 2; team++) {
      const count = team === 0 ? n - 1 : n;
      for (let i = 0; i < count; i++) {
        const idx = team === 0 ? i + 1 : i;
        const s = new Soldier(this, {
          team, name: names[ni++ % names.length], squad: Math.floor(idx / 4), classId: CLASS_ORDER[(idx + team) % 4],
        });
        new BotBrain(this, s);
        s.state = 'dead';
        s.respawnT = rand(0.2, 3.5);
        s.bodyT = 99;
        this.soldiers.push(s);
      }
    }
    const tanksPerSide = n >= 10 ? 2 : 1;
    for (const v of this.vehicles) if (v.slot < tanksPerSide) v.spawn();
    this.playerCtl.attach(P);
    this.redeployT = 0;
    this.deathDelay = 0;
    this.playerCtl.deathYaw = undefined;
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
    this._last = t;
    try {
      this.frame(dt);
    } catch (e) {
      console.error(e);
    }
  }

  // One tick. `render` can be switched off to fast-forward the simulation.
  frame(dt, render = true) {
    const P = this.player;
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
      this.effects.update(dt);
      for (const s of this.soldiers) if (s.throwCd > 0) s.throwCd -= dt;
      this.audio.ambient(dt);
      this._engineSound();

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
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _v.copy(cam.position).addScaledVector(_f, 40);
    this.world.updateShadow(_v);
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, cam.rotation.y);

    if (this.state === 'playing' || this.state === 'paused') this.hud.update(dt);
    else if (this.state === 'deploy') this.ui.updateDeploy(dt);

    if (render) {
      const r = this.renderer;
      r.clear();
      r.render(this.scene, cam);
      const pc = this.playerCtl;
      if ((this.state === 'playing' || this.state === 'paused') && P.state === 'alive' && !P.vehicle && pc.vmRoot.visible) {
        r.clearDepth();
        r.render(pc.vmScene, pc.vmCam);
      }
    }
    this.input.endFrame();
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
    const r = 105;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    cam.position.set(x, this.world.heightAt(x, z) + 42, z);
    cam.lookAt(0, 6, 0);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); this.effects.setScale(this.renderer.domElement.height, cam.fov); }
  }

  _deployCam(dt) {
    const cam = this.camera;
    const pt = this.ui.selectedPoint ? this.ui.selectedPoint() : null;
    const tx = pt ? pt.x : HQS[0].x, tz = pt ? pt.z : HQS[0].z;
    const ty = this.world.heightAt(tx, tz);
    const toCenter = Math.atan2(-tx, -tz);
    _v.set(tx - Math.sin(toCenter) * 60, ty + 55, tz - Math.cos(toCenter) * 60);
    cam.position.lerp(_v, Math.min(1, dt * 2.5));
    _t.set(tx, ty + 2, tz);
    cam.lookAt(_t);
    if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); this.effects.setScale(this.renderer.domElement.height, cam.fov); }
  }
}

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
