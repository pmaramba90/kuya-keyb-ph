(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Lobbies (vs players → lobbies): anyone creates one (a name, 2, 3 or 4 players, and
   * optionally a password), others ask to join, and the host accepts or rejects each. With
   * 2 or more in, the host starts the match (KK.game.startParty); afterwards the lobby
   * opens again for a rematch.
   *
   *   parties/{id}   { host, hostName, name, max: 2–4, locked, at, status: open|playing|closed, seed, level, lang,
   *                    members:  { uid: { display, pid, pname, build, at } },
   *                    requests: { uid: { display, pid, pname, build, at } },
   *                    denied:   { uid: true } }   + live / hits / ready / res / left in a match
   *   partyLocks/{id}        the password's hash (written by the host; nobody can read it)
   *   partyKeys/{id}/{uid}   the hash of what a player typed (theirs to write; nobody can read it):
   *                          the database only takes a join request when the two match
   */
  const P = (KK.party = {});
  const MAX = 4; // players in a lobby, at most
  // the host's limit: 2, 3 or 4
  const maxOf = (pt) => Math.max(2, Math.min(MAX, Math.round(+(pt && pt.max)) || MAX));
  const FRESH = 3 * 60 * 60 * 1000; // older open lobbies aren't listed
  let me = null, off = null, all = {};
  let joining = null; // the lobby you've asked to join
  let inId = null; // the lobby you're in
  const started = new Set();
  let reqSeen = ''; // the join requests you've heard about (host)
  let creating = false; // the create form is open
  const cdraft = { name: '', pw: '', max: MAX };
  let askPw = null, pwDraft = ''; // the locked lobby you're typing its password for

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
  // a password, hashed together with the lobby's id
  async function lockOf(id, pw) {
    const s = id + '\u0000' + pw;
    if (!(window.crypto && crypto.subtle)) return 'p:' + s.slice(0, 90);
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function create() {
    if (!me || inId) return;
    const name = cdraft.name.trim().replace(/\s+/g, ' ').slice(0, 30) || `${me.display}'s lobby`.slice(0, 30);
    const max = [2, 3, 4].includes(+cdraft.max) ? +cdraft.max : MAX;
    const pw = cdraft.pw.trim();
    const id = N.ref('parties').push({
      host: me.uid, hostName: me.display, name, max, locked: !!pw, at: N.now(), status: 'open', level: 4, lang: 'en',
      members: { [me.uid]: entry() },
    });
    N.ref(`parties/${id}/status`).onDisconnect('closed');
    if (pw) N.ref('partyLocks/' + id).set(await lockOf(id, pw)).catch((err) => console.warn('kkph lobby lock', err));
    reqSeen = '';
    creating = false;
    cdraft.name = cdraft.pw = '';
    cdraft.max = MAX;
    renderNew();
  }
  async function join(id, pw) {
    const pt = all[id];
    if (!me || inId || !pt || pt.status !== 'open' || members(pt).length >= maxOf(pt)) return;
    // a locked lobby: its password first
    if (pt.locked && pw === undefined) {
      askPw = id;
      pwDraft = '';
      render();
      const inp = document.querySelector('#partyList [data-pt-pw]');
      if (inp) inp.focus();
      return;
    }
    joining = id;
    askPw = null;
    render();
    try {
      if (pt.locked) await N.ref(`partyKeys/${id}/${me.uid}`).set(await lockOf(id, pw));
      // (a no from before is cleared: this is a new ask)
      await N.ref(`parties/${id}`).update({ [`requests/${me.uid}`]: entry(), [`denied/${me.uid}`]: null });
      KK.notify.send(pt.host, { t: 'challenge' }); // in their bell too
    } catch (err) {
      console.warn('kkph lobby', err);
      joining = null;
      if (pt.locked) {
        KK.ui.toast('wrong password');
        askPw = id;
      }
      render();
    }
  }
  function cancelJoin() {
    if (!joining) return;
    N.ref(`parties/${joining}/requests/${me.uid}`).remove().catch(() => {});
    N.ref(`partyKeys/${joining}/${me.uid}`).remove().catch(() => {});
    joining = null;
    render();
  }
  function accept(uid) {
    const pt = all[inId];
    if (!pt || pt.host !== me.uid) return;
    const req = pt.requests && pt.requests[uid];
    if (!req) return;
    if (members(pt).length >= maxOf(pt)) return KK.ui.toast(`the lobby is full (${maxOf(pt)} players)`);
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
  const lobbyName = (pt) => esc(String(pt.name || `${pt.hostName || 'player'}'s lobby`).slice(0, 30));
  const LOCK = '<svg class="pt-lock" viewBox="0 0 24 24" aria-label="password protected"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  // "create lobby", or the form it opens: a name, a password, how many players
  function renderNew() {
    const box = $('#ptNew');
    if (!creating) {
      box.className = 'pt-new';
      box.innerHTML = '<button class="btn primary" data-pt="create">create lobby</button><span class="hint">2–4 players · name it, lock it with a password</span>';
      return;
    }
    box.className = 'pt-new pt-form';
    box.innerHTML = `<form class="pt-create" id="ptCreate" autocomplete="off">
        <label><span>lobby name</span><input class="search" id="ptName" maxlength="30" placeholder="${esc(`${me.display}'s lobby`.slice(0, 30))}" value="${esc(cdraft.name)}"></label>
        <label><span>password <em>optional</em></span><input class="search" id="ptPw" type="password" maxlength="30" placeholder="leave empty for an open lobby" value="${esc(cdraft.pw)}" autocomplete="new-password"></label>
        <div class="pt-max"><span>max players</span><div class="chips" role="radiogroup" aria-label="max players">${[2, 3, 4].map((n) => `<button type="button" class="chip${+cdraft.max === n ? ' on' : ''}" data-pt-max="${n}" role="radio" aria-checked="${+cdraft.max === n}">${n}</button>`).join('')}</div></div>
        <div class="pt-create-btns"><button type="button" class="btn ghost sm" data-pt="nocreate">cancel</button><button class="btn primary sm" type="submit">create lobby</button></div>
      </form>`;
  }
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
          const max = maxOf(x), ms = members(x), full = ms.length >= max, asked = joining === id;
          return `<div class="pt-card">
            <div class="pt-head">${KK.social.avatarImg(x.host, 'sm')}<span class="pt-title"><b>${lobbyName(x)}${x.locked ? LOCK : ''}</b><span class="sub">host ${esc(x.hostName || 'player')} · ${ms.length} / ${max} players</span></span>
              ${asked ? '<button class="btn sm" data-pt="cancel">requested · cancel</button>' : `<button class="btn primary sm pt-join" data-pt="join" data-id="${esc(id)}"${full || joining ? ' disabled' : ''}>${full ? 'full' : x.locked ? 'join' + LOCK : 'join'}</button>`}</div>
            ${askPw === id && !asked && !full ? `<form class="pt-pw" data-pt-join="${esc(id)}" autocomplete="off"><input class="search" type="password" data-pt-pw maxlength="30" placeholder="this lobby's password" value="${esc(pwDraft)}" autocomplete="off"><button class="btn primary sm" type="submit">ask to join</button><button type="button" class="btn ghost sm" data-pt="nopw">cancel</button></form>` : ''}
            <div class="pt-ms">${ms.map(([uid, m]) => `<span class="pt-m">${KK.social.avatarImg(uid, 'xs')}<span>${esc(m.display || 'player')}</span></span>`).join('')}</div></div>`;
        }).join('')
      : '<p class="hint">no open lobbies right now. Create one and your friends can join.</p>';
  }

  function renderRoom(pt) {
    const host = pt.host === me.uid, ms = members(pt), reqs = requests(pt), max = maxOf(pt);
    const d = (b) => KK.keysound.writeup(C.sanitizeBuild(b)).headline;
    $('#partyRoom').innerHTML = `
      <div class="pt-room-h"><b>${lobbyName(pt)}${pt.locked ? LOCK : ''}</b><span class="sub">${host ? 'your lobby' : `host ${esc(pt.hostName || 'player')}`} · ${ms.length} / ${max} players${pt.locked ? ' · password protected' : ''}${pt.status === 'playing' ? ' · in a match' : ''}</span></div>
      <div class="pt-members">${ms.map(([uid, m]) => `<div class="pt-mem${uid === me.uid ? ' me' : ''}">${KK.social.avatarImg(uid, 'sm')}
          <span class="pt-who"><b>${esc(m.display || 'player')}${uid === pt.host ? ' <i class="pt-crown" title="host">👑</i>' : ''}${uid === me.uid ? ' <em>(you)</em>' : ''}</b><span>${esc(m.pname || 'keyboard')} · ${esc(d(m.build))}</span></span></div>`).join('')}
        ${Array.from({ length: Math.max(0, max - ms.length) }, () => '<div class="pt-mem empty"><span class="pt-slot">open slot</span></div>').join('')}</div>
      ${host && reqs.length ? `<div class="grp-h">want to join</div><div class="pt-reqs">${reqs.map(([uid, r]) => `<div class="pt-req">${KK.social.avatarImg(uid, 'sm')}
          <span class="pt-who"><b>${esc(r.display || 'player')}</b><span>${esc(r.pname || 'keyboard')} · ${esc(d(r.build))}</span></span>
          <button class="btn primary sm" data-pt="accept" data-uid="${esc(uid)}"${ms.length >= max ? ' disabled' : ''}>accept</button><button class="btn ghost sm" data-pt="reject" data-uid="${esc(uid)}">reject</button></div>`).join('')}</div>` : ''}
      <div class="pt-acts">
        ${host ? `<button class="btn primary" data-pt="start"${ms.length < 2 || pt.status !== 'open' ? ' disabled' : ''}>start match</button><button class="btn ghost" data-pt="leave">close lobby</button>`
          : `<button class="btn ghost" data-pt="leave">leave lobby</button>`}
        <span class="hint">${pt.status === 'playing' ? 'a match is on' : host ? (ms.length < 2 ? 'waiting for players to join' : 'start when everyone is in') : `waiting for ${esc(pt.hostName || 'the host')} to start`}</span>
      </div>
      <p class="hint pt-rules">${max === 2 ? '2 players' : `2–${max} players`} · one screen each · your combos stack bricks on every opponent's screen and knock lines off your own wall · walled in = out · last one standing wins, or the highest score when the 2:00 runs out</p>`;
  }

  // the two tabs: 1v1 match (online now) and lobbies
  P.showTab = function (t) {
    const parties = t === 'parties';
    document.querySelectorAll('#lobbyTabs [data-lt]').forEach((b) => b.classList.toggle('on', (b.dataset.lt === 'parties') === parties));
    $('#lt1v1').hidden = parties;
    $('#ltParties').hidden = !parties;
    renderNew();
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
    if (act === 'create') {
      creating = true;
      renderNew();
      $('#ptName').focus();
    } else if (act === 'nocreate') {
      creating = false;
      renderNew();
    } else if (act === 'nopw') {
      askPw = null;
      render();
    } else if (act === 'join') join(b.dataset.id);
    else if (act === 'cancel') cancelJoin();
    else if (act === 'accept') accept(b.dataset.uid);
    else if (act === 'reject') reject(b.dataset.uid);
    else if (act === 'leave') leave();
    else if (act === 'start') startMatch();
  });
  // the create form: max players, what's typed, create
  $('#ltParties').addEventListener('click', (e) => {
    const m = e.target.closest('[data-pt-max]');
    if (!m) return;
    m.blur();
    KK.sfx.tab();
    cdraft.max = +m.dataset.ptMax;
    document.querySelectorAll('#ptCreate [data-pt-max]').forEach((b) => {
      b.classList.toggle('on', b === m);
      b.setAttribute('aria-checked', b === m);
    });
  });
  $('#ltParties').addEventListener('input', (e) => {
    if (e.target.id === 'ptName') cdraft.name = e.target.value;
    if (e.target.id === 'ptPw') cdraft.pw = e.target.value;
    if (e.target.dataset && 'ptPw' in e.target.dataset) pwDraft = e.target.value;
  });
  $('#ltParties').addEventListener('submit', (e) => {
    e.preventDefault();
    KK.sfx.ui();
    if (e.target.id === 'ptCreate') return create();
    const id = e.target.dataset.ptJoin;
    if (!id) return;
    if (!pwDraft) return void KK.ui.toast('type the lobby\'s password');
    join(id, pwDraft);
  });
  // the list redraws every few seconds (hosts who went quiet drop off): a password being
  // typed keeps its focus
  setInterval(() => {
    if (!isTab()) return;
    const typing = document.activeElement && document.activeElement.dataset && 'ptPw' in document.activeElement.dataset;
    render();
    if (typing) {
      const inp = document.querySelector('#partyList [data-pt-pw]');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }, 5000);
})();
