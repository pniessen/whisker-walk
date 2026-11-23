import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createGoals, GOAL_POOL, goalFits } = await import('../src/goals.js');
const { mulberry32 } = await import('../src/rng.js');
const { build } = await import('../src/world/lighthouse.js');
const { yarnSpotsFor } = await import('../src/propsets.js');

// Lighthouse Point, milestone 3: the daily goals the place can finish. Three are drawn, always, from what it has.

const area = build(new THREE.Scene());
const SEEDS = Array.from({ length: 400 }, (_, i) => 1000 + i * 7919);
const spottable = area.critterSpawns.filter((c) => c.type === 'seagull' || c.type === 'crab');

// What each goal needs from the area (the same reading as test/goalsarea.test.js, and more: the animals, the
// finds, the places and the yarn are counted here).
function completable(goal) {
  switch (goal.type) {
    case 'mischief': return area.tippables.length >= goal.target;
    case 'sits': return area.boxes.length >= goal.target;
    case 'pet': return area.critterSpawns.some((c) => c.type === 'villager');
    case 'critter': return spottable.length >= goal.target;
    case 'hunt': return spottable.length >= goal.target; // gulls and crabs are chaseable
    case 'collectible': return area.collectibles.length >= goal.target;
    case 'scenic': return area.scenics.filter((s) => s.id !== 'lighthouse-gullrock').length >= goal.target; // Gull Rock is Long Leap's
    case 'play': return yarnSpotsFor('lighthouse').length > 0;
    default: return true; // photos, friends, buried treasure: on offer everywhere outdoors
  }
}

describe('the daily goals', () => {
  it('every goal drawn can be finished here', () => {
    for (const seed of SEEDS) for (const g of createGoals(mulberry32(seed), area).goals) expect(completable(g), `seed ${seed}: ${g.id}`).toBe(true);
  });
  it('head scratches are never offered (no one to give them); tipping, a box, animals, treasures and places are', () => {
    const seen = new Set();
    for (const seed of SEEDS) for (const g of createGoals(mulberry32(seed), area).goals) seen.add(g.id);
    expect(seen.has('get-scratches')).toBe(false);
    expect(goalFits(GOAL_POOL.find((g) => g.id === 'get-scratches'), area)).toBe(false);
    for (const id of ['tip-things', 'box-sit', 'spot-critters', 'collect', 'scenic-spots', 'pounce-play', 'yarn-play']) expect(seen.has(id), id).toBe(true);
    expect(seen.size).toBe(GOAL_POOL.length - 1);
  });
  it('what the place has is enough: seven things to knock over, two boxes, ten animals, five treasures, four places a cat can walk to, two yarn spots', () => {
    expect(area.tippables).toHaveLength(7);
    expect(area.boxes).toHaveLength(2);
    expect(spottable).toHaveLength(10);
    expect(area.collectibles).toHaveLength(5);
    expect(area.scenics.filter((s) => s.id !== 'lighthouse-gullrock')).toHaveLength(4);
    expect(yarnSpotsFor('lighthouse')).toHaveLength(2);
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
