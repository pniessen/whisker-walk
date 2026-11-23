import * as THREE from 'three';
import { buildCat, catStyle } from '../cat/model.js';
import { animateCat } from '../cat/animator.js';
import { kittenProportions } from '../kitten.js';
import { leanOnGround } from '../ground.js';
import { inWater } from './water.js';
import { hash01 } from './builder.js';
import { withLocalUuids } from './localuuids.js';
import { phrase } from '../clanphrases.js';
import { words } from '../wordset.js';
import { bus } from '../events.js';
import { KEEPER_DOOR, KEEPER_PACE, KITTEN_SPOTS } from './lighthouseplan.js';

// =============================================================================
// THE KEEPER'S CAT AND HER KITTEN (milestone 3: the kitten job). Made once a walk by world/lighthouselife.js;
// update(dt, catPos) every frame. Part of the place's chunk.
//
// THE KEEPER'S CAT ("Biscuit", a ginger tabby, until the owner's daughter picks a name) paces on the porch of the
// cottage and sits looking down at the shore: a loop of walk seconds (PACE), never a random draw. Her kitten
// ("Pebble", grey, smaller) waits in one of three hiding places: a pool ledge, the cave's back nook, or beside the
// upturned boat. WHICH one comes from hash01 and LIGHT_KITTEN_SALT of the room's seed (a solo walk: how many
// times she has walked here), so two screens in one room agree and each walk is different.
//
// THE JOB (the Farm's rules: no clock, no failure, per device, nothing sent):
//   * a paw-print trail runs the last few metres to the kitten from where the shore opens (KITTEN_SPOTS[].from);
//   * within HEAR_R of her, until she is found, the kitten mews now and then (sound) and the walk says so once;
//   * the keeper's cat looking at the shore is the offer: within OFFER_R of her the walk says so once;
//   * within PROMPT_R of the kitten (on her level) the prompt is "say hello": E and the kitten follows;
//   * the kitten follows the way she walked (her footprints, never a straight line through a cliff), hurrying up to
//     CATCH_MAX when she falls behind a running cat, waiting when she is far, never running off and never failing. She stops following when the cat is on the stair or a perch
//     (the trail only takes her paws on the ground) and catches up where she next stands;
//   * with the kitten within HOME_R of the porch's door and she within HOME_R of it, the job pays
//     AWARDS.lighthousejob once a walk (log.awardOnce under KITTEN_KEY) under the line "home safe", the kitten
//     goes in and Mum purrs.
// A walk picked up again that already has the pay finds the kitten home and the keeper's cat content.
//
// Both cats are the game's own cat model (cat/model.js), 29 meshes and 8,750 triangles each: they are drawn only
// within SHOW_R of her, and only the keeper's cat or the kitten may be drawn at once when she is far from the
// cottage. They cast no shadow. Draws no random number and reads no clock.
// =============================================================================

export const LIGHT_KITTEN_SALT = 0x1170c3;
export const KITTEN_KEY = 'lighthouse-job-kitten';
export const HEAR_R = 14;
export const MEW_EVERY = 6; // walk seconds between mews
export const OFFER_R = 7;
export const PROMPT_R = 2.2;
export const HOME_R = 4;
export const SHOW_R = 48;
export const FOLLOW_SPEED = 2.6;
export const CATCH_MAX = 5.2; // m/s: a gap in her path of more than FOLLOW_GAP makes her hurry, up to this, so she keeps up with a running cat
export const CATCH_GAIN = 1.0; // m/s for each metre of gap over FOLLOW_GAP
export const FOLLOW_GAP = 1.5; // m of her path she keeps between them
export const CRUMB_EVERY = 0.6;
export const LEVEL_TOL = 1.2; // m: she only follows footprints on her own level (a stair or a ledge is left to the cat)
export const SNAP_R = 6; // a crumb further than this from the last was a leap or a drop: the kitten catches up
export const PACE = Object.freeze({ cycle: 16, walkA: 3, sitB: 4, walkB: 3, speed: 0.9 });
const PRINT = Object.freeze({ every: 1.3, reach: 16, stop: 2.4, side: 0.13, r: 0.07, y: 0.03 });

