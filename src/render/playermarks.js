import * as THREE from 'three';
import { buildCarryMesh } from '../carryables.js';
import { markKey, markOpacity, MARKS_PER_AREA, MARK_KINDS } from '../marks.js';
import { propsFor } from '../propsets.js';
import { litMaterial } from './materials.js';

// =============================================================================
// Player marks — the renderer half of the private per-area marks (v21 Stream
// 3b). The rules live in marks.js; this draws them.
//
//   createPlayerMarks(scene, areaId, marks,
//                     { keepSlots = [], colliders = [], isWalkable, spawn } = {})
//     → { list: [{ key, kind, mesh, contested }], posts, sync(marks),
//         setContested(key), update(t), dispose() }
//
// THE DEN HALF (Task 7). In the den, the `den` marks are what the player
// carried home. They are laid NEWEST FIRST into keepSlots[0..7] (a mark's
// stored x/z are ignored: the den lays its own table), each as
// buildCarryMesh(item) resting on the floor, faded by markOpacity(rank). The
// den keeps its own cap of eight (ruling P4), the same MARKS_PER_AREA the save
// trims to, so a ninth arriving has already pushed the oldest out of the list
// by the time sync() sees it. Any other mark kind in the den is ignored.
//
// THE OUTDOOR HALF (Task 11). Every kind but `den`, each where it was left:
//   scratch  three short dark claw stripes on a small scuffed patch, upright at
//            the foot of the post, trunk or bollard, turned to face the side
//            the cat comes at it from (scratchFacing below);
//   dig      a flat, darker filled-in hole on the ground (scent.js's decal);
//   drop     the thing itself, lying on the ground where it was put down —
//            decoration only, nothing picks it up (ruling P5);
//   border   a small paw print in the player's own colour (Task 12 writes it).
// A scratch whose id names a current markable sits on that markable; any other
// mark, and a scratch whose prop has been retired since, sits at its stored
// x/z. A mark with neither (no usable id and no finite x/z) is skipped.
// Opacity ranks across ALL of the area's marks, every kind together, newest
// first — the same order the save's cap evicts in — so the two oldest in the
// area are the faint ones whatever they are.
//
// A markable with `mesh: true` has nothing standing there in the world (the
// contest-band posts, ruling R4), so this module puts up a short wooden post
// for it at creation, whether or not it carries a mark yet: the player has to
// be able to find it to scratch it. Those posts are in `posts`, not `list`.
//
// THE CONTESTED LOOK. A contested mark keeps its opacity and turns the pale
// sandy colour bordermarks.js uses for a contested rival mark. setContested
// swaps it in; sync() sets every mark's look from the save, both ways.
//
// Nothing here animates, so update(t) is a no-op and main.js does not call it.
//
// Everything here is a scene child created per mark and disposed exactly once,
// the goldmice.js pattern. buildCarryMesh makes fresh geometry per call; the
// materials are cloned per mesh on top, so fading one item (or one part of an
// item) can never fade another. sync() rebuilds only what changed, by markKey;
// a survivor keeps its mesh and just moves to its new place and opacity.
//
// PRIVATE. Nothing in this file touches a wire (marks.js's header).
// =============================================================================

// The pale sandy contested colour, bordermarks.js's own.
export const CONTESTED_COLOR = 0xe6d9b8;
// The player's own colour, for the paw left on a rival's border: a warm ginger
// that is not the rival's earthy brown (0x8a5a2b) or the contested sand.
export const PLAYER_COLOR = 0xe0782f;
// A flat thing on the ground or the boards lifts this much more, so it never
// z-fights the surface it lies on.
const FLAT_LIFT = 0.002;
const DIG_Y = 0.02;
// Above the rival's border decals (bordermarks.js, y 0.025) and scent.js's
// trail dots (0.03): a paw on their mark sits on top of it.
const PAW_Y = 0.032;
const DIG_COLOR = 0x4a3524;
const SCUFF_COLOR = 0x9c7a55;
const CLAW_COLOR = 0x24170e;
const POST_COLOR = 0x7a5a3a;
// The posts this module puts up: short, plain, wooden.
const POST_R = 0.08;
const POST_H = 0.9;

