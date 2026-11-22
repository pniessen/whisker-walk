import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// =============================================================================
// The four stalls of 2026-11-22 (toys and yarn, plants, bric-a-brac, butcher):
// their words in both word sets, their ids, their cycles, their climbs and
// the things they carry to knock over. The butcher's hop is test/marketlive-hop.test.js.
// =============================================================================

const { TREAT_STALLS, stallById, stallClimb, toStall, fromStall, MARKET_REGISTRATION, MARKET_PERCHES, MARKET_COLLIDERS, MARKET_HIDES, STALL_PROPS, marketArea } = await import('../src/world/marketplan.js');
const { MARKET, STALL_TIMES, stallOffsets, periodOf } = await import('../src/marketrules.js');
const { treatStallOf, treatItemId } = await import('../src/marketnone.js');
const { TREAT_WORDS } = await import('../src/marketwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { createKnockables } = await import('../src/knockables.js');
const { isWalkableAt } = await import('../src/player.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { createMarketAtlas, atlasCell, buildTreatMesh } = await import('../src/world/marketparts.js');

const NEW = ['toys', 'plants', 'bric', 'butcher'];
const KIND = { toys: 'wool', plants: 'catnip', bric: 'sardines', butcher: 'sausages' };
const area = marketArea();
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const inZone = (s, x, z) => {
  const { lx, lz } = toStall(s, x, z);
  return Math.abs(lx) <= s.w / 2 + MARKET.WATCH_SIDE && lz >= s.d / 2 && lz <= s.d / 2 + MARKET.WATCH_DEPTH;
};

describe('the four new stalls: ids, cycles, words', () => {
  it('come after the old four, each a guarded treat stall with its own treat kind and item id', () => {
    expect(TREAT_STALLS.slice(0, 4)).toEqual(['fish', 'baker', 'cheese', 'milk']);
    expect(TREAT_STALLS.slice(4)).toEqual(NEW);
    for (const id of NEW) {
      expect(stallById(id).treat.kind, id).toBe(KIND[id]);
      expect(treatItemId(id)).toBe(`market-treat-${id}`);
      expect(treatStallOf(`market-treat-${id}`), id).toBe(id);
    }
    for (const bad of ['market-treat-__proto__', 'market-treat-flowers', 'market-treat-constructor']) expect(treatStallOf(bad), bad).toBeNull();
  });

  it('the old four keep their offsets (the new ones are appended draws), and no two periods are within 0.3 s', () => {
    // recorded from the code before the four were added (seed 7)
    const old = stallOffsets(7);
    const rec = { fish: old.fish, baker: old.baker, cheese: old.cheese, milk: old.milk };
    expect(Object.keys(stallOffsets(7)).slice(0, 4)).toEqual(['fish', 'baker', 'cheese', 'milk']);
    for (const [id, v] of Object.entries(rec)) expect(stallOffsets(7)[id], id).toBe(v);
    // the four recorded literals (seed 7), from the code before the new four were appended
    expect([rec.fish, rec.baker, rec.cheese, rec.milk]).toEqual([10.136784324911423, 11.468662689020858, 6.295442567788997, 6.065940530551598]);
    const ps = TREAT_STALLS.map(periodOf);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.abs(ps[i] - ps[j]), `${TREAT_STALLS[i]}/${TREAT_STALLS[j]}`).toBeGreaterThan(0.3);
    for (const id of NEW) expect(STALL_TIMES[id]).toBeDefined();
  });

  it('every line is a phrase in both word sets: a real string with no gap in it', () => {
    const ids = [];
    for (const k of Object.values(KIND)) ids.push(`market.treat.${k}`, `market.grab.${k}`);
    for (const id of NEW) ids.push(`market.perch.${id}`);
    const sets = [ids.map((id) => phrase(id)), withOffWords(() => ids.map((id) => phrase(id)))]; // the family's words, then the everyday ones
    for (const lines of sets) for (const line of lines) { expect(typeof line).toBe('string'); expect(line.length).toBeGreaterThan(0); expect(line).not.toMatch(/[{}]|undefined/); }
    for (const k of Object.values(KIND)) { expect(TREAT_WORDS[k].name).toBe(phrase(`market.treat.${k}`)); expect(TREAT_WORDS[k].prompt).toBe(phrase(`market.grab.${k}`)); }
    // no series word in a market line: both sets read the same text
    expect(sets[0]).toEqual(sets[1]);
  });

  it('the new atlas cells (18-29) are drawn, none left cream, and the old cells are untouched', () => {
    const atlas = createMarketAtlas();
    const { width: W, data } = atlas.texture.image;
    const sums = (c) => {
      const { u0, v0 } = atlasCell(c);
      const ox = Math.round(u0 * W), oy = Math.round(v0 * atlas.h);
      let s = [0, 0, 0];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const j = ((oy + y) * W + ox + x) * 4; s = [s[0] + data[j], s[1] + data[j + 1], s[2] + data[j + 2]]; }
      return s;
    };
    const cream = sums(31);
    for (let c = 18; c <= 29; c++) expect(sums(c), `cell ${c}`).not.toEqual(cream);
    // the beauty pass's cells: price slate, the second meat panel, the jumble, the valances
    for (const c of [36, 38, 39, 40, 41, 42, 43]) expect(sums(c), `cell ${c}`).not.toEqual(cream);
  });

  it('each new treat builds a mesh that is small, casting nothing', () => {
    for (const k of Object.values(KIND)) {
      const g = buildTreatMesh(k);
      expect(g.userData.noCast).toBe(true);
      g.traverse((o) => { if (o.isMesh) { expect(o.castShadow).toBe(false); expect(o.userData.noCast).toBe(true); } });
    }
  });
});

