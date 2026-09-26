// First-person player controller: look/move/stances/slide, shooting, gadgets, viewmodels,
// interaction (revive, enter tank), tank driving camera, and the death camera.
import * as THREE from 'three';
import { MOVE, PLAY_HALF, SCORE } from './config.js';
import { clamp, lerp, rand, wrapAngle, yawTo, dirFromAngles } from './util.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3();

// ---------------------------------------------------------------- viewmodel construction
const VM_MATS = {};
function vmMats() {
  if (VM_MATS.metal) return VM_MATS;
  VM_MATS.metal = new THREE.MeshStandardMaterial({ color: 0x44474c, roughness: 0.45, metalness: 0.3 });
  VM_MATS.poly = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.7, metalness: 0.05 });
  VM_MATS.tan = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.8 });
  VM_MATS.olive = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.8 });
  VM_MATS.glove = new THREE.MeshStandardMaterial({ color: 0x2e2a25, roughness: 0.9 });
  VM_MATS.sleeve = new THREE.MeshStandardMaterial({ color: 0x5f5e44, roughness: 0.95 });
  VM_MATS.lens = new THREE.MeshBasicMaterial({ color: 0x7fc4a8, transparent: true, opacity: 0.14, depthWrite: false });
  VM_MATS.dot = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  VM_MATS.blade = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.25, metalness: 0.9 });
  return VM_MATS;
}

function box(g, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}
function cyl(g, mat, r0, r1, len, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 12), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function limb(g, mat, a, b, t) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  g.add(m);
  return m;
}

// Open-frame reflex sight centred on (0, y); the aiming dot itself is drawn by the HUD
function reflex(g, M, y, z, w = 0.042, h = 0.036) {
  box(g, M.poly, w + 0.006, 0.014, 0.07, 0, y - h / 2 - 0.007, z);
  box(g, M.poly, 0.005, h, 0.014, -w / 2, y, z - 0.022);
  box(g, M.poly, 0.005, h, 0.014, w / 2, y, z - 0.022);
  box(g, M.poly, w + 0.006, 0.005, 0.014, 0, y + h / 2, z - 0.022);
  box(g, M.lens, w - 0.004, h - 0.002, 0.002, 0, y, z - 0.022);
}

