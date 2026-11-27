// The Seaside's holiday life plan (src/world/seasideplan.js): every spot in
// bounds and clear of what the built area already holds.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const plan = await import('../src/world/seasideplan.js');
const { build } = await import('../src/world/seaside.js');
const { beachKeepOut, beachAnchors } = await import('../src/world/beachdress.js');
const { endsFor } = await import('../src/gateways.js');
const { propsFor } = await import('../src/propsets.js');

const area = build(new THREE.Scene());
const spots = plan.seasideSpots();
const hits = (s, x, z, r) => Math.hypot(s.x - x, s.z - z) < s.r + r;

describe('seaside plan', () => {
  it('has the people, castles, gulls and vendors the owner asked for', () => {
    expect(plan.SEASIDE_FOLK.some((p) => p.role === 'sit')).toBe(true);
    expect(plan.SEASIDE_FOLK.some((p) => p.role === 'wade')).toBe(true);
    expect(plan.SEASIDE_FOLK.some((p) => p.role === 'toss')).toBe(true);
    expect(plan.SEASIDE_FOLK.some((p) => p.role === 'kneel')).toBe(true);
    expect(plan.SEASIDE_CASTLES.map((c) => c.stage).sort()).toEqual([0, 1, 2]);
    expect(plan.SEASIDE_VENDORS.map((v) => v.kind).sort()).toEqual(['cart', 'stand']);
    for (const m of ['post', 'stand', 'walk', 'hop', 'glide']) expect(plan.SEASIDE_GULLS.some((g) => g.mode === m)).toBe(true);
  });

  it('keeps every spot in bounds', () => {
    const b = area.bounds;
    for (const s of spots) {
      expect(s.x - s.r, s.id).toBeGreaterThanOrEqual(b.minX);
      expect(s.x + s.r, s.id).toBeLessThanOrEqual(b.maxX);
      expect(s.z - s.r, s.id).toBeGreaterThanOrEqual(b.minZ);
      expect(s.z + s.r, s.id).toBeLessThanOrEqual(b.maxZ);
    }
  });

  it('keeps every spot off the pier, clear of the Reef gate end and out of the other gate ends', () => {
    const d = plan.PIER_DECK;
    for (const s of spots) {
      const onDeck = s.x + s.r > d.minX && s.x - s.r < d.maxX && s.z + s.r > d.minZ - 1 && s.z - s.r < d.maxZ + 1;
      expect(onDeck, s.id).toBe(false);
      expect(hits(s, plan.REEF_GATE_END.x, plan.REEF_GATE_END.z, 2.5), s.id).toBe(false);
      for (const e of endsFor('seaside')) expect(hits(s, e.x, e.z, 2.5), `${s.id} / ${e.id}`).toBe(false);
    }
  });

  it('keeps ground figures and castles off the boardwalk path (the vendors stand just off its kerb)', () => {
    const w = plan.BOARDWALK;
    const vendorIds = new Set(plan.SEASIDE_VENDORS.flatMap((v) => [v.id, `${v.id}-vendor`]));
    for (const s of spots) {
      if (vendorIds.has(s.id)) { expect(s.x - s.r, s.id).toBeGreaterThanOrEqual(w.minX - 2.5); expect(s.x + s.r, s.id).toBeLessThanOrEqual(w.minX + 0.5); continue; }
      expect(s.x + s.r > w.minX && s.x - s.r < w.maxX && Math.abs(s.z) < w.maxZ, s.id).toBe(false);
    }
  });

  it('is clear of the finds, pois, tippables, boxes, perches, scenics, props, mice, moments, the spawn and the colliders', () => {
    const keep = beachKeepOut(area);
    const props = propsFor('seaside');
    const extra = [
      ...(props.hides || []).map((h) => ({ x: h.x, z: h.z, r: 1.3 })),
      ...area.critterSpawns.filter((c) => c.type === 'mouse').flatMap((c) => [{ x: c.x, z: c.z, r: 1.3 }, { x: c.x2, z: c.z2, r: 1.3 }]),
      ...area.moments.map((m) => ({ x: m.x, z: m.z, r: 2 })),
    ];
    for (const s of spots) {
      for (const k of [...keep, ...extra]) expect(hits(s, k.x, k.z, k.r), `${s.id} / keep ${k.x},${k.z}`).toBe(false);
      for (const c of area.colliders) {
        expect(hits(s, c.x, c.z, c.r), `${s.id} / collider ${c.x},${c.z}`).toBe(false);
      }
    }
  });

  it('keeps clear of the beach dressing\'s own big props (logs, castles, umbrella, bucket)', () => {
    for (const a of beachAnchors(area)) {
      if (!['castle', 'driftwood', 'umbrella', 'bucket', 'spade'].includes(a.kind)) continue;
      for (const s of spots) expect(hits(s, a.x, a.z, a.r + 0.2), `${s.id} / ${a.kind}`).toBe(false);
    }
  });

  it('stands the pier posts outside the deck and puts every post gull on one', () => {
    const d = plan.PIER_DECK;
    for (const p of plan.SEASIDE_POSTS) expect(p.z < d.minZ || p.z > d.maxZ).toBe(true);
    for (const g of plan.SEASIDE_GULLS.filter((q) => q.mode === 'post')) expect(plan.SEASIDE_POSTS[g.post]).toBeTruthy();
  });

  it('thins out by rung: LITE keeps the first rank only, LOW the first two', () => {
    expect(plan.RANK_FOR_RUNG(0)).toBe(2);
    expect(plan.RANK_FOR_RUNG(3)).toBe(1);
    expect(plan.RANK_FOR_RUNG(5)).toBe(0);
    for (const list of [plan.SEASIDE_FOLK, plan.SEASIDE_GULLS]) expect(list.filter((p) => p.rank === 0).length).toBeGreaterThan(0);
  });
});
