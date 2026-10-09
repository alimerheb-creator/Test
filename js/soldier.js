// Soldier entity shared by the player and bots: movement physics, health/downed state, model.
import * as THREE from 'three';
import { TEAMS, MOVE, RULES, CLASSES, WEAPONS, GADGETS, PLAY_HALF } from './config.js';
import { raySphere, rayAABB, dirFromAngles, pick, clamp } from './util.js';
import { Gun } from './weapons.js';

export const RADIUS = 0.34;
const STEP = 0.55;
export const HEIGHTS = [1.8, 1.25, 0.6];
export const EYES = [1.62, 1.1, 0.42];
const SKINS = [0xc79a7a, 0x9c6e4f, 0x6b4a35, 0xe0b594];

const _tmp = [];
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

// ---------------------------------------------------------------- shared model geometry
// Soldiers are built from smooth lathed limbs, rounded boxes and spheres, merged per body part with vertex
// colours. A 'camo' vertex attribute marks fabric: the material paints a two-tone camouflage and cloth grain
// on it in object space, so the pattern sticks to the uniform as the limbs move.
let MAT = null;
const GEO = new Map();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, -1, 0);

// Merges parts ({ geo | s: [w,h,d], p, r, c, k (camo 0..1), m (Matrix4 applied last) }) into one geometry.
function merge(parts) {
  const pos = [], nor = [], col = [], cam = [], idx = [];
  const c = new THREE.Color();
  let off = 0;
  for (const part of parts) {
    let g = part.geo ? part.geo.clone() : rbox(part.s[0], part.s[1], part.s[2], part.rr ?? Math.min(part.s[0], part.s[1], part.s[2]) * 0.22);
    if (part.r) { g.rotateX(part.r[0] || 0); g.rotateY(part.r[1] || 0); g.rotateZ(part.r[2] || 0); }
    if (part.p) g.translate(part.p[0], part.p[1], part.p[2]);
    if (part.m) g.applyMatrix4(part.m);
    const P = g.attributes.position, N = g.attributes.normal;
    c.set(part.c);
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(c.r, c.g, c.b);
      cam.push(part.k || 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < P.count; i++) idx.push(i + off);
    off += P.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('camo', new THREE.Float32BufferAttribute(cam, 1));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

// Box with rounded edges and true rounded normals.
function rbox(w, h, d, r) {
  r = Math.max(0.001, Math.min(r, w / 2, h / 2, d / 2));
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const P = g.attributes.position, N = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2], v = [0, 0, 0], inner = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    v[0] = P.getX(i); v[1] = P.getY(i); v[2] = P.getZ(i);
    let nx = 0, ny = 0, nz = 0;
    for (let a = 0; a < 3; a++) {
      const u = v[a], s = Math.sign(u), au = Math.abs(u);
      // grid 0, .25, .5 -> 0, half - r, half
      const x = au < 0.3 ? (au / 0.25) * (half[a] - r) : half[a];
      inner[a] = s * Math.min(x, half[a] - r);
      v[a] = s * x;
    }
    nx = v[0] - inner[0]; ny = v[1] - inner[1]; nz = v[2] - inner[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (l > 1e-6) P.setXYZ(i, inner[0] + nx * r, inner[1] + ny * r, inner[2] + nz * r);
    else P.setXYZ(i, v[0], v[1], v[2]);
    if (l > 1e-6) N.setXYZ(i, nx, ny, nz);
  }
  return g;
}

// Tapered limb with rounded ends from the origin down -y.
function taper(r0, r1, len, seg = 9) {
  const pts = [
    [0.0001, -len - r1 * 0.9], [r1 * 0.62, -len - r1 * 0.72], [r1 * 0.92, -len - r1 * 0.32], [r1, -len],
    [(r0 + r1) / 2 * 1.04, -len / 2], [r0, 0], [r0 * 0.92, r0 * 0.32], [r0 * 0.62, r0 * 0.72], [0.0001, r0 * 0.9],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, seg);
}

// Limb from point a to point b.
function seg(a, b, r0, r1, c, k = 1) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const g = taper(r0, r1, len);
  _q.setFromUnitVectors(_up, d.normalize());
  g.applyQuaternion(_q);
  return { geo: g, p: a, c, k };
}

function ball(r, sx, sy, sz, p, c, k = 0, ws = 12, hs = 9) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  return { geo: g, p, c, k };
}

function cyl(rt, rb, h, p, c, r, k = 0, n = 10) {
  return { geo: new THREE.CylinderGeometry(rt, rb, h, n), p, c, r, k };
}

// Two-bone arm: elbow placed between shoulder s and wrist w, bent towards pole.
function arm(s, w, pole, A = 0.29, B = 0.27) {
  const S = new THREE.Vector3(...s), W = new THREE.Vector3(...w);
  const dir = W.clone().sub(S);
  const d = Math.min(dir.length(), A + B - 0.005);
  dir.normalize();
  const x = (A * A - B * B + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A * A - x * x));
  const P = new THREE.Vector3(...pole);
  P.addScaledVector(dir, -P.dot(dir)).normalize();
  const E = S.clone().addScaledVector(dir, x).addScaledVector(P, h);
  return [E.x, E.y, E.z];
}

