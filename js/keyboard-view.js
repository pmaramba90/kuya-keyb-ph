(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog;

  /* --------------------------------- layouts --------------------------------- */
  const k = (l, code, w, cls) => {
    const codes = Array.isArray(code) ? code : [code];
    return { l, codes, lg: codes[0], w: w || 1, cls: cls || 'alpha' };
  };
  const gap = (w) => ({ gap: true, w });

  const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => k(d, 'Digit' + d));
  const row1 = (first) => [first, ...NUMS, k('-', 'Minus'), k('=', 'Equal'), k('backspace', 'Backspace', 2, 'mod')];
  const letters = (s) => s.split('').map((c) => k(c.toUpperCase(), 'Key' + c.toUpperCase()));
  const row2 = () => [k('tab', 'Tab', 1.5, 'mod'), ...letters('qwertyuiop'), k('[', 'BracketLeft'), k(']', 'BracketRight'), k('\\', 'Backslash', 1.5)];
  const row3 = () => [k('caps', 'CapsLock', 1.75, 'mod'), ...letters('asdfghjkl'), k(';', 'Semicolon'), k("'", 'Quote'), k('enter', 'Enter', 2.25, 'accent')];
  const row4 = (rs) => [k('shift', 'ShiftLeft', 2.25, 'mod'), ...letters('zxcvbnm'), k(',', 'Comma'), k('.', 'Period'), k('/', 'Slash'), k('shift', 'ShiftRight', rs, 'mod')];
  const bottom60 = () => [k('ctrl', 'ControlLeft', 1.25, 'mod'), k('win', 'MetaLeft', 1.25, 'mod'), k('alt', 'AltLeft', 1.25, 'mod'), k('', 'Space', 6.25, 'space'), k('alt', 'AltRight', 1.25, 'mod'), k('win', 'MetaRight', 1.25, 'mod'), k('menu', 'ContextMenu', 1.25, 'mod'), k('ctrl', 'ControlRight', 1.25, 'mod')];
  const bottom65 = () => [k('ctrl', 'ControlLeft', 1.25, 'mod'), k('win', 'MetaLeft', 1.25, 'mod'), k('alt', 'AltLeft', 1.25, 'mod'), k('', 'Space', 6.25, 'space'), k('alt', 'AltRight', 1, 'mod'), k('fn', 'Fn', 1, 'mod'), k('ctrl', 'ControlRight', 1, 'mod'), k('←', 'ArrowLeft', 1, 'mod'), k('↓', 'ArrowDown', 1, 'mod'), k('→', 'ArrowRight', 1, 'mod')];
  const fkeys = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => k('f' + (a + i), 'F' + (a + i), 1, 'mod'));
  const escGrave = () => Object.assign(k('esc', ['Backquote', 'Escape'], 1, 'accent'), { lg: 'Escape' });

  /* --------------------------------- legends --------------------------------- */
  const SHIFTED = {
    Backquote: ['`', '~'], Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
    Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'], Minus: ['-', '_'], Equal: ['=', '+'],
    BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'], Semicolon: [';', ':'], Quote: ["'", '"'],
    Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
  };
  const ARROWS = { ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→' };
  // JIS kana and Korean dubeolsik sub-legends, as printed on Japanese / Hangul sets
  const KANA = { KeyQ: 'た', KeyW: 'て', KeyE: 'い', KeyR: 'す', KeyT: 'か', KeyY: 'ん', KeyU: 'な', KeyI: 'に', KeyO: 'ら', KeyP: 'せ', KeyA: 'ち', KeyS: 'と', KeyD: 'し', KeyF: 'は', KeyG: 'き', KeyH: 'く', KeyJ: 'ま', KeyK: 'の', KeyL: 'り', KeyZ: 'つ', KeyX: 'さ', KeyC: 'そ', KeyV: 'ひ', KeyB: 'こ', KeyN: 'み', KeyM: 'も', Digit1: 'ぬ', Digit2: 'ふ', Digit3: 'あ', Digit4: 'う', Digit5: 'え', Digit6: 'お', Digit7: 'や', Digit8: 'ゆ', Digit9: 'よ', Digit0: 'わ', Minus: 'ほ', Equal: 'へ', BracketLeft: '゛', BracketRight: 'む', Semicolon: 'れ', Quote: 'け', Comma: 'ね', Period: 'る', Slash: 'め' };
  const HANGUL = { KeyQ: 'ㅂ', KeyW: 'ㅈ', KeyE: 'ㄷ', KeyR: 'ㄱ', KeyT: 'ㅅ', KeyY: 'ㅛ', KeyU: 'ㅕ', KeyI: 'ㅑ', KeyO: 'ㅐ', KeyP: 'ㅔ', KeyA: 'ㅁ', KeyS: 'ㄴ', KeyD: 'ㅇ', KeyF: 'ㄹ', KeyG: 'ㅎ', KeyH: 'ㅗ', KeyJ: 'ㅓ', KeyK: 'ㅏ', KeyL: 'ㅣ', KeyZ: 'ㅋ', KeyX: 'ㅌ', KeyC: 'ㅊ', KeyV: 'ㅍ', KeyB: 'ㅠ', KeyN: 'ㅜ', KeyM: 'ㅡ' };

  // modifier wording per maker style
  const MOD_WORDS = {
    gmk: { Escape: 'Esc', Backspace: '←', Tab: '⇥', CapsLock: '⇩', Enter: '↵', Shift: '⇧', Control: 'Control', Meta: 'Super', Alt: 'Alt', ContextMenu: 'Menu', Fn: 'Fn', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'Pg Up', PageDown: 'Pg Dn', PrintScreen: 'Print', ScrollLock: 'Scroll', Pause: 'Pause' },
    oem: { Escape: 'Esc', Backspace: '← Backspace', Tab: 'Tab ⇆', CapsLock: 'Caps Lock', Enter: '↵ Enter', Shift: '⇧ Shift', Control: 'Ctrl', Meta: 'Win', Alt: 'Alt', ContextMenu: 'Menu', Fn: 'Fn', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause' },
    ducky: { Escape: 'Esc', Backspace: '←', Tab: '⇆', CapsLock: 'Caps', Enter: '↵', Shift: '⇧', Control: 'Ctrl', Meta: '⊞', Alt: 'Alt', ContextMenu: '▤', Fn: 'Fn', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause' },
    upper: { Escape: 'ESC', Backspace: 'BACK', Tab: 'TAB', CapsLock: 'CAPS LOCK', Enter: 'ENTER', Shift: 'SHIFT', Control: 'CTRL', Meta: 'WIN', Alt: 'ALT', ContextMenu: 'MENU', Fn: 'FN', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN', PrintScreen: 'PRTSC', ScrollLock: 'SCRLK', Pause: 'PAUSE' },
    upperIcon: { Escape: 'ESC', Backspace: '← BACKSPACE', Tab: 'TAB', CapsLock: 'CAPS', Enter: '← ENTER', Shift: '↑ SHIFT', Control: 'CTRL', Meta: 'WIN', Alt: 'ALT', ContextMenu: 'MENU', Fn: 'FN', Delete: 'DEL', Insert: 'INS', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN', PrintScreen: 'PRTSC', ScrollLock: 'SCRLK', Pause: 'PAUSE' },
    lower: { Escape: 'esc', Backspace: 'delete', Tab: 'tab', CapsLock: 'caps lock', Enter: 'return', Shift: 'shift', Control: 'control', Meta: '◇', Alt: 'alt', ContextMenu: 'menu', Fn: 'fn', Delete: 'del', Insert: 'ins', Home: 'home', End: 'end', PageUp: 'pg up', PageDown: 'pg dn', PrintScreen: 'psc', ScrollLock: 'scr lk', Pause: 'pause' },
  };
  const modWord = (style, code) => {
    const t = MOD_WORDS[style] || MOD_WORDS.oem;
    return t[code] !== undefined ? t[code] : t[code.replace(/(Left|Right)$/, '')];
  };

  function legendHTML(key, st) {
    if (st.blank || key.cls === 'space') return '';
    const code = key.lg;
    let main, cls = '';
    if (/^Key[A-Z]$/.test(code)) main = U.esc(st.alpha === 'lower' ? code[3].toLowerCase() : code[3]);
    else if (SHIFTED[code]) {
      const [b, s] = SHIFTED[code].map(U.esc);
      if (st.nums === 'stack') {
        main = `<b>${s}</b><b>${b}</b>`;
        cls = 'stk';
      } else if (st.nums === 'side') {
        main = b + '&#8201;' + s;
        cls = 'side';
      } else main = b;
    } else if (/^F\d+$/.test(code)) {
      main = st.mods === 'lower' ? code.toLowerCase() : code;
      cls = 'sm';
    } else if (ARROWS[code]) main = ARROWS[code];
    else {
      const w = modWord(st.mods, code);
      main = U.esc(w !== undefined ? w : key.l);
      cls = [...(w || key.l)].length > 2 ? 'sm' : 'ico';
    }
    const subs = st.sub === 'kana' ? KANA : st.sub === 'hangul' ? HANGUL : null;
    const sub = subs && subs[code] ? `<i>${subs[code]}</i>` : '';
    return `<span class="lg ${cls}">${main}</span>${sub}`;
  }

  const LAYOUTS = {
    '60': () => [row1(escGrave()), row2(), row3(), row4(2.75), bottom60()],
    '65': () => [
      [...row1(escGrave()), k('del', 'Delete', 1, 'mod')],
      [...row2(), k('pgup', 'PageUp', 1, 'mod')],
      [...row3(), k('pgdn', 'PageDown', 1, 'mod')],
      [...row4(1.75), k('↑', 'ArrowUp', 1, 'mod'), k('end', 'End', 1, 'mod')],
      bottom65(),
    ],
    '75': () => [
      [k('esc', 'Escape', 1, 'accent'), gap(0.25), ...fkeys(1, 4), gap(0.25), ...fkeys(5, 8), gap(0.25), ...fkeys(9, 12), gap(0.25), k('prt', 'PrintScreen', 1, 'mod'), k('del', 'Delete', 1, 'mod')],
      'gap',
      [...row1(k('`', 'Backquote')), k('home', 'Home', 1, 'mod')],
      [...row2(), k('pgup', 'PageUp', 1, 'mod')],
      [...row3(), k('pgdn', 'PageDown', 1, 'mod')],
      [...row4(1.75), k('↑', 'ArrowUp', 1, 'mod'), k('end', 'End', 1, 'mod')],
      bottom65(),
    ],
    tkl: () => [
      [k('esc', 'Escape', 1, 'accent'), gap(1), ...fkeys(1, 4), gap(0.5), ...fkeys(5, 8), gap(0.5), ...fkeys(9, 12), gap(0.25), k('prt', 'PrintScreen', 1, 'mod'), k('scr', 'ScrollLock', 1, 'mod'), k('pse', 'Pause', 1, 'mod')],
      'gap',
      [...row1(k('`', 'Backquote')), gap(0.25), k('ins', 'Insert', 1, 'mod'), k('home', 'Home', 1, 'mod'), k('pgup', 'PageUp', 1, 'mod')],
      [...row2(), gap(0.25), k('del', 'Delete', 1, 'mod'), k('end', 'End', 1, 'mod'), k('pgdn', 'PageDown', 1, 'mod')],
      [...row3()],
      [...row4(2.75), gap(1.25), k('↑', 'ArrowUp', 1, 'mod')],
      [...bottom60(), gap(0.25), k('←', 'ArrowLeft', 1, 'mod'), k('↓', 'ArrowDown', 1, 'mod'), k('→', 'ArrowRight', 1, 'mod')],
    ],
  };

  // full size = tkl + numpad (with the two tall keys)
  const tall = (key) => Object.assign(key, { h: 2 });
  LAYOUTS.full = () => {
    const t = LAYOUTS.tkl();
    const np = (l, code, cls) => k(l, code, 1, cls || 'alpha');
    t[2] = [...t[2], gap(0.25), np('num', 'NumLock', 'mod'), np('/', 'NumpadDivide', 'mod'), np('*', 'NumpadMultiply', 'mod'), np('-', 'NumpadSubtract', 'mod')];
    t[3] = [...t[3], gap(0.25), np('7', 'Numpad7'), np('8', 'Numpad8'), np('9', 'Numpad9'), tall(np('+', 'NumpadAdd', 'mod'))];
    t[4] = [...t[4], gap(3.5), np('4', 'Numpad4'), np('5', 'Numpad5'), np('6', 'Numpad6')];
    t[5] = [...t[5], gap(1.25), np('1', 'Numpad1'), np('2', 'Numpad2'), np('3', 'Numpad3'), tall(k('enter', 'NumpadEnter', 1, 'accent'))];
    t[6] = [...t[6], gap(0.25), k('0', 'Numpad0', 2, 'alpha'), np('.', 'NumpadDecimal')];
    return t;
  };

  function place(layoutId) {
    const rows = LAYOUTS[layoutId]();
    const keys = [];
    let y = 0, maxX = 0;
    rows.forEach((row) => {
      if (row === 'gap') {
        y += 0.25;
        return;
      }
      let x = 0;
      row.forEach((key) => {
        if (!key.gap) keys.push(Object.assign({ x, y }, key));
        x += key.w;
      });
      maxX = Math.max(maxX, x);
      y += 1;
    });
    return { keys, w: maxX, h: y };
  }

  /* --------------------------------- case look --------------------------------- */
  function caseBackground(caseId, color) {
    const finish = C.CASES[caseId].finish;
    const hi = U.shade(color, 0.16), lo = U.shade(color, -0.18);
    switch (finish) {
      case 'metal':
        return `linear-gradient(160deg, ${hi} 0%, ${color} 42%, ${U.shade(color, -0.06)} 70%, ${lo} 100%)`;
      case 'brass':
        return `linear-gradient(160deg, ${U.shade(color, 0.28)} 0%, ${color} 35%, ${U.shade(color, -0.12)} 60%, ${U.shade(color, 0.12)} 82%, ${lo} 100%)`;
      case 'clear':
        return `linear-gradient(170deg, ${U.rgba(U.shade(color, 0.3), 0.75)}, ${U.rgba(color, 0.55)})`;
      case 'acrylic':
        return `repeating-linear-gradient(180deg, ${U.rgba(U.shade(color, 0.25), 0.7)} 0 3px, ${U.rgba(color, 0.55)} 3px 7px)`;
      case 'wood':
        return `repeating-linear-gradient(92deg, ${color} 0 6px, ${U.shade(color, 0.07)} 6px 9px, ${U.shade(color, -0.06)} 9px 15px, ${color} 15px 22px), linear-gradient(${hi}, ${lo})`;
      case 'carbon':
        return `linear-gradient(45deg, ${U.shade(color, 0.08)} 25%, transparent 25%, transparent 75%, ${U.shade(color, 0.08)} 75%), linear-gradient(45deg, ${U.shade(color, 0.08)} 25%, ${color} 25%, ${color} 75%, ${U.shade(color, 0.08)} 75%)`;
      default:
        return `linear-gradient(170deg, ${U.shade(color, 0.06)}, ${U.shade(color, -0.06)})`;
    }
  }

  /* ---------------------------------- view ---------------------------------- */
  const V = (KK.kbview = {});

  V.create = function (container, opts) {
    const o = Object.assign({ maxU: 52, legends: true }, opts || {});
    const view = { el: document.createElement('div'), byCode: {}, layout: null };
    view.el.className = 'kb';
    container.appendChild(view.el);

    view.update = function (b) {
      const kc = C.keycapById[b.keycap];
      const prof = C.KC_PROFILES[kc.profile];
      const lay = place(b.layout);
      view.layout = lay;
      const c = kc.colors;
      const el = view.el;
      el.dataset.shape = prof.shape;
      el.dataset.finish = C.CASES[b.case].finish;
      el.classList.toggle('trans', !!kc.translucent);
      el.style.setProperty('--a', c.a);
      el.style.setProperty('--al', c.al);
      el.style.setProperty('--m', c.m);
      el.style.setProperty('--ml', c.ml);
      el.style.setProperty('--x', c.x);
      el.style.setProperty('--xl', c.xl);
      el.style.setProperty('--ch', prof.h);
      el.style.setProperty('--kw', lay.w);
      el.style.setProperty('--kh', lay.h);
      el.style.setProperty('--case-edge', U.shade(b.caseColor, -0.3));
      const st = kc.legend;
      el.style.setProperty('--lf', st.font);
      el.style.setProperty('--lw', st.weight);
      el.style.setProperty('--ls', st.size);
      el.dataset.align = st.align;

      view.byCode = {};
      const html = lay.keys
        .map((key, i) => {
          const legend = o.legends ? legendHTML(key, st) : '';
          const h = key.h ? `;height:calc(var(--u)*${key.h})` : '';
          // stock boards: keys the photo shows in their own color (wasd, arrows, esc…)
          const own = kc.keys && key.codes.map((cd) => kc.keys[cd]).find(Boolean);
          const tint = own ? `;--kc:${own};--kl:${U.readable(own)}` : '';
          return `<div class="k ${key.cls}" data-i="${i}" style="left:calc(var(--u)*${key.x});top:calc(var(--u)*${key.y});width:calc(var(--u)*${key.w})${h}${tint}"><div class="cap">${legend}</div></div>`;
        })
        .join('');
      el.innerHTML = `<div class="kb-case" style="background:${caseBackground(b.case, b.caseColor)}"><div class="kb-plate">${html}</div></div>`;
      el.querySelectorAll('.k').forEach((kel) => {
        lay.keys[+kel.dataset.i].codes.forEach((code) => (view.byCode[code] = kel));
      });
      view.fit();
    };

    view.fit = function () {
      if (!view.layout) return;
      const avail = container.clientWidth || 600;
      const u = Math.min(o.maxU, Math.floor(((avail - 2) / (view.layout.w + 0.9)) * 10) / 10);
      view.el.style.setProperty('--u', Math.max(8, u) + 'px');
    };

    view.press = function (code) {
      const el = view.byCode[code];
      if (el) el.classList.add('on');
    };
    view.release = function (code) {
      const el = view.byCode[code];
      if (el) el.classList.remove('on');
    };
    view.flash = function (code, cls) {
      const el = view.byCode[code];
      if (!el) return;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 160);
    };

    window.addEventListener('resize', view.fit);
    return view;
  };

  // little 4-key swatch for keycap cards
  V.swatch = function (kc) {
    const c = kc.colors, st = kc.legend;
    const lg = (t) => (st.blank ? '' : t);
    return `<div class="kc-sw" style="--a:${c.a};--al:${c.al};--m:${c.m};--ml:${c.ml};--x:${c.x};--xl:${c.xl};font-family:${st.font.replace(/"/g, "'")};font-weight:${st.weight}"><i class="m">${lg(U.esc(modWord(st.mods, 'Escape')))}</i><i class="a">${lg('K')}</i><i class="a">${lg('B')}</i><i class="x">${lg(U.esc(modWord(st.mods, 'Enter')))}</i></div>`;
  };
})();
