import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHud } from '../src/ui/hud.js';

// The project has no DOM environment (no jsdom/happy-dom); like den.test.js and
// nametag.test.js this installs a small recording fake `document`. It models
// only what createHud touches: an innerHTML that yields id'd elements, and
// elements whose textContent setter drops children (as in a real DOM) while
// counting every write so "did not touch the DOM" is assertable.
class FakeEl {
  constructor() {
    this.children = [];
    this.own = '';
    this.cls = new Set();
    this.writes = 0; // textContent sets + appendChild calls
    this.classList = {
      toggle: (c, on) => { if (on) this.cls.add(c); else this.cls.delete(c); },
      add: (c) => this.cls.add(c),
      remove: (c) => this.cls.delete(c),
      contains: (c) => this.cls.has(c),
    };
  }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.writes += 1; this.own = String(v); this.children = []; }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { this.writes += 1; this.children.push(c); return c; }
  addEventListener() {}
  remove() {}
}

let byId;
let prevDoc;

beforeEach(() => {
  prevDoc = globalThis.document;
  byId = new Map();
  const root = new FakeEl();
  Object.defineProperty(root, 'innerHTML', {
    set(html) {
      byId.clear();
      for (const m of html.matchAll(/<div class="([^"]*)" id="([^"]+)"/g)) {
        const el = new FakeEl();
        el.className = m[1];
        byId.set(m[2], el);
      }
      for (const m of html.matchAll(/<span id="([^"]+)"/g)) byId.set(m[1], new FakeEl());
    },
  });
  root.querySelector = (sel) => byId.get(sel.slice(1)) ?? null;
  globalThis.document = {
    getElementById: () => root,
    createElement: () => new FakeEl(),
  };
});

afterEach(() => {
  if (prevDoc === undefined) delete globalThis.document;
  else globalThis.document = prevDoc;
});

const objEl = () => byId.get('hud-objective');
const distEl = () => objEl().children[0];

describe('hud.setObjective', () => {
  it('prints the objective alone when no distance is given', () => {
    const hud = createHud();
    hud.setObjective('Find the lost glasses 👓');
    expect(objEl().classList.contains('hidden')).toBe(false);
    expect(objEl().textContent).toContain('Find the lost glasses');
    expect(objEl().textContent).not.toMatch(/\bm\b/);
    expect(objEl().children).toHaveLength(0);
  });

  it('appends a whole-metre distance as a separate styled child', () => {
    const hud = createHud();
    hud.setObjective('Find the lost glasses 👓', 23.4);
    expect(objEl().textContent).toContain('23 m');
    expect(distEl().cls.has('hud-objective-dist')).toBe(true);
    expect(distEl().textContent).toBe('23 m');
  });

  it('never prints NaN for a hostile distance', () => {
    const hud = createHud();
    for (const bad of [NaN, Infinity, -1]) {
      hud.setObjective('Find it', bad);
      expect(objEl().textContent).not.toMatch(/NaN|Infinity|-1/);
      expect(objEl().children).toHaveLength(0);
    }
  });

  it('clears entirely when the objective is cleared', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective(null);
    expect(objEl().classList.contains('hidden')).toBe(true);
  });

  it('can show the objective again after clearing it', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective(null);
    hud.setObjective('Find it', 23);
    expect(objEl().classList.contains('hidden')).toBe(false);
    expect(objEl().textContent).toContain('23 m');
  });

  // Called every frame: the cache key is text + the RENDERED distance string.
  it('does not touch the DOM when the rendered text is unchanged', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23.2);
    const node = distEl();
    const writes = objEl().writes;
    const childWrites = node.writes;
    hud.setObjective('Find it', 23.4); // still "23 m"
    expect(distEl()).toBe(node);
    expect(objEl().writes).toBe(writes);
    expect(node.writes).toBe(childWrites);
  });

  it('updates the number when the rendered distance changes', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23.2);
    hud.setObjective('Find it', 30);
    expect(distEl().textContent).toBe('30 m');
  });

  it('updates when the text changes at the same distance', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective('Find the kitten', 23);
    expect(objEl().textContent).toContain('Find the kitten');
    expect(objEl().textContent).toContain('23 m');
  });

  it('shows "here" when the cat is on top of the target', () => {
    const hud = createHud();
    hud.setObjective('Find it', 1);
    expect(distEl().textContent).toBe('here');
  });

  // Regression guards: these pass against the original implementation.
  it('removes the distance child when the distance is dropped', () => {
    const hud = createHud();
    hud.setObjective('Find it', 23);
    hud.setObjective('Find it');
    expect(objEl().textContent).not.toContain('23 m');
    expect(objEl().children).toHaveLength(0);
    expect(objEl().textContent).toContain('Find it');
  });

  it('renders "here" for a distance of exactly zero', () => {
    const hud = createHud();
    hud.setObjective('Find it', 0);
    expect(distEl().textContent).toBe('here');
  });
});

describe('hud corner map slot', () => {
  it('mapHost is the #hud-map element, which holds the area caption', () => {
    const hud = createHud();
    expect(hud.mapHost).toBe(byId.get('hud-map'));
    expect(byId.get('hud-map').cls.has('hud-map')).toBe(true);
  });

  it('setArea writes the caption under the map', () => {
    const hud = createHud();
    hud.setArea('The Park');
    expect(byId.get('hud-area').textContent).toBe('The Park');
  });

  it('setCamera hides the map while the viewfinder is up and brings it back', () => {
    const hud = createHud();
    hud.setCamera(true);
    expect(byId.get('hud-map').classList.contains('hidden')).toBe(true);
    expect(byId.get('hud-viewfinder').classList.contains('hidden')).toBe(false);
    hud.setCamera(false);
    expect(byId.get('hud-map').classList.contains('hidden')).toBe(false);
    expect(byId.get('hud-viewfinder').classList.contains('hidden')).toBe(true);
  });
});
