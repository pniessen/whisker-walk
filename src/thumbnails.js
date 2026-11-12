import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { CATALOG } from './progression.js';
import { activeCat } from './customcats.js';
import { mulberry32, seedFromCode } from './rng.js';
import { note } from './diagnostics.js';

// Renders menu thumbnails from the real in-game models, so the shop pictures
// always match what you get. One throwaway WebGL context renders everything
// once, results are cached as data URLs, then the context is released.

const SIZE = 160;
let cache = null;

// Shared by the menu portraits and the custom-cat portraits: puts one cat in
// the scene, frames it, renders, reads the data URL and frees the cat.
function makeSnapper(renderer, scene, camera, canvas) {
  return function snap(cat, closeUp, rotY = -0.45) {
    scene.add(cat);
    // camera sits at bearing ≈ -0.67 rad from the model's -z facing axis;
    // -0.45 gives a face-on three-quarter view, callers can override
    cat.rotation.y = rotY;
    if (typeof closeUp === 'function') {
      closeUp(cat, camera); // a framing of the caller's own (her cat's portrait)
    } else if (closeUp) {
      camera.position.set(0.85, 0.99, -1.11);
      camera.lookAt(0, 0.64, -0.21);
    } else {
      camera.position.set(1.35, 1.14, -1.7);
      camera.lookAt(0, 0.44, 0);
    }
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/png');
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
    return url;
  };
}

// How an accessory's picture is framed, shared by the menu (on a tabby) and
// the dressing room's Wearing slots (on the cat on show).
//
// items worn on the feet/back/torso (booties, sneakers, rainboots,
// backpack, wings, cape, hoodie) sit well outside a head close-up, so
// they need the whole-cat framing; head/face/neck-worn items (collar,
// head, face, neck slots) still read best close up. Driven by slot
// rather than a hardcoded id list so future catalog items frame
// correctly automatically. backpack and jetpack sit flat on the back so
// they get a rear-quarter angle; wings/balloon read fine from the front.
const WHOLE_CAT_SLOTS = new Set(['feet', 'back', 'body']);
export function accessoryFraming(id) {
  const slot = CATALOG.accessories[id]?.slot;
  return { closeUp: !WHOLE_CAT_SLOTS.has(slot), rotY: id === 'backpack' || id === 'jetpack' ? -2.4 : -0.45 };
}

function renderAll() {
  try {
    return renderAllUnsafe();
  } catch (err) {
    console.warn('Whisker Walk: thumbnail rendering unavailable', err);
    note('gl', err);
    return { cats: {}, accessories: {} }; // graceful: cards just show no image
  }
}

function renderAllUnsafe() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(SIZE, SIZE);

  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(2, 4, -3); // light from the camera side
  scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 1.1));

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);

  const snap = makeSnapper(renderer, scene, camera, canvas);

  const cats = {};
  for (const breed of Object.keys(CATALOG.cats)) {
    cats[breed] = snap(buildCat(breed), false);
  }

  const accessories = {};
  for (const id of Object.keys(CATALOG.accessories)) {
    const slot = CATALOG.accessories[id].slot;
    const worn = buildCat('tabby', slot === 'collar' ? { collar: id } : { [slot]: id });
    const { closeUp, rotY } = accessoryFraming(id);
    accessories[id] = snap(worn, closeUp, rotY);
  }

  renderer.dispose();
  renderer.forceContextLoss(); // deterministically release the throwaway context
  return { cats, accessories };
}

export function menuThumbnails() {
  if (!cache) cache = renderAll();
  return cache;
}

// Custom-cat portraits (ruling 9): snapped on demand, one throwaway context
// per call, cached in memory by lookKey, never saved.
const customCache = new Map();
let customWarned = false;

export function customThumbnails(entries) {
  const fresh = entries.filter((e) => !customCache.has(e.key));
  if (fresh.length) {
    let renderer = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(SIZE, SIZE);
      const scene = new THREE.Scene();
      const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
      sun.position.set(2, 4, -3);
      scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 1.1));
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
      const snap = makeSnapper(renderer, scene, camera, canvas);
      for (const e of fresh) {
        if (customCache.has(e.key)) continue;
        // e.wear: a Wearing slot's picture, one accessory on the cat on
        // show, framed like the menu's (accessoryFraming).
        const cat = buildCat(e.breed, e.wear ?? {}, e.look ? { look: e.look } : {});
        customCache.set(e.key, e.wear ? snap(cat, e.closeUp !== false, e.rotY ?? -0.45) : snap(cat, false));
      }
    } catch (err) {
      if (!customWarned) { customWarned = true; console.warn('Whisker Walk: custom portraits unavailable', err); note('gl', err); }
    } finally {
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    }
  }
  const out = {};
  for (const e of entries) if (customCache.has(e.key)) out[e.key] = customCache.get(e.key);
  return out;
}

