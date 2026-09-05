/* ==========================================================================
   audio.js - som 100% sintetizado com WebAudio (nenhum arquivo externo).
   ========================================================================== */
'use strict';
var G = window.G;

G.Audio = {
  ctx: null, master: null, ready: false, muted: false,
  noise: null, engine: null, siren: null, ambient: null,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    /* buffer de ruido branco reutilizado */
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    this._buildEngine();
    this._buildSiren();
    this._buildAmbient();
    this.ready = true;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; },

  /* ------------------------------------------------------------- motor */
  _buildEngine() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 700; filt.Q.value = 3;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 30;
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const rumble = c.createBufferSource(); rumble.buffer = this.noise; rumble.loop = true;
    const rg = c.createGain(); rg.gain.value = 0.06;
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 180;
    o1.connect(filt); o2.connect(g2); g2.connect(filt);
    rumble.connect(rf); rf.connect(rg); rg.connect(filt);
    filt.connect(g); g.connect(this.master);
    o1.start(); o2.start(); rumble.start();
    this.engine = { g, filt, o1, o2 };
  },
  engineUpdate(active, rpm, load) {
    if (!this.ready) return;
    const e = this.engine, t = this.ctx.currentTime;
    const target = active ? 0.09 + load * 0.06 : 0;
    e.g.gain.setTargetAtTime(target, t, 0.08);
    if (active) {
      e.o1.frequency.setTargetAtTime(48 + rpm * 150, t, 0.05);
      e.o2.frequency.setTargetAtTime(24 + rpm * 75, t, 0.05);
      e.filt.frequency.setTargetAtTime(420 + rpm * 1500, t, 0.06);
    }
  },

  /* ------------------------------------------------------------ sirene */
  _buildSiren() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 700;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 1.4;
    const lg = c.createGain(); lg.gain.value = 240;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.4;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.siren = { g, o };
  },
  sirenLevel(v) {
    if (!this.ready) return;
    this.siren.g.gain.setTargetAtTime(G.clamp(v, 0, 1) * 0.05, this.ctx.currentTime, 0.15);
  },

  /* ------------------------------------------------------- helicoptero */
  _buildHeli() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 4;
    const g = c.createGain(); g.gain.value = 0;
    const chop = c.createGain(); chop.gain.value = 1;
    const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 13;
    const lg = c.createGain(); lg.gain.value = 0.85;
    lfo.connect(lg); lg.connect(chop.gain);
    src.connect(f); f.connect(chop); chop.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.heli = { g };
  },
  heliLevel(v) {
    if (!this.ready) return;
    if (!this.heli) this._buildHeli();
    this.heli.g.gain.setTargetAtTime(G.clamp(v, 0, 1) * 0.11, this.ctx.currentTime, 0.2);
  },

  /* ---------------------------------------------------------- ambiente */
  _buildAmbient() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.012;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.ambient = { g };
  },

  /* ----------------------------------------------------------- efeitos */
  _burst(dur, freq, q, vol, type) {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = G.rnd(0.85, 1.15);
    const f = c.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
    return { f, g, t };
  },
  _tone(freq, freq2, dur, vol, type) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  gunshot(kind, vol) {
    if (!this.ready || this.muted) return;
    vol = vol === undefined ? 1 : vol;
    if (kind === 'shotgun') { this._burst(0.35, 700, 0.7, 0.5 * vol); this._tone(180, 40, 0.3, 0.35 * vol, 'square'); }
    else if (kind === 'rifle') { this._burst(0.16, 1800, 1.2, 0.4 * vol); this._tone(240, 60, 0.14, 0.25 * vol, 'square'); }
    else if (kind === 'uzi') { this._burst(0.09, 2400, 1.6, 0.28 * vol); }
    else if (kind === 'sniper') { this._burst(0.5, 900, 0.6, 0.55 * vol); this._tone(150, 40, 0.5, 0.3 * vol, 'sawtooth'); }
    else { this._burst(0.12, 1600, 1.0, 0.34 * vol); this._tone(200, 55, 0.1, 0.2 * vol, 'square'); }
  },
  explosion(vol) {
    if (!this.ready || this.muted) return;
    vol = vol === undefined ? 1 : vol;
    const b = this._burst(1.4, 260, 0.4, 0.85 * vol, 'lowpass');
    b.f.frequency.exponentialRampToValueAtTime(45, b.t + 1.2);
    this._tone(90, 25, 1.1, 0.5 * vol, 'sine');
  },
  punch(vol) { if (this.ready && !this.muted) { this._burst(0.09, 320, 1.2, 0.35 * (vol || 1), 'lowpass'); } },
  hitFlesh() { if (this.ready && !this.muted) this._burst(0.14, 480, 0.8, 0.3, 'lowpass'); },
  step(vol) { if (this.ready && !this.muted) this._burst(0.05, 1200, 2.5, 0.07 * (vol || 1)); },
  skid(v) { if (this.ready && !this.muted) this._burst(0.2, 2600, 1.4, 0.06 * v); },
  crash(v) { if (this.ready && !this.muted) { this._burst(0.3, 900, 0.5, G.clamp(v, 0, 1) * 0.45); this._tone(150, 50, 0.25, 0.2 * v, 'square'); } },
  pickup() { if (this.ready && !this.muted) { this._tone(660, 1320, 0.16, 0.18, 'triangle'); } },
  cash() { if (this.ready && !this.muted) { this._tone(880, 1760, 0.12, 0.16, 'square'); setTimeout(() => this._tone(1320, 1980, 0.1, 0.1, 'square'), 70); } },
  ui() { if (this.ready && !this.muted) this._tone(520, 520, 0.05, 0.1, 'square'); },
  bad() { if (this.ready && !this.muted) this._tone(220, 90, 0.35, 0.2, 'sawtooth'); },
  horn(v) { if (this.ready && !this.muted) { this._tone(400, 400, 0.4, 0.12 * (v || 1), 'square'); this._tone(500, 500, 0.4, 0.09 * (v || 1), 'square'); } },
  reload() { if (this.ready && !this.muted) { this._burst(0.06, 3000, 3, 0.12); setTimeout(() => this._burst(0.07, 1500, 3, 0.14), 140); } },
  wanted() { if (this.ready && !this.muted) { this._tone(300, 600, 0.18, 0.16, 'square'); setTimeout(() => this._tone(600, 900, 0.18, 0.14, 'square'), 160); } }
};
