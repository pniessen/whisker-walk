import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createGoals, GOAL_POOL, goalFits } = await import('../src/goals.js');
const { mulberry32 } = await import('../src/rng.js');
const { build } = await import('../src/world/greenhouse.js');
const { yarnSpotsFor } = await import('../src/propsets.js');

// The Greenhouse, milestone G3: the daily goals the place can finish. Three are drawn, always, from what it has: six things to knock over,
// a box, frogs and sparrows, five treasures, three places and the yarn.

const area = build(new THREE.Scene());
const SEEDS = Array.from({ length: 400 }, (_, i) => 1000 + i * 7919);
const spottable = area.critterSpawns.filter((c) => c.type === 'frog' || c.type === 'bird');

function completable(goal) {
  switch (goal.type) {
    case 'mischief': return area.tippables.length >= goal.target;
    case 'sits': return area.boxes.length >= goal.target;
    case 'pet': return area.critterSpawns.some((c) => c.type === 'villager');
    case 'critter': return spottable.length >= goal.target;
    case 'hunt': return area.critterSpawns.filter((c) => c.type === 'frog').length >= goal.target;
    case 'collectible': return area.collectibles.length >= goal.target;
    case 'scenic': return area.scenics.length >= goal.target;
    case 'play': return yarnSpotsFor('greenhouse').length > 0;
    default: return true; // photos, friends, buried treasure: on offer everywhere outdoors
  }
}

describe('the daily goals', () => {
  it('every goal drawn can be finished here', () => {
    for (const seed of SEEDS) for (const g of createGoals(mulberry32(seed), area).goals) expect(completable(g), `seed ${seed}: ${g.id} (target ${g.target})`).toBe(true);
  });
  it('head scratches are never offered (no one here to give them); tipping, a box, animals, treasures and places are', () => {
    const seen = new Set();
    for (const seed of SEEDS) for (const g of createGoals(mulberry32(seed), area).goals) seen.add(g.id);
    expect(seen.has('get-scratches')).toBe(false);
    expect(goalFits(GOAL_POOL.find((g) => g.id === 'get-scratches'), area)).toBe(false);
    for (const id of ['tip-things', 'box-sit', 'spot-critters', 'collect', 'scenic-spots', 'yarn-play']) expect(seen.has(id), id).toBe(true);
  });
  it('what the place has is enough: six to knock over, a box, eight animals, five treasures, three places, two yarn spots', () => {
    expect(area.tippables).toHaveLength(6);
    expect(area.boxes).toHaveLength(1);
    expect(spottable).toHaveLength(8);
    expect(area.collectibles).toHaveLength(5);
    expect(area.scenics).toHaveLength(3);
    expect(yarnSpotsFor('greenhouse')).toHaveLength(2);
  });
  it('still draws exactly three, however many goals fit', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      let draws = 0;
      const rng = mulberry32(seed);
      const counted = () => { draws++; return rng(); };
      expect(createGoals(counted, area).goals).toHaveLength(3);
      expect(draws).toBe(3);
    }
  });
});
