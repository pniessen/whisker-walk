import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { walkHarness, areas, fakeDocument, anything } from './helpers/walkharness.js';
import { AreaLoadError } from '../src/game/areaload.js';
import { GATE_MOMENT_MS, nextRoomSeed, gateStatus } from '../src/gatecross.js';
import { createNet, createFakeHub } from '../src/net.js';
import { createCrossing } from '../src/game/crossing.js';
import { createNetEvents } from '../src/game/netevents.js';
import { nowSec } from '../src/game/util.js';
import { endById } from '../src/gateways.js';
import { postsFor } from '../src/borderposts.js';
import { postStatus } from '../src/bordercross.js';
import { CATALOG } from '../src/progression.js';
import { openAngle, LEAF_OPEN, LEAF_R, LEAF_BLOCKS, NO_GATES } from '../src/world/gateway.js';
import { phrase } from '../src/clanphrases.js';
import { diagnostics } from '../src/diagnostics.js';
import { mulberry32 } from '../src/rng.js';
import { headingToward } from '../src/game/guidewalk.js';
import { takeStartLines, pauseCardFor, pauseCardHtml, pauseSoundOf } from '../src/game/walk.js';
import { escapeHtml } from '../src/escapehtml.js';
// the walk harness's settings: muted, nothing else set
const SETTINGS = { get: (k) => (k === 'muted' ? true : null) };
import { DISCS } from '../src/rivalclans.js';
import { SPAWN as MOOR_SPAWN } from '../src/world/moor.js';
import { SPAWN as WOODS_SPAWN } from '../src/world/woods.js';
import { cameraOffset } from '../src/catcam.js';
import { makeView, blockers } from '../src/housewalls.js';
import { CAT_LOOK_Y } from '../src/cat/model.js';
import { OLD_HOUSE_FRONT } from '../src/world/oldhousefront.js';
import { gatewayNear } from '../src/gateways.js';
import { clampZoomStep, maxZoomStep, zoomView } from '../src/camzoom.js';

// Walking on (world map step 3, Task 7): a cat walks through a gate at the
// Park's edge, a short "Off to Appletree Farm!" moment shows, and the next walk
// starts by itself at the Farm's twin gate. The walk just left is banked
// quietly: no summary. walk.js's walkOn is the one way through a gate; its
// answer is a Promise of 'walked' | 'refused' | 'failed' | 'dropped'.
//
// Whole walks, headless (test/helpers/walkharness.js), on a fixed day and a
// fixed Math.random stream, with the timers faked so the moment can be run on.

const WALK_MS = 90_000; // whole walks: an explicit timeout

beforeAll(() => areas.ensureAll(['neighborhood', 'park', 'farm', 'fair', 'woods', 'moor', 'roofs', 'market', 'house']));

