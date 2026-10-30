(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const A = KK.audio, D = KK.dsp;

  // Chip-style game sounds to match the 8-bit soundtrack.
  const X = (KK.sfx = {});

  function tone(freq, at, dur, o) {
    if (!A.ready) return;
    o = o || {};
    const ctx = A.ctx, t = ctx.currentTime + (at || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain();
    const v = o.vol === undefined ? 0.08 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.003));
    g.gain.setValueAtTime(v, t + dur * (o.hold || 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lp || 7000;
    osc.connect(g).connect(lp).connect(A.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  const note = (m, at, dur, o) => tone(D.mtof(m), at, dur, o);

  function noise(at, dur, vol, from, to) {
    if (!A.ready) return;
    const ctx = A.ctx, t = ctx.currentTime + at;
    const len = Math.floor(A.SR * dur);
    const b = ctx.createBuffer(1, len, A.SR);
    const d = b.getChannelData(0);
    let reg = 1, bit = 1;
    for (let i = 0; i < len; i++) {
      if (i % 3 === 0) {
        const fb = (reg & 1) ^ ((reg >> 1) & 1);
        reg = (reg >> 1) | (fb << 14);
        bit = reg & 1;
      }
      d[i] = (bit ? 1 : -1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(A.sfxBus);
    src.start(t);
  }

  const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

  // coin-like two-note blip that climbs with the combo
  X.word = function (combo, doubled) {
    const i = Math.min(Math.floor(combo / 3), PENTA.length - 2);
    note(PENTA[i], 0, 0.06, { vol: 0.05, type: 'square' });
    note(PENTA[i + 1] + 5, 0.05, 0.12, { vol: 0.05, type: 'square' });
    if (doubled) note(PENTA[i + 1] + 12, 0.1, 0.12, { vol: 0.035, type: 'square' });
  };
  X.error = () => tone(140, 0, 0.08, { type: 'square', to: 90, vol: 0.05, lp: 1500 });
  X.miss = function () {
    tone(500, 0, 0.3, { type: 'square', to: 110, vol: 0.06, lp: 2500 });
    noise(0, 0.22, 0.12, 2500, 300);
  };
  X.danger = () => tone(220, 0, 0.12, { type: 'square', vol: 0.04, lp: 1800 });
  X.combo = function (n) {
    const base = 67 + Math.min(n / 10, 4) * 2;
    [0, 4, 7, 12].forEach((iv, k) => note(base + iv, k * 0.05, 0.1, { vol: 0.04 }));
  };
  X.count = (n) => (n > 0 ? note(76, 0, 0.12, { vol: 0.06 }) : (note(83, 0, 0.3, { vol: 0.06 }), note(88, 0, 0.3, { vol: 0.04 })));
  X.tick = () => tone(1300, 0, 0.03, { type: 'square', vol: 0.02 });
  X.clear = function () {
    [60, 64, 67, 72, 76, 79, 84].forEach((n, k) => note(n + 12, k * 0.07, 0.12, { vol: 0.05 }));
    [72, 76, 79, 84].forEach((n) => note(n, 0.55, 0.6, { vol: 0.035, type: 'triangle' }));
  };
  X.fail = function () {
    [76, 72, 69, 65, 60].forEach((n, k) => note(n, k * 0.14, 0.18, { vol: 0.05 }));
    noise(0.7, 0.5, 0.1, 1500, 120);
  };
  X.ui = () => tone(1500, 0, 0.025, { type: 'square', vol: 0.015 });
  X.select = () => (note(84, 0, 0.05, { vol: 0.03 }), note(88, 0.04, 0.06, { vol: 0.03 }));

  // power-ups
  X.power = function (type) {
    if (type === 'freeze') {
      [96, 91, 88, 84, 79].forEach((n, k) => note(n, k * 0.04, 0.12, { vol: 0.04, type: 'triangle' }));
      noise(0, 0.4, 0.05, 9000, 4000);
    } else if (type === 'slow') {
      tone(900, 0, 0.5, { type: 'square', to: 150, vol: 0.05, lp: 3000 });
    } else if (type === 'double') {
      [72, 76, 79, 84, 88, 91].forEach((n, k) => note(n, k * 0.045, 0.08, { vol: 0.045 }));
    } else if (type === 'erase') {
      noise(0, 0.6, 0.22, 6000, 80);
      tone(160, 0, 0.5, { type: 'square', to: 40, vol: 0.07, lp: 1200 });
    }
  };
  // vs mode: your combo flies at the AI / the AI's combo lands on you
  X.attack = function () {
    tone(300, 0, 0.35, { type: 'square', to: 1400, vol: 0.05, lp: 4000 });
    noise(0, 0.3, 0.06, 1500, 7000);
  };
  X.hit = function () {
    tone(180, 0, 0.25, { type: 'square', to: 60, vol: 0.08, lp: 1200 });
    noise(0, 0.2, 0.1, 2500, 300);
  };
  X.powerEnd =() => (note(79, 0, 0.06, { vol: 0.03 }), note(72, 0.06, 0.08, { vol: 0.03 }));

  /* -------------------------------- announcer -------------------------------- */
  // Arcade fight-game announcer. The dry lines (data-announcer.js) are shouted takes;
  // here they get the "K.O." treatment: grit, chest + presence EQ, a hard compressor,
  // a big hall and ping-pong stadium echoes, over a boom-and-fanfare stinger.
  const V = (KK.voice = { bufs: {}, loaded: false });
  const LABELS = {
    creamy: ['', 'creamy!', 'double creamy!', 'triple creamy!', 'ultra creaaammmyyyy!'],
    thocky: ['', 'thocky!', 'double thocky!', 'triple thocky!', 'ultra thooocckkyyyy!'],
    clicky: ['', 'clicky!', 'double clicky!', 'triple clicky!', 'ultra cliiickkyyyy!'],
  };

  // 5x → 1, 10x → 2, 15x → 3, 20x → 4, 25x+ → wow
  V.tierFor = (combo) => (combo >= 25 ? 'wow' : Math.floor(combo / 5));
  V.label = (word, tier) => (tier === 'wow' ? 'WOW!!!' : LABELS[word][tier]);

  function shout(buf) {
    // pre-process once: normalize, add grit, and an 8-bit arcade-sample texture
    const x = buf.getChannelData(0);
    const pk = D.peak(x) || 1;
    for (let i = 0; i < x.length; i++) {
      const v = x[i] / pk;
      const g = Math.tanh(v * 3.2) / Math.tanh(3.2);
      x[i] = Math.round((0.45 * v + 0.55 * g) * 127) / 127;
    }
    return buf;
  }

  function normalize(buf) {
    const x = buf.getChannelData(0);
    const k = 0.95 / (D.peak(x) || 1);
    for (let i = 0; i < x.length; i++) x[i] *= k;
    return buf;
  }

  // clean, intelligible vocal path for the OVERFLOW call: presence lift, gentle
  // compression and a short room — no grit, no long echo
  let clean = null;
  function cleanChain() {
    if (clean) return clean;
    const ctx = A.ctx;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 110;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2800;
    presence.Q.value = 0.8;
    presence.gain.value = 4;
    const body = ctx.createBiquadFilter();
    body.type = 'lowshelf';
    body.frequency.value = 200;
    body.gain.value = 3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.knee.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.15;
    const out = ctx.createGain();
    out.gain.value = 1.15;
    input.connect(hp).connect(body).connect(presence).connect(comp).connect(out).connect(A.sfxBus);
    const room = ctx.createConvolver();
    room.buffer = hallIR(ctx, 0.9);
    const wet = ctx.createGain();
    wet.gain.value = 0.1;
    out.connect(room).connect(wet).connect(A.sfxBus);
    return (clean = input);
  }

  V.load = function () {
    if (V.loaded || !A.ready || !window.ANNOUNCER) return;
    V.loaded = true;
    Object.entries(window.ANNOUNCER).forEach(([k, b64]) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // the long OVERFLOW call stays clean (grit + 8-bit smear a stretched vowel); combo calls get the arcade grit
      A.ctx.decodeAudioData(bytes.buffer).then((b) => (V.bufs[k] = k === 'overflow' ? normalize(b) : shout(b))).catch(() => {});
    });
  };
  A.onReady(V.load);

  let chain = null;
  function voiceChain() {
    if (chain) return chain;
    const ctx = A.ctx;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const chest = ctx.createBiquadFilter();
    chest.type = 'lowshelf';
    chest.frequency.value = 170;
    chest.gain.value = 6;
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2600;
    presence.Q.value = 0.9;
    presence.gain.value = 5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -30;
    comp.knee.value = 3;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    const out = ctx.createGain();
    out.gain.value = 0.95; // half the previous level
    input.connect(hp).connect(chest).connect(presence).connect(comp).connect(out);
    out.connect(A.sfxBus);

    // stadium hall
    const hall = ctx.createConvolver();
    hall.buffer = hallIR(ctx, 1.4);
    const hallWet = ctx.createGain();
    hallWet.gain.value = 0.16;
    out.connect(hall).connect(hallWet).connect(A.sfxBus);

    // ping-pong echo: "K.O. — O — o"
    const dl = ctx.createDelay(1), dr = ctx.createDelay(1);
    dl.delayTime.value = 0.19;
    dr.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.18;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner();
    pl.pan.value = -0.7;
    pr.pan.value = 0.7;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0.12;
    out.connect(tone).connect(dl);
    dl.connect(pl).connect(echoWet);
    dl.connect(dr);
    dr.connect(pr).connect(echoWet);
    dr.connect(fb).connect(dl);
    echoWet.connect(A.sfxBus);
    return (chain = input);
  }

  function hallIR(ctx, secs) {
    const SR = ctx.sampleRate, len = Math.floor(SR * secs);
    const b = ctx.createBuffer(2, len, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.35 * (t / secs)); // tail darkens
        d[i] = t < 0.025 ? 0 : lp * Math.exp(-t * 2.6);
      }
    }
    return b;
  }

  // boom + rising chip fanfare that grows with the tier
  function stinger(tier) {
    const n = tier === 'wow' ? 6 : tier;
    tone(120, 0, 0.7, { type: 'sine', to: 34, vol: 0.11, attack: 0.002, hold: 0.05, lp: 400 });
    noise(0, 0.35, 0.06, 5000, 300);
    const base = 60 + n * 2;
    [0, 4, 7, 12, 16, 19, 24].slice(0, n + 2).forEach((iv, k) => note(base + iv, 0.05 + k * 0.055, 0.14, { vol: 0.045 }));
    if (tier === 'wow') {
      noise(0.05, 1.2, 0.16, 9000, 2500);
      [72, 76, 79, 84].forEach((m) => note(m, 0.45, 0.8, { vol: 0.035, type: 'square' }));
    }
  }

  let fallbackVoice = null;
  function pickFallback() {
    const all = window.speechSynthesis.getVoices();
    const en = all.filter((v) => /^en/i.test(v.lang));
    fallbackVoice = en.find((v) => /david|mark|guy|male/i.test(v.name)) || en[0] || null;
  }
  if ('speechSynthesis' in window) {
    pickFallback();
    window.speechSynthesis.onvoiceschanged = pickFallback;
  }

  // the screen shattering: deep explosion + breaking glass + a big chip fanfare
  // impact first (0–0.5 s) so the shout that follows lands in the clear; the
  // fanfare and the settling debris come after the word
  X.shatter = function () {
    tone(95, 0, 1.0, { type: 'sine', to: 26, vol: 0.18, attack: 0.002, hold: 0.05, lp: 220 });
    tone(55, 0.02, 0.5, { type: 'square', to: 30, vol: 0.05, lp: 200 });
    noise(0, 0.45, 0.2, 8000, 900);
    // glass: a scatter of bright, short inharmonic tinkles, all inside the impact window
    for (let i = 0; i < 14; i++) {
      const at = 0.02 + Math.random() * 0.4;
      tone(2400 + Math.random() * 4200, at, 0.05 + Math.random() * 0.1, { type: 'triangle', vol: 0.018 + Math.random() * 0.02, lp: 12000 });
    }
    [79, 76, 72, 67, 64, 60].forEach((m, k) => note(m, 1.6 + k * 0.07, 0.16, { vol: 0.035 }));
    noise(1.6, 0.9, 0.06, 6000, 1500);
  };

  // "OVERFLOOOW!" — same arcade chain as the combo calls, hotter delivery
  V.overflow = function () {
    if (!A.ready || A.sfxVol <= 0) return;
    X.shatter();
    if (KK.music.dip) KK.music.dip(2.8, 0.25);
    const buf = V.bufs.overflow;
    if (buf) {
      const src = A.ctx.createBufferSource();
      src.buffer = buf;
      const g = A.ctx.createGain();
      g.gain.value = 1.1;
      src.connect(g).connect(cleanChain());
      src.start(A.ctx.currentTime + 0.55); // after the impact transient has cleared
    } else if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('Overflow!');
      if (fallbackVoice) u.voice = fallbackVoice;
      u.pitch = 1.2;
      u.rate = 0.75;
      u.volume = Math.min(1, A.sfxVol * 1.15);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  };

  // word: 'creamy' | 'thocky' | 'clicky'; tier: 1–4 or 'wow'
  V.announce = function (word, tier) {
    if (!A.ready || A.sfxVol <= 0 || !tier) return;
    const key = tier === 'wow' ? 'wow' : `${word}-${tier}`;
    const buf = V.bufs[key];
    stinger(tier);
    if (KK.music.dip) KK.music.dip(tier === 'wow' || tier === 4 ? 2.2 : 1.4);
    if (buf) {
      const src = A.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.94; // a semitone down: bigger, heavier
      src.connect(voiceChain());
      src.start(A.ctx.currentTime + 0.04);
    } else if ('speechSynthesis' in window) {
      // decode not finished / unsupported: fall back to the browser voice
      const u = new SpeechSynthesisUtterance(V.label(word, tier).replace(/(.)\1+/g, '$1'));
      if (fallbackVoice) u.voice = fallbackVoice;
      u.pitch = 0.8;
      u.rate = 0.9;
      u.volume = Math.min(1, A.sfxVol * 1.15);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  };

  /* --------------------------- vs players: match intro --------------------------- */
  // a name card sweeping in from the side
  X.whoosh = (at) => {
    noise(at || 0, 0.32, 0.07, 600, 7000);
    tone(180, at || 0, 0.3, { type: 'sawtooth', to: 900, vol: 0.02, lp: 2500 });
  };
  // the VS slamming down: sub boom, crack, a ringing metal hit and a low chip fanfare
  X.slam = function (at) {
    const t = at || 0;
    tone(110, t, 1.1, { type: 'sine', to: 28, vol: 0.18, attack: 0.002, hold: 0.05, lp: 260 });
    tone(55, t + 0.01, 0.6, { type: 'square', to: 30, vol: 0.05, lp: 200 });
    noise(t, 0.5, 0.18, 7000, 500);
    [523, 784, 1046, 1568].forEach((f, k) => tone(f * 1.003, t + 0.005 * k, 1.2, { type: 'triangle', vol: 0.016, lp: 9000, hold: 0.05 }));
    [48, 55, 60].forEach((m, k) => note(m, t + 0.35 + k * 0.12, 0.5, { vol: 0.04 }));
  };

  // "VERSUS!" / "FIGHT!" — the combo calls' arcade chain
  V.call = function (key, at) {
    if (!A.ready || A.sfxVol <= 0) return;
    const buf = V.bufs[key];
    if (KK.music.dip) KK.music.dip(key === 'versus' ? 3.2 : 1.6);
    if (buf) {
      const src = A.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.94;
      src.connect(voiceChain());
      src.start(A.ctx.currentTime + (at || 0));
    } else if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(key + '!');
      if (fallbackVoice) u.voice = fallbackVoice;
      u.pitch = 0.8;
      u.volume = Math.min(1, A.sfxVol * 1.15);
      setTimeout(() => window.speechSynthesis.speak(u), (at || 0) * 1000);
    }
  };
})();