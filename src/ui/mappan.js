// The world map's pan and pinch (Change place). The map is one SVG drawn once
// per render; panning and zooming only rewrite its viewBox, so an older iPad
// never redraws a place.
//
// A view is { x, y, w, h } in board units with the map box's own shape, so
// its scale (screen px per board unit) is box.w / view.w. The scale never
// drops below the floor at which the smallest tap target (the island's star,
// 92 units across) is still MIN_TARGET_PX across, nor below the scale that
// fits the whole world; it never rises above MAX_ZOOM times that floor. On a
// phone the floor shows about half the world's width, so the map opens zoomed
// in round today's place; an iPad or a desktop fits the whole world.
//
// The limits are WORLD_VIEW (0 -20 1500 900), the drawn box, not the bare
// 1500 x 880 world: her Moor's rough edge reaches above y 0 and is never cut
// off. A world without x/y starts at 0 0.
//
// Zooming is instant (no animation), so reduced motion needs nothing more.
import { WORLD_VIEW } from './territorymap.js';

export const MIN_TARGET_PX = 44;
export const DRAG_PX = 8;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

// A trackpad pinch (a wheel with ctrlKey): zoom by e^(-deltaY / 100).
const WHEEL_RATE = 0.01;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const ox = (world) => world.x ?? 0;
const oy = (world) => world.y ?? 0;
const fitScale = (world, box) => Math.min(box.w / world.w, box.h / world.h);
const floorScale = (world, box, minScale) => Math.max(fitScale(world, box), minScale);
const finite = (v) => v && [v.x, v.y, v.w, v.h].every(Number.isFinite) && v.w > 0 && v.h > 0;
const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

// Screen px per board unit at which the smallest target (2 r across) is minPx.
export function minScaleFor(targets, minPx = MIN_TARGET_PX) {
  const smallest = Math.min(...targets.map((t) => 2 * t.r));
  return Number.isFinite(smallest) && smallest > 0 ? minPx / smallest : 0;
}

// One axis: a side no longer than the world stays inside it; a longer side is
// centred on it.
function clampAxis(pos, len, start, size) {
  if (len <= size) return clamp(pos, start, start + size - len);
  return start + (size - len) / 2;
}

export function clampView(view, world) {
  return {
    x: clampAxis(view.x, view.w, ox(world), world.w),
    y: clampAxis(view.y, view.h, oy(world), world.h),
    w: view.w,
    h: view.h,
  };
}

// The view a map opens with: the zoom-out floor, centred on `focus` (today's
// place) as far as the world's edges allow.
export function startView(world, box, focus, minScale) {
  const scale = floorScale(world, box, minScale);
  const w = box.w / scale;
  const h = box.h / scale;
  return clampView({ x: focus[0] - w / 2, y: focus[1] - h / 2, w, h }, world);
}

// A finger moving right moves the view left.
export function panView(view, dxPx, dyPx, box, world) {
  const scale = box.w / view.w;
  return clampView({ x: view.x - dxPx / scale, y: view.y - dyPx / scale, w: view.w, h: view.h }, world);
}

// Zoom by `factor` about the box point [px, py]: the board point under it
// stays under it, within the scale limits.
export function zoomView(view, factor, [px, py], box, world, minScale) {
  const scale = box.w / view.w;
  const lo = floorScale(world, box, minScale);
  const next = clamp(scale * factor, lo, MAX_ZOOM * lo);
  const bx = view.x + px / scale;
  const by = view.y + py / scale;
  return clampView({ x: bx - px / next, y: by - py / next, w: box.w / next, h: box.h / next }, world);
}

const r1 = (v) => {
  const n = Math.round(v * 10) / 10;
  return Object.is(n, -0) ? 0 : n;
};
export function viewBoxAttr(view) {
  return `${r1(view.x)} ${r1(view.y)} ${r1(view.w)} ${r1(view.h)}`;
}

