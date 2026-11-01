(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Lobbies (vs players → lobbies): anyone creates one for up to 4 players, others ask
   * to join, and the host accepts or rejects each. With 2 or more in, the host starts
   * the match (KK.game.startParty); afterwards the lobby opens again for a rematch.
   *
   *   parties/{id}   { host, hostName, at, status: open|playing|closed, seed, level, lang,
   *                    members:  { uid: { display, pid, pname, build, at } },
   *                    requests: { uid: { display, pid, pname, build, at } },
   *                    denied:   { uid: true } }   + live / hits / ready / res / left in a match
   */
  const P = (KK.party = {});
  const MAX = 4; // players in a lobby
  const FRESH = 3 * 60 * 60 * 1000; // older open lobbies aren't listed
  let me = null, off = null, all = {};
  let joining = null; // the lobby you've asked to join
  let inId = null; // the lobby you're in
  const started = new Set();
  let reqSeen = ''; // the join requests you've heard about (host)

  P.start = function () {
    P.stop();
    me = N.me;
    if (!me) return;
    off = N.ref('parties').on((v) => {
      all = v && typeof v === 'object' ? v : {};
      sync();
      render();
    });
  };
  P.stop = function () {
    if (off) off();
    off = null;
    all = {};
    joining = inId = null;
    me = null;
    KK.online.inParty = false;
  };

  const members = (pt) => Object.entries((pt && pt.members) || {}).filter(([, x]) => x && typeof x === 'object');
  const requests = (pt) => Object.entries((pt && pt.requests) || {}).filter(([, x]) => x && typeof x === 'object');
  const hostOnline = (pt) => pt.host === (me && me.uid) || KK.online.isOnline(KK.online.players()[pt.host]);
  // you, as a lobby lists you: your name and the keyboard picked on this page
  function entry() {
    const pick = KK.online.myPick();
    return { display: me.display, pid: String(pick.pid), pname: String(pick.name).slice(0, 60), build: C.sanitizeBuild(pick.build), at: N.now() };
  }

  // what the lobbies say about you: in one, asked to join one, told no, the match starting
  function sync() {
    if (!me) return;
    const wasIn = inId;
    inId = null;
    for (const [id, pt] of Object.entries(all)) {
      if (!pt || pt.status === 'closed' || !pt.members || !pt.members[me.uid]) continue;
      inId = id;
    }
    KK.online.inParty = !!inId;
    if (inId && inId !== wasIn) {
      const pt = all[inId];
      if (pt.host !== me.uid) {
        KK.sfx.select();
        KK.ui.toast(`you're in ${pt.hostName || 'their'}'s lobby`);
      }
      joining = null;
    }
    if (wasIn && !inId && all[wasIn] && all[wasIn].status === 'closed' && all[wasIn].host !== me.uid) KK.ui.toast('the lobby was closed');
    // asked to join: still waiting, or told no
    if (joining) {
      const pt = all[joining];
      if (!pt || pt.status === 'closed') joining = null;
      else if (pt.denied && pt.denied[me.uid]) {
        KK.ui.toast(`${pt.hostName || 'the host'} said no this time`);
        joining = null;
      }
    }
    // the host started: everyone in it plays
    const pt = inId && all[inId];
    if (pt && pt.status === 'playing' && pt.seed && !started.has(inId + ':' + pt.seed)) play(inId, pt);
    // a request just came in (you're the host)
    if (pt && pt.host === me.uid && pt.status === 'open') {
      const ids = requests(pt).map(([uid]) => uid).join(',');
      if (ids && ids !== reqSeen && ids.length > reqSeen.length) KK.sfx.challenge(true);
      reqSeen = ids;
    }
  }

  /* ---------------------------------- actions ---------------------------------- */
  function create() {
    if (!me || inId) return;
    const id = N.ref('parties').push({
      host: me.uid, hostName: me.display, at: N.now(), status: 'open', level: 4, lang: 'en',
      members: { [me.uid]: entry() },
    });
    N.ref(`parties/${id}/status`).onDisconnect('closed');
    reqSeen = '';
  }
  function join(id) {
    const pt = all[id];
    if (!me || inId || !pt || pt.status !== 'open' || members(pt).length >= MAX) return;
    joining = id;
    // (a no from before is cleared: this is a new ask)
    N.ref(`parties/${id}`).update({ [`requests/${me.uid}`]: entry(), [`denied/${me.uid}`]: null }).catch((err) => {
      console.warn('kkph lobby', err);
      joining = null;
      render();
    });
    KK.notify.send(pt.host, { t: 'challenge' }); // in their bell too
    render();
  }
  function cancelJoin() {
    if (!joining) return;
    N.ref(`parties/${joining}/requests/${me.uid}`).remove().catch(() => {});
    joining = null;
    render();
  }
  function accept(uid) {
    const pt = all[inId];
    if (!pt || pt.host !== me.uid) return;
    const req = pt.requests && pt.requests[uid];
    if (!req) return;
    if (members(pt).length >= MAX) return KK.ui.toast(`the lobby is full (${MAX} players)`);
    N.ref(`parties/${inId}`).update({ [`members/${uid}`]: req, [`requests/${uid}`]: null, [`denied/${uid}`]: null });
  }
  function reject(uid) {
    if (!all[inId] || all[inId].host !== me.uid) return;
    N.ref(`parties/${inId}`).update({ [`requests/${uid}`]: null, [`denied/${uid}`]: true });
  }
  function leave() {
    const pt = all[inId];
    if (!pt) return;
    if (pt.host === me.uid) N.ref(`parties/${inId}/status`).set('closed');
    else N.ref(`parties/${inId}/members/${me.uid}`).remove();
  }
  function startMatch() {
    const pt = all[inId];
    if (!pt || pt.host !== me.uid || members(pt).length < 2) return;
    N.ref(`parties/${inId}`).update({
      status: 'playing', seed: Math.random().toString(36).slice(2) + N.now().toString(36), startAt: N.now(),
      live: null, hits: null, ready: null, res: null, left: null, requests: null,
    });
  }
  // the keyboard picked on this page changes: your entry in the lobby too
  P.pickChanged = function () {
    if (!me || !inId || !all[inId] || all[inId].status !== 'open') return;
    N.ref(`parties/${inId}/members/${me.uid}`).set(entry()).catch(() => {});
  };

  function play(id, pt) {
    started.add(id + ':' + pt.seed);
    const list = members(pt).slice(0, MAX).map(([uid, x]) => ({ uid, display: String(x.display || 'player').slice(0, 30), pname: String(x.pname || 'keyboard').slice(0, 60), build: C.sanitizeBuild(x.build) }));
    const mine = pt.members[me.uid];
    KK.online.beginParty({ pid: String(mine.pid || 'default'), name: String(mine.pname || 'keyboard') });
    KK.app.startParty(
      { id, me: me.uid, players: list, seed: String(pt.seed), level: +pt.level || 4, lang: pt.lang === 'tl' || pt.lang === 'mix' ? pt.lang : 'en' },
      { build: C.sanitizeBuild(mine.build), pid: String(mine.pid || 'default'), name: String(mine.pname || 'keyboard') }
    );
  }
  // your match ended: the host opens the lobby again (after the others have had time to
  // see the standings), without those who left
  P.matchEnded = function () {
    const id = inId, pt = all[id];
    if (!me || !pt || pt.host !== me.uid || pt.status !== 'playing') return;
    const seed = pt.seed;
    setTimeout(() => {
      const now = all[id];
      if (!now || now.status !== 'playing' || now.seed !== seed) return;
      const gone = Object.keys(now.left || {}).filter((uid) => uid !== me.uid);
      const up = { status: 'open', seed: null, live: null, hits: null, ready: null, res: null, left: null };
      gone.forEach((uid) => (up[`members/${uid}`] = null));
      N.ref(`parties/${id}`).update(up);
    }, 8000);
  };

  /* ---------------------------------- the page ---------------------------------- */
  const isTab = () => KK.app.screen === 'lobby' && !$('#ltParties').hidden;
  function render() {
    if (!me || !isTab()) return;
    const pt = inId && all[inId];
    $('#partyRoom').hidden = !pt;
    $('#partyListWrap').hidden = !!pt;
    if (pt) return renderRoom(pt);
    const open = Object.entries(all)
      .filter(([, x]) => x && x.status === 'open' && N.now() - (+x.at || 0) < FRESH && hostOnline(x) && x.members)
      .sort((a, b) => (+b[1].at || 0) - (+a[1].at || 0));
    $('#partyList').innerHTML = open.length
      ? open.map(([id, x]) => {
          const ms = members(x), full = ms.length >= MAX, asked = joining === id;
          return `<div class="pt-card">
            <div class="pt-head">${KK.social.avatarImg(x.host, 'sm')}<span class="pt-title"><b>${esc(x.hostName || 'player')}'s lobby</b><span class="sub">${ms.length} / ${MAX} players</span></span>
              ${asked ? '<button class="btn sm" data-pt="cancel">requested · cancel</button>' : `<button class="btn primary sm" data-pt="join" data-id="${esc(id)}"${full || joining ? ' disabled' : ''}>${full ? 'full' : 'join'}</button>`}</div>
            <div class="pt-ms">${ms.map(([uid, m]) => `<span class="pt-m">${KK.social.avatarImg(uid, 'xs')}<span>${esc(m.display || 'player')}</span></span>`).join('')}</div></div>`;
        }).join('')
      : '<p class="hint">no open lobbies right now. Create one and your friends can join.</p>';
  }

  function renderRoom(pt) {
    const host = pt.host === me.uid, ms = members(pt), reqs = requests(pt);
    const d = (b) => KK.keysound.writeup(C.sanitizeBuild(b)).headline;
    $('#partyRoom').innerHTML = `
      <div class="pt-room-h"><b>${host ? 'your lobby' : `${esc(pt.hostName || 'player')}'s lobby`}</b><span class="sub">${ms.length} / ${MAX} players${pt.status === 'playing' ? ' · in a match' : ''}</span></div>
      <div class="pt-members">${ms.map(([uid, m]) => `<div class="pt-mem${uid === me.uid ? ' me' : ''}">${KK.social.avatarImg(uid, 'sm')}
          <span class="pt-who"><b>${esc(m.display || 'player')}${uid === pt.host ? ' <i class="pt-crown" title="host">👑</i>' : ''}${uid === me.uid ? ' <em>(you)</em>' : ''}</b><span>${esc(m.pname || 'keyboard')} · ${esc(d(m.build))}</span></span></div>`).join('')}
        ${Array.from({ length: MAX - ms.length }, () => '<div class="pt-mem empty"><span class="pt-slot">open slot</span></div>').join('')}</div>
      ${host && reqs.length ? `<div class="grp-h">want to join</div><div class="pt-reqs">${reqs.map(([uid, r]) => `<div class="pt-req">${KK.social.avatarImg(uid, 'sm')}
          <span class="pt-who"><b>${esc(r.display || 'player')}</b><span>${esc(r.pname || 'keyboard')} · ${esc(d(r.build))}</span></span>
          <button class="btn primary sm" data-pt="accept" data-uid="${esc(uid)}"${ms.length >= MAX ? ' disabled' : ''}>accept</button><button class="btn ghost sm" data-pt="reject" data-uid="${esc(uid)}">reject</button></div>`).join('')}</div>` : ''}
      <div class="pt-acts">
        ${host ? `<button class="btn primary" data-pt="start"${ms.length < 2 || pt.status !== 'open' ? ' disabled' : ''}>start match</button><button class="btn ghost" data-pt="leave">close lobby</button>`
          : `<button class="btn ghost" data-pt="leave">leave lobby</button>`}
        <span class="hint">${pt.status === 'playing' ? 'a match is on' : host ? (ms.length < 2 ? 'waiting for players to join' : 'start when everyone is in') : `waiting for ${esc(pt.hostName || 'the host')} to start`}</span>
      </div>
      <p class="hint pt-rules">2–4 players · one screen each · your combos raise every opponent's knockout bar · fill a bar and they're out · last one standing wins, or the highest score when the 2:00 runs out</p>`;
  }

  // the two tabs: 1v1 match (online now) and lobbies
  P.showTab = function (t) {
    const parties = t === 'parties';
    document.querySelectorAll('#lobbyTabs [data-lt]').forEach((b) => b.classList.toggle('on', (b.dataset.lt === 'parties') === parties));
    $('#lt1v1').hidden = parties;
    $('#ltParties').hidden = !parties;
    render();
  };
  $('#lobbyTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lt]');
    if (!b) return;
    b.blur();
    KK.sfx.tab();
    P.showTab(b.dataset.lt);
  });
  $('#ltParties').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pt]');
    if (!b || b.disabled) return;
    b.blur();
    KK.sfx.ui();
    const act = b.dataset.pt;
    if (act === 'create') create();
    else if (act === 'join') join(b.dataset.id);
    else if (act === 'cancel') cancelJoin();
    else if (act === 'accept') accept(b.dataset.uid);
    else if (act === 'reject') reject(b.dataset.uid);
    else if (act === 'leave') leave();
    else if (act === 'start') startMatch();
  });
  setInterval(() => isTab() && render(), 5000); // hosts who went quiet drop off the list
})();
