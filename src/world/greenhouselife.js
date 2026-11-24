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
// The can and packets are this life's own meshes (a carried "job" item without the walk's mouth, which the later
// milestone wires with the rain-slip rule). Nothing here pays yet (the awards are the next milestone's), draws no
// random number and reads no clock.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { withLocalUuids } from './localuuids.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './greenhouseplan.js';
import * as K from './greenhouseparts.js';
import { KOI_FROZEN_TIME } from './greenhouseplants.js';
import * as G from './greenhouseglass.js';
import './greenhousewords.js';

export const GH_SEED_SALT = 0x6e5d1;
export const GH_WATER_SALT = 0x6e5d2;
export const PICK_R = 1.15;
export const TRAY_R = 2.7;
export const CAN_R = 1.5;
export const POT_R = 1.7;
export const OFFER_R = 10;
export const PERK_TIME = 0.9;
export const SOW_TIME = 1.4;
export const SEEDS = 5;
export const THIRSTY = 4;

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
export function thirstyPots(roomSeed, visits = 0) {
  const [a, b] = seedPair(roomSeed, visits);
  const rank = (ids) => ids.map((i) => [hash01(a + i, b, GH_WATER_SALT), i]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((p) => p[1]);
  return [...rank([0, 1, 2, 3]).slice(0, THIRSTY / 2), ...rank([4, 5, 6, 7]).slice(0, THIRSTY / 2)].sort((p, q) => p - q);
}

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

// ctx: { scene, ground, reducedMotion, roomSeed, visits, mist, shafts, koi, sound }
export function createGreenhouseLife(ctx) {
  const { reducedMotion = false } = ctx;
  const scene = ctx.scene ?? new THREE.Scene();
  const ground = ctx.ground ?? { y: () => 0 };
  const { mist = null, shafts = null, koi = null } = ctx;
  const set = P.SEED_SPOT_SETS[seedSetIndex(ctx.roomSeed, ctx.visits ?? 0)];
  const thirsty = thirstyPots(ctx.roomSeed, ctx.visits ?? 0);
  let disposed = false;
  let clock = 0;

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
    const sp = P.WATER_POT_SPOTS[i];
    const cloud = withLocalUuids('greenhouse-cloud', () => K.thirstCloud());
    cloud.position.set(sp.x, 1.25, sp.z);
    scene.add(cloud);
    const st = { i, sp, leaves, cloud, watered: false, perk: 0 };
    if (leaves) { leaves.scale.set(1.2, 0.5, 1.2); leaves.material.color.set(0xd2c690); }
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
  let allWatered = false;
  let target = null; // what the action button would do now: { kind, pot? }

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

  return {
    get state() { return { seeds, seedState, held, watered: wateredCount(), thirsty: thirsty.slice(), set: set.map((s) => ({ ...s })), allWatered }; },
    get meshes() { return { packets, sprouts, can, pots: pots.map((p) => p.leaves), clouds: pots.map((p) => p.cloud) }; },
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
        say('greenhouse-seed-sown', phrase('greenhouse.seed.sown'));
      } else if (t.kind === 'can') {
        held = true;
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
          say('greenhouse-water-all', phrase('greenhouse.water.all'));
        } else say(`greenhouse-water-${wateredCount()}`, phrase('greenhouse.water.done'));
      }
      return t.kind;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      void camera;
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      const tt = reducedMotion ? 0 : t;
      if (mist) mist.userData.mist.uTime.value = tt;
      if (shafts) shafts.rotation.z = G.shaftAngle(t, reducedMotion);
      if (koi) koi.userData.koi.uTime.value = reducedMotion ? KOI_FROZEN_TIME : t;

      if (catPos) {
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
      // the sprouts pop up with a small overshoot
      if (seedState === 'sown') {
        const k = Math.min(1, (clock - sowAt) / SOW_TIME);
        const over = k < 1 ? smooth(k) * (1 + 0.18 * Math.sin(k * Math.PI)) : 1;
        sprouts.scale.setScalar(Math.max(0.001, over));
      }
      // watered pots perk up
      for (const p of pots) {
        if (!p.leaves) continue;
        if (p.watered) {
          const k = smooth((clock - p.perkAt) / PERK_TIME);
          p.leaves.scale.set(1.2 - 0.2 * k, 0.5 + 0.5 * k, 1.2 - 0.2 * k);
          p.leaves.material.color.set(0xd2c690).lerp(new THREE.Color(0xffffff), k);
        } else if (!reducedMotion) {
          p.leaves.scale.y = 0.5 + 0.015 * Math.sin(t * 1.3 + p.i);
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
      for (const m of [...packets, sprouts, can, dropMesh, ...pots.map((p) => p.cloud)]) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose?.();
      }
    },
  };
}
