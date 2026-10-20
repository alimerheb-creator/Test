// Terrain, sky, lighting, vegetation, static props and the collision/raycast grid.
import * as THREE from 'three';
import { PLAY_HALF, WORLD_HALF, GRID, FLAGS, HQS, BUILDINGS, ROADS, MAP, TERRAIN, VEGETATION, MAP_PROPS } from './config.js';
import { fbm2, smoothstep, lerp, clamp, mulberry32, segDist2, rayAABB } from './util.js';
import { makeTextures, worldUVMaterial } from './textures.js';

// ---------------------------------------------------------------- vegetation shapes
// Small, smooth-shaded shapes with vertex colours for self-shadowing (darker underneath and inside), drawn
// instanced like before, so a forest still costs a handful of draw calls.
const _hash = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };
function mergeParts(parts) {
  const pos = [], nor = [], col = [], idx = [];
  let base = 0;
  for (const g of parts) {
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(C ? C.getX(i) : 1, C ? C.getY(i) : 1, C ? C.getZ(i) : 1);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < P.count; i++) idx.push(i + base);
    base += P.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}
// A pine crown 1 high and 1 wide at the base: four drooping tiers of uneven branches
function pineCrownGeo() {
  const parts = [];
  [[0, 1, 0.42], [0.21, 0.78, 0.4], [0.41, 0.56, 0.36], [0.6, 0.34, 0.4]].forEach(([y0, r, h], tier) => {
    const c = new THREE.ConeGeometry(r, h, 10, 1, true);
    c.translate(0, y0 + h / 2, 0);
    const p = c.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const rim = y < y0 + 1e-4;
      if (rim) {
        const k = 1 + 0.16 * Math.sin(a * 3 + tier * 1.7) + 0.08 * Math.sin(a * 7 + tier);
        p.setXYZ(i, x * k, y - 0.06 - 0.04 * (Math.sin(a * 5 + tier * 2.3) * 0.5 + 0.5), z * k);
      }
      const v = rim ? 0.58 : 0.74 + ((y - y0) / h) * 0.36;
      col.push(v, v * 1.02, v * 0.96);
    }
    c.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    c.computeVertexNormals();
    parts.push(c);
  });
  return mergeParts(parts);
}
// A leafy crown 1 across: a cluster of lumpy lobes, lit from above and darker underneath
function leafCrownGeo(lobes) {
  const parts = [];
  lobes.forEach(([cx, cy, cz, r], li) => {
    const s = new THREE.IcosahedronGeometry(1, 0);
    const p = s.attributes.position, n = [], col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = r * (0.86 + _hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50) + li * 7) * 0.28);
      p.setXYZ(i, cx + x * k, cy + y * k, cz + z * k);
      n.push(x, y, z);
      const v = 0.6 + (y * 0.5 + 0.5) * 0.48 + (cy - 0.5) * 0.12;
      col.push(v, v * 1.02, v * 0.94);
    }
    s.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    s.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    parts.push(s);
  });
  return mergeParts(parts);
}
// A weathered boulder: a lumpy, faceted stone
function rockGeo() {
  const s = new THREE.IcosahedronGeometry(1, 1);
  const p = s.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.78 + _hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40)) * 0.42;
    p.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 1), z * k);
  }
  s.computeVertexNormals();
  return s;
}

// ---------------------------------------------------------------- detailed vegetation (MEDIUM graphics and up)
// Trees made the way real-time trees are made: sprays of fir needles and clusters of leaves painted on cards, many
// cards to a tree around a dark solid heart (so a crown never looks hollow), with soft normals pointing out of the
// crown so it shades like a mass of foliage and not like flat paper. The textures are drawn once, in code.
let _veg = null;
function vegTextures() {
  if (_veg) return _veg;
  const rng = mulberry32(4242);
  const mk = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  // the bottom-left corner of each foliage texture is solid: the trees' dark hearts are coloured from it
  const heart = (x, color) => { x.fillStyle = color; x.fillRect(0, 232, 24, 24); };
  // a fir spray: a twig up the middle, side shoots, needles all along them, the young growth at the tips lighter
  const needles = mk(256, 256, (x) => {
    heart(x, '#22351f');
    x.lineCap = 'round';
    const twig = (x0, y0, ang, len, side) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      x.strokeStyle = '#3a2d21'; x.lineWidth = side ? 1.4 : 2.6;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      const n = Math.floor(len / 2.6);
      for (let i = 1; i <= n; i++) {
        const t = i / n, px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t, nl = (side ? 9 : 12) * (1 - t * 0.3) + rng() * 3;
        for (const sd of [-1, 1]) {
          const a = ang + sd * (0.85 + rng() * 0.35);
          x.strokeStyle = 'hsl(' + (98 + rng() * 26) + ',' + (36 + rng() * 18) + '%,' + (14 + t * 13 + rng() * 9) + '%)';
          x.lineWidth = 1.5 + rng() * 0.6;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); x.stroke();
        }
      }
      if (!side) for (let i = 1; i < 7; i++) { const t = i / 7.4; for (const sd of [-1, 1]) twig(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ang + sd * (0.7 + rng() * 0.2), len * (0.46 - t * 0.26), 1); }
    };
    twig(128, 252, -Math.PI / 2, 238, 0);
  });
  // a cluster of leaves on their twigs, each leaf with a lighter midrib
  const leaves = mk(256, 256, (x) => {
    heart(x, '#2a4123');
    x.strokeStyle = '#4b3b2b'; x.lineWidth = 2.4; x.lineCap = 'round';
    for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(128, 252); x.quadraticCurveTo(128 + (rng() - 0.5) * 90, 170, 34 + rng() * 188, 24 + rng() * 130); x.stroke(); }
    for (let i = 0; i < 95; i++) {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * 110, cx = 128 + Math.cos(a) * r, cy = 116 + Math.sin(a) * r * 0.96;
      if (cy > 226 && cx < 34) continue;
      const rx = 8 + rng() * 7, ry = 3.6 + rng() * 3.4, rot = rng() * 3.14;
      const l = 18 + rng() * 20 + (1 - cy / 256) * 12;
      x.fillStyle = 'hsl(' + (76 + rng() * 36) + ',' + (34 + rng() * 22) + '%,' + l + '%)';
      x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, 6.283); x.fill();
      x.strokeStyle = 'hsla(' + (80 + rng() * 20) + ',40%,' + (l + 15) + '%,0.55)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx - Math.cos(rot) * rx * 0.8, cy - Math.sin(rot) * rx * 0.8); x.lineTo(cx + Math.cos(rot) * rx * 0.8, cy + Math.sin(rot) * rx * 0.8); x.stroke();
    }
  });
  // bark: deep vertical fissures, grey-brown ridges, lighter flecks
  const bark = mk(64, 256, (x, w, h) => {
    x.fillStyle = '#5d4c3e'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) {
      let px = rng() * w, y = 0;
      x.strokeStyle = 'rgba(' + (28 + rng() * 22) + ',' + (22 + rng() * 16) + ',' + (16 + rng() * 12) + ',' + (0.5 + rng() * 0.4) + ')';
      x.lineWidth = 1 + rng() * 2.6; x.beginPath(); x.moveTo(px, 0);
      while (y < h) { y += 8 + rng() * 14; px += (rng() - 0.5) * 4; x.lineTo(px, y); }
      x.stroke();
    }
    for (let i = 0; i < 90; i++) { x.fillStyle = 'rgba(' + (130 + rng() * 40) + ',' + (122 + rng() * 30) + ',' + (100 + rng() * 30) + ',' + rng() * 0.2 + ')'; x.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 3 + rng() * 10); }
  });
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  bark.repeat.set(2, 3);
  _veg = { needles, leaves, bark };
  return _veg;
}
const _n3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const _x3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function vegBuilder() {
  const B = { pos: [], nor: [], col: [], uv: [], idx: [] };
  // a card from o out along a (length len), r across it (width w); one soft normal for all of it
  B.quad = (o, a, r, w, len, n, cIn, cOut) => {
    const b = B.pos.length / 3, hw = w / 2;
    const v = [[-hw, 0, 0, 0, cIn], [hw, 0, 1, 0, cIn], [hw, len, 1, 1, cOut], [-hw, len, 0, 1, cOut]];
    for (const [k, l, u, vv, c] of v) {
      B.pos.push(o[0] + r[0] * k + a[0] * l, o[1] + r[1] * k + a[1] * l, o[2] + r[2] * k + a[2] * l);
      B.nor.push(n[0], n[1], n[2]); B.col.push(c, c, c); B.uv.push(u, vv);
    }
    B.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // a closed shape coloured from the textures' solid corner
  B.solid = (geo, color) => {
    const P = geo.attributes.position, N = geo.attributes.normal, b = B.pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      B.pos.push(P.getX(i), P.getY(i), P.getZ(i)); B.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      const c = color(P.getX(i), P.getY(i), P.getZ(i)); B.col.push(c, c, c); B.uv.push(0.045, 0.045);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) B.idx.push(geo.index.getX(i) + b);
    else for (let i = 0; i < P.count; i++) B.idx.push(i + b);
    geo.dispose();
  };
  B.done = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    g.setIndex(B.idx);
    return g;
  };
  return B;
}
// A fir in the crown's own units (1 high, radius 1 at the bottom whorl; the instance squashes it into a tall spire):
// whorls of drooping branches, each a flat spray and an upright one along it, round a dark core, and a leader on top
function pineCardGeo() {
  const rng = mulberry32(77), B = vegBuilder();
  const core = new THREE.ConeGeometry(0.46, 0.9, 9, 1, true); core.translate(0, 0.5, 0);
  B.solid(core, (x, y) => 0.36 + y * 0.32);
  const tiers = 8;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = 0.03 + f * 0.85, R = 0.14 + (1 - f) * 0.96;
    const n = 8 - Math.round(f * 4);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + t * 1.3 + (rng() - 0.5) * 0.5, ca = Math.cos(ang), sa = Math.sin(ang);
      const a = _n3([ca, -0.035 - rng() * 0.035, sa]), r = [-sa, 0, ca];
      const len = R * (0.85 + rng() * 0.3), w = len * 0.66 + 0.06;
      const nrm = _n3([ca, 0.45, sa]), ao = 0.5 + 0.5 * f;
      const o = [ca * 0.03, y, sa * 0.03];
      B.quad(o, a, r, w, len, nrm, ao * 0.6, ao);
      B.quad(o, a, [0, 1, 0], w * 0.16, len * 0.9, nrm, ao * 0.55, ao * 0.95);
    }
  }
  for (const ang of [0, Math.PI / 2]) B.quad([0, 0.83, 0], [0, 1, 0], [Math.cos(ang), 0, Math.sin(ang)], 0.24, 0.2, [0, 1, 0], 0.85, 1);
  return B.done();
}
// A broadleaf crown: for every lobe a dark heart and a shell of leaf clusters facing out of it
function leafCardGeo(lobes, density = 1) {
  const rng = mulberry32(91), B = vegBuilder();
  let cx = 0, cy = 0, cz = 0;
  for (const l of lobes) { cx += l[0] / lobes.length; cy += l[1] / lobes.length; cz += l[2] / lobes.length; }
  for (const [lx, ly, lz, r] of lobes) {
    const core = new THREE.IcosahedronGeometry(r * 0.56, 1); core.translate(lx, ly, lz);
    B.solid(core, (x, y) => 0.4 + clamp((y - cy) * 0.4 + 0.2, 0, 0.3));
    const n = Math.round((20 + r * 52) * density);
    for (let k = 0; k < n; k++) {
      const z0 = rng() * 2 - 1, az = rng() * 6.283, rr = Math.sqrt(1 - z0 * z0);
      const d = [rr * Math.cos(az), z0 < -0.35 && rng() < 0.5 ? -z0 : z0, rr * Math.sin(az)];
      const s = r * (0.72 + rng() * 0.38), dist = r * (0.6 + rng() * 0.32);
      const c = [lx + d[0] * dist, ly + d[1] * dist, lz + d[2] * dist];
      const t1 = _n3(_x3(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t2 = _x3(d, t1);
      const rot = rng() * 6.283, ca = Math.cos(rot), sa = Math.sin(rot);
      const a = [t1[0] * ca + t2[0] * sa, t1[1] * ca + t2[1] * sa, t1[2] * ca + t2[2] * sa];
      const rv = [-t1[0] * sa + t2[0] * ca, -t1[1] * sa + t2[1] * ca, -t1[2] * sa + t2[2] * ca];
      const o = [c[0] - a[0] * s / 2, c[1] - a[1] * s / 2, c[2] - a[2] * s / 2];
      const nrm = _n3([c[0] - cx + d[0] * r, c[1] - cy + d[1] * r + 0.35, c[2] - cz + d[2] * r]);
      const ao = 0.5 + 0.5 * clamp((c[1] - cy) * 0.7 + 0.5, 0, 1) * (0.75 + 0.25 * (dist / r));
      B.quad(o, a, rv, s, s, nrm, ao, ao);
    }
  }
  return B.done();
}
// A boulder with some character: weathered lumps and ridges, darker cracks, lichen on top and moss at its foot
function rockGeoHD() {
  const ico = new THREE.IcosahedronGeometry(1, 2), P = ico.attributes.position;
  // the icosahedron comes unwelded: weld it so it shades smooth
  const key = new Map(), pos = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4);
    let j = key.get(k);
    if (j === undefined) { j = pos.length / 3; key.set(k, j); pos.push(P.getX(i), P.getY(i), P.getZ(i)); }
    idx.push(j);
  }
  ico.dispose();
  const rng = mulberry32(5150), W = [];
  for (let i = 0; i < 9; i++) { const d = _n3([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]), fr = 1.2 + rng() * 4.5; W.push([d, fr, (0.3 / fr) * (0.6 + rng() * 0.8), rng() * 6.283, rng() < 0.45]); }
  const disp = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    let dd = 0;
    for (const [d, fr, am, ph, ridge] of W) { const v = Math.sin((d[0] * x + d[1] * y + d[2] * z) * fr + ph); dd += am * (ridge ? 1 - Math.abs(v) * 2 : v); }
    disp.push(dd);
    const k = (1 + dd) * (0.95 + _hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) * 0.1);
    pos[i] = x * k; pos[i + 1] = y * k * (y < 0 ? 0.62 : 1); pos[i + 2] = z * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const N = g.attributes.normal, col = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1], ny = N.getY(i), d = disp[i];
    let r = clamp(0.84 + d * 1.3, 0.45, 1), gg = r * 0.98, b = r * 0.93;
    const n2 = Math.sin(pos[i * 3] * 7.1 + pos[i * 3 + 2] * 5.3) * Math.sin(y * 6.7 + pos[i * 3] * 2.1);
    if (ny > 0.45 && n2 > 0.15) { const k = Math.min(1, (n2 - 0.15) * 2.2) * 0.7; r = lerp(r, 0.66, k); gg = lerp(gg, 0.7, k); b = lerp(b, 0.44, k); }
    if (y < -0.25) { const k = Math.min(1, (-0.25 - y) * 2.2) * 0.6; r = lerp(r, 0.32, k); gg = lerp(gg, 0.4, k); b = lerp(b, 0.24, k); }
    col.push(r, gg, b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A tiling wave map for the sea: the slopes (red east-west, green north-south) of a few dozen sine waves running
// mostly with the wind, the short ones nearly as steep as the long ones, so it repeats seamlessly and mip-maps cleanly
function waveTexture(n, renderer) {
  const rng = mulberry32(7331), W = [];
  for (let i = 0; i < 44; i++) {
    const k = 1 + Math.floor(Math.pow(rng(), 1.5) * 24), a = (rng() - 0.5) * 2.3;
    const kx = Math.round(Math.cos(a) * k), ky = Math.round(Math.sin(a) * k);
    if (!kx && !ky) continue;
    W.push([kx * Math.PI * 2, ky * Math.PI * 2, Math.pow(Math.hypot(kx, ky), -1.3), rng() * Math.PI * 2]);
  }
  const sx = new Float32Array(n * n), sy = new Float32Array(n * n);
  let ss = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = i / n, v = j / n;
      let dx = 0, dy = 0;
      for (const [kx, ky, amp, ph] of W) { const c = amp * Math.cos(kx * u + ky * v + ph); dx += kx * c; dy += ky * c; }
      sx[j * n + i] = dx; sy[j * n + i] = dy; ss += dx * dx + dy * dy;
    }
  }
  const scale = 0.5 / Math.sqrt(ss / (n * n)), data = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    data[k * 4] = clamp(128 + sx[k] * scale * 127, 0, 255);
    data[k * 4 + 1] = clamp(128 + sy[k] * scale * 127, 0, 255);
    data[k * 4 + 2] = 255; data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

