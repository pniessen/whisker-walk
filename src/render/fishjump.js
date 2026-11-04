import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';
import { waterClearance, waterGap, onDeck, deckDistance } from '../world/builder.js';

// ---------------------------------------------------------------------------
// JUMPING FISH — now and then a little silver fish leaps out of a lake with a
// splash, arcs, and drops back in (polish-waterlife).
//
// THE BUDGET. One InstancedMesh ('fishJump'), FISH_CAP instances, a 20-
// triangle merged geometry. At most ONE main-pass draw call, and only for the
// 0.9 s a fish is in the air; none in the shadow pass (castShadow and
// receiveShadow false, userData.noCast); NONE while no fish is live, because
// the mesh is `visible` only while it holds one. Nothing is allocated per
// frame: the spots are found once at construction, the leap's numbers once
// per FISH_SLOT-second slot (jumpAt's tiny generator), and update() writes
// into preallocated vectors.
//
// WHERE. fishSpots(): a 2 m grid over the bounds (+10 m), kept where the water
// is ≥ 2.5 m from every shore (waterClearance; decks excluded) and is a lake,
// pond or pool — not the sea, not a bog. A 5 m stream is never 2.5 m from both
// banks, so streams have none. The docks, gorge, seaside, neighbourhood and
// den have no fish at all.
//
// WHEN. Wall-clock slots of FISH_SLOT s; slot k's leap starts FISH_JITTER·h s
// in, h from mulberry32(seedFromCode(`fish-${areaId}-${k}`)) — so leaps come
// 8–20 s apart and co-walkers on one map see them at about the same moment (each
// device's own clock; each picks its own spot near its own cat). A slot leaps at most once, and only
// within 0.5 s of its start: a tab back from the background starts at most one.
//
// PURELY LOCAL. Never walkRng, never the wire, never Math.random.
//
// REDUCED MOTION: no fish (NO_FISH).
// ---------------------------------------------------------------------------

export const FISH_SLOT = 14; // s per slot: one leap at most per slot
export const FISH_JITTER = 6; // s: a slot's leap starts within its first 6 s
export const FISH_DUR = 0.9; // s in the air
export const FISH_NEAR = 5; // m: no nearer the cat than this
export const FISH_FAR = 16; // m: no farther than this
export const FISH_CAP = 3; // instances

const NO_FISH_AREAS = Object.freeze(['docks', 'gorge', 'seaside', 'neighborhood', 'den']);
const GRID = 2; // m
const PAD = 10; // m past the bounds
const DEEP = -2.5; // waterClearance below this: ≥ 2.5 m from every shore
const MAX_SPOTS = 64;
const LATE = 0.5; // s: a slot fires only this soon after its start
const CONE = Math.cos((55 * Math.PI) / 180);
const LEAVE = Object.freeze({ ring: true, drops: 5 });
const LAND = Object.freeze({ ring: true, drops: 7 });

// The stub: an area without lake fish, or reduced motion.
export const NO_FISH = Object.freeze({
  meshes: Object.freeze([]),
  spots: Object.freeze([]),
  update() {},
  dispose() {},
  get drawCount() { return 0; },
});

// The handle of the fish-worthy water under (x, z), or null. Where footprints
// overlap, ANY containing non-sea, non-bog water will do.
function lakeAt(waterFx, x, z) {
  for (const h of waterFx) {
    if (h.style === 'sea' || h.style === 'bog') continue;
    const w = h.footprint;
    if (!w || onDeck(w, x, z)) continue;
    if (waterGap(w, x, z) < 0) return h;
  }
  return null;
}

