import { vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canvasStub } from './growriver.js';

// Bigger areas, step 3: the recorded walk on the Woods, for a test to run with
// the switch off or on (test/woodsgrowtrace.off.test.js,
// test/woodsgrowtrace.on.test.js). A copy of test/helpers/rivertrace.js (which
// is itself test/flattrace.test.js's driver, copied) with the Woods traced
// instead of the River.
//
// The fixture was recorded with the eight maps traced one after another in
// one process, Math.random re-seeded before each. The Woods is the fifth: by
// then the four before it have made the shared things (surface textures,
// memoised geometry, the cat's parts) whose uuids are Math.random draws. So
// woodsTraceAsRecorded traces the four first, throws them away, and traces
// the Woods ONCE: call it once a file.

vi.stubGlobal('document', canvasStub);

const woods = await import('../../src/world/woods.js');
const { setGrow } = await import('../../src/grow.js');
const BEFORE = {
  neighborhood: await import('../../src/world/neighborhood.js'),
  park: await import('../../src/world/park.js'),
  seaside: await import('../../src/world/seaside.js'),
  docks: await import('../../src/world/docks.js'),
};
const { mulberry32 } = await import('../../src/rng.js');
const { createPlayer } = await import('../../src/player.js');
const { buildCat } = await import('../../src/cat/model.js');
const { applyWaterLook } = await import('../../src/cat/waterlook.js');
const { createStrayCats, strayStream } = await import('../../src/straycats.js');
const { createCritters } = await import('../../src/critters.js');
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

const FIXTURE = fileURLToPath(new URL('../fixtures/flat-trace.json', import.meta.url));
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

function traceArea(areaId, world) {
  const scene = new THREE.Scene();
  const area = world.build(scene);
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
  for (const c of critters.list) decals.follow(c.figure ?? c.group);
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



export function woodsTraceAsRecorded(on) {
  const realRandom = Math.random;
  const run = (areaId, world, grow) => {
    setGrow(grow);
    try {
      Math.random = mulberry32(0x9e3779b9);
      return traceArea(areaId, world);
    } finally {
      Math.random = realRandom;
      setGrow(null);
    }
  };
  for (const [areaId, world] of Object.entries(BEFORE)) run(areaId, world, false);
  return run('woods', woods, on);
}

export const recordedWoods = () => JSON.parse(readFileSync(FIXTURE, 'utf8')).woods;
