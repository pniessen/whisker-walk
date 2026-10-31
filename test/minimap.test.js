import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// No DOM in this project's tests. One small fake serves both callers: the
// world builders (which only want a canvas whose 2D context answers
// everything, like test/grass.test.js's) and the map (which needs elements
// with listeners, a parent to bubble to, and a context that counts calls so
// "did not repaint" is assertable).
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.width = 0;
    this.height = 0;
    this.clientWidth = 0;
    this.style = {};
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.cls = new Set();
    this.calls = {}; // 2D context method name -> call count
    this.fills = []; // the fillStyle in force at each fill() / fillRect()
    this.classList = {
      add: (c) => this.cls.add(c),
      remove: (c) => this.cls.delete(c),
      toggle: (c, on) => { if (on) this.cls.add(c); else this.cls.delete(c); },
      contains: (c) => this.cls.has(c),
    };
  }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.cls].join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((k) => k !== c);
    c.parentNode = null;
    return c;
  }
  remove() { this.parentNode?.removeChild(this); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  getContext() {
    const state = {};
    return new Proxy({}, {
      get: (_t, key) => {
        if (key in state) return state[key];
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {
          this.calls[key] = (this.calls[key] ?? 0) + 1;
          if (key === 'fill' || key === 'fillRect') this.fills.push(state.fillStyle);
        };
      },
      set: (_t, key, v) => { state[key] = v; return true; },
    });
  }
}

vi.stubGlobal('document', { createElement: (tag) => new FakeEl(tag) });

const { buildMapLayer, createMinimap } = await import('../src/ui/minimap.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');

const BUILDS = { park: buildPark, neighborhood: buildNeighborhood, seaside: buildSeaside, docks: buildDocks };

function built(areaId) {
  const scene = new THREE.Scene();
  const areaData = BUILDS[areaId](scene);
  return { scene, areaData };
}

// Bubble an event from `el` up its parents, the way a real DOM would, until
// someone calls stopPropagation.
function dispatch(el, type, init = {}) {
  let stopped = false;
  const ev = { type, ...init, stopPropagation() { stopped = true; }, preventDefault() {} };
  for (let node = el; node && !stopped; node = node.parentNode) {
    for (const fn of node.listeners[type] ?? []) fn(ev);
  }
  return ev;
}

const EMPTY_FRAME = { race: null, quest: null, scenics: [], visitedScenics: new Set(), remotes: [] };
const LAYER = { ground: '#6cb058', edge: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, water: [], paths: [], blocks: [] };

