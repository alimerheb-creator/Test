// First-person player controller: look/move/stances/slide, shooting, gadgets, viewmodels,
// interaction (revive, enter tank), tank driving camera, and the death camera.
import * as THREE from 'three';
import { MOVE, PLAY_HALF, SCORE, RULES } from './config.js';
import { clamp, lerp, rand, wrapAngle, yawTo, dirFromAngles } from './util.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3();
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3();
// Reload animation anchors, in gun space: the pouch (off screen, low left), the hand's grip on a magazine,
// and where the hand waits below a shotgun's loading port
const POUCH = new THREE.Vector3(-0.1, -0.36, 0.1);
const GRAB = new THREE.Vector3(-0.035, -0.035, 0);
const PORT_BELOW = new THREE.Vector3(-0.01, -0.06, 0.03);
// Gun pose while reloading: roll the magwell toward the camera, raise it toward the centre [rz, rx, ry, x, y, z]
const RELOAD_POSE = [-0.5, 0.1, 0.2, -0.14, 0.12, -0.02];
const RELOAD_POSES = { pistol: [-0.3, -0.15, 0.1, -0.1, 0.06, 0.04] };
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const seg = (p, a, b) => ease((p - a) / (b - a));

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

const _wrist = new THREE.Vector3(), _fdir = new THREE.Vector3(), _zAxis = new THREE.Vector3(0, 0, 1);
function placeForearm(vm) {
  const f = vm.forearm;
  _wrist.set(-0.03, -0.04, 0.04).add(vm.lh.position);
  _fdir.subVectors(vm.elbow, _wrist);
  const len = _fdir.length();
  f.position.copy(_wrist).addScaledVector(_fdir, 0.5);
  f.quaternion.setFromUnitVectors(_zAxis, _fdir.divideScalar(len));
  f.scale.set(1, 1, len);
}

// A moving part (magazine, bolt, slide, pump, feed cover) that the reload animation can move
function part(g, parts, role, x, y, z, rx = 0) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.x = rx;
  p.userData.base = p.position.clone();
  p.userData.rx = rx;
  g.add(p);
  parts[role] = p;
  return p;
}