// Which of the three places (0, 1, 2) the kitten hides in. Pure: the seed or the walk count and the salt.
export function kittenSpotIndex(roomSeed, visits = 0) {
  const solo = roomSeed === undefined || roomSeed === null;
  const a = solo ? Number(visits) || 0 : Number(roomSeed) % 9973;
  const b = solo ? 3 : (Number(roomSeed) >>> 4) % 7919;
  const i = Math.floor(hash01(a, b, LIGHT_KITTEN_SALT) * KITTEN_SPOTS.length);
  return Number.isFinite(i) ? Math.min(KITTEN_SPOTS.length - 1, Math.max(0, i)) : 0; // (a seed that is not a number is the first place)
}

const YAW = (dx, dz) => Math.atan2(dx, dz) + Math.PI; // the model faces -z: player.js turns a cat by atan2(v.x, v.z) + PI
const GINGER = Object.freeze({ ...catStyle('tabby'), base: 0xc27a3e, belly: 0xf1e2c4, accent: 0x8a4c20 });
const GREY = Object.freeze({ ...catStyle('tabby'), base: 0x8c909a, belly: 0xe6e6ea, accent: 0x5a5d68 });

// The paw prints: one mesh of small flat discs, pairs along the last PRINT.reach m before PRINT.stop m short of the kitten.
// Prints that would land in water, in a wall or off the kitten's level are left out.
export function trailPrints(spot, { ground, colliders = [], waters = [] }) {
  const dx = spot.x - spot.from.x;
  const dz = spot.z - spot.from.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len; const uz = dz / len;
  const startAt = Math.max(0, len - PRINT.reach);
  const level = ground.y(spot.x, spot.z);
  const out = [];
  let side = 1;
  for (let d = startAt; d <= len - PRINT.stop; d += PRINT.every) {
    const x = spot.from.x + ux * d - uz * PRINT.side * side;
    const z = spot.from.z + uz * d + ux * PRINT.side * side;
    side = -side;
    if (inWater(waters, x, z) || Math.abs(ground.y(x, z) - level) > 0.1) continue;
    if (colliders.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + 0.15)) continue;
    out.push({ x, z });
  }
  return out;
}

