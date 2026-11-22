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

// Select: next option, wrapping; no native list opens.
export function cycleSelect(el) {
  const n = el.options.length;
  for (let i = 1; i < n; i++) {
    const at = (el.selectedIndex + i) % n;
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

const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const middle = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function createNav({ doc, back, onActive }) {
  let cache = null; // { layer, list }
  let last = null; // centre of the last focused element
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
  const focusEl = (el) => {
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    last = middle(rectOf(el));
  };
  const entry = (list) => {
    const el = list.find((e) => e.hasAttribute('data-pad-default')) ?? list.find((e) => e.classList.contains('primary')) ?? list[0];
    if (!el) return false;
    focusEl(el);
    return true;
  };
  const current = (list) => (list.includes(doc.activeElement) ? doc.activeElement : null);

  return {
    step(dir) {
      if (!dir) return false;
      onActive?.();
      const { list } = view();
      if (!list.length) return false;
      const cur = current(list);
      if (!cur) {
        if (!last) return entry(list);
        focusEl(list[nearestTo(last, list.map((e, id) => ({ id, rect: rectOf(e) })))]);
        return true;
      }
      const from = rectOf(cur);
      last = middle(from);
      const id = pickNext(from, list.map((e, i) => ({ id: i, rect: rectOf(e) })), dir);
      if (id === null) return false;
      focusEl(list[id]);
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
      return cur && cur.type === 'range' ? nudgeRange(cur, dir) : false;
    },
    enter() {
      onActive?.();
      const { list } = view();
      return current(list) ? false : entry(list);
    },
    destroy() { mo?.disconnect?.(); cache = null; },
    scroll(dx, dy) {
      if (!dx && !dy) return false;
      onActive?.();
      const { layer, list } = view();
      const cur = current(list);
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
