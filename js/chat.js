(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const N = KK.net, esc = KK.util.esc;
  const $ = (s) => document.querySelector(s);

  /*
   * Messages between players. The envelope next to the bell lists your conversations
   * (newest first, unread marked) and a chat box opens at the bottom right. Text and
   * emoji only. A new message plays three quick clicky key presses.
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
  let me = null, offs = [], inbox = {}, primed = false;
  let openUid = null, offChat = null, msgs = {};
  const menu = $('#msgMenu'), box = $('#chatBox'), body = $('#cbBody'), input = $('#cbInput');

  const chatId = (a, b) => [a, b].sort().join('_');
  const newId = () => N.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const unread = (uid, c) => !!c && c.from === uid && !c.read;
  const time = (at) => new Date(+at || 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
      if (openUid && unread(openUid, inbox[openUid]) && !box.classList.contains('min')) markRead(openUid);
      render();
    }));
    $('#msgWrap').hidden = false;
  };
  C.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    inbox = {};
    C.close();
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

  /* ------------------------------ the envelope menu ------------------------------ */
  const list = () => Object.entries(inbox)
    .filter(([, c]) => c && typeof c === 'object' && typeof c.last === 'string')
    .sort((a, b) => (+b[1].at || 0) - (+a[1].at || 0));

  // names not looked up yet show as …; draw again once they've loaded
  let later = null;
  const waitNames = (uids) => {
    if (later || !uids.some((uid) => KK.feed.nameOf(uid) === '…')) return;
    later = setTimeout(() => {
      later = null;
      render();
      if (openUid) whoBar(openUid);
    }, 600);
  };
  const whoBar = (uid) => {
    $('#cbWho').innerHTML = KK.social.avatarImg(uid, 'xs') + KK.feed.nameHtml(uid);
    $('#cbWho').dataset.user = uid;
    waitNames([uid]);
  };

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
  document.addEventListener('click', (e) => !menu.hidden && !e.target.closest('.msg-wrap') && C.closeMenu());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !menu.hidden && C.closeMenu());

  /* --------------------------------- the chat box --------------------------------- */
  // open a conversation with someone (from the menu, the friends tab or their profile)
  C.open = function (uid) {
    if (!me || !uid || uid === me.uid) return;
    KK.sfx.ui();
    if (openUid !== uid) {
      if (offChat) offChat();
      openUid = uid;
      msgs = {};
      body.innerHTML = '<p class="hint cb-empty">…</p>';
      offChat = N.ref('chats/' + chatId(me.uid, uid)).on((v) => {
        msgs = v && typeof v === 'object' ? v : {};
        drawMsgs();
      });
    }
    whoBar(uid);
    $('#cbEmoji').hidden = true;
    box.classList.remove('min');
    box.hidden = false;
    markRead(uid);
    input.focus({ preventScroll: true });
  };
  C.close = function () {
    if (offChat) offChat();
    offChat = null;
    openUid = null;
    msgs = {};
    box.hidden = true;
  };

  function drawMsgs() {
    const all = Object.values(msgs)
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

  async function send() {
    const text = input.value.trim().slice(0, MAX);
    if (!me || !openUid || !text) return;
    const them = openUid, at = N.now();
    input.value = '';
    $('#cbEmoji').hidden = true;
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
      body.insertAdjacentHTML('beforeend', '<p class="hint cb-err">couldn\'t send. Try again in a moment.</p>');
      body.scrollTop = body.scrollHeight;
    }
  }

  $('#cbForm').addEventListener('submit', (e) => {
    e.preventDefault();
    send();
    input.focus({ preventScroll: true });
  });
  $('#cbClose').addEventListener('click', () => {
    KK.sfx.ui();
    C.close();
  });
  // minimised: just the name bar; a tap on it opens it again
  $('#cbMin').addEventListener('click', (e) => {
    e.stopPropagation();
    KK.sfx.ui();
    box.classList.toggle('min');
    if (!box.classList.contains('min') && openUid) markRead(openUid);
  });
  $('#cbWho').addEventListener('click', () => {
    if (box.classList.contains('min')) {
      box.classList.remove('min');
      if (openUid) markRead(openUid);
      return;
    }
    const uid = $('#cbWho').dataset.user;
    if (uid) KK.app.showUser(uid, KK.app.screen);
  });
  // emoji only (no GIFs)
  $('#cbEmoji').innerHTML = EMOJI.map((e) => `<button type="button" data-emo="${e}">${e}</button>`).join('');
  $('#cbEmoBtn').addEventListener('click', () => {
    $('#cbEmoBtn').blur();
    $('#cbEmoji').hidden = !$('#cbEmoji').hidden;
  });
  $('#cbEmoji').addEventListener('pointerdown', (e) => e.preventDefault()); // the box keeps focus
  $('#cbEmoji').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emo]');
    if (!b) return;
    const s = input.selectionStart ?? input.value.length, t = input.selectionEnd ?? s;
    if (input.value.length + b.dataset.emo.length > MAX) return;
    input.value = input.value.slice(0, s) + b.dataset.emo + input.value.slice(t);
    const c = s + b.dataset.emo.length;
    input.focus({ preventScroll: true });
    input.setSelectionRange(c, c);
  });
})();
