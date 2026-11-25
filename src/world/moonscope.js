// =============================================================================
// THE TELESCOPE (milestone 5): the 2D overlay of the star-picture game. An OPAQUE full-screen canvas over the walk (the life hides the 3D
// scene under it, so nothing is drawn twice): the seeded sky (the same stars as the real one), the five pictures' stars brighter, a 60 by
// 40 degree window she pans (drag, stick, arrows, the mouse when the pointer is locked), the pictures she has traced lit, the next star
// pulsing when she is stuck. The rules are world/moonstars.js (pure); this only draws, listens and calls back.
//   touch / mouse   drag the sky; tap near a star (within the ring plus a star's size: world/moonstars.js scopeRing, screen units) to pin it; pinch or wheel zooms 0.5x to 2.5x;
//                   the Close pill (top right) closes, the Hint pill (top left) shows the next star; a written objective sits at the top; two cards (why she is here, Earth found)
//   pad             the stick pans the sky under a ring in the middle that snaps to the nearest star; A pins it, B closes, X shows the hint
//   TV / pad        (TV and pad pass) on a TV the buttons, rings and words are bigger and inside the safe margin; while the pad is the last input a bar names its
//                   buttons (moon.pad.scope); the d-pad pans like the stick; the snap and tap reach grow with the picture
//   keyboard        arrows or WASD pan; Space or Enter pins; Esc, Backspace, E or Q closes; H shows the hint
//   mouse (locked)  moving the mouse pans (the pointer is locked in the walk); a click pins the star under the ring
// A wrong star is a soft "hmm" and nothing is lost. Nothing here is timed but the hint, and no pointer, key or pad press reaches the walk
// underneath while it is open (keys are caught first; the life holds the cat still). close() frees the canvas (its pixels) and removes every
// listener. Text: only the "hmm" line and the name of a picture just traced; everything else is a picture. No random number, no clock.
// =============================================================================

import { tvScale, safeEdge, makeHintBar } from './moontv.js';
import { CONSTELLATIONS, GREAT_CAT, WINDOW, STORY_BITS, HINT_GRACE, starSky, catSky, pickStar, scopeRing, objectiveOf, scopeScale, angleTo } from './moonstars.js';

