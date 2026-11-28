// =============================================================================
// THE GREENHOUSE'S LIFE (milestone 1): the mist, the shafts and the koi on the walk's clock, and the two gardener's
// jobs. Made once a walk by greenhouse.js (area.life); update(dt, t, catPos, camera, session) every frame; the walk
// asks promptAt(catPos) and interact() for the action button (game/interactions.js, as the Lighthouse's kitten).
//
// THE SEED JOB (the Farm's rules: no clock, no failing state, per device, nothing sent):
//   * five packets lie in the open, one set of five spots out of three, picked by hash01 and GH_SEED_SALT of the
//     room's seed (a solo walk: how many times she has walked here), so two screens in one room agree;
//   * she picks each by walking to it (PICK_R): a rustle, the count "3 of 5", the packet is gone;
//   * with five, the seed tray's prompt appears within TRAY_R of the bench: E sows them and five shoots pop up in
//     the kitchen bed. Walking away with fewer than five loses nothing; nothing leads backwards.
// THE WATERING JOB:
//   * four of the eight garden pots droop (leaves bowed, a tiny cloud over each): two in the hall, two in the garden,
//     picked by hash01 and GH_WATER_SALT;
//   * the can hangs by the bench: E picks it up (she carries it in front of her, one thing at a time); E by a
//     drooping pot waters it (a sprinkle, it perks up); after the fourth the can goes back to its hook;
//   * a can can be put down and picked up again: walking away from a pot does nothing, there is no failure.
// MILESTONE G3 adds, in this same life: the finds (greenhousefinds.js: palm, koi, catnip; found by the rules there, paid once
// ever, counted once a walk), the catnip bed's purr line when she nibbles there, and the rain shelter (weather.setSheltered while
// the camera is under the Palm House's glass; put back on dispose). All of it is optional in ctx: a bare test life skips it.
// The can and packets are this life's own meshes (a carried "job" item without the walk's mouth, which the later
// milestone wires with the rain-slip rule). Each job pays AWARDS.greenhousejob once a walk and counts its journal page (jobDone); draws no
// random number and reads no clock.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { withLocalUuids } from './localuuids.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './greenhouseplan.js';
import * as K from './greenhouseparts.js';
import { KOI_FROZEN_TIME, SWAY_TIME } from './greenhouseplants.js';
import * as G from './greenhouseglass.js';
import { findAt, noteGreenhouseFind, greenhouseFindKey } from './greenhousefinds.js';
import { createGreenhouseSound } from './greenhousesound.js';
import './greenhousewords.js';
import { createFindCues } from './greenhousecues.js';
import { createGreenhouseIntro } from './greenhouseintro.js';
import * as Story from './greenhousestory.js';

export const GH_SEED_SALT = 0x6e5d1;
export const GH_WATER_SALT = 0x6e5d2;
export const GH_ROOM_SALT = 0x6e5d4; // (0x6e5d3 is the butterflies')
export const ROOM_SHARE = 0.5; // a walk's chance, by hash, of using a rooms' packet set and pot set (milestone G6)
export const POP_TIME = 1.2; // s: the shy orchid and the cactus flower open
export const PICK_R = 1.15;
export const TRAY_R = 2.7;
export const CAN_R = 1.5;
export const POT_R = 1.7;
export const OFFER_R = 10;
export const PERK_TIME = 0.9;
export const SOW_TIME = 1.4;
export const SEEDS = 5;
export const THIRSTY = 4;
const THIRSTY_LEAF = 0xb59a58; // beauty pass 3: a thirsty pot's leaves are a dry, dull gold (they lerp to their own green when watered)
export const STILL_EPS = 0.05; // m: her paws within this of where she came to rest are still (the Market's)

