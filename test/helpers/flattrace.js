import { vi, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canvasStub } from './growriver.js';

// The flat trace's driver, shared (review S2, 2026-11-19). test/flattrace.test.js
// holds it to the two fixtures; test/helpers/rivertrace.js (the bigger-areas
// tests) runs one area of it with the grow switch on or off. There is one copy
// of the script now: a branch that needs a walk on its own area calls
// traceAsRecorded(areaId, { grow }) instead of copying this file.
//
// What runs, in main.js's frame order: player.update, critters, strays, clan
// cats (the four territories), intruders (a fixed clock with a visit on the
// map), the toy (and main.js's float-ashore drift), gold mice, knockables
// (the first one knocked off its ledge at frame 250; the four territories
// have none), paw prints, remote cats (a scripted co-walker, a state every 8th
// frame), ghosts, the contact shadows; then, as game/avatar.js does,
// applyWaterLook on the cat (animateCat is skipped). 600 frames at 60 fps:
// 2 s forward, a quarter turn, a pounce, a knock, the far zoom step, a thrown
// yarn ball. Every 10th frame is recorded as Number#toString strings.
//
// Two parts, two fixtures:
//
//  - GAMEPLAY (test/fixtures/flat-trace.gameplay.json): where every moving
//    thing is and which way it faces (the cat, the camera, strays, critters,
//    clan cats, the intruder, the ghost, the co-walker, the toy, knockables,
//    gold mice). FROZEN. A change here is a change to how the game plays.
//  - RENDER (test/fixtures/flat-trace.render.json): the contact shadows' and
//    paw prints' instance matrices (an FNV-1a hash of every slot every 10th
//    frame, the active slots as strings every 100th), and the knockables'
//    shadow decals. Re-recorded freely (UPDATE_TRACE=render) when a cat's or a
//    prop's outline changes its shadow; nothing reads these but the GPU.
//
// Every moving system draws from a seeded stream of its OWN here (MOTION
// below), never from Math.random. Math.random is still seeded per area (THREE's
// uuids take four draws for every object, geometry and material, and the
// draw-count pins in other files count them), but no gameplay value reads it:
// test/flattrace.test.js re-traces every area with Math.random seeded
// differently and holds the gameplay part to the same fixture.
//
// Stand-ins: the cat is a real buildCat('tabby') group, never animated (on
// Seaside and the Docks the cat wades, and applyWaterLook's sink measures the
// torso); the intruders' and remote cats' clocks are the trace's own simulated
// time, never Date.now / performance.now.

vi.stubGlobal('document', canvasStub);

export const WORLDS = {
  neighborhood: await import('../../src/world/neighborhood.js'),
  park: await import('../../src/world/park.js'),
  seaside: await import('../../src/world/seaside.js'),
  docks: await import('../../src/world/docks.js'),
  woods: await import('../../src/world/woods.js'),
  river: await import('../../src/world/river.js'),
  moor: await import('../../src/world/moor.js'),
  pines: await import('../../src/world/pines.js'),
};
const { mulberry32 } = await import('../../src/rng.js');
const { setGrow } = await import('../../src/grow.js');
const { createPlayer } = await import('../../src/player.js');
const { buildCat } = await import('../../src/cat/model.js');
const { applyWaterLook } = await import('../../src/cat/waterlook.js');
const { createStrayCats, strayStream } = await import('../../src/straycats.js');
const { createCritters } = await import('../../src/critters.js');
const { createPeopleKit } = await import('../../src/people/index.js');
const { setPeople } = await import('../../src/peopleflag.js');
const { createToy } = await import('../../src/toy.js');
const { createClanCats } = await import('../../src/clancats.js');
const { castFor, clanCountFor, roamHomes } = await import('../../src/clancast.js');
const { campLayout } = await import('../../src/world/camp.js');
const { clanWalkableFor } = await import('../../src/world/clanground.js');
const { createIntruders, intruderAt, INTRUDER_DECAL_RADIUS } = await import('../../src/intruders.js');
const { createGhosts } = await import('../../src/ghosts.js');
const { createRemoteCats } = await import('../../src/remotecats.js');
const { createGoldMice } = await import('../../src/goldmice.js');
const { createKnockables } = await import('../../src/knockables.js');
const { propsFor } = await import('../../src/propsets.js');
const { createContactShadows } = await import('../../src/render/contactshadows.js');
const { createPawPrints } = await import('../../src/render/pawprints.js');
const { LADDER } = await import('../../src/render/quality.js');
const { waterClearance, nearestDry } = await import('../../src/world/builder.js');