beforeEach(() => {
  globalThis.document = fakeDocument();
  diagnostics.clear();
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-21T15:00:00Z') });
  const stream = mulberry32(20261121);
  vi.spyOn(Math, 'random').mockImplementation(() => stream());
});
afterEach(() => {
  delete globalThis.document;
  diagnostics.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Clan Edition, in the Park: owns the Neighbourhood, the Park and the Farm,
// two Park walks, 100 points (the Fairground is open to buy, so its gate is shut).
function parkSave(p) {
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('park', 'farm');
  p.state.walks.park = 2;
  p.setArea('park');
  p.addPoints(100);
  expect(p.state.edition).not.toBe('legacy');
  expect(p.state.area).toBe('park');
}
function legacyParkSave(p) {
  parkSave(p);
  p.setEdition('legacy');
  expect(p.state.edition).toBe('legacy');
}

// A loader that has every place but the Farm, whose load is up to the test.
function farmLoader(ensureFarm) {
  let farmHere = false;
  return {
    loaded: (id) => (id === 'farm' && !farmHere ? null : areas.loaded(id)),
    ensure: (id) => (id === 'farm'
      ? ensureFarm().then((pack) => { farmHere = true; return pack; })
      : areas.ensure(id)),
    prefetch() {},
  };
}
const slowFarm = (ms) => farmLoader(() => new Promise((resolve) => setTimeout(() => resolve(areas.loaded('farm')), ms)));
const failingFarm = (kind = 'failed') => farmLoader(() => Promise.reject(new AreaLoadError('farm', kind)));

describe('walking on through a gate', () => {
  it('walks straight on from the Park to the Farm: banked quietly, the moment, then the Farm at its gate', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('park');
    const going = h.w.walkOn({ via: 'park-farm' });
    // the pack is here: banked, freed and the moment up before walkOn returns
    expect(h.getSession()).toBeNull();
    expect(await going).toBe('walked');
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.overlay.innerHTML).not.toContain('Home again!');
    expect(h.overlay.classList.contains('hidden')).toBe(false);
    expect(h.progression.state.walks.park).toBe(3);
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('refused'); // a second tap during the moment
    expect(walked).toEqual([]);
    vi.advanceTimersByTime(GATE_MOMENT_MS - 1);
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    const s = h.getSession();
    expect(s.areaId).toBe('farm');
    expect(s.cat.position.x).toBeCloseTo(-8, 9);
    expect(s.cat.position.z).toBeCloseTo(41.4, 9);
    expect(s.cat.rotation.y).toBe(0);
    expect(s.arrivedVia).toBe('farm-park');
    expect(h.progression.state.area).toBe('farm');
    expect(walked).toHaveLength(1);
    expect(Array.isArray(walked[0])).toBe(true);
    // the Farm's own Ready? card, not the moment
    expect(h.overlay.innerHTML).toContain('btn-resume');
  }, WALK_MS);

  it('back to the Neighbourhood through the Park\'s town gate: she arrives facing into the town, the camera behind her', async () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-town' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(h.progression.state.area).toBe('neighborhood');
    expect(s.arrivedVia).toBe('town-park');
    // ARRIVE_IN (3.6 m) inside the town's east gate at (52, 0), facing west
    expect(s.cat.position.x).toBeCloseTo(48.4, 9);
    expect(s.cat.position.z).toBeCloseTo(0, 9);
    expect(s.cat.rotation.y).toBe(Math.PI / 2);
    // the camera placed behind her for that yaw, as the camp lesson places it
    const view = zoomView(clampZoomStep(null, maxZoomStep(false)));
    const want = s.cat.position.clone().add(cameraOffset(Math.PI / 2, 0.18, view.dist, view.height));
    expect(h.camera.position.x).toBeCloseTo(want.x, 9);
    expect(h.camera.position.y).toBeCloseTo(want.y, 9);
    expect(h.camera.position.z).toBeCloseTo(want.z, 9);
    // and not where a yaw of 0 would have put it
    const atZero = s.cat.position.clone().add(cameraOffset(0, 0.18, view.dist, view.height));
    expect(Math.hypot(h.camera.position.x - atZero.x, h.camera.position.z - atZero.z)).toBeGreaterThan(1);
  }, WALK_MS);

  it('nothing to resume once the moment is up, and the walk just left is saved', async () => {
    let ended = 0;
    const h = walkHarness({ save: parkSave, onWalkEnded: () => ended++ });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    // before the timer: the app could close now
    expect(ended).toBe(1);
    expect(JSON.parse(h.storage.getItem('whisker-walk-save')).walks.park).toBe(3);
  }, WALK_MS);

  it('a gate it does not have, or no walk, changes nothing', async () => {
    const h = walkHarness({ save: parkSave });
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('refused'); // no walk
    h.w.startWalk({});
    const s = h.getSession();
    expect(await h.w.walkOn({ via: 'fair-park' })).toBe('refused'); // the Fairground's gate
    expect(await h.w.walkOn({ via: 'nope' })).toBe('refused');
    expect(await h.w.walkOn({})).toBe('refused');
    expect(h.getSession()).toBe(s);
    expect(h.progression.state.walks.park).toBe(2);
    vi.advanceTimersByTime(GATE_MOMENT_MS * 2);
    expect(h.getSession()).toBe(s);
  }, WALK_MS);

  it('the walk just left banks its lines for the toast: a new best', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    h.progression.addPoints(40); // the best walk so far is 0
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(walked).toHaveLength(1);
    // a desktop: kept for the Farm walk's first engage (its Ready? card covers toasts)
    expect(takeStartLines(h.getSession())).toContain('NEW BEST! 🏆');
  }, WALK_MS);

  it('a walk started some other way during the moment is not replaced', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    h.w.startWalk({ areaOverride: 'park' });
    const s = h.getSession();
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession()).toBe(s);
    expect(s.areaId).toBe('park');
    expect(walked).toEqual([]);
  }, WALK_MS);

  it('arriving draws nothing from the shared stream', () => {
    // Two Farm walks of one room seed, one arriving at the Park gate and one
    // at the spawn: the world they build is the same, draw for draw.
    const world = (arrive) => {
      const stream = mulberry32(7);
      Math.random.mockImplementation(() => stream());
      const h = walkHarness({ save: parkSave });
      h.w.startWalk({ roomSeed: 99, areaOverride: 'farm', arrive });
      const s = h.getSession();
      const out = {
        weather: s.weather.condition,
        quest: s.quest ? { type: s.quest.type, target: s.quest.target } : null,
        goals: s.goals ? s.goals.goals.map((g) => g.id) : null,
        rings: s.race.rings.map((r) => [r.x, r.z]),
        strays: s.strayCats.strays.map((c) => [c.name, c.group.position.x, c.group.position.z]),
        secrets: s.secrets.list.length,
      };
      const cat = [s.cat.position.x, s.cat.position.z, s.cat.rotation.y];
      h.w.endWalk();
      return { out, cat };
    };
    const atSpawn = world(null);
    const atGate = world({ x: -8, z: 41.4, yaw: 0 });
    expect(atGate.out).toEqual(atSpawn.out);
    expect(atGate.out.goals).toHaveLength(3);
    expect(atGate.out.rings.length).toBeGreaterThan(0);
    // and the two cats did start in different places
    expect(atGate.cat[0]).toBeCloseTo(-8, 9);
    expect(atGate.cat[1]).toBeCloseTo(41.4, 9);
    expect(atSpawn.cat.slice(0, 2)).not.toEqual(atGate.cat.slice(0, 2));
  }, WALK_MS);

  it('the Park has its three gates in Clan Edition, shut where she cannot go yet; Legacy has none', () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.gates).not.toBe(NO_GATES);
    const gates = new Map(s.scene.children.filter((c) => c.name === 'gateway').map((g) => [g.userData.endId, g]));
    expect([...gates.keys()].sort()).toEqual(['park-fair', 'park-farm', 'park-town']);
    const leaf = (id) => gates.get(id).getObjectByName('gateHinge').rotation.y;
    expect(leaf('park-farm')).toBe(LEAF_OPEN); // she owns the Farm
    expect(leaf('park-town')).toBe(LEAF_OPEN); // and the Neighbourhood
    expect(leaf('park-fair')).toBe(0); // the Fairground is still to be bought
    // the shut leaf blocks the way on the live list; the open ones do not
    const leafCircles = (x, z) => s.areaData.colliders.filter((c) => c.r === LEAF_R && Math.hypot(c.x - x, c.z - z) < 1.5);
    expect(leafCircles(0, -47)).toHaveLength(LEAF_BLOCKS);
    expect(leafCircles(42, 10)).toHaveLength(0);
    expect(leafCircles(0, 49)).toHaveLength(0);
    // the posts stand on the live list too, two a gate
    const posts = s.areaData.colliders.filter((c) => c.r === 0.15 && [[0, -47], [42, 10], [0, 49]].some(([x, z]) => Math.hypot(c.x - x, c.z - z) < 1.5));
    expect(posts).toHaveLength(6);
    // the two lanes are paths, as the wet and dusk tints find them (R12)
    const lanes = s.scene.children.filter((c) => c.name === 'path' && c.userData.gateLane);
    expect(lanes).toHaveLength(2);
    h.w.endWalk();

    const legacy = walkHarness({ save: legacyParkSave });
    legacy.w.startWalk({});
    const ls = legacy.getSession();
    expect(ls.areaId).toBe('park');
    expect(ls.gates).toBe(NO_GATES);
    let gatewayChildren = 0;
    ls.scene.traverse((o) => { if (o.name === 'gateway' || o.userData?.gateLane) gatewayChildren++; });
    expect(gatewayChildren).toBe(0);
    const atGates = ls.areaData.colliders.filter((c) => (c.r === LEAF_R || c.r === 0.15) && [[0, -47], [42, 10], [0, 49]].some(([x, z]) => Math.hypot(c.x - x, c.z - z) < 1.5));
    expect(atGates).toHaveLength(0);
  }, WALK_MS);

  // Placement fix round 1: the Fair's and the Farm's gates to the Park are set
  // into their front fences, and only where a gate is drawn: a Clan walk's
  // fence is cut for it, a Legacy walk's runs on whole.
  it('the Fair\'s and the Farm\'s front fences are cut for their gates in Clan Edition, and whole in Legacy', () => {
    const fenceAcross = (s, meshName, x) => {
      const mesh = s.scene.getObjectByName(meshName);
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.attributes.position;
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        const v = { x: pos.getX(i), z: pos.getZ(i) };
        const w = { x: v.x * mesh.matrixWorld.elements[0] + v.z * mesh.matrixWorld.elements[8] + mesh.matrixWorld.elements[12],
          z: v.x * mesh.matrixWorld.elements[2] + v.z * mesh.matrixWorld.elements[10] + mesh.matrixWorld.elements[14] };
        if (Math.abs(w.z - 45) <= 0.3 && Math.abs(w.x - x) < 1.0) n++;
      }
      return n;
    };
    for (const [area, mesh, x] of [['fair', 'fairFence', 8], ['farm', 'farmFences', -8]]) {
      const clan = walkHarness({ save: parkSave });
      clan.w.startWalk({ areaOverride: area });
      const cs = clan.getSession();
      expect(cs.areaId).toBe(area);
      expect(cs.scene.children.some((c) => c.name === 'gateway' && c.userData.endId === `${area}-park`)).toBe(true);
      expect(fenceAcross(cs, mesh, x), `${area}: Clan fence in the gate's opening`).toBe(0);
      clan.w.endWalk();
      const legacy = walkHarness({ save: legacyParkSave });
      legacy.w.startWalk({ areaOverride: area });
      const ls = legacy.getSession();
      expect(ls.areaId).toBe(area);
      expect(ls.gates).toBe(NO_GATES);
      expect(fenceAcross(ls, mesh, x), `${area}: Legacy fence where the gate would stand`).toBeGreaterThan(0);
      legacy.w.endWalk();
    }
  }, WALK_MS);

  it('a session holds its walk-on fields: no room, no handlers, no gate she came in by', () => {
    const h = walkHarness({ save: parkSave });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.roomSeed).toBeUndefined();
    expect(s.netOffs).toEqual([]);
    expect(s.arrivedVia).toBeNull();
    expect(s.walkingOn).toBe(false);
    h.w.endWalk();
  }, WALK_MS);
});

