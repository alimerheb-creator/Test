// Synthesised battlefield audio (WebAudio, no sample files): weapons, explosions, UI, ambience.
import { clamp, rand, pick } from './util.js';

const SHOT = {
  rifle: { freq: 1700, dur: 0.14, body: 0.9, bodyFreq: 150, vol: 0.55, tail: 0.35 },
  smg: { freq: 2300, dur: 0.1, body: 0.6, bodyFreq: 190, vol: 0.45, tail: 0.25 },
  lmg: { freq: 1300, dur: 0.17, body: 1.1, bodyFreq: 120, vol: 0.6, tail: 0.4 },
  sniper: { freq: 1100, dur: 0.32, body: 1.4, bodyFreq: 95, vol: 0.85, tail: 0.8 },
  pistol: { freq: 2600, dur: 0.09, body: 0.5, bodyFreq: 210, vol: 0.4, tail: 0.2 },
  shotgun: { freq: 900, dur: 0.26, body: 1.6, bodyFreq: 85, vol: 0.8, tail: 0.6 },
  heavy: { freq: 1000, dur: 0.22, body: 1.5, bodyFreq: 90, vol: 0.75, tail: 0.6 },
};
export const SHOT_SOUNDS = Object.keys(SHOT);

// Foley recipes: [delay s, 'click' (band-passed noise) | 'low' (low-passed noise) | 'tone', freq, dur, vol, sweepTo]
const FOLEY = {
  release: [[0, 'click', 2400, 0.025, 0.5], [0.02, 'low', 700, 0.08, 0.25]],
  grab: [[0, 'low', 500, 0.14, 0.35], [0.05, 'click', 1300, 0.04, 0.15]],
  out: [[0, 'click', 1500, 0.07, 0.6, 900], [0.05, 'click', 2600, 0.03, 0.35]],
  drop: [[0.32, 'low', 380, 0.08, 0.7], [0.33, 'tone', 2900, 0.06, 0.12], [0.45, 'low', 450, 0.05, 0.35], [0.46, 'tone', 3300, 0.04, 0.06]],
  in: [[0, 'click', 1100, 0.06, 0.45, 1900], [0.07, 'click', 3000, 0.035, 0.9], [0.075, 'tone', 420, 0.05, 0.3]],
  charge: [[0, 'click', 1200, 0.1, 0.55, 2600], [0.14, 'click', 2200, 0.05, 1.0], [0.14, 'tone', 260, 0.08, 0.45]],
  slide: [[0, 'click', 2600, 0.04, 0.9], [0, 'tone', 380, 0.06, 0.35]],
  bolt: [[0, 'click', 3000, 0.03, 0.6], [0.12, 'click', 1100, 0.1, 0.5, 2100], [0.34, 'click', 2000, 0.09, 0.5, 1000], [0.52, 'click', 2800, 0.035, 0.8], [0.52, 'tone', 300, 0.06, 0.3]],
  pump: [[0, 'click', 900, 0.1, 0.8, 1600], [0.16, 'click', 1500, 0.09, 0.9, 800], [0.25, 'tone', 240, 0.07, 0.45]],
  shell: [[0, 'low', 600, 0.05, 0.4], [0.03, 'click', 1900, 0.04, 0.6], [0.035, 'tone', 1600, 0.03, 0.1]],
  cover: [[0, 'click', 2200, 0.04, 0.8], [0.12, 'click', 900, 0.08, 0.5, 1400], [0.18, 'tone', 240, 0.08, 0.3]],
  belt: [[0, 'click', 3200, 0.2, 0.35, 2400], [0.22, 'click', 1800, 0.04, 0.7], [0.3, 'click', 2400, 0.05, 1.0], [0.3, 'tone', 220, 0.09, 0.4]],
};


