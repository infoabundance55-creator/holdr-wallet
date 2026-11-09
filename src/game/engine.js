/**
 * Moon Jump game engine (canvas + pixel HTML overlays).
 * Plain JS on purpose: it is a self-contained game loop. Types for callers are in engine.d.ts.
 * Scoring (coins = points, +5 up to 1,000 M, +10 above; 3 scored runs a day) must stay in step with
 * api/_lib/game-rules.ts. Sign-in, username and look come from the Holdrs account (the page around the game).
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
const CHARS = [
  { id: 'raccoon', name: 'DEGEN RACCOON', anchor: 0.58, fx: 'gold' },
  { id: 'frog', name: 'MOON FROG', anchor: 0.27, fx: 'green' },
  { id: 'bull', name: 'LASER BULL', anchor: 0.51, fx: 'laser' },
  { id: 'anon', name: 'THE ANON', anchor: 0.46, fx: 'block' },
];
const MODS = [
  { id: 'rugs', short: 'Rug season', text: 'Rug season. Twice as many rugs after 2,000M.' },
  { id: 'bears', short: 'Bear market', text: 'Bear market. More bears from 1,000M.' },
  { id: 'whales', short: 'Whale watch', text: 'Whale watch. Whales show up early.' },
  { id: 'diamonds', short: 'Diamond day', text: 'Diamond day. More rockets on the map.' },
];
const ERRORS = {
  network: "Can't reach the game server. Check your connection.",
  too_fast: 'This run looked impossible, so it was not saved.',
  too_many_coins: 'This run looked impossible, so it was not saved.',
  ticket_used: 'This run was already saved.',
  ticket_expired: 'This run took too long to save.',
  no_session: 'Your sign-in expired. Sign in again.',
  need_username: 'Pick a username first.',
  no_runs: 'No scored runs left today.',
  not_configured: 'The game server is not set up yet.',
  unavailable: 'The game server is not available here.',
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
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function phaseOf(m) { for (const p of PHASES) if (m < p.to) return p; return PHASES[3]; }
const fmt = (n) => Number(n).toLocaleString('en-US');
function dayLabel(day) {
  const y = Math.floor(day / 10000), m = Math.floor(day / 100) % 100, d = day % 100;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BULL_M = 1000;

const TEMPLATE = `
<div class="mj-stage" data-el="stage">
  <canvas class="mj-canvas" data-el="cv" aria-hidden="true"></canvas>

  <div class="mj-layer mj-scroll" data-el="scr-title" hidden style="gap:12px">
    <div class="mj-row mj-between">
      <button class="mj-sq" data-el="b-exit" aria-label="Back"></button>
      <span style="flex:1"></span>
      <span class="mj-chip" data-el="t-total" title="Total points"></span>
      <button class="mj-sq" data-el="t-sound" aria-label="Sound"></button>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:4px">
      <div class="mj-logo">MOON<br>JUMP</div>
      <div style="font-size:16px;font-weight:600;color:#2B2BD9">Jump the candles. Reach the moon.</div>
    </div>
    <div class="mj-hero" style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px">
      <img data-el="t-hero" alt="" style="height:min(112px,14vh);width:auto;max-width:60%;object-fit:contain">
      <button class="mj-pill" data-el="b-look"></button>
    </div>
    <div class="mj-panel" style="gap:12px">
      <div class="mj-row mj-between" style="align-items:flex-start">
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="mj-disp" style="font-size:10px;color:#2B2BD9" data-el="t-daily"></span>
          <span style="font-size:17px;font-weight:700">Same map for everyone</span>
          <span class="mj-muted" style="font-size:14px;font-weight:600" data-el="t-runs"></span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="mj-muted" style="font-size:13px">Best today</span>
          <span class="mj-disp" style="font-size:11px" data-el="t-best"></span>
        </div>
      </div>
      <span class="mj-muted" style="font-size:14px;margin-top:-4px" data-el="t-mod"></span>
      <div class="mj-row"><button class="mj-btn" data-el="b-daily" style="flex:1">PLAY</button><button class="mj-btn alt" data-el="b-practice" style="width:116px;font-size:10px">PRACTICE</button></div>
    </div>
    <div class="mj-panel" style="flex-direction:row;align-items:center;gap:12px;padding:10px 12px">
      <img data-el="t-house" alt="" style="width:42px;height:auto;image-rendering:pixelated;flex:none">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px;min-width:0">
        <div class="mj-row mj-between" style="align-items:baseline"><span class="mj-disp" style="font-size:9px" data-el="t-level"></span><span class="mj-muted" style="font-size:13px;font-variant-numeric:tabular-nums" data-el="t-pts"></span></div>
        <div class="mj-bar" data-el="t-bar"></div>
        <span class="mj-muted" style="font-size:13px" data-el="t-next"></span>
      </div>
    </div>
    <div class="mj-panel" style="gap:2px;padding:10px 12px">
      <div class="mj-row mj-between" style="padding-bottom:2px"><span class="mj-disp" style="font-size:10px;color:#2B2BD9">TODAY'S TOP</span><button class="mj-link" data-el="b-board">See all</button></div>
      <div data-el="t-top"></div>
    </div>
    <div class="mj-row" style="justify-content:center"><button class="mj-btn ghost" data-el="b-howto">HOW TO PLAY</button></div>
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
      <div style="justify-self:end"><span class="mj-chip" data-el="h-coins" title="Points this run"></span></div>
    </div>
    <div class="mj-phase"><span class="tag" data-el="h-phase"></span><div class="mj-bar" data-el="h-bar"></div><span class="next" data-el="h-next"></span></div>
    <div data-el="h-banners" style="display:flex;flex-direction:column"></div>
    <div class="mj-panel mj-hint" data-el="h-hint" hidden><span class="mj-disp" style="font-size:9px;line-height:1.6">◀ DRAG ▶</span><span style="font-size:15px;font-weight:600">Auto-jump. Coins = points.</span></div>
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
      <span class="mj-muted" style="font-size:13px;text-align:center;margin-top:-4px" data-el="p-note"></span>
      <div class="mj-rule"></div>
      <button class="mj-toggle" role="switch" data-el="p-sound">Sound effects<span class="sw"><i></i></span></button>
      <button class="mj-toggle" role="switch" data-el="p-vib">Vibration<span class="sw"><i></i></span></button>
      <div class="mj-rule"></div>
      <button class="mj-btn ghost danger" data-el="b-quit" style="align-self:center">END RUN</button>
    </div>
  </div>

  <div class="mj-layer mj-scroll" data-el="scr-result" hidden style="gap:14px;background:rgba(236,235,255,.94)">
    <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:10px">
      <span class="mj-disp" style="font-size:11px;color:#B4320A;text-align:center" data-el="r-cause"></span>
      <span class="mj-big" data-el="r-pts"></span>
      <span class="mj-disp" style="font-size:9px;color:#5A5A80" data-el="r-h"></span>
      <span class="mj-chip" style="background:#FFC94D;font-size:8px;height:30px" data-el="r-badge"></span>
    </div>
    <div class="mj-panel" style="gap:8px" data-el="r-sum"></div>
    <div class="mj-panel" data-el="r-day" style="gap:8px;background:#2B2BD9;color:#fff"></div>
    <div style="flex:1;min-height:4px"></div>
    <button class="mj-btn" data-el="b-again">PLAY AGAIN</button>
    <div class="mj-row"><button class="mj-btn alt" data-el="b-share" style="flex:1;font-size:9px">COPY BRAG</button><button class="mj-btn alt" data-el="b-menu" style="flex:1;font-size:9px">MENU</button></div>
  </div>

  <div class="mj-layer" data-el="scr-board" hidden style="gap:12px;background:#ECEBFF">
    <div class="mj-row"><button class="mj-sq" data-el="b-board-back" aria-label="Back"></button><span class="mj-disp" style="font-size:13px;flex:1">RANKS</span><span class="mj-muted" style="font-size:14px;font-weight:600" data-el="lb-day"></span></div>
    <div class="mj-tabs" role="tablist" data-el="lb-tabs"><button role="tab" data-kind="day">TODAY</button><button role="tab" data-kind="season">SEASON</button></div>
    <span class="mj-muted" style="font-size:14px;margin-top:-4px" data-el="lb-sub"></span>
    <div class="mj-panel" style="padding:0;gap:0;flex:1;min-height:0;overflow-y:auto;touch-action:pan-y" data-el="lb-list"></div>
    <div class="mj-panel" style="padding:0;gap:0" data-el="lb-mine" hidden></div>
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
  const profile = () => opts.profile();

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
      daily, ticket, rnd, mod: daily && day ? MODS[day.today.mod].id : null, run: 0, saving: null, hintT: 0,
      p: { x: LW / 2, y: 0, vx: 0, vy: JUMP, face: 1, rocket: 0, squash: 0 },
      camY: -LH * 0.72, minY: 0, coinsLow: 0, coinsHigh: 0, pts: 0, pops: [], bull: false, plats: [], items: [], foes: [], parts: [],
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
  const charOf = () => CHARS.find((c) => c.id === profile().char) || CHARS[0];

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
    if (!g.bull && m >= BULL_M) { g.bull = true; addBanner('BULL RUN · COINS +10', C.indigo, C.white, 2.4, 'bull'); sfx.power(); }
    g.hintT = Math.max(0, g.hintT - dt);
    g.pops.forEach((q) => { q.t -= dt; q.y -= 40 * dt; }); g.pops = g.pops.filter((q) => q.t > 0);
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
        if (it.type === 'coin') { const v = m >= BULL_M ? 10 : 5; if (v === 10) g.coinsHigh++; else g.coinsLow++; g.pts += v; g.pops.push({ x: it.x, y: it.y - 10, t: 0.8, v }); sfx.coin(); particles(it.x, it.y, 'coin', 4); }
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
    if (g.pops.length) {
      ctx.font = '10px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      g.pops.forEach((q) => { ctx.globalAlpha = Math.min(1, q.t * 2.5); ctx.fillStyle = '#FFFFFF'; ctx.fillText('+' + q.v, Math.round(q.x) + 2, Math.round(q.y) + 2); ctx.fillStyle = C.goldD; ctx.fillText('+' + q.v, Math.round(q.x), Math.round(q.y)); });
      ctx.textAlign = 'left';
    }
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
  const SCREENS = ['scr-title', 'scr-tut', 'hud', 'scr-count', 'scr-pause', 'scr-result', 'scr-board'];
  function show(...ids) { SCREENS.forEach((s) => { $(s).hidden = !ids.includes(s); }); }
  const coinImg = (() => { let url = ''; return (px = 16) => { if (!url) url = spr('coin', 3).toDataURL(); return '<img alt="" src="' + url + '" width="' + px + '" height="' + px + '" style="image-rendering:pixelated">'; }; })();
  const PAUSE_SVG = '<svg width="15" height="15" viewBox="0 0 5 5" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="0" width="2" height="5" fill="#14124A"></rect><rect x="3" y="0" width="2" height="5" fill="#14124A"></rect></svg>';
  const BACK_SVG = '<svg width="12" height="21" viewBox="0 0 4 7" shape-rendering="crispEdges" aria-hidden="true"><rect x="3" y="0" width="1" height="7" fill="#14124A"></rect><rect x="2" y="1" width="1" height="5" fill="#14124A"></rect><rect x="1" y="2" width="1" height="3" fill="#14124A"></rect><rect x="0" y="3" width="1" height="1" fill="#14124A"></rect></svg>';
  const SOUND_SVG = (s) => '<svg width="24" height="21" viewBox="0 0 8 7" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="2" width="2" height="3" fill="#14124A"></rect><rect x="2" y="1" width="1" height="5" fill="#14124A"></rect><rect x="3" y="0" width="1" height="7" fill="#14124A"></rect>' + (s ? '<rect x="5" y="2" width="1" height="3" fill="#14124A"></rect><rect x="7" y="1" width="1" height="5" fill="#14124A"></rect>' : '<rect x="5" y="2" width="1" height="1" fill="#B4320A"></rect><rect x="6" y="3" width="1" height="1" fill="#B4320A"></rect><rect x="7" y="4" width="1" height="1" fill="#B4320A"></rect><rect x="7" y="2" width="1" height="1" fill="#B4320A"></rect><rect x="5" y="4" width="1" height="1" fill="#B4320A"></rect>') + '</svg>';
  function bar(el, frac, color, empty) { el.innerHTML = Array.from({ length: 10 }, (_, i) => '<i style="background:' + (i < Math.round(frac * 10) ? color : (empty || '')) + '"></i>').join(''); }
  let toastT = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  ['b-exit', 'b-board-back'].forEach((k) => { $(k).innerHTML = BACK_SVG; });
  $('b-pause').innerHTML = PAUSE_SVG;

  // ---------- title ----------
  let day = null;         // GET /api/game/today
  function runsLeft() { return day ? day.runs.left : 0; }
  function renderTitle() {
    const P = profile();
    $('t-total').innerHTML = coinImg() + fmt(P.total);
    $('t-sound').innerHTML = SOUND_SVG(settings.sound); $('t-sound').setAttribute('aria-label', settings.sound ? 'Sound on' : 'Sound off');
    $('t-hero').src = images[charOf().id]; $('t-hero').alt = charOf().name;
    $('b-look').textContent = charOf().name + ' · @' + P.username + ' · CHANGE';
    $('t-house').src = P.house.img;
    $('t-level').textContent = (P.house.name + ' · ' + P.house.title).toUpperCase();
    $('t-pts').textContent = P.next ? fmt(P.total) + '/' + fmt(P.next.min) : fmt(P.total);
    bar($('t-bar'), P.progress, '#C08552', C.lav2);
    $('t-next').textContent = P.next ? fmt(P.next.min - P.total) + ' points to ' + P.next.name : 'Top level reached';
    if (!day) {
      $('t-daily').textContent = 'DAILY';
      $('t-runs').textContent = dayErr ? errText(dayErr) : 'Loading…';
      $('t-best').textContent = '—'; $('t-mod').textContent = '';
      $('b-daily').disabled = true; $('b-daily').textContent = 'PLAY';
      $('t-top').innerHTML = '';
      return;
    }
    const left = runsLeft();
    $('t-daily').textContent = 'DAILY #' + day.today.n + ' · ' + dayLabel(day.today.day);
    $('t-runs').textContent = left ? left + ' of ' + day.runs.max + ' runs left today' : 'No runs left. New map in ' + untilReset();
    $('t-best').textContent = day.best != null ? fmt(day.best) + (day.rank ? ' · #' + fmt(day.rank) : '') : '—';
    $('t-mod').textContent = 'Today: ' + MODS[day.today.mod].short;
    $('b-daily').disabled = left === 0;
    $('b-daily').textContent = left ? 'PLAY' : 'DONE';
    $('t-top').innerHTML = day.top.length
      ? day.top.map((r) => '<div class="mj-top"><span class="mj-rank r' + r.rank + '">' + r.rank + '</span><span class="n">' + esc(r.username) + (r.me ? ' (you)' : '') + '</span><span class="mj-num">' + fmt(r.points) + '</span></div>').join('')
      : '<div class="mj-muted" style="font-size:15px;padding:4px 0">No runs yet today. Be the first.</div>';
  }
  function untilReset() {
    const s = Math.max(0, day.today.resetIn - Math.floor((Date.now() - day.at) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + 'h ' + m + 'm' : m + 'm';
  }
  let dayErr = null;
  async function refreshDay() {
    try {
      const d = await api.today();
      day = { ...d, at: Date.now() }; dayErr = null;
    } catch (e) {
      dayErr = e;
      if (e && e.code === 'no_session') { opts.onSignedOut(); return; }
    }
    if (!destroyed && mode === 'title') renderTitle();
  }
  function openTitle() {
    mode = 'title'; G0 = null; show('scr-title'); renderTitle(); refreshDay();
  }
  on($('t-sound'), 'click', () => { settings.sound = !settings.sound; store.set('sound', settings.sound); renderTitle(); sfx.tick(); });
  on($('b-exit'), 'click', () => opts.onExit());
  on($('b-look'), 'click', () => opts.onChangeLook());

  // ---------- tutorial ----------
  const TUT = [
    ['DRAG TO MOVE', 'Slide your finger left or right, or use the arrow keys. You jump on your own.'],
    ['COINS = POINTS', 'Each coin is +5. Past 1,000M coins are worth +10. 3 scored runs a day.'],
    ['WATCH OUT', 'Red candles break. Stomp bears from above. Rugs get pulled. Diamonds are rockets.'],
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
      cand(40, 110, 72); drawCh(76, 110, 56);
      [0, 1, 2].forEach((k) => x.drawImage(spr('coin', 3), 150 + k * 30, 60 - (k === 1 ? 8 : 0)));
      x.fillStyle = C.goldD; x.font = '12px "Press Start 2P", monospace'; x.fillText('+5', 160, 40); x.fillText('+10', 222, 40);
    } else {
      cand(200, 110, 72, true);
      x.drawImage(spr('bear', 3), 30, 60); x.drawImage(spr('diam', 3), 230, 30);
      x.fillStyle = C.ink; x.fillRect(110, 104, 78, 12); x.fillStyle = C.rug; x.fillRect(113, 107, 72, 6); x.fillStyle = C.gold; for (let xx = 113; xx < 185; xx += 12) { x.fillRect(xx, 107, 6, 3); x.fillRect(xx, 116, 3, 9); }
    }
  }
  function openTut(after) { tutI = 0; tutAfter = after; mode = 'tut'; show('scr-tut'); renderTut(); }
  function closeTut() { store.set('tutDone', true); const a = tutAfter; tutAfter = null; if (a) a(); else openTitle(); }
  on($('b-tut'), 'click', () => { if (tutI < 2) { tutI++; renderTut(); sfx.tick(); } else closeTut(); });
  on($('b-tutskip'), 'click', closeTut);
  on($('b-howto'), 'click', () => openTut(null));

  // ---------- run flow ----------
  let starting = false;
  /** daily = one of today's 3 scored runs (server ticket); otherwise practice on a random map, nothing saved. */
  async function begin(daily) {
    if (starting) return;
    starting = true;
    try {
      let seed, ticket = null, run = 0;
      if (daily) {
        try {
          const r = await api.start();
          seed = r.seed; ticket = r.ticket; run = r.run;
          if (day) { day.runs = r.runs; day.today = { ...day.today, ...r.today }; }
        } catch (e) {
          if (e && e.code === 'no_session') { opts.onSignedOut(); return; }
          if (e && e.code === 'no_runs') { if (day) day.runs = e.data.runs || { ...day.runs, left: 0 }; toast('NO RUNS LEFT TODAY. TRY PRACTICE'); openTitle(); return; }
          toast(errText(e).toUpperCase()); openTitle(); return;
        }
      } else {
        seed = (Math.random() * 2147483647) | 0;
      }
      const go = () => {
        newRun(daily, seed, ticket);
        G0.run = run;
        mode = 'count'; countT = 3; $('c-n').textContent = '3'; sfx.tick();
        $('c-daily').textContent = daily ? 'RUN ' + run + ' OF 3 · DAILY #' + day.today.n : 'PRACTICE · NOT SCORED';
        $('c-mod').hidden = !daily; if (daily) $('c-modt').textContent = MODS[day.today.mod].text;
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
    G0.best = G0.daily && day && day.best != null ? day.best : 0;
    G0.hintT = store.get('runs', 0) < 3 ? 4 : 0;
    store.set('runs', store.get('runs', 0) + 1);
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
    setT('h-best', g.daily ? (g.best > 0 && g.pts > g.best ? 'NEW BEST!' : 'Run ' + g.run + ' of 3') : 'Practice');
    if (hudCache.coins !== g.pts) { hudCache.coins = g.pts; $('h-coins').innerHTML = coinImg() + fmt(g.pts); }
    if (hudCache.ph !== ph.name) {
      hudCache.ph = ph.name;
      const tg = $('h-phase'); tg.textContent = ph.name; tg.style.background = ph.bg; tg.style.color = ph.fg;
      const nx = PHASES[PHASES.indexOf(ph) + 1];
      $('h-next').textContent = ph.name === 'ACCUMULATION' ? 'Coins x2 at 1,000M'.replace('Coins ', window.innerWidth < 400 ? '' : 'Coins ') : nx ? nx.name.charAt(0) + nx.name.slice(1).toLowerCase() + ' ' + fmt(nx.from) + 'M' : '';
    }
    const frac = ph.to === Infinity ? 1 : (m - ph.from) / (ph.to - ph.from);
    const bk = Math.round(frac * 10) + ph.name + night;
    if (hudCache.bar !== bk) { hudCache.bar = bk; bar($('h-bar'), frac, ph.bg, night ? '#2A2880' : 'rgba(255,255,255,0.6)'); }
    const bn = g.banners.map((b) => b.key + Math.ceil(b.t)).join();
    if (hudCache.bn !== bn) {
      hudCache.bn = bn;
      $('h-banners').innerHTML = g.banners.map((b) => '<span class="mj-banner" style="background:' + b.bg + ';color:' + b.fg + '">' + b.text + (b.key !== 'horns' && b.key !== 'bull' ? ' ' + Math.ceil(b.t) + 's' : '') + '</span>').join('');
    }
    const hint = mode === 'play' && g.hintT > 0;
    if (hudCache.hint !== hint) { hudCache.hint = hint; $('h-hint').hidden = !hint; }
  }
  function pauseGame() {
    if (mode !== 'play') return;
    mode = 'pause'; show('hud', 'scr-pause');
    $('p-info').textContent = fmt(heightM()) + 'M · ' + fmt(G0.pts) + ' points';
    $('p-note').textContent = G0.daily ? 'Restart saves this run and uses your next one (' + runsLeft() + ' left).' : 'Practice runs are not scored.';
    $('b-restart').disabled = G0.daily && runsLeft() === 0;
    syncToggles();
  }
  function syncToggles() { $('p-sound').setAttribute('aria-checked', String(settings.sound)); $('p-vib').setAttribute('aria-checked', String(settings.vib)); }
  on($('b-pause'), 'click', pauseGame);
  on($('b-resume'), 'click', () => { mode = 'play'; show('hud'); last = performance.now(); });
  on($('b-restart'), 'click', async () => {
    const daily = G0.daily;
    if (daily) { G0.cause = 'RESTARTED'; await saveRun(G0); }
    begin(daily);
  });
  on($('b-quit'), 'click', () => { G0.cause = 'RUN ENDED'; showResult(); });
  on($('p-sound'), 'click', () => { settings.sound = !settings.sound; store.set('sound', settings.sound); syncToggles(); });
  on($('p-vib'), 'click', () => { settings.vib = !settings.vib; store.set('vib', settings.vib); syncToggles(); });

  /** Sends a finished scored run once. Returns the server result, or throws. */
  function saveRun(g) {
    if (!g.saving) {
      const m = heightM();
      g.saving = api.finish(g.ticket, Math.max(m, Math.floor(-g.minY / PX_PER_M)), g.coinsLow, g.coinsHigh).then((r) => {
        if (day) { day.runs = r.runs; day.best = r.best; day.rank = r.rank; day.pointsToday = r.pointsToday; }
        return r;
      });
      g.saving.catch(() => {});
    }
    return g.saving;
  }

  async function showResult() {
    const g = G0, m = heightM();
    mode = 'result';
    $('r-cause').textContent = g.cause;
    $('r-pts').innerHTML = coinImg(28) + fmt(g.pts);
    $('r-h').textContent = fmt(m) + 'M';
    const rows = [['Coins x' + g.coinsLow + ' × 5', '+' + fmt(g.coinsLow * 5)], ['Coins x' + g.coinsHigh + ' × 10 (past 1,000M)', '+' + fmt(g.coinsHigh * 10)]];
    $('r-sum').innerHTML = rows.map((x) => '<div class="mj-kv"><span class="mj-muted">' + x[0] + '</span><b>' + x[1] + '</b></div>').join('') +
      '<div class="mj-rule"></div><div class="mj-kv"><span class="mj-disp" style="font-size:10px">POINTS</span><span class="mj-disp" style="font-size:12px;color:#2B2BD9">+' + fmt(g.pts) + '</span></div>';
    $('r-day').hidden = true;
    show('scr-result');
    const again = $('b-again');
    if (!g.daily) {
      $('r-badge').textContent = 'PRACTICE · NOT SCORED';
      again.textContent = 'PRACTICE AGAIN'; again.dataset.daily = '';
      return;
    }
    $('r-badge').textContent = 'SAVING…';
    again.disabled = true;
    try {
      const r = await saveRun(g);
      if (destroyed || G0 !== g) return;
      $('r-badge').textContent = r.isBest ? 'NEW BEST TODAY' + (r.rank ? ' · #' + fmt(r.rank) : '') : 'BEST TODAY ' + fmt(r.best) + (r.rank ? ' · #' + fmt(r.rank) : '');
      $('r-day').hidden = false;
      $('r-day').innerHTML = '<span class="mj-disp" style="font-size:9px;color:#FFC94D">TODAY</span>' +
        '<div class="mj-kv"><span>Game points today</span><b>' + fmt(r.pointsToday) + '</b></div>' +
        '<div class="mj-kv"><span>Runs left</span><b>' + r.runs.left + ' of ' + r.runs.max + '</b></div>' +
        '<span style="font-size:13px;color:#CFCEFF">Points are checked, then added to your total within 24–72 hours. Game points need an active wallet (trade $20 this season).</span>';
      if (r.isBest) { sfx.power(); buzz([30, 30, 30]); }
      if (r.runs.left > 0) { again.textContent = 'PLAY AGAIN · ' + r.runs.left + ' LEFT'; again.dataset.daily = '1'; }
      else { again.textContent = 'PRACTICE'; again.dataset.daily = ''; }
    } catch (e) {
      if (destroyed || G0 !== g) return;
      if (e && e.code === 'no_session') { opts.onSignedOut(); return; }
      $('r-badge').textContent = 'NOT SAVED';
      $('r-sum').insertAdjacentHTML('beforeend', '<span style="font-size:15px;color:#B4320A;font-weight:600">' + esc(errText(e)) + '</span>');
      again.textContent = runsLeft() ? 'PLAY AGAIN' : 'PRACTICE'; again.dataset.daily = runsLeft() ? '1' : '';
    } finally { again.disabled = false; }
  }
  on($('b-again'), 'click', () => begin($('b-again').dataset.daily === '1'));
  on($('b-menu'), 'click', openTitle);
  on($('b-share'), 'click', () => {
    const g = G0; if (!g) return;
    const txt = 'I grabbed ' + fmt(g.pts) + ' points and reached ' + fmt(heightM()) + 'M in Moon Jump' + (g.daily && day ? ' (Daily #' + day.today.n + ')' : '') + ' on Holdrs. Same map for everyone today. Can you beat me?';
    const done = () => toast('COPIED. PASTE IT ON X');
    try { navigator.clipboard.writeText(txt).then(done, () => toast(txt)); } catch { toast(txt); }
  });

  // ---------- ranks ----------
  let boardKind = 'day';
  on($('b-board'), 'click', () => openBoard('day'));
  on($('b-board-back'), 'click', openTitle);
  on($('lb-tabs'), 'click', (e) => { const b = e.target.closest('[data-kind]'); if (b) openBoard(b.dataset.kind); });
  async function openBoard(kind) {
    boardKind = kind;
    mode = 'board'; show('scr-board');
    [...$('lb-tabs').children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === kind)));
    $('lb-day').textContent = day ? 'DAILY #' + day.today.n : '';
    $('lb-sub').textContent = kind === 'day' ? "Best single run on today's map." : 'All game points this season.';
    $('lb-list').innerHTML = '<div style="padding:16px" class="mj-muted">Loading…</div>';
    $('lb-mine').hidden = true;
    try {
      const lb = await api.board(kind);
      if (boardKind !== kind || mode !== 'board') return;
      const row = (r) => '<div class="mj-list-row' + (r.me ? ' me' : '') + '"><span class="mj-rank r' + r.rank + '">' + r.rank + '</span><img alt="" src="' + (images[r.char] || images.raccoon) + '"><span class="n">' + esc(r.username) + (r.me ? ' (you)' : '') + '<small>LV ' + r.level + '</small></span><span class="mj-num">' + fmt(r.points) + '</span></div>';
      $('lb-list').innerHTML = lb.rows.length ? lb.rows.map(row).join('') : '<div style="padding:16px;font-size:16px" class="mj-muted">' + (kind === 'day' ? 'No runs yet today. Be the first on the board.' : 'No runs yet this season.') + '</div>';
      if (lb.mine && !lb.rows.some((r) => r.me)) { $('lb-mine').hidden = false; $('lb-mine').innerHTML = row(lb.mine); }
    } catch (e) { $('lb-list').innerHTML = '<div style="padding:16px;color:#B4320A;font-weight:600">' + esc(errText(e)) + '</div>'; }
  }

  // ---------- go ----------
  if (document.fonts && document.fonts.load) document.fonts.load('10px "Press Start 2P"').catch(() => {});
  raf = requestAnimationFrame(frame);
  openTitle();

  return {
    /** The site's profile changed (new look, points): redraw what shows it. */
    refresh() { if (mode === 'title') renderTitle(); },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(toastT);
      listeners.forEach((off) => off());
      try { if (ac) ac.close(); } catch { /* ignore */ }
      root.innerHTML = '';
      root.classList.remove('mj');
    },
  };
}
