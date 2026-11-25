// =============================================================================
// THE MOON'S STAMPS AND THEIR PAGES (milestone 6). Three stamps, a paw, a star and a heart: drawn as shapes (so the same picture is the button,
// the postcard, and the lights on Earth's night side), the Message Desk's picker (three big picture buttons) and the binoculars' view of Earth.
// Both pages are DOM overlays made when they are opened and gone when they close (the canvas freed), like the telescope's (world/moonscope.js).
// Touch: tap a picture. Pad: left and right (stick or d-pad) to choose, A to pick, B to close; a bar names the buttons while the pad is the last input; on a TV everything is bigger. Keyboard: 1 2 3, or the arrows and Enter, Esc to close.
// Where there is no document every function does nothing. No random number, no clock. Words come from the life (`line`).
// =============================================================================

import { paintEarth, paintReplyLights } from './moonsky.js';
import { tvScale, safeEdge, makeHintBar } from './moontv.js';

export const STAMP_NAMES = Object.freeze(['paw', 'star', 'heart']);
export const STAMP_COLORS = Object.freeze(['#3fb58f', '#f0c43c', '#e0607a']);
export const STAMP_EMOJI = Object.freeze(['🐾', '⭐', '❤️']);
const TAU = Math.PI * 2;

// The outline of a stamp as a path on a context, centred at (cx, cy), `s` the half-size in pixels.
export function stampPath(g, id, cx, cy, s) {
  g.beginPath();
  if (id === 1) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? s : s * 0.46;
      if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
  } else if (id === 2) {
    g.moveTo(cx, cy + s * 0.92);
    g.bezierCurveTo(cx - s * 1.25, cy + s * 0.1, cx - s * 0.7, cy - s * 0.95, cx, cy - s * 0.32);
    g.bezierCurveTo(cx + s * 0.7, cy - s * 0.95, cx + s * 1.25, cy + s * 0.1, cx, cy + s * 0.92);
    g.closePath();
  } else {
    // a paw: a big pad and four toes
    g.ellipse(cx, cy + s * 0.34, s * 0.52, s * 0.44, 0, 0, TAU);
    for (const [dx, dy, r] of [[-0.66, -0.12, 0.21], [-0.23, -0.55, 0.22], [0.23, -0.55, 0.22], [0.66, -0.12, 0.21]]) {
      g.moveTo(cx + (dx + r) * s, cy + dy * s);
      g.arc(cx + dx * s, cy + dy * s, r * s, 0, TAU);
    }
  }
}

// A stamp drawn filled in its own colour (the button and the postcard).
export function drawStamp(g, id, cx, cy, s, color = STAMP_COLORS[id] ?? '#fff') {
  if (!g) return;
  stampPath(g, id, cx, cy, s);
  g.fillStyle = color;
  g.fill();
}

// The stamp in LIGHTS: a soft warm glow of the shape at `level` (0..1) with bright dots at its points, as a city seen from space. Drawn on Earth's night side.
export function drawStampLights(g, id, cx, cy, s, level) {
  if (!g || !(level > 0)) return;
  g.save();
  g.globalAlpha = Math.min(1, level);
  stampPath(g, id, cx, cy, s);
  g.fillStyle = 'rgba(255,214,120,.55)';
  g.fill();
  g.lineWidth = Math.max(1, s * 0.05);
  g.strokeStyle = 'rgba(255,240,190,.95)';
  g.stroke();
  g.restore();
}

// ---- the page's building blocks -------------------------------------------------------------------------------------------------------------

const BTN_CSS = { position: 'absolute', border: '3px solid rgba(255,255,255,.55)', background: 'rgba(20,30,52,.82)', color: '#fff', cursor: 'pointer', touchAction: 'manipulation', padding: '0' };
const roundBtn = (doc, root, text, label, side, fn, T = { tv: false, s: 1 }) => {
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.setAttribute?.('aria-label', label);
  const size = T.tv ? Math.round(84 * T.s) : 56; // on a TV: bigger, and inside the 5 % safe margin
  Object.assign(b.style ?? {}, BTN_CSS, { top: safeEdge(T.tv, 'top'), [side]: safeEdge(T.tv, 'side'), width: `${size}px`, height: `${size}px`, borderRadius: '50%', fontSize: `${Math.round(size * 0.46)}px`, lineHeight: '1' });
  b.addEventListener?.('click', (e) => { e.stopPropagation?.(); fn(); });
  b.addEventListener?.('pointerdown', (e) => e.stopPropagation?.());
  root.appendChild(b);
  return b;
};
const padsNow = () => { try { return Array.from(globalThis.navigator?.getGamepads?.() ?? []).filter((p) => p && p.connected); } catch { return []; } };

// ---- the Message Desk's picker ------------------------------------------------------------------------------------------------------------------