// Her cat's portrait for the Ready card and the walk summary: the cat she
// walks as (a custom cat's own look on its preset breed), wearing what she
// wears, whole and three-quarter like the menu's cat pictures.
// portraitEntry(state) -> { key, breed, look, wear }, pure.
export function portraitEntry(state) {
  const { breed, look } = activeCat(state);
  const wear = {};
  for (const [slot, id] of Object.entries(state?.equipped ?? {})) {
    if (slot === 'cat' || slot === 'custom' || id == null) continue;
    wear[slot] = id;
  }
  return { key: `her:${breed}:${JSON.stringify(look ?? null)}:${JSON.stringify(wear)}`, breed, look: look ?? null, wear };
}

// herCatPortrait(state) -> data URL, or null (no WebGL, a lost GPU, anything).
// One throwaway context per new key, cached in memory, never saved. While it
// builds, Math.random is a local seeded stream (camp.js's withLocalUuids):
// the walk's own build and every seeded draw after it are untouched.
const PORTRAIT_SIZE = 264; // shown at 132px: crisp on a 2x screen
const portraitCache = new Map();
let portraitWarned = false;
// A GPU that failed once is not asked again this session (every walk would
// otherwise make, and lose, another context).
let portraitBroken = false;

// portraitFraming(cat, camera): her cat turned three-quarter like the menu's
// pictures, with the camera pulled in until her cat fills the square, every
// vertex inside it, so a balloon, wings or a crown are never clipped. The
// view direction is the menu's (from (1.35, 1.14, -1.7) toward (0, 0.44, 0));
// only the distance and the aim point change, fitted to this cat.
const PORTRAIT_DIR = new THREE.Vector3(1.35, 0.7, -1.7).normalize();
const PORTRAIT_FILL = 0.92; // of the half-frame, so a soft margin all round
export function portraitFraming(cat, camera, rotY = -0.45) {
  cat.rotation.y = rotY;
  cat.updateMatrixWorld(true);
  const pts = [];
  const p = new THREE.Vector3();
  cat.traverse((o) => {
    const pos = o.geometry?.attributes?.position;
    if (!pos || o.isSprite || o.visible === false) return;
    for (let i = 0; i < pos.count; i++) pts.push(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
  });
  const box = new THREE.Box3().setFromPoints(pts);
  const target = box.isEmpty() ? new THREE.Vector3(0, 0.44, 0) : box.getCenter(new THREE.Vector3());
  // The camera's own axes, fixed by the view direction alone.
  const fwd = PORTRAIT_DIR.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * PORTRAIT_FILL;
  const tx = t * (camera.aspect || 1);
  let dist = 2.3;
  // Fit the distance (exact for a fixed aim), then nudge the aim so the cat
  // sits in the middle; twice is plenty.
  for (let pass = 0; pass < 3 && pts.length; pass++) {
    dist = 0;
    for (const v of pts) {
      const d = v.clone().sub(target);
      const a = d.dot(PORTRAIT_DIR); // toward the camera
      dist = Math.max(dist, a + Math.abs(d.dot(right)) / tx, a + Math.abs(d.dot(up)) / t);
    }
    if (pass === 2) break;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const v of pts) {
      const d = v.clone().sub(target);
      const z = dist - d.dot(PORTRAIT_DIR);
      const x = d.dot(right) / z; const y = d.dot(up) / z;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    target.addScaledVector(right, ((minX + maxX) / 2) * dist).addScaledVector(up, ((minY + maxY) / 2) * dist);
  }
  camera.position.copy(target).addScaledVector(PORTRAIT_DIR, dist);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

export function herCatPortrait(state) {
  const e = portraitEntry(state);
  if (portraitCache.has(e.key)) return portraitCache.get(e.key);
  if (portraitBroken) return null;
  const real = Math.random;
  let renderer = null;
  Math.random = mulberry32(seedFromCode('portrait'));
  try {
    const canvas = document.createElement('canvas');
    canvas.width = PORTRAIT_SIZE;
    canvas.height = PORTRAIT_SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(PORTRAIT_SIZE, PORTRAIT_SIZE);
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sun.position.set(2, 4, -3);
    scene.add(sun, new THREE.AmbientLight(0xbfd8ff, 1.1));
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    const snap = makeSnapper(renderer, scene, camera, canvas);
    const url = snap(buildCat(e.breed, e.wear, e.look ? { look: e.look } : {}), portraitFraming);
    portraitCache.set(e.key, url);
    return url;
  } catch (err) {
    portraitBroken = true;
    if (!portraitWarned) { portraitWarned = true; console.warn('Whisker Walk: her cat portrait unavailable', err); note('gl', err); }
    return null;
  } finally {
    try {
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    } finally {
      Math.random = real;
    }
  }
}

// iOS said memory is short (the app's 'whisker-device' event, main.js): drop
// every picture kept here. They are data-URL strings made once and held for
// the life of the page; nothing is lost by letting them go, because each of
// the three makers above builds what is missing the next time it is asked
// (the next visit to the home base), exactly as on a first launch. Pictures
// already on screen keep their own copy. It is a megabyte or two, not a
// rescue: the honest size of what this page can give back cheaply.
export function releaseThumbnails() {
  cache = null;
  customCache.clear();
  portraitCache.clear();
}
