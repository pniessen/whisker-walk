import * as THREE from 'three';
import { createSpin } from './spin.js';
import { SIZE } from '../customcats.js';
import { animateCat } from '../cat/animator.js';
import { note } from '../diagnostics.js';

// The stage cat sits (Ruling P4): the hero and the try-ons always, the cat
// builder's draft when she taps 🐾 Sit (it stands by default; see setPose).
// One static pose, posed once per show() BEFORE the bounds
// are measured, so the framing fits the sitting cat (its tail, cape and
// balloons included) and no animation loop is needed. Hagrid gets whatever
// sit animateCat gives him (P5).
// The stage rests at a three-quarter turn so the flank and stripes show (spin.js's
// own default stays -0.45 for its tests).
export const STAGE_REST = -1.25;
export const STAGE_POSE = Object.freeze({ state: 'requestPet', t: 1.3 });

// Trying on a back item (wings, jetpack, backpack) turns the hero so the
// new thing is in view: the yaw added to the spin angle, in radians.
export const BACK_TURN = 2.85;

// The stage's two poses: 'sit' (STAGE_POSE, the dressing room's default) and
// 'stand' (the cat exactly as built, unposed, the way the stage showed it
// before every stage cat sat). The cat builder stands by default so the legs,
// pattern and tail are in view; a 🐾 toggle switches (setPose).
export const STAGE_POSES = Object.freeze(['sit', 'stand']);
export const normalizePose = (p) => (p === 'stand' ? 'stand' : 'sit');

// Skips objects without a rig (the tests' bare groups, anything unbuilt).
export function defaultPoseCat(cat) {
  if (!cat?.userData?.parts) return;
  animateCat(cat, STAGE_POSE.state, STAGE_POSE.t, 0);
}

// The dressing room's live hero cat: ONE WebGL canvas for the page's life.
// The home screen rebuilds its DOM on every render, so mount(el) is called
// again each time with a fresh #dr-stage; we move the same canvas into it
// (keeping the spin angle and any drag in progress). Rendering is on demand
// only: once per show/resize, and once per frame while dragging or coasting.

// Framing from the signed-off mockup (verify-dressingroom-mockup.html).
const CAM_DIR = new THREE.Vector3(1.85, 1.3, -2.45);
const CAM_TARGET = new THREE.Vector3(0, 0.47, 0);

const CAM_FOV = 30;

