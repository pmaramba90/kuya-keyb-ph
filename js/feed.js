(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Home: the feed, hearts and reviews.
   *
   *   hearts/{owner}/{pid}/{uid}  true — uid hearted owner's keyboard pid
   *   posts/{uid}/{id}            { type: 'post' | 'review', text, at } and, for a
   *                               review, { kind, item, rating } — rating 0.5–5 in halves
   *                               a post can carry a gif, a photo (small JPEG data URL)
   *                               or kb { name, pid, build } (a keyboard, drawn + playable);
   *                               type 'activity' { act: build|win|level|best|heart, … } is
   *                               written by the game itself when something happens
   *   reacts/{uid}/{id}/{heart|laugh|fire|cream}/{who}  true — reactions on a post
   *   replies/{uid}/{id}/{rid}    { uid, text, at } — replies under a post, oldest first
   *   stats/{uid}                 { week, solo, wins } — this week's best single-player
   *                               total and vs-player wins (the "This Week" board)
   *
   * The feed: your friends' posts (or everyone's), newest first, a page at a time; above
   * it a welcome checklist for new players, friends online now and the composer; beside
   * it this week's leaderboard, the most-hearted keyboards and the top-rated parts.
   */
  const F = (KK.feed = {});
  let me = null, offs = [], hearts = {}, subs = {};
  let mode = 'friends'; // feed tab: 'friends' | 'everyone'
  const PAGE = 15;
  let limit = PAGE; // posts shown ("load more" adds a page)
  // what the feed follows, per post owner: their posts, the reactions and the replies
  const T = { posts: {}, reacts: {}, replies: {} };
  const names = {}; // uid → display name, for players who aren't your friends
  let buildsCache = {}; // owner uid → promise of their builds (fresh each time home opens)

  const ME = () => me && me.uid;
  // the admins: can delete anyone's post or reply (the database rules say the same)
  const MODS = ['akosipolnew1', 'kuyakeybph'];
  const isMod = () => !!me && MODS.includes(me.name);
  // the official account: its posts are in everyone's feed and its name glows
  const OFFICIAL = 'kuyakeybph';
  let officialUid = null;
  F.isOfficial = (uid) => !!uid && (uid === officialUid || String(nameOf(uid)).toLowerCase() === OFFICIAL);
  // a player's name as it shows on posts, replies and notifications
  F.nameHtml = (uid) => `<b data-user="${esc(uid)}"${F.isOfficial(uid) ? ' class="official" title="official Kuya Keyb PH account"' : ''}>${esc(nameOf(uid))}${F.isOfficial(uid) ? '<i class="official-tick">✓</i>' : ''}</b>`;
  const canDelete = (uid) => uid === ME() || isMod();
  const newId = () => N.now().toString(36) + Math.random().toString(36).slice(2, 6);

  F.ago = function (at) {
    const s = Math.max(0, (N.now() - (+at || 0)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(+at).toLocaleDateString();
  };

  /* ---------------------------------- start ---------------------------------- */
  F.start = function () {
    F.stop();
    me = N.me;
    if (!me) return;
    // admins start on everyone's posts
    mode = isMod() ? 'everyone' : 'friends';
    limit = PAGE;
    offs.push(N.ref('hearts').on((v) => {
      hearts = v || {};
      refreshHearts();
    }));
    F.sync();
    N.ref('names/' + OFFICIAL).once().then((uid) => {
      if (typeof uid !== 'string' || !me) return;
      officialUid = uid;
      F.sync(); // its posts join your feed
    }).catch(() => {});
  };
  // friends coming online / going off: the strip on home
  KK.online.onPresence(() => KK.app.screen === 'home' && renderOnline());

  F.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    Object.values(subs).forEach((f) => f());
    subs = {};
    Object.keys(T).forEach((t) => (T[t] = {}));
    hearts = {};
    me = null;
    closeComposer();
  };

  // one owner's posts, reactions and replies, kept live; '*' = everyone's
  function follow(uid) {
    const stop = Object.keys(T).map((t) => N.ref(uid === '*' ? t : `${t}/${uid}`).on((v) => {
      if (uid === '*') T[t] = v || {};
      else T[t][uid] = v || {};
      if (KK.app.screen === 'home') renderPosts();
    }));
    return () => stop.forEach((f) => f());
  }

  const unfollowAll = () => {
    Object.values(subs).forEach((f) => f());
    subs = {};
    Object.keys(T).forEach((t) => (T[t] = {}));
  };
  // follow your posts and your friends' (called again whenever your friends change), or
  // everyone's on the "everyone" tab
  F.sync = function () {
    if (!me) return;
    if (mode === 'everyone') {
      if (!subs['*']) {
        unfollowAll();
        subs['*'] = follow('*');
      }
      return;
    }
    if (subs['*']) unfollowAll();
    const want = new Set([me.uid, ...KK.social.friendIds()]);
    if (officialUid) want.add(officialUid); // the official account: everyone sees its posts
    Object.keys(subs).forEach((uid) => {
      if (want.has(uid)) return;
      subs[uid]();
      delete subs[uid];
      Object.keys(T).forEach((t) => delete T[t][uid]);
    });
    want.forEach((uid) => {
      if (!subs[uid]) subs[uid] = follow(uid);
    });
    if (KK.app.screen === 'home') renderPosts();
  };

  F.render = function () {
    buildsCache = {};
    ratedAt = 0; // reviews may have come in since
    popSig = ''; // redraw: the builds may have changed
    renderTabs();
    renderWhats();
    renderWelcome();
    renderOnline();
    renderPosts();
    renderPopular();
    renderBoard();
    renderRated();
  };

  function nameOf(uid) {
    if (uid === ME()) return me.display;
    const n = KK.social.nameOf(uid) || names[uid];
    if (n) return n;
    if (names[uid] === undefined) {
      names[uid] = '';
      N.ref('users/' + uid).once().then((u) => {
        names[uid] = (u && (u.display || u.name)) || 'player';
        if (KK.app.screen === 'home') F.render();
      }).catch(() => {});
    }
    return '…';
  }
  F.nameOf = nameOf;

  /* ---------------------------------- hearts ---------------------------------- */
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.6-4.7-9.4-9.4C1.3 7.7 3.4 4.5 6.7 4.5c2.1 0 3.6 1.1 4.4 2.6.2.4.6.4.8 0 .8-1.5 2.3-2.6 4.4-2.6 3.3 0 5.4 3.2 4.1 6.6-1.8 4.7-8.4 9.4-8.4 9.4z"/></svg>';
  const likers = (owner, pid) => ((hearts[owner] || {})[pid]) || {};
  const heartCount = (owner, pid) => Object.keys(likers(owner, pid)).length;
  const hearted = (owner, pid) => !!(me && likers(owner, pid)[me.uid]);

  // ♥ and its count: a button on other players' keyboards, just the count on yours
  F.heart = function (owner, pid) {
    if (!owner || !pid) return '';
    return `<span class="heart-slot" data-hk="${esc(owner + '/' + pid)}">${heartInner(owner, pid)}</span>`;
  };
  function heartInner(owner, pid) {
    const n = heartCount(owner, pid);
    if (owner === ME()) return `<span class="heart mine" title="${n === 1 ? '1 heart' : n + ' hearts'}">${HEART}<b>${n}</b></span>`;
    const on = hearted(owner, pid);
    return `<button class="heart${on ? ' on' : ''}" data-heart="${esc(owner)}" data-pid="${esc(pid)}" title="${on ? 'take your heart back' : 'heart this keyboard'}">${HEART}<b>${n}</b></button>`;
  }
  function refreshHearts() {
    document.querySelectorAll('[data-hk]').forEach((el) => {
      const [owner, pid] = el.dataset.hk.split('/');
      el.innerHTML = heartInner(owner, pid);
    });
    checkTop3();
    if (KK.app.screen === 'home') renderPopular();
  }

  // every hearted keyboard, most hearts first
  const ranking = () => {
    const list = [];
    Object.keys(hearts).forEach((owner) => Object.keys(hearts[owner] || {}).forEach((pid) => {
      const n = heartCount(owner, pid);
      if (n) list.push({ owner, pid, n });
    }));
    return list.sort((a, b) => b.n - a.n);
  };
  // one of your keyboards reaches the top 3 of Popular Keyboards: a line in the feed (once
  // per keyboard; it isn't taken back if it drops out again)
  function checkTop3() {
    if (!me) return;
    const done = KK.store.uget('top3Posted', []) || [];
    ranking().slice(0, 3).forEach((x, i) => {
      if (x.owner !== me.uid || done.includes(x.pid)) return;
      const p = KK.app.profiles.find((q) => q.id === x.pid);
      if (!p) return;
      done.push(x.pid);
      KK.store.uset('top3Posted', done);
      F.activity('top', { rank: i + 1, kb: kbOf(p.name, p.id, p.build) }, 't_' + p.id);
    });
  }

  // capture phase, so a heart never also opens the card it sits on
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-heart]');
    if (!b) return;
    e.stopPropagation();
    b.blur();
    if (!me) return;
    const owner = b.dataset.heart, pid = b.dataset.pid, on = hearted(owner, pid);
    const ref = N.ref(`hearts/${owner}/${pid}/${me.uid}`);
    (on ? ref.remove() : ref.set(true)).catch((err) => console.warn('kkph hearts', err));
    // their bell (taken back with the heart)
    const nid = `h_${pid}_${me.uid}`;
    if (on) {
      KK.sfx.ui();
      KK.notify.unsend(owner, nid);
    } else {
      KK.sfx.select();
      buildsOf(owner).then((bs) => {
        const k = bs && bs[pid];
        KK.notify.send(owner, { t: 'heart', pid, name: String((k && k.name) || '').slice(0, 60) }, nid);
      });
    }
  }, true);

  // something happened worth a line in your friends' feeds (id: a fixed one replaces /
  // can be taken back)
  F.activity = function (act, data, id) {
    if (!me) return;
    N.ref(`posts/${me.uid}/${id || newId()}`).set(Object.assign({ type: 'activity', act, at: N.now() }, data)).catch((err) => console.warn('kkph activity', err));
  };
  // a keyboard as posts carry it
  const kbOf = (name, pid, build) => ({ name: String(name || 'keyboard').slice(0, 60), pid: String(pid || '').slice(0, 40), build: C.sanitizeBuild(build) });
  F.kbOf = kbOf;

  // this week's numbers (single-player best total, vs-player wins), for the board
  const weekOf = (t) => {
    const d = new Date(t), day = (d.getUTCDay() + 6) % 7; // monday = 0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10); // the week's monday
  };
  // one read-modify-write, so two quick updates can't undo each other
  F.stat = function (key, value) {
    if (!me) return Promise.resolve();
    const week = weekOf(N.now());
    return N.ref('stats/' + me.uid).transaction((cur) => {
      const s = cur && cur.week === week ? cur : { solo: 0, wins: 0 };
      return {
        week,
        solo: key === 'solo' ? Math.max(+s.solo || 0, Math.floor(+value || 0)) : +s.solo || 0,
        wins: (+s.wins || 0) + (key === 'win' ? 1 : 0),
      };
    }).catch((err) => console.warn('kkph stats', err));
  };

  /* ------------------------------ popular keyboards ------------------------------ */
  const buildsOf = (owner) => (buildsCache[owner] = buildsCache[owner] || N.ref('builds/' + owner).once().catch(() => null));

  let popToken = 0, popSig = '', popAll = false; // popAll: "show more" was clicked
  const POP_SHOW = 3, POP_MAX = 10;
  async function renderPopular() {
    const token = ++popToken;
    const list = ranking();
    const top = [];
    for (const x of list) {
      if (top.length >= (popAll ? POP_MAX : POP_SHOW + 1)) break; // one past 3: is there more?
      const k = ((await buildsOf(x.owner)) || {})[x.pid];
      if (k && k.build) top.push(Object.assign(x, { k }));
    }
    if (token !== popToken || KK.app.screen !== 'home') return;
    const more = !popAll && top.length > POP_SHOW;
    if (!popAll) top.length = Math.min(top.length, POP_SHOW);
    // the same ones in the same order, unchanged: keep the drawn boards (hearts update in place)
    const sig = JSON.stringify([popAll, more, top.map((x) => [x.owner, x.pid, x.k.name, x.k.updated, nameOf(x.owner)])]);
    if (sig === popSig && document.querySelector('#feedPopular .pop-card')) return;
    popSig = sig;
    const box = $('#feedPopular');
    box.innerHTML = top.length
      ? top.map((x, i) => {
          const b = C.sanitizeBuild(x.k.build);
          return `<div class="pop-card" data-user="${esc(x.owner)}" title="open ${esc(nameOf(x.owner))}'s profile">
            <div class="pop-head"><span class="pop-rank">${i + 1}</span>
              <span class="kb-text"><b>${esc(x.k.name || 'keyboard')}</b><b class="pop-by">by ${esc(nameOf(x.owner))}</b><span>${esc(KK.keysound.writeup(b).headline)}</span></span>
              ${F.heart(x.owner, x.pid)}</div>
            <div class="pop-kb"></div></div>`;
        }).join('')
      : '<p class="hint">no hearts yet. Heart the keyboards you like on players\' profiles and the favourites show up here.</p>';
    if (more || popAll) box.insertAdjacentHTML('beforeend', `<button class="link-btn pop-more" data-pop="${popAll ? 'less' : 'more'}">${popAll ? 'show less' : 'show more'}</button>`);
    // each keyboard drawn whole, scaled down to fit the column
    box.querySelectorAll('.pop-kb').forEach((el, i) => {
      const v = KK.kbview.create(el, { maxU: 15, legends: false }); // small, so Top Rated fits below
      v.update(C.sanitizeBuild(top[i].k.build));
      requestAnimationFrame(() => v.fit());
    });
  }

  $('#feedPopular').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pop]');
    if (!b) return;
    e.stopPropagation(); // not a card's profile link
    KK.sfx.ui();
    popAll = b.dataset.pop === 'more';
    renderPopular();
  });

  /* ------------------------------- this week's board ------------------------------- */
  // you and your friends: best single-player total and most wins against players
  let boardToken = 0;
  async function renderBoard() {
    if (!me) return;
    const token = ++boardToken, week = weekOf(N.now());
    const ids = [me.uid, ...KK.social.friendIds()];
    const rows = (await Promise.all(ids.map((uid) => N.ref('stats/' + uid).once().catch(() => null))))
      .map((s, i) => ({ uid: ids[i], s: s && s.week === week ? s : null }))
      .filter((x) => x.s);
    if (token !== boardToken || KK.app.screen !== 'home') return;
    const top = (key) => rows.filter((x) => +x.s[key] > 0).sort((a, b) => b.s[key] - a.s[key]).slice(0, 5);
    const list = (key, unit) => {
      const t = top(key);
      return t.length
        ? t.map((x, i) => `<div class="board-row${x.uid === me.uid ? ' me' : ''}" data-user="${esc(x.uid)}"><span class="pop-rank">${i + 1}</span>${KK.social.avatarImg(x.uid, 'xs')}<b>${esc(nameOf(x.uid))}</b><span class="board-n">${Math.floor(+x.s[key]).toLocaleString()}${unit}</span></div>`).join('')
        : '<p class="hint">nobody yet this week</p>';
    };
    $('#feedBoard').innerHTML = `<div class="board-sec"><span class="hud-lbl">single player · best total</span>${list('solo', '')}</div>
      <div class="board-sec"><span class="hud-lbl">vs players · wins</span>${list('wins', '')}</div>
      <p class="hint board-foot">you and your friends · starts fresh every monday</p>`;
  }

  /* ---------------------------------- top rated ---------------------------------- */
  // every review on the site, added up per item (read at most once a minute)
  let ratings = {}, ratedAt = 0;
  async function loadRatings() {
    if (N.now() - ratedAt < 60000) return;
    ratedAt = N.now();
    const all = (await N.ref('posts').once().catch(() => null)) || {};
    const r = {};
    Object.values(all).forEach((ps) => Object.values(ps || {}).forEach((p) => {
      if (!p || p.type !== 'review' || !itemById(p.kind, p.item)) return;
      const k = p.kind + ':' + p.item, v = rating(p.rating);
      if (!v) return;
      (r[k] = r[k] || { kind: p.kind, item: p.item, sum: 0, n: 0 }).sum += v;
      r[k].n++;
    }));
    ratings = r;
  }
  const avgOf = (kind, item) => {
    const x = ratings[kind + ':' + item];
    return x ? { avg: Math.round((x.sum / x.n) * 10) / 10, n: x.n } : null;
  };
  async function renderRated() {
    await loadRatings();
    if (KK.app.screen !== 'home') return;
    const top = Object.values(ratings).sort((a, b) => b.sum / b.n - a.sum / a.n || b.n - a.n).slice(0, 5);
    $('#feedRated').innerHTML = top.length
      ? top.map((x, i) => {
          const it = itemById(x.kind, x.item), avg = Math.round((x.sum / x.n) * 10) / 10;
          return `<div class="rated-row"><span class="pop-rank">${i + 1}</span><span class="kb-text"><b>${esc(it.name)}</b><span>${KINDS[x.kind].label} · ${x.n} review${x.n > 1 ? 's' : ''}</span></span><span class="rated-n">${stars(Math.round(avg * 2) / 2)}<b>${avg}</b></span></div>`;
        }).join('')
      : '<p class="hint">no reviews yet. Write one with ★ review.</p>';
    renderPosts(); // reviews show their item's average too
  }

  /* --------------------------- tabs, composer, welcome --------------------------- */
  function renderTabs() {
    document.querySelectorAll('#feedTabs [data-ft]').forEach((b) => b.classList.toggle('on', b.dataset.ft === mode));
  }
  $('#feedTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ft]');
    if (!b || !me || b.dataset.ft === mode) return;
    b.blur();
    KK.sfx.ui();
    mode = b.dataset.ft;
    limit = PAGE;
    renderTabs();
    F.sync();
    renderPosts();
  });

  function renderWhats() {
    if (!me) return;
    $('#whatsAv').innerHTML = KK.social.avatarImg(me.uid, 'sm');
    $('#whatsIn').textContent = `what's on your mind, ${me.display}?`;
  }

  // new here: four things to do, ticked off as they happen (hide it any time)
  function renderWelcome() {
    const el = $('#feedWelcome');
    if (!me || KK.store.uget('welcomeHidden', false)) return void (el.hidden = true);
    const app = KK.app, p = app.progress || {};
    const steps = [
      ['friends', 'add a friend', KK.social.friendIds().length > 0],
      ['build', 'build a keyboard', app.profiles.length > 0],
      ['play', 'play a game', (p.bestTotal || 0) > 0 || (p.vsBest || 0) > 0 || (p.pvpBest || 0) > 0],
      ['post', 'post something', Object.keys(T.posts[me.uid] || {}).length > 0],
    ];
    const done = steps.filter((s) => s[2]).length;
    el.hidden = done === steps.length;
    if (el.hidden) return;
    el.innerHTML = `<div class="welcome-h"><b>For Mechanical Keyboard enthusiasts. Click. Clack. Thock Around and Find Out</b><span class="hint">${done} of ${steps.length} done</span><button class="picon" data-wel="hide" title="hide this">✕</button></div>
      <div class="welcome-steps">${steps.map(([k, label, ok]) => `<button class="wstep${ok ? ' ok' : ''}" data-wel="${k}"><i>${ok ? '✓' : ''}</i>${label}</button>`).join('')}</div>`;
  }
  $('#feedWelcome').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wel]');
    if (!b) return;
    KK.sfx.ui();
    const go = {
      hide: () => { KK.store.uset('welcomeHidden', true); renderWelcome(); },
      friends: () => KK.app.show('friends'),
      build: () => KK.builder.open(0),
      play: () => KK.app.show('play'),
      post: () => openComposer('post'),
    }[b.dataset.wel];
    if (go) go();
  });

  // friends online right now: tap a face for their profile, ⚔ to challenge
  function renderOnline() {
    const el = $('#feedOnlineStrip');
    if (!me) return;
    const players = KK.online.players();
    const on = KK.social.friendIds().filter((uid) => KK.online.isOnline(players[uid]));
    el.innerHTML = `${on.length
      ? on.map((uid) => {
          const busy = players[uid].state === 'match';
          return `<div class="os-friend"><span class="av-wrap" data-user="${esc(uid)}" title="${esc(nameOf(uid))}">${KK.social.avatarImg(uid, 'md')}<i class="pl-dot ${busy ? 'busy' : ''}"></i></span>
            <b data-user="${esc(uid)}">${esc(nameOf(uid))}</b>
            ${busy ? '<span class="hint">in a match</span>' : `<button class="btn primary sm" data-os="${esc(uid)}">⚔ challenge</button>`}</div>`;
        }).join('')
      : '<span class="hint os-none">none of your friends are online right now</span>'}`;
  }
  $('#feedOnlineStrip').addEventListener('click', (e) => {
    const b = e.target.closest('[data-os]');
    if (!b) return;
    e.stopPropagation();
    b.blur();
    KK.sfx.ui();
    KK.online.challenge(b.dataset.os, nameOf(b.dataset.os));
  });

  /* --------------------------------- reviews --------------------------------- */
  // what can be reviewed: anything in the catalog
  const KINDS = {
    keyboard: { label: 'full keyboard', what: 'keyboards', list: () => C.keyboards.map((k) => ({ id: k.id, name: k.title, sub: `${k.vendor} · ${k.sizeName}`, img: k.looks[0] && k.looks[0].img })) },
    case: { label: 'base (case)', what: 'cases', list: () => Object.keys(C.CASES).map((id) => ({ id, name: C.CASES[id].name + ' case', sub: C.CASES[id].desc })) },
    plate: { label: 'plate', what: 'plates', list: () => Object.keys(C.PLATES).map((id) => ({ id, name: C.PLATES[id].name + ' plate', sub: C.PLATES[id].desc })) },
    switch: { label: 'switches', what: 'switches', list: () => C.switches.map((s) => ({ id: s.id, name: s.name, sub: `${s.brand} · ${s.type} · ${s.force}g` })) },
    keycaps: { label: 'keycaps', what: 'keycaps', list: () => C.keycaps.map((k) => ({ id: k.id, name: k.name, sub: k.brand })) },
    lube: { label: 'lube', what: 'lubes', list: () => C.LUBES.filter((l) => l.id !== 'stock').map((l) => ({ id: l.id, name: l.name, sub: l.desc })) },
    mod: { label: 'mods', what: 'mods', list: () => C.MODS.map((m) => ({ id: m.id, name: m.name, sub: m.desc })) },
  };
  const items = {}, itemMap = {};
  const itemsOf = (kind) => (items[kind] = items[kind] || KINDS[kind].list());
  function itemById(kind, id) {
    if (!KINDS[kind]) return null;
    if (!itemMap[kind]) {
      itemMap[kind] = {};
      itemsOf(kind).forEach((it) => (itemMap[kind][it.id] = it));
    }
    return Object.prototype.hasOwnProperty.call(itemMap[kind], id) ? itemMap[kind][id] : null;
  }
  const thumb = (img) => img + (img.includes('?') ? '&' : '?') + 'width=200';
  const rating = (v) => U.clamp(Math.round((+v || 0) * 2) / 2, 0, 5);
  const stars = (r) => `<span class="rstars" title="${r} out of 5"><span class="st-bg">★★★★★</span><span class="st-fg" style="width:${r * 20}%">★★★★★</span></span>`;

  // where to buy it: Amazon, Lazada or Shopee only (their short links too). Returns
  // the store's name, or null for anything else, so no other links get into the feed.
  const SHOPS = [
    [/(^|\.)(amazon\.[a-z.]+|amzn\.(to|asia|eu)|a\.co)$/, 'Amazon'],
    [/(^|\.)lazada\.[a-z.]+$/, 'Lazada'],
    [/(^|\.)(shopee\.[a-z.]+|shope\.ee|shp\.ee)$/, 'Shopee'],
  ];
  function shopOf(link) {
    if (typeof link !== 'string' || link.length > 500) return null;
    let u;
    try {
      u = new URL(link);
    } catch (e) {
      return null;
    }
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const hit = SHOPS.find(([re]) => re.test(u.hostname.toLowerCase()));
    return hit ? hit[1] : null;
  }
  F.shopOf = shopOf;

  /* ----------------------------------- GIFs ----------------------------------- */
  // a post's GIF is stored as its GIPHY id and always shown from GIPHY's own servers
  const GIF_ID = /^[A-Za-z0-9]{4,64}$/;
  // only a real string: regex.test(undefined) tests the word "undefined", which would pass
  const isGif = (v) => typeof v === 'string' && GIF_ID.test(v);
  const gifSrc = (id, size) => `https://media.giphy.com/media/${id}/${size || 'giphy'}.webp`;
  // a pasted GIPHY link → the GIF's id: giphy.com/gifs/<words>-<id>, giphy.com/embed/<id>,
  // media*.giphy.com/media/[v1.…/]<id>/…, i.giphy.com/<id>.gif
  function giphyId(link) {
    let u;
    try {
      u = new URL(String(link).trim());
    } catch (e) {
      return null;
    }
    if (!/(^|\.)giphy\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    let id = null;
    if (['gifs', 'stickers', 'embed'].includes(parts[0])) id = (parts[1] || '').split('-').pop();
    else if (parts[0] === 'media') id = parts[(parts[1] || '').startsWith('v1.') ? 2 : 1];
    else if (u.hostname === 'i.giphy.com' && parts.length === 1) id = parts[0].replace(/\.(gif|webp|mp4)$/, '');
    return isGif(id) ? id : null;
  }
  F.giphyId = giphyId;

  /* ---------------------------------- posts ---------------------------------- */
  const openReplies = new Set(); // "owner/id" of posts with the reply box open
  const drafts = {}; // "owner/id" → a reply being typed (kept across redraws)

  function renderPosts() {
    const box = $('#feedPosts');
    // a redraw mustn't lose the reply you're typing
    const act = document.activeElement, typing = act && act.dataset && act.dataset.replyIn;
    const caret = typing ? [act.selectionStart, act.selectionEnd] : null;
    const all = [];
    Object.keys(T.posts).forEach((uid) => Object.entries(T.posts[uid] || {}).forEach(([id, p]) => p && typeof p === 'object' && all.push({ uid, id, p })));
    all.sort((a, b) => (+b.p.at || 0) - (+a.p.at || 0));
    const shown = all.slice(0, limit);
    box.innerHTML = all.length
      ? shown.map(postHtml).join('')
      : `<p class="hint feed-empty">${mode === 'everyone' ? 'nobody has posted yet. Be the first!' : 'nothing here yet. Share something above, and add friends to see their posts.'}</p>`;
    $('#feedMore').hidden = all.length <= limit;
    placeKeyboards(box, shown);
    const back = typing && box.querySelector(`[data-reply-in="${CSS.escape(typing)}"]`);
    if (back) {
      back.focus();
      back.setSelectionRange(caret[0], caret[1]);
    }
    if (me && KK.app.screen === 'home') renderWelcome(); // "post something" may be done now
  }
  $('#feedMore').addEventListener('click', () => {
    $('#feedMore').blur();
    KK.sfx.ui();
    limit += PAGE;
    renderPosts();
  });

  // keyboards in posts are drawn once and kept (a redraw of the feed moves them back in)
  const kbViews = new Map(); // "owner/id" → the element holding its drawn keyboard
  function placeKeyboards(box, shown) {
    const keep = new Set();
    box.querySelectorAll('.pk-view[data-kbk]').forEach((slot) => {
      const key = slot.dataset.kbk, post = shown.find((x) => x.uid + '/' + x.id === key);
      if (!post || !post.p.kb) return;
      keep.add(key);
      let el = kbViews.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'pk-view';
        const v = KK.kbview.create(el, { maxU: 24, legends: false });
        v.update(C.sanitizeBuild(post.p.kb.build));
        kbViews.set(key, el);
        slot.replaceWith(el);
        requestAnimationFrame(() => v.fit());
      } else slot.replaceWith(el);
    });
    [...kbViews.keys()].forEach((k) => !keep.has(k) && kbViews.delete(k));
  }

  // ▶ hear it: a keyboard in a post plays for a few seconds, then yours comes back
  let hearTimer = null;
  function hear(build) {
    clearTimeout(hearTimer);
    KK.keysound.setBuild(C.sanitizeBuild(build));
    KK.keysound.demo();
    hearTimer = setTimeout(() => KK.keysound.setBuild(KK.app.build), 3500);
  }

  // a keyboard card: its name and sound, drawn small, ▶ hear it and its heart
  function kbCardHtml(key, owner, kb) {
    const b = C.sanitizeBuild(kb.build);
    return `<div class="post-kb">
      <div class="pk-head"><span class="kb-text"><b>${esc(String(kb.name || 'keyboard').slice(0, 60))}</b><span>${esc(KK.keysound.writeup(b).headline)}</span></span>
        ${kb.pid ? F.heart(owner, String(kb.pid)) : ''}</div>
      <div class="pk-view" data-kbk="${esc(key)}"></div>
      <button class="btn sm pk-hear" data-hear="${esc(key)}">▶ hear it</button></div>`;
  }

  // the photo in a post: only a real JPEG data URL is shown
  const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  const isPhoto = (v) => typeof v === 'string' && v.length < 400000 && PHOTO.test(v);

  // activity posts: a new keyboard, a personal best, a keyboard in the top 3 (older kinds
  // — wins, levels, hearts — aren't shown any more)
  function activityHtml(uid, p) {
    const n = (v) => Math.floor(+v || 0).toLocaleString();
    switch (p.act) {
      case 'build': return { head: 'built a new keyboard', body: '' };
      case 'top': return { head: 'made the popular keyboards', body: `<div class="act-card"><span class="act-ico">🏆</span><span>this keyboard is <b>#${Math.min(3, Math.max(1, Math.floor(+p.rank || 1)))}</b> in Popular Keyboards</span></div>` };
      case 'best': return { head: 'set a new best', body: `<div class="act-card"><span class="act-ico">★</span><span>new personal best: <b>${n(p.total)}</b> points in single player</span></div>` };
      default: return null;
    }
  }

  const REPLY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const REACTS = {
    heart: { icon: HEART, label: 'heart' },
    laugh: { icon: '<span class="emo">😂</span>', label: 'haha' },
    fire: { icon: '<span class="emo">🔥</span>', label: 'thocky' },
    cream: { icon: '<span class="emo">🍦</span>', label: 'creamy' },
  };

  // ♥ 😂 🔥 🍦 (with who reacted on hover), then reply
  function actsHtml(key, rx, nReplies) {
    const react = (kind) => {
      const who = Object.keys((rx && rx[kind]) || {}), on = !!(me && who.includes(me.uid));
      const tip = who.length ? who.map(nameOf).join(', ') : REACTS[kind].label;
      return `<button class="react r-${kind}${on ? ' on' : ''}" data-react="${kind}" data-key="${esc(key)}" title="${esc(tip)}">${REACTS[kind].icon}<b>${who.length || ''}</b></button>`;
    };
    return `<div class="post-acts">${Object.keys(REACTS).map(react).join('')}
      <button class="react r-reply${openReplies.has(key) ? ' on' : ''}" data-reply="${esc(key)}">${REPLY_ICON}<b>${nReplies || ''}</b><span>${nReplies > 1 ? 'replies' : 'reply'}</span></button></div>`;
  }

  function repliesHtml(key, owner, list) {
    const open = openReplies.has(key);
    if (!list.length && !open) return '';
    const mod = isMod();
    return `<div class="replies">${list.map(([rid, r]) => `<div class="reply">
        <span class="post-av" data-user="${esc(r.uid)}">${KK.social.avatarImg(r.uid, 'xs')}</span>
        <div class="reply-body">${F.nameHtml(r.uid)}<span class="reply-text">${esc(String(r.text || '').slice(0, 500))}</span><span class="reply-at">${F.ago(r.at)}</span></div>
        ${r.uid === ME() || owner === ME() || mod ? `<button class="picon" data-rdel="${esc(rid)}" data-key="${esc(key)}" title="delete reply">✕</button>` : ''}</div>`).join('')}
      ${open ? `<form class="reply-form" data-reply-form="${esc(key)}" autocomplete="off"><input class="search" data-reply-in="${esc(key)}" maxlength="500" placeholder="write a reply…" value="${esc(drafts[key] || '')}"><button class="btn primary sm" type="submit">reply</button></form>` : ''}</div>`;
  }

  function postHtml({ uid, id, p }) {
    const review = p.type === 'review';
    const act = p.type === 'activity' ? activityHtml(uid, p) : null;
    if (p.type === 'activity' && !act) return '';
    const it = review && itemById(p.kind, p.item);
    const r = rating(p.rating), shop = review && shopOf(p.link), avg = it && avgOf(p.kind, p.item);
    const key = uid + '/' + id;
    const kb = p.kb && typeof p.kb === 'object' && p.kb.build && typeof p.kb.build === 'object' ? p.kb : null;
    const rx = (T.reacts[uid] || {})[id];
    const reps = Object.entries((T.replies[uid] || {})[id] || {})
      .filter(([, x]) => x && typeof x === 'object' && typeof x.uid === 'string')
      .sort((a, b) => (+a[1].at || 0) - (+b[1].at || 0));
    return `<article class="post${F.isOfficial(uid) ? ' official-post' : ''}">
      <div class="post-head">
        <span class="post-av" data-user="${esc(uid)}">${KK.social.avatarImg(uid, 'sm')}</span>
        <div class="post-who">${F.nameHtml(uid)}<span>${act ? act.head : review ? 'wrote a review' : 'posted'} · ${F.ago(p.at)}</span></div>
        ${canDelete(uid) ? `<button class="picon" data-del="${esc(id)}" data-uid="${esc(uid)}" title="${uid === ME() ? 'delete' : 'delete (moderator)'}">✕</button>` : ''}
      </div>
      ${it ? `<div class="rev">
        ${it.img ? `<img class="rev-img" src="${esc(thumb(it.img))}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div class="rev-what"><span class="rev-kind">${KINDS[p.kind].label}</span><b>${esc(it.name)}</b><span class="hint">${esc(it.sub || '')}</span>
        <div class="rev-rate">${stars(r)}<b>${r}</b><span class="hint">/ 5</span>${avg && avg.n > 1 ? `<span class="rev-avg">avg ★ ${avg.avg} · ${avg.n} reviews</span>` : ''}</div></div>
        ${shop ? `<a class="btn sm rev-shop" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer nofollow ugc">buy on ${shop} ↗</a>` : ''}</div>` : ''}
      ${p.text ? `<p class="post-text">${esc(String(p.text).slice(0, 1000))}</p>` : ''}
      ${!review && isGif(p.gif) ? `<div class="post-gif"><img src="${gifSrc(p.gif)}" alt="GIF" loading="lazy" onerror="this.parentNode.remove()"><span>via GIPHY</span></div>` : ''}
      ${!review && isPhoto(p.photo) ? `<div class="post-photo"><img src="${p.photo}" alt="photo" loading="lazy"></div>` : ''}
      ${act ? act.body : ''}
      ${kb ? kbCardHtml(key, act && p.act === 'heart' ? String(p.owner) : uid, kb) : ''}
      ${actsHtml(key, rx, reps.length)}
      ${repliesHtml(key, uid, reps)}
    </article>`;
  }

  // ✕ asks "delete?" first; true once it's been clicked twice
  function armed(b) {
    if (b.dataset.armed) return true;
    b.dataset.armed = '1';
    b.textContent = 'delete?';
    b.classList.add('armed');
    setTimeout(() => b.isConnected && (delete b.dataset.armed, (b.textContent = '✕'), b.classList.remove('armed')), 2500);
    return false;
  }
  const warn = (err) => console.warn('kkph posts', err);

  $('#scr-home').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del && me) {
      del.blur();
      if (!armed(del)) return;
      KK.sfx.ui();
      const owner = del.dataset.uid, id = del.dataset.del;
      if (!canDelete(owner)) return;
      // the post, then its reactions and replies
      return N.ref(`posts/${owner}/${id}`).remove().then(() => {
        N.ref(`reacts/${owner}/${id}`).remove().catch(warn);
        N.ref(`replies/${owner}/${id}`).remove().catch(warn);
      }).catch(warn);
    }
    const hb = e.target.closest('[data-hear]');
    if (hb) {
      hb.blur();
      const [owner, id] = hb.dataset.hear.split('/'), p = (T.posts[owner] || {})[id];
      if (p && p.kb && p.kb.build) hear(p.kb.build);
      return;
    }
    const rx = e.target.closest('[data-react]');
    if (rx && me) {
      rx.blur();
      const [owner, id] = rx.dataset.key.split('/'), kind = rx.dataset.react;
      const ref = N.ref(`reacts/${owner}/${id}/${kind}/${me.uid}`);
      const on = rx.classList.contains('on'), nid = `r_${id}_${kind}_${me.uid}`;
      if (on) KK.sfx.ui();
      else KK.sfx.select();
      if (on) KK.notify.unsend(owner, nid);
      else KK.notify.send(owner, { t: 'react', post: id, kind }, nid);
      return (on ? ref.remove() : ref.set(true)).catch(warn);
    }
    const rb = e.target.closest('[data-reply]');
    if (rb) {
      rb.blur();
      KK.sfx.ui();
      const key = rb.dataset.reply;
      if (openReplies.has(key)) openReplies.delete(key);
      else openReplies.add(key);
      renderPosts();
      const input = $('#feedPosts').querySelector(`[data-reply-in="${CSS.escape(key)}"]`);
      if (input) input.focus();
      return;
    }
    const rd = e.target.closest('[data-rdel]');
    if (rd && me) {
      rd.blur();
      if (!armed(rd)) return;
      KK.sfx.ui();
      const [owner, id] = rd.dataset.key.split('/');
      return N.ref(`replies/${owner}/${id}/${rd.dataset.rdel}`).remove().catch(warn);
    }
    const u = e.target.closest('[data-user]');
    if (u) {
      KK.sfx.ui();
      if (u.dataset.user === ME()) KK.app.show('title');
      else KK.app.showUser(u.dataset.user, 'home');
    }
  });

  $('#feedPosts').addEventListener('input', (e) => {
    const k = e.target.dataset.replyIn;
    if (k) drafts[k] = e.target.value;
  });
  $('#feedPosts').addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-reply-form]');
    if (!f || !me) return;
    e.preventDefault();
    const key = f.dataset.replyForm, input = f.querySelector('input'), text = input.value.trim().slice(0, 500);
    if (!text) return input.focus();
    const [owner, id] = key.split('/');
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await N.ref(`replies/${owner}/${id}/${newId()}`).set({ uid: me.uid, text, at: N.now() });
      KK.notify.send(owner, { t: 'reply', post: id, text: text.slice(0, 80) });
      delete drafts[key];
      KK.sfx.select();
      const again = $('#feedPosts').querySelector(`[data-reply-in="${CSS.escape(key)}"]`);
      if (again) {
        again.value = '';
        again.focus();
      }
    } catch (err) {
      warn(err);
      btn.disabled = false;
      btn.textContent = 'try again';
    }
  });

  /* --------------------------------- composer --------------------------------- */
  const form = $('#composer');
  let comp = null; // { mode: 'post' | 'review', kind, item, rating, gif, kb, photo }

  // "what's on your mind": a post, or straight to a review, a GIF, a keyboard or a photo
  $('#feedWhats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-new]');
    if (!b || !me) return;
    b.blur();
    KK.sfx.select();
    const what = b.dataset.new;
    if (what === 'review') return openComposer('review');
    if (!comp || comp.mode !== 'post') openComposer('post');
    if (what === 'gif' && $('#gifPick').hidden) toggleGifs();
    if (what === 'kb') showKbPick();
    if (what === 'photo') $('#photoFile').click();
  });

  function closeComposer() {
    comp = null;
    form.hidden = true;
    form.innerHTML = '';
  }

  function openComposer(mode) {
    comp = { mode, kind: null, item: null, rating: 0 };
    form.hidden = false;
    form.innerHTML = `
      <div class="comp-h"><b>${mode === 'review' ? 'new review' : 'new post'}</b><button type="button" class="picon" data-comp="close" title="close">✕</button></div>
      ${mode === 'review' ? `
        <div class="grp-h">what are you reviewing?</div>
        <div class="chips rev-kinds">${Object.keys(KINDS).map((k) => `<button type="button" class="chip" data-kind="${k}">${KINDS[k].label}</button>`).join('')}</div>
        <div class="rev-pick" id="revPick" hidden><input class="search" id="revQ" spellcheck="false" autocomplete="off"><div class="rev-results" id="revResults"></div></div>
        <div class="rev-chosen" id="revChosen" hidden></div>
        <div class="grp-h">your rating</div>
        <div class="rev-rating"><span class="rstars stars-in" id="revStars" tabindex="0" role="slider" aria-label="rating out of 5" aria-valuemin="0.5" aria-valuemax="5" aria-valuenow="0"><span class="st-bg">★★★★★</span><span class="st-fg" style="width:0">★★★★★</span></span><b id="revNum">tap the stars · halves count</b></div>
        <div class="grp-h">where to buy it <span class="sub">optional · Amazon, Lazada or Shopee link</span></div>
        <input class="search rev-link" id="revLink" type="text" inputmode="url" autocomplete="off" maxlength="500" spellcheck="false" placeholder="https://www.lazada.com.ph/products/…">
        <div class="grp-h">your review</div>` : ''}
      <textarea class="search comp-text" id="compText" maxlength="1000" rows="${mode === 'review' ? 4 : 3}" placeholder="${mode === 'review' ? 'how does it sound, feel, look? worth the price?' : "what's on your mind? a build, a switch, a match…"}"></textarea>
      ${mode === 'post' ? `
        <div class="kb-pick" id="kbPick" hidden></div>
        <div class="att-chosen" id="kbChosen" hidden></div>
        <div class="att-chosen" id="photoChosen" hidden></div>
        <div class="gif-chosen" id="gifChosen" hidden></div>
        <div class="gif-pick" id="gifPick" hidden>
          ${GIPHY_KEY ? '<input class="search" id="gifQ" spellcheck="false" autocomplete="off" placeholder="search GIPHY"><div class="gif-grid" id="gifGrid"></div>' : ''}
          <input class="search" id="gifLink" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="${GIPHY_KEY ? 'or paste' : 'paste'} a GIPHY link (giphy.com → a GIF → copy link)">
          <div class="gif-attr">powered by <b>GIPHY</b></div>
        </div>` : ''}
      <div class="comp-foot">${mode === 'post' ? '<span class="comp-atts"><button type="button" class="btn sm gif-btn" data-comp="gif">GIF</button><button type="button" class="btn sm" data-comp="kb">⌨ keyboard</button><button type="button" class="btn sm" data-comp="photo">📷 photo</button></span>' : ''}<span class="hint" id="compMsg"></span><button class="btn primary" type="submit">${mode === 'review' ? 'post review' : 'post'}</button></div>`;
    (mode === 'review' ? form.querySelector('.rev-kinds .chip') : $('#compText')).focus();
  }

  const compMsg = (t) => ($('#compMsg').textContent = t);

  // attach one of your saved keyboards: it's drawn in the post, playable with ▶ hear it
  function showKbPick() {
    const el = $('#kbPick'), ps = KK.app.profiles;
    el.hidden = false;
    el.innerHTML = ps.length
      ? `<span class="hud-lbl">share one of your keyboards</span><div class="chips">${ps.map((p) => `<button type="button" class="chip" data-kbp="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>`
      : '<p class="hint">no saved keyboards yet. Build one first, then share it here.</p>';
  }
  function pickKb(id) {
    const p = KK.app.profiles.find((x) => x.id === id);
    if (!p) return;
    comp.kb = kbOf(p.name, p.id, p.build);
    $('#kbPick').hidden = true;
    const el = $('#kbChosen');
    el.hidden = false;
    el.innerHTML = `<span class="att-ico">⌨</span><span class="kb-text"><b>${esc(comp.kb.name)}</b><span>${esc(KK.keysound.writeup(comp.kb.build).headline)}</span></span><button type="button" class="picon" data-comp="nokb" title="remove">✕</button>`;
    compMsg('');
  }

  // attach a photo: shrunk in the browser to a JPEG under ~380 KB (it's kept in the database)
  function shrinkPhoto(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        let side = 1024, q = 0.78;
        for (let i = 0; i < 7; i++) {
          const k = Math.min(1, side / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * k));
          c.height = Math.max(1, Math.round(im.height * k));
          const cx = c.getContext('2d');
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, c.width, c.height);
          cx.drawImage(im, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/jpeg', q);
          if (out.length < 380000) return res(out);
          side *= 0.8;
          q = Math.max(0.5, q - 0.08);
        }
        rej(new Error('too big'));
      };
      im.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error('not an image'));
      };
      im.src = url;
    });
  }
  $('#photoFile').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !comp || comp.mode !== 'post') return;
    if (!/^image\//.test(f.type)) return compMsg("that isn't a picture");
    compMsg('shrinking the photo…');
    try {
      comp.photo = await shrinkPhoto(f);
      const el = $('#photoChosen');
      el.hidden = false;
      el.innerHTML = `<img src="${comp.photo}" alt=""><button type="button" class="picon" data-comp="nophoto" title="remove the photo">✕</button>`;
      compMsg('');
    } catch (err) {
      compMsg("couldn't use that photo. Try another one.");
    }
  });

  // GIF picker: GIPHY search (with an API key in js/giphy-config.js) or a pasted link
  const GIPHY_KEY = String(window.KK_GIPHY_KEY || '').trim();
  let gifTimer = null, gifToken = 0;
  function toggleGifs() {
    const pick = $('#gifPick');
    pick.hidden = !pick.hidden;
    if (pick.hidden) return;
    if (GIPHY_KEY) {
      if (!$('#gifGrid').children.length) searchGifs('');
      $('#gifQ').focus();
    } else $('#gifLink').focus();
  }
  async function searchGifs(q) {
    const token = ++gifToken, grid = $('#gifGrid');
    const api = `https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?api_key=${encodeURIComponent(GIPHY_KEY)}&limit=24&rating=pg-13${q ? '&q=' + encodeURIComponent(q) : ''}`;
    try {
      const res = await fetch(api);
      if (!res.ok) throw new Error('giphy ' + res.status);
      const ids = ((await res.json()).data || []).map((g) => g && g.id).filter(isGif);
      if (token !== gifToken || !grid.isConnected) return;
      grid.innerHTML = ids.length
        ? ids.map((id) => `<button type="button" class="gif-cell" data-gif="${id}"><img src="${gifSrc(id, '200w')}" alt="" loading="lazy"></button>`).join('')
        : '<p class="hint">no GIFs found</p>';
    } catch (err) {
      console.warn('kkph giphy', err);
      if (token === gifToken && grid.isConnected) grid.innerHTML = "<p class=\"hint\">GIPHY search isn't working right now. Paste a GIPHY link below instead.</p>";
    }
  }
  function pickGif(id) {
    comp.gif = id;
    $('#gifPick').hidden = true;
    const el = $('#gifChosen');
    el.hidden = false;
    el.innerHTML = `<img src="${gifSrc(id, '200w')}" alt="GIF"><button type="button" class="picon" data-comp="nogif" title="remove the GIF">✕</button>`;
    compMsg('');
  }

  function pickKind(kind) {
    comp.kind = kind;
    comp.item = null;
    form.querySelectorAll('[data-kind]').forEach((c) => c.classList.toggle('on', c.dataset.kind === kind));
    $('#revChosen').hidden = true;
    $('#revPick').hidden = false;
    const q = $('#revQ');
    q.value = '';
    q.placeholder = `search ${itemsOf(kind).length} ${KINDS[kind].what}…`;
    renderResults();
    q.focus();
  }

  function renderResults() {
    const terms = $('#revQ').value.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = itemsOf(comp.kind).filter((it) => {
      const s = (it.name + ' ' + it.sub).toLowerCase();
      return terms.every((t) => s.includes(t));
    });
    $('#revResults').innerHTML = hits.length
      ? hits.slice(0, 40).map((it) => `<button type="button" class="rev-res" data-item="${esc(it.id)}"><b>${esc(it.name)}</b><span>${esc(it.sub || '')}</span></button>`).join('') + (hits.length > 40 ? `<p class="hint">${hits.length - 40} more · keep typing to narrow it down</p>` : '')
      : '<p class="hint">nothing matches</p>';
  }

  function pickItem(id) {
    const it = itemById(comp.kind, id);
    if (!it) return;
    comp.item = id;
    $('#revPick').hidden = true;
    const el = $('#revChosen');
    el.hidden = false;
    el.innerHTML = `${it.img ? `<img class="rev-img" src="${esc(thumb(it.img))}" alt="" onerror="this.remove()">` : ''}
      <div class="rev-what"><span class="rev-kind">${KINDS[comp.kind].label}</span><b>${esc(it.name)}</b><span class="hint">${esc(it.sub || '')}</span></div>
      <button type="button" class="btn ghost sm" data-comp="change">change</button>`;
    compMsg('');
    $('#revStars').focus();
  }

  // stars: hover to preview, click to set; the left half of a star is a half point
  function showStars(v) {
    const s = $('#revStars');
    s.querySelector('.st-fg').style.width = v * 20 + '%';
    $('#revNum').textContent = v ? `${v} / 5` : 'tap the stars · halves count';
  }
  function setRating(v) {
    comp.rating = U.clamp(v, 0.5, 5);
    $('#revStars').setAttribute('aria-valuenow', comp.rating);
    showStars(comp.rating);
    compMsg('');
  }
  const starAt = (el, x) => {
    const r = el.getBoundingClientRect();
    return U.clamp(Math.ceil(((x - r.left) / r.width) * 10) / 2, 0.5, 5);
  };

  form.addEventListener('click', (e) => {
    const t = e.target;
    const close = t.closest('[data-comp="close"]');
    if (close) return KK.sfx.ui(), closeComposer();
    if (t.closest('[data-comp="gif"]')) return t.closest('button').blur(), KK.sfx.ui(), toggleGifs();
    if (t.closest('[data-comp="kb"]')) return t.closest('button').blur(), KK.sfx.ui(), showKbPick();
    if (t.closest('[data-comp="photo"]')) return t.closest('button').blur(), $('#photoFile').click();
    const kp = t.closest('[data-kbp]');
    if (kp) return KK.sfx.select(), pickKb(kp.dataset.kbp);
    if (t.closest('[data-comp="nokb"]')) {
      comp.kb = null;
      $('#kbChosen').hidden = true;
      return KK.sfx.ui();
    }
    if (t.closest('[data-comp="nophoto"]')) {
      comp.photo = null;
      $('#photoChosen').hidden = true;
      return KK.sfx.ui();
    }
    if (t.closest('[data-comp="nogif"]')) {
      comp.gif = null;
      $('#gifChosen').hidden = true;
      return KK.sfx.ui();
    }
    const g = t.closest('[data-gif]');
    if (g) return KK.sfx.select(), pickGif(g.dataset.gif);
    if (t.closest('[data-comp="change"]')) {
      $('#revChosen').hidden = true;
      $('#revPick').hidden = false;
      return $('#revQ').focus();
    }
    const k = t.closest('[data-kind]');
    if (k) return KK.sfx.ui(), pickKind(k.dataset.kind);
    const it = t.closest('[data-item]');
    if (it) return KK.sfx.select(), pickItem(it.dataset.item);
    const st = t.closest('#revStars');
    if (st) return KK.sfx.ui(), setRating(starAt(st, e.clientX));
  });
  form.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'revQ') renderResults();
    if (id === 'gifQ') {
      clearTimeout(gifTimer);
      gifTimer = setTimeout(() => searchGifs(e.target.value.trim()), 350);
    }
    if (id === 'gifLink') {
      if (e.inputType === 'insertFromPaste') useGifLink(e.target); // a paste is the whole link
      else compMsg('');
    }
  });
  // a typed link is read once it's finished: Enter or leaving the box
  form.addEventListener('change', (e) => e.target.id === 'gifLink' && useGifLink(e.target));
  function useGifLink(input) {
    const v = input.value.trim();
    const gid = v && giphyId(/^https?:\/\//i.test(v) ? v : 'https://' + v);
    if (gid) {
      input.value = '';
      KK.sfx.select();
      pickGif(gid);
    } else compMsg(v ? "that isn't a GIPHY GIF link" : '');
  }
  form.addEventListener('pointermove', (e) => {
    const st = e.target.closest('#revStars');
    if (st) showStars(starAt(st, e.clientX));
  });
  form.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget;
    if (e.target.closest('#revStars') && !(to && to.closest && to.closest('#revStars'))) showStars(comp ? comp.rating : 0);
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.id === 'gifQ' || e.target.id === 'gifLink')) {
      e.preventDefault(); // not "post"
      if (e.target.id === 'gifLink') useGifLink(e.target);
      return;
    }
    if (e.target.id !== 'revStars') return;
    const d = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
    if (!d) return;
    e.preventDefault();
    setRating((comp.rating || 0) + d);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!me || !comp) return;
    const text = $('#compText').value.trim().slice(0, 1000);
    const data = { type: comp.mode, text, at: N.now() };
    if (comp.mode === 'post') {
      if (!text && !comp.gif && !comp.kb && !comp.photo) return compMsg('write something or add a GIF, keyboard or photo first');
      if (comp.gif) data.gif = comp.gif;
      if (comp.kb) data.kb = comp.kb;
      if (comp.photo) data.photo = comp.photo;
    }
    if (comp.mode === 'review') {
      if (!comp.item) return compMsg('pick what you are reviewing');
      if (!comp.rating) return compMsg('give it a rating');
      let link = $('#revLink').value.trim();
      if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
      if (link && !shopOf(link)) return compMsg('the link has to be an https Amazon, Lazada or Shopee page');
      Object.assign(data, { kind: comp.kind, item: comp.item, rating: comp.rating });
      if (link) data.link = link;
    }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await N.ref(`posts/${me.uid}/${newId()}`).set(data);
      KK.sfx.select();
      closeComposer();
      if (data.type === 'review') {
        ratedAt = 0;
        renderRated();
      }
    } catch (err) {
      console.warn('kkph posts', err);
      btn.disabled = false;
      compMsg("couldn't post. Try again in a minute.");
    }
  });
})();