function makeMap(opts = {}) {
  const parent = new FakeEl('div');
  const host = parent.appendChild(new FakeEl('div'));
  const map = createMinimap(host, { areaId: 'park', layer: LAYER, mode: 'north', onToggle: () => {}, ...opts });
  const canvas = host.children.find((c) => c.tagName === 'CANVAS');
  return { parent, host, map, canvas };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('buildMapLayer', () => {
  it('buildMapLayer for the park has ground, edge, water and at least one path', () => {
    const { scene, areaData } = built('park');
    const layer = buildMapLayer(areaData, scene);
    expect(layer.ground).toBe('#6cb058');
    expect(layer.edge).toEqual(areaData.bounds);
    expect(layer.water.length).toBeGreaterThan(0);
    expect(layer.water[0]).toMatchObject({ kind: 'circle' });
    expect(layer.paths.length).toBeGreaterThan(0);
    for (const p of layer.paths) expect(p).toMatchObject({ kind: 'strip' });
  });

  it('buildMapLayer never includes collectibles, golden mice or secrets', () => {
    const areaData = {
      groundBounce: 0x7cb860,
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      waters: [],
      colliders: [{ x: 1, z: 2, r: 1.5 }],
      collectibles: [{ x: 3, z: 3 }],
      goldMice: [{ x: 4, z: 4 }],
      secrets: [{ x: 5, z: 5 }],
      gifts: [{ x: 6, z: 6 }],
    };
    const layer = buildMapLayer(areaData, new THREE.Scene());
    expect(Object.keys(layer).sort()).toEqual(['blocks', 'edge', 'ground', 'paths', 'water']);
    const text = JSON.stringify(layer);
    for (const n of ['3', '4', '5', '6']) expect(text).not.toContain(`"x":${n}`);
    expect(layer.blocks).toEqual([{ x: 1, z: 2, r: 1.5 }]);
  });

  // Raised decks are not flat strips, so without these the Docks canal reads
  // as an uncrossable band and the Seaside pier as open sea.
  it('buildMapLayer keeps the Docks bridge decks and the Seaside pier deck', () => {
    const docks = built('docks');
    const canal = buildMapLayer(docks.areaData, docks.scene).water
      .find((w) => w.kind === 'rect' && w.minX === -45 && w.maxX === 45);
    expect(canal.decks).toEqual([
      { minX: -2.5, maxX: 2.5, minZ: -6.5, maxZ: 6.5 },
      { minX: -25.1, maxX: -22.9, minZ: -5.5, maxZ: 5.5 },
    ]);
    const seaside = built('seaside');
    const sea = buildMapLayer(seaside.areaData, seaside.scene).water.find((w) => (w.decks ?? []).length);
    expect(sea.decks).toHaveLength(1);
    expect(sea.decks[0].maxX).toBeGreaterThan(sea.decks[0].minX);
  });

  for (const areaId of ['park', 'neighborhood', 'seaside', 'docks']) {
    it(`buildMapLayer on ${areaId} returns blocks with r >= 1`, () => {
      const { scene, areaData } = built(areaId);
      const layer = buildMapLayer(areaData, scene);
      expect(layer.blocks.length).toBeGreaterThan(0);
      for (const b of layer.blocks) expect(b.r).toBeGreaterThanOrEqual(1);
      expect(layer.ground).toMatch(/^#[0-9a-f]{6}$/);
    });
  }
});

describe('createMinimap', () => {
  it('createMinimap adds one canvas to the host and dispose removes it', () => {
    const { host, map, canvas } = makeMap();
    expect(host.children.filter((c) => c.tagName === 'CANVAS')).toHaveLength(1);
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Map');
    expect(canvas.style.pointerEvents).toBe('auto');
    map.dispose();
    expect(host.children.filter((c) => c.tagName === 'CANVAS')).toHaveLength(0);
  });

  it('sizes the canvas backing store for devicePixelRatio', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    try {
      const { map, canvas } = makeMap();
      map.update({ cx: 0, cz: 0, heading: 0 }, EMPTY_FRAME);
      expect(canvas.width).toBe(300); // 150 css px on desktop
      expect(canvas.height).toBe(300);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal('document', { createElement: (tag) => new FakeEl(tag) });
    }
  });

  it('a tap calls onToggle once; a drag of 20 px does not', () => {
    const onToggle = vi.fn();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { canvas } = makeMap({ onToggle });
    dispatch(canvas, 'pointerdown', { clientX: 50, clientY: 50 });
    now.mockReturnValue(1100);
    dispatch(canvas, 'pointerup', { clientX: 53, clientY: 52 });
    expect(onToggle).toHaveBeenCalledTimes(1);

    now.mockReturnValue(2000);
    dispatch(canvas, 'pointerdown', { clientX: 50, clientY: 50 });
    now.mockReturnValue(2100);
    dispatch(canvas, 'pointerup', { clientX: 70, clientY: 50 });
    expect(onToggle).toHaveBeenCalledTimes(1);

    // too slow to be a tap
    now.mockReturnValue(3000);
    dispatch(canvas, 'pointerdown', { clientX: 50, clientY: 50 });
    now.mockReturnValue(3400);
    dispatch(canvas, 'pointerup', { clientX: 50, clientY: 50 });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('pointer events on the map do not propagate', () => {
    const { parent, canvas } = makeMap();
    const spy = vi.fn();
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) parent.addEventListener(t, spy);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      dispatch(canvas, t, { clientX: 0, clientY: 0 });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('update with an unchanged view and frame does not repaint', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { map, canvas } = makeMap();
    map.update({ cx: 1, cz: 2, heading: 0.3 }, EMPTY_FRAME);
    const painted = canvas.calls.clearRect ?? 0;
    expect(painted).toBeGreaterThan(0);
    now.mockReturnValue(2000);
    map.update({ cx: 1.01, cz: 2, heading: 0.305 }, { ...EMPTY_FRAME, visitedScenics: new Set() });
    expect(canvas.calls.clearRect).toBe(painted);
  });

  it('repaints when the view moves, the markers change or the mode changes', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { map, canvas } = makeMap();
    const count = () => canvas.calls.clearRect ?? 0;
    map.update({ cx: 0, cz: 0, heading: 0 }, EMPTY_FRAME);
    const a = count();
    now.mockReturnValue(1100);
    map.update({ cx: 0.2, cz: 0, heading: 0 }, EMPTY_FRAME);
    expect(count()).toBe(a + 1);
    now.mockReturnValue(1200);
    map.update({ cx: 0.2, cz: 0, heading: 0 }, { ...EMPTY_FRAME, scenics: [{ id: 's', x: 3, z: 3 }] });
    expect(count()).toBe(a + 2);
    now.mockReturnValue(1300);
    map.setMode('turn');
    expect(map.mode).toBe('turn');
    map.update({ cx: 0.2, cz: 0, heading: 0 }, { ...EMPTY_FRAME, scenics: [{ id: 's', x: 3, z: 3 }] });
    expect(count()).toBe(a + 3);
  });

  it('repaints at most 30 times a second', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { map, canvas } = makeMap();
    const count = () => canvas.calls.clearRect ?? 0;
    map.update({ cx: 0, cz: 0, heading: 0 }, EMPTY_FRAME);
    const a = count();
    now.mockReturnValue(1010); // 10 ms later: too soon
    map.update({ cx: 1, cz: 0, heading: 0 }, EMPTY_FRAME);
    expect(count()).toBe(a);
    now.mockReturnValue(1040); // the change is still pending and now due
    map.update({ cx: 1, cz: 0, heading: 0 }, EMPTY_FRAME);
    expect(count()).toBe(a + 1);
  });

  it('paints a deck over its water in the path tone', () => {
    const layer = {
      ...LAYER,
      water: [{ kind: 'rect', minX: -10, maxX: 10, minZ: -2, maxZ: 2, decks: [{ minX: -1, maxX: 1, minZ: -3, maxZ: 3 }] }],
    };
    const { map, canvas } = makeMap({ layer });
    map.update({ cx: 0, cz: 0, heading: 0 }, EMPTY_FRAME);
    const water = canvas.fills.indexOf('#86bcdc');
    expect(water).toBeGreaterThan(-1);
    expect(canvas.fills.slice(water + 1)).toContain('rgba(250,244,228,0.85)');
  });

  // coatColor hands back a number (0x2a2a30); a canvas ignores a number
  // fillStyle and keeps the previous one, which drew every co-walker white.
  it('fills a co-walker dot with a numeric coat colour as a CSS colour', () => {
    const { map, canvas } = makeMap();
    map.update({ cx: 0, cz: 0, heading: 0 }, { ...EMPTY_FRAME, remotes: [{ x: 5, z: 5, color: 0x2a2a30 }] });
    expect(canvas.fills).toContain('#2a2a30');
  });

  it('draws markers past the rim without throwing, and hide/show toggle the canvas', () => {
    const { map, canvas } = makeMap();
    const frame = {
      race: { state: 'running', currentRing: 1, rings: [{ x: 500, z: 0 }, { x: 4, z: 4 }] },
      quest: { state: 'active', target: { x: 0, z: -900 } },
      scenics: [{ id: 'a', x: 2, z: 2 }, { id: 'b', x: -2, z: 2 }],
      visitedScenics: new Set(['a']),
      remotes: [{ x: 5, z: 5, color: '#4a90d9' }],
    };
    map.update({ cx: 0, cz: 0, heading: 1 }, frame);
    map.setMode('turn');
    map.update({ cx: 0, cz: 0, heading: 1 }, frame);
    map.hide();
    expect(canvas.classList.contains('hidden')).toBe(true);
    map.show();
    expect(canvas.classList.contains('hidden')).toBe(false);
  });
});