function buildViewmodel(kind) {
  const M = vmMats();
  const g = new THREE.Group();
  let sightY = 0.08, muzzleZ = -0.6, muzzleY = 0.005;
  let gripZ = 0.07, foreZ = -0.3, foreY = -0.035;
  const offset = new THREE.Vector3();
  switch (kind) {
    case 'ar':
      box(g, M.metal, 0.055, 0.075, 0.34, 0, 0, -0.05);
      box(g, M.metal, 0.045, 0.02, 0.32, 0, 0.047, -0.06);
      box(g, M.poly, 0.062, 0.062, 0.26, 0, -0.002, -0.33);
      cyl(g, M.metal, 0.011, 0.011, 0.2, 0, 0.005, -0.55);
      cyl(g, M.poly, 0.017, 0.017, 0.06, 0, 0.005, -0.66);
      box(g, M.poly, 0.034, 0.15, 0.07, 0, -0.105, -0.1, 0.22);
      box(g, M.poly, 0.032, 0.09, 0.042, 0, -0.07, 0.07, -0.3);
      box(g, M.poly, 0.046, 0.07, 0.2, 0, -0.012, 0.2);
      reflex(g, M, 0.085, -0.07);
      sightY = 0.085; muzzleZ = -0.7; offset.set(0, 0, -0.04);
      break;
    case 'smg':
      box(g, M.metal, 0.05, 0.07, 0.26, 0, 0, -0.03);
      box(g, M.poly, 0.056, 0.055, 0.16, 0, -0.004, -0.23);
      cyl(g, M.metal, 0.012, 0.012, 0.12, 0, 0.004, -0.36);
      box(g, M.poly, 0.03, 0.2, 0.05, 0, -0.13, -0.06, 0.12);
      box(g, M.poly, 0.03, 0.085, 0.04, 0, -0.07, 0.07, -0.3);
      box(g, M.metal, 0.02, 0.05, 0.16, 0, -0.01, 0.17);
      reflex(g, M, 0.075, -0.05, 0.038, 0.032);
      sightY = 0.075; muzzleZ = -0.43; foreZ = -0.22;
      break;
    case 'lmg':
      box(g, M.metal, 0.07, 0.09, 0.42, 0, 0, -0.04);
      box(g, M.metal, 0.05, 0.03, 0.2, 0, 0.06, -0.06);
      box(g, M.poly, 0.07, 0.07, 0.24, 0, -0.005, -0.36);
      cyl(g, M.metal, 0.015, 0.015, 0.36, 0, 0.008, -0.64);
      cyl(g, M.poly, 0.022, 0.018, 0.07, 0, 0.008, -0.84);
      box(g, M.olive, 0.1, 0.11, 0.12, -0.01, -0.1, -0.05);
      box(g, M.poly, 0.032, 0.09, 0.042, 0, -0.08, 0.1, -0.3);
      box(g, M.poly, 0.05, 0.08, 0.22, 0, -0.015, 0.25);
      box(g, M.metal, 0.012, 0.012, 0.2, 0.02, -0.04, -0.52, 0.1);
      box(g, M.metal, 0.012, 0.012, 0.2, -0.02, -0.04, -0.52, 0.1);
      reflex(g, M, 0.103, -0.09, 0.046, 0.04);
      sightY = 0.103; muzzleZ = -0.88; foreZ = -0.34; offset.set(0.01, 0, -0.1);
      break;
    case 'sniper':
      box(g, M.metal, 0.05, 0.07, 0.4, 0, 0, -0.06);
      cyl(g, M.metal, 0.012, 0.014, 0.55, 0, 0.012, -0.52);
      cyl(g, M.poly, 0.02, 0.02, 0.08, 0, 0.012, -0.82);
      cyl(g, M.poly, 0.022, 0.022, 0.3, 0, 0.088, -0.07);
      cyl(g, M.poly, 0.03, 0.026, 0.06, 0, 0.088, -0.24);
      cyl(g, M.poly, 0.027, 0.024, 0.05, 0, 0.088, 0.1);
      box(g, M.metal, 0.02, 0.03, 0.03, 0, 0.055, -0.07);
      box(g, M.metal, 0.05, 0.012, 0.012, 0.04, 0.015, 0.06);
      box(g, M.tan, 0.052, 0.09, 0.32, 0, -0.03, 0.28);
      box(g, M.tan, 0.055, 0.05, 0.3, 0, -0.03, -0.22);
      box(g, M.poly, 0.03, 0.085, 0.04, 0, -0.07, 0.08, -0.3);
      box(g, M.poly, 0.034, 0.07, 0.07, 0, -0.07, -0.04);
      sightY = 0.088; muzzleZ = -0.86; foreZ = -0.26; offset.set(0.02, -0.01, -0.18);
      break;
    case 'pistol':
      box(g, M.metal, 0.03, 0.035, 0.18, 0, 0.022, -0.05);
      box(g, M.poly, 0.028, 0.028, 0.14, 0, -0.008, -0.04);
      box(g, M.poly, 0.028, 0.095, 0.045, 0, -0.062, 0.02, -0.25);
      box(g, M.metal, 0.006, 0.01, 0.006, 0, 0.044, -0.13);
      sightY = 0.046; muzzleZ = -0.16; gripZ = 0.02; foreZ = 0.0; foreY = -0.06; offset.set(-0.03, 0.02, 0.02);
      break;
    case 'rpg': {
      cyl(g, M.olive, 0.042, 0.042, 1.0, 0.0, 0.0, -0.1);
      cyl(g, M.olive, 0.05, 0.05, 0.12, 0, 0, 0.38);
      const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 10), M.olive);
      warhead.rotation.x = -Math.PI / 2;
      warhead.position.set(0, 0, -0.78);
      g.add(warhead);
      cyl(g, M.olive, 0.045, 0.06, 0.14, 0, 0, -0.6);
      box(g, M.poly, 0.03, 0.09, 0.04, 0, -0.08, 0.06, -0.3);
      box(g, M.poly, 0.03, 0.08, 0.04, 0, -0.07, -0.22, -0.2);
      box(g, M.metal, 0.018, 0.05, 0.04, -0.055, 0.05, -0.16);
      sightY = 0.07; muzzleZ = -0.9; foreZ = -0.22; offset.set(0.04, 0.03, -0.34);
      break;
    }
    case 'ugl':
      box(g, M.metal, 0.06, 0.08, 0.22, 0, 0, -0.02);
      cyl(g, M.metal, 0.03, 0.03, 0.3, 0, 0.0, -0.25);
      box(g, M.poly, 0.032, 0.09, 0.042, 0, -0.07, 0.07, -0.3);
      box(g, M.poly, 0.046, 0.07, 0.2, 0, -0.01, 0.2);
      box(g, M.metal, 0.012, 0.05, 0.012, 0, 0.06, -0.28);
      box(g, M.metal, 0.02, 0.03, 0.02, 0, 0.055, 0.04);
      sightY = 0.07; muzzleZ = -0.42; foreZ = -0.25;
      break;
    case 'crate':
      box(g, M.olive, 0.42, 0.26, 0.3, -0.12, -0.08, -0.12);
      box(g, M.tan, 0.43, 0.05, 0.31, -0.12, -0.05, -0.12);
      sightY = 0.25; muzzleZ = -0.3; gripZ = -0.05; foreZ = -0.12; foreY = -0.06; offset.set(-0.04, -0.02, -0.1);
      break;
    case 'c4':
      box(g, M.tan, 0.14, 0.05, 0.1, 0, -0.02, -0.05);
      box(g, M.poly, 0.03, 0.03, 0.03, 0.03, 0.01, -0.05);
      box(g, M.dot, 0.012, 0.01, 0.012, 0.03, 0.03, -0.05);
      sightY = 0.12; muzzleZ = -0.12; gripZ = 0.0; foreZ = -0.2; foreY = -0.1;
      break;
  }
  // Hands and forearms reaching back out of frame
  const rh = new THREE.Vector3(0.0, -0.075, gripZ);
  const lh = new THREE.Vector3(0.0, foreY, foreZ);
  box(g, M.glove, 0.055, 0.08, 0.1, rh.x + 0.012, rh.y, rh.z);
  box(g, M.glove, 0.06, 0.065, 0.1, lh.x - 0.012, lh.y - 0.02, lh.z);
  limb(g, M.sleeve, new THREE.Vector3(0.035, rh.y - 0.02, rh.z + 0.05), new THREE.Vector3(0.12, -0.2, 0.35), 0.075);
  limb(g, M.sleeve, new THREE.Vector3(-0.03, lh.y - 0.04, lh.z + 0.04), new THREE.Vector3(-0.22, -0.24, 0.12), 0.07);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, muzzleY, muzzleZ);
  g.add(muzzle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  return { group: g, muzzle, sightY, kind, offset };
}

