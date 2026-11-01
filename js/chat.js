(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const N = KK.net, esc = KK.util.esc;
  const $ = (s) => document.querySelector(s);

  /*
   * Messages between players. The envelope next to the bell lists your conversations
   * (newest first, unread marked) and each one you open gets a chat box along the
   * bottom right, side by side (newest on the right). Up to 5 fit; with more, the oldest
   * fold into one tab on the left ("liyadyoy + 3") and a click there brings one back.
   * Text and emoji only. A new message plays three quick clicky key presses.
   *
   *   chats/{a_b}/{id}     { from, text, at }   a_b: the two uids, sorted; only those two
   *                        can read it or add to it (database rules)
   *   inbox/{uid}/{other}  { at, last, from, read }   one line per conversation, written by
   *                        either of the two: the sender marks it unread for the other
   */
  const C = (KK.chat = {});
  const EMOJI = ['😀', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😭', '😡', '😮', '🥳', '😴', '🤯', '😇', '👍', '👎', '👏', '🙏', '💪', '👌', '✌️', '🤝', '🔥', '💯', '✨', '🎉', '❤️', '💔', '⌨️', '🎮', '🏆', '⭐', '🇵🇭', '🍦', '☕', '🍜', '👀', '😈'];
  const MAX = 500; // characters per message
  const SHOW = 150; // messages drawn in a conversation (the newest)
  const MOST = 5; // boxes side by side, at most
  const BOX_W = 236, GAP = 8, EDGE = 16, LEFT = 8; // px, desktop (5 fit a 1280 screen, scrollbar and all)
  let me = null, offs = [], inbox = {}, primed = false;
  let open = []; // conversations with a box (or folded into the tab), oldest first: { uid, el, off, msgs }
  const menu = $('#msgMenu'), dock = $('#chatDock');

  const chatId = (a, b) => [a, b].sort().join('_');
  const newId = () => N.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const unread = (uid, c) => !!c && c.from === uid && !c.read;
  const time = (at) => new Date(+at || 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const phone = () => matchMedia('(max-width: 700px)').matches;
  const find = (uid) => open.find((c) => c.uid === uid);

  C.start = function () {
    C.stop();
    me = N.me;
    if (!me) return;
    primed = false;
    offs.push(N.ref('inbox/' + me.uid).on((v) => {
      const prev = inbox;
      inbox = v && typeof v === 'object' ? v : {};
      Object.keys(inbox).forEach((uid) => KK.feed.nameOf(uid)); // look their names up now, ready for the list
      // someone wrote: three quick clicky key presses (not for what was waiting at sign-in)
      if (primed && Object.entries(inbox).some(([uid, c]) => c && c.from === uid && +c.at > +((prev[uid] || {}).at || 0))) ding();
      primed = true;
      shown().forEach((c) => !c.el.classList.contains('min') && unread(c.uid, inbox[c.uid]) && markRead(c.uid));
      render();
      drawTab();
    }));
    $('#msgWrap').hidden = false;
  };
  C.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    inbox = {};
    open.slice().forEach((c) => C.close(c.uid));
    C.closeMenu();
    me = null;
    $('#msgWrap').hidden = true;
  };

  function ding() {
    [0, 80, 160].forEach((t) => setTimeout(() => KK.sfx.tab(), t));
  }
  function markRead(uid) {
    if (me) N.ref(`inbox/${me.uid}/${uid}/read`).set(true).catch(() => {});
  }

  // names not looked up yet show as …; draw again once they've loaded
  let later = null;
  const waitNames = (uids) => {
    if (later || !uids.some((uid) => KK.feed.nameOf(uid) === '…')) return;
    later = setTimeout(() => {
      later = null;
      render();
      open.forEach((c) => (c.el.querySelector('.cb-who').innerHTML = whoHtml(c.uid)));
      drawTab();
    }, 600);
  };
  const whoHtml = (uid) => KK.social.avatarImg(uid, 'xs') + KK.feed.nameHtml(uid);
  const plainName = (uid) => (KK.feed.nameOf(uid) || 'player');

  /* ------------------------------ the envelope menu ------------------------------ */
  const list = () => Object.entries(inbox)
    .filter(([, c]) => c && typeof c === 'object' && typeof c.last === 'string')
    .sort((a, b) => (+b[1].at || 0) - (+a[1].at || 0));

  function render() {
    const n = list().filter(([uid, c]) => unread(uid, c)).length;
    const badge = $('#msgBadge');
    badge.hidden = !n;
    badge.textContent = n > 9 ? '9+' : n || '';
    if (menu.hidden) return;
    const all = list();
    menu.innerHTML = `<div class="bell-h"><b>messages</b></div>
      ${all.length
        ? all.slice(0, 40).map(([uid, c]) => `<button class="nt mt${unread(uid, c) ? ' new' : ''}" data-chat="${esc(uid)}">
            ${KK.social.avatarImg(uid, 'sm')}<span class="nt-text">${KK.feed.nameHtml(uid)}<span class="mt-last">${c.from === me.uid ? 'you: ' : ''}${esc(c.last)}</span><i>${KK.feed.ago(c.at)}</i></span>${unread(uid, c) ? '<em class="mt-dot" aria-label="unread"></em>' : ''}</button>`).join('')
        : '<p class="hint">no messages yet. Message a friend from the friends tab or anyone from their profile.</p>'}`;
    waitNames(all.slice(0, 40).map(([uid]) => uid));
  }
  C.closeMenu = function () {
    menu.hidden = true;
    $('#msgBtn').classList.remove('on');
  };
  $('#msgBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#msgBtn').blur();
    if (!me) return;
    if (!menu.hidden) return C.closeMenu();
    KK.sfx.ui();
    KK.notify.close();
    KK.social.closeMenu();
    menu.hidden = false;
    $('#msgBtn').classList.add('on');
    render();
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chat]');
    if (!b) return;
    C.closeMenu();
    C.open(b.dataset.chat);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('.msg-wrap')) C.closeMenu();
    if (!e.target.closest('.cb-tab')) $('#cbTabList') && ($('#cbTabList').hidden = true);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !menu.hidden && C.closeMenu());

  /* --------------------------------- the chat boxes --------------------------------- */
  // how many boxes fit side by side (phones: one, as a sheet)
  const room = () => (phone() ? 1 : Math.max(1, Math.min(MOST, Math.floor((document.documentElement.clientWidth - EDGE - LEFT + GAP) / (BOX_W + GAP)))));
  // the boxes on screen: the newest that fit; with more than fit, one slot is the tab
  function shown() {
    const fit = room();
    return open.length <= fit ? open : open.slice(-(fit - 1 || 1));
  }
  const folded = () => open.slice(0, open.length - shown().length);

  function layout() {
    const vis = shown(), onPhone = phone();
    open.forEach((c) => (c.el.hidden = !vis.includes(c)));
    // newest on the right, the rest to its left
    vis.slice().reverse().forEach((c, i) => {
      c.el.style.right = onPhone ? '' : EDGE + i * (BOX_W + GAP) + 'px';
    });
    drawTab(onPhone ? null : EDGE + vis.length * (BOX_W + GAP));
  }
  // the folded ones: "liyadyoy + 3"; a click lists them
  let tabRight = null;
  function drawTab(right) {
    if (right !== undefined) tabRight = right;
    const fold = folded();
    let tab = dock.querySelector('.cb-tab');
    if (!fold.length) return tab && tab.remove();
    if (!tab) {
      dock.insertAdjacentHTML('beforeend', '<div class="cb-tab"><button type="button" class="cb-tab-btn"></button><div class="cb-tab-list" id="cbTabList" hidden></div></div>');
      tab = dock.querySelector('.cb-tab');
    }
    tab.style.right = tabRight === null ? '' : tabRight + 'px';
    const waiting = fold.filter((c) => unread(c.uid, inbox[c.uid])).length;
    tab.querySelector('.cb-tab-btn').innerHTML = `${KK.social.avatarImg(fold[0].uid, 'xs')}<span>${esc(plainName(fold[0].uid))}${fold.length > 1 ? ` + ${fold.length - 1}` : ''}</span>${waiting ? `<i class="nav-badge">${waiting}</i>` : ''}`;
    tab.querySelector('.cb-tab-list').innerHTML = fold.map((c) => `<button type="button" data-unfold="${esc(c.uid)}">${KK.social.avatarImg(c.uid, 'xs')}<span>${esc(plainName(c.uid))}</span>${unread(c.uid, inbox[c.uid]) ? '<em class="mt-dot"></em>' : ''}<b data-shut="${esc(c.uid)}" title="close">✕</b></button>`).join('');
    waitNames(fold.map((c) => c.uid));
  }
  dock.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.cb-tab-btn');
    if (tabBtn) {
      KK.sfx.ui();
      const l = $('#cbTabList');
      l.hidden = !l.hidden;
      return;
    }
    const shut = e.target.closest('[data-shut]');
    if (shut) {
      e.stopPropagation();
      KK.sfx.ui();
      return C.close(shut.dataset.shut);
    }
    const un = e.target.closest('[data-unfold]');
    if (un) return C.open(un.dataset.unfold);
  });
  addEventListener('resize', () => open.length && layout());

  function boxHtml() {
    return `<div class="chatbox">
      <div class="cb-head"><button class="cb-who" type="button"></button><button class="picon cb-min" type="button" title="minimise" aria-label="minimise">–</button><button class="picon cb-close" type="button" title="close" aria-label="close">✕</button></div>
      <div class="cb-body"></div>
      <div class="cb-emoji" hidden>${EMOJI.map((x) => `<button type="button" data-emo="${x}">${x}</button>`).join('')}</div>
      <form class="cb-form" autocomplete="off"><button type="button" class="cb-emo-btn" title="emoji" aria-label="emoji">😊</button><input class="search cb-input" maxlength="${MAX}" placeholder="write a message…" aria-label="message"><button class="btn primary sm" type="submit">send</button></form>
    </div>`;
  }

  // open a conversation (from the list, the friends tab or their profile): a new box on
  // the right, or the one already open comes back to the right
  C.open = function (uid) {
    if (!me || !uid || uid === me.uid) return;
    KK.sfx.ui();
    let c = find(uid);
    if (c) open.splice(open.indexOf(c), 1);
    else {
      dock.insertAdjacentHTML('beforeend', boxHtml());
      const boxes = dock.querySelectorAll('.chatbox');
      c = { uid, el: boxes[boxes.length - 1], msgs: {} };
      c.el.querySelector('.cb-body').innerHTML = '<p class="hint cb-empty">…</p>';
      c.off = N.ref('chats/' + chatId(me.uid, uid)).on((v) => {
        c.msgs = v && typeof v === 'object' ? v : {};
        drawMsgs(c);
      });
      wire(c);
    }
    open.push(c);
    c.el.querySelector('.cb-who').innerHTML = whoHtml(uid);
    waitNames([uid]);
    c.el.classList.remove('min');
    c.el.querySelector('.cb-emoji').hidden = true;
    if ($('#cbTabList')) $('#cbTabList').hidden = true;
    layout();
    markRead(uid);
    c.el.querySelector('.cb-input').focus({ preventScroll: true });
  };
  C.close = function (uid) {
    const c = find(uid);
    if (!c) return;
    if (c.off) c.off();
    c.el.remove();
    open.splice(open.indexOf(c), 1);
    layout();
  };
  C.openUids = () => open.map((c) => c.uid); // (tests)

  function drawMsgs(c) {
    const body = c.el.querySelector('.cb-body');
    const all = Object.values(c.msgs)
      .filter((m) => m && typeof m.text === 'string' && typeof m.from === 'string')
      .sort((a, b) => (+a.at || 0) - (+b.at || 0))
      .slice(-SHOW);
    body.innerHTML = all.length
      ? all.map((m, i) => {
          const mine = m.from === me.uid, next = all[i + 1];
          const last = !next || next.from !== m.from || +next.at - +m.at > 5 * 60000; // time under each run
          return `<div class="cb-msg${mine ? ' me' : ''}"><span class="cb-text">${esc(m.text.slice(0, MAX))}</span>${last ? `<i>${time(m.at)}</i>` : ''}</div>`;
        }).join('')
      : '<p class="hint cb-empty">say hi 👋</p>';
    body.scrollTop = body.scrollHeight;
  }

  async function send(c) {
    const input = c.el.querySelector('.cb-input');
    const text = input.value.trim().slice(0, MAX);
    if (!me || !text) return;
    const them = c.uid, at = N.now();
    input.value = '';
    c.el.querySelector('.cb-emoji').hidden = true;
    try {
      await N.ref(`chats/${chatId(me.uid, them)}/${newId()}`).set({ from: me.uid, text, at });
      const last = text.slice(0, 80);
      await N.ref('').update({
        [`inbox/${them}/${me.uid}`]: { at, last, from: me.uid, read: false },
        [`inbox/${me.uid}/${them}`]: { at, last, from: me.uid, read: true },
      });
    } catch (err) {
      console.warn('kkph chat', err);
      input.value = text;
      const body = c.el.querySelector('.cb-body');
      body.insertAdjacentHTML('beforeend', '<p class="hint cb-err">couldn\'t send. Try again in a moment.</p>');
      body.scrollTop = body.scrollHeight;
    }
  }

  // one box's buttons
  function wire(c) {
    const el = c.el, input = el.querySelector('.cb-input'), emo = el.querySelector('.cb-emoji');
    el.querySelector('.cb-form').addEventListener('submit', (e) => {
      e.preventDefault();
      send(c);
      input.focus({ preventScroll: true });
    });
    el.querySelector('.cb-close').addEventListener('click', () => {
      KK.sfx.ui();
      C.close(c.uid);
    });
    // minimised: just the name bar; a tap on it opens it again
    el.querySelector('.cb-min').addEventListener('click', (e) => {
      e.stopPropagation();
      KK.sfx.ui();
      el.classList.toggle('min');
      if (!el.classList.contains('min')) markRead(c.uid);
    });
    el.querySelector('.cb-who').addEventListener('click', () => {
      if (el.classList.contains('min')) {
        el.classList.remove('min');
        return markRead(c.uid);
      }
      KK.app.showUser(c.uid, KK.app.screen);
    });
    // reading it (a click or typing in it) marks it read
    el.addEventListener('focusin', () => unread(c.uid, inbox[c.uid]) && markRead(c.uid));
    // emoji only (no GIFs)
    el.querySelector('.cb-emo-btn').addEventListener('click', (e) => {
      e.currentTarget.blur();
      emo.hidden = !emo.hidden;
    });
    emo.addEventListener('pointerdown', (e) => e.preventDefault()); // the box keeps focus
    emo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-emo]');
      if (!b) return;
      const s = input.selectionStart ?? input.value.length, t = input.selectionEnd ?? s;
      if (input.value.length + b.dataset.emo.length > MAX) return;
      input.value = input.value.slice(0, s) + b.dataset.emo + input.value.slice(t);
      const at = s + b.dataset.emo.length;
      input.focus({ preventScroll: true });
      input.setSelectionRange(at, at);
    });
  }
})();
