/**
 * Moon Jump game engine (canvas + pixel HTML overlays).
 * Plain JS on purpose: it is a self-contained game loop. Types for callers are in engine.d.ts.
 * Rules (XP, levels, plausibility) must stay in step with api/_lib/rules.ts.
 */

const C = { ink: '#14124A', indigo: '#2B2BD9', lav: '#ECEBFF', lav2: '#D6D4FF', gold: '#FFC94D', goldD: '#D9A12E', green: '#2FBF71', greenD: '#1E8C52', red: '#FF5A4E', redD: '#B4320A', rug: '#7A3FC2', white: '#FFFFFF' };
const LW = 390;
const PX_PER_M = 5;
const G = 1500, JUMP = -820, SUPER = -1380, ROCKET_V = -1150;
const PHASES = [
  { name: 'ACCUMULATION', from: 0, to: 1000, bg: C.green, fg: C.white },
  { name: 'BULL RUN', from: 1000, to: 3000, bg: C.indigo, fg: C.white },
  { name: 'VOLATILITY', from: 3000, to: 6000, bg: C.red, fg: C.white },
  { name: 'MANIA', from: 6000, to: Infinity, bg: C.gold, fg: C.ink },
];
const LEVELS = [
  { name: 'PAPER HANDS', xp: 0, color: '#B9B3D9' }, { name: 'WOOD HANDS', xp: 300, color: '#C08552' },
  { name: 'STONE HANDS', xp: 800, color: '#A3A3BF' }, { name: 'IRON HANDS', xp: 2000, color: '#7E8BA6' },
  { name: 'GOLD HANDS', xp: 5000, color: C.gold }, { name: 'DIAMOND HANDS', xp: 12000, color: '#8FE3FF' },
];
const STREETS = ['Tent Camp', 'Cabin Row', 'Stone Street', 'Modern Hill', 'Villa Heights', 'Moon Base'];
const TIER_SHORT = ['TENT', 'CABIN', 'STONE', 'MODERN', 'VILLA', 'MOON'];
const CHARS = [
  { id: 'boss', name: 'THE BOSS', anchor: 0.5, fx: 'gold' },
  { id: 'frog', name: 'PEPE', anchor: 0.5, fx: 'green' },
  { id: 'laser', name: 'LASER EYES', anchor: 0.31, fx: 'laser' },
  { id: 'satoshi', name: 'SATOSHI', anchor: 0.5, fx: 'block' },
];
const MODS = [
  { id: 'rugs', short: 'Rug season', text: 'Rug season. Twice as many rugs after 2,000M.' },
  { id: 'bears', short: 'Bear market', text: 'Bear market. More bears from 1,000M.' },
  { id: 'whales', short: 'Whale watch', text: 'Whale watch. Whales show up early.' },
  { id: 'diamonds', short: 'Diamond day', text: 'Diamond day. More rockets on the map.' },
];
const ERRORS = {
  taken: 'That name is taken. Try another.',
  format: 'Use 3–15 letters, numbers or _.',
  bad_username: 'Use 3–15 letters, numbers or _.',
  network: "Can't reach the game server. Check your connection.",
  too_fast: 'This run looked impossible, so it was not saved.',
  too_many_coins: 'This run looked impossible, so it was not saved.',
  ticket_used: 'This run was already saved.',
  ticket_expired: 'This run took too long to save.',
  no_session: 'Your sign-in expired. Sign in again.',
  not_configured: 'The game server is not set up yet.',
};
const errText = (e) => ERRORS[(e && e.code) || ''] || ERRORS.network;

