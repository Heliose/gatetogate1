/* ------------------------------------------------------------------ *
 * Synthesized ambience (WebAudio, no files): wind, distant jets, a
 * basement hum, drone buzz, plus short cues. Everything is off until
 * the user enables sound (a gesture unlocks the context).
 * ------------------------------------------------------------------ */
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.beds = {};
    this.levels = { wind: 0, jets: 0, hum: 0, drone: 0, room: 0 };
  }
  enable() {
    if (this.ctx) { this.ctx.resume(); this.enabled = true; this.master.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.4); return; }
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain();
    this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor();
    this.master.connect(comp).connect(C.destination);
    this.master.gain.setTargetAtTime(0.8, C.currentTime, 0.6);
    // noise source
    const len = C.sampleRate * 4;
    const buf = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    const mkBed = (filterType, freq, q, gain0 = 0) => {
      const src = C.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = C.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = C.createGain();
      g.gain.value = gain0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { src, f, g };
    };
    this.beds.wind = mkBed('lowpass', 420, 0.6);
    this.beds.jets = mkBed('lowpass', 140, 0.8);
    this.beds.room = mkBed('bandpass', 260, 1.2);
    // hum (basement machinery)
    const hum = C.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 55;
    const hf = C.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 220;
    const hg = C.createGain();
    hg.gain.value = 0;
    hum.connect(hf).connect(hg).connect(this.master);
    hum.start();
    this.beds.hum = { g: hg };
    // drone buzz
    const dr = C.createOscillator();
    dr.type = 'square';
    dr.frequency.value = 180;
    const dr2 = C.createOscillator();
    dr2.type = 'sawtooth';
    dr2.frequency.value = 183;
    const df = C.createBiquadFilter();
    df.type = 'bandpass';
    df.frequency.value = 900;
    df.Q.value = 1.4;
    const dg = C.createGain();
    dg.gain.value = 0;
    dr.connect(df); dr2.connect(df); df.connect(dg).connect(this.master);
    dr.start(); dr2.start();
    this.beds.drone = { g: dg, osc: dr };
    // slow wind wobble
    const lfo = C.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = C.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(this.beds.wind.f.frequency);
    lfo.start();
    this.enabled = true;
    this.apply();
  }
  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }
  /* set bed levels 0..1 */
  mix(levels, ms = 1200) {
    Object.assign(this.levels, levels);
    this.apply(ms / 1000);
  }
  apply(tc = 0.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.levels;
    this.beds.wind?.g.gain.setTargetAtTime(L.wind * 0.22, t, tc);
    this.beds.jets?.g.gain.setTargetAtTime(L.jets * 0.5, t, tc);
    this.beds.room?.g.gain.setTargetAtTime(L.room * 0.12, t, tc);
    this.beds.hum?.g.gain.setTargetAtTime(L.hum * 0.05, t, tc);
    this.beds.drone?.g.gain.setTargetAtTime(L.drone * 0.025, t, tc);
  }
  /* one-shot cues */
  cue(kind) {
    if (!this.ctx || !this.enabled) return;
    const C = this.ctx, t = C.currentTime;
    const g = C.createGain();
    g.connect(this.master);
    if (kind === 'whoosh') {
      const src = C.createBufferSource();
      src.buffer = this.beds.wind.src.buffer;
      const f = C.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.5;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
      src.connect(f).connect(g);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      src.start(t);
      src.stop(t + 1.5);
    } else if (kind === 'chime' || kind === 'ping' || kind === 'alert') {
      const notes = kind === 'chime' ? [660, 880, 1320] : kind === 'ping' ? [1760] : [440, 440];
      notes.forEach((f0, i) => {
        const o = C.createOscillator();
        o.type = 'sine';
        o.frequency.value = f0;
        const og = C.createGain();
        const t0 = t + i * (kind === 'alert' ? 0.22 : 0.09);
        og.gain.setValueAtTime(0, t0);
        og.gain.linearRampToValueAtTime(kind === 'alert' ? 0.12 : 0.09, t0 + 0.01);
        og.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 'alert' ? 0.18 : 0.8));
        o.connect(og).connect(g);
        o.start(t0);
        o.stop(t0 + 1);
      });
      g.gain.value = 1;
    } else if (kind === 'scan') {
      const o = C.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.linearRampToValueAtTime(880, t + 1.6);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.2);
      g.gain.linearRampToValueAtTime(0.0, t + 1.8);
      o.connect(g);
      o.start(t);
      o.stop(t + 1.9);
    }
  }
}

/* Spoken captions via speechSynthesis */
export class Narrator {
  constructor() { this.enabled = false; }
  speak(text) {
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const plain = text.replace(/<[^>]+>/g, '');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.rate = 0.96;
    u.pitch = 0.95;
    const v = speechSynthesis.getVoices().find((x) => /en[-_](GB|US)/.test(x.lang) && /Google|Daniel|Samantha|Natural/i.test(x.name)) || speechSynthesis.getVoices().find((x) => x.lang.startsWith('en'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  stop() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}
