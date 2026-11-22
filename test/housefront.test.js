import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The Old House step 4, Task 4 (plan ruling W5): the old house's front in the
// town, against the west hedge, drawn only when a walk hands the Neighborhood
// the `town-house` gate end. Tested through build() only (the controller's
// P-3): the walk hands that end in Task 5.

// The same headless canvas stub every world test uses (test/flattrace.test.js);
// createPlayer listens on it too (the camera test below).
vi.stubGlobal('document', canvasStub);

const { build, SPAWN } = await import('../src/world/neighborhood.js');
const { OLD_HOUSE_FRONT, buildOldHouseFront } = await import('../src/world/oldhousefront.js');
const { house } = await import('../src/world/builder.js');
const { isWalkableAt, createPlayer } = await import('../src/player.js');
const { BIG_COLLIDER_R, ZOOM_STEPS } = await import('../src/camzoom.js');
const { cameraOffset } = await import('../src/catcam.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { postsFor, TOWN_FOOTPATH, FOOTPATH_W } = await import('../src/borderposts.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { addBorderDressing } = await import('../src/world/borderpost.js');
const { addGatewayDressing } = await import('../src/world/gateway.js');
const { endsFor, endById } = await import('../src/gateways.js');
const { applyDusk } = await import('../src/render/dusk.js');
const { budgetOf } = await import('./helpers/growriver.js');
const rig = await import('../src/render/rig.js');

const END = { id: 'town-house', to: 'house' };
const F = OLD_HOUSE_FRONT;
const NAME = 'oldhousefront';

const built = (opts) => {
  const scene = new THREE.Scene();
  const area = opts === undefined ? build(scene) : build(scene, opts);
  return { scene, area };
};
// The records a walk reads off the town, all but the scene.
const records = (a) => ({
  colliders: a.colliders, perches: a.perches, pois: a.pois, collectibles: a.collectibles, scenics: a.scenics,
});
// Distance from (x, z) to the footprint's rectangle (0 inside it).
const toRect = (x, z) => Math.hypot(Math.max(F.x0 - x, 0, x - F.x1), Math.max(F.z0 - z, 0, z - F.z1));
const frontOf = (scene) => scene.getObjectByName(NAME);

describe('the old house front', () => {
  it('the town draws the old house\'s front only for a walk that has its door', () => {
    const bare = built();
    const none = built({ gateEnds: [] });
    expect(frontOf(bare.scene)).toBeUndefined();
    expect(frontOf(none.scene)).toBeUndefined();
    expect(records(none.area)).toEqual(records(bare.area));
    // another end (a signpost) does not bring it either
    expect(frontOf(built({ gateEnds: endsFor('neighborhood').filter((e) => e.id !== 'town-house') }).scene)).toBeUndefined();

    const withDoor = built({ gateEnds: [END] });
    const front = frontOf(withDoor.scene);
    expect(front).toBeDefined();
    expect(front.parent).toBe(withDoor.scene);
    const own = buildOldHouseFront(new THREE.Scene()).colliders;
    expect(withDoor.area.colliders).toEqual([...bare.area.colliders, ...own]);
    // the rest of the town is as it was
    const { colliders: _c, ...rest } = records(withDoor.area);
    const { colliders: _b, ...bareRest } = records(bare.area);
    expect(rest).toEqual(bareRest);
  });

  it('its door is where the town end will stand, and its colliders ring it, clear of the door', () => {
    expect(Object.isFrozen(F)).toBe(true);
    expect(Object.isFrozen(F.door)).toBe(true);
    expect(F).toEqual({ x0: -54, x1: -44, z0: 24, z1: 38, door: { x: -44, z: 31 } });
    const { group, colliders } = buildOldHouseFront(new THREE.Scene());
    expect(group.name).toBe(NAME);
    // two named groups and nothing else: the ring of small posts that keeps her
    // out, and the big camera backstops inside it (P-11)
    const ring = colliders.filter((c) => c.r <= 0.7);
    const stops = colliders.filter((c) => c.r >= BIG_COLLIDER_R);
    expect(ring.length + stops.length).toBe(colliders.length);
    expect(colliders.slice(0, ring.length)).toEqual(ring); // the ring first, in its order
    expect(ring.length).toBeGreaterThan(20);
    const endEdge = (c) => Math.hypot(c.x - (F.door.x + 0.45), c.z - F.door.z) - c.r;
    for (const c of ring) {
      expect(c.r).toBeGreaterThan(0);
      // round the footprint: on it, inside it, or a hand's width past its back (the hedge side)
      expect(toRect(c.x, c.z)).toBeLessThanOrEqual(0.3);
      // none in front of the door
      expect(Math.hypot(c.x - (F.door.x + 0.45), c.z - F.door.z)).toBeGreaterThanOrEqual(1.2);
    }
    // a closed ring, each circle at most 1.0 m from the next
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${i}`).toBeLessThanOrEqual(1.0);
    }
    // The backstops: few, big enough for the camera's pull, and wholly inside
    // the ring's reach (every point of each is inside the ring or under one of
    // its posts), so they block no ground the ring left open; no nearer the
    // door's end than the ring's own posts.
    expect(stops.length).toBeGreaterThanOrEqual(1);
    expect(stops.length).toBeLessThanOrEqual(12);
    const inRing = (x, z) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
      }
      return inside || ring.some((c) => Math.hypot(x - c.x, z - c.z) <= c.r + 1e-9);
    };
    const ringEnd = Math.min(...ring.map(endEdge));
    for (const c of stops) {
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * 2 * Math.PI;
        expect(inRing(c.x + c.r * Math.cos(a), c.z + c.r * Math.sin(a)), `${c.x},${c.z} at ${i / 2}°`).toBe(true);
      }
      expect(endEdge(c)).toBeGreaterThanOrEqual(ringEnd);
    }
    // nobody walks into it: no spot 1 m inside the footprint is reachable from the lawn
    const area = built({ gateEnds: [END] }).area;
    const flood = floodFrom(area, SPAWN, (x, z) => isWalkableAt(area, x, z));
    for (let x = F.x0 + 1; x <= F.x1 - 1; x += 0.5) {
      for (let z = F.z0 + 1; z <= F.z1 - 1; z += 0.5) expect(flood.reaches(x, z), `${x},${z}`).toBe(false);
    }
    // and the backstops take no ground: without them the flood reaches no more
    const ringOnly = { ...area, colliders: area.colliders.filter((c) => !(c.r >= BIG_COLLIDER_R && toRect(c.x, c.z) === 0)) };
    expect(ringOnly.colliders.length).toBe(area.colliders.length - stops.length);
    const open = floodFrom(ringOnly, SPAWN, (x, z) => isWalkableAt(ringOnly, x, z));
    for (let x = F.x0 - 2; x <= F.x1 + 8; x += 0.5) {
      for (let z = F.z0 - 6; z <= F.z1 + 6; z += 0.5) expect(flood.reaches(x, z), `${x},${z}`).toBe(open.reaches(x, z));
    }
  });

  it('it stands against the west hedge, clear of everything the town puts there', () => {
    const bare = built().area;
    const { area } = built({ gateEnds: [END] });
    const b = area.bounds;
    expect(F.x0).toBeGreaterThanOrEqual(b.minX);
    expect(F.x1).toBeLessThanOrEqual(b.maxX);
    expect(F.z0).toBeGreaterThanOrEqual(b.minZ);
    expect(F.z1).toBeLessThanOrEqual(b.maxZ);
    // it stands against the west edge, its front facing east onto the lawn
    expect(F.x0 - b.minX).toBeLessThanOrEqual(1.5);
    expect(F.door.x).toBe(F.x1);

    const things = [
      ...area.pois.map((p) => ['poi', p]), ...area.collectibles.map((p) => ['collectible', p]),
      ...area.scenics.map((p) => ['scenic', p]), ...area.perches.map((p) => ['perch', p]),
      ...area.boxes.map((p) => ['box', p]), ...area.tippables.map((p) => ['tippable', p]),
      ...area.critterSpawns.flatMap((p) => [['critter', p], ...(p.x2 !== undefined ? [['critter end', { x: p.x2, z: p.z2 }]] : [])]),
      ...area.moments.flatMap((m) => [['moment', m], ['moment from', m.from]]),
      ...area.puddles.map((p) => ['puddle', p]),
      ...GOLD_MICE.neighborhood.map((p) => ['golden mouse', p]),
      ...spotsIn('neighborhood').map((p) => ['find', p]),
      ...postsFor('neighborhood').map((p) => ['border post', p]),
      ['spawn', SPAWN],
    ];
    for (const [kind, p] of things) expect(toRect(p.x, p.z), `${kind} ${p.x},${p.z}`).toBeGreaterThanOrEqual(3);
    // every collider the town had is 1.2 m clear of it
    for (const c of bare.colliders) expect(toRect(c.x, c.z) - c.r, `${c.x},${c.z}`).toBeGreaterThanOrEqual(1.2);
    // and the footpath to the river's post (Clan dressing) passes south of it
    for (const [, z1, , z2] of TOWN_FOOTPATH) {
      expect(Math.min(z1, z2) - FOOTPATH_W / 2 - F.z1).toBeGreaterThanOrEqual(1.5);
    }

    // the flood from the spawn still reaches everything it reached before
    const walk = (a) => floodFrom(a, SPAWN, (x, z) => isWalkableAt(a, x, z));
    const before = walk(bare), after = walk(area);
    const targets = [
      ...spotsIn('neighborhood'), ...area.pois, ...area.collectibles, ...GOLD_MICE.neighborhood,
    ];
    let reached = 0;
    for (const t of targets) {
      if (!before.reachesWithin(t.x, t.z, 1.5)) continue;
      reached++;
      expect(after.reachesWithin(t.x, t.z, 1.5), `${t.x},${t.z}`).toBe(true);
    }
    expect(reached).toBeGreaterThan(20);
    // the lawn before its door is open, and on the flood
    expect(isWalkableAt(area, F.door.x + 1.2, F.door.z)).toBe(true);
    expect(after.reaches(F.door.x + 1.2, F.door.z)).toBe(true);
    // (and where Task 5's end and arrival will be)
    expect(after.reaches(-39.9, 31)).toBe(true);
  });

  // P-11: at Middle or Far zoom the camera went inside the front (milky glass
  // and frame lines over the whole screen), worst when she came out of the
  // hall's door onto the lawn. The real player, the town as a walk with the
  // door builds it, and the camera straight back at the front from the lawn
  // before each of its three faces she can walk to (the west one is the hedge).
  it('at Middle and Far zoom the camera stays out of the front', () => {
    const { area } = built({ gateEnds: [END] });
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, { addEventListener() {} });
    const cat = new THREE.Object3D();
    player.setAvatar(cat, 3);
    player.setReducedMotion(true); // the camera goes straight to where it settles
    player.enable();
    const cameraAt = (x, z, yaw, step) => {
      cat.position.set(x, 0, z);
      player.setViewYaw(yaw);
      player.setCameraZoom(step, { instant: true });
      player.update(1 / 60, area.colliders, area.bounds);
      expect(cat.position.x).toBeCloseTo(x, 6); // she stood where she was put
      expect(cat.position.z).toBeCloseTo(z, 6);
      return { x: camera.position.x, z: camera.position.z };
    };
    // The front's walls as it lays them out: the body (z 24.1..37.9, its front
    // wall at x -45.5) and the middle bay with the door, 0.5 m prouder. East of
    // them, to the footprint's x1, is the lawn strip with the steps and pots.
    const WALLS = [{ x0: -53.8, x1: -45.5, z0: 24.1, z1: 37.9 }, { x0: -45.5, x1: -45.0, z0: 28.4, z1: 33.6 }];
    const depth = (p) => Math.max(0, ...WALLS.map((w) => Math.min(p.x - w.x0, w.x1 - p.x, p.z - w.z0, w.z1 - p.z)));
    // [x, z, yaw, true when she stands before a face's middle (1 m or more from a corner)]
    const approaches = [];
    for (let z = 23.5; z <= 38.5; z += 0.25) approaches.push([-39.9, z, -Math.PI / 2, z >= 25 && z <= 37]); // east, the arrival's line
    for (let x = -54.5; x <= -45; x += 0.25) {
      const mid = x >= -53.5 && x <= -46.5;
      approaches.push([x, 19.5, 0, mid], [x, 42.5, Math.PI, mid]); // north and south
    }
    let worstMid = 0, worstCorner = 0;
    for (const [x, z, yaw, mid] of approaches) {
      expect(isWalkableAt(area, x, z), `${x},${z}`).toBe(true);
      for (const step of [2, 3]) {
        const d = depth(cameraAt(x, z, yaw, step));
        if (mid) worstMid = Math.max(worstMid, d);
        else worstCorner = Math.max(worstCorner, d);
      }
    }
    // Before a face the camera stays on the lawn: at worst on the wall's own
    // plane, in a scallop of the ring it may not go past. At a corner a big
    // circle cannot reach into the ring's rounded end, so a camera ray that
    // grazes the corner may end up to 0.45 m inside it.
    if (process.env.BUDGET_LOG) console.log('front camera', worstMid.toFixed(3), worstCorner.toFixed(3));
    expect(worstMid).toBeLessThanOrEqual(0.02);
    expect(worstCorner).toBeLessThanOrEqual(0.45);

    // At the arrival spot, facing east as she comes out of the hall: Middle and
    // Far hold the camera where Close puts it (the pull never comes nearer than
    // Close), over the steps and in front of the bay's wall.
    const { arrive } = endById('town-house').end;
    expect(arrive).toEqual({ x: -39.9, z: 31, yaw: -Math.PI / 2 });
    const close = cameraAt(arrive.x, arrive.z, arrive.yaw, 1);
    expect(close.x).toBeCloseTo(arrive.x + cameraOffset(arrive.yaw, 0.18, ZOOM_STEPS[1].dist, ZOOM_STEPS[1].height).x, 6);
    for (const step of [2, 3]) {
      const cam = cameraAt(arrive.x, arrive.z, arrive.yaw, step);
      expect(cam.x, `step ${step}`).toBeCloseTo(close.x, 3);
      expect(cam.z, `step ${step}`).toBeCloseTo(arrive.z, 6);
      expect(depth(cam)).toBe(0);
    }
  });

  it('it is cheap', () => {
    const { scene } = built({ gateEnds: [END] });
    mergeStaticProps(scene);
    const own = budgetOf([frontOf(scene)], rig);
    expect(own.meshes).toBeLessThanOrEqual(6);
    // one body and its glass (P-8): the merge never joins two top-level
    // children, so these two are all the front adds to the town's merged count
    expect(frontOf(scene).children.map((m) => m.name)).toEqual(['oldHouseBody', 'oldHouseGlass']);
    expect(own.meshes).toBe(2);
    expect(own.casters).toBeLessThanOrEqual(4);
    expect(own.triangles).toBeLessThanOrEqual(2500);
    if (process.env.BUDGET_LOG) console.log('front', JSON.stringify(own));

    // the town as a Clan walk draws it, with its gates and the door's end
    const town = new THREE.Scene();
    build(town, { gateEnds: [...endsFor('neighborhood'), END] });
    addBorderDressing(town, 'neighborhood');
    addGatewayDressing(town, 'neighborhood');
    const whole = budgetOf(town.children, rig);
    if (process.env.BUDGET_LOG) console.log('town', JSON.stringify(whole));
    expect(whole.meshes).toBeLessThanOrEqual(450);
    expect(whole.casters).toBeLessThanOrEqual(380);
    expect(whole.triangles).toBeLessThanOrEqual(70000);
  });

  it('its windows glow at dusk like the town\'s houses', () => {
    const { scene, area } = built({ gateEnds: [END] });
    const lot = house(0, 0, 0xe8d8b0, 0xb05a4a, 'siding', { roof: 'pyramid' });
    scene.add(lot);
    const panes = [];
    frontOf(scene).traverse((o) => { if (o.isMesh && o.userData.window) panes.push(o); });
    expect(panes.length).toBeGreaterThanOrEqual(1);
    applyDusk({ scene, sun: new THREE.DirectionalLight(), fill: new THREE.HemisphereLight(), areaData: area });
    let lotPane = null;
    lot.traverse((o) => { if (o.isMesh && o.userData.window) lotPane = o; });
    for (const p of panes) {
      expect(p.material.color.getHex()).toBe(lotPane.material.color.getHex());
      expect(p.material.emissive.getHex()).toBe(lotPane.material.emissive.getHex());
      expect(p.material.emissive.getHex()).not.toBe(0);
    }
  });

  it('it draws on no random stream', () => {
    const scene = new THREE.Scene();
    const spy = vi.spyOn(Math, 'random');
    try {
      buildOldHouseFront(scene);
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
  });
});
