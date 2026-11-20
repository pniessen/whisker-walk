// World map step 2: the map pans and pinch-zooms by its viewBox alone, and
// never zooms out so far that a tap target is under 44 px across.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { WORLD, worldMapModel, tapTargets } from '../src/worldmap.js';
import { WORLD_VIEW } from '../src/ui/territorymap.js';
import {
  MIN_TARGET_PX, DRAG_PX, MAX_ZOOM, ZOOM_STEP,
  minScaleFor, startView, clampView, panView, zoomView, viewBoxAttr, attachMapPan,
} from '../src/ui/mappan.js';

// A plain canon save, as test/worldmap.test.js.
function fresh() {
  return {
    edition: 'canon',
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby' },
    area: 'neighborhood',
  };
}

const targets = tapTargets(worldMapModel(fresh(), CATALOG));
const k = minScaleFor(targets); // 44 / 92
const PHONE = { w: 343, h: 420 };
const scaleOf = (v, box) => box.w / v.w;
const inside = (v, world) => {
  const wx = world.x ?? 0; const wy = world.y ?? 0;
  return v.x >= wx - 1e-9 && v.y >= wy - 1e-9 && v.x + v.w <= wx + world.w + 1e-9 && v.y + v.h <= wy + world.h + 1e-9;
};

it('the constants', () => {
  expect([MIN_TARGET_PX, DRAG_PX, MAX_ZOOM, ZOOM_STEP]).toEqual([44, 8, 4, 1.25]);
});

it('the zoom-out floor keeps the smallest target 44 px across', () => {
  expect(k).toBeCloseTo(44 / 92, 6);
  expect(minScaleFor([{ r: 60 }, { r: 30 }], 48)).toBeCloseTo(48 / 60, 9);
});

it("a phone starts zoomed in round today's place, inside the world", () => {
  const v = startView(WORLD, PHONE, [1080, 470], k); // the phone's map box (CSS: min(62vh, 440px) tall)
  expect(v.w).toBeCloseTo(343 / k, 3);
  expect(v.h).toBeCloseTo(420 / k, 3);
  expect(v.w).toBeGreaterThan(1500 * 0.45); // about half the world's width
  expect(v.w).toBeLessThan(1500 * 0.55);
  expect(v.x).toBeGreaterThanOrEqual(0);
  expect(v.x + v.w).toBeLessThanOrEqual(1500);
  expect(1080 > v.x && 1080 < v.x + v.w).toBe(true);
  expect(v.x + v.w / 2).toBeCloseTo(1080, 6); // centred on it where the edges allow
});

it('an iPad and a desktop see the whole world', () => {
  expect(startView(WORLD, { w: 736, h: 432 }, [843, 566], k)).toMatchObject({ x: 0, w: 1500 });
  expect(startView(WORLD, { w: 1200, h: 704 }, [843, 566], k)).toEqual({ x: 0, y: 0, w: 1500, h: 880 });
});

it("today's place at the world's edge is still in view", () => {
  for (const focus of [[1185, 680], [1060, 230], [308, 199]]) {
    const v = startView(WORLD, PHONE, focus, k);
    expect(v.x >= 0 && v.y >= 0 && v.x + v.w <= 1500 + 1e-9).toBe(true);
    expect(focus[0] >= v.x && focus[0] <= v.x + v.w && focus[1] >= v.y && focus[1] <= v.y + v.h).toBe(true);
  }
});

it("within WORLD_VIEW the view reaches the Moor's top margin and the whole view on a desktop", () => {
  // her Moor's edge reaches about y -7: the view can pan up to y -20
  const top = startView(WORLD_VIEW, PHONE, [308, 0], k);
  expect(top.y).toBeCloseTo(-20, 9);
  expect(inside(top, WORLD_VIEW)).toBe(true);
  const desk = startView(WORLD_VIEW, { w: 1200, h: 720 }, [843, 566], k);
  expect(desk).toEqual({ x: 0, y: -20, w: 1500, h: 900 });
  const far = panView(top, -100000, -100000, PHONE, WORLD_VIEW);
  expect(far.x + far.w).toBeCloseTo(1500, 6);
  expect(far.y + far.h).toBeCloseTo(880, 6);
});

