import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { dogNotices, dogLanding, DOG_COOLDOWN } from './dogs.js';

// =============================================================================
// The dog in its yard — the THREE half (v21 Stream 3b, Task 16).
//
// One friendly dog per outdoor area, lying by its kennel on its lawn, head up,
// tail going. Step onto its lawn and it barks; then — unless your cat is one
// of the fearless breeds it only barks at — it chases you off, exactly the way
// a rival's patrol scampers a trespasser out (rivalcats.js): the cat runs a
// smoothstep to a landing spot just off the lawn, with a small hop, while the
// dog bounds after it to the edge of its yard and stops there. Then it trots
// home, lies down again, and leaves you alone for DOG_COOLDOWN seconds.
//
// THE DOG TAKES NOTHING. No points, no freeze, no drop (a carried item stays
// in your mouth), no marks, no taming: this module moves the local cat and
// calls back, and that is all. It imports nothing that stores progress
// (test/yarddog.test.js pins the import list), and draws no randomness.
//
// Local to this device, like the rival's dash: only the local cat is ever
// passed to update, and the dog's place is a pure function of its yard, so
// nothing goes on any wire.
//
// Each geometry and material is created here and disposed exactly once in
// dispose(), which takes the meshes out of the scene first so endWalk's scene
// traversal never frees them a second time. dispose() is idempotent.
// =============================================================================

// The scamper — the rival patrol's numbers, so the two chases feel the same.
const SCAMPER_TIME = 0.65;
const SCAMPER_TIME_REDUCED = 0.3;
const HOP = 0.18;
// The dog's bound after the cat, m/s; it stops this short of the cat, and
// this far inside its own yard's edge.
const BOUND_SPEED = 6;
const BOUND_STOP = 1.1;
const EDGE_INSET = 0.4;
// Its trot home afterwards, and the fearless-cat bark (it stands up, barks,
// lies back down).
const RETURN_TIME = 1.5;
const BARK_TIME = 0.8;
// How long it stands at the edge of its lawn, watching you go, before it
// trots home.
const EDGE_HOLD = 0.8;
// Where it lies: this far from its kennel, toward the middle of the lawn.
const HOME_OFF = 1.0;
// It lifts its head to watch a cat this close to the yard's edge.
const WATCH_MARGIN = 3;
// The kennel is solid: a collider about its centre.
const KENNEL_R = 0.55;
// The worn patch of lawn the yard is, as a faint flat disc.
const PATCH_ALPHA = 0.1;
const PATCH_LIFT = 0.006;

const smooth = (u) => u * u * (3 - 2 * u);
// rotation.y that turns +z (the dog's and the kennel door's front) toward (dx, dz).
const heading = (dx, dz) => Math.atan2(dx, dz);
// rotation.y that makes a CAT face (dx, dz): player.js's / rivalcats.js's formula.
const catFacing = (dx, dz) => Math.atan2(dx, dz) + Math.PI;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const NO_DOG = Object.freeze({
  update() {},
  dispose() {},
  spotPos: null,
  group: null,
  colliders: Object.freeze([]),
  state: 'none',
});

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// A friendly, blocky dog, front at +z, its paws at y 0. userData.parts holds
// what update() animates.
function buildDog() {
  const coat = litMaterial(0xc8a060);
  const dark = litMaterial(0x7a5230);
  const nose = litMaterial(0x2a2220);
  const collar = litMaterial(0xd04848);
  const g = new THREE.Group();
  // The body rides on its own group so lying down is one move.
  const torso = new THREE.Group();
  torso.add(box(0.36, 0.3, 0.72, coat));
  torso.add(box(0.28, 0.12, 0.3, litMaterial(0xf0e2c8), 0, -0.1, 0.18)); // pale chest
  g.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.22, 0.38);
  head.add(box(0.3, 0.28, 0.28, coat));
  head.add(box(0.16, 0.12, 0.16, coat, 0, -0.05, 0.2));     // snout
  head.add(box(0.07, 0.06, 0.04, nose, 0, -0.01, 0.29));    // nose
  for (const s of [-1, 1]) {
    const ear = box(0.08, 0.2, 0.12, dark, s * 0.17, 0.0, -0.02);
    ear.rotation.z = s * 0.25;
    head.add(ear);
    head.add(box(0.04, 0.04, 0.02, nose, s * 0.07, 0.06, 0.145)); // eyes
  }
  head.add(box(0.32, 0.05, 0.3, collar, 0, -0.16, -0.06));
  torso.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.1, -0.36);
  const tailMesh = box(0.07, 0.07, 0.3, dark, 0, 0, -0.15);
  tail.add(tailMesh);
  tail.rotation.x = -0.6; // up and out
  torso.add(tail);
  const legs = [];
  for (const [lx, lz] of [[-0.12, 0.25], [0.12, 0.25], [-0.12, -0.25], [0.12, -0.25]]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0, lz);
    leg.add(box(0.1, 0.3, 0.1, coat, 0, 0.15, 0));
    g.add(leg);
    legs.push(leg);
  }
  g.userData.parts = { torso, head, tail, legs };
  return g;
}

