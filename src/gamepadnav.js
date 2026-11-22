// Pad navigator, DOM glue (spec: docs/superpowers/specs/2026-11-21-gamepad-menus-design.md).
// Part 1: which layer owns the pad, and what in it can take focus. Part 2: the
// navigator (move, press, sliders, selects, scroll). The pure direction pick
// lives in gamepadnavcore.js.

import { pickNext, nearestTo } from './gamepadnavcore.js';

const LAYER = '[data-pad-layer]';
const OFF = '.hidden, [hidden], [inert]';
const FOCUSABLE = 'button, a[href], [role=button], [tabindex], summary, input[type=checkbox], input[type=radio], input[type=range], select';
const TEXTY = new Set(['input', 'textarea']);

const shown = (el) => !el.closest(OFF);

// "Last in DOM order" is safe only because home cards exclude each other (root.after inserts at the front).
// The last visible [data-pad-layer] in DOM order; else #overlay (the pause card
// and walk summaries) when it holds something; else the home base root.
export function topLayer(doc) {
  const layers = [...doc.querySelectorAll(LAYER)];
  for (let i = layers.length - 1; i >= 0; i--) if (shown(layers[i])) return layers[i];
  const overlay = doc.getElementById('overlay');
  if (overlay && shown(overlay) && overlay.children.length) return overlay;
  return doc.getElementById('homebase');
}

// Visible, enabled things inside `layer` the pad can land on, in DOM order.
export function candidates(layer) {
  return [...layer.querySelectorAll(FOCUSABLE)].filter((el) => {
    const tag = el.tagName.toLowerCase();
    if (TEXTY.has(tag) && !/^(checkbox|radio|range)$/.test(el.type)) return false;
    if (el.disabled || el.hasAttribute('disabled') || !shown(el)) return false;
    const ti = el.getAttribute('tabindex');
    if (ti !== null && Number(ti) < 0) return false; // spec: tabindex >= 0
    return true;
  });
}

const fire = (el, type, init) => {
  const view = el.ownerDocument?.defaultView ?? globalThis;
  el.dispatchEvent(new view[init ? 'KeyboardEvent' : 'Event'](type, { bubbles: true, ...init }));
};

// Range: one `step` left or right, clamped; input and change both fire.
export function nudgeRange(el, dir) {
  const step = Number(el.step) || 1;
  const min = el.min === '' || el.min == null ? 0 : Number(el.min);
  const max = el.max === '' || el.max == null ? 100 : Number(el.max);
  const dp = (String(step).split('.')[1] || '').length;
  const v = Math.min(max, Math.max(min, Number(el.value) + (dir === 'right' ? step : -step)));
  const next = Number(v.toFixed(dp));
  if (next === Number(el.value)) return false;
  el.value = String(next);
  fire(el, 'input');
  fire(el, 'change');
  return true;
}

// Select: next option (dir 1) or previous (dir -1), wrapping, skipping disabled
// and hidden ones; no native list opens.
export function cycleSelect(el, dir = 1) {
  const n = el.options.length;
  for (let i = 1; i < n; i++) {
    const at = (((el.selectedIndex + dir * i) % n) + n) % n;
    const o = el.options[at];
    if (o.disabled || o.hidden) continue;
    el.selectedIndex = at;
    fire(el, 'change');
    return true;
  }
  return false;
}

// HTML elements click once; SVG / role=button nodes have no click(), so they
// get the Enter keydown+keyup the map's own handler listens for.
export function activate(el) {
  if (el.tagName.toLowerCase() === 'select') return cycleSelect(el);
  if (typeof el.click === 'function') el.click();
  else { fire(el, 'keydown', { key: 'Enter', code: 'Enter' }); fire(el, 'keyup', { key: 'Enter', code: 'Enter' }); }
  return true;
}

// The world map (src/ui/mappan.js) registers its api while it is attached, so
// the pad can pan and zoom it and recentre it on a place it hops to.
let map = null;
export function registerMap(api) { map = api || null; }

const placeCentre = (el) => {
  const x = Number(el.getAttribute?.('data-x'));
  const y = Number(el.getAttribute?.('data-y'));
  return el.hasAttribute?.('data-dr-map-place') && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};
// A place off-screen after a pad hop: centre the view on it, through api.pan
// (not onFocusIn, whose :focus-visible test a scripted focus() often fails).
function recentre(api, el) {
  const c = placeCentre(el);
  const v = api.view;
  if (!c || !v) return;
  if (c.x >= v.x && c.x <= v.x + v.w && c.y >= v.y && c.y <= v.y + v.h) return;
  const s = api.scale?.() ?? 1;
  api.pan((c.x - (v.x + v.w / 2)) * s, (c.y - (v.y + v.h / 2)) * s);
}

