import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { REST_KINDS } from './propsets.js';

// =============================================================================
// Rests — somewhere to drink, eat and nap (v21 Stream 3b, Task 15). A water
// bowl or a birdbath for a drink, a food dish or a fish crate for a nibble, a
// sunny cushion or a warm doormat for a nap. For nothing but the fun of it:
// a rest pays nothing, records no feat, moves no goal and sends nothing on any
// wire (ruling P1). Nothing is saved.
//
// Two halves:
//   * createRests(scene, rests) builds the things (propsFor(areaId).rests) and
//     finds the nearest one. A `mesh: false` entry — the den's two bowls and
//     its hearth rug — is something the room already has, so it gets no new
//     mesh (group: null) but answers nearest() all the same.
//   * startRest / tickRest are the rest itself, as pure data: the cat's
//     session.rest = { kind, t }, `t` the seconds it has lasted. A drink or a
//     nibble lasts REST_SIP seconds; a nap lasts until the cat stirs. game/
//     avatar.js ticks it once a frame and turns it into a pose.
//
// THE PURR. audio.purr(duration) is a fire-and-forget one-shot with no stop
// handle, so a nap purrs in short overlapping pieces: one when the nap starts,
// and another every NAP_PURR_EVERY seconds while it lasts. When the nap ends
// (the cat moves, the walk ends, the session is torn down) no further piece is
// asked for, and the last one fades out on its own within NAP_PURR_LEN. The
// overlap rides the purr's own soft ramp in and out, which reads as a cat
// breathing rather than as a seam.
//
// Each mesh and material is created per rest and disposed exactly once in
// dispose() (the knockables.js pattern), which runs before endWalk's scene
// traversal so that traversal never frees them a second time. No randomness.
// =============================================================================

export const REST_SIP = 3;          // seconds: a drink or a nibble
export const NAP_PURR_EVERY = 0.8;  // seconds between purr pieces while napping
export const NAP_PURR_LEN = 1.0;    // seconds: each piece (fades out over its last 0.25)

export const REST_PROMPTS = Object.freeze({
  drink: 'E — have a drink',
  eat: 'E — have a nibble',
  nap: 'E — curl up for a nap',
});
export const REST_TOASTS = Object.freeze({
  drink: 'Slurp, slurp. 💧',
  eat: 'Nom nom. 🐟',
  nap: 'Zzz… 💤',
});

const isRestKind = (k) => typeof k === 'string' && REST_KINDS.includes(k);

// startRest(kind) → { kind, t: 0 }, or null for anything that is not a rest kind.
export function startRest(kind) {
  return isRestKind(kind) ? { kind, t: 0 } : null;
}

// tickRest(rest, dt, { stirred }) → { rest, purr }. `rest` is the next state
// (null once it is over); `purr` is true on the frame a nap's next purr piece
// is due. `stirred` is anything that moves the cat — a nap or a sip ends the
// moment it is true, so nothing can keep a cat lying there. A NaN or negative
// dt winds nothing. Never throws.
export function tickRest(rest, dt, { stirred = false } = {}) {
  if (!rest || !isRestKind(rest.kind)) return { rest: null, purr: false };
  if (stirred) return { rest: null, purr: false };
  const step = dt > 0 ? dt : 0;
  const t0 = Number.isFinite(rest.t) ? rest.t : 0;
  const t = t0 + step;
  if (rest.kind === 'nap') {
    const purr = Math.floor(t / NAP_PURR_EVERY) > Math.floor(t0 / NAP_PURR_EVERY);
    return { rest: { kind: 'nap', t }, purr };
  }
  return { rest: t >= REST_SIP ? null : { kind: rest.kind, t }, purr: false };
}

// -----------------------------------------------------------------------------
// The things themselves.
// -----------------------------------------------------------------------------