// Carbine in its own space: hand on the pistol grip at the origin, bore along -z.
function rifleParts(T, team) {
  const blk = 0x1c1d1f, mid = 0x2a2b2e, furn = team === 0 ? 0x7d6c4f : 0x26272a;
  return [
    { s: [0.042, 0.095, 0.16], p: [0, 0.035, 0.2], c: furn, rr: 0.012 },          // stock
    { s: [0.046, 0.1, 0.02], p: [0, 0.03, 0.285], c: blk, rr: 0.006 },            // butt pad
    cyl(0.016, 0.016, 0.12, [0, 0.06, 0.1], blk, [Math.PI / 2, 0, 0]),             // buffer tube
    { s: [0.036, 0.055, 0.2], p: [0, 0.035, -0.06], c: mid, rr: 0.008 },          // lower receiver
    { s: [0.04, 0.045, 0.24], p: [0, 0.083, -0.07], c: blk, rr: 0.008 },          // upper receiver
    { s: [0.02, 0.012, 0.36], p: [0, 0.112, -0.17], c: blk, rr: 0.003 },          // top rail
    { s: [0.03, 0.095, 0.042], p: [0, -0.025, 0.015], r: [-0.32, 0, 0], c: furn, rr: 0.01 }, // pistol grip
    { s: [0.028, 0.13, 0.058], p: [0, -0.04, -0.105], r: [0.22, 0, 0], c: furn, rr: 0.008 }, // magazine
    { s: [0.012, 0.012, 0.07], p: [0, 0.0, -0.035], c: blk, rr: 0.004 },           // trigger guard
    cyl(0.029, 0.029, 0.27, [0, 0.075, -0.32], mid, [Math.PI / 2, 0, 0], 0, 8),     // handguard
    { s: [0.03, 0.065, 0.034], p: [0, 0.01, -0.33], c: furn, rr: 0.01 },          // foregrip
    cyl(0.009, 0.009, 0.2, [0, 0.075, -0.55], blk, [Math.PI / 2, 0, 0], 0, 6),      // barrel
    cyl(0.014, 0.014, 0.055, [0, 0.075, -0.66], blk, [Math.PI / 2, 0, 0], 0, 8),    // muzzle device
    { s: [0.012, 0.035, 0.012], p: [0, 0.112, -0.45], c: blk, rr: 0.003 },         // front sight
    cyl(0.021, 0.021, 0.11, [0, 0.142, -0.08], blk, [Math.PI / 2, 0, 0], 0, 10),    // optic tube
    cyl(0.025, 0.025, 0.025, [0, 0.142, -0.14], blk, [Math.PI / 2, 0, 0], 0, 10),   // objective bell
    { s: [0.022, 0.02, 0.05], p: [0, 0.122, -0.08], c: blk, rr: 0.004 },          // optic mount
  ];
}

function gloveParts(at, c) {
  return [{ s: [0.058, 0.088, 0.09], p: at, c, rr: 0.022 }];
}

