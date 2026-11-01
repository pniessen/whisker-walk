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
    this.arcs = []; // [x, y, r] of every arc() call
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
        return (...args) => {
          this.calls[key] = (this.calls[key] ?? 0) + 1;
          if (key === 'arc') this.arcs.push(args.slice(0, 3));
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
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildMoor, TORS, MOOR_PATHS } = await import('../src/world/moor.js');
const { build: buildPines, PINES_PATHS } = await import('../src/world/pines.js');
const { campLayout } = await import('../src/world/camp.js');
// The camp's den (r 1.1) is the one camp piece over the map's 1 m block cut;
// the leader's rock (r 0.6) is under it.
const denBlock = (a) => { const { x, z, r } = campLayout(a).den; return { x, z, r }; };

const BUILDS = { park: buildPark, neighborhood: buildNeighborhood, seaside: buildSeaside, docks: buildDocks, woods: buildWoods, river: buildRiver, moor: buildMoor, pines: buildPines };

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
    expect(Object.keys(layer).sort()).toEqual(['blocks', 'edge', 'ground', 'paths', 'trees', 'water']);
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

  it('buildMapLayer keeps a rect water\'s islands and a strip deck', () => {
    const areaData = {
      bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
      waters: [{
        id: 'w', kind: 'rect', minX: -20, maxX: 20, minZ: -20, maxZ: 20,
        islands: [{ x: 0, z: 0, r: 5 }],
        decks: [{ x1: -3, z1: -4, x2: -12, z2: -16, halfW: 0.9 }, { minX: 1, maxX: 2, minZ: 3, maxZ: 4 }],
      }],
    };
    const [w] = buildMapLayer(areaData, new THREE.Scene()).water;
    expect(w.islands).toEqual([{ x: 0, z: 0, r: 5 }]);
    expect(w.decks).toEqual([
      { kind: 'strip', x1: -3, z1: -4, x2: -12, z2: -16, halfW: 0.9 },
      { minX: 1, maxX: 2, minZ: 3, maxZ: 4 },
    ]);
  });

  it('buildMapLayer for the Woods has ground, edge, four waters with their decks, and paths', () => {
    const { scene, areaData } = built('woods');
    const layer = buildMapLayer(areaData, scene);
    expect(layer.ground).toMatch(/^#[0-9a-f]{6}$/);
    expect(layer.edge).toEqual(areaData.bounds);
    expect(layer.water).toHaveLength(4);
    // The two rivers carry decks; the lake and pond have none of their own.
    expect(layer.water.filter((w) => w.decks.length > 0)).toHaveLength(2);
    expect(layer.paths.length).toBeGreaterThan(0);
    // Every Woods collider is a trunk or a stone under 1 m, below the map's
    // block cut, but the camp's den.
    expect(layer.blocks).toEqual([denBlock('woods')]);
  });

  it('buildMapLayer for the River has ground, edge, nine waters, two with decks, and paths, and the camp\'s den as its one block', () => {
    const { scene, areaData } = built('river');
    const layer = buildMapLayer(areaData, scene);
    expect(layer.ground).toMatch(/^#[0-9a-f]{6}$/);
    expect(layer.edge).toEqual(areaData.bounds);
    expect(layer.water).toHaveLength(9);
    // river-west carries the log bridge, river-east the stepping stones.
    expect(layer.water.filter((w) => w.decks.length > 0)).toHaveLength(2);
    expect(layer.paths.length).toBeGreaterThan(0);
    // Every River collider is a trunk or a rock under 1 m, below the map's
    // block cut, so the corner map shows water, decks and paths, and the
    // camp's den.
    expect(layer.blocks).toEqual([denBlock('river')]);
  });

  it('buildMapLayer for the Moor has ground, edge, five waters, two with decks, eight paths, and the four tors and the camp\'s den as blocks', () => {
    const { scene, areaData } = built('moor');
    const layer = buildMapLayer(areaData, scene);
    expect(layer.ground).toMatch(/^#[0-9a-f]{6}$/);
    expect(layer.edge).toEqual(areaData.bounds);
    expect(layer.water).toHaveLength(5);
    // river-west carries the log bridge, river-south the stepping stones.
    expect(layer.water.filter((w) => w.decks.length > 0)).toHaveLength(2);
    // The eight path segments, each a strip at its own midpoint. (A flat
    // water plane under the 50 m half-length cut reads as a strip too, so
    // lake-far, river-west and the mouth are in layer.paths as well, drawn
    // under the water; the paths are counted by where they lie.)
    const onPath = (f) => MOOR_PATHS.some(([x1, z1, x2, z2]) => Math.hypot(f.x - (x1 + x2) / 2, f.z - (z1 + z2) / 2) < 0.01);
    expect(layer.paths.filter(onPath)).toHaveLength(8);
    expect(layer.paths).toHaveLength(8 + 3);
    // Every other Moor collider (a trunk, a chain boulder, the High Tor's
    // pillar, the hawthorn's root) is under the map's 1 m block cut; the
    // camp's den is over it.
    expect(layer.blocks).toEqual([...TORS.map(({ x, z, r }) => ({ x, z, r })), denBlock('moor')]);
  });

  it('buildMapLayer for the Pines has ground, edge, ten waters, three with decks, two with the island, 15 strips, and the Old Ash and the camp\'s den as its blocks', () => {
    const { scene, areaData } = built('pines');
    const layer = buildMapLayer(areaData, scene);
    expect(layer.ground).toMatch(/^#[0-9a-f]{6}$/);
    expect(layer.edge).toEqual(areaData.bounds);
    expect(layer.water).toHaveLength(10);
    // mire-north carries the log bridge, mire-west the stepping stones, and
    // lake-bay the island bridge's strip deck.
    // The layer's waters keep the area's order (PINES_WATERS), without ids.
    const ids = areaData.waters.map((w) => w.id);
    const which = (pick) => layer.water.map((w, i) => (pick(w) ? ids[i] : null)).filter(Boolean);
    expect(which((w) => w.decks.length > 0)).toEqual(['lake-bay', 'mire-north', 'mire-west']);
    expect(layer.water[ids.indexOf('lake-bay')].decks).toEqual([
      expect.objectContaining({ kind: 'strip', halfW: expect.closeTo(0.9, 9) }),
    ]);
    // The island is cut out of both the lake and the bay, so the map fills it
    // like the land.
    expect(which((w) => w.islands?.length > 0)).toEqual(['lake', 'lake-bay']);
    // The twelve path segments, each a strip at its own midpoint, and three
    // rectangular water planes that flatFootprints (src/render/grass.js)
    // counts as strips because neither half-extent passes 50 m: mire-west
    // (93 m by 5 m, so 46.5 m at most), the Moor's river and its mouth, all
    // drawn under the water. The lake and the bay were two more until the
    // island was cut out of them: each is now a notched ShapeGeometry, which
    // flatFootprints doesn't read, so 17 became 15 (and grass now grows on
    // the island, which is ground). Mire-north runs 114 m north to south,
    // past the 50 m cut, and is skipped; the round bogs are discs, not strips.
    const onPath = (f) => PINES_PATHS.some(([x1, z1, x2, z2]) => Math.hypot(f.x - (x1 + x2) / 2, f.z - (z1 + z2) / 2) < 0.01);
    expect(layer.paths.filter(onPath)).toHaveLength(12);
    expect(layer.paths).toHaveLength(12 + 3);
    // Every other Pines collider (a pine's trunk, a chain boulder, a pillar,
    // a truce stone, the fallen pine, a meeting stone, the Watch Rock at
    // 0.9) is under the map's 1 m block cut; the Old Ash's trunk is just on
    // it, and the camp's den is over it.
    expect(layer.blocks).toEqual([{ x: 28, z: 28, r: 1.0 }, denBlock('pines')]);
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

  it('paints an island like the land, over its water', () => {
    const layer = {
      ...LAYER,
      ground: '#5a8a4a',
      water: [{
        kind: 'rect', minX: -10, maxX: 10, minZ: -10, maxZ: 10,
        islands: [{ x: 0, z: 0, r: 3 }],
        decks: [{ kind: 'strip', x1: 1, z1: 1, x2: 6, z2: 6, halfW: 0.5 }],
      }],
    };
    const { map, canvas } = makeMap({ layer });
    map.update({ cx: 0, cz: 0, heading: 0 }, EMPTY_FRAME);
    const water = canvas.fills.indexOf('#86bcdc');
    expect(water).toBeGreaterThan(-1);
    const island = canvas.fills.indexOf('#5a8a4a', water + 1);
    expect(island).toBeGreaterThan(water);
    const deck = canvas.fills.indexOf('rgba(250,244,228,0.85)', island + 1);
    expect(deck).toBeGreaterThan(island);
  });

  // coatColor hands back a number (0x2a2a30); a canvas ignores a number
  // fillStyle and keeps the previous one, which drew every co-walker white.
  it('fills a co-walker dot with a numeric coat colour as a CSS colour', () => {
    const { map, canvas } = makeMap();
    map.update({ cx: 0, cz: 0, heading: 0 }, { ...EMPTY_FRAME, remotes: [{ x: 5, z: 5, color: 0x2a2a30 }] });
    expect(canvas.fills).toContain('#2a2a30');
  });

  it('draws a camp past the rim at the rim, in its colour with a white outline', () => {
    const { map, canvas } = makeMap();
    map.update({ cx: 0, cz: 0, heading: 0 }, { ...EMPTY_FRAME, camp: { x: 900, z: 0, color: '#3f7d3a' } });
    expect(canvas.fills).toContain('#3f7d3a');
    // The first arc is the rim disc (centre c, radius radiusPx); the camp's
    // dome is the arc of radius 6, pinned 6 px inside the rim, due east.
    const [c, , radiusPx] = canvas.arcs[0];
    const dome = canvas.arcs.find((a) => a[2] === 6);
    expect(dome).toBeTruthy();
    expect(Math.hypot(dome[0] - c, dome[1] - 4 - c)).toBeCloseTo(radiusPx - 6, 3);
    expect(dome[0]).toBeGreaterThan(c);
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