// createStampPicker({ doc, win, line, pads, selected, onPick(id), onClose() }) -> { open(), close(), update(dt), isOpen, focus, pick(id) }
// The three pictures are the whole page, plus the one line "Pick a stamp for your postcard." and a round close button. No fail state.
export function createStampPicker(opts) {
  const { doc, win } = opts;
  const line = opts.line ?? (() => '');
  const pads = opts.pads ?? padsNow;
  let root = null;
  let bar = null;
  let isOpen = false;
  let focus = Math.max(0, opts.selected ?? 0);
  const btns = [];
  const unbind = [];
  const pad = { a: true, b: true, l: true, r: true };
  const on = (target, type, fn, cap) => { target?.addEventListener?.(type, fn, cap); unbind.push(() => target?.removeEventListener?.(type, fn, cap)); };

  function mark() {
    btns.forEach((b, i) => { if (b?.style) { b.style.borderColor = i === focus ? '#ffd45a' : 'rgba(255,255,255,.55)'; b.style.transform = i === focus ? 'scale(1.08)' : 'scale(1)'; } });
  }
  function pick(id) {
    if (!isOpen || !(id >= 0 && id < STAMP_NAMES.length)) return false;
    focus = id;
    opts.onPick?.(id);
    close();
    return true;
  }
  function onKeyDown(e) {
    if (!isOpen) return;
    const code = e.code ?? e.key;
    let used = true;
    if (code === 'Digit1' || code === 'Numpad1') pick(0);
    else if (code === 'Digit2' || code === 'Numpad2') pick(1);
    else if (code === 'Digit3' || code === 'Numpad3') pick(2);
    else if (code === 'ArrowLeft' || code === 'KeyA') { focus = (focus + STAMP_NAMES.length - 1) % STAMP_NAMES.length; mark(); }
    else if (code === 'ArrowRight' || code === 'KeyD') { focus = (focus + 1) % STAMP_NAMES.length; mark(); }
    else if (code === 'Enter' || code === 'Space' || code === 'KeyE') pick(focus);
    else if (code === 'Escape' || code === 'Backspace' || code === 'KeyQ') close();
    else used = false;
    if (used) { e.preventDefault?.(); e.stopImmediatePropagation?.(); e.stopPropagation?.(); }
  }

  function open() {
    if (isOpen || !doc?.body) return false;
    const T = tvScale(doc, win); // the couch size: 1 off a TV
    const ts = T.tv ? T.s : 1;
    root = doc.createElement('div');
    root.className = 'moon-stamps';
    root.setAttribute?.('role', 'dialog');
    Object.assign(root.style ?? {}, { position: 'fixed', inset: '0', zIndex: '90', background: T.tv ? 'rgba(2,4,10,.94)' : 'rgba(2,4,10,.62)', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: `${Math.round((T.tv ? 36 : 22) * ts)}px` });
    const head = doc.createElement('div');
    head.textContent = line('moon.stamp.ask');
    Object.assign(head.style ?? {}, { color: '#fff', fontSize: `${Math.round((T.tv ? 36 : 24) * ts)}px`, fontWeight: '700', textAlign: 'center', padding: '0 20px', textShadow: '0 2px 6px rgba(0,0,0,.7)' });
    root.appendChild(head);
    const row = doc.createElement('div');
    Object.assign(row.style ?? {}, { display: 'flex', gap: `${Math.round((T.tv ? 32 : 18) * ts)}px`, justifyContent: 'center', flexWrap: 'wrap' });
    root.appendChild(row);
    btns.length = 0;
    STAMP_NAMES.forEach((name, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.setAttribute?.('aria-label', line(`moon.stamp.${name}`));
      const box = Math.round((T.tv ? 200 : 120) * ts); // a stamp's button: 120 px, on a TV 200 (400 at 4K)
      const pic = Math.round(box * 0.8);
      Object.assign(b.style ?? {}, BTN_CSS, { position: 'relative', width: `${box}px`, height: `${box}px`, borderRadius: `${Math.round(box / 5)}px`, borderWidth: T.tv ? `${Math.round(5 * ts)}px` : '3px' });
      const c = doc.createElement('canvas');
      c.width = c.height = pic;
      Object.assign(c.style ?? {}, { width: `${pic}px`, height: `${pic}px`, pointerEvents: 'none' });
      drawStamp(c.getContext?.('2d'), i, pic / 2, pic * 0.52, pic * 0.375);
      b.appendChild(c);
      b.addEventListener?.('click', (e) => { e.stopPropagation?.(); pick(i); });
      b.addEventListener?.('pointerdown', (e) => e.stopPropagation?.());
      row.appendChild(b);
      btns.push(b);
    });
    roundBtn(doc, root, '✕', line('moon.stamp.close'), 'right', () => close(), T);
    bar = makeHintBar({ doc, root, text: line('moon.pad.stamp'), scale: T });
    doc.body.appendChild(root);
    on(win, 'keydown', onKeyDown, true);
    isOpen = true;
    const p = pads()[0];
    pad.a = !!p?.buttons?.[0]?.pressed; // a press that opened the page is not a pick: it waits to be let go
    pad.b = true;
    pad.l = pad.r = true;
    mark();
    return true;
  }

  function close() {
    if (!isOpen) return false;
    isOpen = false;
    for (const f of unbind.splice(0)) f();
    bar?.dispose();
    bar = null;
    root?.remove?.();
    root = null;
    btns.length = 0;
    opts.onClose?.();
    return true;
  }

  function update() {
    if (!isOpen) return;
    const p = pads()[0];
    if (!p) return;
    const down = (i) => !!p.buttons?.[i]?.pressed;
    const ax = p.axes?.[0] ?? 0;
    const l = down(14) || ax < -0.5;
    const r = down(15) || ax > 0.5;
    const a = down(0);
    const b = down(1);
    if (l && !pad.l) { focus = (focus + STAMP_NAMES.length - 1) % STAMP_NAMES.length; mark(); }
    if (r && !pad.r) { focus = (focus + 1) % STAMP_NAMES.length; mark(); }
    const wasA = pad.a;
    const wasB = pad.b;
    pad.l = l; pad.r = r; pad.a = a; pad.b = b;
    if (b && !wasB) { close(); return; }
    if (a && !wasA) pick(focus);
  }

  return { open, close, update, pick, get isOpen() { return isOpen; }, get focus() { return focus; }, get buttons() { return btns.slice(); } };
}

