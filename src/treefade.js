// The walk camera's tree fade (polish pass 1a Task 4).
//
// The follow camera can end up inside a canopy or behind a trunk (camps, the
// Gorge clifftop, the Pines and its island, and right after a fight ends).
// Rather than move the camera — anything inside player.update would change
// the flat trace — this fades the trees that are in the way, every walk
// frame, AFTER player.update and the fight camera have placed the camera.
//
// "In the way" reuses the fight camera's tree shapes (findOccluders): the
// line from the camera to the cat's look point, carried on PAST_LOOK (1.2 m)
// beyond the look point level with it, passes through the tree
// (segmentBlocked with a 0.15 pad), or the camera stands inside the tree's
// padded bounding cylinder. The extension is ruling R11: on the Pines island
// a stand pine just behind the cat filled the phone screen without ever being
// on the camera→cat line. It runs horizontally (look.y), so it reaches a
// trunk behind the cat and not the ground or a canopy far above it.
//
// Fading swaps each mesh's material for a per-tree clone (transparent, no
// depth write), so a material another tree shares is never touched, and the
// shadow pass is unchanged (castShadow is not written, and three.js's depth
// material ignores opacity/transparent). When the tree reaches full opacity
// again the original goes back; clones are kept for reuse and disposed in
// dispose(). `visible` is never written: the fight camera owns it.
//
// Buildings and lamps (polish-viewclear2). findFadeOccluders adds two more
// kinds of entry, fed to the same per-object path. A top-level scene group that
// holds a userData.window mesh (builder.house, builder.warehouse) gets a box;
// the whole building fades when the camera is inside the box or within
// BUILDING_PAD of it, or when the camera→look segment (not the PAST_LOOK
// extension: a building beyond the cat stays solid) meets the box. A group with
// userData.fadeOccluder (a lamp post) gets its shapes placed like a trunk, with
// no wind lean, and fades by the same line test as a tree.
//
// Merged pine stands (builder.pineStand: occluder.obj === null, with
// occluder.stand and occluder.index) fade one pine at a time. Every pine in a
// stand has the same parts, merged in tree order, so pine i owns the index
// range [i * per, (i + 1) * per) of each stand mesh, per = index.count / trees
// (a stand whose meshes do not split that way is left alone for good). Each
// stand pine eases on its own like a Group tree; while any is below full
// opacity the mesh's material becomes [original, ...one clone per faded pine]
// and geometry.groups covers the index buffer in order: a run of unfaded
// pines is one group on the original, each faded pine its own group on its
// clone. When none is faded the original goes back and the groups are
// cleared. The shadow pass still draws every group, so the shadow stays.
import * as THREE from 'three';
import { segmentBlocked } from './fightcam.js';

export const FADE_OPACITY = 0.05;
export const PAST_LOOK = 1.2; // m the fade line runs on beyond the look point (R11)
const FADE_DOWN_S = 0.2; // full → FADE_OPACITY
const FADE_UP_S = 0.4; // FADE_OPACITY → full
const LINE_PAD = 0.15;
export const BUILDING_PAD = 0.4; // m: a camera this close to a building's box counts as inside it

const DOWN_RATE = (1 - FADE_OPACITY) / FADE_DOWN_S;
const UP_RATE = (1 - FADE_OPACITY) / FADE_UP_S;

// Whether the segment a→b meets the box (slab test). No allocation.
export function segmentHitsBox(a, b, box) {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const a0 = k === 0 ? a.x : k === 1 ? a.y : a.z;
    const d = (k === 0 ? b.x : k === 1 ? b.y : b.z) - a0;
    const lo = k === 0 ? box.minX : k === 1 ? box.minY : box.minZ;
    const hi = k === 0 ? box.maxX : k === 1 ? box.maxY : box.maxZ;
    if (Math.abs(d) < 1e-12) {
      if (a0 < lo || a0 > hi) return false;
    } else {
      let u = (lo - a0) / d, v = (hi - a0) / d;
      if (u > v) { const w = u; u = v; v = w; }
      if (u > t0) t0 = u;
      if (v < t1) t1 = v;
      if (t0 > t1) return false;
    }
  }
  return true;
}

