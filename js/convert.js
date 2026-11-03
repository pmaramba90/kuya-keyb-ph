(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Image converter (your profile → image converter): upload a photo of a keyboard and it
   * becomes a custom board drawn like it. The photo is read by js/kbread.js: straightened
   * and turned the right way up, its size found (60 / 65 / 75 / tkl / full) from where
   * its keys sit, and each key's own color taken. The case, alpha, mod and accent colors
   * can be adjusted. Then pick its parts (base, switches, keycaps, mods & lube) like in the
   * builder: they change how it sounds, never its colors. The colors ride on the build as
   * `paint` (see C.sanitizeBuild), so it looks the same everywhere it's shown.
   */
  const V = (KK.convert = {});
  let cv = null; // { photo, img, read, build, name } once a photo is in
  let view = null, hearT = null;

  // read (or read again: another size, another way up) and dress the build in it
  function apply(opts) {
    const got = KK.kbread.read(cv.img, opts);
    if (!got) return false;
    cv.read = got;
    Object.assign(cv.build, { layout: got.layout, caseColor: got.caseColor, paint: got.paint });
    // the straightened board, with where each key was found
    const c = document.createElement('canvas');
    c.width = got.board.width;
    c.height = got.board.height;
    const g = c.getContext('2d');
    g.drawImage(got.board, 0, 0);
    g.strokeStyle = 'rgba(226, 183, 20, .85)';
    g.lineWidth = 1.5;
    got.keys.forEach((k) => g.strokeRect(k.x + 1.5, k.y + 1.5, k.w - 3, k.h - 3));
    cv.boardUrl = c.toDataURL('image/jpeg', 0.85);
    return true;
  }
  const readLine = (r) => {
    const bits = [`read as <b>${esc(C.LAYOUTS[r.layout].name)}</b>`];
    if (r.turn) bits.push(r.turn === 180 ? 'turned the right way up' : `turned upright (${r.turn}°)`);
    if (Math.abs(r.angle) >= 1) bits.push(`straightened ${Math.round(Math.abs(r.angle))}°`);
    return bits.join(' · ');
  };

  /* --------------------------------- the screen --------------------------------- */
  V.open = function () {
    KK.app.show('convert');
  };
  V.render = function () {
    const el = $('#cvBody');
    if (!cv) {
      view = null;
      el.innerHTML = `<label class="cv-drop" for="cvFile"><span class="cv-drop-in"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg><b>upload a keyboard photo</b><em>a clear, straight-on shot works best</em></span></label>`;
      return;
    }
    const b = cv.build;
    const opt = (o, cur) => Object.entries(o).map(([v, x]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(x.name || v)}</option>`).join('');
    const sel = (key, html) => `<select class="select" data-cv="${key}">${html}</select>`;
    const kc = C.keycapById[b.keycap];
    // switches by type; keycaps as profile + material (a set of that kind gives the sound)
    const types = [...new Set(C.switches.map((s) => s.typeLabel))];
    const swHtml = types.map((t) => `<optgroup label="${esc(t)}">${C.switches.filter((s) => s.typeLabel === t).map((s) => `<option value="${esc(s.id)}"${s.id === b.switch ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`).join('');
    const profs = Object.keys(C.KC_PROFILES).filter((p) => C.keycaps.some((k) => k.profile === p));
    const mats = Object.keys(C.KC_MATERIALS).filter((m) => C.keycaps.some((k) => k.profile === kc.profile && k.material === m));
    const color = (key, label, v) => `<label class="cv-color"><input type="color" data-paint="${key}" value="${v}"><span>${label}</span></label>`;
    const p = b.paint;
    el.innerHTML = `
      <div class="cv-pair">
        <div class="cv-photo"><img src="${cv.boardUrl}" alt="your keyboard, straightened, with its keys outlined"><span class="cv-read">${readLine(cv.read)}</span><span class="cv-acts"><button class="link-btn" data-cva="turn" title="the wrong way up? turn it a quarter">↻ turn</button><label class="link-btn" for="cvFile">use another photo</label></span></div>
        <div class="cv-arrow" aria-hidden="true">→</div>
        <div class="cv-board" id="cvKb"></div>
      </div>
      <div class="cv-colors">${color('case', 'case', b.caseColor)}${color('a', 'keys', p.a)}${color('m', 'mods', p.m)}${color('x', 'accent', p.x)}</div>
      <p class="hint cv-note">each key keeps the color it has in the photo. Wrong size? Pick it under base and the photo is read again for it. The parts change how it sounds, not its colors.</p>
      <div class="cv-parts">
        <div class="cv-grp"><div class="grp-h">base</div>
          <label><span>size</span>${sel('layout', opt(C.LAYOUTS, b.layout))}</label>
          <label><span>case</span>${sel('case', opt(C.CASES, b.case))}</label>
          <label><span>plate</span>${sel('plate', opt(C.PLATES, b.plate))}</label>
          <label><span>mount</span>${sel('mount', opt(C.MOUNTS, b.mount))}</label></div>
        <div class="cv-grp"><div class="grp-h">switches</div>
          <label><span>switch</span>${sel('switch', swHtml)}</label>
          <div class="grp-h">keycaps</div>
          <label><span>profile</span>${sel('kcProfile', profs.map((x) => `<option value="${x}"${x === kc.profile ? ' selected' : ''}>${esc(C.KC_PROFILES[x].name)}</option>`).join(''))}</label>
          <label><span>material</span>${sel('kcMaterial', mats.map((x) => `<option value="${x}"${x === kc.material ? ' selected' : ''}>${esc(C.KC_MATERIALS[x].name)}</option>`).join(''))}</label></div>
        <div class="cv-grp cv-mods"><div class="grp-h">mods &amp; lube</div>
          <div class="chips">${C.MODS.map((m) => `<button class="chip${b.mods.includes(m.id) ? ' on' : ''}" data-mod="${m.id}" title="${esc(m.desc)}">${esc(m.name)}</button>`).join('')}</div>
          <label><span>lube</span>${sel('lube', C.LUBES.map((l) => `<option value="${l.id}"${l.id === b.lube ? ' selected' : ''}>${esc(l.name)}</option>`).join(''))}</label></div>
      </div>
      <div class="cv-sound" id="cvSound"></div>
      <div class="cv-save">
        <button class="btn" data-cva="hear">▶ hear it</button>
        <input class="search" id="cvName" maxlength="40" placeholder="name it (optional)" value="${esc(cv.name || '')}">
        <button class="btn primary" data-cva="save">save to my builds</button>
      </div>`;
    view = KK.kbview.create($('#cvKb'), { maxU: 26 });
    redraw();
  };

  // the board and its sound line, after any change
  function redraw() {
    if (!cv || !view) return;
    cv.build = C.sanitizeBuild(cv.build);
    view.update(cv.build);
    requestAnimationFrame(() => view && view.fit());
    const w = KK.keysound.writeup(cv.build);
    $('#cvSound').innerHTML = `<span class="pv-summary">${esc(w.headline)}</span>`;
  }

  async function load(file) {
    if (!file) return;
    const msg = (t) => KK.ui.toast(t);
    if (!/^image\//.test(file.type)) return msg("that isn't a picture");
    let photo;
    try {
      photo = await KK.feed.shrinkPhoto(file);
    } catch (e) {
      return msg("couldn't read that photo. Try another one.");
    }
    const img = new Image();
    img.onload = () => {
      $('#cvBody').innerHTML = '<p class="hint cv-busy">reading your photo…</p>';
      // a moment for that to show: reading takes a few hundred milliseconds
      setTimeout(() => {
        // the parts start from the board you're on
        const base = C.sanitizeBuild(KK.app.build);
        ['prebuilt', 'look', 'swIdx'].forEach((k) => delete base[k]);
        const prev = cv;
        cv = { photo, img, name: (prev && prev.name) || '', build: base };
        if (!apply()) {
          cv = prev;
          V.render();
          return msg("couldn't find a keyboard in that photo. Try a clearer, closer one.");
        }
        KK.sfx.select();
        V.render();
      }, 30);
    };
    img.onerror = () => msg("couldn't read that photo. Try another one.");
    img.src = photo;
  }

  function hear() {
    clearTimeout(hearT);
    KK.keysound.setBuild(cv.build);
    KK.keysound.demo();
    hearT = setTimeout(() => KK.keysound.setBuild(KK.app.build), 3500);
  }

  function save(btn) {
    const name = ($('#cvName').value.trim() || 'photo board').slice(0, 40);
    KK.app.build = C.sanitizeBuild(JSON.parse(JSON.stringify(cv.build)));
    KK.app.profileId = null;
    KK.app.saveBuild();
    KK.app.saveProfile(name, true);
    KK.keysound.setBuild(KK.app.build);
    KK.sfx.select();
    btn.textContent = 'saved ✓';
    KK.ui.toast(`"${name}" saved to your builds ✓`);
  }

  /* ---------------------------------- events ---------------------------------- */
  V.init = function () {
    $('#cvFile').addEventListener('change', (e) => {
      load(e.target.files[0]);
      e.target.value = '';
    });
    $('#cvBack').addEventListener('click', () => KK.app.show('title'));
    const el = $('#cvBody');
    el.addEventListener('change', (e) => {
      if (!cv) return;
      const b = cv.build, t = e.target;
      if (t.dataset.cv) {
        const k = t.dataset.cv, v = t.value;
        if (k === 'kcProfile' || k === 'kcMaterial') {
          const cur = C.keycapById[b.keycap];
          const prof = k === 'kcProfile' ? v : cur.profile;
          const mat = k === 'kcMaterial' ? v : cur.material;
          const pick = C.keycaps.find((x) => x.profile === prof && x.material === mat) || C.keycaps.find((x) => x.profile === prof);
          if (pick) b.keycap = pick.id;
          KK.sfx.ui();
          return V.render(); // the material list depends on the profile
        }
        KK.sfx.ui();
        // another size: the photo is read again for it (same way up)
        if (k === 'layout') {
          if (!apply({ layout: v, turn: cv.read.turn, angle: cv.read.angle })) b.layout = v;
          return V.render();
        }
        b[k] = v;
        redraw();
        if (k === 'switch') hear();
      }
    });
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (!cv) return;
      if (t.id === 'cvName') return void (cv.name = t.value);
      if (!t.dataset.paint) return;
      const k = t.dataset.paint, v = t.value;
      if (k === 'case') cv.build.caseColor = v;
      else {
        cv.build.paint[k] = v;
        cv.build.paint[k + 'l'] = U.readable(v);
      }
      redraw();
    });
    el.addEventListener('click', (e) => {
      if (!cv) return;
      const mod = e.target.closest('[data-mod]'), act = e.target.closest('[data-cva]');
      if (mod) {
        mod.blur();
        KK.sfx.tab();
        const ms = cv.build.mods, id = mod.dataset.mod;
        cv.build.mods = ms.includes(id) ? ms.filter((x) => x !== id) : ms.concat(id);
        mod.classList.toggle('on', cv.build.mods.includes(id));
        return redraw();
      }
      if (!act) return;
      act.blur();
      if (act.dataset.cva === 'hear') hear();
      if (act.dataset.cva === 'turn') {
        // the wrong way up: the next way round that reads as a keyboard (standing on its
        // end doesn't, so that's skipped), the size kept
        KK.sfx.ui();
        const t = cv.read.turn, ang = cv.read.angle, size = cv.read.layout;
        [90, 180, 270].some((d) => apply({ turn: (t + d) % 360, angle: ang, layout: size }));
        V.render();
      }
      if (act.dataset.cva === 'save') save(act);
    });
    window.addEventListener('resize', () => KK.app.screen === 'convert' && view && view.fit());
  };
  V._build = () => cv && cv.build; // tests
  V._read = () => cv && cv.read;
  V.left = () => {
    clearTimeout(hearT);
    KK.keysound.setBuild(KK.app.build);
  };
})();
