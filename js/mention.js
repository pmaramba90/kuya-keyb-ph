(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const N = KK.net, esc = KK.util.esc;

  /*
   * Tagging. "@username" in a post, review or reply tags that player: it shows as a link
   * to their profile and their bell gets a "tagged you" notification. Anyone can tag
   * their friends; the admins can tag anyone, plus @everyone (every player is notified).
   * Typing @ in one of those boxes lists who you can tag.
   */
  const M = (KK.mention = {});
  const EVERYONE = 'everyone';
  const TAG = /(^|[^a-z0-9_.@])@([a-z0-9_.-]{1,30})/gi; // usernames: a-z 0-9 . _ - (3–20)
  const handle = (raw) => raw.toLowerCase().replace(/[.-]+$/, ''); // "@zed." ends a sentence
  const isAdmin = () => !!N.me && KK.feed.isMod();

  /* ------------------------------ who's who ------------------------------ */
  // username → uid from the names index, looked up once each (null: not a player)
  const known = {}, pending = {};
  function resolve(h) {
    if (h in known) return Promise.resolve(known[h]);
    return (pending[h] = pending[h] || N.ref('names/' + h).once()
      .then((v) => (known[h] = typeof v === 'string' ? v : null))
      .catch(() => null)
      .finally(() => delete pending[h]));
  }
  // the usernames in a text, each once
  function handles(text) {
    const out = [];
    String(text || '').replace(TAG, (m, pre, raw) => {
      const h = handle(raw);
      if ((h.length >= 3 || h === EVERYONE) && !out.includes(h)) out.push(h);
      return m;
    });
    return out;
  }

  /* -------------------------------- showing -------------------------------- */
  // text as HTML: escaped, with @usernames as profile links. A username not checked yet is
  // checked after drawing; one that isn't a player goes back to plain text. allOk: the
  // author is an admin, so @everyone counts.
  M.html = function (text, allOk) {
    const s = String(text || '');
    let out = '', last = 0, check = false;
    s.replace(TAG, (m, pre, raw, idx) => {
      const h = handle(raw), at = idx + pre.length, end = at + 1 + h.length;
      if (h.length < 3 && h !== EVERYONE) return m;
      out += esc(s.slice(last, at));
      const shown = esc(s.slice(at, end));
      if (h === EVERYONE) out += allOk ? `<b class="mention all" title="every player was notified">${shown}</b>` : shown;
      else if (known[h]) out += `<b class="mention ok" data-user="${esc(known[h])}">${shown}</b>`;
      else if (known[h] === null) out += shown;
      else {
        out += `<b class="mention" data-mention="${esc(h)}">${shown}</b>`;
        check = true;
      }
      last = end;
      return m;
    });
    if (check) queueCheck();
    return out + esc(s.slice(last));
  };
  let checking = false;
  function queueCheck() {
    if (checking) return;
    checking = true;
    requestAnimationFrame(() => {
      checking = false;
      document.querySelectorAll('.mention[data-mention]').forEach(async (el) => {
        const uid = await resolve(el.dataset.mention);
        if (!el.isConnected || !el.dataset.mention) return;
        el.removeAttribute('data-mention');
        if (uid) {
          el.classList.add('ok');
          el.dataset.user = uid;
        } else el.replaceWith(document.createTextNode(el.textContent));
      });
    });
  }

  /* ------------------------------ notifications ------------------------------ */
  // who a text tags (players you may tag, not you), and whether it's @everyone
  async function tagged(text) {
    const admin = isAdmin(), friends = new Set(KK.social.friendIds()), hs = handles(text), uids = [];
    for (const h of hs) {
      if (h === EVERYONE) continue;
      const uid = await resolve(h);
      if (uid && uid !== N.me.uid && (admin || friends.has(uid)) && !uids.includes(uid)) uids.push(uid);
    }
    return { uids, all: admin && hs.includes(EVERYONE) };
  }
  // after posting: their bells. where: { owner, post, reply } (reply: a reply's id)
  M.notify = async function (text, where) {
    if (!N.me || !String(text || '').includes('@')) return;
    const { uids, all } = await tagged(text);
    let to = uids;
    if (all) to = Object.keys((await N.ref('users').once().catch(() => null)) || {});
    const data = { t: 'tag', post: where.post, pid: where.owner, kind: all ? 'all' : where.reply ? 'reply' : 'post' };
    to.filter((uid) => uid !== N.me.uid).forEach((uid) => KK.notify.send(uid, data, `g_${where.reply || where.post}`));
  };

  /* -------------------------------- the picker -------------------------------- */
  // typing @ in a post / review box or a reply box lists who you can tag
  const BOXES = '.comp-text, [data-reply-in]';
  let pop = null, field = null, items = [], sel = 0, tok = null;
  let users = null, usersAt = 0; // admins: every player (read at most once a minute)

  function people() {
    if (!isAdmin()) {
      return KK.social.friendIds().map((uid) => ({ uid, h: KK.social.handleOf(uid), d: KK.social.nameOf(uid) })).filter((x) => x.h);
    }
    if (!users || Date.now() - usersAt > 60000) {
      usersAt = Date.now();
      N.ref('users').once().then((v) => {
        users = Object.entries(v || {}).filter(([uid, u]) => u && u.name && uid !== N.me.uid).map(([uid, u]) => ({ uid, h: String(u.name).toLowerCase(), d: u.display || u.name }));
        if (field) update();
      }).catch(() => {});
    }
    return users || [];
  }
  function candidates(q) {
    const hit = (x) => x.h.startsWith(q) || String(x.d).toLowerCase().includes(q);
    const list = people().filter(hit).sort((a, b) => (b.h.startsWith(q) - a.h.startsWith(q)) || a.h.localeCompare(b.h));
    if (isAdmin() && EVERYONE.startsWith(q)) list.unshift({ all: true, h: EVERYONE, d: 'everyone' });
    return list.slice(0, 6);
  }
  // the @word being typed, up to the caret
  function tokenAt(el) {
    const c = el.selectionStart;
    if (c == null || c !== el.selectionEnd) return null;
    const m = /(^|[^a-z0-9_.@])@([a-z0-9_.-]{0,20})$/i.exec(el.value.slice(0, c));
    return m ? { start: c - m[2].length - 1, end: c, q: m[2].toLowerCase() } : null;
  }

  function close() {
    if (pop) pop.hidden = true;
    field = null;
    tok = null;
  }
  function update() {
    if (!field || !field.isConnected || document.activeElement !== field) return close();
    tok = tokenAt(field);
    if (!tok) return close();
    items = candidates(tok.q);
    if (!items.length && (tok.q || isAdmin())) return close();
    sel = Math.min(sel, Math.max(0, items.length - 1));
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'mention-pop';
      pop.setAttribute('role', 'listbox');
      document.body.appendChild(pop);
      // keep the box focused while picking (taps and clicks)
      pop.addEventListener('pointerdown', (e) => e.preventDefault());
      pop.addEventListener('mousedown', (e) => e.preventDefault());
      pop.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) pick(+b.dataset.i);
      });
    }
    pop.innerHTML = items.length
      ? items.map((x, i) => `<button type="button" class="mp-item${i === sel ? ' on' : ''}" data-i="${i}" role="option">
          ${x.all ? '<span class="mp-all">@</span>' : KK.social.avatarImg(x.uid, 'xs')}
          <span class="mp-text"><b>${x.all ? '@everyone' : esc(x.d)}</b><span>${x.all ? 'notifies every player' : '@' + esc(x.h)}</span></span></button>`).join('')
      : '<p class="hint mp-empty">add friends to tag them</p>';
    pop.hidden = false;
    place();
  }
  // under the box, or above it when the space below is short (a phone's keyboard)
  function place() {
    const r = field.getBoundingClientRect(), vh = window.visualViewport ? visualViewport.height : innerHeight;
    const w = Math.min(320, Math.max(220, r.width));
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    const h = pop.offsetHeight;
    pop.style.top = (r.bottom + 6 + h > vh && r.top - 6 - h > 0 ? r.top - 6 - h : r.bottom + 6) + 'px';
  }
  function pick(i) {
    const x = items[i];
    if (!x || !field || !tok) return;
    if (x.uid) known[x.h] = x.uid;
    const v = field.value, ins = '@' + x.h + ' ';
    field.value = v.slice(0, tok.start) + ins + v.slice(tok.end);
    const c = tok.start + ins.length;
    field.setSelectionRange(c, c);
    KK.sfx.ui();
    const el = field;
    close();
    el.dispatchEvent(new Event('input', { bubbles: true })); // drafts keep up
    el.focus();
  }

  document.addEventListener('input', (e) => {
    if (!e.target.matches || !e.target.matches(BOXES) || !N.me) return;
    field = e.target;
    update();
  });
  document.addEventListener('click', (e) => {
    if (e.target.matches && e.target.matches(BOXES) && pop && !pop.hidden) update();
  });
  document.addEventListener('focusout', (e) => {
    if (e.target === field) setTimeout(() => document.activeElement !== field && close(), 120);
  });
  // ↑ ↓ choose, Enter / Tab pick, Esc closes (before the box's own Enter = submit)
  document.addEventListener('keydown', (e) => {
    if (!pop || pop.hidden || e.target !== field || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      update();
    } else if (e.key === 'Enter' || e.key === 'Tab') pick(sel);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  addEventListener('resize', () => field && pop && !pop.hidden && place());
  addEventListener('scroll', () => field && pop && !pop.hidden && place(), true);
})();