// Rooftops step 4: the town's north signpost (town-roofs) and the green door
// in the Rooftops' back-alley wall (roofs-town), walked through both ways.
describe('walking on between the town and the Rooftops', () => {
  // Clan Edition: the Fairground walked twice and the Rooftops bought.
  function roofsSave(area) {
    return (p) => {
      p.setTutorialFirst('done');
      p.state.unlocked.areas.push('park', 'fair', 'roofs');
      p.state.walks.fair = 2;
      p.setArea(area);
      expect(p.state.edition).not.toBe('legacy');
      expect(p.state.area).toBe(area);
    };
  }

  it("from the town through its north signpost: the Rooftops walk starts in the alley, in front of the door, facing north", async () => {
    const h = walkHarness({ save: roofsSave('neighborhood') });
    h.w.startWalk({});
    const town = h.getSession();
    expect(town.areaId).toBe('neighborhood');
    const signs = town.scene.children.filter((c) => c.name === 'gateway').map((g) => g.userData.endId).sort();
    // (the Market's, Market step 4, stands there too, shut: the Market is not hers)
    expect(signs).toEqual(['town-docks', 'town-market', 'town-park', 'town-roofs']);
    expect(await h.w.walkOn({ via: 'town-roofs' })).toBe('walked');
    expect(h.overlay.innerHTML).toContain('Off to the Rooftops!');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('roofs');
    expect(h.progression.state.area).toBe('roofs');
    expect(s.arrivedVia).toBe('roofs-town');
    expect(s.cat.position.x).toBeCloseTo(14, 9);
    expect(s.cat.position.z).toBeCloseTo(41.9, 9);
    expect(s.cat.rotation.y).toBe(1.0);
    // the door is drawn, open (the town is hers), its leaf turned into the alley
    const door = s.scene.children.find((c) => c.name === 'gateway' && c.userData.endId === 'roofs-town');
    expect(door).toBeTruthy();
    expect(door.getObjectByName('gateHinge').rotation.y).toBe(openAngle('alleydoor'));
  }, WALK_MS);

  it('from the Rooftops through the alley door: the town walk starts just inside its north signpost, facing south', async () => {
    const h = walkHarness({ save: roofsSave('roofs') });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('roofs');
    expect(await h.w.walkOn({ via: 'town-roofs' })).toBe('refused'); // the town's gate, not this walk's
    expect(await h.w.walkOn({ via: 'roofs-town' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(s.arrivedVia).toBe('town-roofs');
    expect(s.cat.position.x).toBeCloseTo(0, 9);
    expect(s.cat.position.z).toBeCloseTo(-48.4, 9);
    expect(s.cat.rotation.y).toBe(Math.PI);
  }, WALK_MS);

  // Review Focus 4: Legacy has the Rooftops as a picture card, and no gates.
  it('a Legacy Rooftops walk draws no door: no gateway, no door colliders, the alley wall as it was', () => {
    const h = walkHarness({ save: (p) => { roofsSave('roofs')(p); p.setEdition('legacy'); } });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.areaId).toBe('roofs');
    expect(s.gates).toBe(NO_GATES);
    let gatewayChildren = 0;
    s.scene.traverse((o) => { if (o.name === 'gateway' || o.name === 'gateBody' || o.name === 'gateLeaf') gatewayChildren++; });
    expect(gatewayChildren).toBe(0);
    const door = endById('roofs-town').end;
    const atDoor = s.areaData.colliders.filter((c) => Math.hypot(c.x - door.x, c.z - door.z) < 2);
    expect(atDoor).toEqual([]);
    expect(s.scene.getObjectByName('roofsAlley')).toBeTruthy();
  }, WALK_MS);
});

// Market step 4: the town's south-east signpost (town-market) and the gate in
// the gap of the square's south row of shop fronts (market-town), walked
// through both ways.
describe('walking on between the town and the Market Square', () => {
  // Clan Edition: the town walked twice and the Market bought.
  function marketSave(area) {
    return (p) => {
      p.setTutorialFirst('done');
      p.state.unlocked.areas.push('market');
      p.state.walks.neighborhood = 2;
      p.setArea(area);
      expect(p.state.edition).not.toBe('legacy');
      expect(p.state.area).toBe(area);
    };
  }

  it('from the town through its south-east signpost: the Market walk starts inside the square, in front of its gate, facing north', async () => {
    const h = walkHarness({ save: marketSave('neighborhood') });
    h.w.startWalk({});
    const town = h.getSession();
    expect(town.areaId).toBe('neighborhood');
    const signs = town.scene.children.filter((c) => c.name === 'gateway').map((g) => g.userData.endId).sort();
    expect(signs).toEqual(['town-docks', 'town-market', 'town-park', 'town-roofs']);
    // the town's gate to the Market is open (the Market is hers)
    const townGate = town.scene.children.find((c) => c.name === 'gateway' && c.userData.endId === 'town-market');
    expect(townGate.getObjectByName('gateHinge').rotation.y).toBe(LEAF_OPEN);
    expect(townGate.getObjectByName('gateSign')).toBeTruthy();
    // and its paved path from the street's end (the owner, 2026-11-21): one
    // strip, drawn with the gate, on no collider list
    const paths = town.scene.children.filter((c) => c.userData.gateLane);
    expect(paths).toHaveLength(1);
    expect(paths[0].position.x).toBeCloseTo((2.6 + 31.7) / 2, 9);
    expect(paths[0].position.z).toBeCloseTo(50.9, 9);
    expect(await h.w.walkOn({ via: 'town-market' })).toBe('walked');
    expect(h.overlay.innerHTML).toContain('Off to the Market Square!');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('market');
    expect(h.progression.state.area).toBe('market');
    expect(s.arrivedVia).toBe('market-town');
    expect(s.cat.position.x).toBeCloseTo(0, 9);
    expect(s.cat.position.z).toBeCloseTo(19.9, 9);
    expect(s.cat.rotation.y).toBe(0);
    // inside the square's cobbles, its gate behind her
    expect(s.cat.position.z).toBeLessThan(s.areaData.bounds.maxZ);
    const gate = s.scene.children.find((c) => c.name === 'gateway' && c.userData.endId === 'market-town');
    expect(gate).toBeTruthy();
    expect(gate.position.z).toBeGreaterThan(s.cat.position.z);
    expect(gate.getObjectByName('gateHinge').rotation.y).toBe(LEAF_OPEN);
  }, WALK_MS);

  it("from the Market through the square's gate: the town walk starts 3.6 m inside its south-east signpost, facing north", async () => {
    const h = walkHarness({ save: marketSave('market') });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('market');
    expect(await h.w.walkOn({ via: 'town-market' })).toBe('refused'); // the town's gate, not this walk's
    expect(await h.w.walkOn({ via: 'market-town' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(s.arrivedVia).toBe('town-market');
    expect(s.cat.position.x).toBeCloseTo(30, 9);
    expect(s.cat.position.z).toBeCloseTo(48.4, 9);
    expect(s.cat.rotation.y).toBe(0);
  }, WALK_MS);

  // V16: the Market is Clan Edition only; a Legacy walk draws no gates at all.
  it('a Legacy town has no Market gate', () => {
    const h = walkHarness({ save: (p) => { marketSave('neighborhood')(p); p.setEdition('legacy'); } });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(s.gates).toBe(NO_GATES);
    expect(s.scene.children.filter((c) => c.name === 'gateway')).toEqual([]);
    expect(s.scene.children.filter((c) => c.userData.gateLane)).toEqual([]); // nor its path
    const gate = endById('town-market').end;
    expect(s.areaData.colliders.filter((c) => Math.hypot(c.x - gate.x, c.z - gate.z) < 2)).toEqual([]);
    // nothing to ask at: the prompt (main.js's interactions) asks at a gate
    // only on a Clan walk; test/interactions.test.js walks her to (30, 51)
    // in both editions and sees the prompt in Clan and none in Legacy.
  }, WALK_MS);
});

// Old House step 4 (W6, W7): the old house's door in the town (town-house,
// drawn by the town's old house front) and the hall's front door
// (house-town), walked through both ways. The owner's change (P-1): the house
// opens after 2 Market Square walks, so these saves own the Market.
describe('walking on between the town and the Old House', () => {
  // Clan Edition: the Market walked twice and owned; the house bought, or not.
  function houseSave(area, { owned = true, points = 0 } = {}) {
    return (p) => {
      p.setTutorialFirst('done');
      p.state.unlocked.areas.push('market', ...(owned ? ['house'] : []));
      p.state.walks.neighborhood = 2;
      p.state.walks.market = 2;
      p.state.points = points;
      p.setArea(area);
      expect(p.state.edition).not.toBe('legacy');
      expect(p.state.area).toBe(area);
    };
  }
  const forward = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) }); // rotation.y 0 faces -z
  // The house walk's first picture: nothing of the house stands between the
  // camera and her (as housegame.test.js's 'opens on her, not the front wall').
  function seenInTheHall(h) {
    const s = h.getSession();
    const view = makeView(s.cat.position, h.camera.position, CAT_LOOK_Y);
    expect(blockers(s.areaData.house.sections, s.areaLife.sink, view)).toEqual([]);
    for (const x of s.areaData.house.sections) {
      const m = s.scene.getObjectByName(`houseWall:${x.id}`);
      if (m) expect(m.scale.y, x.id).toBe(s.areaLife.sink.fraction(x.id));
    }
  }

  it("from the town through the old house's door: the house walk starts in the hall, 3.65 m in from its front door, facing north", async () => {
    const h = walkHarness({ save: houseSave('neighborhood') });
    h.w.startWalk({});
    const town = h.getSession();
    expect(town.areaId).toBe('neighborhood');
    // the old house's front stands in the town, and its door draws no gate of its own
    expect(town.scene.getObjectByName('oldhousefront')).toBeTruthy();
    const signs = town.scene.children.filter((c) => c.name === 'gateway').map((g) => g.userData.endId).sort();
    expect(signs).toEqual(['town-docks', 'town-market', 'town-park', 'town-roofs']);
    expect(await h.w.walkOn({ via: 'town-house' })).toBe('walked');
    expect(h.overlay.innerHTML).toContain('Off to the Old Twoleg Nest!');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('house');
    expect(h.progression.state.area).toBe('house');
    expect(s.arrivedVia).toBe('house-town');
    expect(s.cat.position.x).toBeCloseTo(0, 9);
    expect(s.cat.position.z).toBeCloseTo(7.95, 9);
    expect(s.cat.rotation.y).toBe(0);
    // the hall's door is the opening kind on this walk, shut as she lands
    expect(s.areaData.house.parts.frontDoor).toBeTruthy();
    expect(s.areaLife.frontDoorOpen).toBe(false);
    h.w.endWalk();
  }, WALK_MS);

  it("from the house through the hall's front door: the town walk starts on the lawn, 3.65 m out from the old house's door, facing east", async () => {
    const h = walkHarness({ save: houseSave('house') });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('house');
    expect(await h.w.walkOn({ via: 'town-house' })).toBe('refused'); // the town's door, not this walk's
    expect(await h.w.walkOn({ via: 'house-town' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(s.arrivedVia).toBe('town-house');
    expect(s.cat.position.x).toBeCloseTo(-39.9, 9);
    expect(s.cat.position.z).toBeCloseTo(31, 9);
    expect(s.cat.rotation.y).toBe(-Math.PI / 2);
    h.w.endWalk();
  }, WALK_MS);

  // Review Focus 4: bought at the town's door, straight in, and straight back out.
  it("in through the town's door and out through the hall's: she lands facing in, seen", async () => {
    const h = walkHarness({ save: houseSave('neighborhood', { owned: false, points: 200 }) });
    h.w.startWalk({});
    const town = h.getSession();
    const door = endById('town-house').end;
    // at the door: the gate's buy (the "Get it?" card's yes, game/crossing.js buyYes)
    expect(gatewayNear('neighborhood', door.x + 1, door.z, CATALOG)?.id).toBe('town-house');
    expect(gateStatus(door, h.progression.state, CATALOG)).toMatchObject({ kind: 'buy', to: 'house', price: 150 });
    expect(h.progression.buy('areas', 'house')).toBe(true);
    town.gates.setOpen('town-house', true); // a door drawn by the town: nothing to swing
    expect(h.progression.state.points).toBe(50);
    expect(gateStatus(door, h.progression.state, CATALOG).kind).toBe('go');
    // then the walk-on
    expect(await h.w.walkOn({ via: 'town-house' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const inside = h.getSession();
    expect(inside.areaId).toBe('house');
    expect(inside.cat.position.z).toBeCloseTo(7.95, 9);
    expect(inside.cat.rotation.y).toBe(0);
    // facing in: north, away from the front door behind her
    expect(forward(inside.cat.rotation.y).z).toBeLessThan(-0.99);
    seenInTheHall(h);
    // and the first settled frame keeps it so
    inside.areaLife.update(1 / 60, 1 / 60, inside.cat.position, h.camera);
    seenInTheHall(h);

    // straight back out
    expect(await h.w.walkOn({ via: 'house-town' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const out = h.getSession();
    expect(out.areaId).toBe('neighborhood');
    expect(out.scene.getObjectByName('oldhousefront')).toBeTruthy();
    const cat = out.cat.position;
    expect(cat.x).toBeCloseTo(-39.9, 9);
    expect(cat.z).toBeCloseTo(31, 9);
    // facing away from the front, its door behind her
    const f = forward(out.cat.rotation.y);
    expect(f.x).toBeGreaterThan(0.99);
    const toDoor = { x: OLD_HOUSE_FRONT.door.x - cat.x, z: OLD_HOUSE_FRONT.door.z - cat.z };
    expect(f.x * toDoor.x + f.z * toDoor.z).toBeLessThan(0);
    // the camera hangs behind her, toward the front, and nothing of the front
    // stands between it and her
    expect(h.camera.position.x).toBeLessThan(cat.x);
    const look = new THREE.Vector3(cat.x, cat.y + CAT_LOOK_Y, cat.z);
    const ray = new THREE.Raycaster(h.camera.position.clone(), look.clone().sub(h.camera.position).normalize(), 0, h.camera.position.distanceTo(look));
    const front = out.scene.getObjectByName('oldhousefront');
    front.updateWorldMatrix(true, true);
    expect(ray.intersectObject(front, true)).toEqual([]);
    // and it is not inside the house: from her back to the camera, the
    // front's outside faces are not met either
    const back = new THREE.Raycaster(look.clone(), h.camera.position.clone().sub(look).normalize(), 0, h.camera.position.distanceTo(look));
    expect(back.intersectObject(front, true)).toEqual([]);
    h.w.endWalk();
  }, WALK_MS);

  // W2: the house is Clan Edition only; a Legacy town draws neither its front nor its door.
  it('a Legacy town has no house door', () => {
    const h = walkHarness({ save: (p) => { houseSave('neighborhood')(p); p.setEdition('legacy'); } });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(s.gates).toBe(NO_GATES);
    expect(s.scene.getObjectByName('oldhousefront')).toBeUndefined();
    expect(s.areaData.colliders.filter((c) => Math.hypot(c.x - OLD_HOUSE_FRONT.door.x, c.z - OLD_HOUSE_FRONT.door.z) < 3)).toEqual([]);
    // nothing to ask at (-42.5, 31): main.js's interactions ask at a gate only
    // on a Clan walk; test/interactions.test.js walks her there in both editions
    expect(h.progression.state.edition).toBe('legacy');
    h.w.endWalk();
  }, WALK_MS);
});

// Fix 8: a line on the pause card, for a walk-on that could not go. It is
// drawn only when asked for, so the next time the card is drawn it is gone.
describe("the pause card's line", () => {
  it('draws one escaped line under the title (and the welcome), and none when not asked', () => {
    const plain = pauseCardHtml({ welcome: null, touch: true, mode: 'paused' });
    const noted = pauseCardHtml({ welcome: null, touch: true, mode: 'paused', note: "Pip's <game>" });
    expect(plain).not.toContain('pause-note');
    expect(noted).toContain('<h1>Paused</h1>\n    \n    <p class="pause-note" role="status">Pip&#39;s &lt;game&gt;</p>');
    expect(noted.replace(/\n    <p class="pause-note"[^\n]*<\/p>/, '')).toBe(plain);
    const s = { welcome: 'Hi', started: true, areaId: 'park' };
    expect(pauseCardFor(s, false, null, 'x')).toBe(pauseCardHtml({ welcome: null, touch: false, mode: 'paused', note: 'x' }));
    expect(pauseCardFor(s, false, null)).not.toContain('pause-note');
  });
});

describe('walking on to a place not here yet', () => {
  it('a slow Farm: the moment shows over the paused Park walk, then the Farm walk starts', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, areas: slowFarm(500), onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    const park = h.getSession();
    const going = h.w.walkOn({ via: 'park-farm' });
    // still in the Park walk, live, nothing banked, the moment up over it
    expect(h.getSession()).toBe(park);
    expect(park.walkingOn).toBeTruthy();
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    expect(h.progression.state.walks.park).toBe(2);
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('refused'); // a second tap while it comes
    await vi.advanceTimersByTimeAsync(500);
    expect(await going).toBe('walked');
    // the Farm came: banked and freed, the moment still up
    expect(h.getSession()).toBeNull();
    expect(h.progression.state.walks.park).toBe(3);
    expect(h.overlay.innerHTML).toContain('Off to Appletree Farm!');
    // the moment's 1.2 s are counted from when it first showed
    vi.advanceTimersByTime(GATE_MOMENT_MS - 500 - 1);
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.getSession().areaId).toBe('farm');
    expect(h.getSession().arrivedVia).toBe('farm-park');
    expect(walked).toHaveLength(1);
  }, WALK_MS);

  it('a very slow Farm: once it comes, the Farm walk starts at once', async () => {
    const h = walkHarness({ save: parkSave, areas: slowFarm(5000) });
    h.w.startWalk({});
    const going = h.w.walkOn({ via: 'park-farm' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await going).toBe('walked');
    // The moment has had its time: what is left of it is none. (A timer made
    // inside the fake clock's tick runs no sooner than 1 ms later.)
    expect(h.getSession()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(h.getSession().areaId).toBe('farm');
  }, WALK_MS);

  it('a Farm that does not come: she stays in her Park walk, nothing banked, the pause card and a line', async () => {
    let ended = 0;
    const h = walkHarness({ save: parkSave, areas: failingFarm(), onWalkEnded: () => ended++ });
    h.w.startWalk({});
    const park = h.getSession();
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.getSession()).toBe(park);
    expect(park.walkingOn).toBe(false);
    expect(h.progression.state.walks.park).toBe(2);
    expect(h.progression.state.area).toBe('park');
    expect(ended).toBe(0);
    expect(h.overlay.innerHTML).toContain('btn-resume');
    expect(h.overlay.innerHTML).not.toContain('Off to');
    // Fix 8: the line is on the card itself (a toast sits under the card)
    expect(h.overlay.innerHTML).toBe(pauseCardFor(park, false, pauseSoundOf(SETTINGS), phrase('start.notReady')));
    expect(h.overlay.innerHTML).toContain(`<p class="pause-note" role="status">${escapeHtml(phrase('start.notReady'))}</p>`);
    expect(h.toasts).toEqual([phrase('start.notReady')]);
    expect(h.homeToasts).toEqual([]);
    vi.advanceTimersByTime(GATE_MOMENT_MS * 2);
    expect(h.getSession()).toBe(park);
    // she may try the gate again
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.getSession()).toBe(park);
  }, WALK_MS);

  it('offline, the line says the place needs the internet; the page never reloads', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm(), isOnline: () => false });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.toasts).toEqual([phrase('start.notReadyOffline')]);
    expect(h.overlay.innerHTML).toContain(`<p class="pause-note" role="status">${escapeHtml(phrase('start.notReadyOffline'))}</p>`);
    expect(h.reloads()).toBe(0);
  }, WALK_MS);

  it('an online failure counts: her next Explore for a place not here starts the page fresh', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm() });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.reloads()).toBe(0); // never mid-walk
    h.w.endWalk();
    h.progression.setArea('farm');
    expect(await h.w.startWalkWhenReady({})).toBe('failed');
    expect(h.reloads()).toBe(1);
  }, WALK_MS);

  // Ruling R14: only her own solo walk-on counts (as F6: a start heard from
  // the room never counts).
  it('a guest\'s failed walk-on never counts toward a fresh start', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm() });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm', guest: true })).toBe('failed');
    h.w.endWalk();
    h.progression.setArea('farm');
    expect(await h.w.startWalkWhenReady({})).toBe('failed');
    expect(h.reloads()).toBe(0);
  }, WALK_MS);

  it('a failed walk-on in a room never counts toward a fresh start', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm(), pendingRoom: { net: anything(), roster: [] } });
    h.w.startWalk({ roomSeed: 5 });
    expect(h.getSession().net).toBeTruthy();
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    expect(h.toasts).toEqual([phrase('start.notReady')]);
    h.w.endWalk(); // leaves the room
    h.progression.setArea('farm');
    expect(await h.w.startWalkWhenReady({})).toBe('failed');
    expect(h.reloads()).toBe(0);
  }, WALK_MS);

  it('a place this build does not have never counts toward a fresh start', async () => {
    const h = walkHarness({ save: parkSave, areas: failingFarm('unknown') });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('failed');
    h.w.endWalk();
    h.progression.setArea('farm');
    expect(await h.w.startWalkWhenReady({})).toBe('failed');
    expect(h.reloads()).toBe(0);
  }, WALK_MS);

  it('a walk that ended while the place came is not walked on', async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, areas: slowFarm(500), onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    const going = h.w.walkOn({ via: 'park-farm' });
    h.w.endWalk(); // Head home
    expect(h.progression.state.walks.park).toBe(3);
    await vi.advanceTimersByTimeAsync(500);
    expect(await going).toBe('dropped');
    vi.advanceTimersByTime(GATE_MOMENT_MS * 2);
    expect(h.getSession()).toBeNull();
    expect(h.progression.state.walks.park).toBe(3);
    expect(h.progression.state.area).toBe('park');
    expect(h.overlay.innerHTML).toContain('Home again!');
    expect(walked).toEqual([]);
  }, WALK_MS);
});