export const EARTH_AT = Object.freeze({ b: 12, e: 21, r: 4 }); // where Earth is on the sky (world/moonplan.js EARTH) and its size in degrees
export const PAN_SPEED = 34; // degrees a second by key or stick
export const ZOOM = Object.freeze({ min: 0.5, max: 2.5, step: 1.35 }); // the telescope's zoom: 0.5x (a broad piece of sky, twice the width) to 2.5x, 1x is the start; the ring and the reach stay the same size on screen
export const VIEW_LIMITS = Object.freeze({ minE: 6, maxE: 82 });
// the band's middle line on the sky: bearing and elevation
const MILKY = Object.freeze(Array.from({ length: 37 }, (_, i) => { const b = i * 10; return Object.freeze([b, 38 + 26 * Math.sin(((b - 130) * Math.PI) / 180)]); }));
const wrap = (b) => ((b % 360) + 360) % 360;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const KEYS = Object.freeze({
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  pin: ['Space', 'Enter', 'NumpadEnter'], close: ['Escape', 'Backspace', 'KeyE', 'KeyQ'], hint: ['KeyH'], zoomIn: ['Equal', 'NumpadAdd'], zoomOut: ['Minus', 'NumpadSubtract'],
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
  let T = tvScale(doc, win); // the couch size (1 off a TV); a TV also gets a bar of the pad's buttons and bigger rings
  let bar = null;
  const btns = [];
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
  let strong = false; // the bulb was pressed: a stronger pulse and the line to the next star
  const pad = { a: false, b: false, x: false, l1: false, r1: false };
  const unbind = [];
  let last = 'none'; // the input used last: 'mouse', 'touch' (or a pen), 'pad' (the ring's size follows it)
  let zoom = 1; // eases to zoomGoal; back to 1 when the scope closes
  let zoomGoal = 1;
  const fingers = new Map(); // pinch: the pointers down
  let pinch = null; // { d, z } the distance and zoom when the second finger went down
  let earthPulse = null; // { t } Earth was tapped: it twinkles
  let doneBtn = null;
  let card = null; // { el, kind: 'intro' | 'found' } the card over the sky: why she is here (once a walk), then Earth found and what to do next
  let found = null; // { t } Earth was just found: it grows, sparkles ring it, the card comes
  let objective = ''; // the written objective at the top
  let hits = []; // the screen places of the stars, for taps

  const on = (target, type, fn, cap) => {
    target?.addEventListener?.(type, fn, cap);
    unbind.push(() => target?.removeEventListener?.(type, fn, cap));
  };

  // ---- the window ----------------------------------------------------------------------------------------------------------
  const k = () => scopeScale(W, H) * zoom;
  const toX = (b) => W / 2 + angleTo(view.b, b) * k();
  const toY = (e) => H / 2 - (e - view.e) * k();
  const setZoom = (z, now = false) => { zoomGoal = clamp(z, ZOOM.min, ZOOM.max); if (now || reducedMotion) zoom = zoomGoal; };
  const stepZoom = (dir) => setZoom(zoomGoal * (dir > 0 ? ZOOM.step : 1 / ZOOM.step));
  // zoomed out, the window must not show more than the sky: the middle's elevation keeps the top and bottom edges within 8 degrees of the zenith and the horizon (1x and in: the plain limits)
  const fitE = (e) => {
    if (zoom >= 1) return clamp(e, VIEW_LIMITS.minE, VIEW_LIMITS.maxE);
    const half = H / 2 / k(); const lo = Math.max(VIEW_LIMITS.minE, half - 8); const hi = Math.min(VIEW_LIMITS.maxE, 98 - half);
    return lo <= hi ? clamp(e, lo, hi) : (lo + hi) / 2;
  };
  const panBy = (db, de) => { view.b = wrap(view.b + db); view.e = fitE(view.e + de); goal.b = null; };

  // the buttons: the close cross (top right) and the hint bulb (top left) are pills with a word beside the picture (56 px high, 84 px on a TV at 1080p, inside the 5 % safe margin);
  // the zoom + and - are round and sit on the right edge; Back to the Moon is a wide pill at the bottom once Earth is found
  function styleBtns() {
    const size = T.tv ? Math.round(84 * T.s) : 56;
    for (const { b, side, kind } of btns) {
      const st = b.style ?? {};
      if (kind === 'corner') {
        Object.assign(st, { top: safeEdge(T.tv, 'top'), left: '', right: '', [side]: safeEdge(T.tv, 'side'), height: `${size}px`, minWidth: `${size}px`, padding: `0 ${Math.round(size * 0.3)}px`, fontSize: `${Math.round(size * 0.3)}px`, borderRadius: `${size / 2}px`, display: 'flex', alignItems: 'center', gap: `${Math.round(size * 0.14)}px`, fontWeight: '700' });
        b.querySelector?.('.moon-ico') && Object.assign(b.querySelector('.moon-ico').style, { fontSize: `${Math.round(size * 0.46)}px` });
      } else if (kind === 'zoom') {
        const z = Math.round(size * 0.86);
        Object.assign(st, { right: safeEdge(T.tv, 'side'), left: '', top: side === 'in' ? `calc(50% - ${z + 6}px)` : 'calc(50% + 6px)', width: `${z}px`, height: `${z}px`, fontSize: `${Math.round(z * 0.55)}px` });
      } else if (kind === 'done') {
        Object.assign(st, { left: '50%', transform: 'translateX(-50%)', bottom: T.tv ? `calc(max(14px, 5vh) + ${(bar?.height() ?? 0) + 12}px)` : 'max(18px, env(safe-area-inset-bottom))', height: `${size}px`, padding: `0 ${Math.round(size * 0.6)}px`, fontSize: `${Math.round(size * 0.36)}px`, borderRadius: `${size / 2}px`, fontWeight: '800', background: '#2f8f5b', border: '2px solid #bff5d6' });
      }
    }
  }

  // ---- the cards -------------------------------------------------------------------------------------------------------------
  const cardPx = () => (T.tv ? Math.round(30 * T.s) : (W >= 700 ? 22 : 17));
  function hideCard() { if (card) { card.el.remove?.(); card = null; } }
  function showCard(kind) {
    hideCard();
    if (!root) return;
    const px = cardPx();
    const el = doc.createElement('div');
    el.className = `moon-card moon-card-${kind}`;
    el.setAttribute?.('role', 'status');
    const intro = kind === 'intro';
    Object.assign(el.style ?? {}, {
      position: 'absolute', left: '50%', transform: 'translateX(-50%)', boxSizing: 'border-box', width: `min(${Math.round(px * 28)}px, 92vw)`, maxHeight: '60vh', overflow: 'hidden',
      [intro ? 'top' : 'bottom']: intro ? '28%' : (T.tv ? `calc(max(14px, 5vh) + ${(bar?.height() ?? 0) + 8}px)` : 'max(18px, env(safe-area-inset-bottom))'),
      background: 'rgba(8,14,32,.94)', border: '2px solid rgba(255,255,255,.4)', borderRadius: `${Math.round(px * 0.9)}px`, padding: `${Math.round(px * 0.8)}px ${Math.round(px * 0.9)}px`,
      color: '#fff', font: `600 ${px}px/1.35 system-ui, sans-serif`, textAlign: 'center', zIndex: '3',
    });
    const add = (text, style = {}) => { const d = doc.createElement('div'); d.textContent = text; Object.assign(d.style ?? {}, { margin: `${Math.round(px * 0.3)}px 0` }, style); el.appendChild(d); };
    if (intro) { add(line('moon.scope.intro.1')); add(line('moon.scope.intro.2')); add(line('moon.scope.intro.3'), { color: '#ffe9a8' }); } else {
      add(line('moon.scope.found.title'), { fontSize: `${Math.round(px * 1.5)}px`, fontWeight: '800', color: '#9fffe0' });
      add(line('moon.scope.found.pip'), { color: '#ffe9a8' });
      add(line(`moon.scope.found.body.${opts.after?.() ?? 'other'}`));
    }
    const go = doc.createElement('button');
    go.type = 'button';
    go.textContent = line(intro ? 'moon.scope.intro.go' : 'moon.scope.found.go');
    go.setAttribute?.('aria-label', go.textContent);
    Object.assign(go.style ?? {}, { marginTop: `${Math.round(px * 0.5)}px`, minHeight: `${Math.round(px * 2.4)}px`, padding: `0 ${Math.round(px * 1.6)}px`, font: `800 ${Math.round(px * 1.1)}px system-ui, sans-serif`, color: '#fff', background: '#2f8f5b', border: '2px solid #bff5d6', borderRadius: `${Math.round(px * 1.2)}px`, cursor: 'pointer', touchAction: 'manipulation' });
    go.addEventListener?.('click', (e) => { e.stopPropagation?.(); cardGo(); });
    go.addEventListener?.('pointerdown', (e) => e.stopPropagation?.());
    el.appendChild(go);
    root.appendChild(el);
    card = { el, kind };
  }
  // the card's button: the first card goes away, the found card closes the telescope (the next job is out in the Moon)
  function cardGo() {
    if (!card) return false;
    const kind = card.kind;
    hideCard();
    if (kind === 'found') close();
    return true;
  }

  function layout() {
    const w = win?.innerWidth ?? 960;
    const h = win?.innerHeight ?? 540;
    dpr = Math.min(2, win?.devicePixelRatio ?? 1);
    W = w;
    H = h;
    T = tvScale(doc, win);
    styleBtns();
    bar?.refresh(T);
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
  // the ring and the reach (px, from the screen's short side: world/moonstars.js scopeRing): bigger on a touch screen, a TV or with a pad than with a mouse
  function profile() {
    let kind = 'mouse';
    if (T.tv) kind = 'tv';
    else if (last === 'touch' || last === 'pad') kind = 'touch';
    else if (last === 'none') { try { if (win?.matchMedia?.('(pointer: coarse)')?.matches) kind = 'touch'; } catch { /* no media queries */ } }
    return { kind, ...scopeRing(W, H, kind, T.m) };
  }
  const snapped = () => { const p = profile(); return pickStar(hits, W / 2, H / 2, p.reach, solver.next()); };
  // a tap at (x, y): the star within reach of the finger (the next star wins when it is one of them), else the star in the ring when the tap is inside the ring
  function tapAt(x, y, type) {
    const kindWas = last;
    last = type === 'mouse' ? 'mouse' : 'touch';
    const p = profile();
    last = kindWas;
    const nxt = solver.next();
    let s = pickStar(hits, x, y, p.reach, nxt);
    if (!s && Math.hypot(x - W / 2, y - H / 2) <= p.ring) s = pickStar(hits, W / 2, H / 2, p.reach, nxt);
    return s;
  }

  // ---- an answer to a tap or a pin -------------------------------------------------------------------------------------------
  // Earth is a friendly thing to touch: it twinkles and says hello (nothing is counted)
  function earthAt(x, y) {
    const ex = toX(EARTH_AT.b); const ey = toY(EARTH_AT.e);
    return Math.hypot(x - ex, y - ey) <= Math.max(EARTH_AT.r * k() * 1.15, profile().ring);
  }
  function hello() {
    earthPulse = { t: 0 };
    said = { text: line('moon.scope.hello'), t: 0 };
    opts.onEarth?.();
    return { kind: 'earth', c: -1, i: -1, bits: solver.bits };
  }
  function tapStar(s, x, y) {
    if (!s) return earthAt(x, y) ? hello() : null;
    const before = solver.bits;
    const res = solver.tap(s.c, s.i);
    if (res.kind === 'pin' || res.kind === 'done') { hint.reset(); strong = false; lastPin = { c: s.c, i: s.i }; }
    if (res.kind === 'hmm') { flash = { c: s.c, i: s.i, t: 0, x, y }; said = { text: line(hint.tick(0) ? 'moon.scope.hmm.try' : 'moon.scope.hmm'), t: 0 }; } // a wrong star never hides the pulse
    if (res.kind === 'done') {
      hint.reset(HINT_GRACE); // the next picture's first star waits a few seconds (or her tap, or the bulb)
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
    if (!what && card?.kind === 'intro') { e.stopImmediatePropagation?.(); e.preventDefault?.(); if (!e.repeat) cardGo(); return; }
    if (!what) return;
    e.stopImmediatePropagation?.();
    e.preventDefault?.();
    if (what === 'close') return close();
    if (card && !e.repeat && (what === 'pin' || card.kind === 'intro')) return cardGo(); // Enter or Space (any key on the first card) answers the card
    if (e.repeat) return;
    if (what === 'pin') return tapStar(snapped(), W / 2, H / 2);
    if (what === 'zoomIn' || what === 'zoomOut') return stepZoom(what === 'zoomIn' ? 1 : -1);
    if (what === 'hint') { hint.ask(); strong = true; return opts.onAsk?.(); }
    if (what in held) held[what] = true;
  }
  function onKeyUp(e) {
    const what = keyOf(e.code);
    if (what && what in held) held[what] = false;
  }
  const fingerGap = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  function onWheel(e) {
    if (!isOpen) return;
    e.preventDefault?.();
    setZoom(zoomGoal * Math.exp(-(e.deltaY ?? 0) * 0.0015));
  }
  function onPointerDown(e) {
    if (!isOpen) return;
    e.preventDefault?.();
    if (card?.kind === 'intro') { cardGo(); return; } // a touch anywhere answers the first card
    if (doc?.pointerLockElement) { tapStar(snapped(), W / 2, H / 2); return; }
    last = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    if (fingers.size === 2) { drag.on = false; pinch = { d: fingerGap(), z: zoomGoal }; return; } // a second finger: a pinch, not a drag or a tap
    if (fingers.size > 2) return;
    drag.on = true;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved = 0;
  }
  function onPointerMove(e) {
    if (!isOpen) return;
    if (doc?.pointerLockElement) { panBy(-(e.movementX ?? 0) / k(), (e.movementY ?? 0) / k()); return; }
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && fingers.size === 2) { setZoom(pinch.z * (fingerGap() / pinch.d), true); return; }
    if (!drag.on || (drag.id != null && e.pointerId !== drag.id)) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved > 8) panBy(-dx / k(), dy / k());
  }
  function onPointerUp(e) {
    if (!isOpen) return;
    const wasPinch = pinch;
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (wasPinch) { drag.on = false; return; }
    if (!drag.on) return;
    drag.on = false;
    if (drag.moved <= 8) tapStar(tapAt(e.clientX, e.clientY, e.pointerType), e.clientX, e.clientY);
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
    const btn = (text, label, side, fn, kind = 'corner', word = '') => {
      const b = doc.createElement('button');
      b.type = 'button';
      if (kind === 'corner') {
        const ico = doc.createElement('span'); ico.className = 'moon-ico'; ico.textContent = text; b.appendChild(ico);
        const wd = doc.createElement('span'); wd.textContent = word; b.appendChild(wd);
      } else b.textContent = text;
      b.setAttribute?.('aria-label', label);
      Object.assign(b.style ?? {}, { position: 'absolute', borderRadius: '50%', border: '2px solid rgba(255,255,255,.45)', background: 'rgba(20,30,52,.78)', color: '#fff', lineHeight: '1', cursor: 'pointer', touchAction: 'manipulation', whiteSpace: 'nowrap' });
      b.addEventListener?.('click', (e) => { e.stopPropagation?.(); fn(); });
      b.addEventListener?.('pointerdown', (e) => e.stopPropagation?.());
      b.addEventListener?.('wheel', (e) => e.stopPropagation?.());
      root.appendChild(b);
      btns.push({ b, side, kind });
      return b;
    };
    btn('✕', line('moon.scope.close'), 'right', () => close(), 'corner', line('moon.scope.lbl.close'));
    btn('💡', line('moon.scope.hintbtn'), 'left', () => { hint.ask(); strong = true; opts.onAsk?.(); }, 'corner', line('moon.scope.lbl.hint'));
    btn('+', line('moon.scope.zoomin'), 'in', () => stepZoom(1), 'zoom');
    btn('−', line('moon.scope.zoomout'), 'out', () => stepZoom(-1), 'zoom');
    doneBtn = btn(line('moon.scope.done'), line('moon.scope.done'), 'bottom', () => close(), 'done');
    doneBtn.style.display = 'none';
    bar = makeHintBar({ doc, root, text: line('moon.pad.scope'), scale: T });
    doc.body.appendChild(root);
    layout();
    on(canvas, 'pointerdown', onPointerDown);
    on(canvas, 'pointermove', onPointerMove);
    on(canvas, 'pointerup', onPointerUp);
    on(canvas, 'wheel', onWheel);
    on(canvas, 'pointercancel', (e) => { drag.on = false; fingers.delete(e?.pointerId); pinch = null; });
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
    strong = false;
    zoom = zoomGoal = 1;
    fingers.clear(); pinch = null; earthPulse = null;
    said = null; flash = null; sparkle = null;
    found = null;
    if (opts.intro?.()) showCard('intro');
    draw(0);
    return true;
  }

  function close() {
    if (!isOpen) return false;
    isOpen = false;
    for (const f of unbind.splice(0)) f();
    if (canvas) { canvas.width = 0; canvas.height = 0; } // frees the pixels
    bar?.dispose();
    bar = null;
    btns.length = 0;
    doneBtn = null;
    card = null; found = null;
    zoom = zoomGoal = 1;
    fingers.clear(); pinch = null;
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
      px += (down(15) ? 1 : 0) - (down(14) ? 1 : 0); // the d-pad pans too (a thumb on the buttons, not the stick)
      py += (down(12) ? 1 : 0) - (down(13) ? 1 : 0);
      const a = down(0); const b = down(1); const x = down(2);
      place();
      if (card && ((a && !pad.a) || (card.kind === 'intro' && x && !pad.x))) { pad.a = a; pad.x = x; cardGo(); return; }
      if (a && !pad.a) tapStar(snapped(), W / 2, H / 2);
      const l1 = down(4); const r1 = down(5);
      if (l1 && !pad.l1) stepZoom(-1);
      if (r1 && !pad.r1) stepZoom(1);
      pad.l1 = l1; pad.r1 = r1;
      if (b && !pad.b) { close(); return; }
      if (x && !pad.x) { hint.ask(); strong = true; opts.onAsk?.(); }
      if (a || b || x || Math.abs(px) + Math.abs(py) > 0.01) last = 'pad';
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
    if (zoom !== zoomGoal) zoom = Math.abs(zoomGoal - zoom) < 0.002 ? zoomGoal : zoom + (zoomGoal - zoom) * Math.min(1, step * 9);
    if (zoom < 1) view.e = fitE(view.e);
    for (const { b, side, kind } of btns) if (kind === 'zoom') { const off = side === 'in' ? zoomGoal >= ZOOM.max : zoomGoal <= ZOOM.min; b.disabled = off; if (b.style) b.style.opacity = off ? '0.4' : '1'; }
    if (found) { found.t += step; if (found.t >= (reducedMotion ? 0.3 : 1.0) && !card) { showCard('found'); opts.onFound?.(); } }
    if (earthPulse) { earthPulse.t += step; if (earthPulse.t > 1.4) earthPulse = null; }
    if (doneBtn) { const show = (solver.bits & STORY_BITS) === STORY_BITS && !found; if (doneBtn.style) doneBtn.style.display = show ? 'block' : 'none'; }
    if (flash) { flash.t += step; if (flash.t > 0.7) flash = null; }
    if (said) { said.t += step; if (said.t > 2.6) said = null; }
    if (sparkle) { sparkle.t += step; if (sparkle.t > 1.6) sparkle = null; }
    const h = hint.tick(step);
    draw(t, h);
  }

  // slide the view to Earth (the story's moment: the Mouse and the Cat are traced)
  function showEarth() {
    found = { t: 0 };
    goal.b0 = view.b; goal.e0 = view.e; goal.b = EARTH_AT.b; goal.e = EARTH_AT.e; goal.t = 0;
  }

  // ---- the written objective (top of the page) ------------------------------------------------------------------------------------
  function objectiveText() {
    const names = (line('moon.scope.names') || '').split('|');
    const near = Math.abs(angleTo(view.b, EARTH_AT.b)) < 14 && Math.abs(view.e - EARTH_AT.e) < 12;
    const o = objectiveOf(solver, PICS, names, near);
    const id = o.id === 'moon.scope.earth' ? `moon.scope.earth.${opts.after?.() ?? 'other'}` : o.id;
    let text = line(id) || '';
    for (const [key, v] of Object.entries(o.vars)) text = text.split(`{${key}}`).join(String(v));
    return text;
  }
  function wrapText(text, maxW, px) {
    const w = (str) => g.measureText?.(str)?.width ?? str.length * px * 0.55;
    const out = [];
    let cur = '';
    for (const word of text.split(' ')) {
      const tryLine = cur ? `${cur} ${word}` : word;
      if (cur && w(tryLine) > maxW) { out.push(cur); cur = word; } else cur = tryLine;
    }
    if (cur) out.push(cur);
    return out;
  }
  // beside the two round buttons when there is room (a tablet, a TV, a laptop), under them on a phone held upright; never over a button
  function drawObjective() {
    objective = objectiveText();
    if (!objective || !g) return;
    const tv = T.tv;
    const size = tv ? Math.round(84 * T.s) : 56;
    const bt = btns[0]?.b?.getBoundingClientRect?.();
    const bw = Math.max(...btns.slice(0, 2).map((x) => x.b?.getBoundingClientRect?.().width || 0), size * 2); // the pills with their words
    const edge = tv ? Math.max(14, Math.round(W * 0.05)) : 14;
    const top = bt && bt.height ? bt.top : (tv ? Math.max(14, Math.round(H * 0.05)) : 14);
    const px = tv ? Math.round(30 * T.s) : (W >= 700 ? 22 : 16);
    const gap = 12;
    const beside = W - 2 * (edge + bw + gap);
    const narrow = beside < px * 20;
    const maxW = narrow ? W - 2 * edge : Math.min(beside, px * 36);
    g.font = `700 ${px}px system-ui, sans-serif`;
    const lines = wrapText(objective, maxW - 2 * px, px);
    const lh = Math.round(px * 1.3);
    const boxH = lines.length * lh + Math.round(px * 0.7);
    const boxW = Math.min(maxW, Math.max(...lines.map((l2) => g.measureText?.(l2)?.width ?? l2.length * px * 0.55)) + 2 * px);
    const cy = narrow ? top + size + 10 + boxH / 2 : top + size / 2;
    const cx = W / 2;
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(8,14,32,.82)'; g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.5;
    const x0 = cx - boxW / 2; const y0 = cy - boxH / 2; const rr = Math.min(boxH / 2, 22);
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, boxW, boxH, rr); else g.rect(x0, y0, boxW, boxH);
    g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center';
    lines.forEach((l2, i) => g.fillText(l2, cx, y0 + Math.round(px * 0.35) + lh * i + px));
  }

  // ---- drawing ---------------------------------------------------------------------------------------------------------------
  function draw(t = 0, hintStar = null) {
    if (!isOpen || !g) return;
    const s = dpr;
    const m = T.m; // 1 off a TV; rings, lines and stars are drawn bigger for the sofa
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
      const grow = found ? 1 + 0.3 * (reducedMotion ? 1 : Math.min(1, found.t / 1.2)) : 1;
      const tw = grow * (earthPulse ? 1 + 0.12 * Math.sin(earthPulse.t * 14) * (1 - earthPulse.t / 1.4) : 1);
      g.beginPath(); g.arc(ex, ey, er * tw, 0, Math.PI * 2); g.fill();
      if (found) { // a ring of sparkles round Earth (still in reduced motion)
        g.fillStyle = '#fff4c2';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + (reducedMotion ? 0 : found.t * 1.5);
          const rr = er * tw * (1.5 + (reducedMotion ? 0 : 0.12 * Math.sin(found.t * 6 + i)));
          g.globalAlpha = 0.9; g.beginPath(); g.arc(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, 3.2 * m, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = 1;
      }
      if (earthPulse) { g.strokeStyle = '#bff0ff'; g.lineWidth = 3 * m; g.globalAlpha = 1 - earthPulse.t / 1.4; g.beginPath(); g.arc(ex, ey, er * (1.2 + earthPulse.t), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
      if ((solver.bits & STORY_BITS) === STORY_BITS) {
        g.strokeStyle = '#9fffe0'; g.lineWidth = 3 * m; g.globalAlpha = reducedMotion ? 1 : 0.6 + 0.4 * Math.sin(t * 3);
        g.beginPath(); g.arc(ex, ey, er * 1.35, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
    }
    // the Great Cat, once all five are traced (faint, behind the pictures)
    if ((solver.bits & 31) === 31) {
      g.strokeStyle = 'rgba(150,200,255,.5)'; g.lineWidth = 2 * m;
      const trace = (pts, close2) => { g.beginPath(); let qx = 0; let qb = 0; pts.forEach(([x, y], i) => { const c = catSky(x, y); qx = i ? qx + angleTo(qb, c.b) * k() : toX(c.b); qb = c.b; (i ? g.lineTo : g.moveTo).call(g, qx, toY(c.e)); }); if (close2) g.closePath(); g.stroke(); };
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
        g.lineWidth = (lit ? 3 : 2.5) * m;
        g.beginPath();
        const upto = guide ? c.pts.length : n;
        const gaps = c.gaps ?? [];
        let qx = 0; let qb = 0;
        for (let i = 0; i < upto; i++) { const sp = starSky(c, i); const link = i && !gaps.includes(i); qx = link ? qx + angleTo(qb, sp.b) * k() : toX(sp.b); qb = sp.b; (link ? g.lineTo : g.moveTo).call(g, qx, toY(sp.e)); }
        for (const [a, b] of c.join ?? []) { if (upto > a && upto > b) { const pa = starSky(c, a); const pb = starSky(c, b); const xa = toX(pa.b); g.moveTo(xa, toY(pa.e)); g.lineTo(xa + angleTo(pa.b, pb.b) * k(), toY(pb.e)); } }
        g.stroke();
      }
      for (let i = 0; i < c.pts.length; i++) {
        const sp = starSky(c, i);
        const x = toX(sp.b); const y = toY(sp.e);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        const pinned = i < n;
        const r = (pinned ? 7 : 5) * spark * m;
        g.fillStyle = pinned ? '#fff4c2' : '#ffe9a8';
        g.globalAlpha = pinned ? 1 : 0.85;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.25;
        g.beginPath(); g.arc(x, y, r * 2.2, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
    });
    // the hint: the next star pulses at once (a steady bright halo in reduced motion); the bulb makes it stronger and draws the line to it
    const prof = profile();
    if (hintStar) {
      const sp = starSky(PICS[hintStar.c], hintStar.i);
      const x = toX(sp.b); const y = toY(sp.e);
      const base = Math.max(14 * m, prof.ring * 0.55);
      const wob = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(pulse * 5);
      const r = base + (strong ? 10 : 6) * m * wob + (reducedMotion ? 3 * m : 0);
      if (strong && hintStar.i > 0) {
        const pv = starSky(PICS[hintStar.c], hintStar.i - 1);
        g.strokeStyle = 'rgba(255,212,90,.85)'; g.lineWidth = 3 * m; g.setLineDash?.([8 * m, 7 * m]);
        g.beginPath(); g.moveTo(toX(pv.b), toY(pv.e)); g.lineTo(toX(pv.b) + angleTo(pv.b, sp.b) * k(), y); g.stroke(); g.setLineDash?.([]);
      }
      g.fillStyle = '#ffd45a'; g.globalAlpha = reducedMotion ? 0.32 : 0.14 + 0.16 * wob;
      g.beginPath(); g.arc(x, y, r * 1.25, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = '#ffd45a'; g.lineWidth = (strong ? 4 : 3) * m;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    // the wrong star: a grey ring that fades
    if (flash) {
      const sp = starSky(PICS[flash.c], flash.i);
      g.strokeStyle = `rgba(190,190,205,${(1 - flash.t / 0.7) * 0.8})`; g.lineWidth = 3 * m;
      g.beginPath(); g.arc(toX(sp.b), toY(sp.e), (12 + flash.t * 14) * m, 0, Math.PI * 2); g.stroke();
    }
    // the reticle (always: it is what the pad and the locked mouse aim with, and a tap inside it takes the star in it): its radius is the ring
    const sn = snapped();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(2, prof.ring / 14) * (T.tv ? 1 : 1);
    g.beginPath(); g.arc(W / 2, H / 2, prof.ring, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.5; g.beginPath(); g.moveTo(W / 2 - 6, H / 2); g.lineTo(W / 2 + 6, H / 2); g.moveTo(W / 2, H / 2 - 6); g.lineTo(W / 2, H / 2 + 6); g.stroke(); g.globalAlpha = 1;
    if (sn) { g.strokeStyle = '#9fffe0'; g.beginPath(); g.arc(sn.x, sn.y, prof.star + 9 * m, 0, Math.PI * 2); g.stroke(); }
    drawObjective(prof);
    // the one line of words
    if (said?.text && card?.kind !== 'found') {
      const px = T.tv ? Math.round(30 * T.s) : 22; // 30 px at 1080p on a TV (the floor is 24)
      g.font = `600 ${px}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(230,240,255,.95)';
      g.globalAlpha = Math.min(1, (2.6 - said.t) * 2);
      // on a TV the line sits above the safe margin and the pad's button bar
      const lift = doneBtn?.style?.display === 'block' ? (T.tv ? Math.round(84 * T.s) : 56) + 22 : 0;
      g.fillText(said.text, W / 2, T.tv ? H - Math.round(H * 0.05) - (bar?.height() ?? 0) - px - lift : H - 46 - lift);
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
    get card() { return card?.kind ?? null; },
    get zoom() { return zoom; },
    setZoom, stepZoom, cardGo,
    get objective() { return objective; },
    get profile() { return profile(); },
    place, tap: (x, y, kind = 'touch') => tapStar(tapAt(x, y, kind), x, y),
    pinSnapped: () => tapStar(snapped(), W / 2, H / 2),
    dispose: close,
    WINDOW,
  };
}
