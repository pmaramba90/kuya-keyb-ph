(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog, N = KK.net;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Marketplace: players buying and selling keyboards, switches and anything else
   * keyboard-related. Every listing has a photo; a keyboard or switch is picked from the
   * catalog (or "Other / Not on the List"). You deal with the other player in chat.
   *
   *   market/{id}        { uid, kind: sell|buy, type: keyboard|switch|other, item?, itemName?,
   *                        cond: new|used, country, city, title, desc?, price?, thumb, at }
   *   marketPhotos/{id}  the full photo (a JPEG data URL), read only when a listing opens
   */
  const M = (KK.market = {});
  const KINDS = { sell: 'Selling', buy: 'Buying' };
  const TYPES = { keyboard: 'Keyboard', switch: 'Switch', other: 'Other' };
  const CONDS = { new: 'Brand New', used: 'Used (Mint)' };
  const COUNTRIES = ['Philippines', 'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Japan', 'South Korea', 'Hong Kong', 'Taiwan', 'China', 'Australia', 'United States', 'Canada', 'United Kingdom', 'Other'];
  const PH_CITIES = ['Manila', 'Quezon City', 'Makati', 'Taguig', 'Pasig', 'Mandaluyong', 'San Juan', 'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Marikina', 'Caloocan', 'Malabon', 'Navotas', 'Valenzuela', 'Pateros', 'Antipolo', 'Bacoor', 'Imus', 'Dasmariñas', 'General Trias', 'Calamba', 'Santa Rosa', 'Biñan', 'San Pedro', 'Cabuyao', 'Lipa', 'Batangas City', 'Lucena', 'Angeles', 'San Fernando (Pampanga)', 'Olongapo', 'Malolos', 'Meycauayan', 'San Jose del Monte', 'Tarlac City', 'Cabanatuan', 'Dagupan', 'Baguio', 'San Fernando (La Union)', 'Vigan', 'Laoag', 'Tuguegarao', 'Naga', 'Legazpi', 'Puerto Princesa', 'Iloilo City', 'Bacolod', 'Roxas', 'Cebu City', 'Mandaue', 'Lapu-Lapu', 'Talisay', 'Dumaguete', 'Tagbilaran', 'Tacloban', 'Ormoc', 'Cagayan de Oro', 'Iligan', 'Butuan', 'Davao City', 'Tagum', 'General Santos', 'Koronadal', 'Cotabato City', 'Zamboanga City'];
  const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  const okPhoto = (v, max) => typeof v === 'string' && v.length < max && PHOTO.test(v);

  let all = {}, off = null, wired = false;
  const f = { q: '', kind: 'all' };
  const titleOf = (x) => `${KINDS[x.kind] || 'Selling'}: ${x.title}`;
  const peso = (n) => '₱' + Math.round(+n).toLocaleString();
  const itemLabel = (type, id) => (type === 'keyboard' ? (C.keyboardById[id] || {}).title : type === 'switch' ? (C.switchById[id] || {}).name : '') || '';

  /* ---------------------------------- the list ---------------------------------- */
  M.open = function () {
    if (!wired) wire();
    if (!off && N.me) {
      off = N.ref('market').on((v) => {
        all = v && typeof v === 'object' ? v : {};
        render();
      });
    }
    renderFilters();
    render();
  };
  // signing out (or in as someone else): start over
  M.stop = function () {
    if (off) off();
    off = null;
    all = {};
    closeModal();
  };

  function renderFilters() {
    const chip = (key, v, label) => `<button class="chip${f[key] === v ? ' on' : ''}" data-mf="${key}" data-v="${v}">${label}</button>`;
    $('#mkKinds').innerHTML = chip('kind', 'all', 'all') + chip('kind', 'sell', 'selling') + chip('kind', 'buy', 'buying');
  }

  function listings() {
    const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return Object.entries(all)
      .filter(([, x]) => x && KINDS[x.kind] && TYPES[x.type] && typeof x.title === 'string' && okPhoto(x.thumb, 80000))
      .map(([id, x]) => Object.assign({ id }, x))
      .filter((x) => f.kind === 'all' || x.kind === f.kind)
      .filter((x) => {
        const hay = [x.title, x.itemName, x.city, x.country, x.desc].join(' ').toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .sort((a, b) => (+b.at || 0) - (+a.at || 0));
  }

  function render() {
    if (KK.app.screen !== 'market') return;
    const list = listings();
    $('#mkList').innerHTML = list.length
      ? list.map((x) => `<button class="mk-card" data-mk="${esc(x.id)}">
          <span class="mk-img"><img src="${x.thumb}" alt="" loading="lazy"><i class="mk-kind k-${x.kind}">${KINDS[x.kind]}</i></span>
          <span class="mk-t">${esc(titleOf(x))}</span>
          ${+x.price > 0 ? `<span class="mk-price">${peso(x.price)}</span>` : ''}
          <span class="mk-m">${CONDS[x.cond] || ''} · ${esc(x.city || '')}</span>
          <span class="mk-who">${KK.social.avatarImg(x.uid, 'xs')}<span>${esc(KK.feed.nameOf(x.uid))}</span><em>${KK.feed.ago(x.at)}</em></span>
        </button>`).join('')
      : `<p class="hint mk-empty">${Object.keys(all).length ? 'no listings match.' : 'nothing listed yet. Tap + to sell or ask for something.'}</p>`;
  }

  /* ---------------------------------- a listing ---------------------------------- */
  let modalId = null;
  function openModal(html) {
    $('#mkSheet').innerHTML = html;
    $('#mkModal').hidden = false;
    document.body.classList.add('mk-locked');
  }
  function closeModal() {
    modalId = null;
    comp = null;
    $('#mkModal').hidden = true;
    $('#mkSheet').innerHTML = '';
    document.body.classList.remove('mk-locked');
  }

  async function show(id) {
    const x = all[id];
    if (!x) return;
    modalId = id;
    const mine = N.me && x.uid === N.me.uid;
    const name = KK.feed.nameOf(x.uid);
    openModal(`
      <button class="mk-x" data-mka="close" aria-label="close">✕</button>
      <div class="mk-photo"><img id="mkPhoto" src="${x.thumb}" alt=""></div>
      <div class="mk-kindline"><i class="mk-kind k-${x.kind}">${KINDS[x.kind]}</i><span>${TYPES[x.type]}${x.itemName ? ' · ' + esc(x.itemName) : ''}</span></div>
      <h2 class="mk-title">${esc(titleOf(x))}</h2>
      ${+x.price > 0 ? `<div class="mk-price big">${peso(x.price)}</div>` : ''}
      <div class="mk-facts"><span><b>condition</b>${CONDS[x.cond] || '—'}</span><span><b>location</b>${esc(x.city || '')}${x.country ? ', ' + esc(x.country) : ''}</span><span><b>posted</b>${KK.feed.ago(x.at)}</span></div>
      ${x.desc ? `<p class="mk-desc">${esc(x.desc)}</p>` : ''}
      <div class="mk-seller" data-mka="user">${KK.social.avatarImg(x.uid, 'sm')}<span><b>${esc(name)}</b><em>${x.kind === 'sell' ? 'seller' : 'buyer'} · view profile</em></span></div>
      <div class="mk-btns">${mine
        ? '<button class="btn ghost" data-mka="delete">delete listing</button>'
        : `<button class="btn primary" data-mka="msg">message ${esc(name)}</button>`}</div>`);
    // the full photo, once it's here
    const big = await N.ref('marketPhotos/' + id).once().catch(() => null);
    if (modalId === id && okPhoto(big, 400000) && $('#mkPhoto')) $('#mkPhoto').src = big;
  }

  async function remove(id) {
    const x = all[id];
    if (!x || !N.me || x.uid !== N.me.uid) return;
    if (!confirm('Delete this listing?')) return;
    await N.ref('').update({ ['market/' + id]: null, ['marketPhotos/' + id]: null }).catch((e) => console.warn('kkph market', e));
    closeModal();
    KK.ui.toast('listing deleted');
  }

  /* -------------------------------- post a listing -------------------------------- */
  // { kind, type, item (catalog id, '' = Other / Not on the List, null = not picked yet),
  //   cond, photo, thumb, busy }
  let comp = null;
  function compose() {
    comp = { kind: 'sell', type: 'keyboard', item: null, cond: null, photo: null, thumb: null, busy: false };
    const seg = (key, opts) => `<div class="mk-seg" data-seg="${key}">${Object.entries(opts).map(([v, l]) => `<button type="button" class="${comp[key] === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    openModal(`
      <button class="mk-x" data-mka="close" aria-label="close">✕</button>
      <h2 class="mk-h">new listing</h2>
      <form class="mk-form" id="mkForm" autocomplete="off" novalidate>
        ${seg('kind', { sell: 'Selling', buy: 'Buying' })}
        <div class="mk-f"><span class="mk-l">photo <em>required</em></span>
          <label class="mk-drop" id="mkDrop"><input type="file" id="mkFile" accept="image/*" hidden><span class="mk-drop-in"><b>+ add a photo</b><em>of the keyboard, switch or accessory</em></span></label></div>
        <div class="mk-f"><span class="mk-l">item type</span>${seg('type', TYPES)}</div>
        <div class="mk-f" id="mkItemF"><span class="mk-l" id="mkItemL"></span>
          <div class="mk-pick" id="mkPick"><input class="search" id="mkItemQ" spellcheck="false" autocomplete="off"><div class="mk-opts" id="mkOpts" role="listbox"></div></div>
          <div class="mk-chosen" id="mkChosen" hidden></div></div>
        <div class="mk-f"><span class="mk-l">condition</span>${seg('cond', CONDS)}</div>
        <div class="mk-f mk-loc"><span class="mk-l">location</span>
          <select class="select" id="mkCountry">${COUNTRIES.map((c) => `<option${c === 'Philippines' ? ' selected' : ''}>${c}</option>`).join('')}</select>
          <input class="search" id="mkCity" list="mkCities" maxlength="60" placeholder="city"><datalist id="mkCities">${PH_CITIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="mk-f"><span class="mk-l">title</span><div class="mk-titlebox"><span class="mk-prefix" id="mkPrefix">Selling:</span><input class="search" id="mkTitle" maxlength="80" placeholder="what is it?"></div></div>
        <div class="mk-f"><span class="mk-l">description</span><textarea class="search" id="mkDesc" rows="4" maxlength="1000" placeholder="details: what's included, mods, how it's been used, meet-up or shipping…"></textarea></div>
        <div class="mk-f"><span class="mk-l">price <em>optional</em></span><div class="mk-titlebox"><span class="mk-prefix">₱</span><input class="search" id="mkPrice" inputmode="numeric" maxlength="9" placeholder="0"></div></div>
        <div class="mk-foot"><span class="hint" id="mkMsg"></span><button type="button" class="btn ghost" data-mka="close">cancel</button><button class="btn primary" type="submit" id="mkPost">post listing</button></div>
      </form>`);
    itemField();
    // the city (and country) from your profile, if you've set them
    N.ref('profiles/' + N.me.uid).once().then((p) => {
      if (!comp || !p) return;
      if (p.city && !$('#mkCity').value) $('#mkCity').value = String(p.city).slice(0, 60);
      const c = COUNTRIES.find((x) => p.country && x.toLowerCase() === String(p.country).trim().toLowerCase());
      if (c) $('#mkCountry').value = c;
    }).catch(() => {});
  }

  // keyboard / switch: a search box over the catalog; its first option is always
  // "Other / Not on the List", whatever you type
  const OTHER = 'Other / Not on the List';
  function itemField() {
    const t = comp.type;
    $('#mkItemF').hidden = t === 'other';
    if (t === 'other') return;
    $('#mkItemL').textContent = t === 'keyboard' ? 'which keyboard' : 'which switch';
    $('#mkItemQ').placeholder = `search ${t === 'keyboard' ? C.keyboards.length.toLocaleString() + ' keyboards' : C.switches.length.toLocaleString() + ' switches'}`;
    const picked = comp.item !== null;
    $('#mkPick').hidden = picked;
    $('#mkChosen').hidden = !picked;
    if (picked) $('#mkChosen').innerHTML = `<span>${esc(comp.item ? itemLabel(t, comp.item) : OTHER)}</span><button type="button" class="link-btn" data-mka="repick">change</button>`;
    else options();
  }
  function options() {
    const t = comp.type, terms = $('#mkItemQ').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const src = t === 'keyboard' ? C.keyboards.map((k) => [k.id, k.title, k.search]) : C.switches.map((s) => [s.id, s.name, (s.name + ' ' + (s.brand || '')).toLowerCase()]);
    const hits = src.filter(([, , hay]) => terms.every((w) => hay.includes(w))).slice(0, 60);
    $('#mkOpts').innerHTML = `<button type="button" class="mk-opt other" data-item="">${OTHER}</button>` +
      hits.map(([id, name]) => `<button type="button" class="mk-opt" data-item="${esc(id)}">${esc(name)}</button>`).join('') +
      (hits.length ? '' : '<p class="hint">nothing matches. Pick "Other / Not on the List".</p>');
  }
  function pickItem(id) {
    comp.item = id;
    // an empty title starts as the item's name
    if (id && !$('#mkTitle').value.trim()) $('#mkTitle').value = itemLabel(comp.type, id).slice(0, 80);
    itemField();
    msg('');
  }

  const msg = (t) => $('#mkMsg') && ($('#mkMsg').textContent = t);

  // a small copy of the photo for the list (~360px)
  function thumbOf(dataUrl) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        let side = 360, q = 0.72;
        for (let i = 0; i < 5; i++) {
          const k = Math.min(1, side / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * k));
          c.height = Math.max(1, Math.round(im.height * k));
          const cx = c.getContext('2d');
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, c.width, c.height);
          cx.drawImage(im, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/jpeg', q);
          if (out.length < 70000) return res(out);
          side *= 0.8;
          q = Math.max(0.5, q - 0.06);
        }
        rej(new Error('too big'));
      };
      im.onerror = () => rej(new Error('bad image'));
      im.src = dataUrl;
    });
  }

  async function addPhoto(file) {
    if (!file || !comp) return;
    if (!/^image\//.test(file.type)) return msg("that isn't a picture");
    msg('shrinking the photo…');
    try {
      const photo = await KK.feed.shrinkPhoto(file), thumb = await thumbOf(photo);
      if (!comp) return;
      comp.photo = photo;
      comp.thumb = thumb;
      $('#mkDrop').classList.add('has');
      $('#mkDrop').querySelector('.mk-drop-in').innerHTML = `<img src="${thumb}" alt=""><em>tap to change the photo</em>`;
      msg('');
    } catch (e) {
      msg("couldn't use that photo. Try another one.");
    }
  }

  async function post() {
    if (!comp || comp.busy || !N.me) return;
    const title = $('#mkTitle').value.replace(/\s+/g, ' ').trim();
    const city = $('#mkCity').value.replace(/\s+/g, ' ').trim();
    const country = $('#mkCountry').value;
    const price = Math.floor(+String($('#mkPrice').value).replace(/[^\d]/g, '') || 0);
    // everything required, in the order it's asked
    if (!comp.photo) return msg('add a photo first: every listing needs one');
    if (comp.type !== 'other' && comp.item === null) return msg(`pick the ${comp.type} (or "${OTHER}")`);
    if (!comp.cond) return msg('pick the condition');
    if (!city) return msg('add your city');
    if (!title) return msg('give it a title');
    const rec = { uid: N.me.uid, kind: comp.kind, type: comp.type, cond: comp.cond, country, city: city.slice(0, 60), title: title.slice(0, 80), thumb: comp.thumb, at: N.now() };
    if (comp.type !== 'other' && comp.item) {
      rec.item = comp.item;
      rec.itemName = itemLabel(comp.type, comp.item).slice(0, 200);
    }
    const desc = $('#mkDesc').value.trim();
    if (desc) rec.desc = desc.slice(0, 1000);
    if (price > 0) rec.price = Math.min(price, 99999999);
    comp.busy = true;
    $('#mkPost').disabled = true;
    msg('posting…');
    const id = N.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      await N.ref('').update({ ['market/' + id]: rec, ['marketPhotos/' + id]: comp.photo });
    } catch (e) {
      console.warn('kkph market', e);
      comp.busy = false;
      $('#mkPost').disabled = false;
      return msg("couldn't post it. Try again.");
    }
    closeModal();
    KK.sfx.select();
    KK.ui.toast('listing posted ✓');
  }

  /* ---------------------------------- events ---------------------------------- */
  function wire() {
    wired = true;
    $('#mkAdd').addEventListener('click', (e) => {
      e.currentTarget.blur();
      KK.sfx.ui();
      compose();
    });
    $('#mkQ').addEventListener('input', (e) => {
      f.q = e.target.value;
      render();
    });
    $('#scr-market .mk-filters').addEventListener('click', (e) => {
      const c = e.target.closest('[data-mf]');
      if (!c) return;
      c.blur();
      KK.sfx.tab();
      f[c.dataset.mf] = c.dataset.v;
      renderFilters();
      render();
    });
    $('#mkList').addEventListener('click', (e) => {
      const c = e.target.closest('[data-mk]');
      if (!c) return;
      c.blur();
      KK.sfx.ui();
      show(c.dataset.mk);
    });
    const modal = $('#mkModal');
    // a click on the dimmed backdrop closes it
    modal.addEventListener('click', (e) => {
      if (e.target === modal) return closeModal();
      const seg = e.target.closest('[data-seg] [data-v]');
      if (seg && comp) {
        const key = seg.closest('[data-seg]').dataset.seg, v = seg.dataset.v;
        seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg));
        KK.sfx.tab();
        if (key === 'type' && comp.type !== v) {
          comp.item = null;
          $('#mkItemQ').value = '';
        }
        comp[key] = v;
        if (key === 'kind') $('#mkPrefix').textContent = KINDS[v] + ':';
        if (key === 'type') itemField();
        return;
      }
      const opt = e.target.closest('[data-item]');
      if (opt && comp) return KK.sfx.ui(), pickItem(opt.dataset.item);
      const a = e.target.closest('[data-mka]');
      if (!a) return;
      const act = a.dataset.mka;
      if (act === 'close') return closeModal();
      if (act === 'repick') {
        comp.item = null;
        itemField();
        return $('#mkItemQ').focus();
      }
      const x = modalId && all[modalId];
      if (!x) return;
      if (act === 'msg') {
        closeModal();
        KK.chat.open(x.uid);
      }
      if (act === 'user') {
        closeModal();
        KK.app.showUser(x.uid, 'market');
      }
      if (act === 'delete') remove(modalId);
    });
    modal.addEventListener('input', (e) => {
      if (e.target.id === 'mkItemQ') options();
    });
    modal.addEventListener('change', (e) => {
      if (e.target.id === 'mkFile') addPhoto(e.target.files[0]);
      if (e.target.id === 'mkCountry') {
        // the city list is for the Philippines
        $('#mkCity').setAttribute('list', e.target.value === 'Philippines' ? 'mkCities' : '');
      }
    });
    modal.addEventListener('submit', (e) => {
      e.preventDefault();
      post();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }
})();
