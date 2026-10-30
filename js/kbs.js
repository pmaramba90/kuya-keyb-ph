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

  const thumb = (url, w) => (url ? url + (url.includes('?') ? '&' : '?') + 'width=' + w : '');
  const typeOk = (s, t) => (t === 'all' ? true : t === 'topre' ? !!s.dome : t === 'magnetic' ? !!s.he : s.type === t && !s.dome);

  K.init = function () {
    $('#kbBrand').innerHTML = '<option value="all">all brands</option>' + C.keyboardBrands.map((b) => `<option>${esc(b)}</option>`).join('');
    $('#kbSizes').innerHTML = SIZES.map(([v, n]) => `<button class="chip${v === 'all' ? ' on' : ''}" data-f="size" data-v="${v}">${n}</button>`).join('');
    $('#kbTypes').innerHTML = TYPES.map((t) => `<button class="chip${t === 'all' ? ' on' : ''}" data-f="type" data-v="${t}">${t}</button>`).join('');
    $('#kbQ').placeholder = `search ${C.keyboards.length.toLocaleString()} keyboards… e.g. keychron k8`;
    K.view = KK.kbview.create($('#kbRender'), { maxU: 30 });

    $('#kbQ').addEventListener('input', (e) => { f.q = e.target.value; K.limit = 48; renderList(); });
    $('#kbBrand').addEventListener('change', (e) => { f.brand = e.target.value; K.limit = 48; renderList(); });
    $('#scr-kbs .kbs-filters').addEventListener('click', (e) => {
      const c = e.target.closest('[data-f]');
      if (!c) return;
      f[c.dataset.f] = c.dataset.v;
      c.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      c.blur();
      K.limit = 48;
      renderList();
    });
    $('#kbList').addEventListener('click', (e) => {
      if (e.target.closest('[data-more]')) {
        K.limit += 48;
        renderList();
        return;
      }
      const card = e.target.closest('[data-kb]');
      if (!card) return;
      card.blur();
      KK.sfx.ui();
      select(card.dataset.kb);
    });
    $('#kbDetail').addEventListener('click', onDetail);
  };

  K.open = function () {
    KK.app.show('kbs');
    renderList();
    if (!K.sel) {
      const first = filtered()[0];
      if (first) select(first.id);
    } else renderDetail();
  };

  function filtered() {
    const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return C.keyboards.filter(
      (k) =>
        (f.brand === 'all' || k.vendor === f.brand) &&
        (f.size === 'all' || k.size === f.size) &&
        (f.type === 'all' || k.switches.some((s) => typeOk(C.switchById[s.id], f.type))) &&
        terms.every((t) => k.search.includes(t))
    );
  }

  function renderList() {
    const list = filtered();
    $('#kbCount').textContent = list.length.toLocaleString() + ' keyboards';
    $('#kbList').innerHTML =
      list
        .slice(0, K.limit)
        .map((k) => `<button class="kbc${K.sel && K.sel.id === k.id ? ' sel' : ''}" data-kb="${esc(k.id)}">
          ${k.looks[0].img
            ? `<span class="kbc-img"><img loading="lazy" alt="" src="${esc(thumb(k.looks[0].img, 300))}" onerror="this.remove()"></span>`
            : `<span class="kbc-img noimg" style="--case:${k.looks[0].caseColor}">${KK.kbview.swatch(C.keycapById[k.looks[0].keycap])}</span>`}
          <span class="kbc-t">${esc(k.title)}</span>
          <span class="kbc-m">${esc(k.vendor)} · ${k.sizeName} · ${k.switches.length} switch${k.switches.length === 1 ? '' : 'es'} · from ${C.money(k.price, KK.app.settings.currency)}</span>
        </button>`)
        .join('') +
      (list.length > K.limit ? `<button class="btn ghost more" data-more>show more (${(list.length - K.limit).toLocaleString()} left)</button>` : '') +
      (list.length ? '' : '<p class="hint">no keyboards match — try fewer words.</p>');
  }

  function select(id) {
    K.sel = C.keyboardById[id];
    K.look = 0;
    K.sw = 0;
    document.querySelectorAll('#kbList .kbc').forEach((c) => c.classList.toggle('sel', c.dataset.kb === id));
    renderDetail();
  }

  function renderDetail() {
    const kb = K.sel;
    if (!kb) return;
    const b = (K.build = C.prebuiltBuild(kb, K.look, K.sw));
    KK.keysound.setBuild(b); // typing here previews this board
    K.view.update(b);
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap], look = kb.looks[K.look];
    const w = KK.keysound.writeup(b);
    const cur = KK.app.settings.currency;
    const factory = kb.factory.map((m) => FACTORY[m]).filter(Boolean).concat(kb.lubed ? ['factory-lubed switches'] : []);
    const spec = (k, v) => `<div class="spec"><span>${k}</span><b>${v}</b></div>`;
    const meter = (l, r, v) => `<div class="meter"><span>${l}</span><div class="bar"><i style="left:${Math.round(v * 100)}%"></i></div><span>${r}</span></div>`;
    $('#kbInfo').innerHTML = `
      <div class="kbd-title">${esc(kb.title)}</div>
      <div class="kbd-sub">${esc(kb.vendor)} · ${kb.sizeName} · from ${C.money(kb.price, cur)} · <a href="${esc(kb.url)}" target="_blank" rel="noopener noreferrer">view on ${esc(kb.store)} ↗</a></div>
      ${look.img ? `<img class="kbd-photo" alt="${esc(kb.title)}" src="${esc(thumb(look.img, 720))}" onerror="this.remove()">` : ''}
      ${kb.looks.length > 1 ? `<div class="grp-h">color</div><div class="chips">${kb.looks.map((l, i) => `<button class="chip${i === K.look ? ' on' : ''}" data-act="look" data-v="${i}"><i class="dotc" style="background:${l.caseColor}"></i>${esc(l.name)}</button>`).join('')}</div>` : ''}
      <div class="grp-h">switch</div>
      <div class="chips">${kb.switches.map((s, i) => { const o = C.switchById[s.id]; return `<button class="chip t-${o.type}${i === K.sw ? ' on' : ''}" data-act="kbsw" data-v="${i}"><i class="dot"></i>${esc(s.name)}</button>`; }).join('')}</div>`;
    $('#kbSound').innerHTML = `
      <div class="grp-h">how it sounds</div>
      <div class="pv-summary">${esc(w.headline)}</div>
      <div class="tags">${w.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      ${meter('deep', 'high', w.meters.pitch)}${meter('quiet', 'loud', w.meters.volume)}${meter('thock', 'clack', w.meters.clack)}
      <button class="btn sm" data-act="demo">▶ hear it</button>
      <div class="specs kbd-specs">
        ${spec('switch', `${esc(sw.name)} <em>${sw.typeLabel} · ${sw.force}g</em>`)}
        ${spec('case', `${kb.sizeName} ${C.CASES[b.case].name}`)}
        ${spec('plate', `${C.PLATES[b.plate].name} · ${C.MOUNTS[b.mount].name}`)}
        ${spec('keycaps', `${C.KC_PROFILES[kc.profile].name} ${C.KC_MATERIALS[kc.material].name} <em>${kc.legend.name} legends</em>`)}
        ${spec('factory', factory.length ? factory.join(', ') : 'nothing extra')}
      </div>
      <p class="hint">specs are read from the product page; the sound is built from exactly these parts — no mods.</p>`;
    renderActions();
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
      </div>`;
  }

  function useThis() {
    KK.app.build = Object.assign({}, K.build, { mods: K.build.mods.slice() });
    KK.app.profileId = null;
    KK.app.saveBuild();
  }

  function onDetail(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    el.blur();
    KK.sfx.ui();
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case 'look': K.look = +v; renderDetail(); KK.keysound.demo(); break;
      case 'kbsw': K.sw = +v; renderDetail(); KK.keysound.demo(); break;
      case 'demo': KK.keysound.demo(); break;
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