// The floor: a soft cool pool of light and a dark contact shadow, both radial
// fans with a per-vertex alpha (no textures, two draws), flat at the cat's feet
// and the same for standing and sitting. It does not spin with the cat.
export const FLOOR_RINGS = 12;
export const FLOOR_SEGS = 40;
export function fadeDisc(rgb, centreAlpha, power = 2) {
  const n = 1 + FLOOR_RINGS * FLOOR_SEGS;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  const idx = [];
  const put = (i, x, z, a) => { pos.set([x, 0, z], i * 3); col.set([rgb[0], rgb[1], rgb[2], a], i * 4); };
  put(0, 0, 0, centreAlpha);
  for (let r = 1; r <= FLOOR_RINGS; r++) {
    const u = r / FLOOR_RINGS;
    const a = centreAlpha * Math.pow(1 - u, power);
    for (let k = 0; k < FLOOR_SEGS; k++) {
      const th = (k / FLOOR_SEGS) * Math.PI * 2;
      put(1 + (r - 1) * FLOOR_SEGS + k, Math.cos(th) * u, Math.sin(th) * u, a);
    }
  }
  const at = (r, k) => 1 + (r - 1) * FLOOR_SEGS + (k % FLOOR_SEGS);
  for (let k = 0; k < FLOOR_SEGS; k++) idx.push(0, at(1, k + 1), at(1, k));
  for (let r = 1; r < FLOOR_RINGS; r++) {
    for (let k = 0; k < FLOOR_SEGS; k++) idx.push(at(r, k), at(r, k + 1), at(r + 1, k), at(r, k + 1), at(r + 1, k + 1), at(r + 1, k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}
function floorMesh(name, rgb, alpha, power, order) {
  const m = new THREE.Mesh(fadeDisc(rgb, alpha, power), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  m.name = name;
  m.renderOrder = order;
  return m;
}
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
  poseCat = defaultPoseCat,
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
  let glow = null;    // the soft pool of light on the floor
  let contact = null; // the dark contact shadow under the cat
  let rug = null;     // a warm round rug the cat sits on
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
  let lastBreed = null;
  let lastSig = null; // the look and scars last shown
  let lastAcc = null; // the accessories last shown (null before the first show)
  let turn = 0; // yaw offset on top of the spin angle
  let activeId = null; // the one pointer currently dragging
  let pose = 'sit'; // STAGE_POSES: what the next show() poses the cat as
  let lastShow = null; // show()'s last arguments, so setPose can rebuild the cat
  const spin = createSpin({ rest: STAGE_REST });
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

  function disposeFloor() {
    for (const m of [rug, glow, contact]) { if (m) { m.geometry.dispose(); m.material.dispose(); } }
    glow = null;
    contact = null;
    rug = null;
  }

  function fail(err) {
    if (stage.failed || disposed) return;
    stage.failed = true;
    endDrag();
    console.warn('Whisker Walk: live cat unavailable, using a still picture', err);
    note('gl', err);
    cancel();
    if (ro) { ro.disconnect(); ro = null; }
    disposeCat();
    disposeFloor();
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
      // a warm key from the side and front, a cool rim from behind, soft ambient
      // (polish-dusk7: a lower ambient and a key that rakes across the flank, so
      // the tabby's stripes keep their contrast instead of washing out)
      const sun = new THREE.DirectionalLight(0xffe6c0, 2.8);
      sun.position.set(4.2, 2.4, 1.6);
      const rim = new THREE.DirectionalLight(0x9cc0ff, 0.9);
      rim.position.set(-3, 2, -3);
      scene.add(sun, rim, new THREE.AmbientLight(0xbfd8ff, 0.4));
      glow = floorMesh('stageGlow', [0.45, 0.58, 0.85], 0.45, 2, -2);
      contact = floorMesh('stageContact', [0.01, 0.02, 0.06], 0.75, 1.2, -1);
      rug = floorMesh('stageRug', [0.62, 0.42, 0.3], 0.5, 1.5, -3);
      scene.add(rug, glow, contact);
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

  // A custom look is framed for the biggest size the slider allows (measured
  // at scale 1, then grown to SIZE.MAX), so the frame does not follow the
  // size: Small shows smaller and Big bigger. Ready-made cats keep measure().
  function lookBounds(obj) {
    const saved = obj.scale.clone();
    obj.scale.set(1, 1, 1);
    const b = measure(obj);
    obj.scale.copy(saved);
    obj.updateMatrixWorld(true);
    if (!b) return null;
    return { minY: b.minY * SIZE.MAX, maxY: b.maxY * SIZE.MAX, radius: b.radius * SIZE.MAX };
  }

  // Floor under the feet, sized from the cat's reach (the same for either pose).
  function placeFloor() {
    if (!glow || !bounds) return;
    const r = Math.max(bounds.radius, 0.2);
    // bounds.minY is the lowest reach (a custom look's size scale included); a sitting cat's
    // lowest point is its haunch or tail, a touch under the paws.
    const y = bounds.minY + (pose === 'sit' ? 0.06 : 0.0) + 0.004;
    glow.position.y = y;
    glow.scale.set(r * 2.1, 1, r * 2.1);
    contact.position.y = y + 0.002;
    contact.scale.set(r * 1.15, 1, r * 1.15);
    rug.position.y = y - 0.001;
    rug.scale.set(r * 1.7, 1, r * 1.7);
  }

  function draw() {
    if (!renderer || stage.failed) return;
    if (cat) cat.rotation.y = spin.angle + turn;
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

  // `scars` (fight moves and scars): the shown cat's own render entries; an
  // unscarred show calls buildCat exactly as before.
  stage.show = function show(nextBreed, accessories = {}, look = null, scars = []) {
    if (disposed) return;
    breed = nextBreed;
    lastShow = [nextBreed, accessories, look, scars];
    if (stage.failed) { if (el) placeFallback(); return; }
    ensureRenderer();
    if (stage.failed) return;
    disposeCat();
    const scarred = Array.isArray(scars) && scars.length > 0;
    if (look) cat = buildCat(breed, accessories, scarred ? { look, scars } : { look });
    else cat = scarred ? buildCat(breed, accessories, { scars }) : buildCat(breed, accessories);
    if (pose === 'sit') poseCat(cat); // 'stand': the cat as built
    bounds = look ? lookBounds(cat) : measure(cat);
    const acc = accessories || {};
    const sig = JSON.stringify([look || null, scarred ? scars : null]);
    if (!lastAcc || breed !== lastBreed || sig !== lastSig) {
      turn = 0;
    } else {
      const keys = new Set([...Object.keys(lastAcc), ...Object.keys(acc)]);
      const changed = [...keys].filter((k) => (lastAcc[k] ?? null) !== (acc[k] ?? null));
      if (changed.length === 1 && changed[0] === 'back' && acc.back) turn = BACK_TURN;
      else if (changed.length) turn = 0; // no change at all keeps the turn
    }
    lastBreed = breed;
    lastSig = sig;
    lastAcc = { ...acc };
    cat.rotation.y = spin.angle + turn;
    scene.add(cat);
    placeFloor();
    frameCat();
    if (el && visible) draw();
  };

  // Sit or stand. A change rebuilds the shown cat in the new pose and frames
  // it again (a standing cat is longer and lower than a sitting one); the spin
  // angle and any turn are kept. { redraw: false } only records the pose, for
  // a caller about to show() a new cat anyway. true = the pose changed.
  stage.setPose = function setPose(next, { redraw = true } = {}) {
    const p = normalizePose(next);
    if (p === pose) return false;
    pose = p;
    if (redraw && lastShow && !disposed && !stage.failed) stage.show(...lastShow);
    return true;
  };
  Object.defineProperty(stage, 'pose', { get: () => pose, enumerable: true });

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
    disposeFloor();
    if (img) { img.remove(); img = null; }
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    renderer = null;
    canvas = null;
    el = null;
  };

  return stage;
}