// Which of the three sets (0, 1, 2) the packets lie in; and which four pots droop. Pure: the room's seed or the walk
// count, and the salts.
function seedPair(roomSeed, visits) {
  const solo = roomSeed === undefined || roomSeed === null;
  return [solo ? Number(visits) || 0 : Number(roomSeed) % 9973, solo ? 3 : (Number(roomSeed) >>> 4) % 7919];
}
export function seedSetIndex(roomSeed, visits = 0) {
  const [a, b] = seedPair(roomSeed, visits);
  const i = Math.floor(hash01(a, b, GH_SEED_SALT) * P.SEED_SPOT_SETS.length);
  return Number.isFinite(i) ? Math.min(P.SEED_SPOT_SETS.length - 1, Math.max(0, i)) : 0;
}
// The rooms' sets (milestone G6): -1 for the stage-A sets above, else the index into ROOM_SEED_SPOT_SETS and ROOM_POT_SETS.
export function roomSetIndex(roomSeed, visits = 0) {
  const [a, b] = seedPair(roomSeed, visits);
  const h = hash01(a, b, GH_ROOM_SALT);
  if (!(h < ROOM_SHARE)) return -1;
  return Math.min(P.ROOM_SEED_SPOT_SETS.length - 1, Math.floor((h / ROOM_SHARE) * P.ROOM_SEED_SPOT_SETS.length));
}
export function thirstyPots(roomSeed, visits = 0) {
  const [a, b] = seedPair(roomSeed, visits);
  const rank = (ids) => ids.map((i) => [hash01(a + i, b, GH_WATER_SALT), i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p[1]);
  return [...rank([0, 1, 2, 3]).slice(0, THIRSTY / 2), ...rank([4, 5, 6, 7]).slice(0, THIRSTY / 2)].sort((p, q) => p - q);
}

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const JOB_KEYS = Object.freeze({ seeds: 'greenhouse-job-seeds', water: 'greenhouse-job-water' });
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

// ctx: { scene, ground, reducedMotion, roomSeed, visits, mist, shafts, koi, sound, rooms, roomMist, roomShafts, butterflies, shyOrchid, cactusFlower }
// (`rooms` true turns the stage-B rooms on: their packet and pot sets, the butterflies, the two opening flowers)
export function createGreenhouseLife(ctx) {
  const { reducedMotion = false } = ctx;
  const scene = ctx.scene ?? new THREE.Scene();
  const ground = ctx.ground ?? { y: () => 0 };
  const { mist = null, shafts = null, koi = null, roomMist = null, roomShafts = [], butterflies = null, shyOrchid = null, cactusFlower = null } = ctx;
  const roomSet = ctx.rooms ? roomSetIndex(ctx.roomSeed, ctx.visits ?? 0) : -1;
  const set = roomSet >= 0 ? P.ROOM_SEED_SPOT_SETS[roomSet] : P.SEED_SPOT_SETS[seedSetIndex(ctx.roomSeed, ctx.visits ?? 0)];
  const thirsty = roomSet >= 0 ? P.ROOM_POT_SETS[roomSet].slice() : thirstyPots(ctx.roomSeed, ctx.visits ?? 0);
  const pops = { orchid: { mesh: shyOrchid, at: -1 }, cactus: { mesh: cactusFlower, at: -1 } };
  let disposed = false;
  let clock = 0;
  // beauty pass 3: the house reacts to her and to the weather (all of it uniforms on the existing materials)
  const react = { x: 0, z: 0, speed: 0, on: 0, gain: 1, warm: ctx.dusk ? 1 : 0, rain: 0, has: false };

  // G3: finding, the catnip purr, the shelter
  const { log = null, progression = null, weather = null } = ctx;
  const found = new Set(); // this walk's
  const spot = { x: 0, y: 0, z: 0, still: 0, rest: null };
  const restAt = { x: 0, y: 0, z: 0, set: false };
  let restWas = false;
  let sheltered = false;
  // G5: the near sounds (greenhousesound.js); none without the walk's audio, silent while muted
  // beauty pass 4: the season (by the calendar; ctx.season or ctx.now for pictures and tests) and the rare surprise moments
  const season = ctx.season ?? Story.seasonOf(ctx.now ?? new Date());
  Story.applySeason(scene, season);
  G.FROST.value = season === 'winter' ? 1 : 0;
  const moments = withLocalUuids('greenhouse-moments', () => Story.createMoments({ scene, audio: ctx.audio ?? null, reducedMotion, lite: ctx.quality === 'low', visits: ctx.visits ?? 0 }));
  const walkSeed = ctx.roomSeed === undefined || ctx.roomSeed === null ? ctx.visits ?? 0 : Number(ctx.roomSeed) % 9973;
  const walkMoment = hash01(walkSeed, 5, Story.GH_STORY_SALT + 5) < Story.MOMENT_CHANCE.walk ? (ctx.dusk ? 'moonbloom' : 'sprinkler') : null;
  const walkMomentAt = 20 + 40 * hash01(walkSeed, 6, Story.GH_STORY_SALT + 5);
  let momentDone = false;
  let rainsEnded = 0;
  let wasRaining = false;
  const sound = ctx.audio ? createGreenhouseSound(ctx.audio, { weather, dusk: !!ctx.dusk, reducedMotion }) : null;

  // ---- the seeds
  const packets = withLocalUuids('greenhouse-packets', () => set.map((s, i) => {
    const m = K.packetMesh(i);
    m.position.set(s.x, ground.y(s.x, s.z) + 0.02, s.z);
    m.rotation.z = i * 1.7;
    scene.add(m);
    return m;
  }));
  const sprouts = withLocalUuids('greenhouse-sprouts', () => K.sproutsMesh());
  scene.add(sprouts);
  let seeds = 0;
  let seedState = 'looking'; // looking -> sown (never back)
  let sowAt = -1;
  let offered = false;

  // ---- the can and the pots
  const can = withLocalUuids('greenhouse-can', () => K.canMesh());
  const home = P.POTTING.canHome;
  can.position.set(home.x, ground.y(home.x, home.z), home.z);
  can.rotation.y = -0.6;
  scene.add(can);
  let held = false;
  const pots = thirsty.map((i) => {
    const leaves = scene.getObjectByName(`ghPot-${i}`) ?? null;
    const sp = P.ALL_POT_SPOTS[i];
    const cloud = withLocalUuids('greenhouse-cloud', () => K.thirstCloud());
    cloud.position.set(sp.x, 1.25, sp.z);
    scene.add(cloud);
    const st = { i, sp, leaves, cloud, watered: false, perk: 0 };
    if (leaves) { leaves.scale.set(1.3, 0.4, 1.3); leaves.material.color.set(THIRSTY_LEAF); }
    return st;
  });
  const dropMesh = withLocalUuids('greenhouse-spray', () => {
    const pos = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pos.push(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, Math.cos(a) * 0.12 + 0.025, 0, Math.sin(a) * 0.12, Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.name = 'ghSpray'; m.visible = false; m.userData.noCast = true; m.userData.noMerge = true; m.castShadow = false; m.frustumCulled = false;
    return m;
  });
  scene.add(dropMesh);
  let sprayAt = -1;
  let sprayPot = null;
  let canOffered = false;
  let arrivedSaid = false;
  let allWatered = false;
  let target = null; // what the action button would do now: { kind, pot? }

  // a job done: pays AWARDS.greenhousejob once a walk (the walk's own once-a-walk rule: a resumed walk keeps it), counts its journal page when paid, and its line is the toast
  function jobDone(job, page, key, label) {
    const paid = log ? log.awardOnce('greenhousejob', JOB_KEYS[job], label) : 0;
    if (paid > 0) { try { progression?.recordSighting?.(page); } catch { /* a stand-in save */ } } else if (!log) say(key, label);
  }
  const wateredCount = () => pots.filter((p) => p.watered).length;
  const thirstyNear = (pos) => pots.find((p) => !p.watered && dist(pos, p.sp) < POT_R);

  function decide(catPos) {
    if (disposed || !catPos) return null;
    if (seedState === 'looking' && seeds >= SEEDS && dist(catPos, P.POTTING.tray) < TRAY_R) return { kind: 'sow', line: phrase('greenhouse.seed.prompt') };
    if (held) {
      const p = thirstyNear(catPos);
      if (p) return { kind: 'water', pot: p, line: phrase('greenhouse.water.prompt') };
    } else if (!allWatered && dist(catPos, can.position) < CAN_R) return { kind: 'can', line: phrase('greenhouse.can.prompt') };
    return null;
  }

  // the finds' on-ground cue: gold motes at each find not yet made (this walk's, or any earlier walk's)
  const cues = withLocalUuids('greenhouse-cues', () => createFindCues({ scene, ground, quality: ctx.quality, reducedMotion }));
  const alreadyFound = () => Object.keys(P.GREENHOUSE_FIND_ZONES).filter((id) => log?.count?.(greenhouseFindKey(id)) > 0);
  withLocalUuids('greenhouse-cues', () => cues.setFound(alreadyFound()));

  const intro = createGreenhouseIntro({ progression, visits: ctx.visits ?? 0, state: () => ({ seeds, watered: wateredCount() }) }); // the first-visit arrival card

  return {
    get season() { return season; },
    moments,
    startMoment(kind, at) { return disposed ? false : moments.start(kind, clock, at); }, // (pictures and tests; the walk starts its own)
    get state() { return { seeds, seedState, held, watered: wateredCount(), thirsty: thirsty.slice(), set: set.map((s) => ({ ...s })), allWatered }; },
    get meshes() { return { cues: cues.mesh, packets, sprouts, can, pots: pots.map((p) => p.leaves), clouds: pots.map((p) => p.cloud) }; },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'sow') {
        seedState = 'sown';
        sowAt = clock;
        sprouts.visible = true;
        jobDone('seeds', 'ghjobseeds', 'greenhouse-seed-sown', phrase('greenhouse.seed.sown'));
      } else if (t.kind === 'can') {
        held = true;
        say('greenhouse-can-hint', phrase('greenhouse.can.hint')); // once a walk: what the little cloud means
      } else if (t.kind === 'water') {
        t.pot.watered = true;
        t.pot.perkAt = clock;
        sprayAt = clock;
        sprayPot = t.pot;
        t.pot.cloud.visible = false;
        if (wateredCount() >= THIRSTY) {
          allWatered = true;
          held = false;
          can.position.set(home.x, ground.y(home.x, home.z), home.z);
          can.rotation.set(0, -0.6, 0);
          jobDone('water', 'ghjobwater', 'greenhouse-water-all', phrase('greenhouse.water.all'));
        } else say(`greenhouse-water-${wateredCount()}`, phrase('greenhouse.water.done'));
      }
      return t.kind;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      void camera;
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      const tt = reducedMotion ? 0 : t;
      G.COND_TIME.value = tt;
      if (mist) mist.userData.mist.uTime.value = tt;
      if (roomMist) roomMist.userData.mist.uTime.value = tt;
      SWAY_TIME.value = tt;
      if (shafts) { shafts.rotation.z = G.shaftAngle(t, reducedMotion); shafts.userData.shaft.uTime.value = tt; }
      for (const sh of roomShafts) { sh.rotation.z = G.shaftAngle(t, reducedMotion); sh.userData.shaft.uTime.value = tt; }
      butterflies?.update(dt, t, catPos);
      {
        const step = dt > 0 ? dt : 0;
        const raining = !!weather?.isRaining?.();
        react.rain += ((raining ? 1 : 0) - react.rain) * Math.min(1, step * 1.2);
        G.RAIN_ON.value = reducedMotion ? (raining ? 1 : 0) : react.rain;
        // sun shafts: a slow cloud passing, thin in rain, warm and low at dusk
        const goal = (raining ? 0.4 : 1) * (ctx.dusk ? 0.7 : 1);
        react.gain += (goal - react.gain) * Math.min(1, step * 0.8);
        const cloud = reducedMotion ? 1 : 0.84 + 0.16 * Math.sin(t * 0.11);
        const gain = react.gain * cloud;
        const warm = ctx.dusk ? 1 : 0;
        for (const sh of [shafts, ...roomShafts]) { if (sh) { sh.userData.shaft.uGain.value = gain; sh.userData.shaft.uWarm.value = warm; } }
        for (const mm of [mist, roomMist]) if (mm) mm.userData.mist.uWarm.value = Math.max(warm, season === 'winter' ? 0.65 : 0); // winter: the lamps' halos stay warm all day
        if (catPos && !reducedMotion) {
          const v = react.has && step > 0 ? Math.hypot(catPos.x - react.x, catPos.z - react.z) / step : 0;
          react.speed += (Math.min(1, v / 3) - react.speed) * Math.min(1, step * 6);
          react.x = catPos.x; react.z = catPos.z; react.has = true; react.on = 1;
          G.CAT_NEAR.value.set(catPos.x, catPos.z, react.speed, 1);
        } else G.CAT_NEAR.value.set(0, 0, 0, 0);
      }
      // beauty pass 4: a rain's end may bring a rainbow; a walk may bring a sprinkler (day) or a night-blooming flower (dusk), once, when she is near
      if (wasRaining && !(weather?.isRaining?.())) {
        if (hash01(walkSeed, ++rainsEnded, Story.GH_STORY_SALT + 6) < Story.MOMENT_CHANCE.rainbow) moments.start('rainbow', clock);
      }
      wasRaining = !!weather?.isRaining?.();
      if (!momentDone && walkMoment && clock >= walkMomentAt && catPos) {
        const site = walkMoment === 'sprinkler' ? { x: 0, z: 22.6 } : Story.moonbloomSpot(ctx.visits ?? 0);
        if (dist(catPos, site) < 24 && moments.start(walkMoment, clock)) momentDone = true;
      }
      moments.update(clock);
      intro.update(dt);
      cues.update(reducedMotion ? 0 : t);
      if (koi) koi.userData.koi.uTime.value = reducedMotion ? KOI_FROZEN_TIME : t;

      if (catPos) {
        // stillness starts again whenever she moves or a rest ends; the finds read it with her rest
        const resting = !!session?.rest;
        const moved = !restAt.set || Math.hypot(catPos.x - restAt.x, catPos.y - restAt.y, catPos.z - restAt.z) >= STILL_EPS;
        if (moved || (restWas && !resting)) {
          restAt.x = catPos.x; restAt.y = catPos.y; restAt.z = catPos.z; restAt.set = true;
          spot.still = 0;
        } else spot.still += dt > 0 ? dt : 0;
        if (resting && !restWas && session.rest.kind === 'eat' && P.CATNIP_BEDS.some((bd) => dist(catPos, bd) < 1.4)) say('greenhouse-catnip-purr', phrase('greenhouse.catnip.purr'));
        restWas = resting;
        spot.x = catPos.x; spot.y = catPos.y; spot.z = catPos.z;
        spot.rest = session?.rest ?? null;
        const here = findAt(spot);
        if (here && !found.has(here)) {
          found.add(here);
          withLocalUuids('greenhouse-cues', () => cues.setFound([here]));
          if (log && progression) noteGreenhouseFind(here, { log, progression });
          if (here === 'butterfly') butterflies?.land(catPos);
          else if (pops[here]?.mesh) { pops[here].at = clock; pops[here].mesh.visible = true; }
        }
        // the packets: walking to one picks it
        for (let i = 0; i < packets.length; i++) {
          const m = packets[i];
          if (!m.visible) continue;
          if (dist(catPos, m.position) < PICK_R && Math.abs(catPos.y - m.position.y) < 1.2) {
            m.visible = false;
            seeds++;
            say(`greenhouse-seed-${i}`, seeds >= SEEDS ? phrase('greenhouse.seed.all') : phrase('greenhouse.seed.found', seeds));
          }
        }
        // arriving away from the bench: one plain line says what the jobs are and where (the guide's ring already points at the bench until she has been near it)
        if (!arrivedSaid) { arrivedSaid = true; if (dist(catPos, P.POTTING) >= OFFER_R) say('greenhouse-arrive', phrase('greenhouse.arrive')); }
        // the offers: the seed note and the can, said once, within OFFER_R of the bench
        if (!offered && dist(catPos, P.POTTING) < OFFER_R) { offered = true; say('greenhouse-seed-offer', phrase('greenhouse.seed.offer')); }
        if (!canOffered && offered && dist(catPos, P.POTTING) < OFFER_R * 0.6) { canOffered = true; say('greenhouse-can-offer', phrase('greenhouse.can.offer')); }
        // the can in her mouth: in front of her, a little off the ground
        if (held) {
          const yaw = session?.cat?.rotation?.y ?? 0;
          can.position.set(catPos.x - Math.sin(yaw) * 0.42, catPos.y + 0.32, catPos.z - Math.cos(yaw) * 0.42);
          can.rotation.set(0, yaw + Math.PI * 0.5, 0.25);
        } else if (!allWatered) {
          can.position.y = ground.y(can.position.x, can.position.z);
        }
      }
      // under the Palm House's glass the rain stays out (only on a change)
      const under = camera?.position ? P.underGlass(camera.position.x, camera.position.y, camera.position.z) : false;
      if (weather && camera?.position && under !== sheltered) { sheltered = under; weather.setSheltered(under); }
      sound?.update(dt, catPos, under);
      // the shy orchid and the cactus flower open with a small overshoot, and stay open the walk
      for (const pop of Object.values(pops)) {
        if (pop.at < 0 || !pop.mesh) continue;
        const k = reducedMotion ? 1 : Math.min(1, (clock - pop.at) / POP_TIME);
        pop.mesh.scale.setScalar(Math.max(0.001, k < 1 ? smooth(k) * (1 + 0.18 * Math.sin(k * Math.PI)) : 1));
      }
      // the sprouts pop up with a small overshoot
      if (seedState === 'sown') {
        const k = reducedMotion ? 1 : Math.min(1, (clock - sowAt) / SOW_TIME);
        const over = k < 1 ? smooth(k) * (1 + 0.18 * Math.sin(k * Math.PI)) : 1;
        sprouts.scale.setScalar(Math.max(0.001, over));
      }
      // watered pots perk up
      for (const p of pots) {
        if (!p.leaves) continue;
        if (p.watered) {
          const k = reducedMotion ? 1 : smooth((clock - p.perkAt) / PERK_TIME);
          p.leaves.scale.set(1.3 - 0.3 * k, 0.4 + 0.6 * k, 1.3 - 0.3 * k);
          p.leaves.material.color.set(THIRSTY_LEAF).lerp(new THREE.Color(0xffffff), k);
        } else if (!reducedMotion) {
          p.leaves.scale.y = 0.4 + 0.015 * Math.sin(t * 1.3 + p.i);
        }
        if (!p.watered && !reducedMotion) p.cloud.position.y = 1.25 + 0.04 * Math.sin(t * 1.1 + p.i * 2);
      }
      // the sprinkle
      if (sprayPot) {
        const k = (clock - sprayAt) / 0.9;
        if (k >= 1) { dropMesh.visible = false; sprayPot = null; } else {
          dropMesh.visible = true;
          dropMesh.position.set(sprayPot.sp.x, 0.9 - k * 0.6, sprayPot.sp.z);
          dropMesh.scale.setScalar(0.6 + k);
          dropMesh.material.opacity = 0.9 * (1 - k);
        }
      }
    },
    dispose() {
      disposed = true;
      G.CAT_NEAR.value.set(0, 0, 0, 0);
      G.RAIN_ON.value = 0;
      G.FROST.value = 0;
      moments.dispose();
      intro.dispose();
      cues.dispose();
      sound?.dispose();
      if (sheltered) { sheltered = false; weather?.setSheltered(false); }
      for (const m of [...packets, sprouts, can, dropMesh, ...pots.map((p) => p.cloud)]) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose?.();
      }
    },
  };
}
