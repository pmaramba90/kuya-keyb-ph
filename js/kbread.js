(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util;

  /*
   * Reading a keyboard photo (for the image converter, js/convert.js). No AI, just the
   * keyboard's own geometry:
   *
   *   1. angle   the key grid's edges run in two perpendicular directions; the strongest
   *              direction in the photo is the grid's, so turning by it straightens the board
   *   2. board   where a straightened photo has both upright and level edges packed together
   *              (fabric folds, a desk's edge, a diagonal color boundary have one or neither)
   *   3. upright the board is wider than tall: if not, a quarter turn; a board narrower at
   *              the top than the bottom (a phone tilted back) is stretched square again
   *   4. layout  every size's real key positions (60, 65, 75, tkl, full, each also upside
   *              down) are laid over the key edges; the one whose key outlines land on the
   *              photo's edges, with plain case where it has no keys, wins. Upside down
   *              winning means the photo was the wrong way up
   *   5. colors  each key's own color, read from the middle of its cap, grouped into the
   *              board's few colors; the case from the bezel around the keys
   */
  const R = (KK.kbread = {});

  /* ------------------------------------ pixels ------------------------------------ */
  const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const ctx = (c) => c.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => ctx(c).getImageData(0, 0, c.width, c.height).data;

  function luma(d, n) {
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return L;
  }
  function sobel(L, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = L[i - w - 1], b = L[i - w], c = L[i - w + 1], d = L[i - 1], f = L[i + 1], g = L[i + w - 1], hh = L[i + w], k = L[i + w + 1];
        gx[i] = c + 2 * f + k - a - 2 * d - g;
        gy[i] = g + 2 * hh + k - a - 2 * b - c;
      }
    }
    return { gx, gy };
  }
  // summed-area table: any rectangle's total in four lookups
  function integral(a, w, h) {
    const W = w + 1, I = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += a[y * w + x];
        I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
      }
    }
    return { I, w, h };
  }
  function box(T, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.min(T.w, Math.round(x0)));
    x1 = Math.max(0, Math.min(T.w, Math.round(x1)));
    y0 = Math.max(0, Math.min(T.h, Math.round(y0)));
    y1 = Math.max(0, Math.min(T.h, Math.round(y1)));
    if (x1 <= x0 || y1 <= y0) return { s: 0, n: 0 };
    const W = T.w + 1, I = T.I;
    return { s: I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0], n: (x1 - x0) * (y1 - y0) };
  }
  function blur(a, w, h, r) {
    const T = integral(a, w, h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const b = box(T, x - r, y - r, x + r + 1, y + r + 1);
      out[y * w + x] = b.n ? b.s / b.n : 0;
    }
    return out;
  }
  // Otsu's threshold over a non-negative map
  function otsu(a) {
    let mx = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > mx) mx = a[i];
    if (!mx) return 0;
    const B = 256, hist = new Float64Array(B);
    for (let i = 0; i < a.length; i++) hist[Math.min(B - 1, Math.floor((a[i] / mx) * B))]++;
    let sum = 0;
    for (let i = 0; i < B; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = 0, t = 0;
    for (let i = 0; i < B; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = a.length - wB;
      if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) (best = v), (t = i);
    }
    return ((t + 0.5) / B) * mx;
  }
  // a turned copy (degrees, clockwise), corners filled with the photo's average color
  function turned(src, deg, fill) {
    const r = (deg * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const w = src.width, h = src.height, out = canvas(w * c + h * s, w * s + h * c), g = ctx(out);
    g.fillStyle = fill;
    g.fillRect(0, 0, out.width, out.height);
    g.translate(out.width / 2, out.height / 2);
    g.rotate(r);
    g.drawImage(src, -w / 2, -h / 2);
    return out;
  }
  function average(d) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]), n++;
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  }

  /* ------------------------------- 1. the grid's angle ------------------------------- */
  // gradient directions folded onto a quarter turn; the key grid makes the tallest peak
  function gridAngle(gx, gy) {
    const bins = new Float64Array(180); // half-degree bins over 0..90
    for (let i = 0; i < gx.length; i++) {
      const m = Math.abs(gx[i]) + Math.abs(gy[i]);
      if (m < 60) continue;
      let a = (Math.atan2(gy[i], gx[i]) * 180) / Math.PI;
      a = ((a % 90) + 90) % 90;
      bins[Math.floor(a * 2) % 180] += m;
    }
    const sm = new Float64Array(180);
    for (let i = 0; i < 180; i++) for (let j = -3; j <= 3; j++) sm[i] += bins[(i + j + 180) % 180] * (4 - Math.abs(j));
    let p = 0;
    for (let i = 1; i < 180; i++) if (sm[i] > sm[p]) p = i;
    const l = sm[(p + 179) % 180], r = sm[(p + 1) % 180], den = l - 2 * sm[p] + r;
    const off = den ? (0.5 * (l - r)) / den : 0;
    let deg = (p + 0.5 + off) / 2;
    if (deg > 45) deg -= 90;
    return deg;
  }

  /* ---------------------------------- 2. the board ---------------------------------- */
  // level and upright edges, each only where the edge really runs that way
  function gridEdges(gx, gy) {
    const n = gx.length, ax = new Float32Array(n), ay = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = Math.abs(gx[i]), y = Math.abs(gy[i]);
      if (x > 2.2 * y) ax[i] = x;
      else if (y > 2.2 * x) ay[i] = y;
    }
    return { ax, ay };
  }
  function boardBox(c) {
    const w = c.width, h = c.height, L = luma(rgba(c), w * h);
    const { gx, gy } = sobel(L, w, h), { ax, ay } = gridEdges(gx, gy);
    const r = Math.max(3, Math.round(Math.min(w, h) / 45));
    const bx = blur(ax, w, h, r), by = blur(ay, w, h, r), D = new Float32Array(w * h);
    for (let i = 0; i < D.length; i++) D[i] = Math.sqrt(bx[i] * by[i]);
    // the split between photo and keyboard, pulled well down: dark keys and the bezel
    // have fewer edges than bright legends, but far more than any background
    const t = otsu(D) * 0.4;
    let m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = D[i] > t ? 1 : 0;
    // close small gaps (a spacebar, a bare bezel), then keep the biggest piece, holes filled
    const rc = Math.max(2, Math.round(Math.min(w, h) / 70));
    const grow = (mm, need) => {
      const T = integral(mm, w, h), out = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const b = box(T, x - rc, y - rc, x + rc + 1, y + rc + 1);
        out[y * w + x] = need ? (b.s >= b.n ? 1 : 0) : b.s > 0 ? 1 : 0;
      }
      return out;
    };
    m = grow(grow(m, false), true);
    const lab = new Int32Array(w * h), q = new Int32Array(w * h);
    let best = 0, bestN = 0, id = 0;
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || lab[s]) continue;
      id++;
      let head = 0, tail = 0, n = 0;
      q[tail++] = s;
      lab[s] = id;
      while (head < tail) {
        const i = q[head++], x = i % w;
        n++;
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (j < 0 || j >= m.length || (j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
          if (m[j] && !lab[j]) (lab[j] = id), (q[tail++] = j);
        }
      }
      if (n > bestN) (bestN = n), (best = id);
    }
    if (!best || bestN < w * h * 0.04) return null;
    // fill holes: whatever the outside can't reach
    const out = new Uint8Array(w * h);
    let head = 0, tail = 0;
    const push = (i) => {
      if (lab[i] !== best && !out[i]) (out[i] = 1), (q[tail++] = i);
    };
    for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
    for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
    while (head < tail) {
      const i = q[head++], x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < w * (h - 1)) push(i + w);
    }
    // the rows the board fills, then a straight line down each side (rows where something
    // else touches the board, like a cable, are outvoted)
    const cnt = new Int32Array(h), ed = new Float64Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!out[i]) (cnt[y]++), (ed[y] += ax[i] + ay[i]);
    }
    const mx = Math.max(...cnt);
    // and rows with real edges in them (the blur and the gap-closing above can bridge a
    // plain strip of background; its raw edges stay near nothing)
    const eds = Array.from(ed, (_, y) => (ed[Math.max(0, y - 1)] + ed[y] + ed[Math.min(h - 1, y + 1)]) / 3);
    const ecut = eds.slice().sort((p, q) => p - q)[Math.floor(h * 0.9)] * 0.08;
    // the longest unbroken run of well-filled rows (a caption or icons joined to the board
    // by a thin bridge sit past a run of nearly empty rows)
    // (a calm strip inside the board, like the case between an f-row and the number row,
    // is bridged: it's short next to the board)
    const runs = [];
    let st = -1;
    for (let y = 0; y <= h; y++) {
      if (y < h && cnt[y] >= mx * 0.45 && eds[y] >= ecut) {
        if (st < 0) st = y;
      } else if (st >= 0) {
        const last = runs[runs.length - 1];
        if (last && st - last[1] <= Math.max(3, (y - last[0]) * 0.08)) last[1] = y - 1;
        else runs.push([st, y - 1]);
        st = -1;
      }
    }
    const [y0, y1] = runs.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] || [0, h - 1];
    const ls = [], rs = [];
    for (let y = y0; y <= y1; y++) {
      let a = 0, b = w - 1;
      while (a < w && out[y * w + a]) a++;
      while (b > a && out[y * w + b]) b--;
      if (b > a) ls.push([y, a]), rs.push([y, b + 1]);
    }
    if (ls.length < 5) return null;
    return { y0, y1: y1 + 1, left: robustLine(ls), right: robustLine(rs), w, h };
  }
  // x = a + b·y, fitted twice: the second time without the rows far off the first line
  function robustLine(pts) {
    const fitL = (ps) => {
      const n = ps.length, my = ps.reduce((s, p) => s + p[0], 0) / n, mx = ps.reduce((s, p) => s + p[1], 0) / n;
      let sxy = 0, syy = 0;
      ps.forEach(([y, x]) => ((sxy += (y - my) * (x - mx)), (syy += (y - my) * (y - my))));
      const b = syy ? sxy / syy : 0;
      return { a: mx - b * my, b };
    };
    let f = fitL(pts);
    for (let k = 0; k < 2; k++) {
      const res = pts.map(([y, x]) => Math.abs(x - (f.a + f.b * y))), med = res.slice().sort((p, q) => p - q)[res.length >> 1];
      const keep = pts.filter((p, i) => res[i] <= Math.max(2, med * 2.5));
      if (keep.length >= 5) f = fitL(keep);
    }
    return (y) => f.a + f.b * y;
  }

  // the board straightened into a rectangle, with a thin margin of what's around it
  function rectify(src, bb, outW) {
    const top = bb.y0, bot = bb.y1, H = bot - top;
    const wTop = bb.right(top) - bb.left(top), wBot = bb.right(bot) - bb.left(bot), W = (wTop + wBot) / 2;
    const k = outW / W, mx = 0.02 * W, my = 0.03 * H;
    const out = canvas(outW + 2 * mx * k, (H + 2 * my) * k), g = ctx(out);
    const rows = out.height;
    for (let j = 0; j < rows; j++) {
      const y = top - my + ((j + 0.5) / rows) * (H + 2 * my);
      const l = bb.left(y), r = bb.right(y), m = (r - l) * 0.02;
      g.drawImage(src, l - m, y - 0.5 / k, r - l + 2 * m, Math.max(1, 1 / k), 0, j, out.width, 1);
    }
    return { c: out, inset: { x: mx * k, y: my * k } };
  }

  /* --------------------------------- 4. the layout --------------------------------- */
  // the sizes to try: each as drawn here, the ones with an f-row also with that row a
  // little closer or further. Makers lay the f-row out differently (where Esc sits, an
  // F13, a knob), so it counts as one band: it has to be there, its keys needn't line up
  function templates(only) {
    const out = [];
    ['60', '65', '75', 'tkl', 'full'].forEach((id) => {
      if (only && only !== id) return;
      const base = KK.kbview.layout(id), fr = id === '75' || id === 'tkl' || id === 'full';
      (id === '75' ? [0, 0.25] : fr ? [0.25, 0.5] : [0.25]).forEach((gp) => {
        const d = fr ? gp - 0.25 : 0;
        const keys = base.keys.map((k) => Object.assign({}, k, { h: k.h || 1, y: fr && k.y >= 1 ? k.y + d : k.y, band: fr && k.y === 0 }));
        out.push({ id, keys, w: base.w, h: base.h + d });
      });
    });
    return out;
  }
  // the keys (upside down if asked) and, in units, the places in their area with no key:
  // there the photo should show plain case
  function prepare(t, flip) {
    const keys = flip ? t.keys.map((k) => Object.assign({}, k, { x: t.w - k.x - k.w, y: t.h - k.y - k.h })) : t.keys;
    const q = 0.25, cw = Math.round(t.w / q), ch = Math.round(t.h / q), occ = new Uint8Array(cw * ch);
    keys.forEach((k) => {
      const x0 = Math.round((k.band ? 0 : k.x) / q), x1 = Math.round((k.band ? t.w : k.x + k.w) / q);
      for (let y = Math.round(k.y / q); y < Math.round((k.y + k.h) / q); y++) {
        for (let x = x0; x < x1; x++) if (y >= 0 && y < ch && x >= 0 && x < cw) occ[y * cw + x] = 1;
      }
    });
    const bare = [];
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; ) {
        if (occ[y * cw + x]) {
          x++;
          continue;
        }
        const s = x;
        while (x < cw && !occ[y * cw + x]) x++;
        bare.push({ x: s * q, y: y * q, w: (x - s) * q, h: q });
      }
    }
    return { keys, bare };
  }

  function edgesOf(c) {
    const w = c.width, h = c.height, d = rgba(c), L = luma(d, w * h), { gx, gy } = sobel(L, w, h);
    const AX = new Float32Array(w * h), AY = new Float32Array(w * h);
    for (let i = 0; i < AX.length; i++) (AX[i] = Math.abs(gx[i])), (AY[i] = Math.abs(gy[i]));
    return { w, h, d, IX: integral(AX, w, h), IY: integral(AY, w, h) };
  }

  // how well keys placed at (u, v, ox, oy) sit on the photo:
  //   edge  the key outlines land on edges (per pixel of outline)
  //   face  the middle of each cap is calm (legends aside)
  //   left  edges the keys don't account for: on bare case and on the bezel, per pixel of
  //         the whole board. A smaller size laid over part of a bigger board leaves whole
  //         rows or clusters of keys here, which is what tells the sizes apart
  const LEFT = 4;
  function score(E, P, tw, th, u, v, ox, oy, parts) {
    const d = Math.max(1, Math.min(u, v) * 0.07);
    let bs = 0, bn = 0, is = 0, inn = 0;
    for (const k of P.keys) {
      const x0 = ox + k.x * u, x1 = ox + (k.x + k.w) * u, y0 = oy + k.y * v, y1 = oy + (k.y + k.h) * v;
      const s3 = box(E.IY, x0 + d, y0 - d, x1 - d, y0 + d), s4 = box(E.IY, x0 + d, y1 - d, x1 - d, y1 + d);
      bs += s3.s + s4.s;
      bn += s3.n + s4.n;
      if (k.band) continue;
      const s1 = box(E.IX, x0 - d, y0 + d, x0 + d, y1 - d), s2 = box(E.IX, x1 - d, y0 + d, x1 + d, y1 - d);
      bs += s1.s + s2.s;
      bn += s1.n + s2.n;
      const ix0 = x0 + 3 * d, ix1 = x1 - 3 * d, iy0 = y0 + 3 * d, iy1 = y1 - 3 * d;
      const a = box(E.IX, ix0, iy0, ix1, iy1), b = box(E.IY, ix0, iy0, ix1, iy1);
      is += a.s + b.s;
      inn += a.n;
    }
    const all = (x0, y0, x1, y1) => {
      const a = box(E.IX, x0, y0, x1, y1), b = box(E.IY, x0, y0, x1, y1);
      return { s: a.s + b.s, n: a.n };
    };
    let bare = 0;
    for (const r of P.bare) bare += all(ox + r.x * u + d, oy + r.y * v + d, ox + (r.x + r.w) * u - d, oy + (r.y + r.h) * v - d).s;
    // the bezel: the board (less its outline) outside the keys' area
    const mx = E.w * 0.035, my = E.h * 0.06, outer = all(mx, my, E.w - mx, E.h - my);
    const inA = all(Math.max(mx, ox - d), Math.max(my, oy - d), Math.min(E.w - mx, ox + tw * u + d), Math.min(E.h - my, oy + th * v + d));
    const bez = Math.max(0, outer.s - inA.s);
    const p = { edge: (2 * bs) / Math.max(1, bn), face: is / Math.max(1, inn), left: (bare + bez) / Math.max(1, outer.n) };
    if (parts) Object.assign(parts, p);
    return p.edge - 0.5 * p.face - LEFT * p.left;
  }

  // rows first (where the level key edges line up), then the columns row by row, then a
  // fine search around the best
  // where the keys are: rows of keys have upright edges between neighbouring caps (a
  // case's front face or a bare bezel doesn't), and columns of keys have level ones. The
  // longest well-filled run each way, a little smoothed so the gaps between rows don't
  // break it
  function keySpan(E) {
    const run = (vals, sm, bridge) => {
      const n = vals.length, s = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let a = 0, c = 0;
        for (let j = Math.max(0, i - sm); j <= Math.min(n - 1, i + sm); j++) (a += vals[j]), c++;
        s[i] = a / c;
      }
      const cut = Math.max(...s) * 0.3, segs = [];
      let st = -1;
      for (let i = 0; i <= n; i++) {
        if (i < n && s[i] >= cut) {
          if (st < 0) st = i;
        } else if (st >= 0) {
          segs.push([st, i]);
          st = -1;
        }
      }
      // the gap over an f-row or beside a nav cluster is short: bridged
      const merged = [];
      segs.forEach((g) => {
        const last = merged[merged.length - 1];
        if (last && g[0] - last[1] <= bridge) last[1] = g[1];
        else merged.push(g.slice());
      });
      return merged.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] || [0, n];
    };
    const rows = [], cols = [];
    for (let y = 0; y < E.h; y++) rows.push(box(E.IX, E.w * 0.04, y, E.w * 0.96, y + 1).s);
    for (let x = 0; x < E.w; x++) cols.push(box(E.IY, x, E.h * 0.05, x + 1, E.h * 0.95).s);
    return { y: run(rows, Math.round(E.h * 0.02), E.h * 0.1), x: run(cols, Math.round(E.w * 0.01), E.w * 0.035) };
  }

  function fitOne(E, t, flip, span) {
    const P = prepare(t, flip), keys = P.keys, W = E.w, H = E.h;
    // level edges per row of the photo
    const py = new Float64Array(H);
    for (let y = 0; y < H; y++) py[y] = box(E.IY, W * 0.05, y, W * 0.95, y + 1).s;
    const ys = new Map();
    keys.forEach((k) => [k.y, k.y + k.h].forEach((y) => ys.set(y.toFixed(3), (ys.get(y.toFixed(3)) || 0) + (k.band ? t.w / 14 : k.w))));
    const yb = [...ys.entries()].map(([y, wt]) => [+y, wt]);
    const ywt = yb.reduce((s, p) => s + p[1], 0);
    const pyAt = (y) => {
      const i = Math.round(y);
      return i < 1 || i >= H - 1 ? 0 : py[i] + 0.6 * (py[i - 1] + py[i + 1]);
    };
    const vc = [];
    const ky = span.y, kx = span.x, sy = H * 0.03, sx = W * 0.02;
    for (let kh = 0.62; kh <= 1.001; kh += 0.01) {
      const v = (kh * H) / t.h;
      if (!span.loose && v * t.h < (ky[1] - ky[0]) * 0.88) continue;
      for (let oy = 0; oy + v * t.h <= H; oy += 1) {
        if (oy < ky[0] - sy || oy + v * t.h > ky[1] + sy) continue;
        let s = 0;
        for (const [y, wt] of yb) s += pyAt(oy + y * v) * wt;
        vc.push({ v, oy, s: s / ywt });
      }
    }
    vc.sort((a, b) => b.s - a.s);
    let best = null;
    for (const c of vc.slice(0, 4)) {
      // per key row (the f-row band aside): upright edges across that row's height
      const rows = new Map();
      keys.forEach((k) => {
        if (k.band) return;
        const key = k.y.toFixed(3) + ':' + k.h;
        if (!rows.has(key)) rows.set(key, { y: k.y, h: k.h, xs: [] });
        rows.get(key).xs.push(k.x, k.x + k.w);
      });
      const prof = [...rows.values()].map((r) => {
        const y0 = c.oy + (r.y + 0.15) * c.v, y1 = c.oy + (r.y + r.h - 0.15) * c.v, p = new Float64Array(W);
        for (let x = 0; x < W; x++) p[x] = box(E.IX, x, y0, x + 1, y1).s;
        return { p, xs: [...new Set(r.xs.map((x) => x.toFixed(3)))].map(Number) };
      });
      const nx = prof.reduce((s, r) => s + r.xs.length, 0);
      const at = (p, x) => {
        const i = Math.round(x);
        return i < 1 || i >= W - 1 ? 0 : p[i] + 0.6 * (p[i - 1] + p[i + 1]);
      };
      let hb = null;
      for (let kw = 0.74; kw <= 1.001; kw += 0.005) {
        const u = (kw * W) / t.w, ratio = c.v / u;
        if (ratio < 0.68 || ratio > 1.2 || (!span.loose && u * t.w < (kx[1] - kx[0]) * 0.88)) continue;
        for (let ox = 0; ox + u * t.w <= W; ox += 1) {
          if (ox < kx[0] - sx || ox + u * t.w > kx[1] + sx) continue;
          let s = 0;
          for (const r of prof) for (const x of r.xs) s += at(r.p, ox + x * u);
          s /= nx;
          if (!hb || s > hb.s) hb = { u, ox, s };
        }
      }
      if (!hb) continue;
      // fine: everything together, a pixel or two either way
      let cur = { u: hb.u, v: c.v, ox: hb.ox, oy: c.oy };
      let cs = score(E, P, t.w, t.h, cur.u, cur.v, cur.ox, cur.oy);
      for (let pass = 0; pass < 4; pass++) {
        for (const [du, dv, dx, dy] of [[0.004, 0, 0, 0], [-0.004, 0, 0, 0], [0, 0.004, 0, 0], [0, -0.004, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]]) {
          const n = { u: cur.u * (1 + du), v: cur.v * (1 + dv), ox: cur.ox + dx, oy: cur.oy + dy };
          if (n.ox < 0 || n.oy < 0 || n.ox + n.u * t.w > W || n.oy + n.v * t.h > H) continue;
          const s = score(E, P, t.w, t.h, n.u, n.v, n.ox, n.oy);
          if (s > cs) (cs = s), (cur = n);
        }
      }
      if (!best || cs > best.s) best = Object.assign({ s: cs }, cur);
    }
    if (!best) return null;
    best.parts = {};
    score(E, P, t.w, t.h, best.u, best.v, best.ox, best.oy, best.parts);
    return Object.assign(best, { t, flip, keys });
  }

  /* ---------------------------------- 5. the colors ---------------------------------- */
  const hex = (p) => '#' + p.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  // near-black reads warm or cool from the room's light; it's taken as the neutral it is
  const calm = (p) => {
    const L = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    if (L > 80) return p;
    const k = L < 50 ? 0.4 : 0.4 + ((L - 50) / 30) * 0.6;
    return p.map((c) => L + (c - L) * k);
  };
  // a perceptual distance (sRGB → Lab)
  function lab(p) {
    const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const [r, g, b] = p.map(f);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089;
    const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
  }
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  function pixelsIn(E, x0, y0, x1, y1) {
    const out = [];
    const xa = Math.max(0, Math.round(x0)), xb = Math.min(E.w, Math.round(x1)), ya = Math.max(0, Math.round(y0)), yb = Math.min(E.h, Math.round(y1));
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const i = (y * E.w + x) * 4;
      out.push([E.d[i], E.d[i + 1], E.d[i + 2]]);
    }
    return out;
  }
  // per channel median (legends are thin, so they drop out) and how much of the window is
  // that color: a window on one cap's face is nearly all one color, one over a gap isn't
  function sample(E, x0, y0, x1, y1) {
    const px = pixelsIn(E, x0, y0, x1, y1);
    if (px.length < 4) return null;
    const c = [0, 1, 2].map((k) => med(px.map((p) => p[k])));
    const near = px.filter((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 36).length / px.length;
    return { c, near };
  }

  // the light in the photo: a warm lamp turns white caps cream. The brightest bits of the
  // board (cap tops catching the light) are taken as white, gently
  function whiteOf(E) {
    const lum = [];
    for (let i = 0; i < E.d.length; i += 8) lum.push([0.299 * E.d[i] + 0.587 * E.d[i + 1] + 0.114 * E.d[i + 2], i]);
    lum.sort((a, b) => b[0] - a[0]);
    const top = lum.slice(0, Math.max(10, Math.floor(lum.length * 0.015)));
    const avg = [0, 1, 2].map((k) => top.reduce((s, p) => s + E.d[p[1] + k], 0) / top.length);
    const mx = Math.max(...avg);
    if (mx < 60) return [1, 1, 1]; // a dark photo: nothing to go by
    return avg.map((c) => U.clamp(Math.pow(Math.min(250, mx * 1.04) / Math.max(1, c), 0.85), 0.9, 1.35));
  }

  // the f-row as built. Makers space its groups differently (Esc right by F1, an F13, a
  // knob), so each group (Esc · F1–F4 · F5–F8 · F9–F12 · Print… / Delete) slides along the
  // row on its own, in order, to where its key boundaries sit on the gaps between caps and
  // its keys are most alike in color (a grey F5–F8 block lands on the grey caps)
  function bandPlaces(E, fit, band, fix) {
    const { u, v, ox, oy } = fit, by = band[0].y;
    const y0 = Math.round(oy + (by + 0.25) * v), y1 = Math.round(oy + (by + 0.75) * v);
    if (y1 - y0 < 2) return null;
    const r = Math.max(2, Math.round(0.22 * u)), area = (2 * r + 1) * (y1 - y0);
    const xa = Math.max(0, Math.floor(ox - 1.8 * u)), xb = Math.min(E.w, Math.ceil(ox + (fit.t.w + 1.8) * u));
    const edge = new Float64Array(E.w), col = new Array(E.w);
    for (let x = xa; x < xb; x++) {
      edge[x] = box(E.IX, x - r, y0, x + r + 1, y1).s / area;
      const s = sample(E, x, y0 + (y1 - y0) * 0.2, x + 1, y1 - (y1 - y0) * 0.2);
      col[x] = s && lab(fix(s.c));
    }
    const at = (x) => edge[Math.max(0, Math.min(E.w - 1, Math.round(x)))];
    const face = (x) => {
      const out = [];
      for (let d = -0.15 * u; d <= 0.15 * u; d += 1) {
        const c = col[Math.round(x + d)];
        if (c) out.push(c);
      }
      return out.length ? [0, 1, 2].map((k) => med(out.map((p) => p[k]))) : null;
    };
    const sorted = band.slice().sort((p, q) => p.x - q.x), groups = [];
    sorted.forEach((k) => {
      const g = groups[groups.length - 1], last = g && g[g.length - 1];
      if (last && k.x - (last.x + last.w) < 0.01) g.push(k);
      else groups.push([k]);
    });
    // Esc always starts the row and the keys after F12 always end it: those stay put; the
    // F-key groups move between them, in order
    const out = new Map(), set = (g, s0) => g.forEach((k, i) => out.set(k, [s0 + i * u, s0 + (i + 1) * u]));
    const isF = (g) => /^Fd+$/.test(g[0].codes[0]);
    const first = isF(groups[0]) ? null : groups[0], last = groups.length > 1 && !isF(groups[groups.length - 1]) ? groups[groups.length - 1] : null;
    if (first) set(first, ox + first[0].x * u);
    if (last) set(last, ox + last[0].x * u);
    let minX = first ? ox + (first[first.length - 1].x + 1) * u : ox - 0.3 * u;
    const maxX = last ? ox + last[0].x * u : ox + (fit.t.w + 0.3) * u;
    for (const g of groups) {
      if (g === first || g === last) continue;
      const n = g.length, t0 = ox + g[0].x * u;
      let best = null;
      for (let s = t0 - 1.25 * u; s <= t0 + 1.25 * u; s += 1) {
        if (s < minX - 0.05 * u || s + n * u > maxX + 0.05 * u) continue;
        let e = 0;
        for (let i = 0; i <= n; i++) e += at(s + i * u);
        for (let i = 0; i < n; i++) e -= at(s + (i + 0.5) * u);
        const fs = [];
        for (let i = 0; i < n; i++) {
          const c = face(s + (i + 0.5) * u);
          if (c) fs.push(c);
        }
        let spread = 0;
        if (fs.length > 1) {
          const m = [0, 1, 2].map((k) => med(fs.map((p) => p[k])));
          spread = fs.reduce((acc, c) => acc + dE(c, m), 0) / fs.length;
        }
        const sc = e / (n + 1) - 1.5 * spread;
        if (!best || sc > best.sc) best = { s, sc };
      }
      if (!best) return null;
      set(g, best.s);
      minX = best.s + n * u;
    }
    return out;
  }

  // keys of one color share one: start with every key on its own and keep joining the two
  // closest groups (by their average) until no two are within reach
  function group(cols, reach) {
    let gs = [];
    cols.forEach((c, i) => c && gs.push({ sum: c.slice(), n: 1, idx: [i], rgb: c.slice(), lab: lab(c) }));
    for (;;) {
      let bi = -1, bj = -1, bd = reach;
      for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
        const d = dE(gs[i].lab, gs[j].lab);
        if (d < bd) (bd = d), (bi = i), (bj = j);
      }
      if (bi < 0) break;
      const a = gs[bi], b = gs[bj];
      a.sum = a.sum.map((v, k) => v + b.sum[k]);
      a.n += b.n;
      a.idx = a.idx.concat(b.idx);
      a.rgb = a.sum.map((v) => v / a.n);
      a.lab = lab(a.rgb);
      gs.splice(bj, 1);
    }
    return gs.sort((p, q) => q.n - p.n);
  }

  // the light across the board: a lamp to one side leaves the far keys darker and warmer.
  // The board's main key color (the biggest group) shows how: a smooth curve per channel
  // across the board, fitted to those keys, is divided out of every key
  function evenLight(raw, pos, u) {
    // a few rounds: keys that read too dark at first join the main color once the light
    // is evened, and then help fit it out to the board's edge
    let cols = raw;
    for (let r = 0; r < 3; r++) cols = evenOnce(raw, cols, pos, u);
    return cols;
  }
  function evenOnce(raw, now, pos, u) {
    const cols = raw, g0 = group(now, 9)[0];
    if (!g0 || g0.n < 12) return now;
    const P = g0.idx.map((i) => pos[i]);
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const lo = [Math.min(...xs) - 1.5 * u, Math.min(...ys) - 1.5 * u], hi = [Math.max(...xs) + 1.5 * u, Math.max(...ys) + 1.5 * u];
    const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, sx = (hi[0] - lo[0]) / 2 || 1, sy = (hi[1] - lo[1]) / 2 || 1;
    const terms = (x, y) => {
      const a = (U.clamp(x, lo[0], hi[0]) - cx) / sx, b = (U.clamp(y, lo[1], hi[1]) - cy) / sy;
      return [1, a, b, a * a, b * b, a * b];
    };
    // least squares, one channel at a time (normal equations, 6×6)
    const solve = (A, y) => {
      const n = A[0].length, M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
      A.forEach((r, i) => {
        for (let p = 0; p < n; p++) {
          for (let q = 0; q < n; q++) M[p][q] += r[p] * r[q];
          M[p][n] += r[p] * y[i];
        }
      });
      for (let p = 0; p < n; p++) M[p][p] += 1e-6 + (p ? 0.5 : 0); // a little damping
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        [M[c], M[piv]] = [M[piv], M[c]];
        for (let r = 0; r < n; r++) {
          if (r === c || !M[c][c]) continue;
          const f = M[r][c] / M[c][c];
          for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
      }
      return M.map((r, i) => (r[i] ? r[n] / r[i] : 0));
    };
    const A = P.map((p) => terms(p[0], p[1]));
    const models = [0, 1, 2].map((k) => solve(A, g0.idx.map((i) => cols[i][k])));
    const ref = [0, 1, 2].map((k) => g0.idx.reduce((a, i) => a + raw[i][k], 0) / g0.n);
    return cols.map((c, i) => {
      if (!c) return c;
      const t = terms(pos[i][0], pos[i][1]);
      return c.map((v, k) => {
        const m = t.reduce((s, x, j) => s + x * models[k][j], 0);
        return U.clamp(v * U.clamp(ref[k] / Math.max(1, m), 0.75, 1.35), 0, 255);
      });
    });
  }

  function colorsOf(E, fit) {
    const { keys, u, v, ox, oy } = fit;
    const wb = whiteOf(E), fix = (c) => c.map((x, k) => U.clamp(x * wb[k], 0, 255));
    // where each key is: the fit, but the f-row from the photo itself
    const place = keys.map((k) => ({ x: ox + k.x * u, y: oy + k.y * v, w: k.w * u, h: k.h * v }));
    const band = keys.filter((k) => k.band);
    const bp = band.length && bandPlaces(E, fit, band, fix);
    if (bp) keys.forEach((k, i) => bp.has(k) && Object.assign(place[i], { x: bp.get(k)[0], w: bp.get(k)[1] - bp.get(k)[0] }));
    // each key's color: from the face of its cap. Caps are smaller than their slot and
    // their top sits a little high in most photos, so the window is nudged around the
    // middle to wherever it's most one color
    const at = (cx, cy, cw, ch) => {
      let best = null;
      for (let dy = -0.12; dy <= 0.121; dy += 0.06) for (let dx = -0.15; dx <= 0.151; dx += 0.075) {
        const s = sample(E, cx + dx * u - cw / 2, cy + dy * v - ch / 2, cx + dx * u + cw / 2, cy + dy * v + ch / 2);
        if (s && (!best || s.near > best.near + 0.02)) best = s;
      }
      return best && best.c;
    };
    const raw = place.map((p) => {
      const cw = Math.min(p.w, u * 1.2) * 0.4, ch = Math.min(p.h, v * 1.2) * 0.32, cy = p.y + p.h * 0.45;
      // a long key (a spacebar, a shift) in several places along it, the middle darkness
      // taken: a shine across part of it doesn't decide its color
      const n = p.w > 1.6 * u ? 5 : 1;
      const cs = [];
      for (let i = 0; i < n; i++) {
        const c = at(p.x + (n === 1 ? 0.5 : 0.15 + (0.7 * i) / (n - 1)) * p.w, cy, cw, ch);
        if (c) cs.push(c);
      }
      if (!cs.length) return null;
      cs.sort((q, w) => q[0] + q[1] + q[2] - (w[0] + w[1] + w[2]));
      // a dark key: its darkest reading (a shine only ever brightens); a light one: the
      // middle (shadows and legends only ever darken)
      const mid = cs[cs.length >> 1], dark = 0.299 * mid[0] + 0.587 * mid[1] + 0.114 * mid[2] < 110;
      return fix(dark ? cs[0] : mid);
    });
    const cols = evenLight(raw, place.map((p) => [p.x + p.w / 2, p.y + p.h / 2]), u);
    const gs = group(cols, 9);
    const owner = new Array(keys.length);
    gs.forEach((g) => g.idx.forEach((i) => (owner[i] = g)));
    // each kind of key takes the color most of its keys have; keys that differ keep theirs
    const commonIn = (cls) => {
      const n = new Map();
      keys.forEach((k, i) => cls.includes(k.cls) && owner[i] && n.set(owner[i], (n.get(owner[i]) || 0) + (k.band ? 0.5 : 1)));
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0];
    };
    const ga = (commonIn(['alpha']) || [gs[0]])[0], gm = (commonIn(['mod']) || [ga])[0], gx = (commonIn(['accent']) || [gm])[0];
    gs.forEach((g) => (g.rgb = calm(g.rgb)));
    const a = hex(ga.rgb), m = hex(gm.rgb), x = hex(gx.rgb);
    const want = { alpha: ga, mod: gm, space: gm, accent: gx };
    const tint = {};
    keys.forEach((k, i) => {
      const g = owner[i];
      if (g && g !== want[k.cls]) k.codes.forEach((cd) => (tint[cd] = hex(g.rgb)));
    });
    // the case: bare case between the key blocks, and a thin band of bezel right around
    // the keys (never the photo's margin)
    const px = [];
    fit.bare.forEach((r) => {
      if (r.w * u < 0.5 * u || r.h * v < 0.2 * v) return;
      px.push(...pixelsIn(E, ox + r.x * u + 0.15 * u, oy + r.y * v + 0.05 * v, ox + (r.x + r.w) * u - 0.15 * u, oy + (r.y + r.h) * v - 0.05 * v));
    });
    const kx1 = ox + fit.t.w * u, ky1 = oy + fit.t.h * v, gap = 0.08 * u, wide = 0.3 * u;
    px.push(...pixelsIn(E, ox - wide, oy, ox - gap, ky1), ...pixelsIn(E, kx1 + gap, oy, kx1 + wide, ky1), ...pixelsIn(E, ox, ky1 + gap, kx1, ky1 + wide));
    let caseColor;
    if (px.length > 20) {
      // the most common darkness there (shadows and stray cap edges on either side)
      const byL = px.map((p) => [0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2], p]).sort((p, q) => p[0] - q[0]);
      const mid = byL.slice(Math.floor(byL.length * 0.3), Math.ceil(byL.length * 0.7)).map((q) => q[1]);
      caseColor = hex(calm(fix([0, 1, 2].map((k) => med(mid.map((p) => p[k]))))));
    } else caseColor = U.shade(a, -0.35);
    return { caseColor, place, paint: { a, al: U.readable(a), m, ml: U.readable(m), x, xl: U.readable(x), keys: tint }, groups: gs.length };
  }

  /* ------------------------------------ reading ------------------------------------ */
  // the coarse angle sharpened: the one at which the key edges stack into the tightest
  // lines (a photo taken at a slant fans the columns out a little; the rows stay true)
  function refineAngle(gx, gy, w, h, deg) {
    const a0 = (deg * Math.PI) / 180, pts = [];
    for (let i = 0; i < gx.length; i += 2) {
      const m = Math.abs(gx[i]) + Math.abs(gy[i]);
      if (m < 90) continue;
      let r = Math.atan2(gy[i], gx[i]) - a0;
      r = ((r % (Math.PI / 2)) + Math.PI * 2.5) % (Math.PI / 2);
      if (r > Math.PI / 4) r -= Math.PI / 2;
      if (Math.abs(r) > 0.16) continue;
      // which family: gradient along the grid's x (upright edges) or its y (level ones)
      const ang = Math.atan2(gy[i], gx[i]) - a0, fam = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? 0 : 1;
      pts.push(i % w, Math.floor(i / w), m, fam);
    }
    const n = w + h + 4, hist = [new Float64Array(n * 2), new Float64Array(n * 2)];
    let best = deg, bs = -1;
    for (let d = deg - 7; d <= deg + 7.001; d += 0.1) {
      const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      hist[0].fill(0);
      hist[1].fill(0);
      for (let j = 0; j < pts.length; j += 4) {
        const x = pts[j], y = pts[j + 1], f = pts[j + 3];
        const p = f === 0 ? x * c + y * s : -x * s + y * c;
        hist[f][Math.round(p) + n] += pts[j + 2];
      }
      let sc = 0;
      for (const hh of hist) for (let i = 0; i < hh.length; i++) sc += hh[i] * hh[i];
      if (sc > bs) (bs = sc), (best = d);
    }
    return best;
  }

  /*
   * R.read(img, { layout, turn, angle }) → { layout, turn, angle, caseColor, paint,
   * board (a canvas: the straightened board), keys (where each key sits on it) } or null.
   * layout: only try this size. turn (+ angle): the way up is known, use it.
   */
  R.read = function (img, opts) {
    opts = opts || {};
    const S = 720, k0 = Math.min(1, S / Math.max(img.width, img.height));
    const base = canvas(img.width * k0, img.height * k0);
    ctx(base).drawImage(img, 0, 0, base.width, base.height);
    const fill = average(rgba(base));
    const forced = opts.turn !== undefined;
    let angle = 0, turn = 0, bb, src;
    if (forced) {
      angle = opts.angle || 0;
      turn = opts.turn;
      src = turned(base, angle + turn, fill);
      bb = boardBox(src);
    } else {
      const L = luma(rgba(base), base.width * base.height), g = sobel(L, base.width, base.height);
      angle = -refineAngle(g.gx, g.gy, base.width, base.height, gridAngle(g.gx, g.gy));
      src = Math.abs(angle) > 0.2 ? turned(base, angle, fill) : base;
      bb = boardBox(src);
      // standing up: a quarter turn
      if (bb && bb.y1 - bb.y0 > (bb.right(bb.y0) - bb.left(bb.y0)) * 1.05) {
        turn = 90;
        src = turned(base, angle + 90, fill);
        bb = boardBox(src);
      }
    }
    if (!bb) {
      // nothing stood out: the whole photo is the board
      bb = { y0: 0, y1: src.height, left: () => 0, right: () => src.width, w: src.width, h: src.height };
    }
    const rec = rectify(src, bb, 640), E = edgesOf(rec.c);
    let best = null;
    const all = [];
    const span = keySpan(E);
    templates(opts.layout).forEach((t) => {
      // a known way up stays; otherwise upside down is tried too
      (forced ? [false] : [false, true]).forEach((flip) => {
        const f = fitOne(E, t, flip, span);
        if (!f) return;
        all.push({ id: t.id, flip, s: +f.s.toFixed(1), p: Object.fromEntries(Object.entries(f.parts).map(([k, v]) => [k, Math.round(v)])) });
        if (!best || f.s > best.s) best = f;
      });
    });
    if (!best) {
      // the key region measured wrong (a busy photo): fit without it
      const free = { x: [0, E.w], y: [0, E.h], loose: true };
      templates(opts.layout).forEach((t) => (forced ? [false] : [false, true]).forEach((flip) => {
        const f = fitOne(E, t, flip, free);
        if (f && (!best || f.s > best.s)) best = f;
      }));
    }
    if (!best) return null;
    let board = rec.c, E2 = E, fit = Object.assign({}, best, { bare: prepare(best.t, false).bare });
    if (best.flip) {
      // upside down: turn the straightened board over and read it the right way up
      board = turned(rec.c, 180, fill);
      E2 = edgesOf(board);
      Object.assign(fit, { keys: best.t.keys, ox: E.w - best.ox - best.t.w * best.u, oy: E.h - best.oy - best.t.h * best.v });
      turn = (turn + 180) % 360;
    }
    const col = colorsOf(E2, fit);
    return { layout: best.t.id, turn, angle, scores: all, caseColor: col.caseColor, paint: col.paint, groups: col.groups, board, keys: col.place };
  };
})();
