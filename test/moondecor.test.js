// The Moon's decor (enrichment layer 3): the hand-placed props, cables and footprints are pure data, every one in bounds and clear of everything a child plays with,
// the same every time, about half on the lower rungs, and drawn into the kit's existing buckets (no draw call of their own).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { clear } from '../src/world/moonbeautyplan.js';
import { decorList, decorFits, DECOR_R, DECOR_SEEDS, placeDecor } from '../src/world/moondecor.js';
import { drawDecor } from '../src/world/moondecorparts.js';
import { createKit, moonMaterials } from '../src/world/moonparts.js';
import { ST } from '../src/world/moonstages.js';
import { build } from '../src/world/moon.js';
import '../src/world/moonstagerover.js';

const GROUPS = ['base', 'hill', 'launch', 'rover'];
const rows = (g) => ST.decorRows[g];
const lists = (lite = false) => Object.fromEntries(GROUPS.map((g) => [g, decorList(g, rows(g), lite)]));
const FLAT = new Set(['cable', 'trail']);

describe('the Moon decor plan', () => {
  it('every group has a seed, rows and a good share of its rows placed', () => {
    const all = lists();
    for (const g of GROUPS) {
      expect(DECOR_SEEDS[g]).toBeTypeOf('number');
      const standing = rows(g).filter((r) => !FLAT.has(r[0]));
      expect(all[g].filter((o) => !FLAT.has(o.k)).length, g).toBeGreaterThanOrEqual(Math.floor(standing.length * 0.7));
      expect(all[g].some((o) => o.k === 'trail'), g).toBe(true);
      expect(all[g].some((o) => o.k === 'cable'), g).toBe(true);
    }
    const kinds = new Set(GROUPS.flatMap((g) => all[g].map((o) => o.k)));
    for (const k of Object.keys(DECOR_R)) expect(kinds.has(k), k).toBe(true);
  });

  it('every item is in bounds and clear of colliders, perches, finds, pebbles, mice, story points, the rover track, the hop lane and the keep-outs', () => {
    for (const g of GROUPS) {
      for (const o of decorList(g, rows(g))) {
        const r = DECOR_R[o.k];
        const tag = `${g} ${o.k} ${o.x.toFixed(1)},${o.z.toFixed(1)}`;
        expect(o.x, tag).toBeGreaterThan(P.MOON_BOUNDS.minX + 1);
        expect(o.x, tag).toBeLessThan(P.MOON_BOUNDS.maxX - 1);
        expect(o.z, tag).toBeGreaterThan(P.MOON_BOUNDS.minZ + 1);
        expect(o.z, tag).toBeLessThan(P.MOON_BOUNDS.maxZ - 1);
        expect(decorFits(o.x, o.z, r, FLAT.has(o.k)), tag).toBe(true);
        expect(clear(o.x, o.z, r, FLAT.has(o.k) ? 0.15 : 0.5, FLAT.has(o.k) ? 0.25 : 0.5), tag).toBe(true);
        for (const c of [...P.MOON_COLLIDERS, ...P.MOON_PERCHES, ...P.PEBBLES, ...P.MOON_MICE, ...P.JOB_POINTS]) expect(Math.hypot(o.x - c.x, o.z - c.z), tag).toBeGreaterThan((c.r ?? 0.4) + r);
        expect(P.trackDistance(o.x, o.z), tag).toBeGreaterThan(r + 2);
        const L = P.JUMP_LANE;
        expect(o.x > L.x0 - 4 && o.x < L.x0 + L.len + 8 && Math.abs(o.z - L.z) < L.half + 2, tag).toBe(false);
        for (const k of P.CRATERS) expect(Math.hypot(o.x - k.x, o.z - k.z), tag).toBeGreaterThan(k.r);
      }
    }
  });

  it('is deterministic, and the lower rungs get about half', () => {
    expect(JSON.stringify(lists())).toBe(JSON.stringify(lists()));
    const full = lists();
    const lite = lists(true);
    for (const g of GROUPS) {
      expect(lite[g].length, g).toBeLessThan(full[g].length * 0.75);
      expect(lite[g].length, g).toBeGreaterThan(full[g].length * 0.3);
    }
    expect(placeDecor(rows('base'), 1)).not.toEqual(placeDecor(rows('base'), 2)); // the seed moves the wander of the paths
  });

  it('draws into the kit buckets that exist already (no mesh, so no draw call, of its own) and never casts from the flat or glowing ones', () => {
    const kit = createKit('t');
    const M = moonMaterials();
    for (const g of GROUPS) drawDecor(kit, M, decorList(g, rows(g)));
    const names = kit.meshes().map((m) => m.name);
    expect(names.every((n) => ['t:paint', 't:floor', 't:glow'].includes(n))).toBe(true);
    const tris = kit.meshes().reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
    expect(tris).toBeGreaterThan(1000);
    expect(tris).toBeLessThan(12000);
    for (const m of kit.meshes()) if (m.name !== 't:paint') expect(m.userData.noCast).toBe(true);
  });

  it('adds no draw call to the Moon: the same meshes as before the decor, and a plain basic material for the glow', () => {
    const scene = new THREE.Scene();
    build(scene, { water: {} });
    const place = scene.getObjectByName('moonPlace');
    const names = place.children.map((m) => m.name).sort();
    expect(names).toEqual([...new Set(names)]);
    expect(names.some((n) => n.endsWith(':glow'))).toBe(true);
  });
});
