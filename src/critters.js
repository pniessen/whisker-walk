import * as THREE from 'three';
import { bus } from './events.js';
import { litMaterial } from './render/materials.js';
import { FLAT_GROUND } from './ground.js';
import { mulberry32, seedFromCode } from './rng.js';
import { standSpot } from './keepout.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './world/localuuids.js';

const mat = (color) => litMaterial(color);
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

const CHASEABLE = new Set(['bird', 'squirrel', 'butterfly', 'seagull', 'crab', 'duck', 'firefly']);
// grounded skittish critters that participate in stalk-and-pounce tag
// (bird included per spec even though it flies once fleeing — see markStalked/pounceCatch)
// v18 Task 2.6: 'rat' joins them. It is deliberately STALKABLE but NOT
// CHASEABLE, exactly like 'mouse' — a rat's answer to a cat is to bolt, so it
// has no business in the chase prompt or (via CURIOUS, which is derived from
// CHASEABLE) in the set of critters a Far Call draws toward the caller.
// The Moor's 'rabbit' follows the same rule: it only bolts, so it is STALKABLE
// and PREY but never CHASEABLE, and a Far Call does not draw it.
const STALKABLE = new Set(['squirrel', 'bird', 'mouse', 'rat', 'rabbit', 'frog']);
// v18 Far Call ('far-call') — critters curious enough to come and look when a
// meow carries. Derived from CHASEABLE rather than listed fresh: everything a
// cat can chase, MINUS the two types whose existing meow reaction is to bolt
// (bird and seagull, see reactToMeow). Drawing a critter that the same meow
// scatters would be the game contradicting itself in one frame. Villagers are
// excluded because they are not chaseable, and already answer a meow with a
// wave. (The dog is no critter at all since v21 3b Task 16: it lives in its
// yard, src/yarddog.js, and never comes when called.)
const CURIOUS = new Set([...CHASEABLE].filter((t) => t !== 'bird' && t !== 'seagull'));
// The outer band Far Call reaches, the same 22m straycats.js uses so one meow
// draws one consistent neighbourhood. STANDOFF is how far short of the caller
// a critter settles, and DRAW_TIME is the budget it gets to make the trip —
// the "give up on an unreachable target eventually" role.
const FAR_CALL_RADIUS = 22;
const FAR_CALL_STANDOFF = 2.2;
const FAR_CALL_DRAW_TIME = 12;
// How fast a called critter's IDLE ANCHOR glides (see spawn/update). Slow on
// purpose: the anchor carries the critter's whole patrol pattern with it, so
// this is the speed the pattern drifts over, not a dash.
const ANCHOR_SPEED = 2.2;
// v21 3b Task 13 — prey that evades. The three grounded runners notice a cat
// that comes close and bolt for cover: the nearest of the area's hides
// (propsets.js) within HIDE_SEARCH, at their own dash speed. A trotting cat is
// noticed at PREY_NOTICE; a stalking one gets to PREY_NOTICE_STALKED, which is
// the whole point of stalking. Once within HIDE_REACH of its cover the critter
// is hidden for the rest of the walk: invisible, unspottable, and skipped by
// every way the cat can reach a critter. With no cover in reach it dashes away
// and comes back, exactly as a pounce-tag sends it. Positions only — nothing
// here rolls, so it never touches the injected rng or Math.random.
const PREY = new Set(['mouse', 'rat', 'squirrel', 'rabbit', 'frog']);
export const PREY_NOTICE = 3.5;
export const PREY_NOTICE_STALKED = 1.2;
export const HIDE_REACH = 0.4;
const HIDE_SEARCH = 15;
// Ruling R27 — stalking pays off. A critter that notices a STALKING (or still,
// R29) cat freezes for PREY_STARTLE seconds before it bolts, the way a real
// mouse does; a trotting cat gets no startle. A fixed time, never a roll.
// Tuned against the real lunge (player.js) — see task-13-report.md, Fix round 1.
export const PREY_STARTLE = 0.5;
// Ruling R29 — a still cat is not a threat. A cat moving slower than this
// (horizontal m/s, measured off the positions update() is handed) is noticed
// at PREY_NOTICE_STALKED, like a stalking one, so a touch player who stops with
// the thumb off does not scare a mouse 3.5m away. A creeping cat moves at
// 1.4-2.0 m/s, a trot at 3.2-4.4, so 0.25 means "stopped": player.js's
// velocity lerp brings a released cat under it in about 0.4s.
export const STILL_SPEED = 0.25;
// Above the fastest the cat really moves (the 9 m/s pounce lunge; zoomies top
// out near 6.9), so anything faster is a snap, not movement (see update).
export const CAT_SPEED_CAP = 12;
// Gorge G9 — the mountain goat on the shoulder only ever bolts: it is in none
// of STALKABLE, PREY or CHASEABLE, so it can't be stalked, pounced or called.
// It notices a cat at GOAT_NOTICE measured in 2D (from the clifftop the cat is
// 2 m below it, and in 3D it would hardly ever notice her), bounds off at
// GOAT_FLEE and hides on its own level.
export const GOAT_NOTICE = 6;
const GOAT_FLEE = 7.0;
// It comes on about half the days (owner, 2026-11-01). The date alone decides,
// off its own seeded stream: never walkRng or strayStream, so co-walkers agree.
export const GOAT_DAY_SHARE = 0.5;
export function goatToday(date) {
  return mulberry32(seedFromCode(`${date}-gorge-goat`))() < GOAT_DAY_SHARE;
}
// The walk's goat for `date`: on a no-goat day, the area's critterSpawns and
// moments without the goat and its leap; on a goat day, the very same arrays.
// Its hide stays (nothing else uses it). Draws nothing.
export function goatForDay(area, date) {
  const { critterSpawns, moments } = area;
  if (goatToday(date)) return { critterSpawns, moments };
  return {
    critterSpawns: critterSpawns.filter((s) => s.type !== 'goat'),
    moments: moments.filter((m) => m.id !== 'goat-leap' && m.type !== 'goat'),
  };
}

