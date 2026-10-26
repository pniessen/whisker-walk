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

const CAM_FOV = 30;
const CAM_ELEVATION = Math.atan2(CAM_DIR.y - CAM_TARGET.y, Math.hypot(CAM_DIR.x - CAM_TARGET.x, CAM_DIR.z - CAM_TARGET.z));

// Pure framing math: how far back the camera sits, and where it looks, so a
// cat spinning about its own Y axis stays fully in frame from every angle.
// bounds = { minY, maxY, radius } (radius: the widest reach from the Y axis,
// so any spin angle fits). The bottom `bottomFrac` of the frame is kept for
// the hero name text; the cat sits centred in the rest, with `margin` slack.
// The bounding cylinder is round, so only the camera's elevation matters: its
// rim is projected exactly (perspective included) and the distance and aim
// are refined until it fills the free window.
export function fitFraming(bounds, { fovDeg = CAM_FOV, aspect = 1, elevation = CAM_ELEVATION, bottomFrac = 0, margin = 1.04 } = {}) {
  const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0;
  const maxY = Number.isFinite(bounds.maxY) ? Math.max(bounds.maxY, minY) : minY;
  const r = Math.max(0, Number.isFinite(bounds.radius) ? bounds.radius : 0);
  const asp = Math.max(Number.isFinite(aspect) ? aspect : 1, 0.1);
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const bf = Math.min(Math.max(Number.isFinite(bottomFrac) ? bottomFrac : 0, 0), 0.6);
  const m = Math.max(margin, 1);
  // the free window in normalised device coords, shrunk by the margin
  const top = 1 / m;
  const bottom = -1 + 2 * bf + (1 - 1 / m);
  const side = 1 / m;
  const sinE = Math.sin(elevation);
  const cosE = Math.cos(elevation);
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const y of [minY, maxY]) pts.push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  // camera at (0, ty + d sinE, d cosE) looking at (0, ty, 0): the rim's
  // extent on screen
  const extent = (d, ty) => {
    const cy = ty + d * sinE;
    const cz = d * cosE;
    let yTop = -Infinity; let yBot = Infinity; let xMax = 0; let behind = false;
    for (const [x, y, z] of pts) {
      const vy = y - cy; const vz = z - cz;
      const depth = -vy * sinE - vz * cosE;
      if (depth <= 1e-3) { behind = true; break; }
      const ny = (vy * cosE - vz * sinE) / (depth * t);
      yTop = Math.max(yTop, ny); yBot = Math.min(yBot, ny);
      xMax = Math.max(xMax, Math.abs(x) / (depth * t * asp));
    }
    return { yTop, yBot, xMax, behind };
  };
  // for a distance, the aim that centres the rim in the window
  const aim = (d) => {
    let ty = (minY + maxY) / 2;
    for (let k = 0; k < 8; k++) {
      const e = extent(d, ty);
      if (e.behind) break;
      ty += ((e.yTop + e.yBot) / 2 - (top + bottom) / 2) * d * t;
    }
    return ty;
  };
  const fits = (d) => {
    const ty = aim(d);
    const e = extent(d, ty);
    return !e.behind && e.yTop <= top + 1e-6 && e.yBot >= bottom - 1e-6 && e.xMax <= side + 1e-6;
  };
  // bisect the nearest distance that fits (fitting is monotone in distance)
  let lo = r + Math.max(maxY - minY, 1e-3) * 0.01;
  let hi = Math.max(lo * 2, 1);
  for (let k = 0; k < 40 && !fits(hi); k++) hi *= 2;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid; else lo = mid;
  }
  return { distance: hi, targetY: aim(hi) };
}

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
  let bounds = null; // the current cat's spin-proof bounds (measure)
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
    frameCat();
  }

  // Aim the camera at the current cat's bounds (the approved three-quarter
  // direction, distance fitted), leaving the hero text's strip at the bottom.
  function frameCat() {
    if (!camera || !el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const dir = CAM_DIR.clone().sub(CAM_TARGET).normalize();
    if (!bounds) {
      // no cat yet (or an empty one): the mockup's fixed framing
      const back = Math.max(1, 1.1 / camera.aspect);
      camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR.clone().sub(CAM_TARGET), back);
      camera.lookAt(CAM_TARGET);
    } else {
      const text = el.querySelector ? el.querySelector('.dr-hero-text') : null;
      const textH = text && text.offsetHeight ? text.offsetHeight + 14 : 0;
      const { distance, targetY } = fitFraming(bounds, { aspect: w / h, bottomFrac: textH / h });
      const target = new THREE.Vector3(0, targetY, 0);
      camera.position.copy(target).addScaledVector(dir, distance);
      camera.lookAt(target);
    }
    camera.updateProjectionMatrix();
  }

  // Spin-proof bounds: the box at angle 0, widened to the farthest reach from
  // the Y axis so every angle of the spin fits.
  function measure(obj) {
    const saved = obj.rotation.y;
    obj.rotation.y = 0;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.rotation.y = saved;
    obj.updateMatrixWorld(true);
    if (box.isEmpty()) return null;
    const rx = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    const rz = Math.max(Math.abs(box.min.z), Math.abs(box.max.z));
    return { minY: box.min.y, maxY: box.max.y, radius: Math.hypot(rx, rz) };
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
    bounds = measure(cat);
    cat.rotation.y = spin.angle;
    scene.add(cat);
    frameCat();
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