// How far the claw patch stands off the markable's (x, z), and its size, per
// kind. A tree's (x, z) already sits on the trunk's face (propsets.js); a post
// or bollard's (x, z) is its centre, so the patch stands out by its radius.
const SCRATCH = {
  tree: { out: 0, w: 0.24, h: 0.32 },
  bollard: { out: 0.2, w: 0.2, h: 0.26 },
  post: { out: POST_R, w: 0.12, h: 0.28 },
};
const SCRATCH_BASE = 0.08; // the patch's lower edge above the ground
const SCRATCH_GAP = 0.008; // clear of the surface it is on
// Probe distance for "which way is open ground" around a post.
const PROBE = 0.6;
const PROBES = 16;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n);

// scratchFacing(markable, { colliders, isWalkable, spawn }) → { x, z }, a unit
// vector on the ground: the side of the markable a cat stands on to scratch
// it, which is the side the claw marks face. In order:
//   1. a markable inside a collider (a tree trunk) faces outward from that
//      collider's centre through its (x, z) — the side test/propsets.test.js
//      approaches it from;
//   2. otherwise the open ground around it: the mean of the walkable
//      directions PROBE metres out (a quayside bollard faces the quay, not
//      the water);
//   3. ground open all round faces back toward the spawn, the way a walk
//      comes in;
//   4. and with nothing to go on, +z.
// Pure: no randomness, so a reload turns every mark the same way.
export function scratchFacing(m, { colliders = [], isWalkable, spawn } = {}) {
  const held = (Array.isArray(colliders) ? colliders : []).filter((c) => finite(c?.x) && finite(c?.z) && finite(c?.r)
    && Math.hypot(m.x - c.x, m.z - c.z) < c.r);
  if (held.length) {
    const c = held.reduce((a, b) => (Math.hypot(m.x - a.x, m.z - a.z) - a.r <= Math.hypot(m.x - b.x, m.z - b.z) - b.r ? a : b));
    const dx = m.x - c.x;
    const dz = m.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) return { x: dx / d, z: dz / d };
  }
  if (typeof isWalkable === 'function') {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < PROBES; i++) {
      const t = (i / PROBES) * Math.PI * 2;
      if (isWalkable(m.x + Math.sin(t) * PROBE, m.z + Math.cos(t) * PROBE)) {
        sx += Math.sin(t);
        sz += Math.cos(t);
      }
    }
    const d = Math.hypot(sx, sz);
    if (d / PROBES >= 0.1) return { x: sx / d, z: sz / d };
  }
  if (spawn && finite(spawn.x) && finite(spawn.z)) {
    const dx = spawn.x - m.x;
    const dz = spawn.z - m.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) return { x: dx / d, z: dz / d };
  }
  return { x: 0, z: 1 };
}

// A mesh's own materials, cloned so no two meshes ever share one. buildCarryMesh
// already shares nothing between items, but a part-sharing group (one material
// across a sock's two cylinders) would fade as one, and the brief asks for one
// each. The originals are freed straight away; only the clones are ever kept.
function ownMaterials(root) {
  const originals = new Set();
  root.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) {
      o.material.forEach((m) => originals.add(m));
      o.material = o.material.map((m) => m.clone());
    } else {
      originals.add(o.material);
      o.material = o.material.clone();
    }
  });
  originals.forEach((m) => m.dispose());
}

function materialsOf(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) out.push(m);
  });
  return out;
}

// A material's own resting opacity (a decal is never fully solid) times the
// mark's rank fade. Transparent only when the result is below 1, so a den
// keepsake at full strength stays an ordinary opaque mesh.
function setOpacity(root, opacity) {
  for (const m of materialsOf(root)) {
    const o = (m.userData.baseOpacity ?? 1) * opacity;
    m.transparent = o < 1;
    m.opacity = o;
  }
}

// Remember each mark-coloured material's own colour, so the contested look can
// be taken off again. Called once, when the mark is built.
function rememberColors(root) {
  for (const m of materialsOf(root)) {
    if (m.userData.keepColor || !m.color) continue;
    m.userData.markColor = m.color.getHex();
  }
}

function setLook(root, contested) {
  for (const m of materialsOf(root)) {
    if (m.userData.markColor === undefined) continue;
    m.color.setHex(contested ? CONTESTED_COLOR : m.userData.markColor);
  }
}

// Free every geometry and material under a mesh, once each.
function freeMesh(scene, root) {
  scene.remove(root);
  const geos = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
  });
  geos.forEach((g) => g.dispose());
  new Set(materialsOf(root)).forEach((m) => m.dispose());
}

// scent.js's flat decal: an unlit disc laid on the ground. depthWrite off and
// a polygon offset, as bordermarks.js does, so it never fights the ground.
function decalMaterial(color, baseOpacity) {
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  m.userData.baseOpacity = baseOpacity;
  return m;
}

