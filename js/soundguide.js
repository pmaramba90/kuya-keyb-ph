(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util, C = KK.catalog;
  const $ = (s) => document.querySelector(s);
  const esc = U.esc;

  /*
   * Keyboard Sound Guide (home → keyboard sound guide): the ten sound profiles, one at a
   * time. ‹ / › or the ← → keys browse them on a computer, a swipe on a phone. Each has
   * an icon, the guide's own words, and ▶ hear it: a board built the way the profile
   * describes (switch, plate, mount, foam, keycaps), drawn small and played on the sound
   * model for a few seconds before your keyboard comes back.
   */
  const G = (KK.soundguide = {});

  // the guide's text, word for word
  const TITLE = 'MECHANICAL KEYBOARD SOUND PROFILES: THE COMPLETE GUIDE';
  const PROFILES = [
    {
      id: 'thocky', like: /chocolate|custard|solarized|wob|white on black/i, name: 'THOCKY', tag: '(Deep, Bass-Heavy, & Rounded)',
      sound: 'A low-pitched, full-bodied, and muted "thud" when the key bottoms out, stripping away high-frequency rattle or metallic ping.',
      how: 'Dense nylon or proprietary Ink/Boba switch housings, polycarbonate (PC) or POM plates, thick PBT or tall profile keycaps (SA, MT3), and heavy case/PCB foam dampening.',
      switches: 'Gateron Oil King, Gazzew Boba U4T, Keygeek Y2, Gateron Milky Yellow Pro.',
      boards: 'Keychron Q-Series (with foam), Qwertykeys QK75N, heavily dampened gasket-mount boards.',
      demo: { sw: 'Gateron Oil King', caps: [['sa', 'mt3'], ['pbt', 'abs']], case: 'aluminum', color: '#2b2d33', plate: 'pc', mount: 'gasket', mods: ['caseFoam', 'plateFoam', 'stabLube'], lube: 'krytox' },
    },
    {
      id: 'creamy', like: /beige|cream|milk|latte/i, name: 'CREAMY', tag: '(Smooth, Mellow, & Blended)',
      sound: 'Smooth, soft, warm, and cohesive without sharp acoustic edges or harsh frequencies.',
      how: 'Well-lubed POM or UPE-blend linear switches paired with FR4 or Polypropylene (PP) plates and balanced Poron/silicone dampening.',
      switches: 'Akko V3 Cream Yellow Pro, HMX Toast, Vertex V1, WS Morandi.',
      boards: 'WOBKEY Rainy 75, Shortcut Studio Bridge75, Chilkey ND75.',
      demo: { sw: 'Akko V3 Cream Yellow Pro', caps: [['cherry'], ['pbt']], case: 'aluminum', color: '#ebe4d6', plate: 'fr4', mount: 'gasket', mods: ['caseFoam', 'plateFoam', 'stabLube'], lube: 'krytox' },
    },
    {
      id: 'clacky', like: /dolch|9009|olivia|white/i, name: 'CLACKY', tag: '(Bright, Crisp, & Expressive)',
      sound: 'High-pitched, sharp, and energetic. Every bottom-out produces a distinct, crisp "clack" with clear acoustic separation between presses.',
      how: 'Foamless builds, top-mount or gasket-mount configurations, stiff aluminum, carbon fiber, or brass plates, Cherry profile ABS keycaps (like GMK), and polycarbonate top-housing switches.',
      switches: 'Cherry MX Black (Hyperglide / Nixie), HMX Xinhai, HMX Cloud, C3Equalz Banana Split.',
      boards: 'Mode Envoy, Mode Sonnet, TGR Jane, Bauer Lite.',
      demo: { sw: 'Cherry MX Black Clear Top Nixie', caps: [['cherry'], ['abs']], case: 'aluminum', color: '#a9b4c2', plate: 'brass', mount: 'top', mods: [], lube: 'stock' },
    },
    {
      id: 'clicky', like: /9009|beige|retro|white/i, name: 'CLICKY', tag: '(Sharp, Audible, & Tactile)',
      sound: 'An intentional, high-pitched mechanical "click" produced during actuation, accompanied by a sharp tactile bump.',
      how: 'Internal switch mechanisms—either a traditional click jacket or a modern click bar (which snaps on both the downstroke and upstroke for a crisper sound).',
      switches: 'Kailh Box Jade, Kailh Box Navy, Zeal Clickiez, Cherry MX Blue.',
      boards: 'IBM Model M (buckling spring), 8BitDo Retro Mechanical Keyboard.',
      demo: { sw: 'Cherry MX Blue', caps: [['oem', 'cherry'], ['abs']], case: 'plastic', color: '#d9d4c7', plate: 'steel', mount: 'tray', mods: [], lube: 'stock' },
    },
    {
      id: 'silent', like: /grey|gray|dark|black/i, name: 'SILENT / MUTED', tag: '(Quiet & Dampened)',
      sound: 'A soft, barely audible whisper or subdued "thud" designed for shared offices, late-night gaming, or streaming without mic bleed.',
      how: 'Switches with silicone dampeners on the stem rails or acoustic relief cuts in the stem to absorb top-out and bottom-out impacts, paired with heavy case insulation.',
      switches: 'TTC Frozen Silent V2, Gazzew Boba U4 (Silent), Haimu Heartbeat, Gateron Oil King Silent.',
      boards: 'Varmilo Minilo (with Kailh Prestige Silent switches), custom builds outfitted with silent switches.',
      demo: { sw: 'Gazzew Boba U4', caps: [['cherry', 'oem'], ['pbt']], case: 'aluminum', color: '#3b4252', plate: 'pc', mount: 'gasket', mods: ['caseFoam', 'plateFoam', 'peFoam', 'stabLube'], lube: 'krytox' },
    },
    {
      id: 'marbly', like: /ocean|marine|blue/i, name: 'MARBLY', tag: '(Bouncy, Rounded, & Hollow-Core)',
      sound: 'A loud, crisp initial attack followed by a rounded, muted finish—like glass marbles dropping onto a padded wooden table or ceramic Mahjong tiles clicking together.',
      how: 'Placing a thin PE foam sheet or PET acoustic film directly on top of the PCB, combined with an FR4 or Polycarbonate plate and UPE/POM switches.',
      switches: 'Wuque Studio (WS) Morandi, HMX Hibiscus, KTT Kang White V3.',
      boards: 'WOBKEY Rainy 75, Owlab Jelly Epoch, Qwertykeys QK65.',
      demo: { sw: 'WS Morandi', caps: [['cherry'], ['pbt']], case: 'aluminum', color: '#7e8fa6', plate: 'fr4', mount: 'gasket', mods: ['peFoam', 'caseFoam', 'stabLube'], lube: 'krytox' },
    },
    {
      id: 'poppy', like: /pink|sakura|strawberry/i, name: 'POPPY', tag: '(Snappy, Percussive, & Popcorn-Like)',
      sound: 'Bright, bouncy, and lively. Each keystroke ends in a tight, compressed, percussive "pop"—similar to popcorn popping.',
      how: "Long-pole stems (shortening travel to ~3.4-3.5mm so the stem pole slams directly into the bottom housing well) paired with a five-layer foam stack (Poron + IXPE + PET) or the Tempest Tape Mod (painter's tape on the back of the PCB).",
      switches: 'Leobog Reaper, HMX Jelly, HMX Gulf, Gateron Baby Kangaroo.',
      boards: 'AULA F75, Nuphy Halo75 V2.',
      demo: { sw: 'LEOBOG Reaper', caps: [['cherry', 'oem'], ['pbt']], case: 'plastic', color: '#f2efe9', plate: 'pc', mount: 'gasket', mods: ['caseFoam', 'plateFoam', 'peFoam', 'tape', 'stabLube'], lube: 'krytox' },
    },
    {
      id: 'scratchy', like: /dolch|9009|classic|retro/i, name: 'SCRATCHY / CHALKY', tag: '(Textured, Dry, & Vintage Clack)',
      sound: 'A dry, textured, friction-heavy whisper during key travel (like chalk on a blackboard) followed by a raw, resonant nylon clack.',
      how: 'Unlubed or very lightly lubed Cherry MX switches (often mechanically broken-in over hundreds of thousands of presses) on an aluminum or carbon fiber plate with zero foam.',
      switches: 'Cherry MX Black Hyperglide, Cherry MX Nixie, Cherry MX Brown.',
      boards: 'Geonworks Frog TKL, Keycult No. 1/2, classic Korean custom TKLs.',
      demo: { sw: 'Cherry MX Black Hyperglide', caps: [['cherry'], ['abs']], case: 'aluminum', color: '#5c6370', plate: 'aluminum', mount: 'top', mods: [], lube: 'stock', layout: 'tkl' },
    },
    {
      id: 'raindrops', name: '"RAINDROPS" / ELECTROSTATIC THOCK', tag: '(Plush & Bubbly)',
      sound: 'Resembles heavy raindrops hitting a wooden roof or a soft, rapid "patter." (The original inspiration for the term "Thock").',
      how: 'Topre electro-capacitive switches, which use a tactile rubber dome over a coiled conical spring rather than metal leaf contacts.',
      switches: 'Topre 45g / 55g Electro-Capacitive Switches, Topre Silent (Type-S), NIZ Plum EC Switches.',
      boards: 'HHKB (Happy Hacking Keyboard) Professional Hybrid, Realforce R3, Leopold FC660C.',
      demo: { sw: 'Topre 45g', topre: true, case: 'plastic', color: '#cfd2cc', plate: 'steel', mount: 'tray', mods: [], lube: 'stock', layout: '60' },
    },
    {
      id: 'glassy', like: /clear|transparent|crystal|ice/i, name: 'GLASSY / CRISP', tag: '(Ultra-High Pitch & Piercing)',
      sound: 'Even higher-pitched and cleaner than standard Clacky—sounding like tapping two glass rods or hard plastics together, with zero bass or mid-range muddiness.',
      how: 'Ultra-tight tolerance HMX switches (hard nylon/P5/T2 blends) or all-polycarbonate switches, paired with metal/ceramic keycaps (Cerakey) or stiff brass plates.',
      switches: 'HMX Cheese, HMX Canglan V2, Gateron North Pole (Full PC).',
      boards: 'Custom brass-plate builds, boards outfitted with Cerakey ceramic keycaps.',
      demo: { sw: 'HMX Cheese', caps: [['cherry', 'oem'], ['ceramic', 'metal', 'pc', 'abs']], case: 'aluminum', color: '#c9d6e3', plate: 'brass', mount: 'top', mods: [], lube: 'stock' },
    },
  ];

  // one icon per profile (24×24, drawn in the nav icons' line style)
  const I = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const ICONS = {
    // a woofer: deep, round
    thocky: I('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
    // a soft-serve swirl
    creamy: I('<path d="M8.5 13.5h7L12 21.5z"/><path d="M8 13.5c-2.2 0-2.6-3.2.2-3.4-.6-2.6 2.4-3.6 3.5-1.7.8-2.6 4.7-2 4.1.8 2.6.3 2.2 4.3-.3 4.3"/><path d="M11.8 6.2c.4-1.2 1.4-1.9 2.4-1.7"/>'),
    // a key hitting bottom with a sharp crack
    clacky: I('<rect x="6.5" y="9" width="11" height="8" rx="1.6"/><path d="M4 20.5h16"/><path d="M12 2.5v3M6 4.5l1.6 2.2M18 4.5l-1.6 2.2"/>'),
    // a switch click: a burst
    clicky: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
    // a crescent moon: late-night quiet
    silent: I('<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z"/><path d="M16 4.5h3l-3 3.5h3"/>'),
    // marbles
    marbly: I('<circle cx="8" cy="15.5" r="4.2"/><circle cx="16.5" cy="15.5" r="4.2"/><circle cx="12.3" cy="7.5" r="4.2"/><path d="M6.6 14.2a1.7 1.7 0 0 1 1.7-1.3M15.1 14.2a1.7 1.7 0 0 1 1.7-1.3M10.9 6.2a1.7 1.7 0 0 1 1.7-1.3"/>'),
    // popcorn
    poppy: I('<path d="M6.5 11.5h11l-1.6 9.5H8.1z"/><path d="M10.3 11.5l.4 9.5M13.7 11.5l-.4 9.5"/><path d="M7 11.5a2.4 2.4 0 0 1 2.2-3.6 2.6 2.6 0 0 1 5 0 2.4 2.4 0 0 1 2.8 3.6"/><path d="M10.5 5.5a1.8 1.8 0 0 1 3.2-1.3"/>'),
    // chalk scribbles
    scratchy: I('<path d="M3.5 8.5l3-2 2.5 2 3-2.5 3 2.5 2.5-2 3 2"/><path d="M3.5 14l3-2 2.5 2 3-2.5 3 2.5 2.5-2 3 2"/><path d="M14.5 21l5-5 1.5 1.5-5 5"/>'),
    // raindrops
    raindrops: I('<path d="M8 3.5c-2 3-3.2 4.8-3.2 6.3a3.2 3.2 0 0 0 6.4 0c0-1.5-1.2-3.3-3.2-6.3z"/><path d="M16.5 10c-2 3-3.2 4.8-3.2 6.3a3.2 3.2 0 0 0 6.4 0c0-1.5-1.2-3.3-3.2-6.3z"/><path d="M6.5 18.5l-.8 2M11 17l-.8 2"/>'),
    // a crystal
    glassy: I('<path d="M7 3.5h10l3.5 5L12 21 3.5 8.5z"/><path d="M3.5 8.5h17M9.5 3.5L8 8.5l4 12.5M14.5 3.5l1.5 5L12 21"/>'),
  };

  let at = 0, dir = 0; // the profile shown, and which way we came (for the slide)
  let view = null; // the drawn keyboard
  const builds = {};

  // whole sets only (not a single artisan cap)
  const full = (k) => !/artisan|d(.d+)?u/i.test(k.name);
  // a keycap set with the profile and material the guide names (first match wins)
  // (a colorway that suits the profile when there is one: dark for thocky, cream for creamy…)
  function caps(pref, like) {
    const [profiles, materials] = pref;
    if (like) for (const m of materials) for (const p of profiles) {
      const k = C.keycaps.find((x) => x.profile === p && x.material === m && full(x) && like.test(x.name));
      if (k) return k.id;
    }
    for (const m of materials) for (const p of profiles) {
      const k = C.keycaps.find((x) => x.profile === p && x.material === m && full(x));
      if (k) return k.id;
    }
    const k = C.keycaps.find((x) => profiles.includes(x.profile) && full(x)) || C.keycaps[0];
    return k.id;
  }
  // Topre keycaps come with the Topre boards (HHKB, Realforce): borrow one board's stock set
  function topreCaps() {
    const kb = C.keyboards.find((k) => k.kp === 'topre' && /hhkb|happy hacking/i.test(k.title)) || C.keyboards.find((k) => k.kp === 'topre');
    return kb ? kb.looks[0].keycap : caps([['oem'], ['pbt']]);
  }
  // the board each profile plays
  function buildFor(p) {
    if (builds[p.id]) return builds[p.id];
    const d = p.demo;
    const sw = d.topre ? C.resolveSwitch(d.sw) : (C.switches.find((s) => s.name === d.sw) || {}).id || C.resolveSwitch(d.sw);
    const b = C.sanitizeBuild({
      layout: d.layout || '65', case: d.case, caseColor: d.color, plate: d.plate, mount: d.mount,
      switch: sw, keycap: d.topre ? topreCaps() : caps(d.caps, p.like), mods: d.mods.slice(), lube: d.lube,
    });
    return (builds[p.id] = b);
  }

  const list = (s) => s.replace(/\.$/, '').split(/,\s+(?![^()]*\))/).map((x) => x.trim()).filter(Boolean);

  G.open = function () {
    KK.app.show('guide');
  };

  G.render = function () {
    const p = PROFILES[at];
    const b = buildFor(p);
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap];
    const head = KK.keysound.writeup(b).headline;
    $('#sgTabs').innerHTML = PROFILES.map((x, i) => `<button class="sg-tab${i === at ? ' on' : ''}" data-sg="${i}" title="${esc(x.name)}" aria-label="${esc(x.name)}"${i === at ? ' aria-current="true"' : ''}>${ICONS[x.id]}</button>`).join('');
    $('#sgCard').innerHTML = `
      <div class="sg-card${dir > 0 ? ' from-r' : dir < 0 ? ' from-l' : ''}">
        <div class="sg-top">
          <span class="sg-icon">${ICONS[p.id]}</span>
          <div class="sg-titles">
            <span class="sg-num">${at + 1} / ${PROFILES.length}</span>
            <h2 class="sg-name">${esc(p.name)}</h2>
            <span class="sg-tag">${esc(p.tag)}</span>
          </div>
          <button class="btn primary sg-hear" data-sg="hear">▶ hear it</button>
        </div>
        <div class="sg-kb" id="sgKb"></div>
        <p class="sg-demo"><span>this demo</span> ${esc(sw ? sw.name : p.demo.sw)} · ${esc(C.PLATES[b.plate] ? C.PLATES[b.plate].name || b.plate : b.plate)} plate · ${esc(C.MOUNTS[b.mount] ? C.MOUNTS[b.mount].name : b.mount + ' mount')} · ${esc(kc ? kc.profile + ' ' + kc.material : '')} keycaps${b.mods.length ? ' · ' + b.mods.map((m) => (C.MODS.find((x) => x.id === m) || { name: m }).name).join(', ') : ' · no foam'} <em>· sounds ${esc(head)}</em></p>
        <ul class="sg-points">
          ${fold('The Sound', p.sound)}
          ${fold("How It's Achieved", p.how)}
          <li><b>Popular Switches</b>${names(p.switches)}</li>
          <li><b>Popular Keyboards</b>${names(p.boards)}</li>
        </ul>
      </div>`;
    // the board, drawn small in this profile's build
    const el = $('#sgKb');
    view = KK.kbview.create(el, { maxU: 26, legends: false });
    view.update(b);
    requestAnimationFrame(() => view && view.fit());
    $('#sgPrev').disabled = at === 0;
    $('#sgNext').disabled = at === PROFILES.length - 1;
  };

  // popular switches / keyboards: chips on a computer, one line of names on a phone
  const names = (v) => `<div class="sg-chips">${list(v).map((s) => `<span>${esc(s)}</span>`).join('')}</div><p class="sg-list">${esc(list(v).join(', '))}</p>`;

  // the two long descriptions: folded on phones until tapped (always open on a computer)
  function fold(title, text) {
    return `<li class="sg-fold"><button class="sg-fold-h" data-sgf aria-expanded="false"><b>${esc(title)}</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><p>${esc(text)}</p></li>`;
  }

  function go(i) {
    if (i < 0 || i >= PROFILES.length || i === at) return;
    dir = i > at ? 1 : -1;
    at = i;
    KK.sfx.tab();
    G.render();
  }

  // ▶ hear it: this profile's board for a few seconds, then yours again
  let hearTimer = null;
  function hear() {
    clearTimeout(hearTimer);
    KK.keysound.setBuild(buildFor(PROFILES[at]));
    KK.keysound.demo();
    hearTimer = setTimeout(() => KK.keysound.setBuild(KK.app.build), 3500);
  }
  G.left = () => {
    clearTimeout(hearTimer);
    KK.keysound.setBuild(KK.app.build);
  };

  $('#scr-guide').addEventListener('click', (e) => {
    const f = e.target.closest('[data-sgf]');
    if (f) {
      const open = f.parentElement.classList.toggle('open');
      f.setAttribute('aria-expanded', open);
      return KK.sfx.ui();
    }
    const b = e.target.closest('[data-sg], #sgPrev, #sgNext, #sgBack');
    if (!b || b.disabled) return;
    b.blur();
    if (b.id === 'sgPrev') return go(at - 1);
    if (b.id === 'sgNext') return go(at + 1);
    if (b.id === 'sgBack') return history.length > 1 ? history.back() : KK.app.show('home');
    if (b.dataset.sg === 'hear') return hear();
    go(+b.dataset.sg);
  });
  // ← → on a computer
  document.addEventListener('keydown', (e) => {
    if (KK.app.screen !== 'guide' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
  });
  // a swipe on a phone (sideways, and more sideways than down)
  let sx = null, sy = 0;
  $('#sgCard').addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return void (sx = null);
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  $('#sgCard').addEventListener('touchend', (e) => {
    if (sx === null) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(at + (dx < 0 ? 1 : -1));
  }, { passive: true });
  window.addEventListener('resize', () => KK.app.screen === 'guide' && view && view.fit());

  G.PROFILES = PROFILES;
  G.TITLE = TITLE;
  // the icons, for the sound reactions on posts (js/feed.js): id → svg, and each one's short name
  G.ICONS = ICONS;
  G.SHORT = { thocky: 'thocky', creamy: 'creamy', clacky: 'clacky', clicky: 'clicky', silent: 'silent', marbly: 'marbly', poppy: 'poppy', scratchy: 'scratchy', raindrops: 'raindrops', glassy: 'glassy' };
})();
