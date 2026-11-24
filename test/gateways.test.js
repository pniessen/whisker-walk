import { describe, it, expect } from 'vitest';
import {
  GATE_REACH, GATE_HALF, GATE_POST_R, ARRIVE_IN, GATE_LOOKS, PLACEMENTS, INWARD_YAW,
  GATEWAY_ENDS, gatewayEnd, endsFor, endById, liveEndsFor, gatewayNear, arrivalFor,
  GATE_FENCE_GAP, cutForGates, LANE_LOOKS,
} from '../src/gateways.js';
import { GATEWAYS } from '../src/worldmap.js';
import { CATALOG } from '../src/progression.js';

function deepFrozen(o) {
  if (o === null || typeof o !== 'object') return true;
  return Object.isFrozen(o) && Object.values(o).every(deepFrozen);
}

// area, id, gateway, x, z, faces, to, twin, look, lane (null where the plan has a dash)
const TABLE = [
  ['neighborhood', 'town-park', 'town-park', 52, 0, 'east', 'park', 'park-town', 'signpost', null],
  ['neighborhood', 'town-docks', 'town-docks', 0, 52, 'south', 'docks', 'docks-town', 'signpost', null],
  ['neighborhood', 'town-roofs', 'town-roofs', 0, -52, 'north', 'roofs', 'roofs-town', 'signpost', null],
  ['neighborhood', 'town-market', 'town-market', 30, 52, 'south', 'market', 'market-town', 'signpost', [2.6, 50.9, 31.7, 50.9]],
  ['neighborhood', 'town-house', 'town-house', -43.55, 31, 'west', 'house', 'house-town', 'none', null],
  ['park', 'park-town', 'town-park', 0, 49, 'south', 'neighborhood', 'town-park', 'signpost', null],
  ['park', 'park-fair', 'park-fair', 0, -47, 'north', 'fair', 'fair-park', 'fairgate', [4, -25.2, 0, -47]],
  ['park', 'park-farm', 'park-farm', 42, 10, 'east', 'farm', 'farm-park', 'farmgate', [16, 10, 42, 10]],
  ['fair', 'fair-park', 'park-fair', 8, 45, 'south', 'park', 'park-fair', 'signpost', null],
  ['farm', 'farm-park', 'park-farm', -8, 45, 'south', 'park', 'park-farm', 'farmgate', null],
  ['docks', 'docks-town', 'town-docks', -10, -37, 'north', 'neighborhood', 'town-docks', 'signpost', null],
  ['docks', 'docks-seaside', 'docks-seaside', 35, -20, 'east', 'seaside', 'seaside-docks', 'promenade', null],
  ['seaside', 'seaside-docks', 'docks-seaside', 10, 45, 'south', 'docks', 'docks-seaside', 'promenade', null],
  ['seaside', 'seaside-lighthouse', 'seaside-lighthouse', 12, -31.5, 'north', 'lighthouse', 'lighthouse-seaside', 'signpost', null],
  ['lighthouse', 'lighthouse-seaside', 'seaside-lighthouse', 14, 41, 'south', 'seaside', 'seaside-lighthouse', 'signpost', null],
  ['roofs', 'roofs-town', 'town-roofs', 14, 45.55, 'south', 'neighborhood', 'town-roofs', 'alleydoor', null],
  ['market', 'market-town', 'town-market', 0, 23.6, 'south', 'neighborhood', 'town-market', 'signpost', null],
  ['house', 'house-town', 'town-house', 0, 11.6, 'south', 'neighborhood', 'town-house', 'none', null],
];

