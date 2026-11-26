import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { build } = await import('../src/world/greenhouse.js');
const P = await import('../src/world/greenhouseplan.js');
const W = await import('./helpers/greenhousewalk.js');
const { propsFor, yarnSpotsFor, isPropId } = await import('../src/propsets.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET, SPRING_PAWS_CLIMB } = await import('../src/climbing.js');
const { inWater } = await import('../src/world/water.js');
const { withOffWords } = await import('./helpers/offwords.js');

// The Greenhouse, milestone G3: the garden fills. Everything she can walk to, stand on, nap at or find stands on open ground that a cat
// can reach on foot from the spawn, or on a perch she can climb to within the base budget.

const { area } = W;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the record is whole', () => {
  it('counts what the spec asks for: 5 collectibles, 6 tippables, a box, critters, 6 scenics (3 stage A, 3 rooms), moments', () => {
    expect(area.collectibles).toHaveLength(5);
    expect(area.tippables).toHaveLength(6);
    expect(area.tippables.filter((t) => t.kind === 'can')).toHaveLength(2);
    expect(area.tippables.filter((t) => t.kind === 'pot')).toHaveLength(3);
    expect(area.tippables.filter((t) => t.kind === 'bin')).toHaveLength(1);
    expect(area.boxes).toHaveLength(1);
    expect(area.scenics.map((s) => s.id)).toEqual(['greenhouse-palms', 'greenhouse-pond', 'greenhouse-shed', 'greenhouse-orchids', 'greenhouse-cactus', 'greenhouse-butterflies']);
    expect(area.critterSpawns.filter((c) => c.type === 'frog').length).toBeGreaterThanOrEqual(2);
    expect(area.critterSpawns.filter((c) => c.type === 'bird').length).toBeGreaterThanOrEqual(3);
    expect(area.moments.map((m) => m.id)).toEqual(['frog-plop', 'sparrow-bath']);
  });
  it('the built record carries all of it, with the moments\' labels from the word tables, in both sets', () => {
    const built = build(new THREE.Scene());
    for (const k of ['perches', 'collectibles', 'scenics', 'tippables', 'boxes', 'critterSpawns', 'moments', 'colliders', 'pois']) expect(built[k].length, k).toBe(area[k].length);
    for (const m of built.moments) expect(m.label).toMatch(/\S/);
    const clan = built.moments.map((m) => m.label);
    expect(withOffWords(() => build(new THREE.Scene()).moments.map((m) => m.label))).toEqual(clan);
  });
  it('two builds are identical (positions and counts)', () => {
    const sig = (sc) => sc.children.map((c) => { let n = 0; c.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; }); return `${c.name}:${n}:${c.position.x}:${c.position.z}`; }).join('|');
    const a = new THREE.Scene(); const ra = build(a);
    const b = new THREE.Scene(); const rb = build(b);
    expect(sig(a)).toBe(sig(b));
    expect(JSON.stringify([ra.colliders, ra.perches, ra.pois, ra.boxes])).toBe(JSON.stringify([rb.colliders, rb.perches, rb.pois, rb.boxes]));
  });
});

describe('everything stands on ground she can walk to', () => {
  const rows = (list, what) => list.map((p) => [`${what} ${p.id ?? p.type ?? p.kind ?? ''} ${p.x},${p.z}`, p]);
  const items = [
    ...rows([area.spawn], 'spawn'), ...rows(area.collectibles, 'collectible'), ...rows(area.scenics, 'scenic'), ...rows(area.tippables, 'tippable'),
    ...rows(area.boxes, 'box'), ...rows(area.critterSpawns, 'critter'), ...rows(area.pois, 'poi'), ...rows(P.GREENHOUSE_RESTS, 'rest'),
    ...rows(P.GREENHOUSE_HIDES, 'hide'), ...rows([...P.SEED_SPOT_SETS.flat(), ...P.ROOM_SEED_SPOT_SETS.flat()], 'seed'), ...rows(P.ALL_POT_SPOTS, 'pot'),
    ...rows(area.moments.map((m) => ({ ...m, x: m.from.x, z: m.from.z })), 'moment start'),
    ...rows([P.POTTING.canHome], 'bench'),
  ];
  it.each(items)('%s is walkable and reached on foot from the spawn', (_, p) => {
    expect(W.walkable(p.x, p.z)).toBe(true);
    expect(W.reachable(p.x, p.z)).toBe(true);
    expect(inWater(area.waters, p.x, p.z)).toBe(false);
  });
  it('every ground-level gold mouse, and the rest the catnip beds, the sunbeam and the fountain\'s rim, are reached too', () => {
    expect(W.reachable(P.GREENHOUSE_GOLD[1].x, P.GREENHOUSE_GOLD[1].z)).toBe(true);
    for (const r of P.GREENHOUSE_RESTS) expect(W.reachable(r.x, r.z, 0.8), r.id).toBe(true);
  });
  it('the court, the Palm House door, the shed\'s door side and the pond\'s north rim are joined', () => {
    for (const p of [{ x: 0, z: 29 }, { x: 0, z: 1.6 }, { x: 0, z: -9 + 2.6 }, { x: 23.2, z: 16 }, { x: P.POND.x, z: P.POND.z - P.POND.r - 0.6 }]) expect(W.reachable(p.x, p.z), `${p.x},${p.z}`).toBe(true);
  });
  it('no two walk-up things crowd each other: collectibles, scenics and the box keep 2 m from every seed spot and pot', () => {
    for (const a of [...area.collectibles, ...area.scenics, ...area.boxes]) for (const s of [...P.SEED_SPOT_SETS.flat(), ...P.ROOM_SEED_SPOT_SETS.flat(), ...P.ALL_POT_SPOTS]) expect(near(a, s), `${a.id ?? 'box'} vs ${s.x},${s.z}`).toBeGreaterThan(2);
  });
});