// A view kept from an earlier render, made to fit this box: kept as it is
// when it already has the box's shape and a scale within the limits, else
// refitted round its centre. `from` is the box the view was shaped for, when
// known (a turned phone or iPad): then her zoom is kept, how far in from the
// floor she was, so a map at its floor (an iPad's whole world) stays at the
// new box's floor. Without it the scale is the view's width in this box.
const shapedFor = (view, box) => Math.abs(view.w * box.h - view.h * box.w) <= 1e-6 * view.w * box.h;
function refit(view, box, world, minScale, from = null) {
  const lo = floorScale(world, box, minScale);
  let scale = box.w / view.w;
  if (shapedFor(view, box) && scale >= lo - 1e-9 && scale <= MAX_ZOOM * lo + 1e-9) return clampView(view, world);
  if (from && from.w > 0 && from.h > 0 && shapedFor(view, from)) {
    scale = lo * ((from.w / view.w) / floorScale(world, from, minScale));
  }
  const s = clamp(scale, lo, MAX_ZOOM * lo);
  const w = box.w / s;
  const h = box.h / s;
  return clampView({ x: view.x + view.w / 2 - w / 2, y: view.y + view.h / 2 - h / 2, w, h }, world);
}

// Wires the map in `frame` (.wm-frame, holding svg.world-map and the
// [data-wm-zoom] buttons). Null when there is no map, or it has no size yet.
export function attachMapPan(frame, { world = WORLD_VIEW, targets = [], focus = null, view = null, onView = () => {} } = {}) {
  const svg = frame?.querySelector?.('svg.world-map');
  if (!svg) return null;
  const readBox = () => {
    const r = svg.getBoundingClientRect?.();
    return r && r.width > 0 && r.height > 0 ? { left: r.left ?? 0, top: r.top ?? 0, w: r.width, h: r.height } : null;
  };
  const box0 = readBox();
  if (!box0) return null;
  const minScale = minScaleFor(targets);

  const api = { view: null, detach };
  const show = (v) => {
    api.view = v;
    svg.setAttribute?.('viewBox', viewBoxAttr(v));
  };
  const change = (v) => {
    if (same(v, api.view)) return;
    show(v);
    onView(v);
  };
  const at = focus ?? [ox(world) + world.w / 2, oy(world) + world.h / 2];
  show(finite(view) ? refit(view, box0, world, minScale) : startView(world, box0, at, minScale));

  // Pointers down on the map, by id; the box is read once per gesture.
  const pointers = new Map();
  let box = box0;
  let start = null; // where the first pointer went down
  let dragging = false; // moved past DRAG_PX, or a second finger: not a tap
  let swallow = false; // stop the click that ends a drag
  let pinch = null; // { dist, mid } of the two fingers at the last move

  const capture = (id) => {
    try { svg.setPointerCapture?.(id); } catch { /* the pointer has gone */ }
  };
  const beginDrag = () => {
    dragging = true;
    swallow = true;
    for (const id of pointers.keys()) capture(id);
  };
  const twoFingers = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
  };

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
    if (pointers.size === 0) {
      dragging = false;
      swallow = false;
      const was = box;
      box = readBox() ?? box;
      // the box may have changed shape since the last gesture (rotation)
      change(refit(api.view, box, world, minScale, was));
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) start = { x: e.clientX, y: e.clientY };
    if (pointers.size >= 2) {
      pinch = twoFingers();
      beginDrag();
    }
  }

  function onMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, p);
    if (pointers.size >= 2) {
      const now = twoFingers();
      if (pinch && pinch.dist > 0 && now.dist > 0) {
        // the board point under the old midpoint follows it to the new one,
        // then the zoom is about the new midpoint
        let v = panView(api.view, now.mid[0] - pinch.mid[0], now.mid[1] - pinch.mid[1], box, world);
        v = zoomView(v, now.dist / pinch.dist, [now.mid[0] - box.left, now.mid[1] - box.top], box, world, minScale);
        change(v);
      }
      pinch = now;
      return;
    }
    let from = prev;
    if (!dragging) {
      if (!start || Math.hypot(p.x - start.x, p.y - start.y) <= DRAG_PX) return;
      beginDrag();
      from = start;
    }
    change(panView(api.view, p.x - from.x, p.y - from.y, box, world));
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
  }

  function onCancel(e) {
    onUp(e);
    swallow = false; // a cancelled pointer gets no click
  }

  function onClick(e) {
    if (!swallow) return;
    swallow = false;
    e.preventDefault?.();
    e.stopPropagation?.();
  }

  function onWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault?.();
    const b = readBox();
    const dy = Number(e.deltaY);
    if (!b || !Number.isFinite(dy) || dy === 0) return;
    change(zoomView(api.view, Math.exp(-dy * WHEEL_RATE), [e.clientX - b.left, e.clientY - b.top], b, world, minScale));
  }

  function onFrameClick(e) {
    const btn = e.target?.closest?.('[data-wm-zoom]');
    if (!btn) return;
    const dir = btn.dataset?.wmZoom ?? btn.getAttribute?.('data-wm-zoom');
    if (dir !== 'in' && dir !== 'out') return;
    const b = readBox();
    if (!b) return;
    change(zoomView(api.view, dir === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP, [b.w / 2, b.h / 2], b, world, minScale));
  }

  // :focus-visible where the browser knows it; an older one that throws on
  // it counts every focus as visible.
  const focusVisible = (el) => {
    if (typeof el.matches !== 'function') return true;
    try { return el.matches(':focus-visible'); } catch { return true; }
  };

  // A place reached by keyboard but off-screen: centre the view on it. Not
  // for a press: a mouse focuses the place mid-press, and moving the view
  // then would slide the place from under the pointer and lose the click.
  function onFocusIn(e) {
    if (pointers.size > 0) return;
    const el = e.target?.closest?.('[data-dr-map-place]');
    if (!el || !focusVisible(el)) return;
    const x = Number(el.dataset?.x ?? el.getAttribute?.('data-x'));
    const y = Number(el.dataset?.y ?? el.getAttribute?.('data-y'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const v = api.view;
    if (x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h) return;
    change(clampView({ x: x - v.w / 2, y: y - v.h / 2, w: v.w, h: v.h }, world));
  }

  const WHEEL_OPTS = { passive: false };
  const CAPTURE = { capture: true };
  const listeners = [
    [svg, 'pointerdown', onDown, undefined],
    [svg, 'pointermove', onMove, undefined],
    [svg, 'pointerup', onUp, undefined],
    [svg, 'pointercancel', onCancel, undefined],
    [svg, 'click', onClick, CAPTURE],
    [svg, 'wheel', onWheel, WHEEL_OPTS],
    [frame, 'click', onFrameClick, undefined],
    [frame, 'focusin', onFocusIn, undefined],
  ];
  for (const [el, type, fn, opts] of listeners) el.addEventListener?.(type, fn, opts);

  // A rotated phone or iPad: refit the view to the new box, so the floor
  // (44 px targets) and the pan math hold before the next render, at the
  // zoom she had.
  function onResize() {
    const b = readBox();
    if (!b || (b.w === box.w && b.h === box.h)) return;
    const was = box;
    box = { ...b };
    change(refit(api.view, b, world, minScale, was));
  }
  let observer = null;
  let win = null;
  if (typeof globalThis.ResizeObserver === 'function') {
    try {
      observer = new globalThis.ResizeObserver(onResize);
      observer.observe?.(svg);
    } catch { observer = null; }
  }
  if (!observer) {
    win = globalThis.window ?? null;
    win?.addEventListener?.('resize', onResize);
  }

  let attached = true;
  function detach() {
    if (!attached) return;
    attached = false;
    for (const [el, type, fn, opts] of listeners) el.removeEventListener?.(type, fn, opts);
    observer?.disconnect?.();
    win?.removeEventListener?.('resize', onResize);
    pointers.clear();
  }

  return api;
}