describe('gateways', () => {
  it('the constants, frozen', () => {
    expect([GATE_REACH, GATE_HALF, GATE_POST_R]).toEqual([1.6, 1.4, 0.15]);
    expect(ARRIVE_IN).toBeCloseTo(3.6, 12);
    // the last three are the teleport gates' looks (test/teleport.test.js); no map row uses them
    expect(GATE_LOOKS).toEqual(['signpost', 'fairgate', 'farmgate', 'promenade', 'alleydoor', 'none', 'stonering', 'archway', 'hollow']);
    expect(Object.values(GATEWAY_ENDS).flat().filter((e) => ['stonering', 'archway', 'hollow'].includes(e.look))).toEqual([]);
    expect(PLACEMENTS).toEqual(['edge', 'inside']);
    expect(INWARD_YAW).toEqual({ north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 });
    expect(Object.keys(GATEWAY_ENDS)).toEqual(['neighborhood', 'park', 'fair', 'farm', 'docks', 'seaside', 'lighthouse', 'roofs', 'market', 'house']);
    expect(deepFrozen(GATEWAY_ENDS)).toBe(true);
    expect([GATE_LOOKS, PLACEMENTS, INWARD_YAW].every(Object.isFrozen)).toBe(true);
  });
  it('the eighteen ends stand where the table says', () => {
    const rows = Object.entries(GATEWAY_ENDS).flatMap(([a, ends]) => ends.map((e) => [a, e.id, e.gateway, e.x, e.z, e.faces, e.to, e.twin, e.look, e.lane]));
    expect(rows).toEqual(TABLE);
    // the Park's lanes are gravel; the town's path to the Market is paved
    expect(LANE_LOOKS).toEqual(['gravel', 'paving']);
    expect(Object.values(GATEWAY_ENDS).flat().filter((e) => e.lane).map((e) => [e.id, e.laneLook]))
      .toEqual([['town-market', 'paving'], ['park-fair', 'gravel'], ['park-farm', 'gravel']]);
    // the Old House's two doors, the Rooftops' alley door and the Market's
    // gate in the south row's gap stand inside their places, each with its
    // own arrival; the two doors are drawn by their places (look 'none')
    const inside = Object.values(GATEWAY_ENDS).flat().filter((e) => e.placement === 'inside');
    expect(inside.map((e) => [e.id, e.arrive])).toEqual([
      ['town-house', { x: -39.9, z: 31, yaw: -Math.PI / 2 }],
      ['roofs-town', { x: 14, z: 41.9, yaw: 1.0 }],
      ['market-town', { x: 0, z: 19.9, yaw: 0 }],
      ['house-town', { x: 0, z: 7.95, yaw: 0 }],
    ]);
    expect(Object.values(GATEWAY_ENDS).flat().filter((e) => e.look === 'none').map((e) => e.id)).toEqual(['town-house', 'house-town']);
  });
  it('every map road has one end on each side, and the two ends twin each other', () => {
    expect(GATEWAYS.map((g) => g.id)).toContain('town-roofs');
    expect(GATEWAYS.map((g) => g.id)).toContain('town-market');
    expect(GATEWAYS.map((g) => g.id)).toContain('town-house');
    for (const g of GATEWAYS) {
      const ends = Object.entries(GATEWAY_ENDS).flatMap(([a, es]) => es.filter((e) => e.gateway === g.id).map((e) => ({ a, e })));
      expect(ends.map(({ a, e }) => `${a}>${e.to}`).sort(), g.id).toEqual([`${g.from}>${g.to}`, `${g.to}>${g.from}`].sort());
      const [p, q] = ends.map(({ e }) => e);
      expect([p.twin, q.twin]).toEqual([q.id, p.id]);
    }
  });
  it('a bad row throws and names itself', () => {
    const ok = { id: 'x', gateway: 'g', x: 0, z: 0, faces: 'east', to: 'park', twin: 'y', look: 'signpost' };
    expect(() => gatewayEnd({ ...ok, faces: 'nort' })).toThrow(/x.*nort/);
    expect(() => gatewayEnd({ ...ok, look: 'arch' })).toThrow(/x.*arch/);
    expect(() => gatewayEnd({ ...ok, placement: 'roof' })).toThrow(/x.*roof/);
    expect(() => gatewayEnd({ ...ok, lane: [0, 0, 1, 0], laneLook: 'tarmac' })).toThrow(/x.*tarmac/);
    expect(gatewayEnd(ok).laneLook).toBe('gravel');
    expect(() => gatewayEnd({ ...ok, placement: 'inside' })).toThrow(/x.*arrive/);
    expect(() => gatewayEnd({ ...ok, wings: [2, 2] })).toThrow(/x.*wings/); // a signpost has no railing
    expect(() => gatewayEnd({ ...ok, look: 'promenade', wings: [2] })).toThrow(/x.*wings/);
    expect(() => gatewayEnd({ ...ok, look: 'promenade', wings: [2, -1] })).toThrow(/x.*wings/);
    expect(gatewayEnd({ ...ok, look: 'promenade', wings: [2, 3] }).wings).toEqual([2, 3]);
    expect(endById('docks-seaside').end.wings).toEqual([18.6, 16.7]);
  });
  it('only the signposts to the Rooftops, the Market and Lighthouse Point ask for a painted name board (sign)', () => {
    const ok = { id: 'x', gateway: 'g', x: 0, z: 0, faces: 'east', to: 'park', twin: 'y', look: 'signpost' };
    expect(gatewayEnd(ok).sign).toBe(false);
    expect(gatewayEnd({ ...ok, sign: true }).sign).toBe(true);
    expect(Object.isFrozen(gatewayEnd({ ...ok, sign: true }))).toBe(true);
    const signed = Object.values(GATEWAY_ENDS).flat().filter((e) => e.sign);
    expect(signed.map((e) => e.id)).toEqual(['town-roofs', 'town-market', 'seaside-lighthouse']);
    for (const e of Object.values(GATEWAY_ENDS).flat()) expect(e.sign, e.id).toBe(e.id === 'town-roofs' || e.id === 'town-market' || e.id === 'seaside-lighthouse');
  });
  it('lookups', () => {
    expect(endsFor('island')).toEqual([]); expect(endsFor('__proto__')).toEqual([]); expect(endsFor(7)).toEqual([]);
    expect(endById('park-farm')).toEqual({ areaId: 'park', end: GATEWAY_ENDS.park[2] });
    expect(endById('nope')).toBeNull();
    expect(gatewayNear('park', 42, 11.5, CATALOG).id).toBe('park-farm');
    expect(gatewayNear('park', 42, 11.7, CATALOG)).toBeNull();
    expect(gatewayNear('park', NaN, 0, CATALOG)).toBeNull();
  });
  it('she arrives at the twin, 3.6 m inside it, facing in', () => {
    const near = (a, b) => { expect(a.areaId).toBe(b.areaId); for (const k of ['x', 'z', 'yaw']) expect(a[k]).toBeCloseTo(b[k], 9); };
    near(arrivalFor('park-farm'), { areaId: 'farm', x: -8, z: 41.4, yaw: 0 });
    near(arrivalFor('park-fair'), { areaId: 'fair', x: 8, z: 41.4, yaw: 0 });
    near(arrivalFor('town-park'), { areaId: 'park', x: 0, z: 45.4, yaw: 0 });
    near(arrivalFor('park-town'), { areaId: 'neighborhood', x: 48.4, z: 0, yaw: Math.PI / 2 });
    near(arrivalFor('docks-town'), { areaId: 'neighborhood', x: 0, z: 48.4, yaw: 0 });
    near(arrivalFor('town-docks'), { areaId: 'docks', x: -10, z: -33.4, yaw: Math.PI });
    near(arrivalFor('seaside-docks'), { areaId: 'docks', x: 31.4, z: -20, yaw: Math.PI / 2 });
    near(arrivalFor('roofs-town'), { areaId: 'neighborhood', x: 0, z: -48.4, yaw: Math.PI });
    // the Market's gate home: 3.6 m inside the town's south-east signpost (30, 52), facing north
    near(arrivalFor('market-town'), { areaId: 'neighborhood', x: 30, z: 48.4, yaw: 0 });
    expect(arrivalFor('nope')).toBeNull();
  });
  it("through the town's north signpost she lands in the Rooftops' alley, 3.65 m in front of its door, facing north", () => {
    expect(arrivalFor('town-roofs')).toEqual({ areaId: 'roofs', x: 14, z: 41.9, yaw: 1.0 });
  });
  it("through the town's south-east signpost she lands in the Market Square, 3.7 m in front of its gate, facing north into the square", () => {
    expect(arrivalFor('town-market')).toEqual({ areaId: 'market', x: 0, z: 19.9, yaw: 0 });
  });
  // Old House step 4 (W6): the old house's door in town and the hall's front door.
  it("through the old house's door in town she lands in the hall, 3.65 m in from its front door, facing north", () => {
    expect(arrivalFor('town-house')).toEqual({ areaId: 'house', x: 0, z: 7.95, yaw: 0 });
  });
  it("through the hall's front door she lands on the town's lawn, 3.65 m out from the old house's door, facing east", () => {
    expect(arrivalFor('house-town')).toEqual({ areaId: 'neighborhood', x: -39.9, z: 31, yaw: -Math.PI / 2 });
  });
  it('arriving from the alley door she faces the white guide pigeon, within 20 degrees of straight ahead', () => {
    const arr = arrivalFor('town-roofs');
    const GUIDE = { x: 5.5, z: 36.5 }; // roofsflock.js's GUIDE_SPOT
    const fwd = { x: -Math.sin(arr.yaw), z: -Math.cos(arr.yaw) }; // rotation.y 0 faces -z
    const dx = GUIDE.x - arr.x, dz = GUIDE.z - arr.z;
    const off = Math.acos((fwd.x * dx + fwd.z * dz) / Math.hypot(dx, dz)) * 180 / Math.PI;
    expect(off).toBeLessThan(20);
  });
  it('cutForGates takes each gate on a fence run out of it, and leaves every other run as it was', () => {
    expect(GATE_FENCE_GAP).toBe(0.25);
    const cut = GATE_HALF + GATE_FENCE_GAP; // 1.65
    const southGate = { x: 8, z: 45, faces: 'south' };
    const eastGate = { x: 30, z: 2, faces: 'east' };
    const r = (a, b, more) => ({ a, b, ...more });
    const close = (runs) => runs.map(({ a, b, ...rest }) => ({ a: a.map((v) => +v.toFixed(9)), b: b.map((v) => +v.toFixed(9)), ...rest }));
    // west to east, and east to west (each piece keeps the run's direction)
    expect(close(cutForGates([r([3.8, 45], [44, 45], { style: 'picket' })], [southGate])))
      .toEqual(close([r([3.8, 45], [8 - cut, 45], { style: 'picket' }), r([8 + cut, 45], [44, 45], { style: 'picket' })]));
    expect(close(cutForGates([r([44, 45], [3.8, 45])], [southGate]))).toEqual(close([r([44, 45], [8 + cut, 45]), r([8 - cut, 45], [3.8, 45])]));
    // along z, for a gate facing east or west
    expect(close(cutForGates([r([30, -10], [30, 10])], [eastGate]))).toEqual(close([r([30, -10], [30, 2 - cut]), r([30, 2 + cut], [30, 10])]));
    // not on the line, the wrong way round, or past the run's end: untouched
    const runs = [r([-44, 45], [-3.8, 45]), r([3.8, 46], [44, 46]), r([8, 30], [8, 50]), r([3.8, 45], [7, 45])];
    expect(cutForGates(runs, [southGate])).toEqual([runs[0], runs[1], runs[2], r([3.8, 45], [7, 45])]);
    expect(cutForGates(runs, [])).toEqual(runs);
  });
  it('a front door is data only, and waits for the Old House\'s catalog row', () => {
    const table = {
      neighborhood: [gatewayEnd({ id: 'town-house', gateway: 'town-house', x: 20, z: -8, faces: 'north', to: 'house', twin: 'house-town', look: 'none', placement: 'inside', arrive: { x: 20, z: -5, yaw: Math.PI } })],
      house: [gatewayEnd({ id: 'house-town', gateway: 'town-house', x: 0, z: 10, faces: 'south', to: 'neighborhood', twin: 'town-house', look: 'none', placement: 'inside', arrive: { x: 0, z: 7, yaw: 0 } })],
    };
    const withHouse = { areas: { ...CATALOG.areas, house: { name: 'The Old House', price: 150 } } };
    // the real catalog has the house since its step 4 (Task 2); without the row, no end is live
    const noHouse = { areas: Object.fromEntries(Object.entries(CATALOG.areas).filter(([k]) => k !== 'house')) };
    expect(liveEndsFor('neighborhood', noHouse, table)).toEqual([]);
    expect(liveEndsFor('neighborhood', CATALOG, table).map((e) => e.id)).toEqual(['town-house']);
    expect(liveEndsFor('neighborhood', withHouse, table).map((e) => e.id)).toEqual(['town-house']);
    expect(gatewayNear('neighborhood', 20, -7, withHouse, { table }).id).toBe('town-house');
    expect(arrivalFor('town-house', table)).toEqual({ areaId: 'house', x: 0, z: 7, yaw: 0 });
    expect(arrivalFor('house-town', table)).toEqual({ areaId: 'neighborhood', x: 20, z: -5, yaw: Math.PI });
  });
  it('the Rooftops waits for its catalog row', () => {
    const table = { neighborhood: [gatewayEnd({ id: 'town-roofs', gateway: 'town-roofs', x: -30, z: 20, faces: 'north', to: 'roofs', twin: 'roofs-town', look: 'none', placement: 'inside', arrive: { x: -30, z: 23, yaw: Math.PI } })] };
    const noRoofs = { areas: Object.fromEntries(Object.entries(CATALOG.areas).filter(([k]) => k !== 'roofs')) };
    expect(liveEndsFor('neighborhood', noRoofs, table)).toEqual([]);
    expect(gatewayNear('neighborhood', -30, 20, noRoofs, { table })).toBeNull();
  });
});
