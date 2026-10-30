(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Profiles, profile pictures and friends.
   *
   *   names/{username}         uid — lets you find a player by username
   *   avatars/{uid}            the picture as a small JPEG data URL (~10–20 KB; cropped
   *                            to a circle-ready 192 px square in the browser)
   *   profiles/{uid}           { nickname, city, country } — optional, seen by players
   *   private/{uid}            { email } — optional, only you can read it
   *   friendReqs/{to}/{from}   { name, display, at } — a pending friend request
   *   sentReqs/{from}/{to}     { name, at } — your copy of the requests you've sent, so
   *                            you can see them; dropped once theirs is answered
   *   friends/{uid}/{other}    since — both sides are written when a request is accepted
   */
  const S = (KK.social = {});
  let me = null, offs = [], friends = {}, reqs = {}, sent = {}, reqTab = 'in';
  const sentWatch = {}; // uid → stop watching whether that request is still pending
  const info = {}; // uid → { name, display, nickname, city, country }

  /* ------------------------------ profile pictures ------------------------------ */
  // no picture yet: the keyboard logo in a circle
  S.DEFAULT_AV = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#223352"/>' +
    '<g transform="translate(12 12) scale(1.25)"><rect x="2" y="7" width="28" height="18" rx="4" fill="none" stroke="#e2b714" stroke-width="2"/>' +
    '<g fill="#e2b714"><rect x="6.5" y="11.5" width="3" height="3" rx=".8"/><rect x="11.5" y="11.5" width="3" height="3" rx=".8"/><rect x="16.5" y="11.5" width="3" height="3" rx=".8"/><rect x="21.5" y="11.5" width="3" height="3" rx=".8"/><rect x="9" y="18" width="14" height="3" rx=".8"/></g></g></svg>'
  );
  const avs = {}; // uid → data URL (or DEFAULT_AV), filled as they load
  const loading = {};

  // watched live, so a new picture shows everywhere as soon as it's saved
  function loadAvatar(uid) {
    if (!uid || loading[uid]) return;
    loading[uid] = true;
    N.ready.then(() => N.ref('avatars/' + uid).on((v) => setAvatar(uid, v)));
  }
  // only a real base64 photo is shown — anything else (it's other players' data) falls
  // back to the logo, so a crafted value can't break out of the <img>
  const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
  function setAvatar(uid, url) {
    avs[uid] = typeof url === 'string' && url.length < 300000 && PHOTO.test(url) ? url : S.DEFAULT_AV;
    document.querySelectorAll(`img[data-av="${CSS.escape(uid)}"]`).forEach((im) => (im.src = avs[uid]));
  }
  S.avatarSrc = (uid) => {
    loadAvatar(uid);
    return avs[uid] || S.DEFAULT_AV;
  };
  // <img> that fills in when the picture arrives
  S.avatarImg = (uid, cls) => `<img class="av ${cls || ''}" data-av="${esc(uid || '')}" src="${esc(S.avatarSrc(uid))}" alt="">`;
  // point an existing <img> at someone's picture
  S.setImg = (el, uid) => {
    if (!el) return;
    el.dataset.av = uid || '';
    el.src = S.avatarSrc(uid);
  };

  /* ---------------------------------- start ---------------------------------- */
  S.start = function () {
    S.stop();
    me = N.me;
    if (!me) return;
    // older accounts: make sure your username can be looked up and your name shown
    N.ref('names/' + me.name).once().then((v) => v || N.ref('names/' + me.name).set(me.uid));
    N.ref('users/' + me.uid).update({ name: me.name, display: me.display });
    loadAvatar(me.uid);
    offs.push(N.ref('avatars/' + me.uid).on((v) => {
      renderNav();
      $('#avRemove').hidden = !v;
    }));
    offs.push(N.ref('friends/' + me.uid).on((v) => {
      friends = v || {};
      Object.keys(friends).forEach(loadInfo);
      renderFriends();
      changed();
      KK.feed.sync(); // the feed follows your friends' posts
    }));
    offs.push(N.ref('friendReqs/' + me.uid).on((v) => {
      reqs = v || {};
      Object.keys(reqs).forEach(loadAvatar);
      renderFriends();
      const n = Object.keys(reqs).length;
      $('#friendsBadge').hidden = !n;
      $('#friendsBadge').textContent = n || '';
      changed();
    }));
    offs.push(N.ref('sentReqs/' + me.uid).on((v) => {
      sent = v || {};
      watchSent();
      renderFriends();
      changed();
    }));
    KK.online.onPresence(renderFriends);
    renderNav();
  };

  S.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    sent = {};
    watchSent();
    justSent.clear();
    me = null;
    friends = {};
    reqs = {};
    $('#friendsBadge').hidden = true;
    renderNav();
  };

  function renderNav() {
    const el = $('#navUser');
    el.innerHTML = me ? `${S.avatarImg(me.uid, 'xs')}<span>${esc(me.display)}</span>` : '';
    el.hidden = !me;
  }
  $('#navUser').addEventListener('click', () => {
    $('#navUser').blur();
    if (me) KK.app.show('title'); // your profile page
  });

  S.friendIds = () => Object.keys(friends);
  // a name we already know: a friend, someone you've sent a request to, or anyone online
  S.nameOf = (uid) => {
    const f = info[uid], p = KK.online.players()[uid];
    return (f && (f.display || f.name)) || (p && p.display) || '';
  };

  // a friend's name and optional profile, kept up to date
  function loadInfo(uid) {
    if (info[uid]) return;
    info[uid] = {};
    loadAvatar(uid);
    ['users/', 'profiles/'].forEach((p) => N.ref(p + uid).on((v) => {
      Object.assign(info[uid], v || {});
      renderFriends();
    }));
  }

  /* ---------------------------------- profile ---------------------------------- */
  S.renderProfile = async function () {
    if (!me) return;
    S.setImg($('#profileAv'), me.uid);
    $('#profileName').innerHTML = `<b>${esc(me.display)}</b><span>@${esc(me.name)}</span>`;
    $('#pfMsg').textContent = '';
    const [p, priv] = await Promise.all([N.ref('profiles/' + me.uid).once(), N.ref('private/' + me.uid).once()]);
    $('#pfNick').value = (p && p.nickname) || '';
    $('#pfCity').value = (p && p.city) || '';
    $('#pfCountry').value = (p && p.country) || '';
    $('#pfEmail').value = (priv && priv.email) || '';
  };

  $('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!me) return;
    const v = (id, n) => $(id).value.trim().slice(0, n);
    const email = v('#pfEmail', 80);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('#pfMsg').textContent = "that email doesn't look right";
      return;
    }
    await Promise.all([
      N.ref('profiles/' + me.uid).set({ nickname: v('#pfNick', 30), city: v('#pfCity', 40), country: v('#pfCountry', 40) }),
      N.ref('private/' + me.uid).set(email ? { email } : null),
    ]);
    KK.sfx.select();
    $('#pfMsg').textContent = 'saved ✓';
  });

  /* ------------------------- picture: crop like Facebook ------------------------- */
  const cv = $('#avCanvas'), cx = cv.getContext('2d'), SIZE = cv.width, OUT = 192;
  let img = null, base = 1, zoom = 1, ox = 0, oy = 0;

  $('#avEdit').addEventListener('click', () => $('#avFile').click());
  $('#avRemove').addEventListener('click', async () => {
    if (!me) return;
    await N.ref('avatars/' + me.uid).remove();
    KK.sfx.ui();
  });
  $('#avFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f || !/^image\//.test(f.type)) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      img = im;
      base = Math.max(SIZE / im.width, SIZE / im.height); // cover the circle
      zoom = 1;
      $('#avZoom').value = 1;
      ox = (SIZE - im.width * base) / 2;
      oy = (SIZE - im.height * base) / 2;
      draw();
      $('#avOverlay').hidden = false;
      URL.revokeObjectURL(url);
    };
    im.src = url;
  });

  // keep the picture covering the whole circle
  function clamp() {
    const w = img.width * base * zoom, h = img.height * base * zoom;
    ox = U.clamp(ox, SIZE - w, 0);
    oy = U.clamp(oy, SIZE - h, 0);
  }
  function draw() {
    clamp();
    cx.clearRect(0, 0, SIZE, SIZE);
    cx.drawImage(img, ox, oy, img.width * base * zoom, img.height * base * zoom);
  }
  $('#avZoom').addEventListener('input', (e) => {
    const z = +e.target.value, k = z / zoom, c = SIZE / 2;
    ox = c - (c - ox) * k; // zoom around the centre
    oy = c - (c - oy) * k;
    zoom = z;
    draw();
  });
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, ox, oy };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ox = drag.ox + e.clientX - drag.x;
    oy = drag.oy + e.clientY - drag.y;
    draw();
  });
  cv.addEventListener('pointerup', () => (drag = null));
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = U.clamp(zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 1, 3);
    $('#avZoom').value = z;
    $('#avZoom').dispatchEvent(new Event('input'));
  }, { passive: false });

  $('#avCancel').addEventListener('click', () => ($('#avOverlay').hidden = true));
  $('#avSave').addEventListener('click', async () => {
    if (!me || !img) return;
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    const k = OUT / SIZE;
    out.getContext('2d').drawImage(img, ox * k, oy * k, img.width * base * zoom * k, img.height * base * zoom * k);
    const url = out.toDataURL('image/jpeg', 0.85);
    $('#avOverlay').hidden = true;
    setAvatar(me.uid, url);
    renderNav();
    await N.ref('avatars/' + me.uid).set(url);
    KK.sfx.select();
  });

  /* ---------------------------------- friends ---------------------------------- */
  const msg = (t) => ($('#addFriendMsg').textContent = t);

  $('#addFriend').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!me) return;
    const name = N.normalize($('#addFriendName').value);
    if (!name) return;
    if (name === me.name) return msg("that's you");
    msg('looking…');
    try {
      const uid = await findUid(name);
      if (!uid) return msg(`no player called “${name}”`);
      if (e.submitter && e.submitter.dataset.view) {
        $('#addFriendName').value = '';
        msg('');
        return KK.app.showUser(uid, 'friends'); // just look
      }
      if (friends[uid]) return msg(`${name} is already your friend`);
      if (S.relation(uid) === 'sent') return msg(`you've already sent ${name} a request`);
      $('#addFriendName').value = '';
      if (reqs[uid]) return S.accept(uid); // they asked you first
      await S.sendRequest(uid, name);
      reqTab = 'out';
      msg(`friend request sent to ${name}`);
    } catch (err) {
      console.warn('kkph friends', err);
      msg("couldn't send the request — try again in a minute.");
    }
  });

  // username → uid: the names index, or (for players who haven't logged in since it
  // existed) a look through the user list
  async function findUid(name) {
    const uid = await N.ref('names/' + name).once().catch(() => null);
    if (uid) return uid;
    const all = (await N.ref('users').once()) || {};
    return Object.keys(all).find((k) => all[k] && N.normalize(all[k].name) === name) || null;
  }

  // you → them: their copy (they answer it) and yours (your "requests sent")
  const justSent = new Set(); // sent this session, in case your copy can't be saved
  S.sendRequest = async function (uid, name) {
    await N.ref(`friendReqs/${uid}/${me.uid}`).set({ name: me.name, display: me.display, at: N.now() });
    justSent.add(uid);
    let off = null;
    off = N.ref(`friendReqs/${uid}/${me.uid}`).on((v) => {
      if (v != null || !justSent.has(uid)) return;
      justSent.delete(uid); // answered (or cancelled)
      if (off) off();
      changed();
    });
    N.ref(`sentReqs/${me.uid}/${uid}`).set({ name: String(name || '').slice(0, 30), at: N.now() }).catch((err) => console.warn('kkph friends', err));
    KK.sfx.select();
    changed();
  };

  // you and them: 'me' | 'friend' | 'sent' (waiting on them) | 'received' (waiting on you) | 'none'
  S.relation = function (uid) {
    if (!me) return 'none';
    if (uid === me.uid) return 'me';
    if (friends[uid]) return 'friend';
    if (reqs[uid]) return 'received';
    if (sent[uid] || justSent.has(uid)) return 'sent';
    return 'none';
  };

  // a player's page shows your friendship with them; keep it current
  function changed() {
    if (KK.app.screen === 'user') KK.app.renderUserRel();
  }

  S.accept = async function (uid) {
    try {
      await N.ref('').update({ [`friends/${me.uid}/${uid}`]: N.now(), [`friends/${uid}/${me.uid}`]: N.now(), [`friendReqs/${me.uid}/${uid}`]: null });
      KK.sfx.select();
      msg('');
    } catch (err) {
      console.warn('kkph friends', err);
      msg("couldn't accept the request — try again in a minute.");
    }
  };
  S.decline = (uid) => N.ref(`friendReqs/${me.uid}/${uid}`).remove();
  S.cancel = (uid) => {
    justSent.delete(uid);
    return N.ref('').update({ [`friendReqs/${uid}/${me.uid}`]: null, [`sentReqs/${me.uid}/${uid}`]: null });
  };

  // a sent request stays listed while it's pending: once they accept or decline (their
  // copy is gone), drop yours
  function watchSent() {
    Object.keys(sentWatch).forEach((uid) => {
      if (sent[uid] && me) return;
      sentWatch[uid]();
      delete sentWatch[uid];
    });
    if (!me) return;
    const mine = me.uid;
    Object.keys(sent).forEach((uid) => {
      if (sentWatch[uid]) return;
      loadInfo(uid);
      sentWatch[uid] = N.ref(`friendReqs/${uid}/${mine}`).on((v) => {
        if (v == null && me && me.uid === mine) N.ref(`sentReqs/${mine}/${uid}`).remove().catch(() => {});
      });
    });
  }
  S.unfriend = (uid) => N.ref('').update({ [`friends/${me.uid}/${uid}`]: null, [`friends/${uid}/${me.uid}`]: null });

  // online / in a match / offline, from the presence list
  const stateOf = (uid) => {
    const p = KK.online.players()[uid];
    return !KK.online.isOnline(p) ? 'offline' : p.state === 'match' ? 'in a match' : 'online';
  };

  function renderFriends() {
    if (!me || KK.app.screen !== 'friends') return;
    const ids = Object.keys(friends);
    const online = ids.filter((id) => stateOf(id) !== 'offline');
    $('#friendsCount').textContent = ids.length ? `${ids.length} · ${online.length} online` : '';
    // requests: received (to answer) and sent (still waiting on them)
    const nIn = Object.keys(reqs).length, nOut = Object.keys(sent).length;
    const tab = (t, label, n) => `<button class="chip${reqTab === t ? ' on' : ''}" data-rt="${t}">${label}${n ? `<b>${n}</b>` : ''}</button>`;
    $('#reqTabs').innerHTML = tab('in', 'requests received', nIn) + tab('out', 'requests sent', nOut);
    $('#friendReqs').innerHTML = reqTab === 'in'
      ? Object.entries(reqs)
          .map(([uid, r]) => `<div class="fr-card req link" data-user="${esc(uid)}" title="view profile">${S.avatarImg(uid, 'sm')}
            <div class="fr-text"><b>${esc(r.display || r.name)}</b><span>wants to be friends</span></div>
            <button class="btn primary sm" data-fr="accept" data-uid="${esc(uid)}">accept</button>
            <button class="btn ghost sm" data-fr="decline" data-uid="${esc(uid)}">decline</button></div>`)
          .join('') || '<p class="hint">no requests waiting for you.</p>'
      : Object.entries(sent)
          .map(([uid, r]) => `<div class="fr-card sent link" data-user="${esc(uid)}" title="view profile">${S.avatarImg(uid, 'sm')}
            <div class="fr-text"><b>${esc((info[uid] || {}).display || (r && r.name) || '…')}</b><span>request sent · waiting for them</span></div>
            <button class="btn ghost sm" data-fr="cancel" data-uid="${esc(uid)}">cancel</button></div>`)
          .join('') || "<p class=\"hint\">no pending requests — the ones you send show here until they're answered.</p>";
    // online first, then by name
    ids.sort((a, b) => (stateOf(a) === 'offline') - (stateOf(b) === 'offline') || String((info[a] || {}).display).localeCompare((info[b] || {}).display));
    $('#friendList').innerHTML = ids.length
      ? ids.map((uid) => {
          const p = KK.online.players()[uid] || {};
          const f = Object.assign({ display: p.display, name: p.name }, info[uid]), st = stateOf(uid);
          if (!f.display) f.display = p.display || f.name;
          const where = [f.city, f.country].filter(Boolean).join(', ');
          const sub = [f.nickname && `“${f.nickname}”`, where, st].filter(Boolean).join(' · ');
          return `<div class="fr-card link" data-user="${esc(uid)}" title="view profile"><span class="av-wrap">${S.avatarImg(uid, 'sm')}<i class="pl-dot ${st === 'online' ? '' : st === 'offline' ? 'off' : 'busy'}"></i></span>
            <div class="fr-text"><b>${esc(f.display || f.name || '…')}</b><span>${esc(sub)}</span></div>
            ${st === 'online' ? `<button class="btn primary sm" data-fr="challenge" data-uid="${esc(uid)}">challenge</button>` : ''}
            <button class="picon" data-fr="remove" data-uid="${esc(uid)}" title="remove friend">✕</button></div>`;
        }).join('')
      : '<p class="hint">no friends yet — add someone by their username.</p>';
  }
  S.renderFriends = renderFriends;

  document.querySelector('#scr-friends').addEventListener('click', (e) => {
    const t = e.target.closest('[data-rt]');
    if (t) {
      t.blur();
      KK.sfx.ui();
      reqTab = t.dataset.rt;
      return renderFriends();
    }
    const b = e.target.closest('[data-fr]');
    const card = e.target.closest('[data-user]');
    if (!b && card) return KK.app.showUser(card.dataset.user); // their page
    if (!b || !me) return;
    b.blur();
    KK.sfx.ui();
    const uid = b.dataset.uid, act = b.dataset.fr;
    if (act === 'accept') S.accept(uid);
    else if (act === 'decline') S.decline(uid);
    else if (act === 'cancel') S.cancel(uid).catch((err) => console.warn('kkph friends', err));
    else if (act === 'challenge') KK.online.challenge(uid, (info[uid] || {}).display || 'friend');
    else if (act === 'remove') {
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'remove?';
        b.classList.add('armed');
        setTimeout(() => b.isConnected && (delete b.dataset.armed, (b.textContent = '✕'), b.classList.remove('armed')), 2500);
      } else S.unfriend(uid);
    }
  });
})();
