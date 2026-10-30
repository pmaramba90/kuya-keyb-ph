(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});

  /*
   * Cheat detection: watches the keys that reach the game while a round runs and flags
   * typing a person didn't do on a keyboard:
   *   - scripted keys    key events made by code (a console script, an extension)
   *   - no keyboard      letters reaching the game that no key press sent
   *   - instant keys     pressed and released within a few ms, key after key: macro
   *                      tools and auto-typers do that; a finger holds a key 50–150 ms
   *   - machine rhythm   the gaps between keys almost exactly the same, key after key
   *   - inhuman speed    well past world-record typing, sustained
   * The limits are generous so a fast human never trips them. It all runs in the
   * player's browser, so someone editing the game's code can still get round it;
   * it stops bots, macros and auto-typers.
   */
  const AC = (KK.anticheat = {});
  const HOLDS = 30, GAPS = 30, SPEED = 60;
  const INSTANT_MS = 12, INSTANT_SHARE = 0.8; // 80% of the last 30 holds under 12 ms
  const MIN_CV = 0.08; // gaps vary by <8%: a person's vary by 40–70%
  const PAUSE_MS = 1000; // gaps longer than this are pauses, not rhythm
  const FAST_MS = 35; // 60 keys averaging under 35 ms apart (~340 wpm)

  let downs = [], holds = [], open = {}, fake = 0, flag = null, onFlag = null;
  AC.chars = 0; // letters typed on a real keyboard this round

  // a new round: clear the history; cb(reason) is called once if it's flagged
  AC.reset = function (cb) {
    downs = [];
    holds = [];
    open = {};
    fake = 0;
    flag = null;
    onFlag = cb || null;
    AC.chars = 0;
  };
  AC.flagged = () => flag;

  function raise(reason) {
    if (flag) return;
    flag = reason;
    if (onFlag) onFlag(reason);
  }

  // a key the game is about to use (not auto-repeat)
  AC.down = function (e) {
    if (flag) return;
    if (!e || e.isTrusted !== true) {
      if (++fake >= 3) raise('keys sent by a script, not a keyboard');
      return;
    }
    const t = e.timeStamp || performance.now();
    open[e.code] = t;
    if (e.key && e.key.length === 1 && e.key !== ' ') AC.chars++;
    downs.push(t);
    if (downs.length > SPEED) downs.shift();
    check();
  };

  AC.up = function (e) {
    const t0 = open[e.code];
    if (t0 == null) return;
    delete open[e.code];
    if (flag || e.isTrusted !== true) return;
    holds.push((e.timeStamp || performance.now()) - t0);
    if (holds.length > HOLDS) holds.shift();
    check();
  };

  // the board's own count of letters typed: more than the keyboard sent means
  // something typed into the game directly
  AC.watch = function (typed) {
    if (!flag && typed > AC.chars + 2) raise('letters typed without a keyboard');
  };

  function check() {
    if (holds.length >= HOLDS && holds.filter((h) => h < INSTANT_MS).length >= HOLDS * INSTANT_SHARE) {
      return raise('keys pressed and released instantly (a macro or auto-typer)');
    }
    const gaps = [];
    for (let i = downs.length - 1; i > 0 && gaps.length < GAPS; i--) {
      const g = downs[i] - downs[i - 1];
      if (g < PAUSE_MS) gaps.push(g);
    }
    if (gaps.length >= GAPS) {
      const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
      const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) * (g - mean), 0) / gaps.length);
      if (mean > 0 && sd / mean < MIN_CV) return raise('machine-perfect typing rhythm (a bot)');
    }
    if (downs.length >= SPEED && (downs[downs.length - 1] - downs[0]) / (downs.length - 1) < FAST_MS) {
      raise('typing faster than any human (a bot)');
    }
  }
})();
