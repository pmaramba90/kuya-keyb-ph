(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  const B = (KK.builder = { step: 0, level: 0, mode: 'solo' });
  const VS_INFO = {
    easy: { speed: 3, ai: 'types ≈40 wpm, makes typos' },
    medium: { speed: 4, ai: 'types ≈60 wpm, steady' },
    hard: { speed: 5, ai: 'types ≈90 wpm, rarely slips' },
  };

  function vsBlock(app, prog) {
    const d = app.settings.vsDiff || 'medium';
    const rec = (prog.vs || {})[d];
    return `
      <div class="grp"><div class="grp-h">difficulty</div><div class="chips">${Object.keys(VS_INFO).map((k) => `<button class="chip${d === k ? ' on' : ''}" data-act="diff" data-v="${k}">${k}</button>`).join('')}</div>
        <p class="hint" style="margin-top:8px">ai ${VS_INFO[d].ai} · word speed: level ${VS_INFO[d].speed}${rec ? ` · your record ${rec.w}–${rec.l}` : ''}</p></div>
      <button class="btn primary big" data-act="start">start vs AI · ${d} →</button>
      <p class="hint" style="margin-top:12px">best of 3 · 1:30 rounds · every 5x combo attacks the AI's overflow bar (bigger combos hit harder)</p>`;
  }

  const startLabel = () => (B.mode === 'vs' ? `start vs AI · ${KK.app.settings.vsDiff || 'medium'} →` : `start level ${B.level} →`);
  const startPlay = () => (B.mode === 'vs' ? KK.app.startVs(KK.app.settings.vsDiff || 'medium') : KK.app.startGame(B.level));
  const STEPS = ['base', 'switches', 'keycaps', 'mods & lube', 'summary'];

  const swF = { q: '', type: 'all', brand: 'all' };
  const kcF = { q: '', profile: 'all', material: 'all', limit: 120 };
  const KC_GROUPS = {
    cherry: ['cherry'], oem: ['oem', 'odm'], tall: ['sa', 'mt3', 'lsa', 'mtnu'],
    uniform: ['xda', 'dsa', 'dda', 'ada', 'cubic'], spherical: ['kat', 'mda', 'ksa', 'osa', 'asa', 'moa', 'mog', 'bobo'],
    low: ['low'], other: ['topre', 'varmilo', 'leopold', 'gateron'],
  };
  const KC_GROUP_LABEL = { all: 'all', cherry: 'cherry', oem: 'oem', tall: 'sa / mt3 (tall)', uniform: 'xda / dsa (flat)', spherical: 'mda / ksa / kat', low: 'low profile', other: 'other' };

  const build = () => KK.app.build;

  /* ---------------------------------- shell ---------------------------------- */
  B.init = function () {
    $('#steps').innerHTML = STEPS.map((s, i) => `<button class="step" data-step="${i}"><span class="n">0${i + 1}</span>${s}</button>`).join('');
    $('#steps').addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (b) B.go(+b.dataset.step);
    });
    B.kb = KK.kbview.create($('#buildKb'), { maxU: 46 });
    $('#prevStep').addEventListener('click', () => (B.step === 0 ? KK.app.show('title') : B.go(B.step - 1)));
    $('#nextStep').addEventListener('click', () => (B.step < 4 ? B.go(B.step + 1) : startPlay()));

    const body = $('#stepBody');
    body.addEventListener('click', onClick);
    body.addEventListener('input', onInput);
    body.addEventListener('change', onInput);
    body.addEventListener('keydown', (e) => {
      if (e.target.id === 'buildName' && e.key === 'Enter') {
        KK.app.saveProfile(e.target.value, false);
        KK.sfx.select();
        renderStep();
      }
    });
    $('#buildSig').addEventListener('click', onClick);
  };

  B.open = function (step) {
    KK.app.show('build');
    B.go(step || 0);
  };

  B.go = function (i) {
    B.step = U.clamp(i, 0, STEPS.length - 1);
    $('#scr-build').dataset.step = B.step;
    document.querySelectorAll('#steps .step').forEach((el, k) => {
      el.classList.toggle('on', k === B.step);
      el.classList.toggle('done', k < B.step);
    });
    const prog = KK.app.progress;
    B.level = U.clamp(B.level || 1, 1, prog.unlocked);
    B.kb.update(build());
    renderSig();
    renderStep();
    $('#prevStep').textContent = B.step === 0 ? '← menu' : '← back';
    $('#nextStep').textContent = B.step < 4 ? 'next: ' + STEPS[B.step + 1] + ' →' : startLabel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  B.changed = function (demo) {
    // changing any part of a full keyboard turns it into a custom build
    const b0 = build();
    if (b0.prebuilt) ['prebuilt', 'look', 'swIdx'].forEach((k) => delete b0[k]);
    KK.app.saveBuild();
    KK.keysound.setBuild(build());
    B.kb.update(build());
    renderSig();
    if (demo) KK.keysound.demo();
  };

  /* --------------------------------- signature --------------------------------- */
  function meters(m) {
    const row = (l, r, v) => `<div class="meter"><span>${l}</span><div class="bar"><i style="left:${Math.round(v * 100)}%"></i></div><span>${r}</span></div>`;
    return row('deep', 'high', m.pitch) + row('quiet', 'loud', m.volume) + row('thock', 'clack', m.clack);
  }

  function renderSig() {
    const b = build();
    const d = KK.keysound.describe(KK.keysound.computeProfile(b));
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap];
    $('#buildSig').innerHTML = `
      <div class="sig-h">sound profile</div>
      ${meters(d.meters)}
      <div class="tags">${d.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
      <div class="sig-parts">
        <b>${C.LAYOUTS[b.layout].name}</b> ${C.CASES[b.case].name} · ${C.PLATES[b.plate].name} plate · ${C.MOUNTS[b.mount].name}<br>
        <b>${esc(sw.name)}</b> ${sw.force}g<br>
        <b>${esc(kc.name)}</b><br>
        ${b.mods.length ? b.mods.map((m) => C.modById[m].name).join(', ') : 'no mods'} · ${C.lubeById[b.lube].name} lube
      </div>
      <button class="btn sm" data-act="demo">▶ hear it</button>`;
  }

  /* ---------------------------------- steps ---------------------------------- */
  function renderStep() {
    const body = $('#stepBody');
    body.innerHTML = [stepBase, stepSwitches, stepKeycaps, stepMods, stepPreview][B.step]();
    if (B.step === 1) {
      renderSwList(true);
      renderSwDetail();
    }
    if (B.step === 2) renderKcGrid();
  }

  const card = (act, v, sel, h, d, tags, check) =>
    `<button class="card${sel ? ' sel' : ''}" data-act="${act}" data-v="${esc(v)}">${check ? '<span class="chk"></span>' : ''}<div class="card-h">${esc(h)}</div><div class="card-d">${esc(d)}</div>${tags && tags.length ? `<div class="card-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}</button>`;

  function stepBase() {
    const b = build();
    const cs = C.CASES[b.case];
    const colorName = (cs.colors.find((c) => c[1].toLowerCase() === b.caseColor.toLowerCase()) || ['custom'])[0];
    return `
      <div class="grp"><div class="grp-h">layout</div><div class="chips">
        ${Object.entries(C.LAYOUTS).map(([id, l]) => `<button class="chip${b.layout === id ? ' on' : ''}" data-act="layout" data-v="${id}" title="${esc(l.desc)}">${l.name}</button>`).join('')}
      </div></div>
      <div class="grp"><div class="grp-h">case material</div><div class="cards">
        ${Object.entries(C.CASES).map(([id, c]) => card('case', id, b.case === id, c.name, c.desc, c.tags)).join('')}
      </div></div>
      <div class="grp"><div class="grp-h">case color</div><div class="swatches">
        ${cs.colors.map(([n, hex]) => `<button class="swatch${hex.toLowerCase() === b.caseColor.toLowerCase() ? ' sel' : ''}" data-act="color" data-v="${hex}" title="${esc(n)}" style="background:${hex}"></button>`).join('')}
      </div><div class="swatch-name">${esc(colorName)}</div></div>
      <div class="grp"><div class="grp-h">plate</div><div class="cards sm">
        ${Object.entries(C.PLATES).map(([id, p]) => card('plate', id, b.plate === id, p.name, p.desc)).join('')}
      </div></div>
      <div class="grp"><div class="grp-h">mounting style</div><div class="cards sm">
        ${Object.entries(C.MOUNTS).map(([id, m]) => card('mount', id, b.mount === id, m.name, m.desc)).join('')}
      </div></div>`;
  }

  function stepSwitches() {
    const types = ['all', 'linear', 'tactile', 'clicky', 'silent', 'magnetic'];
    return `
      <div class="filters">
        <input class="search" id="swQ" placeholder="search ${C.switches.length} switches…" value="${esc(swF.q)}" autocomplete="off" spellcheck="false">
        <select class="select" id="swBrand"><option value="all">all brands</option>${C.switchBrands.map((b) => `<option${swF.brand === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select>
        <div class="chips">${types.map((t) => `<button class="chip${swF.type === t ? ' on' : ''}" data-act="swType" data-v="${t}">${t}</button>`).join('')}</div>
        <span class="count" id="swCount"></span>
      </div>
      <div class="sw-wrap"><div class="sw-list" id="swList"></div><div class="sw-detail" id="swDetail"></div></div>
      <p class="hint" style="margin-top:14px">switch list from keybumps.com · housing material, stem style and factory lube are inferred from each switch's name & brand to shape its sound.</p>`;
  }

  function filteredSwitches() {
    const q = swF.q.trim().toLowerCase();
    return C.switches.filter((s) => {
      if (swF.brand !== 'all' && s.brand !== swF.brand) return false;
      if (swF.type === 'magnetic' ? !s.he : swF.type !== 'all' && s.type !== swF.type) return false;
      return !q || s.name.toLowerCase().includes(q);
    });
  }

  function renderSwList(scroll) {
    const list = filteredSwitches();
    const sel = build().switch;
    $('#swList').innerHTML = list
      .map((s) => `<button class="sw-row t-${s.type}${s.id === sel ? ' sel' : ''}" data-act="switch" data-v="${s.id}"><span class="dot"></span><span>${esc(s.name)}</span><span class="f">${s.force}g</span></button>`)
      .join('') || '<div class="hint" style="padding:10px">no switches match.</div>';
    $('#swCount').textContent = list.length + ' shown';
    if (scroll) {
      const box = $('#swList'), el = $('#swList .sel');
      if (el) box.scrollTop = el.offsetTop - box.offsetTop - box.clientHeight / 2;
    }
  }

  function renderSwDetail() {
    const s = C.switchById[build().switch];
    $('#swDetail').innerHTML = `
      <div class="t-${s.type}"><div class="sd-type">${s.typeLabel}</div></div>
      <div class="sd-name">${esc(s.name)}</div>
      <div class="sd-stats">
        <div><b>${s.force}g</b><span>${s.he ? 'default actuation' : 'actuation force'}</span></div>
        <div><b>${esc(s.brand)}</b><span>brand</span></div>
      </div>
      <ul class="sd-feats">${C.describeSwitch(s).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <button class="btn sm" data-act="demo">▶ hear it</button>`;
  }

  function stepKeycaps() {
    const mats = ['all', 'pbt', 'abs', 'other'];
    return `
      <div class="filters">
        <input class="search" id="kcQ" placeholder="search ${C.keycaps.length} keycap sets…" value="${esc(kcF.q)}" autocomplete="off" spellcheck="false">
        <select class="select" id="kcProfile">${Object.keys(KC_GROUP_LABEL).map((g) => `<option value="${g}"${kcF.profile === g ? ' selected' : ''}>${KC_GROUP_LABEL[g]}</option>`).join('')}</select>
        <div class="chips">${mats.map((m) => `<button class="chip${kcF.material === m ? ' on' : ''}" data-act="kcMat" data-v="${m}">${m}</button>`).join('')}</div>
        <span class="count" id="kcCount"></span>
      </div>
      <div class="kc-grid" id="kcGrid"></div>
      <div id="kcMore"></div>
      <p class="hint" style="margin-top:14px">sets from mechanicalkeyboards.com · legend fonts follow each maker's style in the product photos · colors come from the set's name, or are sampled from its product photo when the name has none.</p>`;
  }

  function filteredKeycaps() {
    const q = kcF.q.trim().toLowerCase();
    const sel = build().keycap;
    const list = C.keycaps.filter((k) => {
      if (kcF.profile !== 'all' && !KC_GROUPS[kcF.profile].includes(k.profile)) return false;
      if (kcF.material === 'pbt' || kcF.material === 'abs') {
        if (k.material !== kcF.material) return false;
      } else if (kcF.material === 'other' && (k.material === 'pbt' || k.material === 'abs')) return false;
      return !q || k.name.toLowerCase().includes(q);
    });
    // keep the selected set visible at the front
    const i = list.findIndex((k) => k.id === sel);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
    return list;
  }

  function renderKcGrid() {
    const list = filteredKeycaps();
    const sel = build().keycap;
    const shown = list.slice(0, kcF.limit);
    $('#kcGrid').innerHTML =
      shown
        .map((k) => `<button class="kc${k.id === sel ? ' sel' : ''}" data-act="keycap" data-v="${k.id}">${KK.kbview.swatch(k)}<div class="kc-nm">${esc(k.name)}</div><div class="kc-meta">${C.KC_PROFILES[k.profile].name} · ${C.KC_MATERIALS[k.material].name} · ${k.legend.blank ? 'blank' : k.legend.name}${k.guessed === 'photo' ? ' · colors from photo' : k.guessed ? ' · colors approx.' : ''}</div></button>`)
        .join('') || '<div class="hint">no keycap sets match.</div>';
    $('#kcCount').textContent = list.length + ' sets';
    $('#kcMore').innerHTML = list.length > kcF.limit ? `<button class="btn ghost more" data-act="kcMore">show more (${list.length - kcF.limit} left)</button>` : '';
  }

  function stepMods() {
    const b = build();
    return `
      <div class="grp"><div class="grp-h">mods <span class="sub">stack as many as you like</span></div><div class="cards">
        ${C.MODS.map((m) => card('mod', m.id, b.mods.includes(m.id), m.name, m.desc, m.tags, true)).join('')}
      </div></div>
      <div class="grp"><div class="grp-h">switch lube</div><div class="cards sm">
        ${C.LUBES.map((l) => card('lube', l.id, b.lube === l.id, l.name, l.desc)).join('')}
      </div></div>`;
  }

  function stepPreview() {
    const b = build();
    const app = KK.app;
    const w = KK.keysound.writeup(b);
    const bom = C.billOfMaterials(b);
    const cur = app.settings.currency || 'usd';
    const prof = app.currentProfile();
    const dirty = app.isDirty();
    const prog = app.progress;
    const maxShow = Math.min(prog.unlocked + 1, 30);
    const levels = [];
    for (let i = 1; i <= maxShow; i++) {
      const locked = i > prog.unlocked;
      const best = prog.best[i];
      levels.push(`<button class="chip${B.level === i ? ' on' : ''}" data-act="level" data-v="${i}"${locked ? ' disabled title="survive the previous level to unlock"' : best ? ` title="best level score: ${best}"` : ''}>${locked ? '🔒 ' : ''}${i}</button>`);
    }
    const langs = [['en', 'english'], ['tl', 'tagalog'], ['mix', 'halo-halo']];
    const linkHtml = (ls) => ls.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a>`).join('');
    const rows = bom.rows
      .map((r) => `<tr><td class="bp">${r.part}</td><td>${esc(r.pick)}${r.unit ? ` <em>(${C.money(r.unit, cur)} ea)</em>` : ''}</td><td class="bm">${C.money(r.usd, cur)}</td><td class="bl">${linkHtml(r.links)}</td></tr>`)
      .join('');
    return `
      <div class="summary">
        <div class="sum-name">
          <input class="search name-input" id="buildName" maxlength="40" placeholder="name your build" value="${esc(prof ? prof.name : app.suggestName())}" spellcheck="false" autocomplete="off">
          <button class="btn sm${dirty ? ' primary' : ''}" data-act="save">${prof ? (dirty ? 'save changes' : 'saved ✓') : 'save build'}</button>
          ${prof ? '<button class="btn sm ghost" data-act="saveNew">save as new</button>' : ''}
          <span class="hint">${prof ? (dirty ? 'unsaved changes' : 'saved builds appear on the home screen') : 'not saved yet'}</span>
        </div>
        <div class="sum-grid">
          <section class="sum-sound">
            <div class="grp-h">sound profile</div>
            <div class="pv-summary">${esc(w.headline)}</div>
            <div class="tags">${w.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
            <div class="grp">${meters(w.meters)}</div>
            ${w.paras.map((p) => `<p class="sum-p">${esc(p)}</p>`).join('')}
            <p class="sum-p sum-verdict">${esc(w.verdict)}</p>
            <p class="hint">announcer: <b>${esc(w.word)}</b> at 5x combo → double → triple → ultra → <b>WOW!!!</b> at 25x</p>
            <button class="btn sm" data-act="demo">▶ hear it</button>
          </section>
          <section class="sum-play">
            <div class="price-box"><span class="hud-lbl">estimated build cost</span><b>${C.money(bom.total, cur)}</b><span class="hud-lbl">${bom.rows.length} parts · see the list below</span></div>
            <div class="grp"><div class="grp-h">words</div><div class="chips">${langs.map(([id, n]) => `<button class="chip${app.settings.lang === id ? ' on' : ''}" data-act="lang" data-v="${id}">${n}</button>`).join('')}</div></div>
            <div class="grp"><div class="grp-h">mode</div><div class="chips">
              <button class="chip${B.mode !== 'vs' ? ' on' : ''}" data-act="mode" data-v="solo">single player</button>
              <button class="chip${B.mode === 'vs' ? ' on' : ''}" data-act="mode" data-v="vs">vs AI</button>
            </div></div>
            ${B.mode === 'vs' ? vsBlock(app, prog) : `
            <div class="grp"><div class="grp-h">level</div><div class="chips">${levels.join('')}</div></div>
            <button class="btn primary big" data-act="start">start level ${B.level} →</button>
            <p class="hint" style="margin-top:12px">survive 1 minute · each missed word fills the overflow bar${prog.bestTotal ? ` · best total ${prog.bestTotal.toLocaleString()}` : ''}</p>`}
          </section>
        </div>
        <section class="sum-parts">
          <div class="grp-h parts-h">parts list & where to buy
            <span class="chips">${Object.entries(C.CURRENCIES).map(([id, c]) => `<button class="chip${cur === id ? ' on' : ''}" data-act="cur" data-v="${id}">${c.sym} ${c.label}</button>`).join('')}</span>
          </div>
          <div class="bom-wrap"><table class="bom">
            <thead><tr><th>part</th><th>pick</th><th>est.</th><th>shop</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td></td><td>total</td><td class="bm">${C.money(bom.total, cur)}</td><td></td></tr></tfoot>
          </table></div>
          <p class="hint">estimates in usd from typical 2025–26 enthusiast prices; keycap price is the listed price of the largest kit on mechanicalkeyboards.com. ${cur !== 'usd' ? 'currency conversion is approximate. ' : ''}links open store searches (the keycap link goes straight to the product).</p>
        </section>
      </div>`;
  }

  /* --------------------------------- events --------------------------------- */
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, v = el.dataset.v;
    const b = build();
    el.blur(); // keep space/enter free for "type to hear"
    KK.sfx.ui();
    switch (act) {
      case 'demo':
        KK.keysound.demo();
        return;
      case 'layout':
        b.layout = v;
        break;
      case 'case':
        b.case = v;
        b.caseColor = C.CASES[v].colors[0][1];
        break;
      case 'color':
        b.caseColor = v;
        break;
      case 'plate':
        b.plate = v;
        break;
      case 'mount':
        b.mount = v;
        break;
      case 'switch':
        b.switch = v;
        B.changed(true);
        document.querySelectorAll('#swList .sw-row').forEach((r) => r.classList.toggle('sel', r.dataset.v === v));
        renderSwDetail();
        return;
      case 'swType':
        swF.type = v;
        document.querySelectorAll('[data-act=swType]').forEach((c) => c.classList.toggle('on', c.dataset.v === v));
        renderSwList(false);
        return;
      case 'keycap':
        b.keycap = v;
        B.changed(true);
        document.querySelectorAll('#kcGrid .kc').forEach((r) => r.classList.toggle('sel', r.dataset.v === v));
        return;
      case 'kcMat':
        kcF.material = v;
        kcF.limit = 120;
        document.querySelectorAll('[data-act=kcMat]').forEach((c) => c.classList.toggle('on', c.dataset.v === v));
        renderKcGrid();
        return;
      case 'kcMore':
        kcF.limit += 120;
        renderKcGrid();
        return;
      case 'mod': {
        const i = b.mods.indexOf(v);
        if (i >= 0) b.mods.splice(i, 1);
        else b.mods.push(v);
        break;
      }
      case 'lube':
        b.lube = v;
        break;
      case 'lang':
        KK.app.settings.lang = v;
        KK.app.saveSettings();
        renderStep();
        return;
      case 'level':
      case 'mode':
      case 'diff':
        if (act === 'level') B.level = +v;
        if (act === 'mode') B.mode = v;
        if (act === 'diff') {
          KK.app.settings.vsDiff = v;
          KK.app.saveSettings();
        }
        renderStep();
        $('#nextStep').textContent = startLabel();
        return;
      case 'start':
        startPlay();
        return;
      case 'save':
      case 'saveNew':
        KK.app.saveProfile($('#buildName').value, act === 'saveNew');
        KK.sfx.select();
        renderStep();
        return;
      case 'cur':
        KK.app.settings.currency = v;
        KK.app.saveSettings();
        renderStep();
        return;
      default:
        return;
    }
    B.changed(true);
    renderStep();
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'swQ') {
      swF.q = t.value;
      renderSwList(false);
    } else if (t.id === 'swBrand') {
      swF.brand = t.value;
      renderSwList(false);
    } else if (t.id === 'kcQ') {
      kcF.q = t.value;
      kcF.limit = 120;
      renderKcGrid();
    } else if (t.id === 'kcProfile') {
      kcF.profile = t.value;
      kcF.limit = 120;
      renderKcGrid();
    }
  }
})();
