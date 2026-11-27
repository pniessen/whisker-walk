import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const H = await import('../src/world/houseplan.js');
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
const { build } = await import('../src/world/house.js');
const { createLevelDrawing } = await import('../src/houselevels.js');

// The house engine takes its plan as an argument (private-edition milestone 0). The default is the
// Old House; a tiny made-up plan (three levels, two stairs sharing one landing room) builds too.
const freeze = Object.freeze;
const FAKE = freeze({
  id: 'fake',
  levels: freeze([{ id: 'low', y: 0 }, { id: 'mid', y: 2.4 }, { id: 'top', y: 4.8 }]),
  rooms: freeze([
    { id: 'a', level: 'low', minX: -6, maxX: 6, minZ: 0, maxZ: 8 },
    { id: 'b', level: 'mid', minX: -6, maxX: 6, minZ: -22, maxZ: -12 },
    { id: 'c', level: 'top', minX: -6, maxX: 6, minZ: -42, maxZ: -32 },
  ]),
  stairs: freeze([
    { id: 's1', from: 'low', to: 'mid', x0: 0, z0: 0, x1: 0, z1: -12, width: 2.4 },
    { id: 's2', from: 'mid', to: 'top', x0: 0, z0: -22, x1: 0, z1: -32, width: 2.4 },
  ]),
  doorways: freeze([]),
  windows: freeze([]),
  bounds: freeze({ minX: -12, maxX: 12, minZ: -46, maxZ: 12 }),
  frontDoor: freeze({ x: 0, z: 8, faces: 'south', arrive: freeze({ x: 0, z: 5, yaw: 0 }) }),
  start: 'low',
});

describe('the engine takes its plan as an argument', () => {
  it('the Old House is the default plan and its helpers are unchanged by passing it', () => {
    expect(H.OLD_HOUSE_PLAN.rooms).toBe(H.HOUSE_ROOMS);
    expect(H.OLD_HOUSE_PLAN.stairs).toBe(H.HOUSE_STAIRS);
    expect(H.houseSections(H.OLD_HOUSE_PLAN)).toBe(H.houseSections());
    expect(H.houseColliders(H.OLD_HOUSE_PLAN)).toEqual(H.houseColliders());
    expect(H.houseArea(H.OLD_HOUSE_PLAN).sections).toBe(H.houseArea().sections);
  });

  it('a plan with no secret, no furniture and no lamps has plain walls, colliders and ground', () => {
    const secs = H.houseSections(FAKE);
    expect(secs.length).toBeGreaterThan(0);
    expect(secs.every((s) => !s.owner.startsWith('hall') && !s.owner.startsWith('library'))).toBe(true);
    expect(secs.some((s) => s.kind === 'lintel' && s.owner === 'a')).toBe(false);
    const cols = H.houseColliders(FAKE);
    expect(cols.length).toBeGreaterThan(0);
    expect(cols.every((c) => !c.secret && !c.guard)).toBe(true);
    const area = H.houseArea(FAKE);
    expect(area.bounds).toEqual(FAKE.bounds);
    expect(area.levels).toBe(FAKE.levels);
    expect(area.rooms).toBe(FAKE.rooms);
  });

  it('two stairs sharing one landing walk a cat from the lowest to the highest level', () => {
    const { ground } = H.houseArea(FAKE);
    expect(ground.y(0, 4)).toBeCloseTo(0, 5);
    expect(ground.y(0, -17)).toBeCloseTo(2.4, 5);
    expect(ground.y(0, -37)).toBeCloseTo(4.8, 5);
    let z = 4;
    let y = ground.y(0, z);
    let guard = 0;
    while (z > -37 && guard++ < 2000) {
      const nz = z - 0.1;
      expect(ground.canStep(0, z, 0, nz)).toBeTruthy();
      z = nz;
      y = ground.y(0, z);
    }
    expect(z).toBeLessThanOrEqual(-37);
    expect(y).toBeCloseTo(4.8, 1);
  });

  it('build(scene, { plan }) builds the made-up plan and leaves the Old House for the default', () => {
    const scene = new THREE.Scene();
    const area = build(scene, { plan: FAKE });
    expect(area.bounds).toEqual(FAKE.bounds);
    expect(area.spawn).toEqual({ x: 0, z: 5 });
    expect(area.house.levels).toBe(FAKE.levels);
    expect(area.house.start).toBe('low');
    const walls = scene.children.filter((c) => c.userData.houseWalls);
    expect(walls.map((g) => g.userData.houseWalls).sort()).toEqual(['low', 'mid', 'top']);
    // nothing of the Old House is in it: no furniture, no lamps, no secret bookcase, no cellar lid, no hedge
    const names = [];
    scene.traverse((o) => names.push(o.name));
    expect(names.some((n) => /houseLamp|houseHedge|houseNeighbour|houseTree|cellarLid|secret/i.test(n))).toBe(false);
    scene.traverse((o) => { if (/^houseFurniture/.test(o.name)) expect(o.children.length).toBe(0); });
    expect(area.house.secret).toBeNull();
    expect(area.house.lid).toBeNull();
    expect(area.critterSpawns).toEqual([]);
    expect(area.scenics).toEqual([]);
    expect(area.house.finds).toEqual([]);
    // the level drawing runs on it
    const drawing = createLevelDrawing(scene, { levels: area.house.levels, links: area.house.links, start: area.house.start });
    expect(drawing).toBeTruthy();

    // its life runs: the walls sink, the levels are drawn, nothing reads an Old House row
    const life = area.life({ scene, reducedMotion: true, log: () => {}, audio: null, toy: null, dusk: false });
    expect(life).toBeTruthy();

    const old = build(new THREE.Scene());
    expect(old.bounds).toEqual(H.HOUSE_BOUNDS);
    expect(old.house.finds.length).toBeGreaterThan(0);
  });
});