function buildViewmodel(kind) {
  const M = vmMats();
  const g = new THREE.Group();
  const parts = {};
  let sightY = 0.08, muzzleZ = -0.6, muzzleY = 0.005;
  let gripZ = 0.07, foreZ = -0.3, foreY = -0.035;
  const offset = new THREE.Vector3();
  // Where the left hand grabs the charging handle / loads shells, and how far the bolt travels back
  let charge = null, port = null, boltTravel = 0.07;
  switch (kind) {
    case 'ar': {
      box(g, M.metal, 0.055, 0.075, 0.34, 0, 0, -0.05);
      box(g, M.metal, 0.045, 0.02, 0.32, 0, 0.047, -0.06);
      box(g, M.poly, 0.062, 0.062, 0.26, 0, -0.002, -0.33);
      cyl(g, M.metal, 0.011, 0.011, 0.2, 0, 0.005, -0.55);
      cyl(g, M.poly, 0.017, 0.017, 0.06, 0, 0.005, -0.66);
      box(g, M.poly, 0.032, 0.09, 0.042, 0, -0.07, 0.07, -0.3);
      box(g, M.poly, 0.046, 0.07, 0.2, 0, -0.012, 0.2);
      box(g, M.metal, 0.012, 0.018, 0.03, 0.03, 0.0, -0.08); // mag release / ejection port
      reflex(g, M, 0.085, -0.07);
      const mag = part(g, parts, 'mag', 0, -0.105, -0.1, 0.22);
      box(mag, M.poly, 0.034, 0.15, 0.07, 0, 0, 0);
      box(mag, M.metal, 0.038, 0.012, 0.074, 0, -0.078, 0);
      const bolt = part(g, parts, 'bolt', 0, 0.06, 0.1);
      box(bolt, M.metal, 0.05, 0.01, 0.018, 0, 0, 0);
      charge = new THREE.Vector3(-0.02, 0.06, 0.1);
      sightY = 0.085; muzzleZ = -0.7; offset.set(0, 0, -0.04);
      break;
    }
    case 'smg': {
      box(g, M.metal, 0.05, 0.07, 0.26, 0, 0, -0.03);
      box(g, M.poly, 0.056, 0.055, 0.16, 0, -0.004, -0.23);
      cyl(g, M.metal, 0.012, 0.012, 0.12, 0, 0.004, -0.36);
      box(g, M.poly, 0.03, 0.085, 0.04, 0, -0.07, 0.07, -0.3);
      box(g, M.metal, 0.02, 0.05, 0.16, 0, -0.01, 0.17);
      reflex(g, M, 0.075, -0.05, 0.038, 0.032);
      const mag = part(g, parts, 'mag', 0, -0.13, -0.06, 0.12);
      box(mag, M.poly, 0.03, 0.2, 0.05, 0, 0, 0);
      const bolt = part(g, parts, 'bolt', -0.032, 0.02, -0.14);
      box(bolt, M.metal, 0.02, 0.012, 0.03, 0, 0, 0);
      charge = new THREE.Vector3(-0.05, 0.02, -0.14);
      sightY = 0.075; muzzleZ = -0.43; foreZ = -0.22;
      break;
    }
    case 'lmg': {
      box(g, M.metal, 0.07, 0.09, 0.42, 0, 0, -0.04);
      box(g, M.poly, 0.07, 0.07, 0.24, 0, -0.005, -0.36);
      cyl(g, M.metal, 0.015, 0.015, 0.36, 0, 0.008, -0.64);
      cyl(g, M.poly, 0.022, 0.018, 0.07, 0, 0.008, -0.84);
      box(g, M.poly, 0.032, 0.09, 0.042, 0, -0.08, 0.1, -0.3);
      box(g, M.poly, 0.05, 0.08, 0.22, 0, -0.015, 0.25);
      box(g, M.metal, 0.012, 0.012, 0.2, 0.02, -0.04, -0.52, 0.1);
      box(g, M.metal, 0.012, 0.012, 0.2, -0.02, -0.04, -0.52, 0.1);
      const cover = part(g, parts, 'cover', 0, 0.06, 0.04);
      box(cover, M.metal, 0.05, 0.03, 0.2, 0, 0, -0.1);
      reflex(cover, M, 0.043, -0.13, 0.046, 0.04);
      const mag = part(g, parts, 'mag', -0.01, -0.1, -0.05);
      box(mag, M.olive, 0.1, 0.11, 0.12, 0, 0, 0);
      box(mag, M.metal, 0.02, 0.05, 0.02, 0.03, 0.07, 0); // belt feeding up into the gun
      const bolt = part(g, parts, 'bolt', 0.042, -0.005, -0.1);
      box(bolt, M.metal, 0.018, 0.018, 0.035, 0, 0, 0);
      charge = new THREE.Vector3(0.05, -0.02, -0.1);
      boltTravel = 0.1;
      sightY = 0.103; muzzleZ = -0.88; foreZ = -0.34; offset.set(0.01, 0, -0.1);
      break;
    }
    case 'sniper': {
      box(g, M.metal, 0.05, 0.07, 0.4, 0, 0, -0.06);
      cyl(g, M.metal, 0.012, 0.014, 0.55, 0, 0.012, -0.52);
      cyl(g, M.poly, 0.02, 0.02, 0.08, 0, 0.012, -0.82);
      cyl(g, M.poly, 0.022, 0.022, 0.3, 0, 0.088, -0.07);
      cyl(g, M.poly, 0.03, 0.026, 0.06, 0, 0.088, -0.24);
      cyl(g, M.poly, 0.027, 0.024, 0.05, 0, 0.088, 0.1);
      box(g, M.metal, 0.02, 0.03, 0.03, 0, 0.055, -0.07);
      box(g, M.tan, 0.052, 0.09, 0.32, 0, -0.03, 0.28);
      box(g, M.tan, 0.055, 0.05, 0.3, 0, -0.03, -0.22);
      box(g, M.poly, 0.03, 0.085, 0.04, 0, -0.07, 0.08, -0.3);
      const mag = part(g, parts, 'mag', 0, -0.07, -0.04);
      box(mag, M.poly, 0.034, 0.07, 0.07, 0, 0, 0);
      // bolt handle sticks out to the right; it lifts, pulls back, pushes forward and locks down
      const bolt = part(g, parts, 'bolt', 0.0, 0.015, 0.06);
      box(bolt, M.metal, 0.05, 0.012, 0.012, 0.035, 0, 0);
      box(bolt, M.metal, 0.02, 0.02, 0.02, 0.064, 0, 0);
      box(bolt, M.metal, 0.026, 0.026, 0.1, 0, 0, -0.04);
      parts.bolt.userData.rotary = true;
      charge = new THREE.Vector3(0.07, 0.015, 0.06);
      boltTravel = 0.085;
      sightY = 0.088; muzzleZ = -0.86; foreZ = -0.26; offset.set(0.02, -0.01, -0.18);
      break;
    }
    case 'pistol': {
      box(g, M.poly, 0.028, 0.028, 0.14, 0, -0.008, -0.04);
      box(g, M.poly, 0.028, 0.095, 0.045, 0, -0.062, 0.02, -0.25);
      const slide = part(g, parts, 'slide', 0, 0.022, -0.05);
      box(slide, M.metal, 0.03, 0.035, 0.18, 0, 0, 0);
      box(slide, M.metal, 0.006, 0.01, 0.006, 0, 0.022, -0.08);
      box(slide, M.metal, 0.012, 0.008, 0.006, 0, 0.021, 0.08);
      const mag = part(g, parts, 'mag', 0, -0.062, 0.02, -0.25);
      box(mag, M.metal, 0.022, 0.1, 0.036, 0, -0.004, 0);
      box(mag, M.poly, 0.031, 0.012, 0.05, 0, -0.053, 0);
      charge = new THREE.Vector3(-0.005, 0.03, 0.02);
      boltTravel = 0.035;
      sightY = 0.046; muzzleZ = -0.16; gripZ = 0.02; foreZ = 0.0; foreY = -0.06; offset.set(-0.03, 0.02, 0.02);
      break;
    }
    case 'shotgun': {
      box(g, M.metal, 0.055, 0.07, 0.3, 0, 0, -0.03);
      cyl(g, M.metal, 0.016, 0.016, 0.5, 0, 0.018, -0.42);
      cyl(g, M.poly, 0.019, 0.019, 0.36, 0, -0.022, -0.36);
      box(g, M.poly, 0.032, 0.085, 0.042, 0, -0.07, 0.07, -0.3);
      box(g, M.tan, 0.05, 0.085, 0.24, 0, -0.02, 0.22);
      box(g, M.metal, 0.012, 0.012, 0.012, 0, 0.042, -0.65);
      box(g, M.metal, 0.02, 0.014, 0.02, 0, 0.042, -0.06);
      box(g, M.poly, 0.03, 0.006, 0.07, 0, -0.037, -0.04); // loading port
      const pump = part(g, parts, 'pump', 0, -0.024, -0.34);
      box(pump, M.tan, 0.058, 0.05, 0.16, 0, 0, 0);
      port = new THREE.Vector3(0, -0.05, -0.04);
      boltTravel = 0.09;
      sightY = 0.045; muzzleZ = -0.68; foreZ = -0.34; offset.set(0, 0, -0.06);
      break;
    }
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
      sightY = 0.07; muzzleZ = -0.9; foreZ = -0.22; offset.set(0.1, -0.03, -0.3);
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
  return finishViewmodel(g, parts, { kind, sightY, muzzleY, muzzleZ, gripZ, foreZ, foreY, offset, charge, port, boltTravel });
}

// Hands, forearms, the carried shotgun shell and the muzzle point, shared by built-in and modded guns
function finishViewmodel(g, parts, o) {
  const M = vmMats();
  const { kind, sightY, muzzleY, muzzleZ, gripZ, foreZ, foreY, offset, charge, port, boltTravel } = o;
  // Hands and forearms reaching back out of frame. The left hand is its own group so it can
  // reach for magazines, charging handles and shells.
  const rh = new THREE.Vector3(0.0, -0.075, gripZ);
  box(g, M.glove, 0.055, 0.08, 0.1, rh.x + 0.012, rh.y, rh.z);
  limb(g, M.sleeve, new THREE.Vector3(0.035, rh.y - 0.02, rh.z + 0.05), new THREE.Vector3(0.12, -0.2, 0.35), 0.075);
  const lhBase = new THREE.Vector3(0.0, foreY, foreZ);
  const lh = new THREE.Group();
  lh.position.copy(lhBase);
  box(lh, M.glove, 0.06, 0.065, 0.1, -0.012, -0.02, 0);
  // The forearm runs from the wrist to an elbow that stays put, so it stretches as the hand moves
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 1), M.sleeve);
  g.add(forearm);
  const elbow = new THREE.Vector3(-0.16, -0.36, 0.16);
  g.add(lh);
  // A shotgun shell the left hand carries while loading
  const shell = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xa3261e, roughness: 0.6 }));
  const brass = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.014, 8), new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.35, metalness: 0.8 }));
  brass.position.y = -0.03;
  shell.add(hull, brass);
  shell.rotation.x = Math.PI / 2;
  shell.position.set(0.0, 0.02, -0.03);
  shell.visible = false;
  lh.add(shell);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, muzzleY, muzzleZ);
  g.add(muzzle);
  if (parts.mag) {
    g.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(parts.mag);
    parts.mag.userData.len = bb.max.y - bb.min.y;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  const vm = { group: g, muzzle, sightY, kind, offset, parts, lh, lhBase, shell, charge, port, boltTravel, forearm, elbow };
  placeForearm(vm);
  return vm;
}