// fishSpots(areaId, areaData) -> [{ x, z, y }] — at most MAX_SPOTS, thinned
// by an even stride over the grid order. Pure.
export function fishSpots(areaId, areaData) {
  if (NO_FISH_AREAS.includes(areaId)) return [];
  const waters = areaData?.waters;
  const waterFx = areaData?.waterFx;
  const b = areaData?.bounds;
  if (!waters?.length || !waterFx?.length || !b) return [];
  const all = [];
  for (let x = b.minX - PAD; x <= b.maxX + PAD; x += GRID) {
    for (let z = b.minZ - PAD; z <= b.maxZ + PAD; z += GRID) {
      if (!(waterClearance(waters, x, z) < DEEP)) continue;
      if (!(deckDistance(waters, x, z) > 1.5)) continue; // never under a bridge
      const h = lakeAt(waterFx, x, z);
      if (h) all.push({ x, z, y: h.y });
    }
  }
  if (all.length <= MAX_SPOTS) return all;
  const out = [];
  const stride = all.length / MAX_SPOTS;
  for (let i = 0; i < MAX_SPOTS; i++) out.push(all[Math.floor(i * stride)]);
  return out;
}

// jumpAt(areaId, slot) -> { at, pick, len, height, yaw }: `at` is the leap's
// start in seconds (inside slot `slot`), the rest 0..1. Deterministic.
export function jumpAt(areaId, slot) {
  const r = mulberry32(seedFromCode(`fish-${areaId}-${slot}`));
  const at = slot * FISH_SLOT + FISH_JITTER * r();
  return { at, pick: r(), len: r(), height: r(), yaw: r() };
}

// The fish, nose along +x: an 8-sided double cone (16 triangles, ~0.43 long,
// 0.12 high, 0.07 wide: 0.32/0.09/0.05 x FISH_SCALE) and a forked tail (2
// triangles, drawn from both sides: 4). 20 triangles, non-indexed, merged here once.
const FISH_SCALE = 1.35;
function fishGeometry() {
  const S = FISH_SCALE;
  const L = 0.32 * S;
  const H = 0.09 * S;
  const W = 0.05 * S;
  const nose = [L / 2, 0, 0];
  const tail = [-L / 2, 0, 0];
  const ringX = 0.03 * S; // the fattest point, a little forward of the middle
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring.push([ringX, Math.cos(a) * (H / 2), Math.sin(a) * (W / 2)]);
  }
  const v = [];
  const tri = (a, b, c) => v.push(...a, ...b, ...c);
  for (let i = 0; i < 8; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % 8];
    tri(nose, c, a);
    tri(tail, a, c);
  }
  // The tail fin: two lobes from the tail point, a notch between them.
  const t0 = [-L / 2 + 0.02 * S, 0, 0];
  const up = [-L / 2 - 0.08 * S, 0.055 * S, 0];
  const dn = [-L / 2 - 0.08 * S, -0.055 * S, 0];
  const notch = [-L / 2 - 0.045 * S, 0, 0];
  tri(t0, up, notch);
  tri(t0, notch, dn);
  tri(t0, notch, up);
  tri(t0, dn, notch);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// createFishJumps(scene, { areaId, areaData, tier, reducedMotion, splash, cat,
