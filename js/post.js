// HDR post-processing: MSAA scene target, mip-chain bloom, lens flare, ACES tone mapping,
// colour grading, vignette, film grain and damage effects. Self-contained (no three/addons).
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = `uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float knee; uniform bool prefilter;
  varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * texel).rgb; }
  void main(){
    vec3 a=s(vec2(-2.,2.)), b=s(vec2(0.,2.)), c=s(vec2(2.,2.)), d=s(vec2(-2.,0.)), e=s(vec2(0.,0.)), f=s(vec2(2.,0.));
    vec3 g=s(vec2(-2.,-2.)), h=s(vec2(0.,-2.)), i=s(vec2(2.,-2.)), j=s(vec2(-1.,1.)), k=s(vec2(1.,1.)), l=s(vec2(-1.,-1.)), m=s(vec2(1.,-1.));
    vec3 col = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
    if (prefilter) {
      col = min(col, vec3(30.0));
      float br = max(col.r, max(col.g, col.b));
      float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee);
      rq = rq * rq / (4.0 * knee + 1e-4);
      col *= max(rq, br - threshold) / max(br, 1e-4);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const UP = `uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 texel; uniform float scatter;
  varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tLow, vUv + o * texel).rgb; }
  void main(){
    vec3 t = s(vec2(0.,0.))*4.0 + (s(vec2(-1.,0.))+s(vec2(1.,0.))+s(vec2(0.,1.))+s(vec2(0.,-1.)))*2.0
      + s(vec2(-1.,-1.))+s(vec2(1.,-1.))+s(vec2(-1.,1.))+s(vec2(1.,1.));
    gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + t / 16.0 * scatter, 1.0);
  }`;

const COMPOSITE = `uniform sampler2D tScene; uniform sampler2D tBloom;
  uniform float bloomStrength; uniform float exposure; uniform float vignette; uniform float grain; uniform float time;
  uniform float saturation; uniform float hurt; uniform float lowHp; uniform float aspect;
  uniform vec2 sunPos; uniform float sunVis; uniform bool useBloom;
  varying vec2 vUv;
  vec3 sfRRTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 sfAces(vec3 c){
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c = IN * (c / 0.6);
    c = sfRRTFit(c);
    return clamp(OUT * c, 0.0, 1.0);
  }
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    vec3 col;
    float ca = hurt * 0.006 + 0.0006;
    vec2 dir = (uv - 0.5) * ca;
    col.r = texture2D(tScene, uv + dir).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - dir).b;
    if (useBloom) col += texture2D(tBloom, uv).rgb * bloomStrength;
    // Sun glare and lens ghosts
    if (sunVis > 0.001) {
      vec2 d = uv - sunPos; d.x *= aspect;
      float r = length(d);
      col += vec3(1.0, 0.82, 0.58) * (exp(-r * 7.0) * 0.35 + exp(-r * 32.0) * 0.9) * sunVis;
      vec2 axis = vec2(0.5) - sunPos;
      for (int i = 1; i <= 4; i++) {
        float fi = float(i);
        vec2 gp = sunPos + axis * (fi * 0.48);
        vec2 gd = uv - gp; gd.x *= aspect;
        float gr = 0.018 + fi * 0.014;
        float ring = smoothstep(gr, gr * 0.55, length(gd));
        col += mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.6, 0.3), fract(fi * 0.37)) * ring * 0.045 * sunVis;
      }
    }
    col *= exposure;
    col = sfAces(col);
    // grade: saturation, split toning, gentle contrast curve
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, saturation * (1.0 - lowHp * 0.75));
    col *= mix(vec3(0.94, 1.0, 1.05), vec3(1.05, 1.0, 0.93), smoothstep(0.05, 0.75, l));
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
    col = mix(col, col * vec3(1.35, 0.55, 0.5), lowHp * 0.35);
    vec2 q = uv - 0.5; q.x *= aspect;
    col *= 1.0 - vignette * dot(q, q) * 1.5;
    col += (rnd(uv * 913.0 + time) - 0.5) * grain;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }`;

function mat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.downMat = mat(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.0 }, knee: { value: 0.6 }, prefilter: { value: false } });
    this.upMat = mat(UP, { tLow: { value: null }, tHigh: { value: null }, texel: { value: new THREE.Vector2() }, scatter: { value: 0.85 } });
    this.compMat = mat(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, useBloom: { value: true },
      bloomStrength: { value: 0.55 }, exposure: { value: 1.05 }, vignette: { value: 0.32 }, grain: { value: 0.018 },
      time: { value: 0 }, saturation: { value: 1.08 }, hurt: { value: 0 }, lowHp: { value: 0 }, aspect: { value: 1 },
      sunPos: { value: new THREE.Vector2(-1, -1) }, sunVis: { value: 0 },
    });
    const gl = renderer.getContext();
    this.hdr = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    this.maxSamples = renderer.capabilities.isWebGL2 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0) : 0;
    this.rtScene = null;
    this.mips = [];
    this.ups = [];
    this.w = 0; this.h = 0;
    this.samples = 0;
    this.bloom = true;
  }

  setExposure(e) {
    this.exposureValue = e;
    this.compMat.uniforms.exposure.value = this.hdr ? e : 1.0;
  }

  configure({ samples, bloom }) {
    this.samples = Math.min(samples, this.maxSamples);
    this.bloom = bloom;
    this.w = 0; // force rebuild on next setSize
  }

  setSize(w, h) {
    if (w === this.w && h === this.h && this.rtScene) return;
    this.w = w; this.h = h;
    this.dispose();
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type, samples: this.samples, depthBuffer: true });
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    const levels = 6;
    for (let i = 0; i < levels; i++) {
      const o = { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, o));
      this.ups.push(new THREE.WebGLRenderTarget(mw, mh, o));
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      if (mw < 4 || mh < 4) break;
    }
    this.compMat.uniforms.exposure.value = this.hdr ? (this.exposureValue || 1.05) : 1.0;
    this.downMat.uniforms.threshold.value = this.hdr ? 1.0 : 0.82;
  }

  dispose() {
    if (this.rtScene) this.rtScene.dispose();
    for (const t of this.mips) t.dispose();
    for (const t of this.ups) t.dispose();
    this.rtScene = null;
    this.mips = [];
    this.ups = [];
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, vm, fx) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    if (vm) { r.clearDepth(); r.render(vm.scene, vm.cam); }

    const cu = this.compMat.uniforms;
    if (this.bloom && this.mips.length) {
      const d = this.downMat.uniforms;
      let src = this.rtScene.texture, sw = this.w, sh = this.h;
      for (let i = 0; i < this.mips.length; i++) {
        d.tSrc.value = src;
        d.texel.value.set(1 / sw, 1 / sh);
        d.prefilter.value = i === 0;
        this._pass(this.downMat, this.mips[i]);
        src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
      }
      const u = this.upMat.uniforms;
      let low = this.mips[this.mips.length - 1];
      for (let i = this.mips.length - 2; i >= 0; i--) {
        u.tLow.value = low.texture;
        u.tHigh.value = this.mips[i].texture;
        u.texel.value.set(1 / low.width, 1 / low.height);
        this._pass(this.upMat, this.ups[i]);
        low = this.ups[i];
      }
      cu.tBloom.value = low.texture;
      cu.useBloom.value = true;
    } else cu.useBloom.value = false;

    cu.tScene.value = this.rtScene.texture;
    cu.time.value = (fx.time % 100);
    cu.hurt.value = fx.hurt;
    cu.lowHp.value = fx.lowHp;
    cu.aspect.value = this.w / this.h;
    cu.sunPos.value.copy(fx.sunPos);
    cu.sunVis.value = fx.sunVis;
    this._pass(this.compMat, null);
  }
}
