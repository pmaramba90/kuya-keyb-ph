(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Conference (home → conference): threads, like a forum. Anyone signed in starts one
   * (a title, a topic, some text), votes threads up or down, and comments; a comment can
   * be answered (one level deep). The writer, the thread's starter or an admin can delete.
   *
   *   threads/{tid}                 { uid, title, text, tag, at }
   *   threadVotes/{tid}/{uid}       1 | -1
   *   threadComments/{tid}/{cid}    { uid, text, at, re? }   re = the comment it answers
   */
  const CF = (KK.conf = {});
  const TAGS = { general: 'general', builds: 'builds', switches: 'switches', keycaps: 'keycaps', help: 'help', showcase: 'showcase', offtopic: 'off-topic' };
  const SORTS = { hot: 'hot', new: 'new', top: 'top' };
  let me = null, offs = [];
  let threads = {}, votes = {}, comments = {};
  let sort = 'hot', tagF = 'all', openId = null, composing = false, replyTo = null;
  const draft = { title: '', text: '', tag: 'general' };
  const cdrafts = {}; // tid or tid/cid → a comment being typed
  const seen = new Set(); // threads that have shown up (so a missing one was deleted, not still on its way)

  CF.start = function () {
    CF.stop();
    me = N.me;
    if (!me) return;
    [['threads', (v) => (threads = v)], ['threadVotes', (v) => (votes = v)], ['threadComments', (v) => (comments = v)]].forEach(([path, set]) =>
      offs.push(N.ref(path).on((v) => {
        set(v && typeof v === 'object' ? v : {});
        refresh();
      })));
  };
  CF.stop = function () {
    offs.forEach((f) => f());
    offs = [];
    threads = votes = comments = {};
    me = null;
    openId = replyTo = null;
    composing = false;
  };

  const shown = () => KK.app.screen === 'home' && !$('#confWrap').hidden;
  function refresh() {
    if (!shown()) return;
    // a redraw mustn't lose what you're typing
    const act = document.activeElement, key = act && act.dataset && act.dataset.cfIn;
    const caret = key ? [act.selectionStart, act.selectionEnd] : null;
    CF.render();
    const back = key && document.querySelector(`#confWrap [data-cf-in="${CSS.escape(key)}"]`);
    if (back) {
      back.focus();
      try { back.setSelectionRange(caret[0], caret[1]); } catch (e) {}
    }
  }

  const isMod = () => KK.feed.isMod();
  const ok = (t) => t && typeof t === 'object' && typeof t.uid === 'string' && typeof t.title === 'string';
  const score = (tid) => Object.values(votes[tid] || {}).reduce((s, v) => s + (v === 1 ? 1 : v === -1 ? -1 : 0), 0);
  const myVote = (tid) => (me && (votes[tid] || {})[me.uid]) || 0;
  const cmts = (tid) => Object.entries(comments[tid] || {}).filter(([, c]) => c && typeof c === 'object' && typeof c.uid === 'string').map(([id, c]) => Object.assign({ id }, c));
  // hot: votes count in orders of magnitude, newer threads rise (12 hours ≈ one order)
  const hot = (tid, t) => { const s = score(tid); return Math.sign(s) * Math.log10(Math.max(Math.abs(s), 1)) + (+t.at || 0) / 4.32e7; };
  const body = (s, max) => KK.mention.html(String(s || '').slice(0, max), false).replace(/\n/g, '<br>');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  /* ---------------------------------- render ---------------------------------- */
  CF.render = function () {
    const box = $('#confWrap');
    if (!me) return void (box.innerHTML = '');
    Object.keys(threads).forEach((tid) => seen.add(tid));
    // a thread that was here and isn't any more was deleted; one just posted may not have arrived yet
    if (openId && !ok(threads[openId]) && seen.has(openId)) openId = null;
    box.innerHTML = !openId ? listHtml() : ok(threads[openId]) ? threadHtml(openId) : '<button class="link-btn back-link cf-back" data-cf="back">← all threads</button><p class="hint cf-empty">loading…</p>';
  };

  function voteHtml(tid) {
    const v = myVote(tid), s = score(tid);
    return `<div class="cf-vote">
      <button class="cf-up${v === 1 ? ' on' : ''}" data-cf="up" data-id="${esc(tid)}" title="vote up" aria-label="vote up" aria-pressed="${v === 1}">▲</button>
      <b class="${s > 0 ? 'pos' : s < 0 ? 'neg' : ''}">${s}</b>
      <button class="cf-down${v === -1 ? ' on' : ''}" data-cf="down" data-id="${esc(tid)}" title="vote down" aria-label="vote down" aria-pressed="${v === -1}">▼</button></div>`;
  }
  const tagHtml = (t) => `<span class="cf-tag cf-tag-${esc(TAGS[t] ? t : 'general')}">${esc(TAGS[t] || 'general')}</span>`;
  const delBtn = (attrs, mine) => `<button class="picon cf-del" ${attrs} title="${mine ? 'delete' : 'delete (moderator)'}">✕</button>`;

  function listHtml() {
    let list = Object.entries(threads).filter(([, t]) => ok(t));
    if (tagF !== 'all') list = list.filter(([, t]) => t.tag === tagF);
    list.sort(sort === 'new' ? (a, b) => (+b[1].at || 0) - (+a[1].at || 0)
      : sort === 'top' ? (a, b) => score(b[0]) - score(a[0]) || (+b[1].at || 0) - (+a[1].at || 0)
        : (a, b) => hot(b[0], b[1]) - hot(a[0], a[1]));
    return `
      <div class="cf-bar">
        <button class="btn primary sm cf-newbtn" data-cf="compose"${composing ? ' hidden' : ''}>+ new thread</button>
        <div class="chips cf-sort" role="group" aria-label="sort threads">${Object.entries(SORTS).map(([k, n]) => `<button class="chip${sort === k ? ' on' : ''}" data-cf="sort" data-v="${k}">${n}</button>`).join('')}</div>
      </div>
      <div class="chips cf-tags" role="group" aria-label="topic">${[['all', 'all topics']].concat(Object.entries(TAGS)).map(([k, n]) => `<button class="chip${tagF === k ? ' on' : ''}" data-cf="tag" data-v="${k}">${esc(n)}</button>`).join('')}</div>
      ${composing ? composeHtml() : ''}
      <div class="cf-list">${list.length ? list.map(([tid, t]) => {
        const n = cmts(tid).length;
        return `<div class="cf-row" data-cf="open" data-id="${esc(tid)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
          ${voteHtml(tid)}
          <div class="cf-main">
            <div class="cf-title">${tagHtml(t.tag)}<b>${esc(String(t.title).slice(0, 120))}</b></div>
            ${t.text ? `<p class="cf-snip">${esc(String(t.text).slice(0, 160))}${String(t.text).length > 160 ? '…' : ''}</p>` : ''}
            <div class="cf-meta">${KK.social.avatarImg(t.uid, 'xs')}${KK.feed.nameHtml(t.uid)}<span>· ${KK.feed.ago(t.at)}</span><span class="cf-n">💬 ${plural(n, 'comment')}</span></div>
          </div></div>`;
      }).join('') : `<p class="hint cf-empty">${tagF === 'all' ? 'no threads yet. Start the first conversation!' : `no ${esc(TAGS[tagF])} threads yet.`}</p>`}</div>`;
  }

  function composeHtml() {
    return `<form class="cf-compose" data-cf-form="thread" autocomplete="off">
      <div class="cf-compose-h"><b>new thread</b><select class="select cf-sel" data-cf-in="tag" aria-label="topic">${Object.entries(TAGS).map(([k, n]) => `<option value="${k}"${draft.tag === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <input class="search" data-cf-in="title" maxlength="120" placeholder="title" value="${esc(draft.title)}" required>
      <textarea class="search comp-text" data-cf-in="text" maxlength="4000" rows="5" placeholder="what do you want to talk about? (optional)">${esc(draft.text)}</textarea>
      <div class="comp-foot"><span class="hint" id="cfMsg"></span><button type="button" class="btn ghost sm" data-cf="cancel">cancel</button><button class="btn primary" type="submit">post thread</button></div>
    </form>`;
  }

  function threadHtml(tid) {
    const t = threads[tid], all = cmts(tid).sort((a, b) => (+a.at || 0) - (+b.at || 0));
    const top = all.filter((c) => !c.re || !all.some((x) => x.id === c.re));
    const kids = (id) => all.filter((c) => c.re === id);
    const mineT = t.uid === me.uid;
    const cbox = (key, ph, re) => `<form class="cf-cbox" data-cf-form="comment" data-re="${esc(re || '')}" autocomplete="off">
        <textarea class="search comp-text" data-cf-in="${esc(key)}" maxlength="1000" rows="2" placeholder="${esc(ph)}">${esc(cdrafts[key] || '')}</textarea>
        <div class="comp-foot">${re ? '<button type="button" class="btn ghost sm" data-cf="unreply">cancel</button>' : ''}<button class="btn primary sm" type="submit">${re ? 'reply' : 'comment'}</button></div></form>`;
    const cHtml = (c, child) => {
      const canDel = c.uid === me.uid || mineT || isMod();
      return `<div class="cf-c${child ? ' kid' : ''}" id="cfc-${esc(c.id)}">
        ${KK.social.avatarImg(c.uid, 'sm')}
        <div class="cf-c-b">
          <div class="cf-c-h">${KK.feed.nameHtml(c.uid)}${c.uid === t.uid ? '<i class="cf-op" title="started this thread">OP</i>' : ''}<span>${KK.feed.ago(c.at)}</span>
            ${canDel ? delBtn(`data-cf="delc" data-id="${esc(c.id)}"`, c.uid === me.uid) : ''}</div>
          <p>${body(c.text, 1000)}</p>
          <button class="link-btn cf-replybtn" data-cf="reply" data-id="${esc(child ? c.re : c.id)}" data-who="${esc(c.uid)}">reply</button>
          ${!child && replyTo === c.id ? cbox(tid + '/' + c.id, 'write a reply…', c.id) : ''}
          ${!child ? kids(c.id).map((k) => cHtml(k, true)).join('') : ''}
        </div></div>`;
    };
    return `
      <button class="link-btn back-link cf-back" data-cf="back">← all threads</button>
      <article class="cf-thread">
        ${voteHtml(tid)}
        <div class="cf-main">
          <div class="cf-meta">${KK.social.avatarImg(t.uid, 'sm')}${KK.feed.nameHtml(t.uid)}<span>· ${KK.feed.ago(t.at)}</span>${tagHtml(t.tag)}
            ${mineT || isMod() ? delBtn('data-cf="delt"', mineT) : ''}</div>
          <h3 class="cf-h">${esc(String(t.title).slice(0, 120))}</h3>
          ${t.text ? `<div class="cf-body">${body(t.text, 4000)}</div>` : ''}
          <div class="cf-count">💬 ${plural(all.length, 'comment')}</div>
        </div>
      </article>
      ${cbox(tid, 'add a comment…')}
      <div class="cf-comments">${top.length ? top.map((c) => cHtml(c, false)).join('') : '<p class="hint">no comments yet. Say something!</p>'}</div>`;
  }

  /* ---------------------------------- actions ---------------------------------- */
  const warn = (err) => console.warn('kkph conference', err);
  function vote(tid, v) {
    if (!me || !ok(threads[tid])) return;
    const now = myVote(tid);
    N.ref(`threadVotes/${tid}/${me.uid}`).set(now === v ? null : v).catch(warn);
  }
  function postThread(form) {
    const title = draft.title.trim(), text = draft.text.trim();
    const msg = form.querySelector('#cfMsg');
    if (!title) return void (msg.textContent = 'give your thread a title');
    const tid = N.ref('threads').push({ uid: me.uid, title: title.slice(0, 120), text: text.slice(0, 4000), tag: TAGS[draft.tag] ? draft.tag : 'general', at: N.now() });
    draft.title = draft.text = '';
    composing = false;
    openId = tid;
    KK.sfx.select();
    CF.render();
  }
  function postComment(form) {
    const tid = openId, re = form.dataset.re || '';
    const key = re ? tid + '/' + re : tid;
    const text = String(cdrafts[key] || '').trim();
    if (!text || !ok(threads[tid])) return;
    const c = { uid: me.uid, text: text.slice(0, 1000), at: N.now() };
    if (re) c.re = re;
    const cid = N.ref(`threadComments/${tid}`).push(c);
    delete cdrafts[key];
    replyTo = null;
    // the thread's starter, and whoever you answered, hear about it
    const snippet = text.slice(0, 80), t = threads[tid];
    KK.notify.send(t.uid, { t: 'thread', pid: tid, text: snippet }, `th_${cid}`);
    const parent = re && (comments[tid] || {})[re];
    if (parent && parent.uid !== t.uid) KK.notify.send(parent.uid, { t: 'thread', pid: tid, kind: 'reply', text: snippet }, `thr_${cid}`);
    KK.sfx.select();
    CF.render();
  }
  function delThread(b) {
    const t = threads[openId];
    if (!t || !(t.uid === me.uid || isMod()) || !armed(b)) return;
    const tid = openId;
    openId = null;
    N.ref('').update({ [`threads/${tid}`]: null, [`threadVotes/${tid}`]: null, [`threadComments/${tid}`]: null }).catch(warn);
    CF.render();
  }
  function delComment(b) {
    const tid = openId, c = (comments[tid] || {})[b.dataset.id], t = threads[tid];
    if (!c || !t || !(c.uid === me.uid || t.uid === me.uid || isMod()) || !armed(b)) return;
    // its replies go with it
    const up = { [`threadComments/${tid}/${b.dataset.id}`]: null };
    cmts(tid).filter((x) => x.re === b.dataset.id).forEach((x) => (up[`threadComments/${tid}/${x.id}`] = null));
    N.ref('').update(up).catch(warn);
  }
  // ✕ → "delete?" → gone (a second tap within 2.5 s)
  function armed(b) {
    if (b.dataset.armed) return true;
    b.dataset.armed = '1';
    b.textContent = 'delete?';
    b.classList.add('armed');
    setTimeout(() => b.isConnected && (delete b.dataset.armed, (b.textContent = '✕'), b.classList.remove('armed')), 2500);
    return false;
  }

  // open a thread (from a notification or a link)
  CF.open = function (tid) {
    KK.app.show('home');
    KK.feed.showTab('conf');
    openId = tid || null;
    composing = false;
    CF.render();
    $('#confWrap').scrollIntoView({ block: 'start' });
  };

  const wrap = $('#confWrap');
  wrap.addEventListener('click', (e) => {
    if (!me) return;
    const u = e.target.closest('[data-user]');
    if (u && !e.target.closest('button:not([data-user])')) return KK.app.showUser(u.dataset.user, 'home');
    const b = e.target.closest('[data-cf]');
    if (!b) return;
    const act = b.dataset.cf;
    if (act !== 'open') b.blur();
    switch (act) {
      case 'up': case 'down': KK.sfx.ui(); return vote(b.dataset.id, act === 'up' ? 1 : -1);
      case 'open': KK.sfx.ui(); openId = b.dataset.id; replyTo = null; CF.render(); return wrap.scrollIntoView({ block: 'start' });
      case 'back': KK.sfx.ui(); openId = replyTo = null; return CF.render();
      case 'compose': KK.sfx.ui(); composing = true; CF.render(); return void (wrap.querySelector('[data-cf-in="title"]') || {}).focus();
      case 'cancel': KK.sfx.ui(); composing = false; return CF.render();
      case 'sort': KK.sfx.tab(); sort = SORTS[b.dataset.v] ? b.dataset.v : 'hot'; return CF.render();
      case 'tag': KK.sfx.tab(); tagF = b.dataset.v === 'all' || TAGS[b.dataset.v] ? b.dataset.v : 'all'; if (tagF !== 'all') draft.tag = tagF; return CF.render();
      case 'reply': {
        KK.sfx.ui();
        replyTo = b.dataset.id;
        const key = openId + '/' + replyTo, who = KK.feed.nameOf(b.dataset.who);
        // answering a reply: start with their @name
        if (!cdrafts[key] && b.dataset.who !== me.uid && who && who !== '…') cdrafts[key] = '@' + String(KK.social.nameOf(b.dataset.who) || who).replace(/\s+/g, '') + ' ';
        CF.render();
        const ta = wrap.querySelector(`[data-cf-in="${CSS.escape(key)}"]`);
        if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        return;
      }
      case 'unreply': KK.sfx.ui(); replyTo = null; return CF.render();
      case 'delt': return delThread(b);
      case 'delc': return delComment(b);
    }
  });
  // Enter opens a thread row (it's focusable)
  wrap.addEventListener('keydown', (e) => {
    const row = e.target.closest && e.target.closest('.cf-row');
    if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  });
  // drafts follow what you type
  wrap.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.cfIn;
    if (!k) return;
    if (k === 'title' || k === 'text' || k === 'tag') draft[k] = e.target.value;
    else cdrafts[k] = e.target.value;
  });
  wrap.addEventListener('change', (e) => e.target.dataset && e.target.dataset.cfIn === 'tag' && (draft.tag = e.target.value));
  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!me) return;
    const f = e.target.closest('[data-cf-form]');
    if (!f) return;
    if (f.dataset.cfForm === 'thread') postThread(f);
    else postComment(f);
  });
  // ctrl/⌘ + Enter posts a comment
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    const f = e.target.closest && e.target.closest('[data-cf-form]');
    if (f) { e.preventDefault(); f.requestSubmit(); }
  });
})();