export const GAMEPLAY_FIXTURE = fileURLToPath(new URL('../fixtures/flat-trace.gameplay.json', import.meta.url));
export const RENDER_FIXTURE = fileURLToPath(new URL('../fixtures/flat-trace.render.json', import.meta.url));
// Math.random's seed for every area's build (THREE's uuids and nothing else).
export const UUID_SEED = 0x9e3779b9;
const FRAMES = 600;
const DT = 1 / 60;
const TIER = LADDER[0];

// Each moving system's own stream, made fresh per area. The walk's own
// streams (game/walk.js) are seeded from the walk's seed and salted per
// system; these are fixed seeds, which is all a trace needs.
//
// Four of them start with a TAPE (the gameplay fixture's `_streams`): until
// review S2 the critters' phases, the ghost's wander rolls, the gold mice's
// bob phases and the toy's bat push were bare Math.random() draws, taken from
// the trace's seeded Math.random between THREE's uuid draws. When they got
// streams of their own, the values those draws had given (11 to 30 numbers an
// area) were kept as the first values of each stream, so not one gameplay
// value had to move; past the tape each stream carries on as a mulberry32.
// The tapes are constants: they do not depend on Math.random or on how many
// objects anything builds.
function tape(values = [], seed) {
  const more = mulberry32(seed);
  let i = 0;
  return () => (i < values.length ? values[i++] : more());
}
export const MOTION = (areaId, tapes = recordedStreams(areaId)) => ({
  critterPlace: mulberry32(7), // createCritters' rng (walkRng in a walk)
  critterMotion: tape(tapes?.critterMotion, 11), // each critter's idle phase
  stray: strayStream(12345), // createStrayCats' spawn stream
  ghostPlace: mulberry32(3), // createGhosts' rng
  ghostWander: tape(tapes?.ghostWander, 17), // the ghost's wander FSM
  gold: tape(tapes?.gold, 13), // each gold mouse's bob phase
  toy: tape(tapes?.toy, 19), // the yarn ball's bat
});

const s = (n) => n.toString();
const v3 = (v) => [s(v.x), s(v.y), s(v.z)];
const pr = (o) => [...v3(o.position), ...v3(o.rotation)];

// FNV-1a over the array's bytes: any changed bit anywhere in it changes this.
function fnv(arr) {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
const slice = (arr, n) => Array.from(arr.subarray(0, n), s).join(',');

// The first whole second at which a visit is on the map for the next 10 s.
function intruderClock(areaId) {
  for (let t = 0; t < 120 * 400; t++) {
    if (intruderAt(areaId, t + 0.5) && intruderAt(areaId, t + 10.5)) return t;
  }
  throw new Error(`no intruder visit found for ${areaId}`);
}

// Ruling F33 (Gorge part 2, Task 12), kept as it was (the uuid workarounds go
// one at a time, later). THREE's generateUUID takes four Math.random() draws
// for every Object3D, geometry and material. The Moor's trail to the Gorge
// adds one path mesh and clears one heather and one gorse, so the Moor build
// takes 24 fewer draws: 7968 when the first fixture was recorded, 7944 now.
// The count is asserted, so a change to the Moor's objects fails here; the
// burn after it keeps Math.random where it was for the draw-count pins.
// The count holds only for a Moor built after the six maps before it, first
// in its process (a later build finds the shared parts already made), so a
// trace that is not one passes pinMoorDraws: false.
const MOOR_BUILD_DRAWS = 7944;
const MOOR_DRAWS_AT_RECORDING = 7968;
function buildMoorKeepingDraws(world, scene, pin) {
  const seeded = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return seeded(); };
  let area;
  try {
    area = world.build(scene);
  } finally {
    Math.random = seeded;
  }
  if (pin) expect(draws, "the Moor build's Math.random draws (THREE uuids): its object count changed").toBe(MOOR_BUILD_DRAWS);
  for (let i = draws; i < MOOR_DRAWS_AT_RECORDING; i++) Math.random();
  return area;
}