// Which of a kind's two looks each curated rest wears, and the floor it stands
// on when that is not the ground. Keyed by the rest's id from propsets.js (ids
// never change once shipped); an id not listed wears its kind's first look.
// test/rests.test.js checks every key here is a real rest id of the right kind.
export const REST_LOOKS = Object.freeze({
  'neighborhood-drink-1': { look: 'birdbath' },
  'neighborhood-eat-1': { look: 'dish' },
  'neighborhood-nap-1': { look: 'doormat' },
  'park-drink-1': { look: 'birdbath' },
  'park-eat-1': { look: 'dish' },
  'park-nap-1': { look: 'cushion' },
  'seaside-drink-1': { look: 'bowl' },
  // On the pier, past the gate: seaside.js draws the deck at y 0.25.
  'seaside-eat-1': { look: 'crate', floor: 0.25 },
  'seaside-nap-1': { look: 'cushion' },
  'docks-drink-1': { look: 'bowl' },
  'docks-eat-1': { look: 'crate' },
  'docks-nap-1': { look: 'doormat' },
});
for (const v of Object.values(REST_LOOKS)) Object.freeze(v);
const DEFAULT_LOOK = Object.freeze({ drink: 'bowl', eat: 'dish', nap: 'cushion' });

// The looks the cat cannot walk through, as a collider radius about the
// rest's (x, z). Only the birdbaths: their stone basin is 0.32 m across the
// rim and stands on open grass. A cat stops at r + CAT_RADIUS (0.65 m), well
// inside the 1.2 m drink reach, with its head over the rim. Everything else is
// low enough to stand over (a bowl, a dish, a cushion, a mat) — and the fish
// crate stays open on purpose: one of them is on the narrow pier.
const SOLID_R = Object.freeze({ birdbath: 0.3 });

const DECAL_ALPHA = 0.32;  // the contact decal's darkness at its centre, clear at the rim
const DECAL_LIFT = 0.004;  // metres above the floor, so it never fights it for depth
const DECAL_SPREAD = 1.25; // decal radius over the thing's half-width

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// buildRestMesh(look) → a small Group with its base near y 0 (the exact lift
// is measured, not assumed). An unknown look is a plain water bowl.
export function buildRestMesh(look) {
  const g = new THREE.Group();
  const lit = (c) => litMaterial(c);
  switch (look) {
    case 'birdbath': {
      // A low stone birdbath a cat can reach: a squat pedestal and a wide basin.
      const stone = lit(0xb8b2a6);
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 12), stone, 0, 0.025, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 10), stone, 0, 0.13, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.32, 0.2, 0.09, 16), stone, 0, 0.255, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.01, 16), lit(0x8ac8e0), 0, 0.296, 0));
      break;
    }
    case 'dish': {
      // A shallow food dish with a little heap of kibble and a fish on top.
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.06, 16), lit(0xd8504e), 0, 0.03, 0));
      const kibble = mesh(new THREE.SphereGeometry(0.12, 10, 6), lit(0xb08a58), 0, 0.055, 0);
      kibble.scale.set(1, 0.3, 1);
      g.add(kibble);
      const fish = mesh(new THREE.SphereGeometry(0.06, 8, 6), lit(0xa8b4bc), 0.02, 0.085, 0);
      fish.scale.set(1.6, 0.45, 0.7);
      g.add(fish);
      break;
    }
    case 'crate': {
      // An open wooden fish crate: a base, four low sides, three silver fish.
      const wood = lit(0x9a7048);
      const W = 0.56;
      const D = 0.38;
      const H = 0.2;
      const T = 0.025;
      g.add(mesh(new THREE.BoxGeometry(W, T, D), wood, 0, T / 2, 0));
      g.add(mesh(new THREE.BoxGeometry(W, H, T), wood, 0, H / 2, D / 2 - T / 2));
      g.add(mesh(new THREE.BoxGeometry(W, H, T), wood, 0, H / 2, -D / 2 + T / 2));
      g.add(mesh(new THREE.BoxGeometry(T, H, D - 2 * T), wood, W / 2 - T / 2, H / 2, 0));
      g.add(mesh(new THREE.BoxGeometry(T, H, D - 2 * T), wood, -W / 2 + T / 2, H / 2, 0));
      const silver = lit(0xa8b4bc);
      for (const [fx, fz, yaw] of [[-0.12, -0.06, 0.3], [0.1, 0.04, -0.2], [0, 0.09, 0.1]]) {
        const fish = mesh(new THREE.SphereGeometry(0.07, 8, 6), silver, fx, 0.13, fz);
        fish.scale.set(1.8, 0.5, 0.75);
        fish.rotation.y = yaw;
        g.add(fish);
      }
      break;
    }
    case 'cushion': {
      // A plump square cushion, sun-yellow, with a button in the middle.
      const cushion = mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), lit(0xe8b84a), 0, 0.05, 0);
      g.add(cushion);
      const puff = mesh(new THREE.SphereGeometry(0.3, 14, 8), lit(0xe8b84a), 0, 0.1, 0);
      puff.scale.set(1, 0.12, 1);
      g.add(puff);
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), lit(0xc0503a), 0, 0.14, 0));
      break;
    }
    case 'doormat': {
      // A coir doormat with a darker border.
      g.add(mesh(new THREE.BoxGeometry(0.8, 0.02, 0.5), lit(0x6e4a2a), 0, 0.01, 0));
      g.add(mesh(new THREE.BoxGeometry(0.68, 0.022, 0.38), lit(0xb08850), 0, 0.011, 0));
      break;
    }
    case 'bowl':
    default: {
      // A blue water bowl, like the den's.
      g.add(mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.1, 18), lit(0x4a8ec8), 0, 0.05, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 18), lit(0x8ac8e0), 0, 0.095, 0));
    }
  }
  return g;
}

