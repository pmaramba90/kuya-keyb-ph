(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, D = KK.dsp, A = KK.audio;

  /*
   * Layered keystroke synthesis.
   *
   * Plastic impacts are noisy and heavily damped, so instead of a few long-ringing
   * sine modes (which sound like a woodblock), each event is built from short
   * noise-excited resonances plus a handful of fast-decaying modes:
   *
   *   DOWN  finger touch → stem scratch → tactile bump → CLICK → BOTTOM-OUT → spring ping
   *         bottom-out = contact transient (brightness set by contact hardness)
   *                    + CLACK formants (keycap & housing plastic, ~1.2–5.5 kHz)
   *                    + THOCK body (keycap/plate/stem assembly, ~260–1400 Hz)
   *                    + plate ring + case cavity + metallic case ping + stab rattle
   *   UP    release click → TOP-OUT (stem slider hits top housing: brighter, with the
   *         4.8–6.5 kHz band seen in switch spectrograms) → housing wobble
   *
   * Clicks are mixed after the keycap low-pass: they happen inside the switch and are
   * sharp enough to cut through (MX-style jackets peak near 9–11 kHz, Kailh click
   * bars near 3 kHz but louder).
   */

  const S = (KK.keysound = { build: null, P: null, sets: null });

  function product(mods, field) {
    let v = 1;
    mods.forEach((m) => {
      if (m.snd[field] !== undefined) v *= m.snd[field];
    });
    return v;
  }

  S.computeProfile = function (b) {
    const sw = C.switchById[b.switch];
    const kc = C.keycapById[b.keycap];
    const cs = C.CASES[b.case].snd;
    const pl = C.PLATES[b.plate].snd;
    const mt = C.MOUNTS[b.mount].snd;
    const lay = C.LAYOUTS[b.layout];
    const lube = C.lubeById[b.lube].snd;
    const kp = C.KC_PROFILES[kc.profile];
    const km = C.KC_MATERIALS[kc.material];
    const hs = C.HOUSINGS[sw.housing];
    const mods = b.mods.map((id) => C.modById[id]);
    const M = (f) => product(mods, f);
    const silent = sw.type === 'silent';
    // Topre / electro-capacitive: a rubber dome over a conical spring — rounder,
    // deeper, muted bottom-out with no spring ping and a pronounced upstroke
    const dome = !!sw.dome;
    const lp = sw.longPole;

    const P = { silent, force: sw.force };
    // overall pitch index (1100 ≈ neutral); drives the thock body and the tags
    P.pitch = U.clamp(1100 * kp.pitch * km.pitch * hs.pitch * pl.pitch * cs.pitch * mt.pitch * lube.pitch * M('pitch') * (lp ? 1.12 : 1) * (sw.lowProfile ? 1.22 : 1) * (silent ? 0.85 : 1) * (dome ? 0.88 : 1), 420, 2800);
    P.thockF = U.clamp(P.pitch * 0.62, 360, 1600);
    P.clackF = U.clamp(2400 * Math.pow(km.pitch, 1.3) * Math.pow(hs.pitch, 1.5) * Math.pow(kp.pitch, 0.6) * Math.sqrt(pl.pitch * mt.pitch * M('pitch')) * lube.pitch * (lp ? 1.25 : 1) * (sw.lowProfile ? 1.2 : 1) * (silent ? 0.7 : 1), 1100, 5500);
    P.decayMul = U.clamp(kp.decay * km.decay * hs.decay * mt.decay * lube.decay * M('decay') * (silent ? 0.6 : 1) * (lp ? 0.85 : 1), 0.35, 2.2);
    P.thockTau = U.clamp((11 / (Math.PI * P.thockF)) * P.decayMul, 0.002, 0.03);
    P.attack = U.clamp(0.1 * km.soft * mt.soft * M('soft') * (silent ? 6 : 1) * (lp ? 0.75 : 1) * (dome ? 2.2 : 1), 0.04, 1.6); // contact time, ms
    P.bright = U.clamp(9500 * km.bright * hs.bright * pl.bright * cs.bright * mt.bright * lube.bright * M('bright') * (silent ? 0.35 : 1), 1200, 16000);
    P.hollow = cs.hollow * lay.hollow * mt.hollow * M('hollow') * (silent ? 0.5 : 1);
    P.caseF = cs.bodyF * lay.bodyF;
    P.caseDecay = cs.bodyDecay * M('caseDecay');
    // case modes as [Hz, decay s, weight]: the shell's first bending modes (a damped
    // plate, so higher modes die faster) and the standing waves of the air between
    // pcb and bottom case, set by the case's inside length and depth
    P.cavity = [1, 1.62, 2.3, 2.95].map((r, i) => [P.caseF * r, P.caseDecay / Math.sqrt(r), cs.shell / (1 + i * 0.6)]);
    [[1, 0], [2, 0], [0, 1], [1, 1], [3, 0], [2, 1]].forEach(([nx, ny], i) => {
      const f = 171.5 * Math.hypot(nx / lay.lx, ny / lay.ly);
      P.cavity.push([f, (cs.airQ / (Math.PI * f)) * M('caseDecay'), 0.8 / (1 + i * 0.35)]);
    });
    P.ping = cs.ping * mt.ping * M('ping') * (silent ? 0.4 : 1);
    P.pingF = cs.pingF;
    P.pingDecay = cs.pingDecay;
    P.plateF = pl.f;
    P.plateDecay = pl.decay * mt.decay;
    P.plateGain = pl.gain * M('plate');
    P.thock = kp.thock * km.thock * pl.thock * hs.thock * M('thock') * (dome ? 1.25 : 1);
    P.clack = km.clack * hs.clack * pl.clack * M('clack') * (lp ? 1.45 : 1) * (silent ? 0.25 : 1) * (dome ? 0.55 : 1);
    // compressed so even the thockiest board keeps an audible attack, and the
    // clackiest still has some body
    P.thockAmt = Math.pow(P.thock, 0.6) * (silent ? 0.6 : 1);
    P.clackAmt = Math.pow(P.clack, 0.8);
    P.topBright = hs.clack; // pc tops ring out on the upstroke, pom/nylon tops are duller
    P.pop = mods.reduce((s, m) => s + (m.snd.pop || 0), 0) * (silent ? 0.3 : 1);
    P.loud = km.loud * kp.loud * cs.loud * mt.loud * lube.loud * M('loud') * (silent ? 0.4 : 1);
    P.travel = 9 * Math.sqrt(sw.force / 50) * (sw.lowProfile ? 0.7 : 1); // ms, press → bottom-out
    P.retMs = 4 + 4 * Math.sqrt(50 / sw.force) * (sw.lowProfile ? 0.7 : 1); // ms, release → top-out
    P.variance = mt.variance;

    const stockScratch = sw.factoryLube ? 0.3 : 1;
    const stockPing = sw.factoryLube ? 0.3 : 1;
    const ls = lube.scratch === null || lube.scratch === 'stock' ? stockScratch : lube.scratch;
    const lpng = lube.ping === null ? stockPing : lube.ping;
    P.scratch = dome ? 0.05 : U.clamp(ls * (sw.type === 'tactile' ? 1.3 : 1) * hs.scratch * M('scratch') * (sw.he ? 0.8 : 1), 0, 1.5);
    P.springPing = dome ? 0 : lpng * M('springPing') * (silent ? 0.5 : 1) * (sw.force > 65 ? 0.8 : 1);
    P.springF = 4800 + (sw.force - 50) * 20;
    P.bump = sw.bump * lube.bumpMute;
    P.click = sw.clickKind;
    P.heavyBar = !!sw.heavyBar;
    // clicky switches are louder at the click than at bottom-out
    P.clickGain = sw.clickKind ? { bar: 3.4, jacket: 3.5, leaf: 1.8 }[sw.clickKind] * lube.clickMute * (sw.heavyBar ? 1.05 : 1) : 0;
    P.up = U.clamp((0.42 + (sw.force - 45) * 0.007) * lube.up * M('up') * (silent ? 0.25 : 1) * (sw.he ? 0.85 : 1) * (dome ? (silent ? 3 : 1.3) : 1), 0.06, 0.7);
    P.wobble = (sw.box ? 0.3 : 1) * M('wobble');
    P.rattle = 0.5 * cs.rattle * M('rattle');
    return P;
  };

  /* -------------------------------- primitives -------------------------------- */

  // decaying noise burst, optionally band-passed; `amp` is the layer's peak level
  function noise(out, at, o, R, SR) {
    if (!(o.amp > 0) || at >= out.length) return;
    const att = o.attack || 0.00002;
    const len = Math.min(out.length - at, Math.ceil((att + o.tau * 7) * SR) + 64);
    const seg = new Float32Array(len);
    const a = Math.max(1, att * SR), d = o.tau * SR;
    for (let i = 0; i < len; i++) {
      const env = (i < a ? i / a : 1) * Math.exp(-Math.max(0, i - a) / d);
      seg[i] = (R() * 2 - 1) * env;
    }
    if (o.f) D.filter(seg, D.biquad('bandpass', o.f, o.q || 1, SR));
    if (o.hp) D.filter(seg, D.biquad('highpass', o.hp, 0.7, SR));
    if (o.lp) D.filter(seg, D.biquad('lowpass', o.lp, 0.7, SR));
    const g = o.amp / (D.peak(seg) || 1);
    for (let i = 0; i < len; i++) out[at + i] += seg[i] * g;
  }

  // one damped vibrational mode; `attack` ≈ contact time (soft contact = rounder onset),
  // `chirp` = brief downward pitch glide typical of struck plastic
  function mode(out, at, f, tau, amp, attack, chirp, R, SR) {
    if (!(amp > 0) || f >= SR * 0.45 || at >= out.length) return;
    const len = Math.min(out.length - at, Math.ceil((tau * 7 + attack) * SR));
    const ta = Math.max(attack, 1 / SR);
    let ph = 0; // a struck mode starts from rest
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = (1 - Math.exp(-t / ta)) * Math.exp(-t / tau);
      ph += (2 * Math.PI * f * (1 + chirp * Math.exp(-t / 0.0025))) / SR;
      out[at + i] += amp * env * Math.sin(ph);
    }
  }

  // stick-slip grains while the stem slides down the rails / leaf
  function scratch(out, from, to, amp, R, SR) {
    const n = to - from;
    if (n <= 8) return;
    const seg = new Float32Array(n);
    let i = 0;
    while (i < n) {
      i += Math.floor(SR * (0.0002 + R() * 0.0009));
      if (i >= n) break;
      const g = (0.3 + R() * 0.7) * Math.sin((Math.PI * i) / n);
      for (let k = 0; k < 14 && i + k < n; k++) seg[i + k] += g * (R() * 2 - 1) * Math.exp(-k / 3);
    }
    D.filter(seg, D.biquad('bandpass', 2800, 0.8, SR));
    const k = amp / (D.peak(seg) || 1);
    for (let j = 0; j < n; j++) out[from + j] += seg[j] * k;
  }

  /* ---------------------------------- events ---------------------------------- */

  function click(dest, at, P, gain, R, SR) {
    // layers are summed in a scratch buffer and the whole click is normalized,
    // so its level stays consistent from press to press (±1 dB)
    const out = new Float32Array(dest.length);
    clickLayers(out, at, P, 1, R, SR);
    const k = (gain * P.clickGain * (0.9 + R() * 0.2)) / (D.peak(out) || 1);
    for (let i = at; i < dest.length; i++) dest[i] += out[i] * k;
  }

  function clickLayers(out, at, P, G, R, SR) {
    const v = () => 1 + (R() - 0.5) * 0.05;
    if (P.click === 'jacket') {
      // click jacket snapping down: thin, very high tick, doubled by the jacket bounce
      noise(out, at, { f: 9500 * v(), q: 1.3, tau: 0.00045, amp: 1.0 * G }, R, SR);
      noise(out, at, { f: 4300 * v(), q: 3, tau: 0.0011, amp: 0.4 * G }, R, SR);
      mode(out, at, 3400 * v(), 0.0014, 0.18 * G, 0.00003, 0, R, SR);
      noise(out, at + Math.round(SR * (0.0007 + R() * 0.0004)), { f: 7600 * v(), q: 1.4, tau: 0.0004, amp: 0.55 * G }, R, SR);
    } else if (P.click === 'bar') {
      // click bar slapping the housing: fuller, lower, louder snap with a crisp edge
      const fb = (P.heavyBar ? 2500 : 3200) * v();
      const k = P.heavyBar ? 1.45 : 1;
      noise(out, at, { f: fb, q: 2.2, tau: 0.0011 * k, amp: 1.0 * G }, R, SR);
      mode(out, at, fb * 1.04, 0.0024 * k, 0.55 * G, 0.00002, 0.02, R, SR);
      mode(out, at, fb * 2.3 * v(), 0.0011, 0.2 * G, 0.00002, 0, R, SR);
      noise(out, at, { hp: 6000, tau: 0.0003, amp: 0.5 * G }, R, SR);
    } else {
      // zeal clickiez: leaf snaps, softer double tick
      noise(out, at, { f: 2600 * v(), q: 2, tau: 0.0008, amp: 0.75 * G }, R, SR);
      noise(out, at + Math.round(SR * 0.0015), { f: 3300 * v(), q: 2, tau: 0.0006, amp: 0.45 * G }, R, SR);
    }
  }

  function rattle(out, at, amount, R, SR) {
    // stab wire ticking in its housings + the housing clacking
    for (let k = 0; k < 2; k++) {
      const t = at + Math.round(SR * (0.0015 + k * 0.0025 + R() * 0.0015));
      noise(out, t, { hp: 3000, tau: 0.0003, amp: (0.28 * amount) / (k + 1) }, R, SR);
      mode(out, t, (4000 + R() * 900) * (k ? 1.2 : 1), 0.006, (0.12 * amount) / (k + 1), 0.00002, 0, R, SR);
    }
    noise(out, at + Math.round(SR * 0.001), { f: 2200, q: 2, tau: 0.003, amp: 0.2 * amount }, R, SR);
  }

  // Hollowness is the case answering the strike, not a note of its own: the first
  // few ms of the impact drive the case modes (each key sits at a different spot on
  // the pcb, so each press excites them in a different mix), and the result is mixed
  // back under the dry strike.
  function caseBody(out, at, P, amt, fk, R, SR) {
    if (!(amt > 0.01) || at >= out.length) return;
    const n = Math.min(out.length - at, Math.round(SR * 0.012));
    const ex = new Float32Array(out.length);
    for (let i = 0; i < n; i++) ex[at + i] = out[at + i];
    const wet = new Float32Array(out.length);
    P.cavity.forEach(([f, tau, w]) => D.resonate(ex, wet, f * fk * (1 + (R() - 0.5) * 0.06), tau, w * (0.5 + R()), SR, at));
    const k = (0.4 * amt * D.peak(ex)) / (D.peak(wet) || 1);
    for (let i = at; i < out.length; i++) out[i] += wet[i] * k;
  }

  function bottomOut(out, tb, P, size, R, SR) {
    const space = size === 'space', wide = size === 'wide', stab = space || wide;
    const v = () => 1 + (R() - 0.5) * 0.06 * P.variance;
    const g = () => 0.88 + R() * 0.24;
    const hard = P.attack / 1000;
    const kT = space ? 1.6 : wide ? 1.3 : 1;
    const tf = P.thockF * (space ? 0.62 : wide ? 0.8 : 1) * v();
    const cf = P.clackF * (space ? 0.75 : wide ? 0.88 : 1) * v();
    const th = P.thockAmt, cl = P.clackAmt, dm = P.decayMul;

    // contact transient: the harder the contact, the brighter the snap
    noise(out, tb, { lp: U.clamp(1.1 / hard, 800, 16000), tau: Math.max(0.00015, hard * 0.8), amp: 0.7 * cl * g(), attack: 0.00002 }, R, SR);

    // CLACK: keycap & housing plastic formants (noise carries little energy per unit
    // peak compared to the sine body, so these sit higher in level)
    noise(out, tb, { f: cf, q: 3, tau: 0.0035 * dm * kT, amp: 1.5 * cl * g(), attack: hard * 0.5 }, R, SR);
    noise(out, tb, { f: cf * 1.65 * v(), q: 3.5, tau: 0.0025 * dm, amp: 0.8 * cl * g(), attack: hard * 0.5 }, R, SR);
    mode(out, tb, cf * 1.02, 0.003 * dm * kT, 0.5 * cl * g(), hard * 0.6, 0.03, R, SR);

    // THOCK: low body of keycap + stem + plate, soft-onset with a short pitch drop
    const ta = Math.max(hard * 1.2, 0.00012);
    mode(out, tb, tf, P.thockTau * kT, 0.8 * th * g(), ta, 0.06, R, SR);
    mode(out, tb, tf * 1.23 * v(), P.thockTau * 0.7 * kT, 0.45 * th * g(), ta, 0.04, R, SR);
    mode(out, tb, tf * 0.79 * v(), P.thockTau * 1.1 * kT, 0.28 * th * g(), ta, 0, R, SR);
    // keycap top flexing (~0.9–1.5 kHz): the "tok" that keeps a thock audible on
    // laptop speakers instead of being a sub boom
    noise(out, tb, { f: Math.max(tf * 2.4, 850), q: 1.6, tau: P.thockTau * 0.45 * kT, amp: 0.7 * th * g(), attack: ta }, R, SR);
    noise(out, tb, { f: tf * 1.3, q: 1.4, tau: P.thockTau * 0.5 * kT, amp: 0.3 * th * g(), attack: ta }, R, SR);

    // plate ring
    noise(out, tb, { f: P.plateF * v(), q: 6, tau: P.plateDecay, amp: 0.35 * P.plateGain * g(), attack: hard }, R, SR);

    // case cavity (hollowness): the strike so far, colored by the case
    caseBody(out, tb, P, P.hollow * (stab ? 1.3 : 1), stab ? 0.9 : 1, R, SR);

    // metallic case ping (inharmonic partials of a metal shell)
    if (P.ping > 0.01) [1, 1.41, 2.13, 2.76].forEach((r, i) => mode(out, tb, P.pingF * r * v(), P.pingDecay * (1 - i * 0.15), (0.07 * P.ping) / (1 + i * 0.5), 0.0002, 0, R, SR));

    // PE foam "pop"
    if (P.pop > 0.01) noise(out, tb, { f: 1900 * v(), q: 3, tau: 0.0025, amp: 0.45 * P.pop, attack: 0.00003 }, R, SR);

    // stabilized keys
    if (stab && P.rattle > 0.01) rattle(out, tb, P.rattle * (space ? 1 : 0.7), R, SR);
  }

  function springPing(out, t, P, k, R, SR) {
    if (P.springPing <= 0.005) return;
    const sp = P.springPing * k;
    const v = () => 1 + (R() - 0.5) * 0.04;
    mode(out, t, 1300 * v(), 0.05, 0.012 * sp, 0.0001, 0, R, SR);
    mode(out, t, P.springF * v(), 0.09, 0.03 * sp, 0.0001, 0, R, SR);
    mode(out, t, (P.springF + 1400) * v(), 0.06, 0.015 * sp, 0.0001, 0, R, SR);
  }

  function renderDown(P, size, seed, noClick) {
    const SR = A.SR, R = U.rng(seed);
    const len = Math.floor(SR * 0.32);
    const out = new Float32Array(len), top = new Float32Array(len);
    const stab = size !== 'alpha';
    const t0 = Math.round(SR * 0.001);
    const travel = SR * (P.travel / 1000) * (0.85 + R() * 0.3) * (stab ? 1.15 : 1);
    const tb = t0 + Math.round(travel);

    // fingertip landing on the keycap
    noise(out, t0, { f: 700, q: 0.7, tau: 0.0008, amp: 0.05 * (0.8 + R() * 0.4), attack: 0.0003 }, R, SR);

    if (P.scratch > 0.02) scratch(out, t0, tb, 0.05 * P.scratch, R, SR);

    if (P.bump > 0.01) {
      const tbp = t0 + Math.round(travel * 0.33);
      noise(out, tbp, { f: 1300, q: 1.4, tau: 0.0015, amp: 0.16 * P.bump, attack: 0.0002 }, R, SR);
      mode(out, tbp, P.thockF * 1.3, 0.004, 0.1 * P.bump, 0.0004, 0, R, SR);
    }

    if (P.click && !noClick) click(top, t0 + Math.round(travel * (P.click === 'jacket' ? 0.5 : 0.45)), P, 1, R, SR);

    bottomOut(out, tb, P, size, R, SR);
    springPing(out, tb, P, 1, R, SR);

    D.filter(out, D.biquad('lowpass', P.bright * (stab ? 0.85 : 1), 0.7, SR));
    D.filter(top, D.biquad('lowpass', Math.min(16000, P.bright * 1.8 + 4000), 0.7, SR));
    for (let i = 0; i < len; i++) out[i] += top[i];
    D.filter(out, D.biquad('highpass', 60, 0.7, SR));
    return out;
  }

  function renderUp(P, size, seed) {
    const SR = A.SR, R = U.rng(seed);
    const len = Math.floor(SR * 0.22);
    const out = new Float32Array(len), top = new Float32Array(len);
    const space = size === 'space', wide = size === 'wide', stab = space || wide;
    const v = () => 1 + (R() - 0.5) * 0.06 * P.variance;
    const t0 = Math.round(SR * 0.001);
    const hard = P.attack / 1000;
    const tt = t0 + Math.round(SR * (P.retMs / 1000) * (0.9 + R() * 0.2));
    const u = P.up * (0.88 + R() * 0.24);
    const tf = P.thockF * (space ? 0.62 : wide ? 0.8 : 1) * 1.15 * v();
    const cf = P.clackF * (space ? 0.75 : wide ? 0.88 : 1) * 1.25 * v();

    // jackets barely click on the way up; click bars snap back audibly
    if (P.click) click(top, t0 + Math.round(SR * 0.0012), P, { jacket: 0.12, bar: 0.3, leaf: 0.25 }[P.click], R, SR);

    // TOP-OUT: stem slider strikes the top housing
    noise(out, tt, { lp: U.clamp(1.1 / hard, 800, 16000), tau: Math.max(0.00015, hard * 0.8), amp: 0.8 * u * P.clackAmt, attack: 0.00002 }, R, SR);
    noise(out, tt, { f: cf, q: 3, tau: 0.0028 * P.decayMul, amp: 1.3 * u * P.clackAmt, attack: hard * 0.5 }, R, SR);
    noise(out, tt, { f: 5400 * v(), q: 2, tau: 0.0012, amp: 0.6 * u * P.topBright, attack: 0.00002 }, R, SR);
    mode(out, tt, tf, P.thockTau * 0.5, 0.6 * u * P.thockAmt, Math.max(hard, 0.0001), 0.04, R, SR);
    caseBody(out, tt, P, P.hollow * 0.6, 1, R, SR);
    springPing(out, tt, P, 0.5, R, SR);

    // loose top housing rattles a moment later (films remove this)
    if (P.wobble > 0.01) noise(out, tt + Math.round(SR * (0.0015 + R() * 0.0015)), { f: 2200, q: 2, tau: 0.0015, amp: 0.12 * u * P.wobble }, R, SR);

    // stab wire snaps back
    if (stab && P.rattle > 0.01) rattle(out, tt, P.rattle * (space ? 1.2 : 0.8), R, SR);

    D.filter(out, D.biquad('lowpass', Math.min(16000, P.bright * 1.15), 0.7, SR));
    D.filter(top, D.biquad('lowpass', Math.min(16000, P.bright * 1.8 + 4000), 0.7, SR));
    for (let i = 0; i < len; i++) out[i] += top[i];
    D.filter(out, D.biquad('highpass', 60, 0.7, SR));
    return out;
  }

  // exposed for the measurement harness
  S._renderDown = renderDown;
  S._renderUp = renderUp;
  S._click = function (P) {
    const out = new Float32Array(Math.floor(A.SR * 0.05));
    click(out, 10, P, 1, U.rng(5), A.SR);
    D.filter(out, D.biquad('lowpass', Math.min(16000, P.bright * 1.8 + 4000), 0.7, A.SR));
    return out;
  };

  const VARIANTS = 6;
  const SIZES = ['alpha', 'space', 'wide'];

  S.render = function () {
    if (!A.ready || !S.build) return;
    const P = (S.P = S.computeProfile(S.build));
    const seed0 = U.hash(JSON.stringify(S.build));
    const raw = {};
    SIZES.forEach((sz, si) => {
      raw[sz] = { down: [], up: [] };
      for (let v = 0; v < VARIANTS; v++) {
        raw[sz].down.push(renderDown(P, sz, seed0 + si * 100 + v));
        raw[sz].up.push(renderUp(P, sz, seed0 + si * 100 + 50 + v));
      }
    });
    // normalize against the bottom-out alone so relative loudness survives: clicky
    // boards end up louder than linears, silent ones quieter, upstrokes softer.
    let ref = 0;
    for (let v = 0; v < 3; v++) ref += D.peak(renderDown(P, 'alpha', seed0 + v, true)) / 3;
    ref = ref || 1;
    const k = (0.75 / ref) * U.clamp(P.loud, 0.2, 1.4);
    const sets = {};
    SIZES.forEach((sz) => {
      sets[sz] = {
        down: raw[sz].down.map((x) => A.toBuffer(x.map((s) => s * k))),
        up: raw[sz].up.map((x) => A.toBuffer(x.map((s) => s * k))),
      };
    });
    S.sets = sets;
  };

  let pending = null;
  S.setBuild = function (b) {
    S.build = b;
    S.P = S.computeProfile(b);
    clearTimeout(pending);
    pending = setTimeout(S.render, 40);
  };
  S.renderNow = function () {
    clearTimeout(pending);
    S.render();
  };
  A.onReady(() => S.render());

  /* --------------------------------- playback --------------------------------- */

  const WIDE = { Enter: 1, NumpadEnter: 1, NumpadAdd: 1, Numpad0: 1, Backspace: 1, ShiftLeft: 1, ShiftRight: 1 };
  const sizeOf = (code) => (code === 'Space' ? 'space' : WIDE[code] ? 'wide' : 'alpha');

  // rough horizontal key position (0..1) for stereo placement
  const ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./'];
  const CODE_X = { Space: 0.45, Enter: 0.9, Backspace: 0.92, ShiftLeft: 0.06, ShiftRight: 0.88, Tab: 0.04, CapsLock: 0.05, Escape: 0.02 };
  const CH_CODE = { '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash' };
  ROWS.forEach((row, r) =>
    row.split('').forEach((ch, i) => {
      const code = CH_CODE[ch] || (/\d/.test(ch) ? 'Digit' + ch : 'Key' + ch.toUpperCase());
      CODE_X[code] = (i + 0.5 + r * 0.4) / 14.5;
    })
  );

  const lastVariant = {};
  function play(code, dir) {
    if (!S.sets || !A.ready) return;
    const sz = sizeOf(code);
    const list = S.sets[sz][dir];
    let v = Math.floor(Math.random() * list.length);
    if (v === lastVariant[sz + dir]) v = (v + 1) % list.length;
    lastVariant[sz + dir] = v;

    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = list[v];
    // each physical key sounds slightly different (keycap row, plate support, pcb position)
    const keyDetune = ((U.hash(code) % 1000) / 1000 - 0.5) * 0.04;
    src.playbackRate.value = 1 + keyDetune + (Math.random() - 0.5) * 0.012;
    const g = ctx.createGain();
    g.gain.value = 0.85 + Math.random() * 0.15;
    let node = src.connect(g);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = ((CODE_X[code] !== undefined ? CODE_X[code] : 0.5) - 0.5) * 0.6;
      node = node.connect(p);
    }
    node.connect(A.keyBus);
    src.start();
  }
  S.down = (code) => play(code, 'down');
  S.up = (code) => play(code, 'up');

  // demo: a short burst of typing (used when picking parts)
  S.demo = function () {
    if (!A.ready) return;
    S.renderNow();
    const seq = ['KeyH', 'KeyE', 'KeyL', 'KeyL', 'KeyO', 'Space', 'KeyK', 'KeyB'];
    seq.forEach((c, i) => {
      const t = i * 125 + Math.random() * 30;
      setTimeout(() => S.down(c), t);
      setTimeout(() => S.up(c), t + 75 + Math.random() * 35);
    });
  };

  /* -------------------------------- description -------------------------------- */

  S.describe = function (P) {
    const tags = [];
    if (P.silent) tags.push('whisper quiet');
    if (P.pitch < 820) tags.push('deep');
    else if (P.pitch < 1000) tags.push(P.thock >= 1.1 ? 'thocky' : 'warm');
    else if (P.pitch > 1450) tags.push('high-pitched');
    else if (P.pitch > 1250) tags.push('bright');
    if (P.click === 'bar') tags.push(P.heavyBar ? 'loud thick click' : 'crisp click');
    else if (P.click) tags.push('clicky');
    if (P.bump > 0.7) tags.push('tactile');
    if (P.clack > 1.3) tags.push(P.pitch < 1000 ? 'crisp' : 'clacky');
    if (P.pop > 0.3) tags.push(P.pitch < 1200 ? 'marbly' : 'poppy');
    if (P.hollow > 0.85) tags.push('hollow');
    else if (P.hollow < 0.25) tags.push('dense');
    if (P.ping > 0.3) tags.push('metallic ring');
    if (P.scratch > 0.6) tags.push('scratchy');
    else if (P.scratch < 0.15) tags.push('smooth');
    if (P.springPing > 0.5) tags.push('spring ping');
    if (P.bright < 3500) tags.push('muted');
    if (P.attack > 0.35 && !P.silent) tags.push('soft bottom-out');
    if (P.rattle > 0.4) tags.push('rattly stabs');
    if (P.scratch < 0.15 && P.pitch < 1050 && P.attack > 0.12) tags.push('creamy');
    if (P.up > 0.45) tags.push('strong top-out');

    const depth = U.clamp((Math.log(P.pitch) - Math.log(600)) / (Math.log(2000) - Math.log(600)), 0, 1);
    const loud = U.clamp((P.loud * (P.click ? 1.25 : 1) - 0.3) / 1.0, 0, 1);
    const clack = U.clamp((P.clack / (P.clack + P.thock)) * 1.4 - 0.2, 0, 1);
    return { tags: tags.slice(0, 7), meters: { pitch: depth, volume: loud, clack } };
  };

  // the word the announcer shouts on combos: clicky → "clicky", tactile → "thocky", linear/silent → "creamy"
  S.comboKey = function (b) {
    const t = C.switchById[b.switch].type;
    return t === 'clicky' ? 'clicky' : t === 'tactile' ? 'thocky' : 'creamy';
  };
  S.comboWord = (b) => {
    const k = S.comboKey(b);
    return k[0].toUpperCase() + k.slice(1) + '!';
  };

  // plain-language write-up of the build's sound
  S.writeup = function (b) {
    const P = S.computeProfile(b), d = S.describe(P);
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap];
    const cs = C.CASES[b.case], pl = C.PLATES[b.plate], mt = C.MOUNTS[b.mount];
    const km = C.KC_MATERIALS[kc.material], kp = C.KC_PROFILES[kc.profile];
    const paras = [];

    if (sw.dome) {
      paras.push(`${sw.name} are Topre electro-capacitive switches: a rubber dome over a conical spring, so presses land with a rounded, muted "thock" and the release has its own soft "tok"${sw.type === 'silent' ? ' (the silent dome softens both)' : ''}.`);
    } else if (sw.type === 'clicky') {
      paras.push(P.click === 'bar'
        ? `${sw.name} switches use a click bar: a loud, full snap on the press and a second click on the release${P.heavyBar ? ' — this thick bar is one of the loudest clicks you can buy' : ''}.`
        : P.click === 'jacket'
          ? `${sw.name} switches fire a thin, high-pitched tick halfway down every press, then bottom out with a clack.`
          : `${sw.name} switches click with a leaf spring — a softer, double tick.`);
    } else if (sw.type === 'tactile') {
      paras.push(`${sw.name} tactiles give a ${sw.bump > 0.8 ? 'big, rounded' : sw.bump < 0.5 ? 'light' : 'clear'} bump you feel more than hear, then land with a ${P.thockF < 520 ? 'low thock' : 'solid clack'}.`);
    } else if (sw.type === 'silent') {
      paras.push(`${sw.name} switches have dampers on the stem, so both bottom-out and top-out are cushioned to a soft tap.`);
    } else {
      paras.push(`${sw.name} linears (${sw.force}g) slide straight down${P.scratch < 0.2 ? ' smoothly' : ' with a little scratch'} and hit bottom with a ${P.clackF > 3000 ? 'sharp, high clack' : P.thockF < 520 ? 'deep thock' : 'rounded clack'}${sw.longPole ? ' — the long-pole stem makes it short and poppy' : ''}.`);
    }

    const kmTxt = { pbt: 'thick PBT dries the sound out and pulls it lower', abs: 'ABS adds a brighter, glossier clack', pc: 'polycarbonate caps ring glassy and sharp', tpr: 'rubberized caps muffle almost everything', silicone: 'silicone caps deaden the strike', pom: 'POM caps are slick and slightly deeper', resin: 'resin caps sound dense and bright', ceramic: 'ceramic caps clink like porcelain', metal: 'metal caps clank and ring' }[kc.material];
    const kpTxt = { tall: 'their tall sculpted shells add a hollow, marbly depth', low: 'the low profile keeps every press short and thin', flat: 'the flat uniform profile keeps it a touch higher and tighter', sphere: 'the spherical dish adds a little depth', sculpt: 'the low sculpt keeps the sound focused' }[kp.shape];
    paras.push(`The keycaps are ${km.name.toUpperCase()} in ${kp.name} profile: ${kmTxt}, and ${kpTxt}.`);
    const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
    paras.push(`Underneath, ${an(cs.name)} case (${cs.desc}) holds ${an(pl.name)} plate (${pl.desc}) in ${an(mt.name)} — ${mt.desc}.`);

    const mods = b.mods.map((id) => C.modById[id]);
    const extra = [];
    if (mods.length) extra.push('Mods: ' + mods.map((m) => `${m.name} (${m.tags.join(', ')})`).join('; ') + '.');
    if (b.lube !== 'stock') extra.push(`Switches lubed with ${C.lubeById[b.lube].name} — ${C.lubeById[b.lube].desc}.`);
    else extra.push(sw.factoryLube ? 'Switches run with their factory lube.' : 'Switches run dry from the factory.');
    paras.push(extra.join(' '));

    const pitch = P.pitch < 820 ? 'deep' : P.pitch < 1000 ? 'low' : P.pitch < 1300 ? 'mid' : 'high';
    const vol = d.meters.volume < 0.35 ? 'quiet' : d.meters.volume < 0.7 ? 'moderate' : 'loud';
    const lean = d.meters.clack < 0.4 ? 'thock-leaning' : d.meters.clack > 0.6 ? 'clack-leaning' : 'balanced';
    const tips = [];
    if (P.springPing > 0.5) tips.push('lube or a force-break mod would remove the spring ping');
    if (P.hollow > 0.85) tips.push('case foam would tame the hollowness');
    if (P.rattle > 0.4) tips.push('lubed stabs would quiet the spacebar rattle');
    if (P.scratch > 0.6) tips.push('a hand-lube would smooth out the scratch');
    const verdict = `Overall: a ${pitch}-pitched, ${vol}, ${lean} board.` + (tips.length ? ' Upgrade tip: ' + tips.join('; ') + '.' : '');

    // lead with the board's character; flaws go last
    const flaw = (t) => /scratchy|spring ping|rattly|hollow/.test(t);
    const head = d.tags.filter((t) => !flaw(t)).concat(d.tags.filter(flaw)).slice(0, 3);
    return { headline: head.length ? head.join(' · ') : 'balanced', paras, verdict, tags: d.tags, meters: d.meters, word: S.comboWord(b) };
  };
})();