// ---- The villager Twoleg (polish-edges Task 4) -----------------------------
const TWOLEG_COATS = [0x6a8ac0, 0xc8604a, 0x5e9a6a, 0xd8a640, 0x8a6ab0];
const TWOLEG_TROUSERS = [0x4a5468, 0x6a5a48, 0x3e4a5a];
const TWOLEG_SKINS = [0xe8c8a8, 0xc89a74, 0x8e6446, 0xf0d2b8];
const TWOLEG_HAIR = [0x5a3a24, 0x2a2220, 0xb8643a, 0xb0aca4];
const TWOLEG_HATS = [0xd8503a, 0xe8b83a, 0x4a9ad0, 0x5ab06a, 0xd070a0]; // bobble hats: bright
const TWOLEG_CAP = 0x8a7a5a;   // a tweedy flat cap
const TWOLEG_SHOES = 0x3a3330;
const TWOLEG_EYES = 0x2a2420;

// An integer hash of the spawn spot (to the centimetre) and a salt, in [0, 1).
// Pure: the same spawn gives the same Twoleg on every device, no rng drawn.
function twolegHash(x, z, salt) {
  let h = Math.imul(Math.round(x * 100) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 100) | 0, 0x165667b1) ^ Math.imul(salt + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function twolegLook(def) {
  const x = Number.isFinite(def.x) ? def.x : 0;
  const z = Number.isFinite(def.z) ? def.z : 0;
  const pick = (list, salt) => list[Math.floor(twolegHash(x, z, salt) * list.length)];
  const coatIndex = Math.floor(twolegHash(x, z, 1) * TWOLEG_COATS.length);
  return {
    coat: TWOLEG_COATS[coatIndex],
    scarf: TWOLEG_COATS[(coatIndex + 2) % TWOLEG_COATS.length], // never the coat's own colour
    trousers: pick(TWOLEG_TROUSERS, 2),
    skin: pick(TWOLEG_SKINS, 3),
    top: pick(['bobble', 'cap', 'hair'], 4),
    hat: pick(TWOLEG_HATS, 5),
    hair: pick(TWOLEG_HAIR, 6),
  };
}

const twolegMat = () => litMaterial(0xffffff, { vertexColors: true, flatShading: true });

// One part: an (indexed) geometry painted one colour. Box, cylinder and
// sphere all carry position, normal and uv, so every part merges.
function tpart(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function twolegBody(look) {
  const parts = [];
  for (const side of [-1, 1]) {
    // Trouser leg from 0.05 m to the hip at 0.75 m, and a shoe a little forward.
    parts.push(tpart(new THREE.CylinderGeometry(0.13, 0.11, 0.7, 6).translate(side * 0.13, 0.4, 0), look.trousers));
    parts.push(tpart(new THREE.BoxGeometry(0.2, 0.1, 0.32).translate(side * 0.13, 0.05, -0.05), TWOLEG_SHOES));
  }
  // The coat, tapered from the hips (0.75 m) to the shoulders (1.35 m).
  parts.push(tpart(new THREE.CylinderGeometry(0.21, 0.26, 0.6, 8).translate(0, 1.05, 0), look.coat));
  // A scarf ring at the collar.
  parts.push(tpart(new THREE.CylinderGeometry(0.15, 0.2, 0.07, 8).translate(0, 1.37, 0), look.scarf));
  // The far arm, hanging at the side: sleeve and hand, a little out from the coat.
  parts.push(tpart(new THREE.CylinderGeometry(0.065, 0.075, 0.45, 6).translate(0, -0.225, 0).rotateZ(-0.2).translate(-0.27, 1.3, 0), look.coat));
  parts.push(tpart(new THREE.SphereGeometry(0.06, 6, 4).translate(0, -0.5, 0).rotateZ(-0.2).translate(-0.27, 1.3, 0), look.skin));
  return parts;
}

// Exported for the critters tests (the hair-over-the-eyes check).
export function twolegHead(look) {
  const parts = [
    tpart(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 6).translate(0, 1.38, 0), look.skin),
    tpart(new THREE.SphereGeometry(0.15, 8, 6).translate(0, 1.47, 0), look.skin),
  ];
  for (const side of [-1, 1]) {
    parts.push(tpart(new THREE.BoxGeometry(0.03, 0.035, 0.02).translate(side * 0.055, 1.49, -0.14), TWOLEG_EYES));
  }
  if (look.top === 'bobble') {
    // A knitted bobble hat: a snug crown and a bobble on top (to 1.74 m).
    parts.push(tpart(new THREE.CylinderGeometry(0.13, 0.155, 0.12, 8).translate(0, 1.6, 0), look.hat));
    parts.push(tpart(new THREE.SphereGeometry(0.05, 6, 4).translate(0, 1.69, 0), 0xf4f0e8));
  } else if (look.top === 'cap') {
    // A flat cap: a low crown and a peak over the eyes.
    parts.push(tpart(new THREE.CylinderGeometry(0.15, 0.158, 0.07, 8).translate(0, 1.59, 0), TWOLEG_CAP));
    parts.push(tpart(new THREE.BoxGeometry(0.2, 0.025, 0.12).translate(0, 1.575, -0.15), TWOLEG_CAP));
  } else {
    // Hair: a cap over the crown and a fall at the back of the head. The cap
    // stops at 0.42 pi, so its rim (y ~1.514) sits above the eyes' tops (1.5075)
    // instead of cutting through them as 0.45 pi (rim ~1.500) did.
    parts.push(tpart(new THREE.SphereGeometry(0.158, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 1.475, 0), look.hair));
    parts.push(tpart(new THREE.BoxGeometry(0.26, 0.14, 0.08).translate(0, 1.44, 0.11), look.hair));
  }
  return parts;
}

// The waving arm, in its pivot's frame: from the shoulder straight down, a
// sleeve and the hand at its end, 0.55 m in all.
function twolegArm(look) {
  return [
    tpart(new THREE.CylinderGeometry(0.065, 0.075, 0.45, 6).translate(0, -0.225, 0), look.coat),
    tpart(new THREE.SphereGeometry(0.06, 6, 4).translate(0, -0.49, 0), look.skin),
  ];
}

function buildCritter(type, def = {}) {
  const g = new THREE.Group();
  if (type === 'bird' || type === 'seagull') {
    const s = type === 'seagull' ? 1.6 : 1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 6), mat(type === 'seagull' ? 0xf0f0f0 : 0x8a5a3a));
    body.position.y = 0.09 * s;
    g.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.08 * s, 4), mat(0xf2a04e));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.1 * s, -0.1 * s);
    g.add(beak);
  } else if (type === 'squirrel' || type === 'mouse' || type === 'rat') {
    // Three sizes off one body: squirrel (1), rat (0.75), mouse (0.5).
    const s = type === 'mouse' ? 0.5 : type === 'rat' ? 0.75 : 1;
    const furColor = type === 'mouse' ? 0x8a8a92 : type === 'rat' ? 0x5a5450 : 0xa06a3a;
    const tailColor = type === 'mouse' ? 0x8a8a92 : type === 'rat' ? 0xb08a86 : 0xb87a4a;
    const body = box(0.12 * s, 0.12 * s, 0.22 * s, furColor);
    body.position.y = 0.1 * s;
    g.add(body);
    if (type === 'rat') {
      // The rat reads as a rat rather than a big mouse from its long bare
      // tail and pointed snout, not from its silhouette — a bushy tail sphere
      // (the squirrel/mouse tail below) would make it look like either.
      const tail = box(0.03, 0.03, 0.34, tailColor);
      tail.position.set(0, 0.06, 0.26);
      g.add(tail);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 5), mat(furColor));
      snout.rotation.x = -Math.PI / 2;
      snout.position.set(0, 0.08, -0.14);
      g.add(snout);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CircleGeometry(0.045, 6), mat(tailColor));
        ear.position.set(side * 0.05, 0.14, -0.06);
        g.add(ear);
      }
    } else {
      const tailS = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 5, 5), mat(tailColor));
      tailS.position.set(0, 0.2 * s, 0.16 * s);
      g.add(tailS);
    }
  } else if (type === 'rabbit') {
    // Low and long with upright ears and a white scut; under 0.35 m all told.
    const body = box(0.16, 0.14, 0.26, 0x9a8466);
    body.position.y = 0.1;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), mat(0x9a8466));
    head.position.set(0, 0.18, -0.15);
    g.add(head);
    for (const side of [-1, 1]) {
      const ear = box(0.025, 0.12, 0.04, 0x9a8466);
      ear.position.set(side * 0.03, 0.29, -0.15);
      g.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 5), mat(0xf2eee6));
    tail.position.set(0, 0.12, 0.15);
    g.add(tail);
  } else if (type === 'goat') {
    // White-grey and sure-footed: a long body on four legs, a head held high
    // with two small horns swept back. About 0.9 m to the horn tips.
    const coat = 0xd8d6d0;
    const body = box(0.3, 0.45, 0.7, coat);
    body.position.y = 0.55;
    g.add(body);
    for (const sx of [-0.1, 0.1]) {
      for (const sz of [-0.26, 0.26]) {
        const leg = box(0.07, 0.34, 0.07, 0xb8b4ac);
        leg.position.set(sx, 0.17, sz);
        g.add(leg);
      }
    }
    const head = box(0.16, 0.18, 0.24, coat);
    head.position.set(0, 0.74, -0.42);
    g.add(head);
    for (const side of [-1, 1]) {
      const horn = box(0.03, 0.12, 0.03, 0x6a6258);
      horn.geometry.rotateX(0.6).translate(side * 0.05, 0.86, -0.38); // swept back, baked into the geometry as the villager's arm is
      g.add(horn);
    }
  } else if (type === 'frog') {
    // Squat and green, under 0.2 m: eye bumps on top and two folded back legs.
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x5e8a3a));
    body.scale.set(1.2, 0.7, 1.3);
    body.position.y = 0.06;
    g.add(body);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), mat(0x5e8a3a));
      eye.position.set(side * 0.04, 0.12, -0.06);
      g.add(eye);
      const leg = box(0.05, 0.04, 0.1, 0x5e8a3a);
      leg.position.set(side * 0.1, 0.03, 0.06);
      g.add(leg);
    }
  } else if (type === 'butterfly' || type === 'firefly') {
    const color = type === 'firefly' ? 0x4a3a26 : 0xe070b0; // fireflies: dark beetle wings, the glow does the shining
    for (const side of [-1, 1]) {
      const wing = box(0.08, 0.01, 0.06, color);
      wing.position.x = side * 0.05;
      g.add(wing);
    }
    if (type === 'firefly') {
      // Unlit and over-bright (red/green above 1) so HIGH's bloom catches it.
      // Without bloom or tone mapping it clips to a yellow-green (1, 1, 0.35)
      // rather than white, so blue stays low.
      const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: true });
      glowMat.color.setRGB(1.6, 1.9, 0.35);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), glowMat);
      g.add(glow);
    }
  } else if (type === 'duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), mat(0x6a9a4a));
    body.position.y = 0.1;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), mat(0x3a7a3a));
    head.position.set(0, 0.28, -0.1);
    g.add(head);
  } else if (type === 'crab') {
    const body = box(0.2, 0.08, 0.14, 0xe06848);
    body.position.y = 0.06;
    g.add(body);
    for (const side of [-1, 1]) {
      const claw = box(0.06, 0.05, 0.08, 0xe06848);
      claw.position.set(side * 0.14, 0.08, -0.06);
      g.add(claw);
    }
  } else if (type === 'villager') {
    // A Twoleg: legs, shoes, a coat, hands, a hat or hair. Still the peg's
    // three meshes (body, head, arm), each one merged vertex-coloured geometry
    // whose parts are made inside withLocalUuids, so the draw calls and the
    // real Math.random draws are exactly the peg's. The look comes from the
    // spawn's position, never a roll. Faces -z, like the other critters.
    const look = twolegLook(def);
    // The figure Group holds body, head and arm so a spawn can ask the Twoleg
    // to stand off its spawn point (def.standOff, metres, group frame). The
    // group itself never moves: critter positions are recorded in the flat
    // trace. Ranges (wave, dismay, scratch, quest) measure from the figure's
    // world spot instead, via villagerPos().
    const figure = withLocalUuids('twoleg-figure', () => new THREE.Group());
    figure.position.x = def.standOff?.x ?? 0;
    figure.position.z = def.standOff?.z ?? 0;
    g.add(figure);
    g.userData.figure = figure;
    const body = new THREE.Mesh(mergeGeometries(withLocalUuids('twoleg-body', () => twolegBody(look)), false), twolegMat());
    figure.add(body);
    const head = new THREE.Mesh(mergeGeometries(withLocalUuids('twoleg-head', () => twolegHead(look)), false), twolegMat());
    figure.add(head);
    // The arm hangs DOWN from its shoulder pivot. Baked 0.2 rad inward, so
    // update()'s rest pose (rotation.z 0.4) holds it a little out from the
    // coat and its wave (2.6 +/- 0.3) swings the hand up and out.
    const armGeo = mergeGeometries(withLocalUuids('twoleg-arm', () => twolegArm(look)), false);
    armGeo.rotateZ(-0.2);
    const arm = new THREE.Mesh(armGeo, twolegMat());
    arm.position.set(0.27, 1.3, 0);
    arm.rotation.z = 0.4;
    figure.add(arm);
    g.userData.arm = arm;
  }
  return g;
}

