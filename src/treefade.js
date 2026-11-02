// The walk camera's tree fade (polish pass 1a Task 4).
//
// The follow camera can end up inside a canopy or behind a trunk (camps, the
// Gorge clifftop, the Pines and its island, and right after a fight ends).
// Rather than move the camera — anything inside player.update would change
// the flat trace — this fades the trees that are in the way, every walk
// frame, AFTER player.update and the fight camera have placed the camera.
//
// "In the way" reuses the fight camera's tree shapes (findOccluders): the
// line from the camera to the cat's look point passes through the tree
// (segmentBlocked with a 0.15 pad), or the camera stands inside the tree's
// padded bounding cylinder.
//
// Fading swaps each mesh's material for a per-tree clone (transparent, no
// depth write), so a material another tree shares is never touched, and the
// shadow pass is unchanged (castShadow is not written, and three.js's depth
// material ignores opacity/transparent). When the tree reaches full opacity
// again the original goes back; clones are kept for reuse and disposed in
// dispose(). `visible` is never written: the fight camera owns it.
//
// Merged pine stands (occluder.obj === null) are left alone: their pines
// cannot be faded one by one without per-instance work (parked).
import { segmentBlocked } from './fightcam.js';

export const FADE_OPACITY = 0.28;
const FADE_DOWN_S = 0.2; // full → FADE_OPACITY
const FADE_UP_S = 0.4; // FADE_OPACITY → full
const LINE_PAD = 0.15;

const DOWN_RATE = (1 - FADE_OPACITY) / FADE_DOWN_S;
const UP_RATE = (1 - FADE_OPACITY) / FADE_UP_S;

function cloneFor(m) {
  const c = m.clone();
  // Material.clone() does not copy these; a clone must compile the same shader.
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.transparent = true;
  c.depthWrite = false;
  return c;
}

export function createTreeFade(occluders = [], { reducedMotion = false } = {}) {
  const trees = [];
  for (const occ of occluders) {
    if (occ.obj) trees.push({ occ, obj: occ.obj, op: 1, swapped: false, meshes: null, originals: null, clones: null, base: null, cache: null });
  }
  const faded = new Set();
  const cam = { x: 0, y: 0, z: 0 }; // reused every frame
  let disposed = false;

  // First fade of a tree: find its meshes, remember their materials, clone.
  function prepare(t) {
    t.meshes = [];
    t.originals = [];
    t.obj.traverse((o) => { if (o.isMesh) { t.meshes.push(o); t.originals.push(o.material); } });
    t.cache = new Map(); // original → clone, so two meshes sharing one share its clone
    const one = (m) => {
      let c = t.cache.get(m);
      if (!c) { c = cloneFor(m); t.cache.set(m, c); }
      return c;
    };
    t.clones = t.originals.map((m) => (Array.isArray(m) ? m.map(one) : one(m)));
    t.base = [...t.cache.keys()].map((m) => m.opacity);
  }

  function setOpacity(t) {
    let i = 0;
    for (const c of t.cache.values()) c.opacity = t.base[i++] * t.op;
  }

  function swapIn(t) {
    if (!t.meshes) prepare(t);
    for (let i = 0; i < t.meshes.length; i++) t.meshes[i].material = t.clones[i];
    t.swapped = true;
    faded.add(t.obj);
  }

  function swapOut(t) {
    for (let i = 0; i < t.meshes.length; i++) t.meshes[i].material = t.originals[i];
    t.swapped = false;
    faded.delete(t.obj);
  }

  return {
    update(dt, camera, look) {
      if (disposed || trees.length === 0) return;
      const p = camera.position;
      cam.x = p.x; cam.y = p.y; cam.z = p.z;
      const camDist = Math.hypot(cam.x - look.x, cam.y - look.y, cam.z - look.z);
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const o = t.occ;
        let want = false;
        // quick reject: a tree farther from the cat than the camera can reach
        if (Math.hypot(o.x - look.x, o.z - look.z) <= camDist + o.R) {
          want = (Math.hypot(cam.x - o.x, cam.z - o.z) < o.R && cam.y < o.top)
            || segmentBlocked(cam, look, o, LINE_PAD);
        }
        if (!want && t.op >= 1) continue;
        const target = want ? FADE_OPACITY : 1;
        if (reducedMotion) t.op = target;
        else if (want) t.op = Math.max(target, t.op - DOWN_RATE * dt);
        else t.op = Math.min(1, t.op + UP_RATE * dt);
        if (t.op >= 1) {
          t.op = 1;
          if (t.swapped) swapOut(t);
          continue;
        }
        if (!t.swapped) swapIn(t);
        setOpacity(t);
      }
    },
    // The tree Groups currently below full opacity (live; read-only).
    faded() { return faded; },
    dispose() {
      for (const t of trees) {
        if (t.swapped) swapOut(t);
        t.op = 1;
        if (t.cache) for (const c of t.cache.values()) c.dispose();
        t.meshes = t.originals = t.clones = t.base = t.cache = null;
      }
      faded.clear();
      disposed = true;
    },
  };
}
