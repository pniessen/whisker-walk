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
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildPines } = await import('../src/world/pines.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');

// The corner map showed the Woods as bare grass: every one of its 71 trees
// has a trunk collider under the map's 1 m block cut, so none reached
// `blocks`. Trees now come from the scene (every builder.tree(), read off its
// `userData.canopy`, as render/ambient.js's findTrees does) into their own
// `trees` list, drawn as soft green crowns in ONE path and ONE fill, so even
// the Woods costs the map a single fill call per paint.
const TREE_FILL = 'rgba(46,88,42,0.55)';

function layerOf(build) {
  const scene = new THREE.Scene();
  const areaData = build(scene);
  return buildMapLayer(areaData, scene);
}

describe('trees on the corner map', () => {
  it('the Woods and the River list their trees', () => {
    expect(layerOf(buildWoods).trees.length).toBeGreaterThanOrEqual(60);
    expect(layerOf(buildRiver).trees.length).toBeGreaterThanOrEqual(30);
  });

  it('each tree is a crown: x, z and a radius, nothing else', () => {
    for (const t of layerOf(buildWoods).trees) {
      expect(Object.keys(t).sort()).toEqual(['r', 'x', 'z']);
      expect(t.r).toBeGreaterThan(0.5);
      expect(t.r).toBeLessThanOrEqual(2.5);
    }
  });

  it('a tree already drawn as a block (the Pines Old Ash) is not drawn twice', () => {
    const layer = layerOf(buildPines);
    for (const b of layer.blocks) {
      expect(layer.trees.some((t) => Math.hypot(t.x - b.x, t.z - b.z) < 0.5)).toBe(false);
    }
  });

  // Polish 2: the Pines' pines are builder.pine Groups and one merged
  // pineStand, neither of which carries `canopy` (a pine sheds no leaves, so
  // the ambient leaf-fall must not find them). They say where their crowns
  // are for the map alone, and every one of them is drawn.
  it('the Pines list every pine, near and in the stand', async () => {
    const { pinesTrees } = await import('../src/world/pines.js');
    const { near, stand } = pinesTrees();
    const trees = layerOf(buildPines).trees;
    expect(trees.length).toBeGreaterThanOrEqual(near.length + stand.length);
    for (const p of [...near, ...stand]) {
      const t = trees.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.01);
      expect(t).toBeDefined();
      expect(t.r).toBeGreaterThan(0.5);
      expect(t.r).toBeLessThanOrEqual(2.5);
    }
  });

  it('pines still give the ambient leaf-fall nothing', async () => {
    const { findTrees } = await import('../src/render/ambient.js');
    const scene = new THREE.Scene();
    buildPines(scene);
    const { pinesTrees } = await import('../src/world/pines.js');
    const { near } = pinesTrees();
    const leafy = findTrees(scene);
    for (const p of near) expect(leafy.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.01)).toBe(false);
  });

  // The Seaside has no trees at all (seaside.js: "There is not a tree in the
  // area"), only six beach-grass tufts, which are not trees on a map.
  it('an area with no trees has an empty list', () => {
    expect(layerOf(buildSeaside).trees).toEqual([]);
    expect(layerOf(buildPark).trees.length).toBeGreaterThan(0);
  });

  it('paints every crown in a single fill, under the blocks', () => {
    const layer = layerOf(buildWoods);
    const parent = new FakeEl('div');
    const host = parent.appendChild(new FakeEl('div'));
    const map = createMinimap(host, { areaId: 'woods', layer, mode: 'north' });
    const canvas = host.children.find((c) => c.tagName === 'CANVAS');
    map.update({ cx: 0, cz: 0, heading: 0 }, { race: null, quest: null, scenics: [], visitedScenics: new Set(), remotes: [] });
    expect(canvas.fills.filter((f) => f === TREE_FILL)).toHaveLength(1);
    const block = canvas.fills.indexOf('rgba(70,60,52,0.45)');
    expect(canvas.fills.indexOf(TREE_FILL)).toBeLessThan(block);
    // and one arc per crown went into it
    expect(canvas.arcs.length).toBeGreaterThanOrEqual(layer.trees.length);
  });
});
