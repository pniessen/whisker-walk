import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { CATALOG } from './progression.js';

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
    if (closeUp) {
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
      if (!customWarned) { customWarned = true; console.warn('Whisker Walk: custom portraits unavailable', err); }
    } finally {
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    }
  }
  const out = {};
  for (const e of entries) if (customCache.has(e.key)) out[e.key] = customCache.get(e.key);
  return out;
}
