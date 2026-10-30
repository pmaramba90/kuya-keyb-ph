(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * vs players: who's online, challenges, saved builds everyone can see, and each
   * build's win–loss record against other players.
   *
   *   meta/userCount          accounts ever created (shown on the home page)
   *   presence/{uid}          { display, state: idle|match, pid, at } while the site is open
   *   builds/{uid}/{pid}      { name, build, w, l, updated } — a copy of the saved builds
   *   challenges/{to}/{from}  { fromName, pid, pname, build, at, status, match }
   *   matches/{id}            { a, b, seed, level, lang, players } + live/hits/ready/res/left
   *
   * A challenge lives 10 seconds. Accepting creates the match; both sides then run
   * KK.game.startPvp with the same seed.
   */
  const O = (KK.online = { inMatch: false, matchPick: null });
  const CH_SECS = 10;
  const BEAT_MS = 15000, GONE_MS = 45000;
  let me = null, offs = [], beat = null, lobbyOffs = [], players = {}, builds = {};
  let outgoing = null, incoming = null; // the challenge being shown, if any
  const handled = new Set();

  /* ------------------------------- your builds ------------------------------- */
  const describe = (raw) => {
    const b = C.sanitizeBuild(raw);
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap];
    const pre = b.prebuilt && C.keyboardById[b.prebuilt];
    return {
      b, kc,
      head: KK.keysound.writeup(b).headline,
      board: pre ? pre.title : `${C.LAYOUTS[b.layout].name} ${C.CASES[b.case].name} · ${C.PLATES[b.plate].name} plate`,
      sw: `${sw.name} · ${sw.type}`,
      caps: `${C.KC_PROFILES[kc.profile].name} ${C.KC_MATERIALS[kc.material].name}`,
    };
  };
  const swatch = (d) => `<span class="pswatch" style="background:${d.b.caseColor}"><i style="background:${d.kc.colors.a}"></i><i style="background:${d.kc.colors.m}"></i><i style="background:${d.kc.colors.x}"></i></span>`;
  // records can come from other players' data: only ever print them as whole numbers
  const count = (n) => Math.max(0, Math.floor(Number(n) || 0));
  const recText = (r) => `${count(r && r.w)}W–${count(r && r.l)}L`;
  O.recText = recText;

  // the builds you can play with: your saved ones, or the default if there are none
  function picks() {
    const app = KK.app;
    if (!app.profiles.length) return [{ pid: 'default', name: C.PVP_DEFAULT_NAME, build: C.pvpDefaultBuild(), rec: app.progress.pvpDefault }];
    return app.profiles.map((p) => ({ pid: p.id, name: p.name, build: p.build, rec: p }));
  }
  function myPick() {
    const list = picks(), want = KK.app.settings.pvpBuild;
    return list.find((p) => p.pid === want) || list.find((p) => p.pid === KK.app.profileId) || list[0];
  }

  // keep the online copy of your builds in step with this browser
  O.pushBuilds = function () {
    if (!me) return;
    const out = {}, mainId = KK.app.mainBuildId();
    KK.app.profiles.forEach((p) => (out[p.id] = { name: p.name, build: p.build, w: p.w || 0, l: p.l || 0, updated: p.updated || p.created || 0, main: p.id === mainId }));
    const d = KK.app.progress.pvpDefault;
    if (d) out.default = { name: C.PVP_DEFAULT_NAME, build: C.pvpDefaultBuild(), w: d.w || 0, l: d.l || 0, updated: 0 };
    N.ref('builds/' + me.uid).set(out);
    beatNow();
  };

  // on log in: builds saved from another device come down, records keep the higher count
  async function pullBuilds() {
    const app = KK.app;
    const cloud = (await N.ref('builds/' + me.uid).once()) || {};
    let changed = false;
    Object.keys(cloud).forEach((id) => {
      const c = cloud[id];
      if (!c || !c.build) return;
      if (id === 'default') {
        const d = (app.progress.pvpDefault = app.progress.pvpDefault || { w: 0, l: 0 });
        d.w = Math.max(d.w, c.w || 0);
        d.l = Math.max(d.l, c.l || 0);
        app.saveProgress();
        return;
      }
      const p = app.profiles.find((x) => x.id === id);
      if (!p) {
        app.profiles.push({ id, name: c.name, build: c.build, w: c.w || 0, l: c.l || 0, created: c.updated || N.now(), updated: c.updated || 0, best: 0 });
        changed = true;
        return;
      }
      if ((c.updated || 0) > (p.updated || 0)) Object.assign(p, { name: c.name, build: c.build, updated: c.updated });
      p.w = Math.max(p.w || 0, c.w || 0);
      p.l = Math.max(p.l || 0, c.l || 0);
      changed = true;
    });
    // the main keyboard you picked on another device
    const cloudMain = Object.keys(cloud).find((id) => id !== 'default' && cloud[id] && cloud[id].main);
    if (cloudMain && app.profiles.some((p) => p.id === cloudMain)) KK.store.uset('mainBuild', cloudMain);
    if (changed) app.storeProfiles();
    O.pushBuilds();
    if (app.screen === 'title' || app.screen === 'play') app.show(app.screen);
  }

  // after a match against a person: +1 win or loss on the build you played
  O.record = function (won) {
    const app = KK.app, pick = O.matchPick;
    if (!pick) return '';
    let rec;
    if (pick.pid === 'default') rec = app.progress.pvpDefault = app.progress.pvpDefault || { w: 0, l: 0 };
    else rec = app.profiles.find((p) => p.id === pick.pid) || { w: 0, l: 0 };
    rec.w = (rec.w || 0) + (won ? 1 : 0);
    rec.l = (rec.l || 0) + (won ? 0 : 1);
    app.saveProgress();
    app.storeProfiles();
    O.matchPick = null;
    return `${esc(pick.name)} is now ${recText(rec)} vs players`;
  };

  /* --------------------------------- presence --------------------------------- */
  function beatNow() {
    if (!me) return;
    const pick = myPick();
    N.ref('presence/' + me.uid).set({ name: me.name, display: me.display, state: O.inMatch ? 'match' : 'idle', pid: pick.pid, at: N.now() });
  }

  O.start = function () {
    O.stop();
    me = N.me;
    if (!me) return;
    N.ref('presence/' + me.uid).onDisconnect(null);
    beatNow();
    beat = setInterval(beatNow, BEAT_MS);
    offs.push(N.ref('challenges/' + me.uid).on(onChallenges));
    // who's online, for the home page count and the players list
    offs.push(N.ref('presence').on((v) => {
      players = v || {};
      renderLobby();
      countOnline();
      presenceCbs.forEach((f) => f());
    }));
    const recount = setInterval(countOnline, 10000); // drop players who went quiet
    offs.push(() => clearInterval(recount));
    pullBuilds();
  };

  const isOnline = (p) => !!p && N.now() - (p.at || 0) < GONE_MS;
  O.isOnline = isOnline;
  O.players = () => players;
  // others who want to know when the online list changes (the friends page)
  const presenceCbs = new Set();
  O.onPresence = (f) => presenceCbs.add(f);
  let onlineCb = null;
  O.watchOnline = (cb) => {
    onlineCb = cb;
    countOnline();
  };
  function countOnline() {
    if (onlineCb) onlineCb(me ? Object.values(players).filter(isOnline).length : null);
  }

  O.stop = function () {
    if (me) N.ref('presence/' + me.uid).remove();
    clearInterval(beat);
    offs.forEach((f) => f());
    offs = [];
    closeLobby();
    closeCh();
    me = null;
    players = {};
    countOnline();
  };

  O.matchEnded = function () {
    O.inMatch = false;
    beatNow();
    KK.app.pvpDone();
  };

  // home page counter (works signed out)
  O.watchCount = function (cb) {
    N.ready.then(() => N.ref('meta/userCount').on((n) => cb(n || 0)));
  };

  /* ----------------------------------- lobby ----------------------------------- */
  O.openLobby = function () {
    KK.app.show('lobby');
    closeLobby();
    lobbyOffs.push(N.ref('builds').on((v) => { builds = v || {}; renderLobby(); }));
    const tick = setInterval(renderLobby, 5000); // drop players who went quiet
    lobbyOffs.push(() => clearInterval(tick));
    renderPick();
  };
  function closeLobby() {
    lobbyOffs.forEach((f) => f());
    lobbyOffs = [];
  }
  O.leftLobby = closeLobby;

  function renderPick() {
    const list = picks(), cur = myPick();
    $('#lobbyPick').innerHTML = list.map((p) => `<option value="${esc(p.pid)}"${p.pid === cur.pid ? ' selected' : ''}>${esc(p.name)} · ${recText(p.rec)}</option>`).join('');
    const d = describe(cur.build);
    $('#lobbyDesc').innerHTML = `${swatch(d)}<span><b>${esc(d.head)}</b><br>${esc(d.board)} · ${esc(d.sw)} · ${esc(d.caps)}</span>`;
    $('#lobbyHint').textContent = N.online()
      ? 'everyone signed in on kuyakeybph shows up here'
      : 'online play isn’t connected yet — the players listed are other tabs open in this browser';
  }

  function renderLobby() {
    if (KK.app.screen !== 'lobby' || !me) return;
    const list = Object.entries(players)
      .filter(([uid, p]) => uid !== me.uid && isOnline(p))
      .sort((a, b) => (a[1].state === 'idle' ? 0 : 1) - (b[1].state === 'idle' ? 0 : 1) || String(a[1].display).localeCompare(b[1].display));
    $('#lobbyCount').textContent = list.length ? `${list.length} online` : '';
    $('#lobbyList').innerHTML = list.length
      ? list.map(([uid, p]) => playerCard(uid, p)).join('')
      : N.online()
        ? '<p class="hint">nobody else is online right now — send your brother the link and keep this page open.</p>'
        : '<p class="lobby-off">online play isn’t switched on yet, so only other tabs of this same browser window show up here — not other devices, other browsers or incognito windows. It turns on once the site is connected to Firebase (README → “Going online”).</p>';
  }

  // just the keyboard they picked to play with
  function playerCard(uid, p) {
    const theirs = builds[uid] || {};
    const id = theirs[p.pid] && theirs[p.pid].build ? p.pid : Object.keys(theirs).find((k) => theirs[k] && theirs[k].build && k !== 'default');
    const x = (id && theirs[id]) || { name: C.PVP_DEFAULT_NAME, build: C.pvpDefaultBuild(), ...(theirs.default || {}) };
    const d = describe(x.build);
    const busy = p.state === 'match' || !!outgoing;
    return `<div class="pl-card">
      <div class="pl-head"><span class="av-wrap">${KK.social.avatarImg(uid, 'sm')}<i class="pl-dot ${p.state === 'match' ? 'busy' : ''}"></i></span><b>${esc(p.display || p.name)}</b>
        <span class="sub">${p.state === 'match' ? 'in a match' : 'online'}</span>
        <button class="btn primary sm" data-ch="${esc(uid)}"${busy ? ' disabled' : ''}>challenge</button></div>
      <div class="pb">${swatch(d)}
        <div class="pb-text"><div class="pb-name">${esc(x.name)}</div>
          <div class="pb-head">${esc(d.head)}</div>
          <div class="pb-meta">${esc(d.board)} · ${esc(d.sw)} · ${esc(d.caps)}</div></div>
        <span class="pb-rec">${recText(x)}</span></div></div>`;
  }

  $('#lobbyPick').addEventListener('change', (e) => {
    KK.app.settings.pvpBuild = e.target.value;
    KK.app.saveSettings();
    renderPick();
    beatNow();
  });
  $('#lobbyList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ch]');
    if (!b || b.disabled) return;
    b.blur();
    KK.sfx.ui();
    const p = players[b.dataset.ch];
    O.challenge(b.dataset.ch, (p && (p.display || p.name)) || 'player');
  });

  /* -------------------------------- challenges -------------------------------- */
  // its own overlay, above everything (a challenge can arrive mid-game)
  const chEl = $('#chOverlay'), chCard = $('#chCard');
  let chActs = null, chTimer = null;
  function openCh(html, acts, until) {
    clearInterval(chTimer);
    chActs = acts;
    chCard.innerHTML = html;
    chEl.hidden = false;
    if (until) {
      const bar = chCard.querySelector('.ch-time i'), num = chCard.querySelector('.ch-secs');
      const step = () => {
        const left = Math.max(0, until - N.now());
        if (bar) bar.style.width = (left / (CH_SECS * 1000)) * 100 + '%';
        if (num) num.textContent = Math.ceil(left / 1000);
        if (left <= 0 && chActs && chActs.timeout) chActs.timeout();
      };
      step();
      chTimer = setInterval(step, 100);
    }
  }
  function closeCh() {
    clearInterval(chTimer);
    chEl.hidden = true;
    chCard.innerHTML = '';
    chActs = null;
  }
  const flash = (html) => {
    openCh(`<div class="ov-h">${html}</div>`, {});
    setTimeout(() => chActs && !Object.keys(chActs).length && closeCh(), 2200);
  };
  chCard.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ch-act]');
    if (b && chActs && chActs[b.dataset.chAct]) {
      KK.sfx.ui();
      chActs[b.dataset.chAct]();
    }
  });
  chCard.addEventListener('change', (e) => {
    if (e.target.id === 'chPick' && incoming) incoming.pid = e.target.value;
  });
  O.key = function (e) {
    if (chEl.hidden || !chActs) return false;
    if (e.key === 'Enter') {
      const p = chCard.querySelector('[data-ch-primary]');
      if (p) p.click();
      return true;
    }
    if (e.key === 'Escape') {
      if (chActs.no) chActs.no();
      else closeCh();
      return true;
    }
    return false;
  };

  O.challenge = function (uid, display) {
    if (!me || outgoing || incoming || O.inMatch) return;
    const pick = myPick(), at = N.now();
    const path = `challenges/${uid}/${me.uid}`;
    N.ref(path).set({ fromName: me.display, pid: pick.pid, pname: pick.name, build: pick.build, at, status: 'pending' });
    outgoing = { uid, display, path };
    renderLobby();
    const done = () => {
      off();
      N.ref(path).remove();
      outgoing = null;
      renderLobby();
    };
    const off = N.ref(path).on((v) => {
      if (!outgoing || outgoing.path !== path || !v) return;
      if (v.status === 'accepted' && v.match) {
        done();
        closeCh();
        N.ref('matches/' + v.match).once().then((m) => m && startMatch(v.match, m));
      } else if (v.status === 'declined' || v.status === 'busy') {
        done();
        flash(`${esc(display)} ${v.status === 'busy' ? 'is busy right now' : 'declined'}`);
      }
    });
    openCh(
      `<div class="ch-tag">challenge sent</div>
       ${KK.social.avatarImg(uid, 'lg ch-av')}
       <div class="ov-h">waiting for ${esc(display)}…</div>
       <div class="ov-sub">you're playing with <b>${esc(pick.name)}</b> · they have <span class="ch-secs">${CH_SECS}</span>s to accept</div>
       <div class="ch-time"><i></i></div>
       <div class="ov-btns"><button class="btn ghost" data-ch-act="no">cancel</button></div>`,
      {
        no: () => { done(); closeCh(); },
        timeout: () => { done(); flash(`${esc(display)} didn’t answer in time`); },
      },
      at + CH_SECS * 1000
    );
  };

  function onChallenges(all) {
    if (!me || !all) return;
    Object.entries(all).forEach(([from, ch]) => {
      const key = from + ':' + ch.at;
      if (!ch || ch.status !== 'pending' || handled.has(key)) return;
      if (N.now() - ch.at > CH_SECS * 1000) return;
      handled.add(key);
      const path = `challenges/${me.uid}/${from}`;
      if (O.inMatch || incoming || outgoing) return N.ref(path).update({ status: 'busy' });
      showIncoming(from, ch, path);
    });
  }

  function showIncoming(from, ch, path) {
    if (KK.game.isRunning()) KK.game.pause();
    const cur = myPick();
    incoming = { from, ch, path, pid: cur.pid };
    const d = describe(ch.build);
    const opts = picks().map((p) => `<option value="${esc(p.pid)}"${p.pid === cur.pid ? ' selected' : ''}>${esc(p.name)} · ${recText(p.rec)}</option>`).join('');
    // sound the alarm (again, softer, at 5 s) and flash the tab title in case you're elsewhere
    KK.sfx.challenge();
    const title = document.title;
    let blink = 0;
    const titleBlink = setInterval(() => (document.title = blink++ % 2 ? title : '⚔ challenged!'), 700);
    const remind = setTimeout(() => incoming && KK.sfx.challenge(true), Math.max(0, ch.at + 5000 - N.now()));
    const end = () => {
      clearInterval(titleBlink);
      clearTimeout(remind);
      document.title = title;
      incoming = null;
      closeCh();
    };
    openCh(
      `<div class="ch-tag">⚔ you've been challenged</div>
       ${KK.social.avatarImg(from, 'lg ch-av')}
       <div class="ov-h"><b>${esc(ch.fromName)}</b> challenges you!</div>
       <div class="ch-build">${swatch(d)}<span><b>${esc(ch.pname)}</b> · ${esc(d.head)}<br>${esc(d.board)} · ${esc(d.sw)} · ${esc(d.caps)}</span></div>
       <label class="ch-pick"><span class="hud-lbl">play with</span><select class="select" id="chPick">${opts}</select></label>
       <div class="ch-time"><i></i></div>
       <div class="ov-sub">best of 3 · 1:30 rounds · <span class="ch-secs">${CH_SECS}</span>s to answer</div>
       <div class="ov-btns"><button class="btn primary" data-ch-act="yes" data-ch-primary>accept</button><button class="btn ghost" data-ch-act="no">decline</button></div>
       <p class="hint"><span class="kbd">enter</span> accept · <span class="kbd">esc</span> decline</p>`,
      {
        yes: () => { const pid = incoming.pid; end(); accept(from, ch, path, pid); },
        no: () => { N.ref(path).update({ status: 'declined' }); end(); },
        timeout: end,
      },
      ch.at + CH_SECS * 1000
    );
  }

  function accept(from, ch, path, pid) {
    const pick = picks().find((p) => p.pid === pid) || myPick();
    KK.app.settings.pvpBuild = pick.pid;
    KK.app.saveSettings();
    const m = {
      a: from, b: me.uid, level: 4, lang: 'en', created: N.now(),
      seed: Math.random().toString(36).slice(2) + N.now().toString(36),
      players: {
        [from]: { display: ch.fromName, pid: ch.pid, pname: ch.pname, build: ch.build },
        [me.uid]: { display: me.display, pid: pick.pid, pname: pick.name, build: pick.build },
      },
    };
    const id = N.ref('matches').push(m);
    N.ref(path).update({ status: 'accepted', match: id });
    startMatch(id, m);
  }

  function startMatch(id, m) {
    const oppUid = m.a === me.uid ? m.b : m.a;
    const opp = m.players[oppUid], mine = m.players[me.uid];
    if (!opp || !mine) return;
    O.inMatch = true;
    O.matchPick = { pid: mine.pid, name: mine.pname };
    closeLobby();
    beatNow();
    const ob = C.sanitizeBuild(opp.build);
    KK.app.startPvp(
      { id, me: me.uid, opp: oppUid, oppName: opp.display, oppWord: KK.keysound.comboKey(ob), oppBuild: ob, oppBuildName: opp.pname, seed: m.seed, level: m.level || 4, lang: m.lang || 'en' },
      { build: C.sanitizeBuild(mine.build), pid: mine.pid, name: mine.pname },
      { name: opp.pname, d: describe(ob) }
    );
  }
})();