// Terrain grid: fine spacing in the battle zone, coarse spacing out to the horizon mountains. The layout
// depends on the map's size, so it is worked out when the world is built.
let INNER = 280, FINE = 2.5, COARSE = 14, N_OUT = 20, N_IN = 224, N = 265;
function layoutGrid() {
  INNER = GRID.inner; FINE = (2 * INNER) / Math.round((2 * INNER) / GRID.fine);
  N_OUT = Math.max(1, Math.round((WORLD_HALF - INNER) / GRID.coarse));
  COARSE = (WORLD_HALF - INNER) / N_OUT;
  N_IN = Math.round((2 * INNER) / FINE);
  N = N_OUT * 2 + N_IN + 1;
}

function axisCoord(i) {
  if (i < N_OUT) return -WORLD_HALF + i * COARSE;
  if (i < N_OUT + N_IN) return -INNER + (i - N_OUT) * FINE;
  return INNER + (i - N_OUT - N_IN) * COARSE;
}
function axisU(v) {
  if (v < -INNER) return (v + WORLD_HALF) / COARSE;
  if (v < INNER) return N_OUT + (v + INNER) / FINE;
  return N_OUT + N_IN + (v - INNER) / COARSE;
}

// Collision grid (it covers the play area)
const CELL = 8;
let GRID_HALF = 320, GN = Math.ceil((GRID_HALF * 2) / CELL);

export const SUN_DIR = new THREE.Vector3(-0.78, 0.42, -0.36).normalize();

