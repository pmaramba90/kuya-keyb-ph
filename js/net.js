(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});

  /*
   * Online layer. With a Firebase config in js/net-config.js, accounts, the player
   * list, challenges and matches go through Firebase (Auth + Realtime Database), so
   * everyone on the site sees each other. Without one, the same calls run against a
   * stand-in kept in this browser's localStorage: accounts stay local (js/auth.js)
   * and the "online" players are the other tabs open in this browser.
   *
   * Database API (a small subset of Firebase's; same paths either way):
   *   N.ref(path).set(v) / update(obj) / remove() / push(v) → key / once() → value
   *   .on(cb) → off()          the value now and on every change
   *   .onChild(cb) → off()     every child once, existing and new: cb(key, value)
   *   .transaction(fn)         read-modify-write (return undefined to abort)
   *   .onDisconnect(v)         written when this page goes away (null removes)
   */
  const N = (KK.net = { mode: 'local', me: null, offset: 0 });
  const cfg = window.KK_FIREBASE;
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

  N.now = () => Date.now() + N.offset;
  N.normalize = (name) => String(name || '').trim().toLowerCase();

  /* -------------------------------- local stand-in -------------------------------- */
  // Every write is its own localStorage key ("kkph.db:" + path). Tabs see each other's
  // storage only eventually, so rewriting one big blob would let a tab save a stale copy
  // over another tab's change; separate keys never touch each other. A write replaces
  // the keys below its path, and the tree is rebuilt shallow-first, so later, deeper
  // writes win. Removals are stored as null.
  function localDb() {
    const PRE = 'kkph.db:', KEY = 'kkph.db';
    try {
      localStorage.removeItem(KEY); // the old single-blob store
    } catch (e) { /* storage unavailable */ }
    const keys = () => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PRE)) out.push(k);
      }
      return out;
    };
    const load = () => {
      let t = {};
      keys()
        .map((k) => k.slice(PRE.length))
        .sort((a, b) => parts(a).length - parts(b).length)
        .forEach((p) => {
          try {
            t = put(t, parts(p), JSON.parse(localStorage.getItem(PRE + p))) || {};
          } catch (e) { /* a key another tab just removed */ }
        });
      return t;
    };
    const parts = (p) => String(p).split('/').filter(Boolean);
    const at = (t, p) => {
      const v = parts(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), t);
      return v === undefined ? null : v;
    };
    const clone = (v) => (v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));
    // like Firebase: writing null removes, and emptied parents disappear
    function put(o, ks, v) {
      if (!ks.length) return v;
      const out = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
      const nv = put(out[ks[0]], ks.slice(1), v);
      if (nv === null || nv === undefined || (typeof nv === 'object' && !Object.keys(nv).length)) delete out[ks[0]];
      else out[ks[0]] = nv;
      return out;
    }
    const listeners = new Set();
    let queued = false;
    function notify() {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        const t = load();
        listeners.forEach((l) => l.check(t));
      }, 0);
    }
    function writeNow(path, fn) {
      const p = parts(path).join('/');
      const v = fn(clone(at(load(), p)));
      if (v === undefined) return false;
      const all = keys();
      all.forEach((k) => k.startsWith(PRE + p + '/') && localStorage.removeItem(k));
      // a removal only needs a marker if a shallower write still holds this path
      if (v === null && !all.some((k) => (PRE + p).startsWith(k + '/'))) localStorage.removeItem(PRE + p);
      else localStorage.setItem(PRE + p, JSON.stringify(v));
      notify();
      return true;
    }
    // read-modify-writes (transactions) take turns across tabs
    const write = (path, fn) => (navigator.locks ? navigator.locks.request(KEY, () => writeNow(path, fn)) : Promise.resolve(writeNow(path, fn)));
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key.startsWith(PRE)) notify();
    });
    const leave = [];
    window.addEventListener('pagehide', () => leave.forEach((f) => f()));
    let seq = 0;

    return function ref(path) {
      return {
        set: (v) => write(path, () => (v === undefined ? null : v)),
        update: (o) => Promise.all(Object.keys(o).map((k) => write(path + '/' + k, () => (o[k] === undefined ? null : o[k])))),
        remove: () => write(path, () => null),
        push(v) {
          const key = Date.now().toString(36).padStart(9, '0') + (seq++ % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
          write(path + '/' + key, () => v);
          return key;
        },
        once: () => Promise.resolve(clone(at(load(), path))),
        on(cb) {
          const l = { check(t) {
            const s = JSON.stringify(at(t, path));
            if (s !== this.last) {
              this.last = s;
              cb(JSON.parse(s));
            }
          } };
          listeners.add(l);
          l.check(load());
          return () => listeners.delete(l);
        },
        onChild(cb) {
          const seen = new Set();
          const l = { check(t) {
            const v = at(t, path);
            if (!v || typeof v !== 'object') return;
            Object.keys(v).sort().forEach((k) => {
              if (!seen.has(k)) {
                seen.add(k);
                cb(k, clone(v[k]));
              }
            });
          } };
          listeners.add(l);
          l.check(load());
          return () => listeners.delete(l);
        },
        transaction: (fn) => write(path, fn),
        onDisconnect(v) {
          leave.push(() => writeNow(path, () => v)); // the page is going: no time to queue
        },
      };
    };
  }

  function localAuth() {
    const A = KK.auth;
    const me = (n) => (n ? { uid: n, name: n, display: A.displayName(n) } : null);
    return {
      restore: () => {
        const s = A.current();
        return me(s && (KK.store.get('users', {}) || {})[s] ? s : null);
      },
      signup: async (name, pass) => me(await A.signup(name, pass)),
      login: async (name, pass) => me(await A.login(name, pass)),
      logout: () => A.logout(),
    };
  }

  /* ----------------------------------- firebase ----------------------------------- */
  const loadScript = (src) =>
    new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => fail(new Error('could not load ' + src));
      document.head.appendChild(s);
    });

  function fireDb(db) {
    db.ref('.info/serverTimeOffset').on('value', (s) => (N.offset = s.val() || 0));
    const warn = (path) => (e) => console.warn('kkph db', path, e && e.message);
    return function ref(path) {
      const r = db.ref(path);
      return {
        set: (v) => r.set(v === undefined ? null : v),
        update: (o) => r.update(o),
        remove: () => r.remove(),
        push(v) {
          const p = r.push();
          p.set(v);
          return p.key;
        },
        once: () => r.once('value').then((s) => s.val()),
        on(cb) {
          const h = (s) => cb(s.val());
          r.on('value', h, warn(path));
          return () => r.off('value', h);
        },
        onChild(cb) {
          const h = (s) => cb(s.key, s.val());
          r.on('child_added', h, warn(path));
          return () => r.off('child_added', h);
        },
        transaction: (fn) => r.transaction(fn).then((res) => res.committed),
        onDisconnect: (v) => (v === null ? r.onDisconnect().remove() : r.onDisconnect().set(v)),
      };
    };
  }

  // usernames become sign-in emails on a domain nobody receives mail for
  const emailOf = (n) => n + '@players.kuyakeybph.com';
  const AUTH_ERR = {
    'auth/email-already-in-use': 'that username is taken',
    'auth/weak-password': 'password: at least 6 characters',
    'auth/network-request-failed': "can't reach the server — check your connection",
    'auth/too-many-requests': 'too many tries — wait a minute and try again',
  };
  const authError = (e) => new Error(AUTH_ERR[e && e.code] || (e && e.message) || 'something went wrong');

  function fireAuth(auth) {
    const me = async (u) => {
      if (!u) return null;
      const name = u.email.split('@')[0];
      const prof = (await N.ref('users/' + u.uid).once()) || {};
      return { uid: u.uid, name, display: prof.display || name };
    };
    const create = async (name, pass) => {
      const cred = await auth.createUserWithEmailAndPassword(emailOf(name), pass);
      await N.ref('users/' + cred.user.uid).set({ name, display: String(name).trim(), created: N.now() });
      await N.ref('meta/userCount').transaction((c) => (c || 0) + 1);
      return cred.user;
    };
    return {
      restore: () => new Promise((ok) => {
        const off = auth.onAuthStateChanged((u) => {
          off();
          me(u).then(ok, () => ok(null));
        });
      }),
      async signup(display, pass) {
        const err = KK.auth.validate(display, pass);
        if (err) throw new Error(err);
        try {
          const u = await create(N.normalize(display), pass);
          await N.ref('users/' + u.uid + '/display').set(String(display).trim());
          return me(u);
        } catch (e) {
          throw authError(e);
        }
      },
      async login(display, pass) {
        const name = N.normalize(display);
        try {
          return await me((await auth.signInWithEmailAndPassword(emailOf(name), pass)).user);
        } catch (e) {
          // an account made in this browser before going online moves online on first log in
          let local = false;
          try {
            local = (await KK.auth.login(name, pass)) === name;
          } catch (x) { /* not a local account either */ }
          if (local && String(pass).length >= 6) {
            try {
              return await me(await create(name, pass));
            } catch (x) { /* taken online by someone else */ }
          }
          if (e && e.code === 'auth/network-request-failed') throw authError(e);
          throw new Error('wrong username or password');
        }
      },
      logout: () => auth.signOut(),
    };
  }

  /* ------------------------------------ boot ------------------------------------ */
  let backend;
  N.ready = (async () => {
    if (cfg && cfg.apiKey && cfg.databaseURL) {
      try {
        await loadScript(SDK + 'firebase-app-compat.js');
        await Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-database-compat.js')]);
        const app = window.firebase.initializeApp(cfg);
        N.ref = fireDb(app.database());
        backend = fireAuth(app.auth());
        N.mode = 'firebase';
      } catch (e) {
        console.warn('kkph: online services unavailable, playing locally', e);
      }
    }
    if (!backend) {
      N.ref = localDb();
      backend = localAuth();
      // accounts made before this counter existed still count
      const n = Object.keys(KK.store.get('users', {}) || {}).length;
      await N.ref('meta/userCount').transaction((c) => (c >= n ? undefined : n));
    }
    N.me = await backend.restore();
    return N.me;
  })();

  N.online = () => N.mode === 'firebase';
  N.signup = async (name, pass) => {
    await N.ready;
    N.me = await backend.signup(name, pass);
    if (N.mode === 'local') await N.ref('meta/userCount').transaction((c) => (c || 0) + 1);
    return N.me;
  };
  N.login = async (name, pass) => {
    await N.ready;
    return (N.me = await backend.login(name, pass));
  };
  N.logout = async () => {
    N.me = null;
    await backend.logout();
  };
})();
