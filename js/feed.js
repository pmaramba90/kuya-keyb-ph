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
   *
   * The feed is your posts and your friends', newest first, beside the most-hearted
   * keyboards on the site.
   */
  const F = (KK.feed = {});
  let me = null, offs = [], hearts = {}, posts = {}, subs = {};
  const names = {}; // uid → display name, for players who aren't your friends
  let buildsCache = {}; // owner uid → promise of their builds (fresh each time home opens)

  const ME = () => me && me.uid;
  // the one moderator: can delete anyone's post (the database rules say the same)
  const MOD = 'akosipolnew1';
  const canDelete = (uid) => uid === ME() || (me && me.name === MOD);
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
    offs.push(N.ref('hearts').on((v) => {
      hearts = v || {};
      refreshHearts();
    }));
    F.sync();
  };

  F.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    Object.values(subs).forEach((f) => f());
    subs = {};
    posts = {};
    hearts = {};
    me = null;
    closeComposer();
  };

  // follow your posts and your friends' (called again whenever your friends change)
  F.sync = function () {
    if (!me) return;
    // the moderator sees every post on the site
    if (me.name === MOD) {
      if (!subs['*']) subs['*'] = N.ref('posts').on((v) => {
        posts = v || {};
        if (KK.app.screen === 'home') renderPosts();
      });
      return;
    }
    const want = new Set([me.uid, ...KK.social.friendIds()]);
    Object.keys(subs).forEach((uid) => {
      if (want.has(uid)) return;
      subs[uid]();
      delete subs[uid];
      delete posts[uid];
    });
    want.forEach((uid) => {
      if (subs[uid]) return;
      subs[uid] = N.ref('posts/' + uid).on((v) => {
        posts[uid] = v || {};
        if (KK.app.screen === 'home') renderPosts();
      });
    });
    if (KK.app.screen === 'home') renderPosts();
  };

  F.render = function () {
    buildsCache = {};
    popSig = ''; // redraw: the builds may have changed
    renderPosts();
    renderPopular();
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
    if (KK.app.screen === 'home') renderPopular();
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
    if (on) KK.sfx.ui();
    else KK.sfx.select();
  }, true);

  /* ------------------------------ popular keyboards ------------------------------ */
  const buildsOf = (owner) => (buildsCache[owner] = buildsCache[owner] || N.ref('builds/' + owner).once().catch(() => null));

  let popToken = 0, popSig = '';
  async function renderPopular() {
    const token = ++popToken;
    const list = [];
    Object.keys(hearts).forEach((owner) => Object.keys(hearts[owner] || {}).forEach((pid) => {
      const n = heartCount(owner, pid);
      if (n) list.push({ owner, pid, n });
    }));
    list.sort((a, b) => b.n - a.n);
    const top = [];
    for (const x of list) {
      if (top.length >= 5) break;
      const k = ((await buildsOf(x.owner)) || {})[x.pid];
      if (k && k.build) top.push(Object.assign(x, { k }));
    }
    if (token !== popToken || KK.app.screen !== 'home') return;
    // the same five in the same order, unchanged: keep the drawn boards (hearts update in place)
    const sig = JSON.stringify(top.map((x) => [x.owner, x.pid, x.k.name, x.k.updated, nameOf(x.owner)]));
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
    // each keyboard drawn whole, scaled down to fit the column
    box.querySelectorAll('.pop-kb').forEach((el, i) => {
      const v = KK.kbview.create(el, { maxU: 22, legends: false });
      v.update(C.sanitizeBuild(top[i].k.build));
      requestAnimationFrame(() => v.fit());
    });
  }

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

  /* ---------------------------------- posts ---------------------------------- */
  function renderPosts() {
    const all = [];
    Object.keys(posts).forEach((uid) => Object.entries(posts[uid] || {}).forEach(([id, p]) => p && typeof p === 'object' && all.push({ uid, id, p })));
    all.sort((a, b) => (+b.p.at || 0) - (+a.p.at || 0));
    $('#feedPosts').innerHTML = all.length
      ? all.slice(0, 60).map(postHtml).join('')
      : '<p class="hint feed-empty">nothing here yet. Share a post or a review with +, and add friends to see theirs.</p>';
  }

  function postHtml({ uid, id, p }) {
    const review = p.type === 'review';
    const it = review && itemById(p.kind, p.item);
    const r = rating(p.rating), shop = review && shopOf(p.link);
    return `<article class="post">
      <div class="post-head">
        <span class="post-av" data-user="${esc(uid)}">${KK.social.avatarImg(uid, 'sm')}</span>
        <div class="post-who"><b data-user="${esc(uid)}">${esc(nameOf(uid))}</b><span>${review ? 'wrote a review' : 'posted'} · ${F.ago(p.at)}</span></div>
        ${canDelete(uid) ? `<button class="picon" data-del="${esc(id)}" data-uid="${esc(uid)}" title="${uid === ME() ? 'delete' : 'delete (moderator)'}">✕</button>` : ''}
      </div>
      ${it ? `<div class="rev">
        ${it.img ? `<img class="rev-img" src="${esc(thumb(it.img))}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div class="rev-what"><span class="rev-kind">${KINDS[p.kind].label}</span><b>${esc(it.name)}</b><span class="hint">${esc(it.sub || '')}</span>
        <div class="rev-rate">${stars(r)}<b>${r}</b><span class="hint">/ 5</span></div></div>
        ${shop ? `<a class="btn sm rev-shop" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer nofollow ugc">buy on ${shop} ↗</a>` : ''}</div>` : ''}
      ${p.text ? `<p class="post-text">${esc(String(p.text).slice(0, 1000))}</p>` : ''}
    </article>`;
  }

  $('#scr-home').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del && me) {
      del.blur();
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = 'delete?';
        del.classList.add('armed');
        setTimeout(() => del.isConnected && (delete del.dataset.armed, (del.textContent = '✕'), del.classList.remove('armed')), 2500);
        return;
      }
      KK.sfx.ui();
      if (!canDelete(del.dataset.uid)) return;
      return N.ref(`posts/${del.dataset.uid}/${del.dataset.del}`).remove().catch((err) => console.warn('kkph posts', err));
    }
    const u = e.target.closest('[data-user]');
    if (u) {
      KK.sfx.ui();
      if (u.dataset.user === ME()) KK.app.show('title');
      else KK.app.showUser(u.dataset.user, 'home');
    }
  });

  /* -------------------------------- + composer -------------------------------- */
  const menu = $('#addMenu'), form = $('#composer');
  let comp = null; // { mode: 'post' | 'review', kind, item, rating }

  $('#feedAdd').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#feedAdd').blur();
    KK.sfx.ui();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('#addMenu')) menu.hidden = true;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-new]');
    if (!b) return;
    menu.hidden = true;
    KK.sfx.select();
    openComposer(b.dataset.new);
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
      <div class="comp-foot"><span class="hint" id="compMsg"></span><button class="btn primary" type="submit">${mode === 'review' ? 'post review' : 'post'}</button></div>`;
    (mode === 'review' ? form.querySelector('.rev-kinds .chip') : $('#compText')).focus();
  }

  const compMsg = (t) => ($('#compMsg').textContent = t);

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
  form.addEventListener('input', (e) => e.target.id === 'revQ' && renderResults());
  form.addEventListener('pointermove', (e) => {
    const st = e.target.closest('#revStars');
    if (st) showStars(starAt(st, e.clientX));
  });
  form.addEventListener('pointerout', (e) => {
    const to = e.relatedTarget;
    if (e.target.closest('#revStars') && !(to && to.closest && to.closest('#revStars'))) showStars(comp ? comp.rating : 0);
  });
  form.addEventListener('keydown', (e) => {
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
    if (comp.mode === 'post' && !text) return compMsg('write something first');
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
    } catch (err) {
      console.warn('kkph posts', err);
      btn.disabled = false;
      compMsg("couldn't post. Try again in a minute.");
    }
  });
})();
