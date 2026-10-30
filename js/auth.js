(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const S = KK.store;

  /*
   * Local accounts: everything lives in this browser's localStorage. Passwords are
   * salted and run through PBKDF2-SHA256 (Web Crypto) so they aren't stored as plain
   * text, but this is not real security — anyone with access to the browser profile
   * can read or wipe the data. When Firebase is configured (js/net-config.js), real
   * accounts live online instead and this module only serves as the offline stand-in
   * and to move an old local account online on its first log in (js/net.js).
   */
  const A = (KK.auth = {});
  const ITER = 120000;

  const users = () => S.get('users', {}) || {};
  const saveUsers = (u) => S.set('users', u);
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function hashPassword(password, saltHex) {
    if (window.crypto && crypto.subtle) {
      const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256);
      return 'pbkdf2$' + hex(bits);
    }
    // very old browsers without Web Crypto: weak fallback, still salted
    let h = saltHex + password;
    for (let i = 0; i < 2000; i++) h = KK.util.hash(h + i).toString(16) + h.length;
    return 'fallback$' + h;
  }

  function newSalt() {
    const b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return hex(b);
  }

  A.normalize = (name) => String(name || '').trim().toLowerCase();

  A.validate = function (name, password) {
    const n = A.normalize(name);
    const min = KK.net && KK.net.online() ? 6 : 4; // online accounts need 6
    if (!/^[a-z0-9_.-]{3,20}$/.test(n)) return 'username: 3–20 letters, numbers, . _ or -';
    if (String(password || '').length < min) return `password: at least ${min} characters`;
    return null;
  };

  // each tab keeps its own session (so two tabs can be two players); a new tab
  // starts as whoever logged in last
  const TAB = 'kkph.tabSession';
  A.current = () => {
    try {
      const s = sessionStorage.getItem(TAB);
      if (s) return JSON.parse(s);
    } catch (e) { /* no sessionStorage */ }
    return S.get('session', null);
  };
  const setSession = (n) => {
    S.set('session', n);
    try {
      sessionStorage.setItem(TAB, JSON.stringify(n));
    } catch (e) { /* no sessionStorage */ }
  };
  A.displayName = (n) => (users()[n] && users()[n].display) || n;

  A.signup = async function (name, password) {
    const err = A.validate(name, password);
    if (err) throw new Error(err);
    const n = A.normalize(name);
    const all = users();
    if (all[n]) throw new Error('that username is taken');
    const salt = newSalt();
    all[n] = { display: String(name).trim(), salt, hash: await hashPassword(password, salt), created: Date.now() };
    saveUsers(all);
    setSession(n);
    return n;
  };

  A.login = async function (name, password) {
    const n = A.normalize(name);
    const u = users()[n];
    if (!u || (await hashPassword(String(password || ''), u.salt)) !== u.hash) throw new Error('wrong username or password');
    setSession(n);
    return n;
  };

  A.logout = () => {
    S.remove('session');
    try {
      sessionStorage.removeItem(TAB);
    } catch (e) { /* no sessionStorage */ }
  };
})();