// camera, now }) -> { meshes, spots, update(dt), dispose(), drawCount }
// `cat` is a THREE object (its .position is read live), `camera` the walk's
// camera, `now()` the wall clock in seconds.
export function createFishJumps(scene, {
  areaId, areaData, reducedMotion = false, splash, cat, camera, now = () => Date.now() / 1000,
} = {}) {
  if (reducedMotion) return NO_FISH;
  const spots = fishSpots(areaId, areaData);
  if (!spots.length) return NO_FISH;

  const geometry = fishGeometry();
  const material = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.35, metalness: 0.4, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, FISH_CAP);
  mesh.name = 'fishJump';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.frustumCulled = false; // it moves every frame; cached bounds would go stale
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  scene.add(mesh);

  // fp: [x0, z0, y, dx, dz, len, peak, age, yaw] per slot; live while age < FISH_DUR.
  const S = 9;
  const fp = new Float64Array(FISH_CAP * S);
  for (let i = 0; i < FISH_CAP; i++) fp[i * S + 7] = FISH_DUR;
  let head = 0;

  // The current slot's leap, refreshed once per slot.
  let slot = -Infinity;
  let jump = null;
  let fired = -Infinity;

  const fwd = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YZX');
  const one = new THREE.Vector3(1, 1, 1);

  // Index into `spots` of the pick-th spot 6–25 m from the cat and inside the
  // camera's forward cone, or -1 when there is none.
  function chooseSpot(pick) {
    if (!cat?.position || !camera?.getWorldDirection) return -1;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    const fl = Math.hypot(fwd.x, fwd.z);
    if (fl < 1e-6) return -1;
    const fx = fwd.x / fl;
    const fz = fwd.z / fl;
    const cx = cat.position.x;
    const cz = cat.position.z;
    let n = 0;
    for (let pass = 0; pass < 2; pass++) {
      const want = pass === 1 ? Math.min(n - 1, Math.floor(pick * n)) : -1;
      let seen = 0;
      for (let i = 0; i < spots.length; i++) {
        const dx = spots[i].x - cx;
        const dz = spots[i].z - cz;
        const d = Math.hypot(dx, dz);
        if (d < FISH_NEAR || d > FISH_FAR) continue;
        if ((fx * dx + fz * dz) / d <= CONE) continue;
        if (pass === 0) n++;
        else if (seen++ === want) return i;
      }
      if (n === 0) return -1;
    }
    return -1;
  }

  function launch(spot, j) {
    const o = (head % FISH_CAP) * S;
    head++;
    const yaw = j.yaw * Math.PI * 2;
    fp[o] = spot.x;
    fp[o + 1] = spot.z;
    fp[o + 2] = spot.y;
    // Local +x (the nose) turned by `yaw` about +y points (cos, 0, -sin).
    fp[o + 3] = Math.cos(yaw);
    fp[o + 4] = -Math.sin(yaw);
    fp[o + 5] = 0.7 + 0.5 * j.len;
    fp[o + 6] = 0.55 + 0.35 * j.height;
    fp[o + 7] = 0;
    fp[o + 8] = yaw;
    splash?.emitAt?.(spot.x, spot.z, LEAVE);
  }

  function update(dt) {
    const t = now();
    const k = Math.floor(t / FISH_SLOT);
    if (k !== slot) {
      slot = k;
      jump = jumpAt(areaId, k); // once per slot, never per frame
    }
    if (fired !== k && t >= jump.at) {
      fired = k; // fired or skipped, this slot is spent
      if (t - jump.at <= LATE) {
        const i = chooseSpot(jump.pick);
        if (i >= 0) launch(spots[i], jump);
      }
    }

    const step = Math.max(0, dt || 0);
    let n = 0;
    for (let i = 0; i < FISH_CAP; i++) {
      const o = i * S;
      if (fp[o + 7] >= FISH_DUR) continue;
      fp[o + 7] += step;
      if (fp[o + 7] >= FISH_DUR) {
        fp[o + 7] = FISH_DUR;
        splash?.emitAt?.(fp[o] + fp[o + 3] * fp[o + 5], fp[o + 1] + fp[o + 4] * fp[o + 5], LAND);
        continue;
      }
      const u = fp[o + 7] / FISH_DUR;
      const len = fp[o + 5];
      const peak = fp[o + 6];
      pos.set(fp[o] + fp[o + 3] * len * u, fp[o + 2] + 4 * peak * u * (1 - u), fp[o + 1] + fp[o + 4] * len * u);
      // The nose follows the velocity: up on the way out, down on the way in.
      euler.set(0, fp[o + 8], Math.atan2(4 * peak * (1 - 2 * u), len));
      quat.setFromEuler(euler);
      mesh.setMatrixAt(n++, m4.compose(pos, quat, one));
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    mesh.dispose();
  }

  return {
    meshes: [mesh],
    spots,
    update,
    dispose,
    get drawCount() { return mesh.visible ? 1 : 0; },
  };
}
