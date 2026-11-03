(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Full keyboards: prebuilt boards from mechanicalkeyboards.com, the brands' own
   * stores and the big gaming brands, ready to play
   * as-is. Pick a board, its color and its switch; the sound comes from exactly its
   * parts (case, plate, mount, factory foam/lube, stock keycaps, that switch).
   * No mods here — it's the keyboard as sold.
   */
  const K = (KK.kbs = { sel: null, look: 0, sw: 0, limit: 48, view: null, build: null });
  const f = { q: '', brand: 'all', size: 'all', type: 'all' };
  const SIZES = [['all', 'all sizes'], ['60', '60%'], ['65', '65%'], ['75', '75%'], ['tkl', 'tkl'], ['full', 'full']];
  const TYPES = ['all', 'linear', 'tactile', 'clicky', 'silent', 'topre', 'magnetic'];
  const FACTORY = { caseFoam: 'case foam', plateFoam: 'plate foam', peFoam: 'pe foam', tape: 'tape mod', stabLube: 'lubed stabilizers' };

  // the list: rows (the default) or cards (with a picture), both just the name and price,
  // sorted by brand then name, A→Z or Z→A; both remembered
  const PAGE = { cards: 48, list: 200 };
  const viewMode = () => (KK.app.settings.kbsLayout === 'cards' ? 'cards' : 'list');
  const sortDir = () => (KK.app.settings.kbsSort === 'za' ? -1 : 1);
  const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const ICON = {
    cards: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
  };
  function renderTools() {
    const v = viewMode(), az = sortDir() === 1;
    $('#kbTools').innerHTML = `<button class="chip kbs-sort" data-kbt="sort" title="sorted by brand, then name">${az ? 'A → Z' : 'Z → A'}</button>
      <span class="kbs-views" role="group" aria-label="show as">${['cards', 'list'].map((m) => `<button class="kbs-view${v === m ? ' on' : ''}" data-kbt="view" data-v="${m}" title="${m}" aria-label="show as ${m}" aria-pressed="${v === m}">${ICON[m]}</button>`).join('')}</span>`;
  }

  /* ----------------- search suggestions: finish the word you're typing ----------------- */
  // "key" → Key(chron): a brand first, else a word from the keyboards' names (the most
  // common one). Tab, → at the end, or a tap on the "tab" pill takes it
  let vocab = null;
  function words() {
    if (vocab) return vocab;
    const brands = new Map(), names = new Map();
    const add = (m, w) => {
      const k = w.toLowerCase(), e = m.get(k);
      if (e) e.n++;
      else m.set(k, { w, n: 1 });
    };
    C.keyboards.forEach((k) => {
      add(brands, k.vendor);
      k.title.split(/\s+/).forEach((w) => {
        w = w.replace(/^[^\w]+|[^\w+]+$/g, '');
        if (w.length >= 3 && !/^\d+$/.test(w)) add(names, w);
      });
    });
    const sorted = (m) => [...m.values()].sort((a, b) => b.n - a.n);
    return (vocab = { brands: sorted(brands), names: sorted(names) });
  }
  // what's left to type (and the finished value), or null
  function suggest(v) {
    if (!v || /\s$/.test(v)) return null;
    const low = v.toLowerCase(), W = words();
    const longer = (x, p) => x.w.length > p.length && x.w.toLowerCase().startsWith(p);
    // the whole box as the start of a brand ("cooler m" → Cooler Master)
    const whole = W.brands.find((x) => longer(x, low));
    if (whole) return { rest: whole.w.slice(v.length), value: whole.w };
    // else the last word
    const tok = v.match(/(\S+)$/)[1], t = tok.toLowerCase();
    if (t.length < 2) return null;
    const hit = W.brands.find((x) => !/\s/.test(x.w) && longer(x, t)) || W.names.find((x) => longer(x, t));
    return hit ? { rest: hit.w.slice(tok.length), value: v.slice(0, v.length - tok.length) + hit.w } : null;
  }
  let sug = null;
  function showSuggest() {
    const q = $('#kbQ'), ghost = $('#kbGhost'), at = q.selectionStart === q.value.length;
    sug = document.activeElement === q && at ? suggest(q.value) : null;
    // the hint sits right after your text, so only while it isn't scrolled
    if (sug && q.scrollWidth > q.clientWidth) sug = null;
    $('#kbTab').hidden = !sug;
    if (!sug) return void (ghost.textContent = '');
    const cs = getComputedStyle(q);
    ghost.style.font = cs.font;
    ghost.style.letterSpacing = cs.letterSpacing;
    ghost.style.paddingLeft = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + 'px';
    ghost.innerHTML = `<i>${esc(q.value)}</i>${esc(sug.rest)}`;
  }
  function takeSuggest() {
    if (!sug) return false;
    const q = $('#kbQ');
    q.value = sug.value;
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
    q.dispatchEvent(new Event('input', { bubbles: true }));
    KK.sfx.ui();
    return true;
  }

  /* ------------- phones: the keyboard opens in a speech bubble where you tapped ------------- */
  // one column (phones, narrow windows): the details float over the list, pointing at the
  // row you tapped; a computer shows them in the panel beside the list
  const bubbly = () => matchMedia('(max-width: 900px)').matches;
  let anchor = null; // { id, x }: the row the bubble points at, and where on it you tapped
  function closeBubble() {
    if (!anchor) return;
    anchor = null;
    const box = $('#kbDetail');
    box.classList.remove('bubble', 'up');
    box.style.top = '';
    $('#kbTail').hidden = true;
  }
  // below the row; above it when there's no room below but there is above. noScroll: a
  // re-place (resize, new content) never moves the page
  function placeBubble(noScroll) {
    if (!anchor) return;
    const row = document.querySelector(`#kbList [data-kb="${CSS.escape(anchor.id)}"]`);
    if (!row || !bubbly()) return closeBubble();
    const box = $('#kbDetail'), tail = $('#kbTail');
    const wrap = $('#scr-kbs .kbs-wrap').getBoundingClientRect(), r = row.getBoundingClientRect();
    const GAP = 12, h = box.offsetHeight, head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h')) || 0;
    // the screen's bottom: above the phone's tab bar
    const nav = document.querySelector('.nav'), foot = nav && getComputedStyle(nav).position === 'fixed' ? Math.min(innerHeight, nav.getBoundingClientRect().top) : innerHeight;
    const up = foot - r.bottom < h + GAP + 8 && r.top - head >= h + GAP + 8;
    const top = up ? r.top - wrap.top - GAP - h : r.bottom - wrap.top + GAP;
    box.style.top = top + 'px';
    box.classList.toggle('up', up);
    tail.hidden = false;
    tail.classList.toggle('up', up);
    tail.style.top = (up ? top + h - 9 : top - 7) + 'px';
    tail.style.left = U.clamp(anchor.x - wrap.left, 30, wrap.width - 30) - 8 + 'px';
    if (noScroll || up) return;
    // the bubble's bottom on screen, without pushing the row off the top
    const over = r.bottom + GAP + h + 8 - foot;
    if (over > 0) scrollBy({ top: Math.min(over, r.top - head - 8), behavior: 'smooth' });
  }

  const thumb = (url, w) => (url ? url + (url.includes('?') ? '&' : '?') + 'width=' + w : '');
  const typeOk = (s, t) => (t === 'all' ? true : t === 'topre' ? !!s.dome : t === 'magnetic' ? !!s.he : s.type === t && !s.dome);

  K.init = function () {
    $('#kbBrand').innerHTML = '<option value="all">all brands</option>' + C.keyboardBrands.map((b) => `<option>${esc(b)}</option>`).join('');
    $('#kbSizes').innerHTML = SIZES.map(([v, n]) => `<button class="chip${v === 'all' ? ' on' : ''}" data-f="size" data-v="${v}">${n}</button>`).join('');
    $('#kbTypes').innerHTML = TYPES.map((t) => `<button class="chip${t === 'all' ? ' on' : ''}" data-f="type" data-v="${t}">${t}</button>`).join('');
    $('#kbQ').placeholder = `search ${C.keyboards.length.toLocaleString()} keyboards… e.g. keychron k8`;
    K.view = KK.kbview.create($('#kbRender'), { maxU: 30 });
    K.limit = PAGE[viewMode()];
    renderTools();
    $('#kbTools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kbt]');
      if (!b) return;
      b.blur();
      KK.sfx.tab();
      if (b.dataset.kbt === 'view') KK.app.settings.kbsLayout = b.dataset.v;
      else KK.app.settings.kbsSort = sortDir() === 1 ? 'za' : 'az';
      KK.app.saveSettings();
      K.limit = PAGE[viewMode()];
      renderTools();
      renderList();
    });

    $('#kbQ').addEventListener('input', (e) => { f.q = e.target.value; K.limit = PAGE[viewMode()]; renderList(); showSuggest(); });
    $('#kbQ').addEventListener('keydown', (e) => {
      const end = e.target.selectionStart === e.target.value.length;
      if (((e.key === 'Tab' && !e.shiftKey) || (e.key === 'ArrowRight' && end)) && takeSuggest()) e.preventDefault();
    });
    ['focus', 'blur', 'click', 'keyup'].forEach((t) => $('#kbQ').addEventListener(t, () => setTimeout(showSuggest, 0)));
    // the pill: pointerdown keeps the box's focus (and the hint) until the tap lands
    $('#kbTab').addEventListener('pointerdown', (e) => e.preventDefault());
    $('#kbTab').addEventListener('click', () => takeSuggest());
    $('#kbBrand').addEventListener('change', (e) => { f.brand = e.target.value; K.limit = PAGE[viewMode()]; renderList(); });
    $('#scr-kbs .kbs-filters').addEventListener('click', (e) => {
      const c = e.target.closest('[data-f]');
      if (!c) return;
      f[c.dataset.f] = c.dataset.v;
      c.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      c.blur();
      K.limit = PAGE[viewMode()];
      renderList();
    });
    $('#kbList').addEventListener('click', (e) => {
      if (e.target.closest('[data-more]')) {
        K.limit += PAGE[viewMode()];
        renderList();
        return;
      }
      const card = e.target.closest('[data-kb]');
      if (!card) return;
      card.blur();
      KK.sfx.ui();
      const id = card.dataset.kb;
      if (bubbly()) {
        // the same row again closes it
        if (anchor && anchor.id === id) return closeBubble();
        const r = card.getBoundingClientRect();
        anchor = { id, x: e.clientX || r.left + r.width / 2 };
        $('#kbDetail').classList.add('bubble');
      }
      select(id); // draws the details, then places the bubble
    });
    $('#kbDetail').addEventListener('click', onDetail);
    // color and switch: the two dropdowns
    $('#kbDetail').addEventListener('change', (e) => {
      const s = e.target.closest('[data-pick]');
      if (!s) return;
      KK.sfx.ui();
      if (s.dataset.pick === 'look') K.look = +s.value;
      else K.sw = +s.value;
      renderDetail();
      KK.keysound.demo();
    });
    // a tap anywhere else (or Esc) closes the bubble
    document.addEventListener('pointerdown', (e) => {
      if (anchor && !e.target.closest('#kbDetail, #kbTail, #kbList [data-kb]')) closeBubble();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && anchor) closeBubble();
    });
    window.addEventListener('resize', () => placeBubble(true));
    // the review panel's stars: hover to preview, click (above) to set, arrows to adjust
    $('#kbDetail').addEventListener('pointermove', (e) => {
      const st = e.target.closest('#kbrStars');
      if (st) showStars(starAt(st, e.clientX));
    });
    $('#kbDetail').addEventListener('pointerout', (e) => {
      const to = e.relatedTarget;
      if (rev && e.target.closest('#kbrStars') && !(to && to.closest && to.closest('#kbrStars'))) showStars(rev.rating);
    });
    $('#kbDetail').addEventListener('keydown', (e) => {
      if (e.target.id !== 'kbrStars' || !rev) return;
      const d = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
      if (!d) return;
      e.preventDefault();
      setStars((rev.rating || 0) + d);
    });
  };

  K.open = function () {
    closeBubble();
    KK.app.show('kbs');
    renderList();
    if (!K.sel) {
      const first = filtered()[0];
      if (first) select(first.id);
    } else renderDetail();
  };

  function filtered() {
    const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const d = sortDir();
    return C.keyboards.filter(
      (k) =>
        (f.brand === 'all' || k.vendor === f.brand) &&
        (f.size === 'all' || k.size === f.size) &&
        (f.type === 'all' || k.switches.some((s) => typeOk(C.switchById[s.id], f.type))) &&
        terms.every((t) => k.search.includes(t))
    ).sort((a, b) => d * (byName(a.vendor, b.vendor) || byName(a.title, b.title)));
  }

  function renderList() {
    const list = filtered(), cur = KK.app.settings.currency, rows = viewMode() === 'list';
    $('#kbCount').textContent = list.length.toLocaleString() + ' keyboards';
    $('#kbList').classList.toggle('as-list', rows);
    // rows: just the name and price, under a heading for each brand
    let brand = null;
    const row = (k) => {
      const head = k.vendor !== brand ? `<div class="kbr-brand">${esc(k.vendor)}</div>` : '';
      brand = k.vendor;
      return `${head}<button class="kbr${K.sel && K.sel.id === k.id ? ' sel' : ''}" data-kb="${esc(k.id)}"><span class="kbr-t">${esc(k.title)}</span><span class="kbr-p">${C.money(k.price, cur)}</span></button>`;
    };
    $('#kbList').innerHTML =
      list
        .slice(0, K.limit)
        .map((k) => rows ? row(k) : `<button class="kbc${K.sel && K.sel.id === k.id ? ' sel' : ''}" data-kb="${esc(k.id)}">
          ${k.looks[0].img
            ? `<span class="kbc-img"><img loading="lazy" alt="" src="${esc(thumb(k.looks[0].img, 300))}" onerror="this.remove()"></span>`
            : `<span class="kbc-img noimg" style="--case:${k.looks[0].caseColor}">${KK.kbview.swatch(C.keycapById[k.looks[0].keycap])}</span>`}
          <span class="kbc-t">${esc(k.title)}</span>
          <span class="kbc-p">${C.money(k.price, cur)}</span>
        </button>`)
        .join('') +
      (list.length > K.limit ? `<button class="btn ghost more" data-more>show more (${(list.length - K.limit).toLocaleString()} left)</button>` : '') +
      (list.length ? '' : '<p class="hint">no keyboards match — try fewer words.</p>');
    placeBubble(true); // a new list: the bubble follows its row (or closes if it's gone)
  }

  function select(id) {
    K.sel = C.keyboardById[id];
    K.more = false; // a new keyboard opens with its details folded
    K.look = 0;
    K.sw = 0;
    document.querySelectorAll('#kbList [data-kb]').forEach((c) => c.classList.toggle('sel', c.dataset.kb === id));
    renderDetail();
  }

  function renderDetail() {
    const kb = K.sel;
    if (!kb) return;
    rev = null;
    const b = (K.build = C.prebuiltBuild(kb, K.look, K.sw));
    KK.keysound.setBuild(b); // typing here previews this board
    K.view.update(b);
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap], look = kb.looks[K.look];
    const w = KK.keysound.writeup(b);
    const cur = KK.app.settings.currency;
    const factory = kb.factory.map((m) => FACTORY[m]).filter(Boolean).concat(kb.lubed ? ['factory-lubed switches'] : []);
    const spec = (k, v) => `<div class="spec"><span>${k}</span><b>${v}</b></div>`;
    const meter = (l, r, v) => `<div class="meter"><span>${l}</span><div class="bar" style="--v:${Math.round(v * 100)}%"><i></i></div><span>${r}</span></div>`;
    $('#kbInfo').innerHTML = `
      <button class="kbd-close" data-act="close" aria-label="close">✕</button>
      <div class="kbd-title">${esc(kb.title)}</div>
      <div class="kbd-title kbd-price">${C.money(kb.price, cur)}</div>
      <div class="kbd-sub">${esc(kb.vendor)} · ${kb.sizeName} · <a href="${esc(kb.url)}" target="_blank" rel="noopener noreferrer">view on ${esc(kb.store)} ↗</a></div>
      <div class="kbd-acts"><button class="btn primary kbd-hear" data-act="demo">▶ hear it</button><button class="btn kbd-review" data-act="review" aria-expanded="false">★ review</button></div>
      <div class="kb-review" id="kbReview" hidden></div>
      ${look.img ? `<img class="kbd-photo" alt="${esc(kb.title)}" src="${esc(thumb(look.img, 720))}" onerror="this.remove()">` : ''}
      <div class="kbd-picks">
        <label class="kbd-pick"><span class="hud-lbl">color</span><select class="select" data-pick="look"${kb.looks.length > 1 ? '' : ' disabled'}>${kb.looks.map((l, i) => `<option value="${i}"${i === K.look ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="kbd-pick"><span class="hud-lbl">switch</span><select class="select" data-pick="kbsw"${kb.switches.length > 1 ? '' : ' disabled'}>${kb.switches.map((s, i) => `<option value="${i}"${i === K.sw ? ' selected' : ''}>${esc(s.name)} · ${C.switchById[s.id].typeLabel}</option>`).join('')}</select></label>
      </div>`;
    // the meters and the parts list: always shown beside the list; in a phone's bubble
    // folded under "details ›"
    $('#kbSound').innerHTML = `
      <div class="pv-summary kbd-headline">${esc(w.headline)}</div>
      <button class="kbd-more-btn" data-act="more" aria-expanded="${!!K.more}">details <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      <div class="kbd-more">
      ${meter('deep', 'high', w.meters.pitch)}${meter('quiet', 'loud', w.meters.volume)}${meter('thock', 'clack', w.meters.clack)}
      <div class="specs kbd-specs">
        ${spec('switch', `${esc(sw.name)} <em>${sw.typeLabel} · ${sw.force}g</em>`)}
        ${spec('case', `${kb.sizeName} ${C.CASES[b.case].name}`)}
        ${spec('plate', `${C.PLATES[b.plate].name} · ${C.MOUNTS[b.mount].name}`)}
        ${spec('keycaps', `${C.KC_PROFILES[kc.profile].name} ${C.KC_MATERIALS[kc.material].name} <em>${kc.legend.name} legends</em>`)}
        ${spec('factory', factory.length ? factory.join(', ') : 'nothing extra')}
      </div>
      </div>`;
    $('#kbDetail').classList.toggle('more', !!K.more);
    renderActions();
    // in a bubble: placed now, and again once the photo has its height
    if (anchor) {
      placeBubble();
      const ph = $('#kbInfo .kbd-photo');
      if (ph) ph.addEventListener('load', () => placeBubble(true), { once: true });
    }
  }

  function renderActions() {
    const mode = KK.builder.mode === 'vs' ? 'vs' : 'solo';
    const d = KK.app.settings.vsDiff || 'medium';
    $('#kbActions').innerHTML = `
      <div class="chips">
        <button class="chip${mode === 'solo' ? ' on' : ''}" data-act="mode" data-v="solo">single player</button>
        <button class="chip${mode === 'vs' ? ' on' : ''}" data-act="mode" data-v="vs">vs AI</button>
        ${mode === 'vs' ? ['easy', 'medium', 'hard'].map((x) => `<button class="chip${x === d ? ' on' : ''}" data-act="diff" data-v="${x}">${x}</button>`).join('') : ''}
      </div>
      <div class="kbd-btns">
        <button class="btn primary" data-act="play">${mode === 'vs' ? `play vs AI · ${d}` : 'play level 1'} with this keyboard →</button>
        <button class="btn" data-act="save">save to my builds</button>
      </div>
      <div class="kbd-btns kbd-quick">
        <button class="btn primary" data-act="test">Test It Out</button>
        <button class="btn" data-act="save">Save Keyboard</button>
      </div>`;
  }

  /* ------------------- review this keyboard right here ------------------- */
  // a panel under the button: stars (the left half of a star is a half point), a few
  // words, an optional shop link; posting keeps you on this page
  let rev = null; // { rating } while it's open
  function reviewPanel(show) {
    const el = $('#kbReview'), btn = $('#kbInfo .kbd-review');
    rev = show ? { rating: 0 } : null;
    if (btn) {
      btn.classList.toggle('on', !!show);
      btn.setAttribute('aria-expanded', !!show);
    }
    if (!el) return;
    el.hidden = !show;
    if (!show) return void (el.innerHTML = '');
    el.innerHTML = `
      <div class="kbr-h">your review of <b>${esc(K.sel.title)}</b></div>
      <div class="rev-rating"><span class="rstars stars-in" id="kbrStars" tabindex="0" role="slider" aria-label="rating out of 5" aria-valuemin="0.5" aria-valuemax="5" aria-valuenow="0"><span class="st-bg">★★★★★</span><span class="st-fg" style="width:0">★★★★★</span></span><b id="kbrNum">tap the stars · halves count</b></div>
      <textarea class="search comp-text" id="kbrText" maxlength="1000" rows="3" placeholder="how does it sound, feel, look? worth the price? (@ to tag)"></textarea>
      <input class="search rev-link" id="kbrLink" type="text" inputmode="url" autocomplete="off" maxlength="500" spellcheck="false" placeholder="where to buy it (optional) · Amazon, Lazada or Shopee link">
      <div class="kbr-foot"><span class="hint kbr-msg" id="kbrMsg"></span><button class="btn ghost sm" data-act="revCancel">cancel</button><button class="btn primary sm" data-act="revPost">post review</button></div>`;
    $('#kbrStars').focus({ preventScroll: true });
  }
  const starAt = (el, x) => {
    const r = el.getBoundingClientRect();
    return U.clamp(Math.ceil(((x - r.left) / r.width) * 10) / 2, 0.5, 5);
  };
  function showStars(v) {
    $('#kbrStars .st-fg').style.width = v * 20 + '%';
    $('#kbrNum').textContent = v ? `${v} / 5` : 'tap the stars · halves count';
  }
  function setStars(v) {
    rev.rating = U.clamp(v, 0.5, 5);
    $('#kbrStars').setAttribute('aria-valuenow', rev.rating);
    showStars(rev.rating);
    $('#kbrMsg').textContent = '';
  }
  async function postReview(btn) {
    if (!rev || !K.sel) return;
    btn.disabled = true;
    const err = await KK.feed.postReview({ kind: 'keyboard', item: K.sel.id, rating: rev.rating, text: $('#kbrText').value, link: $('#kbrLink').value });
    if (err) {
      btn.disabled = false;
      $('#kbrMsg').textContent = err;
      return;
    }
    reviewPanel(false);
    KK.sfx.select();
    KK.ui.toast('review posted ✓');
  }

  function useThis() {
    KK.app.build = Object.assign({}, K.build, { mods: K.build.mods.slice() });
    KK.app.profileId = null;
    KK.app.saveBuild();
  }

  function onDetail(e) {
    const st = e.target.closest('#kbrStars');
    if (st && rev) return KK.sfx.ui(), setStars(starAt(st, e.clientX));
    const el = e.target.closest('[data-act]');
    if (!el) return;
    el.blur();
    KK.sfx.ui();
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case 'close': closeBubble(); break;
      case 'more':
        K.more = !K.more;
        $('#kbDetail').classList.toggle('more', K.more);
        el.setAttribute('aria-expanded', K.more);
        placeBubble(true);
        break;
      // phones: straight into single player
      case 'test':
        useThis();
        KK.app.startGame(1);
        break;
      case 'demo': KK.keysound.demo(); break;
      case 'review': reviewPanel(!rev); break;
      case 'revCancel': reviewPanel(false); break;
      case 'revPost': postReview(el); break;
      case 'mode': KK.builder.mode = v; renderActions(); break;
      case 'diff': KK.app.settings.vsDiff = v; KK.app.saveSettings(); renderActions(); break;
      case 'play':
        useThis();
        if (KK.builder.mode === 'vs') KK.app.startVs(KK.app.settings.vsDiff || 'medium');
        else KK.app.startGame(1);
        break;
      case 'save': {
        useThis();
        const sw = C.switchById[K.build.switch];
        const name = `${K.sel.title.split(' ').slice(0, 4).join(' ')} · ${sw.name}`.slice(0, 40);
        KK.app.saveProfile(name, true);
        KK.sfx.select();
        el.textContent = 'saved ✓';
        break;
      }
    }
  }
})();
