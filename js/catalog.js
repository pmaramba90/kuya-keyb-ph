(function () {
  'use strict';
  const KK = (window.KK = window.KK || {});
  const U = KK.util;
  const C = (KK.catalog = {});

  /* ------------------------------------------------------------------
   * Sound-model multipliers. 1.0 = neutral. See keysound.js for how each
   * field is consumed:
   *   pitch   – main bottom-out formant (lower = deeper / "thock")
   *   decay   – how long the keycap/stem modes ring
   *   bright  – overall low-pass cutoff (lower = muffled)
   *   hollow  – case cavity resonance level
   *   bodyF / bodyDecay – the case shell's first bending mode (Hz, s)
   *   shell   – how much the shell itself radiates vs. the air inside it
   *   airQ    – sharpness of the air-cavity standing waves (absorbent = low)
   *   ping    – metallic case ring level
   *   thock   – low "body" mode level, clack – high transient level
   * ------------------------------------------------------------------ */

  // lx / ly: inside length and depth of the case in metres (sets the air-cavity modes)
  C.LAYOUTS = {
    '60': { name: '60%', desc: 'compact, no arrows or f-row', hollow: 1.06, bodyF: 1.1, lx: 0.285, ly: 0.095 },
    '65': { name: '65%', desc: 'adds arrows and a nav column', hollow: 1.0, bodyF: 1.0, lx: 0.305, ly: 0.095 },
    '75': { name: '75%', desc: 'f-row, still compact', hollow: 0.97, bodyF: 0.94, lx: 0.31, ly: 0.12 },
    tkl: { name: 'tkl', desc: 'full size minus the numpad', hollow: 0.94, bodyF: 0.86, lx: 0.35, ly: 0.125 },
    full: { name: 'full', desc: 'full size with numpad', hollow: 0.92, bodyF: 0.8, lx: 0.43, ly: 0.125 },
  };

  C.CASES = {
    aluminum: {
      name: 'aluminum', finish: 'metal',
      desc: 'cnc-machined, dense and crisp with a faint metallic ring',
      tags: ['crisp', 'dense', 'slight ring'],
      colors: [['silver', '#c7c9cc'], ['space grey', '#4b4d52'], ['black', '#1f2023'], ['e-white', '#ebeae4'], ['navy', '#27324e'], ['sakura', '#e7b6c2'], ['lavender', '#b6a8d8'], ['burgundy', '#7a2a35'], ['olive', '#5d6b4a']],
      snd: { pitch: 1.0, hollow: 0.55, bodyF: 300, bodyDecay: 0.02, shell: 0.3, airQ: 11, ping: 0.38, pingF: 1750, pingDecay: 0.17, bright: 1.05, loud: 1.0, rattle: 1.0 },
    },
    brass: {
      name: 'brass', finish: 'brass',
      desc: 'very heavy; deep, solid strikes with a long shimmering ring',
      tags: ['heavy', 'deep', 'shimmer'],
      colors: [['raw brass', '#c9a24a'], ['polished', '#dcb85e'], ['aged', '#94753a'], ['copper', '#b8734a']],
      snd: { pitch: 0.95, hollow: 0.32, bodyF: 235, bodyDecay: 0.02, shell: 0.2, airQ: 11, ping: 0.5, pingF: 1240, pingDecay: 0.3, bright: 1.0, loud: 0.98, rattle: 0.8 },
    },
    polycarbonate: {
      name: 'polycarbonate', finish: 'clear',
      desc: 'frosted & translucent; bright, poppy and lively',
      tags: ['bright', 'poppy', 'lively'],
      colors: [['frost', '#dfe6ea'], ['smoke', '#4a4e55'], ['ice blue', '#a9c8e2'], ['blush', '#f0c6d3'], ['mint', '#bfe6d4']],
      snd: { pitch: 1.08, hollow: 0.72, bodyF: 380, bodyDecay: 0.02, shell: 0.7, airQ: 10, ping: 0.04, pingF: 2200, pingDecay: 0.05, bright: 1.15, loud: 1.05, rattle: 1.0 },
    },
    acrylic: {
      name: 'acrylic', finish: 'acrylic',
      desc: 'stacked layers; sharp, poppy and resonant',
      tags: ['sharp', 'poppy', 'resonant'],
      colors: [['clear', '#e3ecf0'], ['frosted white', '#f2f2ef'], ['smoke', '#3b3e43'], ['tangerine', '#f2a25b'], ['sky', '#8fc4e8']],
      snd: { pitch: 1.1, hollow: 0.82, bodyF: 420, bodyDecay: 0.02, shell: 0.6, airQ: 10, ping: 0.05, pingF: 2500, pingDecay: 0.05, bright: 1.2, loud: 1.08, rattle: 1.1 },
    },
    wood: {
      name: 'wood', finish: 'wood',
      desc: 'warm and absorbent; deep, rounded, muted thock',
      tags: ['warm', 'deep', 'muted'],
      colors: [['walnut', '#5a3b28'], ['oak', '#b98b5a'], ['sapele', '#7b402b'], ['maple', '#d8b98a'], ['ebony', '#2b2320'], ['bamboo', '#d1ae6c']],
      snd: { pitch: 0.88, hollow: 0.45, bodyF: 220, bodyDecay: 0.01, shell: 0.5, airQ: 6, ping: 0, pingF: 1000, pingDecay: 0.05, bright: 0.82, loud: 0.92, rattle: 0.8 },
    },
    plastic: {
      name: 'plastic (abs)', finish: 'plastic',
      desc: 'light stock-board shell; hollow, plasticky, a bit rattly',
      tags: ['hollow', 'light', 'rattly'],
      colors: [['black', '#232427'], ['white', '#e8e7e2'], ['grey', '#8a8c90'], ['retro beige', '#d8cfb6'], ['pink', '#f0b6c8'], ['blue', '#5a8ed4']],
      snd: { pitch: 1.04, hollow: 1.0, bodyF: 520, bodyDecay: 0.016, shell: 1.0, airQ: 9, ping: 0, pingF: 1000, pingDecay: 0.05, bright: 1.0, loud: 1.06, rattle: 1.35 },
    },
    carbon: {
      name: 'carbon fiber', finish: 'carbon',
      desc: 'stiff and light; tight, crisp and clean',
      tags: ['stiff', 'crisp', 'clean'],
      colors: [['carbon', '#2a2b2e'], ['forged', '#3a3b3f']],
      snd: { pitch: 1.06, hollow: 0.5, bodyF: 340, bodyDecay: 0.012, shell: 0.45, airQ: 9, ping: 0.1, pingF: 2400, pingDecay: 0.06, bright: 1.1, loud: 1.0, rattle: 0.9 },
    },
  };

  C.PLATES = {
    aluminum: { name: 'aluminum', desc: 'the all-rounder: balanced and crisp', snd: { f: 2200, decay: 0.012, gain: 0.35, pitch: 1.0, bright: 1.0, thock: 1.0, clack: 1.0 } },
    brass: { name: 'brass', desc: 'stiff; higher, sharper, ringing clack', snd: { f: 2700, decay: 0.03, gain: 0.5, pitch: 1.12, bright: 1.12, thock: 0.85, clack: 1.25 } },
    steel: { name: 'steel', desc: 'stiffest; loud, sharp, a little pingy', snd: { f: 3100, decay: 0.028, gain: 0.55, pitch: 1.15, bright: 1.15, thock: 0.8, clack: 1.3 } },
    fr4: { name: 'fr4', desc: 'pcb material; balanced, slightly muted', snd: { f: 1800, decay: 0.01, gain: 0.3, pitch: 0.97, bright: 0.96, thock: 1.05, clack: 0.95 } },
    pc: { name: 'polycarbonate', desc: 'flexy; deep, soft thock', snd: { f: 1200, decay: 0.008, gain: 0.25, pitch: 0.9, bright: 0.88, thock: 1.25, clack: 0.8 } },
    pom: { name: 'pom', desc: 'softest; deepest, creamiest', snd: { f: 1000, decay: 0.007, gain: 0.22, pitch: 0.86, bright: 0.85, thock: 1.3, clack: 0.75 } },
    cf: { name: 'carbon fiber', desc: 'stiff but light; clean and crisp', snd: { f: 2500, decay: 0.009, gain: 0.3, pitch: 1.05, bright: 1.06, thock: 0.95, clack: 1.05 } },
  };

  C.MOUNTS = {
    tray: { name: 'tray mount', desc: 'pcb screwed to the case; stiff, harsh, uneven', snd: { pitch: 1.04, decay: 1.1, bright: 1.08, soft: 0.9, hollow: 1.25, ping: 1.4, loud: 1.05, variance: 1.8 } },
    top: { name: 'top mount', desc: 'plate held by the top case; crisp & consistent', snd: { pitch: 1.0, decay: 1.0, bright: 1.02, soft: 1.0, hollow: 1.0, ping: 1.0, loud: 1.0, variance: 1.0 } },
    gasket: { name: 'gasket mount', desc: 'plate floats on gaskets; soft, bouncy, rounded', snd: { pitch: 0.94, decay: 0.92, bright: 0.92, soft: 1.4, hollow: 0.8, ping: 0.6, loud: 0.94, variance: 0.9 } },
    oring: { name: 'o-ring mount', desc: 'gummy o-ring hugs the plate; bouncy, deep, muted', snd: { pitch: 0.92, decay: 0.9, bright: 0.9, soft: 1.6, hollow: 0.75, ping: 0.5, loud: 0.92, variance: 0.9 } },
  };

  C.MODS = [
    { id: 'caseFoam', name: 'case foam', desc: 'fills the bottom case; kills hollow echo', tags: ['less hollow', 'tighter'], snd: { hollow: 0.35, caseDecay: 0.6, ping: 0.55, loud: 0.95, bright: 0.97 } },
    { id: 'plateFoam', name: 'plate foam', desc: 'foam between plate and pcb; less ping, tighter', tags: ['less ping'], snd: { hollow: 0.72, ping: 0.7, plate: 0.65, pitch: 0.98, bright: 0.95 } },
    { id: 'peFoam', name: 'pe foam mod', desc: 'thin pe sheet under the switches; poppy & marbly', tags: ['poppy', 'marbly'], snd: { pitch: 1.07, bright: 1.1, pop: 0.6, decay: 0.85, clack: 1.2 } },
    { id: 'tape', name: 'tape mod', desc: 'painter\'s tape on the pcb back; deeper, rounder bass', tags: ['deeper', 'poppy'], snd: { pitch: 0.9, thock: 1.35, hollow: 0.6, bright: 0.92, loud: 1.02, pop: 0.15 } },
    { id: 'films', name: 'switch films', desc: 'tightens housings; crisper top-out, no wobble', tags: ['tighter', 'crisper'], snd: { scratch: 0.8, upPitch: 1.04, wobble: 0, clack: 1.05, pitch: 1.02, up: 1.08 } },
    { id: 'forceBreak', name: 'force break mod', desc: 'tape on springs; removes spring ping', tags: ['no ping'], snd: { springPing: 0.15 } },
    { id: 'orings', name: 'o-rings', desc: 'rubber rings on the keycap stems; shorter, muffled', tags: ['muffled', 'mushy'], snd: { loud: 0.65, soft: 2.4, bright: 0.7, pitch: 0.94, decay: 0.8, clack: 0.4 } },
    { id: 'stabLube', name: 'lubed stabilizers', desc: 'dielectric grease on stab wires & housings', tags: ['less rattle'], snd: { rattle: 0.3 } },
    { id: 'holee', name: 'holee mod', desc: 'band-aid strip in the stab stem; silences tick', tags: ['less rattle'], snd: { rattle: 0.55 } },
    { id: 'deskmat', name: 'desk mat', desc: 'thick cloth mat under the board', tags: ['softer'], snd: { hollow: 0.85, loud: 0.96, bright: 0.97 } },
    { id: 'flexCuts', name: 'flex cuts', desc: 'cut pcb/plate for more give; softer, deeper', tags: ['softer', 'bouncy'], snd: { pitch: 0.96, soft: 1.15, ping: 0.9 } },
  ];
  C.modById = {};
  C.MODS.forEach((m) => (C.modById[m.id] = m));

  // scratch / ping: null = use the switch as shipped (factory lube or dry)
  C.LUBES = [
    { id: 'stock', name: 'stock', desc: 'as shipped from the factory', snd: { scratch: null, ping: null, bright: 1, pitch: 1, bumpMute: 1, clickMute: 1, up: 1, loud: 1, decay: 1 } },
    { id: 'springs', name: 'springs only (gpl 105)', desc: 'bag-lubed springs; kills ping, keeps feel', snd: { scratch: 'stock', ping: 0.08, bright: 1, pitch: 1, bumpMute: 1, clickMute: 1, up: 0.97, loud: 1, decay: 1 } },
    { id: 'krytox', name: 'krytox 205g0', desc: 'hand-lubed stems & housings; smooth, deeper', snd: { scratch: 0.08, ping: 0.05, bright: 0.9, pitch: 0.96, bumpMute: 0.9, clickMute: 0.85, up: 0.9, loud: 0.95, decay: 0.92 } },
    { id: 'tribosys', name: 'tribosys 3204', desc: 'thinner, tactile-friendly; smooth but lively', snd: { scratch: 0.12, ping: 0.06, bright: 0.93, pitch: 0.97, bumpMute: 0.97, clickMute: 0.9, up: 0.94, loud: 0.97, decay: 0.95 } },
    { id: 'heavy', name: 'heavy (gpl 206)', desc: 'thick grease; muted, sluggish, dull bumps', snd: { scratch: 0.03, ping: 0.02, bright: 0.78, pitch: 0.92, bumpMute: 0.6, clickMute: 0.6, up: 0.75, loud: 0.88, decay: 0.85 } },
  ];
  C.lubeById = {};
  C.LUBES.forEach((l) => (C.lubeById[l.id] = l));

  C.HOUSINGS = {
    nylon: { name: 'nylon', pitch: 0.94, decay: 1.0, bright: 0.92, clack: 0.9, thock: 1.1, scratch: 1.0 },
    pc: { name: 'polycarbonate', pitch: 1.1, decay: 1.15, bright: 1.18, clack: 1.3, thock: 0.9, scratch: 1.1 },
    pom: { name: 'pom', pitch: 0.96, decay: 0.9, bright: 0.95, clack: 1.0, thock: 1.05, scratch: 0.45 },
    upe: { name: 'uhmwpe', pitch: 0.9, decay: 0.8, bright: 0.86, clack: 0.8, thock: 1.2, scratch: 0.5 },
    mixed: { name: 'nylon / pc', pitch: 1.0, decay: 1.0, bright: 1.0, clack: 1.0, thock: 1.0, scratch: 1.0 },
  };

  C.KC_PROFILES = {
    cherry: { name: 'cherry', pitch: 0.9, decay: 0.95, thock: 1.15, loud: 1.0, shape: 'sculpt', h: 0.07 },
    oem: { name: 'oem', pitch: 1.0, decay: 1.0, thock: 1.0, loud: 1.0, shape: 'sculpt', h: 0.09 },
    sa: { name: 'sa', pitch: 0.8, decay: 1.25, thock: 1.35, loud: 1.12, shape: 'tall', h: 0.13 },
    mt3: { name: 'mt3', pitch: 0.8, decay: 1.22, thock: 1.35, loud: 1.1, shape: 'tall', h: 0.13 },
    lsa: { name: 'lsa', pitch: 0.83, decay: 1.2, thock: 1.3, loud: 1.08, shape: 'tall', h: 0.12 },
    kat: { name: 'kat', pitch: 0.88, decay: 1.08, thock: 1.18, loud: 1.03, shape: 'sphere', h: 0.1 },
    mda: { name: 'mda', pitch: 0.93, decay: 1.05, thock: 1.1, loud: 1.02, shape: 'sphere', h: 0.09 },
    ksa: { name: 'ksa', pitch: 0.92, decay: 1.05, thock: 1.12, loud: 1.03, shape: 'sphere', h: 0.1 },
    osa: { name: 'osa', pitch: 0.93, decay: 1.04, thock: 1.1, loud: 1.02, shape: 'sphere', h: 0.09 },
    asa: { name: 'asa', pitch: 0.92, decay: 1.05, thock: 1.12, loud: 1.03, shape: 'sphere', h: 0.1 },
    moa: { name: 'moa', pitch: 0.94, decay: 1.03, thock: 1.08, loud: 1.02, shape: 'sphere', h: 0.09 },
    mog: { name: 'mog', pitch: 0.94, decay: 1.03, thock: 1.08, loud: 1.02, shape: 'sphere', h: 0.09 },
    dda: { name: 'dda', pitch: 0.96, decay: 1.0, thock: 1.05, loud: 1.0, shape: 'flat', h: 0.08 },
    bobo: { name: 'bobo', pitch: 0.95, decay: 1.02, thock: 1.06, loud: 1.0, shape: 'sphere', h: 0.09 },
    ada: { name: 'ada', pitch: 0.96, decay: 1.0, thock: 1.05, loud: 1.0, shape: 'flat', h: 0.08 },
    xda: { name: 'xda', pitch: 1.06, decay: 0.92, thock: 0.92, loud: 0.97, shape: 'flat', h: 0.07 },
    dsa: { name: 'dsa', pitch: 1.1, decay: 0.9, thock: 0.88, loud: 0.96, shape: 'flat', h: 0.06 },
    cubic: { name: 'cubic', pitch: 0.95, decay: 1.05, thock: 1.08, loud: 1.02, shape: 'flat', h: 0.09 },
    low: { name: 'low profile', pitch: 1.3, decay: 0.7, thock: 0.6, loud: 0.85, shape: 'low', h: 0.03 },
    topre: { name: 'topre', pitch: 0.9, decay: 0.95, thock: 1.12, loud: 1.0, shape: 'sculpt', h: 0.08 },
    varmilo: { name: 'varmilo', pitch: 0.95, decay: 0.98, thock: 1.08, loud: 1.0, shape: 'sculpt', h: 0.08 },
    leopold: { name: 'leopold', pitch: 0.93, decay: 0.97, thock: 1.1, loud: 1.0, shape: 'sculpt', h: 0.08 },
    gateron: { name: 'gateron', pitch: 0.95, decay: 1.0, thock: 1.06, loud: 1.0, shape: 'sculpt', h: 0.08 },
    odm: { name: 'odm', pitch: 0.98, decay: 1.0, thock: 1.02, loud: 1.0, shape: 'sculpt', h: 0.08 },
    mtnu: { name: 'mtnu', pitch: 0.86, decay: 1.12, thock: 1.22, loud: 1.05, shape: 'tall', h: 0.11 },
  };

  C.KC_MATERIALS = {
    pbt: { name: 'pbt', pitch: 0.9, decay: 0.85, bright: 0.86, thock: 1.15, clack: 0.85, loud: 1.0, soft: 1.1 },
    abs: { name: 'abs', pitch: 1.08, decay: 1.15, bright: 1.1, thock: 0.9, clack: 1.15, loud: 1.05, soft: 1.0 },
    pom: { name: 'pom', pitch: 0.92, decay: 0.8, bright: 0.9, thock: 1.1, clack: 0.9, loud: 0.98, soft: 1.1 },
    pc: { name: 'polycarbonate', pitch: 1.15, decay: 1.2, bright: 1.25, thock: 0.85, clack: 1.3, loud: 1.06, soft: 0.95 },
    tpr: { name: 'tpr rubber', pitch: 0.85, decay: 0.5, bright: 0.55, thock: 0.8, clack: 0.3, loud: 0.75, soft: 2.5 },
    silicone: { name: 'silicone', pitch: 0.8, decay: 0.4, bright: 0.5, thock: 0.8, clack: 0.2, loud: 0.7, soft: 3.0 },
    resin: { name: 'resin', pitch: 1.02, decay: 1.05, bright: 1.05, thock: 1.0, clack: 1.1, loud: 1.03, soft: 1.0 },
    ceramic: { name: 'ceramic', pitch: 1.7, decay: 1.8, bright: 1.4, thock: 0.7, clack: 1.6, loud: 1.1, soft: 0.8 },
    metal: { name: 'metal', pitch: 1.5, decay: 2.0, bright: 1.3, thock: 0.75, clack: 1.5, loud: 1.12, soft: 0.85 },
  };

  /* ------------------------------ switches ------------------------------ */
  const TYPE = { L: 'linear', T: 'tactile', C: 'clicky', S: 'silent' };
  const LONG_POLE_BRANDS = /^(HMX|Keygeek|BSun|LEOBOG|Tecsee|Wuque Studio|YOK|Domikey|Gopolar|Chosfox|Redragon)$/;
  const MODERN_BRANDS = /^(HMX|Keygeek|BSun|LEOBOG|Tecsee|Wuque Studio|Durock|Akko|EPOMAKER|Everglide|KTT|JWICK|JWK|C³ Equalz|Gazzew|Chosfox|SP Star|Zeal|Candy|Alpaca|NK|Kinetic Labs|Geonworks|Wooting|LCET|Domikey|MK|MMK)$/;

  function inferSwitch(s) {
    const n = s.name.toLowerCase();
    const has = (re) => re.test(n);

    s.he = s.he || has(/magnetic|\bhe\b|analog/);
    s.optical = has(/optical/);
    s.lowProfile = has(/low profile|choc|bullet/);
    s.box = has(/\bbox\b/);

    // housing / stem material — best guess from the name
    if (has(/boba|\bu4|tangerine|banana split|kiwi|hyacinth|jammy|poro/)) s.housing = 'upe';
    else if (has(/pom|cream|piano|oil king|alpaca|marble|silk|ashes|cera|y2|sunflower|creamy/)) s.housing = 'pom';
    else if (has(/crystal|clear top|nixie|sea glass|aurora|\bice\b|glaze|transparent|jelly|mirror|diamond|\bink\b|frozen|quartz|pearl|bling/)) s.housing = 'pc';
    else if (s.brand === 'Cherry' || has(/milky|\bcap\b|lynx|panda|holy|zeal|tealio|zealio|zilent|lotus|halo/)) s.housing = 'nylon';
    else s.housing = 'mixed';

    s.longPole = LONG_POLE_BRANDS.test(s.brand) || has(/raptor|clacky|\bpop\b|bubble/);
    s.factoryLube = MODERN_BRANDS.test(s.brand) || has(/\bpro\b|lubed|oil|hyperglide|mx2a|milky|smooth|pudding|cream|he\b|magnetic|v2|v3|v5|robin|north pole/);
    if (has(/unlubed/)) s.factoryLube = false;

    if (s.type === 'clicky') {
      if (s.brand === 'Zeal') s.clickKind = 'leaf';
      else if (has(/box|choc|speed|pro light green|arctic fox|optical clicky|gold blue|white owl/)) s.clickKind = 'bar';
      else s.clickKind = 'jacket';
      s.heavyBar = has(/navy|pale blue|noble yellow/);
    } else s.clickKind = null;

    // tactile bump strength 0..1
    if (s.type === 'tactile') {
      if (has(/panda|holy|zealio|boba|u4t|\bt1\b|kangaroo|blueberry|halo|polia|azure dragon|sakura snow|taro|mx clear|ergo clear|grey tactile|bamboo|jade green|ice jade|heavy|koala|sunflower|holy llama|polaris|magic girl/)) s.bump = 0.95;
      else if (has(/brown|pansy|cilantro|purple|standard|creamy|lavender|hutt/)) s.bump = 0.45;
      else s.bump = 0.7;
    } else if (s.type === 'silent' && has(/tactile|brown|\bu4\b|shrimp|zilent|lime|gray/)) s.bump = 0.35;
    else s.bump = 0;

    s.typeLabel = s.he ? s.type + ' · magnetic' : s.type;
    return s;
  }

  C.switches = window.SWITCH_RAW.trim()
    .split('\n')
    .map((line) => {
      const [brand, name, t, f] = line.split('|');
      return inferSwitch({
        id: U.slug(name),
        brand,
        name,
        type: TYPE[t],
        force: parseFloat(f),
        he: /a$/.test(f),
      });
    });
  C.switchById = {};
  C.switches.forEach((s) => (C.switchById[s.id] = s));
  C.switchBrands = [...new Set(C.switches.map((s) => s.brand))].sort((a, b) => a.localeCompare(b));

  C.describeSwitch = function (s) {
    const bits = [];
    const kind = { jacket: 'click-jacket', bar: 'click-bar', leaf: 'leaf-spring click' }[s.clickKind];
    if (kind) bits.push(kind + (s.heavyBar ? ' (thick)' : ''));
    if (s.type === 'tactile') bits.push(s.bump > 0.8 ? 'big rounded bump' : s.bump < 0.5 ? 'light bump' : 'medium bump');
    if (s.type === 'silent') bits.push('dampened bottom & top-out');
    if (s.he) bits.push('hall-effect magnetic');
    if (s.optical) bits.push('optical');
    if (s.longPole) bits.push('long-pole stem');
    if (s.box) bits.push('box stem');
    if (s.lowProfile) bits.push('low profile');
    bits.push(C.HOUSINGS[s.housing].name + ' housing');
    bits.push(s.factoryLube ? 'factory lubed' : 'ships dry');
    return bits;
  };

  /* ------------------------------ keycaps ------------------------------ */
  const COLOR_WORDS = {
    'dark grey': '#3f4246', 'dark gray': '#3f4246', 'light grey': '#c9cacc', 'light gray': '#c9cacc', 'light blue': '#9cc8ec', 'sky blue': '#8ec5ea', 'dark blue': '#22325e', 'navy blue': '#1f2a4d', 'cotton candy': '#f6c0da', 'royal blue': '#2a4fb5', 'baby blue': '#a9d1f0', 'forest green': '#2e5a3a', 'mint green': '#9fe0c4', 'dark green': '#2f4f3a', 'hot pink': '#f05a9a',
    white: '#f2f0ea', black: '#1d1e20', grey: '#8a8d91', gray: '#8a8d91', silver: '#c0c3c7', charcoal: '#2f3133', graphite: '#3a3c40', slate: '#5a6470', steel: '#6a7a8a', granite: '#6e6e70', smoke: '#55585d', smoky: '#55585d',
    beige: '#e3d8c3', cream: '#efe6d2', ivory: '#f3ecd9', milk: '#f5f2ea', vanilla: '#f3e8cc', oat: '#e2d3b2', sand: '#d9c7a3', khaki: '#b9a77a', tan: '#c9a77c', latte: '#c9a882',
    red: '#c8323a', crimson: '#b0203a', ruby: '#b3243f', burgundy: '#6d1f2c', wine: '#7a2033', maroon: '#6b1f24', rust: '#a8492b', brick: '#a33b2b', coral: '#f27a6b', salmon: '#f08a75', strawberry: '#e0455f',
    blue: '#2f62c4', navy: '#1f2a4d', azure: '#3c8de0', royal: '#2a4fb5', denim: '#3a5a8a', sapphire: '#2a4fb0', ocean: '#2a7bbd', sea: '#2a8fb0', cobalt: '#1f4fb0', indigo: '#3a3a8a', midnight: '#1c2340',
    teal: '#1f8a8a', cyan: '#38c6d9', turquoise: '#36bfb1', aqua: '#4fd1d9', apatite: '#3fb5c7', ice: '#cfe8f5', arctic: '#d7ecf5', frost: '#dbe9f1', snow: '#f4f7fa', cloud: '#e8eef3',
    green: '#3f9b52', mint: '#9fe0c4', olive: '#6c7a3a', forest: '#2e5a3a', matcha: '#9ab973', lime: '#a5d63d', jade: '#5fb59a', emerald: '#2e9a6a', moss: '#5f6f3a', sage: '#9caf88', avocado: '#7a9a3a', camo: '#5b6b3c', army: '#4b5a35',
    yellow: '#f2c94c', gold: '#d4a73c', golden: '#d4a73c', amber: '#e09a2a', honey: '#e8b04a', lemon: '#f3e05a', banana: '#f2dc6b', dandelion: '#f5cf3a', sunshine: '#f4c542', mustard: '#d1a43a',
    orange: '#ec7a2c', tangerine: '#f28a3a', peach: '#f6b49a', apricot: '#f5a86a', pumpkin: '#e0782a', sunset: '#f08a4b', terracotta: '#c4673f', copper: '#b8734a',
    pink: '#f2a2c0', rose: '#e58aa5', sakura: '#f6c3d3', blush: '#f4c6cf', magenta: '#d23c8f', fuchsia: '#d23c9f', bubblegum: '#f59bc2', candy: '#f6a6c8', berry: '#8a2b5a',
    purple: '#7a4fc0', violet: '#8b5cf6', lavender: '#b9a7e3', lilac: '#c8a2d8', wisteria: '#a98fd6', grape: '#6b3fa0', plum: '#6a3a6a', taro: '#b7a0d0', galaxy: '#3a2a6a', amethyst: '#8a5cc0',
    brown: '#7a5233', chocolate: '#5a3a24', coffee: '#6f4e37', mocha: '#8a6a50', cocoa: '#6b4630', espresso: '#4a2f22', caramel: '#c0803a', walnut: '#5a3b28', wood: '#9a6a42',
  };
  const COLOR_KEYS = Object.keys(COLOR_WORDS).sort((a, b) => b.length - a.length);

  // known colorway names → [alpha, alpha legend, mod, mod legend, accent]
  const THEMES = {
    dolch: ['#4a4d52', '#d8dadc', '#2e3034', '#d8dadc', '#b8323a'],
    '9009': ['#d8d2c2', '#2b2b2b', '#a9a69c', '#2b2b2b', '#5f9ea0'],
    '8008': ['#b9bec4', '#2c2e33', '#2c2e33', '#f2a2c0', '#f2a2c0'],
    olivia: ['#ecdcd5', '#2b2b2b', '#2b2b2b', '#e8b4b8', '#e8b4b8'],
    botanical: ['#e9e5d6', '#3f6a4a', '#5f8a5c', '#e9e5d6', '#5f8a5c'],
    laser: ['#2a2040', '#e04ac8', '#3a2a60', '#42d6e6', '#e04ac8'],
    bento: ['#f3eee5', '#1e3a5f', '#1e3a5f', '#f3eee5', '#e86a7e'],
    nord: ['#3b4252', '#d8dee9', '#2e3440', '#88c0d0', '#88c0d0'],
    dracula: ['#282a36', '#f8f8f2', '#44475a', '#bd93f9', '#ff79c6'],
    camping: ['#e8e2d0', '#4a5a3a', '#7c8a5a', '#f0e8d0', '#d9733a'],
    tiramisu: ['#efe3cf', '#5a3a24', '#8a6447', '#efe3cf', '#5a3a24'],
    moomin: ['#f2f0ea', '#2a5a8a', '#8fc1d9', '#2a5a8a', '#e05a5a'],
    solarized: ['#fdf6e3', '#586e75', '#073642', '#93a1a1', '#268bd2'],
    nes: ['#c8c8c8', '#2a2a2a', '#3a3a3a', '#d0d0d0', '#c8323a'],
    retro: ['#ddd5bf', '#3a3a3a', '#9a978c', '#2a2a2a', '#c8323a'],
    llama: ['#e8f5f2', '#3a6a8a', '#7fd1c7', '#2a3a5a', '#b9a7e3'],
    horizon: ['#2a2d3a', '#f0a050', '#1e2029', '#f0a050', '#e8603a'],
    selene: ['#e9ecf2', '#3a4560', '#3a4560', '#e9ecf2', '#c8a2d8'],
    stargaze: ['#1c2340', '#e9d8a6', '#2a3360', '#e9d8a6', '#e9d8a6'],
    marmoreal: ['#ecebe6', '#4a4a4a', '#c9c6bd', '#4a4a4a', '#a88a5a'],
    'chaos theory': ['#2b2d30', '#e8e8e8', '#e8e8e8', '#2b2d30', '#e2b714'],
    fabrik: ['#d9d6cf', '#2b2b2b', '#2b2b2b', '#d9d6cf', '#e0782a'],
    shirasagi: ['#f2f0ea', '#2a2a2a', '#2a2a2a', '#f2f0ea', '#c8323a'],
    soju: ['#cfe3d4', '#2f5a3a', '#2f5a3a', '#cfe3d4', '#e0e8e0'],
    afterglow: ['#f5d0a9', '#5a2a3a', '#d9707a', '#fff2e0', '#8a4ab0'],
    azure: ['#e8f0f8', '#2a5ab0', '#2a5ab0', '#e8f0f8', '#e8f0f8'],
    ochi: ['#f0ece2', '#3a3a3a', '#6a8aa8', '#f0ece2', '#e07a5a'],
    nazca: ['#d9c7a3', '#4a3a2a', '#8a5a3a', '#f0e6d0', '#3a6a7a'],
    joker: ['#3a2a5a', '#7ad04a', '#2a1e40', '#7ad04a', '#7ad04a'],
    comic: ['#fff4c0', '#1e1e1e', '#e8483a', '#fff4c0', '#2a62c4'],
    aurora: ['#1e2a3a', '#7ae0b0', '#2a3a5a', '#b48ae8', '#7ae0b0'],
    'yuki onna': ['#eef3f8', '#3a4a6a', '#9ab0c8', '#eef3f8', '#c8323a'],
    'bon voyage': ['#f0e8d8', '#1e3a5f', '#1e3a5f', '#f0e8d8', '#d9534f'],
    'good in blue': ['#e8eef8', '#2a4a8a', '#2a4a8a', '#e8eef8', '#e8eef8'],
    pudding: ['#2b2d30', '#f2f0ea', '#2b2d30', '#f2f0ea', '#2b2d30'],
    penguin: ['#f2f0ea', '#1e1e20', '#1e1e20', '#f2f0ea', '#f2b13a'],
    boba: ['#e8d8c0', '#5a3a24', '#5a3a24', '#e8d8c0', '#2b2d30'],
    cyber: ['#14161c', '#3de0e0', '#1e2230', '#f03ad0', '#f03ad0'],
    monet: ['#cfe0e8', '#3a5a7a', '#a8c0a0', '#2a4a5a', '#e8b0b8'],
    hanzo: ['#2b2d30', '#e8e8e8', '#8a2a2a', '#e8e8e8', '#8a2a2a'],
    'lost land': ['#d8cfb6', '#4a5a3a', '#6a7a4a', '#f0e8d0', '#c06a3a'],
    'ink painting': ['#f2f0ea', '#1e1e20', '#c9c6bd', '#1e1e20', '#b8323a'],
    'starry night': ['#1c2a5a', '#f2d060', '#24387a', '#f2d060', '#f2d060'],
    'yellow submarine': ['#f2d04a', '#1e3a5f', '#1e3a5f', '#f2d04a', '#e8483a'],
    'year of the tiger': ['#f2a03a', '#1e1e20', '#1e1e20', '#f2a03a', '#f2f0ea'],
    'dairy cow': ['#f2f0ea', '#1e1e20', '#1e1e20', '#f2f0ea', '#f2b8c6'],
  };
  const THEME_KEYS = Object.keys(THEMES).sort((a, b) => b.length - a.length);

  const FALLBACK = [
    ['#e8e4d8', '#3a3a3a', '#9aa0a6', '#2a2a2a', '#d9534f'],
    ['#2b2d30', '#e2b714', '#1f2023', '#e2b714', '#e2b714'],
    ['#f4f1ea', '#2a4fb5', '#2a4fb5', '#f4f1ea', '#e05a47'],
    ['#1f2a4d', '#e7c9a9', '#e7c9a9', '#1f2a4d', '#e05a7a'],
    ['#efe6d2', '#5a3a24', '#7a5233', '#efe6d2', '#3f9b52'],
    ['#e8b4b8', '#3a2d30', '#2b2d30', '#e8b4b8', '#2b2d30'],
    ['#3a3f4b', '#c8d0e0', '#5e81ac', '#eceff4', '#bf616a'],
    ['#d7ecf5', '#2a4f6a', '#7fb3d5', '#ffffff', '#f2a2c0'],
    ['#f5f2ea', '#3f9b52', '#3f9b52', '#f5f2ea', '#ec7a2c'],
    ['#fafafa', '#111111', '#111111', '#fafafa', '#c8323a'],
    ['#7a4fc0', '#f2f0ea', '#3a2a6a', '#f2f0ea', '#38c6d9'],
    ['#f2e8d0', '#8a3a2a', '#3a5a4a', '#f2e8d0', '#e0a03a'],
    ['#cfd8dc', '#263238', '#546e7a', '#eceff1', '#ff8a65'],
    ['#fbe9e7', '#6d4c41', '#a1887f', '#fbe9e7', '#ef9a9a'],
  ];

  function colorsFromTitle(title) {
    const t = ' ' + title.toLowerCase().replace(/[\/+&,()]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const theme = () => {
      for (const k of THEME_KEYS) if (t.includes(' ' + k + ' ')) return THEMES[k].slice();
      return null;
    };

    if (/ wob | white on black /.test(t)) return ['#1d1e20', '#f2f0ea', '#1d1e20', '#f2f0ea', '#1d1e20'];
    if (/ bow | black on white /.test(t)) return ['#f2f0ea', '#1d1e20', '#f2f0ea', '#1d1e20', '#f2f0ea'];

    // find color words in order of appearance
    const found = [];
    let legend = null;
    for (const k of COLOR_KEYS) {
      const re = new RegExp(' ' + k + ' ', 'g');
      let m;
      while ((m = re.exec(t))) {
        if (found.some((f) => m.index >= f.i && m.index < f.i + f.len)) continue;
        found.push({ i: m.index, len: k.length + 1, k, c: COLOR_WORDS[k] });
      }
    }
    found.sort((a, b) => a.i - b.i);

    // "x on y" and "w/ x legends"
    const on = t.match(/ ([a-z]+(?: [a-z]+)?) on ([a-z]+(?: [a-z]+)?) /);
    if (on) {
      const a = COLOR_WORDS[on[1]] || COLOR_WORDS[on[1].split(' ').pop()];
      const b = COLOR_WORDS[on[2]] || COLOR_WORDS[on[2].split(' ')[0]];
      if (a && b) return [b, a, b, a, U.shade(b, U.lum(b) > 0.4 ? -0.15 : 0.15)];
    }
    const lg = t.match(/ (?:w\/|w |with) ([a-z]+) legends? /);
    if (lg && COLOR_WORDS[lg[1]]) legend = COLOR_WORDS[lg[1]];

    let cols = found.map((f) => f.c).filter((c) => !legend || c !== legend);
    cols = [...new Set(cols)];
    // explicit colors in the name win; otherwise fall back to a known colorway name
    if (!cols.length) return theme();

    if (cols.length === 1) {
      const a = cols[0];
      const m = U.shade(a, U.lum(a) > 0.45 ? -0.18 : 0.14);
      return [a, legend || U.readable(a), m, legend || U.readable(m), m];
    }
    // put the lighter one on the alphas, the other on the mods
    let [x, y] = cols;
    if (U.lum(y) > U.lum(x)) [x, y] = [y, x];
    const acc = cols[2] || y;
    return [x, legend || U.readable(x), y, legend || U.readable(y), acc];
  }

  function profileFrom(title, cat) {
    const t = title.toLowerCase();
    const tests = [
      [/\bmt3\b/, 'mt3'], [/\bkat\b|\bkam\b/, 'kat'], [/\bxda\b/, 'xda'], [/\bdsa\b/, 'dsa'], [/\bmda\b/, 'mda'],
      [/\bksa\b/, 'ksa'], [/\bosa\b/, 'osa'], [/\basa\b/, 'asa'], [/\blsa\b/, 'lsa'], [/\bmoa\b/, 'moa'], [/\bmog\b/, 'mog'],
      [/\bdda\b/, 'dda'], [/\bbobo\b/, 'bobo'], [/\bodm\b/, 'odm'], [/\bada\b/, 'ada'], [/\bsa profile\b|\bsa row\b/, 'sa'],
      [/low profile|\blp\b|\bmkl\b/, 'low'],
    ];
    const map = { Cherry: 'cherry', OEM: 'oem', SA: 'sa', Cubic: 'cubic', Varmilo: 'varmilo', Low: 'low', Leopold: 'leopold', OSA: 'osa', DSA: 'dsa', KSA: 'ksa', ADA: 'ada', Gateron: 'gateron', MTNU: 'mtnu' };
    if (map[cat]) return map[cat];
    for (const [re, p] of tests) if (re.test(t)) return p;
    if (/topre|hhkb|realforce/.test(t)) return 'topre';
    return 'oem';
  }

  function materialFrom(title, brand) {
    const t = title.toLowerCase();
    if (/tpr|rubber/.test(t)) return 'tpr';
    if (/silicone/.test(t)) return 'silicone';
    if (/ceramic/.test(t)) return 'ceramic';
    if (/aluminum|metal|zinc|brass/.test(t)) return 'metal';
    if (/resin/.test(t)) return 'resin';
    if (/translucent|transparent|crystal|jelly|\bclear\b/.test(t) && !/pbt/.test(t)) return 'pc';
    if (/\bpom\b/.test(t)) return 'pom';
    if (/\babs\b/.test(t)) return 'abs';
    if (/\bpbt\b/.test(t)) return 'pbt';
    if (/^(GMK|Key Kobo|Signature Plastics|Hardcap|Filco)$/.test(brand)) return 'abs';
    return 'pbt';
  }

  const BRANDS = ['Signature Plastics', 'Odin Gaming', 'Click Inc', 'Key Kobo', 'HammerWorks', 'KBParadise', 'Tai-Hao', 'KBDFans', 'EnjoyPBT', 'Keychron', 'Varmilo', 'Leopold', 'Hardcap', 'Traitors', 'Shurikey', 'Chilkey', 'Yunzii', 'Vortex', 'Ducky', 'Topre', 'Filco', 'Akko', 'HHKB', 'Meko', 'GMK', 'MKL', 'VMK', 'MK'];

  C.keycaps = [];
  C.keycapById = {};
  /* Legend typography per keycap maker, matched against the product photos on
   * mechanicalkeyboards.com. font = Google Fonts family (falls back to system sans);
   * align = where legends sit; nums = how shifted symbols are printed; mods = the
   * modifier wording set used in keyboard-view.js. */
  C.LEGEND_STYLES = {
    gmk: { name: 'gmk (bold grotesk)', font: "'Inter', Arial, sans-serif", weight: 700, size: 0.29, align: 'tl', nums: 'stack', mods: 'gmk', alpha: 'upper' },
    cherry: { name: 'cherry retro', font: "'Arimo', Helvetica, Arial, sans-serif", weight: 700, size: 0.29, align: 'tl', nums: 'stack', mods: 'oem', alpha: 'upper' },
    oem: { name: 'oem helvetica', font: "'Arimo', Helvetica, Arial, sans-serif", weight: 400, size: 0.28, align: 'tl', nums: 'stack', mods: 'oem', alpha: 'upper' },
    ducky: { name: 'ducky geometric', font: "'Montserrat', Arial, sans-serif", weight: 600, size: 0.24, align: 'tl', nums: 'side', mods: 'ducky', alpha: 'upper' },
    leopold: { name: 'leopold square', font: "'Rajdhani', 'Arial Narrow', sans-serif", weight: 600, size: 0.31, align: 'tl', nums: 'stack', mods: 'oem', alpha: 'upper' },
    gaming: { name: 'gaming', font: "'Rajdhani', 'Arial Narrow', sans-serif", weight: 700, size: 0.32, align: 'tl', nums: 'side', mods: 'upper', alpha: 'upper' },
    topre: { name: 'topre centered', font: "'Arimo', Helvetica, Arial, sans-serif", weight: 400, size: 0.27, align: 'center', nums: 'stack', mods: 'lower', alpha: 'upper' },
    cute: { name: 'rounded cute', font: "'Fredoka', 'Arial Rounded MT Bold', sans-serif", weight: 600, size: 0.3, align: 'center', nums: 'single', mods: 'upper', alpha: 'upper' },
    traitors: { name: 'japanese sub-legends', font: "'Arimo', Helvetica, Arial, sans-serif", weight: 400, size: 0.27, align: 'tl', nums: 'stack', mods: 'upperIcon', alpha: 'upper', sub: 'kana' },
    comic: { name: 'comic', font: "'Comic Neue', 'Comic Sans MS', cursive", weight: 700, size: 0.31, align: 'tl', nums: 'stack', mods: 'oem', alpha: 'upper' },
  };

  function legendFor(title, vendor, profile) {
    const t = title.toLowerCase();
    let id = 'oem';
    if (vendor === 'GMK') id = 'gmk';
    else if (/^(Ducky|MK)$/.test(vendor) || /ducky/i.test(title)) id = 'ducky';
    else if (vendor === 'Leopold') id = 'leopold';
    else if (/^(HHKB|Realforce|Topre)$/.test(vendor) || profile === 'topre') id = 'topre';
    else if (vendor === 'Traitors') id = 'traitors';
    else if (vendor === 'Click Inc' && /comic/.test(t)) id = 'comic';
    else if (/^(Akko|Yunzii|Dwarf Factory|Pheilcia)$/.test(vendor) || /\b(mog|moa|bun|meow|kitty|cat|cute)\b/.test(t)) id = 'cute';
    else if (/^(Glorious PC|NPKC|Redragon|Razer|Logitech G|Corsair|SteelSeries|ASUS ROG|HyperX|Turtle Beach|MSI|Attack Shark|Cooler Master|Mountain)$/.test(vendor) || /\b(tpr|rubber|gaming)\b/.test(t)) id = 'gaming';
    else if (/^(HammerWorks|KBDFans|EnjoyPBT|Key Kobo|VMK|80Retros)$/.test(vendor)) id = 'cherry';
    const st = Object.assign({ id }, C.LEGEND_STYLES[id]);
    if (/japanese|kana|hiragana|katakana/.test(t)) st.sub = 'kana';
    if (/hangul|korean/.test(t)) st.sub = 'hangul';
    if (/\bblank\b/.test(t)) st.blank = true;
    if (/side print|side-print|front print/.test(t)) st.align = 'front';
    return st;
  }

  window.KEYCAP_RAW.forEach(([title, cat, handle, price, vendor], i) => {
    const brand = vendor || BRANDS.find((b) => title.startsWith(b + ' ')) || title.split(' ')[0];
    const name = title.replace(/\s*Keycap Set\s*$/i, '').replace(/\s*Keycaps?\s*$/i, '').trim();
    const profile = profileFrom(title, cat);
    const material = materialFrom(title, brand);
    let cols = colorsFromTitle(title);
    let guessed = false;
    const photo = !cols && window.KEYCAP_PHOTO_COLORS && window.KEYCAP_PHOTO_COLORS[handle];
    if (photo) {
      cols = [photo[0], U.readable(photo[0]), photo[1], U.readable(photo[1]), photo[2]];
      guessed = 'photo';
    }
    if (!cols) {
      cols = FALLBACK[U.hash(title) % FALLBACK.length].slice();
      guessed = true;
    }
    let id = U.slug(name);
    if (C.keycapById[id]) id += '-' + i;
    const kc = {
      id, name, brand, profile, material, guessed, handle, price,
      legend: legendFor(title, vendor, profile),
      translucent: material === 'pc' || /translucent|pudding|backlit|seamless/i.test(title),
      colors: { a: cols[0], al: cols[1], m: cols[2], ml: cols[3], x: cols[4], xl: U.readable(cols[4]) },
    };
    C.keycaps.push(kc);
    C.keycapById[id] = kc;
  });
  C.keycapBrands = [...new Set(C.keycaps.map((k) => k.brand))].sort((a, b) => a.localeCompare(b));

  /* ---------------------------- pricing & shops ---------------------------- */
  // Street-price estimates in USD (2025–26 enthusiast market). Keycap prices are the
  // listed price on mechanicalkeyboards.com.
  C.KEY_COUNT = { '60': 61, '65': 68, '75': 84, tkl: 87, full: 104 };
  C.LAYOUT_PRICE = { '60': 0.9, '65': 1, '75': 1.1, tkl: 1.25, full: 1.35 };
  C.CASE_PRICE = { aluminum: 160, brass: 380, polycarbonate: 110, acrylic: 75, wood: 130, plastic: 45, carbon: 220 };
  C.PLATE_PRICE = { aluminum: 25, brass: 45, steel: 20, fr4: 25, pc: 25, pom: 30, cf: 40 };
  C.PCB_PRICE = 45; // hot-swap pcb
  C.STAB_PRICE = 20; // screw-in stabilizer set
  C.MOD_PRICE = { caseFoam: 12, plateFoam: 8, peFoam: 6, tape: 4, films: 12, forceBreak: 4, orings: 8, stabLube: 9, holee: 4, deskmat: 22, flexCuts: 0 };
  C.MOD_QUERY = { caseFoam: 'keyboard case foam', plateFoam: 'keyboard plate foam poron', peFoam: 'keyboard pe foam sheet', tape: 'painters tape', films: 'switch films', forceBreak: 'force break mod tape', orings: 'keycap o-rings', stabLube: 'dielectric grease stabilizer', holee: 'band-aid holee mod', deskmat: 'desk mat', flexCuts: 'flex cut pcb' };
  C.LUBE_PRICE = { stock: 0, springs: 9, krytox: 12, tribosys: 13, heavy: 11 };
  C.LUBE_QUERY = { springs: 'Krytox GPL 105', krytox: 'Krytox 205g0', tribosys: 'Tribosys 3204', heavy: 'Krytox GPL 206' };

  const BRAND_SWITCH_PRICE = {
    Cherry: 0.45, Gateron: 0.3, Kailh: 0.35, Outemu: 0.15, Akko: 0.3, Durock: 0.6, Zeal: 1.3, Drop: 0.9, Glorious: 0.6, HMX: 0.5,
    Keygeek: 0.45, BSun: 0.35, LEOBOG: 0.3, Tecsee: 0.45, TTC: 0.5, JWK: 0.55, JWICK: 0.45, Everglide: 0.45, KTT: 0.25, EPOMAKER: 0.35,
    Razer: 0.5, HyperX: 0.5, Redragon: 0.25, 'Wuque Studio': 0.5, YOK: 0.35, 'SP Star': 0.55, 'C³ Equalz': 0.75, Gazzew: 0.85,
    'Kinetic Labs': 0.95, Geonworks: 1.0, Wooting: 0.9, NK: 0.6, MK: 0.55, MMK: 0.5, Alpaca: 0.6, Candy: 0.5, Chosfox: 0.7, Domikey: 0.55,
    Hako: 0.6, HUANO: 0.45, LCET: 0.45, Gopolar: 0.5, Gamakay: 0.4, Keyfirst: 0.5,
  };
  C.switchPrice = function (s) {
    let p = BRAND_SWITCH_PRICE[s.brand] || 0.45;
    const n = s.name.toLowerCase();
    if (/mx2a|hyperglide|ink|oil king|cream|choc|holy|panda|zealio|tealio|zilent|boba/.test(n)) p *= 1.4;
    if (/milky|yellow|red|outemu|smd/.test(n) && s.brand === 'Gateron') p = Math.min(p, 0.25);
    if (s.he) p = Math.max(p, 0.85);
    return Math.round(p * 100) / 100;
  };

  C.CURRENCIES = {
    usd: { sym: '$', rate: 1, label: 'usd' },
    php: { sym: '₱', rate: 58, label: 'php' },
    eur: { sym: '€', rate: 0.88, label: 'eur' },
  };
  C.money = function (usd, cur) {
    const c = C.CURRENCIES[cur] || C.CURRENCIES.usd;
    const v = usd * c.rate;
    return c.sym + (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(v < 10 ? 2 : 0));
  };

  const q = encodeURIComponent;
  C.STORES = {
    mk: (s) => ['mechanicalkeyboards', 'https://mechanicalkeyboards.com/search?q=' + q(s)],
    divinikey: (s) => ['divinikey', 'https://divinikey.com/search?q=' + q(s)],
    kbdfans: (s) => ['kbdfans', 'https://kbdfans.com/search?q=' + q(s)],
    amazon: (s) => ['amazon', 'https://www.amazon.com/s?k=' + q(s)],
    shopee: (s) => ['shopee ph', 'https://shopee.ph/search?keyword=' + q(s)],
    lazada: (s) => ['lazada ph', 'https://www.lazada.com.ph/catalog/?q=' + q(s)],
    aliexpress: (s) => ['aliexpress', 'https://www.aliexpress.com/wholesale?SearchText=' + q(s)],
  };
  const links = (query, stores) => stores.map((s) => C.STORES[s](query));

  // itemized bill of materials with shopping links
  C.billOfMaterials = function (b) {
    const sw = C.switchById[b.switch], kc = C.keycapById[b.keycap];
    const pre = b.prebuilt && C.keyboardById[b.prebuilt];
    if (pre) {
      // a full keyboard is bought as one product
      const rows = [{ part: 'keyboard', pick: `${pre.title} · ${sw.name}${pre.looks.length > 1 ? ' · ' + pre.looks[b.look || 0].name : ''}`, usd: pre.price, links: [[pre.store, pre.url]].concat(links(pre.title.split(' ').slice(0, 4).join(' '), ['amazon', 'shopee', 'lazada'])) }];
      return { rows, total: pre.price };
    }
    const lay = C.LAYOUTS[b.layout].name;
    const n = C.KEY_COUNT[b.layout];
    const rows = [];
    rows.push({ part: 'case', pick: `${lay} ${C.CASES[b.case].name} case (${C.MOUNTS[b.mount].name})`, usd: Math.round(C.CASE_PRICE[b.case] * C.LAYOUT_PRICE[b.layout]), links: links(`${lay} ${C.CASES[b.case].name} keyboard case kit`, ['kbdfans', 'amazon', 'shopee', 'lazada', 'aliexpress']) });
    rows.push({ part: 'plate', pick: `${C.PLATES[b.plate].name} plate`, usd: C.PLATE_PRICE[b.plate], links: links(`${lay} ${C.PLATES[b.plate].name} keyboard plate`, ['kbdfans', 'aliexpress', 'shopee']) });
    rows.push({ part: 'pcb + stabs', pick: `${lay} hot-swap pcb, screw-in stabilizers`, usd: C.PCB_PRICE + C.STAB_PRICE, links: links(`${lay} hotswap pcb`, ['kbdfans', 'aliexpress', 'shopee']).concat([['stabs: divinikey', 'https://divinikey.com/search?q=' + q('screw in stabilizers')]]) });
    const unit = C.switchPrice(sw);
    rows.push({ part: 'switches', pick: `${n} × ${sw.name}`, unit, usd: Math.round(unit * n * 100) / 100, links: links(sw.name + ' switches', ['divinikey', 'amazon', 'shopee', 'lazada', 'aliexpress']) });
    rows.push({ part: 'keycaps', pick: kc.name, usd: kc.price || 0, links: [['mechanicalkeyboards', 'https://mechanicalkeyboards.com/products/' + kc.handle]].concat(links(kc.name.split(' ').slice(0, 4).join(' ') + ' keycaps', ['amazon', 'shopee'])) });
    b.mods.forEach((id) => {
      if (!C.MOD_PRICE[id]) return;
      rows.push({ part: 'mod', pick: C.modById[id].name, usd: C.MOD_PRICE[id], links: links(C.MOD_QUERY[id], ['divinikey', 'amazon', 'shopee']) });
    });
    if (C.LUBE_PRICE[b.lube]) rows.push({ part: 'lube', pick: C.lubeById[b.lube].name, usd: C.LUBE_PRICE[b.lube], links: links(C.LUBE_QUERY[b.lube], ['divinikey', 'amazon', 'shopee']) });
    const total = rows.reduce((s, r) => s + r.usd, 0);
    return { rows, total };
  };

  /* ------------------------- full (prebuilt) keyboards ------------------------- */
  // Store switch names → a switch the sound model understands. Specific overrides
  // first (vendor switches that aren't in the keybumps list, and traps like MX
  // *Nature* White being linear while MX White is clicky), then the closest
  // catalog switch by name, then a switch synthesized from the name.
  const SW_OVERRIDES = [
    [/nature white/, { type: 'linear', force: 55, housing: 'nylon' }],
    [/ec sakura|ec moxa/, { type: 'linear', force: 45 }],
    [/ec rose/, { type: 'linear', force: 55 }],
    [/daisy/, { type: 'linear', force: 35 }],
    [/ec jasmine/, { type: 'linear', force: 40 }],
    [/ec violet/, { type: 'tactile', force: 45, bump: 0.6 }],
    [/ec iris/, { type: 'tactile', force: 45, bump: 0.95 }],
    [/ec ivy/, { type: 'clicky', force: 50, clickKind: 'jacket' }],
    [/super red/, { type: 'linear', force: 43 }],
    [/super brown/, { type: 'tactile', force: 55, bump: 0.55 }],
    [/super banana|jupiter banana|silk pom.*banana|banana silk/, { type: 'tactile', force: 57, bump: 0.85 }],
    [/jupiter red|red silk|silk pom.*red/, { type: 'linear', force: 45 }],
    [/jupiter brown|brown silk|silk pom.*brown/, { type: 'tactile', force: 55, bump: 0.5 }],
    [/prestige silent|prestige light/, { type: 'silent', force: 38 }],
    [/prestige voice/, { type: 'linear', force: 40 }],
    [/prestige red/, { type: 'linear', force: 45 }],
    [/baby kangaroo/, { type: 'tactile', force: 59, bump: 0.9 }],
    [/matias.*(quiet|silent)/, { type: 'silent', force: 60, bump: 0.6 }],
    [/matias/, { type: 'clicky', force: 60, clickKind: 'leaf' }],
    [/topre|electro-?capacitive/, { dome: true }],
    // gaming brands' own switches (makers' spec sheets)
    [/razer green/, { type: 'clicky', force: 50, clickKind: 'jacket' }],
    [/razer yellow/, { type: 'linear', force: 45 }],
    [/razer orange/, { type: 'tactile', force: 50, bump: 0.45 }],
    [/razer.*clicky optical/, { type: 'clicky', force: 45, clickKind: 'bar' }],
    [/razer.*(linear|analog) optical/, { type: 'linear', force: 40, housing: 'pc', he: false }],
    [/logitech gl clicky/, { type: 'clicky', force: 50, clickKind: 'bar' }],
    [/logitech gx blue/, { type: 'clicky', force: 50, clickKind: 'jacket' }],
    [/logitech.*tactile/, { type: 'tactile', force: 50, bump: 0.5 }],
    [/logitech.*(linear|magnetic)/, { type: 'linear', force: 50 }],
    [/corsair mlx red/, { type: 'linear', force: 45 }],
    [/corsair mlx brown/, { type: 'tactile', force: 55, bump: 0.5 }],
    [/corsair (opx|mgx)/, { type: 'linear', force: 45 }],
    [/omnipoint|optipoint optical linear|qx2 red/, { type: 'linear', force: 45 }],
    [/optipoint optical tactile|qx2 brown/, { type: 'tactile', force: 45, bump: 0.5 }],
    [/nx storm/, { type: 'clicky', force: 55, clickKind: 'jacket' }],
    [/nx snow|nx red|hfx/, { type: 'linear', force: 40 }],
    [/rog rx .*blue/, { type: 'clicky', force: 60, clickKind: 'bar' }],
    [/rog rx .*red/, { type: 'linear', force: 40 }],
    [/hyperx aqua/, { type: 'tactile', force: 45, bump: 0.55 }],
    [/titan ii|sonic red|raesha|reaper|graywood/, { type: 'linear', force: 45 }],
    [/mountain tactile/, { type: 'tactile', force: 55, bump: 0.6 }],
  ];
  const COLOR_TYPE = [[/silent/, 'silent'], [/blue|green|jade|navy|click|bronze|gold|pale blue/, 'clicky'], [/brown|clear|tactile|purple|banana|violet|iris|panda|kangaroo|copper|tangerine/, 'tactile']];
  const TYPE_FORCE = { linear: 45, tactile: 55, clicky: 60, silent: 45 };
  const stoks = (s) => s.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().split(' ').filter(Boolean);

  function matchCatalog(name) {
    const vt = new Set(stoks(name));
    let best = null, score = 0;
    C.switches.forEach((s) => {
      const ct = stoks(s.name);
      if (!vt.has(ct[0]) || !ct.every((t) => vt.has(t))) return;
      if (ct.length > score || (ct.length === score && s.name.length < best.name.length)) {
        best = s;
        score = ct.length;
      }
    });
    return score >= 2 ? best : null;
  }

  const resolved = {};
  C.resolveSwitch = function (name) {
    if (resolved[name]) return resolved[name];
    const n = name.toLowerCase();
    const id = 'kb-' + U.slug(name);
    const ov = (SW_OVERRIDES.find(([re]) => re.test(n)) || [])[1];
    const base = ov && !ov.dome ? null : matchCatalog(name);
    let s;
    if (base && !ov) {
      s = Object.assign({}, base, { id, name });
    } else {
      // a type word in the name ("Linear Violet") beats the color guess (violet → tactile)
      const said = (n.match(/\b(silent|linear|tactile|clicky)\b/) || [])[1];
      const type = (ov && ov.type) || said || (COLOR_TYPE.find(([re]) => re.test(n)) || [])[1] || 'linear';
      const fm = n.match(/(\d{2})\s?g\b/);
      s = inferSwitch({ id, name, brand: name.split(' ')[0], type, force: fm ? +fm[1] : (ov && ov.force) || TYPE_FORCE[type], he: /magnetic|inductive|hall|\bhe\b|tmr|lekker/.test(n) });
      if (ov) Object.assign(s, ov);
      if (s.type === 'tactile' && !s.bump) s.bump = 0.6;
      if (s.type === 'clicky' && !s.clickKind) s.clickKind = /box|kailh/.test(n) ? 'bar' : 'jacket';
      if (s.dome) {
        // Topre: rubber dome over a conical spring — rounded, muted "thock", soft bump
        s.type = /silent/.test(n) ? 'silent' : 'tactile';
        s.force = fm ? +fm[1] : 45;
        s.bump = 0.55;
        s.housing = 'nylon';
      }
    }
    if (/g pro|pro \d|\bpro\b|lubed|silk|jupiter|prestige|super|mx2a|hyperglide|\bec\b|v2|2\.0|3\.0/.test(n)) s.factoryLube = true;
    if (/low profile/.test(n)) s.lowProfile = true;
    if (/thick navy/.test(n)) s.heavyBar = true;
    s.typeLabel = (s.dome ? 'topre ' : '') + s.type + (s.he ? ' · magnetic' : '');
    C.switchById[id] = s;
    return (resolved[name] = id);
  };

  // colored keys seen in a board's photo ({ wasd: [W, A, S, D], arrows: [↑, ←, ↓, →], esc, enter, space })
  // → { key code: color } for the keyboard view
  const ACCENT_CODES = { wasd: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], arrows: ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'], esc: ['Escape'], enter: ['Enter'], space: ['Space'] };
  function accentKeys(acc) {
    if (!acc) return null;
    const keys = {};
    Object.keys(ACCENT_CODES).forEach((g) => {
      if (!acc[g]) return;
      const cols = [].concat(acc[g]);
      ACCENT_CODES[g].forEach((code, i) => {
        const c = cols[Math.min(i, cols.length - 1)];
        if (/^#[0-9a-f]{6}$/i.test(c)) keys[code] = c;
      });
    });
    return Object.keys(keys).length ? keys : null;
  }

  const SIZE_NAME = { '60': '60%', '65': '65%', '75': '75%', tkl: 'tkl', full: 'full size' };
  C.keyboards = (window.KEYBOARD_RAW || []).map((r) => {
    const kb = {
      id: r.h, title: r.t, vendor: r.v, size: r.sz, sizeName: SIZE_NAME[r.sz], price: r.p,
      url: r.u || 'https://mechanicalkeyboards.com/products/' + r.h,
      store: r.u ? new URL(r.u).hostname.replace(/^(www|en)\./, '') : 'mechanicalkeyboards.com',
      case: r.c, plate: r.pl, mount: r.m, factory: r.f || [], lubed: !!r.lb, kp: r.kp, km: r.km,
      switches: (r.sw || []).map((name) => ({ name, id: C.resolveSwitch(name) })),
    };
    kb.looks = r.looks.map(([name, img, cs, a, m, x, acc], i) => {
      const caseColor = /^#[0-9a-f]{6}$/i.test(cs) ? cs : '#2a2b2e';
      const A = /^#[0-9a-f]{6}$/i.test(a) ? a : '#2f3033', M = /^#[0-9a-f]{6}$/i.test(m) ? m : A, X = /^#[0-9a-f]{6}$/i.test(x) ? x : M;
      const kc = {
        id: `kb:${r.h}:${i}`, name: `${r.v} stock keycaps`, brand: r.v, profile: C.KC_PROFILES[r.kp] ? r.kp : 'oem', material: C.KC_MATERIALS[r.km] ? r.km : 'abs',
        stock: true, price: 0, translucent: false,
        colors: { a: A, al: U.readable(A), m: M, ml: U.readable(M), x: X, xl: U.readable(X) },
        keys: accentKeys(acc),
      };
      kc.legend = legendFor(r.t, r.v, kc.profile);
      C.keycapById[kc.id] = kc;
      return { name: name === 'default' ? 'standard' : name, img: img ? (img.startsWith('//') ? 'https:' + img : img) : '', caseColor, keycap: kc.id };
    });
    kb.search = (r.t + ' ' + r.v + ' ' + (r.sw || []).join(' ')).toLowerCase();
    return kb;
  });
  C.keyboardById = {};
  C.keyboards.forEach((k) => (C.keyboardById[k.id] = k));
  C.keyboardBrands = [...new Set(C.keyboards.map((k) => k.vendor))].sort((a, b) => a.localeCompare(b));

  // a full keyboard as a build: exactly its parts, its factory foam/lube, no user mods
  C.prebuiltBuild = function (kb, lookIdx, swIdx) {
    const look = kb.looks[lookIdx || 0] || kb.looks[0];
    const sw = kb.switches[swIdx || 0] || kb.switches[0];
    return {
      layout: kb.size, case: kb.case, caseColor: look.caseColor, plate: kb.plate, mount: kb.mount,
      switch: sw.id, keycap: look.keycap, mods: kb.factory.slice(), lube: kb.lubed ? 'tribosys' : 'stock',
      prebuilt: kb.id, look: lookIdx || 0, swIdx: swIdx || 0,
    };
  };

  /* ------------------------------ defaults ------------------------------ */
  // The board heard on the home page and the starting point for new accounts:
  // tuned to read "thocky · marbly · dense · smooth · creamy" in the sound model.
  C.defaultBuild = function () {
    const kc = C.keycapById['hammerworks-crp-r7-beige-cherry-profile-dye-sub-pbt'] || C.keycaps.find((k) => k.material === 'pbt' && k.profile === 'cherry') || C.keycaps[0];
    return {
      layout: '65',
      case: 'aluminum',
      caseColor: '#4b4d52',
      plate: 'aluminum',
      mount: 'gasket',
      switch: C.switchById['nk-cream'] ? 'nk-cream' : C.switches[0].id,
      keycap: kc.id,
      mods: ['caseFoam', 'peFoam', 'stabLube'],
      lube: 'krytox',
    };
  };

  // vs players with no saved build: the same creamy recipe as a TKL in a white case
  // with black-on-white keycaps
  C.PVP_DEFAULT_NAME = 'creamy white tkl (default)';
  C.pvpDefaultBuild = function () {
    const kc = C.keycapById['vmk-black-on-white-171-key-cherry-profile-double-shot-pbt'] || C.keycapById[C.defaultBuild().keycap];
    return Object.assign(C.defaultBuild(), { layout: 'tkl', caseColor: '#ebeae4', keycap: kc.id });
  };

  C.sanitizeBuild = function (b) {
    const d = C.defaultBuild();
    if (!b || typeof b !== 'object') return d;
    const out = Object.assign({}, d, b);
    if (!C.LAYOUTS[out.layout]) out.layout = d.layout;
    if (!C.CASES[out.case]) out.case = d.case;
    if (!C.PLATES[out.plate]) out.plate = d.plate;
    if (!C.MOUNTS[out.mount]) out.mount = d.mount;
    if (!C.switchById[out.switch]) out.switch = d.switch;
    if (!C.keycapById[out.keycap]) out.keycap = d.keycap;
    if (!C.lubeById[out.lube]) out.lube = d.lube;
    out.mods = Array.isArray(out.mods) ? out.mods.filter((m) => C.modById[m]) : [];
    if (!/^#[0-9a-f]{6}$/i.test(out.caseColor)) out.caseColor = C.CASES[out.case].colors[0][1];
    return out;
  };
})();
