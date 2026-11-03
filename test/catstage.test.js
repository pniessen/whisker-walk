import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCatStage, fitFraming, defaultPoseCat, STAGE_POSE, BACK_TURN } from '../src/ui/catstage.js';
import { buildCat } from '../src/cat/model.js';
import { SIT } from '../src/cat/torso.js';

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

  it('passes a custom look to buildCat; a preset call keeps exactly two arguments', () => {
    const LOOK = { coat: 'ginger', pattern: 'stripes' };
    const build = vi.fn(() => new THREE.Group());
    const { stage } = setup({ buildCat: build });
    stage.mount(fakeEl());
    stage.show('calico', { collar: 'bell' }, LOOK);
    expect(build).toHaveBeenLastCalledWith('calico', { collar: 'bell' }, { look: LOOK });
    stage.show('tabby', {});
    expect(build.mock.calls.at(-1)).toHaveLength(2);
    stage.show('tabby', {}, null);
    expect(build.mock.calls.at(-1)).toHaveLength(2);
  });

  it('a custom show falls back to the preset thumbnail when WebGL failed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stage } = setup({ createRenderer: () => { throw new Error('no webgl'); } });
    const el = fakeEl();
    stage.show('calico', {}, { coat: 'ginger' });
    stage.mount(el);
    expect(stage.failed).toBe(true);
    expect(el.children.find((c) => c.className === 'dr-hero-img').src).toBe('data:calico');
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

// The builder's size slider: the frame is the same for every size of one
// look, so Small shows smaller and Big bigger; a ready-made cat still frames
// on its own size.
describe('createCatStage: framing a look', () => {
  const box = () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 1.2));
    m.position.set(0, 0.45, 0);
    return m;
  };
  const sized = (breed, acc, opts) => {
    const g = new THREE.Group();
    g.add(box());
    g.scale.setScalar(opts?.look?.size ?? 1);
    return g;
  };
  function cameraFor(build, ...args) {
    const { stage, renderer } = setup({ buildCat: build });
    const el = fakeEl();
    el.clientWidth = 390; el.clientHeight = 300;
    stage.mount(el);
    stage.show(...args);
    const cam = renderer.render.mock.calls.at(-1)[1];
    cam.updateMatrixWorld(true);
    return cam;
  }
  const look = (size) => ({ coat: 'ginger', size });

  it('every size of a look gets the same camera, so the size shows', () => {
    const small = cameraFor(sized, 'tabby', {}, look(0.85));
    const big = cameraFor(sized, 'tabby', {}, look(1.15));
    expect(big.position.distanceTo(small.position)).toBeLessThan(1e-9);
  });

  it('the biggest look still fits at every spin angle', () => {
    const cam = cameraFor(sized, 'tabby', {}, look(1.15));
    const cat = sized('tabby', {}, { look: look(1.15) });
    const mesh = cat.children[0];
    const pos = mesh.geometry.attributes.position;
    for (const angle of [0, 0.8, 1.6, 2.4, 3.1, 4.7]) {
      cat.rotation.y = angle;
      cat.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(cam);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a ready-made cat frames on its own (scaled) size, exactly as before', () => {
    const scaled = () => { const g = new THREE.Group(); g.add(box()); g.scale.setScalar(1.3); return g; };
    const baked = () => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 * 1.3, 0.9 * 1.3, 1.2 * 1.3));
      m.position.set(0, 0.45 * 1.3, 0);
      g.add(m);
      return g;
    };
    const a = cameraFor(scaled, 'mainecoon', {});
    const b = cameraFor(baked, 'mainecoon', {});
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6);
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

// Fight moves and scars (Task 8): the dressing room shows her cat's scars.
describe('createCatStage: scars', () => {
  it('show(…, scars) builds them; an unscarred show is called exactly as before', () => {
    const SCARS = [{ site: 'face', stage: 'full', side: 'l' }];
    const LOOK = { coat: 'ginger', pattern: 'stripes' };
    const build = vi.fn(() => new THREE.Group());
    const { stage } = setup({ buildCat: build });
    stage.mount(fakeEl());
    stage.show('tabby', { collar: 'bell' }, null, SCARS);
    expect(build).toHaveBeenLastCalledWith('tabby', { collar: 'bell' }, { scars: SCARS });
    stage.show('calico', {}, LOOK, SCARS);
    expect(build).toHaveBeenLastCalledWith('calico', {}, { look: LOOK, scars: SCARS });
    stage.show('calico', {}, LOOK, []);
    expect(build).toHaveBeenLastCalledWith('calico', {}, { look: LOOK });
    stage.show('tabby', {}, null, []);
    expect(build.mock.calls.at(-1)).toHaveLength(2);
  });

  it('with the real buildCat, a scarred show has a scar mesh', async () => {
    const { buildCat } = await import('../src/cat/model.js');
    let shown = null;
    const { stage } = setup({ buildCat: (...a) => (shown = buildCat(...a)) });
    stage.mount(fakeEl());
    stage.show('tabby', {}, null, [{ site: 'back', stage: 'half', side: 'r' }]);
    expect(shown.userData.parts.scars?.name).toBe('scars');
  });
});

