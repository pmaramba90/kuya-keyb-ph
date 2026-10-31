(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util;
  const $ = (s) => document.querySelector(s);

  /*
   * Two modes share one engine:
   *   solo — survive 1 minute per level; misses fill the overflow bar.
   *   vs AI — you (left) against an AI typist (right), best of 3 three-minute rounds.
   *           Both fields get the same word stream; combo milestones attack the
   *           opponent's overflow bar (harder at higher tiers).
   *   vs players (pvp) — the same rules against another person online (see below).
   * A Board is one playing field (words, input, combo, overflow, power-ups).
   */
  const G = (KK.game = {});
  const LEVEL_SECONDS = 60;
  const ROUND_SECONDS = 90;
  const VS_LEVEL = { easy: 3, medium: 4, hard: 5 };
  const AI_WORD = { easy: 'creamy', medium: 'thocky', hard: 'clicky' };

  const POWERS = {
    freeze: { label: '❄ freeze', secs: 4, weight: 1 },
    slow: { label: '◷ slow', secs: 7, weight: 1 },
    double: { label: '×2 double', secs: 10, weight: 1 },
    erase: { label: '✕ erase', secs: 0, weight: 0.7 },
    subtract: { label: '− subtract', secs: 10, weight: 0.8 }, // each word typed lowers your overflow
  };
  const SUBTRACT = 0.05; // overflow taken off per word while subtract is on

  // word sizes: the smaller the word, the more it's worth (so small + long is the jackpot)
  const SIZES = [
    { fs: 0.72, mult: 2, weight: 0.2 },
    { fs: 0.86, mult: 1.5, weight: 0.25 },
    { fs: 1, mult: 1, weight: 0.35 },
    { fs: 1.3, mult: 0.7, weight: 0.2 },
  ];
  const NORMAL = 2;
  const sizeFor = (roll) => {
    for (let i = 0; i < SIZES.length; i++) if ((roll -= SIZES[i].weight) <= 0) return i;
    return NORMAL;
  };

  // vs modes: a miss doesn't fill your own bar — it lowers your opponent's by this
  // share of a miss's damage
  const MISS_RELIEF = 0.5;

  /* ---------------------------------- words ---------------------------------- */
  const POOLS = {};
  function pool(lang) {
    if (POOLS[lang]) return POOLS[lang];
    const raw = lang === 'mix' ? window.WORDS.en + ' ' + window.WORDS.tl : window.WORDS[lang] || window.WORDS.en;
    const words = [...new Set(raw.split(/\s+/).filter((w) => /^[a-z]{2,14}$/.test(w)))];
    const byLen = {};
    words.forEach((w) => (byLen[w.length] = byLen[w.length] || []).push(w));
    return (POOLS[lang] = byLen);
  }

  G.params = function (L) {
    return {
      fall: Math.max(5.5, 14 - 0.9 * (L - 1)), // seconds to cross the field
      spawn: Math.max(0.38, 1.5 * Math.pow(0.88, L - 1)), // seconds between words
      minLen: Math.min(3 + Math.floor((L - 1) / 2), 6),
      maxLen: Math.min(6 + L, 12),
      maxOn: Math.min(9 + 2 * L, 28),
      missDamage: Math.min(0.08 + 0.008 * (L - 1), 0.14),
      heal: 0.012,
    };
  };

  // single player: word length grows with the level — level 1 tops out at 3 letters,
  // then one more letter every two levels, and the levels in between mix in a few
  // words a letter longer (1: ≤3 · 2: ≤4 · 3: ≤4 + some 5 · 4: ≤5 · 5: ≤5 + some 6 …).
  // Power-ups come more often as it gets harder, so there's more to survive with.
  const soloParams = (L) => {
    const p = G.params(L);
    p.maxLen = Math.min(3 + Math.floor(L / 2), 12);
    p.minLen = Math.max(3, p.maxLen - 2);
    p.stretch = L >= 3 && L % 2 ? 0.2 : 0; // share of words one letter over the max
    p.powerChance = Math.min(0.1 + 0.02 * (L - 1), 0.28);
    p.maxPowers = L >= 6 ? 2 : 1; // glowing words on the field at once
    return p;
  };
  G.soloParams = soloParams;

  // vs modes: a busier field — words come ~1.5x as often and more can be on screen
  const vsParams = (L) => {
    const p = G.params(L);
    p.spawn *= 0.65;
    p.maxOn += 8;
    return p;
  };

  // one spawn event; in vs mode the same event is sent to both fields. Against another
  // player both sides draw from the same seeded generator, and the number of draws never
  // depends on what's on either field, so the two streams stay identical.
  function makeSpawn(run) {
    const p = run.p, byLen = pool(run.lang), rnd = run.rnd;
    const roll = rnd(), pick = rnd(), sizeRoll = rnd();
    let power = null;
    const onField = Math.max(0, ...run.boards.map((b) => b.words.filter((w) => w.power).length));
    const busy = run.kind === 'pvp' ? run.sincePower < 8 : onField >= (p.maxPowers || 1);
    run.sincePower = (run.sincePower || 0) + 1;
    if (run.elapsed > 4 && roll < (p.powerChance || 0.1) && !busy) {
      const entries = Object.entries(POWERS);
      let r = pick * entries.reduce((s, [, x]) => s + x.weight, 0);
      for (const [k, x] of entries) if ((r -= x.weight) <= 0) { power = k; break; }
      run.sincePower = 0;
    }
    for (let tries = 0; tries < 25; tries++) {
      let len = power
        ? Math.min(4 + Math.floor(rnd() * 3), p.maxLen) // no longer than the level allows
        : p.minLen + Math.floor(Math.pow(rnd(), 1.4) * (p.maxLen - p.minLen + 1));
      if (!power && p.stretch && rnd() < p.stretch) len = p.maxLen + 1; // single player's in-between levels
      const list = byLen[len] || byLen[Math.min(len, 9)] || byLen[5];
      const text = list ? list[Math.floor(rnd() * list.length)] : null;
      // no repeats among recent words (fewer of them when that length has few words)
      if (!text || run.recent.slice(-Math.min(40, Math.floor(list.length / 2))).includes(text)) continue;
      run.recent.push(text);
      if (run.recent.length > 40) run.recent.shift();
      return { text, power, xf: rnd(), vf: 0.8 + rnd() * 0.4, sz: power ? NORMAL : sizeFor(sizeRoll) };
    }
    return null;
  }

  /* --------------------------------- widgets --------------------------------- */
  // combo meter: count with fire that grows each tier, tier name, progress to the next tier
  function renderMeter(root, b, bump) {
    if (!root) return;
    const c = b.combo;
    const tier = KK.voice.tierFor(c);
    const heat = tier === 'wow' ? 5 : tier;
    const fire = root.querySelector('.cm-fire');
    if (!fire.childElementCount) {
      for (let i = 0; i < 12; i++) {
        const f = document.createElement('i');
        f.style.left = 4 + ((i * 37) % 92) + '%';
        f.style.animationDelay = -(i * 0.13).toFixed(2) + 's';
        f.style.setProperty('--d', (0.7 + ((i * 7) % 5) * 0.12).toFixed(2) + 's');
        fire.appendChild(f);
      }
    }
    root.className = 'cmeter t-' + heat + (root.dataset.mini ? ' mini' : '');
    root.style.setProperty('--heat', heat);
    root.querySelector('.cm-count').textContent = c + 'x';
    root.querySelector('.cm-tier').textContent = heat ? KK.voice.label(b.word, tier).replace(/!+$/, '') : c ? 'warming up…' : 'no combo yet';
    root.querySelector('.cm-fill').style.width = (heat === 5 ? 100 : ((c % 5) / 5) * 100) + '%';
    const m = 'x' + b.mult().toFixed(2).replace(/\.?0+$/, '') + ' score';
    root.querySelector('.cm-next').textContent = heat === 5 ? `${m} · max heat` : `${m} · next: ${KK.voice.label(b.word, heat + 1 === 5 ? 'wow' : heat + 1).replace(/!+$/, '')} at ${(heat + 1) * 5}x`;
    if (bump) {
      root.classList.remove('bump');
      void root.offsetWidth;
      root.classList.add('bump');
    }
  }

  function renderOverflow(root, bar) {
    if (!root) return;
    const pct = Math.round(bar * 100) + '%';
    root.querySelector('.ofill').style.width = pct;
    root.querySelector('.opct').textContent = pct;
    root.querySelector('.overflow').classList.toggle('danger', bar >= 0.75);
  }

  /* ---------------------------------- Board ---------------------------------- */
  class Board {
    constructor(o) {
      this.field = o.field;
      this.typedEl = o.typed;
      this.powersEl = o.powers || null;
      this.meterEl = o.meter || null;
      this.overflowEl = o.overflow || null;
      this.ai = !!o.ai;
      this.missFills = o.missFills !== false; // vs modes: misses don't fill your own bar
      this.word = o.word;
      this.p = o.p;
      this.hooks = o.hooks || {};
      this.toastEl = this.field.querySelector('.toast');
      if (this.meterEl && o.miniMeter) this.meterEl.dataset.mini = '1';
      this.reset();
    }

    emit(name, ...a) {
      if (this.hooks[name]) this.hooks[name](this, ...a);
    }

    reset() {
      this.clearField();
      Object.assign(this, {
        words: [], buffer: '', bar: 0, combo: 0, maxCombo: 0, score: 0,
        keys: 0, correct: 0, done: 0, missed: 0, powersUsed: 0, dead: false,
        fx: { freeze: 0, slow: 0, double: 0, subtract: 0 },
      });
      this.field.classList.remove('frozen', 'slowed', 'doubled');
      this.measure();
      this.renderTyped();
      this.renderPowers();
      renderMeter(this.meterEl, this, false);
      this.renderBar();
    }

    // overflow bar + the field's danger state: the border reddens and flickers as the
    // bar fills; from 75% the whole box shakes, faster and harder until it overflows
    renderBar() {
      renderOverflow(this.overflowEl, this.bar);
      const d = U.clamp(this.bar, 0, 1);
      const f = this.field;
      f.style.setProperty('--danger', d.toFixed(3));
      f.style.setProperty('--shake', U.clamp((d - 0.75) / 0.25, 0, 1).toFixed(3));
      f.classList.toggle('danger', d > 0 && !this.dead);
      f.classList.toggle('quaking', d >= 0.75 && !this.dead);
    }

    clearField() {
      this.field.querySelectorAll('.fw, .pop, .wreck').forEach((n) => n.remove());
      this.field.classList.remove('destroyed', 'danger', 'quaking');
    }

    measure() {
      const s = document.createElement('span');
      s.className = 'fw';
      s.style.visibility = 'hidden';
      s.textContent = 'mmmmmmmmmm';
      this.field.appendChild(s);
      this.charW = s.getBoundingClientRect().width / 10 || 13;
      s.remove();
      this.W = this.field.clientWidth;
      this.H = this.field.clientHeight;
    }

    mult() {
      return 1 + Math.min(this.combo, 40) * 0.05;
    }

    // longer words and smaller words are worth more (w.mult: the size's multiplier)
    points(w, heightBonus) {
      return Math.round(w.text.length * 10 * (w.mult || 1) * this.mult() * (heightBonus ? 1 + 0.5 * U.clamp(1 - w.y / this.H, 0, 1) : 1) * (this.fx.double > 0 ? 2 : 1));
    }

    spawn(ev) {
      if (!ev || this.dead || this.words.length >= this.p.maxOn || this.fx.freeze > 0) return;
      if (this.words.some((x) => x.text === ev.text)) return;
      const sz = SIZES[ev.sz] ? ev.sz : NORMAL;
      const width = ev.text.length * this.charW * SIZES[sz].fs;
      const span = Math.max(10, this.W - width - 20);
      let x = 10;
      for (let t = 0; t < 10; t++) {
        x = 10 + ((ev.xf + t * 0.37) % 1) * span;
        if (!this.words.some((o) => o.y < 60 && x < o.x + o.width + 16 && o.x < x + width + 16)) break;
      }
      const el = document.createElement('div');
      el.className = 'fw' + (ev.power ? ' pw pw-' + ev.power : '');
      el.style.setProperty('--fs', SIZES[sz].fs);
      el.innerHTML = (ev.power ? `<span class="pl">${POWERS[ev.power].label}</span>` : '') + '<span class="t"></span><span class="r"></span>';
      el.lastChild.textContent = ev.text;
      this.field.appendChild(el);
      const v = ((this.H - 30) / this.p.fall) * ev.vf * (1 - Math.max(0, ev.text.length - 5) * 0.03);
      const w = { text: ev.text, x, y: -30, v, el, width, power: ev.power, sz, mult: SIZES[sz].mult, t: el.querySelector('.t'), r: el.querySelector('.r') };
      el.style.transform = `translate(${x}px, ${w.y}px)`;
      this.words.push(w);
      if (this.buffer) this.refreshMatches();
    }

    step(dt) {
      this.W = this.field.clientWidth;
      this.H = this.field.clientHeight;
      this.tickPowers(dt);
      const speed = this.fx.freeze > 0 ? 0 : this.fx.slow > 0 ? 0.4 : 1;
      const floor = this.H - 30;
      for (let i = this.words.length - 1; i >= 0; i--) {
        const w = this.words[i];
        if (!w) continue;
        w.y += w.v * speed * dt;
        w.el.style.transform = `translate(${w.x}px, ${w.y}px)`;
        w.el.classList.toggle('low', w.y > floor * 0.75);
        if (w.y > floor) {
          this.miss(w);
          if (this.dead) return;
        }
      }
    }

    removeWord(w, cls) {
      const i = this.words.indexOf(w);
      if (i >= 0) this.words.splice(i, 1);
      w.el.style.setProperty('--tr', w.el.style.transform);
      w.el.classList.add(cls);
      setTimeout(() => w.el.remove(), 400);
    }

    popup(x, y, text, cls) {
      const el = document.createElement('div');
      el.className = 'pop' + (cls ? ' ' + cls : '');
      el.textContent = text;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      this.field.appendChild(el);
      setTimeout(() => el.remove(), 950);
    }

    toast(text, cls) {
      const t = this.toastEl;
      if (!t) return;
      t.textContent = text;
      t.className = 'toast' + (cls ? ' ' + cls : '');
      void t.offsetWidth;
      t.classList.add('show');
    }

    shake(cls) {
      this.field.classList.remove(cls);
      void this.field.offsetWidth;
      this.field.classList.add(cls);
    }

    complete(w) {
      const pts = this.points(w, true);
      this.score += pts;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.done++;
      this.buffer = '';
      this.bar = Math.max(0, this.bar - this.p.heal);
      if (this.fx.subtract > 0 && this.bar > 0) {
        this.bar = Math.max(0, this.bar - SUBTRACT);
        this.popup(this.W - 70, 40, `−${Math.round(SUBTRACT * 100)}% overflow`, 'relief');
      }
      w.t.textContent = w.text;
      w.r.textContent = '';
      this.removeWord(w, 'done');
      this.popup(w.x + w.width / 2, w.y, '+' + pts, this.fx.double > 0 ? 'dbl' : '');
      if (!this.ai) KK.sfx.word(this.combo, this.fx.double > 0);
      renderMeter(this.meterEl, this, true);
      this.renderBar();
      if (w.power) this.activate(w.power);
      if (this.combo % 5 === 0) this.emit('combo', KK.voice.tierFor(this.combo));
      this.refreshMatches();
      this.renderTyped();
      this.emit('change');
    }

    // a word reaching the bottom doesn't touch your combo — only a typo does (typeChar)
    miss(w) {
      this.missed++;
      if (this.missFills) this.bar = Math.min(1, this.bar + this.p.missDamage + w.text.length * 0.003);
      const g = this.goodPrefix(this.buffer);
      this.removeWord(w, 'dead');
      this.popup(w.x + w.width / 2, this.H - 56, 'miss', 'neg');
      if (!this.ai) {
        KK.sfx.miss();
        if (this.missFills && this.bar >= 0.75) KK.sfx.danger();
      }
      this.emit('missed', w);
      this.shake('shake');
      // if this was the word being typed (and nothing else shares that start), drop the input
      if (this.buffer && (!g || (w.text.startsWith(g) && !this.words.some((o) => o.text.startsWith(g))))) this.buffer = '';
      this.renderTyped();
      this.refreshMatches();
      renderMeter(this.meterEl, this, false);
      this.renderBar();
      this.emit('change');
      this.checkDead();
    }

    // overflow pushed up by the opponent's combo
    damage(amount, label) {
      if (this.dead) return;
      this.bar = Math.min(1, this.bar + amount);
      this.popup(this.W / 2, 24, `−${Math.round(amount * 100)}% ${label}`, 'neg hitpop');
      this.shake('hit');
      this.renderBar();
      this.emit('change');
      this.checkDead();
    }

    // the opponent missed a word: your overflow comes down
    relieve(amount) {
      if (this.dead || this.bar <= 0) return;
      this.bar = Math.max(0, this.bar - amount);
      this.popup(this.W / 2, 24, `−${Math.round(amount * 100)}% overflow · they missed`, 'relief');
      this.renderBar();
      this.emit('change');
    }

    checkDead() {
      if (this.bar >= 1 && !this.dead) {
        this.dead = true;
        this.renderBar(); // stop the shaking; the knockout effects take over
        this.emit('dead');
      }
    }

    activate(type) {
      this.powersUsed++;
      if (!this.ai) KK.sfx.power(type);
      if (type === 'erase') {
        let sum = 0;
        this.words.slice().forEach((o) => {
          const pts = this.points(o, false);
          sum += pts;
          this.popup(o.x + o.width / 2, o.y, '+' + pts, 'dbl');
          this.removeWord(o, 'done');
        });
        this.score += sum;
        this.buffer = '';
        this.shake('flash');
        this.toast(`erase! +${sum}`, 'pw-erase');
      } else {
        this.fx[type] = POWERS[type].secs;
        this.toast(type + '!', 'pw-' + type);
      }
      this.renderPowers();
    }

    tickPowers(dt) {
      let active = false;
      for (const k in this.fx) {
        if (this.fx[k] > 0) {
          this.fx[k] = Math.max(0, this.fx[k] - dt);
          if (this.fx[k] === 0 && !this.ai) KK.sfx.powerEnd();
          active = true;
        }
      }
      this.field.classList.toggle('frozen', this.fx.freeze > 0);
      this.field.classList.toggle('slowed', this.fx.slow > 0);
      this.field.classList.toggle('doubled', this.fx.double > 0);
      if (active) this.renderPowers();
    }

    renderPowers() {
      if (!this.powersEl) return;
      const html = Object.entries(this.fx)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `<span class="pchip pw-${k}">${POWERS[k].label} <b>${v.toFixed(1)}s</b></span>`)
        .join('');
      const out = html || (this.ai ? '' : '<span class="hint">type a glowing word to grab its power-up</span>');
      if (this.powersEl.innerHTML !== out) this.powersEl.innerHTML = out;
    }

    // longest start of the input that still matches some falling word
    goodPrefix(buf) {
      for (let n = buf.length; n > 0; n--) {
        const p = buf.slice(0, n);
        if (this.words.some((w) => w.text.startsWith(p))) return p;
      }
      return '';
    }

    refreshMatches() {
      const g = this.goodPrefix(this.buffer);
      const wrong = this.buffer.length > g.length;
      this.words.forEach((w) => {
        const hit = g && w.text.startsWith(g);
        w.el.classList.toggle('hit', !!hit);
        w.el.classList.toggle('typo', !!hit && wrong);
        w.t.textContent = hit ? g : '';
        w.r.textContent = hit ? w.text.slice(g.length) : w.text;
      });
    }

    // correct part in yellow, mistyped tail in red until it's backspaced
    renderTyped() {
      if (!this.typedEl) return;
      const g = this.goodPrefix(this.buffer);
      this.typedEl.innerHTML = '';
      this.typedEl.appendChild(document.createTextNode(g));
      if (this.buffer.length > g.length) {
        const s = document.createElement('span');
        s.className = 'wrong';
        s.textContent = this.buffer.slice(g.length);
        this.typedEl.appendChild(s);
      }
      const c = document.createElement('span');
      c.className = 'caret';
      this.typedEl.appendChild(c);
    }

    // every key goes into the input like a normal text box; returns 'done' | 'ok' | 'err'
    typeChar(c) {
      if (this.buffer.length >= 24) return 'err';
      this.keys++;
      const wasClean = this.goodPrefix(this.buffer).length === this.buffer.length;
      this.buffer += c;
      const matches = this.words.filter((w) => w.text.startsWith(this.buffer));
      if (!matches.length) {
        if (wasClean) {
          this.combo = Math.floor(this.combo / 2); // one penalty per slip, not per extra key
          renderMeter(this.meterEl, this, false);
        }
        if (!this.ai) KK.sfx.error();
        this.refreshMatches();
        this.renderTyped();
        return 'err';
      }
      this.correct++;
      const exact = matches.filter((w) => w.text === this.buffer).sort((a, b) => b.y - a.y);
      if (exact.length) {
        this.complete(exact[0]);
        return 'done';
      }
      this.refreshMatches();
      this.renderTyped();
      return 'ok';
    }

    backspace() {
      this.buffer = this.buffer.slice(0, -1);
      this.refreshMatches();
      this.renderTyped();
    }

    clearInput() {
      this.buffer = '';
      this.refreshMatches();
      this.renderTyped();
    }

    acc() {
      return this.keys ? Math.round((this.correct / this.keys) * 100) : 100;
    }
  }

  /* -------------------------------- AI typist -------------------------------- */
  // A human-like opponent: reaction delay before each word, a typing rate with
  // jitter, occasional typos that it notices and backspaces, and brief lapses.
  const AI_CFG = {
    easy: { cps: 3.4, err: 0.07, react: [0.4, 0.8], lapse: 0.06 },
    medium: { cps: 5.2, err: 0.035, react: [0.2, 0.38], lapse: 0.03 },
    hard: { cps: 7.6, err: 0.012, react: [0.11, 0.2], lapse: 0.01 },
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

  class AIPlayer {
    constructor(board, diff) {
      this.b = board;
      this.cfg = AI_CFG[diff];
      this.reset();
    }
    reset() {
      this.target = null;
      this.wait = 1;
    }
    gap() {
      return (1 / this.cfg.cps) * rand(0.6, 1.4);
    }
    tick(dt) {
      if (this.b.dead) return;
      this.wait -= dt;
      for (let guard = 0; this.wait <= 0 && guard < 6; guard++) this.act();
    }
    act() {
      const b = this.b, cfg = this.cfg;
      // notice a typo → backspace it
      if (b.buffer.length > b.goodPrefix(b.buffer).length) {
        b.backspace();
        this.wait = this.gap() * 1.3;
        return;
      }
      if (this.target && !b.words.includes(this.target)) this.target = null;
      if (!this.target) {
        if (!b.words.length) {
          this.wait = 0.15;
          return;
        }
        // most urgent word, but sometimes grab a power-up while it's still high
        const ws = b.words.slice().sort((x, y) => y.y - x.y);
        const pw = ws.find((w) => w.power && w.y < b.H * 0.6);
        this.target = pw && Math.random() < 0.5 ? pw : ws[0];
        if (b.buffer && !this.target.text.startsWith(b.buffer)) b.clearInput();
        this.wait = rand(...cfg.react) + (Math.random() < cfg.lapse ? rand(0.8, 1.6) : 0);
        return;
      }
      let c = this.target.text[b.buffer.length];
      if (Math.random() < cfg.err) c = LETTERS[Math.floor(Math.random() * 26)];
      const r = b.typeChar(c);
      if (r === 'done') {
        this.target = null;
        this.wait = rand(...cfg.react) * 0.6;
      } else this.wait = this.gap();
    }
  }

  /* ------------------------------ shared run loop ------------------------------ */
  let run = null;

  function stopRun() {
    if (!run) return;
    run.running = false;
    run.boards.forEach((b) => b.clearField());
  }

  function begin() {
    run.running = true;
    run.last = performance.now();
    KK.anticheat.reset(caught);
    requestAnimationFrame(frame);
    if (run.kind === 'pvp') keepTicking();
  }

  function frame() {
    if (!run || !run.running) return;
    advance();
    requestAnimationFrame(frame);
  }

  // A covered, minimized or alt-tabbed window gets no animation frames, but a match
  // against a person must keep going: a worker's timer (not throttled like the page's)
  // steps the game whenever frames stop arriving.
  let ticker = null;
  function keepTicking() {
    if (ticker) return;
    const onTick = () => run && run.running && run.kind === 'pvp' && performance.now() - run.last > 120 && advance();
    try {
      const src = 'setInterval(() => postMessage(0), 100);';
      ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      ticker.onmessage = onTick;
    } catch (e) {
      ticker = setInterval(onTick, 100); // no workers: page timers (slowed to ~1/s when hidden)
    }
  }

  // runs the clock up to now. Against a person a late step (after a stall) is caught
  // up in small slices, so words keep falling, spawning and missing as usual; solo and
  // vs AI just carry on (they pause when you leave the window).
  function advance() {
    const now = performance.now();
    let dt = Math.min((now - run.last) / 1000, run.kind === 'pvp' ? 10 : 0.05);
    run.last = now;
    while (dt > 0.0005 && run && run.running && !run.paused) {
      const s = Math.min(dt, 0.05);
      dt -= s;
      run.time -= s;
      run.elapsed += s;
      run.tick(s);
      if (!run || !run.running) return;
      KK.anticheat.watch(G.human().keys);
      if (!run || !run.running) return;
      const sec = Math.ceil(run.time);
      if (sec !== run.lastSec) {
        run.lastSec = sec;
        if (sec <= 10 && sec > 0) KK.sfx.tick();
      }
    }
  }

  function spawnTick(dt) {
    run.spawnT -= dt;
    if (run.spawnT <= 0 && run.time > 1.2) {
      const ev = makeSpawn(run);
      run.boards.forEach((b) => b.spawn(ev));
      run.spawnT = run.burst > 0 ? 0.45 : run.p.spawn * (0.75 + run.rnd() * 0.5);
      if (run.burst > 0) run.burst--;
    }
  }

  const announce = (b, tier) => {
    KK.voice.announce(b.word, tier);
    b.toast(KK.voice.label(b.word, tier), 'combo t-' + tier);
  };

  G.isRunning = () => !!(run && run.running);
  G.mode = () => run && run.kind;
  G.human = () => run && (run.kind === 'solo' ? run.board : run.you);
  // test hooks
  G._state = () => {
    const b = G.human();
    if (b) b.run = run;
    return b;
  };
  G._activate = (type) => G.human().activate(type);
  // n single-player spawns for a level, without playing: [{ len, power }]
  G._spawns = (level, n, lang) => {
    const fake = { kind: 'solo', p: soloParams(level), lang: lang || 'en', rnd: Math.random, recent: [], elapsed: 10, boards: [], sincePower: 0 };
    return Array.from({ length: n }, () => makeSpawn(fake)).filter(Boolean).map((e) => ({ len: e.text.length, power: e.power }));
  };

  /* ---------------------------------- solo ---------------------------------- */
  G.start = function (level, lang, startTotal) {
    stopRun();
    const p = soloParams(level);
    const board = new Board({
      field: $('#field'), typed: $('#typed'), powers: $('#powers'), meter: $('#cmeter'), overflow: $('#overflow'),
      word: KK.keysound.comboKey(KK.app.build), p,
      hooks: { combo: announce, change: () => soloHud(), dead: () => soloEnd(false) },
    });
    run = {
      kind: 'solo', level, lang, p, board, boards: [board], startTotal: startTotal || 0, rnd: Math.random,
      time: LEVEL_SECONDS, elapsed: 0, spawnT: 0.2, burst: 4, recent: [], lastSec: LEVEL_SECONDS,
      running: false, paused: false, hud: {},
      tick(dt) {
        if (board.fx.freeze <= 0) spawnTick(dt);
        board.step(dt);
        if (!run.running) return;
        soloHud();
        if (run.time <= 0) soloEnd(true);
      },
    };
    $('#hudLevel').textContent = 'level ' + level;
    soloHud(true);
    KK.ui.countdown(begin, "type the falling words · don't let misses overflow the bar · survive 1:00 · smaller words score more");
  };

  function soloHud(force) {
    const b = run.board, h = run.hud;
    const vals = { time: U.fmtTime(run.time), total: (run.startTotal + b.score).toLocaleString(), score: b.score.toLocaleString(), acc: b.acc() + '%' };
    [['time', '#hudTime'], ['total', '#hudTotal'], ['score', '#hudScore'], ['acc', '#hudAcc']].forEach(([k, id]) => {
      if (force || h[k] !== vals[k]) $(id).textContent = h[k] = vals[k];
    });
    $('#hudTime').classList.toggle('warn', run.time <= 10);
  }

  function soloEnd(survived) {
    if (!run || run.kind !== 'solo' || !run.running) return;
    run.running = false;
    const b = run.board;
    b.words.slice().forEach((w) => b.removeWord(w, survived ? 'done' : 'dead'));
    const total = run.startTotal + b.score;
    const stars = !survived ? 0 : b.bar < 0.25 ? 3 : b.bar < 0.6 ? 2 : 1;
    const prog = KK.app.progress;
    const prevBest = prog.best[run.level] || 0;
    if (b.score > prevBest) prog.best[run.level] = b.score;
    const newTotalBest = total > (prog.bestTotal || 0);
    if (newTotalBest) prog.bestTotal = total;
    if (survived) prog.unlocked = Math.max(prog.unlocked, run.level + 1);
    KK.app.saveProgress();
    KK.app.run.total = total;
    KK.builder.level = 1; // a new run always starts at level 1; only "next level" continues
    KK.app.recordProfileScore(total);

    if (survived) KK.sfx.clear();
    else {
      KK.sfx.fail();
      KK.voice.call('gameover', 0.35);
    }
    KK.music.duck(true);

    const level = run.level;
    const starHtml = [1, 2, 3].map((i) => `<span class="${i <= stars ? '' : 'off'}">★</span>`).join('');
    KK.ui.open(
      `${survived ? `<div class="stars">${starHtml}</div>` : ''}
       <div class="ov-h">${survived ? `level ${level} survived` : 'overflow — game over'}</div>
       <div class="ov-sub">${survived ? `overflow at ${Math.round(b.bar * 100)}% · next level unlocked` : `you lasted ${U.fmtTime(run.elapsed)} on level ${level}`}</div>
       <div class="res-big">
         <div><span class="hud-lbl">total score</span><b>${total.toLocaleString()}</b><span class="hud-lbl">${newTotalBest ? 'new best!' : 'best ' + (prog.bestTotal || 0).toLocaleString()}</span></div>
         <div><span class="hud-lbl">level score</span><b>${b.score.toLocaleString()}</b></div>
         <div><span class="hud-lbl">max combo</span><b>${b.maxCombo}x</b></div>
         <div><span class="hud-lbl">acc</span><b>${b.acc()}%</b></div>
       </div>
       <div class="res-small">words <b>${b.done}</b> · missed <b>${b.missed}</b> · power-ups <b>${b.powersUsed}</b></div>
       <div class="ov-btns">
         ${survived ? `<button class="btn primary" data-ov="next" data-primary>level ${level + 1} →</button><button class="btn" data-ov="retry">retry level ${level}</button>` : `<button class="btn primary" data-ov="restart" data-primary>play again from level 1</button>`}
         <button class="btn" data-ov="build">tweak keyboard</button>
         <button class="btn ghost" data-ov="menu">menu</button>
       </div>
       <p class="hint" style="margin-top:16px"><span class="kbd">enter</span> ${survived ? 'next level' : 'play again from level 1'}</p>`,
      {
        next: () => { KK.ui.close(); KK.app.startGame(level + 1, 'next'); },
        retry: () => { KK.ui.close(); KK.app.startGame(level, 'retry'); },
        restart: () => { KK.ui.close(); KK.app.startGame(1); },
        build: () => { KK.ui.close(); G.quit(); KK.builder.open(4); },
        menu: () => { KK.ui.close(); G.quit(); KK.app.show('play'); },
        esc: () => { KK.ui.close(); G.quit(); KK.app.show('play'); },
      }
    );
  }

  /* --------------------------------- vs AI --------------------------------- */
  G.startVs = function (diff, lang) {
    stopRun();
    const level = VS_LEVEL[diff];
    const p = vsParams(level);
    const laneL = $('#laneL'), laneR = $('#laneR');
    const you = new Board({
      field: $('#vsFieldL'), typed: $('#vsTypedL'), powers: laneL.querySelector('.powers'),
      meter: laneL.querySelector('.cmeter'), overflow: laneL.querySelector('.meter-row'), miniMeter: true,
      word: KK.keysound.comboKey(KK.app.build), p, missFills: false,
      hooks: { combo: (b, t) => { announce(b, t); attack(b, run.ai, t); }, missed: () => run.running && run.ai.relieve(p.missDamage * MISS_RELIEF), change: () => vsHud(), dead: () => roundEnd() },
    });
    const ai = new Board({
      field: $('#vsFieldR'), typed: $('#vsTypedR'), powers: laneR.querySelector('.powers'),
      meter: laneR.querySelector('.cmeter'), overflow: laneR.querySelector('.meter-row'), miniMeter: true,
      ai: true, word: AI_WORD[diff], p, missFills: false,
      hooks: { combo: (b, t) => { b.toast(KK.voice.label(b.word, t), 'combo t-' + t); attack(b, run.you, t); }, missed: () => run.running && run.you.relieve(p.missDamage * MISS_RELIEF), change: () => vsHud(), dead: () => roundEnd() },
    });
    run = {
      kind: 'vs', diff, lang, level, p, you, ai, boards: [you, ai], bot: new AIPlayer(ai, diff), rnd: Math.random,
      round: 0, wins: [0, 0], history: [], running: false, paused: false, hud: {},
      tick(dt) {
        spawnTick(dt);
        run.bot.tick(dt);
        you.step(dt);
        if (!run.running) return;
        ai.step(dt);
        if (!run.running) return;
        vsHud();
        if (run.time <= 0) roundEnd();
      },
    };
    $('#vsNameL').textContent = KK.app.userName ? KK.app.userName() : 'you';
    $('#vsNameR').textContent = `ai · ${diff}`;
    startRound();
  };

  function startRound() {
    run.round++;
    run.boards.forEach((b) => b.reset());
    run.bot.reset();
    Object.assign(run, { time: ROUND_SECONDS, elapsed: 0, spawnT: 0.2, burst: 4, recent: [], lastSec: ROUND_SECONDS, running: false, paused: false, hud: {} });
    vsHud(true);
    KK.music.duck(false);
    KK.voice.call('round' + Math.min(run.round, 3), 0.1);
    KK.ui.countdown(begin, `round ${run.round} · best of 3 · 1:30 · your combos fill the AI's overflow, your misses lower it · smaller words score more`, () => KK.voice.call('fight'));
  }

  // combo milestone → the opponent's overflow bar rises: a bit less than a miss at
  // 5x, growing with the tier (60% of a miss … 100% at WOW)
  function attackOf(from, tier) {
    const n = tier === 'wow' ? 5 : tier;
    return { n, dmg: run.p.missDamage * (0.9 + 0.3 * n), label: KK.voice.label(from.word, tier).replace(/!+$/, '') };
  }
  function flyAttack(dir, n, dmg) {
    const fly = document.createElement('div');
    fly.className = 'attack ' + dir + ' t-' + n;
    fly.textContent = `${n === 5 ? 'WOW' : n + '×'} −${Math.round(dmg * 100)}%`;
    $('#scr-vs .vs-lanes').appendChild(fly);
    setTimeout(() => fly.remove(), 700);
  }
  // lands on the left field ~when the flying label arrives
  function takeHit(dmg, label) {
    setTimeout(() => {
      if (!run || !run.running) return;
      run.you.damage(dmg, label + ' attack');
      KK.sfx.hit();
    }, 420);
  }

  function attack(from, to, tier) {
    if (!run || !run.running || to.dead) return;
    const a = attackOf(from, tier);
    flyAttack(from === run.you ? 'to-r' : 'to-l', a.n, a.dmg);
    if (from === run.you) {
      KK.sfx.attack();
      setTimeout(() => run && run.running && to.damage(a.dmg, a.label + ' attack'), 420);
    } else takeHit(a.dmg, a.label);
  }

  function vsHud(force) {
    if (!run || run.kind === 'solo') return;
    const h = run.hud;
    const vals = { time: U.fmtTime(run.time), l: run.you.score.toLocaleString(), r: (run.ai || run.opp).score.toLocaleString() };
    if (force || h.time !== vals.time) $('#vsTime').textContent = h.time = vals.time;
    if (force || h.l !== vals.l) $('#vsScoreL').textContent = h.l = vals.l;
    if (force || h.r !== vals.r) $('#vsScoreR').textContent = h.r = vals.r;
    $('#vsTime').classList.toggle('warn', run.time <= 10);
    if (force) {
      $('#vsRound').textContent = `round ${run.round} · best of 3`;
      const pips = (n) => [0, 1].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      $('#vsWins').innerHTML = `<span>${pips(run.wins[0])}</span><em>${run.wins[0]} – ${run.wins[1]}</em><span>${pips(run.wins[1])}</span>`;
    }
  }

  /* "screen destroyed": cracks spider out from an impact point, glass shards burst
   * and fall, the remaining words tumble off, and OVERFLOW slams in diagonally */
  function crackPaths(W, H, cx, cy) {
    const paths = [];
    const ray = (x, y, ang, steps, len, cls, delay) => {
      let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      for (let i = 0; i < steps; i++) {
        ang += (Math.random() - 0.5) * 0.7;
        x += Math.cos(ang) * len * (0.6 + Math.random() * 0.8);
        y += Math.sin(ang) * len * (0.6 + Math.random() * 0.8);
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        if (Math.random() < 0.28 && cls === 'crack') ray(x, y, ang + (Math.random() < 0.5 ? 0.9 : -0.9), 3 + Math.floor(Math.random() * 3), len * 0.6, 'crack thin', delay + i * 0.02);
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) break;
      }
      paths.push(`<path class="${cls}" pathLength="1" d="${d}" style="animation-delay:${delay.toFixed(2)}s"/>`);
    };
    const n = 13;
    for (let k = 0; k < n; k++) ray(cx, cy, (k / n) * Math.PI * 2 + Math.random() * 0.4, 10 + Math.floor(Math.random() * 6), 34, 'crack', Math.random() * 0.06);
    // broken rings around the impact
    [26, 58, 104].forEach((r, ri) => {
      let d = '';
      const segs = 18;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2, rr = r * (0.8 + Math.random() * 0.4);
        if (Math.random() < 0.25) continue;
        d += `${d ? ' L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
      }
      if (d) paths.push(`<path class="crack thin" pathLength="1" d="${d}" style="animation-delay:${(0.08 + ri * 0.05).toFixed(2)}s"/>`);
    });
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${paths.join('')}</svg>`;
  }

  function wreck(b) {
    const f = b.field;
    const W = f.clientWidth, H = f.clientHeight;
    const cx = W * (0.35 + Math.random() * 0.3), cy = H * (0.3 + Math.random() * 0.25);
    const w = document.createElement('div');
    w.className = 'wreck';
    w.style.setProperty('--cx', cx + 'px');
    w.style.setProperty('--cy', cy + 'px');
    w.innerHTML = crackPaths(W, H, cx, cy) + '<div class="wreck-flash"></div><div class="wreck-text"><span>OVERFLOW</span></div>';
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('i');
      const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 300;
      s.className = 'shard';
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.sin(ang) * dist * 0.5 + 220 + Math.random() * 160).toFixed(0) + 'px');
      s.style.setProperty('--rot', (Math.random() * 900 - 450).toFixed(0) + 'deg');
      s.style.setProperty('--s', (0.5 + Math.random() * 1.3).toFixed(2));
      s.style.animationDelay = (Math.random() * 0.1).toFixed(2) + 's';
      w.appendChild(s);
    }
    f.appendChild(w);
    f.classList.add('destroyed');
    // whatever was still falling tumbles off the broken screen
    b.words.forEach((x) => {
      x.el.style.setProperty('--tr', x.el.style.transform);
      x.el.style.setProperty('--dx', ((Math.random() - 0.5) * 180).toFixed(0) + 'px');
      x.el.style.setProperty('--rot', ((Math.random() - 0.5) * 140).toFixed(0) + 'deg');
      x.el.style.animationDelay = (Math.random() * 0.2).toFixed(2) + 's';
      x.el.classList.add('crash');
    });
    b.words = [];
    const app = $('#app');
    app.classList.remove('quake');
    void app.offsetWidth;
    app.classList.add('quake');
  }

  // the home page shows your best round score per mode (vsBest: vs AI, pvpBest: vs players)
  function bestRound(key, score) {
    const prog = KK.app.progress;
    if (score > (prog[key] || 0)) {
      prog[key] = score;
      KK.app.saveProgress();
    }
  }

  function roundEnd() {
    if (run && run.kind === 'pvp') return roundEndPvp();
    if (!run || run.kind !== 'vs' || !run.running) return;
    run.running = false;
    const dead = run.boards.filter((b) => b.dead);
    if (dead.length) {
      dead.forEach(wreck);
      KK.voice.overflow();
      setTimeout(() => run && run.kind === 'vs' && KK.app.screen === 'vs' && showRoundResult(), 2600);
    } else showRoundResult();
  }

  function showRoundResult() {
    const y = run.you, a = run.ai;
    let w;
    if (y.dead && !a.dead) w = 'ai';
    else if (a.dead && !y.dead) w = 'you';
    else if (y.score !== a.score) w = y.score > a.score ? 'you' : 'ai';
    else if (y.bar !== a.bar) w = y.bar < a.bar ? 'you' : 'ai';
    else w = 'draw';
    if (w === 'you') run.wins[0]++;
    if (w === 'ai') run.wins[1]++;
    bestRound('vsBest', y.score);
    const why = y.dead || a.dead ? 'overflow' : 'time · higher score';
    run.history.push({ w, you: y.score, ai: a.score });
    run.boards.forEach((b) => !b.dead && b.words.slice().forEach((x) => b.removeWord(x, 'done')));
    vsHud(true);
    const over = run.wins[0] >= 2 || run.wins[1] >= 2;
    KK.music.duck(true);
    if (w === 'you') KK.sfx.clear();
    else if (w === 'ai') KK.sfx.fail();
    if (over && run.wins[0] > run.wins[1]) KK.voice.call('victor', 0.35);

    const stat = (b) => `<div><span class="hud-lbl">score</span><b>${b.score.toLocaleString()}</b><span class="hud-lbl">max combo ${b.maxCombo}x · acc ${b.acc()}% · overflow ${Math.round(b.bar * 100)}%</span></div>`;
    const head = over
      ? run.wins[0] > run.wins[1] ? `you win the match ${run.wins[0]}–${run.wins[1]}` : `ai wins the match ${run.wins[1]}–${run.wins[0]}`
      : w === 'draw' ? `round ${run.round}: draw` : `round ${run.round}: ${w === 'you' ? 'you win' : 'ai wins'}`;
    let sub = `decided by ${why}`;
    if (over) {
      const prog = KK.app.progress;
      prog.vs = prog.vs || {};
      const rec = (prog.vs[run.diff] = prog.vs[run.diff] || { w: 0, l: 0 });
      if (run.wins[0] > run.wins[1]) rec.w++;
      else rec.l++;
      KK.app.saveProgress();
      sub = `vs ai · ${run.diff} · your record ${rec.w}–${rec.l}`;
    }
    const diff = run.diff, lang = run.lang;
    KK.ui.open(
      `<div class="ov-h">${head}</div>
       <div class="ov-sub">${sub}</div>
       <div class="res-vs"><div><span class="hud-lbl">you</span>${stat(y)}</div><div><span class="hud-lbl">ai · ${diff}</span>${stat(a)}</div></div>
       <div class="ov-btns">
         ${over ? '<button class="btn primary" data-ov="rematch" data-primary>rematch</button><button class="btn" data-ov="diff">change difficulty</button>' : `<button class="btn primary" data-ov="nextRound" data-primary>round ${run.round + 1} →</button>`}
         <button class="btn ghost" data-ov="menu">menu</button>
       </div>
       <p class="hint" style="margin-top:16px"><span class="kbd">enter</span> ${over ? 'rematch' : 'next round'}</p>`,
      {
        nextRound: () => { KK.ui.close(); startRound(); },
        rematch: () => { KK.ui.close(); G.startVs(diff, lang); },
        diff: () => { KK.ui.close(); G.quit(); KK.builder.mode = 'vs'; KK.builder.open(4); },
        menu: () => { KK.ui.close(); G.quit(); KK.app.show('play'); },
        esc: () => { KK.ui.close(); G.quit(); KK.app.show('play'); },
      }
    );
  }

  /* ------------------------------- vs players ------------------------------- */
  // The other player's lane is a live view of their field: they simulate it and
  // publish a snapshot ~7 times a second, and we draw it. Both sides draw the same
  // words from the match seed; combo attacks travel as hits that the receiver applies
  // to its own field; each round's winner is worked out from both players' results,
  // so both screens always agree. There's no pausing against a person.
  const LIVE_MS = 140;
  const STALE_MS = 12000; // no snapshot for this long mid-round → they're gone
  const READY_SECS = 30; // to start the next round before the waiting player wins
  const esc = U.esc;

  class RemoteView {
    constructor(lane, field, typed, word) {
      Object.assign(this, { lane, field, typedEl: typed, word, els: new Map(), words: [] });
      this.meterEl = lane.querySelector('.cmeter');
      this.overflowEl = lane.querySelector('.meter-row');
      this.powersEl = lane.querySelector('.powers');
      this.meterEl.dataset.mini = '1';
      this.reset();
    }
    clear() {
      this.field.querySelectorAll('.fw, .pop, .wreck').forEach((n) => n.remove());
      this.field.classList.remove('destroyed', 'danger', 'quaking', 'frozen', 'slowed', 'doubled');
      this.els.clear();
      this.words = [];
    }
    reset() {
      this.clear();
      this.field.classList.add('remote');
      Object.assign(this, { score: 0, bar: 0, combo: 0, maxCombo: 0, dead: false, buf: '' });
      this.apply({});
    }
    mult() {
      return 1 + Math.min(this.combo, 40) * 0.05;
    }
    apply(s) {
      const W = this.field.clientWidth, H = this.field.clientHeight;
      const scored = (s.sc || 0) > this.score, bump = (s.c || 0) > this.combo;
      Object.assign(this, { score: s.sc || 0, combo: s.c || 0, maxCombo: s.mc || 0, bar: s.bar || 0 });
      const ws = s.w || [], buf = s.buf || '';
      // light up the keys they typed since the last snapshot on their keyboard below
      const prev = this.buf || '';
      if (buf.length > prev.length && buf.startsWith(prev)) KK.app.oppPress(buf.slice(prev.length));
      else if (buf && buf.length < prev.length && prev.startsWith(buf)) KK.app.oppPress('\b');
      this.buf = buf;
      let g = '';
      for (let n = buf.length; n > 0 && !g; n--) if (ws.some((w) => w[0].startsWith(buf.slice(0, n)))) g = buf.slice(0, n);
      const live = new Set();
      ws.forEach(([text, x, y, power, sz]) => {
        live.add(text);
        let e = this.els.get(text);
        if (!e) {
          const el = document.createElement('div');
          el.className = 'fw' + (power ? ' pw pw-' + power : '');
          el.style.setProperty('--fs', (SIZES[sz] || SIZES[NORMAL]).fs);
          el.innerHTML = (power && POWERS[power] ? `<span class="pl">${POWERS[power].label}</span>` : '') + '<span class="t"></span><span class="r"></span>';
          this.field.appendChild(el);
          e = { el, text, t: el.querySelector('.t'), r: el.querySelector('.r') };
          this.els.set(text, e);
        }
        e.el.style.transform = `translate(${(x * W).toFixed(1)}px, ${(y * H).toFixed(1)}px)`;
        e.el.classList.toggle('low', y > 0.72);
        const hit = g && text.startsWith(g);
        e.el.classList.toggle('hit', !!hit);
        e.t.textContent = hit ? g : '';
        e.r.textContent = hit ? text.slice(g.length) : text;
      });
      this.els.forEach((e, text) => {
        if (live.has(text)) return;
        this.els.delete(text);
        e.el.style.setProperty('--tr', e.el.style.transform);
        e.el.classList.add(scored ? 'done' : 'dead');
        setTimeout(() => e.el.remove(), 400);
      });
      this.words = [...this.els.values()];
      this.typedEl.innerHTML = '';
      this.typedEl.appendChild(document.createTextNode(g));
      if (buf.length > g.length) {
        const w = document.createElement('span');
        w.className = 'wrong';
        w.textContent = buf.slice(g.length);
        this.typedEl.appendChild(w);
      }
      const fx = s.fx || {};
      ['freeze', 'slow', 'double'].forEach((k) => this.field.classList.toggle({ freeze: 'frozen', slow: 'slowed', double: 'doubled' }[k], fx[k] > 0));
      this.powersEl.innerHTML = Object.keys(POWERS).filter((k) => fx[k] > 0).map((k) => `<span class="pchip pw-${k}">${POWERS[k].label} <b>${(+fx[k]).toFixed(1)}s</b></span>`).join('');
      renderMeter(this.meterEl, this, bump && this.combo % 5 === 0);
      renderOverflow(this.overflowEl, this.bar);
      const d = U.clamp(this.bar, 0, 1);
      this.field.style.setProperty('--danger', d.toFixed(3));
      this.field.style.setProperty('--shake', U.clamp((d - 0.75) / 0.25, 0, 1).toFixed(3));
      this.field.classList.toggle('danger', d > 0 && !this.dead);
      this.field.classList.toggle('quaking', d >= 0.75 && !this.dead);
    }
  }

  // the first value at path that passes test → cb, once
  function waitFor(path, test, cb) {
    let done = false;
    const off = KK.net.ref(path).on((v) => {
      if (done || !test(v)) return;
      done = true;
      setTimeout(() => off && off(), 0);
      cb(v);
    });
    return () => {
      done = true;
      off();
    };
  }

  // m: { id, me, opp, oppName, oppWord, seed, level, lang }
  G.startPvp = function (m) {
    stopRun();
    const p = vsParams(m.level);
    const laneL = $('#laneL'), laneR = $('#laneR');
    const base = 'matches/' + m.id;
    const you = new Board({
      field: $('#vsFieldL'), typed: $('#vsTypedL'), powers: laneL.querySelector('.powers'),
      meter: laneL.querySelector('.cmeter'), overflow: laneL.querySelector('.meter-row'), miniMeter: true,
      word: KK.keysound.comboKey(KK.app.build), p,
      missFills: false,
      hooks: { combo: (b, t) => { announce(b, t); sendHit(t); }, missed: () => sendRelief(), change: () => vsHud(), dead: () => roundEnd() },
    });
    const opp = new RemoteView(laneR, $('#vsFieldR'), $('#vsTypedR'), m.oppWord || 'creamy');
    const r = (run = {
      kind: 'pvp', m, base, lang: m.lang, level: m.level, p, you, opp, boards: [you], round: 0, wins: [0, 0], history: [],
      running: false, paused: false, over: false, hud: {}, offs: [], pubAt: 0, oppAt: 0, rnd: Math.random,
      tick(dt) {
        spawnTick(dt);
        you.step(dt);
        if (!run.running) return;
        vsHud();
        if (performance.now() - run.pubAt >= LIVE_MS) {
          publish();
          run.pubAt = performance.now();
        }
        if (KK.net.now() - run.oppAt > STALE_MS) return oppGone('gone');
        if (run.time <= 0) roundEnd();
      },
    });
    r.offs.push(KK.net.ref(`${base}/live/${m.opp}`).on((s) => r === run && s && onOppLive(s)));
    r.offs.push(KK.net.ref(`${base}/hits/${m.me}`).onChild((k, h) => {
      KK.net.ref(`${base}/hits/${m.me}/${k}`).remove();
      if (r !== run || !h || h.r !== run.round || !run.running || run.you.dead) return;
      // never trust the numbers: cap them at what a real miss / WOW combo can do
      const md = run.p.missDamage;
      if (h.relief) return run.you.relieve(U.clamp(+h.relief || 0, 0, md * MISS_RELIEF)); // they missed a word
      const n = U.clamp(Math.round(+h.n) || 1, 1, 5), dmg = U.clamp(+h.dmg || 0, 0, md * (0.9 + 0.3 * 5));
      flyAttack('to-l', n, dmg);
      takeHit(dmg, String(h.label || 'combo').slice(0, 24));
    }));
    r.offs.push(KK.net.ref(`${base}/left/${m.opp}`).on((v) => r === run && v && oppGone('quit')));
    // they took the win because we were away (or our updates stopped reaching them)
    r.offs.push(KK.net.ref(`${base}/claim/${m.opp}`).on((v) => r === run && v && claimedAgainst()));
    r.offs.push(KK.net.ref(`${base}/cheat/${m.opp}`).on((v) => r === run && v && oppCheated(v)));
    KK.net.ref(`${base}/left/${m.me}`).onDisconnect(true);
    $('#vsNameL').textContent = KK.app.userName();
    $('#vsNameR').textContent = m.oppName;
    startRoundPvp();
  };

  function publish() {
    const b = run.you;
    KK.net.ref(`${run.base}/live/${run.m.me}`).set({
      r: run.round, sc: b.score, bar: +b.bar.toFixed(3), c: b.combo, mc: b.maxCombo, buf: b.buffer, dead: b.dead ? 1 : 0,
      w: b.words.map((w) => [w.text, +(w.x / (b.W || 1)).toFixed(3), +(w.y / (b.H || 1)).toFixed(3), w.power || 0, w.sz]),
      fx: { freeze: +b.fx.freeze.toFixed(1), slow: +b.fx.slow.toFixed(1), double: +b.fx.double.toFixed(1), subtract: +b.fx.subtract.toFixed(1) },
      at: KK.net.now(),
    });
  }

  function onOppLive(s) {
    if (s.r !== run.round) return;
    run.oppAt = KK.net.now();
    if (run.opp.dead) return;
    run.opp.apply(s);
    if (s.dead) {
      run.opp.dead = true;
      if (run.running) roundEnd();
    }
    vsHud();
  }

  function sendHit(tier) {
    if (!run.running || run.opp.dead) return;
    const a = attackOf(run.you, tier);
    flyAttack('to-r', a.n, a.dmg);
    KK.sfx.attack();
    KK.net.ref(`${run.base}/hits/${run.m.opp}`).push({ r: run.round, n: a.n, dmg: +a.dmg.toFixed(4), label: a.label });
  }

  // you missed a word: their overflow comes down (they apply it on their side)
  function sendRelief() {
    if (!run.running || run.opp.dead) return;
    KK.net.ref(`${run.base}/hits/${run.m.opp}`).push({ r: run.round, relief: +(run.p.missDamage * MISS_RELIEF).toFixed(4) });
  }

  function startRoundPvp() {
    const r = run, round = ++run.round;
    run.you.reset();
    run.opp.reset();
    Object.assign(run, {
      time: ROUND_SECONDS, elapsed: 0, spawnT: 0.2, burst: 4, recent: [], sincePower: 0, lastSec: ROUND_SECONDS,
      running: false, paused: false, hud: {}, pubAt: 0, rnd: U.rng(U.hash(run.m.seed + ':' + round)),
    });
    vsHud(true);
    KK.music.duck(true);
    KK.net.ref(`${run.base}/ready/${round}/${run.m.me}`).set(true);
    // they have READY_SECS to start the round too, or the match is yours
    const until = Date.now() + READY_SECS * 1000;
    KK.ui.open(
      `<div class="ov-h">round ${round}</div><div class="ov-sub">waiting for <b>${esc(run.m.oppName)}</b> to be ready…<br>
       if they're not back in <b class="wait-secs">${READY_SECS}</b>s, you win the match</div>
       <div class="ch-time"><i class="wait-bar"></i></div>
       <div class="ov-btns"><button class="btn ghost" data-ov="leave">leave match</button></div>`,
      { leave: leaveMatch, esc: leaveMatch }
    );
    const show = () => {
      const left = Math.max(0, until - Date.now());
      const n = document.querySelector('#ovCard .wait-secs'), bar = document.querySelector('#ovCard .wait-bar');
      if (n) n.textContent = Math.ceil(left / 1000);
      if (bar) bar.style.width = (left / (READY_SECS * 10)) + '%';
    };
    const clock = setInterval(show, 250);
    let giveUp = null;
    const stop = waitFor(`${run.base}/ready/${round}`, (v) => v && v[r.m.me] && v[r.m.opp], () => {
      clearTimeout(giveUp);
      clearInterval(clock);
      if (r !== run || run.over) return;
      const go = () => {
        if (r !== run || run.over) return;
        run.oppAt = KK.net.now() + 4000; // the countdown
        KK.music.duck(false);
        KK.voice.call('round' + Math.min(round, 3), 0.1);
        KK.ui.countdown(begin, `round ${round} · best of 3 · 1:30 · vs ${run.m.oppName} · your combos fill their overflow, your misses lower it · smaller words score more`, () => KK.voice.call('fight'));
      };
      if (round === 1) vsIntro(go);
      else go();
    });
    giveUp = setTimeout(() => {
      clearInterval(clock);
      if (r === run && !run.running) {
        stop();
        oppGone('away');
      }
    }, READY_SECS * 1000);
    run.offs.push(stop, () => clearTimeout(giveUp), () => clearInterval(clock));
  }

  // before round 1: the two fighters' cards sweep in, VS slams down (≈3.8 s)
  function vsIntro(done) {
    const m = run.m, mine = KK.app.build;
    // the selected keyboard is the main image: the store photo for a full keyboard,
    // otherwise the build drawn big
    const hero = (b) => {
      const pre = b.prebuilt && KK.catalog.keyboardById[b.prebuilt];
      const img = pre && (pre.looks[b.look || 0] || pre.looks[0]).img;
      return img
        ? `<div class="vsi-hero photo"><img alt="" src="${esc(img + (img.includes('?') ? '&' : '?') + 'width=900')}"></div>`
        : '<div class="vsi-hero"><div class="vsi-kb"></div></div>';
    };
    const side = (cls, uid, name, title, b) => `<div class="vsi-side ${cls}">
        <div class="vsi-who">${KK.social.avatarImg(uid, 'lg')}<div class="vsi-name">${esc(name)}</div></div>
        ${hero(b)}
        <div class="vsi-build">${esc(title)}</div>
        <div class="vsi-tags">${esc(KK.keysound.writeup(b).headline)}</div></div>`;
    KK.ui.open(
      `<div class="vsi">
         <div class="vsi-bg"><i class="l"></i><i class="r"></i><b></b><b></b><b></b></div>
         ${side('vsi-l', m.me, KK.app.userName(), KK.app.pvpName || 'your keyboard', mine)}
         <div class="vsi-vs"><span>VS</span><i class="vsi-ring"></i></div>
         ${side('vsi-r', m.opp, m.oppName, m.oppBuildName || 'their keyboard', m.oppBuild)}
         <div class="vsi-foot">best of 3 · 1:30 rounds · combos attack the other overflow bar</div>
       </div>`,
      {}
    );
    document.querySelectorAll('#ovCard .vsi-side').forEach((el, i) => {
      const kb = el.querySelector('.vsi-kb');
      if (kb) KK.kbview.create(kb, { maxU: 36 }).update(i ? m.oppBuild : mine);
    });
    KK.sfx.whoosh(0);
    KK.sfx.whoosh(0.25);
    KK.sfx.slam(0.75);
    KK.voice.call('versus', 1.15); // after the slam's crash has died down, so it's heard clearly
    const r = run;
    setTimeout(() => {
      const el = document.querySelector('#ovCard .vsi');
      if (el) el.classList.add('out');
    }, 3400);
    setTimeout(() => r === run && done(), 3800);
  }

  function roundEndPvp() {
    if (!run.running) return;
    run.running = false;
    publish();
    const r = run, round = run.round, me = run.you, opp = run.opp;
    const mine = { sc: me.score, bar: +me.bar.toFixed(3), dead: me.dead ? 1 : 0, mc: me.maxCombo, acc: me.acc() };
    KK.net.ref(`${run.base}/res/${round}/${run.m.me}`).set(mine);
    const dead = [me, opp].filter((b) => b.dead);
    dead.forEach(wreck);
    if (dead.length) KK.voice.overflow();
    const t0 = Date.now(), delay = dead.length ? 2600 : 0;
    let theirs = null, timer = null, shown = false;
    const show = () => {
      if (shown || r !== run || run.over) return;
      shown = true;
      clearTimeout(timer);
      // no result from them: judge from the last thing we saw
      pvpRoundResult(mine, theirs || { sc: opp.score, bar: opp.bar, dead: opp.dead ? 1 : 0, mc: opp.maxCombo, acc: null });
    };
    const stop = waitFor(`${run.base}/res/${round}/${run.m.opp}`, (v) => !!v, (v) => {
      theirs = v;
      setTimeout(show, Math.max(0, delay - (Date.now() - t0)));
    });
    timer = setTimeout(() => {
      stop();
      show();
    }, Math.max(delay, 10000));
    run.offs.push(stop, () => clearTimeout(timer));
  }

  function pvpRoundResult(mine, theirs) {
    let w;
    if (mine.dead && !theirs.dead) w = 'opp';
    else if (theirs.dead && !mine.dead) w = 'you';
    else if (mine.sc !== theirs.sc) w = mine.sc > theirs.sc ? 'you' : 'opp';
    else if (mine.bar !== theirs.bar) w = mine.bar < theirs.bar ? 'you' : 'opp';
    else w = 'draw';
    if (w === 'you') run.wins[0]++;
    if (w === 'opp') run.wins[1]++;
    bestRound('pvpBest', mine.sc);
    run.history.push({ w, you: mine.sc, opp: theirs.sc });
    run.you.words.slice().forEach((x) => run.you.removeWord(x, 'done'));
    vsHud(true);
    const name = esc(run.m.oppName);
    const over = run.wins[0] >= 2 || run.wins[1] >= 2;
    KK.music.duck(true);
    if (w === 'you') KK.sfx.clear();
    else if (w === 'opp') KK.sfx.fail();
    if (over && run.wins[0] > run.wins[1]) KK.voice.call('victor', 0.35);
    const why = mine.dead || theirs.dead ? 'overflow' : 'time · higher score';
    const head = over
      ? run.wins[0] > run.wins[1] ? `you beat ${name} ${run.wins[0]}–${run.wins[1]}` : `${name} wins the match ${run.wins[1]}–${run.wins[0]}`
      : w === 'draw' ? `round ${run.round}: draw` : `round ${run.round}: ${w === 'you' ? 'you win' : name + ' wins'}`;
    let sub = `decided by ${why}`;
    if (over) {
      run.over = true;
      sub = KK.online.record(run.wins[0] > run.wins[1], matchInfo(''));
    }
    const stat = (s) => `<div><span class="hud-lbl">score</span><b>${(s.sc || 0).toLocaleString()}</b><span class="hud-lbl">max combo ${s.mc || 0}x${s.acc != null ? ` · acc ${s.acc}%` : ''} · overflow ${Math.round((s.bar || 0) * 100)}%</span></div>`;
    KK.ui.open(
      `<div class="ov-h">${head}</div>
       <div class="ov-sub">${sub}</div>
       <div class="res-vs"><div><span class="hud-lbl">you</span>${stat(mine)}</div><div><span class="hud-lbl">${name}</span>${stat(theirs)}</div></div>
       <div class="ov-btns">
         ${over ? '<button class="btn primary" data-ov="lobby" data-primary>back to players</button>' : `<button class="btn primary" data-ov="nextRound" data-primary>round ${run.round + 1} →</button>`}
         <button class="btn ghost" data-ov="menu">${over ? 'menu' : 'leave match'}</button>
       </div>
       <p class="hint" style="margin-top:16px"><span class="kbd">enter</span> ${over ? 'back to players' : 'next round'}</p>`,
      {
        nextRound: () => { KK.ui.close(); startRoundPvp(); },
        lobby: () => { KK.ui.close(); G.quit(); KK.online.openLobby(); },
        menu: leaveMatch,
        esc: over ? () => { KK.ui.close(); G.quit(); KK.online.openLobby(); } : () => {},
      }
    );
  }

  // for the match history: who, the round score, and how it ended if not by rounds
  const matchInfo = (how) => ({ opp: run.m.opp, oppName: run.m.oppName, wins: run.wins.slice(), how });

  // the match ends early: overlay with the way back to the players list
  // how: a few words for the match history ("they left")
  function endEarly(head, sub, won, how) {
    run.over = true;
    run.running = false;
    run.boards.forEach((b) => b.words.slice().forEach((x) => b.removeWord(x, 'done')));
    KK.music.duck(true);
    if (won) {
      KK.sfx.clear();
      KK.voice.call('victor', 0.35);
    } else KK.sfx.fail();
    const rec = KK.online.record(won, matchInfo(how));
    KK.ui.open(
      `<div class="ov-h">${head}</div>
       <div class="ov-sub">${sub} · ${rec}</div>
       <div class="ov-btns"><button class="btn primary" data-ov="lobby" data-primary>back to players</button><button class="btn ghost" data-ov="menu">menu</button></div>`,
      {
        lobby: () => { KK.ui.close(); G.quit(); KK.online.openLobby(); },
        menu: () => { KK.ui.close(); G.quit(); KK.app.show('play'); },
        esc: () => { KK.ui.close(); G.quit(); KK.online.openLobby(); },
      }
    );
  }

  // why: 'quit' (they left), 'away' (didn't start the next round in time), 'gone' (their
  // updates stopped mid-round). Unless they quit, the win is claimed in the match so
  // their screen shows the loss when they come back.
  function oppGone(why) {
    if (!run || run.kind !== 'pvp' || run.over) return;
    if (why !== 'quit') KK.net.ref(`${run.base}/claim/${run.m.me}`).set(true);
    const name = esc(run.m.oppName);
    const head = { quit: `${name} left the match`, away: `${name} didn't come back in time`, gone: `${name} lost connection` }[why];
    const how = { quit: 'they left', away: "they didn't come back", gone: 'they lost connection' }[why];
    endEarly(head, 'you win by forfeit', true, how);
  }

  function oppCheated(why) {
    if (!run || run.kind !== 'pvp' || run.over) return;
    endEarly(`${esc(run.m.oppName)} was caught cheating`, `${esc(String(why).slice(0, 80))} · you win by forfeit`, true, 'they cheated');
  }

  function claimedAgainst() {
    if (!run || run.kind !== 'pvp' || run.over) return;
    endEarly(`${esc(run.m.oppName)} wins`, `you were away too long to start the round (${READY_SECS}s) or lost connection`, false, 'you were away');
  }

  function leaveMatch() {
    KK.ui.close();
    G.quit();
    KK.app.show('play');
  }

  // esc against a person: the match keeps running behind this
  function pvpMenu() {
    KK.ui.open(
      `<div class="ov-h">leave the match?</div><div class="ov-sub">the round keeps going while this is open · leaving counts as a loss</div>
       <div class="ov-btns"><button class="btn primary" data-ov="back" data-primary>keep playing</button><button class="btn ghost" data-ov="leave">forfeit &amp; leave</button></div>`,
      { back: () => KK.ui.close(), esc: () => KK.ui.close(), leave: leaveMatch }
    );
  }

  function endPvp() {
    if (!run.over) {
      run.over = true;
      KK.net.ref(`${run.base}/left/${run.m.me}`).set(true);
      KK.online.record(false, matchInfo('you left'));
    }
    run.offs.forEach((f) => f());
    run.offs = [];
    run.opp.clear();
    run.opp.field.classList.remove('remote');
    KK.online.matchEnded();
  }

  /* ------------------------------ cheat detection ------------------------------ */
  // KK.anticheat caught typing no person did: the run stops and doesn't count (no
  // scores, records or unlocks). Against a person it's a forfeit, and they're told why.
  function caught(reason) {
    if (!run || !run.running) return;
    if (run.kind === 'pvp') {
      KK.net.ref(`${run.base}/cheat/${run.m.me}`).set(reason);
      return endEarly('cheating detected', `${esc(reason)} · you forfeit the match`, false, 'cheating detected');
    }
    run.running = false;
    run.boards.forEach((b) => b.words.slice().forEach((x) => b.removeWord(x, 'done')));
    KK.music.duck(true);
    KK.sfx.fail();
    const out = () => { KK.ui.close(); G.quit(); KK.app.show('play'); };
    KK.ui.open(
      `<div class="ov-h">cheating detected</div>
       <div class="ov-sub">${esc(reason)}<br>this ${run.kind === 'solo' ? 'run' : 'match'} doesn't count · type it yourself on your keyboard</div>
       <div class="ov-btns"><button class="btn primary" data-ov="menu" data-primary>back to play</button></div>`,
      { menu: out, esc: out }
    );
  }

  /* ------------------------------ pause / quit ------------------------------ */
  // fromKey: esc was pressed (a window blur only pauses solo and vs AI)
  G.pause = function (fromKey) {
    if (!run || !run.running) return;
    if (run.kind === 'pvp') return fromKey && pvpMenu();
    run.paused = true;
    KK.music.duck(true);
    const b = G.human();
    const info = run.kind === 'vs'
      ? `round ${run.round} · ${U.fmtTime(run.time)} left · ${run.wins[0]}–${run.wins[1]}`
      : `level ${run.level} · ${U.fmtTime(run.time)} left · overflow ${Math.round(b.bar * 100)}% · total ${(run.startTotal + b.score).toLocaleString()}`;
    KK.ui.open(
      `<div class="ov-h">paused</div><div class="ov-sub">${info}</div>
       <div class="ov-btns"><button class="btn primary" data-ov="resume" data-primary>resume</button><button class="btn" data-ov="restart">${run.kind === 'vs' ? 'restart match' : 'restart level'}</button><button class="btn" data-ov="build">tweak keyboard</button><button class="btn ghost" data-ov="quit">quit</button></div>
       <p class="hint" style="margin-top:18px"><span class="kbd">esc</span> resume · volume sliders are below</p>`,
      {
        resume: G.resume,
        esc: G.resume,
        restart: () => {
          KK.ui.close();
          if (run.kind === 'vs') G.startVs(run.diff, run.lang);
          else KK.app.startGame(run.level, 'retry');
        },
        build: () => { KK.ui.close(); G.quit(); KK.builder.open(0); },
        quit: () => { KK.ui.close(); G.quit(); KK.app.show('play'); },
      }
    );
  };

  G.resume = function () {
    if (!run || !run.paused) return;
    KK.ui.close();
    KK.music.duck(false);
    run.paused = false;
    run.last = performance.now();
  };

  G.quit = function () {
    if (run && run.kind === 'pvp') endPvp();
    stopRun();
    run = null;
    KK.builder.level = 1;
    KK.music.duck(false);
    KK.music.setMode('menu');
  };

  /* ---------------------------------- input ---------------------------------- */
  G.key = function (e) {
    if (!run) return false;
    const b = G.human();
    if (e.code === 'Escape') {
      if (run.paused) G.resume();
      else if (run.running) G.pause(true);
      return true;
    }
    if (!run.running || run.paused) return e.key === ' ' || e.key === 'Backspace';
    if (!e.repeat) KK.anticheat.down(e);
    if (!run || !run.running) return true; // that key got them caught
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key === 'Backspace' && e.ctrlKey) {
        b.clearInput();
        return true;
      }
      return false;
    }
    return press(e.key, e.code);
  };

  // a key that types: a letter, Backspace, or space / Enter (clear the word)
  function press(key, code) {
    const b = G.human();
    if (key === 'Backspace') {
      b.backspace();
      return true;
    }
    if (key === ' ' || key === 'Enter') {
      b.clearInput();
      return true;
    }
    if (key.length !== 1) return false;
    if (b.typeChar(key.toLowerCase()) === 'err' && code) KK.app.flashKey(code, 'err');
    if (run && run.kind === 'solo') soloHud();
    return true;
  }

  // phone typing: what the on-screen keyboard typed (KK.app passes it in one key at a
  // time; KK.anticheat has already seen the input event)
  G.typed = function (key, code) {
    if (!run || !run.running || run.paused) return;
    press(key, code);
  };
  G.buffer = () => (run && G.human() ? G.human().buffer : '');
})();