// ---------------------------------------------------------------- controller
export class PlayerController {
  constructor(game) {
    this.game = game;
    this.s = null;
    this.camera = game.camera;
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(this.vmCam);
    this.vmScene.add(new THREE.HemisphereLight(0xe4ebf2, 0x5a4c3e, 2.0));
    const dl = new THREE.DirectionalLight(0xffe2bc, 2.6);
    dl.position.set(-1, 2, 1.5);
    this.vmScene.add(dl);
    const rim = new THREE.DirectionalLight(0x9fb8d0, 0.9);
    rim.position.set(1.5, 0.5, -1);
    this.vmScene.add(rim);
    this.vmRoot = new THREE.Group();
    this.vmCam.add(this.vmRoot);
    this.vm = null;
    this.vmCache = {};

    // muzzle flash sprite
    const fm = new THREE.SpriteMaterial({ map: game.world.tex.glow, color: 0xffd6a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flash = new THREE.Sprite(fm);
    this.flash.scale.set(0.22, 0.22, 0.22);
    this.flash.visible = false;

    // knife for melee
    const M = vmMats();
    this.knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.2), M.blade);
    blade.position.z = -0.12;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.032, 0.1), M.poly);
    this.knife.add(blade, handle);
    this.knife.visible = false;
    this.vmCam.add(this.knife);

    this.reset();
  }

  reset() {
    this.adsBlend = 0;
    this.sprintBlend = 0;
    this.kick = 0;
    this.recoilAccum = 0;
    this.bobPhase = 0;
    this.swayX = 0; this.swayY = 0;
    this.switchT = 0;
    this.meleeT = 0;
    this.throwT = 0;
    this.flashT = 0;
    this.reviveT = 0;
    this.reviveTarget = null;
    this.spotT = 0;
    this.oobT = 0;
    this.camYaw = 0; this.camPitch = -0.1;
    this.tankWeapon = 0;
    this.deathT = 0;
    this.lean = 0;
    this.vmKind = null;
    this.gadgetBackT = 0;
  }

  attach(s) {
    this.s = s;
    this.reset();
    this._setVM();
  }

  _vmKindFor() {
    const s = this.s;
    if (s.slot === 2) return s.gadget.model;
    return s.guns[s.slot].def.model;
  }

  _setVM() {
    const kind = this._vmKindFor();
    if (kind === this.vmKind) return;
    this.vmKind = kind;
    if (this.vm) this.vmRoot.remove(this.vm.group);
    if (!this.vmCache[kind]) this.vmCache[kind] = buildViewmodel(kind);
    this.vm = this.vmCache[kind];
    this.vmRoot.add(this.vm.group);
    this.vm.muzzle.add(this.flash);
  }

  switchTo(slot) {
    const s = this.s;
    if (slot === s.slot) return;
    if (slot === 2 && s.gadgetAmmo <= 0 && !(s.gadget.id === 'c4' && this.game.combat.hasC4(s))) {
      this.game.hud.toast(`${s.gadget.name} EMPTY`);
      return;
    }
    s.slot = slot;
    this.switchT = 0.35;
    this.game.audio.click();
    this._setVM();
  }

  update(dt) {
    const s = this.s;
    if (!s) return;
    if (s.state === 'alive') this.deathT = 0;
    if (s.state === 'alive' && !s.vehicle) this.onFoot(dt);
    else if (s.state === 'alive' && s.vehicle) this.inVehicle(dt);
    else this.whileDown(dt);
    this._checkBounds(dt);
  }

  _checkBounds(dt) {
    const s = this.s;
    if (s.state !== 'alive') { this.oobT = 0; return; }
    const out = Math.abs(s.pos.x) > PLAY_HALF || Math.abs(s.pos.z) > PLAY_HALF;
    if (out) {
      this.oobT += dt;
      if (this.oobT > 10) {
        if (s.vehicle) s.vehicle.destroy(null, 'DESERTION');
        else s.takeDamage(999, null, { weapon: 'DESERTION', force: true, noRevive: true });
      }
    } else this.oobT = 0;
  }

  // ------------------------------------------------------------ on foot
  onFoot(dt) {
    const s = this.s, g = this.game, inp = g.input;
    const look = inp.lookDelta();
    const fovRatio = this.camera.fov / g.settings.fov;
    const sens = 0.0022 * g.settings.sensitivity * fovRatio;
    s.yaw = wrapAngle(s.yaw - look.x * sens);
    s.pitch = clamp(s.pitch - look.y * sens, -1.45, 1.45);
    this.swayX = clamp(this.swayX - look.x * 0.00025, -0.04, 0.04);
    this.swayY = clamp(this.swayY + look.y * 0.00025, -0.04, 0.04);

    // recoil recovery
    if (this.recoilAccum > 0) {
      const r = Math.min(this.recoilAccum, this.recoilAccum * 7 * dt + 0.0005);
      s.pitch -= r;
      this.recoilAccum -= r;
    }

    // stances & slide
    let jump = false;
    const mv = inp.moveAxes();
    if (inp.pressed('crouch')) {
      if (s.sprinting && s.onGround && s.stance === 0) {
        s.setStance(1);
        s.slideT = MOVE.slideTime;
        this.slideDir = new THREE.Vector3(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
        g.audio.footstep(s.pos.x, s.pos.y, s.pos.z, 1.5);
      } else s.setStance(s.stance === 1 ? 0 : 1);
    }
    if (inp.pressed('prone')) s.setStance(s.stance === 2 ? 0 : 2);
    if (inp.pressed('jump')) {
      if (s.stance > 0) s.setStance(0);
      else jump = true;
    }

    // weapon selection
    if (inp.pressed('weapon1')) this.switchTo(0);
    if (inp.pressed('weapon2')) this.switchTo(1);
    if (inp.pressed('gadget')) this.switchTo(2);
    const wh = inp.wheel();
    if (wh !== 0) this.switchTo((s.slot + (wh > 0 ? 1 : 2)) % 3);
    if (this.gadgetBackT > 0) { this.gadgetBackT -= dt; if (this.gadgetBackT <= 0) this.switchTo(0); }

    // ADS & sprint
    const gun = s.gun;
    const canAds = s.slot < 2 || s.gadget.id === 'rpg' || s.gadget.id === 'ugl';
    const wantAds = inp.down('ads') && canAds && s.slideT <= 0;
    const wantSprint = inp.down('sprint') && mv.y > 0.5 && !wantAds && s.stance !== 2 && s.slideT <= 0 && !inp.down('fire');
    if (wantSprint && s.stance === 1) s.setStance(0);
    s.sprinting = wantSprint && s.stance === 0;
    const adsTime = s.slot < 2 ? gun.def.adsTime : 0.25;
    const adsTarget = wantAds && !s.sprinting ? 1 : 0;
    s.adsT = clamp(s.adsT + (adsTarget ? dt : -dt) / adsTime, 0, 1);

    // movement
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    let wx = fx * mv.y + rx * mv.x, wz = fz * mv.y + rz * mv.x;
    let speed = s.sprinting ? MOVE.sprint : s.stance === 1 ? MOVE.crouch : s.stance === 2 ? MOVE.prone : MOVE.walk;
    speed *= lerp(1, MOVE.adsMul, s.adsT);
    if (s.slideT > 0) {
      s.slideT -= dt;
      const t = 1 - s.slideT / MOVE.slideTime;
      wx = this.slideDir.x; wz = this.slideDir.z;
      speed = lerp(MOVE.slideSpeed, MOVE.crouch, t * t);
      if (!s.onGround) s.slideT = 0;
    }
    s.move(dt, wx, wz, speed, jump);

    // shooting
    this.switchT = Math.max(0, this.switchT - dt);
    this._fire(dt);

    if (gun && inp.pressed('reload') && gun.startReload()) g.audio.reload();
    if (inp.pressed('grenade') && this.meleeT <= 0) {
      if (g.combat.throwGrenade(s)) this.throwT = 0.45;
      else if (s.grenades <= 0) g.hud.toast('NO GRENADES');
    }
    if (inp.pressed('melee') && this.meleeT <= 0) {
      this.meleeT = 0.45;
      g.combat.melee(s);
      g.audio.whiz(s.pos.x, s.pos.y + 1.5, s.pos.z);
    }
    if (inp.pressed('spot')) {
      const t = g.combat.spot(s);
      if (t) { g.hud.toast(t.driver !== undefined ? 'TANK SPOTTED' : 'ENEMY SPOTTED'); g.audio._tone(1200, 0.06, 'triangle', 0.1); }
    }
    if (s.cls.autoSpot && s.adsT > 0.8 && s.slot === 0) {
      this.spotT -= dt;
      if (this.spotT <= 0) { this.spotT = 0.4; g.combat.spot(s, 0.05, 320); }
    }
    this._interact(dt);
  }

  currentSpread() {
    const s = this.s, gun = s.gun;
    const def = gun.def;
    let sp = lerp(def.spreadHip, def.spreadAds, s.adsT);
    const moving = Math.hypot(s.vel.x, s.vel.z);
    sp += (moving / 7) * 0.02 * (1 - s.adsT * 0.7);
    if (!s.onGround) sp += 0.04;
    if (s.stance === 1) sp *= 0.75; else if (s.stance === 2) sp *= 0.55;
    sp += gun.bloom * (s.adsT > 0.5 ? 0.5 : 1);
    return sp;
  }

  _muzzleWorld(out) {
    const cam = this.camera;
    const f = dirFromAngles(this.s.yaw, this.s.pitch, _d);
    const rx = Math.cos(this.s.yaw), rz = -Math.sin(this.s.yaw);
    const side = 0.14 * (1 - this.s.adsT);
    return out.set(cam.position.x + f.x * 0.7 + rx * side, cam.position.y + f.y * 0.7 - 0.1, cam.position.z + f.z * 0.7 + rz * side);
  }

  _fire(dt) {
    const s = this.s, g = this.game, inp = g.input;
    if (this.switchT > 0 || this.meleeT > 0 || this.throwT > 0) return;
    if (s.slot === 2) {
      if (s.gadget.id === 'c4' && (inp.pressed('ads'))) {
        if (g.combat.detonateC4(s)) g.audio.click();
        return;
      }
      if (inp.pressed('fire')) {
        const dir = s.forward(_d);
        if (s.gadgetAmmo <= 0) { g.hud.toast(`${s.gadget.name} EMPTY`); return; }
        if (s.gadgetCd > 0) return;
        if (g.combat.useGadget(s, dir)) {
          this.kick = 1.6;
          if (s.gadget.id === 'rpg') { g.effects.addShake(0.25); s.pitch += 0.02; }
          if (s.gadget.id === 'ugl') s.pitch += 0.03;
          if (s.gadget.id === 'crate') this.gadgetBackT = 0.5;
          if (s.gadget.id !== 'c4' && s.gadgetAmmo <= 0) this.gadgetBackT = 0.8;
        }
      }
      return;
    }
    const gun = s.gun, def = gun.def;
    const trigger = def.kind === 'auto' ? inp.down('fire') : inp.pressed('fire');
    if (trigger && !s.sprinting) {
      if (gun.mag === 0) {
        if (!gun.reloading) {
          if (gun.reserve > 0) { gun.startReload(); g.audio.reload(); }
          else if (inp.pressed('fire')) g.audio.empty();
        }
      } else if (gun.canFire()) {
        const dir = s.forward(_d);
        const muzzle = this._muzzleWorld(_m);
        if (g.combat.fireGun(s, dir, this.currentSpread(), { muzzle })) {
          const kick = def.recoil[0] * rand(0.8, 1.2) * (s.adsT > 0.5 ? 0.75 : 1) * (s.stance > 0 ? 0.8 : 1);
          s.pitch = clamp(s.pitch + kick, -1.45, 1.45);
          this.recoilAccum += kick * 0.55;
          s.yaw += rand(-1, 1) * def.recoil[1];
          this.kick = Math.min(1.5, this.kick + (def.kind === 'bolt' ? 1.5 : 0.7));
          this.flashT = 0.045;
          this.flash.material.rotation = Math.random() * Math.PI;
          const fs = def.id === 'lmg' ? 0.3 : def.id === 'pistol' ? 0.16 : 0.24;
          this.flash.scale.set(fs, fs, fs);
          g.effects.flash(muzzle.x, muzzle.y, muzzle.z, 5, 10, 0.05, 0xffb060);
        }
      }
    }
    if (gun.mag === 0 && !gun.reloading && gun.reserve > 0 && !inp.down('fire')) {
      gun.startReload();
      g.audio.reload();
    }
  }

  _interact(dt) {
    const s = this.s, g = this.game, inp = g.input;
    let prompt = null, progress = -1;
    // tanks
    for (const v of g.vehicles) {
      if (!v.alive || v.driver || v.team !== s.team) continue;
      if (v.pos.distanceTo(s.pos) < 5.5) {
        prompt = '[E] ENTER TANK';
        if (inp.pressed('use')) {
          v.enter(s);
          this.camYaw = v.turretYaw;
          this.camPitch = -0.08;
          this.tankWeapon = 0;
          g.hud.setPrompt(null);
          return;
        }
        break;
      }
    }
    // revive
    let target = null, bd = 2.4;
    for (const o of g.soldiers) {
      if (o.team !== s.team || o.state !== 'downed') continue;
      const d = o.pos.distanceTo(s.pos);
      if (d < bd) { bd = d; target = o; }
    }
    if (target) {
      const need = s.cls.fastRevive ? 1.2 : 2.4;
      if (inp.down('use')) {
        if (this.reviveTarget !== target) { this.reviveTarget = target; this.reviveT = 0; }
        this.reviveT += dt;
        progress = this.reviveT / need;
        prompt = `REVIVING ${target.name.toUpperCase()}`;
        if (this.reviveT >= need) {
          g.mode.revive(s, target);
          this.reviveT = 0;
          this.reviveTarget = null;
        }
      } else {
        this.reviveT = 0;
        prompt = `HOLD [E] REVIVE ${target.name.toUpperCase()}`;
      }
    } else this.reviveT = 0;
    g.hud.setPrompt(prompt, progress);
  }

  // ------------------------------------------------------------ tank
  inVehicle(dt) {
    const s = this.s, g = this.game, inp = g.input, v = s.vehicle;
    const look = inp.lookDelta();
    const zoom = inp.down('ads');
    const sens = 0.0022 * g.settings.sensitivity * (zoom ? 0.45 : 1);
    this.camYaw = wrapAngle(this.camYaw - look.x * sens);
    this.camPitch = clamp(this.camPitch - look.y * sens, -0.55, 0.55);
    const mv = inp.moveAxes();
    v.input.throttle = mv.y;
    v.input.steer = mv.x;
    if (inp.pressed('weapon1')) { this.tankWeapon = 0; g.audio.click(); }
    if (inp.pressed('weapon2')) { this.tankWeapon = 1; g.audio.click(); }
    v.input.fire = this.tankWeapon === 0 && inp.down('fire');
    v.input.fireMG = this.tankWeapon === 1 && inp.down('fire');
    if (inp.pressed('spot')) {
      s.yaw = this.camYaw; s.pitch = this.camPitch;
      const t = g.combat.spot(s, 0.1, 350);
      if (t) g.hud.toast('ENEMY SPOTTED');
    }
    if (inp.pressed('use')) {
      v.removeDriver(s, true);
      s.yaw = this.camYaw;
      s.pitch = 0;
      g.hud.setPrompt(null);
      return;
    }
    g.hud.setPrompt(null);
    // camera + aim point computed in updateCamera
  }

  whileDown(dt) {
    const s = this.s, g = this.game, inp = g.input;
    this.deathT += dt;
    g.hud.setPrompt(null);
    if (s.state === 'downed' && this.deathT > 0.8 && (inp.pressed('jump') || inp.pressed('use'))) s.bleedOut();
  }

  // ------------------------------------------------------------ camera & viewmodel
  updateCamera(dt) {
    const s = this.s, g = this.game, cam = this.camera;
    const shake = g.effects.shake;
    const sx = (Math.random() - 0.5) * shake * 0.03, sy = (Math.random() - 0.5) * shake * 0.03;
    let fov = g.settings.fov;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;

    if (s.state === 'alive' && s.vehicle) {
      const v = s.vehicle;
      const zoom = g.input.down('ads');
      const dir = dirFromAngles(this.camYaw, this.camPitch, _d);
      const pivot = _v.set(v.pos.x, v.pos.y + 3.2, v.pos.z);
      if (zoom) {
        v.hull.updateMatrixWorld(true);
        v.barrelPivot.getWorldPosition(cam.position);
        cam.position.y += 0.55;
        cam.position.addScaledVector(dir, 0.6);
        fov = 26;
      } else {
        let dist = 10;
        const w = g.world;
        const h = w.raycast(pivot.x, pivot.y, pivot.z, -dir.x, -dir.y + 0.12, -dir.z, dist, true);
        if (h.hit) dist = Math.max(2, h.t - 0.4);
        cam.position.copy(pivot).addScaledVector(dir, -dist);
        cam.position.y += 1.2 * (dist / 10);
        const gy = w.heightAt(cam.position.x, cam.position.z) + 0.5;
        if (cam.position.y < gy) cam.position.y = gy;
      }
      cam.rotation.set(this.camPitch + sy, this.camYaw + sx, 0, 'YXZ');
      // Aim the turret where the crosshair points
      const w = g.world;
      const hit = w.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, 450, true);
      const ax = hit.hit ? hit.x : cam.position.x + dir.x * 450;
      const ay = hit.hit ? hit.y : cam.position.y + dir.y * 450;
      const az = hit.hit ? hit.z : cam.position.z + dir.z * 450;
      const ox = v.pos.x, oy = v.pos.y + 1.9, oz = v.pos.z;
      v.input.aimYaw = yawTo(ax - ox, az - oz);
      v.input.aimPitch = Math.atan2(ay - oy, Math.hypot(ax - ox, az - oz));
      s.yaw = this.camYaw;
      this.vmRoot.visible = false;
      this.knife.visible = false;
    } else if (s.state === 'alive') {
      const sp = Math.hypot(s.vel.x, s.vel.z);
      if (s.onGround && sp > 0.5) this.bobPhase += dt * sp * 1.55;
      const bobAmt = Math.min(1, sp / 7) * (1 - s.adsT * 0.85);
      const bobY = Math.sin(this.bobPhase * 2) * 0.035 * bobAmt;
      const bobX = Math.sin(this.bobPhase) * 0.025 * bobAmt;
      const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
      s.eye(cam.position);
      cam.position.x += rx * bobX; cam.position.z += rz * bobX; cam.position.y += bobY;
      const slideTilt = s.slideT > 0 ? 0.06 : 0;
      this.lean += (slideTilt - this.lean) * Math.min(1, dt * 8);
      cam.rotation.set(s.pitch + sy, s.yaw + sx, this.lean, 'YXZ');
      const def = s.slot < 2 ? s.gun.def : s.gadget;
      fov = lerp(fov, def.adsFov, s.adsT);
      if (s.sprinting) fov += 6;
      if (s.slideT > 0) fov += 8;
      this._updateVM(dt, sp, bobX, bobY);
    } else {
      // Death camera: lying on the ground, looking toward whoever got you
      const k = s.lastAttacker;
      s.eye(cam.position);
      cam.position.y = s.pos.y + 0.55;
      let yaw = s.deathYaw ?? s.yaw, pitch = 0;
      if (k && k.state === 'alive') {
        const kp = k.vehicle ? k.vehicle.pos : k.pos;
        yaw = yawTo(kp.x - cam.position.x, kp.z - cam.position.z);
        pitch = Math.atan2(kp.y + 1.2 - cam.position.y, Math.hypot(kp.x - cam.position.x, kp.z - cam.position.z));
      }
      this.deathYaw = this.deathYaw === undefined ? yaw : this.deathYaw + wrapAngle(yaw - this.deathYaw) * Math.min(1, dt * 3);
      cam.rotation.set(pitch, this.deathYaw, 0.18, 'YXZ');
      fov = g.settings.fov - 10;
      this.vmRoot.visible = false;
      this.knife.visible = false;
    }
    if (s.state === 'alive') this.deathYaw = undefined;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 14);
      cam.updateProjectionMatrix();
      g.effects.setScale(g.renderer.domElement.height, cam.fov);
    }
  }

  _updateVM(dt, speed, bobX, bobY) {
    const s = this.s, g = this.game, vm = this.vm;
    this._setVM();
    const scoped = s.slot === 0 && s.gun.def.scope && s.adsT > 0.85;
    this.vmRoot.visible = !scoped;
    const target = this.sprintBlend;
    this.sprintBlend += ((s.sprinting ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 10);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.swayX *= Math.max(0, 1 - dt * 8);
    this.swayY *= Math.max(0, 1 - dt * 8);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.throwT = Math.max(0, this.throwT - dt);

    const a = s.adsT;
    const hip = _v.set(0.2, -0.2, -0.47);
    const ads = _e.set(0, -vm.sightY, -0.37);
    const p = this.vmRoot.position;
    p.lerpVectors(hip, ads, a * a * (3 - 2 * a));
    p.x += vm.offset.x * (1 - a); p.y += vm.offset.y * (1 - a); p.z += vm.offset.z;
    p.x += bobX * 0.6 + this.swayX;
    p.y += bobY * 0.5 + this.swayY;
    p.z += this.kick * 0.035;
    const r = this.vmRoot.rotation;
    r.set(this.kick * 0.05, 0, 0);
    // sprint pose
    const sb = this.sprintBlend;
    p.x += sb * -0.05; p.y += sb * -0.05; p.z += sb * 0.05;
    r.x += sb * -0.35; r.y += sb * 0.75; r.z += sb * 0.25;
    // reload dip
    const gun = s.gun;
    if (gun && gun.reloading) {
      const t = 1 - gun.reloadT / gun.def.reload;
      const dip = Math.sin(t * Math.PI);
      r.x -= dip * 0.6; r.z += dip * 0.5; p.y -= dip * 0.07;
    }
    if (s.slot === 0 && gun && gun.def.kind === 'bolt' && gun.cool > 0.2) {
      const t = gun.cool / (60 / gun.def.rpm);
      r.z += Math.sin(t * Math.PI) * 0.25;
      p.y -= Math.sin(t * Math.PI) * 0.03;
    }
    if (s.slot === 2 && s.gadgetCd > 0 && (s.gadget.id === 'rpg' || s.gadget.id === 'ugl')) {
      const t = s.gadgetCd / s.gadget.reload;
      const dip = Math.sin(t * Math.PI);
      r.x -= dip * 0.5; p.y -= dip * 0.1;
    }
    p.y -= this.switchT * 0.5;
    p.y -= Math.sin((this.throwT / 0.45) * Math.PI) * 0.18;
    p.y -= Math.sin((this.meleeT / 0.45) * Math.PI) * 0.12;
    // knife swipe
    if (this.meleeT > 0) {
      const t = 1 - this.meleeT / 0.45;
      this.knife.visible = true;
      this.knife.position.set(lerp(0.25, -0.2, t), -0.12 + Math.sin(t * Math.PI) * 0.05, -0.35);
      this.knife.rotation.set(-0.2, lerp(0.9, -0.6, t), -0.6);
    } else this.knife.visible = false;

    const c = this.vmCam;
    const vfov = lerp(58, 44, a);
    if (Math.abs(c.fov - vfov) > 0.01) { c.fov = vfov; c.updateProjectionMatrix(); }
  }
}
