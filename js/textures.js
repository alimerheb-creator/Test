// Procedural canvas textures (albedo + normal maps) and a world-space UV material,
// so the game ships without any image assets.
import * as THREE from 'three';
import { hash2 } from './util.js';

// Tileable value noise with integer period p
function pnoise(x, y, p) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const w = (v) => ((v % p) + p) % p;
  const a = hash2(w(ix), w(iy)), b = hash2(w(ix + 1), w(iy));
  const c = hash2(w(ix), w(iy + 1)), d = hash2(w(ix + 1), w(iy + 1));
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy; // 0..1
}

function pfbm(u, v, base, oct) {
  let s = 0, a = 0.5, n = 0, f = base;
  for (let i = 0; i < oct; i++) {
    s += pnoise(u * f + i * 3.1, v * f + i * 7.7, f) * a;
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

// Build a height field once, then derive albedo and a tangent-space normal map from it.
function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size, x, y);
  return h;
}

function canvasFrom(size, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 255;
      fill(x, y, out);
      const i = (y * size + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function normalCanvas(size, h, strength) {
  return canvasFrom(size, (x, y, o) => {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    o[0] = (nx * 0.5 + 0.5) * 255; o[1] = (ny * 0.5 + 0.5) * 255; o[2] = (nz * 0.5 + 0.5) * 255;
  });
}

function tex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function makeTextures() {
  const S = 256;

  // Plaster: blotchy render with hairline cracks
  const plasterH = heightField(S, (u, v, x, y) => {
    let h = pfbm(u, v, 8, 5) * 0.6 + hash2(x, y) * 0.12;
    if (Math.abs(pfbm(u, v, 6, 3) - 0.5) < 0.008) h -= 0.5;
    return h;
  });
  const plaster = tex(canvasFrom(S, (x, y, o) => {
    const u = x / S, v = y / S;
    let b = 0.86 + (pfbm(u, v, 4, 5) - 0.5) * 0.16 + (hash2(x, y) - 0.5) * 0.05;
    const stain = pfbm(u, v, 2, 3);
    if (stain > 0.58) b -= (stain - 0.58) * 0.6;
    if (plasterH[y * S + x] < 0) b -= 0.2;
    o[0] = clamp255(b * 255); o[1] = clamp255(b * 247); o[2] = clamp255(b * 232);
  }));
  const plasterN = tex(normalCanvas(S, plasterH, 3.2), false);

  // Concrete: formwork seams and air holes
  const concreteH = heightField(S, (u, v, x, y) => {
    let h = pfbm(u, v, 8, 4) * 0.4 + hash2(x + 9, y) * 0.1;
    if (y % 64 < 2) h -= 0.35;
    if (hash2(x, y + 77) > 0.994) h -= 0.6;
    return h;
  });
  const concrete = tex(canvasFrom(S, (x, y, o) => {
    const u = x / S, v = y / S;
    let b = 0.74 + (pfbm(u, v, 4, 5) - 0.5) * 0.18 + (hash2(x + 9, y) - 0.5) * 0.07;
    if (y % 64 < 2) b -= 0.1;
    if (hash2(x, y + 77) > 0.994) b -= 0.25;
    const c = clamp255(b * 255);
    o[0] = c; o[1] = c * 0.99; o[2] = c * 0.96;
  }));
  const concreteN = tex(normalCanvas(S, concreteH, 3), false);

  // Ground detail: soil grain, pebbles and small tufts (multiplies terrain vertex colours)
  const G = 512;
  const groundH = heightField(G, (u, v, x, y) => {
    let h = pfbm(u, v, 16, 5) * 0.8 + hash2(x, y) * 0.25;
    const p = pnoise(u * 64, v * 64, 64);
    if (p > 0.82) h += (p - 0.82) * 4;
    return h;
  });
  const ground = tex(canvasFrom(G, (x, y, o) => {
    const u = x / G, v = y / G;
    let b = 0.8 + (pfbm(u, v, 8, 4) - 0.5) * 0.34 + (hash2(x, y) - 0.5) * 0.12;
    const p = pnoise(u * 64, v * 64, 64);
    if (p > 0.82) b += (p - 0.82) * 1.2;
    const tint = pfbm(u, v, 4, 3);
    o[0] = clamp255(b * 255 * (0.96 + tint * 0.08));
    o[1] = clamp255(b * 255);
    o[2] = clamp255(b * 255 * (1.02 - tint * 0.08));
  }));
  const groundN = tex(normalCanvas(G, groundH, 2.4), false);

  const metal = tex(canvasFrom(S, (x, y, o) => {
    const u = x / S, v = y / S;
    const ridge = 0.84 + 0.16 * Math.sin(u * Math.PI * 2 * 24);
    const b = ridge * (0.9 + (pfbm(u, v, 4, 4) - 0.5) * 0.2);
    const rust = pfbm(u, v, 3, 4);
    const r = rust > 0.62 ? (rust - 0.62) * 2.2 : 0;
    o[0] = clamp255(b * 255 * (1 + r * 0.2));
    o[1] = clamp255(b * 255 * (1 - r * 0.3));
    o[2] = clamp255(b * 255 * (1 - r * 0.5));
  }));
  const metalN = tex(normalCanvas(S, heightField(S, (u) => Math.sin(u * Math.PI * 2 * 24) * 0.5), 1.2), false);

  const sandbag = tex(canvasFrom(S, (x, y, o) => {
    const u = x / S, v = y / S;
    const rows = 4;
    const ry = (v * rows) % 1;
    const off = Math.floor(v * rows) % 2 ? 0.25 : 0;
    const rx = ((u + off) * 2) % 1;
    const bulge = Math.sin(ry * Math.PI) * Math.sin(rx * Math.PI);
    const b = 0.55 + bulge * 0.4 + (hash2(x, y) - 0.5) * 0.1;
    o[0] = clamp255(b * 200); o[1] = clamp255(b * 180); o[2] = clamp255(b * 135);
  }));

  // Radial glow for muzzle flashes and fire particles
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  const gg = glowCanvas.getContext('2d');
  const grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  grad.addColorStop(0.6, 'rgba(255,120,30,0.25)');
  grad.addColorStop(1, 'rgba(255,90,0,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 128, 128);
  gg.globalCompositeOperation = 'lighter';
  gg.strokeStyle = 'rgba(255,220,150,0.55)';
  gg.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    gg.beginPath();
    gg.moveTo(64 - Math.cos(a) * 60, 64 - Math.sin(a) * 60);
    gg.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
    gg.stroke();
  }
  const glow = new THREE.CanvasTexture(glowCanvas);
  glow.colorSpace = THREE.SRGBColorSpace;

  // Billowing smoke puff (white, alpha carries the shape; tinted per particle)
  const P = 128;
  const smoke = new THREE.CanvasTexture(canvasFrom(P, (x, y, o) => {
    const dx = (x + 0.5) / P - 0.5, dy = (y + 0.5) / P - 0.5;
    const r = Math.hypot(dx, dy) * 2;
    const n = pfbm(x / P, y / P, 4, 4);
    const a = Math.max(0, 1 - r * (1.05 + (0.5 - n) * 0.9));
    o[0] = o[1] = o[2] = clamp255(200 + n * 55);
    o[3] = clamp255(Math.pow(a, 1.4) * 255 * (0.55 + n * 0.6));
  }));
  smoke.colorSpace = THREE.SRGBColorSpace;

  // Grass blades on a transparent card
  const gc = document.createElement('canvas');
  gc.width = 128; gc.height = 128;
  const g2 = gc.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const bx = 8 + hash2(i, 3) * 112, lean = (hash2(i, 9) - 0.5) * 40;
    const h = 60 + hash2(i, 5) * 66, w = 4 + hash2(i, 7) * 5;
    const shade = 180 + hash2(i, 11) * 75;
    g2.fillStyle = `rgb(${shade},${shade},${shade})`;
    g2.beginPath();
    g2.moveTo(bx - w, 128);
    g2.quadraticCurveTo(bx + lean * 0.3, 128 - h * 0.6, bx + lean, 128 - h);
    g2.quadraticCurveTo(bx + lean * 0.3 + 1, 128 - h * 0.6, bx + w, 128);
    g2.closePath();
    g2.fill();
  }
  const grass = new THREE.CanvasTexture(gc);
  grass.colorSpace = THREE.SRGBColorSpace;

  return { plaster, plasterN, concrete, concreteN, ground, groundN, metal, metalN, sandbag, glow, smoke, grass };
}

// MeshStandardMaterial whose texture coordinates come from world position (triplanar-lite),
// so scaled instanced boxes keep a consistent texel density. Supports a matching normal map.
export function worldUVMaterial({ map, normalMap = null, normalScale = 1, scale = 0.25, color = 0xffffff, roughness = 0.92, metalness = 0 }) {
  const m = new THREE.MeshStandardMaterial({ map, color, roughness, metalness });
  if (normalMap) {
    m.normalMap = normalMap;
    m.normalScale.set(normalScale, normalScale);
  }
  m.userData.uvScale = { value: scale };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uvScale = m.userData.uvScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wuvP = vec4(transformed, 1.0);
        vec3 wuvN = normal;
        #ifdef USE_INSTANCING
          wuvP = instanceMatrix * wuvP;
          wuvN = mat3(instanceMatrix) * wuvN;
        #endif
        wuvP = modelMatrix * wuvP;
        wuvN = abs(normalize(mat3(modelMatrix) * wuvN + vec3(1e-5)));
        vWUv = wuvN.x > 0.5 ? wuvP.zy : (wuvN.y > 0.5 ? wuvP.xz : wuvP.xy);`);
    let frag = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWUv;\nuniform float uvScale;')
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D( map, vWUv * uvScale );
        diffuseColor *= sampledDiffuseColor;`);
    if (normalMap) {
      frag = frag
        .replace('#include <normal_fragment_begin>', 'vec2 wuvNm = vWUv * uvScale;\n' + THREE.ShaderChunk.normal_fragment_begin.replaceAll('vNormalMapUv', 'wuvNm'))
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv', 'wuvNm'));
    }
    shader.fragmentShader = frag;
  };
  m.customProgramCacheKey = () => (normalMap ? 'worlduv-n' : 'worlduv');
  return m;
}