it('clampView keeps a shorter side inside the world and centres a longer one', () => {
  expect(clampView({ x: -50, y: 900, w: 700, h: 800 }, WORLD)).toEqual({ x: 0, y: 80, w: 700, h: 800 });
  expect(clampView({ x: 1200, y: -5, w: 700, h: 300 }, WORLD)).toEqual({ x: 800, y: 0, w: 700, h: 300 });
  expect(clampView({ x: 40, y: 10, w: 1600, h: 1000 }, WORLD)).toEqual({ x: -50, y: -60, w: 1600, h: 1000 });
  expect(clampView({ x: 0, y: -80, w: 700, h: 400 }, WORLD_VIEW)).toEqual({ x: 0, y: -20, w: 700, h: 400 });
});

it('panning moves the view against the finger and stops at the edge', () => {
  const v = startView(WORLD, PHONE, [1080, 470], k);
  const s = scaleOf(v, PHONE);
  const right = panView(v, 100, 0, PHONE, WORLD);
  expect(right.x).toBeCloseTo(v.x - 100 / s, 6);
  expect(right.y).toBeCloseTo(v.y, 9);
  expect(right.w).toBe(v.w);
  // (vertically a phone sees nearly all 900 units of WORLD_VIEW: 22 to spare)
  const tall = startView(WORLD_VIEW, PHONE, [1080, 470], k);
  const down = panView(tall, 0, 5, PHONE, WORLD_VIEW);
  expect(down.y).toBeCloseTo(tall.y - 5 / s, 6);
  expect(panView(tall, 0, 1000, PHONE, WORLD_VIEW).y).toBe(-20);
  const huge = panView(v, 100000, 0, PHONE, WORLD);
  expect(huge.x).toBe(0);
  const other = panView(v, -100000, 0, PHONE, WORLD);
  expect(other.x + other.w).toBeCloseTo(1500, 6);
});

it('zooming keeps the point under the fingers and stops at both limits', () => {
  const v = startView(WORLD, PHONE, [800, 450], k);
  const at = [100, 200];
  const boardAt = (view) => [view.x + at[0] / scaleOf(view, PHONE), view.y + at[1] / scaleOf(view, PHONE)];
  const before = boardAt(v);
  const z = zoomView(v, 2, at, PHONE, WORLD, k);
  expect(scaleOf(z, PHONE)).toBeCloseTo(2 * k, 9);
  expect(z.h).toBeCloseTo(PHONE.h / (2 * k), 6);
  expect(boardAt(z)[0]).toBeCloseTo(before[0], 6);
  expect(boardAt(z)[1]).toBeCloseTo(before[1], 6);
  expect(inside(z, WORLD)).toBe(true);
  // in as far as MAX_ZOOM times the floor, no further
  const most = zoomView(v, 1000, at, PHONE, WORLD, k);
  expect(scaleOf(most, PHONE)).toBeCloseTo(MAX_ZOOM * k, 9);
  // out no further than the floor: the island star stays 44 px
  const least = zoomView(z, 0.001, at, PHONE, WORLD, k);
  expect(scaleOf(least, PHONE)).toBeCloseTo(k, 9);
  expect(92 * scaleOf(least, PHONE)).toBeGreaterThanOrEqual(44 - 1e-9);
  expect(inside(least, WORLD)).toBe(true);
  // on a desktop the floor is the whole world (fit), above 44/92
  const desk = startView(WORLD, { w: 1200, h: 704 }, [843, 566], k);
  expect(zoomView(desk, 0.5, [600, 352], { w: 1200, h: 704 }, WORLD, k)).toEqual(desk);
  expect(scaleOf(zoomView(desk, 100, [600, 352], { w: 1200, h: 704 }, WORLD, k), { w: 1200 })).toBeCloseTo(MAX_ZOOM * 0.8, 9);
});

it('viewBoxAttr rounds to one decimal', () => {
  expect(viewBoxAttr({ x: 1.234, y: 0, w: 717.39, h: 1003.95 })).toBe('1.2 0 717.4 1004');
  expect(viewBoxAttr({ x: -0.01, y: -20, w: 1500, h: 900 })).toBe('0 -20 1500 900');
});