const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const middle = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function createNav({ doc, back, onActive }) {
  let cache = null; // { layer, list }
  let last = null; // centre of the last focused element
  let mem = null; // { layer, list, el } the pad last focused in
  const MO = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const root = doc.documentElement ?? doc.body;
  const mo = MO && root ? new MO(() => { cache = null; }) : null;
  mo?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'inert', 'disabled', 'tabindex', 'style'] });

  const view = () => {
    const layer = topLayer(doc);
    if (!layer) return { layer, list: [] };
    if (!cache || cache.layer !== layer) cache = { layer, list: candidates(layer) };
    if (!mo) { const list = cache.list; cache = null; return { layer, list }; }
    return cache;
  };
  const focusEl = (el, layer, list) => {
    el.focus({ preventScroll: true });
    mem = { layer, list, el };
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    last = middle(rectOf(el));
    if (map) recentre(map, el);
  };
  const entry = (layer, list) => {
    const el = list.find((e) => e.hasAttribute('data-pad-default')) ?? list.find((e) => e.classList.contains('primary')) ?? list[0];
    if (!el) return false;
    focusEl(el, layer, list);
    return true;
  };
  const current = (list) => (list.includes(doc.activeElement) ? doc.activeElement : null);
  // Nothing focused: a different screen (new top layer, or the old controls all gone)
  // starts at its entry control; a re-render of the same screen keeps the place.
  const isNewScreen = (layer, list) => !mem || mem.layer !== layer || (!list.includes(mem.el) && !mem.list.some((e) => list.includes(e)));
  const isText = () => {
    const a = doc.activeElement;
    const tag = a?.tagName?.toLowerCase();
    return !!a && (tag === 'textarea' || (tag === 'input' && !/^(checkbox|radio|range|button|submit)$/.test(a.type)));
  };

  return {
    step(dir) {
      if (!dir) return false;
      onActive?.();
      const { layer, list } = view();
      if (!list.length) return false;
      const cur = current(list);
      if (!cur) {
        if (!last || isNewScreen(layer, list)) return entry(layer, list);
        focusEl(list[nearestTo(last, list.map((e, id) => ({ id, rect: rectOf(e) })))], layer, list);
        return true;
      }
      const from = rectOf(cur);
      last = middle(from);
      const id = pickNext(from, list.map((e, i) => ({ id: i, rect: rectOf(e) })), dir);
      if (id === null) return false;
      focusEl(list[id], layer, list);
      return true;
    },
    press() {
      onActive?.();
      const cur = current(view().list);
      return cur ? activate(cur) : false;
    },
    alt(dir) {
      onActive?.();
      const cur = current(view().list);
      if (!cur) return false;
      if (cur.type === 'range') return nudgeRange(cur, dir);
      if (cur.tagName?.toLowerCase() === 'select') return cycleSelect(cur, dir === 'left' ? -1 : 1);
      return false;
    },
    enter() {
      onActive?.();
      if (isText()) return false; // someone is typing a name or a code: do not steal it
      const { layer, list } = view();
      if (current(list)) return false;
      if (last && !isNewScreen(layer, list)) {
        focusEl(list[nearestTo(last, list.map((e, id) => ({ id, rect: rectOf(e) })))], layer, list);
        return true;
      }
      return entry(layer, list);
    },
    destroy() { mo?.disconnect?.(); cache = null; },
    zoom(dir) {
      if (!map) return false;
      onActive?.();
      map.zoom(dir);
      return true;
    },
    scroll(dx, dy) {
      if (!dx && !dy) return false;
      onActive?.();
      const { layer, list } = view();
      const cur = current(list);
      if (map && cur?.closest?.('.wm-frame')) { map.pan(dx, dy); return true; }
      const win = doc.defaultView;
      const cs = win?.getComputedStyle?.bind(win);
      const real = (o) => !cs || /auto|scroll/.test(o);
      const test = (n) => {
        const st = cs ? cs(n) : {};
        return { x: dx && n.scrollWidth > n.clientWidth && real(st.overflowX || ''), y: dy && n.scrollHeight > n.clientHeight && real(st.overflowY || '') };
      };
      for (let n = cur ? cur.parentElement : layer; n; n = n.parentElement) {
        const { x, y } = test(n);
        if (x || y) { n.scrollBy({ left: x ? dx : 0, top: y ? dy : 0 }); return true; }
      }
      const root = doc.scrollingElement ?? doc.documentElement;
      if (root) {
        const x = dx && root.scrollWidth > root.clientWidth;
        const y = dy && root.scrollHeight > root.clientHeight;
        if (x || y) { (root.scrollBy ?? win.scrollBy).call(root.scrollBy ? root : win, { left: x ? dx : 0, top: y ? dy : 0 }); return true; }
      }
      return false;
    },
  };
}