// ---- the binoculars: Earth up close ----------------------------------------------------------------------------------------------------------------

// createEarthView({ doc, win, line, pads, stamp, reducedMotion, onClose }) -> { open(), close(), update(dt, t), isOpen, setStamp(id) }
// A full page of Earth drawn big (the same picture as the sky's). With a stamp (the story is done) her stamp blinks on the night side, gently (under one a
// second), and stays lit in reduced motion. Closing frees the canvas.
export function createEarthView(opts) {
  const { doc, win } = opts;
  const line = opts.line ?? (() => '');
  const pads = opts.pads ?? padsNow;
  let root = null;
  let canvas = null;
  let isOpen = false;
  let bar = null;
  let stamp = opts.stamp ?? -1;
  let drawn = -1;
  const unbind = [];
  const pad = { a: true, b: true };
  const on = (target, type, fn, cap) => { target?.addEventListener?.(type, fn, cap); unbind.push(() => target?.removeEventListener?.(type, fn, cap)); };
  function onKeyDown(e) {
    if (!isOpen) return;
    const code = e.code ?? e.key;
    if (code === 'Escape' || code === 'Backspace' || code === 'KeyE' || code === 'KeyQ' || code === 'Space' || code === 'Enter') { e.preventDefault?.(); e.stopImmediatePropagation?.(); e.stopPropagation?.(); close(); }
  }
  function layout() {
    if (!canvas) return;
    const side = Math.max(64, Math.round(Math.min(win?.innerWidth ?? 960, win?.innerHeight ?? 540)));
    if (canvas.width !== side) { canvas.width = canvas.height = side; drawn = -1; }
  }
  function open() {
    if (isOpen || !doc?.body) return false;
    root = doc.createElement('div');
    root.className = 'moon-earthview';
    root.setAttribute?.('role', 'dialog');
    Object.assign(root.style ?? {}, { position: 'fixed', inset: '0', zIndex: '90', background: '#02040a', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' });
    canvas = doc.createElement('canvas');
    Object.assign(canvas.style ?? {}, { maxWidth: '100%', maxHeight: '100%' });
    root.appendChild(canvas);
    const T = tvScale(doc, win);
    roundBtn(doc, root, '✕', line('moon.binoc.close'), 'right', () => close(), T);
    bar = makeHintBar({ doc, root, text: line('moon.pad.binoc'), scale: T });
    doc.body.appendChild(root);
    on(win, 'keydown', onKeyDown, true);
    on(win, 'resize', layout);
    isOpen = true;
    pad.b = true;
    pad.a = !!pads()[0]?.buttons?.[0]?.pressed; // a press that opened the page is not a close: it waits to be let go
    layout();
    draw(0);
    return true;
  }
  function draw(t) {
    if (!canvas) return;
    // her stamp blinks on and off slowly (a cycle of about 2.4 s: far under 3 a second); steady in reduced motion
    const level = stamp < 0 ? 0 : opts.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin((t * TAU) / 2.4 - 1.2);
    const key = stamp < 0 ? 0 : Math.round(level * 20) + 1;
    if (key === drawn) return;
    drawn = key;
    if (paintEarth(canvas)) paintReplyLights(canvas, stamp, level);
  }
  function close() {
    if (!isOpen) return false;
    isOpen = false;
    for (const f of unbind.splice(0)) f();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    bar?.dispose();
    bar = null;
    root?.remove?.();
    root = canvas = null;
    opts.onClose?.();
    return true;
  }
  function update(dt, t = 0) {
    if (!isOpen) return;
    const p = pads()[0];
    if (p) { // Circle (B) or Cross (A) closes, as Esc and Space do
      const b = !!p.buttons?.[1]?.pressed; const a = !!p.buttons?.[0]?.pressed;
      const was = pad.a || pad.b;
      pad.a = a; pad.b = b;
      if ((a || b) && !was) { close(); return; }
    }
    draw(t);
  }
  return { open, close, update, setStamp(id) { stamp = id; drawn = -1; }, get isOpen() { return isOpen; } };
}