// traceArea(areaId, world, motion, { pinMoorDraws }) -> { gameplay: frame[], render: frame[] }.
// Call with Math.random already seeded (traceAsRecorded does).
export function traceArea(areaId, world, motion = MOTION(areaId), { pinMoorDraws = true, people = false } = {}) {
  const scene = new THREE.Scene();
  const area = areaId === 'moor' ? buildMoorKeepingDraws(world, scene, pinMoorDraws) : world.build(scene);
  const decals = createContactShadows(scene);

  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  const cat = buildCat('tabby');
  cat.position.set(area.spawn.x, 0, area.spawn.z);
  cat.rotation.y = 0;
  scene.add(cat);
  player.setAvatar(cat, 3);
  player.enable();

  const critters = createCritters(scene, area.critterSpawns, {
    rng: motion.critterPlace, motionRng: motion.critterMotion, hides: propsFor(areaId).hides,
    // the people switch on: villagers are the new people, with soft bumps
    people: people ? createPeopleKit : null, camera: people ? camera : undefined,
  });
  const strays = createStrayCats(scene, area, 3, motion.stray, { roomSeed: 12345 });
  const cast = castFor(areaId).slice(0, clanCountFor(TIER.strays, 0));
  let clan = null;
  if (cast.length) {
    const clanArea = { ...area, colliders: Object.freeze(area.colliders.map((c) => ({ ...c }))) };
    const ok = clanWalkableFor(clanArea, areaId);
    clan = createClanCats(scene, area, cast, {
      campLayout: campLayout(areaId), roamHomes: roamHomes(areaId, clanArea, ok), isWalkable: ok,
      roomSeed: 12345, showNames: true, areaId,
    });
  }
  const remotes = createRemoteCats(scene, {});
  const toy = createToy(scene, { rng: motion.toy });
  const knockables = createKnockables(scene, propsFor(areaId).knockables);
  const paws = createPawPrints(scene, { areaId, areaData: area, tier: TIER });
  const gold = createGoldMice(scene, areaId, new Set(), { rng: motion.gold });
  let t = 0;
  const clock0 = castFor(areaId).length ? intruderClock(areaId) : 0;
  const intruders = castFor(areaId).length
    ? createIntruders(scene, areaId, { now: () => clock0 + t, showNames: true })
    : null;
  const ghosts = createGhosts(scene, area, [
    { playerId: 'ghost-1', petName: 'Pebble', breed: 'tabby', accessories: {}, greets: 2 },
  ], motion.ghostPlace, { wanderRng: motion.ghostWander });

  decals.follow(cat);
  for (const st of strays.strays) decals.follow(st.group);
  for (const c of clan?.list ?? []) decals.follow(c.group);
  for (const c of critters.list) decals.follow(c.figure ?? c.group);
  for (const c of critters.list) if (c.people?.[1]) decals.follow(c.people[1].figure);
  if (intruders?.anchor) decals.follow(intruders.anchor, INTRUDER_DECAL_RADIUS);
  for (const g of ghosts.list) decals.follow(g.group);

  remotes.upsert({ playerId: 'remote-1', petName: 'Juniper', breed: 'tabby', accessories: {} }, 0);
  const pawState = { x: 0, z: 0, grounded: true };
  const forward = { x: 0, z: -1, mag: 1 };
  const gameplay = [];
  const render = [];

  for (let f = 0; f < FRAMES; f++) {
    t += DT;
    // The script: forward from the start; a quarter turn of yaw over frames
    // 120-149; a pounce at 200; the far zoom step from 300; the toy at 400.
    player.setTouchMove(forward);
    if (f >= 120 && f < 150) player.addOrbit(-(Math.PI / 2) / 30 / 0.0045, 0);
    if (f === 200) player.pounce();
    if (f === 300) player.setCameraZoom(3);
    // The first knockable is knocked off its ledge at 250 (the knock verb's
    // own call, by id), so its fall and landing are in the trace.
    if (f === 250 && knockables.list.length) knockables.knockById(knockables.list[0].id);
    if (f === 400) {
      const drop = cat.position.clone().add(player.forward().multiplyScalar(0.8)).setY(0.8);
      toy.throwFrom(drop, player.forward(), 2.5);
    }
    if (f % 8 === 0) {
      remotes.applyState({
        id: 'remote-1', pos: [area.spawn.x + 2 + f * 0.01, area.spawn.z + 1.5], yaw: 0.5, pose: 'follow', speed: 0.6,
      }, t);
    }

    player.update(DT, area.colliders, area.bounds, area.waters, critters.bumps);
    critters.update(DT, t, cat.position, cat.position, cat);
    strays.update(DT, t, cat.position, { stalking: player.stalking, catSpeed: player.speed, toy });
    clan?.update(DT, t, cat.position);
    intruders?.update(DT, cat.position);
    toy.update(DT, area.bounds);
    const toyPos = toy.mesh.position;
    if (toy.active && toyPos.y <= 0.2 && waterClearance(area.waters, toyPos.x, toyPos.z) < 0.5) {
      const dry = nearestDry(area.waters, toyPos.x, toyPos.z, 0.5);
      const dx = dry.x - toyPos.x;
      const dz = dry.z - toyPos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        const step = Math.min(d, 2.2 * DT);
        toyPos.x += (dx / d) * step;
        toyPos.z += (dz / d) * step;
      }
    }
    gold.update(t);
    knockables.update(DT);
    pawState.x = cat.position.x;
    pawState.z = cat.position.z;
    pawState.grounded = player.perchY === 0 && !(player.hopY > 0) && !player.inWater;
    paws.update(DT, pawState);
    remotes.update(DT, t, area.waters);
    ghosts.update(DT, t);
    decals.update();
    applyWaterLook(cat, player.waterState, t, DT, false, player.perchY + player.hopY);

    if (f % 10 !== 9) continue;
    const intruderGroup = scene.children.find((c) => c.userData.intruder) ?? null;
    gameplay.push({
      f,
      cat: pr(cat),
      camera: v3(camera.position),
      strays: strays.strays.map((st) => pr(st.group)),
      critters: critters.list.map((c) => pr(c.group)),
      clan: (clan?.list ?? []).map((c) => pr(c.group)),
      intruder: intruderGroup ? pr(intruderGroup) : null,
      ghosts: ghosts.list.map((g) => pr(g.group)),
      remotes: remotes.list.map((r) => pr(r.group)),
      toy: v3(toy.mesh.position),
      knockables: knockables.list.map((k) => pr(k.group)),
      gold: gold.list.map((m) => s(m.group.position.y)),
    });
    render.push({
      f,
      knockableDecals: knockables.list.map((k) => [...v3(k.decal.position), String(k.decal.visible)]),
      shadows: {
        all: fnv(decals.moverMesh.instanceMatrix.array),
        active: f % 100 === 99 ? slice(decals.moverMesh.instanceMatrix.array, decals.moverCount * 16) : null,
      },
      paws: paws.mesh ? {
        all: fnv(paws.mesh.instanceMatrix.array),
        active: f % 100 === 99 ? slice(paws.mesh.instanceMatrix.array, paws.mesh.count * 16) : null,
      } : null,
    });
  }
  return { gameplay, render };
}