// ---------- sprites ----------
const sym = (half) => half.map((h) => h + h.split('').reverse().join(''));
const SPR = {
  coin: [['..KKKK..', '.KYYYYK.', 'KYWYYYDK', 'KYWYYYDK', 'KYYYYYDK', 'KYYYYDDK', '.KDDDDK.', '..KKKK..'], { K: '#8A5A00', Y: C.gold, W: '#FFF3C4', D: C.goldD }],
  diam: [['..KKKKK..', '.KWWCCcK.', 'KWCCCCCcK', 'KKKKKKKKK', '.KCCCCcK.', '..KCCcK..', '...KcK...', '....K....'], { K: '#0F5C7A', W: '#FFFFFF', C: '#8FE3FF', c: '#3BB0DB' }],
  horns: [['K..........K', 'KK........KK', '.KHK....KHK.', '.KHHKKKKHHK.', '..KHHHHHHK..', '...KKKKKK...'], { K: '#8A5A00', H: '#FFF3D1' }],
  bear: [sym(['KKK...', 'KbBKKK', 'KBBBBB', 'KBBBBB', 'KBBEBB', 'KBBBBB', 'KBBMMM', 'KBBMMK', '.KBMMM', '..KBBB', '...KKK']), { K: '#2A1A12', B: '#7B4A2A', b: '#C99A72', E: C.ink, M: '#C99A72' }],
  whale: [['....KKKKKKK.......', '..KKBBBBBBBKK...KK', '.KBBBBBBBBBBBK.KBK', 'KBBWBBBBBBBBBBKBBK', 'KBBKBBBBBBBBBBBBK.', 'KBBBBBBBBBBBBBBK..', 'KLLLLLLLLLBBBBK...', '.KLLLLLLLLLKKK....', '..KKKKKKKKK.......'], { K: C.ink, B: '#3C4FA8', W: '#FFFFFF', L: '#B9C4F2' }],
  cloud: [['....WWWW........', '..WWWWWWWW..WWW.', '.WWWWWWWWWWWWWWW', 'WWWWWWWWWWWWWWWW', '.SSSSSSSSSSSSSS.'], { W: '#FFFFFF', S: '#DAD8FB' }],
  moon: [(() => { const h = sym(['...KKK', '.KKMMM', '.KMMMM', 'KMMmMM', 'KMmmMM', 'KMMMMM']); return h.concat(h.slice().reverse()); })(), { K: '#D9B85C', M: '#FFE7A6', m: '#F2D27E' }],
};
const HOUSES = [
  [['......KK......', '.....KRRK.....', '....KRRRRK....', '...KRRKKRRK...', '..KRRKDDKRRK..', '.KRRRKDDKRRRK.', 'KKKKKKDDKKKKKK'], { K: C.ink, R: '#E46B4F', D: '#3A1A12' }],
  [['......KK......', '.....KRRK.....', '....KRRRRK....', '...KRRRRRRK...', '..KKKKKKKKKK..', '..KWWWWWWWWK..', '..KWYYWWDDWK..', '..KWYYWWDDWK..', '..KWWWWWDDWK..', 'KKKKKKKKKKKKKK'], { K: C.ink, R: '#8B5A2B', W: '#C08552', Y: C.gold, D: '#5A3215' }],
  [['......KK......', '.....KRRK.....', '....KRRRRK....', '...KRRRRRRK...', '..KRRRRRRRRK..', '.KKKKKKKKKKKK.', '..KGGgGGGgGK..', '..KGYYGGDDGK..', '..KGYYGGDDGK..', '..KgGGGgDDgK..', '..KGGGGGDDGK..', 'KKKKKKKKKKKKKK'], { K: C.ink, R: '#5E5E7A', G: '#B3B3CC', g: '#8E8EAA', Y: C.gold, D: '#3E3E5A' }],
  [['KKKKKKKKKKKKKK', 'KRRRRRRRRRRRRK', 'KKKKKKKKKKKKKK', '.KWWWWWWWWWWK.', '.KWYYWWWWYYWK.', '.KWYYWWWWYYWK.', '.KWWWWWWWWWWK.', '.KWYYWWDDWWWK.', '.KWYYWWDDWWWK.', 'KKKKKKKKKKKKKK'], { K: C.ink, R: '#4B4BF0', W: '#FFFFFF', Y: C.gold, D: '#5E5E7A' }],
  [['......KK......', '....KKRRKK....', '..KKRRRRRRKK..', 'KKRRRRRRRRRRKK', 'KKKKKKKKKKKKKK', '.KWWWWWWWWWWK.', '.KWYYWWWWYYWK.', '.KWYYWDDWYYWK.', '.KWWWWDDWWWWK.', 'KKKKKKKKKKKKKK'], { K: C.ink, R: C.gold, W: '#FFFFFF', Y: '#8FE3FF', D: C.goldD }],
  [['....KKKKKK....', '..KKCCCCCCKK..', '.KCCWCCCCCCCK.', 'KCCCCCCCCCCCCK', 'KCCCCCCCCCCCCK', 'KKKKKKKKKKKKKK', 'KGGYGGDDGGYGGK', 'KGGGGGDDGGGGGK', 'KKKKKKKKKKKKKK'], { K: C.ink, C: '#BFEFFF', W: '#FFFFFF', G: '#E8E6F7', Y: C.gold, D: '#5E5E7A' }],
];
const sprCache = {};
function paint(rows, pal, scale) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * scale; c.height = rows.length * scale;
  const x = c.getContext('2d');
  rows.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) { const ch = r[xx]; if (ch !== '.') { x.fillStyle = pal[ch]; x.fillRect(xx * scale, yy * scale, scale, scale); } } });
  return c;
}
function spr(name, scale) {
  const key = name + scale;
  return sprCache[key] || (sprCache[key] = paint(SPR[name][0], SPR[name][1], scale));
}
function houseCanvas(level, lit, scale) {
  const [rows, pal] = HOUSES[level];
  return paint(rows, lit ? pal : { ...pal, Y: '#5E5E7A' }, scale);
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function phaseOf(m) { for (const p of PHASES) if (m < p.to) return p; return PHASES[3]; }
function levelOf(xp) { let i = 0; for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k].xp) i = k; return i; }
const fmt = (n) => Number(n).toLocaleString('en-US');
function dayLabel(day) {
  const y = Math.floor(day / 10000), m = Math.floor(day / 100) % 100, d = day % 100;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TEMPLATE = `
<div class="mj-stage" data-el="stage">
  <canvas class="mj-canvas" data-el="cv" aria-hidden="true"></canvas>

  <div class="mj-layer" data-el="scr-boot" style="align-items:center;justify-content:center">
    <span class="mj-disp" style="font-size:12px;color:#2B2BD9">LOADING…</span>
  </div>

  <div class="mj-layer mj-scroll" data-el="scr-signin" hidden style="gap:16px">
    <div class="mj-row"><button class="mj-sq" data-el="b-exit1" aria-label="Back to wallet">${'BACK'}</button></div>
    <div class="mj-logo" style="margin-top:8px">MOON<br>JUMP</div>
    <img class="mj-hero" data-el="si-hero" alt="" style="align-self:center;height:130px;width:auto">
    <div class="mj-panel">
      <span class="mj-disp" style="font-size:12px">SIGN IN TO PLAY</span>
      <span style="font-size:17px;font-weight:500;line-height:1.4">Sign a message with your Holdr wallet to save scores and join HODL Town.</span>
      <span class="mj-muted" style="font-size:15px;line-height:1.4">Free. No gas. It cannot move any funds.</span>
      <span class="mj-err" data-el="si-err"></span>
      <button class="mj-btn" data-el="b-signin">SIGN IN</button>
    </div>
  </div>

  <div class="mj-layer mj-scroll" data-el="scr-name" hidden style="gap:14px">
    <div style="display:flex;flex-direction:column;gap:10px;padding-top:8px">
      <span class="mj-disp" style="font-size:10px;color:#2B2BD9">ONE LAST STEP</span>
      <span class="mj-disp" style="font-size:20px">PICK A NAME</span>
      <span style="font-size:17px;font-weight:500;line-height:1.35">Neighbors in HODL Town will see this name on your house.</span>
    </div>
    <img class="mj-hero" data-el="nm-hero" alt="" style="align-self:center;height:110px;width:auto">
    <label class="mj-disp" for="mj-username" style="font-size:9px">USERNAME</label>
    <div class="mj-field" style="margin-top:-6px">
      <input class="mj-input" id="mj-username" data-el="nm-input" maxlength="15" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="your_name">
      <span data-el="nm-state" style="font-size:14px;font-weight:600;white-space:nowrap"></span>
    </div>
    <span class="mj-muted" style="font-size:14px;line-height:1.4">3–15 letters, numbers or _. Your wallet address is never shown.</span>
    <div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:14px;font-weight:600">Or try one:</span><div class="mj-row" data-el="nm-sugg" style="flex-wrap:wrap;gap:8px"></div></div>
    <span class="mj-err" data-el="nm-err"></span>
    <div style="margin-top:auto"><button class="mj-btn" data-el="b-name" disabled>NEXT</button></div>
  </div>

  <div class="mj-layer mj-scroll" data-el="scr-title" hidden style="gap:12px">
    <div class="mj-row mj-between">
      <button class="mj-sq" data-el="b-exit" aria-label="Back to wallet"></button>
      <button class="mj-chip" data-el="b-checkin"></button>
      <span class="mj-chip" data-el="t-coins"></span>
      <button class="mj-sq" data-el="t-sound" aria-label="Sound"></button>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:4px">
      <div class="mj-logo">MOON<br>JUMP</div>
      <div style="font-size:16px;font-weight:600;color:#2B2BD9">Jump the candles. Reach the moon.</div>
    </div>
    <div class="mj-hero" style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end">
      <img data-el="t-hero" alt="" style="height:min(120px,15vh);width:auto;max-width:70%;object-fit:contain">
      <div aria-hidden="true" style="width:150px;height:18px;border:3px solid #14124A;background:#2FBF71;box-shadow:inset 0 3px 0 rgba(255,255,255,.45),inset 0 -3px 0 #1E8C52"></div>
    </div>
    <div class="mj-panel" style="gap:10px">
      <div class="mj-row mj-between"><span class="mj-disp" style="font-size:9px">PICK A JUMPER</span><span class="mj-muted" style="font-size:14px;font-weight:600" data-el="t-charname"></span></div>
      <div class="mj-chars" data-el="t-chars" role="group" aria-label="Characters"></div>
    </div>
    <div class="mj-panel">
      <div class="mj-row mj-between" style="align-items:flex-start">
        <div style="display:flex;flex-direction:column;gap:6px"><span class="mj-disp" style="font-size:10px;color:#2B2BD9" data-el="t-daily"></span><span style="font-size:16px;font-weight:700" data-el="t-mod"></span></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="mj-muted" style="font-size:13px">Today's rank</span><span class="mj-disp" style="font-size:11px" data-el="t-best"></span></div>
      </div>
      <div class="mj-row"><button class="mj-btn" data-el="b-daily" style="flex:1">PLAY</button><button class="mj-btn alt" data-el="b-practice" style="width:118px;font-size:9px">PRACTICE</button></div>
    </div>
    <div class="mj-panel" style="gap:8px">
      <div class="mj-row mj-between"><span class="mj-disp" style="font-size:10px" data-el="t-level"></span><span class="mj-muted" style="font-size:13px;font-variant-numeric:tabular-nums" data-el="t-xp"></span></div>
      <div class="mj-bar" data-el="t-bar"></div>
      <span class="mj-muted" style="font-size:13px" data-el="t-next"></span>
    </div>
    <div class="mj-row mj-between">
      <button class="mj-btn ghost" data-el="b-board">RANKS ▶</button>
      <button class="mj-btn ghost" data-el="b-town">HODL TOWN ▶</button>
      <button class="mj-btn ghost" data-el="b-howto">HOW TO</button>
    </div>
  </div>

  <div class="mj-layer mj-dim" data-el="scr-tut" hidden style="justify-content:center">
    <div class="mj-panel" style="gap:14px">
      <span class="mj-disp" style="font-size:9px;color:#2B2BD9;text-align:center" data-el="tut-n"></span>
      <canvas data-el="tut-cv" width="300" height="150" style="width:100%;height:150px;border:3px solid #14124A;background:#ECEBFF"></canvas>
      <span class="mj-disp" style="font-size:15px;text-align:center" data-el="tut-t"></span>
      <span style="font-size:17px;font-weight:500;text-align:center;line-height:1.4;min-height:48px" data-el="tut-d"></span>
      <div class="mj-dots" data-el="tut-dots"><i></i><i></i><i></i></div>
      <button class="mj-btn" data-el="b-tut">NEXT</button>
      <button class="mj-btn ghost" data-el="b-tutskip" style="align-self:center">SKIP</button>
    </div>
  </div>

  <div class="mj-layer mj-hud" data-el="hud" hidden>
    <div class="mj-hud-top">
      <div><div class="mj-hud-h" data-el="h-h">0M</div><div class="mj-hud-sub" data-el="h-best"></div></div>
      <button class="mj-sq" data-el="b-pause" aria-label="Pause"></button>
      <div style="justify-self:end"><span class="mj-chip" data-el="h-coins"></span></div>
    </div>
    <div class="mj-phase"><span class="tag" data-el="h-phase"></span><div class="mj-bar" data-el="h-bar"></div><span class="next" data-el="h-next"></span></div>
    <div data-el="h-banners" style="display:flex;flex-direction:column"></div>
  </div>

  <div class="mj-layer" data-el="scr-count" hidden style="background:rgba(14,12,58,.3)">
    <span class="mj-chip" data-el="c-daily" style="align-self:center;background:#FFC94D"></span>
    <div class="mj-count" data-el="c-n">3</div>
    <div class="mj-panel" data-el="c-mod" style="gap:6px;margin-bottom:16px"><span class="mj-disp" style="font-size:9px;color:#2B2BD9">TODAY'S MAP</span><span style="font-size:17px;font-weight:600" data-el="c-modt"></span></div>
  </div>

  <div class="mj-layer mj-dim" data-el="scr-pause" hidden style="justify-content:center">
    <div class="mj-panel" style="gap:12px">
      <div style="text-align:center;display:flex;flex-direction:column;gap:8px"><span class="mj-disp" style="font-size:20px">PAUSED</span><span class="mj-muted" style="font-size:16px" data-el="p-info"></span></div>
      <button class="mj-btn" data-el="b-resume">RESUME</button>
      <button class="mj-btn alt" data-el="b-restart">RESTART</button>
      <div class="mj-rule"></div>
      <button class="mj-toggle" role="switch" data-el="p-sound">Sound effects<span class="sw"><i></i></span></button>
      <button class="mj-toggle" role="switch" data-el="p-vib">Vibration<span class="sw"><i></i></span></button>
      <div class="mj-rule"></div>
      <button class="mj-btn ghost danger" data-el="b-quit" style="align-self:center">QUIT RUN</button>
    </div>
  </div>

  <div class="mj-layer mj-scroll" data-el="scr-result" hidden style="gap:14px;background:rgba(236,235,255,.94)">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:10px">
      <span class="mj-disp" style="font-size:11px;color:#B4320A;text-align:center" data-el="r-cause"></span>
      <span class="mj-big" data-el="r-h"></span>
      <span class="mj-chip" style="background:#FFC94D;font-size:8px;height:30px" data-el="r-badge"></span>
    </div>
    <div class="mj-panel" style="gap:8px" data-el="r-xp"></div>
    <div class="mj-panel" data-el="r-lvl" style="gap:8px;background:#2B2BD9;color:#fff"></div>
    <div style="flex:1;min-height:4px"></div>
    <button class="mj-btn" data-el="b-again">PLAY AGAIN</button>
    <div class="mj-row"><button class="mj-btn alt" data-el="b-share" style="flex:1;font-size:9px">COPY BRAG</button><button class="mj-btn alt" data-el="b-menu" style="flex:1;font-size:9px">MENU</button></div>
  </div>

  <div class="mj-layer" data-el="scr-board" hidden style="gap:12px;background:#ECEBFF">
    <div class="mj-row"><button class="mj-sq" data-el="b-board-back" aria-label="Back"></button><span class="mj-disp" style="font-size:13px;flex:1">TODAY'S RANKS</span><span class="mj-muted" style="font-size:14px;font-weight:600" data-el="lb-day"></span></div>
    <div class="mj-panel" style="padding:0;gap:0;flex:1;min-height:0;overflow-y:auto;touch-action:pan-y" data-el="lb-list"></div>
    <div class="mj-panel" style="padding:0;gap:0" data-el="lb-mine" hidden></div>
  </div>

  <div class="mj-layer" data-el="scr-town" hidden style="gap:10px;background:#D6D4FF">
    <div class="mj-row"><button class="mj-sq" data-el="b-town-back" aria-label="Back"></button>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="mj-disp" style="font-size:13px;color:#2B2BD9">HODL TOWN</span><span style="font-size:14px;font-weight:600" data-el="tw-sub"></span></div></div>
    <div class="mj-town" data-el="tw-grid"></div>
    <div class="mj-panel" data-el="tw-card" hidden style="flex-direction:row;align-items:center;gap:12px;padding:10px 12px"></div>
    <nav class="mj-tiers" data-el="tw-tiers" aria-label="Streets"></nav>
  </div>

  <div class="mj-toast" data-el="toast" hidden role="status"></div>
</div>`;

/**
 * Mount the game into `root`. Returns a handle with destroy().
 * @param {HTMLElement} root
 * @param {import('./engine').GameOptions} opts
 */
export function mountGame(root, opts) {
  const { api, images } = opts;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('holdr.mj.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('holdr.mj.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  root.classList.add('mj');
  root.innerHTML = TEMPLATE;
  const $ = (k) => root.querySelector('[data-el="' + k + '"]');
  const listeners = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };
  let destroyed = false;

  const imgs = {};
  CHARS.forEach((ch) => { const im = new Image(); im.src = images[ch.id]; imgs[ch.id] = im; });

  const settings = { sound: store.get('sound', true), vib: store.get('vib', true) };
  let me = null;          // server profile
  let today = null;       // { day, n, mod }
  let myRank = null;

  // ---------- audio ----------
  let ac = null;
  function beep(freq, dur, type = 'square', vol = 0.06, slide = 0) {
    if (!settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
      g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    } catch { /* audio unavailable */ }
  }
  const sfx = {
    jump: () => beep(320, 0.12, 'square', 0.05, 380),
    coin: () => { beep(988, 0.06, 'square', 0.04); setTimeout(() => beep(1318, 0.09, 'square', 0.04), 60); },
    brk: () => beep(180, 0.15, 'sawtooth', 0.05, -120),
    power: () => beep(440, 0.4, 'square', 0.05, 900),
    stomp: () => beep(140, 0.12, 'square', 0.07, -60),
    die: () => beep(400, 0.6, 'sawtooth', 0.06, -340),
    tick: () => beep(660, 0.08, 'square', 0.04),
  };
  function buzz(ms) { if (!settings.vib) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* no vibration */ } }

  // ---------- canvas ----------
  const stage = $('stage');
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let scale = 1, LH = 700, dpr = 1;
  function resize() {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = r.width / LW; LH = r.height / scale;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.imageSmoothingEnabled = false;
  }
  on(window, 'resize', resize);
  resize();

  // ---------- state ----------
  let mode = 'boot';
  let G0 = null;
  let tutAfter = null;

  function newRun(daily, seed, ticket) {
    const rnd = mulberry32(seed);
    const run = {
      daily, ticket, rnd, mod: daily && today ? MODS[today.mod].id : null,
      p: { x: LW / 2, y: 0, vx: 0, vy: JUMP, face: 1, rocket: 0, squash: 0 },
      camY: -LH * 0.72, minY: 0, coins: 0, plats: [], items: [], foes: [], parts: [],
      lastY: 0, events: [], banners: [], fog: 0, crash: 0, pump: 0, shake: 0, cause: '', dragDX: 0, best: 0,
    };
    run.plats.push({ x: LW / 2 - 70, y: 8, w: 140, kind: 'g', vx: 0 });
    let h = 1300;
    while (h < 20000) {
      const ph = phaseOf(h).name;
      const r = rnd();
      let type = null;
      if (ph === 'BULL RUN') type = r < 0.6 ? 'pump' : null;
      else if (ph === 'VOLATILITY') type = r < 0.4 ? 'fud' : r < 0.7 ? 'crash' : 'pump';
      else if (ph === 'MANIA') type = r < 0.34 ? 'fud' : r < 0.67 ? 'crash' : 'pump';
      if (type) run.events.push({ h, type });
      h += 600 + rnd() * 600;
    }
    G0 = run;
    generate();
  }

  function generate() {
    const g = G0, rnd = g.rnd;
    while (g.lastY > g.camY - 300) {
      const m = -g.lastY / PX_PER_M;
      const d = Math.min(1, m / 6000);
      const ph = phaseOf(m).name;
      const gap = Math.min(190, 62 + 70 * d + rnd() * (40 + 70 * d));
      const y = g.lastY - gap;
      let kind = 'g', w = 72 - 16 * d;
      const r = rnd();
      if (ph === 'ACCUMULATION') { if (r < 0.22) { kind = 'g'; w = 118; } else if (r < 0.3) kind = 'm'; }
      else if (ph === 'BULL RUN') { if (r < 0.16) kind = 'm'; else if (r < 0.3) kind = 'r'; else if (r < 0.38) w = 108; }
      else { if (r < 0.24) kind = 'm'; else if (r < 0.48) kind = 'r'; }
      w = Math.round(w / 3) * 3;
      const x = Math.round((8 + rnd() * (LW - 16 - w)) / 3) * 3;
      const pl = { x, y, w, kind, vx: kind === 'm' ? (rnd() < 0.5 ? -1 : 1) * (40 + 90 * d) : 0, broken: false };
      g.plats.push(pl);
      const ir = rnd();
      const diamondP = ph === 'ACCUMULATION' ? 0 : (g.mod === 'diamonds' ? 0.03 : 0.012);
      if (ir < diamondP) g.items.push({ type: 'diam', x: x + w / 2, y: y - 22 });
      else if (ir < diamondP + 0.035) g.items.push({ type: 'horns', x: x + w / 2, y: y - 16 });
      else if (ir < diamondP + 0.035 + 0.24 + (g.pump > 0 ? 0.5 : 0)) {
        for (let k = 0; k < 3; k++) g.items.push({ type: 'coin', x: x + w / 2 + (k - 1) * 26, y: y - 40 - (k === 1 ? 10 : 0) });
      }
      const rugStart = g.mod === 'rugs' ? 2000 : 3000;
      if (m > rugStart) {
        const rugP = (ph === 'MANIA' ? 0.2 : 0.12) * (g.mod === 'rugs' && m > 2000 ? 2 : 1);
        if (rnd() < rugP) {
          const rw = 66, rx = Math.round((8 + rnd() * (LW - 16 - rw)) / 3) * 3;
          if (Math.abs(rx - x) > 40) g.plats.push({ x: rx, y: y + gap * 0.5, w: rw, kind: 'rug', vx: 0 });
        }
      }
      const bearFrom = g.mod === 'bears' ? 1000 : 1500;
      if (m > bearFrom && kind !== 'r' && w < 110) {
        const bp = (0.05 + 0.08 * d) * (g.mod === 'bears' ? 1.8 : 1);
        if (rnd() < bp) g.foes.push({ type: 'bear', plat: pl, off: 0, dir: rnd() < 0.5 ? -1 : 1, x: x + w / 2, y, dead: false });
      }
      const whaleFrom = g.mod === 'whales' ? 1500 : 3000;
      if (m > whaleFrom && rnd() < (g.mod === 'whales' ? 0.06 : 0.035)) {
        g.foes.push({ type: 'whale', x: rnd() * LW, y: y - gap / 2 - 10, vx: (rnd() < 0.5 ? -1 : 1) * (50 + 60 * d), dead: false });
      }
      g.lastY = y;
    }
    const bottom = g.camY + LH + 120;
    g.plats = g.plats.filter((p) => p.y < bottom);
    g.items = g.items.filter((p) => p.y < bottom && !p.got);
    g.foes = g.foes.filter((p) => p.y < bottom && !(p.dead && p.gone));
  }

  const heightM = () => Math.max(0, Math.floor(-G0.minY / PX_PER_M));
  const charOf = () => CHARS.find((c) => c.id === (me && me.char)) || CHARS[0];

  function addBanner(text, bg, fg, dur, key) {
    G0.banners = G0.banners.filter((b) => b.key !== key);
    G0.banners.push({ text, bg, fg, t: dur, key });
  }
  function particles(x, y, kind, n) {
    const fx = { gold: [C.gold, '#FFF3C4'], green: ['#5DBB4E', '#A6E36A', '#2E6B3A'], laser: [C.red, '#FF9AA8'], block: [C.gold, C.goldD, '#8A5A00'], dust: ['#FFFFFF', C.lav2], debris: [C.red, C.redD], coin: [C.gold, '#FFFFFF'] }[kind];
    for (let i = 0; i < n; i++) G0.parts.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 220 - 40, t: 0.5 + Math.random() * 0.4, c: fx[(Math.random() * fx.length) | 0], s: kind === 'block' ? 6 : 3 });
  }

  // ---------- update ----------
  function update(dt) {
    const g = G0, p = g.p;
    const m = heightM();
    while (g.events.length && m >= g.events[0].h) {
      const e = g.events.shift();
      if (e.type === 'pump') { g.pump = 6; addBanner('PUMP!', C.green, C.white, 6, 'pump'); sfx.power(); }
      if (e.type === 'fud') { g.fog = 5; addBanner('FUD', '#5B5690', C.white, 5, 'fud'); }
      if (e.type === 'crash') { g.crash = 3; g.shake = 3; addBanner('FLASH CRASH', C.red, C.white, 3, 'crash'); buzz(80); }
    }
    g.pump = Math.max(0, g.pump - dt); g.fog = Math.max(0, g.fog - dt); g.crash = Math.max(0, g.crash - dt); g.shake = Math.max(0, g.shake - dt);
    g.banners.forEach((b) => { b.t -= dt; }); g.banners = g.banners.filter((b) => b.t > 0);

    const keyDir = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
    if (keyDir) { p.x += keyDir * 380 * dt; p.face = keyDir; }
    if (g.dragDX) { p.x += g.dragDX; if (Math.abs(g.dragDX) > 0.5) p.face = Math.sign(g.dragDX); g.dragDX = 0; }
    if (p.x < -20) p.x += LW + 40; if (p.x > LW + 20) p.x -= LW + 40;

    const prevY = p.y;
    if (p.rocket > 0) {
      p.rocket -= dt; p.vy = ROCKET_V;
      if (Math.random() < 0.8) g.parts.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y, vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 120, t: 0.35, c: [C.gold, '#FF8A3D', C.red][(Math.random() * 3) | 0], s: 6 });
      if (p.rocket <= 0) p.vy = -500;
    } else {
      p.vy += G * (g.crash > 0 ? 1.3 : 1) * dt;
    }
    p.y += p.vy * dt;
    p.squash = Math.max(0, p.squash - dt * 4);

    g.plats.forEach((pl) => {
      if (pl.vx) { pl.x += pl.vx * dt; if (pl.x < 6 || pl.x + pl.w > LW - 6) { pl.vx *= -1; pl.x = Math.max(6, Math.min(LW - 6 - pl.w, pl.x)); } }
    });
    if (p.vy > 0 && p.rocket <= 0) {
      for (const pl of g.plats) {
        if (pl.broken || pl.pulled) continue;
        if (prevY <= pl.y + 2 && p.y >= pl.y && p.x > pl.x - 12 && p.x < pl.x + pl.w + 12) {
          const kind = g.pump > 0 && (pl.kind === 'r' || pl.kind === 'rug') ? 'g' : pl.kind;
          if (kind === 'rug') { pl.pulled = 0.01; sfx.brk(); continue; }
          p.y = pl.y; p.vy = JUMP; p.squash = 1; sfx.jump();
          particles(p.x, p.y, charOf().fx, 5);
          if (kind === 'r') { pl.broken = true; pl.breakT = 0; particles(pl.x + pl.w / 2, pl.y, 'debris', 10); sfx.brk(); }
          break;
        }
      }
    }
    g.plats.forEach((pl) => { if (pl.pulled) { pl.pulled += dt; pl.x += 420 * dt; } if (pl.broken) pl.breakT += dt; });

    for (const it of g.items) {
      if (it.got) continue;
      if (Math.abs(it.x - p.x) < 26 && it.y > p.y - 70 && it.y < p.y + 12) {
        it.got = true;
        if (it.type === 'coin') { g.coins++; sfx.coin(); particles(it.x, it.y, 'coin', 4); }
        if (it.type === 'horns') { p.vy = SUPER; sfx.power(); addBanner('SUPER JUMP', C.green, C.white, 1.6, 'horns'); particles(p.x, p.y, 'gold', 12); }
        if (it.type === 'diam') { p.rocket = 2.4; sfx.power(); addBanner('ROCKET', C.gold, C.ink, 2.4, 'rocket'); buzz(40); }
      }
    }

    for (const f of g.foes) {
      if (f.dead) { f.vy = (f.vy || -200) + G * dt; f.y += f.vy * dt; if (f.y > g.camY + LH + 100) f.gone = true; continue; }
      let fw, fh;
      if (f.type === 'bear') {
        const pl = f.plat;
        if (pl.broken || pl.pulled) { f.dead = true; continue; }
        f.off += f.dir * 30 * dt;
        const lim = Math.max(0, pl.w / 2 - 18);
        if (Math.abs(f.off) > lim) { f.off = Math.sign(f.off) * lim; f.dir *= -1; }
        f.x = pl.x + pl.w / 2 + f.off; f.y = pl.y;
        fw = 36; fh = 33;
      } else {
        f.x += f.vx * dt; if (f.x < -60) f.x = LW + 60; if (f.x > LW + 60) f.x = -60;
        fw = 54; fh = 27;
      }
      const top = f.y - fh;
      const hit = Math.abs(p.x - f.x) < (fw + 26) / 2 - 4 && p.y > top + 2 && p.y - 54 < f.y - 2;
      if (!hit) continue;
      if (p.rocket > 0) { f.dead = true; sfx.stomp(); particles(f.x, top, 'dust', 8); continue; }
      if (p.vy > 0 && prevY <= top + 14) {
        p.y = top; p.squash = 1;
        if (f.type === 'bear') { f.dead = true; p.vy = JUMP * 1.15; sfx.stomp(); particles(f.x, top, 'dust', 10); buzz(20); }
        else { p.vy = JUMP * 1.4; sfx.jump(); }
      } else { die(f.type === 'bear' ? 'REKT BY A BEAR' : 'CRUSHED BY A WHALE'); return; }
    }

    g.parts.forEach((q) => { q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; });
    g.parts = g.parts.filter((q) => q.t > 0);

    if (p.y < g.minY) g.minY = p.y;
    const target = p.y - LH * 0.42;
    if (target < g.camY) g.camY = target;
    generate();
    if (p.y > g.camY + LH + 40) die('FELL OFF THE CHART');
  }

  function die(cause) {
    if (mode !== 'play') return;
    G0.cause = cause; sfx.die(); buzz([60, 40, 120]);
    mode = 'dead';
    setTimeout(() => { if (!destroyed) showResult(); }, 650);
  }

  // ---------- draw ----------
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
  const SKY = [[0, '#CFCBFF', '#ECEBFF'], [0.25, '#A99CF5', '#D9D2FF'], [0.55, '#4B3FB8', '#8E7BE0'], [0.8, '#1A1866', '#3A2F9A'], [1, '#0E0C3A', '#1A1866']].map(([t, a, b]) => [t, hex2rgb(a), hex2rgb(b)]);
  function skyAt(t) {
    for (let i = 1; i < SKY.length; i++) if (t <= SKY[i][0]) { const a = SKY[i - 1], b = SKY[i]; const k = (t - a[0]) / (b[0] - a[0]); return [mix(a[1], b[1], k), mix(a[2], b[2], k)]; }
    return [SKY[4][1], SKY[4][2]];
  }
  const STARS = Array.from({ length: 60 }, (_, i) => { const r = mulberry32(i * 99991 + 7); return { x: r() * LW, y: r() * 2000, s: r() < 0.15 ? 6 : 3 }; });
  const CLOUDS = Array.from({ length: 8 }, (_, i) => { const r = mulberry32(i * 31337 + 3); return { x: r() * (LW + 60) - 30, y: r() * 1600 }; });
  let skyT = 0;

  function draw(dt) {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    const g = G0;
    const camM = g ? Math.max(0, -g.camY / PX_PER_M) : 0;
    skyT += (Math.min(1, camM / 6500) - skyT) * Math.min(1, dt * 2);
    const [top, bot] = skyAt(skyT);
    const bands = 18;
    for (let i = 0; i < bands; i++) {
      const c = mix(top, bot, i / (bands - 1));
      ctx.fillStyle = 'rgb(' + c.join(',') + ')';
      ctx.fillRect(0, Math.floor(i * LH / bands), LW, Math.ceil(LH / bands) + 1);
    }
    const camY = g ? g.camY : -LH * 0.72;
    const starA = Math.max(0, Math.min(1, (skyT - 0.4) / 0.3));
    if (starA > 0) {
      ctx.globalAlpha = starA; ctx.fillStyle = '#FFFFFF';
      STARS.forEach((s) => { const yy = ((s.y - camY * 0.05) % 2000 + 2000) % 2000; if (yy < LH) ctx.fillRect(Math.floor(s.x / 3) * 3, Math.floor(yy / 3) * 3, s.s, s.s); });
      ctx.globalAlpha = 1;
    }
    const ms = 3 + Math.floor(skyT * 5);
    const moon = spr('moon', ms);
    ctx.drawImage(moon, LW - moon.width - 24 + (5 - ms) * 4, 110 - skyT * 30);
    const cloudA = 1 - Math.max(0, Math.min(1, (skyT - 0.25) / 0.3));
    if (cloudA > 0) {
      ctx.globalAlpha = cloudA;
      const cl = spr('cloud', 3);
      CLOUDS.forEach((c) => { const yy = ((c.y - camY * 0.3) % 1600 + 1600) % 1600 - 100; if (yy < LH) ctx.drawImage(cl, Math.floor(c.x / 3) * 3, Math.floor(yy / 3) * 3); });
      ctx.globalAlpha = 1;
    }
    if (!g) return;
    let sx = 0, sy = 0;
    if (g.shake > 0) { sx = (Math.random() - 0.5) * 8; sy = (Math.random() - 0.5) * 8; }
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(-camY + sy));
    const night = skyT > 0.45;
    ctx.font = '7px "Press Start 2P", monospace';
    const firstM = Math.ceil((-(camY + LH)) / PX_PER_M / 500) * 500;
    for (let mm = Math.max(500, firstM); mm * PX_PER_M < -camY + 40; mm += 500) {
      const yy = -mm * PX_PER_M;
      ctx.fillStyle = night ? 'rgba(255,255,255,0.18)' : 'rgba(43,43,217,0.18)';
      for (let xx = 0; xx < LW; xx += 12) ctx.fillRect(xx, yy, 6, 3);
      ctx.fillStyle = night ? 'rgba(255,255,255,0.5)' : 'rgba(43,43,217,0.45)';
      ctx.fillText(fmt(mm) + 'M', 6, yy - 6);
    }
    g.plats.forEach((pl) => drawCandle(pl, g.pump > 0));
    const t = performance.now() / 1000;
    g.items.forEach((it) => {
      if (it.got) return;
      const bob = Math.round(Math.sin(t * 4 + it.x) * 2);
      const s = spr(it.type === 'coin' ? 'coin' : it.type === 'diam' ? 'diam' : 'horns', 3);
      ctx.drawImage(s, Math.round(it.x - s.width / 2), Math.round(it.y - s.height / 2 + bob));
    });
    g.foes.forEach((f) => {
      const s = spr(f.type, 3);
      ctx.save();
      ctx.translate(Math.round(f.x), Math.round(f.y));
      if (f.type === 'whale' && f.vx < 0) ctx.scale(-1, 1);
      if (f.dead) ctx.rotate(Math.PI);
      ctx.drawImage(s, -s.width / 2, f.dead ? 0 : -s.height);
      ctx.restore();
    });
    g.parts.forEach((q) => { ctx.globalAlpha = Math.min(1, q.t * 2); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s); });
    ctx.globalAlpha = 1;
    drawPlayer(g.p);
    ctx.restore();
    if (g.fog > 0) {
      const a = Math.min(1, g.fog, 5 - g.fog + 0.2) * 0.92;
      ctx.globalAlpha = a;
      const y0 = LH * 0.12, y1 = LH * 0.58;
      ctx.fillStyle = '#B9B3D9'; ctx.fillRect(0, y0, LW, y1 - y0);
      ctx.fillStyle = '#A39DCB';
      for (let yy = y0; yy < y1; yy += 6) for (let xx = (yy / 6) % 2 ? 0 : 3; xx < LW; xx += 6) ctx.fillRect(xx, yy, 3, 3);
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#5B5690'; ctx.font = '22px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('FUD', LW / 2, (y0 + y1) / 2 + 8); ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    if (g.crash > 0) { ctx.fillStyle = 'rgba(255,46,77,' + (0.12 + 0.08 * Math.sin(t * 20)) + ')'; ctx.fillRect(0, 0, LW, LH); }
  }

  function drawCandle(pl, pump) {
    if (pl.broken && pl.breakT > 0.35) return;
    if (pl.pulled && pl.pulled > 0.8) return;
    let kind = pl.kind;
    if (pump && (kind === 'r' || kind === 'rug')) kind = 'g';
    const x = Math.round(pl.x / 3) * 3, y = Math.round(pl.y / 3) * 3, w = pl.w, h = 18;
    if (kind === 'rug') {
      ctx.fillStyle = C.ink; ctx.fillRect(x, y, w, 12);
      ctx.fillStyle = C.rug; ctx.fillRect(x + 3, y + 3, w - 6, 6);
      ctx.fillStyle = C.gold;
      for (let xx = x + 3; xx < x + w - 3; xx += 12) { ctx.fillRect(xx, y + 3, 6, 3); ctx.fillRect(xx, y + 12, 3, 9); }
      return;
    }
    const body = kind === 'r' ? C.red : C.green, dark = kind === 'r' ? C.redD : C.greenD;
    const cx = x + Math.floor(w / 6) * 3;
    ctx.fillStyle = dark; ctx.fillRect(cx, y - 12, 3, h + 24);
    if (pl.broken) {
      const o = Math.round(pl.breakT * 60);
      ctx.globalAlpha = 1 - pl.breakT / 0.35;
      ctx.fillStyle = C.ink; ctx.fillRect(x - o, y + o, w / 2, h); ctx.fillRect(x + w / 2 + o, y + o, w / 2, h);
      ctx.fillStyle = body; ctx.fillRect(x - o + 3, y + o + 3, w / 2 - 6, h - 6); ctx.fillRect(x + w / 2 + o + 3, y + o + 3, w / 2 - 6, h - 6);
      ctx.globalAlpha = 1; return;
    }
    ctx.fillStyle = C.ink; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = body; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x + 3, y + 3, w - 6, 3);
    ctx.fillStyle = dark; ctx.fillRect(x + 3, y + h - 6, w - 6, 3);
    if (kind === 'r') { ctx.fillStyle = C.ink; ctx.fillRect(cx - 3, y + 3, 3, 6); ctx.fillRect(cx, y + 9, 3, 6); }
    if (kind === 'm') { ctx.fillStyle = 'rgba(20,18,74,0.5)'; ctx.fillRect(x - 12, y + 7, 6, 3); ctx.fillRect(x + w + 6, y + 7, 6, 3); }
  }

  function drawPlayer(p) {
    const ch = charOf();
    const im = imgs[ch.id];
    const H = 66, sq = p.squash;
    const hh = H * (1 - 0.18 * sq), ww = (im.naturalWidth ? H * im.naturalWidth / im.naturalHeight : 50) * (1 + 0.12 * sq);
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    if (p.face < 0) ctx.scale(-1, 1);
    if (im.complete && im.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, -ww * ch.anchor, -hh, ww, hh);
      ctx.imageSmoothingEnabled = false;
    } else { ctx.fillStyle = C.indigo; ctx.fillRect(-14, -54, 28, 54); }
    ctx.restore();
  }

  // ---------- loop ----------
  let last = performance.now();
  let countT = 0;
  let raf = 0;
  function frame(now) {
    if (destroyed) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (mode === 'play') update(dt);
    else if (mode === 'dead' && G0) { G0.parts.forEach((q) => { q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; }); G0.p.vy += G * dt; G0.p.y += G0.p.vy * dt; }
    else if (mode === 'count') {
      const before = Math.ceil(countT); countT -= dt; const after = Math.ceil(countT);
      if (after !== before && after > 0) { $('c-n').textContent = after; sfx.tick(); }
      if (countT <= 0) startPlay();
    }
    draw(dt);
    if (mode === 'play' || mode === 'pause') hudTick();
    raf = requestAnimationFrame(frame);
  }

  // ---------- input ----------
  const keys = { left: false, right: false };
  on(window, 'keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if ((e.key === 'Escape' || e.key === 'p') && mode === 'play') pauseGame();
  });
  on(window, 'keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });
  let dragX = null;
  on(stage, 'pointerdown', (e) => { if (mode === 'play') dragX = e.clientX; });
  on(window, 'pointermove', (e) => { if (dragX == null || mode !== 'play') return; G0.dragDX += (e.clientX - dragX) / scale * 1.15; dragX = e.clientX; });
  on(window, 'pointerup', () => { dragX = null; });
  on(window, 'pointercancel', () => { dragX = null; });
  on(document, 'visibilitychange', () => { if (document.hidden && mode === 'play') pauseGame(); });

  // ---------- UI helpers ----------
  const SCREENS = ['scr-boot', 'scr-signin', 'scr-name', 'scr-title', 'scr-tut', 'hud', 'scr-count', 'scr-pause', 'scr-result', 'scr-board', 'scr-town'];
  function show(...ids) { SCREENS.forEach((s) => { $(s).hidden = !ids.includes(s); }); }
  const coinImg = (() => { let url = ''; return () => { if (!url) url = spr('coin', 2).toDataURL(); return '<img alt="" src="' + url + '" width="16" height="16" style="image-rendering:pixelated">'; }; })();
  const PAUSE_SVG = '<svg width="15" height="15" viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="0" width="2" height="5" fill="#14124A"></rect><rect x="3" y="0" width="2" height="5" fill="#14124A"></rect></svg>';
  const BACK_SVG = '<svg width="12" height="21" viewBox="0 0 4 7" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="0" width="1" height="7" fill="#14124A"></rect><rect x="2" y="1" width="1" height="5" fill="#14124A"></rect><rect x="1" y="2" width="1" height="3" fill="#14124A"></rect><rect x="0" y="3" width="1" height="1" fill="#14124A"></rect></svg>';
  const SOUND_SVG = (s) => '<svg width="24" height="21" viewBox="0 0 8 7" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="2" width="2" height="3" fill="#14124A"></rect><rect x="2" y="1" width="1" height="5" fill="#14124A"></rect><rect x="3" y="0" width="1" height="7" fill="#14124A"></rect>' + (s ? '<rect x="5" y="2" width="1" height="3" fill="#14124A"></rect><rect x="7" y="1" width="1" height="5" fill="#14124A"></rect>' : '<rect x="5" y="2" width="1" height="1" fill="#B4320A"></rect><rect x="6" y="3" width="1" height="1" fill="#B4320A"></rect><rect x="7" y="4" width="1" height="1" fill="#B4320A"></rect><rect x="7" y="2" width="1" height="1" fill="#B4320A"></rect><rect x="5" y="4" width="1" height="1" fill="#B4320A"></rect>') + '</svg>';
  function bar(el, frac, color, empty) { el.innerHTML = Array.from({ length: 10 }, (_, i) => '<i style="background:' + (i < Math.round(frac * 10) ? color : (empty || '')) + '"></i>').join(''); }
  let toastT = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  ['b-exit', 'b-board-back', 'b-town-back'].forEach((k) => { $(k).innerHTML = BACK_SVG; });
  $('b-exit1').innerHTML = BACK_SVG;
  $('b-pause').innerHTML = PAUSE_SVG;

  // ---------- boot / sign-in / name ----------
  async function boot() {
    show('scr-boot');
    try {
      const s = await api.session();
      if (destroyed) return;
      if (!s) { openSignin(); return; }
      me = s.me; today = s.today;
      afterAuth();
    } catch (e) {
      if (destroyed) return;
      if (e && e.code === 'no_session') openSignin();
      else { openSignin(); $('si-err').textContent = errText(e); }
    }
  }
  function openSignin() {
    mode = 'signin'; show('scr-signin');
    $('si-hero').src = images.boss;
  }
  on($('b-signin'), 'click', async () => {
    const b = $('b-signin');
    b.disabled = true; b.textContent = 'SIGNING…'; $('si-err').textContent = '';
    try {
      const s = await api.login();
      me = s.me; today = s.today;
      afterAuth();
    } catch (e) {
      $('si-err').textContent = e && e.code === 'cancelled' ? '' : errText(e);
    } finally { b.disabled = false; b.textContent = 'SIGN IN'; }
  });
  function afterAuth() {
    if (!me.username) openName(); else openTitle();
  }

  let nameTimer = null, nameOk = false, nameSeq = 0;
  function openName() {
    mode = 'name'; show('scr-name');
    $('nm-hero').src = images[(me && me.char) || 'boss'];
    const words = ['moon', 'hodl', 'wagmi', 'gm', 'degen', 'diamond', 'candle', 'bull'];
    const r = mulberry32((Date.now() / 1000) | 0);
    const pick = () => words[(r() * words.length) | 0] + '_' + String(10 + ((r() * 90) | 0));
    $('nm-sugg').innerHTML = [pick(), pick(), pick()].map((n) => '<button class="mj-pill" data-name="' + n + '">' + n + '</button>').join('');
    setTimeout(() => { try { $('nm-input').focus(); } catch { /* ignore */ } }, 50);
  }
  function setNameState(text, color) { const s = $('nm-state'); s.textContent = text; s.style.color = color; }
  function checkName() {
    const v = $('nm-input').value.trim();
    nameOk = false; $('b-name').disabled = true; $('nm-err').textContent = '';
    clearTimeout(nameTimer);
    if (!v) { setNameState('', ''); return; }
    if (!/^[A-Za-z0-9_]{3,15}$/.test(v)) { setNameState(v.length < 3 ? '' : 'Bad', '#B4320A'); if (v.length >= 3) $('nm-err').textContent = ERRORS.format; return; }
    setNameState('…', '#5A5A80');
    const seq = ++nameSeq;
    nameTimer = setTimeout(async () => {
      try {
        const r = await api.nameCheck(v);
        if (seq !== nameSeq) return;
        if (r.ok) { nameOk = true; $('b-name').disabled = false; setNameState('✓ Free', '#1E8C52'); }
        else { setNameState('Taken', '#B4320A'); $('nm-err').textContent = ERRORS[r.reason] || ERRORS.taken; }
      } catch (e) { if (seq === nameSeq) $('nm-err').textContent = errText(e); }
    }, 350);
  }
  on($('nm-input'), 'input', checkName);
  on($('nm-input'), 'keydown', (e) => { if (e.key === 'Enter' && nameOk) $('b-name').click(); });
  on($('nm-sugg'), 'click', (e) => { const b = e.target.closest('[data-name]'); if (!b) return; $('nm-input').value = b.dataset.name; checkName(); });
  on($('b-name'), 'click', async () => {
    const v = $('nm-input').value.trim();
    if (!nameOk) return;
    $('b-name').disabled = true;
    try {
      const r = await api.setProfile({ username: v });
      me = r.me; openTitle();
    } catch (e) { $('nm-err').textContent = errText(e); $('b-name').disabled = false; }
  });

  // ---------- title ----------
  function renderTitle() {
    $('t-coins').innerHTML = coinImg() + fmt(me.coins);
    $('t-sound').innerHTML = SOUND_SVG(settings.sound); $('t-sound').setAttribute('aria-label', settings.sound ? 'Sound on' : 'Sound off');
    const ci = $('b-checkin');
    ci.textContent = me.checkedInToday ? 'STREAK ' + me.streak : 'CHECK IN';
    ci.style.background = me.checkedInToday ? '#FFFFFF' : C.gold;
    ci.setAttribute('aria-label', me.checkedInToday ? 'Checked in today, streak ' + me.streak + ' days' : 'Daily check-in');
    $('t-daily').textContent = 'DAILY #' + today.n + ' · ' + dayLabel(today.day);
    $('t-mod').textContent = MODS[today.mod].short;
    $('t-best').textContent = myRank ? '#' + fmt(myRank.rank) + ' · ' + fmt(myRank.height) + 'M' : '—';
    $('t-chars').innerHTML = CHARS.map((c) => '<button class="mj-char" aria-pressed="' + (c.id === me.char) + '" data-id="' + c.id + '"><img alt="" src="' + images[c.id] + '">' + c.name + '</button>').join('');
    $('t-charname').textContent = charOf().name;
    $('t-hero').src = images[charOf().id];
    const li = levelOf(me.xp), L = LEVELS[li], N = LEVELS[li + 1];
    $('t-level').textContent = L.name;
    $('t-xp').textContent = N ? fmt(me.xp) + '/' + fmt(N.xp) + ' XP' : fmt(me.xp) + ' XP';
    bar($('t-bar'), N ? (me.xp - L.xp) / (N.xp - L.xp) : 1, L.color);
    $('t-next').textContent = N ? fmt(N.xp - me.xp) + ' XP to move to ' + STREETS[li + 1] : 'You live on the Moon Base.';
  }
  async function refreshRank() {
    try {
      const lb = await api.leaderboard();
      myRank = lb.mine;
      if (mode === 'title') renderTitle();
    } catch { /* rank is optional on the title screen */ }
  }
  function openTitle() {
    mode = 'title'; G0 = null; show('scr-title'); renderTitle(); refreshRank();
  }
  on($('t-chars'), 'click', (e) => {
    const b = e.target.closest('.mj-char'); if (!b) return;
    me = { ...me, char: b.dataset.id }; renderTitle(); sfx.tick();
    api.setProfile({ char: b.dataset.id }).catch(() => toast("COULDN'T SAVE YOUR PICK"));
  });
  on($('t-sound'), 'click', () => { settings.sound = !settings.sound; store.set('sound', settings.sound); renderTitle(); sfx.tick(); });
  on($('b-exit'), 'click', () => opts.onExit());
  on($('b-exit1'), 'click', () => opts.onExit());
  on($('b-checkin'), 'click', async () => {
    if (me.checkedInToday) { toast(me.streak + '-DAY STREAK. COME BACK TOMORROW'); return; }
    try {
      const r = await api.checkin();
      me = r.me; renderTitle();
      if (!r.already) { sfx.power(); toast('+' + r.gained + ' XP · DAY ' + me.streak); }
    } catch (e) { toast(errText(e).toUpperCase()); }
  });

  // ---------- tutorial ----------
  const TUT = [
    ['DRAG TO MOVE', 'Slide your finger left or right. You jump on your own.'],
    ['GREEN = SAFE', 'Green candles bounce you up. Red ones break after one step.'],
    ['WATCH OUT', 'Stomp bears from above. Rugs get pulled. Diamonds are rockets.'],
  ];
  let tutI = 0;
  function renderTut() {
    $('tut-n').textContent = 'HOW TO PLAY · ' + (tutI + 1) + '/3';
    $('tut-t').textContent = TUT[tutI][0]; $('tut-d').textContent = TUT[tutI][1];
    $('b-tut').textContent = tutI === 2 ? "LET'S JUMP" : 'NEXT';
    [...$('tut-dots').children].forEach((d, i) => { d.className = i === tutI ? 'on' : ''; });
    const x = $('tut-cv').getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = C.lav; x.fillRect(0, 0, 300, 150);
    const cand = (cx, cy, w, red) => { x.fillStyle = red ? C.redD : C.greenD; x.fillRect(cx + Math.floor(w / 6) * 3, cy - 9, 3, 30); x.fillStyle = C.ink; x.fillRect(cx, cy, w, 15); x.fillStyle = red ? C.red : C.green; x.fillRect(cx + 3, cy + 3, w - 6, 9); };
    const ch = charOf(), im = imgs[ch.id];
    const drawCh = (px, py, h) => { if (im.naturalWidth) { x.imageSmoothingEnabled = true; const w = h * im.naturalWidth / im.naturalHeight; x.drawImage(im, px - w * ch.anchor, py - h, w, h); x.imageSmoothingEnabled = false; } };
    if (tutI === 0) {
      cand(105, 110, 90); drawCh(150, 110, 60);
      x.fillStyle = C.indigo; x.fillRect(40, 80, 36, 6); x.fillRect(40, 74, 6, 18); x.fillRect(224, 80, 36, 6); x.fillRect(254, 74, 6, 18);
    } else if (tutI === 1) {
      cand(40, 110, 72); cand(186, 70, 72, true); drawCh(76, 110, 56);
      x.fillStyle = C.ink; for (let i = 0; i < 4; i++) x.fillRect(120 + i * 16, 92 - i * 8, 6, 6);
    } else {
      x.drawImage(spr('bear', 3), 30, 60); x.drawImage(spr('diam', 3), 230, 30);
      x.fillStyle = C.ink; x.fillRect(120, 104, 78, 12); x.fillStyle = C.rug; x.fillRect(123, 107, 72, 6); x.fillStyle = C.gold; for (let xx = 123; xx < 195; xx += 12) { x.fillRect(xx, 107, 6, 3); x.fillRect(xx, 116, 3, 9); }
    }
  }
  function openTut(after) { tutI = 0; tutAfter = after; mode = 'tut'; show('scr-tut'); renderTut(); }
  function closeTut() { store.set('tutDone', true); const a = tutAfter; tutAfter = null; if (a) a(); else openTitle(); }
  on($('b-tut'), 'click', () => { if (tutI < 2) { tutI++; renderTut(); sfx.tick(); } else closeTut(); });
  on($('b-tutskip'), 'click', closeTut);
  on($('b-howto'), 'click', () => openTut(null));

  // ---------- run flow ----------
  let starting = false;
  async function begin(daily) {
    if (starting) return;
    starting = true;
    try {
      let seed, ticket = null;
      try {
        const r = await api.start(daily);
        seed = r.seed; ticket = r.ticket; today = r.today || today;
      } catch (e) {
        if (e && e.code === 'no_session') { openSignin(); return; }
        if (e && e.code === 'need_username') { openName(); return; }
        seed = (Math.random() * 2147483647) | 0;
        toast('OFFLINE · THIS RUN WON\'T BE SAVED');
      }
      const go = () => {
        newRun(daily, seed, ticket);
        mode = 'count'; countT = 3; $('c-n').textContent = '3'; sfx.tick();
        $('c-daily').textContent = daily ? 'DAILY #' + today.n + ' · ' + dayLabel(today.day) : 'PRACTICE · RANDOM MAP';
        $('c-mod').hidden = !daily; $('c-modt').textContent = MODS[today.mod].text;
        show('scr-count');
      };
      if (!store.get('tutDone', false)) openTut(go); else go();
    } finally { starting = false; }
  }
  on($('b-daily'), 'click', () => begin(true));
  on($('b-practice'), 'click', () => begin(false));
  on($('scr-count'), 'click', () => { if (mode === 'count') startPlay(); });

  function startPlay() {
    mode = 'play'; show('hud');
    G0.best = G0.daily && myRank ? myRank.height : 0;
    hudCache = {};
    hudTick();
  }
  let hudCache = {};
  function hudTick() {
    const g = G0, m = heightM();
    const ph = phaseOf(m);
    const night = skyT > 0.45;
    $('hud').classList.toggle('mj-night', night);
    const setT = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
    setT('h-h', fmt(m) + 'M');
    setT('h-best', g.best > 0 ? (m > g.best ? 'NEW BEST!' : 'Best ' + fmt(g.best) + 'M') : (g.daily ? 'Daily #' + today.n : 'Practice'));
    if (hudCache.coins !== g.coins) { hudCache.coins = g.coins; $('h-coins').innerHTML = coinImg() + g.coins; }
    if (hudCache.ph !== ph.name) {
      hudCache.ph = ph.name;
      const tg = $('h-phase'); tg.textContent = ph.name; tg.style.background = ph.bg; tg.style.color = ph.fg;
      const nx = PHASES[PHASES.indexOf(ph) + 1];
      $('h-next').textContent = nx ? nx.name.charAt(0) + nx.name.slice(1).toLowerCase() + ' ' + fmt(nx.from) + 'M' : '';
    }
    const frac = ph.to === Infinity ? 1 : (m - ph.from) / (ph.to - ph.from);
    const bk = Math.round(frac * 10) + ph.name + night;
    if (hudCache.bar !== bk) { hudCache.bar = bk; bar($('h-bar'), frac, ph.bg, night ? '#2A2880' : 'rgba(255,255,255,0.6)'); }
    const bn = g.banners.map((b) => b.key + Math.ceil(b.t)).join();
    if (hudCache.bn !== bn) {
      hudCache.bn = bn;
      $('h-banners').innerHTML = g.banners.map((b) => '<span class="mj-banner" style="background:' + b.bg + ';color:' + b.fg + '">' + b.text + (b.key !== 'horns' ? ' ' + Math.ceil(b.t) + 's' : '') + '</span>').join('');
    }
  }
  function pauseGame() {
    if (mode !== 'play') return;
    mode = 'pause'; show('hud', 'scr-pause');
    $('p-info').textContent = fmt(heightM()) + 'M · ' + G0.coins + ' coins';
    syncToggles();
  }
  function syncToggles() { $('p-sound').setAttribute('aria-checked', String(settings.sound)); $('p-vib').setAttribute('aria-checked', String(settings.vib)); }
  on($('b-pause'), 'click', pauseGame);
  on($('b-resume'), 'click', () => { mode = 'play'; show('hud'); last = performance.now(); });
  on($('b-restart'), 'click', () => begin(G0.daily));
  on($('b-quit'), 'click', () => { G0.cause = 'QUIT'; showResult(); });
  on($('p-sound'), 'click', () => { settings.sound = !settings.sound; store.set('sound', settings.sound); syncToggles(); });
  on($('p-vib'), 'click', () => { settings.vib = !settings.vib; store.set('vib', settings.vib); syncToggles(); });

  async function showResult() {
    const g = G0, m = heightM();
    mode = 'result';
    $('r-cause').textContent = g.cause;
    $('r-h').textContent = fmt(m) + 'M';
    $('r-badge').textContent = 'SAVING…';
    $('r-xp').innerHTML = '<span class="mj-muted" style="font-size:16px">Saving your run…</span>';
    $('r-lvl').hidden = true;
    show('scr-result');
    if (g.cause === 'QUIT' || !g.ticket) {
      $('r-badge').textContent = g.cause === 'QUIT' ? 'QUIT · NOT SAVED' : 'OFFLINE · NOT SAVED';
      $('r-xp').innerHTML = '<span class="mj-muted" style="font-size:16px">' + (g.cause === 'QUIT' ? 'Quit runs give no XP.' : ERRORS.network) + '</span>';
      return;
    }
    try {
      const r = await api.finish(g.ticket, m, g.coins);
      const before = me.level;
      me = r.me;
      if (g.daily && r.rank) myRank = { rank: r.rank, height: r.best };
      $('r-badge').textContent = g.daily
        ? (r.isBest ? 'NEW BEST · #' + fmt(r.rank) + ' OF ' + fmt(r.total) : 'BEST ' + fmt(r.best) + 'M · #' + fmt(r.rank))
        : 'PRACTICE RUN';
      const rows = [['Height', '+' + Math.floor(m / 100) + ' XP'], ['Coins x' + g.coins, '+' + Math.floor(g.coins / 10) + ' XP']];
      if (g.daily) rows.push(['First daily run', r.first ? '+20 XP' : 'done']);
      $('r-xp').innerHTML = rows.map((x) => '<div class="mj-kv"><span class="mj-muted">' + x[0] + '</span><b>' + x[1] + '</b></div>').join('') +
        '<div class="mj-rule"></div><div class="mj-kv"><span class="mj-disp" style="font-size:10px">TOTAL</span><span class="mj-disp" style="font-size:12px;color:#2B2BD9">+' + r.gained + ' XP</span></div>';
      const li = levelOf(me.xp), L = LEVELS[li], N = LEVELS[li + 1];
      const up = li > before;
      $('r-lvl').hidden = false;
      $('r-lvl').innerHTML = '<span class="mj-disp" style="font-size:9px;color:#FFC94D">' + (up ? 'LEVEL UP! NEW HOUSE' : 'YOUR HANDS') + '</span><span class="mj-disp" style="font-size:13px">' + L.name + '</span><div class="mj-bar" data-el="r-bar"></div><span style="font-size:14px;color:#CFCEFF">' + (N ? fmt(N.xp - me.xp) + ' XP to ' + STREETS[li + 1] : 'Moon Base resident') + (up ? ' · You moved to ' + STREETS[li] : '') + '</span>';
      bar($('r-bar'), N ? (me.xp - L.xp) / (N.xp - L.xp) : 1, C.gold, '#4B4BF0');
      if (up) { sfx.power(); buzz([30, 30, 30]); }
    } catch (e) {
      $('r-badge').textContent = 'NOT SAVED';
      $('r-xp').innerHTML = '<span style="font-size:16px;color:#B4320A;font-weight:600">' + esc(errText(e)) + '</span>';
    }
  }
  on($('b-again'), 'click', () => begin(G0 ? G0.daily : true));
  on($('b-menu'), 'click', openTitle);
  on($('b-share'), 'click', () => {
    const m = G0 ? heightM() : 0;
    const txt = 'I reached ' + fmt(m) + 'M in MOON JUMP' + (G0 && G0.daily ? ' Daily #' + today.n : '') + ' on Holdr. Same map for everyone today. Can you beat me?';
    const done = () => toast('COPIED. PASTE IT ON X');
    try { navigator.clipboard.writeText(txt).then(done, () => toast(txt)); } catch { toast(txt); }
  });

  // ---------- leaderboard ----------
  on($('b-board'), 'click', openBoard);
  on($('b-board-back'), 'click', openTitle);
  async function openBoard() {
    mode = 'board'; show('scr-board');
    $('lb-day').textContent = 'DAILY #' + today.n;
    $('lb-list').innerHTML = '<div style="padding:16px" class="mj-muted">Loading…</div>';
    $('lb-mine').hidden = true;
    try {
      const lb = await api.leaderboard();
      myRank = lb.mine;
      const row = (r) => '<div class="mj-list-row' + (r.me ? ' me' : '') + '"><span class="mj-rank">' + r.rank + '</span><img alt="" src="' + (images[r.char] || images.boss) + '"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.username) + (r.me ? ' (you)' : '') + '</span><span class="mj-num">' + fmt(r.height) + 'M</span></div>';
      $('lb-list').innerHTML = lb.rows.length ? lb.rows.map(row).join('') : '<div style="padding:16px;font-size:16px" class="mj-muted">No runs yet today. Be the first on the board.</div>';
      if (lb.mine && !lb.rows.some((r) => r.me)) { $('lb-mine').hidden = false; $('lb-mine').innerHTML = row(lb.mine); }
    } catch (e) { $('lb-list').innerHTML = '<div style="padding:16px;color:#B4320A;font-weight:600">' + esc(errText(e)) + '</div>'; }
  }

  // ---------- town ----------
  let townLevel = 0, townData = null, townSel = null;
  on($('b-town'), 'click', () => openTown(me.level));
  on($('b-town-back'), 'click', openTitle);
  function renderTiers() {
    const t = $('tw-tiers');
    t.innerHTML = '';
    TIER_SHORT.forEach((lab, i) => {
      const b = document.createElement('button');
      b.className = 'mj-tier'; b.setAttribute('aria-pressed', String(i === townLevel)); b.dataset.level = String(i);
      b.appendChild(houseCanvas(i, true, 2)); b.appendChild(document.createTextNode(lab));
      t.appendChild(b);
    });
  }
  on($('tw-tiers'), 'click', (e) => { const b = e.target.closest('[data-level]'); if (b) openTown(Number(b.dataset.level)); });
  async function openTown(level) {
    mode = 'town'; townLevel = level; townSel = null; show('scr-town'); renderTiers();
    $('tw-card').hidden = true;
    $('tw-sub').textContent = STREETS[level];
    $('tw-grid').innerHTML = '<span class="mj-muted" style="grid-column:1/-1;text-align:center">Loading…</span>';
    try {
      townData = await api.town(level);
      if (townLevel !== level) return;
      $('tw-sub').textContent = STREETS[level] + ' · ' + fmt(townData.count || 0) + ' holders' + (level > me.level ? ' · visiting' : '');
      renderTown();
    } catch (e) { $('tw-grid').innerHTML = '<span style="grid-column:1/-1;color:#B4320A;font-weight:600">' + esc(errText(e)) + '</span>'; }
  }
  function renderTown() {
    const g = $('tw-grid');
    g.innerHTML = '';
    if (!townData.residents.length) {
      g.innerHTML = '<span style="grid-column:1/-1;text-align:center;font-size:16px;font-weight:600;color:#1E5A2A">Nobody lives here yet. Reach ' + LEVELS[townLevel].name.toLowerCase() + ' to move in first.</span>';
      return;
    }
    townData.residents.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'mj-house' + (r.me ? ' me' : '');
      b.setAttribute('aria-pressed', String(townSel === r.username));
      b.dataset.u = r.username;
      b.appendChild(houseCanvas(townLevel, r.lit, 3));
      const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = r.me ? 'YOU' : r.username; b.appendChild(tag);
      const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = r.today != null ? fmt(r.today) + 'M today' : (r.lit ? 'Here today' : 'Away'); b.appendChild(sub);
      g.appendChild(b);
    });
  }
  on($('tw-grid'), 'click', (e) => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    const r = townData.residents.find((x) => x.username === b.dataset.u); if (!r) return;
    townSel = r.username; renderTown();
    const c = $('tw-card');
    c.hidden = false;
    c.innerHTML = '<img alt="" src="' + (images[r.char] || images.boss) + '" style="width:40px;height:40px;object-fit:contain;flex:none">' +
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><span style="font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.username) + (r.me ? ' · you' : '') + '</span><span class="mj-muted" style="font-size:14px">' + (r.today != null ? fmt(r.today) + 'M today' : 'No run today') + ' · ' + r.streak + '-day streak</span></div>' +
      (r.me ? '' : '<button class="mj-btn" data-el="b-gm" style="width:76px;height:40px;font-size:10px;flex:none"' + (r.greeted ? ' disabled' : '') + '>' + (r.greeted ? 'SENT' : 'GM!') + '</button>');
    const gm = c.querySelector('[data-el="b-gm"]');
    if (gm) gm.addEventListener('click', async () => {
      gm.disabled = true;
      try { await api.greet(r.username); r.greeted = true; gm.textContent = 'SENT'; sfx.coin(); toast('GM SENT TO ' + r.username.toUpperCase()); }
      catch (err) { gm.disabled = false; toast(errText(err).toUpperCase()); }
    });
  });

  // ---------- go ----------
  if (document.fonts && document.fonts.load) document.fonts.load('10px "Press Start 2P"').catch(() => {});
  raf = requestAnimationFrame(frame);
  boot();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(toastT); clearTimeout(nameTimer);
      listeners.forEach((off) => off());
      try { if (ac) ac.close(); } catch { /* ignore */ }
      root.innerHTML = '';
      root.classList.remove('mj');
    },
  };
}