describe('each new stall: its treat, its climb, its knock-overs', () => {
  it('a treat that is not the string can be grabbed from walkable cobbles within reach', () => {
    for (const id of NEW.filter((i) => !stallById(i).treat.hang)) {
      const t = stallById(id).treat;
      let found = false;
      for (let dx = -0.8; dx <= 0.8 && !found; dx += 0.05) for (let dz = -0.8; dz <= 0.8 && !found; dz += 0.05) {
        if (Math.hypot(dx, dz) <= MARKET.TREAT_REACH && isWalkableAt(area, t.x + dx, t.z + dz)) found = true;
      }
      expect(found, id).toBe(true);
    }
  });

  it('plants and bric-a-brac carry tier perches (crate kind), each one hop from the ground or the one below', () => {
    for (const id of ['plants', 'bric']) {
      const c = stallClimb(id);
      expect(c.tiers.length, id).toBe(id === 'plants' ? 2 : 3);
      for (const t of c.tiers) {
        expect(MARKET_PERCHES, id).toContain(t);
        expect(t.kind, id).toBe('crate');
        let ok = false;
        for (let dx = -1.2; dx <= 1.2 && !ok; dx += 0.1) for (let dz = -1.2; dz <= 1.2 && !ok; dz += 0.1) {
          const q = { x: t.x + dx, z: t.z + dz };
          if (isWalkableAt(area, q.x, q.z) && canReach(t, q, 0, BASE_CLIMB_BUDGET)) ok = true;
        }
        expect(ok, `${id} tier ${t.y}`).toBe(true);
      }
    }
  });

  const props = MARKET_REGISTRATION.propSet.knockables;
  const mine = (prefix) => props.filter((k) => k.id.startsWith(prefix));
  const OF = { 'market-pot': 'plants', 'market-crock': 'bric', 'market-bones': 'butcher' };

  it('three pots, three pieces of crockery and a bucket of bones, each from a perch at its own height, each landing on free cobbles', () => {
    expect(mine('market-pot').map((k) => k.kind)).toEqual(['flowerpot', 'flowerpot', 'flowerpot']);
    expect(mine('market-crock').map((k) => k.kind)).toEqual(['cup', 'cup', 'cup']);
    expect(mine('market-bones').map((k) => k.kind)).toEqual(['bucket']);
    const treats = TREAT_STALLS.map(stallById);
    const mineAll = [...mine('market-pot'), ...mine('market-crock'), ...mine('market-bones')];
    for (const k of mineAll) {
      // knocked from a perch beside it at its height (knockables.js: within 0.3 of the ledge, reach 1 m)
      const from = MARKET_PERCHES.filter((p) => Math.abs(p.y - k.y) < 0.3 && dist(p, k) <= 1.0 && dist(p, k) >= 0.25);
      expect(from.length, k.id).toBeGreaterThan(0);
      // and lands where no cat is stuck, off every zone and hide, away from every treat and every other fall
      expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), k.id).toBe(true);
      for (const c of MARKET_COLLIDERS) expect(dist(k.fallTo, c) - c.r, k.id).toBeGreaterThanOrEqual(0.3);
      for (const s of treats) { expect(inZone(s, k.fallTo.x, k.fallTo.z), `${k.id} in ${s.id}'s zone`).toBe(false); expect(dist(k.fallTo, s.treat), `${k.id} by ${s.id}'s treat`).toBeGreaterThanOrEqual(0.3); }
      for (const h of MARKET_HIDES) expect(dist(k.fallTo, h) - h.r, `${k.id} in a hide`).toBeGreaterThan(0);
      for (const o of props) if (o !== k) expect(dist(k.fallTo, o.fallTo), `${k.id}/${o.id}`).toBeGreaterThanOrEqual(0.3);
      for (const o of props) if (o !== k) expect(dist(k.fallTo, o), `${k.id} under ${o.id}`).toBeGreaterThanOrEqual(0.3);
      expect(dist(k, k.fallTo), k.id).toBeLessThan(3);
      expect(OF[k.id.replace(/-\d+$/, '')]).toBeDefined();
    }
  });

  it('knocking one goes down alone, rests exactly at its fallTo, and a remote knock by id ends the same', () => {
    for (const prefix of ['market-pot', 'market-crock']) {
      const run = (k, n) => { for (let i = 0; i < n; i++) k.update(1 / 30); };
      const a = createKnockables(new THREE.Scene(), props);
      const b = createKnockables(new THREE.Scene(), props);
      const ids = mine(prefix).map((k) => k.id);
      const first = a.list.find((e) => e.id === ids[1]);
      expect(a.knock(first)).toBe(true);
      expect(b.knockById(ids[1])).toBe(true);
      run(a, 60); run(b, 60);
      for (const id of ids) expect(a.list.find((e) => e.id === id).down, id).toBe(id === ids[1]);
      for (const id of ids) expect(b.list.find((e) => e.id === id).down, id).toBe(id === ids[1]);
      const fa = a.list.find((e) => e.id === ids[1]), fb = b.list.find((e) => e.id === ids[1]);
      const want = props.find((k) => k.id === ids[1]).fallTo;
      expect(fa.group.position.x).toBeCloseTo(want.x, 6); expect(fa.group.position.z).toBeCloseTo(want.z, 6);
      expect(fb.group.position.x).toBeCloseTo(fa.group.position.x, 9); expect(fb.group.position.z).toBeCloseTo(fa.group.position.z, 9);
      // the next piece is still offered to a cat on the perch (nearest skips what is down)
      const perch = MARKET_PERCHES.find((p) => Math.abs(p.y - props.find((k) => k.id === ids[0]).y) < 0.3 && dist(p, props.find((k) => k.id === ids[0])) <= 1.0);
      expect(perch, prefix).toBeDefined();
      const next = a.nearest({ x: perch.x, z: perch.z }, perch.y, 1.0);
      expect(next && next.id !== ids[1], prefix).toBe(true);
      a.dispose(); b.dispose();
    }
  });

  it('the stalls keep clear of the spawn walk', () => {
    for (const id of NEW) {
      const s = stallById(id);
      for (const p of [s.at, s.hide, s.treat]) expect(Math.abs(p.x) > 1.6 || p.z < 12, id).toBe(true);
    }
  });
});
