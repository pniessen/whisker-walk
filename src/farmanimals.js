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
import { createFarmSim, dismountSpot, FARM_ANIMAL_TYPES, COW, GOAT } from './farmsim.js';
import {
  step, WALK, TROT, henWalk, HEN_STEP, henIdle, blink, slowBlink, breath, sway, flick, lookYaw, chew, swish, graze, lookBack, moo,
  pant, wag, playBow, rearUp, tailFlick, tilt, bump, hold, nowAndThen,
} from './farmlife.js';
import { createFarmJobs, FARM_HAT_ID, JOB } from './farmjobs.js';
import {
  buildCow, buildGoat, buildSheepdog, buildHen, chickGeometry, ducklingGeometry, farmAnimalMaterial, HEN_COLORS,
  COW_RIG, HEN_RIG, LID_OPEN,
  strawHatGeometry, eggNestGeometry, buildOwl, buildBarnCat, kittenGeometry, saucerGeometry, appleGeometry, mouseGeometry,
} from './farmmodels.js';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';

export { FARM_ANIMAL_TYPES };

// What a walk that is not at the Farm has.
export const NO_FARM = Object.freeze({
  sim: null,
  jobs: null,
  riding: null,
  spottable: Object.freeze([]),
  perches: Object.freeze([]),
  groups: Object.freeze([]),
  extras: Object.freeze([]),
  update() {},
  reactToMeow() { return null; },
  actionFor() { return null; },
  act() { return false; },
  dispose() {},
});

// How big each model is drawn (the game's cat is a big cat: a collie drawn at
// its modelled size would be no taller than she is).
export const SIZE = Object.freeze({ cow: COW.SIZE, farmgoat: 1.25, sheepdog: 1.45 });
// The farmer's straw hat as it is carried (carryables.js draws the same hat):
// how big, against the scarecrow's (a brim 0.5 m across the radius).
export const HAT_CARRIED = 0.44;
// A grain-store mouse is drawn twice its modelled size: beside the game's big
// cat a true-sized mouse is a speck.
const MOUSE_SIZE = 2;
// The barn cat and her kittens, likewise: she is a little smaller than the
// player's cat, and a kitten is a third of her.
const LOFT_CAT_SIZE = 2.2;
const KITTEN_SIZE = 1.9;

// How the models are jointed and how far they may turn (test/farmlife.test.js
// holds each): a cow's stride and the swing of her legs, how far round a head
// turns to look, where a goat's and a dog's legs hang from.
export const COW_STRIDE = 1.5;     // metres a grown cow walks in one round of her four feet
export const COW_SWING = 0.46;     // radians her legs swing either way
export const COW_LOOK = 1.0;       // her head toward a cat on the ground
export const COW_LOOK_BACK = 2.1;  // and right round, neck and skull together, to one on her back
export const GOAT_LOOK = 0.9;
export const DOG_LOOK = 1.0;
const GOAT_HIP = 0.48;
const DOG_HIP = 0.37;
const DOG_HEAD_Y = 0.6;
const HEN_BOB = (0.75 * HEN_STEP) / 2; // her head holds still for three quarters of a step