// traceAsRecorded(areaId, opts) -> { gameplay, render }: one area traced the
// way the fixtures were recorded: Math.random seeded before the build and put
// back after, the grow switch set for the trace and cleared after.
//   grow          the bigger-areas switch for this area (false)
//   inOrder       trace the maps before it first, switch off, and throw them
//                 away (false). Neither part needs it (an area traced alone
//                 gives both parts as recorded, checked 2026-11-19); only the
//                 Moor's draw-count pin (F33) does, which holds only
//                 when the Moor is built after the six maps before it.
//   uuidSeed      Math.random's seed (UUID_SEED)
//   motion        (areaId) => the moving systems' streams (MOTION)
//   people        the people switch on, the kit passed to the critters (false)
//   pinMoorDraws  assert the Moor build's draw count (true when inOrder, or
//                 when the Moor is the first area traced in the process)
export function traceAsRecorded(areaId, {
  grow = false, inOrder = false, uuidSeed = UUID_SEED, motion = MOTION, pinMoorDraws = inOrder, people = false,
} = {}) {
  if (inOrder) {
    for (const before of Object.keys(WORLDS)) {
      if (before === areaId) break;
      traceAsRecorded(before, { uuidSeed, motion });
    }
  }
  const realRandom = Math.random;
  setGrow(grow);
  setPeople(people);
  try {
    Math.random = mulberry32(uuidSeed);
    return traceArea(areaId, WORLDS[areaId], motion(areaId), { pinMoorDraws, people });
  } finally {
    Math.random = realRandom;
    setGrow(null);
    setPeople(null);
  }
}

