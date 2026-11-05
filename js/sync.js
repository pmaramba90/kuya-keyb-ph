(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const N = KK.net;

  /*
   * Your progress on every device: the levels you've unlocked, your best per level, your
   * best total, your best rounds and your records against the AI. One copy online
   * (progress/{uid}); every device merges into it and keeps the higher number of each,
   * so a device that's behind (a phone you haven't opened in a while) never lowers
   * anything, and a score set on one shows on the other as soon as it's saved.
   *
   *   progress/{uid}  { unlocked, bestTotal, vsBest, pvpBest, best: { level: score },
   *                     vs: { easy|medium|hard: { w, l } }, pvpDefault: { w, l }, at }
   */
  const S = (KK.sync = {});
  let me = null, off = null, last = null; // last: the online copy as last seen
  const DIFFS = ['easy', 'medium', 'hard'];
  const num = (v) => Math.max(0, Math.min(1e9, Math.floor(+v || 0)));
  const wl = (a, b) => ({ w: Math.max(num(a && a.w), num(b && b.w)), l: Math.max(num(a && a.l), num(b && b.l)) });

  // the higher of each, as one tidy object (same keys in the same order, so two merges can
  // be compared as text)
  function merge(a, b) {
    a = a || {};
    b = b || {};
    const out = {
      unlocked: Math.max(1, num(a.unlocked), num(b.unlocked)),
      bestTotal: Math.max(num(a.bestTotal), num(b.bestTotal)),
      vsBest: Math.max(num(a.vsBest), num(b.vsBest)),
      pvpBest: Math.max(num(a.pvpBest), num(b.pvpBest)),
      best: {},
      vs: {},
    };
    const levels = new Set([...Object.keys(a.best || {}), ...Object.keys(b.best || {})].filter((k) => /^\d{1,4}$/.test(k)));
    [...levels].sort((x, y) => x - y).forEach((k) => {
      const v = Math.max(num((a.best || {})[k]), num((b.best || {})[k]));
      if (v) out.best[k] = v;
    });
    DIFFS.forEach((d) => {
      const r = wl((a.vs || {})[d], (b.vs || {})[d]);
      if (r.w || r.l) out.vs[d] = r;
    });
    if (a.pvpDefault || b.pvpDefault) out.pvpDefault = wl(a.pvpDefault, b.pvpDefault);
    return out;
  }
  const same = (a, b) => JSON.stringify(merge(a, {})) === JSON.stringify(merge(b, {}));

  // this device's progress into the online copy (the higher of each)
  S.push = function () {
    if (!me || !KK.app.progress) return;
    // anything higher online comes into this device first (a save that adds nothing new
    // doesn't change the online copy, so no update would arrive to bring it up)
    if (last) lift(last);
    const mine = KK.app.progress;
    N.ref('progress/' + me.uid).transaction((cur) => {
      const m = merge(cur, mine);
      return cur && same(m, cur) ? undefined : Object.assign(m, { at: N.now() });
    }).catch((e) => console.warn('kkph progress sync', e));
  };

  // the online copy changed (another device, or this one): take what's higher
  function absorb(cloud) {
    if (!me || !KK.app.progress) return;
    last = cloud;
    const m = lift(cloud);
    if (!cloud || !same(m, cloud)) S.push(); // this device had something higher
  }
  // this device up to the online copy wherever it's behind; returns the merge
  function lift(cloud) {
    const app = KK.app;
    const m = merge(app.progress, cloud);
    if (!same(m, app.progress)) {
      Object.assign(app.progress, m);
      KK.store.uset('progress', app.progress);
      if (app.publishScores) app.publishScores();
      KK.feed.saveBest(app.progress.bestTotal); // the all-time high scores
      // what's on screen catches up (never mid-game)
      if (app.screen === 'title' || app.screen === 'play') app.show(app.screen);
      KK.feed.refreshWelcome();
    }
    return m;
  }

  S.start = function () {
    S.stop();
    me = N.me;
    if (!me) return;
    off = N.ref('progress/' + me.uid).on(absorb);
  };
  S.stop = function () {
    if (off) off();
    off = null;
    me = null;
    last = null;
  };
  S._merge = merge; // tests
})();
