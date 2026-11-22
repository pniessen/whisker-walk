import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The Old House step 4, Task 4 (plan ruling W5): the old house's front in the
// town, against the west hedge, drawn only when a walk hands the Neighborhood
// the `town-house` gate end. Tested through build() only (the controller's
// P-3): the walk hands that end in Task 5.

// The same headless canvas stub every world test uses (test/flattrace.test.js).
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
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build, SPAWN } = await import('../src/world/neighborhood.js');
const { OLD_HOUSE_FRONT, buildOldHouseFront } = await import('../src/world/oldhousefront.js');
const { house } = await import('../src/world/builder.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { postsFor, TOWN_FOOTPATH, FOOTPATH_W } = await import('../src/borderposts.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { addBorderDressing } = await import('../src/world/borderpost.js');
const { addGatewayDressing } = await import('../src/world/gateway.js');
const { endsFor } = await import('../src/gateways.js');
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
    expect(frontOf(built({ gateEnds: endsFor('neighborhood') }).scene)).toBeUndefined();

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
    expect(colliders.length).toBeGreaterThan(20);
    for (const c of colliders) {
      expect(c.r).toBeLessThanOrEqual(0.7);
      expect(c.r).toBeGreaterThan(0);
      // round the footprint: on it, inside it, or a hand's width past its back (the hedge side)
      expect(toRect(c.x, c.z)).toBeLessThanOrEqual(0.3);
      // none in front of the door
      expect(Math.hypot(c.x - (F.door.x + 0.45), c.z - F.door.z)).toBeGreaterThanOrEqual(1.2);
    }
    // a closed ring, each circle at most 1.0 m from the next
    for (let i = 0; i < colliders.length; i++) {
      const a = colliders[i], b = colliders[(i + 1) % colliders.length];
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${i}`).toBeLessThanOrEqual(1.0);
    }
    // nobody walks into it: no spot 1 m inside the footprint is reachable from the lawn
    const area = built({ gateEnds: [END] }).area;
    const flood = floodFrom(area, SPAWN, (x, z) => isWalkableAt(area, x, z));
    for (let x = F.x0 + 1; x <= F.x1 - 1; x += 0.5) {
      for (let z = F.z0 + 1; z <= F.z1 - 1; z += 0.5) expect(flood.reaches(x, z), `${x},${z}`).toBe(false);
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

  it('it is cheap', () => {
    const { scene } = built({ gateEnds: [END] });
    mergeStaticProps(scene);
    const own = budgetOf([frontOf(scene)], rig);
    expect(own.meshes).toBeLessThanOrEqual(6);
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