function flatDisc(radius, segments, mat, x = 0, z = 0) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), mat);
  d.rotation.x = -Math.PI / 2;
  d.position.set(x, 0, z);
  return d;
}

// A filled-in hole: one dark disc. Its origin is on the ground.
function buildDig() {
  const g = new THREE.Group();
  g.add(flatDisc(0.28, 16, decalMaterial(DIG_COLOR, 0.8)));
  return g;
}

// A paw print: a pad and four toes, flat, in the player's colour, each part
// with its own material (no sharing, so the dispose count is one each).
function buildPaw() {
  const g = new THREE.Group();
  g.add(flatDisc(0.085, 12, decalMaterial(PLAYER_COLOR, 0.85), 0, 0.02));
  for (const [x, z] of [[-0.085, -0.07], [-0.03, -0.115], [0.03, -0.115], [0.085, -0.07]]) {
    g.add(flatDisc(0.034, 8, decalMaterial(PLAYER_COLOR, 0.85), x, z));
  }
  return g;
}

// Three claw stripes on a scuffed patch, upright, facing local +z. The group's
// origin is on the ground at the foot of the patch's face. The patch keeps its
// colour when contested (keepColor); the stripes are the mark, and go pale.
function buildScratch(kind) {
  const size = SCRATCH[kind] ?? SCRATCH.post;
  const g = new THREE.Group();
  const scuff = new THREE.MeshBasicMaterial({ color: SCUFF_COLOR, transparent: true, opacity: 0.85 });
  scuff.userData.baseOpacity = 0.85;
  scuff.userData.keepColor = true;
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(size.w, size.h), scuff);
  patch.position.set(0, SCRATCH_BASE + size.h / 2, 0);
  g.add(patch);
  const stripeW = size.w * 0.14;
  const stripeH = size.h * 0.72;
  for (let i = -1; i <= 1; i++) {
    const claw = new THREE.MeshBasicMaterial({
      color: CLAW_COLOR, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(stripeW, stripeH), claw);
    s.position.set(i * size.w * 0.27, SCRATCH_BASE + size.h / 2 + i * 0.012, 0.002);
    s.rotation.z = -0.22; // raked down and across, the way a paw drags
    g.add(s);
  }
  return g;
}

// A short wooden post for a markable that has nothing standing there.
function buildPost() {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(POST_R * 0.92, POST_R, POST_H, 10), litMaterial(POST_COLOR));
  post.position.y = POST_H / 2;
  return post;
}

