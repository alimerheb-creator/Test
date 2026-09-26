// Procedural canvas textures and a world-space UV material (no image assets needed).
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

function pixelCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, x, y, out);
      const i = (y * size + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeTextures() {
  const S = 256;

  const plaster = toTexture(pixelCanvas(S, (u, v, x, y, o) => {
    let b = 0.86 + (pfbm(u, v, 4, 5) - 0.5) * 0.16 + (hash2(x, y) - 0.5) * 0.06;
    const stain = pfbm(u, v, 2, 3);
    if (stain > 0.58) b -= (stain - 0.58) * 0.6;
    const crack = Math.abs(pfbm(u, v, 6, 3) - 0.5);
    if (crack < 0.008) b -= 0.18;
    o[0] = Math.min(255, b * 255); o[1] = Math.min(255, b * 247); o[2] = Math.min(255, b * 232);
  }));

  const concrete = toTexture(pixelCanvas(S, (u, v, x, y, o) => {
    let b = 0.74 + (pfbm(u, v, 4, 5) - 0.5) * 0.18 + (hash2(x + 9, y) - 0.5) * 0.08;
    if (y % 64 === 0 || y % 64 === 1) b -= 0.1;
    if (hash2(x, y + 77) > 0.996) b -= 0.25;
    const c = Math.max(0, Math.min(255, b * 255));
    o[0] = c; o[1] = c * 0.99; o[2] = c * 0.96;
  }));

  const ground = toTexture(pixelCanvas(S, (u, v, x, y, o) => {
    let b = 0.82 + (pfbm(u, v, 8, 4) - 0.5) * 0.3 + (hash2(x, y) - 0.5) * 0.14;
    if (hash2(x + 3, y + 5) > 0.985) b += 0.12;
    const c = Math.max(0, Math.min(255, b * 255));
    o[0] = c; o[1] = c; o[2] = c;
  }));

  const metal = toTexture(pixelCanvas(S, (u, v, x, y, o) => {
    const ridge = 0.84 + 0.16 * Math.sin(u * Math.PI * 2 * 24);
    let b = ridge * (0.9 + (pfbm(u, v, 4, 4) - 0.5) * 0.2);
    const rust = pfbm(u, v, 3, 4);
    const r = rust > 0.62 ? (rust - 0.62) * 2.2 : 0;
    o[0] = Math.min(255, b * 255 * (1 + r * 0.2));
    o[1] = Math.min(255, b * 255 * (1 - r * 0.3));
    o[2] = Math.min(255, b * 255 * (1 - r * 0.5));
  }));

  const sandbag = toTexture(pixelCanvas(S, (u, v, x, y, o) => {
    const rows = 4;
    const ry = (v * rows) % 1;
    const off = Math.floor(v * rows) % 2 ? 0.25 : 0;
    const rx = ((u + off) * 2) % 1;
    const bulge = Math.sin(ry * Math.PI) * Math.sin(rx * Math.PI);
    let b = 0.55 + bulge * 0.4 + (hash2(x, y) - 0.5) * 0.1;
    o[0] = Math.min(255, b * 200); o[1] = Math.min(255, b * 180); o[2] = Math.min(255, b * 135);
  }));

  // Radial glow for muzzle flashes and sprites
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
  // star spikes
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

  return { plaster, concrete, ground, metal, sandbag, glow };
}

// MeshStandardMaterial whose texture coordinates come from world position (triplanar-lite),
// so scaled instanced boxes keep a consistent texel density.
export function worldUVMaterial({ map, scale = 0.25, color = 0xffffff, roughness = 0.92, metalness = 0 }) {
  const m = new THREE.MeshStandardMaterial({ map, color, roughness, metalness });
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
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWUv;\nuniform float uvScale;')
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture2D( map, vWUv * uvScale );
        diffuseColor *= sampledDiffuseColor;`);
  };
  return m;
}