let nextId = 1;

// Where a villager visibly stands: its figure (offset by the spawn's standOff)
// when it has one, else the group. `out` is filled and returned. Interaction
// ranges for villagers measure from here, never from group.position.
export function villagerPos(c, out) {
  return c.figure ? c.figure.getWorldPosition(out) : out.copy(c.group.position);
}

const _vp = new THREE.Vector3();

export function createCritters(scene, spawns, opts = {}) {
  const fleeScale = opts.fleeScale ?? 1;
  // Injected seeded RNG for anything this builder PLACES in the world. Dusk
  // firefly positions used a bare Math.random(), which meant two co-walkers
  // on the same room seed saw the eight fireflies in different spots — the
  // exact determinism regression the spec calls out. Falls back to
  // Math.random so a caller that passes no rng (and a solo walk, whose
  // walkRng *is* Math.random) behaves precisely as before.
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  // Gorge part 1 (R9): the walk's ground. Critters stand, hop and float above
  // it; one that flees or runs for cover slides along a rim and never crosses
  // it; cover on another level is not its cover. Flat: today's lines.
  const ground = opts.ground ?? FLAT_GROUND;
  // A free step from (px, pz) ends here: slid along a rim, stood on the ground.
  const onGround = (p, px, pz) => {
    if (ground.flat) return;
    ground.slide(px, pz, p);
    p.y = ground.y(p.x, p.z);
  };
  // Task 13: the area's cover, and who to tell when a critter gets away.
  const hides = (Array.isArray(opts.hides) ? opts.hides : [])
    .filter((h) => h && Number.isFinite(h.x) && Number.isFinite(h.z))
    .map((h) => new THREE.Vector3(h.x, ground.y(h.x, h.z), h.z));
  const onHide = typeof opts.onHide === 'function' ? opts.onHide : null;
  // markStalked's latest isStalking. update() runs before it in the frame
  // (main.js, then game/avatar.js), so it reads last frame's — one frame late,
  // and the cat has been stalking for many frames by the time it is close.
  let catStalking = false;
  // R29: where the cat was on the last update, and whether it has stopped.
  // Unknown (first frame) counts as moving.
  let lastCat = null;
  let lastT = 0;
  let catStill = false;
  let fleeModifier = 1;
  let clock = 0; // tracks critters.update's own `t` so pounceCatch can time the 20s catch cooldown without a caller-supplied clock
  const list = [];

  function spawn(def) {
    const group = buildCritter(def.type, def);
    group.position.set(def.x, ground.y(def.x, def.z) + (def.type === 'butterfly' || def.type === 'firefly' ? 1 : 0), def.z);
    scene.add(group);
    const c = {
      id: `${def.type}-${nextId++}`,
      type: def.type,
      def,
      group,
      figure: group.userData.figure, // villagers only
      spottable: true,
      fleeing: false,
      phase: Math.random() * Math.PI * 2,
      cooldown: 0,
      waved: false,
      meowWaveT: 0,
      // v18 Far Call. Every idle pattern below (the squirrel's patrol line,
      // the duck's circle, the crab's shuffle, the butterfly's hover) is an
      // absolute function of a CENTRE POINT, which used to be def.x/def.z
      // directly. It is now this anchor, which starts on the spawn definition
      // and — with no far call in play — never moves, so every no-skill path
      // is the same motion as before, to the last decimal.
      //
      // A far call retargets the anchor at the caller and update() eases it
      // there and, once the call lapses, home again. Moving the ANCHOR rather
      // than the critter is what keeps this from teleporting: the pattern
      // glides over and glides back, and there is no frame where the idle
      // formula snaps the critter to a position it was never at.
      anchor: new THREE.Vector3(def.x, 0, def.z),
      anchorHome: new THREE.Vector3(def.x, 0, def.z),
      anchorTo: null, // far-call destination while a call is live
      drawT: 0,       // seconds of call left
      // The squirrel/mouse patrol runs from the anchor to anchor+span, so the
      // patrol keeps its own length and heading wherever the anchor goes.
      patrolSpan: new THREE.Vector3((def.x2 ?? def.x + 6) - def.x, 0, (def.z2 ?? def.z) - def.z),
    };
    list.push(c);
    return c;
  }

  for (const def of spawns) spawn(def);
  if (opts.spawnFireflies) {
    // Gorge part 2 (G7): each spot goes onto ground a cat can stand on
    // (keepout.js's standSpot, with opts.area), after both its draws, so no
    // draw moves. Untouched on every map without onlyOn.
    for (let i = 0; i < 8; i++) {
      const fx = (rng() - 0.5) * 60;
      const fz = (rng() - 0.5) * 60;
      const { x, z } = standSpot(opts.area, fx, fz);
      spawn({ type: 'firefly', x, z });
    }
  }
  if (opts.trailButterflies) {
    for (let i = 0; i < 2; i++) {
      const c = spawn({ type: 'butterfly', x: 0, z: 0 });
      c.trail = true; // butterfly wander centers on the cat (see update)
    }
  }

  function remove(c) {
    scene.remove(c.group);
    if (c.figure) c.figure.visible = false; // contactshadows drops the decal
    list.splice(list.indexOf(c), 1);
  }

  // The nearest cover within HIDE_SEARCH of `p` on its own level, or null
  // (G9: the goat never runs at the floor's hides). With none on its level it
  // does its ordinary dash and comes back, so it never runs at a rim all walk.
  // On flat ground every hide is on its level, so the choice is today's.
  function nearestHide(p) {
    let best = null;
    let bestD = Infinity;
    for (const h of hides) {
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d <= HIDE_SEARCH && d < bestD && ground.sameLevel(p.x, p.z, h.x, h.z)) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  // Into cover, for good. A caught critter was already paid for, so only one
  // that got away untouched tells the walk.
  function hide(c) {
    c.hidden = true;
    c.fleeing = false;
    c.hideAt = null;
    c.spottable = false;
    c.stalkClose = false;
    if (c.type === 'frog' || c.type === 'goat') c.group.position.y = ground.y(c.group.position.x, c.group.position.z); // never left mid-hop
    c.group.visible = false; // contactshadows.js collapses a hidden mover's decal
    if (!c.tagged && onHide) onHide(c);
  }

  const api = {
    list,
    nearest(pos, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const c of list) {
        if (!CHASEABLE.has(c.type) || c.fleeing || c.hidden) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    },
    catchAt(pos) {
      for (const c of list) {
        if (!c.hidden && (c.type === 'butterfly' || c.type === 'firefly') &&
            c.group.position.distanceTo(pos) < 0.8) {
          remove(c);
          return c;
        }
      }
      return null;
    },
    // playMoment(moment) — the scripted "look at that!" dash. The runner used
    // to be hardcoded to a squirrel, which is right for the three original
    // areas and wrong for The Old Docks, where the two moments are both rats
    // and there is not a squirrel in the district. `moment.type` is optional
    // and defaults to 'squirrel', so every existing moment is unchanged.
    playMoment(moment) {
      const runner = spawn({ type: moment.type ?? 'squirrel', x: moment.from.x, z: moment.from.z });
      runner.moment = { target: new THREE.Vector3(moment.x, 0, moment.z), t: 0 };
    },
    dismayNear(pos, range) {
      for (const c of list) {
        if (!c.hidden && c.type === 'villager' && villagerPos(c, _vp).distanceTo(pos) < range) c.meowWaveT = 1.5;
      }
    },
    // reactToMeow(pos, { far }) — someone meowed at `pos`. The villager wave
    // and the bird/seagull startle are unchanged and unconditional, so with
    // `far` off (every caller that has not earned Far Call, plus every remote
    // meow arriving over the wire, which carries no skill information and must
    // not) this loop is byte-for-byte the old one.
    //
    // v18 CF-5: the spec says the call draws "strays and critters" and only
    // the stray half shipped. `far` adds the critter half — curious critters
    // out to FAR_CALL_RADIUS come over to see who shouted, mirroring
    // straycats.reactToMeow's outer band.
    //
    // MOVEMENT ONLY. It retargets an idle anchor and nothing else: no
    // spottable flag, no journal sighting, no award, no catch cooldown. That
    // matters — critters.nearest feeds the chase prompt and catchAt/pounceCatch
    // pay out, so a meow that could mark a critter would turn Far Call into a
    // scoring vector that out-farms walking over to one.
    //
    // Every number is derived from POSITIONS (the bearing from caller to
    // critter, its own distance). Nothing here rolls: critters.js takes an
    // injected opts.rng precisely so two co-walkers on one room seed agree,
    // and a bare Math.random() in the draw would reintroduce that divergence.
    // Returns how many critters heard the call.
    reactToMeow(pos, { far = false } = {}) {
      let count = 0;
      for (const c of list) {
        if (c.hidden) continue; // in cover for the walk: it hears nothing
        const d = c.group.position.distanceTo(pos);
        if (c.type === 'villager' && villagerPos(c, _vp).distanceTo(pos) < 6) c.meowWaveT = 1.5;
        if ((c.type === 'bird' || c.type === 'seagull') && !c.fleeing && d < 5) {
          c.fleeing = true;
          c.cooldown = 18;
        }
        if (!far || !CURIOUS.has(c.type) || d >= FAR_CALL_RADIUS) continue;
        // A fleeing critter is busy getting away, a scripted `moment` runner
        // is on rails, and a trail butterfly already orbits the cat — none of
        // the three has an idle anchor worth retargeting.
        if (c.fleeing || c.moment || c.trail) continue;
        // Approach along the critter's own bearing and stop a body length
        // short, so a called-in group fans out around the caller instead of
        // stacking on one point (the same shape straycats.js uses).
        const away = c.group.position.clone().sub(pos).setY(0);
        if (away.lengthSq() < 0.0001) away.set(0, 0, 1);
        c.anchorTo = pos.clone().setY(0).addScaledVector(away.normalize(), FAR_CALL_STANDOFF);
        c.drawT = FAR_CALL_DRAW_TIME;
        count += 1;
      }
      return count;
    },
    dispose() {
      for (const c of [...list]) remove(c);
    },
    setFleeModifier(m) {
      fleeModifier = m;
    },
    markStalked(catPos, isStalking) {
      catStalking = !!isStalking;
      for (const c of list) {
        if (!STALKABLE.has(c.type) || c.hidden) continue;
        const d = c.group.position.distanceTo(catPos);
        if (isStalking && d < 3) c.stalkClose = true;
        else if (!isStalking && d > 6) c.stalkClose = false;
      }
    },
    // tag, not hunting-hunting: no critter is ever removed here — the catch just
    // marks it caught (uncatchable for 20s) and sends it fleeing fast. Task 13:
    // a mouse, rat or squirrel with cover in reach flees to it and hides — the
    // catch still returns exactly what it did, and the caller still pays.
    pounceCatch(pos) {
      let best = null;
      let bestD = 0.9;
      for (const c of list) {
        if (!STALKABLE.has(c.type) || c.hidden) continue;
        if (c.caughtUntil && c.caughtUntil > clock) continue;
        const d = c.group.position.distanceTo(pos);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (!best) return null;
      const wasStalked = !!best.stalkClose;
      best.caughtUntil = clock + 20;
      best.fleeing = true;
      best.cooldown = best.type === 'bird' ? 18 : 3;
      best.stalkClose = false;
      // A scripted moment runner is on rails and despawns on its own.
      if (PREY.has(best.type) && !best.moment) {
        best.tagged = true;
        best.startleT = 0; // caught mid-startle: it is off at once
        best.hideAt = best.hideAt ?? nearestHide(best.group.position);
      }
      return { type: best.type, wasStalked };
    },
    update(dt, t, playerPos, catPos) {
      clock = t;
      // R29: the cat's ground speed from its last two positions. Timed off
      // `t` (real time, like the cat's own movement) rather than `dt`, which
      // the slow-mo after a perfect sneak shrinks; `dt` only if `t` stalls.
      // A step faster than CAT_SPEED_CAP is not the cat running — it is a
      // perch snap (interactions.js moves the cat onto a perch in one frame)
      // or a respawn — so it keeps the last reading rather than scaring a
      // mouse beside a still touch player who tapped climb.
      if (lastCat) {
        const span = t > lastT ? t - lastT : dt;
        if (span > 0) {
          const speed = Math.hypot(catPos.x - lastCat.x, catPos.z - lastCat.z) / span;
          if (speed <= CAT_SPEED_CAP) catStill = speed < STILL_SPEED;
        }
        lastCat.copy(catPos);
      } else {
        lastCat = catPos.clone();
      }
      lastT = t;
      for (const c of [...list]) {
        if (c.hidden) continue; // Task 13: in cover for the rest of the walk
        const p = c.group.position;
        const px = p.x;
        const pz = p.z;
        const dPlayer = p.distanceTo(playerPos);
        const dCat = p.distanceTo(catPos);
        const threat = Math.min(dPlayer, dCat);

        // v18 Far Call: ease the idle anchor toward wherever it is currently
        // aimed — the caller while a call is live, home once it lapses. With
        // no call in play anchorTo is null and the anchor is already home, so
        // this is a single Vector3 equality check and nothing moves.
        if (c.drawT > 0) {
          c.drawT -= dt;
          if (c.drawT <= 0) {
            c.anchorTo = null;
            c.calm = true; // R32: it came because it was called — see the prey branch
          }
        }
        const anchorGoal = c.anchorTo ?? c.anchorHome;
        if (!c.anchor.equals(anchorGoal)) {
          const step = ANCHOR_SPEED * dt;
          const toGoal = anchorGoal.clone().sub(c.anchor);
          if (toGoal.length() <= step) c.anchor.copy(anchorGoal);
          else c.anchor.addScaledVector(toGoal.normalize(), step);
        }

        if (c.moment) {
          // scripted dash: out 3s, back 3s, then despawn
          c.moment.t += dt;
          const target = c.moment.t < 3 ? c.moment.target
            : c.anchor.clone();
          const dir = target.clone().sub(p).setY(0);
          if (dir.length() > 0.2) {
            p.addScaledVector(dir.normalize(), dt * 5);
            onGround(p, px, pz);
          }
          if (c.moment.t > 6) remove(c);
          continue;
        }

        if (c.type === 'bird' || c.type === 'seagull') {
          if (c.fleeing) {
            p.y += dt * 6;
            p.x += Math.sin(c.phase) * dt * 4;
            p.z += Math.cos(c.phase) * dt * 4;
            if (!ground.flat) ground.slide(px, pz, p); // flying up: its height is its own
            c.cooldown -= dt;
            if (c.cooldown <= 0) {
              p.set(c.anchor.x, ground.y(c.anchor.x, c.anchor.z), c.anchor.z);
              c.fleeing = false;
            }
          } else {
            p.y = ground.y(p.x, p.z) + Math.abs(Math.sin(t * 3 + c.phase)) * 0.08; // hop
            if (threat < 2.5 * fleeScale * fleeModifier * (c.type === 'seagull' ? 1.4 : 1)) {
              c.fleeing = true;
              c.cooldown = 18;
            }
          }
        } else if (c.type === 'squirrel' || c.type === 'mouse' || c.type === 'rat' || c.type === 'rabbit' || c.type === 'frog' || c.type === 'goat') {
          // Every flee speed stays under the 9 m/s pounce lunge, so a child can still tag one.
          // (The goat can't be tagged at all; it only bolts.)
          const goat = c.type === 'goat';
          const fleeSpeed = goat ? GOAT_FLEE : c.type === 'mouse' ? 6.5 : c.type === 'rabbit' ? 6.0 : c.type === 'frog' ? 5.0 : c.type === 'rat' ? 5.5 : 4.5;
          // Task 13: noticing the cat. Off cover, it is the pounce-tag's dash.
          // A stalking or still cat is noticed late and startles it first
          // (R27, R29); a critter answering a Far Call came because it was
          // called, and notices nothing while the call lasts (R28) — nor after
          // it (R32), until the cat has once been out past PREY_NOTICE or the
          // critter is back at its home anchor, whichever comes first.
          if (c.calm && (dCat > PREY_NOTICE || c.anchor.equals(c.anchorHome))) c.calm = false;
          // The goat notices any cat at GOAT_NOTICE, in 2D, and never freezes first.
          const sneaky = !goat && (catStalking || catStill);
          const near = goat ? Math.hypot(p.x - catPos.x, p.z - catPos.z) < GOAT_NOTICE
            : dCat < (sneaky ? PREY_NOTICE_STALKED : PREY_NOTICE);
          if (!c.fleeing && !(c.drawT > 0) && !c.calm && near) {
            c.fleeing = true;
            c.cooldown = 3;
            c.hideAt = nearestHide(p);
            // No freezing on top of its own cover: it is simply in.
            const atCover = c.hideAt && p.distanceTo(c.hideAt) <= HIDE_REACH;
            c.startleT = sneaky && !atCover ? PREY_STARTLE : 0;
          }
          if (c.startleT > 0) {
            c.startleT -= dt; // frozen to the spot
          } else if (c.fleeing && c.hideAt) {
            // running for cover: straight there, at the dash speed, until it is in
            const to = c.hideAt.clone().sub(p).setY(0);
            const d = to.length();
            if (d > HIDE_REACH) {
              p.addScaledVector(to.normalize(), Math.min(dt * fleeSpeed, d));
              onGround(p, px, pz);
            }
            if (p.distanceTo(c.hideAt) <= HIDE_REACH) hide(c);
          } else if (c.fleeing) {
            // pounce-tagged: dash away from the cat for a few seconds, then resume patrol
            const away = p.clone().sub(catPos).setY(0);
            if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
            away.normalize();
            p.addScaledVector(away, dt * fleeSpeed);
            onGround(p, px, pz);
            c.cooldown -= dt;
            if (c.cooldown <= 0) {
              c.fleeing = false;
              // The catch is over: if it later gets away to cover untouched,
              // that is an escape like any other, and the walk hears of it.
              c.tagged = false;
            }
          } else {
            const a = c.anchor;
            const bPt = a.clone().add(c.patrolSpan);
            const k = (Math.sin(t * 0.6 + c.phase) + 1) / 2;
            p.lerpVectors(a, bPt, k);
            if (!ground.flat) p.y = ground.y(p.x, p.z);
          }
          // A bolting frog hops; every other frame (patrol, startle, hidden) it sits on the ground.
          if (c.type === 'frog') {
            p.y = ground.y(p.x, p.z) + (c.fleeing && !(c.startleT > 0) ? 0.12 * Math.abs(Math.sin(12 * t)) : 0);
          }
          // A bolting goat bounds; stopped, it stands on the ground.
          if (goat) p.y = ground.y(p.x, p.z) + (c.fleeing ? 0.25 * Math.abs(Math.sin(9 * t)) : 0);
        } else if (c.type === 'butterfly' || c.type === 'firefly') {
          const cx = c.trail ? catPos.x : c.anchor.x;
          const cz = c.trail ? catPos.z : c.anchor.z;
          p.x = cx + Math.sin(t * 0.8 + c.phase) * 1.5;
          p.z = cz + Math.cos(t * 0.6 + c.phase) * 1.5;
          p.y = ground.y(p.x, p.z) + 0.8 + Math.sin(t * 2 + c.phase) * 0.3;
        } else if (c.type === 'duck') {
          const r = 2;
          p.x = c.anchor.x + Math.cos(t * 0.3 + c.phase) * r;
          p.z = c.anchor.z + Math.sin(t * 0.3 + c.phase) * r;
          c.group.rotation.y = -(t * 0.3 + c.phase);
          if (!ground.flat) p.y = ground.y(p.x, p.z);
        } else if (c.type === 'crab') {
          p.x = c.anchor.x + Math.sin(t * 1.5 + c.phase) * 1.2;
          if (!ground.flat) p.y = ground.y(p.x, p.z);
        } else if (c.type === 'villager') {
          const arm = c.group.userData.arm;
          if (c.meowWaveT > 0) c.meowWaveT -= dt;
          const dWave = villagerPos(c, _vp).distanceTo(playerPos);
          if (dWave < 5 || c.meowWaveT > 0) {
            arm.rotation.z = 2.6 + Math.sin(t * 6) * 0.3; // wave
            if (!c.waved && dWave < 5) {
              c.waved = true;
              bus.emit('villager:wave', { id: c.id });
            }
          } else {
            arm.rotation.z = 0.4;
            if (dWave > 8) c.waved = false;
          }
        }
      }
    },
  };
  return api;
}