export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.lx = 0; this.ly = 0; this.lz = 0; this.lyaw = 0;
    this.voices = 0;
    this.engine = null;
    this.ambientOn = false;
    this.nextDistant = 2;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.connect(comp).connect(ctx.destination);
      // Shared white noise
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Outdoor reverb tail
      this.reverb = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 2.4);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          const t = i / irLen;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1);
        }
      }
      this.reverb.buffer = ir;
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.5;
      this.reverb.connect(this.reverbGain).connect(this.master);
      this._startWind();
    }
    this.resume();
    // iOS stops the sound when a call, Siri or another app takes over, or the game goes to the background, and
    // doesn't start it again by itself ("interrupted" or "suspended"): any touch, coming back to the front, or the
    // app saying the interruption is over starts it again
    if (!this._wake) {
      this._wake = () => this.resume();
      for (const ev of ['touchend', 'pointerup', 'keydown']) window.addEventListener(ev, this._wake, { capture: true, passive: true });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.resume(); });
      window.addEventListener('pageshow', this._wake);
      window.addEventListener('focus', this._wake);
      window.__sfResumeAudio = this._wake;
    }
  }

  resume() {
    const c = this.ctx;
    if (!c || c.state === 'running' || c.state === 'closed') return;
    try { const r = c.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not now */ }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(x, y, z, yaw) {
    this.lx = x; this.ly = y; this.lz = z; this.lyaw = yaw;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  _spatial(x, y, z, maxDist) {
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) return null;
    const gain = 1 / (1 + dist * 0.045) * (1 - dist / maxDist);
    // listener right vector for yaw: (cos yaw, 0, -sin yaw)
    const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
    const pan = dist > 0.5 ? clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.85 : 0;
    return { gain, pan, dist };
  }

  _out(gain, pan, wet) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let last = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      last = p;
    }
    last.connect(this.master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      last.connect(w).connect(this.reverb);
    }
    return g;
  }

  _noise(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.start(t, Math.random() * Math.max(0, 1.9 - dur), dur + 0.05);
    this._track(n);
    return n;
  }

  _track(node) {
    this.voices++;
    node.onended = () => { this.voices--; };
  }

  _env(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  shot(kind, x, y, z, own = false) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 700);
    if (!s) return;
    if (!own && this.voices > 60) return;
    const p = SHOT[kind] || SHOT.rifle;
    const ctx = this.ctx, t = ctx.currentTime;
    const far = clamp(s.dist / 260, 0, 1);
    const out = this._out(s.gain * p.vol * (own ? 1.1 : 1), s.pan, 0.15 + far * 0.9 + (own ? p.tail * 0.3 : 0));
    const n = this._noise(t, p.dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = p.freq * (1 - far * 0.55) * rand(0.9, 1.1); bp.Q.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 11000 - far * 9500;
    const env = this._env(t, 1.6, 0.002, p.dur * (1 + far));
    n.connect(bp).connect(lp).connect(env).connect(out);
    if (s.dist < 120) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(p.bodyFreq, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      const og = this._env(t, p.body * (1 - s.dist / 120), 0.002, 0.16);
      o.connect(og).connect(out);
      o.start(t); o.stop(t + 0.2);
      this._track(o);
    }
  }

  explosion(x, y, z, size = 1) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 1200);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const far = clamp(s.dist / 400, 0, 1);
    const out = this._out(clamp(s.gain * 1.6 * size, 0, 2.2), s.pan, 0.4 + far);
    const n = this._noise(t, 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200 * (1 - far * 0.7), t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.8);
    const env = this._env(t, 1.8, 0.004, 1.9);
    n.connect(lp).connect(env).connect(out);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 0.8);
    const og = this._env(t, 1.8 * (1 - far * 0.6), 0.004, 0.9);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 1);
    this._track(o);
  }

  crumble(x, y, z, big = false) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 500);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = big ? 3.2 : 1.1;
    const out = this._out(s.gain * (big ? 1.4 : 0.8), s.pan, 0.5);
    const n = this._noise(t, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = big ? 500 : 900;
    const env = this._env(t, 1.2, 0.05, dur);
    n.connect(lp).connect(env).connect(out);
    // rattling debris
    for (let i = 0; i < (big ? 14 : 5); i++) {
      const tt = t + rand(0.05, dur * 0.8);
      const k = this._noise(tt, 0.08);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = rand(600, 2400); bp.Q.value = 3;
      const e = this._env(tt, rand(0.2, 0.6), 0.002, 0.08);
      k.connect(bp).connect(e).connect(out);
    }
  }

  // Rain: a hiss of drops with a soft roar under it, as loud as it rains; under a roof duller and further off
  setRain(level, cover = 0) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.rain) {
      if (level <= 0.01) return;
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf; n.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.value = 0;
      n.connect(hp).connect(lp).connect(g).connect(this.master);
      const n2 = ctx.createBufferSource();
      n2.buffer = this.noiseBuf; n2.loop = true; n2.playbackRate.value = 0.7;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 420;
      const g2 = ctx.createGain(); g2.gain.value = 0;
      n2.connect(lp2).connect(g2).connect(this.master);
      n.start(); n2.start();
      this.rain = { n, n2, lp, g, g2, level: -1, cover: -1 };
    }
    const R = this.rain;
    if (Math.abs(level - R.level) < 0.01 && Math.abs(cover - R.cover) < 0.02) return;
    R.level = level; R.cover = cover;
    R.g.gain.setTargetAtTime(level * (0.085 - 0.05 * cover), t, 0.4);
    R.g2.gain.setTargetAtTime(level * level * 0.1, t, 0.4);
    R.lp.frequency.setTargetAtTime(7000 - 5200 * cover, t, 0.3);
  }

  // Thunder (far: 0 overhead .. 1 far off): a crack and a long rolling rumble, all round you
  thunder(far = 0.5) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 3 + far * 3;
    const out = ctx.createGain(); out.gain.value = 0.55 - far * 0.3;
    out.connect(this.master);
    if (this.reverb) { const w = ctx.createGain(); w.gain.value = 0.5; out.connect(w).connect(this.reverb); }
    if (far < 0.45) {
      const k = this._noise(t, 0.4);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      k.connect(hp).connect(this._env(t, 0.9 - far, 0.002, 0.25)).connect(out);
    }
    const n = this._noise(t, dur + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(420 - far * 220, t); lp.frequency.linearRampToValueAtTime(90, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1.6, t + 0.15 + far * 0.5);
    for (let i = 1; i < 5; i++) env.gain.linearRampToValueAtTime(rand(0.5, 1.4) * (1 - i / 6), t + 0.3 + far * 0.5 + i * dur / 6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(env).connect(out);
  }

  // a skyscraper coming down: a deep roar that builds and goes on for as long as it falls, crashes in it
  collapse(x, y, z, dur = 10) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 3000);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(clamp(s.gain * 2.2, 0, 2.4), s.pan, 0.6);
    const n = this._noise(t, dur + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(140, t); lp.frequency.linearRampToValueAtTime(420, t + dur * 0.6); lp.frequency.linearRampToValueAtTime(120, t + dur + 2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(1, t + 1.2); env.gain.setValueAtTime(1, t + dur); env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2);
    n.connect(lp).connect(env).connect(out);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(26, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.9, t + 1); og.gain.setValueAtTime(0.9, t + dur); og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + dur + 2);
    this._track(o);
    for (let i = 0; i < dur * 2.5; i++) {
      const tt = t + rand(0.3, dur);
      const k = this._noise(tt, 0.5);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = rand(150, 1400); bp.Q.value = 1.5;
      const e = this._env(tt, rand(0.3, 0.8), 0.01, rand(0.2, 0.6));
      k.connect(bp).connect(e).connect(out);
    }
  }

  cannon(x, y, z) {
    this.explosion(x, y, z, 0.8);
    this.shot('sniper', x, y, z);
  }

  launch(x, y, z) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 400);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(s.gain * 0.9, s.pan, 0.3);
    const n = this._noise(t, 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    const env = this._env(t, 1, 0.01, 0.8);
    n.connect(bp).connect(env).connect(out);
  }

  impact(x, y, z, metal) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 40);
    if (!s || this.voices > 50) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(s.gain * 0.35, s.pan, 0.05);
    const n = this._noise(t, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = metal ? 3800 : 900; bp.Q.value = metal ? 6 : 1.2;
    const env = this._env(t, 1, 0.001, metal ? 0.12 : 0.05);
    n.connect(bp).connect(env).connect(out);
  }

  whiz(x, y, z) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 30);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(0.5, s.pan, 0.05);
    const n = this._noise(t, 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(rand(2500, 4000), t);
    bp.frequency.exponentialRampToValueAtTime(rand(900, 1500), t + 0.15);
    const env = this._env(t, 0.9, 0.01, 0.13);
    n.connect(bp).connect(env).connect(out);
  }

  footstep(x, y, z, vol = 1) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 30);
    if (!s || this.voices > 50) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(s.gain * 0.18 * vol, s.pan, 0);
    const n = this._noise(t, 0.07);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = rand(500, 900);
    const env = this._env(t, 1, 0.005, 0.06);
    n.connect(lp).connect(env).connect(out);
  }

  // Non-spatial UI cues
  _tone(freq, dur, type = 'square', vol = 0.15, delay = 0, freqEnd = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this._env(t, vol, 0.002, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this._track(o);
  }

  hit(head) {
    if (head) { this._tone(1900, 0.09, 'triangle', 0.22); this._tone(2600, 0.1, 'triangle', 0.16, 0.03); }
    else this._tone(1400, 0.04, 'square', 0.08);
  }
  kill() { this._tone(900, 0.06, 'triangle', 0.18); this._tone(1350, 0.09, 'triangle', 0.18, 0.06); }
  click() { this._tone(700, 0.03, 'square', 0.06); }
  empty() { this._tone(2400, 0.02, 'square', 0.05); }
  // Weapon handling sounds: magazine out/in, bolts, pumps, shells. Positional, so an enemy reloading
  // behind a wall can be heard up close. Each entry: [delay, kind, freq, dur, vol, sweepTo]
  foley(kind, x, y, z, own = false, pitch = 1) {
    if (!this.ready) return;
    const parts = FOLEY[kind];
    if (!parts) return;
    let gain = 1, pan = 0;
    if (!own) {
      const s = this._spatial(x, y, z, 38);
      if (!s || this.voices > 55) return;
      gain = s.gain * 1.6; pan = s.pan;
    }
    const ctx = this.ctx, t0 = ctx.currentTime;
    const out = this._out(gain * 0.5, pan, own ? 0.02 : 0.08);
    for (const [delay, type, f0, dur, vol, f1] of parts) {
      const t = t0 + delay, f = f0 * pitch;
      if (type === 'tone') {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t);
        if (f1) o.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dur);
        const e = this._env(t, vol, 0.001, dur);
        o.connect(e).connect(out);
        o.start(t); o.stop(t + dur + 0.02);
        this._track(o);
      } else {
        const n = this._noise(t, dur);
        const bp = ctx.createBiquadFilter();
        bp.type = type === 'low' ? 'lowpass' : 'bandpass';
        bp.Q.value = type === 'low' ? 0.7 : 6;
        bp.frequency.setValueAtTime(f, t);
        if (f1) bp.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dur);
        const e = this._env(t, vol, 0.001, dur);
        n.connect(bp).connect(e).connect(out);
      }
    }
  }
  // Kept for mods that call it: a generic three-part reload
  reload() { this.foley('out', 0, 0, 0, true); this.foley('in', 0, 0, 0, true); }
  capture() { this._tone(660, 0.14, 'triangle', 0.14); this._tone(990, 0.22, 'triangle', 0.14, 0.14); }
  lost() { this._tone(520, 0.16, 'sawtooth', 0.08); this._tone(350, 0.3, 'sawtooth', 0.08, 0.16); }
  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.15);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    const e = this._env(t, 0.9, 0.003, 0.14);
    n.connect(lp).connect(e).connect(this.master);
  }
  heartbeat() { this._tone(55, 0.12, 'sine', 0.35); this._tone(50, 0.14, 'sine', 0.28, 0.18); }

  _startWind() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.035;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    n.connect(bp).connect(g).connect(this.master);
    n.start(); lfo.start();
  }

  // Tank engine: one voice following the nearest tank
  setEngine(active, dist, throttle) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (!this.engine) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 36;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 54;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const g = ctx.createGain(); g.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.master);
      o1.start(); o2.start();
      this.engine = { o1, o2, lp, g };
    }
    const e = this.engine, t = ctx.currentTime;
    const vol = active ? clamp(1 - dist / 90, 0, 1) * (0.18 + Math.abs(throttle) * 0.12) : 0;
    // (only when it changed: four parameter changes every frame add up, on a phone above all)
    const th = Math.round(Math.abs(throttle) * 20), vk = Math.round(vol * 200);
    if (th === e.th && vk === e.vk) return;
    e.th = th; e.vk = vk;
    e.g.gain.setTargetAtTime(vol, t, 0.1);
    e.o1.frequency.setTargetAtTime(34 + Math.abs(throttle) * 22, t, 0.3);
    e.o2.frequency.setTargetAtTime(51 + Math.abs(throttle) * 30, t, 0.3);
    e.lp.frequency.setTargetAtTime(220 + Math.abs(throttle) * 260, t, 0.3);
  }

  // Distant battle ambience so the valley never feels empty
  ambient(dt) {
    if (!this.ready) return;
    this.nextDistant -= dt;
    if (this.nextDistant > 0) return;
    this.nextDistant = rand(0.6, 3.2);
    const a = Math.random() * Math.PI * 2, d = rand(350, 650);
    const x = this.lx + Math.cos(a) * d, z = this.lz + Math.sin(a) * d;
    if (Math.random() < 0.18) this.explosion(x, 0, z, 0.7);
    else {
      const kind = pick(['rifle', 'rifle', 'lmg', 'smg']);
      const n = Math.floor(rand(3, 9));
      for (let i = 0; i < n; i++) setTimeout(() => this.shot(kind, x, 0, z), i * rand(70, 110));
    }
  }
}
