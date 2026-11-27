// The Treehouse village, milestone T3: the six discoveries (rule incl. height, pay, words, both sets), the six collectibles, the three golden mice (71 and 47), the six live journal
// pages and the Canopy Cap's four spots. Modelled on test/snowvillefinds.test.js. Plan: docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 2.7, 2.8, 2.10.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLAN_TOTAL, EVERYDAY_TOTAL } from './helpers/goldtotals.js';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';
import { perchHops } from './helpers/findreach.js';

stubCanvasDocument();

const { createProgression, JOURNAL_TYPES, CATALOG } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { TREEHOUSE_PAGES, TREEHOUSE_PAGE_IDS } = await import('../src/treehousepages.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { setTreehouse } = await import('../src/treehouseflag.js');
const { loadTreehouseStages, ST } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const F = await import('../src/world/treehousefinds.js');
const Q = await import('../src/world/treehousefindsplan.js');
const P = await import('../src/world/treehouseplan.js');
const { TREEHOUSE_FIND_LINES, HINTS } = await import('../src/world/treehousefindwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { PROPSETS } = await import('../src/propsets.js').catch(() => ({}));
const { isWalkableAt } = await import('../src/player.js');

const Z = Q.TREEHOUSE_FIND_ZONES;
const spot = (o) => ({ x: 0, y: 0, z: 25, still: 0, ...o });
const mid = (id) => Z[id][0];
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const area0 = build(new THREE.Scene());
const flood = floodFrom(area0, area0.spawn, (x, z) => isWalkableAt(area0, x, z));
// walked, not hopped: the cells a cat on foot reaches from the spawn, up the flights of stairs and along the decks and bridges (treehouseplan.js walkFlood)
const walked = P.walkFlood();
const walkReaches = (x, z, y = 0, tol = 0.6) => walked.some((c) => Math.hypot(c.x - x, c.z - z) <= tol && Math.abs(c.y - y) < 0.3);
const onPerch = (p, tolY = 0.9) => P.TREEHOUSE_PERCHES.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1.0 && Math.abs(q.y - (p.y ?? 0)) < tolY);

describe('each find is found by its rule', () => {
  it('the ids map to the reserved page ids in order, and every one has a zone, a line and a hint in both sets', () => {
    expect(Q.TREEHOUSE_FIND_IDS).toEqual(['bakery', 'books', 'bell', 'bridge', 'lookout', 'acorn']);
    expect(F.PAGE_OF).toEqual(Object.fromEntries(Q.TREEHOUSE_FIND_IDS.map((id, i) => [id, `th${i + 1}`])));
    expect(TREEHOUSE_PAGE_IDS).toEqual(['th1', 'th2', 'th3', 'th4', 'th5', 'th6']);
    for (const id of Q.TREEHOUSE_FIND_IDS) { expect(Z[id]).toHaveLength(1); expect(F.TREEHOUSE_FIND_WORDS[id]()).toMatch(/\S/); }
    for (const id of TREEHOUSE_PAGE_IDS) { expect(HINTS[id], id).toMatch(/\S/); expect(withOffWords(() => HINTS[id])).toBe(HINTS[id]); }
  });
  it('still long enough inside the ring and at its height, not before, not outside, not under a deck, not moving', () => {
    for (const id of Q.TREEHOUSE_FIND_IDS) {
      const z = mid(id);
      expect(F.findAt(spot({ x: z.x, y: z.y, z: z.z, still: z.still })), id).toBe(id);
      expect(F.findAt(spot({ x: z.x + z.r - 0.05, y: z.y, z: z.z, still: z.still })), `${id} at the rim`).toBe(id);
      expect(F.findAt(spot({ x: z.x, y: z.y, z: z.z, still: z.still - 0.1 })), `${id} too soon`).toBe(null);
      expect(F.findAt(spot({ x: z.x + z.r + 0.3, y: z.y, z: z.z, still: 9 })), `${id} outside`).toBe(null);
      if (z.y > 0) expect(F.findAt(spot({ x: z.x, y: 0, z: z.z, still: 9 })), `${id} on the ground under its deck`).toBe(null);
    }
  });
  it('one spot never finds two: the six rings do not overlap', () => {
    for (const a of Q.TREEHOUSE_FIND_IDS) for (const b of Q.TREEHOUSE_FIND_IDS) {
      if (a >= b) continue;
      expect(near(mid(a), mid(b)), `${a}/${b}`).toBeGreaterThan(mid(a).r + mid(b).r);
    }
  });
  it('every ring is inside the bounds, on a perch of the plan (or clear open ground), and a ground ring is reached on foot with no skills', () => {
    for (const id of Q.TREEHOUSE_FIND_IDS) {
      const z = mid(id);
      expect(z.x - z.r).toBeGreaterThan(P.TREEHOUSE_BOUNDS.minX + 2); expect(z.x + z.r).toBeLessThan(P.TREEHOUSE_BOUNDS.maxX - 2);
      expect(z.z - z.r).toBeGreaterThan(P.TREEHOUSE_BOUNDS.minZ + 2); expect(z.z + z.r).toBeLessThan(P.TREEHOUSE_BOUNDS.maxZ - 2);
      if (z.y === 0) {
        for (const c of area0.colliders) expect(near(z, c), `${id} by a collider`).toBeGreaterThan(c.r + 0.3);
        expect(flood.reachesWithin(z.x, z.z, z.r), `${id} reached`).toBe(true);
      } else {
        expect(onPerch(z), `${id} on a perch`).toBe(true);
        expect(walkReaches(z.x, z.z, z.y), `${id} reached on foot`).toBe(true);
      }
    }
  });
  it('the rule reads where she stands, how high and how still, never a skill, and no file here draws a random number or reads a clock', () => {
    for (const f of globSync('src/world/treehousefind*.js')) {
      const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/\b(floatY|requires|skill)/i);
      expect(code, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
    }
  });
});

describe('what a find pays and says', () => {
  const rig = () => {
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    return { progression, log };
  };
  it('the award is 12', () => { expect(AWARDS.treefind).toBe(12); });
  it('the first time ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    expect(F.noteTreehouseFind('bell', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'treefind', label: phrase('treehouse.find.bell'), points: 12, key: 'treehouse-find-bell' });
    expect(F.noteTreehouseFind('bell', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.th3).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(F.noteTreehouseFind('bell', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.th3).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteTreehouseFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.treehouseFindKey('acorn')).toBe('treehouse-find-acorn');
    spy.mockRestore();
  });
  it('every id counts on its own page and pays 12 the first time', () => {
    Q.TREEHOUSE_FIND_IDS.forEach((id, i) => {
      const { progression, log } = rig();
      expect(F.noteTreehouseFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(progression.state.journal[`th${i + 1}`]).toBe(1);
    });
    for (const id of TREEHOUSE_PAGE_IDS) expect(JOURNAL_TYPES).toContain(id);
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteTreehouseFind('acorn', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteTreehouseFind('acorn', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.th6).toBe(1);
    expect(progression.state.points).toBe(12);
  });
});

describe('the words', () => {
  const IDS = Object.keys(TREEHOUSE_FIND_LINES);
  it('every id is a literal phrase id and every line is present', () => {
    for (const id of Q.TREEHOUSE_FIND_IDS) expect(IDS).toContain(`treehouse.find.${id}`);
    expect(IDS).toContain('treehouse.acorn'); expect(IDS).toContain('treehouse.leaf');
    for (const f of globSync('src/world/treehouse*.js')) {
      for (const [, arg] of readFileSync(f, 'utf8').matchAll(/\bphrase\(\s*(`[^`]*`|[^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
    }
  });
  it('the everyday set has no series word and no literal Clan; no line scolds or scares or runs long', () => {
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
    withOffWords(() => { for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull(); });
    for (const id of IDS) { expect(phrase(id).length, id).toBeLessThanOrEqual(100); expect(phrase(id), id).not.toMatch(scary); }
    for (const h of Object.values(HINTS)) expect(h, h).not.toMatch(scary);
    for (const id of ['bakery', 'books', 'bridge', 'acorn']) expect(withOffWords(() => F.TREEHOUSE_FIND_WORDS[id]())).toBe(F.TREEHOUSE_FIND_WORDS[id]());
    expect(withOffWords(() => phrase('treehouse.find.bell'))).toBe('You found the Bell Tower! The bell hangs ready to ring.');
    expect(phrase('treehouse.find.bell')).not.toBe(withOffWords(() => phrase('treehouse.find.bell')));
    for (const f of globSync('src/world/treehousefind*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bClan\b/);
  });
});

describe('the collectibles', () => {
  const area = build(new THREE.Scene());
  it('six in all, four acorns and two golden leaves, ids unique, each named in the set in use', () => {
    expect(Q.TREEHOUSE_COLLECTIBLES).toHaveLength(6);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(6);
    expect(area.collectibles.map((c) => c.label)).toEqual(Q.TREEHOUSE_COLLECTIBLES.map((k) => (k.kind === 'leaf' ? 'a golden leaf' : 'an acorn')));
  });
  it('all on open ground, in the bounds, reached on foot, clear of colliders, finds, mice (2 m), cap spots (2 m), yarn and the spawn', () => {
    const b = P.TREEHOUSE_BOUNDS;
    const yarn = PROPSETS?.treehouse ?? [{ x: -4, z: 19 }, { x: 12, z: 10 }];
    for (const c of area.collectibles) {
      expect(c.x).toBeGreaterThan(b.minX + 2); expect(c.x).toBeLessThan(b.maxX - 2); expect(c.z).toBeGreaterThan(b.minZ + 2); expect(c.z).toBeLessThan(b.maxZ - 2);
      for (const k of area.colliders) expect(near(c, k), c.id).toBeGreaterThan(k.r + 0.5);
      for (const id of Q.TREEHOUSE_FIND_IDS) expect(near(c, mid(id)), `${c.id} by ${id}`).toBeGreaterThan(mid(id).r + 2);
      for (const m of Q.TREEHOUSE_GOLD) expect(near(c, m), `${c.id} by ${m.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('treehouse')) expect(near(c, s), `${c.id} by ${s.id}`).toBeGreaterThan(2);
      for (const y of yarn) expect(near(c, y), `${c.id} by yarn`).toBeGreaterThan(3);
      expect(near(c, area.spawn), c.id).toBeGreaterThan(5);
      expect(flood.reachesWithin(c.x, c.z, 0.9), `${c.id} reached`).toBe(true);
    }
  });
  it('the three scenic spots stay, and before the stage is in the place builds with no collectible (a slot nobody filled answers null)', () => {
    expect(area.scenics).toHaveLength(3);
    const was = ST.branches;
    try { delete ST.branches; const bare = build(new THREE.Scene()); expect(bare.collectibles).toEqual([]); } finally { ST.branches = was; }
  });
});

describe('the life notes a find while she stands still, at her height', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });
  const make = (extra = {}) => {
    const scene = new THREE.Scene();
    const placed = build(scene);
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const life = placed.life({ scene, log, progression, reducedMotion: false, tier: null, sendEvent: () => {}, ...extra });
    const heard = [];
    const off = bus.on('discovery', (e) => heard.push(e));
    const at = { x: 0, y: 0, z: 28 };
    const sess = { cat: { position: at, rotation: { y: 0 } } };
    const step = (seconds, cat = null) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, null, sess); };
    return { life, scene, progression, log, heard, step, off: () => { off(); life.dispose(); } };
  };
  it('the acorn: 1 s of stillness pays 12 once and shows the glow for a moment; Nutmeg and the light still run', () => {
    r = make();
    const z = mid('acorn');
    r.step(0.5, { x: z.x, y: 0, z: z.z });
    expect(r.progression.state.journal.th6 ?? 0).toBe(0);
    r.step(1, {});
    expect(r.progression.state.journal.th6).toBe(1);
    expect(r.progression.state.points).toBe(12);
    expect(r.scene.getObjectByName('treehouse:findGlow').visible).toBe(true);
    r.step(5, {});
    expect(r.heard.filter((e) => e.type === 'treefind')).toHaveLength(1);
    expect(r.scene.getObjectByName('treehouse:findGlow').visible).toBe(false);
    expect(r.life.light).toBeTruthy(); expect(r.life.nutmeg).toBeTruthy();
  });
  it('standing on the ground under the Bakery deck finds nothing; standing on the deck does', () => {
    r = make();
    const z = mid('bakery');
    r.step(3, { x: z.x, y: 0, z: z.z });
    expect(r.progression.state.journal.th1 ?? 0).toBe(0);
    r.step(3, { x: z.x, y: z.y, z: z.z });
    expect(r.progression.state.journal.th1).toBe(1);
  });
  it('walking through the ring finds nothing', () => {
    r = make();
    const z = mid('acorn');
    for (let i = 0; i < 90; i++) r.step(1 / 30, { x: z.x - 1 + i * 0.03, y: 0, z: z.z });
    expect(r.progression.state.journal.th6 ?? 0).toBe(0);
  });
  it('all six pay 12 each, once, on their own pages', () => {
    r = make();
    for (const id of Q.TREEHOUSE_FIND_IDS) r.step(3, { x: mid(id).x, y: mid(id).y, z: mid(id).z });
    expect(r.progression.state.points).toBe(72);
    expect(r.heard.filter((e) => e.type === 'treefind')).toHaveLength(6);
  });
  it('under reduced motion the glow does not grow; disposing removes it', () => {
    r = make({ reducedMotion: true });
    r.step(2.5, { x: mid('acorn').x, y: 0, z: mid('acorn').z });
    expect(r.scene.getObjectByName('treehouse:findGlow').scale.x).toBe(1);
    r.life.dispose();
    expect(r.scene.getObjectByName('treehouse:findGlow')).toBeUndefined();
  });
});

describe('three golden mice', () => {
  const GOLD = GOLD_MICE.treehouse;
  it('ids gm-treehouse-1..3, valid, known, in the same order as the plan, and not named in the plan file', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-treehouse-1', 'gm-treehouse-2', 'gm-treehouse-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
    expect(Q.TREEHOUSE_GOLD.map((m) => ({ ...m }))).toEqual(GOLD);
    expect(readFileSync(new URL('../src/world/treehouseplan.js', import.meta.url), 'utf8')).not.toMatch(/gm-treehouse/);
  });
  it('in the bounds, clear of colliders, finds, collectibles, cap spots and the spawn; the ground one on foot, the two up on a perch within the plan\'s hops', () => {
    const b = area0.bounds;
    const area = build(new THREE.Scene());
    for (const g of GOLD) {
      const m = { ...g, y: g.y + P.TREEHOUSE_GROUND.y(g.x, g.z) }; // the mouse's y is metres over the deck or bridge under it: this is its height over the earth
      expect(m.x > b.minX + 2 && m.x < b.maxX - 2 && m.z > b.minZ + 2 && m.z < b.maxZ - 2, m.id).toBe(true);
      if (m.y === 0) for (const c of area0.colliders) expect(near(m, c), m.id).toBeGreaterThan(c.r + 0.5);
      for (const z of Object.values(Z).flat()) if (Math.abs(z.y - m.y) < 0.9) expect(near(m, z), `${m.id} vs a find`).toBeGreaterThan(Math.max(2, z.r + 1));
      for (const k of area.collectibles) expect(near(m, k), `${m.id} vs ${k.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('treehouse')) if (Math.abs(s.y - m.y) < 0.9) expect(near(m, s), `${m.id} vs ${s.id}`).toBeGreaterThanOrEqual(2);
      expect(near(m, area0.spawn), m.id).toBeGreaterThan(15);
      if (m.y === 0) expect(flood.reachesWithin(m.x, m.z, 0.9), `${m.id} reached`).toBe(true);
      else {
        expect(onPerch(m, 0.05), `${m.id} stands on a perch`).toBe(true);
        expect(walkReaches(m.x, m.z, m.y, 0.9), `${m.id} reached on foot`).toBe(true);
      }
    }
    expect(GOLD.map((m) => m.y)).toEqual([0, 0, 0]); // over the ground under each: the roots, the far platform (4.2) and the Crown deck (5.6)
    expect(GOLD.map((m) => P.TREEHOUSE_GROUND.y(m.x, m.z))).toEqual([0, 4.2, 5.6]);
  });
  it('the totals are 71 (Clan) and 47 (everyday): the three count in both editions', () => {
    expect(GOLD_TOTAL).toBe(CLAN_TOTAL);
    expect(goldForEdition('canon', CATALOG).size).toBe(CLAN_TOTAL);
    expect(goldForEdition('legacy', CATALOG).size).toBe(EVERYDAY_TOTAL);
    expect(goldForEdition('legacy', CATALOG).has('gm-treehouse-1')).toBe(true);
  });
});

describe('the Canopy Cap\'s four spots', () => {
  const spots = spotsIn('treehouse');
  it('four, two on the ground and two on decks, 15 m from the spawn, 3 m from both yarn spots, clear of every find ring, inside no collider, reached', () => {
    expect(spots).toHaveLength(4);
    expect(spots.map((s) => s.y)).toEqual([0, 0, 0, 0]); // metres over the ground under each
    expect(spots.map((s) => P.TREEHOUSE_GROUND.y(s.x, s.z))).toEqual([0, 1.4, 2.8, 0]); // two stand on a deck and the landing
    const yarn = PROPSETS?.treehouse ?? [{ x: -4, z: 19 }, { x: 12, z: 10 }];
    for (const s of spots) {
      expect(near(s, area0.spawn), s.id).toBeGreaterThan(15);
      for (const y of yarn) expect(near(s, y), `${s.id} vs yarn`).toBeGreaterThanOrEqual(3);
      for (const z of Object.values(Z).flat()) if (Math.abs(z.y - s.y) < 0.9) expect(near(s, z), `${s.id} vs a find ring`).toBeGreaterThan(z.r + 1);
      for (const c of area0.colliders) expect(near(s, c), s.id).toBeGreaterThan(c.r + 0.3);
      expect(walkReaches(s.x, s.z, P.TREEHOUSE_GROUND.y(s.x, s.z), 0.9), `${s.id} reached on foot`).toBe(true);
    }
  });
});

describe('the six live journal pages', () => {
  afterEach(() => setTreehouse(null));
  it('th1..th6 are live (named, hinted once the chunk is in), the other eight stay hidden placeholders', () => {
    const th = CRITTER_INFO.filter((c) => /^t[hl]\d$/.test(c.id));
    expect(th).toHaveLength(17);
    const LIVE = [...TREEHOUSE_PAGE_IDS, 'tl1', 'tl2', 'tl3', 'th7', 'th8', 'tl4', 'tl5']; // T5 made the two story pages live (test/treehousewing.test.js), T4 made the first three life pages live too (test/treehousecritters.test.js)
    for (const c of th) {
      if (LIVE.includes(c.id)) { expect(c.later, c.id).toBeFalsy(); expect(c.treehouse).toBe(true); expect(c.hint).toMatch(/\S/); } else expect(c.later, c.id).toBe(true);
    }
    expect(th.filter((c) => TREEHOUSE_PAGE_IDS.includes(c.id)).map((c) => c.name)).toEqual(TREEHOUSE_PAGES.map((p) => p[2]));
  });
  it('they draw only behind ?treehouse=1 (the flag is off by default); the hidden ones never draw', () => {
    setTreehouse(false);
    expect(renderJournalHtml({ th1: 1 }, 0, 9)).not.toContain('The Cosy Bakery');
    setTreehouse(true);
    const on = renderJournalHtml({ th1: 1 }, 0, 9);
    expect(on).toContain('The Cosy Bakery');
    expect(on).not.toContain('Treehouse page');
  });
  it('a count draws the name and hint, in the everyday set too', () => {
    setTreehouse(true);
    expect(withOffWords(() => renderJournalHtml({ th3: 1 }, 0, 9))).toContain('The Bell Tower');
  });
});
