// The soak bot that runs INSIDE the game page (injected before the game's own scripts
// by Page.addScriptToEvaluateOnNewDocument, after a line that sets window.__SOAK_CFG).
// Plain script, no imports: scripts/soak.mjs reads it as text.
//
// It plays through a stand-in gamepad (navigator.getGamepads is replaced, so the game's
// own pad code runs: Start resumes, the left stick walks, A pounces/kicks, X interacts),
// and through keyboard events on top. One tick every TICK ms; every random choice is a
// draw from the seeded generator, so a seed repeats the same plan of inputs (what the
// game does with them still depends on timing).
//
// How it finds goals (the game exposes no positions): the HUD's #hud-objective shows a
// distance in whole metres. The bot hill-climbs on it: walk a heading, and if the
// distance grew after a few seconds turn by 90-180 degrees, if it fell keep going. The
// #hud-prompt line ("E - Hop in", "Pick up", ...) means something can be done right
// here: it stops and presses interact. A "Hop in/out" prompt (the rover Dot) is worked
// repeatedly. In the Reef the kick (A) is held for stretches. Every so often it pauses
// (Start, then Start again), hides the tab for a while (one huge frame gap) and, on a
// long timer, goes home and picks another place from the map (Change place).
(function () {
  const cfg = window.__SOAK_CFG || {};
  const TICK = 80;
  const WALK_ENDED = 'Something went wrong on that trip';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- pure helpers (also exported for the unit test) --------------------------------
  // "12 m" -> 12, "here" -> 0, anything else -> null.
  function parseDistance(text) {
    if (typeof text !== 'string') return null;
    const t = text.trim().toLowerCase();
    if (t === 'here') return 0;
    const m = /^(\d+)\s*m$/.exec(t);
    return m ? Number(m[1]) : null;
  }
  // The perf readout's open diagnostics lines: "10:21:05 frame ×3 · TypeError: x (main-abc.js:120)".
  function parseDiagLine(text) {
    const m = /^(?:\d\d:\d\d:\d\d|--:--:--)\s+(\S+?)(?:\s+×(\d+))?\s+·\s+(.*?)(?:\s+\(([^():\s]*?)(?::(\d+))?\))?$/.exec(String(text).trim());
    if (!m) return { kind: 'unknown', message: String(text).trim().slice(0, 200), source: '', line: 0, count: 1 };
    return { kind: m[1], count: m[2] ? Number(m[2]) : 1, message: m[3], source: m[4] || '', line: m[5] ? Number(m[5]) : 0 };
  }
  // "⚠ 3 errors ▸" -> 3.
  function parseDiagHead(text) {
    const m = /(\d+)\s+errors?/.exec(String(text));
    return m ? Number(m[1]) : 0;
  }
  // The next heading (radians) given what the distance did: nearer keeps it, farther turns away.
  function nextHeading({ heading, before, after, rnd }) {
    if (before === null || after === null) return heading + (rnd() - 0.5) * 1.2;
    if (after < before) return heading + (rnd() - 0.5) * 0.3;
    const turn = (Math.PI / 2) + rnd() * (Math.PI / 2);
    return heading + (rnd() < 0.5 ? turn : -turn);
  }
  const brain = { mulberry32, parseDistance, parseDiagLine, parseDiagHead, nextHeading, WALK_ENDED };
  if (cfg.noStart) { globalThis.__soakBrain = brain; return; }

  // ---- state --------------------------------------------------------------------------
  const rnd = mulberry32(cfg.seed ?? 1);
  const state = { step: 0, events: [], phase: 'boot', walkEnded: false, phaseCounts: {}, frames: 0, marks: {}, gl: null, started: Date.now(), places: 0, hops: 0, hides: 0, pauses: 0, lastPrompt: '' };
  window.__soak = state;
  const note = (kind, message, source, line) => {
    if (state.events.length < 200) state.events.push({ kind, message: String(message).slice(0, 300), source: source || '', line: line || 0, step: state.step, at: Date.now() - state.started });
  };
  window.addEventListener('error', (e) => { if (e && (e.error !== undefined || e.message)) note('error', e.error?.stack?.split('\n')[0] || e.message, (e.filename || '').split('/').pop(), e.lineno); });
  window.addEventListener('unhandledrejection', (e) => note('rejection', e?.reason?.message || String(e?.reason)));

  // ---- the hidden tab: rAF held back, then released all at once -----------------------
  const realRaf = window.requestAnimationFrame.bind(window);
  let held = null; // null = running; array = tab "hidden", callbacks waiting
  const mark = (name) => { if (state.marks[name] === undefined) state.marks[name] = Math.round(performance.now()); };
  mark('botInstalled');
  window.addEventListener('load', () => mark('pageLoaded'));
  window.requestAnimationFrame = (cb) => {
    state.frames += 1;
    if (state.frames === 1) mark('firstFrame');
    if (state.frames === 10) mark('frame10');
    if (state.frames === 60) mark('frame60');
    if (held) { held.push(cb); return 0; }
    return realRaf(cb);
  };
  const realHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const realVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  function setHidden(on) {
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => (on ? true : realHidden.get.call(document)) });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'hidden' : realVis.get.call(document)) });
    } catch { /* leave it */ }
    document.dispatchEvent(new Event('visibilitychange'));
  }
  function hideTab(ms) {
    if (held) return;
    state.hides += 1;
    held = [];
    setHidden(true);
    setTimeout(() => {
      setHidden(false);
      const waiting = held;
      held = null;
      for (const cb of waiting) realRaf(cb);
    }, ms);
  }

  // ---- stand-in gamepads --------------------------------------------------------------
  const BTN = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, START: 9 };
  const pads = [];
  function makePad(index) {
    return {
      id: 'Soak Pad (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
  }
  const padCount = cfg.couch ? 2 : 1;
  for (let i = 0; i < padCount; i++) pads.push(makePad(i));
  const holds = []; // { pad, button, left } ticks of press still to go
  const press = (button, ticks = 3, pad = pads[0]) => {
    pad.buttons[button].pressed = true; pad.buttons[button].value = 1;
    holds.push({ pad, button, left: ticks });
  };
  const releasePads = () => {
    for (let i = holds.length - 1; i >= 0; i--) {
      if (--holds[i].left <= 0) { const h = holds[i]; h.pad.buttons[h.button].pressed = false; h.pad.buttons[h.button].value = 0; holds.splice(i, 1); }
    }
  };
  try {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { for (const p of pads) p.timestamp = performance.now(); return pads.slice(); } });
  } catch { /* the page keeps its own */ }
  function announcePads() {
    for (const p of pads) {
      const ev = new Event('gamepadconnected');
      ev.gamepad = p;
      window.dispatchEvent(ev);
    }
  }
  window.addEventListener('load', () => setTimeout(announcePads, 400));
  // Which GL is it: the real GPU or a software renderer?
  window.addEventListener('load', () => setTimeout(() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      state.gl = gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl';
    } catch (e) { state.gl = `unreadable: ${e && e.message}`; }
  }, 300));

  // ---- keyboard -----------------------------------------------------------------------
  const down = new Set();
  const KEYS = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Space: ' ', KeyE: 'e', KeyV: 'v', KeyC: 'c', ShiftLeft: 'Shift', Equal: '=', Minus: '-' };
  function keyDown(code) {
    if (down.has(code)) return;
    down.add(code);
    document.dispatchEvent(new KeyboardEvent('keydown', { code, key: KEYS[code] || code, bubbles: true, cancelable: true }));
  }
  function keyUp(code) {
    if (!down.has(code)) return;
    down.delete(code);
    document.dispatchEvent(new KeyboardEvent('keyup', { code, key: KEYS[code] || code, bubbles: true, cancelable: true }));
  }
  const keyTap = (code) => { keyDown(code); setTimeout(() => keyUp(code), 120); };
  const releaseKeys = () => { for (const c of [...down]) keyUp(c); };

  // ---- reading the game ---------------------------------------------------------------
  const $ = (s) => document.querySelector(s);
  const visible = (el) => !!el && !el.classList.contains('hidden') && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const promptText = () => { const el = $('#hud-prompt'); return visible(el) ? el.textContent.trim() : ''; };
  const objectiveDist = () => { const el = $('#hud-objective .hud-objective-dist'); return el && visible($('#hud-objective')) ? parseDistance(el.textContent) : null; };
  const homeUp = () => visible($('#homebase')) && !!$('#btn-start');
  const overlayUp = () => visible($('#overlay'));
  const hudUp = () => visible($('#hud'));
  function readDiag() {
    const head = $('#perf-diag');
    if (!head || head.classList.contains('hidden')) return { total: 0, lines: [] };
    const total = parseDiagHead(head.querySelector('.diag-head')?.textContent || '');
    if (total && !/▾/.test(head.textContent)) head.click(); // open it (the head toggles)
    const lines = [...head.querySelectorAll('.diag-line')].map((l) => l.textContent).filter((t) => !/^after last walk/.test(t)).map(parseDiagLine);
    return { total, lines };
  }
  const walkEnded = () => !!$('#btn-reload') || document.body.innerText.includes(WALK_ENDED);

  // ---- the plan -----------------------------------------------------------------------
  const plan = {
    heading: rnd() * Math.PI * 2, magnitude: 1, useKeys: false, until: 0, distBefore: null,
    kickUntil: 0, nextAction: 0, hopLeft: 0, nextHop: 0, nextHide: 0, nextPause: 0, resumeAt: 0, nextTravel: 0, travelling: 0,
    nextOrbit: 0, idleUntil: 0,
  };
  const now = () => state.step * TICK;
  const sched = (min, max) => now() + (min + rnd() * (max - min)) * 1000;
  plan.nextAction = sched(1, 4);
  plan.nextHide = cfg.hiddenTab ? sched(20, 60) : Infinity;
  plan.nextPause = sched(30, 90);
  plan.nextTravel = cfg.travel === false ? Infinity : sched(240, 420);

  function setMove(x, y) {
    for (const p of pads) { p.axes[0] = 0; p.axes[1] = 0; }
    pads[0].axes[0] = x; pads[0].axes[1] = y;
  }
  function stopMove() { setMove(0, 0); releaseKeys(); }
  function applyHeading() {
    const x = Math.cos(plan.heading) * plan.magnitude;
    const y = Math.sin(plan.heading) * plan.magnitude;
    if (plan.useKeys) {
      pads[0].axes[0] = 0; pads[0].axes[1] = 0;
      const want = new Set();
      if (y < -0.35) want.add(rnd() < 0.5 ? 'ArrowUp' : 'KeyW');
      if (y > 0.35) want.add(rnd() < 0.5 ? 'ArrowDown' : 'KeyS');
      if (x < -0.35) want.add(rnd() < 0.5 ? 'ArrowLeft' : 'KeyA');
      if (x > 0.35) want.add(rnd() < 0.5 ? 'ArrowRight' : 'KeyD');
      for (const c of [...down]) if (!want.has(c) && c !== 'ShiftLeft') keyUp(c);
      for (const c of want) keyDown(c);
      if (plan.magnitude < 0.7) keyDown('ShiftLeft'); else keyUp('ShiftLeft');
    } else {
      releaseKeys();
      setMove(x, y);
    }
    // a second pad (couch play) wanders on its own
    if (pads[1] && rnd() < 0.1) { const a = rnd() * 6.28; pads[1].axes[0] = Math.cos(a); pads[1].axes[1] = Math.sin(a); if (rnd() < 0.3) press(rnd() < 0.5 ? BTN.A : BTN.X, 3, pads[1]); }
  }

  function choosePlan(t) {
    const dist = objectiveDist();
    if (cfg.goal !== false && dist !== null && plan.distBefore !== null && rnd() < 0.7) {
      plan.heading = nextHeading({ heading: plan.heading, before: plan.distBefore, after: dist, rnd });
    } else {
      plan.heading = rnd() < 0.5 ? plan.heading + (rnd() - 0.5) * 2 : rnd() * Math.PI * 2;
    }
    plan.distBefore = dist;
    plan.magnitude = rnd() < 0.8 ? 1 : 0.5;
    plan.useKeys = rnd() < 0.35;
    plan.until = t + (1.2 + rnd() * 3.5) * 1000;
    applyHeading();
  }

  function actOnce(t) {
    const r = rnd();
    if (r < 0.28) press(BTN.A);                       // pounce / climb / kick tap
    else if (r < 0.46) press(BTN.X);                  // interact / sniff
    else if (r < 0.54) press(BTN.B);                  // meow
    else if (r < 0.60) keyTap('Space');
    else if (r < 0.66) keyTap('KeyE');
    else if (r < 0.70) keyTap('KeyV');
    else if (r < 0.74) press(rnd() < 0.5 ? BTN.L1 : BTN.R1);
    else if (r < 0.77) press(BTN.Y);                  // photo mode on/off
    else if (r < 0.79) keyTap('KeyC');
    else if (r < 0.82) { pads[0].axes[2] = (rnd() - 0.5) * 2; pads[0].axes[3] = (rnd() - 0.5) * 1.2; plan.nextOrbit = t + 600 + rnd() * 1200; }
    else if (cfg.place === 'reef' && r < 0.95) plan.kickUntil = t + (1 + rnd() * 3.5) * 1000;
    plan.nextAction = t + (0.6 + rnd() * 3) * 1000;
  }

  function hopPrompt(text) {
    return /\bhop\s+(in|out|on|off)\b|\bboard\b/i.test(text);
  }

  // ---- the home screen: Change place ---------------------------------------------------
  function clickEl(el) { if (el) { el.click(); return true; } return false; }
  function travelStep() {
    // returns true while it is driving the menus
    if (plan.travelling === 0) return false;
    if (homeUp()) {
      if (plan.travelling === 1) { // open Change place
        if (clickEl($('[data-dr-sheet="places"]'))) { plan.travelling = 2; return true; }
        plan.travelling = 0; return false;
      }
      if (plan.travelling === 2) {
        const opts = [...document.querySelectorAll('[data-dr-place],[data-dr-map-place]')].filter((el) => !el.classList.contains('locked') && !el.classList.contains('cant'));
        if (opts.length) {
          const el = opts[Math.floor(rnd() * opts.length)];
          note('travel', el.getAttribute('data-dr-place') || el.getAttribute('data-dr-map-place') || '?');
          el.click();
          state.places += 1;
        }
        plan.travelling = 3; return true;
      }
    }
    return plan.travelling > 0;
  }

  // ---- one tick -----------------------------------------------------------------------
  function tick() {
    state.step += 1;
    const t = now();
    if (state.phase === 'home') mark('home');
    if (state.phase === 'overlay') mark('readyCard');
    if (state.phase === 'walk') mark('walkStarted');
    state.phaseCounts[state.phase] = (state.phaseCounts[state.phase] || 0) + 1;
    releasePads();
    if (pads[0].axes[2] && t > plan.nextOrbit) { pads[0].axes[2] = 0; pads[0].axes[3] = 0; }
    if (!state.walkEnded && walkEnded()) { state.walkEnded = true; note('walk-ended', 'the Home again card showed'); }
    state.diag = readDiag();

    if (homeUp()) {
      state.phase = 'home';
      stopMove();
      if (travelStep()) return;
      if (plan.travelling === 3) { plan.travelling = 0; if (clickEl($('#hb-back, #hb-home'))) return; }
      if (state.step % 12 === 0) { clickEl($('#btn-start')); mark('explorePressed'); }
      return;
    }
    if (overlayUp()) {
      state.phase = 'overlay';
      stopMove();
      const resume = $('#btn-resume');
      if (resume) {
        if (t >= plan.resumeAt) {
          if (plan.wantHome) {
            const homeBtn = [...document.querySelectorAll('#overlay button')].find((b) => /head home/i.test(b.textContent));
            plan.wantHome = false;
            if (homeBtn) { homeBtn.click(); plan.travelling = 1; return; }
          }
          press(BTN.START, 3); // the pad resumes, as the game does for a real pad
          plan.resumeAt = t + 1500;
        }
      } else if (!walkEnded()) {
        // a summary or another card: the first primary button, else the first button
        const b = $('#overlay .primary') || $('#overlay button');
        if (b && state.step % 10 === 0) b.click();
      }
      return;
    }
    if (!hudUp()) { state.phase = 'loading'; return; }
    state.phase = 'walk';

    if (cfg.touch && !state.touched) { state.touched = true; window.dispatchEvent(new Event('touchstart')); }
    if (plan.kickUntil > t) { pads[0].buttons[BTN.A].pressed = true; pads[0].buttons[BTN.A].value = 1; }
    else if (plan.kickUntil && plan.kickUntil <= t) { plan.kickUntil = 0; pads[0].buttons[BTN.A].pressed = false; pads[0].buttons[BTN.A].value = 0; }
    if (cfg.place === 'reef' && !plan.kickUntil && rnd() < 0.01) plan.kickUntil = t + (1 + rnd() * 4) * 1000;

    if (t >= plan.nextHide) { hideTab(4000 + rnd() * 20000); plan.nextHide = cfg.hiddenTab ? sched(90, 240) : Infinity; return; }
    if (t >= plan.nextPause) { press(BTN.START, 3); state.pauses += 1; plan.nextPause = sched(40, 120); plan.resumeAt = t + 800 + rnd() * 2500; stopMove(); return; }
    if (t >= plan.nextTravel) { plan.wantHome = true; plan.nextTravel = sched(240, 480); press(BTN.START, 3); plan.resumeAt = t; return; }

    const prompt = promptText();
    state.lastPrompt = prompt;
    if (prompt && hopPrompt(prompt)) {
      // the rover: hop in and out again and again
      if (t >= plan.nextHop) {
        stopMove();
        if (rnd() < 0.5) press(BTN.X, 3); else keyTap('KeyE');
        state.hops += 1;
        plan.nextHop = t + 500 + rnd() * 1800;
      }
      return;
    }
    if (prompt && t >= plan.idleUntil && rnd() < 0.15) {
      stopMove();
      press(rnd() < 0.7 ? BTN.X : BTN.A, 3);
      plan.idleUntil = t + 1500;
      plan.until = t + 600;
      return;
    }
    if (t >= plan.until) choosePlan(t);
    else if (plan.useKeys && state.step % 6 === 0) applyHeading();
    if (t >= plan.nextAction) actOnce(t);
  }

  state.brain = brain;
  setInterval(tick, TICK);
})();
