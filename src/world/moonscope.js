// =============================================================================
// THE TELESCOPE (milestone 5): the 2D overlay of the star-picture game. An OPAQUE full-screen canvas over the walk (the life hides the 3D
// scene under it, so nothing is drawn twice): the seeded sky (the same stars as the real one), the five pictures' stars brighter, a 60 by
// 40 degree window she pans (drag, stick, arrows, the mouse when the pointer is locked), the pictures she has traced lit, the next star
// pulsing when she is stuck. The rules are world/moonstars.js (pure); this only draws, listens and calls back.
//   touch / mouse   drag the sky; tap a star (40 px) to pin it; the cross (top right) closes, the bulb (top left) shows the next star
//   pad             the stick pans the sky under a ring in the middle that snaps to the nearest star; A pins it, B closes, X shows the hint
//   keyboard        arrows or WASD pan; Space or Enter pins; Esc, Backspace, E or Q closes; H shows the hint
//   mouse (locked)  moving the mouse pans (the pointer is locked in the walk); a click pins the star under the ring
// A wrong star is a soft "hmm" and nothing is lost. Nothing here is timed but the hint, and no pointer, key or pad press reaches the walk
// underneath while it is open (keys are caught first; the life holds the cat still). close() frees the canvas (its pixels) and removes every
// listener. Text: only the "hmm" line and the name of a picture just traced; everything else is a picture. No random number, no clock.
// =============================================================================

import { CONSTELLATIONS, GREAT_CAT, WINDOW, TOLERANCE, STORY_BITS, starSky, catSky, nearestStar, scopeScale, angleTo } from './moonstars.js';

export const EARTH_AT = Object.freeze({ b: 12, e: 21, r: 4 }); // where Earth is on the sky (world/moonplan.js EARTH) and its size in degrees
export const PAN_SPEED = 34; // degrees a second by key or stick
export const VIEW_LIMITS = Object.freeze({ minE: 6, maxE: 82 });
// the band's middle line on the sky: bearing and elevation
const MILKY = Object.freeze(Array.from({ length: 37 }, (_, i) => { const b = i * 10; return Object.freeze([b, 38 + 26 * Math.sin(((b - 130) * Math.PI) / 180)]); }));
const wrap = (b) => ((b % 360) + 360) % 360;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const KEYS = Object.freeze({
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  pin: ['Space', 'Enter', 'NumpadEnter'], close: ['Escape', 'Backspace', 'KeyE', 'KeyQ'], hint: ['KeyH'],
});
const keyOf = (code) => Object.keys(KEYS).find((k) => KEYS[k].includes(code)) ?? null;