// ---- attachMapPan, with a fake frame and svg ----

function listenerBag() {
  const map = new Map();
  const key = (type, opts) => `${type}|${typeof opts === 'boolean' ? opts : !!opts?.capture}`;
  return {
    map,
    opts: {},
    addEventListener(type, fn, opts) {
      this.opts[type] = opts;
      const kk = key(type, opts);
      if (!map.has(kk)) map.set(kk, new Set());
      map.get(kk).add(fn);
    },
    removeEventListener(type, fn, opts) { map.get(key(type, opts))?.delete(fn); },
    fire(type, ev, capture = false) { for (const fn of [...(map.get(key(type, capture)) ?? [])]) fn(ev); },
    count() { let n = 0; for (const s of map.values()) n += s.size; return n; },
  };
}

function fakeFrame({ width = 343, height = 420, withSvg = true } = {}) {
  const svg = {
    ...listenerBag(),
    attrs: {},
    captured: [],
    size: { width, height },
    getBoundingClientRect() { return { left: 0, top: 0, ...this.size }; },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    setPointerCapture(id) { this.captured.push(id); },
  };
  const frame = {
    ...listenerBag(),
    querySelector: (sel) => (sel === 'svg.world-map' && withSvg ? svg : null),
  };
  return { frame, svg };
}

const parseVB = (s) => { const [x, y, w, h] = s.split(' ').map(Number); return { x, y, w, h }; };
function ev(extra = {}) {
  return {
    pointerId: 1, clientX: 0, clientY: 0,
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    target: { closest: () => null },
    ...extra,
  };
}
// A place element at (x, y); `visible` (if given) is its :focus-visible.
const place = (x, y, visible) => {
  const el = { dataset: { x: String(x), y: String(y) }, getAttribute: (a) => ({ 'data-x': String(x), 'data-y': String(y) })[a] };
  if (visible !== undefined) el.matches = (sel) => (sel === ':focus-visible' ? visible : false);
  return { closest: (sel) => (sel === '[data-dr-map-place]' ? el : null) };
};
const zoomBtn = (dir) => ({ closest: (sel) => (sel === '[data-wm-zoom]' ? { dataset: { wmZoom: dir }, getAttribute: () => dir } : null) });

function attached(opts = {}) {
  const { frame, svg } = fakeFrame(opts.box);
  const onView = vi.fn();
  const pan = attachMapPan(frame, { world: WORLD_VIEW, targets, focus: [1080, 470], onView, ...opts.attach });
  return { frame, svg, onView, pan, vb: () => parseVB(svg.attrs.viewBox) };
}