const ease = (from, to, k) => from + (to - from) * Math.min(1, k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// createFarmAnimals(scene, area, opts) → the Farm's animals for one walk.
//   area            world/farm.js's record (anchors, colliders, bounds, waters, perches)
//   opts.reducedMotion   no idle movement: no breathing, blinking, swaying, ear or tail flicks,
//                        chewing or head-bob (legs still walk, heads still look)
//   opts.onEvent(e)      what happened this frame: { type: 'moo' | 'cluck' | 'peep' | 'goat-butt' |
//                        'goat-copy' | 'dog-hello' | 'chick-follow' | 'ducklings-follow' |
//                        'cow-arrived' | 'ride' | 'dismount', id? } (the caller plays the sounds),
//                        and every event of the jobs and finds (src/farmjobs.js)
//   opts.isFree(x, z)    whether the cat may stand there (for the goat's nudge)
//   opts.ducks()         the pond's ducks, [{ x, z }] (critters.js's), for the ducklings to follow
//   opts.seed            the animals' own dice
//   opts.ground          the walk's ground (src/ground.js); the Farm's is flat
export function createFarmAnimals(scene, area, { reducedMotion = false, onEvent = () => {}, isFree = () => true, ducks = () => [], seed, ground = FLAT_GROUND } = {}) {
  const sim = createFarmSim(area, seed === undefined ? {} : { seed });
  // Step 3: the four jobs and the six finds, on the same animals.
  const jobs = createFarmJobs(area, sim, seed === undefined ? {} : { seed: `${seed}-jobs` });
  const views = [];
  const extras = []; // the jobs' and finds' own small things: Object3Ds in the scene, none of them an animal
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
      views.push({ a, group: built.group, parts: built.parts, phase: views.length * 1.7, seed: views.length + 1, k: { mooAt: -100 } });
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

  // ---- step 3: what the jobs and the finds are drawn with ---------------------------
  // Every one is a mesh or two on the animals' material and casts nothing.
  const A = area.anchors;
  const fx = withLocalUuids('farm-jobs', () => {
    const one = (geo, x, y, z, yaw = 0, scale = 1) => {
      const m = new THREE.Mesh(geo, material);
      m.userData.noCast = true;
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      if (scale !== 1) m.scale.setScalar(scale);
      return m;
    };
    const place = (o) => { scene.add(o); extras.push(o); return o; };
    const gy = (x, z) => ground.y(x, z);
    const hatGeo = strawHatGeometry();
    const mouseGeo = mouseGeometry();
    const appleGeo = appleGeometry();
    const eggGeo = eggNestGeometry();
    const saucerGeo = saucerGeometry();
    const kittenGeos = [0xd98a4a, 0x8d8a86, 0xf1ece2].map((hex) => kittenGeometry(hex));
    shared.push(hatGeo, mouseGeo, appleGeo, eggGeo, saucerGeo, ...kittenGeos);
    // the farmer's hat, in the goat's mouth (the goat is drawn bigger: the hat
    // is the size of the one the cat will carry)
    const goatView = views.find((v) => v.a === jobs.hatGoat);
    const goatHat = one(hatGeo, 0, -0.02, 0.06, 0, HAT_CARRIED / SIZE.farmgoat);
    goatHat.rotation.x = 0.5;
    goatView.parts.mouth.add(goatHat);
    extras.push(goatHat);
    // the scarecrow's hat as the cat wears it (head-local; put on her head when she tries it on)
    const catHat = one(hatGeo, 0, 0.115, 0.015, 0.4, 0.58);
    catHat.rotation.z = 0.08;
    catHat.name = 'farm-scarecrow-hat';
    extras.push(catHat);
    // the saucer of milk
    const saucer = place(one(saucerGeo, jobs.saucer.x, gy(jobs.saucer.x, jobs.saucer.z), jobs.saucer.z, 0, 1.7)); // a big cat's saucer
    saucer.visible = false;
    // the grain-store mice
    const mice = jobs.mice.map((m) => { const o = place(one(mouseGeo, m.x, gy(m.x, m.z), m.z, m.yaw, MOUSE_SIZE)); o.visible = false; return o; });
    // the barn cat and her kittens, in the hay
    const nest = A.hayloftNest;
    const toVisitor = Math.atan2(A.hayloft.x - nest.x, A.hayloft.z - nest.z);
    const barnCat = buildBarnCat(material);
    barnCat.group.position.set(nest.x, nest.y, nest.z);
    barnCat.group.rotation.y = toVisitor - 0.5;
    barnCat.group.scale.setScalar(LOFT_CAT_SIZE);
    place(barnCat.group);
    const kittens = kittenGeos.map((geo, i) => {
      // in a row along her belly, on the visitor's side
      const a = toVisitor + 0.15 + i * 0.62;
      return place(one(geo, nest.x + Math.sin(a) * (0.72 + 0.07 * i), nest.y, nest.z + Math.cos(a) * (0.72 + 0.07 * i), toVisitor + (i - 1) * 0.6, KITTEN_SIZE));
    });
    // the eggs behind the tractor, and the owl on its beam
    place(one(eggGeo, A.tractorNest.x, gy(A.tractorNest.x, A.tractorNest.z), A.tractorNest.z, 0.4, 1.2));
    const owl = buildOwl(material);
    owl.group.position.set(A.rafters.x, A.rafters.y, A.rafters.z);
    owl.group.scale.setScalar(1.5);
    place(owl.group);
    // two windfall apples: the orchard never has more loose at once
    const apples = [0, 1].map(() => { const o = place(one(appleGeo, 0, 0, 0, 0, JOB.APPLE_R / 0.09)); o.visible = false; return o; });
    return { goatHat, catHat, saucer, mice, barnCat, kittens, owl, apples, scarecrowHat: scene.getObjectByName('scarecrowHat') ?? null };
  });
  let hatHead = null; // the head the scarecrow's hat is on

  function poseJobs(t, dt, cat) {
    fx.goatHat.visible = jobs.hatGoat.carry === 'hat';
    fx.saucer.visible = jobs.state.cow === 'milk' || jobs.state.cow === 'done';
    jobs.mice.forEach((m, i) => {
      const o = fx.mice[i];
      o.visible = m.mode === 'idle' || m.mode === 'run';
      if (!o.visible) return;
      o.position.x = m.x; o.position.z = m.z;
      o.rotation.y = m.yaw;
      // nibbling: up on its haunches now and then; flat out when it runs
      o.rotation.x = m.mode === 'idle' && !reducedMotion ? -0.35 * Math.max(0, Math.sin(t * 2.3 + i * 1.9)) : 0;
    });
    // the barn cat lifts her head for a visitor; the kittens breathe, and look up
    const up = jobs.loft.visitor ? 1 : 0;
    fx.k = ease(fx.k ?? 0, up, dt * 3);
    fx.barnCat.parts.head.rotation.x = 0.55 * (1 - fx.k) - 0.15 * fx.k;
    fx.kittens.forEach((k, i) => {
      k.scale.y = KITTEN_SIZE * (1 + (reducedMotion ? 0 : Math.sin(t * 2.2 + i * 2.1) * 0.035));
      k.rotation.x = -0.18 * fx.k;
    });
    fx.owl.parts.eye.visible = jobs.owl.peek > 0;
    fx.owl.group.scale.y = 1.5 * (1 + (reducedMotion ? 0 : Math.sin(t * 1.3) * 0.015)); // asleep, breathing
    fx.apples.forEach((o, i) => {
      const a = jobs.apples[i];
      o.visible = !!a;
      if (!a) return;
      o.position.set(a.x, ground.y(a.x, a.z) + a.y, a.z);
      o.rotation.z = a.spin ?? 0;
    });
    // the scarecrow's hat: on him, or on her
    if (fx.scarecrowHat) fx.scarecrowHat.visible = !jobs.scarecrow.worn;
    const head = jobs.scarecrow.worn ? cat?.userData?.parts?.head ?? null : null;
    if (head !== hatHead) {
      if (hatHead) {
        hatHead.remove(fx.catHat);
        for (const c of hatHead.children) if (c.userData.farmHid) { c.visible = true; c.userData.farmHid = false; }
      }
      if (head) {
        // her own hat comes off for as long as she wears his
        for (const c of head.children) if (c.userData.hat && c.visible) { c.visible = false; c.userData.farmHid = true; }
        head.add(fx.catHat);
      }
      hatHead = head;
    }
  }

  const cowById = new Map(sim.cows.map((c) => [c.id, c]));
  const perches = sim.cows.map((c) => c.perch);
  const spottable = views.map((v) => ({ id: v.a.id, type: v.a.type, pos: v.group.position }));
  let riding = null;      // the id of the cow the cat is on
  let rideYaw = 0;
  let wasPerched = null;
  let jumpT = 0;
  let clock = 0;          // the last frame's time, for a moo that starts between frames
  const simCat = { x: 0, z: 0, y: 0, speed: 0, running: false, inWater: false, perched: false, jumping: false, riding: null, fx: 0, fz: -1, hat: false };

  // ---- how each kind is posed -------------------------------------------------------
  // The sim says where an animal is and what it is doing; src/farmlife.js says
  // how a living one would hold itself doing it. Nothing here writes to the sim.
  // `still` (the reduced-motion setting) keeps what MEANS something (legs that
  // walk, a head that goes down to graze or turns to look, a wag) and drops
  // every idle movement: breath, blink, sway, flicks, chewing, the head-bob.
  const still = reducedMotion;
  // A lid is drawn only while it is coming down: open, it is folded away under
  // the brow (a lid squashed flat over an open eye read as a frowning brow).
  const lidsTo = (lids, shut) => {
    const k = Math.min(1, Math.max(0, shut));
    lids.visible = k > 0.08;
    lids.scale.y = LID_OPEN + (1 - LID_OPEN) * k;
  };

  function poseCow(v, t, dt) {
    const { a, parts, k, seed } = v;
    const calf = a.scale < 1;
    const idle = still ? 0 : 1 - k.stride;
    // her walk: four beats, each foot down for two thirds of its stride and
    // planted while it is; knees and hocks fold as a foot comes forward
    const ph = a.walked / (COW_STRIDE * a.scale);
    // when she came to a stop, and how many stops: she looks back at a rider after most
    if (a.moving) k.stoppedAt = Infinity;
    else if (k.stoppedAt === Infinity || k.stoppedAt === undefined) { k.stoppedAt = t; k.stops = (k.stops ?? 0) + 1; }
    const lean = still ? 0 : sway(t, seed);
    for (let i = 0; i < 4; i++) {
      const s = step(ph + WALK.phase[i], WALK.duty);
      const th = -COW_SWING * s.swing * k.stride;
      const leg = parts.legs[i];
      leg.rotation.x = th;
      leg.position.y = COW_RIG.HIP_Y * Math.cos(th); // the hip sinks as the leg slopes: her hoof stays on the grass
      let fold = s.lift * k.stride * (i < 2 ? 1.05 : -0.8);
      // standing with her weight on one side, she rests the other hind foot on its toe
      if (i >= 2) fold -= 0.32 * idle * Math.max(0, Math.min(1, ((i === 2 ? -lean : lean) - 0.45) / 0.3));
      parts.shins[i].rotation.x = fold;
    }
    const beat = Math.sin(ph * Math.PI * 2);
    // shoulders and hips sway with the walk; standing, her weight goes from side to side
    parts.body.rotation.z = still ? 0 : 0.016 * beat * k.stride + 0.011 * lean * idle;
    parts.body.rotation.y = still ? 0 : 0.018 * Math.sin(ph * Math.PI * 2 + 1.2) * k.stride;
    parts.body.position.y = still ? 0 : 0.004 * (1 + Math.cos(ph * Math.PI * 4)) * k.stride;
    parts.torso.scale.x = still ? 1 : 1 + 0.013 * breath(t, seed, 1.3);

    // her head: down to graze, up to look, nodding as she walks
    const looking = a.mode === 'look' || (a.follow && !a.moving && a.lookAt);
    let neckX = a.headDown ? (calf ? 1.26 : 1.15) : looking ? -0.1 : a.moving ? 0.1 : 0.04;
    let skullX = a.headDown ? -0.45 : looking ? -0.04 : 0;
    let want = 0;
    if (looking && a.lookAt && Math.hypot(a.lookAt.x - a.x, a.lookAt.z - a.z) > 0.6) {
      want = Math.max(-1.0, Math.min(1.0, wrap(Math.atan2(a.lookAt.x - a.x, a.lookAt.z - a.z) - a.yaw)));
    } else if (!a.headDown && !a.ridden) {
      want = lookYaw(a, simCat.x, simCat.z, COW_LOOK, 3.5, 8); // a cat nearby: she watches her go by
    }
    // a cat on her back: now and then she turns right round to look at her
    if (a.ridden && !a.moving && !still) {
      const back = lookBack(t, seed, t - k.stoppedAt, k.stops);
      neckX += (-0.02 - neckX) * back.k;
      skullX += (-0.3 - skullX) * back.k;
      want += (back.side * COW_LOOK_BACK - want) * back.k;
    }
    const m = moo(t - k.mooAt);
    neckX += (-0.32 - neckX) * m;
    skullX += (-0.5 - skullX) * m;
    k.head = ease(k.head ?? neckX, neckX, dt * 2.2);
    k.skull = ease(k.skull ?? skullX, skullX, dt * 2.6);
    k.turn = ease(k.turn ?? 0, want, dt * 2.4);
    let nod = 0, tug = 0, reach = 0;
    if (!still) {
      nod = 0.035 * Math.sin(ph * Math.PI * 4) * k.stride;
      if (a.headDown) { const g = graze(t, seed); tug = g.tug; reach = g.reach; }
    }
    const down = Math.min(1, Math.max(0, k.head)); // how far down her head is: she reaches about only when grazing
    parts.head.rotation.x = k.head + nod;
    parts.head.rotation.y = k.turn * 0.7 + 0.16 * reach * down;
    parts.skull.rotation.x = k.skull - 0.12 * tug * down;
    parts.skull.rotation.y = k.turn * 0.3;
    parts.skull.rotation.z = -k.turn * 0.12;
    // her jaw goes round as she chews; it drops for a moo
    if (still) {
      parts.jaw.rotation.x = 0.3 * m; parts.jaw.rotation.y = 0; parts.jaw.position.x = 0;
      parts.ears.rotation.y = 0; parts.ears.rotation.z = 0;
      lidsTo(parts.lids, 0.06);
      parts.tail.rotation.z = 0; parts.tail.rotation.x = 0.06;
    } else {
      const c = chew(t, seed);
      // chewing the cud: the jaw goes round, mostly from side to side, the lips barely parting
      parts.jaw.rotation.x = 0.035 * c.open * (1 - m) + 0.3 * m;
      parts.jaw.rotation.y = 0.06 * c.side * (1 - m);
      parts.jaw.position.x = 0.006 * c.side * (1 - m);
      parts.ears.rotation.y = 0.5 * flick(t, seed);
      parts.ears.rotation.z = 0.16 * flick(t, seed + 50, 5.3);
      parts.ears.rotation.x = -0.3 * Math.min(1, Math.abs(k.turn) + (looking ? 1 : 0)); // turned to listen
      lidsTo(parts.lids, 0.06 + slowBlink(t, seed));
      const sw = swish(t, seed);
      parts.tail.rotation.z = 0.5 * sw.z + 0.1 * beat * k.stride;
      parts.tail.rotation.x = 0.06 + 0.3 * sw.x;
    }
  }

  function poseGoat(v, t, dt) {
    const { a, parts, k, seed } = v;
    const idle = still ? 0 : 1 - k.stride;
    const ph = (a.walked * 9) / (Math.PI * 2);
    // the little rear-up before the gentle head-butt
    const rear = a.mode === 'butt' ? rearUp((a.buttT ?? 0) / GOAT.BUTT_TIME) : 0;
    const spring = still ? 0 : 0.014 * Math.abs(Math.sin(ph * Math.PI * 2)) * k.stride;
    parts.body.position.y = a.y / SIZE.farmgoat + spring + 0.06 * rear; // the group is drawn bigger; its height is in metres
    parts.body.rotation.x = (a.hop ? -0.25 * Math.cos(Math.min(1, a.hop.t) * Math.PI) : 0) - 0.2 * rear; // nose up, then down
    parts.body.rotation.z = still ? 0 : 0.012 * sway(t, seed) * idle;
    for (let i = 0; i < 4; i++) {
      const leg = parts.legs[i];
      if (a.hop) { leg.rotation.x = i < 2 ? -0.7 : 0.7; leg.position.y = GOAT_HIP; continue; }
      const s = step(ph + TROT.phase[i], TROT.duty);
      const th = -0.5 * s.swing * k.stride;
      leg.rotation.x = th + (i < 2 ? 0.55 * rear : 0.2 * rear);
      leg.position.y = GOAT_HIP * Math.cos(th) + 0.035 * s.lift * k.stride;
    }
    parts.torso.scale.x = still ? 1 : 1 + 0.014 * breath(t, seed, 1.9);
    // its head: lowered to butt (the sim's), turned to watch the cat, tilted now and then
    const near = lookYaw(a, simCat.x, simCat.z, GOAT_LOOK, 4, 9);
    k.turn = ease(k.turn ?? 0, a.head > 0.05 ? 0 : near, dt * 3.5);
    parts.head.rotation.x = a.head * 0.95 + (still ? 0 : 0.03 * Math.sin(ph * Math.PI * 4) * k.stride);
    parts.head.rotation.y = k.turn;
    const hat = a.carry === 'hat';
    if (still) {
      parts.head.rotation.z = 0;
      parts.jaw.rotation.x = 0; parts.jaw.position.x = 0;
      parts.ears.rotation.y = 0; parts.ears.rotation.z = 0;
      lidsTo(parts.lids, 0);
      parts.tail.rotation.z = 0; parts.tail.rotation.x = 0;
    } else {
      parts.head.rotation.z = 0.2 * tilt(t, seed) * idle * (1 - a.head);
      const c = chew(t, seed, 7.5);
      parts.jaw.rotation.x = hat ? 0.1 : 0.05 * c.open * idle; // it does not chew the farmer's hat; chewing, its lips barely part
      parts.jaw.position.x = hat ? 0 : 0.005 * c.side * idle;
      parts.ears.rotation.y = 0.55 * flick(t, seed, 2.9);
      parts.ears.rotation.z = 0.2 * flick(t, seed + 50, 4.1);
      lidsTo(parts.lids, blink(t, seed));
      const f = tailFlick(t, seed);
      parts.tail.rotation.z = 0.7 * f;
      parts.tail.rotation.x = -0.3 * Math.abs(f) - 0.25 * k.stride; // up when it trots
    }
  }

  function poseDog(v, t, dt) {
    const { a, parts, k, seed } = v;
    const lying = a.mode === 'lie' ? 1 : 0;
    k.lie = ease(k.lie ?? lying, lying, dt * 4);
    // the play bow he greets her with: elbows down, tail up
    const bowing = a.mode === 'beside' && !a.moving && a.wag && !still ? playBow(t, seed) : 0;
    k.bow = ease(k.bow ?? 0, bowing, dt * 8);
    const up = 1 - k.lie;
    const ph = (a.walked * 10) / (Math.PI * 2);
    const w = a.wag ? wag(t, still) : 0;
    parts.body.position.y = -0.3 * k.lie - 0.075 * k.bow + (still ? 0 : 0.01 * Math.abs(Math.sin(ph * Math.PI * 2)) * k.stride); // belly on the grass
    parts.body.rotation.x = 0.42 * k.bow;
    parts.body.rotation.y = still ? 0 : -0.05 * w * up; // a wag moves his hips
    parts.torso.scale.x = still ? 1 : 1 + 0.016 * breath(t, seed, a.wag || a.moving ? 3.4 : 1.4);
    for (let i = 0; i < 4; i++) {
      const s = step(ph + TROT.phase[i], TROT.duty);
      const th = -0.52 * s.swing * k.stride;
      const leg = parts.legs[i];
      // lying: front paws out ahead, hind legs tucked forward. Bowing: forelegs flat, hind legs upright
      leg.rotation.x = th - (i < 2 ? 1.5 : 1.45) * k.lie - (i < 2 ? 1.16 : 0.42) * k.bow;
      leg.position.y = DOG_HIP * Math.cos(th) + 0.03 * s.lift * k.stride;
    }
    // his tail: low when he is easy, wagging for her, up in a bow, curved round him when he lies
    parts.tail.rotation.z = w * (still ? 0.25 : 0.6) * (1 - 0.5 * k.lie);
    parts.tail.rotation.x = 0.5 * k.lie + 0.3 * (a.wag ? 1 : 0) * up + 1.1 * k.bow - 0.25 * k.stride * (1 - (a.wag ? 1 : 0));
    parts.tail.rotation.y = 1.15 * k.lie;
    // his head: on his paws when he dozes, up and toward her when she is near
    const doze = k.lie * (a.wag ? 0 : 1);
    k.doze = ease(k.doze ?? doze, doze, dt * 3);
    k.turn = ease(k.turn ?? 0, lookYaw(a, simCat.x, simCat.z, DOG_LOOK, 5, 10), dt * 4);
    parts.head.rotation.x = 0.42 * k.doze - 0.38 * k.bow;
    parts.head.position.y = DOG_HEAD_Y - 0.085 * k.doze;
    parts.head.rotation.y = k.turn * (1 - k.doze);
    parts.head.rotation.z = still ? 0 : -0.12 * k.turn + 0.14 * tilt(t, seed) * (a.wag && !a.moving ? 1 : 0) * (1 - k.bow);
    const alert = a.wag ? 1 : 0;
    k.alert = ease(k.alert ?? alert, alert, dt * 5);
    const happy = a.wag || a.moving ? 1 : 0;
    k.pant = ease(k.pant ?? 0, happy, dt * 3);
    if (still) {
      parts.jaw.rotation.x = 0.005 + 0.02 * k.pant;
      parts.ears[0].rotation.x = parts.ears[1].rotation.x = 0.3 - 0.4 * k.alert;
      lidsTo(parts.lids, 0.1 + 0.8 * k.doze);
    } else {
      parts.jaw.rotation.x = 0.005 + (0.015 + 0.025 * pant(t)) * k.pant; // a gentle pant: his lips part on his tongue
      // ears back and easy; pricked toward her when she is near; a flick now and then
      parts.ears[0].rotation.x = 0.3 - 0.4 * k.alert + 0.3 * Math.abs(flick(t, seed, 3.1));
      parts.ears[1].rotation.x = 0.3 - 0.4 * k.alert + 0.3 * Math.abs(flick(t, seed + 9, 4.3));
      lidsTo(parts.lids, 0.1 + 0.8 * k.doze + (k.doze > 0.5 ? 0 : slowBlink(t, seed)));
    }
  }

  function poseHen(v, t, dt) {
    const { a, parts, k, seed } = v;
    parts.body.position.y = a.y;
    const fluttering = a.mode === 'flutter' ? 1 : 0;
    k.open = ease(k.open ?? 0, fluttering, dt * 14);
    let bend = 0, peck = 0, gaze = 0, scratch = 0, fluff = 0, stretch = 0, bob = 0, feet = 0, lift = 0;
    if (!still) {
      if (a.mode === 'peck') {
        const h = henIdle(t, seed);
        bend = h.bend; peck = h.peck; gaze = h.gaze; scratch = h.scratch; fluff = h.fluff; stretch = h.stretch;
      }
      // the walk: her head holds still while she walks on under it, then jumps forward
      const hw = henWalk(a.walked);
      bob = hw.head * k.stride; feet = hw.feet * k.stride; lift = hw.lift * k.stride;
    } else if (a.mode === 'peck') {
      bend = 0.3; // head down at the grain, and still
    }
    k.bend = ease(k.bend ?? bend, bend, dt * 9);
    parts.trunk.rotation.x = 1.0 * k.bend;
    parts.trunk.rotation.z = 0.05 * feet + 0.07 * Math.sin(t * 31) * fluff;
    const puff = 1 + 0.07 * fluff;
    parts.trunk.scale.set(puff + (still ? 0 : 0.014 * breath(t, seed, 2.4)), puff, puff); // a quick bird's breath
    parts.head.rotation.x = 0.6 * k.bend + 1.0 * peck - 0.15 * fluttering;
    parts.head.rotation.y = 0.65 * gaze;
    parts.head.rotation.z = 0.22 * gaze;
    parts.head.position.z = HEN_RIG.HEAD[2] + HEN_BOB * bob;
    parts.beak.rotation.x = 0.45 * peck + 0.5 * k.open;
    parts.legs.rotation.y = 0.42 * feet + 0.5 * scratch;
    parts.legs.rotation.z = 0.1 * lift;
    // her wings: beating in a flutter, opened slowly in a stretch, hidden while folded
    const spread = Math.max(k.open, stretch);
    parts.wings.visible = spread > 0.02;
    if (parts.wings.visible) {
      parts.wings.scale.x = 0.3 + 0.7 * spread;
      parts.wings.scale.y = k.open > 0.02 && !still ? 0.2 + 0.9 * Math.sin(t * 38) : 0.35;
    }
  }

  function poseChick(v, t) {
    const { a, parts, seed } = v;
    const m = parts.body;
    if (still) { m.position.y = a.y; m.rotation.x = 0; m.rotation.z = 0; m.scale.x = 1; return; }
    const patter = a.walked * 34;
    m.position.y = a.y + (a.moving ? Math.abs(Math.sin(patter)) * 0.014 : 0);
    m.rotation.z = a.moving ? Math.sin(patter) * 0.13 : 0; // a waddle
    // standing: a peck at the ground, a look up to peep, a shake of its wing stubs
    const peck = a.moving ? 0 : bump(nowAndThen(t, 2.7, 0.5, seed * 7 + 15));
    const peep = a.moving ? 0 : hold(nowAndThen(t, 4.4, 0.8, seed * 7 + 16), 0.3);
    m.rotation.x = 0.7 * peck - 0.22 * peep;
    m.scale.x = 1 + 0.14 * Math.abs(Math.sin(t * 34)) * bump(nowAndThen(t, 3.3, 0.6, seed * 7 + 17));
  }

  function poseDuckling(v, t) {
    const { a, parts, seed } = v;
    const m = parts.body;
    if (still) {
      m.position.y = 0;
      m.rotation.set(0, 0, 0);
      return;
    }
    // bobbing on the water; paddling, its tail goes from side to side; now and then it dabbles
    const paddle = a.moving ? 1 : 0;
    const dab = a.moving ? 0 : hold(nowAndThen(t, 6.1, 1.3, seed * 7 + 18), 0.3);
    m.position.y = Math.sin(t * 2.6 + v.phase) * 0.008 - 0.012 * dab;
    m.rotation.z = Math.sin(t * 2.1 + v.phase) * 0.05 + paddle * Math.sin(a.walked * 24) * 0.07;
    m.rotation.y = paddle * Math.sin(a.walked * 24) * 0.11;
    m.rotation.x = 0.6 * dab + paddle * 0.04 * Math.sin(a.walked * 48);
  }

  function pose(v, t, dt) {
    const { a, group, k } = v;
    group.visible = !a.hidden; // a chick inside the coop
    group.position.x = a.x;
    group.position.z = a.z;
    if (!ground.flat) group.position.y = ground.y(a.x, a.z);
    group.rotation.y = a.yaw;
    k.stride = ease(k.stride ?? 0, a.moving ? 1 : 0, dt * 6);
    if (a.type === 'cow') poseCow(v, t, dt);
    else if (a.type === 'farmgoat') poseGoat(v, t, dt);
    else if (a.type === 'sheepdog') poseDog(v, t, dt);
    else if (a.type === 'hen') poseHen(v, t, dt);
    else if (a.type === 'chick') poseChick(v, t);
    else if (a.type === 'duckling') poseDuckling(v, t);
  }

  const api = {
    sim,
    jobs,
    extras,
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
      simCat.y = perch ? perch.y ?? 0 : 0;
      simCat.hat = session.carry?.mouth?.held?.id === FARM_HAT_ID;
      sim.step(dt, simCat, { ducks: ducks() });
      jobs.step(dt, simCat);

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
      for (const e of sim.events) {
        if (e.type === 'moo') { const view = views.find((v) => v.a.id === e.id); if (view) view.k.mooAt = t; }
        onEvent(e);
      }
      for (const e of jobs.takeEvents()) onEvent(e);
      clock = t;
      for (const v of views) pose(v, t, dt);
      poseJobs(t, dt, cat);
    },

    // What E would do for a job or a find where the cat stands (farmjobs.js
    // actionFor), or null; and doing it. Both read the cat as of the last frame.
    actionFor() { return jobs.actionFor(simCat); },
    act(action) { return jobs.act(action, simCat); },

    // A meow at `pos`: the cows look up and the nearest moos.
    reactToMeow(pos) {
      const cow = sim.meow(pos);
      if (cow) {
        onEvent({ type: 'moo', id: cow.id });
        const view = views.find((v) => v.a === cow);
        if (view) view.k.mooAt = clock; // her mouth opens for it
      }
      // My own meow up in the hayloft: the owl opens one eye (its event comes
      // with the next frame's). A co-walker's meow is at her height, not known here.
      if (Math.hypot(pos.x - simCat.x, pos.z - simCat.z) < 0.5) jobs.meow(pos, simCat.y);
      return cow;
    },

    dispose() {
      for (const v of views) {
        scene.remove(v.group);
        v.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      if (hatHead) hatHead.remove(fx.catHat);
      hatHead = null;
      for (const o of extras) {
        o.parent?.remove(o);
        o.traverse((m) => { if (m.geometry && !shared.includes(m.geometry)) m.geometry.dispose(); });
      }
      extras.length = 0;
      for (const g of shared) g.dispose();
      material.dispose();
      views.length = 0;
      riding = null;
    },
  };
  return api;
}
