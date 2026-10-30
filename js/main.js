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
    $('#btnQuick').hidden = false;
  };
  app.saveSettings = () => KK.store.set('settings', app.settings);
  app.saveProgress = () => KK.store.uset('progress', app.progress);
  app.userName = () => (app.user ? KK.auth.displayName(app.user) : 'you');

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
  const persistProfiles = () => {
    KK.store.uset('profiles', app.profiles);
    KK.store.uset('profileId', app.profileId);
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
    if (!p || asNew) {
      p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: Date.now(), best: 0 };
      app.profiles.unshift(p);
    }
    p.name = (String(name || '').trim() || app.suggestName()).slice(0, 40);
    p.build = clone(app.build);
    p.updated = Date.now();
    app.profileId = p.id;
    persistProfiles();
    renderProfiles();
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
            <span class="ptext"><span class="pname">${esc(p.name)}</span><span class="pmeta">${esc(sw.name)} · ${C.CASES[b.case].name} · ${C.LAYOUTS[b.layout].name}${p.best ? ' · best ' + p.best.toLocaleString() : ''}</span></span>
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
  ui.open = function (html, acts) {
    clearTimeout(cdTimer);
    actions = acts || {};
    $('#ovCard').innerHTML = html;
    $('#overlay').hidden = false;
  };
  ui.close = function () {
    clearTimeout(cdTimer);
    $('#overlay').hidden = true;
    $('#ovCard').innerHTML = '';
    actions = null;
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
  ui.countdown = function (cb, msg) {
    ui.open('', {});
    let n = 3;
    const step = () => {
      if (n > 0) {
        $('#ovCard').innerHTML = `<div class="count-big">${n}</div><div class="ov-sub">${esc(msg || '')}<br><span class="kbd">space</span> clears · <span class="kbd">esc</span> pauses · type glowing words for power-ups</div>`;
        KK.sfx.count(n--);
        cdTimer = setTimeout(step, 650);
      } else {
        $('#ovCard').innerHTML = '<div class="count-big">go</div>';
        KK.sfx.count(0);
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
  const PLAY_SCREENS = { game: 1, vs: 1 };

  app.show = function (name) {
    if (!app.user) name = 'title'; // everything past the home page needs an account
    if (PLAY_SCREENS[app.screen] && name !== app.screen && KK.game.isRunning()) KK.game.quit();
    // the keyboards screen previews other boards' sound; leaving it restores yours
    if (app.screen === 'kbs' && name !== 'kbs') KK.keysound.setBuild(app.build);
    app.screen = name;
    document.body.dataset.screen = name;
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'scr-' + name));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    if (name === 'title') renderHome();
    if (name === 'game') {
      app.gameKb.update(app.build);
      renderGameBuild($('#gameBuild'));
    }
    if (name === 'vs') {
      app.vsKb.update(app.build);
      renderGameBuild($('#vsBuild'));
    }
    requestAnimationFrame(() => views.concat(KK.builder.kb || []).forEach((v) => v.fit()));
  };

  // compact spec sheet shown beside the keyboard while playing
  function renderGameBuild(target) {
    const b = app.build;
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap], cs = C.CASES[b.case];
    const prof = app.currentProfile();
    const name = prof && !app.isDirty() ? prof.name : 'current build';
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
  app.startGame = function (level, mode) {
    gesture();
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
  app.startVs = function (diff) {
    gesture();
    ui.close();
    diff = { easy: 1, medium: 1, hard: 1 }[diff] ? diff : 'medium';
    app.settings.vsDiff = diff;
    app.saveSettings();
    app.show('vs');
    KK.music.setMode('game', { easy: 3, medium: 4, hard: 5 }[diff]);
    KK.music.duck(false);
    KK.game.startVs(diff, app.settings.lang);
  };

  app.flashKey = (code, cls) => (app.screen === 'vs' ? app.vsKb : app.gameKb).flash(code, cls);

  /* ----------------------------------- home ----------------------------------- */
  let authMode = 'login';
  function renderHome() {
    const inn = !!app.user;
    $('#authForm').hidden = inn;
    $('#homeIn').hidden = !inn;
    document.body.classList.toggle('signed-out', !inn);
    $('#navUser').innerHTML = inn ? `<span>@${esc(app.userName())}</span><button class="foot-btn" id="logoutBtn">log out</button>` : '';
    if (inn) {
      const vs = app.progress.vs || {};
      const rec = ['easy', 'medium', 'hard'].filter((d) => vs[d]).map((d) => `${d} ${vs[d].w}–${vs[d].l}`).join(' · ');
      $('#homeHi').innerHTML = `welcome, <b>${esc(app.userName())}</b>${app.progress.bestTotal ? ` · best total ${app.progress.bestTotal.toLocaleString()}` : ''}${rec ? ` · vs ai ${rec}` : ''}`;
      $('#btnQuick').hidden = !app.hasSaved;
      renderProfiles();
    } else {
      setTimeout(() => $('#authUser').focus(), 50);
    }
  }

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
      const user = authMode === 'signup' ? await KK.auth.signup(name, pass) : await KK.auth.login(name, pass);
      const imported = authMode === 'signup' && claimLegacyData(user);
      setUser(user);
      $('#authPass').value = $('#authPass2').value = '';
      KK.sfx.select();
      app.show('title');
      if (imported) $('#homeHi').innerHTML += ' · imported your existing builds';
    } catch (ex) {
      err.textContent = ex.message;
      KK.sfx.error();
    }
  });

  $('#navUser').addEventListener('click', (e) => {
    if (e.target.id !== 'logoutBtn') return;
    if (KK.game.isRunning()) KK.game.quit();
    KK.auth.logout();
    clearUser();
    setAuthMode('login');
    app.show('title');
  });

  /* ---------------------------------- audio ---------------------------------- */
  function gesture() {
    A.init();
    if (A.ready && !KK.music.playing && app.settings.music > 0) KK.music.start();
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

  /* ---------------------------------- input ---------------------------------- */
  const allViews = () => views.concat(KK.builder.kb || [], KK.kbs.view || []);
  const pressAll = (code) => allViews().forEach((v) => v.press(code));
  const releaseAll = (code) => allViews().forEach((v) => v.release(code));

  document.addEventListener('keydown', (e) => {
    gesture();
    if (!e.repeat) {
      KK.keysound.down(e.code);
      pressAll(e.code);
    }
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
    if (app.screen === 'title' && app.user && e.key === 'Enter') KK.builder.open(0);
  });

  document.addEventListener('keyup', (e) => {
    KK.keysound.up(e.code);
    releaseAll(e.code);
  });

  window.addEventListener('blur', () => {
    document.querySelectorAll('.k.on').forEach((k) => k.classList.remove('on'));
    if (KK.game.isRunning()) KK.game.pause();
  });

  /* ----------------------------------- nav ----------------------------------- */
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => {
      b.blur();
      KK.sfx.ui();
      if (b.dataset.go === 'build') KK.builder.open(0);
      else if (b.dataset.go === 'kbs') KK.kbs.open();
      else KK.builder.open(4);
    })
  );
  $('#logo').addEventListener('click', (e) => {
    e.preventDefault();
    if (KK.game.isRunning()) return KK.game.pause();
    app.show('title');
  });
  $('#btnBuild').addEventListener('click', () => {
    app.profileId = null; // a fresh build isn't tied to a saved profile until saved
    persistProfiles();
    KK.builder.open(0);
  });
  $('#btnQuick').addEventListener('click', () => KK.builder.open(4));
  $('#btnKbs').addEventListener('click', () => KK.kbs.open());
  $('#btnSolo').addEventListener('click', () => {
    KK.builder.mode = 'solo';
    KK.builder.open(4);
  });
  $('#btnVs').addEventListener('click', () => {
    KK.builder.mode = 'vs';
    KK.builder.open(4);
  });

  /* ----------------------------------- boot ----------------------------------- */
  const session = KK.auth.current();
  if (session && (KK.store.get('users', {}) || {})[session]) setUser(session);
  else clearUser();
  KK.builder.init();
  KK.kbs.init();
  app.show('title');
})();
