(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, D = KK.dsp, A = KK.audio;

  /*
   * Lo-fi chill radio. Six procedurally arranged tracks, each with its own tempo,
   * chord loop, keys + lead instrument, drum feel and ambience (rain, vinyl, night).
   * Everything is synthesized: FM Rhodes, felt piano, nylon guitar (Karplus-Strong),
   * kalimba, vibraphone, warm sine bass, soft pads and dusty drums — then swung,
   * kick-pumped, tape-wobbled and low-passed. Tracks play as a playlist; each new
   * track starts with a drum-less intro and melodies come and go between loops.
   */
  const M = (KK.music = { playing: false, mode: 'menu', level: 1, onTrack: null });

  const NOTE = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
  const QUAL = {
    maj9: [0, 4, 7, 11, 14], maj7: [0, 4, 7, 11], 'maj9#11': [0, 4, 11, 14, 18], m9: [0, 3, 7, 10, 14], m7: [0, 3, 7, 10],
    m11: [0, 3, 10, 14, 17], 13: [0, 4, 10, 14, 21], '7b9': [0, 4, 7, 10, 13], '7alt': [0, 4, 10, 15, 20], 6: [0, 4, 7, 9, 14],
  };
  const PENTA = { maj: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10] };

  const TRACKS = [
    { name: 'rainy window', bpm: 72, swing: 0.58, key: 0, scale: 'maj', prog: [['F', 'maj9'], ['E', 'm7'], ['D', 'm9'], ['C', 'maj9']], keys: 'ep', lead: 'kalimba', pad: true, amb: 'rain', drums: 'boombap', bass: 'walk', comp: [[0, 1, 14], [10, 0.55, 6]], lp: 3600, loops: 9 },
    { name: 'late night ramen', bpm: 80, swing: 0.6, key: 0, scale: 'maj', prog: [['D', 'm9'], ['G', '13'], ['C', 'maj9'], ['A', '7b9']], keys: 'ep', lead: 'vibes', pad: false, amb: 'vinyl', drums: 'busy', bass: 'busy', comp: [[0, 0.9, 7], [7, 0.7, 5], [12, 0.6, 4]], lp: 4200, loops: 9 },
    { name: 'jeepney sunset', bpm: 86, swing: 0.56, key: 3, scale: 'maj', prog: [['Eb', 'maj9'], ['C', 'm9'], ['F', 'm9'], ['Bb', '13']], keys: 'guitar', lead: 'ep', pad: false, amb: 'vinyl', drums: 'boombap', bass: 'walk', comp: [[0, 1, 6], [6, 0.6, 4], [10, 0.75, 4], [14, 0.5, 2]], lp: 5000, loops: 10 },
    { name: 'sari-sari dusk', bpm: 74, swing: 0.6, key: 9, scale: 'min', prog: [['A', 'm9'], ['F', 'maj9'], ['C', 'maj9'], ['G', '6']], keys: 'piano', lead: 'vibes', pad: true, amb: 'night', drums: 'halftime', bass: 'long', comp: [[0, 0.9, 16]], lp: 3400, loops: 9 },
    { name: 'study session', bpm: 70, swing: 0.62, key: 7, scale: 'maj', prog: [['G', 'maj9'], ['B', 'm7'], ['E', 'm9'], ['C', 'maj9#11']], keys: 'piano', lead: 'ep', pad: false, amb: 'rain', ambLevel: 0.6, drums: 'boombap', bass: 'walk', comp: [[0, 0.95, 10], [10, 0.6, 6]], lp: 3200, loops: 10 },
    { name: 'typhoon season', bpm: 66, swing: 0.58, key: 0, scale: 'min', prog: [['C', 'm9'], ['Ab', 'maj9'], ['Eb', 'maj9'], ['G', '7alt']], keys: 'ep', lead: 'kalimba', pad: true, amb: 'rain', ambLevel: 1.3, drums: 'halftime', bass: 'long', comp: [[0, 1, 16]], lp: 3000, loops: 8 },
  ];
  M.tracks = TRACKS.map((t) => t.name);

  const DRUMS = {
    boombap: (bar) => ({ kick: bar % 2 ? [0, 7, 10] : [0, 10], snare: [4, 12], rim: [], hats: [0, 2, 4, 6, 8, 10, 12, 14], ghost: [15], open: bar === 3 ? [14] : [] }),
    busy: (bar) => ({ kick: bar % 2 ? [0, 3, 10] : [0, 10, 13], snare: [4, 12], rim: [7, 15], hats: [...Array(16).keys()], ghost: [], open: bar % 2 ? [] : [6] }),
    halftime: (bar) => ({ kick: [0, 11], snare: [8], rim: bar % 2 ? [14] : [], hats: [0, 2, 4, 6, 8, 10, 12, 14], ghost: [7], open: [] }),
  };

  /* -------------------------------- instruments -------------------------------- */
  const cache = {};
  const mtof = D.mtof;

  function make(key, secs, fn, peak) {
    if (cache[key]) return cache[key];
    const SR = A.SR, len = Math.floor(SR * secs), out = new Float32Array(len);
    fn(out, SR, len);
    const p = D.peak(out) || 1;
    for (let i = 0; i < len; i++) out[i] *= (peak || 0.5) / p;
    const fade = Math.floor(SR * 0.03);
    for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    return (cache[key] = { buf: A.toBuffer(out), rate: 1 });
  }

  // FM electric piano: a mellow tine with a soft bell attack and gentle tremolo
  const ep = (m) => make('ep' + m, 3.2, (o, SR, len) => {
    const f = mtof(m);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const I = 1.5 * Math.exp(-t * 3.5) + 0.22;
      const x = Math.sin(2 * Math.PI * f * t + I * Math.sin(2 * Math.PI * f * t));
      const tine = 0.1 * Math.sin(2 * Math.PI * f * 7.1 * t) * Math.exp(-t * 14);
      const env = Math.min(1, t / 0.004) * Math.exp(-t * (0.85 + f / 2200));
      o[i] = (x + tine) * env * (1 - 0.1 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.2 * t)));
    }
  });

  // felt piano: slightly inharmonic partials, soft hammer, dark
  const piano = (m) => make('pn' + m, 3.4, (o, SR, len) => {
    const f = mtof(m), R = U.rng(m * 31);
    for (let n = 1; n <= 7; n++) {
      const fn = f * n * Math.sqrt(1 + 0.0003 * n * n), a = 1 / Math.pow(n, 1.35), d = 1.1 + 0.55 * n + f / 1500;
      if (fn > SR * 0.45) break;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        o[i] += a * Math.sin(2 * Math.PI * fn * t) * Math.exp(-t * d);
      }
    }
    for (let i = 0; i < Math.min(len, SR * 0.012); i++) o[i] += (R() * 2 - 1) * 0.08 * (1 - i / (SR * 0.012));
    for (let i = 0; i < Math.min(len, SR * 0.006); i++) o[i] *= i / (SR * 0.006);
    D.filter(o, D.biquad('lowpass', 2400, 0.7, SR));
  });

  // nylon guitar (Karplus-Strong)
  function guitar(m) {
    const k = 'gt' + m;
    if (cache[k]) return cache[k];
    const SR = A.SR, R = U.rng(m * 7), f = mtof(m);
    const N = Math.max(2, Math.round(SR / f - 0.5)), realF = SR / (N + 0.5);
    const len = Math.floor(SR * 2.2), out = new Float32Array(len), line = new Float32Array(N);
    let lp = 0, mean = 0;
    for (let i = 0; i < N; i++) { lp += (R() * 2 - 1 - lp) * 0.4; line[i] = lp; mean += lp / N; }
    for (let i = 0; i < N; i++) line[i] -= mean;
    const damp = Math.pow(10, -3 / (realF * 1.8));
    for (let i = 0, idx = 0; i < len; i++) {
      const a = line[idx], b = line[(idx + 1) % N];
      out[i] = a;
      line[idx] = damp * 0.5 * (a + b);
      idx = (idx + 1) % N;
    }
    D.filter(out, D.biquad('peaking', 220, 1, SR, 4));
    D.filter(out, D.biquad('lowpass', 3000, 0.7, SR));
    const p = D.peak(out) || 1;
    for (let i = 0; i < len; i++) out[i] *= 0.5 / p;
    return (cache[k] = { buf: A.toBuffer(out), rate: f / realF });
  }

  // kalimba: bright plucked tine with a quick metallic overtone
  const kalimba = (m) => make('kl' + m, 2.0, (o, SR, len) => {
    const f = mtof(m);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      o[i] = Math.min(1, t / 0.002) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) + 0.22 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 11) + 0.08 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 4));
    }
  });

  // vibraphone: sine + 4th partial with motor tremolo
  const vibes = (m) => make('vb' + m, 2.6, (o, SR, len) => {
    const f = mtof(m);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const trem = 1 - 0.25 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4.8 * t));
      o[i] = Math.min(1, t / 0.003) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.4) * trem + 0.22 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 6));
    }
  });

  // warm round bass, a little saturated
  const bass = (m) => make('bs' + m, 3, (o, SR, len) => {
    const f = mtof(m);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const x = Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(4 * Math.PI * f * t) + 0.08 * Math.sin(6 * Math.PI * f * t);
      o[i] = Math.tanh(1.4 * x) * Math.min(1, t / 0.008) * Math.exp(-t * 0.7);
    }
    D.filter(o, D.biquad('lowpass', 650, 0.7, SR));
  }, 0.6);

  const INSTR = { ep, piano, guitar, kalimba, vibes };

  // dusty drums
  const kick = () => make('kick', 0.5, (o, SR, len) => {
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (46 + 70 * Math.exp(-t / 0.035))) / SR;
      o[i] = Math.sin(ph) * Math.exp(-t * 6.5) * Math.min(1, t / 0.002);
    }
    D.filter(o, D.biquad('lowpass', 900, 0.7, SR));
  }, 0.9);
  const snare = () => make('snare', 0.4, (o, SR, len) => {
    const R = U.rng(3), n = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      o[i] = 0.5 * Math.sin(2 * Math.PI * (175 + 20 * Math.exp(-t * 40)) * t) * Math.exp(-t * 20);
      n[i] = (R() * 2 - 1) * Math.exp(-t * 13);
    }
    D.filter(n, D.biquad('bandpass', 1900, 0.7, SR));
    for (let i = 0; i < len; i++) o[i] += n[i] * 1.6;
    D.filter(o, D.biquad('lowpass', 4500, 0.7, SR));
  }, 0.7);
  const rim = () => make('rim', 0.15, (o, SR, len) => {
    const ex = new Float32Array(len);
    D.pulse(ex, 0, 1, 3);
    D.resonate(ex, o, 1700, 0.018, 1, SR);
    D.resonate(ex, o, 3300, 0.008, 0.35, SR);
    D.filter(o, D.biquad('lowpass', 5000, 0.7, SR));
  }, 0.5);
  const hat = (open) => make(open ? 'hatO' : 'hatC', open ? 0.45 : 0.12, (o, SR, len) => {
    const R = U.rng(open ? 9 : 8);
    for (let i = 0; i < len; i++) o[i] = (R() * 2 - 1) * Math.exp(-(i / SR) * (open ? 8 : 55));
    D.filter(o, D.biquad('highpass', 6500, 0.7, SR));
    D.filter(o, D.biquad('lowpass', 11000, 0.7, SR));
  }, 0.4);

  /* --------------------------------- ambience --------------------------------- */
  function ambLoop(kind) {
    return make('amb-' + kind, 8, (o, SR, len) => {
      const R = U.rng(kind.length * 77);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = R() * 2 - 1;
        // pinkish noise bed
        b0 = 0.997 * b0 + w * 0.03; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
        o[i] = (b0 + b1 + b2 + w * 0.02) * (kind === 'rain' ? 1 : kind === 'night' ? 0.35 : 0.25);
      }
      if (kind === 'rain') {
        D.filter(o, D.biquad('bandpass', 2200, 0.5, SR));
        const ex = new Float32Array(len);
        for (let k = 0; k < 8 * 28; k++) ex[Math.floor(R() * len)] = (R() * 0.6 + 0.2) * (R() < 0.5 ? -1 : 1);
        D.resonate(ex, o, 3200, 0.004, 0.25, SR);
        D.resonate(ex, o, 5200, 0.003, 0.15, SR);
      } else D.filter(o, D.biquad('lowpass', kind === 'night' ? 1200 : 3000, 0.7, SR));
      if (kind === 'night') {
        // crickets: chirp trains around 4.6 kHz
        for (let s = R() * 0.4; s < 7.6; s += 0.7 + R() * 0.6) {
          const f = 4400 + R() * 500;
          for (let p = 0; p < 3 + Math.floor(R() * 2); p++) {
            const st = Math.floor((s + p * 0.05) * SR);
            for (let i = 0; i < SR * 0.03 && st + i < len; i++) o[st + i] += 0.12 * Math.sin(2 * Math.PI * f * (i / SR)) * Math.sin((Math.PI * i) / (SR * 0.03));
          }
        }
      }
      // vinyl crackle on every bed
      for (let i = 0; i < len; i++) {
        if (R() < 0.00025) {
          const amp = 0.15 + R() * 0.45, sg = R() < 0.5 ? -1 : 1;
          for (let k = 0; k < 20 && i + k < len; k++) o[i + k] += sg * amp * Math.exp(-k / 3) * (k % 2 ? -0.6 : 1);
        }
      }
    }, 0.35);
  }

  /* ------------------------------------ bus ------------------------------------ */
  let musicIn, tonal, pump, lp, dipGain, ambBus, leadIn, timer = null;
  const ambSrc = {};
  function setupBus() {
    if (musicIn) return;
    const ctx = A.ctx;
    musicIn = ctx.createGain();
    musicIn.gain.value = 0.6;
    lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    lp.frequency.value = 3600;
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowshelf';
    warm.frequency.value = 180;
    warm.gain.value = 3;
    const sat = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = Math.tanh(x * 1.5) / Math.tanh(1.5);
    }
    sat.curve = c;
    dipGain = ctx.createGain();
    musicIn.connect(warm).connect(lp).connect(sat).connect(dipGain).connect(A.musicBus);

    // keys/bass/lead are pumped by the kick (sidechain feel); drums go straight in
    pump = ctx.createGain();
    pump.connect(musicIn);
    tonal = ctx.createGain();
    tonal.connect(pump);

    // lead gets a soft dotted-eighth echo
    leadIn = ctx.createGain();
    leadIn.connect(tonal);
    const echo = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain();
    const elp = ctx.createBiquadFilter();
    elp.type = 'lowpass';
    elp.frequency.value = 2500;
    fb.gain.value = 0.3;
    wet.gain.value = 0.25;
    leadIn.connect(echo);
    echo.connect(elp).connect(fb).connect(echo);
    elp.connect(wet).connect(tonal);
    M._echo = echo;

    ambBus = ctx.createGain();
    ambBus.gain.value = 0;
    ambBus.connect(dipGain);
  }

  // gentle tape wow & flutter applied to every note's pitch
  const wow = (t) => 1 + 0.0028 * Math.sin(t * 2 * Math.PI * 0.4) + 0.0012 * Math.sin(t * 2 * Math.PI * 3.3);

  function play(item, t, gain, dest, len, rel) {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = item.buf;
    src.playbackRate.value = item.rate * wow(t);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest || tonal);
    const at = Math.max(t, ctx.currentTime);
    src.start(at);
    if (len) {
      g.gain.setTargetAtTime(0, at + len, rel || 0.12);
      src.stop(at + len + (rel || 0.12) * 8);
    }
  }

  function padChord(notes, t, dur, vol) {
    const ctx = A.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.9);
    g.gain.setValueAtTime(vol, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    f.connect(g).connect(tonal);
    notes.forEach((n) =>
      [-7, 7].forEach((cents) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(n) * Math.pow(2, cents / 1200);
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.4);
      })
    );
  }

  /* ---------------------------------- song state ---------------------------------- */
  let tr = null, trIdx = 0, step = 0, nextTime = 0, loop = 0, melA = null, melB = null;

  const chordOf = (c) => ({ root: NOTE[c[0]], q: QUAL[c[1]] });
  function voicing(ch) {
    const notes = ch.q.slice(1).map((iv) => {
      let n = 48 + ch.root + iv;
      while (n < 54) n += 12;
      while (n > 72) n -= 12;
      return n;
    });
    return [...new Set(notes)].sort((a, b) => a - b);
  }
  const bassRoot = (ch) => {
    let r = 36 + ch.root;
    if (r > 45) r -= 12;
    return r;
  };

  // a sparse 4-bar motif on the 8th-note grid; B is a variation of A
  function makeMelody(t, seed) {
    const R = U.rng(seed);
    const scale = PENTA[t.scale].map((s) => (s + t.key) % 12);
    const mel = {};
    let prev = 74 + (t.key % 5);
    for (let bar = 0; bar < 4; bar++) {
      const ch = chordOf(t.prog[bar]);
      const tones = ch.q.map((iv) => (ch.root + iv) % 12);
      const slots = bar === 3 ? [0, 6] : [[0, 6, 10], [2, 6, 8, 12], [4, 6, 10, 14], [0, 3, 6, 10]][Math.floor(R() * 4)];
      slots.forEach((s, i) => {
        if (R() < 0.18) return; // rests keep it airy
        const strong = s % 8 === 0 || i === slots.length - 1;
        const pool = strong ? tones : scale;
        let target = prev + [-3, -2, -1, 1, 2, 3, 5, -5][Math.floor(R() * 8)];
        if (target > 86) target -= 7;
        if (target < 67) target += 7;
        let best = target, bd = 99;
        for (let n = 64; n <= 88; n++) {
          if (!pool.includes(n % 12)) continue;
          const d = Math.abs(n - target);
          if (d < bd) { bd = d; best = n; }
        }
        prev = best;
        mel[bar * 16 + s] = { n: best, len: strong ? 6 + Math.floor(R() * 6) : 2 + Math.floor(R() * 3), v: 0.75 + R() * 0.25 };
      });
    }
    return mel;
  }

  function setTrack(i) {
    trIdx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    tr = TRACKS[trIdx];
    melA = makeMelody(tr, 100 + trIdx * 13);
    const b = {};
    Object.entries(makeMelody(tr, 500 + trIdx * 17)).forEach(([k, v]) => (k < 32 ? null : (b[k] = v)));
    Object.entries(melA).forEach(([k, v]) => k < 32 && (b[k] = v)); // B: same opening, new answer
    melB = b;
    step = 0;
    loop = 0;
    const now = A.ctx.currentTime;
    lp.frequency.setTargetAtTime(tr.lp, now, 0.8);
    M._echo.delayTime.setValueAtTime((60 / tr.bpm) * 0.75, now);
    ['rain', 'vinyl', 'night'].forEach((k) => {
      if (!ambSrc[k]) {
        const s = A.ctx.createBufferSource();
        s.buffer = ambLoop(k).buf;
        s.loop = true;
        const g = A.ctx.createGain();
        g.gain.value = 0;
        s.connect(g).connect(ambBus);
        s.start();
        ambSrc[k] = g;
      }
      const target = k === tr.amb ? 0.55 * (tr.ambLevel || 1) : k === 'vinyl' ? 0.25 : 0;
      ambSrc[k].gain.setTargetAtTime(target, now, 1.2);
    });
    if (M.onTrack) M.onTrack(tr.name, trIdx);
  }

  const d16 = () => 60 / tr.bpm / 4;

  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % 4, k = s % 16;
    const ch = chordOf(tr.prog[bar]), next = chordOf(tr.prog[(bar + 1) % 4]);
    const intro = loop === 0;
    const R = Math.random;
    const dur = d16();
    const drumVol = M.mode === 'game' ? 1 : 0.8;

    // keys
    tr.comp.forEach(([st, v, len]) => {
      if (st !== k) return;
      const inst = INSTR[tr.keys];
      voicing(ch).forEach((n, i) => play(inst(n), t + i * (tr.keys === 'guitar' ? 0.012 : 0.006) + R() * 0.006, 0.14 * v * (0.85 + R() * 0.25), tonal, len * dur * 1.1, 0.25));
    });
    if (tr.pad && k === 0) padChord(voicing(ch), t, dur * 16, 0.018);

    // bass (enters after the intro)
    if (!intro) {
      const r = bassRoot(ch), nr = bassRoot(next);
      const pat = { walk: [[0, r, 9], [10, r, 3], [14, nr - 1 === r ? nr + 2 : nr - 1, 2]], busy: [[0, r, 3], [3, r + 12, 2], [7, r + 7, 3], [10, r, 3], [14, nr + 2, 2]], long: [[0, r, 13], [14, nr - 1, 2]] }[tr.bass];
      pat.forEach(([st, n, len]) => st === k && play(bass(n), t, 0.33, tonal, len * dur, 0.08));
    }

    // drums (enter after the intro), swung by the caller
    if (!intro) {
      const p = DRUMS[tr.drums](bar);
      if (p.kick.includes(k)) {
        play(kick(), t, 0.42 * drumVol, musicIn);
        // sidechain-style pump on the tonal bus
        pump.gain.cancelScheduledValues(t);
        pump.gain.setValueAtTime(0.7, t);
        pump.gain.setTargetAtTime(1, t + 0.03, 0.13);
      }
      if (p.snare.includes(k)) play(snare(), t + 0.012, 0.28 * drumVol, musicIn);
      if (p.rim.includes(k)) play(rim(), t, 0.1 * drumVol, musicIn);
      if (p.open.includes(k)) play(hat(true), t, 0.06 * drumVol, musicIn);
      else if (p.hats.includes(k)) play(hat(false), t, (k % 4 === 0 ? 0.08 : 0.05) * (0.7 + R() * 0.4) * drumVol, musicIn);
      else if (p.ghost.includes(k) && R() < 0.35) play(hat(false), t, 0.03 * drumVol, musicIn);
    }

    // lead melody: A, B, rest, A, B, … so the hook comes and goes
    if (!intro && loop % 3 !== 0) {
      const mel = loop % 3 === 1 ? melA : melB;
      const m = mel[s % 64];
      if (m) play(INSTR[tr.lead](m.n), t + R() * 0.01, 0.16 * m.v, leadIn, m.len * dur * 1.3, 0.3);
    }
  }

  function tick() {
    advance(A.ctx.currentTime + 0.3);
  }

  function advance(until) {
    while (nextTime < until) {
      const swing = step % 2 ? (tr.swing - 0.5) * 2 * d16() : 0;
      scheduleStep(step, nextTime + swing);
      nextTime += d16();
      step++;
      if (step % 64 === 0) {
        loop++;
        if (loop >= tr.loops) setTrack(trIdx + 1);
      }
    }
  }

  /* ----------------------------------- public ----------------------------------- */
  M.start = function () {
    if (!A.ready || M.playing) return;
    setupBus();
    M.playing = true;
    if (!tr) setTrack(Math.floor(Math.random() * TRACKS.length));
    nextTime = A.ctx.currentTime + 0.15;
    timer = setInterval(tick, 25);
    const now = A.ctx.currentTime;
    musicIn.gain.setTargetAtTime(0.6, now, 0.3);
    ambBus.gain.setTargetAtTime(1, now, 0.8);
  };

  M.stop = function () {
    if (!M.playing) return;
    M.playing = false;
    clearInterval(timer);
    const now = A.ctx.currentTime;
    musicIn.gain.setTargetAtTime(0, now, 0.2);
    ambBus.gain.setTargetAtTime(0, now, 0.3);
  };

  // new level / round → a different track; back to the menu keeps the vibe going
  M.setMode = function (mode, level) {
    const changed = mode !== M.mode || (level && level !== M.level);
    M.mode = mode;
    if (level) M.level = level;
    if (!changed || !M.playing) return;
    if (mode === 'game') {
      setTrack((M.level - 1) % TRACKS.length);
      nextTime = A.ctx.currentTime + 0.15;
    }
  };

  M.next = function () {
    if (!M.playing) return;
    setTrack(trIdx + 1);
    nextTime = A.ctx.currentTime + 0.15;
  };
  M.current = () => (tr ? tr.name : TRACKS[0].name);
  // test hook: schedule ahead (used to render the mix offline)
  M._prefill = (secs) => advance(nextTime + secs);
  M._track = (i) => setTrack(i);

  M.duck = function (on) {
    if (!musicIn) return;
    const now = A.ctx.currentTime;
    musicIn.gain.setTargetAtTime(on ? 0.25 : 0.6, now, 0.15);
    ambBus.gain.setTargetAtTime(on ? 0.5 : 1, now, 0.2);
  };

  // brief dip so the announcer cuts through
  M.dip = function (secs, level) {
    if (!dipGain) return;
    const t = A.ctx.currentTime;
    dipGain.gain.cancelScheduledValues(t);
    dipGain.gain.setTargetAtTime(level === undefined ? 0.5 : level, t, 0.03);
    dipGain.gain.setTargetAtTime(1, t + secs, 0.25);
  };
})();