describe('the perches', () => {
  it('every perch can be climbed to within the base budget, none needs a skill, and nothing is above 2.5 m', () => {
    for (const p of area.perches) {
      const hops = W.hopsTo(p);
      expect(hops, `${p.label ?? p.kind} ${p.x},${p.z},${p.y}`).toBeLessThan(Infinity);
      expect(p.y).toBeLessThanOrEqual(2.5);
    }
  });
  it('the shed roof is three hops or fewer from the ground, never one, each hop within the 1.6 climb', () => {
    const roof = area.perches.find((p) => p.label === 'the potting shed roof');
    const barrel = area.perches.find((p) => p.label === 'the rain barrel');
    const stack = area.perches.find((p) => p.x === P.POT_STACKS[0].x && p.z === P.POT_STACKS[0].z);
    expect(roof.y).toBe(2.4);
    expect(W.hopsTo(roof)).toBeLessThanOrEqual(3);
    expect(W.hopsTo(roof)).toBeGreaterThan(1); // 2.4 is over a ground hop's 1.6
    // the three-hop chain as drawn: ground -> stack 0.7 -> barrel 1.3 -> roof 2.4
    expect(W.hopsTo(stack)).toBe(1);
    expect(canReach(barrel, stack, stack.y, BASE_CLIMB_BUDGET)).toBe(true);
    expect(canReach(roof, barrel, barrel.y, BASE_CLIMB_BUDGET)).toBe(true);
    expect(roof.y - barrel.y).toBeLessThanOrEqual(BASE_CLIMB_BUDGET.climb ?? 1.6);
    // the roof is not a one-hop from the ground even with Spring Paws (2.4 over 2.2)
    expect(roof.y).toBeGreaterThan(SPRING_PAWS_CLIMB);
  });
  it('the shed is solid and the door is painted on: no free ground inside its walls', () => {
    const S = P.SHED;
    for (const [dx, dz] of [[0, 0], [-2, -1], [2, 1], [-3, 0], [3, 0], [0, -2]]) expect(W.walkable(S.x + dx, S.z + dz), `${dx},${dz}`).toBe(false);
  });
  it('the log\'s perch is the gold mouse\'s spot (0.8 m, one hop), the roof\'s the other', () => {
    const log = area.perches.find((p) => p.label === 'the fallen willow log');
    expect(W.hopsTo(log)).toBe(1);
    expect(near(log, GOLD_MICE.greenhouse[2])).toBeLessThan(0.1);
    expect(GOLD_MICE.greenhouse[2].y).toBe(log.y);
  });
});

describe('the rests and the yarn, registered with the start-up tables', () => {
  it('src/propsets.js holds exactly the plan\'s rests and hides, ids valid and unique', () => {
    const set = propsFor('greenhouse');
    expect(set.rests).toEqual(P.GREENHOUSE_RESTS.map((r) => ({ ...r })));
    expect(set.hides).toEqual(P.GREENHOUSE_HIDES.map((h) => ({ ...h })));
    for (const r of set.rests) expect(isPropId(r.id), r.id).toBe(true);
    expect(set.rests.filter((r) => r.kind === 'eat')).toHaveLength(2);
    expect(set.rests.filter((r) => r.kind === 'nap')).toHaveLength(2);
    expect(set.rests.filter((r) => r.kind === 'drink')).toHaveLength(1);
  });
  it('the catnip beds, the sunbeam and the fountain\'s rim are where the rests are', () => {
    const at = (id) => P.GREENHOUSE_RESTS.find((r) => r.id === id);
    P.CATNIP_BEDS.forEach((b, i) => expect(near(b, at(`greenhouse-eat-${i + 1}`))).toBe(0));
    expect(Math.abs(at('greenhouse-drink-1').z - P.FOUNTAIN.z) - P.FOUNTAIN.r).toBeLessThan(1.2);
    expect(Math.hypot(at('greenhouse-nap-1').x, at('greenhouse-nap-1').z - P.ISLAND.z)).toBeGreaterThan(P.ISLAND.r);
  });
  it('the two yarn spots are open ground, reached on foot, 5 m or more apart, and clear of everything else a prompt stands at', () => {
    const spots = yarnSpotsFor('greenhouse');
    expect(spots).toHaveLength(2);
    expect(near(spots[0], spots[1])).toBeGreaterThan(5);
    const anchors = [area.spawn, ...area.collectibles, ...area.scenics, ...area.pois, ...P.GREENHOUSE_RESTS, ...GOLD_MICE.greenhouse];
    for (const s of spots) {
      expect(s.where.split(/\s+/).length).toBeLessThanOrEqual(5);
      expect(W.walkable(s.x, s.z) && W.reachable(s.x, s.z)).toBe(true);
      for (const c of area.colliders) expect(near(s, c), `${s.x},${s.z} vs collider`).toBeGreaterThanOrEqual(c.r + 0.35 + 0.3);
      for (const a of anchors) expect(near(s, a), `${s.x},${s.z} vs ${a.id ?? a.label ?? 'anchor'}`).toBeGreaterThanOrEqual(2);
    }
  });
});