// A small dark disc lying flat, darkest at its centre and clear at its rim
// (knockables.js's decal). userData.contactDecal keeps walk.js's shadow pass
// off it. A doormat lies flat already and gets none.
function buildDecal(radius) {
  const geo = new THREE.CircleGeometry(radius, 16);
  const rgba = new Float32Array(geo.attributes.position.count * 4); // black, clear
  rgba[3] = DECAL_ALPHA;
  geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false });
  const decal = new THREE.Mesh(geo, mat);
  decal.rotation.x = -Math.PI / 2;
  decal.castShadow = false;
  decal.receiveShadow = false;
  decal.userData.contactDecal = true;
  return decal;
}

// Every distinct geometry / material under an object, so each is freed once.
function collect(root, geos, mats) {
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    }
  });
}

const lookOf = (r) => (typeof r.id === 'string' && Object.hasOwn(REST_LOOKS, r.id)
  ? REST_LOOKS[r.id] : { look: DEFAULT_LOOK[r.kind] });

// createRests(scene, rests) — rests is propsFor(areaId).rests:
// [{ id, kind: 'drink'|'eat'|'nap', x, z, mesh }]. Entries are
// { id, kind, x, z, group } (group null for a `mesh: false` rest);
// `colliders` is [{ x, z, r }] for the ones the cat cannot walk through, for
// walk.js to add to the walk's collider list. Anything
// that is not an array, and any entry without a rest kind or a finite
// position, is skipped: never a throw.
export function createRests(scene, rests) {
  const list = [];
  const colliders = [];
  const added = []; // everything this put in the scene, to take back out
  let disposed = false;

  for (const r of Array.isArray(rests) ? rests : []) {
    if (!r || typeof r !== 'object' || !isRestKind(r.kind)) continue;
    if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
    let group = null;
    if (r.mesh === true) {
      const { look, floor = 0 } = lookOf(r);
      group = buildRestMesh(look);
      // Rest it on its floor: lift by however far it reaches below its origin.
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const lift = Number.isFinite(box.min.y) ? -box.min.y : 0;
      group.position.set(r.x, floor + lift, r.z);
      scene.add(group);
      added.push(group);
      if (Object.hasOwn(SOLID_R, look)) colliders.push({ x: r.x, z: r.z, r: SOLID_R[look] });
      if (look !== 'doormat') {
        const size = box.getSize(new THREE.Vector3());
        const decal = buildDecal((Math.max(size.x, size.z) / 2) * DECAL_SPREAD);
        decal.position.set(r.x, floor + DECAL_LIFT, r.z);
        scene.add(decal);
        added.push(decal);
      }
    }
    list.push({ id: r.id, kind: r.kind, x: r.x, z: r.z, group });
  }

  return {
    list,
    colliders,
    // The nearest rest strictly inside maxDist of pos (horizontally), or null.
    nearest(pos, maxDist) {
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
      let best = null;
      let bestD = maxDist;
      for (const e of list) {
        const d = Math.hypot(e.x - pos.x, e.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geos = new Set();
      const mats = new Set();
      for (const obj of added) {
        scene.remove(obj);
        collect(obj, geos, mats);
      }
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      added.length = 0;
      list.length = 0;
      colliders.length = 0;
    },
  };
}
