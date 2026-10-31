(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, A = KK.audio;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /* ---------------------------------- state ---------------------------------- */
  const app = (KK.app = {});
  app.settings = Object.assign({ music: 0.5, sfx: 0.8, lang: 'en', showKb: true, currency: 'usd', vsDiff: 'medium' }, KK.store.get('settings', {}));
  app.run = { total: 0, levelStart: 0 };
  app.screen = 'title';
  app.user = null;

  // builds, saved profiles and progress belong to the signed-in user
  app.saveBuild = () => {
    KK.store.uset('build', app.build);
    app.hasSaved = true;
  };
  app.saveSettings = () => KK.store.set('settings', app.settings);
  app.saveProgress = () => KK.store.uset('progress', app.progress);
  app.userName = () => (app.user ? (KK.net.me && KK.net.me.display) || KK.auth.displayName(app.user) : 'you');

  A.musicVol = app.settings.music;
  A.sfxVol = app.settings.sfx;

  function loadUserData() {
    const saved = KK.store.uget('build', null);
    app.build = C.sanitizeBuild(saved);
    app.hasSaved = !!saved;
    app.progress = Object.assign({ unlocked: 1, best: {}, bestTotal: 0, vs: {} }, KK.store.uget('progress', {}));
    app.profiles = (KK.store.uget('profiles', []) || []).filter((p) => p && p.id && p.build);
    app.profileId = KK.store.uget('profileId', null);
    if (!app.profiles.some((p) => p.id === app.profileId)) app.profileId = null;
    KK.keysound.setBuild(app.build);
  }

  // data saved before accounts existed is handed to the first account created
  function claimLegacyData(user) {
    if (KK.store.get('legacyClaimed', false)) return false;
    KK.store.set('legacyClaimed', true);
    let moved = false;
    ['build', 'profiles', 'profileId', 'progress'].forEach((k) => {
      const v = KK.store.get(k, null);
      if (v !== null) {
        KK.store.set('u.' + user + '.' + k, v);
        KK.store.remove(k);
        moved = true;
      }
    });
    return moved;
  }

  function setUser(user) {
    app.user = user;
    KK.store.user = user;
    loadUserData();
  }

  // signed out: a default board so typing on the home page still sounds right
  function clearUser() {
    app.user = null;
    KK.store.user = null;
    app.build = C.defaultBuild();
    app.hasSaved = false;
    app.progress = { unlocked: 1, best: {}, bestTotal: 0, vs: {} };
    app.profiles = [];
    app.profileId = null;
    KK.keysound.setBuild(app.build);
  }

  /* --------------------------------- profiles --------------------------------- */
  // named, saved keyboard builds that survive a refresh (per user)
  // saved builds are also copied online so other players can see them (js/online.js)
  app.storeProfiles = () => {
    KK.store.uset('profiles', app.profiles);
    KK.online.pushBuilds();
  };
  const persistProfiles = () => {
    app.storeProfiles();
    if (!app.pvpPrev) KK.store.uset('profileId', app.profileId);
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  app.currentProfile = () => app.profiles.find((p) => p.id === app.profileId) || null;
  app.isDirty = () => {
    const p = app.currentProfile();
    return !p || JSON.stringify(C.sanitizeBuild(p.build)) !== JSON.stringify(app.build);
  };
  app.suggestName = () => {
    const pre = app.build.prebuilt && C.keyboardById[app.build.prebuilt];
    if (pre) return `${pre.title.split(' ').slice(0, 4).join(' ')} · ${C.switchById[app.build.switch].name}`.slice(0, 40);
    const tags = KK.keysound.describe(KK.keysound.computeProfile(app.build)).tags.filter((t) => !/rattly|scratchy|spring|metallic|strong/.test(t));
    const t = tags[0] || 'my';
    return `${t[0].toUpperCase() + t.slice(1)} ${C.CASES[app.build.case].name.split(' ')[0]} ${C.LAYOUTS[app.build.layout].name}`;
  };
  app.saveProfile = function (name, asNew) {
    let p = app.currentProfile();
    const isNew = !p || asNew;
    if (isNew) {
      p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), best: 0 };
      app.profiles.unshift(p);
    }
    p.name = (String(name || '').trim() || app.suggestName()).slice(0, 40);
    p.build = clone(app.build);
    p.updated = Date.now();
    app.profileId = p.id;
    persistProfiles();
    renderProfiles();
    // a new keyboard: a line in your friends' feeds, with the board drawn and playable
    if (isNew) KK.feed.activity('build', { kb: KK.feed.kbOf(p.name, p.id, p.build) }, 'b_' + p.id);
    return p;
  };
  app.loadProfile = function (id) {
    const p = app.profiles.find((x) => x.id === id);
    if (!p) return;
    app.build = C.sanitizeBuild(clone(p.build));
    app.profileId = id;
    persistProfiles();
    app.saveBuild();
    KK.keysound.setBuild(app.build);
    KK.builder.open(4);
  };
  app.renameProfile = function (id, name) {
    const p = app.profiles.find((x) => x.id === id);
    if (!p || !String(name).trim()) return;
    p.name = String(name).trim().slice(0, 40);
    persistProfiles();
    renderProfiles();
  };
  app.deleteProfile = function (id) {
    app.profiles = app.profiles.filter((x) => x.id !== id);
    if (app.profileId === id) app.profileId = null;
    persistProfiles();
    renderProfiles();
  };
  app.recordProfileScore = function (total) {
    const p = app.currentProfile();
    if (p && !app.isDirty() && total > (p.best || 0)) {
      p.best = total;
      persistProfiles();
    }
  };

  function renderProfiles() {
    const wrap = $('#savedWrap');
    wrap.hidden = !app.profiles.length;
    $('#savedList').innerHTML = app.profiles
      .map((p) => {
        const b = C.sanitizeBuild(p.build);
        const kc = C.keycapById[b.keycap], sw = C.switchById[b.switch];
        const c = kc.colors;
        return `<div class="pcard${p.id === app.profileId ? ' cur' : ''}" data-id="${p.id}">
          <button class="pmain" data-pact="load" title="load this build">
            <span class="pswatch" style="background:${b.caseColor}"><i style="background:${c.a}"></i><i style="background:${c.m}"></i><i style="background:${c.x}"></i></span>
            <span class="ptext"><span class="pname">${esc(p.name)}</span><span class="pmeta">${esc(sw.name)} · ${C.CASES[b.case].name} · ${C.LAYOUTS[b.layout].name}${p.best ? ' · best ' + p.best.toLocaleString() : ''}${p.w || p.l ? ` · <b class="prec">wins: ${p.w || 0} · losses: ${p.l || 0}</b>` : ''}</span></span>
          </button>
          <button class="picon" data-pact="rename" title="rename">✎</button>
          <button class="picon" data-pact="delete" title="delete">✕</button>
        </div>`;
      })
      .join('');
  }
  app.renderProfiles = renderProfiles;

  $('#savedList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pact]');
    if (!btn) return;
    const card = btn.closest('.pcard'), id = card.dataset.id;
    const act = btn.dataset.pact;
    btn.blur();
    KK.sfx.ui();
    if (act === 'load') app.loadProfile(id);
    else if (act === 'delete') {
      if (btn.dataset.armed) app.deleteProfile(id);
      else {
        btn.dataset.armed = '1';
        btn.textContent = 'delete?';
        btn.classList.add('armed');
        setTimeout(() => {
          if (btn.isConnected) {
            delete btn.dataset.armed;
            btn.textContent = '✕';
            btn.classList.remove('armed');
          }
        }, 2500);
      }
    } else if (act === 'rename') {
      const nameEl = card.querySelector('.pname');
      const p = app.profiles.find((x) => x.id === id);
      const input = document.createElement('input');
      input.className = 'search rename';
      input.value = p.name;
      input.maxLength = 40;
      nameEl.replaceWith(input);
      card.querySelector('.pmain').disabled = true;
      input.focus();
      input.select();
      let done = false;
      const commit = (ok) => {
        if (done) return;
        done = true;
        if (ok) app.renameProfile(id, input.value);
        else renderProfiles();
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit(true);
        if (ev.key === 'Escape') commit(false);
      });
      input.addEventListener('blur', () => commit(true));
    }
  });

  /* --------------------------------- overlay --------------------------------- */
  const ui = (KK.ui = {});
  let actions = null, cdTimer = null;
  // keepTyping: phones keep the on-screen keyboard up (the countdown); any other card
  // puts it away so its buttons can be tapped
  ui.open = function (html, acts, keepTyping) {
    clearTimeout(cdTimer);
    actions = acts || {};
    $('#ovCard').innerHTML = html;
    $('#overlay').hidden = false;
    if (!keepTyping && app.typing) app.typing.hide();
    if (app.typing) app.typing.update();
  };
  ui.close = function () {
    clearTimeout(cdTimer);
    $('#overlay').hidden = true;
    $('#ovCard').innerHTML = '';
    actions = null;
    if (app.typing) app.typing.update();
  };
  ui.isOpen = () => !$('#overlay').hidden;
  ui.key = function (e) {
    if (!actions) return true;
    if (e.key === 'Escape' && actions.esc) actions.esc();
    else if (e.key === 'Enter' && !e.repeat) {
      const p = $('#ovCard [data-primary]');
      if (p) p.click();
    }
    return true;
  };
  $('#ovCard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ov]');
    if (b && actions && actions[b.dataset.ov]) {
      KK.sfx.ui();
      actions[b.dataset.ov]();
    }
  });
  // onGo: runs as "go" shows (vs players: the FIGHT! call)
  ui.countdown = function (cb, msg, onGo) {
    ui.open('', {}, true);
    if (app.typing) app.typing.show(); // phones: the keyboard comes up, ready
    let n = 3;
    const keysTip = app.touch ? 'space clears the word · ❚❚ pauses' : '<span class="kbd">space</span> clears · <span class="kbd">esc</span> pauses';
    const step = () => {
      if (n > 0) {
        $('#ovCard').innerHTML = `<div class="count-big">${n}</div><div class="ov-sub">${esc(msg || '')}<br>${keysTip} · type glowing words for power-ups</div>`;
        KK.sfx.count(n--);
        cdTimer = setTimeout(step, 650);
      } else {
        $('#ovCard').innerHTML = '<div class="count-big">go</div>';
        if (onGo) onGo(); // replaces the go beep so nothing masks it
        else KK.sfx.count(0);
        cdTimer = setTimeout(() => {
          ui.close();
          cb();
        }, 380);
      }
    };
    step();
  };

  /* --------------------------------- screens --------------------------------- */
  const views = [];
  app.gameKb = KK.kbview.create($('#gameKb'), { maxU: 26 });
  app.vsKb = KK.kbview.create($('#vsKb'), { maxU: 22 });
  views.push(app.gameKb, app.vsKb);
  // featured keyboards: yours on home and a friend's on their page — both light up as
  // you type (on a friend's page you hear their board, too)
  app.featView = KK.kbview.create($('#featKb'), { maxU: 46 });
  app.userFeatView = KK.kbview.create($('#userFeatKb'), { maxU: 46 });
  views.push(app.featView, app.userFeatView);
  // your opponent's board (vs players): not in `views`, so your own key presses don't
  // light it up — theirs do, from their live snapshots (app.oppPress)
  app.oppKb = KK.kbview.create($('#vsOppKb'), { maxU: 22 });
  const CODE_OF = (ch) => (/[a-z]/.test(ch) ? 'Key' + ch.toUpperCase() : null);
  app.oppPress = function (typed) {
    [...typed].slice(-8).forEach((ch, i) => {
      const code = ch === '\b' ? 'Backspace' : CODE_OF(ch);
      if (!code) return;
      setTimeout(() => app.oppKb.press(code), i * 35);
      setTimeout(() => app.oppKb.release(code), i * 35 + 90);
    });
  };
  const PLAY_SCREENS = { game: 1, vs: 1 };
  // the nav tab each screen belongs to (a player's page: the tab you opened it from)
  const NAV_TAB = { title: 'title', profile: 'title', build: 'play', kbs: 'play', lobby: 'play', game: 'play', vs: 'play', user: 'friends' };
  const HINT_SOLO = $('#keysHint').innerHTML;
  const HINT_VS = '<span class="kbd">esc</span> pause &nbsp;·&nbsp; <span class="kbd">space</span> clear word &nbsp;·&nbsp; combos fill their overflow, misses lower it';

  app.show = function (name) {
    if (!app.user) name = 'title'; // everything past the home page needs an account
    // leaving a match against a person between rounds still ends it
    if (PLAY_SCREENS[app.screen] && name !== app.screen && (KK.game.isRunning() || KK.game.mode() === 'pvp')) KK.game.quit();
    if (app.screen === 'lobby' && name !== 'lobby') KK.online.leftLobby();
    // the keyboards screen and a friend's page preview other boards' sound; leaving
    // them restores yours
    if ((app.screen === 'kbs' || app.screen === 'user') && name !== app.screen) KK.keysound.setBuild(app.build);
    app.screen = name;
    document.body.dataset.screen = name;
    document.body.classList.toggle('signed-out', !app.user);
    remember(name);
    syncMusic();
    if (app.typing) {
      if (!PLAY_SCREENS[name]) app.typing.hide();
      app.typing.update();
    }
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    const tab = name === 'user' ? NAV_TAB[app.userFrom] || app.userFrom || 'friends' : NAV_TAB[name] || name;
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('on', b.dataset.go === tab));
    KK.social.closeMenu();
    if (name === 'home') KK.feed.render();
    if (name === 'title') renderHome();
    if (name === 'play') renderPlay();
    if (name === 'friends') KK.social.renderFriends();
    if (name === 'profile') KK.social.renderProfile();
    if (name === 'game') {
      app.gameKb.update(app.build);
      renderGameBuild($('#gameBuild'));
      $('#keysHint').innerHTML = HINT_SOLO;
    }
    if (name === 'vs') {
      $('#keysHint').innerHTML = HINT_VS;
      KK.social.setImg($('#vsAvL'), KK.net.me && KK.net.me.uid);
      $('#vsAvR').hidden = true; // the AI has no picture; vs players shows theirs
      app.vsKb.update(app.build);
      renderGameBuild($('#vsBuild'));
      $('#vsSubL').textContent = $('#vsSubR').textContent = '';
    }
    requestAnimationFrame(() => views.concat(KK.builder.kb || [], app.oppKb).forEach((v) => v.fit()));
  };

  /* --------------------------------- back button --------------------------------- */
  // Every screen is a step in the browser's history, so Back (and Forward) moves between
  // them instead of leaving the site, and a refresh comes back to the same screen.
  // Signed out there's just the one step: the sign-in page. A game isn't a step of its
  // own: Back after a game goes to where you started it, and Back mid-game pauses.
  const HASH = { title: 'profile', profile: 'edit-profile' }; // the address bar's #name
  let restoring = false; // going back: don't add a step
  function remember(name) {
    if (restoring || PLAY_SCREENS[name]) return;
    if (!app.user && !app.netReady) return; // starting up: keep the saved screen for later
    const st = { screen: name };
    if (name === 'user') Object.assign(st, { uid: app.viewUid, from: app.userFrom });
    const url = location.pathname + location.search + (app.user ? '#' + (HASH[name] || name) : '');
    const cur = history.state;
    if (!app.user) return history.replaceState({ screen: 'title', out: true }, '', url);
    if (cur && cur.screen === st.screen && cur.uid === st.uid) return;
    if (!cur || cur.out) history.replaceState(st, '', url); // signing in replaces the sign-in page
    else history.pushState(st, '', url);
  }
  // back (or forward) to a screen, opened the way it normally is
  function revisit(st) {
    restoring = true;
    try {
      if (ui.isOpen()) ui.close();
      KK.notify.close();
      const s = st.screen;
      if (s === 'user' && st.uid) app.showUser(st.uid, st.from);
      else if (s === 'lobby') KK.online.openLobby();
      else if (s === 'kbs') KK.kbs.open();
      else if (s === 'build') KK.builder.open(KK.builder.step || 0);
      else if (PLAY_SCREENS[s]) app.show('play'); // a game that's over: back to play
      else app.show(s);
    } finally {
      restoring = false;
    }
  }
  let undoingBack = false;
  window.addEventListener('popstate', (e) => {
    if (undoingBack) return void (undoingBack = false);
    const st = e.state;
    if (!st || !st.screen) return;
    // mid-game, Back doesn't leave: it's undone, and the game pauses (against a person
    // it asks before forfeiting)
    if (PLAY_SCREENS[app.screen] && (KK.game.isRunning() || KK.online.inMatch)) {
      undoingBack = true;
      history.go(1);
      KK.game.pause(true);
      return;
    }
    revisit(st);
  });

  // compact spec sheet shown beside the keyboard while playing (yours, or with b and
  // title given, your opponent's)
  function renderGameBuild(target, b, title) {
    b = b || app.build;
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap], cs = C.CASES[b.case];
    const prof = app.currentProfile();
    const name = title || (app.pvpPrev ? app.pvpName : prof && !app.isDirty() ? prof.name : 'current build');
    const tags = KK.keysound.writeup(b).headline.split(' · ');
    const color = (cs.colors.find((c) => c[1].toLowerCase() === b.caseColor.toLowerCase()) || ['custom'])[0];
    const lube = b.lube !== 'stock' ? C.lubeById[b.lube].name : sw.factoryLube ? 'factory lubed' : 'stock (dry)';
    const kcName = kc.name.replace(/\s+\d+[- ]Key.*$/i, '').replace(/\s+(Cherry|OEM|SA|XDA|DSA|MDA|KSA|OSA|Cubic|MOA|MOG|LSA|ASA|DDA)\s+Profile.*$/i, '');
    const row = (k, v) => `<div class="gb-row"><span>${k}</span><b>${v}</b></div>`;
    const pre = b.prebuilt && C.keyboardById[b.prebuilt];
    if (pre) {
      const FAC = { caseFoam: 'case foam', plateFoam: 'plate foam', peFoam: 'pe foam', tape: 'tape mod', stabLube: 'lubed stabs' };
      const fac = b.mods.map((m) => FAC[m]).filter(Boolean).concat(pre.lubed ? ['lubed switches'] : []);
      target.innerHTML = `
        <div class="gb-name">${esc(pre.title)}</div>
        <div class="gb-tags">${tags.map(esc).join(' · ') || 'balanced'}</div>
        ${row('keyboard', `${esc(pre.vendor)} · ${pre.sizeName}${pre.looks.length > 1 ? ` <em>${esc(pre.looks[b.look || 0].name)}</em>` : ''}`)}
        ${row('switches', `${esc(sw.name)} <em>${sw.type} ${sw.force}g</em>`)}
        ${row('case', `${esc(cs.name)} · ${esc(C.PLATES[b.plate].name)} plate`)}
        ${row('keycaps', `stock ${C.KC_PROFILES[kc.profile].name} ${C.KC_MATERIALS[kc.material].name}`)}
        ${row('factory', fac.length ? fac.join(', ') : 'as sold')}`;
      return;
    }
    target.innerHTML = `
      <div class="gb-name">${esc(name)}</div>
      <div class="gb-tags">${tags.map(esc).join(' · ') || 'balanced'}</div>
      ${row('board', `${C.LAYOUTS[b.layout].name} ${esc(cs.name)} <em>${esc(color)}</em>`)}
      ${row('plate', `${esc(C.PLATES[b.plate].name)} · ${esc(C.MOUNTS[b.mount].name.replace(' mount', ''))}`)}
      ${row('switches', `${esc(sw.name)} <em>${sw.type} ${sw.force}g</em>`)}
      ${row('keycaps', `${esc(kcName)} <em>${C.KC_PROFILES[kc.profile].name} ${C.KC_MATERIALS[kc.material].name}</em>`)}
      ${row('lube', esc(lube))}
      ${row('mods', b.mods.length ? b.mods.map((m) => esc(C.modById[m].name)).join(', ') : 'none')}`;
  }

  // mode: undefined = new run (total starts at 0), 'next' = carry the total, 'retry' = redo this level
  // the power-ups guide: before a new single-player run or vs AI match (unless you've
  // turned it off), and any time from "power-ups guide" on play. go: what "start" does.
  function powerGuide(go, label) {
    ui.open(
      `<div class="ov-h">power-ups</div>
       <div class="ov-sub">type a glowing word to grab its power-up</div>
       <div class="pg-list">${KK.game.powerGuide()}</div>
       ${go ? `<label class="pg-hide"><input type="checkbox" id="pgHide"> don't show this before every game</label>` : ''}
       <div class="ov-btns">${go ? `<button class="btn primary" data-ov="go" data-primary>${label} →</button><button class="btn ghost" data-ov="back">back</button>` : '<button class="btn primary" data-ov="back" data-primary>got it</button>'}</div>`,
      {
        go: () => {
          if ($('#pgHide') && $('#pgHide').checked) {
            app.settings.hideGuide = true;
            app.saveSettings();
          }
          go();
        },
        back: () => ui.close(),
        esc: () => ui.close(),
      }
    );
  }
  const wantGuide = () => !app.settings.hideGuide;

  app.startGame = function (level, mode, seenGuide) {
    gesture();
    if (!mode && !seenGuide && wantGuide()) return powerGuide(() => app.startGame(level, mode, true), `play level ${Math.max(1, Math.min(level, app.progress.unlocked))}`);
    ui.close();
    level = Math.max(1, Math.min(level, app.progress.unlocked));
    const start = mode === 'next' ? app.run.total : mode === 'retry' ? app.run.levelStart : 0;
    app.run.levelStart = start;
    app.run.total = start;
    app.show('game');
    KK.music.setMode('game', level);
    KK.music.duck(false);
    KK.game.start(level, app.settings.lang, start);
  };

  // vs AI: best of 3, speed level 3 / 4 / 5 for easy / medium / hard
  app.startVs = function (diff, seenGuide) {
    gesture();
    if (!seenGuide && wantGuide()) return powerGuide(() => app.startVs(diff, true), 'play vs AI');
    ui.close();
    diff = { easy: 1, medium: 1, hard: 1 }[diff] ? diff : 'medium';
    app.settings.vsDiff = diff;
    app.saveSettings();
    app.show('vs');
    KK.music.setMode('game', { easy: 3, medium: 4, hard: 5 }[diff]);
    KK.music.duck(false);
    KK.game.startVs(diff, app.settings.lang);
  };

  // vs players: you play the build you picked for the match; your usual board comes
  // back when it ends (KK.online → app.pvpDone)
  app.startPvp = function (m, mine, opp) {
    gesture();
    ui.close();
    if (!app.pvpPrev) app.pvpPrev = { build: app.build, profileId: app.profileId };
    app.build = mine.build;
    app.pvpName = mine.name;
    app.profileId = app.profiles.some((p) => p.id === mine.pid) ? mine.pid : null;
    KK.keysound.setBuild(app.build);
    app.show('vs');
    $('#vsSubL').textContent = `${mine.name} · ${KK.keysound.writeup(app.build).headline}`;
    $('#vsSubR').textContent = `${opp.name} · ${opp.d.head}`;
    $('#vsSubR').title = `${opp.d.board} · ${opp.d.sw} · ${opp.d.caps}`;
    KK.social.setImg($('#vsAvR'), m.opp);
    $('#vsAvR').hidden = false;
    // both keyboards side by side under the lanes
    document.body.classList.add('pvp');
    $('#keysHint').innerHTML = '<span class="kbd">esc</span> forfeit &nbsp;·&nbsp; <span class="kbd">space</span> clear word &nbsp;·&nbsp; misses lower their overflow &nbsp;·&nbsp; alt-tab keeps the match running';
    $('#vsOpp').hidden = false;
    $('#vsWhoL').textContent = app.userName();
    $('#vsWhoR').textContent = m.oppName;
    renderGameBuild($('#vsBuild'));
    renderGameBuild($('#vsOppBuild'), m.oppBuild, m.oppBuildName);
    app.oppKb.update(m.oppBuild);
    requestAnimationFrame(() => [app.vsKb, app.oppKb].forEach((v) => v.fit()));
    KK.music.setMode('game', m.level);
    KK.music.duck(false);
    KK.game.startPvp(m);
  };
  app.pvpDone = function () {
    document.body.classList.remove('pvp');
    $('#vsOpp').hidden = true;
    $('#keysHint').innerHTML = HINT_VS;
    if (!app.pvpPrev) return;
    app.build = app.pvpPrev.build;
    app.profileId = app.pvpPrev.profileId;
    app.pvpPrev = null;
    KK.keysound.setBuild(app.build);
  };

  app.flashKey = (code, cls) => (app.screen === 'vs' ? app.vsKb : app.gameKb).flash(code, cls);

  /* ----------------------------------- home ----------------------------------- */
  let authMode = 'login';
  // home: signed out — sign in / sign up; signed in — best scores and your keyboards
  function renderHome() {
    const inn = !!app.user;
    $('#authForm').hidden = inn || !app.netReady; // not before we know if you're signed in
    $('#homeIn').hidden = !inn;
    document.body.classList.toggle('signed-out', !inn);
    if (!inn) {
      setTimeout(() => $('#authUser').focus(), 50);
      return;
    }
    const me = KK.net.me || {}, p = app.progress, cur = app.settings.currency || 'usd';
    $('#dashHi').innerHTML = `${KK.social.avatarImg(me.uid, 'md')}<div><div class="dash-name">${esc(app.userName())}</div></div>
      <button class="btn ghost sm edit-profile" id="editProfile">edit profile</button>`;
    const add = (a, r) => ({ w: a.w + ((r && r.w) || 0), l: a.l + ((r && r.l) || 0) });
    const ai = Object.values(p.vs || {}).reduce(add, { w: 0, l: 0 });
    const pvp = app.profiles.reduce(add, add({ w: 0, l: 0 }, p.pvpDefault));
    const rec = (r) => (r.w + r.l ? ` · ${r.w}–${r.l}` : '');
    const tile = (label, best, sub) => `<div class="tile"><span class="hud-lbl">${label}</span><b>${best ? best.toLocaleString() : '—'}</b><span class="hint">${sub}</span></div>`;
    $('#dashBest').innerHTML = tile('single player', p.bestTotal, 'best total') + tile('vs ai', p.vsBest, 'best round' + rec(ai)) + tile('vs players', p.pvpBest, 'best round' + rec(pvp));
    const kbs = app.profiles.map((x) => ({ id: x.id, name: x.name, build: x.build, w: x.w || 0, l: x.l || 0 }));
    if (!kbs.length && p.pvpDefault) kbs.push({ name: C.PVP_DEFAULT_NAME, build: C.pvpDefaultBuild(), w: p.pvpDefault.w, l: p.pvpDefault.l });
    $('#homeQuick').hidden = !app.hasSaved;
    const main = kbs.find((k) => k.id && k.id === app.mainBuildId()) || kbs[0];
    renderFeatured(FEAT_HOME, main, me.uid);
    const rest = kbs.filter((k) => k !== main);
    $('#dashKbs').innerHTML = rest.length
      ? rest.map((k) => kbCard(k, { open: true, canMain: true, owner: me.uid })).join('')
      : `<p class="hint">${kbs.length ? 'build more keyboards from play — they show up here.' : 'no saved keyboards yet — build one from play.'}</p>`;
  }
  $('#dashKbs').addEventListener('click', (e) => {
    const m = e.target.closest('[data-main]');
    if (m) {
      KK.sfx.select();
      return app.setMain(m.dataset.main);
    }
    const c = e.target.closest('[data-id]');
    if (c) app.loadProfile(c.dataset.id);
  });
  $('#dashHi').addEventListener('click', (e) => e.target.closest('#editProfile') && app.show('profile'));
  $('#editBack').addEventListener('click', () => app.show('title'));
  // the featured keyboard opens its summary too
  $('#dashFeat').addEventListener('click', () => {
    const id = $('#dashFeat').dataset.id;
    if (id) app.loadProfile(id);
  });

  /* ------------------------- featured / main keyboard ------------------------- */
  // your main keyboard: the one shown big on your home page and to friends. With
  // builds but no main yet, the first one becomes it.
  app.mainBuildId = () => {
    let id = KK.store.uget('mainBuild', null);
    if (!app.profiles.some((x) => x.id === id)) {
      id = app.profiles[0] ? app.profiles[0].id : null;
      if (id) KK.store.uset('mainBuild', id);
    }
    return id;
  };
  app.setMain = (id) => {
    KK.store.uset('mainBuild', id);
    app.storeProfiles(); // the online copy marks it, so friends see it too
    renderHome();
  };

  const winRate = (k) => {
    const g = (k.w || 0) + (k.l || 0);
    return { pct: g ? Math.round(((k.w || 0) / g) * 100) + '%' : '—', rec: g ? `${k.w || 0}W ${k.l || 0}L` : 'no matches' };
  };

  // a keyboard row: swatch, name and sound, price, win rate (+ make main / open)
  function kbCard(k, o) {
    const b = C.sanitizeBuild(k.build), c = C.keycapById[b.keycap].colors, wr = winRate(k);
    const cur = app.settings.currency || 'usd';
    return `<div class="kb-card${o.open && k.id ? ' open' : ''}"${o.open && k.id ? ` data-id="${esc(k.id)}" role="button" tabindex="0"` : ''}>
      <span class="pswatch" style="background:${b.caseColor}"><i style="background:${c.a}"></i><i style="background:${c.m}"></i><i style="background:${c.x}"></i></span>
      <span class="kb-text"><b>${esc(k.name)}</b><span>${esc(KK.keysound.writeup(b).headline)}</span></span>
      <span class="kb-num"><b>${C.money(C.billOfMaterials(b).total, cur)}</b><span>est. price</span></span>
      <span class="kb-num"><b>${wr.pct}</b><span>${wr.rec}</span></span>
      ${(k.id && KK.feed.heart(o.owner, k.id)) || '<span></span>'}
      ${o.canMain && k.id ? `<button class="btn sm ghost" data-main="${esc(k.id)}">make main</button>` : '<span></span>'}
    </div>`;
  }

  // the featured keyboard: the board drawn full size plus everything about it
  const FEAT_HOME = { box: '#dashFeat', name: '#featName', tags: '#featTags', heart: '#featHeart', spec: '#featSpec', stats: '#featStats', view: () => app.featView };
  const FEAT_USER = { box: '#userFeat', name: '#userFeatName', tags: '#userFeatTags', heart: '#userFeatHeart', spec: '#userFeatSpec', stats: '#userFeatStats', sound: '#userFeatSound', view: () => app.userFeatView };
  function renderFeatured(F, k, owner) {
    $(F.box).hidden = !k;
    if (!k) return;
    const b = C.sanitizeBuild(k.build), wr = winRate(k), cur = app.settings.currency || 'usd';
    const w = KK.keysound.writeup(b);
    $(F.box).dataset.id = k.id || '';
    $(F.box).classList.toggle('open', F === FEAT_HOME && !!k.id);
    $(F.heart).innerHTML = k.id ? KK.feed.heart(owner, k.id) : '';
    $(F.name).textContent = k.name;
    $(F.tags).textContent = w.headline;
    if (F.sound) {
      const meter = (l, r, v) => `<div class="meter"><span>${l}</span><div class="bar" style="--v:${Math.round(v * 100)}%"><i></i></div><span>${r}</span></div>`;
      $(F.sound).innerHTML = `<div class="feat-meters">${meter('deep', 'high', w.meters.pitch)}${meter('quiet', 'loud', w.meters.volume)}${meter('thock', 'clack', w.meters.clack)}</div>
        <div class="feat-hear"><button class="btn primary sm" data-act="demo">▶ hear it</button><span class="hint">or just type — you're on their board</span></div>`;
    }
    renderGameBuild($(F.spec), b, k.name);
    const stat = (v, l) => `<div class="tile"><b>${v}</b><span class="hint">${l}</span></div>`;
    $(F.stats).innerHTML = stat(C.money(C.billOfMaterials(b).total, cur), 'estimated price') + stat(wr.pct, 'win rate vs players') + stat(wr.rec, 'record');
    F.view().update(b);
    requestAnimationFrame(() => F.view().fit());
  }

  /* -------------------------------- a friend's page -------------------------------- */
  // from: the screen it was opened from (the back link returns there)
  app.showUser = async function (uid, from) {
    if (!uid) return;
    if (KK.net.me && uid === KK.net.me.uid) return app.show('title'); // that's you
    app.userFrom = from || (app.screen === 'user' ? app.userFrom : app.screen) || 'friends';
    app.viewUid = uid;
    app.show('user');
    $('#userHi').innerHTML = `${KK.social.avatarImg(uid, 'md')}<div><div class="dash-name">…</div></div>`;
    $('#userFeat').hidden = true;
    $('#userKbs').innerHTML = '';
    const N = KK.net;
    const [u, pf, bs] = await Promise.all(['users/', 'profiles/', 'builds/'].map((p) => N.ref(p + uid).once().catch(() => null)));
    if (app.viewUid !== uid || app.screen !== 'user') return;
    const pres = KK.online.players()[uid];
    const st = !KK.online.isOnline(pres) ? 'offline' : pres.state === 'match' ? 'in a match' : 'online';
    const name = (u && u.display) || (pres && pres.display) || (u && u.name) || 'player';
    const sub = [pf && pf.nickname && `“${pf.nickname}”`, pf && [pf.city, pf.country].filter(Boolean).join(', '), st].filter(Boolean).join(' · ');
    app.viewName = name;
    $('#userHi').innerHTML = `<span class="av-wrap">${KK.social.avatarImg(uid, 'md')}<i class="pl-dot ${st === 'online' ? '' : st === 'offline' ? 'off' : 'busy'}"></i></span>
      <div class="user-who"><div class="dash-name">${esc(name)}</div><div class="hint">${esc(sub)}</div></div>
      <span class="user-rel" id="userRel"></span>
      ${st === 'online' ? `<button class="btn primary sm" id="userChallenge">challenge</button>` : ''}`;
    app.renderUserRel();
    const all = bs || {};
    const kbs = Object.keys(all).filter((id) => all[id] && all[id].build).map((id) => ({ id, name: all[id].name, build: all[id].build, w: all[id].w, l: all[id].l, main: all[id].main }));
    const main = kbs.find((k) => k.main) || kbs.find((k) => k.id !== 'default') || kbs[0];
    renderFeatured(FEAT_USER, main, uid);
    if (main) KK.keysound.setBuild(C.sanitizeBuild(main.build)); // typing here plays their board
    const rest = kbs.filter((k) => k !== main);
    $('#userKbsH').hidden = !rest.length;
    $('#userKbs').innerHTML = rest.length ? rest.map((k) => kbCard(k, { owner: uid })).join('') : kbs.length ? '' : '<p class="hint">no keyboards saved yet.</p>';
    const ch = $('#userChallenge');
    if (ch) ch.addEventListener('click', () => KK.online.challenge(uid, name));
  };
  $('#userBack').addEventListener('click', () => (app.userFrom === 'lobby' ? KK.online.openLobby() : app.show(app.userFrom || 'friends')));

  // you and the player whose page this is: add friend → request sent → friends
  app.renderUserRel = () => {
    const el = $('#userRel');
    if (!el || !app.viewUid) return;
    el.innerHTML = {
      none: '<button class="btn primary sm" data-rel="add">add friend</button>',
      sent: '<button class="btn sm" disabled>request sent</button>',
      received: '<button class="btn primary sm" data-rel="accept">accept friend request</button>',
      friend: '<span class="rel-friend">✓ friends</span>',
    }[KK.social.relation(app.viewUid)] || '';
  };
  $('#userHi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rel]');
    if (!b) return;
    b.blur();
    b.disabled = true;
    const uid = app.viewUid;
    const done = b.dataset.rel === 'add' ? KK.social.sendRequest(uid, app.viewName) : KK.social.accept(uid);
    Promise.resolve(done).catch((err) => {
      console.warn('kkph friends', err);
      b.disabled = false;
      b.textContent = "couldn't send · try again";
    });
  });
  $('#userFeatSound').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="demo"]');
    if (!b) return;
    b.blur();
    KK.keysound.demo();
  });

  // play: the modes, your saved builds, your matches against players
  function renderPlay() {
    const vs = app.progress.vs || {};
    const rec = ['easy', 'medium', 'hard'].filter((d) => vs[d]).map((d) => `${d} ${vs[d].w}–${vs[d].l}`).join(' · ');
    $('#homeHi').innerHTML = rec ? `vs ai ${rec}` : '';
    renderProfiles();
    renderHistory();
  }

  // newest first; vs players only (written by KK.online.record)
  async function renderHistory() {
    const me = KK.net.me;
    if (!me) return;
    const all = (await KK.net.ref('history/' + me.uid).once().catch(() => null)) || {};
    if (app.screen !== 'play') return;
    const list = Object.values(all).filter((h) => h && h.opp && h.at).sort((a, b) => b.at - a.at).slice(0, 30);
    $('#histList').innerHTML = list.length
      ? list.map((h) => `<div class="fr-card link" data-user="${esc(h.opp)}" title="open their profile">${KK.social.avatarImg(String(h.opp), 'sm')}
          <div class="fr-text"><b>vs ${esc(h.oppName || 'player')}</b><span>${esc(h.build || '')} · ${KK.feed.ago(h.at)}</span></div>
          <span class="hist-res ${h.won ? 'w' : 'l'}"><b>${h.won ? 'win' : 'loss'}</b><span>${esc(h.score || '')}${h.how ? ' · ' + esc(h.how) : ''}</span></span></div>`).join('')
      : '<p class="hint">no matches against players yet. Challenge someone from vs players.</p>';
  }
  $('#histList').addEventListener('click', (e) => {
    const c = e.target.closest('[data-user]');
    if (c) app.showUser(c.dataset.user, 'play');
  });

  function setAuthMode(m) {
    authMode = m;
    document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === m));
    $('#authPass2').hidden = m !== 'signup';
    $('#authPass').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    $('#authGo').textContent = m === 'signup' ? 'create account' : 'log in';
    $('#authErr').textContent = '';
  }
  document.querySelectorAll('.auth-tab').forEach((t) => t.addEventListener('click', () => setAuthMode(t.dataset.mode)));

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    gesture();
    const name = $('#authUser').value, pass = $('#authPass').value;
    const err = $('#authErr');
    err.textContent = '';
    try {
      if (authMode === 'signup' && pass !== $('#authPass2').value) throw new Error("passwords don't match");
      const user = (authMode === 'signup' ? await KK.net.signup(name, pass) : await KK.net.login(name, pass)).name;
      const imported = authMode === 'signup' && claimLegacyData(user);
      setUser(user);
      KK.online.start();
      KK.social.start();
      KK.feed.start();
      KK.notify.start();
      $('#authPass').value = $('#authPass2').value = '';
      KK.sfx.select();
      app.show(imported ? 'title' : 'home');
      if (imported) $('#dashHi').innerHTML += '<span class="hint"> · imported your existing builds</span>';
    } catch (ex) {
      err.textContent = ex.message;
      KK.sfx.error();
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    if (KK.game.isRunning() || KK.game.mode() === 'pvp') KK.game.quit();
    KK.online.stop();
    KK.social.stop();
    KK.feed.stop();
    KK.notify.stop();
    KK.net.logout();
    clearUser();
    setAuthMode('login');
    app.show('title');
  });

  /* ---------------------------------- audio ---------------------------------- */
  function gesture() {
    A.init();
    syncMusic();
  }
  // music plays only while you're playing (single player, vs AI, vs players)
  function syncMusic() {
    const want = !!PLAY_SCREENS[app.screen] && app.settings.music > 0;
    if (want && A.ready && !KK.music.playing) KK.music.start();
    if (!want && KK.music.playing) KK.music.stop();
  }
  document.addEventListener('pointerdown', gesture);

  const volM = $('#volMusic'), volS = $('#volSfx');
  volM.value = Math.round(app.settings.music * 100);
  volS.value = Math.round(app.settings.sfx * 100);
  volM.addEventListener('input', () => {
    app.settings.music = volM.value / 100;
    A.setMusicVolume(app.settings.music);
    if (app.settings.music === 0) KK.music.stop();
    else gesture();
    app.saveSettings();
  });
  volS.addEventListener('input', () => {
    app.settings.sfx = volS.value / 100;
    A.setSfxVolume(app.settings.sfx);
    app.saveSettings();
  });
  volS.addEventListener('change', () => KK.keysound.demo());

  // lo-fi radio: show the current track, click to skip
  const nowBtn = $('#nowPlaying');
  KK.music.onTrack = (name) => (nowBtn.textContent = '♫ ' + name);
  nowBtn.addEventListener('click', () => {
    nowBtn.blur();
    gesture();
    KK.music.next();
  });

  const kbBtn = $('#toggleKb');
  const applyKb = () => {
    document.body.classList.toggle('no-game-kb', !app.settings.showKb);
    kbBtn.textContent = 'kb: ' + (app.settings.showKb ? 'on' : 'off');
  };
  kbBtn.addEventListener('click', () => {
    app.settings.showKb = !app.settings.showKb;
    app.saveSettings();
    applyKb();
    kbBtn.blur();
    if (app.screen === 'game') app.gameKb.fit();
    if (app.screen === 'vs') app.vsKb.fit();
  });
  applyKb();

  // announcer voice: DRAGON (VoiceBosch) or the classic creamy / thocky / clicky calls
  const annBtn = $('#annBtn');
  const applyAnn = () => {
    const dragon = app.settings.announcer !== 'classic';
    annBtn.textContent = 'announcer: ' + (dragon ? 'dragon' : 'classic');
    $('.foot-credit').hidden = !dragon;
  };
  annBtn.addEventListener('click', () => {
    annBtn.blur();
    gesture();
    app.settings.announcer = app.settings.announcer === 'classic' ? 'dragon' : 'classic';
    app.saveSettings();
    applyAnn();
    KK.voice.announce(KK.keysound.comboKey(app.build), 1); // a sample of the new voice
  });
  applyAnn();

  /* ---------------------------------- input ---------------------------------- */
  const allViews = () => views.concat(KK.builder.kb || [], KK.kbs.view || []);
  const pressAll = (code) => allViews().forEach((v) => v.press(code));
  const releaseAll = (code) => allViews().forEach((v) => v.release(code));

  document.addEventListener('keydown', (e) => {
    // the phone box's own key events: its input event does the typing (below); Esc
    // (a tablet's keyboard) still pauses
    if (e.target === mobBox && e.key !== 'Escape') return;
    gesture();
    if (!e.repeat) {
      KK.keysound.down(e.code);
      pressAll(e.code);
    }
    if (KK.online.key(e)) return e.preventDefault(); // a challenge on screen comes first
    if (ui.isOpen()) {
      if (ui.key(e)) e.preventDefault();
      return;
    }
    if (PLAY_SCREENS[app.screen]) {
      if (e.repeat && e.key !== 'Backspace') return e.preventDefault();
      if (KK.game.key(e)) e.preventDefault();
      return;
    }
    const inField = e.target.matches && e.target.matches('input, select, textarea');
    if (inField) return;
    if (e.code === 'Space' || e.code === 'Backspace' || e.key === "'" || e.key === '/') e.preventDefault();
  });

  document.addEventListener('keyup', (e) => {
    if (e.target === mobBox) return;
    KK.anticheat.up(e);
    KK.keysound.up(e.code);
    releaseAll(e.code);
  });

  window.addEventListener('blur', () => {
    document.querySelectorAll('.k.on').forEach((k) => k.classList.remove('on'));
    if (KK.game.isRunning()) KK.game.pause();
  });

  /* ------------------------------- phone typing ------------------------------- */
  // Phones send no usable key presses: while a game is on, a hidden text box holds the
  // on-screen keyboard open, and whatever lands in it is compared with what was there
  // before: new letters are typed, deleted ones are backspaces, a space clears the word.
  // (Comparing copes with keyboards that compose or autocorrect whole words.)
  app.touch = matchMedia('(pointer: coarse)').matches;
  document.body.classList.toggle('touch', app.touch);
  const mobBox = $('#mobileType'), typeBtn = $('#typeBtn'), padPause = $('#padPause');
  let mobLast = '', composing = false;
  const mobReset = () => {
    mobBox.value = '';
    mobLast = '';
  };
  const typingOn = () => app.touch && PLAY_SCREENS[app.screen];
  app.typing = {
    show() {
      if (!typingOn()) return;
      mobReset();
      mobBox.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      app.typing.update();
    },
    hide() {
      if (document.activeElement === mobBox) mobBox.blur();
    },
    // "tap here to type" while the keyboard is down; pause while playing
    update() {
      const on = typingOn() && !ui.isOpen() && !KK.online.chOpen();
      typeBtn.hidden = !on || document.activeElement === mobBox;
      padPause.hidden = !on;
    },
  };
  // the box's text since the last reset vs. before: deletions → backspaces, new text → keys
  mobBox.addEventListener('input', (e) => {
    const now = mobBox.value;
    let same = 0;
    while (same < mobLast.length && same < now.length && mobLast[same] === now[same]) same++;
    const back = mobLast.length - same, added = now.slice(same);
    mobLast = now;
    if (!typingOn()) return mobReset();
    KK.anticheat.input(e, added.replace(/\s/g, '').length);
    for (let i = 0; i < back; i++) phoneKey('Backspace');
    for (const ch of added) phoneKey(/\s/.test(ch) ? ' ' : ch);
    tidy();
  });
  mobBox.addEventListener('compositionstart', () => (composing = true));
  mobBox.addEventListener('compositionend', () => {
    composing = false;
    tidy();
  });
  // start the box afresh once the game's word is empty (cleared or typed), never mid-word
  function tidy() {
    if (!composing && !KK.game.buffer()) mobReset();
  }
  // one key: sound, the keyboard on screen lights up, then the game
  function phoneKey(key) {
    const code = key === 'Backspace' ? 'Backspace' : key === ' ' ? 'Space' : CODE_OF(key.toLowerCase());
    if (code) {
      KK.keysound.down(code);
      pressAll(code);
      setTimeout(() => {
        KK.keysound.up(code);
        releaseAll(code);
      }, 70);
    }
    KK.game.typed(key, code);
  }
  mobBox.addEventListener('focus', () => app.typing.update());
  mobBox.addEventListener('blur', () => app.typing.update());
  typeBtn.addEventListener('click', () => app.typing.show());
  padPause.addEventListener('click', () => {
    padPause.blur();
    if (KK.game.isRunning()) KK.game.pause(true);
  });
  // tapping the play area brings the keyboard back too
  ['#scr-game', '#scr-vs'].forEach((s) => $(s).addEventListener('click', () => !ui.isOpen() && app.typing.show()));

  /* ----------------------------------- nav ----------------------------------- */
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => {
      b.blur();
      KK.sfx.ui();
      app.show(b.dataset.go);
    })
  );
  $('#logo').addEventListener('click', (e) => {
    e.preventDefault();
    if (KK.game.isRunning()) return KK.game.pause();
    app.show('home');
  });
  // your profile: build a new keyboard, full keyboards, continue last build
  const HOME_BTN = {
    build: () => {
      app.profileId = null; // a fresh build isn't tied to a saved profile until saved
      persistProfiles();
      KK.builder.open(0);
    },
    kbs: () => KK.kbs.open(),
    quick: () => KK.builder.open(4),
  };
  $('#dashActions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-home]');
    if (!b) return;
    b.blur();
    HOME_BTN[b.dataset.home]();
  });
  // single player / vs AI: you play your main keyboard (its summary opens, ready to
  // start); with no saved keyboards yet, whatever's in the builder
  const playMain = (mode) => {
    KK.builder.mode = mode;
    const id = app.mainBuildId();
    if (id) app.loadProfile(id);
    else KK.builder.open(4);
  };
  $('#btnSolo').addEventListener('click', () => playMain('solo'));
  $('#btnVs').addEventListener('click', () => playMain('vs'));
  $('#btnPvp').addEventListener('click', () => KK.online.openLobby());
  $('#btnGuide').addEventListener('click', () => {
    $('#btnGuide').blur();
    KK.sfx.ui();
    powerGuide(null);
  });

  /* ----------------------------------- boot ----------------------------------- */
  clearUser();
  KK.builder.init();
  KK.kbs.init();
  app.show('title');
  // shown on the sign-in page and on home
  KK.online.watchCount((n) => ($('#homeCount').textContent = $('#feedCount').textContent = `${n.toLocaleString()} ${n === 1 ? 'player has' : 'players have'} signed up`));
  // who's online can only be read signed in (database rules), so it shows after log in
  KK.online.watchOnline((n) => ($('#homeOnline').innerHTML = $('#feedOnline').innerHTML = n == null ? '' : `<i class="pl-dot"></i>${n.toLocaleString()} online now`));
  // the session comes back from the online layer (Firebase or this browser)
  KK.net.ready.then((who) => {
    app.netReady = true;
    $('#authHint').textContent = KK.net.online() ? 'one account works on every device' : 'accounts are saved only in this browser for now';
    if (who && !app.user) {
      setUser(who.name);
      KK.online.start();
      KK.social.start();
      KK.feed.start();
      KK.notify.start();
    }
    if (app.screen === 'title') {
      // a refresh comes back to the screen you were on
      const st = history.state;
      if (app.user && st && st.screen && !st.out) revisit(st);
      else app.show(app.user ? 'home' : 'title');
    }
  });
})();
