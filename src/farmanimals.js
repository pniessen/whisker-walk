// =============================================================================
// Appletree Farm's animals in the walk: the simulation (src/farmsim.js) drawn
// with the models (src/farmmodels.js), and the cat's ride on a cow.
//
// game/walk.js builds one for a Farm walk (session.farm; every other place has
// NO_FARM) and main.js calls update() once a frame, after the player has
// moved. Nothing here is sent to a co-walker: like critters.js's creatures,
// each device has its own animals.
//
// THE RIDE. Each cow's back is a perch record (climbing.js) that this module
// moves with her and adds to the area's perches, so the ordinary jump (Space,
// or the paw button on touch) lands the cat on it, the ordinary "press again
// or push the stick" gets her off, and the jump hint (hints.js) shows beside a
// cow as beside any perch. While session.perched is a cow's perch this module
// carries the cat; when it stops being one, it puts her down beside the cow
// (farmsim.js dismountSpot: free ground, inside the bounds). A cow has no
// collider at all: a cat walks round her and under her and is never shoved.
// =============================================================================
import * as THREE from 'three';
import { createFarmSim, dismountSpot, FARM_ANIMAL_TYPES, COW } from './farmsim.js';
import { buildCow, buildGoat, buildSheepdog, buildHen, chickGeometry, ducklingGeometry, farmAnimalMaterial, HEN_COLORS } from './farmmodels.js';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';

export { FARM_ANIMAL_TYPES };

// What a walk that is not at the Farm has.
export const NO_FARM = Object.freeze({
  sim: null,
  riding: null,
  spottable: Object.freeze([]),
  perches: Object.freeze([]),
  groups: Object.freeze([]),
  update() {},
  reactToMeow() { return null; },
  dispose() {},
});

// How big each model is drawn (the game's cat is a big cat: a collie drawn at
// its modelled size would be no taller than she is).
export const SIZE = Object.freeze({ cow: COW.SIZE, farmgoat: 1.25, sheepdog: 1.45 });

