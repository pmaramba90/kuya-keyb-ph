(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Image converter (your profile → image converter): upload a photo of a keyboard and it
   * becomes a custom board in the photo's colors: case, alphas, mods and accents (each one
   * adjustable). Then pick its parts (base, switches, keycaps, mods & lube) like in the
   * builder: they change how it sounds and its shape, never its colors. The colors ride on
   * the build as `paint` (see C.sanitizeBuild), so it looks the same everywhere it's shown.
   */
  const V = (KK.convert = {});
  let cv = null; // { photo, build } once a photo is in
  let view = null, hearT = null;

  /* ------------------------------ reading the photo ------------------------------ */
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const toHex = (p) => '#' + p.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const sat = (p) => {
    const mx = Math.max(...p), mn = Math.min(...p);
    return mx ? (mx - mn) / mx : 0;
  };

  // the keyboard's colors: the frame's color is the background (dropped); what's left is
  // grouped into 5 colors. The case is the color hugging the board's edge but rare in its
  // middle, the alphas the most common color in the middle, the mods the next one, and the
  // accent the most vivid of the rest (a red Esc, a blue Enter…)
  V.analyze = function (img) {
    const W = 140, k = W / Math.max(img.width, img.height);
    const w = Math.max(8, Math.round(img.width * k)), h = Math.max(8, Math.round(img.height * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    const px = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] > 128) px.push({ c: [d[i], d[i + 1], d[i + 2]], x, y });
    }
    // background: the median color of the outer frame
    const frame = px.filter((p) => p.x < 2 || p.y < 2 || p.x >= w - 2 || p.y >= h - 2);
    const med = [0, 1, 2].map((ch) => frame.map((p) => p.c[ch]).sort((a, b) => a - b)[frame.length >> 1] || 0);
    let fg = px.filter((p) => dist(p.c, med) > 40);
    if (fg.length < px.length * 0.12) fg = px; // the board fills the whole photo
    // the board: the longest run of well-filled rows, then of columns within them (leaves
    // out captions, feature icons and shadows); then its edge ring and its middle
    const band = (counts) => {
      const cut = Math.max(...counts) * 0.3;
      let best = [0, counts.length - 1], len = 0, s = -1;
      for (let i = 0; i <= counts.length; i++) {
        if (i < counts.length && counts[i] >= cut) {
          if (s < 0) s = i;
        } else if (s >= 0) {
          if (i - s > len) (len = i - s), (best = [s, i - 1]);
          s = -1;
        }
      }
      return best;
    };
    const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
    fg.forEach((p) => rows[p.y]++);
    const [y0, y1] = band(rows);
    fg.forEach((p) => p.y >= y0 && p.y <= y1 && cols[p.x]++);
    const [x0, x1] = band(cols);
    const inBox = fg.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1);
    if (inBox.length > 50) fg = inBox;
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const ring = (p) => p.x - x0 < bw * 0.05 || x1 - p.x < bw * 0.05 || p.y - y0 < bh * 0.07 || y1 - p.y < bh * 0.07;
    const mid = (p) => Math.abs(p.x - (x0 + bw / 2)) < bw * 0.35 && Math.abs(p.y - (y0 + bh / 2)) < bh * 0.3;

    // k-means, seeded farthest-first so a small vivid accent still gets its own group
    const K = 5, cs = [fg[Math.floor(fg.length / 2)].c.slice()];
    while (cs.length < K) {
      let best = null, bd = -1;
      for (let i = 0; i < fg.length; i += 3) {
        const m = Math.min(...cs.map((z) => dist(fg[i].c, z)));
        if (m > bd) (bd = m), (best = fg[i].c);
      }
      cs.push(best.slice());
    }
    const lab = new Array(fg.length).fill(0);
    for (let it = 0; it < 12; it++) {
      const sum = cs.map(() => [0, 0, 0, 0]);
      fg.forEach((p, i) => {
        let bi = 0, bd = Infinity;
        cs.forEach((z, j) => {
          const dd = dist(p.c, z);
          if (dd < bd) (bd = dd), (bi = j);
        });
        lab[i] = bi;
        const s = sum[bi];
        s[0] += p.c[0];
        s[1] += p.c[1];
        s[2] += p.c[2];
        s[3]++;
      });
      sum.forEach((s, j) => s[3] && (cs[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]));
    }
    const g = cs.map((z) => ({ c: z, n: 0, ring: 0, mid: 0 }));
    fg.forEach((p, i) => {
      const gr = g[lab[i]];
      gr.n++;
      if (ring(p)) gr.ring++;
      if (mid(p)) gr.mid++;
    });
    const tot = (key) => g.reduce((a, x) => a + x[key], 0) || 1;
    const R = tot('ring'), Mi = tot('mid'), N = tot('n');
    g.forEach((x) => ((x.rs = x.ring / R), (x.ms = x.mid / Mi), (x.ns = x.n / N)));
    const live = g.filter((x) => x.n);
    // the alphas: the most common color in the middle. The case: of the others, the one
    // most at home on the edge (and really there); none → a case the keys' tone, darker
    const alpha = live.slice().sort((a, b) => b.ms - a.ms)[0];
    const caseG = live.filter((x) => x !== alpha && x.rs >= 0.15).sort((a, b) => b.rs - b.ms - (a.rs - a.ms))[0] || null;
    const shadeOf = (p, amt) => U.shade(toHex(p), (p[0] + p[1] + p[2]) / 3 > 128 ? -amt : amt);
    const keys = live.filter((x) => x !== alpha && x !== caseG).sort((a, b) => b.ms - a.ms);
    const modG = keys.find((x) => dist(x.c, alpha.c) > 26 && x.ns > 0.04);
    const m = modG ? toHex(modG.c) : shadeOf(alpha.c, 0.18);
    const accG = keys.filter((x) => x !== modG && x.ns > 0.006 && sat(x.c) > 0.35).sort((a, b) => sat(b.c) - sat(a.c))[0];
    const a = toHex(alpha.c), x = accG ? toHex(accG.c) : m;
    return { caseColor: caseG ? toHex(caseG.c) : U.shade(toHex(alpha.c), -0.3), paint: { a, al: U.readable(a), m, ml: U.readable(m), x, xl: U.readable(x) } };
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
        <div class="cv-photo"><img src="${cv.photo}" alt="your photo"><label class="link-btn cv-again" for="cvFile">use another photo</label></div>
        <div class="cv-arrow" aria-hidden="true">→</div>
        <div class="cv-board" id="cvKb"></div>
      </div>
      <div class="cv-colors">${color('case', 'case', b.caseColor)}${color('a', 'keys', p.a)}${color('m', 'mods', p.m)}${color('x', 'accent', p.x)}</div>
      <p class="hint cv-note">the design stays the photo's: the parts below change how it sounds and its shape, not its colors.</p>
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
      const got = V.analyze(img);
      // the parts start from the board you're on
      const base = C.sanitizeBuild(KK.app.build);
      ['prebuilt', 'look', 'swIdx'].forEach((k) => delete base[k]);
      cv = { photo, name: (cv && cv.name) || '', build: Object.assign(base, { caseColor: got.caseColor, paint: got.paint }) };
      KK.sfx.select();
      V.render();
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
        b[k] = v;
        KK.sfx.ui();
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
      if (act.dataset.cva === 'save') save(act);
    });
    window.addEventListener('resize', () => KK.app.screen === 'convert' && view && view.fit());
  };
  V.left = () => {
    clearTimeout(hearT);
    KK.keysound.setBuild(KK.app.build);
  };
})();
