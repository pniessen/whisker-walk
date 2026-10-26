import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCatStage, fitFraming } from '../src/ui/catstage.js';

// Minimal hand-made fakes: only what catstage.js calls.
function fakeEl() {
  const el = {
    children: [], clientWidth: 400, clientHeight: 300,
    prepend(n) { if (n.parentNode) n.remove(); n.parentNode = el; el.children.unshift(n); },
  };
  return el;
}
function fakeNode(extra = {}) {
  const n = {
    parentNode: null, listeners: {}, style: {},
    remove() { if (n.parentNode) n.parentNode.children = n.parentNode.children.filter((c) => c !== n); n.parentNode = null; },
    addEventListener(t, f) { (n.listeners[t] ||= new Set()).add(f); },
    removeEventListener(t, f) { n.listeners[t]?.delete(f); },
    emit(t, e = {}) { for (const f of [...(n.listeners[t] || [])]) f({ preventDefault() {}, ...e }); },
    setPointerCapture() {}, releasePointerCapture() {},
    ...extra,
  };
  return n;
}
function setup(over = {}) {
  const canvas = fakeNode();
  const renderer = {
    domElement: canvas, setPixelRatio() {}, setSize() {}, render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(),
  };
  const observers = [];
  class RO {
    constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const raf = vi.fn(() => 1);
  const caf = vi.fn();
  const win = fakeNode({ devicePixelRatio: 1 });
  const stage = createCatStage({
    buildCat: () => new THREE.Group(),
    thumbs: { cats: { calico: 'data:calico' } },
    createRenderer: () => renderer,
    raf, caf, ResizeObserverCtor: RO, win,
    createElement: (tag) => fakeNode({ tag, className: '' }),
    ...over,
  });
  return { stage, canvas, renderer, observers, raf, caf, win };
}

describe('createCatStage', () => {
  it('falls back to a still image, keeping the existing children, when the renderer throws', () => {
    const { stage } = setup({ createRenderer: () => { throw new Error('no webgl'); } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = fakeEl();
    const text = fakeNode();
    el.prepend(text);
    stage.show('calico', {});
    stage.mount(el);
    expect(stage.failed).toBe(true);
    const img = el.children.find((c) => c.className === 'dr-hero-img');
    expect(img.src).toBe('data:calico');
    expect(el.children).toContain(text);
  });

  it('moves the same canvas into a new element, keeps the angle, and drops the old observer', () => {
    const { stage, canvas, observers } = setup();
    const a = fakeEl(); const b = fakeEl();
    stage.show('calico', {});
    stage.mount(a);
    canvas.emit('pointerdown', { pointerId: 1, clientX: 0, button: 0 });
    canvas.emit('pointermove', { pointerId: 1, clientX: 50 });
    canvas.emit('pointerup', { pointerId: 1 }); // listeners are on window; harmless here
    stage.mount(b);
    expect(canvas.parentNode).toBe(b);
    expect(a.children).not.toContain(canvas);
    expect(observers[0].disconnected).toBe(true);
    expect(observers[1].el).toBe(b);
  });

  it('keeps a drag alive across a re-mount and ends it on a window pointerup', () => {
    const { stage, canvas, win, raf } = setup();
    stage.show('calico', {});
    stage.mount(fakeEl());
    canvas.emit('pointerdown', { pointerId: 7, clientX: 0, button: 0 });
    stage.mount(fakeEl());
    raf.mockClear();
    canvas.emit('pointermove', { pointerId: 7, clientX: 30 });
    expect(raf).toHaveBeenCalled(); // the move was honoured with no pointer capture
    canvas.emit('pointerdown', { pointerId: 8, clientX: 0, button: 0 }); // second finger ignored
    win.emit('pointerup', { pointerId: 7 });
    expect(win.listeners.pointerup.size).toBe(0);
  });

  it('schedules no frame while hidden', () => {
    const { stage, canvas, raf } = setup();
    stage.show('calico', {});
    stage.mount(fakeEl());
    stage.setVisible(false);
    raf.mockClear();
    stage.show('calico', {});
    canvas.emit('pointerdown', { pointerId: 1, clientX: 0, button: 0 });
    canvas.emit('pointermove', { pointerId: 1, clientX: 40 });
    expect(raf).not.toHaveBeenCalled();
  });

  it('does not report failure when the context is lost after dispose', () => {
    const { stage, canvas } = setup();
    stage.show('calico', {});
    stage.mount(fakeEl());
    stage.dispose();
    canvas.emit('webglcontextlost');
    expect(stage.failed).toBe(false);
  });

  it('frames a big cat so every corner of it is on screen at any spin angle', () => {
    const tall = () => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 1.6));
      m.position.set(0.1, 1.2, 0.3);
      g.add(m);
      return g;
    };
    const { stage, renderer } = setup({ buildCat: tall });
    const el = fakeEl();
    el.clientWidth = 375; el.clientHeight = 300;
    stage.mount(el);
    stage.show('mainecoon', {});
    const camera = renderer.render.mock.calls.at(-1)[1];
    camera.updateMatrixWorld(true);
    const cat = tall();
    const mesh = cat.children[0];
    const pos = mesh.geometry.attributes.position;
    for (const angle of [0, 0.8, 1.6, 2.4, 3.1, 4.7]) {
      cat.rotation.y = angle;
      cat.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++) { // every real vertex of the cat
        const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(camera);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('fitFraming', () => {
  const t15 = Math.tan(Math.PI / 12);
  it('a taller cat sits farther back', () => {
    const small = fitFraming({ minY: 0, maxY: 0.8, radius: 0.5 }, { aspect: 1.5 });
    const big = fitFraming({ minY: 0, maxY: 1.4, radius: 0.5 }, { aspect: 1.5 });
    expect(big.distance).toBeGreaterThan(small.distance);
  });
  it('a narrow stage backs off so the width still fits', () => {
    const b = { minY: 0, maxY: 0.8, radius: 0.9 };
    expect(fitFraming(b, { aspect: 0.8 }).distance).toBeGreaterThan(fitFraming(b, { aspect: 2 }).distance);
  });
  it('the whole height fits in the frame above the text strip', () => {
    const b = { minY: 0, maxY: 1.2, radius: 0.6 };
    const bottomFrac = 0.25;
    const { distance } = fitFraming(b, { aspect: 1.2, bottomFrac, elevation: 0, margin: 1 });
    // at elevation 0 the projected half-height is just height/2
    expect(distance * t15 * (1 - bottomFrac)).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });
  it('keeping room for the text looks lower, so the cat rides higher', () => {
    const b = { minY: 0, maxY: 1, radius: 0.5 };
    const none = fitFraming(b, { bottomFrac: 0 });
    const some = fitFraming(b, { bottomFrac: 0.3 });
    expect(none.targetY).toBeGreaterThan(0);
    expect(none.targetY).toBeLessThan(1);
    expect(some.targetY).toBeLessThan(none.targetY);
  });
  it('returns finite numbers for degenerate bounds', () => {
    const f = fitFraming({ minY: 0, maxY: 0, radius: 0 }, { aspect: 0, bottomFrac: 5 });
    expect(Number.isFinite(f.distance)).toBe(true);
    expect(Number.isFinite(f.targetY)).toBe(true);
  });
});
