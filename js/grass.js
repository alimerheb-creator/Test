// GPU-instanced grass that follows the camera. Each tuft keeps a fixed offset inside a square
// tile; the vertex shader wraps it to the copy nearest the camera and seats it on the terrain
// using a height/density texture, so nothing is updated on the CPU per frame.
import * as THREE from 'three';
import { PLAY_HALF } from './config.js';

export const GRASS_MAX = 20000;

export class Grass {
  constructor(game) {
    this.game = game;
    const w = game.world;
    // Height (r) and grass density (g) sampled over the play area (coarser on big maps)
    const HALF = Math.max(280, PLAY_HALF + 40);
    const STEP = Math.max(2.5, (HALF * 2) / 460);
    const M = Math.round((HALF * 2) / STEP) + 1;
    const data = new Float32Array(M * M * 4);
    for (let j = 0; j < M; j++) {
      const z = -HALF + j * STEP;
      for (let i = 0; i < M; i++) {
        const x = -HALF + i * STEP;
        const k = (j * M + i) * 4;
        data[k] = w.heightAt(x, z);
        data[k + 1] = w.grassDensity(x, z);
      }
    }
    const heightTex = new THREE.DataTexture(data, M, M, THREE.RGBAFormat, THREE.FloatType);
    heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter;
    heightTex.needsUpdate = true;

    // Tuft: three crossed cards, darker at the root
    const cards = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(0.95, 0.62, 1, 2);
      p.translate(0, 0.31, 0);
      p.rotateY((k * Math.PI) / 3);
      cards.push(p);
    }
    const geo = new THREE.InstancedBufferGeometry();
    const pos = [], uv = [], col = [], idx = [];
    let off = 0;
    for (const c of cards) {
      const P = c.attributes.position, U = c.attributes.uv;
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        uv.push(U.getX(i), U.getY(i));
        const t = U.getY(i);
        col.push(0.62 + t * 0.45, 0.66 + t * 0.38, 0.42 + t * 0.3);
      }
      for (let i = 0; i < c.index.count; i++) idx.push(c.index.getX(i) + off);
      off += P.count;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const offs = new Float32Array(GRASS_MAX * 3);
    for (let i = 0; i < GRASS_MAX; i++) {
      offs[i * 3] = Math.random();
      offs[i * 3 + 1] = Math.random();
      offs[i * 3 + 2] = Math.random();
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 3));
    geo.instanceCount = 0;

    this.uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uSize: { value: 60 },
      uTime: { value: 0 },
      uHeight: { value: heightTex },
      uHalf: { value: HALF },
      uStep: { value: STEP },
      uM: { value: M },
    };
    const mat = new THREE.MeshLambertMaterial({
      map: game.world.tex.grass, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xb4bc70,
    });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      // the texture's see-through texels are black, so its smaller mipmaps darken thin blades into black tufts in
      // the distance: take the colour back out of the coverage
      // both sides of a blade face the sky (double-sided cards would otherwise turn their backs black)
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n          normal = normalize( vNormal );');
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          sampledDiffuseColor.rgb /= max( sampledDiffuseColor.a, 0.25 );
          diffuseColor *= sampledDiffuseColor;
        #endif`);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aOff;
          uniform vec2 uCenter; uniform float uSize; uniform float uTime;
          uniform sampler2D uHeight; uniform float uHalf; uniform float uStep; uniform float uM;
          vec2 grassSample(vec2 p) {
            vec2 g = clamp((p + uHalf) / uStep, vec2(0.0), vec2(uM - 1.001));
            vec2 i = floor(g); vec2 f = g - i; float t = 1.0 / uM;
            vec2 a = texture2D(uHeight, (i + vec2(0.5, 0.5)) * t).rg;
            vec2 b = texture2D(uHeight, (i + vec2(1.5, 0.5)) * t).rg;
            vec2 c = texture2D(uHeight, (i + vec2(0.5, 1.5)) * t).rg;
            vec2 d = texture2D(uHeight, (i + vec2(1.5, 1.5)) * t).rg;
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 base = aOff.xy * uSize;
          vec2 wp = base + floor((uCenter - base) / uSize + 0.5) * uSize;
          vec2 hs = grassSample(wp);
          float r = aOff.z;
          float dist = length(wp - uCenter);
          float fade = 1.0 - smoothstep(uSize * 0.3, uSize * 0.5, dist);
          float sc = hs.y > r ? (0.65 + r * 0.7) * fade : 0.0;
          if (abs(wp.x) > uHalf || abs(wp.y) > uHalf) sc = 0.0;
          vec3 transformed = position * vec3(sc, sc * (0.75 + fract(r * 7.13) * 0.7), sc);
          float ang = r * 43.98;
          float cs = cos(ang), sn = sin(ang);
          transformed.xz = mat2(cs, -sn, sn, cs) * transformed.xz;
          float sway = sin(uTime * 1.6 + wp.x * 0.13 + wp.y * 0.09) * 0.14 + sin(uTime * 3.3 + wp.x * 0.6) * 0.04;
          transformed.x += sway * uv.y * sc;
          transformed.z += sway * 0.5 * uv.y * sc;
          transformed += vec3(wp.x, hs.x - 0.04, wp.y);
          #ifdef USE_COLOR
            float tint = fract(sin(dot(floor(wp * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
            vColor.rgb *= mix(vec3(0.85, 0.95, 0.7), vec3(1.12, 1.05, 0.78), tint);
          #endif`);
    };
    mat.customProgramCacheKey = () => 'grass';
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.geo = geo;
    game.scene.add(this.mesh);
  }

  setCount(count) {
    count = Math.min(GRASS_MAX, Math.max(0, count | 0));
    this.geo.instanceCount = count;
    this.mesh.visible = count > 0;
    // keep roughly constant density: ~2.6 tufts per square metre
    this.uniforms.uSize.value = count > 0 ? Math.sqrt(count / 2.6) : 60;
  }

  update(camPos, time) {
    this.uniforms.uCenter.value.set(camPos.x, camPos.z);
    this.uniforms.uTime.value = time;
  }
}