// Fade-only entries for the walk camera: tagged shapes (userData.fadeOccluder)
// and window-bearing building groups. Same entry shape as findOccluders.
export function findFadeOccluders(scene) {
  const out = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const shapes = o.userData?.fadeOccluder;
    if (!shapes) return;
    const e = o.matrixWorld.elements;
    const s = Math.hypot(e[0], e[1], e[2]);
    const px = e[12], py = e[13], pz = e[14];
    const placed = shapes.map((sh) => (sh.t === 'cyl'
      ? { t: 'cyl', x: px, z: pz, r: sh.r * s, y0: py + sh.y0 * s, y1: py + sh.y1 * s, p: 0 }
      : { t: 'ell', x: px, y: py + sh.y * s, z: pz, r: sh.r * s, ry: sh.ry * s, p: 0 }));
    const R = Math.max(...placed.map((q) => q.r));
    const top = Math.max(...placed.map((q) => (q.t === 'cyl' ? q.y1 : q.y + q.ry)));
    out.push({ obj: o, x: px, z: pz, R, top, shapes: placed });
  });
  for (const child of scene.children) {
    if (child.isMesh || child.userData?.occluder || child.userData?.occluderStand) continue;
    let hasWindow = false;
    child.traverse((o) => { if (o.isMesh && o.userData?.window) hasWindow = true; });
    if (!hasWindow) continue;
    const b = new THREE.Box3().setFromObject(child);
    out.push({
      obj: child,
      box: { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z },
      x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2,
      R: Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2, top: b.max.y,
    });
  }
  return out;
}

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
  const stands = new Map(); // stand Group → its state (see prepareStand)
  const standTrees = [];
  for (const occ of occluders) {
    if (occ.obj) trees.push({ occ, obj: occ.obj, op: 1, swapped: false, meshes: null, originals: null, clones: null, base: null, cache: null });
    else if (occ.stand && Number.isInteger(occ.index)) {
      let st = stands.get(occ.stand);
      if (!st) {
        st = { group: occ.stand, ok: null, meshes: null, originals: null, base: null, per: null, trees: [], shown: '', applied: false };
        stands.set(occ.stand, st);
      }
      const t = { occ, st, index: occ.index, op: 1, clones: null };
      st.trees.push(t);
      standTrees.push(t);
    }
  }
  const faded = new Set();
  const moved = new Set(); // stands with a tree that eased this frame (reused)
  const cam = { x: 0, y: 0, z: 0 }; // reused every frame
  const far = { x: 0, y: 0, z: 0 }; // the fade line's end, PAST_LOOK beyond the look point (reused)
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

  // First use of a stand: its meshes, and whether each splits into one equal
  // index range per tree (every pine has the same parts). If not, never again.
  function prepareStand(st) {
    if (st.ok !== null) return st.ok;
    const n = st.group.userData?.occluderStand?.trees?.length ?? 0;
    const meshes = [];
    st.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    st.ok = n > 0 && meshes.length > 0
      && st.trees.every((t) => t.index >= 0 && t.index < n)
      && meshes.every((m) => {
        const idx = m.geometry?.index;
        return idx && idx.count > 0 && idx.count % (n * 3) === 0
          && m.geometry.groups.length === 0 && !Array.isArray(m.material);
      });
    if (!st.ok) return false;
    st.meshes = meshes;
    st.originals = meshes.map((m) => m.material);
    st.base = st.originals.map((m) => m.opacity);
    st.per = meshes.map((m) => m.geometry.index.count / n);
    return true;
  }

  // Put a stand's meshes into the state for the given faded trees (sorted by
  // index): the originals when there are none, else material arrays + groups.
  function applyStand(st, fadedTrees) {
    for (let k = 0; k < st.meshes.length; k++) {
      const m = st.meshes[k], geo = m.geometry, orig = st.originals[k];
      geo.clearGroups();
      if (fadedTrees.length === 0) { m.material = orig; continue; }
      const mats = [orig];
      const per = st.per[k];
      let runStart = 0; // start of the current run of unfaded trees
      for (const t of fadedTrees) {
        const start = t.index * per;
        if (start > runStart) geo.addGroup(runStart, start - runStart, 0);
        if (!t.clones) t.clones = st.originals.map(cloneFor);
        mats.push(t.clones[k]);
        geo.addGroup(start, per, mats.length - 1);
        runStart = start + per;
      }
      if (runStart < geo.index.count) geo.addGroup(runStart, geo.index.count - runStart, 0);
      m.material = mats;
    }
    st.applied = fadedTrees.length > 0;
  }

  function setStandOpacity(t) {
    const st = t.st;
    for (let k = 0; k < t.clones.length; k++) t.clones[k].opacity = st.base[k] * t.op;
  }

  // After the per-tree pass, for a stand one of whose trees moved this frame:
  // rebuild it when its set of faded trees changed, then set the opacities.
  function syncStand(st) {
    if (!st.ok) return;
    const fadedTrees = st.trees.filter((t) => t.op < 1).sort((a, b) => a.index - b.index);
    const key = fadedTrees.map((t) => t.index).join(',');
    if (key !== st.shown) { applyStand(st, fadedTrees); st.shown = key; }
    for (const t of fadedTrees) setStandOpacity(t);
  }

  function restoreStand(st) {
    if (!st.ok) return;
    if (st.applied) applyStand(st, []);
    st.shown = '';
    for (const t of st.trees) t.op = 1;
  }

  // Eases the tree toward faded (in the way) or full; false when it is full and
  // clear, so there is nothing to do.
  function step(t, dt, look, camDist, hidden) {
    const o = t.occ;
    let want = false;
    if (o.box) {
      // a building: the camera inside (or within BUILDING_PAD), or the cam→look segment through it
      if (Math.hypot(o.x - look.x, o.z - look.z) <= camDist + o.R + BUILDING_PAD) {
        const b = o.box;
        want = (cam.x >= b.minX - BUILDING_PAD && cam.x <= b.maxX + BUILDING_PAD
          && cam.y >= b.minY - BUILDING_PAD && cam.y <= b.maxY + BUILDING_PAD
          && cam.z >= b.minZ - BUILDING_PAD && cam.z <= b.maxZ + BUILDING_PAD)
          || segmentHitsBox(cam, look, b);
      }
    } else if (Math.hypot(o.x - look.x, o.z - look.z) <= camDist + o.R + PAST_LOOK) {
      // quick reject passed: a tree farther from the cat than the fade line can reach is skipped
      want = (Math.hypot(cam.x - o.x, cam.z - o.z) < o.R && cam.y < o.top)
        || segmentBlocked(cam, far, o, LINE_PAD);
    }
    if (!want && t.op >= 1) return false;
    const target = want ? FADE_OPACITY : 1;
    // A tree the fight camera hid (fightcam.js) snaps: it reappears already
    // faded instead of opaque-then-easing in front of the cat.
    if (reducedMotion || (want && hidden)) t.op = target;
    else if (want) t.op = Math.max(target, t.op - DOWN_RATE * dt);
    else t.op = Math.min(1, t.op + UP_RATE * dt);
    if (t.op >= 1) t.op = 1;
    return true;
  }

  return {
    update(dt, camera, look) {
      if (disposed || (trees.length === 0 && standTrees.length === 0)) return;
      const p = camera.position;
      cam.x = p.x; cam.y = p.y; cam.z = p.z;
      const camDist = Math.hypot(cam.x - look.x, cam.y - look.y, cam.z - look.z);
      const h = Math.hypot(look.x - cam.x, look.z - cam.z);
      if (h > 1e-3) {
        far.x = look.x + ((look.x - cam.x) / h) * PAST_LOOK;
        far.z = look.z + ((look.z - cam.z) / h) * PAST_LOOK;
      } else { far.x = look.x; far.z = look.z; }
      far.y = look.y;
      for (let i = 0; i < standTrees.length; i++) {
        const t = standTrees[i];
        const st = t.st;
        if (st.ok === false) continue;
        if (!step(t, dt, look, camDist, st.group.visible === false)) continue;
        if (t.op < 1 && !prepareStand(st)) { for (const u of st.trees) u.op = 1; continue; }
        moved.add(st);
      }
      if (moved.size > 0) { for (const st of moved) syncStand(st); moved.clear(); }
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        if (!step(t, dt, look, camDist, t.obj.visible === false)) continue;
        if (t.op >= 1) {
          t.op = 1;
          if (t.swapped) swapOut(t);
          continue;
        }
        if (!t.swapped) swapIn(t);
        setOpacity(t);
      }
    },
    // Walk start: the first fade would compile each tree material's transparent
    // variant mid-walk (a stutter on a phone). One tree of each kind (its
    // materials' type and shader key) is swapped into its clones for
    // `compile` (walk.js: renderer.compile), then every original goes back.
    prewarm(compile) {
      if (disposed) return;
      const kinds = new Set(), picked = [];
      for (const t of trees) {
        let key = '';
        t.obj.traverse((o) => {
          if (o.isMesh) for (const m of [].concat(o.material)) key += `${m.type}:${m.customProgramCacheKey()}:${m.vertexColors}:${m.side}:${m.flatShading}:${!!m.map}|`;
        });
        if (!kinds.has(key)) { kinds.add(key); picked.push(t); }
      }
      for (const t of picked) swapIn(t);
      // ...and tree 0 of each usable stand in its faded state.
      const warm = [];
      for (const st of stands.values()) {
        if (!prepareStand(st)) continue;
        const t = st.trees.reduce((a, b) => (b.index < a.index ? b : a));
        applyStand(st, [t]);
        for (let k = 0; k < t.clones.length; k++) t.clones[k].opacity = st.base[k] * FADE_OPACITY;
        warm.push(st);
      }
      try { compile(); } finally {
        for (const t of picked) swapOut(t);
        // back to what the walk had shown
        for (const st of warm) { st.shown = null; syncStand(st); }
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
      for (const st of stands.values()) {
        restoreStand(st);
        for (const t of st.trees) {
          if (t.clones) for (const c of t.clones) c.dispose();
          t.clones = null;
        }
      }
      faded.clear();
      disposed = true;
    },
  };
}