export function createPlayerMarks(scene, areaId, marks, { keepSlots = [], colliders = [], isWalkable, spawn } = {}) {
  const list = [];
  const posts = [];
  let disposed = false;
  const isDen = areaId === 'den';
  const markables = isDen ? [] : propsFor(areaId).markables;
  const markableById = new Map(markables.map((m) => [m.id, m]));
  const facings = new Map(markables.map((m) => [m.id, scratchFacing(m, { colliders, isWalkable, spawn })]));

  for (const m of markables) {
    if (m.mesh !== true) continue;
    const post = buildPost();
    post.position.x = m.x;
    post.position.z = m.z;
    scene.add(post);
    posts.push({ id: m.id, mesh: post });
  }

  // Valid marks, one per key (the save's own dedupe, newest `at` wins), newest
  // first, capped. Stable sort, so equal `at`s keep their save order.
  function newestFirst(all, keepKind) {
    if (!Array.isArray(all)) return [];
    const byKey = new Map();
    for (const m of all) {
      if (!m || typeof m !== 'object' || !keepKind(m.kind)) continue;
      const key = markKey(m);
      const prior = byKey.get(key);
      if (!prior || !(prior.at > m.at)) byKey.set(key, m);
    }
    return [...byKey.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, MARKS_PER_AREA);
  }

  // The den: den marks that get a slot, newest first; rank = slot.
  function wantedDen(all) {
    return newestFirst(all, (k) => k === 'den')
      .slice(0, keepSlots.length)
      .map((mark, rank) => ({ mark, rank, at: keepSlots[rank] }));
  }

  // Where an outdoor mark goes, or null to skip it: { x, z, face? }.
  function spotOf(mark) {
    if (mark.kind === 'scratch') {
      const prop = markableById.get(mark.id);
      if (prop) return { x: prop.x, z: prop.z, face: facings.get(prop.id), propKind: prop.kind };
    }
    if (!finite(mark.x) || !finite(mark.z)) return null;
    if (mark.kind === 'scratch') {
      // A retired prop: no post to know the shape of, so the patch stands at
      // the stored spot facing the way the walk comes in.
      return { x: mark.x, z: mark.z, face: scratchFacing(mark, { spawn }), propKind: 'post' };
    }
    return { x: mark.x, z: mark.z };
  }

  // Outdoors: rank over every mark in the area, then drop the unplaceable.
  function wantedOutdoors(all) {
    const out = [];
    newestFirst(all, (k) => MARK_KINDS.includes(k) && k !== 'den').forEach((mark, rank) => {
      const at = spotOf(mark);
      if (at) out.push({ mark, rank, at });
    });
    return out;
  }

  function wanted(all) {
    return isDen ? wantedDen(all) : wantedOutdoors(all);
  }

  function buildMesh(mark, at) {
    switch (mark.kind) {
      case 'scratch': return buildScratch(at.propKind);
      case 'dig': return buildDig();
      case 'border': return buildPaw();
      default: {
        // den keepsakes and drops: the thing itself
        const mesh = buildCarryMesh(mark.item);
        ownMaterials(mesh);
        return mesh;
      }
    }
  }

  function build(mark, key, at) {
    const mesh = buildMesh(mark, at);
    rememberColors(mesh);
    // Things (den keepsakes, drops) rest on the surface: lift by however far
    // they reach below their origin, taken before the yaw (turning about Y
    // never changes the lowest point), plus the flat lift.
    if (mark.kind === 'den' || mark.kind === 'drop') {
      const box = new THREE.Box3().setFromObject(mesh);
      mesh.userData.lift = (Number.isFinite(box.min.y) ? -box.min.y : 0) + FLAT_LIFT;
    }
    // A fixed turn per thing or paw, from the mark itself, so a table or a
    // trail is not a row of identical bearings. No random draw: a reload lays
    // it the same way. A scratch is turned by its facing instead (place()).
    if (mark.kind !== 'scratch' && mark.kind !== 'dig') mesh.rotation.y = (hash(key) % 628) / 100;
    scene.add(mesh);
    return { key, kind: mark.kind, mesh, contested: false };
  }

  function place(entry, mark, at) {
    const mesh = entry.mesh;
    switch (mark.kind) {
      case 'den':
        mesh.position.set(at.x, (at.y ?? 0) + mesh.userData.lift, at.z);
        break;
      case 'drop':
        mesh.position.set(at.x, mesh.userData.lift, at.z);
        break;
      case 'dig':
        mesh.position.set(at.x, DIG_Y + FLAT_LIFT, at.z);
        break;
      case 'border':
        mesh.position.set(at.x, PAW_Y + FLAT_LIFT, at.z);
        break;
      case 'scratch': {
        const out = (SCRATCH[at.propKind] ?? SCRATCH.post).out + SCRATCH_GAP;
        mesh.position.set(at.x + at.face.x * out, 0, at.z + at.face.z * out);
        mesh.rotation.y = Math.atan2(at.face.x, at.face.z);
        break;
      }
      default:
        break;
    }
  }

  function sync(next) {
    if (disposed) return;
    const want = wanted(next);
    const byKey = new Map(list.map((e) => [e.key, e]));
    const keep = new Set(want.map((w) => markKey(w.mark)));
    for (const e of list) {
      if (!keep.has(e.key)) freeMesh(scene, e.mesh);
    }
    list.length = 0;
    for (const { mark, rank, at } of want) {
      const key = markKey(mark);
      let entry = byKey.get(key);
      if (!entry) entry = build(mark, key, at);
      entry.contested = mark.contested === true;
      place(entry, mark, at);
      setOpacity(entry.mesh, markOpacity(rank));
      setLook(entry.mesh, entry.contested);
      list.push(entry);
    }
  }

  sync(marks);

  return {
    list,
    posts,
    sync,
    // A contested mark changes appearance, never goes away. (A den keepsake or
    // a border paw is never contested — marks.js refuses both.)
    setContested(key) {
      const e = list.find((x) => x.key === key);
      if (!e) return;
      e.contested = true;
      setLook(e.mesh, true);
    },
    // Nothing here moves or pulses, so there is nothing to do per frame.
    update(t) {},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const e of list) freeMesh(scene, e.mesh);
      list.length = 0;
      for (const p of posts) freeMesh(scene, p.mesh);
      posts.length = 0;
    },
  };
}