// Upper body (torso, kit, head, arms and the gun in the given pose).
function upperBody(T, team, skin, pose) {
  const glove = 0x2b2825;
  const vest = T.vest, top = T.top, helm = T.helmet, dark = 0x1a1b1d;
  const patch = new THREE.Color(T.hex).lerp(new THREE.Color(0x3a3a36), 0.45).getHex();
  const torsoProfile = [
    [0.0001, -0.04], [0.142, -0.03], [0.15, 0.05], [0.158, 0.15], [0.178, 0.27], [0.19, 0.36], [0.176, 0.43], [0.12, 0.49], [0.06, 0.52], [0.0001, 0.525],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tg = new THREE.LatheGeometry(torsoProfile, 14); tg.scale(1, 1, 0.64);
  const head = pose === 'aim' ? [0.012, 0.64, -0.04] : [0, 0.665, -0.015];
  const hx = head[0], hy = head[1], hz = head[2];
  const parts = [
    { geo: tg, p: [0, 0, 0], c: top, k: 1 },
    ball(0.068, 1, 1, 1, [-0.195, 0.43, 0], top, 1), ball(0.068, 1, 1, 1, [0.195, 0.43, 0], top, 1),
    // plate carrier, cummerbund, straps
    { s: [0.33, 0.34, 0.06], p: [0, 0.27, -0.122], c: vest, k: 0.7, rr: 0.025 },
    { s: [0.33, 0.36, 0.055], p: [0, 0.28, 0.118], c: vest, k: 0.7, rr: 0.025 },
    { geo: (() => { const g = new THREE.CylinderGeometry(0.168, 0.165, 0.15, 16); g.scale(1, 1, 0.76); return g; })(), p: [0, 0.15, 0], c: vest, k: 0.7 },
    { s: [0.075, 0.03, 0.25], p: [-0.105, 0.455, 0], r: [0, 0, 0.16], c: vest, k: 0.7, rr: 0.012 },
    { s: [0.075, 0.03, 0.25], p: [0.105, 0.455, 0], r: [0, 0, -0.16], c: vest, k: 0.7, rr: 0.012 },
    // magazine pouches with flaps, admin pouch, patch, tourniquet
    ...[-0.082, 0, 0.082].flatMap((x) => [
      { s: [0.072, 0.11, 0.055], p: [x, 0.19, -0.176], c: vest, k: 0.7, rr: 0.012 },
      { s: [0.076, 0.03, 0.062], p: [x, 0.247, -0.178], c: vest, rr: 0.01 },
    ]),
    { s: [0.2, 0.075, 0.03], p: [0, 0.355, -0.162], c: vest, k: 0.7, rr: 0.01 },
    { s: [0.06, 0.04, 0.012], p: [0.095, 0.4, -0.153], c: patch, rr: 0.004 },
    cyl(0.017, 0.017, 0.08, [-0.105, 0.43, -0.122], dark, [0, 0, 0.16], 0, 8),
    // radio with antenna, grenade pouch, dump pouch
    { s: [0.07, 0.15, 0.065], p: [-0.168, 0.22, 0.085], c: vest, k: 0.6, rr: 0.014 },
    cyl(0.005, 0.004, 0.42, [-0.175, 0.5, 0.1], dark, [0.08, 0, 0.06], 0, 5),
    cyl(0.035, 0.035, 0.08, [0.172, 0.17, -0.05], vest, null, 0.6, 9),
    // assault pack
    { s: [0.28, 0.34, 0.13], p: [0, 0.27, 0.212], c: vest, k: 1, rr: 0.045 },
    { s: [0.27, 0.06, 0.14], p: [0, 0.43, 0.212], c: vest, k: 0.8, rr: 0.025 },
    { s: [0.035, 0.15, 0.09], p: [-0.155, 0.22, 0.212], c: vest, k: 1, rr: 0.014 },
    { s: [0.035, 0.15, 0.09], p: [0.155, 0.22, 0.212], c: vest, k: 1, rr: 0.014 },
    // neck and head
    cyl(0.052, 0.058, 0.13, [hx * 0.5, 0.55, hz * 0.5 - 0.005], skin),
    ball(0.1, 0.9, 1.08, 1.02, [hx, hy, hz], skin),
    ball(0.07, 1.0, 0.8, 1.0, [hx, hy - 0.055, hz - 0.03], team === 1 ? 0x1d1e21 : skin),
    { s: [0.022, 0.042, 0.03], p: [hx, hy - 0.005, hz - 0.1], r: [0.25, 0, 0], c: team === 1 ? 0x1d1e21 : skin, rr: 0.009 },
    { geo: (() => { const g = new THREE.CylinderGeometry(0.099, 0.097, 0.032, 14, 1, true, Math.PI - 0.95, 1.9); g.scale(0.92, 1, 1.04); return g; })(), p: [hx, hy + 0.02, hz], c: 0x101215 },
    // helmet with rails, NVG mount, counterweight and headset
    { geo: (() => { const g = new THREE.SphereGeometry(0.128, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.56); g.scale(1, 0.92, 1.1); return g; })(), p: [hx, hy + 0.03, hz + 0.01], c: helm, k: 1 },
    { geo: (() => { const g = new THREE.CylinderGeometry(0.129, 0.131, 0.022, 16, 1, true); g.scale(1, 1, 1.1); return g; })(), p: [hx, hy + 0.012, hz + 0.01], c: helm },
    { s: [0.016, 0.034, 0.13], p: [hx - 0.124, hy + 0.03, hz + 0.01], c: dark, rr: 0.006 },
    { s: [0.016, 0.034, 0.13], p: [hx + 0.124, hy + 0.03, hz + 0.01], c: dark, rr: 0.006 },
    { s: [0.06, 0.045, 0.028], p: [hx, hy + 0.1, hz - 0.13], r: [-0.4, 0, 0], c: dark, rr: 0.008 },
    { s: [0.09, 0.06, 0.035], p: [hx, hy + 0.05, hz + 0.145], c: helm, k: 0.6, rr: 0.014 },
    cyl(0.046, 0.046, 0.036, [hx - 0.112, hy - 0.01, hz + 0.005], dark, [0, 0, Math.PI / 2]),
    cyl(0.046, 0.046, 0.036, [hx + 0.112, hy - 0.01, hz + 0.005], dark, [0, 0, Math.PI / 2]),
    cyl(0.005, 0.005, 0.1, [hx - 0.09, hy - 0.06, hz - 0.06], dark, [0.9, 0, 0.3], 0, 5),
  ];
  // arms and gun
  const RS = [0.2, 0.425, 0], LS = pose === 'aim' ? [-0.185, 0.43, -0.045] : [-0.2, 0.425, 0];
  let RH, LH;
  if (pose === 'dead') {
    RH = [0.42, 0.05, -0.06];
    LH = [-0.58, 0.58, -0.04];
  } else if (pose === 'deadSide') {
    RH = [0.06, 0.28, -0.34];
    LH = [-0.08, 0.46, -0.38];
  } else {
    const M = new THREE.Matrix4();
    if (pose === 'aim') M.makeTranslation(0.075, 0.5, -0.3);
    else {
      M.makeRotationFromEuler(new THREE.Euler(-0.5, 0.85, 0.35, 'YXZ'));
      M.setPosition(0.13, 0.31, -0.2);
    }
    for (const p of rifleParts(T, team)) parts.push({ ...p, m: M });
    RH = new THREE.Vector3(0, 0.005, 0.012).applyMatrix4(M).toArray();
    LH = new THREE.Vector3(0, 0.025, -0.305).applyMatrix4(M).toArray();
  }
  const towards = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (const [S, H, pole] of [[RS, RH, pose === 'dead' ? [1, 0, 0.6] : [1, -0.7, 0.2]], [LS, LH, pose === 'dead' ? [-0.4, -1, 0] : [-0.6, -1, -0.1]]]) {
    const d = Math.hypot(H[0] - S[0], H[1] - S[1], H[2] - S[2]);
    const W = towards(S, H, Math.max(0.2, (d - 0.065) / d));
    const E = arm(S, W, pole);
    parts.push(seg(S, E, 0.06, 0.047, top, 1));
    parts.push(ball(0.044, 1, 1, 1, E, dark));
    parts.push(seg(E, W, 0.046, 0.034, top, 1));
    parts.push(...gloveParts(H, glove));
  }
  return merge(parts);
}

function modelGeos(team, skin) {
  const key = `${team}:${skin}`;
  if (GEO.has(key)) return GEO.get(key);
  const T = TEAMS[team];
  const boot = team === 0 ? 0x6b5a42 : 0x1f1e1d, dark = 0x1a1b1d, belt = 0x2f2b24;
  const pg = new THREE.LatheGeometry([[0.0001, -0.12], [0.12, -0.11], [0.163, -0.05], [0.17, 0.03], [0.156, 0.11], [0.0001, 0.115]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  pg.scale(1, 1, 0.68);
  const beltG = new THREE.CylinderGeometry(0.168, 0.168, 0.05, 16); beltG.scale(1, 1, 0.72);
  const pelvis = merge([
    { geo: pg, p: [0, 0, 0], c: T.pants, k: 1 },
    { geo: beltG, p: [0, 0.08, 0], c: belt },
    { s: [0.05, 0.04, 0.012], p: [0, 0.08, -0.122], c: 0x8a8578, rr: 0.004 },
    { s: [0.1, 0.11, 0.06], p: [-0.1, 0.0, 0.11], c: T.vest, k: 0.7, rr: 0.02 },
  ]);
  const thigh = (side) => merge([
    { geo: taper(0.09, 0.064, 0.44, 10), p: [0, 0, 0], c: T.pants, k: 1 },
    { s: [0.03, 0.12, 0.1], p: [side * 0.083, -0.21, 0], c: T.pants, k: 1, rr: 0.01 },
    { s: [0.034, 0.03, 0.105], p: [side * 0.085, -0.15, 0], c: T.pants, rr: 0.008 },
    ...(side > 0 ? [
      { s: [0.042, 0.15, 0.075], p: [0.092, -0.12, 0], c: dark, rr: 0.012 },
      { s: [0.03, 0.06, 0.036], p: [0.092, -0.02, 0.012], r: [0.25, 0, 0], c: 0x141516, rr: 0.008 },
      cyl(0.075, 0.075, 0.025, [0.012, -0.2, 0], dark, null, 0, 12),
    ] : [
      { s: [0.04, 0.1, 0.055], p: [-0.09, -0.11, -0.01], c: T.vest, k: 0.7, rr: 0.012 },
    ]),
  ]);
  const shin = merge([
    { geo: taper(0.066, 0.05, 0.36, 10), p: [0, 0, 0], c: T.pants, k: 1 },
    { s: [0.1, 0.11, 0.05], p: [0, -0.035, -0.06], c: dark, rr: 0.022 },
    cyl(0.06, 0.058, 0.13, [0, -0.34, 0.005], boot),
    { s: [0.1, 0.075, 0.25], p: [0, -0.43, -0.055], c: boot, rr: 0.032 },
    { s: [0.106, 0.024, 0.262], p: [0, -0.468, -0.055], c: 0x1b1917, rr: 0.01 },
  ]);
  const rifle = merge(rifleParts(T, team));
  const g = {
    pelvis, thighL: thigh(-1), thighR: thigh(1), shin, rifle,
    aim: upperBody(T, team, skin, 'aim'), low: upperBody(T, team, skin, 'low'),
    dead: upperBody(T, team, skin, 'dead'), deadSide: upperBody(T, team, skin, 'deadSide'),
  };
  GEO.set(key, g);
  return g;
}

function soldierMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.03, envMapIntensity: 0.55 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float camo;\nvarying float vCamo;\nvarying vec3 vObjP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamo = camo;\nvObjP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vCamo;
varying vec3 vObjP;
float sfH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sfH(i), sfH(i + vec3(1, 0, 0)), f.x), mix(sfH(i + vec3(0, 1, 0)), sfH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sfH(i + vec3(0, 0, 1)), sfH(i + vec3(1, 0, 1)), f.x), mix(sfH(i + vec3(0, 1, 1)), sfH(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vCamo > 0.01) {
  float n1 = sfN(vObjP * 8.0) * 0.65 + sfN(vObjP * 19.0) * 0.35;
  float n2 = sfN(vObjP * 6.5 + 17.3) * 0.6 + sfN(vObjP * 17.0 + 5.1) * 0.4;
  float a = smoothstep(0.5, 0.55, n1), b = smoothstep(0.56, 0.6, n2) * (1.0 - a);
  vec3 cc = diffuseColor.rgb;
  cc = mix(cc, cc * vec3(0.6, 0.58, 0.52), a * vCamo);
  cc = mix(cc, cc * vec3(1.28, 1.24, 1.1), b * vCamo);
  diffuseColor.rgb = cc * (0.93 + 0.12 * sfN(vObjP * 70.0) * vCamo);
}`);
  };
  return m;
}

// Mods can recolour uniforms; drop cached geometry so the next soldiers pick it up
export function clearSoldierModelCache() {
  GEO.clear();
}

const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// Shin angle (relative to the thigh) that keeps the foot on the ground for a hip joint height and thigh angle.
const kneeFor = (hj, a) => -Math.acos(clamp((hj - 0.44 * Math.cos(a)) / 0.48, -1, 1)) - a;

export class Soldier {
  constructor(game, { team, name, isPlayer = false, squad = 0, classId = 'assault' }) {
    this.game = game;
    this.team = team;
    this.name = name;
    this.isPlayer = isPlayer;
    this.squad = squad;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.jumped = false;
    this.stance = 0;
    this.eyeH = EYES[0];
    this.sprinting = false;
    this.slideT = 0;
    this.health = 100;
    this.state = 'inactive'; // inactive | alive | downed | dead
    this.downedT = 0;
    this.respawnT = 0;
    this.spawnProtect = 0;
    this.lastDamageT = -100;
    this.lastAttacker = null;
    this.damageBy = new Map();
    this.lastFireT = -100;
    this.spottedUntil = 0;   // visible to the enemy team (3D marker)
    this.miniUntil = 0;      // visible on the enemy minimap
    this.vehicle = null;
    this.guns = [];
    this.slot = 0;
    this.gadget = null;
    this.gadgetAmmo = 0;
    this.gadgetCd = 0;
    this.grenades = 0;
    this.adsT = 0;
    this.stats = { score: 0, kills: 0, deaths: 0, assists: 0, revives: 0, caps: 0 };
    this.walkPhase = Math.random() * 6;
    this.stepDist = 0;
    this.fallT = 0;
    this.bodyT = 0;
    this.brain = null;
    this._head = false;
    this.skin = pick(SKINS);
    this._buildModel();
    this.setClass(classId);
  }

  get cls() { return CLASSES[this.classId]; }
  get maxHealth() { return RULES.playerHealth; }
  get gun() { return this.slot < 2 ? this.guns[this.slot] : null; }
  get alive() { return this.state === 'alive'; }
  get height() { return HEIGHTS[this.stance]; }

  eye(out) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  chest(out) {
    const h = this.stance === 2 ? 0.3 : this.eyeH * 0.72;
    return out.set(this.pos.x, this.pos.y + h, this.pos.z);
  }
  forward(out) { return dirFromAngles(this.yaw, this.pitch, out); }

  // ------------------------------------------------------------ model
  _buildModel() {
    if (!MAT) MAT = soldierMaterial();
    const g = modelGeos(this.team, this.skin);
    this._geos = g;
    const root = new THREE.Group();
    const body = new THREE.Group();
    const hip = new THREE.Group();
    hip.position.y = 0.95;
    const pelvis = new THREE.Mesh(g.pelvis, MAT);
    const leg = (x, geo) => {
      const thigh = new THREE.Group();
      thigh.position.set(x, -0.03, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      const tm = new THREE.Mesh(geo, MAT), sm = new THREE.Mesh(g.shin, MAT);
      knee.add(sm);
      thigh.add(tm, knee);
      return { thigh, knee, meshes: [tm, sm] };
    };
    const L = leg(-0.1, g.thighL), R = leg(0.1, g.thighR);
    const torso = new THREE.Mesh(g.aim, MAT);
    torso.position.y = 0.08;
    const rifle = new THREE.Mesh(g.rifle, MAT);
    rifle.visible = false;
    for (const m of [pelvis, ...L.meshes, ...R.meshes, torso, rifle]) { m.castShadow = true; m.receiveShadow = false; }
    hip.add(pelvis, L.thigh, R.thigh, torso);
    body.add(hip);
    root.add(body, rifle);
    root.visible = false;
    this.model = { root, body, hip, legL: L.thigh, legR: R.thigh, kneeL: L.knee, kneeR: R.knee, torso, rifle, pose: 'aim', poseT: 0 };
    this.game.scene.add(root);
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }

  setClass(id) {
    this.classId = id;
    const c = CLASSES[id];
    this.guns = [new Gun(WEAPONS[c.primary]), new Gun(WEAPONS[c.secondary])];
    this.gadget = GADGETS[c.gadget];
    this.gadgetAmmo = this.gadget.ammo;
    this.gadgetCd = 0;
    this.grenades = c.grenades;
    this.slot = 0;
  }

  // Starts reloading the weapon in hand. Returns true if a reload began.
  reload() {
    const gun = this.gun;
    if (!gun || gun.reloading) return false;
    if (this.game.hasFilter('reload') && !this.game.filter('reload', { soldier: this, gun, weapon: gun.def })) return false;
    if (!gun.startReload()) return false;
    this._foley(gun.type === 'shell' ? 'grab' : gun.stage === 'charge' ? 'grab' : 'release');
    this.game.emit('reload', { soldier: this, gun, stage: 'begin' });
    return true;
  }

  _foley(kind, pitch = 1) {
    const e = this.eye(_v);
    this.game.audio.foley(kind, e.x, e.y - 0.35, e.z, this.isPlayer, pitch);
  }

  // Reload stages and bolt cycling are audible, so you can hear an enemy reloading nearby
  _gunEvent(gun, ev) {
    const g = this.game, def = gun.def, type = gun.type;
    const pitch = def.model === 'pistol' ? 1.35 : def.model === 'smg' ? 1.15 : type === 'box' ? 0.8 : 1;
    if (ev === 'cycle') this._foley(type === 'shell' ? 'pump' : 'bolt', pitch);
    else if (ev === 'out') {
      this._foley(type === 'box' ? 'cover' : 'out', pitch);
      if (gun.droppedEmpty && def.model !== 'none') {
        const e = this.eye(_v);
        const f = this.forward(_d);
        g.effects.dropMag(e.x + f.x * 0.4, e.y - 0.45, e.z + f.z * 0.4, this.vel.x, this.vel.z, type === 'box' ? 1.6 : def.model === 'pistol' ? 0.6 : 1);
        this._foley('drop', pitch);
      }
    } else if (ev === 'in') this._foley(type === 'box' ? 'belt' : 'in', pitch);
    else if (ev === 'charge') this._foley(type === 'shell' ? 'pump' : def.kind === 'bolt' ? 'bolt' : def.model === 'pistol' ? 'slide' : 'charge', pitch);
    else if (ev === 'shell') this._foley('shell', pitch);
    else if (ev === 'start' || ev === 'end') this._foley('grab', pitch);
    if (ev !== 'cycle') g.emit('reload', { soldier: this, gun, stage: ev });
  }

  refill(full = true) {
    for (const g of this.guns) g.refill(full);
    if (full) {
      this.gadgetAmmo = this.gadget.ammo;
      this.grenades = this.cls.grenades;
    }
  }

  spawn(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stance = 0;
    this.eyeH = EYES[0];
    this.health = RULES.playerHealth;
    this.state = 'alive';
    this.spawnProtect = RULES.spawnProtection;
    this.downedT = 0;
    this.fallT = 0;
    this.bodyT = 0;
    this.slideT = 0;
    this.vehicle = null;
    this.damageBy.clear();
    this.lastAttacker = null;
    this.slot = 0;
    this.adsT = 0;
    this.onGround = false;
    this.refill(true);
    const m = this.model;
    m.body.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0);
    if (this.brain) this.brain.reset();
    this.game.emit('spawn', this);
  }

  canStand(st) {
    return this.game.world.isFree(this.pos.x, this.pos.y + 0.05, this.pos.z, RADIUS * 0.9, HEIGHTS[st]);
  }

  setStance(st) {
    if (st === this.stance) return true;
    if (st < this.stance && !this.canStand(st)) return false;
    this.stance = st;
    return true;
  }

  // ------------------------------------------------------------ physics
  move(dt, wx, wz, speed, jump) {
    if (this.game.hasFilter('moveSpeed')) {
      const f = this.game.filter('moveSpeed', { soldier: this, speed, jump });
      if (f) { speed = Math.max(0, Number(f.speed) || 0); jump = !!f.jump; } else { speed = 0; jump = false; }
    }
    const accel = this.onGround ? MOVE.accel : MOVE.airAccel;
    const ax = wx * speed - this.vel.x, az = wz * speed - this.vel.z;
    const al = Math.sqrt(ax * ax + az * az), maxA = accel * dt;
    if (al > maxA) { this.vel.x += (ax / al) * maxA; this.vel.z += (az / al) * maxA; }
    else { this.vel.x += ax; this.vel.z += az; }
    if (jump && this.onGround && this.stance === 0) {
      this.vel.y = MOVE.jump;
      this.onGround = false;
      this.jumped = true;
    }
    this.physics(dt);
  }

  physics(dt) {
    const wasGround = this.onGround;
    this.vel.y -= RULES.gravity * dt;
    if (this.vel.y < -45) this.vel.y = -45;
    const fallSpeed = -this.vel.y;
    const dx = this.vel.x * dt, dz = this.vel.z * dt, dy = this.vel.y * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy)) / 0.25));
    this.onGround = false;
    this.blocked = false;
    for (let i = 0; i < steps; i++) {
      this._axis(0, dx / steps, wasGround);
      this._axis(2, dz / steps, wasGround);
      this._vert(dy / steps);
    }
    if (!this.onGround && wasGround && this.vel.y <= 0 && !this.jumped) {
      const g = this._supportBelow(0.5);
      if (g !== null) { this.pos.y = g; this.vel.y = 0; this.onGround = true; }
    }
    if (RULES.fallDamage && this.onGround && !wasGround && fallSpeed > 15) {
      this.takeDamage((fallSpeed - 15) * 9, null, { weapon: 'FALL', force: true });
    }
    this.jumped = false;
    for (const v of this.game.vehicles) v.pushOut(this);
    const lim = PLAY_HALF + 90;
    if (this.pos.x > lim) this.pos.x = lim; else if (this.pos.x < -lim) this.pos.x = -lim;
    if (this.pos.z > lim) this.pos.z = lim; else if (this.pos.z < -lim) this.pos.z = -lim;
  }

  _axis(axis, d, wasGround) {
    if (d === 0) return;
    const p = this.pos, w = this.game.world, R = RADIUS, h = this.height;
    if (axis === 0) p.x += d; else p.z += d;
    const boxes = w.queryBoxes(p.x - R, p.y + 0.01, p.z - R, p.x + R, p.y + h, p.z + R, _tmp);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!(p.x + R > b.minX && p.x - R < b.maxX && p.z + R > b.minZ && p.z - R < b.maxZ && p.y + h > b.minY && p.y + 0.01 < b.maxY)) continue;
      const rise = b.maxY - p.y;
      if (rise > 0 && rise <= STEP && (wasGround || this.onGround) && w.isFree(p.x, b.maxY, p.z, R, h)) {
        p.y = b.maxY;
        this.onGround = true;
        continue;
      }
      if (axis === 0) { p.x = d > 0 ? b.minX - R - 1e-4 : b.maxX + R + 1e-4; this.vel.x = 0; }
      else { p.z = d > 0 ? b.minZ - R - 1e-4 : b.maxZ + R + 1e-4; this.vel.z = 0; }
      this.blocked = true;
    }
  }

  _vert(d) {
    const p = this.pos, w = this.game.world, R = RADIUS, h = this.height;
    p.y += d;
    const boxes = w.queryBoxes(p.x - R, p.y, p.z - R, p.x + R, p.y + h, p.z + R, _tmp);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (d <= 0) {
        if (b.maxY - p.y <= -d + 0.08) {
          p.y = b.maxY;
          if (this.vel.y < 0) this.vel.y = 0;
          this.onGround = true;
        }
      } else if (b.minY >= p.y + h - d - 0.08) {
        p.y = b.minY - h - 0.001;
        if (this.vel.y > 0) this.vel.y = 0;
      }
    }
    const g = w.heightAt(p.x, p.z);
    if (p.y <= g) {
      p.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    }
  }

  _supportBelow(maxDrop) {
    const p = this.pos, w = this.game.world, r = RADIUS * 0.7;
    let best = w.heightAt(p.x, p.z);
    const boxes = w.queryBoxes(p.x - r, p.y - maxDrop, p.z - r, p.x + r, p.y + 0.02, p.z + r, _tmp);
    for (const b of boxes) if (b.maxY <= p.y + 0.02 && b.maxY > best) best = b.maxY;
    return p.y - best <= maxDrop ? best : null;
  }

  // ------------------------------------------------------------ combat state
  takeDamage(amount, attacker, info = {}) {
    if (this.state !== 'alive') return false;
    if (this.spawnProtect > 0 && !info.force) return false;
    if (attacker && attacker !== this && attacker.team === this.team && !RULES.friendlyFire) return false;
    if (attacker === this) amount *= 0.5;
    if (!info.force) amount *= RULES.damageScale;
    if (this.game.hasFilter('damage')) {
      const f = this.game.filter('damage', { victim: this, attacker, amount, info });
      if (!f) return false;
      amount = Number(f.amount) || 0;
      if (amount <= 0) return false;
    }
    this.health -= amount;
    this.lastDamageT = this.game.time;
    if (attacker && attacker !== this) {
      this.lastAttacker = attacker;
      this.damageBy.set(attacker, (this.damageBy.get(attacker) || 0) + amount);
    }
    this.game.emit('damage', { victim: this, attacker, amount, info });
    if (this.health <= 0) {
      this.die(attacker, info);
      return true;
    }
    return false;
  }

  die(attacker, info = {}) {
    if (this.state !== 'alive') return;
    this.health = 0;
    if (this.vehicle) this.vehicle.removeDriver(this, false);
    const revivable = !info.noRevive;
    this.state = revivable ? 'downed' : 'dead';
    this.downedT = revivable ? RULES.downedTime + (this.isPlayer ? 4 : 0) : 0;
    this.respawnT = RULES.respawnTime;
    this.fallT = 0;
    this.bodyT = 0;
    this.slideT = 0;
    this.adsT = 0;
    this.stance = 0;
    this.stats.deaths++;
    this.deathYaw = attacker ? Math.atan2(-(attacker.pos.x - this.pos.x), -(attacker.pos.z - this.pos.z)) : this.yaw;
    this.game.emit('kill', { victim: this, killer: attacker && attacker !== this ? attacker : null, weapon: info.weapon || '', headshot: !!info.headshot, self: attacker === this });
    if (!revivable) this.game.mode.ticketLoss(this.team);
  }

  revive(by) {
    if (this.state !== 'downed') return;
    this.state = 'alive';
    this.health = Math.max(1, RULES.playerHealth * 0.45);
    this.downedT = 0;
    this.fallT = 0;
    this.spawnProtect = 1;
    this.damageBy.clear();
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
    if (this.brain) this.brain.reset();
    this.game.emit('revive', { soldier: this, by });
  }

  bleedOut() {
    if (this.state !== 'downed') return;
    this.state = 'dead';
    this.respawnT = this.isPlayer ? 0 : RULES.respawnTime;
    this.game.mode.ticketLoss(this.team);
    this.game.emit('bleedout', this);
  }

  update(dt) {
    if (this.state === 'alive') {
      if (this.spawnProtect > 0) this.spawnProtect -= dt;
      for (let i = 0; i < this.guns.length; i++) {
        const ev = this.guns[i].update(dt, i === this.slot && !this.vehicle);
        if (ev) this._gunEvent(this.guns[i], ev);
      }
      if (this.gadgetCd > 0) this.gadgetCd -= dt;
      if (this.gadget.recharge && this.gadgetAmmo < this.gadget.ammo && this.gadgetCd <= 0) this.gadgetAmmo = this.gadget.ammo;
      const maxHp = RULES.playerHealth;
      if (this.game.time - this.lastDamageT > RULES.regenDelay && this.health < maxHp) this.health = Math.min(maxHp, this.health + RULES.regenRate * dt);
      const targetEye = EYES[this.stance];
      this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 12);
      // footsteps
      if (this.onGround && !this.vehicle) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        this.stepDist += sp * dt;
        const stride = this.sprinting ? 2.6 : 2.0;
        if (this.stepDist > stride && this.stance < 2) {
          this.stepDist = 0;
          const a = this.game.audio;
          if (this.isPlayer) a.footstep(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 0.9 : 0.6);
          else a.footstep(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 0.8 : 0.5);
        }
      }
    } else if (this.state === 'downed') {
      this.downedT -= dt;
      this.fallT = Math.min(1, this.fallT + dt * 1.3);
      if (this.downedT <= 0) this.bleedOut();
    } else if (this.state === 'dead') {
      this.respawnT -= dt;
      this.bodyT += dt;
      this.fallT = Math.min(1, this.fallT + dt * 1.3);
    }
    this.updateModel(dt);
  }

  updateModel(dt) {
    const m = this.model;
    const visible = !this.isPlayer && !this.vehicle && this.state !== 'inactive' && !(this.state === 'dead' && this.bodyT > 10);
    m.root.visible = visible;
    if (!visible) return;
    m.root.position.copy(this.pos);
    if (this.state !== 'alive') { this._ragdoll(); return; }
    this._rag = null;
    m.rifle.visible = false;
    m.root.rotation.y = this.yaw;
    const now = this.game.time;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // Weapon shouldered when fighting, carried at low ready when running or with no enemy around
    const fighting = now - this.lastFireT < 2.5 || this.adsT > 0 || (this.brain ? !!this.brain.target : true);
    const pose = this.stance === 2 ? 'aim' : this.sprinting || !fighting ? 'low' : 'aim';
    if (m.pose === 'dead') { m.pose = pose; m.torso.geometry = this._geos[pose]; }
    if (pose !== m.pose) {
      m.poseT += dt;
      if (m.poseT > 0.25) { m.pose = pose; m.torso.geometry = this._geos[pose]; m.poseT = 0; }
    } else m.poseT = 0;
    this.walkPhase += sp * dt * (this.sprinting ? 1.6 : 2.1);
    const amp = Math.min(1, sp / 4) * (this.sprinting ? 0.85 : 0.55);
    const ph = this.walkPhase, sw = Math.sin(ph) * amp, cw = Math.cos(ph);
    const breathe = Math.sin(now * 1.6 + this.skin) * 0.014;
    m.hip.rotation.set(0, 0, 0);
    m.legL.rotation.set(0, 0, 0);
    m.legR.rotation.set(0, 0, 0);
    if (this.stance === 2) {
      m.body.rotation.set(-Math.PI / 2, 0, 0);
      m.body.position.set(0, 0.22, 0.85);
      m.hip.position.y = 0.95;
      m.legL.rotation.set(sw * 0.25, 0, -0.14);
      m.legR.rotation.set(-sw * 0.25, 0, 0.14);
      m.kneeL.rotation.x = -Math.max(0, sw) * 0.9;
      m.kneeR.rotation.x = -Math.max(0, -sw) * 0.9;
      m.torso.rotation.set(clamp(this.pitch, -0.3, 0.6) + 0.15, 0, sw * 0.06);
    } else if (this.stance === 1) {
      m.body.rotation.set(0, 0, 0);
      m.body.position.set(0, 0, 0);
      if (sp > 0.4) {
        // crouched walk: bent knees, feet kept on the ground
        m.hip.position.y = 0.68 + Math.abs(cw) * amp * 0.04;
        const aL = 0.75 + sw * 0.6, aR = 0.75 - sw * 0.6;
        m.legL.rotation.x = aL;
        m.legR.rotation.x = aR;
        m.kneeL.rotation.x = kneeFor(0.65, aL) - Math.max(0, cw) * amp * 0.6;
        m.kneeR.rotation.x = kneeFor(0.65, aR) - Math.max(0, -cw) * amp * 0.6;
      } else {
        // kneeling on the right knee
        m.hip.position.y = 0.56;
        m.legL.rotation.set(1.25, 0, -0.05);
        m.kneeL.rotation.x = -0.63;
        m.legR.rotation.set(0.12, 0, 0.07);
        m.kneeR.rotation.x = -1.65;
      }
      m.torso.rotation.set(this.pitch * 0.7 - 0.22 + breathe, 0, 0);
    } else {
      m.body.rotation.set(0, 0, 0);
      m.body.position.set(0, 0, 0);
      m.hip.position.y = 0.95 - amp * 0.035 + Math.abs(cw) * amp * 0.05;
      m.legL.rotation.x = sw;
      m.legR.rotation.x = -sw;
      // the knee folds while the leg swings forward and is nearly straight while it carries the weight
      m.kneeL.rotation.x = -Math.max(0, cw) * amp * 1.5 - amp * 0.12;
      m.kneeR.rotation.x = -Math.max(0, -cw) * amp * 1.5 - amp * 0.12;
      m.hip.rotation.y = sw * 0.14;
      m.torso.rotation.set(this.pitch * 0.7 - (this.sprinting ? 0.3 : amp * 0.06) + breathe, -sw * 0.24, 0);
    }
  }

  // Death fall: the knees give way, the body tips over (back, front or side), limbs settle loosely and the
  // rifle drops beside the body. The pose is picked at random once per death.
  _ragdoll() {
    const m = this.model;
    let R = this._rag;
    if (!R) {
      const r = Math.random(), side = Math.random() < 0.5 ? -1 : 1;
      const kind = r < 0.55 ? 'back' : r < 0.82 ? 'front' : 'side';
      const a = [Math.random() * 0.75, Math.random() * 0.45];
      R = this._rag = {
        kind, side,
        twist: (Math.random() - 0.5) * 0.7,
        thigh: kind === 'back' ? a : kind === 'front' ? [(Math.random() - 0.6) * 0.2, (Math.random() - 0.6) * 0.2] : [0.7 + a[0] * 0.5, 0.35 + a[1]],
        knee: kind === 'back' ? [-a[0] * (1 + Math.random() * 0.8), -a[1] * (1 + Math.random() * 0.8)]
          : kind === 'front' ? [-Math.random() * 1.2, -Math.random() * 0.5] : [-1.1 - Math.random() * 0.4, -0.7 - Math.random() * 0.5],
        splay: [-(0.05 + Math.random() * 0.25), 0.05 + Math.random() * 0.25],
        gun: [side * (0.45 + Math.random() * 0.35), 0.3 + Math.random() * 0.6, Math.random() * Math.PI * 2],
      };
      m.torso.geometry = kind === 'side' ? this._geos.deadSide : this._geos.dead;
      m.pose = 'dead';
      m.rifle.visible = true;
    }
    const t = this.fallT;
    m.root.rotation.y = this.deathYaw ?? this.yaw;
    const k = smooth(t / 0.4), f = smooth((t - 0.12) / 0.88);
    let rx = 0, rz = 0, lift = 0;
    if (R.kind === 'back') { rx = Math.PI / 2; lift = 0.21; rz = R.twist * 0.3; }
    else if (R.kind === 'front') { rx = -Math.PI / 2; lift = 0.17; rz = R.twist * 0.3; }
    else { rx = 0.25; rz = R.side * Math.PI / 2; lift = 0.21; }
    const settle = Math.sin(clamp((t - 0.8) / 0.2, 0, 1) * Math.PI) * 0.035;
    m.body.rotation.set(rx * f, R.twist * f * 0.5, rz * f);
    m.body.position.set(0, lift * f + settle, 0);
    m.hip.position.y = 0.95 - 0.3 * k * (1 - f);
    m.hip.rotation.set(0, 0, 0);
    m.legL.rotation.set(lerp(0.6 * k, R.thigh[0], f), 0, R.splay[0] * f);
    m.legR.rotation.set(lerp(0.45 * k, R.thigh[1], f), 0, R.splay[1] * f);
    m.kneeL.rotation.x = lerp(-1.1 * k, R.knee[0], f);
    m.kneeR.rotation.x = lerp(-0.9 * k, R.knee[1], f);
    m.torso.rotation.set(R.kind === 'side' ? 0.35 * f : 0, R.twist * 0.4 * f, 0);
    // rifle falls from the hands to the ground next to the body
    const along = R.kind === 'back' ? 1 : R.kind === 'front' ? -1 : 0;
    const gx = along ? R.gun[0] : R.side * 1.05, gz = along ? along * (0.55 + R.gun[1]) : -0.3 - R.gun[1] * 0.5;
    const d = smooth(t / 0.75);
    m.rifle.position.set(lerp(0.08, gx, d), 1.45 - 1.41 * d * d, lerp(-0.45, gz, d));
    m.rifle.rotation.set(0, R.gun[2] * d, (Math.PI / 2) * d);
  }

  // Hit test against head sphere + body box. Sets this._head.
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    if (this.state !== 'alive' || this.vehicle) return Infinity;
    const p = this.pos;
    const lx = p.x - ox, ly = p.y + 0.8 - oy, lz = p.z - oz;
    const tc = lx * dx + ly * dy + lz * dz;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
    if (d2 > 1.9 || tc < -1.5 || tc > maxT + 1.5) return Infinity;
    let head, body;
    if (this.stance === 2) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      head = raySphere(ox, oy, oz, dx, dy, dz, p.x + fx * 0.75, p.y + 0.3, p.z + fz * 0.75, 0.17, maxT);
      body = rayAABB(ox, oy, oz, dx, dy, dz, p.x - 0.45, p.y, p.z - 0.45, p.x + 0.45, p.y + 0.42, p.z + 0.45, maxT);
    } else {
      head = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + this.eyeH + 0.06, p.z, 0.15, maxT);
      body = rayAABB(ox, oy, oz, dx, dy, dz, p.x - 0.27, p.y, p.z - 0.27, p.x + 0.27, p.y + this.eyeH - 0.12, p.z + 0.27, maxT);
    }
    if (head <= body) { this._head = head < Infinity; return head; }
    this._head = false;
    return body;
  }

  muzzle(out) {
    // Approximate third-person muzzle position
    const f = dirFromAngles(this.yaw, this.pitch, _v);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    return out.set(
      this.pos.x + f.x * 0.9 + rx * 0.08,
      this.pos.y + this.eyeH - 0.2 + f.y * 0.9,
      this.pos.z + f.z * 0.9 + rz * 0.08,
    );
  }
}
