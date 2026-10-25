// The tamed cats of the colony, at home in the den. Each one has a fixed home
// (its taming order picks a DEN_SPOTS entry, see colony.js's denHome) and each
// UTC day gets into one thing (colony.js's denMoment): napping, grooming,
// perched at the window, curled in a cardboard box, or sat beside something it
// has just knocked over. All of that is decided in colony.js; this module only
// puts it on screen.
//
// Cats never wander. A den is a small room full of furniture and walls, and a
// wandering cat would have to path around all of it, so each cat stays at its
// stand-off position and only does small idle motions (the pose's own
// breathing and tail, plus a head-up when you come near).
//
// Draw calls: at most 12 simple cats plus 12 small props in an indoor room
// with no strays. That is below what a 22-stray outdoor walk costs, so nothing
// here is merged or instanced.
import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag } from './nametag.js';
import { DEN_SPOTS, clearsCamera } from './den.js';

// How far a cat stands from the spot it is attached to, toward the room
// centre, so a cat and the furniture on its spot never overlap.
export const STAND_OFF = 0.9;
const MIN_APART = 1.15;       // cat-to-cat centre distance (a box is ~0.95 wide)
const NUDGE_STEP = 1.2;       // sideways step when two cats want the same place
const ROOM_LIMIT = 7.3;       // keep cats and props clear of the ±8 walls
const SPAWN = { x: 0, z: 4 }; // cats face the player's spawn, so they read at first sight
const NAME_RANGE = 6;         // show a name tag this close
const WAKE_RANGE = 2.6;       // a napping or grooming cat looks up this close
const PURR_SECS = 2.5;        // how long a pet keeps the cat sitting up

const spotXZ = (id) => {
  const s = DEN_SPOTS.find((d) => d.id === id);
  return s ? { x: s.x, z: s.z } : null;
};

// Small deterministic jitter from the name, so two cats don't breathe in step
// and don't all face exactly the same way.
const nameHash = (name) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 17);

function standOff(spot) {
  const len = Math.hypot(spot.x, spot.z);
  // A spot on the very centre has no "toward the centre": step toward the open side.
  const d = len < 0.01 ? { x: 0, z: 1 } : { x: -spot.x / len, z: -spot.z / len };
  return { d, x: spot.x + d.x * STAND_OFF, z: spot.z + d.z * STAND_OFF };
}

const mat = (color) => new THREE.MeshLambertMaterial({ color });

// An open-top cardboard box, 1.05 x 1.05 x 0.42, built from thin panels so it
// is a hollow box (you see into it) rather than a solid block. Two flaps fold
// out and down from the rim, and a strip of tape runs across the front.
export const BOX = Object.freeze({ w: 1.05, h: 0.42, t: 0.035 });
function buildBox() {
  const g = new THREE.Group();
  const board = mat(0xc8975a);
  const inner = mat(0x9c7140);
  const flapMat = mat(0xb98450);
  const tape = mat(0xe3cf9a);
  const { w, h, t } = BOX;
  const panel = (sx, sy, sz, x, y, z, m, rx = 0, rz = 0) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    p.position.set(x, y, z);
    p.rotation.set(rx, 0, rz);
    g.add(p);
    return p;
  };
  panel(w, t, w, 0, t / 2, 0, inner);                        // floor (a darker inside)
  panel(w, h, t, 0, h / 2, -w / 2 + t / 2, board);           // front (the side the cat faces)
  panel(w, h, t, 0, h / 2, w / 2 - t / 2, board);            // back
  panel(t, h, w, -w / 2 + t / 2, h / 2, 0, board);          // left
  panel(t, h, w, w / 2 - t / 2, h / 2, 0, board);           // right
  // Flaps hanging out over the left and right rims.
  panel(0.3, t, w * 0.8, -w / 2 - 0.12, h - 0.05, 0, flapMat, 0, 0.9);
  panel(0.3, t, w * 0.8, w / 2 + 0.12, h - 0.05, 0, flapMat, 0, -0.9);
  panel(0.22, h * 0.6, 0.004, 0.12, h * 0.55, -w / 2 - 0.005, tape); // tape on the front
  g.name = 'den-box';
  return g;
}

