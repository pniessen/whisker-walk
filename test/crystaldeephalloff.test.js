// The Echo Deep hall shell with ?deep=1 off (the default): the stage answers empty lists and no life, nothing is cleared, the cave is what it was.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/crystalplan.js';
import { ST } from '../src/world/crystalstages.js';

await import('../src/world/crystalstagedeep.js');
const { build } = await import('../src/world/crystal.js');

describe('the Echo Deep hall, flag off', () => {
  it('no colliders, no perches, no life, no clears', () => {
    expect(ST.deep.colliders()).toEqual([]);
    expect(ST.deep.perches()).toEqual([]);
    expect(ST.deep.life({ scene: new THREE.Scene() })).toBeNull();
    expect(P.CRYSTAL_CLEARS.some((c) => c.minX === -34)).toBe(false);
    const area = build(new THREE.Scene());
    expect(area.colliders.length).toBe(P.crystalColliders().length + (ST.wingc?.colliders?.().length ?? 0) + (ST.grotto?.colliders().length ?? 0));
  });
});
