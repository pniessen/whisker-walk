import * as THREE from 'three';
import { createSpin } from './spin.js';

// The dressing room's live hero cat: ONE WebGL canvas for the page's life.
// The home screen rebuilds its DOM on every render, so mount(el) is called
// again each time with a fresh #dr-stage; we move the same canvas into it
// (keeping the spin angle and any drag in progress). Rendering is on demand
// only: once per show/resize, and once per frame while dragging or coasting.

// Framing from the signed-off mockup (verify-dressingroom-mockup.html).
const CAM_DIR = new THREE.Vector3(1.85, 1.3, -2.45);
const CAM_TARGET = new THREE.Vector3(0, 0.38, 0);

const defaultCreateRenderer = () => new THREE.WebGLRenderer({ alpha: true, antialias: true });

// The injectables exist so tests can drive the stage without WebGL or a DOM;
// production passes only { buildCat, thumbs }.
export function createCatStage({
  buildCat,
  thumbs,
  createRenderer = defaultCreateRenderer,
  raf: rafFn = (cb) => requestAnimationFrame(cb),
  caf: cafFn = (id) => cancelAnimationFrame(id),
  ResizeObserverCtor = globalThis.ResizeObserver,
  createElement = (tag) => document.createElement(tag),
  win = globalThis.window,
}) {
  let renderer = null;
  let canvas = null;
  let scene = null;
  let camera = null;
  let cat = null;
  let breed = null;
  let el = null;
  let ro = null;
  let raf = 0;
  let visible = true;
  let coasting = false;
  let lastFrame = 0;
  let disposed = false;
  let img = null;
  let activeId = null; // the one pointer currently dragging
  const spin = createSpin();
  const stage = { failed: false };

  function disposeCat() {
    if (!cat) return;
    scene.remove(cat);
    cat.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    cat = null;
  }

  function fail(err) {
    if (stage.failed || disposed) return;
    stage.failed = true;
    endDrag();
    console.warn('Whisker Walk: live cat unavailable, using a still picture', err);
    cancel();
    if (ro) { ro.disconnect(); ro = null; }
    disposeCat();
    if (canvas) canvas.remove();
    if (renderer) { try { renderer.dispose(); } catch { /* already gone */ } }
    renderer = null;
    canvas = null;
    if (el) placeFallback();
  }

  function placeFallback() {
    if (img) img.remove();
    img = null;
    const src = thumbs && thumbs.cats && thumbs.cats[breed];
    if (!src || !el) return; // the hero name text is already in the stage
    img = createElement('img');
    img.className = 'dr-hero-img';
    img.alt = '';
    img.src = src;
    el.prepend(img);
  }

  function ensureRenderer() {
    if (renderer || stage.failed) return;
    try {
      renderer = createRenderer();
      renderer.setPixelRatio(Math.min((win && win.devicePixelRatio) || 1, 2));
      canvas = renderer.domElement;
      canvas.style.touchAction = 'pan-y'; // vertical swipes still scroll the page
      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      scene = new THREE.Scene();
      const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
      sun.position.set(2, 4, -3);
      scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 1.1));
      camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    } catch (err) {
      if (renderer) { try { renderer.dispose(); } catch { /* ignore */ } }
      renderer = null;
      canvas = null;
      fail(err);
    }
  }

  function resize() {
    if (!renderer || !el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = w / h;
    // height-fitted; on a narrow stage back off so the cat's width still fits
    const back = Math.max(1, 1.1 / camera.aspect);
    camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR.clone().sub(CAM_TARGET), back);
    camera.lookAt(CAM_TARGET);
    camera.updateProjectionMatrix();
  }

  function draw() {
    if (!renderer || stage.failed) return;
    if (cat) cat.rotation.y = spin.angle;
    renderer.render(scene, camera);
  }

  function cancel() {
    if (raf) cafFn(raf);
    raf = 0;
  }

  function frame(now) {
    raf = 0;
    if (!visible || !renderer) return;
    const dt = Math.min((now - (lastFrame || now)) / 1000, 0.05);
    lastFrame = now;
    const r = spin.step(dt);
    draw();
    coasting = r.moving;
    if (coasting) schedule();
  }

  function schedule() {
    if (raf || !visible || !renderer) return;
    raf = rafFn(frame);
  }

  function now() { return performance.now(); }

  function onLost(e) {
    e.preventDefault();
    fail(new Error('context lost'));
  }

  function endDrag() {
    if (activeId === null) return;
    const id = activeId;
    activeId = null;
    if (win && win.removeEventListener) {
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
    }
    if (canvas) { try { canvas.releasePointerCapture(id); } catch { /* not captured */ } }
    spin.release(now());
    lastFrame = 0;
    schedule(); // one frame decides whether a coast follows
  }

  function onDown(e) {
    if (activeId !== null) return; // one finger at a time
    if (e.button !== undefined && e.button > 0) return;
    activeId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    // window listeners are the safety net: the home re-render drops pointer
    // capture, and a lift elsewhere must still end the drag
    if (win && win.addEventListener) {
      win.addEventListener('pointerup', onUp);
      win.addEventListener('pointercancel', onUp);
    }
    spin.grab(e.clientX, now());
    coasting = false;
    lastFrame = 0;
  }
  function onMove(e) {
    if (activeId === null || e.pointerId !== activeId || !canvas) return;
    spin.move(e.clientX, now());
    schedule();
  }
  function onUp(e) {
    if (e.pointerId !== activeId) return;
    endDrag();
  }

  stage.mount = function mount(target) {
    if (disposed) return;
    el = target;
    if (ro) { ro.disconnect(); ro = null; }
    if (img) { img.remove(); img = null; }
    ensureRenderer();
    if (stage.failed) { placeFallback(); return; }
    if (canvas.parentNode !== el) el.prepend(canvas); // insert, never replace the hero text
    // a re-render drops pointer capture; take it back so a drag keeps going
    if (activeId !== null) { try { canvas.setPointerCapture(activeId); } catch { /* pointer gone */ } }
    resize();
    if (visible) draw();
    if (ResizeObserverCtor) {
      ro = new ResizeObserverCtor(() => { resize(); if (visible) draw(); });
      ro.observe(el);
    }
  };

  stage.show = function show(nextBreed, accessories = {}) {
    if (disposed) return;
    breed = nextBreed;
    if (stage.failed) { if (el) placeFallback(); return; }
    ensureRenderer();
    if (stage.failed) return;
    disposeCat();
    cat = buildCat(breed, accessories);
    cat.rotation.y = spin.angle;
    scene.add(cat);
    if (el && visible) draw();
  };

  stage.setVisible = function setVisible(v) {
    visible = !!v;
    if (!visible) { cancel(); lastFrame = 0; } else if (el && renderer) draw();
  };

  stage.dispose = function dispose() {
    disposed = true;
    cancel();
    if (ro) { ro.disconnect(); ro = null; }
    activeId = null;
    if (win && win.removeEventListener) {
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
    }
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.remove();
    }
    disposeCat();
    if (img) { img.remove(); img = null; }
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    renderer = null;
    canvas = null;
    el = null;
  };

  return stage;
}