// A cup or a little pot, lying on its side where it rolled. `kind` is picked
// from the cat's name so the same cat always knocks over the same thing.
function buildTipped(kind) {
  const g = new THREE.Group();
  const lying = new THREE.Group();
  if (kind === 'pot') {
    const clay = mat(0xb5532f);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.095, 0.2, 14), clay);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14), clay);
    rim.position.y = 0.11;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.012, 14), mat(0x3a2a1e));
    soil.position.y = 0.128;
    lying.add(body, rim, soil);
    g.name = 'den-pot';
  } else {
    const white = mat(0xf2efe6);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.16, 14), white);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.01, 6, 14), white);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 14), mat(0x6b4a33));
    inside.position.y = 0.075;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 10, Math.PI), white);
    handle.position.set(0.085, 0, 0);
    handle.rotation.z = -Math.PI / 2;
    lying.add(body, rim, inside, handle);
    g.name = 'den-cup';
  }
  lying.rotation.z = Math.PI / 2; // on its side, open end facing +x...
  const r = kind === 'pot' ? 0.13 : 0.085;
  lying.position.y = r;           // ...resting on the floor
  g.add(lying);
  // A few spilled crumbs of soil (pot) or a small puddle (cup), so it reads as "knocked over".
  const spill = new THREE.Mesh(
    new THREE.CircleGeometry(kind === 'pot' ? 0.12 : 0.15, 14),
    new THREE.MeshLambertMaterial({ color: kind === 'pot' ? 0x3a2a1e : 0xdfe9ee, transparent: true, opacity: 0.85 }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0.22, 0.004, 0);
  g.add(spill);
  return g;
}

// Footprint radii used when keeping cats clear of things: a cat on the floor,
// and a cat in its cardboard box (the 1.05 m box's corner is 0.74 m out).
const CAT_R = 0.45;
const BOX_R = 0.75;
// Stand-off distances tried, nearest first: a spot with a big piece of
// furniture on it pushes the cat further out toward the room centre.
const RINGS = [STAND_OFF, 1.3, 1.7, 2.1];
const SIDES = [0, 1, -1, 2, -2, 3, -3, 4, -4];

// findPlace: the first candidate (rings outward, sideways within a ring) that
// is inside the room, clears the camera wedge, keeps MIN_APART from every
// placed cat and `r` + obstacle.r from every obstacle. If none is fully free
// it takes the candidate that still passes the room and wedge checks and has
// the most clearance, so a crowded room degrades to "a bit snug", never to a
// cat in a wall, in the opening shot, or exactly on top of another cat.
// `obstacles` is [{ x, z, r }] circles on the floor plan.
function findPlace(anchor, base, tangent, r, placed, obstacles) {
  let best = null;
  let bestScore = -Infinity;
  for (const ring of RINGS) {
    for (const k of SIDES) {
      const x = anchor.x + base.d.x * ring + tangent.x * k * NUDGE_STEP;
      const z = anchor.z + base.d.z * ring + tangent.z * k * NUDGE_STEP;
      if (Math.abs(x) > ROOM_LIMIT || Math.abs(z) > ROOM_LIMIT) continue;
      if (!clearsCamera(x, z, 0.5, 0.8)) continue;
      // Worst overlap over everything nearby (negative = overlapping).
      let slack = Infinity;
      for (const o of placed) {
        slack = Math.min(slack, Math.hypot(o.group.position.x - x, o.group.position.z - z) - MIN_APART);
      }
      for (const o of obstacles) {
        slack = Math.min(slack, Math.hypot(o.x - x, o.z - z) - (r + o.r));
      }
      if (slack >= 0) return { x, z };
      if (slack > bestScore) {
        bestScore = slack;
        best = { x, z };
      }
    }
  }
  // Nothing passed the hard checks at all (cannot happen with the real den):
  // the stand-off position pulled inside the room.
  const clamp = (v) => Math.max(-ROOM_LIMIT, Math.min(ROOM_LIMIT, v));
  return best ?? { x: clamp(base.x), z: clamp(base.z) };
}

// The animator's 'nap' tucks the head down and to one side and wraps the tail
// over it, which from the spawn camera, ~8 m off, reads as a hollow ring with
// no head. A den cat is on show, so it naps as a LOAF instead: the same low,
// squashed body, but the head rests forward and level where you can see it,
// and the tail lies along the side. Applied after animateCat, which has reset
// every part this frame.
function sleepyLoaf(group) {
  const { head, tailPivots } = group.userData.parts;
  head.position.x -= 0.08;     // undo the nap's sideways shift
  head.position.y += 0.12;     // chin up off the floor so the face shows
  head.position.z -= 0.14;     // forward, out of the body's shadow
  head.rotation.set(0.28, 0, 0.1);
  for (const p of tailPivots) p.rotation.y = 0.12; // tail alongside, not over the face
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      m.map?.dispose?.();
      m.dispose?.();
    }
  });
}

