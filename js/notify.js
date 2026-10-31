(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * The bell: someone reacted to or replied to your post, hearted your keyboard,
   * challenged you or sent you a friend request.
   *
   *   notifs/{uid}/{id}   { t, from, at, post?, kind?, text?, pid?, name? } — written by
   *                       whoever did it (the rules check `from` is them); yours to clear
   *   notifSeen/{uid}     when you last opened the bell; anything newer is unread
   */
  const NT = (KK.notify = {});
  let me = null, offs = [], items = {}, seen = 0, shownSeen = 0;
  const KEEP = 50; // older ones are cleared when you open the bell
  const menu = $('#bellMenu');

  // someone else's bell; a fixed id lets it be taken back (an un-react, an un-heart)
  NT.send = function (to, data, id) {
    if (!me || !to || to === me.uid) return;
    const nid = id || N.now().toString(36) + Math.random().toString(36).slice(2, 6);
    N.ref(`notifs/${to}/${nid}`).set(Object.assign({ from: me.uid, at: N.now() }, data)).catch((e) => console.warn('kkph notify', e));
  };
  NT.unsend = (to, id) => {
    if (me && to && to !== me.uid) N.ref(`notifs/${to}/${id}`).remove().catch(() => {});
  };

  NT.start = function () {
    NT.stop();
    me = N.me;
    if (!me) return;
    offs.push(N.ref('notifs/' + me.uid).on((v) => {
      items = v || {};
      render();
    }));
    offs.push(N.ref('notifSeen/' + me.uid).on((v) => {
      seen = +v || 0;
      render();
    }));
    $('#bellWrap').hidden = false;
  };
  NT.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    items = {};
    seen = 0;
    me = null;
    NT.close();
    $('#bellWrap').hidden = true;
  };

  const list = () => Object.entries(items)
    .filter(([, n]) => n && typeof n === 'object' && typeof n.from === 'string')
    .map(([id, n]) => Object.assign({ id }, n))
    .sort((a, b) => (+b.at || 0) - (+a.at || 0));

  const REACT = { heart: '♥', laugh: '😂', fire: '🔥', cream: '🍦' };
  // what they did (everything from the database is escaped)
  function what(n) {
    switch (n.t) {
      case 'react': return `reacted ${REACT[n.kind] || '♥'} to your post`;
      case 'reply': return `replied to your post: “${esc(String(n.text || '').slice(0, 80))}”`;
      case 'heart': return `hearted your keyboard${n.name ? ` <b>${esc(String(n.name).slice(0, 60))}</b>` : ''}`;
      case 'challenge': return 'challenged you to a match';
      case 'friend': return 'sent you a friend request';
      default: return 'did something';
    }
  }

  function render() {
    const all = list(), unread = all.filter((n) => +n.at > seen).length;
    const badge = $('#bellBadge');
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? '9+' : unread || '';
    if (menu.hidden) return;
    menu.innerHTML = `<div class="bell-h"><b>notifications</b>${all.length ? '<button class="link-btn" data-nt="clear">clear all</button>' : ''}</div>
      ${all.length
        ? all.slice(0, 30).map((n) => `<button class="nt${+n.at > shownSeen ? ' new' : ''}" data-nt="go" data-t="${esc(n.t)}" data-from="${esc(n.from)}">
            ${KK.social.avatarImg(n.from, 'sm')}<span class="nt-text">${KK.feed.nameHtml(n.from)} ${what(n)}<i>${KK.feed.ago(n.at)}</i></span></button>`).join('')
        : '<p class="hint">nothing yet. Reactions, replies, hearts and challenges show up here.</p>'}`;
  }

  NT.close = function () {
    menu.hidden = true;
    $('#bellBtn').classList.remove('on');
  };
  $('#bellBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#bellBtn').blur();
    if (!me) return;
    if (!menu.hidden) return NT.close();
    KK.sfx.ui();
    KK.social.closeMenu();
    shownSeen = seen; // the ones newer than your last look stay marked as new this time
    menu.hidden = false;
    $('#bellBtn').classList.add('on');
    render();
    N.ref('notifSeen/' + me.uid).set(N.now()).catch(() => {});
    // keep the newest KEEP
    const old = list().slice(KEEP);
    if (old.length) N.ref('').update(Object.fromEntries(old.map((n) => [`notifs/${me.uid}/${n.id}`, null]))).catch(() => {});
  });
  document.addEventListener('click', (e) => !menu.hidden && !e.target.closest('.bell-wrap') && NT.close());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !menu.hidden && NT.close());

  // where each one takes you
  const GO = {
    react: () => KK.app.show('home'),
    reply: () => KK.app.show('home'),
    heart: () => KK.app.show('title'),
    challenge: () => KK.online.openLobby(),
    friend: () => KK.app.show('friends'),
  };
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nt]');
    if (!b || !me) return;
    KK.sfx.ui();
    if (b.dataset.nt === 'clear') {
      const all = list();
      NT.close();
      if (all.length) N.ref('').update(Object.fromEntries(all.map((n) => [`notifs/${me.uid}/${n.id}`, null]))).catch((err) => console.warn('kkph notify', err));
      return;
    }
    NT.close();
    (GO[b.dataset.t] || GO.react)();
  });
})();