// A weapon model from a mod: a list of boxes, cylinders, spheres and cones. Parts with a role
// ('mag', 'bolt', 'slide', 'pump', 'cover') move during reloads just like the built-in guns.
const _cv = new THREE.Vector3(), _xAxis = new THREE.Vector3(1, 0, 0);
const DEG = Math.PI / 180;
function buildCustomViewmodel(model) {
  const M = vmMats();
  const g = new THREE.Group();
  const parts = {};
  const mats = new Map();
  const matFor = (p) => {
    const k = `${p.color}|${p.metal}|${p.rough}|${p.emissive}`;
    if (!mats.has(k)) {
      mats.set(k, new THREE.MeshStandardMaterial({
        color: p.color, metalness: p.metal, roughness: p.rough,
        emissive: p.emissive ?? 0x000000, emissiveIntensity: p.emissive != null ? 1.5 : 0,
      }));
    }
    return mats.get(k);
  };
  for (const p of model.parts) {
    let geo;
    const s = p.size;
    if (p.shape === 'cylinder') { geo = new THREE.CylinderGeometry(s[0], s.length > 2 ? s[1] : s[0], s[s.length - 1], 12); geo.rotateX(Math.PI / 2); }
    else if (p.shape === 'cone') { geo = new THREE.ConeGeometry(s[0], s[1] ?? s[0] * 2, 12); geo.rotateX(-Math.PI / 2); }
    else if (p.shape === 'sphere') geo = new THREE.SphereGeometry(s[0], 12, 8);
    else geo = new THREE.BoxGeometry(s[0], s[1] ?? s[0], s[2] ?? s[0]);
    const mesh = new THREE.Mesh(geo, matFor(p));
    const rx = p.rot[0] * DEG, ry = p.rot[1] * DEG, rz = p.rot[2] * DEG;
    if (p.role) {
      let grp = parts[p.role];
      if (!grp) grp = part(g, parts, p.role, p.pos[0], p.pos[1], p.pos[2], rx);
      _cv.set(p.pos[0], p.pos[1], p.pos[2]).sub(grp.userData.base).applyAxisAngle(_xAxis, -grp.userData.rx);
      mesh.position.copy(_cv);
      mesh.rotation.set(rx - grp.userData.rx, ry, rz);
      grp.add(mesh);
    } else {
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      mesh.rotation.set(rx, ry, rz);
      g.add(mesh);
    }
  }
  if (model.sight === 'reflex') reflex(g, M, model.sightY, model.sightZ);
  if (parts.bolt && model.boltAction) parts.bolt.userData.rotary = true;
  const v3 = (a) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : null);
  return finishViewmodel(g, parts, {
    kind: model.pose || 'custom', sightY: model.sightY, muzzleY: model.muzzle[1], muzzleZ: model.muzzle[2],
    gripZ: model.grip[2], foreZ: model.fore[2], foreY: model.fore[1], offset: v3(model.offset) || new THREE.Vector3(),
    charge: v3(model.charge), port: v3(model.port), boltTravel: model.boltTravel,
  });
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
    const vmHemi = new THREE.HemisphereLight(0xe4ebf2, 0x5a4c3e, 2.0);
    this.vmScene.add(vmHemi);
    const dl = new THREE.DirectionalLight(0xffe2bc, 2.6);
    dl.position.set(-1, 2, 1.5);
    this.vmScene.add(dl);
    const rim = new THREE.DirectionalLight(0x9fb8d0, 0.9);
    rim.position.set(1.5, 0.5, -1);
    this.vmScene.add(rim);
    this.vmLights = [[vmHemi, 2.0], [dl, 2.6], [rim, 0.9]];
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

  // Mods may have changed weapon models: rebuild them on next use
  clearViewmodels() {
    if (this.vm) { this.vm.muzzle.remove(this.flash); this.vmRoot.remove(this.vm.group); }
    this.vm = null;
    this.vmKey = null;
    this.vmCache = {};
    if (this.s) this._setVM();
  }

  // Keep the weapon in your hands lit like the world around it (mods can switch to night)
  setViewmodelLight(scale) {
    for (const [light, base] of this.vmLights) light.intensity = base * scale;
  }

  reset() {
    this.adsBlend = 0;
    this.reloadBlend = 0;
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
    this.vmKey = null;
    this.gadgetBackT = 0;
    this.context = null;
    this.assistScan = 0;
    this.assistTarget = null;
    this.autoScan = 0;
    this.autoHit = false;
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
    const key = typeof kind === 'string' ? kind : kind.key;
    if (key === this.vmKey) return;
    this.vmKey = key;
    if (this.vm) this.vmRoot.remove(this.vm.group);
    if (!this.vmCache[key]) this.vmCache[key] = typeof kind === 'string' ? buildViewmodel(kind) : buildCustomViewmodel(kind);
    this.vm = this.vmCache[key];
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
    if (inp.touchMode && g.settings.aimAssist) this._aimAssist(dt);
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
    // You can't aim down sights while your hands are busy swapping a magazine
    const busy = gun && s.slot < 2 && gun.reloading && gun.type !== 'shell';
    const adsTarget = wantAds && !s.sprinting && !busy ? 1 : 0;
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

    if (gun && inp.pressed('reload')) s.reload();
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
    let trigger = def.kind === 'auto' ? inp.down('fire') : inp.pressed('fire');
    if (!trigger && inp.touchMode && g.settings.autoFire && !s.sprinting && this._enemyUnderCrosshair()) trigger = true;
    // A shotgun can fire in the middle of loading shells; anything else waits for the reload
    const canInterrupt = gun.type === 'shell' && gun.reloading && (gun.ready || gun.mag > 0);
    if (trigger && !s.sprinting) {
      if (!gun.ready && !canInterrupt) {
        if (!gun.reloading && !s.reload() && inp.pressed('fire')) g.audio.empty();
      } else if (gun.canFire() || canInterrupt) {
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
    if (!gun.ready && !gun.reloading && !inp.down('fire')) s.reload();
  }

  // Works out the context action (revive / enter tank / detonate) shared by the E key
  // and the touch context button, and runs it.
  _interact(dt) {
    const s = this.s, g = this.game, inp = g.input, touch = inp.touchMode;
    let ctx = null;
    let target = null, bd = 3.2;
    for (const o of g.soldiers) {
      if (o.team !== s.team || o.state !== 'downed') continue;
      const d = o.pos.distanceTo(s.pos);
      if (d < bd) { bd = d; target = o; }
    }
    if (target) {
      const need = RULES.reviveTime * (s.cls.fastRevive ? 0.5 : 1);
      const name = target.name.toUpperCase();
      if (inp.down('use')) {
        if (this.reviveTarget !== target) { this.reviveTarget = target; this.reviveT = 0; }
        this.reviveT += dt;
        ctx = { kind: 'revive', label: 'REVIVING', prompt: `REVIVING ${name}`, progress: this.reviveT / need };
        if (this.reviveT >= need) {
          g.mode.revive(s, target);
          g.vibrate([15, 40, 15]);
          this.reviveT = 0;
          this.reviveTarget = null;
          ctx = null;
        }
      } else {
        this.reviveT = 0;
        ctx = { kind: 'revive', label: 'HOLD TO REVIVE', prompt: touch ? `HOLD REVIVE · ${name}` : `HOLD [E] REVIVE ${name}`, progress: 0 };
      }
    } else {
      this.reviveT = 0;
      for (const v of g.vehicles) {
        if (!v.alive || v.driver || v.team !== s.team) continue;
        if (v.pos.distanceTo(s.pos) < 5.5) {
          ctx = { kind: 'enter', label: 'ENTER TANK', prompt: touch ? 'ENTER TANK' : '[E] ENTER TANK' };
          if (inp.pressed('use')) {
            v.enter(s);
            this.camYaw = v.turretYaw;
            this.camPitch = -0.08;
            this.tankWeapon = 0;
            this.context = null;
            g.hud.setPrompt(null);
            return;
          }
          break;
        }
      }
      if (!ctx && g.combat.hasC4(s)) {
        ctx = { kind: 'detonate', label: 'DETONATE', prompt: touch ? null : '[E] DETONATE C-4' };
        if (inp.pressed('use') && g.combat.detonateC4(s)) g.audio.click();
      }
    }
    this.context = ctx;
    g.hud.setPrompt(ctx && ctx.prompt, ctx && ctx.progress !== undefined ? ctx.progress : -1);
  }

  // Touch aim assist: slows and gently pulls the aim toward an enemy near the crosshair
  _aimAssist(dt) {
    const s = this.s, g = this.game, inp = g.input;
    this.assistScan -= dt;
    if (this.assistScan <= 0) {
      this.assistScan = 0.12;
      this.assistTarget = null;
      const eye = s.eye(_e), f = s.forward(_d);
      let best = 0.13;
      for (const e of g.soldiers) {
        if (e.team === s.team || e.state !== 'alive' || e.vehicle) continue;
        const c = e.chest(_v);
        const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > 120 || dist < 0.5) continue;
        const ang = Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / dist, -1, 1));
        if (ang >= best) continue;
        if (!g.world.lineClear(eye.x, eye.y, eye.z, c.x, c.y, c.z)) continue;
        best = ang;
        this.assistTarget = e;
      }
    }
    const t = this.assistTarget;
    if (!t || t.state !== 'alive') return;
    const eye = s.eye(_e), c = t.chest(_v);
    const dyaw = wrapAngle(yawTo(c.x - eye.x, c.z - eye.z) - s.yaw);
    const dpitch = Math.atan2(c.y - eye.y, Math.hypot(c.x - eye.x, c.z - eye.z)) - s.pitch;
    const engaged = inp.down('fire') || s.adsT > 0.5;
    const k = Math.min(1, dt * (engaged ? 4.5 : 1.2));
    s.yaw = wrapAngle(s.yaw + dyaw * k);
    s.pitch = clamp(s.pitch + dpitch * k, -1.45, 1.45);
  }

  // True when a visible enemy sits inside a small cone around the crosshair (touch auto-fire)
  _enemyUnderCrosshair() {
    const s = this.s, g = this.game;
    this.autoScan -= 1;
    if (this.autoScan > 0) return this.autoHit;
    this.autoScan = 3;
    const gun = s.gun;
    const range = gun ? gun.def.botRange * 1.3 : 80;
    const eye = s.eye(_e), f = s.forward(_d);
    let hit = false;
    for (const e of g.soldiers) {
      if (e.team === s.team || e.state !== 'alive' || e.vehicle) continue;
      const c = e.chest(_v);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > range || dist < 0.3) continue;
      const ang = Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / dist, -1, 1));
      if (ang > Math.max(0.015, 0.42 / dist)) continue;
      if (!g.world.lineClear(eye.x, eye.y, eye.z, c.x, c.y, c.z)) continue;
      hit = true;
      break;
    }
    this.autoHit = hit;
    return hit;
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
    this.context = { kind: 'exit', label: 'EXIT TANK' };
    if (inp.pressed('use')) {
      v.removeDriver(s, true);
      s.yaw = this.camYaw;
      s.pitch = 0;
      this.context = null;
      g.hud.setPrompt(null);
      return;
    }
    g.hud.setPrompt(null);
    // camera + aim point computed in updateCamera
  }

  whileDown(dt) {
    const s = this.s, g = this.game, inp = g.input;
    this.context = null;
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

  // Moves magazines, bolts, slides, pumps and the left hand through each reload stage and
  // after each shot. Returns how far the gun should roll toward the camera (0..1).
  _animateParts(gun) {
    const vm = this.vm, P = vm.parts, lh = vm.lh;
    for (const k in P) {
      const o = P[k];
      o.position.copy(o.userData.base);
      o.rotation.set(o.userData.rx, 0, 0);
      o.visible = true;
    }
    const hand = lh.position.copy(vm.lhBase);
    lh.rotation.set(0, 0, 0);
    vm.shell.visible = false;
    if (!gun) return 0;
    const st = gun.stage, p = gun.stageP, d = gun.def, travel = vm.boltTravel;
    const mag = P.mag, pump = P.pump, cover = P.cover, slide = P.slide, bolt = P.bolt;
    let roll = 0;
    // Positions along the magazine's own axis (0 = seated)
    const magAt = (dist, out) => out.set(0, -Math.cos(mag.userData.rx), -Math.sin(mag.userData.rx)).multiplyScalar(dist).add(mag.userData.base);
    const pouchHand = _pa.copy(POUCH).add(GRAB);

    if ((st === 'out' || st === 'in') && mag) {
      roll = 1;
      const len = mag.userData.len;
      if (st === 'out') {
        if (cover) cover.rotation.x = 1.1 * seg(p, 0.3, 0.45);
        const grab = magAt(0, _pb).add(GRAB);
        const t0 = cover ? 0.45 : 0.4;
        hand.lerpVectors(vm.lhBase, grab, seg(p, cover ? 0.1 : 0, t0));
        if (p > t0) {
          const q = (p - t0) / (1 - t0);
          if (gun.droppedEmpty && !cover) {
            // an empty magazine falls free while the hand heads for the pouch
            magAt(0.02 + q * q * 0.7, mag.position);
            mag.rotation.x = mag.userData.rx + q * 1.4;
            hand.lerpVectors(grab, pouchHand, seg(q, 0.1, 1));
          } else {
            // a magazine with rounds left is pulled out and kept
            magAt(len * 0.6 * seg(q, 0, 0.35), _pc);
            mag.position.lerpVectors(_pc, POUCH, seg(q, 0.35, 1));
            hand.copy(mag.position).add(GRAB);
          }
        }
      } else {
        if (cover) cover.rotation.x = 1.1 * (1 - seg(p, 0.82, 1));
        magAt(len * 0.7, _pb);
        if (p < 0.55) mag.position.lerpVectors(POUCH, _pb, seg(p, 0, 0.55));
        else mag.position.lerpVectors(_pb, mag.userData.base, seg(p, 0.55, 0.76));
        hand.copy(mag.position).add(GRAB);
        if (p > 0.8) hand.lerpVectors(_pc.copy(mag.userData.base).add(GRAB), vm.lhBase, seg(p, 0.8, 1));
      }
    } else if (st === 'charge') {
      roll = 0.6;
      if (pump) {
        pump.position.z += travel * Math.sin(seg(p, 0.05, 0.95) * Math.PI);
        hand.z += pump.position.z - pump.userData.base.z;
        roll = 0.3;
      } else if (bolt && bolt.userData.rotary) {
        this._boltCycle(bolt, p, travel);
        roll = 0.45;
      } else if (vm.charge) {
        const reach = seg(p, 0, 0.35) - seg(p, 0.66, 1);
        const pull = slide ? 1 - seg(p, 0.44, 0.5) : seg(p, 0.35, 0.6) * (1 - seg(p, 0.6, 0.65));
        hand.lerpVectors(vm.lhBase, vm.charge, reach);
        hand.z += pull * travel;
        const part = slide || bolt;
        if (part) part.position.z += pull * travel;
      }
    } else if ((st === 'start' || st === 'shell' || st === 'end') && vm.port) {
      roll = 0.8;
      const below = _pb.copy(vm.port).add(PORT_BELOW);
      if (st === 'start') hand.lerpVectors(vm.lhBase, below, seg(p, 0, 1));
      else if (st === 'end') hand.lerpVectors(below, vm.lhBase, seg(p, 0, 1));
      else {
        if (p < 0.3) hand.lerpVectors(below, pouchHand, seg(p, 0, 0.3));
        else if (p < 0.7) hand.lerpVectors(pouchHand, below, seg(p, 0.3, 0.7));
        else if (p < 0.88) hand.lerpVectors(below, vm.port, seg(p, 0.7, 0.88));
        else hand.lerpVectors(vm.port, below, seg(p, 0.88, 1));
        vm.shell.visible = p > 0.3 && p < 0.86;
      }
    } else if (!st) {
      // Working the action after a shot
      const since = 60 / d.rpm - Math.max(0, gun.cool);
      if (d.kind === 'bolt' && bolt && bolt.userData.rotary && since > 0.2 && since < 0.9) {
        this._boltCycle(bolt, (since - 0.2) / 0.7, travel);
        roll = 0.35;
      } else if (d.kind === 'bolt' && pump && since > 0.1 && since < 0.45) {
        const k = Math.sin(((since - 0.1) / 0.35) * Math.PI);
        pump.position.z += travel * k;
        hand.z += travel * k;
      } else if (slide && since < 0.07 && gun.cool > 0) {
        slide.position.z += travel * Math.sin((since / 0.07) * Math.PI);
      }
    }
    // An empty pistol's slide locks back until a new magazine goes in and the slide is released
    if (slide && gun.closed && gun.chamber === 0 && st !== 'charge') slide.position.z = slide.userData.base.z + travel;
    if (mag && gun.magOut && st !== 'in' && st !== 'out') mag.visible = false;
    return roll;
  }

  // Bolt-action: lift the handle, pull back, push forward, lock down (q: 0..1)
  _boltCycle(bolt, q, travel) {
    bolt.rotation.z = 1.1 * (seg(q, 0, 0.2) - seg(q, 0.8, 1));
    bolt.position.z += travel * (seg(q, 0.2, 0.42) - seg(q, 0.5, 0.75));
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
    // reload: the gun rolls toward you while the hands work the magazine, bolt or shells
    const gun = s.gun;
    const roll = this._animateParts(gun);
    this.reloadBlend += (roll - this.reloadBlend) * Math.min(1, dt * 9);
    const rb = this.reloadBlend;
    const VP = RELOAD_POSES[this.vm.kind] || RELOAD_POSE;
    r.z += rb * VP[0]; r.x += rb * VP[1]; r.y += rb * VP[2];
    p.x += rb * VP[3]; p.y += rb * VP[4]; p.z += rb * VP[5];
    placeForearm(this.vm);
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
