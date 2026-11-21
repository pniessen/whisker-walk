import { describe, it, expect } from 'vitest';
import {
  GATE_REACH, GATE_HALF, GATE_POST_R, ARRIVE_IN, GATE_LOOKS, PLACEMENTS, INWARD_YAW,
  GATEWAY_ENDS, gatewayEnd, endsFor, endById, liveEndsFor, gatewayNear, arrivalFor,
  GATE_FENCE_GAP, cutForGates,
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
  ['park', 'park-town', 'town-park', 0, 49, 'south', 'neighborhood', 'town-park', 'signpost', null],
  ['park', 'park-fair', 'park-fair', 0, -47, 'north', 'fair', 'fair-park', 'fairgate', [4, -25.2, 0, -47]],
  ['park', 'park-farm', 'park-farm', 42, 10, 'east', 'farm', 'farm-park', 'farmgate', [16, 10, 42, 10]],
  ['fair', 'fair-park', 'park-fair', 8, 45, 'south', 'park', 'park-fair', 'signpost', null],
  ['farm', 'farm-park', 'park-farm', -8, 45, 'south', 'park', 'park-farm', 'farmgate', null],
  ['docks', 'docks-town', 'town-docks', -10, -37, 'north', 'neighborhood', 'town-docks', 'signpost', null],
  ['docks', 'docks-seaside', 'docks-seaside', 35, -20, 'east', 'seaside', 'seaside-docks', 'promenade', null],
  ['seaside', 'seaside-docks', 'docks-seaside', 10, 45, 'south', 'docks', 'docks-seaside', 'promenade', null],
  ['roofs', 'roofs-town', 'town-roofs', 14, 45.55, 'south', 'neighborhood', 'town-roofs', 'alleydoor', null],
];

describe('gateways', () => {
  it('the constants, frozen', () => {
    expect([GATE_REACH, GATE_HALF, GATE_POST_R]).toEqual([1.6, 1.4, 0.15]);
    expect(ARRIVE_IN).toBeCloseTo(3.6, 12);
    expect(GATE_LOOKS).toEqual(['signpost', 'fairgate', 'farmgate', 'promenade', 'alleydoor', 'none']);
    expect(PLACEMENTS).toEqual(['edge', 'inside']);
    expect(INWARD_YAW).toEqual({ north: Math.PI, south: 0, east: Math.PI / 2, west: -Math.PI / 2 });
    expect(Object.keys(GATEWAY_ENDS)).toEqual(['neighborhood', 'park', 'fair', 'farm', 'docks', 'seaside', 'roofs']);
    expect(deepFrozen(GATEWAY_ENDS)).toBe(true);
    expect([GATE_LOOKS, PLACEMENTS, INWARD_YAW].every(Object.isFrozen)).toBe(true);
  });
  it('the twelve ends stand where the table says', () => {
    const rows = Object.entries(GATEWAY_ENDS).flatMap(([a, ends]) => ends.map((e) => [a, e.id, e.gateway, e.x, e.z, e.faces, e.to, e.twin, e.look, e.lane]));
    expect(rows).toEqual(TABLE);
    // only the Rooftops' alley door stands inside its place, with its own arrival
    const inside = Object.values(GATEWAY_ENDS).flat().filter((e) => e.placement === 'inside');
    expect(inside.map((e) => [e.id, e.arrive])).toEqual([['roofs-town', { x: 14, z: 41.9, yaw: 0 }]]);
  });
  it('every map road has one end on each side, and the two ends twin each other', () => {
    expect(GATEWAYS.map((g) => g.id)).toContain('town-roofs');
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
    expect(() => gatewayEnd({ ...ok, placement: 'inside' })).toThrow(/x.*arrive/);
    expect(() => gatewayEnd({ ...ok, wings: [2, 2] })).toThrow(/x.*wings/); // a signpost has no railing
    expect(() => gatewayEnd({ ...ok, look: 'promenade', wings: [2] })).toThrow(/x.*wings/);
    expect(() => gatewayEnd({ ...ok, look: 'promenade', wings: [2, -1] })).toThrow(/x.*wings/);
    expect(gatewayEnd({ ...ok, look: 'promenade', wings: [2, 3] }).wings).toEqual([2, 3]);
    expect(endById('docks-seaside').end.wings).toEqual([18.6, 16.7]);
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
    expect(arrivalFor('nope')).toBeNull();
  });
  it("through the town's north signpost she lands in the Rooftops' alley, 3.65 m in front of its door, facing north", () => {
    expect(arrivalFor('town-roofs')).toEqual({ areaId: 'roofs', x: 14, z: 41.9, yaw: 0 });
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
  it('a front door is data only (the Old House, later)', () => {
    const table = {
      neighborhood: [gatewayEnd({ id: 'town-house', gateway: 'town-house', x: 20, z: -8, faces: 'north', to: 'house', twin: 'house-town', look: 'none', placement: 'inside', arrive: { x: 20, z: -5, yaw: Math.PI } })],
      house: [gatewayEnd({ id: 'house-town', gateway: 'town-house', x: 0, z: 10, faces: 'south', to: 'neighborhood', twin: 'town-house', look: 'none', placement: 'inside', arrive: { x: 0, z: 7, yaw: 0 } })],
    };
    const withHouse = { areas: { ...CATALOG.areas, house: { name: 'The Old House', price: 150 } } };
    expect(liveEndsFor('neighborhood', CATALOG, table)).toEqual([]);
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
