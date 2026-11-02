import { describe, it, expect, vi, afterAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeDiffs } from './helpers/closeto.js';

// Gorge part 1, Task 1: today's world, pinned as a byte-exact trace.
//
// The ground-height engine (ground.y(x, z)) is 0 on every shipped map, and
// nothing on a shipped map may move by a single bit because it exists. This
// file is the proof: for each of the eight outdoor maps it builds the area, a
// player and every per-frame mover headlessly, drives 600 scripted frames
// (2 s forward, a quarter turn, a pounce, a knock, the far zoom step, a thrown
// yarn ball), and records every 10th frame as Number#toString strings. Every
// later task re-proves the fixture byte-identical. NEVER re-record it after
// Task 1 (UPDATE_TRACE=1 is for Task 1 only).
// 2026-11-02: re-recorded once for the body refinement, after an isolation
// check proved the change came only from three.js id draws in cat builds.
//
// What runs, in main.js's frame order: player.update, critters, strays, clan
// cats (the four territories), intruders (a fixed clock with a visit on the
// map), the toy (and main.js's float-ashore drift), gold mice, knockables
// (the first one knocked off its ledge at frame 250; the four territories
// have none), paw prints, remote cats
// (a scripted co-walker, a state every 8th frame), ghosts,
// the contact shadows; then, as game/avatar.js does, applyWaterLook on the cat
// (animateCat is skipped).
//
// Stand-ins and deviations from the plan's wording:
//  - The cat is a real buildCat('tabby') group, never animated, rather than a
//    bare THREE.Group: on Seaside and the Docks the cat wades, and
//    applyWaterLook's sink measures the torso (cat.userData.parts.body).
//  - The intruders' clock and the remote cats' clock are the trace's own
//    simulated time, never Date.now / performance.now.
//  - Math.random is a seeded mulberry32, re-seeded per area, and restored.
//  - Instance matrices (contact shadows' mover mesh, paw prints): every 10th
//    frame, an FNV-1a hash of the WHOLE instanceMatrix array's bytes, so a
//    change to any bit of any slot fails; every 100th frame, the active slots
//    exactly as strings too (moverCount / mesh.count slots), so a failure can
//    be read. Recording every slot every 10th frame made a 4 MB fixture.
//
// Left out: nothing the plan lists. (The clan fight, the fight camera, the
// rival, the yard dog, the race, weather, splash, grass, wind, water and sky
// life are not in the plan's list; their own tests and Task 10's wiring sweep
// cover them.)

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  // createPlayer registers its key/pointer-lock listeners on `document`.
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const WORLDS = {
  neighborhood: await import('../src/world/neighborhood.js'),
  park: await import('../src/world/park.js'),
  seaside: await import('../src/world/seaside.js'),
  docks: await import('../src/world/docks.js'),
  woods: await import('../src/world/woods.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
  pines: await import('../src/world/pines.js'),
};
const { mulberry32 } = await import('../src/rng.js');
const { createPlayer } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/model.js');
const { applyWaterLook } = await import('../src/cat/waterlook.js');
const { createStrayCats, strayStream } = await import('../src/straycats.js');
const { createCritters } = await import('../src/critters.js');
const { createToy } = await import('../src/toy.js');
const { createClanCats } = await import('../src/clancats.js');
const { castFor, clanCountFor, roamHomes } = await import('../src/clancast.js');
const { campLayout } = await import('../src/world/camp.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { createIntruders, intruderAt, INTRUDER_DECAL_RADIUS } = await import('../src/intruders.js');
const { createGhosts } = await import('../src/ghosts.js');
const { createRemoteCats } = await import('../src/remotecats.js');
const { createGoldMice } = await import('../src/goldmice.js');
const { createKnockables } = await import('../src/knockables.js');
const { propsFor } = await import('../src/propsets.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { createPawPrints } = await import('../src/render/pawprints.js');
const { LADDER } = await import('../src/render/quality.js');
const { waterClearance, nearestDry } = await import('../src/world/builder.js');

const FIXTURE = fileURLToPath(new URL('./fixtures/flat-trace.json', import.meta.url));
const FRAMES = 600;
const DT = 1 / 60;
const TIER = LADDER[0];

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

// Ruling F33 (Gorge part 2, Task 12). THREE's generateUUID takes four
// Math.random() draws for every Object3D, geometry and material, and the trace
// seeds Math.random before the build, so the build's object count reaches the
// movers through the draws after it (the critters' phases). The Moor's trail
// to the Gorge adds one path mesh and clears one heather and one gorse, so the
// Moor build takes 24 fewer draws: 7968 when this fixture was recorded, 7944
// now. Nothing moves because of it: burning those 24 draws after the build
// makes the trace match the fixture byte for byte. The count is asserted
// before the burn, so a later change to the Moor's objects fails here instead
// of being absorbed.
const MOOR_BUILD_DRAWS = 7944;
const MOOR_DRAWS_AT_RECORDING = 7968;
function buildMoorKeepingDraws(world, scene) {
  const seeded = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return seeded(); };
  let area;
  try {
    area = world.build(scene);
  } finally {
    Math.random = seeded;
  }
  expect(draws, "the Moor build's Math.random draws (THREE uuids): its object count changed").toBe(MOOR_BUILD_DRAWS);
  for (let i = draws; i < MOOR_DRAWS_AT_RECORDING; i++) Math.random();
  return area;
}

function traceArea(areaId, world) {
  const scene = new THREE.Scene();
  const area = areaId === 'moor' ? buildMoorKeepingDraws(world, scene) : world.build(scene);
  const decals = createContactShadows(scene);

  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, { addEventListener() {} });
  const cat = buildCat('tabby');
  cat.position.set(area.spawn.x, 0, area.spawn.z);
  cat.rotation.y = 0;
  scene.add(cat);
  player.setAvatar(cat, 3);
  player.enable();

  const critters = createCritters(scene, area.critterSpawns, { rng: mulberry32(7), hides: propsFor(areaId).hides });
  const strays = createStrayCats(scene, area, 3, strayStream(12345), { roomSeed: 12345 });
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
  const toy = createToy(scene);
  const knockables = createKnockables(scene, propsFor(areaId).knockables);
  const paws = createPawPrints(scene, { areaId, areaData: area, tier: TIER });
  const gold = createGoldMice(scene, areaId, new Set());
  let t = 0;
  const clock0 = castFor(areaId).length ? intruderClock(areaId) : 0;
  const intruders = castFor(areaId).length
    ? createIntruders(scene, areaId, { now: () => clock0 + t, showNames: true })
    : null;
  const ghosts = createGhosts(scene, area, [
    { playerId: 'ghost-1', petName: 'Pebble', breed: 'tabby', accessories: {}, greets: 2 },
  ], mulberry32(3));

  decals.follow(cat);
  for (const st of strays.strays) decals.follow(st.group);
  for (const c of clan?.list ?? []) decals.follow(c.group);
  for (const c of critters.list) decals.follow(c.group);
  if (intruders?.anchor) decals.follow(intruders.anchor, INTRUDER_DECAL_RADIUS);
  for (const g of ghosts.list) decals.follow(g.group);

  remotes.upsert({ playerId: 'remote-1', petName: 'Juniper', breed: 'tabby', accessories: {} }, 0);
  const pawState = { x: 0, z: 0, grounded: true };
  const forward = { x: 0, z: -1, mag: 1 };
  const frames = [];

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

    player.update(DT, area.colliders, area.bounds, area.waters);
    critters.update(DT, t, cat.position, cat.position);
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
    frames.push({
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
      knockables: knockables.list.map((k) => [...pr(k.group), ...v3(k.decal.position), String(k.decal.visible)]),
      gold: gold.list.map((m) => s(m.group.position.y)),
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
  return frames;
}

describe('the flat trace', () => {
  const realRandom = Math.random;
  afterAll(() => { Math.random = realRandom; });

  it('every shipped map moves exactly as it did before the ground engine', () => {
    const trace = {};
    try {
      for (const [areaId, world] of Object.entries(WORLDS)) {
        Math.random = mulberry32(0x9e3779b9);
        trace[areaId] = traceArea(areaId, world);
      }
    } finally {
      Math.random = realRandom;
    }
    if (process.env.UPDATE_TRACE === '1') {
      writeFileSync(FIXTURE, `${JSON.stringify(trace)}\n`);
      return;
    }
    const pinned = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    // Within last-digit rounding: the fixture is recorded on a Mac and checked
    // on GitHub's Linux runners too (see helpers/closeto.js).
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
