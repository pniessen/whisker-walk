import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCatStage } from '../src/ui/catstage.js';

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
});
