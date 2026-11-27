// Snowville, milestone V1: the Farm's gate stands where the teleport gate rules want it (open lawn, clear of every collider, point of interest and golden mouse, in
// sight of the spawn, walkable round it, landing open and reached on foot), and the gate is drawn with its icy disc.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { teleKit } = await import('./helpers/tele.js');
const { GATE_REACH, GATE_PREFETCH_REACH } = await import('../src/gateways.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { setGrow } = await import('../src/grow.js');
const farm = await import('../src/world/farm.js');
const { TELE_ENDS } = await import('../src/teleport.js');
const { addTeleGates, discTint } = await import('../src/world/telegate.js');

await teleKit();
setGrow(false);
const E = TELE_ENDS.farm[0];
const area = farm.build(new THREE.Scene(), {});
const reach = floodFrom(area, farm.SPAWN, (x, z) => isWalkableAt(area, x, z));

describe('the Farm end of Snowville\'s gate', () => {
  it('stands on open lawn, clear of every collider, point of interest, find, perch and golden mouse, in sight of the spawn', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - E.x, c.z - E.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(5);
    const things = [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(area.perches ?? []), ...(GOLD_MICE.farm ?? []), farm.SPAWN];
    expect(things.length).toBeGreaterThan(3);
    for (const t of things) expect(Math.hypot(t.x - E.x, t.z - E.z), `thing at (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(7);
    expect(Math.hypot(farm.SPAWN.x - E.x, farm.SPAWN.z - E.z)).toBeLessThan(15);
  });
  it('she can walk up to it on foot from the spawn, and the ring round it is open', () => {
    let spots = 0;
    for (let dx = -GATE_REACH; dx <= GATE_REACH; dx += 0.1) {
      for (let dz = -GATE_REACH; dz <= GATE_REACH; dz += 0.1) {
        const x = E.x + dx; const z = E.z + dz;
        if (Math.hypot(dx, dz) <= GATE_REACH - 0.05 && isWalkableAt(area, x, z) && reach.reaches(x, z)) spots++;
      }
    }
    expect(spots).toBeGreaterThan(50);
    for (let a = 0; a < 16; a++) for (const r of [1, 2, 3]) expect(isWalkableAt(area, E.x + Math.cos(a * Math.PI / 8) * r, E.z + Math.sin(a * Math.PI / 8) * r), `ring ${a} at ${r} m`).toBe(true);
  });
  it('the spot she lands on coming home is open, reached on foot, out of reach of the gate and inside the prefetch distance', () => {
    const land = E.arrive;
    expect(isWalkableAt(area, land.x, land.z)).toBe(true);
    expect(reach.reaches(land.x, land.z)).toBe(true);
    expect(Math.hypot(land.x - E.x, land.z - E.z)).toBeGreaterThan(GATE_REACH + 1);
    expect(GATE_PREFETCH_REACH).toBeGreaterThan(Math.hypot(land.x - E.x, land.z - E.z));
  });
  it('is drawn in three meshes with the lantern arch\'s two solid pillars, and its disc is the icy tint, not the warm archway\'s', () => {
    const g = addTeleGates(new THREE.Scene(), [E]);
    expect(g.colliders).toHaveLength(2);
    expect(discTint(E)).toBe(0xcfe6ff);
    expect(discTint({ ...E, id: 'park-greenhouse' })).not.toBe(0xcfe6ff);
  });
});