// cats: [{ name, breed, wear: { slot, id } | null, home: { x, z }, moment: { act, spot } }]
export function createDenCats(scene, cats, { reducedMotion = false, obstacles = [] } = {}) {
  const list = [];
  const props = [];

  for (const c of cats) {
    const wear = c.wear && typeof c.wear.slot === 'string' && typeof c.wear.id === 'string'
      ? { [c.wear.slot]: c.wear.id }
      : {};
    // The full model, not the simple one: a lying cat in the simple rig reads as
    // a hollow ring from the spawn camera, and the den is indoors with at most
    // 12 cats and no strays, so the extra meshes are affordable.
    const group = buildCat(c.breed, wear);
    const { act, spot } = c.moment;
    const anchor = (spot === 'home' ? c.home : spotXZ(spot)) ?? c.home;
    const base = standOff(anchor);

    // Where it goes: the stand-off position if that is free, otherwise the
    // nearest free place (further out, then sideways along the wall). A place
    // is free when it clears every other cat AND every obstacle (fixed props,
    // placed furniture). See findPlace.
    const tangent = { x: -base.d.z, z: base.d.x };
    const at = findPlace(anchor, base, tangent, act === 'box' ? BOX_R : CAT_R, list, obstacles);
    group.position.set(at.x, 0, at.z);

    const h = nameHash(c.name);
    const jitter = ((h % 100) / 100 - 0.5) * 0.7;
    // The window cat looks out of the window (the room's far wall); the others
    // turn to face where the player appears, with a little variety.
    const faceX = act === 'window' ? at.x : SPAWN.x;
    const faceZ = act === 'window' ? -20 : SPAWN.z;
    const yaw = Math.atan2(faceX - at.x, faceZ - at.z) + Math.PI + (act === 'window' ? 0 : jitter);
    group.rotation.y = yaw;

    const tag = makeNameTag(c.name);
    if (tag) group.add(tag);
    scene.add(group);

    if (act === 'box') {
      const box = buildBox();
      box.position.set(at.x, 0, at.z);
      box.rotation.y = yaw;
      // The cat sits down inside it, so only its head and shoulders show.
      group.position.y = -0.2;
      scene.add(box);
      props.push(box);
    } else if (act === 'knocked') {
      const kind = h % 2 === 0 ? 'cup' : 'pot';
      const obj = buildTipped(kind);
      // Beside the cat, on the side away from the wall, rolled a little way off.
      const side = h % 3 === 0 ? -1 : 1;
      obj.position.set(at.x + tangent.x * 0.62 * side + base.d.x * 0.25, 0, at.z + tangent.z * 0.62 * side + base.d.z * 0.25);
      obj.rotation.y = yaw + (side > 0 ? 0.6 : Math.PI - 0.6);
      scene.add(obj);
      props.push(obj);
    }

    list.push({
      name: c.name,
      group,
      tag,
      moment: c.moment,
      phase: (h % 628) / 100, // offsets the idle breathing between cats
      purr: 0,                 // seconds of sitting-up left after a pet
    });
  }

  const restPose = (e) => (e.moment.act === 'nap' ? 'nap'
    : e.moment.act === 'groom' ? 'groom'
      : e.moment.act === 'window' ? 'perch'
        : 'requestPet'); // box and knocked: sitting up, alert, looking at you

  return {
    list,
    // The closest den cat within r metres of pos (ground distance), or null.
    nearest(pos, r) {
      let best = null;
      let bestD = r;
      for (const e of list) {
        const d = Math.hypot(e.group.position.x - pos.x, e.group.position.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
    // A pet makes the cat sit up and purr for a moment.
    pet(entry) {
      if (entry) entry.purr = PURR_SECS;
    },
    // catPos is optional: with it, name tags appear near you and sleepers look up.
    update(dt, t, catPos) {
      for (const e of list) {
        const near = catPos
          ? Math.hypot(e.group.position.x - catPos.x, e.group.position.z - catPos.z)
          : Infinity;
        if (e.tag) e.tag.visible = near < NAME_RANGE;
        if (e.purr > 0) e.purr = Math.max(0, e.purr - dt);
        const awake = e.purr > 0 || (near < WAKE_RANGE && (e.moment.act === 'nap' || e.moment.act === 'groom'));
        const pose = awake ? 'requestPet' : restPose(e);
        animateCat(e.group, pose, t + e.phase, 0, reducedMotion);
        if (pose === 'nap') sleepyLoaf(e.group);
      }
    },
    dispose() {
      for (const e of list) {
        scene.remove(e.group);
        disposeTree(e.group);
      }
      for (const p of props) {
        scene.remove(p);
        disposeTree(p);
      }
      list.length = 0;
      props.length = 0;
    },
  };
}
