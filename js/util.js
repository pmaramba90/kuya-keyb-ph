(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});

  const U = (KK.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;

  // small deterministic PRNG
  U.rng = function (seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  U.slug = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  U.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- color helpers ----
  U.hexToRgb = function (hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.mix = function (a, b, t) {
    const x = U.hexToRgb(a),
      y = U.hexToRgb(b);
    return U.rgbToHex(U.lerp(x[0], y[0], t), U.lerp(x[1], y[1], t), U.lerp(x[2], y[2], t));
  };
  // amt > 0 lightens, < 0 darkens
  U.shade = (hex, amt) => (amt >= 0 ? U.mix(hex, '#ffffff', amt) : U.mix(hex, '#000000', -amt));
  U.lum = function (hex) {
    const [r, g, b] = U.hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  U.contrast = function (a, b) {
    const l1 = U.lum(a),
      l2 = U.lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  U.readable = (bg, light = '#f4f2ec', dark = '#1e1f21') =>
    U.contrast(bg, light) >= U.contrast(bg, dark) ? light : dark;
  U.rgba = function (hex, a) {
    const [r, g, b] = U.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };

  U.fmtTime = function (s) {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // ---- persistence ----
  // get/set: global keys (settings, accounts). uget/uset: keys owned by the signed-in user.
  KK.store = {
    user: null,
    get(k, def) {
      try {
        const v = localStorage.getItem('kkph.' + k);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('kkph.' + k, JSON.stringify(v));
      } catch (e) {
        /* storage unavailable */
      }
    },
    remove(k) {
      try {
        localStorage.removeItem('kkph.' + k);
      } catch (e) {
        /* storage unavailable */
      }
    },
    uget(k, def) {
      return this.user ? this.get('u.' + this.user + '.' + k, def) : def;
    },
    uset(k, v) {
      if (this.user) this.set('u.' + this.user + '.' + k, v);
    },
  };
})();