// createScope(opts) -> { open(at), close(), update(dt, t), draw(), isOpen, view, ... }
// opts: doc, win (the page, injectable for tests), pads() -> the pad list, sky: [{ b, e, m }] the background stars, solver, hint,
//   line(key) -> text, reducedMotion, lite, onResult(res), onClose(), onAsk()
export function createScope(opts) {
  const { doc, win, solver, hint, sky = [], reducedMotion = false } = opts;
  const PICS = opts.pictures ?? CONSTELLATIONS; // (milestone 9) the five, plus the day's guest as a sixth while Pip's errand asks for it
  const line = opts.line ?? (() => '');
  const pads = opts.pads ?? (() => []);
  let root = null;
  let canvas = null;
  let g = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let isOpen = false;
  const view = { b: 340, e: 34 };
  const goal = { b: null, e: null, t: 0 }; // an eased slide of the view (to Earth once it is found)
  const held = { left: false, right: false, up: false, down: false };
  const drag = { on: false, id: null, x: 0, y: 0, moved: 0 };
  let pulse = 0;
  let flash = null; // { c, i, t } the last wrong star: a grey ring that fades
  let said = null; // { text, t }
  let sparkle = null; // { c, t } a picture just finished
  let lastPin = { c: -1, i: -1 };
  const pad = { a: false, b: false, x: false };
  const unbind = [];
  let hits = []; // the screen places of the stars, for taps

  const on = (target, type, fn, cap) => {
    target?.addEventListener?.(type, fn, cap);
    unbind.push(() => target?.removeEventListener?.(type, fn, cap));
  };

  // ---- the window ----------------------------------------------------------------------------------------------------------
  const k = () => scopeScale(W, H);
  const toX = (b) => W / 2 + angleTo(view.b, b) * k();
  const toY = (e) => H / 2 - (e - view.e) * k();
  const panBy = (db, de) => { view.b = wrap(view.b + db); view.e = clamp(view.e + de, VIEW_LIMITS.minE, VIEW_LIMITS.maxE); goal.b = null; };

  function layout() {
    const w = win?.innerWidth ?? 960;
    const h = win?.innerHeight ?? 540;
    dpr = Math.min(2, win?.devicePixelRatio ?? 1);
    W = w;
    H = h;
    if (canvas) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  }

  // ---- the stars on screen, by picture --------------------------------------------------------------------------------------
  function place() {
    hits = [];
    PICS.forEach((c, ci) => {
      for (let i = 0; i < c.pts.length; i++) {
        const s = starSky(c, i);
        const x = toX(s.b);
        const y = toY(s.e);
        if (x > -30 && x < W + 30 && y > -30 && y < H + 30) hits.push({ c: ci, i, x, y });
      }
    });
    return hits;
  }
  const reticle = () => ({ x: W / 2, y: H / 2 });
  const snapped = () => nearestStar(hits, W / 2, H / 2, TOLERANCE.snap);

  // ---- an answer to a tap or a pin -------------------------------------------------------------------------------------------
  function tapStar(s, x, y) {
    if (!s) return null;
    const before = solver.bits;
    const res = solver.tap(s.c, s.i);
    if (res.kind === 'pin' || res.kind === 'done') { hint.reset(); lastPin = { c: s.c, i: s.i }; }
    if (res.kind === 'hmm') { flash = { c: s.c, i: s.i, t: 0, x, y }; said = { text: line('moon.scope.hmm'), t: 0 }; hint.reset(); }
    if (res.kind === 'done') {
      sparkle = { c: s.c, t: 0 };
      said = { text: line(s.c >= CONSTELLATIONS.length ? `moon.guest.${PICS[s.c].id}` : `moon.star.${CONSTELLATIONS[s.c].id}`), t: 0 };
      if ((res.bits & STORY_BITS) === STORY_BITS && (before & STORY_BITS) !== STORY_BITS) showEarth(); // Earth is found: the view slides to it
    }
    opts.onResult?.(res);
    return res;
  }

  // ---- input ---------------------------------------------------------------------------------------------------------------
  function onKeyDown(e) {
    if (!isOpen) return;
    const what = keyOf(e.code);
    if (!what) return;
    e.stopImmediatePropagation?.();
    e.preventDefault?.();
    if (what === 'close') return close();
    if (e.repeat) return;
    if (what === 'pin') return tapStar(snapped(), W / 2, H / 2);
    if (what === 'hint') { hint.ask(); return opts.onAsk?.(); }
    held[what] = true;
  }
  function onKeyUp(e) {
    const what = keyOf(e.code);
    if (what && what in held) held[what] = false;
  }
  function onPointerDown(e) {
    if (!isOpen) return;
    e.preventDefault?.();
    if (doc?.pointerLockElement) { tapStar(snapped(), W / 2, H / 2); return; }
    drag.on = true;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved = 0;
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
  }
  function onPointerMove(e) {
    if (!isOpen) return;
    if (doc?.pointerLockElement) { panBy(-(e.movementX ?? 0) / k(), (e.movementY ?? 0) / k()); return; }
    if (!drag.on || (drag.id != null && e.pointerId !== drag.id)) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved > 8) panBy(-dx / k(), dy / k());
  }
  function onPointerUp(e) {
    if (!isOpen || !drag.on) return;
    drag.on = false;
    if (drag.moved <= 8) {
      const s = nearestStar(hits, e.clientX, e.clientY, e.pointerType === 'mouse' ? TOLERANCE.mouse : TOLERANCE.touch);
      tapStar(s, e.clientX, e.clientY);
    }
  }

  // ---- the page ------------------------------------------------------------------------------------------------------------
  function make() {
    root = doc.createElement('div');
    root.className = 'moon-scope';
    root.setAttribute?.('role', 'dialog');
    Object.assign(root.style ?? {}, { position: 'fixed', inset: '0', zIndex: '90', background: '#02040a', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none' });
    canvas = doc.createElement('canvas');
    Object.assign(canvas.style ?? {}, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
    g = canvas.getContext?.('2d') ?? null;
    root.appendChild(canvas);
    const btn = (text, label, side, fn) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.setAttribute?.('aria-label', label);
      Object.assign(b.style ?? {}, { position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', [side]: 'max(14px, env(safe-area-inset-left))', width: '56px', height: '56px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.45)', background: 'rgba(20,30,52,.78)', color: '#fff', fontSize: '26px', lineHeight: '1', cursor: 'pointer', touchAction: 'manipulation' });
      b.addEventListener?.('click', (e) => { e.stopPropagation?.(); fn(); });
      b.addEventListener?.('pointerdown', (e) => e.stopPropagation?.());
      root.appendChild(b);
      return b;
    };
    btn('✕', line('moon.scope.close'), 'right', () => close());
    btn('💡', line('moon.scope.hintbtn'), 'left', () => { hint.ask(); opts.onAsk?.(); });
    doc.body.appendChild(root);
    layout();
    on(canvas, 'pointerdown', onPointerDown);
    on(canvas, 'pointermove', onPointerMove);
    on(canvas, 'pointerup', onPointerUp);
    on(canvas, 'pointercancel', () => { drag.on = false; });
    on(win, 'keydown', onKeyDown, true);
    on(win, 'keyup', onKeyUp, true);
    on(win, 'resize', layout);
  }

  function open(at = null) {
    if (isOpen || !doc?.body) return false;
    make();
    isOpen = true;
    for (const key of Object.keys(held)) held[key] = false;
    const t = at ?? (() => { const c = solver.focus(); return c >= 0 ? PICS[c] : { bearing: EARTH_AT.b, elev: EARTH_AT.e }; })();
    view.b = wrap(t.bearing);
    view.e = clamp(t.elev, VIEW_LIMITS.minE, VIEW_LIMITS.maxE);
    goal.b = null;
    const p = pads()[0];
    pad.a = !!p?.buttons?.[0]?.pressed; // a press that opened the scope is not a pin: it waits to be let go
    pad.b = true;
    pad.x = true;
    hint.reset();
    said = null; flash = null; sparkle = null;
    draw(0);
    return true;
  }

  function close() {
    if (!isOpen) return false;
    isOpen = false;
    for (const f of unbind.splice(0)) f();
    if (canvas) { canvas.width = 0; canvas.height = 0; } // frees the pixels
    root?.remove?.();
    root = canvas = g = null;
    hits = [];
    opts.onClose?.();
    return true;
  }

  // ---- each frame ----------------------------------------------------------------------------------------------------------
  function update(dt, t = 0) {
    if (!isOpen) return;
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    let px = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    let py = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    const p = pads()[0];
    if (p) {
      const ax = p.axes ?? [];
      const dz = (v) => (Math.abs(v ?? 0) < 0.18 ? 0 : v);
      px += dz(ax[0]) + dz(ax[2]);
      py += -dz(ax[1]) - dz(ax[3]);
      const down = (i) => !!p.buttons?.[i]?.pressed;
      const a = down(0); const b = down(1); const x = down(2);
      place();
      if (a && !pad.a) tapStar(snapped(), W / 2, H / 2);
      if (b && !pad.b) { close(); return; }
      if (x && !pad.x) { hint.ask(); opts.onAsk?.(); }
      pad.a = a; pad.b = b; pad.x = x;
    }
    if (px || py) panBy(clamp(px, -1, 1) * PAN_SPEED * step, clamp(py, -1, 1) * PAN_SPEED * step);
    if (goal.b !== null) {
      goal.t = Math.min(1, goal.t + step / 1.2);
      const s = goal.t * goal.t * (3 - 2 * goal.t);
      view.b = wrap(goal.b0 + angleTo(goal.b0, goal.b) * s);
      view.e = goal.e0 + (goal.e - goal.e0) * s;
    }
    pulse += step;
    if (flash) { flash.t += step; if (flash.t > 0.7) flash = null; }
    if (said) { said.t += step; if (said.t > 2.6) said = null; }
    if (sparkle) { sparkle.t += step; if (sparkle.t > 1.6) sparkle = null; }
    const h = hint.tick(step);
    draw(t, h);
  }

  // slide the view to Earth (the story's moment: the Mouse and the Cat are traced)
  function showEarth() {
    goal.b0 = view.b; goal.e0 = view.e; goal.b = EARTH_AT.b; goal.e = EARTH_AT.e; goal.t = 0;
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------------------
  function draw(t = 0, hintStar = null) {
    if (!isOpen || !g) return;
    const s = dpr;
    g.setTransform?.(s, 0, 0, s, 0, 0);
    const bg = g.createLinearGradient?.(0, 0, 0, H);
    if (bg) { bg.addColorStop(0, '#02040a'); bg.addColorStop(1, '#0b1226'); g.fillStyle = bg; } else g.fillStyle = '#02040a';
    g.fillRect(0, 0, W, H);
    // the Milky Way: a faint wide band across the sky, feathered (three strokes, widest faintest)
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [wd, al] of [[11, 0.022], [7, 0.028], [3.5, 0.034]]) {
      g.strokeStyle = `rgba(190,205,255,${al})`; g.lineWidth = wd * k();
      g.beginPath();
      let px0 = 0;
      for (let i = 0; i < MILKY.length; i++) { const [bb, ee] = MILKY[i]; const x = W / 2 + angleTo(view.b, bb) * k(); const y = toY(ee); if (i && Math.abs(x - px0) < W) g.lineTo(x, y); else g.moveTo(x, y); px0 = x; }
      g.stroke();
    }
    // the seeded sky
    g.fillStyle = '#cfd8f2';
    for (const st of sky) {
      const x = toX(st.b);
      if (x < -3 || x > W + 3) continue;
      const y = toY(st.e);
      if (y < -3 || y > H + 3) continue;
      const tw = reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(t * 1.3 + st.b * 3.1);
      g.globalAlpha = Math.min(1, st.m * tw);
      const z = st.m > 0.85 ? 2.2 : 1.4;
      g.fillRect(x - z / 2, y - z / 2, z, z);
    }
    g.globalAlpha = 1;
    // Earth
    const ex = toX(EARTH_AT.b);
    const ey = toY(EARTH_AT.e);
    const er = EARTH_AT.r * k();
    if (ex > -er && ex < W + er && ey > -er && ey < H + er) {
      const grad = g.createRadialGradient?.(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
      if (grad) { grad.addColorStop(0, '#7cc0ff'); grad.addColorStop(1, '#1b4fa8'); g.fillStyle = grad; } else g.fillStyle = '#2f6fd0';
      g.beginPath(); g.arc(ex, ey, er, 0, Math.PI * 2); g.fill();
      if ((solver.bits & STORY_BITS) === STORY_BITS) {
        g.strokeStyle = '#9fffe0'; g.lineWidth = 3; g.globalAlpha = reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(t * 3);
        g.beginPath(); g.arc(ex, ey, er * 1.35, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    // the Great Cat, once all five are traced (faint, behind the pictures)
    if ((solver.bits & 31) === 31) {
      g.strokeStyle = 'rgba(150,200,255,.5)'; g.lineWidth = 2;
      const trace = (pts, close2) => { g.beginPath(); pts.forEach(([x, y], i) => { const c = catSky(x, y); (i ? g.lineTo : g.moveTo).call(g, toX(c.b), toY(c.e)); }); if (close2) g.closePath(); g.stroke(); };
      trace(GREAT_CAT.outline, true);
      trace(GREAT_CAT.tail, false);
    }
    // the pictures
    place();
    PICS.forEach((c, ci) => {
      const n = solver.pins(ci);
      const guide = ci === 0 && solver.bits === 0 && n === 0; // the first picture, drawn faintly the first time
      const lit = ((solver.bits >> ci) & 1) === 1;
      const spark = sparkle && sparkle.c === ci ? 1 + 0.5 * Math.sin(sparkle.t * 14) : 1;
      if (n > 1 || guide) {
        g.strokeStyle = lit ? 'rgba(160,215,255,.95)' : guide && n < 2 ? 'rgba(160,200,255,.22)' : 'rgba(150,200,255,.8)';
        g.lineWidth = lit ? 3 : 2.5;
        g.beginPath();
        const upto = guide ? c.pts.length : n;
        for (let i = 0; i < upto; i++) { const sp = starSky(c, i); (i ? g.lineTo : g.moveTo).call(g, toX(sp.b), toY(sp.e)); }
        g.stroke();
      }
      for (let i = 0; i < c.pts.length; i++) {
        const sp = starSky(c, i);
        const x = toX(sp.b); const y = toY(sp.e);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const pinned = i < n;
        const r = (pinned ? 7 : 5) * spark;
        g.fillStyle = pinned ? '#fff4c2' : '#ffe9a8';
        g.globalAlpha = pinned ? 1 : 0.85;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.25;
        g.beginPath(); g.arc(x, y, r * 2.2, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
    });
    // the hint: the next star pulses
    if (hintStar) {
      const sp = starSky(PICS[hintStar.c], hintStar.i);
      const x = toX(sp.b); const y = toY(sp.e);
      const r = 14 + (reducedMotion ? 6 : 8 * Math.abs(Math.sin(pulse * 4)));
      g.strokeStyle = '#ffd45a'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    // the wrong star: a grey ring that fades
    if (flash) {
      const sp = starSky(PICS[flash.c], flash.i);
      g.strokeStyle = `rgba(190,190,205,${(1 - flash.t / 0.7) * 0.8})`; g.lineWidth = 3;
      g.beginPath(); g.arc(toX(sp.b), toY(sp.e), 12 + flash.t * 14, 0, Math.PI * 2); g.stroke();
    }
    // the reticle (always: it is what the pad and the locked mouse aim with) and what it snaps to
    const sn = snapped();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, H / 2, sn ? 22 : 16, 0, Math.PI * 2); g.stroke();
    if (sn) { g.strokeStyle = '#9fffe0'; g.beginPath(); g.arc(sn.x, sn.y, 17, 0, Math.PI * 2); g.stroke(); }
    // the one line of words
    if (said?.text) {
      g.font = '600 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(230,240,255,.95)';
      g.globalAlpha = Math.min(1, (2.6 - said.t) * 2);
      g.fillText(said.text, W / 2, H - 46);
      g.globalAlpha = 1;
    }
  }

  return {
    open, close, update, draw, showEarth,
    caption(text) { said = text ? { text, t: 0 } : null; },
    get isOpen() { return isOpen; },
    get view() { return view; },
    get element() { return root; },
    get canvas() { return canvas; },
    get hits() { return hits; },
    get lastPin() { return lastPin; },
    get said() { return said; },
    place, tap: (x, y, kind = 'touch') => tapStar(nearestStar(hits, x, y, TOLERANCE[kind] ?? TOLERANCE.touch), x, y),
    pinSnapped: () => tapStar(snapped(), W / 2, H / 2),
    dispose: close,
    WINDOW,
  };
}
