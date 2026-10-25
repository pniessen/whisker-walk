// The tamed cats of the colony, at home in the den. Each one has a fixed home
// (its taming order picks a DEN_HOMES entry, see colony.js's denHome) and each
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
// Draw calls: at most 24 cats (COLONY_MAX, one per DEN_HOMES entry) plus 24
// small props, in an indoor room with no strays, so nothing here is merged or
// instanced. A full 24-cat den is a two-sibling colony that has tamed
// everything it holds; most dens have far fewer.
import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag } from './nametag.js';
import { DEN_SPOTS, clearsCamera } from './den.js';
import { strayBreed } from './straynames.js';

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
//
// `fit` lets a smaller occupant (a little one beside its mother) use its own
// rings, sideways step and cat-to-cat spacing; the defaults are the adult ones,
// so every existing call is unchanged.
function findPlace(anchor, base, tangent, r, placed, obstacles, fit = {}) {
  const rings = fit.rings ?? RINGS;
  const step = fit.step ?? NUDGE_STEP;
  const apart = fit.apart ?? MIN_APART;
  let best = null;
  let bestScore = -Infinity;
  for (const ring of rings) {
    for (const k of SIDES) {
      const x = anchor.x + base.d.x * ring + tangent.x * k * step;
      const z = anchor.z + base.d.z * ring + tangent.z * k * step;
      if (Math.abs(x) > ROOM_LIMIT || Math.abs(z) > ROOM_LIMIT) continue;
      if (!clearsCamera(x, z, 0.5, 0.8)) continue;
      // Worst overlap over everything nearby (negative = overlapping).
      let slack = Infinity;
      for (const o of placed) {
        slack = Math.min(slack, Math.hypot(o.group.position.x - x, o.group.position.z - z) - apart);
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

// `seen` is shared across every root a dispose() walks, so a geometry or
// material that two meshes (or two roots) hold is disposed exactly once, as
// goldmice.js documents for its own shared material.
function disposeTree(root, seen = new Set()) {
  const once = (x) => {
    if (x && !seen.has(x)) {
      seen.add(x);
      x.dispose?.();
    }
  };
  root.traverse((o) => {
    once(o.geometry);
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) {
      once(m.map);
      once(m);
    }
  });
}

// ---- Little ones beside their mothers ---------------------------------------
// A little one is a real cat (spec §6.5) drawn small: the full model at
// LITTLE_SCALE, with its head enlarged. A plain shrunk adult reads as a toy
// cat; a kitten's tell is a big head on a small body, and the animator never
// resets head.scale, so the enlargement survives every frame.
const LITTLE_SCALE = 0.5;
const LITTLE_HEAD = 1.35;
const LITTLE_R = 0.25;       // floor footprint, for furniture
const LITTLE_APART = 0.7;    // to its mother, siblings and other cats
const LITTLE_TAG_Y = 0.62;   // the adult tag floats at 1.05, far above a small cat
const LITTLE_ANGLES = 16;    // directions tried round the mother
const LITTLE_MARGIN = 0.2;   // a little one is this much nearer its mother than any other adult

// placeLittle: where a little one sits so it reads as ITS mother's. A kitten
// placed merely "near her" can end up between two adults, and a child then
// reads it as the other cat's baby. So candidates are taken all the way round
// the mother, on tight rings (starting just outside her footprint: a box is
// wider than a cat), and must (1) be free in the same sense as findPlace (room,
// camera wedge, furniture, other cats and little ones), and (2) be nearer the
// mother than ANY other adult by LITTLE_MARGIN. Among those, the nearest to her
// wins, ties leaning away from her neighbours. If the den is so crowded that
// none passes (2), the nearest free spot to her is used; if none is free at
// all, the roomiest one, as findPlace degrades. Never stacks, never fails.
function placeLittle(mp, footprint, others, placed, obstacles) {
  const s = footprint + 0.35;
  let ruled = null;
  let ruledScore = Infinity;
  let free = null;
  let freeDist = Infinity;
  let snug = null;
  let snugSlack = -Infinity;
  for (const ring of [s, s + 0.2, s + 0.4, s + 0.7, s + 1.0]) {
    for (let a = 0; a < LITTLE_ANGLES; a++) {
      const ang = (a / LITTLE_ANGLES) * Math.PI * 2;
      const x = mp.x + Math.cos(ang) * ring;
      const z = mp.z + Math.sin(ang) * ring;
      if (Math.abs(x) > ROOM_LIMIT || Math.abs(z) > ROOM_LIMIT) continue;
      if (!clearsCamera(x, z, 0.5, 0.8)) continue;
      let slack = Infinity;
      for (const o of placed) slack = Math.min(slack, Math.hypot(o.group.position.x - x, o.group.position.z - z) - LITTLE_APART);
      for (const o of obstacles) slack = Math.min(slack, Math.hypot(o.x - x, o.z - z) - (LITTLE_R + o.r));
      if (slack < 0) {
        if (slack > snugSlack) { snugSlack = slack; snug = { x, z }; }
        continue;
      }
      const dm = ring;
      let dOther = Infinity;
      for (const o of others) dOther = Math.min(dOther, Math.hypot(o.x - x, o.z - z));
      // Fallback ranking: how far this spot leans toward its mother rather than
      // toward another adult (smaller is better), then nearer her.
      const lean = dm - Math.min(dOther, 9) + dm * 0.01;
      if (lean < freeDist) { freeDist = lean; free = { x, z }; }
      if (dm + LITTLE_MARGIN <= dOther) {
        const score = dm - 0.05 * Math.min(dOther, 3);
        if (score < ruledScore) { ruledScore = score; ruled = { x, z }; }
      }
    }
  }
  const clamp = (v) => Math.max(-ROOM_LIMIT, Math.min(ROOM_LIMIT, v));
  return ruled ?? free ?? snug ?? { x: clamp(mp.x + s), z: clamp(mp.z) };
}

const KNOCKED_R = 0.22;     // a knocked-over cup or pot, so a little one never sits in it

// cats: [{ name, breed, wear: { slot, id } | null, home: { x, z }, moment: { act, spot } }]
//
// kits: placedKits()'s output, [{ queen, kits: [name], home }]. Each little one
// is placed beside its mother's ACTUAL place today (she may be at the window or
// in a box), takes no DEN_HOMES entry and is never in `list`, so nearest() and
// pet() stay about the adults. The return value's `littles` is the handle for
// whatever later wants to act on them:
//   [{ name, queen, breed, group, tag }]
// where `group` is the world-positioned holder (group.position is where it sits)
// and `breed` is strayBreed(name), the little one's own stored-name breed.
export function createDenCats(scene, cats, { reducedMotion = false, obstacles = [], kits = [] } = {}) {
  const list = [];
  const props = [];
  const propSpots = []; // small floor props (knocked-over things) the little ones avoid
  const littles = [];

  for (const c of cats) {
    const wear = c.wear && typeof c.wear.slot === 'string' && typeof c.wear.id === 'string'
      ? { [c.wear.slot]: c.wear.id }
      : {};
    // The full model, not the simple one: a lying cat in the simple rig reads as
    // a hollow ring from the spawn camera, and the den is indoors with at most
    // 24 cats and no strays, so the extra meshes are affordable.
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
      propSpots.push({ x: obj.position.x, z: obj.position.z, r: KNOCKED_R });
    }

    list.push({
      name: c.name,
      group,
      yaw,
      footprint: act === 'box' ? BOX_R : CAT_R,
      tag,
      moment: c.moment,
      phase: (h % 628) / 100, // offsets the idle breathing between cats
      purr: 0,                 // seconds of sitting-up left after a pet
    });
  }

  // The little ones go in after every adult is placed, so they fit around the
  // finished room instead of pushing an adult out of her place. They register
  // in `littleSpots` (shaped like `list` entries for findPlace) so they keep
  // clear of each other too.
  const littleSpots = [...list];
  for (const set of kits) {
    const mother = list.find((e) => e.name === set.queen);
    if (!mother) continue; // no placed mother, nothing to sit beside
    const mp = mother.group.position;
    const others = list.filter((e) => e !== mother).map((e) => e.group.position);
    for (const name of set.kits) {
      const at = placeLittle(mp, mother.footprint, others, littleSpots, [...obstacles, ...propSpots]);
      const holder = new THREE.Group();
      holder.position.set(at.x, 0, at.z);
      // Its OWN breed from its own stored name: once fed it becomes a colony
      // cat whose breed is hashed from that name everywhere, so borrowing its
      // mother's coat would change its colour the moment it is fed.
      const breed = strayBreed(name);
      const body = buildCat(breed, {});
      body.scale.setScalar(LITTLE_SCALE);
      body.userData.parts.head.scale.setScalar(LITTLE_HEAD);
      holder.add(body);
      holder.rotation.y = mother.yaw + ((nameHash(name) % 100) / 100 - 0.5) * 0.8;
      const tag = makeNameTag(name);
      if (tag) {
        tag.position.y = LITTLE_TAG_Y;
        holder.add(tag);
      }
      scene.add(holder);
      const entry = { name, queen: set.queen, breed, group: holder, body, tag, phase: (nameHash(name) % 628) / 100 };
      littleSpots.push(entry);
      littles.push(entry);
    }
  }

  const restPose = (e) => (e.moment.act === 'nap' ? 'nap'
    : e.moment.act === 'groom' ? 'groom'
      : e.moment.act === 'window' ? 'perch'
        : 'requestPet'); // box and knocked: sitting up, alert, looking at you

  return {
    list,
    littles,
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
      // The little ones sit up and look about, whatever their mother is doing.
      for (const e of littles) {
        const near = catPos
          ? Math.hypot(e.group.position.x - catPos.x, e.group.position.z - catPos.z)
          : Infinity;
        if (e.tag) e.tag.visible = near < NAME_RANGE;
        animateCat(e.body, 'requestPet', t + e.phase, 0, reducedMotion);
      }
    },
    dispose() {
      // One `seen` set across every root, so nothing shared is disposed twice.
      const seen = new Set();
      for (const e of list) {
        scene.remove(e.group);
        disposeTree(e.group, seen);
      }
      for (const e of littles) {
        scene.remove(e.group);
        disposeTree(e.group, seen);
      }
      for (const p of props) {
        scene.remove(p);
        disposeTree(p, seen);
      }
      list.length = 0;
      littles.length = 0;
      props.length = 0;
    },
  };
}