// Every shipped map in turn, in one process, as the fixtures are recorded.
export function traceAll({ pinMoorDraws = true, ...opts } = {}) {
  const gameplay = {};
  const render = {};
  for (const areaId of Object.keys(WORLDS)) {
    const tr = traceAsRecorded(areaId, { ...opts, pinMoorDraws });
    gameplay[areaId] = tr.gameplay;
    render[areaId] = tr.render;
  }
  return { gameplay, render };
}

const ABOUT = {
  gameplay: 'FROZEN. Where every moving thing in test/helpers/flattrace.js\'s scripted walk is, every 10th frame, '
    + 'on each shipped map. Compared within last-digit rounding only (test/helpers/closeto.js). Never re-record '
    + 'this to make a test pass: a difference here is a change to how the game plays. Re-recorded only with the '
    + 'owner\'s yes, after a field-by-field check, with UPDATE_TRACE=gameplay. `_streams`: the first values of '
    + 'four systems\' own streams (MOTION in that file), constants kept across every re-record.',
  render: 'RE-RECORDABLE. The same walk\'s render-only values: contact-shadow and paw-print instance matrices '
    + '(hashes every 10th frame, active slots every 100th) and the knockables\' shadow decals. When a cat\'s or '
    + 'a prop\'s outline moves a shadow, re-record with UPDATE_TRACE=render and say so in the commit; check '
    + 'first that the gameplay fixture still passes.',
};

// The gameplay file keeps its `_streams` (the tapes) across a re-record.
export function writeFixture(part, byArea, streams = part === 'gameplay' ? load('gameplay')._streams : undefined) {
  const file = part === 'gameplay' ? GAMEPLAY_FIXTURE : RENDER_FIXTURE;
  const head = part === 'gameplay' ? { _about: ABOUT.gameplay, _streams: streams } : { _about: ABOUT.render };
  writeFileSync(file, `${JSON.stringify({ ...head, ...byArea })}\n`);
}

const cache = {};
function load(part) {
  cache[part] ??= JSON.parse(readFileSync(part === 'gameplay' ? GAMEPLAY_FIXTURE : RENDER_FIXTURE, 'utf8'));
  return cache[part];
}
// The recorded frames, one area's or every area's (by id, without the header).
function frames(part, areaId) {
  const { _about, _streams, ...byArea } = load(part);
  return areaId ? byArea[areaId] : byArea;
}
export const recordedGameplay = (areaId) => frames('gameplay', areaId);
export const recordedRender = (areaId) => frames('render', areaId);
export const recordedStreams = (areaId) => load('gameplay')._streams?.[areaId];
