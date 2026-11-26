import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const L = await import('../src/world/lighthouseplan.js');
const { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition, createGoldMice } = await import('../src/goldmice.js');
const { CATALOG, createProgression } = await import('../src/progression.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { inWater } = await import('../src/world/water.js');
const { mem } = await import('./helpers/lighthouselife.js');

// Lighthouse Point, milestone 3: three golden mice.

const area = L.lighthouseArea();
const GOLD = GOLD_MICE.lighthouse;

describe('three golden mice', () => {
  it('ids gm-light-1..3, valid, and the same three in the plan and in src/goldmice.js', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-light-1', 'gm-light-2', 'gm-light-3']);
    for (const m of GOLD) expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/);
    expect(GOLD).toEqual(L.LIGHTHOUSE_GOLD.map((m) => ({ ...m })));
    for (const m of GOLD) expect(KNOWN_GOLD.has(m.id)).toBe(true);
    expect(new Set(GOLD.map((m) => m.id)).size).toBe(3);
  });
  it('a save keeps them (the sanitiser\'s id pattern), and finding one counts it', () => {
    const p = createProgression(mem());
    for (const m of GOLD) p.recordGolden?.(m.id);
    expect(p.state.golden).toEqual(GOLD.map((m) => m.id));
  });
  it('none stands beside a find, a collectible, a scenic or a hiding place (2 m)', () => {
    const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const anchors = [
      ...L.LIGHTHOUSE_COLLECTIBLES, ...L.LIGHTHOUSE_SCENICS, ...L.KITTEN_SPOTS,
      // each find's own place: the lamp room's middle, each pool's middle, Gull Rock, the cave's back, the bell's rope, the window.
      // (The gallery's ring is the gull's whole floor; a mouse on it is picked up by walking, which is not sitting still for a gull.)
      ...['lamproom', 'pool', 'echo', 'bell', 'window'].flatMap((id) => L.LIGHTHOUSE_FIND_ZONES[id].map((z) => ({ id, x: z.x, z: z.z, r: z.r }))),
      { id: 'gullrock', ...L.LIGHTHOUSE_FIND_ZONES.gull[1] },
    ];
    for (const m of GOLD) for (const a of anchors) {
      if (a.id === 'echo') continue; // the echo is a call anywhere in the cave's back: the mouse is in its nook, a metre behind the zone's heart
      expect(near(m, a), `${m.id} / ${a.id}`).toBeGreaterThan(2);
    }
    expect(near(GOLD[1], L.LIGHTHOUSE_FIND_ZONES.echo[0])).toBeGreaterThan(1.5); // in the nook behind the lantern, not at the wall she calls at
    // and not in the water, not in a wall
    for (const m of GOLD) {
      expect(inWater(area.waters, m.x, m.z), m.id).toBe(false);
      expect(area.colliders.every((c) => near(m, c) >= c.r + 0.35), m.id).toBe(true);
    }
  });
  it('each is reached from the spawn on foot (stair, climb and walking only: no Long Leap, no Sea Legs, no Spring Paws)', () => {
    const flood = floodTraversal(area);
    const reach = flood.reachable(flood.regionAt(area.spawn.x, area.spawn.z));
    const gallery = flood.regionAt(GOLD[0].x, GOLD[0].z, 13.5);
    expect(reach.has(gallery), 'the gallery').toBe(true);
    expect(flood.levelOf(gallery)).toBe(13.5);
    expect(reach.has(flood.regionAt(GOLD[1].x, GOLD[1].z)), 'the cave nook').toBe(true);
    expect(area.ground.y(GOLD[1].x, GOLD[1].z)).toBe(0);
    // the high pool ledge is a perch within the base climb budget (1.6 m), at the mouse's own place and height
    const ledge = area.perches.find((p) => p.x === GOLD[2].x && p.z === GOLD[2].z);
    expect(ledge).toBeTruthy();
    expect(ledge.y).toBeCloseTo(GOLD[2].y, 6);
    expect(ledge.y).toBeLessThanOrEqual(1.6);
    expect(ledge.requires).toBeUndefined();
    expect(reach.has(flood.regionAt(ledge.x, ledge.z))).toBe(true);
  });
  it('the walk lays each and finds it at her paws: on the gallery, on the cave floor, on the ledge', () => {
    const scene = new THREE.Scene();
    const mice = createGoldMice(scene, 'lighthouse', new Set(), { ground: area.ground, rng: () => 0.5 });
    expect(mice.list.map((m) => m.id)).toEqual(['gm-light-1', 'gm-light-2', 'gm-light-3']);
    expect(mice.list.map((m) => m.worldY)).toEqual([13.5, 0, 0.72]);
    for (const m of mice.list) {
      expect(mice.checkFind({ x: m.x, z: m.z }, m.worldY)?.id).toBe(m.id);
      expect(mice.checkFind({ x: m.x, z: m.z }, m.worldY + 3)).toBeNull(); // the cove 13 m under the gallery does not find the gallery's
    }
    expect(mice.checkFind({ x: GOLD[0].x, z: GOLD[0].z }, 6)).toBeNull(); // standing on the plateau under the gallery's mouse
    expect(createGoldMice(scene, 'lighthouse', new Set(['gm-light-2']), { ground: area.ground }).list.map((m) => m.id)).toEqual(['gm-light-1', 'gm-light-3']);
  });
});

describe('the totals', () => {
  it('Clan Edition counts 54 and Legacy 30 (three more from the Moon), with the place in the catalog (it has no edition key: both editions)', () => {
    expect(GOLD_TOTAL).toBe(60);
    expect(goldForEdition('canon', CATALOG).size).toBe(60);
    expect(goldForEdition('legacy', CATALOG).size).toBe(36);
    for (const e of ['canon', 'legacy']) for (const m of GOLD) expect(goldForEdition(e, CATALOG).has(m.id), `${e} ${m.id}`).toBe(true);
    expect(Object.hasOwn(CATALOG.areas, 'lighthouse')).toBe(true); // milestone 4's row: no edition key, so both editions count it
  });
});