describe('the stage cat sits (Ruling P4/P5)', () => {
  it('poses the built cat once, before the bounds are measured', () => {
    const cat = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    cat.add(child);
    const poseCat = vi.fn((c) => { c.children[0].position.y = 5; });
    const { stage } = setup({ buildCat: () => cat, poseCat });
    stage.mount(fakeEl());
    stage.show('tabby', {});
    expect(poseCat).toHaveBeenCalledTimes(1);
    expect(poseCat).toHaveBeenCalledWith(cat);
    expect(new THREE.Box3().setFromObject(cat).max.y).toBeCloseTo(5.5);
    // framing was computed on the posed cat: an unposed stage frames differently
    const camOf = (poseFn) => {
      const mk = () => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))); return g; };
      const o = setup({ buildCat: mk, poseCat: poseFn });
      o.stage.mount(fakeEl());
      o.stage.show('tabby', {});
      return o.renderer.render.mock.calls.at(-1)[1].position.clone();
    };
    const posed = camOf((c) => { c.children[0].position.y = 5; });
    expect(posed.distanceTo(camOf(() => {}))).toBeGreaterThan(0.5);
  });

  it('the default poseCat sits a real cat, skips a bare group, and the builder path sits too', () => {
    expect(STAGE_POSE).toEqual({ state: 'requestPet', t: 1.3 });
    const real = buildCat('tabby');
    defaultPoseCat(real);
    expect(real.userData.parts.body.rotation.x).toBe(SIT.pitch);
    const bare = new THREE.Group();
    expect(() => defaultPoseCat(bare)).not.toThrow();
    expect(bare.children).toHaveLength(0);
    expect(() => defaultPoseCat(undefined)).not.toThrow();

    const built = [];
    const { stage } = setup({ buildCat: (...a) => { const c = buildCat(...a); built.push(c); return c; } });
    stage.mount(fakeEl());
    stage.show('tabby', {}, { coat: 'ginger', pattern: 'stripes' });
    expect(built.at(-1).userData.parts.body.rotation.x).toBe(SIT.pitch);
    stage.show('hagrid', {});
    expect(built.at(-1).userData.parts).toBeTruthy();
  });
});

const REST = -0.45; // spin.js rest angle
describe('back-item turn', () => {
  function turnSetup() {
    const cats = [];
    const ctx = setup({ buildCat: () => { const g = new THREE.Group(); cats.push(g); return g; } });
    ctx.stage.mount(fakeEl());
    return { ...ctx, cats };
  }
  it('the first show has no turn, even wearing a back item', () => {
    const { stage, cats } = turnSetup();
    stage.show('calico', { back: 'wings' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST, 6);
  });
  it('trying on wings turns the cat to show its back', () => {
    const { stage, cats } = turnSetup();
    stage.show('calico', { head: 'crown' });
    stage.show('calico', { head: 'crown', back: 'wings' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST + BACK_TURN, 6);
    stage.show('calico', { head: 'crown', back: 'jetpack' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST + BACK_TURN, 6);
  });
  it('resets after another change, a new breed, or removing the back item', () => {
    const { stage, cats } = turnSetup();
    stage.show('calico', {});
    stage.show('calico', { back: 'wings' });
    stage.show('calico', { back: 'wings', head: 'tophat' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST, 6);
    stage.show('calico', { back: 'backpack', head: 'tophat' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST + BACK_TURN, 6);
    stage.show('tabby', { back: 'backpack', head: 'tophat' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST, 6);
    stage.show('tabby', { back: 'wings', head: 'tophat' });
    stage.show('tabby', { head: 'tophat' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST, 6);
  });
  it('keeps the turn when the same set is shown again', () => {
    const { stage, cats } = turnSetup();
    stage.show('calico', {});
    stage.show('calico', { back: 'wings' });
    stage.show('calico', { back: 'wings' });
    expect(cats.at(-1).rotation.y).toBeCloseTo(REST + BACK_TURN, 6);
  });
  it('dragging turns relative to the offset', () => {
    const drag = (acc) => {
      const { stage, cats, canvas, renderer } = turnSetup();
      stage.show('calico', {});
      if (acc) stage.show('calico', acc);
      canvas.emit('pointerdown', { pointerId: 1, clientX: 0, button: 0 });
      canvas.emit('pointermove', { pointerId: 1, clientX: 60 });
      stage.setVisible(true); // forces a draw
      stage.show('calico', acc || {});
      return cats.at(-1).rotation.y;
    };
    const plain = drag(null);
    const turned = drag({ back: 'wings' });
    expect(plain).not.toBeCloseTo(REST, 3);
    expect(turned - plain).toBeCloseTo(BACK_TURN, 6);
  });
});