// Fix 5: the next walk's build throwing at the end of the moment. "Off to
// ..." must not stay up with no button: she goes home with the gentle
// line, as a start whose place did not come does, or, when a walk got
// half-built, the page starts fresh (as a walk picked up again does).
describe('the next walk cannot be built', () => {
  // A loader whose Farm pack throws when the walk builds from it.
  const brokenFarm = () => ({
    loaded: (id) => (id === 'farm' ? { get life() { throw new Error('a broken Farm'); } } : areas.loaded(id)),
    ensure: (id) => areas.ensure(id),
    prefetch() {},
  });
  function homeScreen() {
    const calls = { show: 0 };
    let hideThrows = false;
    const homebase = anything({
      show: () => { calls.show += 1; },
      hide: () => { if (hideThrows) throw new Error('a broken home screen'); },
    });
    return { homebase, calls, breakHide: () => { hideThrows = true; } };
  }

  it('no walk built: home, with the not-ready line, and it is noted', async () => {
    const home = homeScreen();
    const walked = [];
    const h = walkHarness({ save: parkSave, areas: brokenFarm(), homebase: home.homebase, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('walked');
    expect(() => vi.advanceTimersByTime(GATE_MOMENT_MS)).not.toThrow();
    expect(h.getSession()).toBeNull();
    expect(h.overlay.innerHTML).not.toContain('Off to');
    expect(h.overlay.classList.contains('hidden')).toBe(true);
    expect(home.calls.show).toBe(1);
    expect(h.homeToasts).toEqual([phrase('start.notReady')]);
    expect(h.reloads()).toBe(0);
    expect(diagnostics.entries().map((e) => e.kind)).toContain('walk');
    expect(h.progression.state.walks.park).toBe(3); // the Park walk stays banked
    expect(walked).toEqual([[]]); // the save still goes up
  }, WALK_MS);

  it('a walk half-built: the page starts fresh', async () => {
    const home = homeScreen();
    const h = walkHarness({ save: parkSave, homebase: home.homebase });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('walked');
    home.breakHide();
    expect(() => vi.advanceTimersByTime(GATE_MOMENT_MS)).not.toThrow();
    expect(h.reloads()).toBe(1);
    expect(diagnostics.entries().map((e) => e.kind)).toContain('walk');
  }, WALK_MS);
});

// The lines a walk banks have one source (walk.js bankedLines): the summary
// card wraps them in its HTML, a walk-on hands them to main.js as plain text.
describe('the summary card', () => {
  // A Park walk that is a new best, the day's first (a streak bonus), the walk
  // Mochi followed her home on, with a pinecone in her mouth.
  function bankedWalk(h) {
    h.w.startWalk({});
    const s = h.getSession();
    h.progression.addPoints(40);
    h.progression.setKittenStage(2);
    s.carry.mouth.held = { id: 'park-pinecone-1', kind: 'pinecone' }; // one of the Park's own
  }
  const PAW_HTML = '<span class="paw" aria-hidden="true">🐾</span>';

  it('ends a walk with the new best, the streak, Mochi and what came home, word for word', () => {
    const h = walkHarness({ save: parkSave });
    bankedWalk(h);
    h.w.endWalk();
    const html = h.overlay.innerHTML;
    expect(html).toContain('<h1>Home again!</h1>');
    expect(html).toContain('<div class="record-banner">NEW BEST! 🏆</div>');
    expect(html).toContain(`<div class="best-line">🔥 day 1 streak — +5 bonus ${PAW_HTML}</div>`);
    expect(html).toContain('<div class="best-line">Mochi the kitten followed you home! 🐱</div>');
    expect(html).toContain("<div class=\"best-line\">You brought the pine cone home. It's in the den now.&nbsp;🏠</div>");
  }, WALK_MS);

  const BANKED = [
    'NEW BEST! 🏆',
    '🔥 day 1 streak — +5 bonus 🐾',
    'Mochi the kitten followed you home! 🐱',
    "You brought the pine cone home. It's in the den now.\u00a0🏠",
  ];
  // A touch device that engages the walk as main.js does: startWalk's
  // setTouchEngaged(true) is the first engage, which marks the walk started
  // and toasts its start lines (takeStartLines).
  function touchHarness(opts) {
    const engaged = [];
    let get = () => null;
    const player = anything({
      setTouchEngaged: (on) => {
        const s = get();
        if (on && s && !s.started) { s.started = true; engaged.push(takeStartLines(s)); }
      },
    });
    const h = walkHarness({ ...opts, isTouch: true, player });
    get = h.getSession;
    return { h, engaged };
  }

  it('a walk-on on touch toasts the same lines as text, as the next walk starts', async () => {
    const walked = [];
    const { h } = touchHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    bankedWalk(h);
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().started).toBe(true);
    expect(walked).toEqual([BANKED]);
  }, WALK_MS);

  // Fix 2: on a desktop the next walk waits on its Ready? card, which covers
  // the toasts: the lines wait with its start lines for the first engage.
  it("a walk-on on a desktop keeps the lines for the next walk's first engage", async () => {
    const walked = [];
    const h = walkHarness({ save: parkSave, onWalkedOn: (l) => walked.push(l) });
    bankedWalk(h);
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.started).toBeFalsy();
    expect(h.overlay.innerHTML).toContain('btn-resume'); // the Ready? card
    expect(walked).toEqual([[]]); // nothing toasted under the card (the save still goes up)
    expect(takeStartLines(s)).toEqual(BANKED);
  }, WALK_MS);

  it('a plain walk has none of them', async () => {
    const walked = [];
    const h = walkHarness({ save: (p) => { parkSave(p); p.state.streak = { last: '2026-11-21', count: 1 }; p.state.bestWalk = 9999; }, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    await h.w.walkOn({ via: 'park-farm' });
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(walked).toEqual([[]]);
  }, WALK_MS);
});

// World map step 3, Task 9: a room walks on together. The room is kept (no
// leave), the next walk takes the same net, both devices derive the same
// next seed, and the walk just left hands nothing on.
describe('walking on in a room', () => {
  const profile = (playerId, petName) => ({ playerId, petName, breed: 'tabby', walkOn: 1 });
  // A fake-hub room of two: this device ('me') and Pip, whose net the test holds.
  async function hubRoom() {
    const hub = createFakeHub();
    const net = createNet(hub.transport());
    const partner = createNet(hub.transport());
    await net.join('ROOM', profile('me', 'Mochi'));
    await partner.join('ROOM', profile('pip', 'Pip'));
    const room = { net, roster: [profile('me', 'Mochi'), profile('pip', 'Pip')] };
    return { net, partner, room };
  }
  const state = (o = {}) => ({ v: 1, id: 'pip', pos: [1, 2], yaw: 0, pose: 'idle', speed: 0, ...o });

  it('in a room the room stays: same net, no leave, the next seed derived, old handlers gone', async () => {
    const { net, partner, room } = await hubRoom();
    const heard = [];
    const h = walkHarness({ save: parkSave, pendingRoom: room, applyRemoteEvent: (s, ev) => heard.push([s, ev.type]) });
    h.w.startWalk({ roomSeed: 7 });
    const park = h.getSession();
    expect(park.net).toBe(net);
    const leave = vi.spyOn(net, 'leave');
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('farm');
    expect(leave).not.toHaveBeenCalled();
    expect(h.getRoom()).toBe(room);
    expect(s.net).toBe(room.net);
    expect(s.roomSeed).toBe(nextRoomSeed(7, 'park-farm'));
    // a state from the partner tagged area 'park' draws no cat in the Farm; one tagged 'farm' does
    const pip = s.remotes.list.find((r) => r.playerId === 'pip');
    expect(pip).toBeTruthy();
    expect(pip.group.visible).toBe(false);
    partner.sendState(state({ area: 'park' }));
    expect(pip.group.visible).toBe(false);
    partner.sendState(state({ area: 'farm' }));
    expect(pip.group.visible).toBe(true);
    // an event from the partner reaches the Farm walk's handler only (the Park walk's was taken off)
    partner.sendEvent({ v: 1, id: 'pip', type: 'meow' });
    expect(heard).toEqual([[s, 'meow']]);
    h.w.endWalk();
    expect(leave).toHaveBeenCalledTimes(1);
  }, WALK_MS);

  it('an older build sends no area: its state is drawn wherever she is', async () => {
    const { partner, room } = await hubRoom();
    const h = walkHarness({ save: parkSave, pendingRoom: room });
    h.w.startWalk({ roomSeed: 7 });
    const pip = h.getSession().remotes.list.find((r) => r.playerId === 'pip');
    partner.sendState(state());
    expect(pip.group.visible).toBe(true);
    h.w.endWalk();
  }, WALK_MS);

  it('a guest who does not own the place walks it once and spends nothing', async () => {
    const { room } = await hubRoom();
    const guestSave = (p) => {
      p.setTutorialFirst('done');
      p.state.unlocked.areas.push('park');
      p.state.walks.park = 2;
      p.setArea('park');
      p.addPoints(100);
    };
    const h = walkHarness({ save: guestSave, pendingRoom: room });
    h.w.startWalk({ roomSeed: 7 });
    expect(gateStatus(endById('park-farm').end, h.progression.state, CATALOG).kind).toBe('buy'); // she could open it, so a slip would spend
    expect(await h.w.walkOn({ via: 'park-farm', guest: true })).toBe('walked');
    const banked = h.progression.state.points;
    expect(banked).toBeGreaterThanOrEqual(100);
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('farm');
    expect(s.arrivedVia).toBe('farm-park');
    expect(h.progression.state.area).toBe('park');
    expect(h.progression.state.points).toBe(banked);
    expect(h.progression.state.unlocked.areas).not.toContain('farm');
    h.w.endWalk();
    expect(h.progression.state.unlocked.areas).not.toContain('farm');
  }, WALK_MS);

  // Task 7's review: every handler a walk wires comes off when it ends, a
  // walk-on keeps the room, and only a real ending leaves it.
  it('every handler is taken off on walkOn and on endWalk; only endWalk leaves the room', async () => {
    const made = [];
    const handler = () => { const off = vi.fn(); made.push(off); return off; };
    const leave = vi.fn(() => Promise.resolve());
    const net = anything({ onRoster: handler, onState: handler, onEvent: handler, onChat: handler, leave, isHost: () => true });
    const h = walkHarness({ save: parkSave, pendingRoom: { net, roster: [] } });
    h.w.startWalk({ roomSeed: 7 });
    const park = made.slice();
    expect(park).toHaveLength(4);
    expect(park.every((off) => off.mock.calls.length === 0)).toBe(true);
    expect(await h.w.walkOn({ via: 'park-farm' })).toBe('walked');
    expect(park.map((off) => off.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(leave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().net).toBe(net);
    const farm = made.slice(4);
    expect(farm).toHaveLength(4);
    expect(farm.every((off) => off.mock.calls.length === 0)).toBe(true);
    h.w.endWalk();
    expect(farm.map((off) => off.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(park.map((off) => off.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(leave).toHaveBeenCalledTimes(1);
  }, WALK_MS);
});

// Two whole devices in one fake-hub room, each with its own walk, crossing and
// event routing (netevents.js), as main.js wires them: the host's yes at the
// Park's Farm gate moves both, and both arrive at the twin gate in one walk.
describe('two devices walk on together', () => {
  // olderBuild: a build from before gates (it cannot follow a gate's border-cross).
  function device(pid, room, save, { ensureArea = (id) => areas.ensure(id), olderBuild = false, blockList = new Set() } = {}) {
    const toasts = [];
    let crossing = null;
    const { applyRemoteEvent } = createNetEvents({
      MP: 1, getCloud: () => null, getPsecret: () => null, log: {}, hud: { toast: (t) => toasts.push(t) },
      audio: {}, samples: { has: () => false }, catVoice() {}, applyGoalResult() {},
      onBorderCross: (s, ev) => { if (!olderBuild) crossing.onRemote(s, ev); },
      onWalkOn: (s, ev) => crossing.onRemoteWalkOn(s, ev),
      onWalkOnAsk: (s, ev) => crossing.onWalkOnAsk(s, ev),
      onWalkOnHave: (s, ev) => crossing.onWalkOnHave(s, ev),
    });
    const h = walkHarness({ pid, save, pendingRoom: room, applyRemoteEvent, blockList });
    crossing = createCrossing({
      getSession: h.getSession, overlay: h.overlay, hud: { toast: (t) => toasts.push(t) },
      releaseControl() {}, resumeWalk() {}, endWalk: (o) => h.w.endWalk(o), getIsTouch: () => false,
      getEdition: () => h.progression.state.edition, catalog: CATALOG, setTimeout: globalThis.setTimeout,
      walkOn: (o) => h.w.walkOn(o), progression: h.progression,
      getRoster: () => h.getRoom()?.roster ?? [], getRoomNet: () => h.getRoom()?.net ?? null,
      ensureArea,
    });
    return { h, crossing, toasts };
  }
  async function twoDevices({ guestProfile = { walkOn: 1 }, guestOpts = {}, hostOpts = {} } = {}) {
    const hub = createFakeHub();
    const hostNet = createNet(hub.transport());
    const guestNet = createNet(hub.transport());
    const hostP = { playerId: 'ann', petName: 'Ann', breed: 'tabby', walkOn: 1 };
    const guestP = { playerId: 'bea', petName: 'Bea', breed: 'tabby', ...guestProfile };
    await hostNet.join('ROOM', hostP);
    await guestNet.join('ROOM', guestP);
    const roster = [hostP, guestP];
    const host = device('ann', { net: hostNet, roster }, parkSave, hostOpts);
    const guest = device('bea', { net: guestNet, roster }, parkSave, guestOpts);
    host.h.w.startWalk({ roomSeed: 7 });
    guest.h.w.startWalk({ roomSeed: 7 });
    expect(hostNet.isHost()).toBe(true);
    return { host, guest, hostNet, guestNet };
  }
  const farmGate = (h) => {
    const end = endById('park-farm').end;
    return { end, status: gateStatus(end, h.progression.state, CATALOG) };
  };

  it("the host's yes: both devices fetch the Farm, then both walk on to its Park gate in the next room walk", async () => {
    const { host, guest, hostNet, guestNet } = await twoDevices();
    const sent = [];
    const send = hostNet.sendEvent;
    hostNet.sendEvent = (e) => { sent.push(e.type); send(e); };
    const gSent = [];
    const gSend = guestNet.sendEvent;
    guestNet.sendEvent = (e) => { gSent.push(e.type); gSend(e); };
    host.crossing.askGate(host.h.getSession(), farmGate(host.h));
    host.crossing.confirm();
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS);
    expect(sent).toEqual(['walk-on-ask', 'walk-on', 'walk-on']); // answered before the ask's resend was due
    expect(gSent).toEqual(['walk-on-have']); // it walked on before its resend was due
    expect(guest.toasts).toContain('Ann is leading the way to Appletree Farm! 🧭');
    const a = host.h.getSession();
    const b = guest.h.getSession();
    expect([a.areaId, b.areaId]).toEqual(['farm', 'farm']);
    expect(a.roomSeed).toBe(nextRoomSeed(7, 'park-farm'));
    expect(b.roomSeed).toBe(a.roomSeed);
    expect([a.arrivedVia, b.arrivedVia]).toEqual(['farm-park', 'farm-park']);
    expect([a.net, b.net]).toEqual([hostNet, guestNet]);
    expect([host.h.getRoom(), guest.h.getRoom()].every(Boolean)).toBe(true);
    // the same Farm on both: the shared world is drawn from the one seed
    expect(b.race.rings.map((r) => [r.x, r.z])).toEqual(a.race.rings.map((r) => [r.x, r.z]));
    // and each sees the other: the guest's partner is still in its walk
    expect(b.remotes.list.map((r) => r.playerId)).toEqual(['ann']);
    expect(a.remotes.list.map((r) => r.playerId)).toEqual(['bea']);
    host.h.w.endWalk();
    guest.h.w.endWalk();
  }, WALK_MS);

  // Fix round 1: a device reading a card, or paused, sends no state, and the
  // other drops its cat after 5 s (remotecats.js). Who is in the room, and who
  // hosts it, is the roster, so the room still moves together.
  it('both cats dropped from each other\'s screen after 5 s of quiet: the room still walks on together', async () => {
    const { host, guest } = await twoDevices();
    const a0 = host.h.getSession();
    const b0 = guest.h.getSession();
    host.crossing.askGate(a0, farmGate(host.h)); // the host reads the card
    await vi.advanceTimersByTimeAsync(6000);
    // a frame on each device, 6 s after the last state: each drops the other's cat
    a0.remotes.update(0, nowSec() + 6);
    b0.remotes.update(0, nowSec() + 6);
    expect([a0.remotes.list, b0.remotes.list]).toEqual([[], []]);
    host.crossing.confirm();
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS);
    const a = host.h.getSession();
    const b = guest.h.getSession();
    expect([a.areaId, b.areaId]).toEqual(['farm', 'farm']);
    expect(b.roomSeed).toBe(a.roomSeed);
    expect(guest.toasts).toContain('Ann is leading the way to Appletree Farm! 🧭');
    host.h.w.endWalk();
    guest.h.w.endWalk();
  }, WALK_MS);

  // Ruling R15: both walk-on copies lost; the host's first state from the Farm leads the guest on.
  it('both walk-on copies lost: the host\'s state from the Farm leads the guest on', async () => {
    const { host, guest, hostNet } = await twoDevices();
    const send = hostNet.sendEvent;
    hostNet.sendEvent = (e) => { if (e.type !== 'walk-on') send(e); };
    const b0 = guest.h.getSession();
    host.crossing.askGate(host.h.getSession(), farmGate(host.h));
    host.crossing.confirm();
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS);
    expect(host.h.getSession().areaId).toBe('farm');
    expect(guest.h.getSession()).toBe(b0); // the guest never heard the walk-on
    // the host's walk in the Farm begins: its first state, tagged with its place
    hostNet.sendState({ v: 1, id: 'ann', pos: [-8, 41.4], yaw: 0, pose: 'idle', speed: 0, area: 'farm' });
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS);
    const a = host.h.getSession();
    const b = guest.h.getSession();
    expect(b.areaId).toBe('farm');
    expect(b.roomSeed).toBe(a.roomSeed);
    expect(b.arrivedVia).toBe('farm-park');
    host.h.w.endWalk();
    guest.h.w.endWalk();
  }, WALK_MS);

  // Ruling R17: the host has hidden the guest ("Hide this visitor"). The
  // guest's answer is protocol only, so it still counts: the room walks on,
  // and nothing on the host's screen ever names her.
  it('a host who has hidden the guest: both still walk on, and no line names her', async () => {
    const { host, guest } = await twoDevices({ hostOpts: { blockList: new Set(['bea']) } });
    expect(host.h.getSession().remotes.list).toEqual([]); // she is not drawn
    host.crossing.askGate(host.h.getSession(), farmGate(host.h));
    expect(host.h.overlay.innerHTML).not.toContain('Bea');
    host.crossing.confirm();
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS);
    const a = host.h.getSession();
    const b = guest.h.getSession();
    expect([a.areaId, b.areaId]).toEqual(['farm', 'farm']);
    expect(b.roomSeed).toBe(a.roomSeed);
    expect(a.remotes.list).toEqual([]);
    const seen = [...host.toasts, ...host.h.toasts, host.h.overlay.innerHTML].join(' ');
    expect(seen).not.toContain('Bea');
    host.h.w.endWalk();
    guest.h.w.endWalk();
    expect(host.h.overlay.innerHTML).not.toContain('Bea');
  }, WALK_MS);

  it("a guest whose game cannot have the Farm: nobody moves, the host gets its card back and the friend's line", async () => {
    const { host, guest } = await twoDevices({ guestOpts: { ensureArea: (id) => (id === 'farm' ? Promise.reject(new AreaLoadError('farm', 'failed')) : areas.ensure(id)) } });
    const parkA = host.h.getSession();
    const parkB = guest.h.getSession();
    host.crossing.askGate(parkA, farmGate(host.h));
    host.crossing.confirm();
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS * 2);
    expect(host.h.getSession()).toBe(parkA);
    expect(guest.h.getSession()).toBe(parkB);
    expect(host.h.overlay.innerHTML).toContain('btn-resume');
    expect(host.toasts).toEqual([phrase('gate.friendNotReady', 'Bea')]);
    expect(guest.toasts).toEqual([phrase('start.notReady')]);
    expect([parkA.areaId, parkB.areaId]).toEqual(['park', 'park']);
    host.h.w.endWalk();
    guest.h.w.endWalk();
  }, WALK_MS);

  // Fix round 1 of Task 10: a Legacy guest in a Clan host's room walks the
  // Woods by override (rooms.js). The host's post moves her too: a guest is
  // never turned away for her edition, or the room would split.
  it("a Clan host and a Legacy guest in the Woods: the host's post walks both on to the Moor", async () => {
    const hub = createFakeHub();
    const hostNet = createNet(hub.transport());
    const guestNet = createNet(hub.transport());
    const hostP = { playerId: 'ann', petName: 'Ann', breed: 'tabby', walkOn: 1 };
    const guestP = { playerId: 'bea', petName: 'Bea', breed: 'tabby', walkOn: 1 };
    await hostNet.join('ROOM', hostP);
    await guestNet.join('ROOM', guestP);
    const roster = [hostP, guestP];
    const clanWoods = (p) => {
      p.setTutorialFirst('done');
      p.state.unlocked.areas.push('woods', 'moor');
      p.state.walks.neighborhood = 2;
      p.state.walks.woods = 2;
      p.setArea('woods');
    };
    const legacyTown = (p) => { p.setTutorialFirst('done'); p.setEdition('legacy'); };
    const host = device('ann', { net: hostNet, roster }, clanWoods);
    const guest = device('bea', { net: guestNet, roster }, legacyTown);
    expect(guest.h.progression.state.edition).toBe('legacy');
    host.h.w.startWalk({ roomSeed: 7 });
    guest.h.w.startWalk({ roomSeed: 7, areaOverride: 'woods' }); // as rooms.js starts a place she does not have
    expect([host.h.getSession().areaId, guest.h.getSession().areaId]).toEqual(['woods', 'woods']);
    const gSent = [];
    const gSend = guestNet.sendEvent;
    guestNet.sendEvent = (e) => { gSent.push(e); gSend(e); };
    const post = postsFor('woods').find((p) => p.id === 'woods-moor-path');
    host.crossing.ask(host.h.getSession(), { post, status: postStatus(post, host.h.progression.state, CATALOG, 'woods') });
    host.crossing.confirm();
    await vi.advanceTimersByTimeAsync(GATE_MOMENT_MS);
    expect(gSent.filter((e) => e.type === 'walk-on-have')[0]).toMatchObject({ via: 'woods-moor-path', ok: true });
    const a = host.h.getSession();
    const b = guest.h.getSession();
    expect([a.areaId, b.areaId]).toEqual(['moor', 'moor']);
    expect(b.roomSeed).toBe(a.roomSeed);
    expect([a.arrivedVia, b.arrivedVia]).toEqual(['moor-woods-path', 'moor-woods-path']);
    expect(guest.toasts).toContain('Ann is leading the way to the Moor! 🧭');
    // nothing was taken or bought for the Legacy guest
    expect(guest.h.progression.state.unlocked.areas).not.toContain('moor');
    expect(guest.h.progression.state.edition).toBe('legacy');
    host.h.w.endWalk();
    guest.h.w.endWalk();
  }, WALK_MS);

  it('a room with an older build: the host crosses as at a border post and its walk ends; the older guest walks on alone', async () => {
    const { host, guest } = await twoDevices({ guestProfile: { walkOn: undefined }, guestOpts: { olderBuild: true } });
    const parkB = guest.h.getSession();
    host.crossing.askGate(host.h.getSession(), farmGate(host.h));
    host.crossing.confirm();
    expect(host.h.overlay.innerHTML).toContain('Off we go!');
    await vi.advanceTimersByTimeAsync(5000);
    expect(host.h.getSession()).toBeNull();
    expect(host.h.overlay.innerHTML).toContain('Home again!');
    expect(host.h.getRoom()).toBeNull(); // the host left the room
    // the older guest is still walking in the Park, alone, still in the room
    expect(guest.h.getSession()).toBe(parkB);
    expect(parkB.areaId).toBe('park');
    expect(parkB.remotes.list).toEqual([]);
    expect(guest.h.getRoom()).toBeTruthy();
    guest.h.w.endWalk();
  }, WALK_MS);
});

// Task 10: a border post walks straight on, as a gate does: the "Off to ..."
// moment, then the next walk just inside the post the place beyond has back,
// or at its spawn when it has none.
describe('walking on through a border post', () => {
  // Clan Edition, the guided walk done, the Woods and the Moor hers.
  function wildSave(area) {
    return (p) => {
      p.setTutorialFirst('done');
      p.state.unlocked.areas.push('woods', 'moor');
      p.state.walks.neighborhood = 2;
      p.state.walks.woods = 2;
      p.setArea(area);
      expect(p.state.edition).not.toBe('legacy');
      expect(p.state.area).toBe(area);
    };
  }

  it('from the Woods through woods-moor-path: the moment, then the Moor walk just inside its post, facing in', async () => {
    const walked = [];
    const h = walkHarness({ save: wildSave('woods'), onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('woods');
    expect(await h.w.walkOn({ via: 'moor-woods-path' })).toBe('refused'); // the Moor's post, not this walk's
    expect(h.getSession().areaId).toBe('woods');
    expect(await h.w.walkOn({ via: 'woods-moor-path' })).toBe('walked');
    expect(h.getSession()).toBeNull();
    expect(h.overlay.innerHTML).toContain('Off to the Moor!');
    expect(h.progression.state.walks.woods).toBe(3);
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('moor');
    expect(h.progression.state.area).toBe('moor');
    // ARRIVE_IN (3.6 m) inside moor-woods-path at (43.4, 47.5), facing north
    expect(s.cat.position.x).toBeCloseTo(43.4, 9);
    expect(s.cat.position.z).toBeCloseTo(43.9, 9);
    expect(s.cat.rotation.y).toBe(0);
    expect(s.arrivedVia).toBe('moor-woods-path');
    expect(walked).toHaveLength(1);
    expect(h.overlay.innerHTML).toContain('btn-resume');
    expect(h.overlay.innerHTML).not.toContain('Home again!');
  }, WALK_MS);

  it('from the town through town-moor, which has no post back: the Moor walk starts at its spawn', async () => {
    const h = walkHarness({ save: wildSave('neighborhood') });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('neighborhood');
    expect(await h.w.walkOn({ via: 'town-moor' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('moor');
    expect(s.cat.position.x).toBeCloseTo(MOOR_SPAWN.x, 9);
    expect(s.cat.position.z).toBeCloseTo(MOOR_SPAWN.z, 9);
    expect(s.arrivedVia).toBeNull();
  }, WALK_MS);

  it('Legacy Edition has no posts to walk on through', async () => {
    const h = walkHarness({ save: (p) => { wildSave('neighborhood')(p); p.setEdition('legacy'); } });
    h.w.startWalk({});
    const s = h.getSession();
    expect(s.areaId).toBe('neighborhood');
    expect(await h.w.walkOn({ via: 'town-woods' })).toBe('refused');
    expect(h.getSession()).toBe(s);
    expect(h.progression.state.walks.neighborhood).toBe(2);
  }, WALK_MS);

  // The first walk on home land leads to the camp: walked on into it, the
  // lesson's way and heading start where she arrives, and its heading wins
  // over the post's.
  it('the first camp walk, walked on into: the way and the heading start at the arrival', async () => {
    const h = walkHarness({ save: (p) => { wildSave('moor')(p); expect(p.setClanPick('woods')).toBe(true); } });
    h.w.startWalk({});
    expect(h.getSession().areaId).toBe('moor');
    expect(h.getSession().lesson).toBeNull(); // the Moor is not her home
    expect(await h.w.walkOn({ via: 'moor-woods-path' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    const s = h.getSession();
    expect(s.areaId).toBe('woods');
    expect(s.lesson?.kind).toBe('camp');
    // just inside woods-moor-path at (43.4, -47.5), far from the spawn
    const arrive = { x: 43.4, z: -43.9 };
    expect(s.cat.position.x).toBeCloseTo(arrive.x, 9);
    expect(s.cat.position.z).toBeCloseTo(arrive.z, 9);
    const camp = { x: DISCS.woods.cx, z: DISCS.woods.cz };
    const heading = headingToward(arrive, camp);
    expect(s.lesson.heading).toBeCloseTo(heading, 9);
    expect(s.cat.rotation.y).toBeCloseTo(heading, 9); // not the post's yaw (Math.PI)
    expect(Math.abs(heading - Math.PI)).toBeGreaterThan(0.5);
    expect(Math.abs(heading - headingToward(WOODS_SPAWN, camp))).toBeGreaterThan(0.5);
    // the cat who leads waits on the way from the arrival, not from the spawn
    expect(s.lesson.cat).toBeTruthy();
    const at = s.lesson.cat.group.position;
    expect(Math.hypot(at.x - arrive.x, at.z - arrive.z)).toBeLessThan(Math.hypot(at.x - WOODS_SPAWN.x, at.z - WOODS_SPAWN.z));
  }, WALK_MS);
});