const ease = (from, to, k) => from + (to - from) * Math.min(1, k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// createFarmAnimals(scene, area, opts) → the Farm's animals for one walk.
//   area            world/farm.js's record (anchors, colliders, bounds, waters, perches)
//   opts.reducedMotion   no tail swishing, chewing or bobbing
//   opts.onEvent(e)      what happened this frame: { type: 'moo' | 'cluck' | 'peep' | 'goat-butt' |
//                        'goat-copy' | 'dog-hello' | 'chick-follow' | 'ducklings-follow' |
//                        'cow-arrived' | 'ride' | 'dismount', id? } (the caller plays the sounds)
//   opts.isFree(x, z)    whether the cat may stand there (for the goat's nudge)
//   opts.ducks()         the pond's ducks, [{ x, z }] (critters.js's), for the ducklings to follow
//   opts.seed            the animals' own dice
//   opts.ground          the walk's ground (src/ground.js); the Farm's is flat
export function createFarmAnimals(scene, area, { reducedMotion = false, onEvent = () => {}, isFree = () => true, ducks = () => [], seed, ground = FLAT_GROUND } = {}) {
  const sim = createFarmSim(area, seed === undefined ? {} : { seed });
  const views = [];
  const material = withLocalUuids('farm-animal-material', () => farmAnimalMaterial());
  const shared = [];

  withLocalUuids('farm-animals', () => {
    const add = (a, built) => {
      built.group.name = a.id;
      built.group.position.set(a.x, ground.y(a.x, a.z), a.z);
      built.group.rotation.y = a.yaw;
      const size = (a.scale ?? 1) * (SIZE[a.type] ?? 1);
      if (size !== 1) built.group.scale.setScalar(size);
      scene.add(built.group);
      views.push({ a, group: built.group, parts: built.parts, phase: views.length * 1.7, k: {} });
    };
    for (const cow of sim.cows) add(cow, buildCow(cow.look, material));
    for (const g of sim.goats) add(g, buildGoat(g.look, material));
    sim.hens.forEach((h, i) => add(h, buildHen(HEN_COLORS[i % HEN_COLORS.length], material)));
    add(sim.dog, buildSheepdog(material));
    const chickGeo = chickGeometry();
    const ducklingGeo = ducklingGeometry();
    shared.push(chickGeo, ducklingGeo);
    const small = (a, geo) => {
      const group = new THREE.Group();
      const m = new THREE.Mesh(geo, material);
      m.userData.noCast = true;
      group.add(m);
      add(a, { group, parts: { body: m } });
    };
    for (const c of sim.chicks) small(c, chickGeo);
    for (const d of sim.ducklings) small(d, ducklingGeo);
  });

  const cowById = new Map(sim.cows.map((c) => [c.id, c]));
  const perches = sim.cows.map((c) => c.perch);
  const spottable = views.map((v) => ({ id: v.a.id, type: v.a.type, pos: v.group.position }));
  let riding = null;      // the id of the cow the cat is on
  let rideYaw = 0;
  let wasPerched = null;
  let jumpT = 0;
  const simCat = { x: 0, z: 0, speed: 0, running: false, inWater: false, perched: false, jumping: false, riding: null, fx: 0, fz: -1 };

  function pose(v, t, dt) {
    const { a, group, parts, k } = v;
    group.position.x = a.x;
    group.position.z = a.z;
    if (!ground.flat) group.position.y = ground.y(a.x, a.z);
    group.rotation.y = a.yaw;
    const still = reducedMotion;
    const stride = a.moving ? 1 : 0;
    k.stride = ease(k.stride ?? 0, stride, dt * 6);
    if (a.type === 'cow') {
      const swing = Math.sin(a.walked * 4.4 / a.scale) * 0.38 * k.stride;
      parts.legs[0].rotation.x = swing; parts.legs[3].rotation.x = swing;
      parts.legs[1].rotation.x = -swing; parts.legs[2].rotation.x = -swing;
      const looking = a.mode === 'look' || (a.follow && !a.moving && a.lookAt);
      const down = a.headDown ? 1.3 : looking ? -0.12 : 0.08;
      k.head = ease(k.head ?? down, down, dt * 2.2);
      parts.head.rotation.x = k.head + (a.headDown && !still ? Math.sin(t * 5 + v.phase) * 0.035 : 0); // chewing
      let turn = 0;
      if (looking && a.lookAt && Math.hypot(a.lookAt.x - a.x, a.lookAt.z - a.z) > 0.6) {
        turn = Math.max(-1.0, Math.min(1.0, wrap(Math.atan2(a.lookAt.x - a.x, a.lookAt.z - a.z) - a.yaw)));
      }
      k.turn = ease(k.turn ?? 0, turn, dt * 3);
      parts.head.rotation.y = k.turn;
      parts.tail.rotation.z = still ? 0 : Math.sin(t * 1.6 + v.phase) * 0.28;
      parts.body.position.y = still ? 0 : Math.abs(Math.sin(a.walked * 4.4 / a.scale)) * 0.012 * k.stride;
    } else if (a.type === 'farmgoat') {
      parts.body.position.y = a.y / SIZE.farmgoat; // the group is drawn bigger; its height is in metres
      const air = a.hop ? 1 : 0;
      const swing = Math.sin(a.walked * 9) * 0.5 * k.stride;
      parts.legs[0].rotation.x = air ? -0.7 : swing; parts.legs[3].rotation.x = air ? 0.7 : swing;
      parts.legs[1].rotation.x = air ? -0.7 : -swing; parts.legs[2].rotation.x = air ? 0.7 : -swing;
      parts.body.rotation.x = a.hop ? -0.25 * Math.cos(Math.min(1, a.hop.t) * Math.PI) : 0; // nose up, then down
      parts.head.rotation.x = a.head * 0.95;
    } else if (a.type === 'sheepdog') {
      const lying = a.mode === 'lie' ? 1 : 0;
      k.lie = ease(k.lie ?? lying, lying, dt * 4);
      parts.body.position.y = -0.3 * k.lie; // belly on the grass
      const swing = Math.sin(a.walked * 10) * 0.55 * k.stride;
      parts.legs[0].rotation.x = swing - 1.5 * k.lie; parts.legs[1].rotation.x = -swing - 1.5 * k.lie; // front paws out ahead
      parts.legs[2].rotation.x = -swing - 1.45 * k.lie; parts.legs[3].rotation.x = swing - 1.45 * k.lie; // hind legs tucked forward
      parts.head.rotation.x = 0.25 * k.lie * (a.wag ? 0 : 1); // chin down when dozing, up for a visitor
      parts.tail.rotation.x = -0.65 * k.lie; // out on the grass behind him
      parts.tail.rotation.z = a.wag ? Math.sin(t * (still ? 5 : 13)) * (still ? 0.25 : 0.6) : 0;
    } else if (a.type === 'hen') {
      parts.body.position.y = a.y;
      const pecking = a.mode === 'peck' && !still ? Math.max(0, Math.sin(t * 3.4 + v.phase)) ** 3 : 0;
      parts.body.rotation.x = pecking * 0.5;
      parts.head.rotation.x = pecking * 0.75;
      parts.head.position.z = 0.1 + (a.moving && !still ? Math.sin(a.walked * 26) * 0.018 : 0); // the head bobs as she walks
      const flap = a.mode === 'flutter' ? 1 : 0;
      parts.wings.scale.x = 1 + flap * (0.5 + 0.5 * Math.abs(Math.sin(t * 38)));
      parts.wings.position.y = flap * 0.03;
    } else if (a.type === 'chick') {
      parts.body.position.y = a.y + (a.moving && !still ? Math.abs(Math.sin(a.walked * 34)) * 0.014 : 0);
    } else if (a.type === 'duckling') {
      parts.body.position.y = still ? 0 : Math.sin(t * 2.6 + v.phase) * 0.008;
      parts.body.rotation.z = still ? 0 : Math.sin(t * 2.1 + v.phase) * 0.05;
    }
  }

  const api = {
    sim,
    perches,
    spottable,
    groups: views.map((v) => v.group),
    views,
    get riding() { return riding; },

    // update(dt, t, { cat, player, session }): once a frame, after player.update.
    //   cat      the cat's Object3D
    //   player   src/player.js's (speed, zooming, inWater)
    //   session  the walk session (perched, pounceTime)
    update(dt, t, { cat, player, session }) {
      const p = cat.position;
      const perch = session.perched ?? null;
      const cow = perch && perch.ride ? cowById.get(perch.ride) ?? null : null;
      // She jumped: a pounce, or a hop up onto something.
      if (perch && perch !== wasPerched) jumpT = 0.3;
      if (jumpT > 0) jumpT -= dt;

      // ---- getting off --------------------------------------------------------
      if (riding && (!cow || cow.id !== riding)) {
        const from = cowById.get(riding);
        riding = null;
        // Down beside her: only when the cat simply got off (not when she
        // hopped across to another perch, which has already placed her).
        if (!perch && Math.hypot(p.x - from.x, p.z - from.z) < 1.5) {
          const dx = p.x - from.x;
          const dz = p.z - from.z;
          const toward = Math.hypot(dx, dz) > 0.02 ? { x: dx, z: dz } : { x: -Math.sin(cat.rotation.y), z: -Math.cos(cat.rotation.y) };
          const spot = dismountSpot(from, toward, { colliders: area.colliders, bounds: area.bounds, waters: area.waters });
          p.x = spot.x;
          p.z = spot.z;
        }
        onEvent({ type: 'dismount', id: from.id });
      }

      simCat.x = p.x;
      simCat.z = p.z;
      simCat.speed = player.speed ?? 0;
      simCat.running = !!player.zooming || (session.pounceTime ?? 0) > 0;
      simCat.inWater = !!player.inWater;
      simCat.perched = !!perch;
      simCat.jumping = (session.pounceTime ?? 0) > 0 || jumpT > 0;
      simCat.riding = cow ? cow.id : null;
      simCat.fx = -Math.sin(cat.rotation.y);
      simCat.fz = -Math.cos(cat.rotation.y);
      sim.step(dt, simCat, { ducks: ducks() });

      // ---- riding ------------------------------------------------------------
      if (cow) {
        if (riding !== cow.id) {
          riding = cow.id;
          rideYaw = cow.yaw;
          onEvent({ type: 'ride', id: cow.id });
        }
        // Carried: over her middle. Her height is the perch's own (player.js
        // and avatar.js stand the cat at perchY), and she turns as the cow turns.
        p.x = cow.perch.x;
        p.z = cow.perch.z;
        cat.rotation.y += wrap(cow.yaw - rideYaw);
        rideYaw = cow.yaw;
      }
      wasPerched = perch;

      // The goat's head-butt: a nudge, and only onto ground she may stand on.
      if (sim.nudge && !perch && !player.inWater) {
        const nx = p.x + sim.nudge.dx;
        const nz = p.z + sim.nudge.dz;
        if (isFree(nx, nz)) { p.x = nx; p.z = nz; }
      }
      for (const e of sim.events) onEvent(e);
      for (const v of views) pose(v, t, dt);
    },

    // A meow at `pos`: the cows look up and the nearest moos.
    reactToMeow(pos) {
      const cow = sim.meow(pos);
      if (cow) onEvent({ type: 'moo', id: cow.id });
      return cow;
    },

    dispose() {
      for (const v of views) {
        scene.remove(v.group);
        v.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      for (const g of shared) g.dispose();
      material.dispose();
      views.length = 0;
      riding = null;
    },
  };
  return api;
}
