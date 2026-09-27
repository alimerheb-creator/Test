// Math helpers, noise, and small geometry utilities shared by every module.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

// Yaw convention: yaw 0 faces -Z, positive yaw turns left (counter-clockwise from above).
export function yawTo(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function dirFromAngles(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise in [-1, 1]
export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

export function fbm2(x, y, oct = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise2(x * freq + i * 17.3, y * freq - i * 11.7) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// Squared distance from point to segment in 2D
export function segDist2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 0 ? (wx * vx + wz * vz) / l2 : 0;
  t = clamp(t, 0, 1);
  const dx = ax + vx * t - px, dz = az + vz * t - pz;
  return dx * dx + dz * dz;
}

const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3(1, 0, 0);
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
// Random direction inside a cone of half-angle `angle` around `dir`
export function randomInCone(dir, angle, out) {
  if (angle <= 0) return out.copy(dir);
  const r = Math.tan(angle) * Math.sqrt(Math.random());
  const th = Math.random() * Math.PI * 2;
  const ref = Math.abs(dir.y) < 0.98 ? _up : _side;
  _u.crossVectors(dir, ref).normalize();
  _v.crossVectors(_u, dir);
  return out.copy(dir).addScaledVector(_u, Math.cos(th) * r).addScaledVector(_v, Math.sin(th) * r).normalize();
}

// Ray vs sphere; returns distance or Infinity
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tc = lx * dx + ly * dy + lz * dz;
  if (tc < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const t = tc - Math.sqrt(r2 - d2);
  return t >= 0 && t <= maxT ? t : Infinity;
}

// Ray vs axis-aligned box given by center + half extents; returns distance or Infinity
export function rayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxT) {
  let tmin = 0, tmax = maxT;
  if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return Infinity; } else {
    let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return Infinity; } else {
    let t1 = (minY - oy) / dy, t2 = (maxY - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return Infinity; } else {
    let t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Merge a list of simple box parts into one BufferGeometry with baked vertex colours.
// part: { s:[sx,sy,sz], p:[x,y,z], c:hex, r:[rx,ry,rz]? }
const _col = new THREE.Color();
export function mergeParts(parts) {
  const positions = [], normals = [], colors = [], indices = [];
  let offset = 0;
  for (const part of parts) {
    let g = part.geo ? part.geo.clone() : new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]);
    if (part.r) {
      g.rotateX(part.r[0] || 0);
      g.rotateY(part.r[1] || 0);
      g.rotateZ(part.r[2] || 0);
    }
    g.translate(part.p[0], part.p[1], part.p[2]);
    if (g.index === null) g = g.toNonIndexed();
    const pos = g.attributes.position, nor = g.attributes.normal;
    _col.set(part.c);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(_col.r, _col.g, _col.b);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices.push(g.index.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    }
    offset += pos.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  out.computeBoundingSphere();
  return out;
}

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Tiny event emitter
export class Emitter {
  constructor() { this._l = {}; }
  on(name, fn) { (this._l[name] ||= []).push(fn); return fn; }
  off(name, fn) { const a = this._l[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(name, data) { const a = this._l[name]; if (a) for (const fn of a.slice()) fn(data); }
}

export function loadSettings(defaults) {
  try {
    const raw = localStorage.getItem('sixthfront.settings');
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return { ...defaults };
}

export function saveSettings(s) {
  try { localStorage.setItem('sixthfront.settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}

// Escape text before it goes into innerHTML (names and labels can come from mods)
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}