// A little wooden kennel, door at +z, on the ground.
function buildKennel() {
  const wall = litMaterial(0xb0563c);
  const roof = litMaterial(0x5a4a40);
  const door = litMaterial(0x2a1e18);
  const g = new THREE.Group();
  g.add(box(0.9, 0.62, 0.9, wall, 0, 0.31, 0));
  for (const s of [-1, 1]) {
    const half = box(0.62, 0.06, 1.0, roof, s * 0.24, 0.8, 0);
    half.rotation.z = -s * 0.62;
    g.add(half);
  }
  g.add(box(0.5, 0.2, 0.9, wall, 0, 0.68, 0)); // the gable fill under the roof
  g.add(box(0.36, 0.42, 0.02, door, 0, 0.21, 0.452));
  return g;
}

// createYardDog(scene, yard, opts) → { update(dt, catPos, avatar, { stalking }),
//   spotPos, group, colliders, state, dispose() }
//
// yard is propsFor(areaId).dogYard; null or anything unusable is NO_DOG.
// opts:
//   reducedMotion  a short move, no hop, no bound, no wagging.
//   isWalkable     (x, z) => bool, the walk's own check (isWalkableAt).
//   canChase()     false while perched or in photo mode, or while another
//                  chase owns the cat (rivalcats.js's chaseAllowed).
//   fearless       the cat is a breed the dog only barks at.
//   onBark()       the dog barks (the caller plays the sound).
//   onChase()      a chase starts — exactly once per chase.
//   onSettled()    the chased cat has landed.
//
// update mutates catPos (the LOCAL cat's position) only during a chase, and
// sets the avatar's facing then and nowhere else.
export function createYardDog(scene, yard, {
  reducedMotion = false,
  isWalkable = () => true,
  canChase = () => true,
  fearless = false,
  onBark = () => {},
  onChase = () => {},
  onSettled = () => {},
} = {}) {
  const ok = yard !== null && typeof yard === 'object'
    && [yard.x, yard.z, yard.r].every(Number.isFinite) && yard.r > 0
    && yard.kennel && Number.isFinite(yard.kennel.x) && Number.isFinite(yard.kennel.z);
  if (!ok) return NO_DOG;
  const Y = { x: yard.x, z: yard.z, r: yard.r, kennel: { x: yard.kennel.x, z: yard.kennel.z } };
  // A fenced yard's way out (dogs.js validates it; dogLanding uses it).
  if (yard.exit && typeof yard.exit === 'object') Y.exit = { x: yard.exit.x, z: yard.exit.z };

  // Home: beside the kennel, toward the middle of the lawn, facing it.
  let ux = Y.x - Y.kennel.x;
  let uz = Y.z - Y.kennel.z;
  const ud = Math.hypot(ux, uz);
  if (ud > 1e-6) { ux /= ud; uz /= ud; } else { ux = 0; uz = 1; }
  const homeX = Y.kennel.x + ux * HOME_OFF;
  const homeZ = Y.kennel.z + uz * HOME_OFF;
  const homeYaw = heading(ux, uz);

  const added = [];
  const kennel = buildKennel();
  kennel.position.set(Y.kennel.x, 0, Y.kennel.z);
  kennel.rotation.y = homeYaw;
  scene.add(kennel);
  added.push(kennel);

  const patchGeo = new THREE.CircleGeometry(Y.r, 40);
  const patch = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: PATCH_ALPHA, depthWrite: false,
  }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(Y.x, PATCH_LIFT, Y.z);
  patch.castShadow = false;
  patch.receiveShadow = false;
  patch.userData.contactDecal = true;
  scene.add(patch);
  added.push(patch);

  const dog = buildDog();
  const { torso, head, tail, legs } = dog.userData.parts;
  dog.position.set(homeX, 0, homeZ);
  dog.rotation.y = homeYaw;
  scene.add(dog);
  added.push(dog);

  const colliders = [{ x: Y.kennel.x, z: Y.kennel.z, r: KENNEL_R }];

  let state = 'lie'; // 'lie' | 'chase' | 'edge' | 'return'
  let disposed = false;
  let clock = 0;
  let cooldown = 0;
  let barkT = 0;
  let stand = 0; // 0 lying, 1 standing
  let elapsed = 0;
  let duration = SCAMPER_TIME;
  let fromX = 0;
  let fromZ = 0;
  let toX = 0;
  let toZ = 0;
  let returnT = 0;
  let holdT = 0;
  let leftX = homeX;
  let leftZ = homeZ;

  // Lying: legs folded, body down; standing: up on its legs.
  function pose(dt, standTo, wag) {
    const k = Math.min(1, dt * 8);
    stand += (standTo - stand) * (reducedMotion ? 1 : k);
    torso.position.y = 0.17 + stand * 0.2;
    for (const leg of legs) leg.scale.y = 0.2 + stand * 0.8;
    tail.rotation.y = reducedMotion ? 0 : Math.sin(clock * wag) * 0.55;
  }

  // The dog turns its head toward (tx, tz), as far as a neck goes.
  function look(tx, tz) {
    const want = wrap(heading(tx - dog.position.x, tz - dog.position.z) - dog.rotation.y);
    head.rotation.y = Math.max(-0.9, Math.min(0.9, want));
  }

  // The bound: toward (tx, tz) at BOUND_SPEED, stopping BOUND_STOP short of
  // it and never past the edge of its own lawn. Reduced motion: it stays put.
  // Returns whether it moved.
  function boundToward(tx, tz, dt) {
    const dx = tx - dog.position.x;
    const dz = tz - dog.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-3) dog.rotation.y = heading(dx, dz);
    if (reducedMotion || dist <= BOUND_STOP) return false;
    const step = Math.min(BOUND_SPEED * dt, dist - BOUND_STOP);
    let nx = dog.position.x + (dx / dist) * step;
    let nz = dog.position.z + (dz / dist) * step;
    const ex = nx - Y.x;
    const ez = nz - Y.z;
    const ed = Math.hypot(ex, ez);
    const edge = Y.r - EDGE_INSET;
    if (ed > edge) { nx = Y.x + (ex / ed) * edge; nz = Y.z + (ez / ed) * edge; }
    const moved = Math.hypot(nx - dog.position.x, nz - dog.position.z) > 1e-4;
    dog.position.x = nx;
    dog.position.z = nz;
    return moved;
  }

  function update(dt, catPos, avatar, { stalking = false } = {}) {
    if (disposed || !(dt >= 0) || !catPos) return;
    clock += dt;
    cooldown = Math.max(0, cooldown - dt);
    if (barkT > 0) barkT = Math.max(0, barkT - dt);

    if (state === 'lie' || state === 'return') {
      if (state === 'return') {
        returnT += dt;
        const w = smooth(Math.min(1, returnT / RETURN_TIME));
        dog.position.x = leftX + (homeX - leftX) * w;
        dog.position.z = leftZ + (homeZ - leftZ) * w;
        dog.rotation.y = heading(homeX - leftX, homeZ - leftZ);
        if (w >= 1) {
          state = 'lie';
          dog.rotation.y = homeYaw;
        }
        pose(dt, 1, 9);
        head.rotation.y = 0;
        head.position.y = 0.22;
      } else {
        pose(dt, barkT > 0 ? 1 : 0, 7);
        const near = Math.hypot(catPos.x - Y.x, catPos.z - Y.z) < Y.r + WATCH_MARGIN;
        if (near) look(catPos.x, catPos.z);
        else head.rotation.y *= reducedMotion ? 0 : Math.max(0, 1 - dt * 3);
        head.position.y = 0.22 + (barkT > 0 && !reducedMotion ? Math.abs(Math.sin(barkT * 18)) * 0.04 : 0);
      }

      if (state === 'lie' && cooldown <= 0 && canChase() !== false
        && dogNotices(Y, catPos, { stalking })) {
        if (fearless) {
          barkT = BARK_TIME;
          cooldown = DOG_COOLDOWN;
          onBark();
          return;
        }
        const land = dogLanding(Y, catPos, isWalkable);
        if (land) {
          barkT = BARK_TIME;
          onBark();
          state = 'chase';
          elapsed = 0;
          duration = reducedMotion ? SCAMPER_TIME_REDUCED : SCAMPER_TIME;
          fromX = catPos.x;
          fromZ = catPos.z;
          toX = land.x;
          toZ = land.z;
          onChase();
        }
      }
      return;
    }

    if (state === 'edge') {
      // Out to the edge of its lawn after the cat, then a moment watching it go.
      pose(dt, 1, 14);
      head.position.y = 0.22;
      if (!boundToward(toX, toZ, dt)) holdT -= dt;
      head.rotation.y = 0;
      if (holdT <= 0) {
        leftX = dog.position.x;
        leftZ = dog.position.z;
        returnT = 0;
        state = Math.hypot(leftX - homeX, leftZ - homeZ) > 1e-3 ? 'return' : 'lie';
        if (state === 'lie') dog.rotation.y = homeYaw;
      }
      return;
    }

    // 'chase'
    elapsed += dt;
    const u = Math.min(1, elapsed / duration);
    const e = smooth(u);
    catPos.x = fromX + (toX - fromX) * e;
    catPos.z = fromZ + (toZ - fromZ) * e;
    // Chases are gated on a grounded cat (canChase), so the rest height is the
    // ground: a pounce's lift is never carried along. A small hop on top,
    // none in reduced motion, and it ends on the ground.
    catPos.y = reducedMotion ? 0 : Math.sin(u * Math.PI) * HOP;
    if (avatar) avatar.rotation.y = catFacing(toX - fromX, toZ - fromZ);
    // The dog bounds after it, to the edge of its lawn and no further.
    head.rotation.y = 0;
    head.position.y = 0.22;
    pose(dt, 1, 14);
    boundToward(catPos.x, catPos.z, dt);
    if (u >= 1) {
      catPos.x = toX;
      catPos.z = toZ;
      catPos.y = 0;
      // On arrival the cat looks back at the dog.
      if (avatar) avatar.rotation.y = catFacing(dog.position.x - toX, dog.position.z - toZ);
      state = 'edge';
      holdT = EDGE_HOLD;
      cooldown = DOG_COOLDOWN;
      onSettled();
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geos = new Set();
    const mats = new Set();
    for (const obj of added) {
      scene.remove(obj);
      obj.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        for (const m of [].concat(o.material ?? [])) if (m) mats.add(m);
      });
    }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    added.length = 0;
  }

  return {
    update,
    dispose,
    group: dog,
    colliders,
    get state() { return state; },
    // Where the dog is now, as a fresh { x, z } — what the journal spots (null
    // once disposed). Read-only; nothing here reads it back.
    get spotPos() { return disposed ? null : { x: dog.position.x, z: dog.position.z }; },
  };
}