function printsMesh(points, ground) {
  const seg = 8;
  const pos = [];
  for (const p of points) {
    const y = ground.y(p.x, p.z) + PRINT.y;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2; const a1 = ((i + 1) / seg) * Math.PI * 2;
      pos.push(p.x, y, p.z, p.x + Math.cos(a0) * PRINT.r, y, p.z + Math.sin(a0) * PRINT.r, p.x + Math.cos(a1) * PRINT.r, y, p.z + Math.sin(a1) * PRINT.r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3a2a1c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.name = 'lighthouse:prints';
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  m.userData.noCast = true;
  return m;
}

const say = (key, label) => bus.emit('discovery', { type: 'lighthousenote', key, label, points: 0, repeat: false });

// createKeeperCats(ctx) → { update, promptAt, interact, state, spot, meshes, dispose }.
// ctx: { scene, ground, colliders, waters, sound, log, progression, roomSeed, visits, reducedMotion }.
export function createKeeperCats(ctx) {
  const { scene, ground, sound, log, progression, reducedMotion = false } = ctx;
  const colliders = ctx.colliders ?? [];
  const waters = ctx.waters ?? [];
  const index = kittenSpotIndex(ctx.roomSeed, ctx.visits ?? 0);
  const spot = KITTEN_SPOTS[index];
  const done0 = !!log && log.count(KITTEN_KEY) > 0;
  let state = done0 ? 'home' : 'hidden'; // hidden -> following -> tumbling -> home
  let t = 0;
  let mewAt = 0;
  let heard = false;
  let offered = done0;
  let tumbleLeft = 0;
  const crumbs = [];
  let lastCrumb = null;
  let disposed = false;
  let trail = null;

  const made = withLocalUuids('lighthouse-cats', () => {
    const m = buildCat('tabby', undefined, { style: GINGER });
    m.name = 'lighthouse:keeper';
    const k = kittenProportions(buildCat('tabby', undefined, { style: GREY, kitten: true }));
    k.name = 'lighthouse:kitten';
    for (const c of [m, k]) c.traverse((o) => { o.castShadow = false; });
    return [m, k];
  });
  const [mother, kitten] = made;
  const y0 = (x, z) => ground.y(x, z);
  mother.position.set(KEEPER_PACE.b.x, y0(KEEPER_PACE.b.x, KEEPER_PACE.b.z), KEEPER_PACE.b.z);
  kitten.position.set(spot.x, y0(spot.x, spot.z), spot.z);
  if (done0) kitten.visible = false;
  scene.add(mother, kitten);
  if (!done0) {
    const pts = trailPrints(spot, { ground, colliders, waters });
    if (pts.length) { trail = withLocalUuids('lighthouse-prints', () => printsMesh(pts, ground)); scene.add(trail); }
  }

  function motherAt(time) {
    const { cycle, walkA, sitB, walkB } = PACE;
    const p = ((time % cycle) + cycle) % cycle;
    const { a, b } = KEEPER_PACE;
    const lerp = (k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
    if (p < walkA) return { ...lerp(p / walkA), walking: true, yaw: YAW(b.x - a.x, b.z - a.z) };
    if (p < walkA + sitB) return { ...b, walking: false, yaw: YAW(1, 0) };
    if (p < walkA + sitB + walkB) return { ...lerp(1 - (p - walkA - sitB) / walkB), walking: true, yaw: YAW(a.x - b.x, a.z - b.z) };
    return { ...a, walking: false, yaw: YAW(1, 0) };
  }

  // A step toward (tx, tz) over her own ground. Straight lines between footprints the cat walked (never a wall in
  // the way) and from where she was found to the first of them, so there is no sliding along rims: she is put on
  // the ground under each step.
  function stepKitten(dt, tx, tz, speed) {
    const dx = tx - kitten.position.x;
    const dz = tz - kitten.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return false;
    const step = Math.min(d, speed * dt);
    kitten.position.x += (dx / d) * step;
    kitten.position.z += (dz / d) * step;
    kitten.position.y = ground.y(kitten.position.x, kitten.position.z);
    kitten.rotation.y = YAW(dx, dz);
    leanOnGround(kitten, ground);
    return d > 0.08;
  }

  const onTheGround = (p) => Math.abs(p.y - ground.y(p.x, p.z)) < 0.35;

  function complete() {
    state = 'tumbling';
    tumbleLeft = 4;
    crumbs.length = 0;
    const paid = log?.awardOnce('lighthousejob', KITTEN_KEY, phrase('lighthouse.kitten.home')) ?? 0;
    if (paid > 0) progression?.recordSighting?.('lhjobkitten');
    sound?.purr();
  }

  return {
    get state() { return state; },
    get spot() { return spot; },
    get index() { return index; },
    get meshes() { return { mother, kitten, trail }; },
    // the line for the action button, or null
    promptAt(catPos) {
      if (state !== 'hidden' || disposed) return null;
      const near = Math.hypot(catPos.x - kitten.position.x, catPos.z - kitten.position.z) < PROMPT_R;
      return near && Math.abs(catPos.y - kitten.position.y) < 1.2 ? phrase('lighthouse.kitten.prompt') : null;
    },
    interact() {
      if (state !== 'hidden') return null;
      state = 'following';
      lastCrumb = null;
      if (trail) trail.visible = false;
      say('lighthouse-kitten-found', phrase('lighthouse.kitten.found'));
      return 'found';
    },
    update(dt, catPos) {
      if (disposed) return;
      t += dt > 0 ? dt : 0;
      const far = (o) => Math.hypot(catPos.x - o.position.x, catPos.z - o.position.z) > SHOW_R;

      // the keeper's cat: a loop of walk seconds on the porch
      const m = motherAt(t);
      mother.position.set(m.x, y0(m.x, m.z), m.z);
      mother.rotation.y = m.yaw;
      mother.visible = !far(mother);
      if (mother.visible) animateCat(mother, m.walking ? 'follow' : 'requestPet', t, m.walking ? PACE.speed : 0, reducedMotion);
      if (!offered && state === 'hidden' && Math.hypot(catPos.x - mother.position.x, catPos.z - mother.position.z) < OFFER_R) {
        offered = true;
        say('lighthouse-kitten-offer', phrase('lighthouse.kitten.offer', words().OUTSIDE_WORDS.house));
      }

      if (state === 'hidden') {
        const d = Math.hypot(catPos.x - kitten.position.x, catPos.z - kitten.position.z);
        kitten.visible = d < SHOW_R;
        if (d < HEAR_R && t >= mewAt) {
          mewAt = t + MEW_EVERY;
          sound?.mew();
          if (!heard) { heard = true; say('lighthouse-kitten-hear', phrase('lighthouse.kitten.hear')); }
        }
        if (d < 8) kitten.rotation.y = YAW(catPos.x - kitten.position.x, catPos.z - kitten.position.z);
        if (kitten.visible) animateCat(kitten, 'requestPet', t, 0, reducedMotion);
      } else if (state === 'following') {
        // her footprints, only where her paws are on the ground
        // (and on her own level: the gallery's floor is ground too, but she waits at the stair's foot)
        if (onTheGround(catPos) && Math.abs(catPos.y - (lastCrumb ? lastCrumb.y : kitten.position.y)) <= LEVEL_TOL) {
          if (!lastCrumb || Math.hypot(catPos.x - lastCrumb.x, catPos.z - lastCrumb.z) >= CRUMB_EVERY) {
            const ref = lastCrumb ?? kitten.position; // the first footprint counts from where she was found
            const jump = Math.hypot(catPos.x - ref.x, catPos.z - ref.z) > SNAP_R;
            if (jump) { // a leap or a drop: she catches up where the cat stands now
              kitten.position.set(catPos.x, ground.y(catPos.x, catPos.z), catPos.z);
              crumbs.length = 0;
            }
            lastCrumb = { x: catPos.x, z: catPos.z, y: catPos.y };
            crumbs.push(lastCrumb);
          }
        }
        // she follows the oldest footprint while more than FOLLOW_GAP of her path lies between them
        let moving = false;
        let speed = FOLLOW_SPEED;
        if (crumbs.length) {
          let gap = Math.hypot(crumbs[0].x - kitten.position.x, crumbs[0].z - kitten.position.z);
          for (let i = 1; i < crumbs.length; i++) gap += Math.hypot(crumbs[i].x - crumbs[i - 1].x, crumbs[i].z - crumbs[i - 1].z);
          if (gap > FOLLOW_GAP) {
            speed = Math.min(CATCH_MAX, FOLLOW_SPEED + CATCH_GAIN * (gap - FOLLOW_GAP));
            moving = stepKitten(dt, crumbs[0].x, crumbs[0].z, speed);
            if (Math.hypot(crumbs[0].x - kitten.position.x, crumbs[0].z - kitten.position.z) < 0.12 && crumbs.length > 1) crumbs.shift();
          }
        }
        animateCat(kitten, moving ? 'follow' : 'requestPet', t, moving ? speed : 0, reducedMotion);
        // home: she is at the porch's door and the kitten is nearly there
        const catHome = Math.hypot(catPos.x - KEEPER_DOOR.x, catPos.z - KEEPER_DOOR.z) < HOME_R;
        const kitHome = Math.hypot(kitten.position.x - KEEPER_DOOR.x, kitten.position.z - KEEPER_DOOR.z) < HOME_R;
        if (catHome && kitHome) complete();
      } else if (state === 'tumbling') {
        tumbleLeft -= dt;
        const moving = stepKitten(dt, KEEPER_DOOR.x - 0.4, KEEPER_DOOR.z, 3);
        animateCat(kitten, moving ? 'follow' : 'requestPet', t, moving ? 3 : 0, reducedMotion);
        if (tumbleLeft <= 0 || !moving) { state = 'home'; kitten.visible = false; }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(mother, kitten);
      if (trail) { scene.remove(trail); trail.geometry.dispose(); trail.material.dispose(); }
      for (const c of [mother, kitten]) c.traverse((o) => { o.geometry?.dispose(); for (const mt of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) mt.dispose(); });
    },
  };
}
