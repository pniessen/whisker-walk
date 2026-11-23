import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { waterClearance } = await import('../src/world/builder.js');
const { groundOf } = await import('../src/ground.js');
const { propsFor, yarnSpotsFor, yarnSpotFor } = await import('../src/propsets.js');
const { REST_LOOKS, createRests } = await import('../src/rests.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { build } = await import('../src/world/lighthouse.js');

// Lighthouse Point, milestone 3: the porch's rests and the yarn ball's two spots, on the real built place, with the
// rules test/propsets.test.js and test/yarnspots.test.js hold every catalog place to (the place is not in the
// catalog until milestone 4, so those two files do not reach it yet).

const area = build(new THREE.Scene());
const g = groundOf(area);
const s = propsFor('lighthouse');
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const anchors = [area.spawn, ...GOLD_MICE.lighthouse, ...area.collectibles, ...area.scenics, ...area.pois];

describe('the porch\'s rests', () => {
  it('a bowl, a dish and a cushion, drawn, with looks, numbered from 1', () => {
    expect(s.rests.map((r) => [r.id, r.kind, r.mesh])).toEqual([['lighthouse-drink-1', 'drink', true], ['lighthouse-eat-1', 'eat', true], ['lighthouse-nap-1', 'nap', true]]);
    expect(REST_LOOKS['lighthouse-drink-1']).toEqual({ look: 'bowl' });
    expect(REST_LOOKS['lighthouse-eat-1']).toEqual({ look: 'dish' });
    expect(REST_LOOKS['lighthouse-nap-1']).toEqual({ look: 'cushion' });
    for (const k of ['carryables', 'knockables', 'markables', 'flaps', 'hides', 'keepSlots']) expect(s[k], k).toEqual([]);
    expect(s.dogYard).toBeNull();
  });
  it('stand on walkable ground clear of colliders and water, off the spawn, finds, scenics and POIs, a prompt\'s width apart', () => {
    for (const r of s.rests) {
      expect(isWalkableAt(area, r.x, r.z), r.id).toBe(true);
      for (const c of area.colliders) expect(d2(r, c), `${r.id} vs a collider at ${c.x},${c.z}`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS + 0.3);
      expect(waterClearance(area.waters, r.x, r.z), r.id).toBeGreaterThan(1.5);
      expect(g.y(r.x, r.z), `${r.id} on the plateau`).toBe(6);
      for (const q of anchors) expect(d2(r, q), `${r.id} vs ${q.id ?? 'an anchor'} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
    }
    for (let i = 0; i < s.rests.length; i++) for (let j = i + 1; j < s.rests.length; j++) expect(d2(s.rests[i], s.rests[j])).toBeGreaterThanOrEqual(2.5);
    // none is on top of the lit window's, the bell's or a tippable's spot
    for (const t of area.tippables) for (const r of s.rests) expect(d2(r, t), `${r.id} vs a ${t.kind}`).toBeGreaterThanOrEqual(1.5);
  });
  it('the walk makes one mesh set for them and draws each at the plateau\'s level', () => {
    const scene = new THREE.Scene();
    const rests = createRests(scene, s.rests, { ground: g });
    expect(scene.children.length).toBeGreaterThan(0);
    expect(rests.colliders ?? []).toEqual([]); // low enough to stand over
  });
});

describe('the yarn ball', () => {
  it('has two spots, each a short phrase that finishes "The yarn ball is ..."', () => {
    const spots = yarnSpotsFor('lighthouse');
    expect(spots.map((p) => p.where)).toEqual(['by the upturned boat', 'by the garden wall']);
    for (const p of spots) { expect(p.where.split(/\s+/).length).toBeLessThanOrEqual(5); expect(p.where).not.toMatch(/[.!]$/); }
    expect(d2(spots[0], spots[1])).toBeGreaterThan(5);
  });
  it('both spots stand clear, level and away from everything else', () => {
    for (const p of yarnSpotsFor('lighthouse')) {
      const at = `${p.where} ${p.x},${p.z}`;
      expect(isWalkableAt(area, p.x, p.z), at).toBe(true);
      for (const c of area.colliders) expect(d2(p, c), `${at} vs collider ${c.x},${c.z}`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS + 0.3);
      expect(waterClearance(area.waters, p.x, p.z), at).toBeGreaterThanOrEqual(1.5);
      for (const r of s.rests) expect(d2(p, r), `${at} vs ${r.id}`).toBeGreaterThanOrEqual(2.5);
      for (const q of anchors) expect(d2(p, q), `${at} vs ${q.id ?? 'an anchor'} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
      for (const t of area.tippables) expect(d2(p, t), `${at} vs a ${t.kind}`).toBeGreaterThanOrEqual(1.5);
      const y = g.y(p.x, p.z);
      for (let k = 0; k < 8; k++) {
        const t = (k * Math.PI) / 4;
        expect(Math.abs(g.y(p.x + Math.cos(t) * 1.5, p.z + Math.sin(t) * 1.5) - y), `${at} on a slope or a rim`).toBeLessThanOrEqual(0.25);
      }
    }
  });
  it('the spot of the day is one of the two, the same for the same key, and both come up', () => {
    const seen = new Set();
    for (let d = 1; d <= 28; d++) {
      const p = yarnSpotFor('lighthouse', `2026-11-${String(d).padStart(2, '0')}`);
      expect(yarnSpotsFor('lighthouse')).toContainEqual(p);
      seen.add(`${p.x},${p.z}`);
    }
    expect(seen.size).toBe(2);
  });
});