export const ATMOSPHERE_PRESETS = {
  dusk: {
    skyTop: '#587a9e', horizon: '#d2bf9f', ground: '#a08f78', sunColor: '#ffd29a', sunLight: '#ffdcb0', sunIntensity: 3.0,
    hemiSky: '#c8d4e0', hemiGround: '#6b5a45', hemiIntensity: 0.8, fogNear: 70, fogFar: 720, clouds: 0.55,
    cloudColor: '#c8bdb3', cloudLit: '#ffebd1', stars: 0, sunElevation: 26, sunAzimuth: -115, exposure: 1.05, envIntensity: 0.55,
  },
  noon: {
    skyTop: '#3f78bd', horizon: '#bcd0dc', ground: '#9a9180', sunColor: '#fff4e0', sunLight: '#fff3e2', sunIntensity: 3.4,
    hemiSky: '#cfe0ee', hemiGround: '#6f6250', hemiIntensity: 1.0, fogNear: 110, fogFar: 950, clouds: 0.45,
    cloudColor: '#dfe4ea', cloudLit: '#ffffff', stars: 0, sunElevation: 62, sunAzimuth: -140, exposure: 0.95, envIntensity: 0.6,
  },
  overcast: {
    skyTop: '#858f98', horizon: '#a7acae', ground: '#7a786f', sunColor: '#d9dde0', sunLight: '#d9dde0', sunIntensity: 1.1,
    hemiSky: '#bcc4cc', hemiGround: '#5f5b52', hemiIntensity: 1.5, fogNear: 35, fogFar: 520, clouds: 0.95,
    cloudColor: '#8d9398', cloudLit: '#b9bec2', stars: 0, sunElevation: 45, sunAzimuth: -120, exposure: 1.1, envIntensity: 0.7,
    viewmodelLight: 0.85,
  },
  night: {
    skyTop: '#060a14', horizon: '#2a3550', ground: '#101318', sunColor: '#a9bde0', sunLight: '#9db4e6', sunIntensity: 1.4,
    hemiSky: '#5f76a3', hemiGround: '#1c1e22', hemiIntensity: 1.2, fogNear: 45, fogFar: 560, clouds: 0.3,
    cloudColor: '#1b2232', cloudLit: '#56648a', stars: 1, sunElevation: 38, sunAzimuth: 60, exposure: 1.6, envIntensity: 0.35,
    viewmodelLight: 0.55,
  },
};

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tex = makeTextures();
    this.boxes = [];
    layoutGrid();
    GRID_HALF = Math.max(320, PLAY_HALF + 80);
    GN = Math.ceil((GRID_HALF * 2) / CELL);
    this.cells = new Array(GN * GN);
    this.stamp = 1;
    this.flatZones = [];
    this.trees = [];
    this.maxHeight = 0;
    this.hit = { hit: false, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, box: null, terrain: false };
    this._tmp = [];
    this.rng = mulberry32(90210);
  }

  build() {
    this._setupZones();
    this._buildHeightfield();
    this._buildTerrainMesh();
    this._buildSky();
    this._buildLights();
    if (this.water !== null) this._buildWater();
    this._buildVegetation();
    this._buildProps();
  }

  // ---------------------------------------------------------------- terrain
  _raw(x, z) {
    const T = TERRAIN, s = T.seed * 0.1371;
    let h = fbm2(x * 0.0055 + 13.1 + s, z * 0.0055 - 7.7 - s * 0.7, 4) * 16 * T.hills;
    h += fbm2(x * 0.021 + s * 1.3, z * 0.021 + 31 - s, 3) * 2.6 * T.bumps;
    h -= Math.exp(-(x * x) / (2 * 110 * 110)) * 3 * T.valley;
    const e = Math.max(Math.abs(x), Math.abs(z));
    const m = smoothstep(PLAY_HALF - 5, PLAY_HALF + 160, e);
    h += m * (30 + (fbm2(x * 0.008 - 3 + s, z * 0.008 + 9, 5) * 0.5 + 0.5) * 80) * T.mountains;
    if (T.level) h += T.level;
    // islands [x, z, radius, height, cliff]: a raised mound with a ragged coastline and a hilly top; with a cliff
    // (0..1, how far out the top reaches before the edge drops) it is a flat-topped mesa with sheer sides
    for (const isl of T.islands || []) {
      const dx = x - isl[0], dz = z - isl[1], r = isl[2];
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r * 2.2) continue;
      const d = Math.sqrt(d2) * (1 + 0.28 * fbm2(x * 0.012 + isl[0] * 0.01, z * 0.012 - isl[1] * 0.01, 3));
      const k = 1 - smoothstep(r * (isl[4] || 0.25), r, d);
      h += k * k * (3 - 2 * k) * isl[3];
    }
    // gorges: a canyon cut down to its floor along a winding path, its walls ragged and their foot widening and
    // narrowing as it goes
    for (const gz of T.gorges || []) {
      const hw = gz.width / 2, P = gz.path;
      let d2 = Infinity;
      for (let i = 0; i < P.length - 1; i++) d2 = Math.min(d2, segDist2(x, z, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]));
      if (d2 > hw * hw * 2.6) continue;
      const d = Math.sqrt(d2) + fbm2(x * 0.017 + 7, z * 0.017 - 3, 3) * hw * 0.32;
      const k = 1 - smoothstep(hw * gz.wall, hw, d);
      if (k > 0) h = Math.min(h, lerp(h, gz.floor + fbm2(x * 0.05, z * 0.05, 2) * 1.5, k * k * (3 - 2 * k)));
    }
    return h;
  }

  // Sea level, or null for a map without water
  get water() { return TERRAIN.water === null || TERRAIN.water === undefined ? null : TERRAIN.water; }
  isWater(x, z) { const w = this.water; return w !== null && this.heightAt(x, z) < w; }

  _setupZones() {
    for (const f of FLAGS) {
      this.flatZones.push({ x: f.x, z: f.z, r0: f.flat, r1: f.flat + 34, h: this._raw(f.x, f.z), town: f.town ? 1 : 0.7 });
    }
    for (const q of HQS) this.flatZones.push({ x: q.x, z: q.z, r0: 36, r1: 70, h: this._raw(q.x, q.z), town: 0.8 });
    for (const b of BUILDINGS) {
      const inFlag = FLAGS.some((f) => Math.hypot(b[0] - f.x, b[1] - f.z) < f.flat - 8);
      if (inFlag) continue;
      const half = (Math.max(b[2], b[3]) * 2.5) / 2;
      this.flatZones.push({ x: b[0], z: b[1], r0: half + 7, r1: half + 26, h: this._raw(b[0], b[1]), town: 0.45 });
    }
  }

  _heightFn(x, z) {
    let h = this._raw(x, z);
    for (const f of this.flatZones) {
      const dx = x - f.x, dz = z - f.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > f.r1 * f.r1) continue;
      h = lerp(h, f.h, 1 - smoothstep(f.r0, f.r1, Math.sqrt(d2)));
    }
    return h;
  }

  _buildHeightfield() {
    this.heights = new Float32Array(N * N);
    let maxH = -Infinity;
    for (let j = 0; j < N; j++) {
      const z = axisCoord(j);
      for (let i = 0; i < N; i++) {
        const h = this._heightFn(axisCoord(i), z);
        this.heights[j * N + i] = h;
        if (h > maxH) maxH = h;
      }
    }
    this.maxHeight = maxH + 1;
  }

  heightAt(x, z) {
    let u = axisU(x), w = axisU(z);
    if (u < 0) u = 0; else if (u > N - 1.0001) u = N - 1.0001;
    if (w < 0) w = 0; else if (w > N - 1.0001) w = N - 1.0001;
    const i = u | 0, j = w | 0, fu = u - i, fw = w - j;
    const H = this.heights, k = j * N + i;
    const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
    return a + (b - a) * fu + (c - a) * fw + (a - b - c + d) * fu * fw;
  }

  normalAt(x, z, out) {
    const e = 0.8;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  _buildTerrainMesh() {
    const count = N * N;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let j = 0; j < N; j++) {
      const z = axisCoord(j);
      for (let i = 0; i < N; i++) {
        const k = j * N + i, x = axisCoord(i);
        pos[k * 3] = x; pos[k * 3 + 1] = this.heights[k]; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
      }
    }
    const idx = new Uint32Array((N - 1) * (N - 1) * 6);
    let p = 0;
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const nor = geo.attributes.normal.array;
    const col = new Float32Array(count * 3);
    // farmland: open, level ground away from towns, roads, water and rock
    const FIELDS = TERRAIN.fields, farm = FIELDS ? new Float32Array(count) : null;
    // the ground's colours (a map can repaint them: desert sand, snow, ...)
    const P = TERRAIN.palette || {};
    const grassA = new THREE.Color(P.grass || 0x7a7446), grassB = new THREE.Color(P.grass2 || 0x5b6538), dirt = new THREE.Color(P.dirt || 0x8e7657);
    const rock = new THREE.Color(P.rock || 0x77706a), rockHi = new THREE.Color(P.peak || 0x9a948c), town = new THREE.Color(P.town || 0x9b8b70);
    const road = new THREE.Color(P.road || 0x5f574d), sand = new THREE.Color(P.sand || 0xc2b087), seabed = new THREE.Color(P.seabed || 0x3f4a3f);
    const c = new THREE.Color();
    const segs = [];
    for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) segs.push([r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]]);
    for (let k = 0; k < count; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const slope = 1 - nor[k * 3 + 1];
      c.copy(grassA).lerp(grassB, clamp(0.5 + fbm2(x * 0.035, z * 0.035, 3), 0, 1));
      c.lerp(dirt, smoothstep(0.08, 0.4, fbm2(x * 0.011 + 40, z * 0.011 - 20, 3)) * 0.8);
      for (const f of this.flatZones) {
        const d = Math.hypot(x - f.x, z - f.z);
        if (d < f.r0 + 8) c.lerp(town, (1 - smoothstep(f.r0 * 0.6, f.r0 + 8, d)) * f.town * 0.85);
      }
      if (Math.abs(x) < PLAY_HALF + 40 && Math.abs(z) < PLAY_HALF + 40) {
        let dm = Infinity;
        for (const s of segs) { const d2 = segDist2(x, z, s[0], s[1], s[2], s[3]); if (d2 < dm) dm = d2; }
        c.lerp(road, (1 - smoothstep(2.4, 4.6, Math.sqrt(dm))) * 0.9);
      }
      c.lerp(rock, smoothstep(0.16, 0.38, slope));
      c.lerp(rockHi, smoothstep(50, 100, y) * 0.55);
      if (this.water !== null) {
        // wet sand at the waterline, dark sea floor below it
        c.lerp(sand, (1 - smoothstep(0.4, 2.6, y - this.water)) * 0.85);
        c.lerp(seabed, smoothstep(0, 6, this.water - y));
      }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      if (farm) {
        let f = smoothstep(0.035, 0.012, slope) * smoothstep(80, 60, y);
        if (this.water !== null) f *= smoothstep(1.5, 4, y - this.water);
        for (const z0 of this.flatZones) if (z0.town > 0.5) f *= smoothstep(z0.r0 * 0.8, z0.r1 + 30, Math.hypot(x - z0.x, z0.z - z));
        if (Math.abs(x) < PLAY_HALF + 40 && Math.abs(z) < PLAY_HALF + 40) {
          let dm = Infinity;
          for (const s of segs) { const d2 = segDist2(x, z, s[0], s[1], s[2], s[3]); if (d2 < dm) dm = d2; }
          f *= smoothstep(4, 9, Math.sqrt(dm));
        }
        farm[k] = f;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (farm) geo.setAttribute('farm', new THREE.BufferAttribute(farm, 1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.tex.ground, normalMap: this.tex.groundN, roughness: 0.96, metalness: 0 });
    mat.normalScale.set(0.9, 0.9);
    // cliffs: steep ground takes its texture from the side instead of smearing it down the face, and shows
    // layers of rock, wavering and broken by cracks
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTWorld; varying vec3 vTNrm;' + (FIELDS ? '\nattribute float farm; varying float vFarm;' : ''))
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vTNrm = normal;' + (FIELDS ? ' vFarm = farm;' : ''));
      if (FIELDS) {
        const cols = FIELDS.colors.map((c) => new THREE.Color(c));
        while (cols.length < 8) cols.push(cols[cols.length % FIELDS.colors.length].clone());
        const a = (FIELDS.angle * Math.PI) / 180;
        sh.uniforms.uField = { value: cols };
        sh.uniforms.uFieldN = { value: FIELDS.colors.length };
        sh.uniforms.uFieldRot = { value: new THREE.Vector4(Math.cos(a), -Math.sin(a), Math.sin(a), Math.cos(a)) };
        sh.uniforms.uFieldSize = { value: FIELDS.size };
        sh.uniforms.uHedge = { value: new THREE.Color(FIELDS.hedge) };
      }
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vTWorld; varying vec3 vTNrm;
          ${FIELDS ? '#define T_FIELDS\n varying float vFarm; uniform vec3 uField[8]; uniform float uFieldN; uniform vec4 uFieldRot; uniform float uFieldSize; uniform vec3 uHedge;' : ''}
          float tHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float tNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `
          vec3 tn = normalize(vTNrm);
          float steep = smoothstep(0.42, 0.8, 1.0 - tn.y);
          vec2 bw = abs(tn.xz); bw /= bw.x + bw.y + 1e-4;
          vec2 sideW = bw.x > bw.y ? vTWorld.zy : vTWorld.xy;
          vec2 sideUv = sideW / vec2(9.0, 5.6);
          vec4 sideTex = texture2D(map, vTWorld.zy / vec2(9.0, 5.6)) * bw.x + texture2D(map, vTWorld.xy / vec2(9.0, 5.6)) * bw.y;
          vec4 topTex = texture2D(map, vMapUv);
          diffuseColor *= mix(topTex, sideTex, steep);
          #ifdef T_FIELDS
          if (vFarm > 0.01) {
            // farmland: plots in rows on a grid turned to the land, each its own crop, ploughed in furrows, with
            // hedgerows along some of their edges
            vec2 fp = mat2(uFieldRot.x, uFieldRot.y, uFieldRot.z, uFieldRot.w) * vTWorld.xz / vec2(uFieldSize, uFieldSize * 0.62);
            fp.x += tHash(vec2(floor(fp.y), 3.7)) * 1.7;
            vec2 cell = floor(fp), ff = fract(fp);
            float split = step(0.5, tHash(cell + 7.1));
            float sub = floor(ff.x * (1.0 + split * 2.0));
            ff.x = fract(ff.x * (1.0 + split * 2.0));
            float hh = tHash(cell + vec2(sub * 0.37, sub * 1.3));
            vec3 fc = uField[int(min(floor(hh * uFieldN), 7.0))];
            float fur = 0.9 + 0.1 * sin((ff.x + hh) * 6.2831 * (10.0 + hh * 14.0));
            float ex = min(ff.x, 1.0 - ff.x) * uFieldSize / (1.0 + split * 2.0), ez = min(ff.y, 1.0 - ff.y) * uFieldSize * 0.62;
            float hedge = (1.0 - smoothstep(1.0, 2.6, min(ex, ez))) * step(0.35, tHash(cell + 1.3));
            float lane = 1.0 - smoothstep(0.4, 1.2, ez);
            vec3 fcol = fc * fur * (0.75 + dot(topTex.rgb, vec3(0.3))) * (1.0 - lane * 0.12);
            fcol = mix(fcol, uHedge, hedge * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, fcol, vFarm * (1.0 - steep));
          }
          #endif
          float wob = tNoise(vTWorld.xz * 0.02) * 6.0 + tNoise(vTWorld.xz * 0.11) * 1.5;
          float yy = vTWorld.y + wob;
          float band = tNoise(vec2(yy * 0.45, 0.5)) * 0.6 + tNoise(vec2(yy * 1.7, 3.1)) * 0.4;
          float crack = smoothstep(0.67, 0.7, tNoise(sideW * vec2(0.45, 0.07)));
          float fiss = smoothstep(0.74, 0.8, tNoise(sideW * vec2(0.9, 0.045) + 17.0));
          // ledges of harder rock every few metres: a lit lip, and a shadow under it
          float lf = fract(yy / 7.3 + tNoise(sideW * 0.03) * 0.7);
          float lip = smoothstep(0.0, 0.05, lf) * (1.0 - smoothstep(0.05, 0.14, lf));
          float under = smoothstep(0.84, 1.0, lf);
          // big patches of warmer and cooler rock, and moss where the face is a little less sheer
          float tone = tNoise(sideW * 0.011) * 0.65 + tNoise(sideW * 0.047) * 0.35;
          vec3 rockMul = mix(vec3(0.88, 0.94, 1.03), vec3(1.1, 0.99, 0.84), tone) * (0.7 + band * 0.58);
          rockMul *= (1.0 - crack * 0.3 - fiss * 0.22) * (1.0 + lip * 0.2 - under * 0.3);
          float moss = smoothstep(0.58, 0.82, tNoise(sideW * 0.085 + 5.0)) * (1.0 - smoothstep(0.55, 0.9, 1.0 - tn.y)) * steep;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * rockMul, steep);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.22, 0.11), moss * 0.5);`)
        .replace('#include <normal_fragment_begin>', 'vec2 tNUv = steep > 0.5 ? sideUv : vNormalMapUv;\n' + THREE.ShaderChunk.normal_fragment_begin.replaceAll('vNormalMapUv', 'tNUv'))
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv', 'tNUv'));
    };
    mat.customProgramCacheKey = () => (FIELDS ? 'terrain-fields' : 'terrain-cliffs');
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  // The sea. Its own shader: waves from a tiling wave map at three scales drifting with the wind, the sky and its
  // clouds mirrored by the Fresnel law (little straight down, almost all of it at a glancing angle), the sun's
  // glitter path, the hills and cliffs mirrored too (traced through a height map of the land), turquoise
  // shallows and surf along the shore, and the fog.
  _buildWater() {
    const land = this._landTexture();
    const sky = this.skyMat.uniforms;
    const q = this.game.settings.quality, Q = q === 'low' ? 0 : 1;
    const P = TERRAIN.palette || {};
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        tWaves: { value: waveTexture(256, this.game.renderer) }, tLand: { value: land.tex }, landRect: { value: land.rect },
        time: { value: 0 }, sea: { value: this.water },
        sunLight: { value: new THREE.Color() }, sunPower: { value: 3 }, ambient: { value: new THREE.Color() },
        deep: { value: new THREE.Color(P.sea || 0x175a7a) }, shallow: { value: new THREE.Color(P.shallows || 0x35a8a0) },
        rock: { value: new THREE.Color(P.rock || 0x77706a) },
      },
      vertexShader: `varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D tWaves; uniform sampler2D tLand; uniform vec4 landRect;
        uniform float time; uniform float sea; uniform vec3 sunLight; uniform float sunPower; uniform vec3 ambient;
        uniform vec3 deep; uniform vec3 shallow; uniform vec3 rock;
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform vec3 cloudLo; uniform vec3 cloudHi; uniform float cloudAmount;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hsh(i),hsh(i+vec2(1.0,0.0)),f.x), mix(hsh(i+vec2(0.0,1.0)),hsh(i+vec2(1.0,1.0)),f.x), f.y); }
        // the sky as the sky dome draws it (gradient, sun glow and clouds), without the sun's disc
        vec3 skyAt(vec3 d){
          float h = max(d.y, 0.0);
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.6, h));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 48.0) * 0.4 + pow(s, 5.0) * 0.14);
          vec2 uv = d.xz / (h + 0.18) * 1.6;
          float c = vn(uv) * 0.55 + vn(uv * 2.3 + 4.0) * 0.3 + vn(uv * 5.1) * 0.15;
          c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.3, h);
          return mix(col, mix(cloudLo, cloudHi, s), c * cloudAmount);
        }
        // r: how deep the sea bed is here (0..16 m), g: how high the land stands above the sea (0..400 m)
        vec2 landAt(vec2 xz){ return texture2D(tLand, (xz - landRect.xy) * landRect.zw).rg; }
        void main(){
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          vec2 p = vWorld.xz;
          // waves: big swells, chop and ripples drifting different ways; the fine ones fade out with distance
          float far = smoothstep(30.0, 900.0, dist);
          vec2 w1 = texture2D(tWaves, p * 0.0071 + time * vec2(0.0042, 0.0023)).xy * 2.0 - 1.0;
          vec2 w2 = texture2D(tWaves, p * 0.019 + time * vec2(-0.0081, 0.0063)).xy * 2.0 - 1.0;
          vec2 w3 = texture2D(tWaves, p * 0.113 + time * vec2(0.023, -0.028)).xy * 2.0 - 1.0;
          vec2 slope = (w1 * 0.3 + w2 * 0.24 + w3 * 0.2 * (1.0 - far)) * mix(1.0, 0.55, far);
          vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
          vec2 L = landAt(p);
          float depth = L.r * 16.0;
          // Fresnel: water reflects 2% looking straight down and nearly everything at a glancing angle
          float NdV = max(dot(N, V), 0.0);
          float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y) + 0.002;
          vec3 refl = skyAt(R);
          #if WATER_Q > 0
          // the land mirrored: march the reflected ray over the height map and see how far it passes under the
          // ground (softly, so the edge of a mirrored cliff doesn't come out in steps)
          float hit = 0.0, hitT = 0.0;
          for (int i = 1; i <= 6; i++) {
            float t = float(i * i) * 9.0;
            vec3 qp = vWorld + R * t;
            float o = smoothstep(-5.0, 7.0, landAt(qp.xz).g * 400.0 - (qp.y - sea));
            if (o > hit) { hit = o; hitT = t; }
          }
          // a cliff facing back along the ray, lit by the sun if it faces it
          vec3 face = normalize(vec3(-R.x, 0.001, -R.z));
          vec3 landCol = rock * (ambient * 0.85 + sunLight * sunPower * 0.3 * max(dot(face, sunDir), 0.0));
          #ifdef USE_FOG
          landCol = mix(landCol, horizon, smoothstep(fogNear, fogFar, dist + hitT) * 0.9);
          #endif
          refl = mix(refl, landCol, hit * 0.92);
          #endif
          // the water itself: deep blue-green, turquoise over sand, lit by the sky and the sun
          float shallowK = 1.0 - smoothstep(0.4, 10.0, depth);
          vec3 body = mix(deep, shallow, shallowK * 0.85);
          body *= ambient * 0.75 + sunLight * sunPower * max(sunDir.y, 0.05) * 0.16;
          // sunlight through the crest of a wave between you and the sun
          float sss = pow(max(dot(-V, sunDir) * 0.5 + 0.5, 0.0), 6.0) * max(dot(N.xz, -sunDir.xz), 0.0);
          body += shallow * sunLight * sss * 0.35;
          vec3 col = mix(body, refl, F);
          // the sun on the water: hard glints close in, a wide glittering path far out
          vec3 H = normalize(sunDir + V);
          float NdH = max(dot(N, H), 0.0);
          float sharp = mix(2200.0, 380.0, far);
          float spec = (pow(NdH, sharp) * mix(30.0, 22.0, far) + pow(NdH, 160.0) * 0.14) * mix(0.4, 1.0, smoothstep(40.0, 260.0, dist)) + pow(NdH, 28.0) * 0.025;
          col += sunColor * sunLight * spec * sunPower * 0.32 * smoothstep(-0.02, 0.1, sunDir.y);
          // surf along the shore, breaking up and rolling in
          float edge = 1.0 - smoothstep(0.0, 2.2, depth);
          float fn = vn(p * 0.31 + vec2(time * 0.21, -time * 0.13)) * 0.6 + vn(p * 1.17 - vec2(time * 0.37, time * 0.29)) * 0.4;
          float roll = 0.5 + 0.5 * sin(depth * 5.0 - time * 1.7 + fn * 3.0);
          float foam = smoothstep(0.55, 0.85, fn * 0.7 + edge * 0.55 + roll * 0.25 * edge) * edge;
          foam = max(foam, smoothstep(0.82, 1.0, fn) * (1.0 - smoothstep(2.2, 6.0, depth)) * 0.6);
          col = mix(col, (ambient + sunLight * sunPower * 0.22 * max(sunDir.y, 0.1)) * 0.9, foam * 0.85);
          float alpha = mix(0.62, 1.0, smoothstep(0.0, 5.0, depth));
          gl_FragColor = vec4(col, max(alpha, max(F, foam)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      defines: { WATER_Q: Q },
      transparent: true,
      fog: true,
    });
    // the sky's own colours, so the reflections follow the time of day
    for (const k of ['top', 'horizon', 'sunDir', 'sunColor', 'cloudLo', 'cloudHi', 'cloudAmount']) mat.uniforms[k] = sky[k];
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2.6, WORLD_HALF * 2.6, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = this.water;
    this.waterMesh.renderOrder = 1;
    this.waterMesh.frustumCulled = false;
    this.scene.add(this.waterMesh);
    this.waterMat = mat;
  }

  // A picture of the land for the sea shader: red = the sea bed's depth (0..16 m), green = the land's height
  // above the sea (0..400 m), covering the whole terrain
  _landTexture() {
    const n = 512, half = WORLD_HALF, sea = this.water, data = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++) {
      const z = -half + ((j + 0.5) / n) * half * 2;
      for (let i = 0; i < n; i++) {
        const x = -half + ((i + 0.5) / n) * half * 2, h = this.heightAt(x, z), k = (j * n + i) * 4;
        data[k] = clamp(((sea - h) / 16) * 255, 0, 255);
        data[k + 1] = clamp(((h - sea) / 400) * 255, 0, 255);
        data[k + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return { tex, rect: new THREE.Vector4(-half, -half, 1 / (half * 2), 1 / (half * 2)) };
  }

  updateWater(dt) {
    const m = this.waterMat;
    if (!m) return;
    const u = m.uniforms;
    u.time.value = (u.time.value + dt) % 3600;
    u.sunLight.value.copy(this.sun.color);
    u.sunPower.value = this.sun.intensity;
    u.ambient.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.5).lerp(this.skyMat.uniforms.horizon.value, 0.35);
  }

  // ---------------------------------------------------------------- sky & light
  _buildSky() {
    const horizon = new THREE.Color(0xd2bf9f);
    this.scene.fog = new THREE.Fog(horizon.clone(), 70, 720);
    this.scene.background = horizon.clone();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x587a9e) },
        horizon: { value: horizon },
        bottom: { value: new THREE.Color(0xa08f78) },
        sunDir: { value: SUN_DIR },
        sunColor: { value: new THREE.Color(0xffd29a) },
        cloudLo: { value: new THREE.Color(0xc8bdb3) },
        cloudHi: { value: new THREE.Color(0xffebd1) },
        cloudAmount: { value: 0.55 },
        stars: { value: 0 },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform vec3 cloudLo; uniform vec3 cloudHi; uniform float cloudAmount; uniform float stars;
        varying vec3 vDir;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hsh(i),hsh(i+vec2(1.0,0.0)),f.x), mix(hsh(i+vec2(0.0,1.0)),hsh(i+vec2(1.0,1.0)),f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.6, h));
          col = mix(col, bottom, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 1200.0) * 8.0 + pow(s, 48.0) * 0.4 + pow(s, 5.0) * 0.14);
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.18) * 1.6;
            float c = vn(uv) * 0.55 + vn(uv * 2.3 + 4.0) * 0.3 + vn(uv * 5.1) * 0.15;
            c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.3, h);
            vec3 cloud = mix(cloudLo, cloudHi, s);
            if (stars > 0.0) {
              vec3 cell = floor(d * 320.0);
              float r = hsh(cell.xy + vec2(cell.z * 17.13, cell.z * 3.71));
              col += vec3(0.8, 0.86, 1.0) * step(0.9972, r) * smoothstep(0.02, 0.3, h) * stars * (1.0 - c) * (0.6 + hsh(cell.yz) * 0.8);
            }
            col = mix(col, cloud, c * cloudAmount);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMat = mat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this._bakeEnvironment();
  }

  // Image-based lighting: bake the sky into a prefiltered environment map for reflections
  _bakeEnvironment() {
    const renderer = this.game.renderer;
    if (!renderer) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMat));
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = pmrem.fromScene(envScene, 0.02, 0.1, 200);
    pmrem.dispose();
    this.envMap = this.envTarget.texture;
    this.scene.environment = this.envMap;
    if (this.scene.environmentIntensity === undefined || this.scene.environmentIntensity === 1) this.scene.environmentIntensity = 0.55;
  }

  // Time of day / weather. opts: { preset, ...overrides } (see ATMOSPHERE_PRESETS)
  applyAtmosphere(opts = {}) {
    const p = { ...(ATMOSPHERE_PRESETS[opts.preset] || ATMOSPHERE_PRESETS.dusk), ...opts };
    const e = THREE.MathUtils.degToRad(clamp(+p.sunElevation, 3, 89)), a = THREE.MathUtils.degToRad(+p.sunAzimuth);
    SUN_DIR.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
    const u = this.skyMat.uniforms;
    u.top.value.set(p.skyTop);
    u.horizon.value.set(p.horizon);
    u.bottom.value.set(p.ground);
    u.sunColor.value.set(p.sunColor);
    u.cloudLo.value.set(p.cloudColor);
    u.cloudHi.value.set(p.cloudLit);
    u.cloudAmount.value = clamp(+p.clouds, 0, 1);
    u.stars.value = clamp(+p.stars, 0, 2);
    this.scene.fog.color.set(p.horizon);
    this.scene.fog.near = +p.fogNear;
    this.scene.fog.far = Math.max(+p.fogNear + 10, +p.fogFar);
    // see as far as the fog does (big maps push it out)
    const cam = this.game.camera;
    if (cam) { cam.far = Math.max(1500, this.scene.fog.far + 400); cam.updateProjectionMatrix(); }
    this.scene.background.set(p.horizon);
    this.sun.color.set(p.sunLight);
    this.sun.intensity = +p.sunIntensity;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = +p.hemiIntensity;
    this.scene.environmentIntensity = +p.envIntensity;
    this.atmosphere = p;
    this._bakeEnvironment();
    return p;
  }

  setShadowQuality(size, extent) {
    const sun = this.sun;
    const sc = sun.shadow.camera;
    sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent;
    sc.updateProjectionMatrix();
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }

  // 0..1 how much grass grows here (none on roads, in town squares, inside buildings or on rock)
  grassDensity(x, z) {
    let d = 1 - smoothstep(0.08, 0.4, fbm2(x * 0.011 + 40, z * 0.011 - 20, 3)) * 0.6;
    for (const f of this.flatZones) {
      const dist = Math.hypot(x - f.x, z - f.z);
      if (dist < f.r0 + 8) d -= (1 - smoothstep(f.r0 * 0.55, f.r0 + 8, dist)) * f.town * 1.25;
    }
    if (Math.abs(x) < PLAY_HALF + 40 && Math.abs(z) < PLAY_HALF + 40) d -= 1 - smoothstep(3, 6.5, this._roadDist(x, z));
    if (this._nearBuilding(x, z, 1.5)) return 0;
    if (this.water !== null && this.heightAt(x, z) < this.water + 0.8) return 0;
    d -= smoothstep(0.14, 0.32, 1 - this.normalAt(x, z, _n).y);
    d *= 0.55 + (fbm2(x * 0.09 + 7, z * 0.09, 2) * 0.5 + 0.5) * 0.9;
    return clamp(d, 0, 1);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xc8d4e0, 0x6b5a45, 0.8);
    this.scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(0xffdcb0, 3.0);
    const q = this.game.settings.quality;
    sun.castShadow = q !== 'low';
    sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 600;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  updateSky(camPos) {
    this.sky.position.copy(camPos);
    if (this.windU) this.windU.value = performance.now() / 1000;
  }

  updateShadow(focus) {
    const snap = 1;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    const fy = this.heightAt(fx, fz);
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + SUN_DIR.x * 300, fy + SUN_DIR.y * 300, fz + SUN_DIR.z * 300);
    this.sun.target.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- placement helpers
  _nearBuilding(x, z, margin) {
    for (const b of BUILDINGS) {
      const hw = (b[2] * 2.5) / 2 + margin, hd = (b[3] * 2.5) / 2 + margin;
      if (Math.abs(x - b[0]) < hw && Math.abs(z - b[1]) < hd) return true;
    }
    return false;
  }

  _roadDist(x, z) {
    let dm = Infinity;
    for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
      const d2 = segDist2(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]);
      if (d2 < dm) dm = d2;
    }
    return Math.sqrt(dm);
  }

  _areaFree(minX, minZ, maxX, maxZ) {
    for (const b of BUILDINGS) {
      const hw = (b[2] * 2.5) / 2 + 2.5, hd = (b[3] * 2.5) / 2 + 2.5;
      if (maxX > b[0] - hw && minX < b[0] + hw && maxZ > b[1] - hd && minZ < b[1] + hd) return false;
    }
    for (const f of FLAGS) {
      if (Math.abs((minX + maxX) / 2 - f.x) < 6 && Math.abs((minZ + maxZ) / 2 - f.z) < 6) return false;
    }
    // Tank parking pads beside each HQ
    for (const q of HQS) {
      const pz = q.z + (q.z > 0 ? 4 : -4);
      for (const side of [-1, 1]) {
        const px = q.x + side * 16;
        if (maxX > px - 7 && minX < px + 7 && maxZ > pz - 8 && minZ < pz + 8) return false;
      }
    }
    this.queryBoxes(minX, -1e4, minZ, maxX, 1e4, maxZ, this._tmp);
    return this._tmp.length === 0;
  }

  // ---------------------------------------------------------------- vegetation
  _buildVegetation() {
    const rng = this.rng;
    const dummy = new THREE.Object3D();
    // MEDIUM graphics and up: trees of needle sprays and leaf clusters, barked trunks, weathered boulders. The shared
    // random stream draws exactly the same numbers either way (it places the trees and rocks, which multiplayer and
    // the collision grid depend on); the detailed look's own choices come from a stream of their own.
    const hd = this.game.qualityName ? this.game.qualityName() !== 'low' : true;
    const hrng = mulberry32(31337);
    const LOBES = [[0, 0.62, 0, 0.55], [0.42, 0.42, 0.12, 0.42], [-0.38, 0.45, -0.2, 0.44], [0.1, 0.4, -0.45, 0.4], [-0.12, 0.3, 0.42, 0.38], [0.05, 0.95, 0.05, 0.36]];
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, hd ? 9 : 6, 1, hd);
    trunkGeo.translate(0, 0.5, 0);
    const pineGeo = hd ? pineCardGeo() : pineCrownGeo();
    const leafGeo = hd ? leafCardGeo(LOBES) : leafCrownGeo(LOBES);
    // centred on 0 like the old round crown, and about as big
    leafGeo.translate(0, -0.55, 0);
    leafGeo.scale(1.3, 1.45, 1.3);
    const V = hd ? vegTextures() : null;
    const trunkMat = hd ? new THREE.MeshStandardMaterial({ map: V.bark, color: 0xb3a592, roughness: 0.95 }) : new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1, flatShading: true });
    // the crowns sway in the wind (each tree a little out of step with its neighbours); a winter mission can lay snow
    // on them (snowU); foliage cards keep their soft outward normals on both sides
    this.windU = { value: 0 };
    this.snowU = { value: 0 };
    const sway = (m, cards) => {
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uWind = this.windU;
        shader.uniforms.uSnow = this.snowU;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uWind;\nvarying float vUp;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
              vec2 tp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
              float bend = max(0.0, position.y + 0.3);
              float sw = sin(uWind * 1.25 + tp.x * 0.11 + tp.y * 0.07) * 0.05 + sin(uWind * 2.9 + tp.x * 0.43) * 0.016;
              transformed.x += sw * bend * bend;
              transformed.z += sw * 0.55 * bend * bend;
              vUp = normalize((instanceMatrix * vec4(normal, 0.0)).xyz).y;
            #else
              vUp = normal.y;
            #endif`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uSnow;\nvarying float vUp;')
          .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.93), uSnow * smoothstep(0.3, 0.92, vUp) * 0.78);')
          .replace('#include <normal_fragment_begin>', cards ? '#include <normal_fragment_begin>\n  normal = normalize(vNormal);' : '#include <normal_fragment_begin>');
      };
      m.customProgramCacheKey = () => (cards ? 'crown-cards' : 'crown-wind');
      return m;
    };
    const crownMat = sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true }), false);
    const cardMat = (map) => sway(new THREE.MeshStandardMaterial({ map, color: 0xffffff, roughness: 0.86, metalness: 0, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }), true);
    const pineMat = hd ? cardMat(V.needles) : crownMat, leafMat = hd ? cardMat(V.leaves) : crownMat;
    // their shadows have the shape of the needles and leaves, not of the cards
    const cardDepth = (map) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42, side: THREE.DoubleSide });

    const spots = [];
    let tries = 0;
    const areaIn = clamp((PLAY_HALF / 240) ** 2, 1, 6), areaOut = clamp((WORLD_HALF / 560) ** 2, 1, 5);
    const nIn = Math.round(360 * VEGETATION.trees * areaIn), nAll = nIn + Math.round(280 * VEGETATION.trees * areaOut);
    const wet = (y) => this.water !== null && y < this.water + 1.2;
    while (spots.length < nAll && tries < 20000 + nAll * 20) {
      tries++;
      const inside = spots.length < nIn;
      const lim = inside ? PLAY_HALF - 4 : WORLD_HALF - 60;
      const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
      if (!inside && Math.max(Math.abs(x), Math.abs(z)) < PLAY_HALF + 10) continue;
      const forest = fbm2(x * 0.01 + 5, z * 0.01 - 3, 3);
      if (rng() > smoothstep(-0.15, 0.3, forest) + 0.08) continue;
      if (this.flatZones.some((f) => Math.hypot(x - f.x, z - f.z) < f.r0 + 3)) continue;
      if (this._nearBuilding(x, z, 6)) continue;
      if (inside && this._roadDist(x, z) < 7) continue;
      const y = this.heightAt(x, z);
      if (y > 120 || wet(y)) continue;
      spots.push({ x, z, y, pine: rng() < 0.6, h: 5 + rng() * 6.5, inside });
    }
    const pines = spots.filter((s) => s.pine), leafs = spots.filter((s) => !s.pine);
    this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, spots.length));
    this.pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, Math.max(1, pines.length));
    this.leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, Math.max(1, leafs.length));
    if (hd) { this.pineMesh.customDepthMaterial = cardDepth(V.needles); this.leafMesh.customDepthMaterial = cardDepth(V.leaves); }
    const col = new THREE.Color();
    let pi = 0, li = 0;
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y - 0.3, s.z);
      dummy.rotation.set(0, rng() * 6.28, 0);
      dummy.scale.set(1, s.h * (s.pine ? 0.35 : 0.55), 1);
      dummy.updateMatrix();
      this.trunkMesh.setMatrixAt(i, dummy.matrix);
      const t = { x: s.x, z: s.z, y: s.y, trunk: i, crown: null, crownIdx: 0, alive: true, box: null, trunkM: dummy.matrix.clone() };
      if (s.pine) {
        dummy.position.set(s.x, s.y + s.h * 0.2, s.z);
        dummy.scale.set(s.h * 0.24, s.h * 0.85, s.h * 0.24);
        dummy.updateMatrix();
        this.pineMesh.setMatrixAt(pi, dummy.matrix);
        col.setHSL(0.26 + rng() * 0.05, 0.28 + rng() * 0.12, 0.2 + rng() * 0.06);
        if (hd) col.setHSL(0.24 + hrng() * 0.07, 0.22 + hrng() * 0.12, 0.8 + hrng() * 0.17);
        this.pineMesh.setColorAt(pi, col);
        t.crown = this.pineMesh; t.crownIdx = pi++;
      } else {
        dummy.position.set(s.x, s.y + s.h * 0.62, s.z);
        dummy.scale.set(s.h * 0.3, s.h * 0.26, s.h * 0.3);
        dummy.updateMatrix();
        this.leafMesh.setMatrixAt(li, dummy.matrix);
        col.setHSL(0.2 + rng() * 0.07, 0.3 + rng() * 0.15, 0.24 + rng() * 0.08);
        if (hd) { if (hrng() < 0.08) col.setRGB(1.05, 0.86, 0.5); else col.setHSL(0.2 + hrng() * 0.1, 0.25 + hrng() * 0.2, 0.78 + hrng() * 0.2); }
        this.leafMesh.setColorAt(li, col);
        t.crown = this.leafMesh; t.crownIdx = li++;
      }
      t.crownM = dummy.matrix.clone();
      if (s.inside) t.box = this.addBox(s.x - 0.3, s.y - 1, s.z - 0.3, s.x + 0.3, s.y + s.h * 0.5, s.z + 0.3, { mat: 'wood', tree: this.trees.length });
      this.trees.push(t);
    });
    this.trunkMesh.count = spots.length; this.pineMesh.count = pines.length; this.leafMesh.count = leafs.length;
    for (const m of [this.trunkMesh, this.pineMesh, this.leafMesh]) {
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
    }

    // Bushes (no collision)
    const BUSH = [[0, 0.1, 0, 0.62], [0.45, -0.05, 0.1, 0.48], [-0.42, 0, -0.12, 0.5]];
    const bushGeo = hd ? leafCardGeo(BUSH, 0.75) : leafCrownGeo(BUSH);
    const bushCount = Math.round(520 * VEGETATION.bushes * clamp(areaIn, 1, 4));
    this.bushMesh = new THREE.InstancedMesh(bushGeo, leafMat, Math.max(1, bushCount));
    let placed = 0; tries = 0;
    while (placed < bushCount && tries < 12000 * clamp(areaIn, 1, 4)) {
      tries++;
      const x = (rng() * 2 - 1) * (PLAY_HALF + 60), z = (rng() * 2 - 1) * (PLAY_HALF + 60);
      if (this._nearBuilding(x, z, 3)) continue;
      if (this._roadDist(x, z) < 4) continue;
      if (FLAGS.some((f) => Math.hypot(x - f.x, z - f.z) < f.radius + 2)) continue;
      const y = this.heightAt(x, z);
      if (wet(y)) continue;
      const s = 0.6 + rng() * 1.1;
      dummy.position.set(x, y + s * 0.25, z);
      dummy.rotation.set(0, rng() * 6.28, 0);
      dummy.scale.set(s * (1 + rng() * 0.6), s * 0.65, s);
      dummy.updateMatrix();
      this.bushMesh.setMatrixAt(placed, dummy.matrix);
      col.setHSL(0.18 + rng() * 0.08, 0.25 + rng() * 0.15, 0.22 + rng() * 0.1);
      if (hd) col.setHSL(0.18 + hrng() * 0.1, 0.25 + hrng() * 0.2, 0.74 + hrng() * 0.2);
      this.bushMesh.setColorAt(placed, col);
      placed++;
    }
    this.bushMesh.count = placed;
    this.bushMesh.receiveShadow = true;
    this.bushMesh.frustumCulled = false;
    this.scene.add(this.bushMesh);

    // Rocks
    const rockGeo2 = hd ? rockGeoHD() : rockGeo();
    const rockMat = hd ? Object.assign(worldUVMaterial({ map: this.tex.ground, normalMap: this.tex.groundN, normalScale: 0.55, scale: 0.3, roughness: 1, color: 0xcdc6ba }), { vertexColors: true, flatShading: true }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const rockCount = Math.round(190 * VEGETATION.rocks * clamp(areaOut, 1, 4)), rocksIn = Math.round(140 * VEGETATION.rocks * clamp(areaIn, 1, 4));
    this.rockMesh = new THREE.InstancedMesh(rockGeo2, rockMat, Math.max(1, rockCount));
    placed = 0; tries = 0;
    while (placed < rockCount && tries < 8000 * clamp(areaOut, 1, 4)) {
      tries++;
      const inside = placed < rocksIn;
      const lim = inside ? PLAY_HALF - 5 : WORLD_HALF - 80;
      const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
      if (!inside && Math.max(Math.abs(x), Math.abs(z)) < PLAY_HALF + 10) continue;
      if (this.flatZones.some((f) => Math.hypot(x - f.x, z - f.z) < f.r0)) continue;
      if (this._nearBuilding(x, z, 5)) continue;
      if (inside && this._roadDist(x, z) < 6) continue;
      const y = this.heightAt(x, z);
      if (wet(y) && inside) continue;
      const s = inside ? 0.7 + rng() * 1.8 : 2 + rng() * 6;
      const sy = s * (0.5 + rng() * 0.4);
      dummy.position.set(x, y + sy * 0.3, z);
      dummy.rotation.set(rng() * 0.5, rng() * 6.28, rng() * 0.5);
      dummy.scale.set(s, sy, s * (0.8 + rng() * 0.4));
      dummy.updateMatrix();
      this.rockMesh.setMatrixAt(placed, dummy.matrix);
      const g = 0.38 + rng() * 0.12;
      col.setRGB(g * 1.02, g, g * 0.95);
      if (hd) col.multiplyScalar(1.15);
      this.rockMesh.setColorAt(placed, col);
      if (inside) {
        const r = s * 0.72;
        this.addBox(x - r, y - 1, z - r, x + r, y + sy * 1.05, z + r, { mat: 'rock' });
      }
      placed++;
    }
    this.rockMesh.count = placed;
    this.rockMesh.castShadow = true;
    this.rockMesh.receiveShadow = true;
    this.rockMesh.frustumCulled = false;
    this.scene.add(this.rockMesh);
  }

  destroyTree(i) {
    const t = this.trees[i];
    if (!t || !t.alive) return;
    t.alive = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.trunkMesh.setMatrixAt(t.trunk, zero);
    t.crown.setMatrixAt(t.crownIdx, zero);
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    t.crown.instanceMatrix.needsUpdate = true;
    if (t.box) this.disableBox(t.box);
    const fx = this.game.effects;
    if (fx) {
      fx.debris(t.x, t.y + 2, t.z, 0x4a3a2c, 5, 0.35);
      for (let k = 0; k < 18; k++) {
        fx.smoke.add(t.x + (Math.random() - 0.5) * 3, t.y + 3 + Math.random() * 4, t.z + (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4, 1.4 + Math.random(),
          0.5, 0.25, 0x3f5a2a, 0.9, 6, 1.5);
      }
    }
  }

  damageTrees(x, z, r) {
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (!t.alive || !t.box) continue;
      if ((t.x - x) ** 2 + (t.z - z) ** 2 < r * r) this.destroyTree(i);
    }
  }

  resetTrees() {
    for (const t of this.trees) {
      if (t.alive) continue;
      t.alive = true;
      this.trunkMesh.setMatrixAt(t.trunk, t.trunkM);
      t.crown.setMatrixAt(t.crownIdx, t.crownM);
      if (t.box) this.enableBox(t.box);
    }
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.pineMesh.instanceMatrix.needsUpdate = true;
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- props
  _prop(kind, cx, cy, cz, sx, sy, sz, color, mat, collide = true) {
    this._propList[kind].push({ cx, cy, cz, sx, sy, sz, color });
    if (collide) this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, { mat });
  }

  _container(x, z, rot, color) {
    const y = this.heightAt(x, z) - 0.1;
    const sx = rot ? 2.44 : 6.06, sz = rot ? 6.06 : 2.44;
    this._prop('metal', x, y + 1.3, z, sx, 2.6, sz, color, 'metal');
    if (this.rng() < 0.3) {
      const c2 = [0x8a3b2a, 0x2f5d7c, 0x3f6b3a, 0xa0782d, 0x6b6f73][Math.floor(this.rng() * 5)];
      this._prop('metal', x, y + 3.9, z, sx, 2.6, sz, c2, 'metal');
    }
  }

  _barrier(x, z, rot) {
    const y = this.heightAt(x, z);
    this._prop('concrete', x, y + 0.45, z, rot ? 0.6 : 3, 0.9, rot ? 3 : 0.6, 0xb8b2a6, 'concrete');
  }

  _sandbags(x, z, a) {
    // Short L-shaped sandbag nest, facing outward along angle a
    const y = this.heightAt(x, z);
    const tang = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    this._prop('sand', x, y + 0.45, z, tang ? 0.8 : 3.2, 0.95, tang ? 3.2 : 0.8, 0xffffff, 'sand');
    const ox = tang ? 0 : 1.6, oz = tang ? 1.6 : 0;
    this._prop('sand', x - ox + (tang ? -1 : 0), y + 0.45, z - oz + (tang ? 0 : -1), tang ? 2 : 0.8, 0.95, tang ? 0.8 : 2, 0xffffff, 'sand');
  }

  _crate(x, z) {
    const y = this.heightAt(x, z);
    const s = 1 + this.rng() * 0.3;
    this._prop('wood', x, y + s / 2, z, s, s, s, [0xb08a5c, 0xa07c50, 0x9a8a62][Math.floor(this.rng() * 3)], 'wood');
    if (this.rng() < 0.4) this._prop('wood', x + 0.1, y + s * 1.5, z - 0.1, s * 0.9, s * 0.9, s * 0.9, 0x96784e, 'wood');
  }

  _wreck(x, z, rot) {
    const y = this.heightAt(x, z);
    const L = 4.3, W = 1.85;
    this._prop('metal', x, y + 0.6, z, rot ? W : L, 0.95, rot ? L : W, 0x3b3632, 'metal');
    this._prop('metal', x + (rot ? 0 : -0.3), y + 1.35, z + (rot ? -0.3 : 0), rot ? 1.6 : 2.2, 0.6, rot ? 2.2 : 1.6, 0x2a2724, 'metal');
  }

  _ruin(x, z, rot) {
    const y = this.heightAt(x, z);
    const L = 3 + this.rng() * 3, h = 1 + this.rng() * 1.4;
    this._prop('concrete', x, y + h / 2 - 0.1, z, rot ? 0.45 : L, h, rot ? L : 0.45, 0xa39a8a, 'concrete');
  }

  _placeAround(cx, cz, rMin, rMax, sx, sz, tries, fn) {
    for (let k = 0; k < tries; k++) {
      const a = this.rng() * Math.PI * 2, r = lerp(rMin, rMax, this.rng());
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rot = this.rng() < 0.5;
      const hx = (rot ? sz : sx) / 2 + 1, hz = (rot ? sx : sz) / 2 + 1;
      if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_HALF - 6) continue;
      if (!this._areaFree(x - hx, z - hz, x + hx, z + hz)) continue;
      fn(x, z, rot, a);
      return true;
    }
    return false;
  }

  _buildProps() {
    this._propList = { concrete: [], metal: [], sand: [], wood: [] };
    const rng = this.rng;
    const cColors = [0x8a3b2a, 0x2f5d7c, 0x3f6b3a, 0xa0782d, 0x6b6f73, 0x7b2f2f];
    this._mapProps();
    if (MAP.randomProps === false) { this._flushProps(); return; }
    for (const f of FLAGS) {
      const big = !!f.town;
      for (let k = 0; k < (big ? 5 : 3); k++) this._placeAround(f.x, f.z, 7, 11, 3.2, 3.2, 20, (x, z, rot, a) => this._sandbags(x, z, a));
      for (let k = 0; k < (big ? 6 : 4); k++) this._placeAround(f.x, f.z, 9, big ? 22 : 22, 3, 0.6, 20, (x, z, rot) => this._barrier(x, z, rot));
      for (let k = 0; k < (big ? 2 : 4); k++) this._placeAround(f.x, f.z, 14, big ? 22 : 32, 6.1, 2.5, 30, (x, z, rot) => this._container(x, z, rot, cColors[Math.floor(rng() * cColors.length)]));
      for (let k = 0; k < 4; k++) this._placeAround(f.x, f.z, 8, 26, 1.4, 1.4, 20, (x, z) => this._crate(x, z));
      this._placeAround(f.x, f.z, 12, 30, 4.4, 2, 20, (x, z, rot) => this._wreck(x, z, rot));
    }
    for (const q of HQS) {
      for (let k = 0; k < 5; k++) this._placeAround(q.x, q.z, 14, 28, 6.1, 2.5, 30, (x, z, rot) => this._container(x, z, rot, cColors[Math.floor(rng() * cColors.length)]));
      for (let k = 0; k < 6; k++) this._placeAround(q.x, q.z, 10, 24, 3.2, 3.2, 30, (x, z, rot, a) => this._sandbags(x, z, a));
      for (let k = 0; k < 6; k++) this._placeAround(q.x, q.z, 8, 26, 1.4, 1.4, 20, (x, z) => this._crate(x, z));
    }
    // Scattered cover across the fields
    let n = 0, tries = 0;
    while (n < 90 && tries < 3000) {
      tries++;
      const x = (rng() * 2 - 1) * (PLAY_HALF - 12), z = (rng() * 2 - 1) * (PLAY_HALF - 12);
      if (this.flatZones.some((f) => Math.hypot(x - f.x, z - f.z) < f.r0 * 0.5)) continue;
      const kind = rng();
      const rot = rng() < 0.5;
      const road = this._roadDist(x, z);
      if (kind < 0.18 && road < 5 && road > 1.5) {
        if (!this._areaFree(x - 3, z - 3, x + 3, z + 3)) continue;
        this._wreck(x, z, rot);
      } else if (road > 6) {
        if (!this._areaFree(x - 3.5, z - 3.5, x + 3.5, z + 3.5)) continue;
        if (kind < 0.55) this._ruin(x, z, rot);
        else if (kind < 0.8) this._sandbags(x, z, rng() * 6.28);
        else this._container(x, z, rot, cColors[Math.floor(rng() * cColors.length)]);
      } else continue;
      n++;
    }
    this._flushProps();
  }

  // Props placed by hand in a map mod
  _mapProps() {
    for (const p of MAP_PROPS) {
      const rot = p.rot, x = p.x, z = p.z;
      switch (p.type) {
        case 'container': this._container(x, z, rot, p.color ?? 0x2f5d7c); break;
        case 'barrier': this._barrier(x, z, rot); break;
        case 'sandbags': this._sandbags(x, z, rot ? Math.PI / 2 : 0); break;
        case 'crate': this._crate(x, z); break;
        case 'wreck': this._wreck(x, z, rot); break;
        case 'ruin': this._ruin(x, z, rot); break;
        case 'block': {
          const [sx, sy, sz] = p.size || [2, 2, 2];
          const y = this.heightAt(x, z) + (p.y || 0);
          this._prop('concrete', x, y + sy / 2 - 0.05, z, rot ? sz : sx, sy, rot ? sx : sz, p.color ?? 0xa39a8a, 'concrete');
          break;
        }
      }
    }
  }

  _flushProps() {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const mats = {
      concrete: worldUVMaterial({ map: this.tex.concrete, normalMap: this.tex.concreteN, normalScale: 0.8, scale: 0.35 }),
      metal: worldUVMaterial({ map: this.tex.metal, normalMap: this.tex.metalN, normalScale: 0.9, scale: 0.4, roughness: 0.62, metalness: 0.35 }),
      sand: worldUVMaterial({ map: this.tex.sandbag, scale: 0.9, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.tex.crate, normalMap: this.tex.crateN, roughness: 0.88 }),
    };
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const kind of Object.keys(this._propList)) {
      const list = this._propList[kind];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(unit, mats[kind], list.length);
      list.forEach((it, i) => {
        m4.compose(p.set(it.cx, it.cy, it.cz), q, s.set(it.sx, it.sy, it.sz));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(it.color));
      });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  // ---------------------------------------------------------------- collision grid
  _ci(v) {
    const c = Math.floor((v + GRID_HALF) / CELL);
    return c < 0 ? 0 : c >= GN ? GN - 1 : c;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, data = null) {
    const b = { id: this.boxes.length, minX, minY, minZ, maxX, maxY, maxZ, data, active: false, stamp: 0 };
    this.boxes.push(b);
    this.enableBox(b);
    return b;
  }

  enableBox(b) {
    if (b.active) return;
    b.active = true;
    const x0 = this._ci(b.minX), x1 = this._ci(b.maxX), z0 = this._ci(b.minZ), z1 = this._ci(b.maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = cz * GN + cx;
      (this.cells[k] ||= []).push(b);
    }
  }

  disableBox(b) {
    if (!b.active) return;
    b.active = false;
    const x0 = this._ci(b.minX), x1 = this._ci(b.maxX), z0 = this._ci(b.minZ), z1 = this._ci(b.maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.cells[cz * GN + cx];
      if (!arr) continue;
      const i = arr.indexOf(b);
      if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
    }
  }

  queryBoxes(minX, minY, minZ, maxX, maxY, maxZ, out) {
    out.length = 0;
    const st = ++this.stamp;
    const x0 = this._ci(minX), x1 = this._ci(maxX), z0 = this._ci(minZ), z1 = this._ci(maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.cells[cz * GN + cx];
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (b.stamp === st) continue;
        b.stamp = st;
        if (b.maxX <= minX || b.minX >= maxX || b.maxY <= minY || b.minY >= maxY || b.maxZ <= minZ || b.minZ >= maxZ) continue;
        out.push(b);
      }
    }
    return out;
  }

  // Ray against boxes (grid DDA) and terrain. Results land in this.hit (reused object).
  raycast(ox, oy, oz, dx, dy, dz, maxT, terrain = true) {
    const hit = this.hit;
    hit.hit = false; hit.box = null; hit.terrain = false;
    let best = maxT, bestBox = null;
    const st = ++this.stamp;
    let cx = Math.floor((ox + GRID_HALF) / CELL), cz = Math.floor((oz + GRID_HALF) / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    let tMaxX = adx < 1e-9 ? Infinity : ((cx + (dx > 0 ? 1 : 0)) * CELL - GRID_HALF - ox) / dx;
    let tMaxZ = adz < 1e-9 ? Infinity : ((cz + (dz > 0 ? 1 : 0)) * CELL - GRID_HALF - oz) / dz;
    const tDX = adx < 1e-9 ? Infinity : CELL / adx, tDZ = adz < 1e-9 ? Infinity : CELL / adz;
    for (let iter = 0; iter < 420; iter++) {
      if (cx >= 0 && cx < GN && cz >= 0 && cz < GN) {
        const arr = this.cells[cz * GN + cx];
        if (arr) {
          for (let i = 0; i < arr.length; i++) {
            const b = arr[i];
            if (b.stamp === st) continue;
            b.stamp = st;
            const t = rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
            if (t < best) { best = t; bestBox = b; }
          }
        }
      }
      const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if (best <= tExit || tExit > maxT || tExit === Infinity) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
    }
    let terrainHit = false, waterHit = false;
    hit.water = false;
    if (terrain) {
      const tt = this.raycastTerrain(ox, oy, oz, dx, dy, dz, best);
      if (tt < best) { best = tt; bestBox = null; terrainHit = true; }
      // the sea surface stops things coming from above it
      const sea = this.water;
      if (sea !== null && dy < -1e-6 && oy >= sea) {
        const tw = (sea - oy) / dy;
        if (tw < best) { best = tw; bestBox = null; terrainHit = true; waterHit = true; }
      }
    }
    if (!bestBox && !terrainHit) return hit;
    hit.hit = true;
    hit.t = best;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    hit.box = bestBox;
    hit.terrain = terrainHit;
    if (bestBox) {
      const b = bestBox;
      let m = Math.abs(hit.x - b.minX), nx = -1, ny = 0, nz = 0, d;
      if ((d = Math.abs(hit.x - b.maxX)) < m) { m = d; nx = 1; ny = 0; nz = 0; }
      if ((d = Math.abs(hit.y - b.minY)) < m) { m = d; nx = 0; ny = -1; nz = 0; }
      if ((d = Math.abs(hit.y - b.maxY)) < m) { m = d; nx = 0; ny = 1; nz = 0; }
      if ((d = Math.abs(hit.z - b.minZ)) < m) { m = d; nx = 0; ny = 0; nz = -1; }
      if ((d = Math.abs(hit.z - b.maxZ)) < m) { m = d; nx = 0; ny = 0; nz = 1; }
      hit.nx = nx; hit.ny = ny; hit.nz = nz;
    } else if (waterHit) {
      hit.water = true;
      hit.nx = 0; hit.ny = 1; hit.nz = 0;
    } else {
      const n = this.normalAt(hit.x, hit.z, _n);
      hit.nx = n.x; hit.ny = n.y; hit.nz = n.z;
    }
    return hit;
  }

  raycastTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    let h = this.heightAt(ox, oz);
    if (oy < h - 0.05) return 0;
    let t = 0, prevT = 0;
    while (t < maxT) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      h = this.heightAt(x, z);
      const gap = y - h;
      if (gap < 0) {
        let lo = prevT, hi = t;
        for (let i = 0; i < 10; i++) {
          const m = (lo + hi) * 0.5;
          if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
        }
        return hi;
      }
      if (dy >= 0 && y > this.maxHeight) return Infinity;
      prevT = t;
      t += Math.max(0.35, gap * 0.6);
    }
    const x = ox + dx * maxT, z = oz + dz * maxT;
    if (oy + dy * maxT < this.heightAt(x, z)) {
      let lo = prevT, hi = maxT;
      for (let i = 0; i < 10; i++) {
        const m = (lo + hi) * 0.5;
        if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
      }
      return hi;
    }
    return Infinity;
  }

  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, true).hit;
  }

  // Highest walkable surface at (x, z) that is not above yTop
  groundAt(x, z, yTop) {
    let g = this.heightAt(x, z);
    this.queryBoxes(x - 0.2, g - 0.5, z - 0.2, x + 0.2, yTop + 0.05, z + 0.2, this._tmp);
    for (const b of this._tmp) if (b.maxY <= yTop + 0.05 && b.maxY > g) g = b.maxY;
    return g;
  }

  isFree(x, y, z, r, h) {
    this.queryBoxes(x - r, y + 0.05, z - r, x + r, y + h, z + r, this._tmp);
    return this._tmp.length === 0;
  }

  reset() {
    this.resetTrees();
  }
}

const _n = new THREE.Vector3();