describe('attachMapPan', () => {
  it('sets the viewBox at once, and keeps a view it is handed', () => {
    const { svg, pan, onView } = attached();
    const start = startView(WORLD_VIEW, PHONE, [1080, 470], k);
    expect(svg.attrs.viewBox).toBe(viewBoxAttr(start));
    expect(pan.view).toEqual(start);
    expect(onView).not.toHaveBeenCalled();

    const kept = { x: 200, y: 100, w: 343 / (2 * k), h: 420 / (2 * k) };
    const again = attached({ attach: { view: kept } });
    expect(again.svg.attrs.viewBox).toBe(viewBoxAttr(kept));
    expect(again.pan.view).toEqual(kept);

    // a kept view that has wandered off the world is clamped back in
    const off = attached({ attach: { view: { ...kept, x: -900 } } });
    expect(off.pan.view.x).toBe(0);
    // a kept view from a wider box is refitted to this box, at the floor at least
    const wide = attached({ attach: { view: { x: 0, y: -20, w: 1500, h: 900 } } });
    expect(scaleOf(wide.pan.view, PHONE)).toBeCloseTo(k, 9);
    expect(wide.pan.view.h).toBeCloseTo(420 / k, 6);
  });

  it('defaults to WORLD_VIEW, so her Moor at the top is never cut off', () => {
    const { frame, svg } = fakeFrame();
    const pan = attachMapPan(frame, { targets, focus: [308, 0] });
    expect(pan.view.y).toBeCloseTo(-20, 9);
    expect(parseVB(svg.attrs.viewBox).y).toBe(-20);
  });

  it('a drag pans and swallows the click that ends it; a tap does not', () => {
    const { svg, pan, onView, vb } = attached();
    const before = pan.view;
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    svg.fire('pointermove', ev({ clientX: 130, clientY: 100 }));
    svg.fire('pointerup', ev({ clientX: 130, clientY: 100 }));
    expect(onView).toHaveBeenCalled();
    expect(vb().x).toBeCloseTo(before.x - 30 / k, 1);
    expect(pan.view.x).toBeCloseTo(before.x - 30 / k, 6);
    expect(onView.mock.lastCall[0]).toEqual(pan.view);
    expect(svg.captured).toEqual([1]);
    const click = ev();
    svg.fire('click', click, true);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(click.stopPropagation).toHaveBeenCalled();
    // only the one click
    const next = ev();
    svg.fire('click', next, true);
    expect(next.preventDefault).not.toHaveBeenCalled();

    // a tap: 3 px of wobble, no pan, no capture, the click goes through untouched
    onView.mockClear();
    svg.captured.length = 0;
    const at = svg.attrs.viewBox;
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    svg.fire('pointermove', ev({ clientX: 103, clientY: 100 }));
    svg.fire('pointerup', ev({ clientX: 103, clientY: 100 }));
    expect(onView).not.toHaveBeenCalled();
    expect(svg.attrs.viewBox).toBe(at);
    const tap = ev();
    svg.fire('click', tap, true);
    expect(tap.preventDefault).not.toHaveBeenCalled();
    expect(tap.stopPropagation).not.toHaveBeenCalled();
    expect(svg.captured).toEqual([]); // a tap's click keeps its place as target
  });

  it('a pointerdown alone captures nothing', () => {
    const { svg } = attached();
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    expect(svg.captured).toEqual([]);
  });

  it('a drag cancelled by the browser does not swallow the next tap', () => {
    const { svg } = attached();
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    svg.fire('pointermove', ev({ clientX: 160, clientY: 100 }));
    svg.fire('pointercancel', ev({ clientX: 160, clientY: 100 }));
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    svg.fire('pointerup', ev({ clientX: 100, clientY: 100 }));
    const tap = ev();
    svg.fire('click', tap, true);
    expect(tap.preventDefault).not.toHaveBeenCalled();
  });

  it('a pointer with no setPointerCapture still pans', () => {
    const { svg, pan } = attached();
    delete svg.setPointerCapture;
    const x0 = pan.view.x;
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    expect(() => svg.fire('pointermove', ev({ clientX: 150, clientY: 100 }))).not.toThrow();
    expect(pan.view.x).toBeCloseTo(x0 - 50 / k, 6);
  });

  it('two fingers spreading zoom in; a ctrl-wheel zooms; a plain wheel does not', () => {
    const { svg, pan, onView } = attached();
    const s0 = scaleOf(pan.view, PHONE);
    // the board point under their midpoint (170, 200) stays under it
    const mid = [pan.view.x + 170 / s0, pan.view.y + 200 / s0];
    svg.fire('pointerdown', ev({ pointerId: 1, clientX: 150, clientY: 200 }));
    svg.fire('pointerdown', ev({ pointerId: 2, clientX: 190, clientY: 200 }));
    svg.fire('pointermove', ev({ pointerId: 1, clientX: 130, clientY: 200 }));
    svg.fire('pointermove', ev({ pointerId: 2, clientX: 210, clientY: 200 }));
    const s1 = scaleOf(pan.view, PHONE);
    expect(s1).toBeCloseTo(2 * s0, 6); // 40 px apart -> 80 px apart
    expect(pan.view.x + 170 / s1).toBeCloseTo(mid[0], 6);
    expect(pan.view.y + 200 / s1).toBeCloseTo(mid[1], 6);
    svg.fire('pointerup', ev({ pointerId: 1, clientX: 130, clientY: 200 }));
    svg.fire('pointerup', ev({ pointerId: 2, clientX: 210, clientY: 200 }));
    const click = ev();
    svg.fire('click', click, true);
    expect(click.preventDefault).toHaveBeenCalled(); // a pinch is not a tap

    onView.mockClear();
    const before = pan.view;
    const plain = ev({ deltaY: -100, clientX: 170, clientY: 200 });
    svg.fire('wheel', plain);
    expect(plain.preventDefault).not.toHaveBeenCalled();
    expect(pan.view).toEqual(before);
    expect(onView).not.toHaveBeenCalled();

    const pinch = ev({ deltaY: -20, ctrlKey: true, clientX: 170, clientY: 200 });
    svg.fire('wheel', pinch);
    expect(pinch.preventDefault).toHaveBeenCalled();
    expect(scaleOf(pan.view, PHONE)).toBeGreaterThan(scaleOf(before, PHONE));
    expect(onView).toHaveBeenCalledTimes(1);
    const out = ev({ deltaY: 40, ctrlKey: true, clientX: 170, clientY: 200 });
    svg.fire('wheel', out);
    expect(scaleOf(pan.view, PHONE)).toBeLessThan(scaleOf(before, PHONE) * 1.0001);
    expect(scaleOf(pan.view, PHONE)).toBeGreaterThanOrEqual(k - 1e-9);
  });

  it('the wheel listener is not passive, so a ctrl-wheel can stop the page zooming', () => {
    const { svg } = attached();
    expect(svg.opts.wheel).toMatchObject({ passive: false });
  });

  it('the zoom buttons zoom about the centre', () => {
    const { frame, pan, onView, svg } = attached();
    const v0 = pan.view;
    const centre = [v0.x + v0.w / 2, v0.y + v0.h / 2];
    frame.fire('click', ev({ target: zoomBtn('in') }));
    expect(scaleOf(pan.view, PHONE)).toBeCloseTo(k * ZOOM_STEP, 9);
    expect(pan.view.x + pan.view.w / 2).toBeCloseTo(centre[0], 6);
    expect(pan.view.y + pan.view.h / 2).toBeCloseTo(centre[1], 6);
    expect(onView).toHaveBeenCalledTimes(1);
    expect(svg.attrs.viewBox).toBe(viewBoxAttr(pan.view));
    frame.fire('click', ev({ target: zoomBtn('out') }));
    expect(scaleOf(pan.view, PHONE)).toBeCloseTo(k, 9);
    // out again: already at the floor, the view stays
    frame.fire('click', ev({ target: zoomBtn('out') }));
    expect(scaleOf(pan.view, PHONE)).toBeCloseTo(k, 9);
    // a click elsewhere in the frame does nothing
    onView.mockClear();
    frame.fire('click', ev());
    expect(onView).not.toHaveBeenCalled();
  });

  it('a place focused off-screen is brought into view', () => {
    const { frame, pan, onView } = attached();
    const v0 = pan.view; // round the Park, the west of her board is off-screen
    expect(150 < v0.x).toBe(true);
    // a place already in view: nothing moves
    frame.fire('focusin', ev({ target: place(1080, 470) }));
    expect(onView).not.toHaveBeenCalled();
    expect(pan.view).toEqual(v0);
    frame.fire('focusin', ev({ target: place(150, 400) }));
    expect(onView).toHaveBeenCalledTimes(1);
    const v = pan.view;
    expect(150 >= v.x && 150 <= v.x + v.w && 400 >= v.y && 400 <= v.y + v.h).toBe(true);
    expect(v.w).toBeCloseTo(v0.w, 9); // no zoom
    // focus on something that is not a place: nothing
    frame.fire('focusin', ev());
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('a press that focuses an off-screen place does not move the view under it', () => {
    const { frame, svg, pan, onView } = attached();
    const v0 = pan.view;
    // a mouse press: pointerdown on the svg, then the browser focuses the place
    svg.fire('pointerdown', ev({ clientX: 10, clientY: 200 }));
    frame.fire('focusin', ev({ target: place(150, 400) }));
    expect(pan.view).toEqual(v0);
    expect(onView).not.toHaveBeenCalled();
    svg.fire('pointerup', ev({ clientX: 10, clientY: 200 }));
    // focus that is not :focus-visible (a tap's focus, after pointerup): nothing
    frame.fire('focusin', ev({ target: place(150, 400, false) }));
    expect(pan.view).toEqual(v0);
    // Tab (no pointer down, :focus-visible): it recentres
    frame.fire('focusin', ev({ target: place(150, 400, true) }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(pan.view.x).toBe(0);
  });

  it('a new box shape refits the view at the next gesture, the floor kept', () => {
    const { svg, pan } = attached({ attach: { view: { x: 200, y: 100, w: 343 / k, h: 420 / k } } });
    expect(scaleOf(pan.view, PHONE)).toBeCloseTo(k, 9);
    svg.size = { width: 420, height: 343 }; // the phone turned
    svg.fire('pointerdown', ev({ clientX: 100, clientY: 100 }));
    const v = pan.view;
    expect(v.w / v.h).toBeCloseTo(420 / 343, 9);
    expect(92 * (420 / v.w)).toBeGreaterThanOrEqual(44 - 1e-9);
    expect(parseVB(svg.attrs.viewBox).w).toBeCloseTo(v.w, 1);
    // and the pan after it uses the new box
    svg.fire('pointermove', ev({ clientX: 150, clientY: 100 }));
    expect(pan.view.x).toBeCloseTo(v.x - 50 / (420 / v.w), 6);
  });

  describe('a resize refits the view', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('through a ResizeObserver, disconnected by detach', () => {
      const observers = [];
      vi.stubGlobal('ResizeObserver', class {
        constructor(fn) { this.fn = fn; this.observed = []; this.live = true; observers.push(this); }
        observe(el) { this.observed.push(el); }
        disconnect() { this.live = false; }
      });
      const { svg, pan, onView } = attached();
      expect(observers).toHaveLength(1);
      expect(observers[0].observed).toEqual([svg]);
      svg.size = { width: 736, height: 432 }; // to an iPad-sized box
      observers[0].fn([]);
      expect(pan.view.w / pan.view.h).toBeCloseTo(736 / 432, 9);
      expect(736 / pan.view.w).toBeGreaterThanOrEqual(k - 1e-9);
      expect(onView).toHaveBeenCalledTimes(1);
      // back to the phone: the floor holds, the island star 44 px or more
      svg.size = { width: 343, height: 420 };
      observers[0].fn([]);
      expect(92 * (343 / pan.view.w)).toBeGreaterThanOrEqual(44 - 1e-9);
      expect(pan.view.w / pan.view.h).toBeCloseTo(343 / 420, 9);
      pan.detach();
      expect(observers[0].live).toBe(false);
    });

    it("through the window's resize event when there is no ResizeObserver, removed by detach", () => {
      vi.stubGlobal('ResizeObserver', undefined);
      const win = listenerBag();
      vi.stubGlobal('window', win);
      const { svg, pan } = attached();
      expect(win.count()).toBe(1);
      svg.size = { width: 420, height: 343 };
      win.fire('resize', {});
      expect(pan.view.w / pan.view.h).toBeCloseTo(420 / 343, 9);
      expect(92 * (420 / pan.view.w)).toBeGreaterThanOrEqual(44 - 1e-9);
      pan.detach();
      expect(win.count()).toBe(0);
    });
  });

  it('nothing to attach to: null; detach removes every listener', () => {
    expect(attachMapPan(null, { targets, focus: [0, 0] })).toBeNull();
    expect(attachMapPan(undefined, { targets, focus: [0, 0] })).toBeNull();
    expect(attachMapPan(fakeFrame({ withSvg: false }).frame, { targets, focus: [0, 0] })).toBeNull();
    expect(attachMapPan(fakeFrame({ width: 0, height: 0 }).frame, { targets, focus: [0, 0] })).toBeNull();
    expect(attachMapPan({}, { targets, focus: [0, 0] })).toBeNull();

    const { frame, svg, pan, onView } = attached();
    expect(svg.count() + frame.count()).toBeGreaterThan(0);
    pan.detach();
    expect(svg.count()).toBe(0);
    expect(frame.count()).toBe(0);
    expect(() => pan.detach()).not.toThrow();
  });
});
