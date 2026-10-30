(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});

  /* ----------------------------- context & buses ----------------------------- */
  const A = (KK.audio = { ctx: null, ready: false, musicVol: 0.5, sfxVol: 0.8, _cbs: [] });

  A.onReady = function (fn) {
    if (A.ready) fn();
    else A._cbs.push(fn);
  };

  // must be called from a user gesture (click / keydown)
  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended') A.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (A.ctx = new AC({ latencyHint: 'interactive' }));
    A.SR = ctx.sampleRate;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    A.master = ctx.createGain();
    A.master.connect(limiter);
    A.musicBus = ctx.createGain();
    A.sfxBus = ctx.createGain();
    A.musicBus.connect(A.master);
    A.sfxBus.connect(A.master);

    // keyboard sounds get a touch of small-room ambience so they don't sound "in your skull"
    A.keyBus = ctx.createGain();
    A.keyBus.connect(A.sfxBus);
    const conv = ctx.createConvolver();
    conv.buffer = roomIR(ctx, 0.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.08;
    A.keyBus.connect(conv);
    conv.connect(wet);
    wet.connect(A.sfxBus);

    A.applyVolumes();
    A.ready = true;
    A._cbs.splice(0).forEach((f) => f());
  };

  const curve = (v) => v * v; // perceptual-ish slider taper
  A.applyVolumes = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.musicBus.gain.setTargetAtTime(curve(A.musicVol) * 0.9, t, 0.05);
    A.sfxBus.gain.setTargetAtTime(curve(A.sfxVol), t, 0.02);
  };
  A.setMusicVolume = function (v) {
    A.musicVol = v;
    A.applyVolumes();
  };
  A.setSfxVolume = function (v) {
    A.sfxVol = v;
    A.applyVolumes();
  };

  A.toBuffer = function (data, channels) {
    const chans = channels || [data];
    const b = A.ctx.createBuffer(chans.length, chans[0].length, A.SR);
    chans.forEach((c, i) => b.getChannelData(i).set(c));
    return b;
  };

  function roomIR(ctx, seconds) {
    const SR = ctx.sampleRate;
    const len = Math.floor(SR * seconds);
    const b = ctx.createBuffer(2, len, SR);
    const R = KK.util.rng(42);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const n = R() * 2 - 1;
        lp += (n - lp) * 0.35; // darken the tail
        d[i] = lp * Math.exp(-t * 32) * (t < 0.004 ? t / 0.004 : 1);
      }
      // a few early reflections (desk, monitor, wall)
      [0.0031, 0.0058, 0.0094, 0.013].forEach((dt, k) => {
        const idx = Math.floor((dt + ch * 0.0007) * SR);
        if (idx < len) d[idx] += (0.5 - k * 0.1) * (k % 2 ? -1 : 1);
      });
    }
    return b;
  }

  /* ----------------------------------- DSP ----------------------------------- */
  const D = (KK.dsp = {});

  D.mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // RBJ cookbook biquad coefficients
  D.biquad = function (type, f, Q, SR, gainDb) {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w0 = (2 * Math.PI * f) / SR,
      cs = Math.cos(w0),
      sn = Math.sin(w0),
      alpha = sn / (2 * Q),
      Ag = Math.pow(10, (gainDb || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass':
        b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'highpass':
        b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
        break;
      case 'peaking':
        b0 = 1 + alpha * Ag; b1 = -2 * cs; b2 = 1 - alpha * Ag; a0 = 1 + alpha / Ag; a1 = -2 * cs; a2 = 1 - alpha / Ag;
        break;
    }
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };

  D.filter = function (x, c) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const x0 = x[i];
      const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
      x[i] = y0;
    }
    return x;
  };

  // Two-pole resonator (one vibrational mode) driven by `ex`, summed into `out`.
  // Normalized so a unit impulse yields a decaying sine of amplitude `gain`.
  D.resonate = function (ex, out, f, decay, gain, SR, from) {
    if (gain <= 0 || f >= SR * 0.47) return;
    const w = (2 * Math.PI * f) / SR;
    const r = Math.exp(-1 / (decay * SR));
    const a1 = 2 * r * Math.cos(w),
      a2 = -r * r,
      g = gain * Math.sin(w);
    let y1 = 0, y2 = 0;
    const start = from || 0;
    const stopAfter = Math.min(out.length, start + Math.ceil(decay * SR * 9));
    for (let i = start; i < stopAfter; i++) {
      const y = a1 * y1 + a2 * y2 + ex[i];
      out[i] += y * g;
      y2 = y1;
      y1 = y;
    }
  };

  // half-sine force pulse: wider = softer contact = fewer highs
  D.pulse = function (buf, at, amp, width) {
    const w = Math.max(1, Math.round(width));
    for (let i = 0; i < w; i++) {
      const j = at + i;
      if (j >= 0 && j < buf.length) buf[j] += amp * Math.sin((Math.PI * (i + 0.5)) / w);
    }
  };

  D.noiseBurst = function (buf, at, amp, attack, decay, R, SR) {
    const a = Math.max(1, attack * SR),
      len = Math.min(buf.length - at, Math.ceil((attack + decay * 7) * SR));
    for (let i = 0; i < len; i++) {
      const env = i < a ? i / a : Math.exp(-(i - a) / (decay * SR));
      buf[at + i] += (R() * 2 - 1) * amp * env;
    }
  };

  D.peak = function (x) {
    let m = 0;
    for (let i = 0; i < x.length; i++) {
      const v = Math.abs(x[i]);
      if (v > m) m = v;
    }
    return m;
  };
})();
