import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';

// herCatPortrait with a stand-in renderer, so the real buildCat runs in node
// (three's uuids draw Math.random for every geometry and material).
const gl = vi.hoisted(() => ({ throws: false, made: 0, rendered: [] }));
vi.mock('three', async (importOriginal) => {
  const real = await importOriginal();
  class FakeRenderer {
    constructor() {
      gl.made++;
      if (gl.throws) throw new Error('no WebGL here');
    }
    setClearColor() {}
    setSize() {}
    render(scene, camera) { gl.rendered.push({ children: scene.children.length, camera: camera.position.clone() }); }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...real, WebGLRenderer: FakeRenderer };
});

const fakeCanvas = () => ({ width: 0, height: 0, toDataURL: () => 'data:image/png;base64,PORTRAIT' });
let hadDocument;
let oldDocument;
beforeEach(() => {
  vi.resetModules();
  gl.throws = false; gl.made = 0; gl.rendered = [];
  hadDocument = 'document' in globalThis;
  oldDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : {}) };
});
afterEach(() => {
  if (hadDocument) globalThis.document = oldDocument; else delete globalThis.document;
  vi.restoreAllMocks();
});

describe('herCatPortrait builds her cat with zero global Math.random draws', () => {
  it('really builds and renders the cat, and never touches the global stream', async () => {
    const { herCatPortrait } = await import('../src/thumbnails.js');
    const before = Math.random;
    const spy = vi.spyOn(Math, 'random');
    const out = herCatPortrait({ equipped: { cat: 'tabby', collar: 'bell', head: 'partycrown' } });
    expect(out).toBe('data:image/png;base64,PORTRAIT');
    expect(gl.made).toBe(1);
    expect(gl.rendered).toHaveLength(1);
    expect(gl.rendered[0].children).toBeGreaterThan(0); // the cat was in the scene
    expect(spy).toHaveBeenCalledTimes(0);
    expect(Math.random).toBe(spy); // put back exactly as it was
    spy.mockRestore();
    expect(Math.random).toBe(before);
    // Cached: a second ask renders nothing new.
    expect(herCatPortrait({ equipped: { cat: 'tabby', collar: 'bell', head: 'partycrown' } })).toBe(out);
    expect(gl.made).toBe(1);
  });
});

describe('a failed portrait is remembered', () => {
  it('a broken GPU is tried once: later walks get null without a new context, and one warning', async () => {
    const { herCatPortrait } = await import('../src/thumbnails.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    gl.throws = true;
    expect(herCatPortrait({ equipped: { cat: 'tabby' } })).toBeNull();
    expect(gl.made).toBe(1);
    gl.throws = false; // even if it would work now, it is not retried this session
    expect(herCatPortrait({ equipped: { cat: 'siamese', collar: 'bell' } })).toBeNull();
    expect(herCatPortrait({ equipped: { cat: 'tabby' } })).toBeNull();
    expect(gl.made).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('portraitFraming: her cat fills its box, nothing clipped', () => {
  // Every vertex of the cat, in normalised device coordinates.
  function ndcBounds(cat, camera) {
    cat.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const p = new THREE.Vector3();
    cat.traverse((o) => {
      const pos = o.geometry?.attributes?.position;
      if (!pos || o.isSprite || o.visible === false) return;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(camera);
        b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
        b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
      }
    });
    return b;
  }

  const cases = [
    ['a plain tabby', 'tabby', {}],
    ['a balloon', 'tabby', { back: 'balloon' }],
    ['a balloon bunch', 'tabby', { back: 'balloonbunch' }],
    ['butterfly wings', 'mainecoon', { back: 'wings' }],
    ['a party crown', 'tabby', { head: 'partycrown' }],
  ];
  for (const [what, breed, wear] of cases) {
    it(`${what}: inside the frame, filling most of it`, async () => {
      const { portraitFraming } = await import('../src/thumbnails.js');
      const cat = buildCat(breed, wear);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      portraitFraming(cat, camera);
      const b = ndcBounds(cat, camera);
      for (const v of [b.minX, b.maxX, b.minY, b.maxY]) expect(Math.abs(v)).toBeLessThanOrEqual(0.95);
      // The longer side spans at least 80% of the box.
      expect(Math.max(b.maxX - b.minX, b.maxY - b.minY)).toBeGreaterThanOrEqual(1.6);
      // Centred: no side has much more room than its opposite.
      expect(Math.abs(b.maxX + b.minX)).toBeLessThan(0.12);
      expect(Math.abs(b.maxY + b.minY)).toBeLessThan(0.12);
    });
  }

  it('a plain cat comes out bigger than the menu framing made it', async () => {
    const { portraitFraming } = await import('../src/thumbnails.js');
    const cat = buildCat('tabby', {});
    cat.rotation.y = -0.45;
    const menu = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    menu.position.set(1.35, 1.14, -1.7);
    menu.lookAt(0, 0.44, 0);
    const old = ndcBounds(cat, menu);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    portraitFraming(cat, camera);
    const now = ndcBounds(cat, camera);
    expect(now.maxY - now.minY).toBeGreaterThan((old.maxY - old.minY) * 1.2); // 1.47 -> 1.83 of 2
  });
});
