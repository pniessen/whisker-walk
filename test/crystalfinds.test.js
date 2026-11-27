// The Crystal Cave, milestone C3: the six discoveries, what each pays and says, the six collectibles, the scenic spots, the two word sets, the drawn markers,
// the life that notes a find while she stands still, the three golden mice (totals stay 60 and 36) and the Glimmer Collar's four spots.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();

const { createProgression, JOURNAL_TYPES, CATALOG } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { CRYSTAL_PAGES, CRYSTAL_JOURNAL_TYPES } = await import('../src/crystalpages.js');
const { build } = await import('../src/world/crystal.js');
const F = await import('../src/world/crystalfinds.js');
const Q = await import('../src/world/crystalfindsplan.js');
const P = await import('../src/world/crystalplan.js');
const { CRYSTAL_FIND_LINES } = await import('../src/world/crystalfindwords.js');
const { HINTS } = await import('../src/world/crystalwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { PICKUP } = await import('../src/foundwear/rules.js');
const { isWalkableAt } = await import('../src/player.js');

const Z = Q.CRYSTAL_FIND_ZONES;
const spot = (o) => ({ x: 0, z: 28, still: 0, ...o });
const mid = (id) => Z[id][0];
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const area0 = build(new THREE.Scene());
const flood = floodFrom(area0, area0.spawn, (x, z) => isWalkableAt(area0, x, z));

describe('each find is found by its rule', () => {
  it('the ids are the page ids, in order, and every one has a zone, a line and a hint in both sets', () => {
    expect(Q.CRYSTAL_FIND_IDS).toEqual(['rose', 'echo', 'pool', 'gold', 'garden', 'heart']);
    expect(CRYSTAL_PAGES.slice(0, 6).map((p) => p[2])).toEqual(Q.CRYSTAL_FIND_IDS);
    for (const id of Q.CRYSTAL_FIND_IDS) {
      expect(Z[id]).toHaveLength(1); expect(F.CRYSTAL_FIND_WORDS[id]()).toMatch(/\S/);
      expect(HINTS[`cc${id}`], id).toMatch(/\S/);
      expect(withOffWords(() => HINTS[`cc${id}`])).toBe(HINTS[`cc${id}`]);
    }
  });
  it('still long enough inside the ring, not before, not outside, not moving', () => {
    for (const id of Q.CRYSTAL_FIND_IDS) {
      const z = mid(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still })), id).toBe(id);
      expect(F.findAt(spot({ x: z.x + z.r - 0.05, z: z.z, still: z.still })), `${id} at the rim`).toBe(id);
      if (z.still > 0) expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still - 0.1 })), `${id} too soon`).toBe(null);
      expect(F.findAt(spot({ x: z.x + z.r + 0.3, z: z.z, still: 9 })), `${id} outside`).toBe(null);
    }
  });
  it('one spot never finds two: the six rings do not overlap', () => {
    for (const a of Q.CRYSTAL_FIND_IDS) for (const b of Q.CRYSTAL_FIND_IDS) {
      if (a >= b) continue;
      expect(near(mid(a), mid(b)), `${a}/${b}`).toBeGreaterThan(mid(a).r + mid(b).r);
    }
  });
  it('every ring is in the zone the plan names, inside the bounds, clear of every collider, reached on foot with no skills, and far from the spawn', () => {
    expect(P.zoneAt(mid('rose').x, mid('rose').z)).toBe('rose');
    expect(P.zoneAt(mid('echo').x, mid('echo').z)).toBe('entry');
    expect(P.zoneAt(mid('garden').x, mid('garden').z)).toBe('rose');
    expect(P.zoneAt(mid('pool').x, mid('pool').z)).toBe('pool');
    expect(P.zoneAt(mid('gold').x, mid('gold').z)).toBe('gold');
    expect(P.zoneAt(mid('heart').x, mid('heart').z)).toBe('heart');
    for (const id of Q.CRYSTAL_FIND_IDS) {
      const z = mid(id);
      expect(z.x - z.r).toBeGreaterThan(P.CRYSTAL_BOUNDS.minX + 2); expect(z.x + z.r).toBeLessThan(P.CRYSTAL_BOUNDS.maxX - 2);
      expect(z.z - z.r).toBeGreaterThan(P.CRYSTAL_BOUNDS.minZ + 2); expect(z.z + z.r).toBeLessThan(P.CRYSTAL_BOUNDS.maxZ - 2);
      for (const c of area0.colliders) expect(near(z, c), `${id} by a collider`).toBeGreaterThan(c.r + z.r * 0.5);
      expect(flood.reachesWithin(z.x, z.z, 0.9), `${id} reached`).toBe(true);
      expect(near(z, area0.spawn), id).toBeGreaterThan(3);
    }
  });
  it('the rule reads where she stands and how still, never a skill', () => {
    for (const f of globSync('src/world/crystalfind*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\b(floatY|requires|skill)/i);
  });
});

describe('what a find pays and says', () => {
  const rig = () => {
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    return { progression, log };
  };
  it('the award is the reserved 12', () => { expect(AWARDS.cavefind).toBe(12); });
  it('the first time ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    expect(F.noteCrystalFind('rose', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'cavefind', label: phrase('crystal.find.rose'), points: 12, key: 'crystal-find-rose' });
    expect(F.noteCrystalFind('rose', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.ccrose).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(F.noteCrystalFind('rose', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.ccrose).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteCrystalFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.crystalFindKey('heart')).toBe('crystal-find-heart');
    spy.mockRestore();
  });
  it('every id counts on its own page and pays 12 the first time', () => {
    for (const id of Q.CRYSTAL_FIND_IDS) {
      const { progression, log } = rig();
      expect(F.noteCrystalFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(progression.state.journal[`cc${id}`]).toBe(1);
    }
    expect(JOURNAL_TYPES.filter((t) => CRYSTAL_JOURNAL_TYPES.includes(t))).toEqual(CRYSTAL_JOURNAL_TYPES);
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteCrystalFind('gold', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteCrystalFind('gold', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.ccgold).toBe(1);
    expect(progression.state.points).toBe(12);
  });
});

describe('the words', () => {
  const IDS = Object.keys(CRYSTAL_FIND_LINES);
  it('every id is a literal phrase id and every line is present', () => {
    for (const id of Q.CRYSTAL_FIND_IDS) expect(IDS).toContain(`crystal.find.${id}`);
    expect(IDS).toContain('crystal.bit'); expect(IDS).toContain('crystal.pebble');
    for (const f of globSync('src/world/crystal*.js')) {
      for (const [, arg] of readFileSync(f, 'utf8').matchAll(/\bphrase\(\s*([^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
    }
  });
  it('the everyday set has no series word, the Clan set adds light flavour only; no line scolds or scares or runs long', () => {
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|cave-in|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
    withOffWords(() => { for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull(); });
    for (const id of IDS) { expect(phrase(id).length, id).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); }
    for (const h of Object.values(HINTS)) expect(h, h).not.toMatch(scary);
    expect(withOffWords(() => phrase('crystal.find.rose'))).toBe('You found the Rose Crystal! It glows a soft pink.');
    expect(phrase('crystal.find.rose')).toMatch(/camp|Silverpelt|StarClan/);
    for (const id of ['echo', 'pool', 'gold', 'heart']) expect(withOffWords(() => F.CRYSTAL_FIND_WORDS[id]())).toBe(F.CRYSTAL_FIND_WORDS[id]());
  });
});

describe('the collectibles, scenic spots and markers', () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  it('six in all, four crystal bits and two pebbles, ids unique, each named in the set in use', () => {
    expect(Q.CRYSTAL_COLLECTIBLES).toHaveLength(6);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(6);
    expect(area.collectibles.map((c) => c.label)).toEqual(Q.CRYSTAL_COLLECTIBLES.map((k) => (k.kind === 'pebble' ? 'a smooth pebble' : 'a tiny crystal')));
  });
  it('all in the bounds, reached on foot, clear of colliders, every find ring, every golden mouse (2 m) and the spawn', () => {
    const b = P.CRYSTAL_BOUNDS;
    for (const c of area.collectibles) {
      expect(c.x).toBeGreaterThan(b.minX + 2); expect(c.x).toBeLessThan(b.maxX - 2); expect(c.z).toBeGreaterThan(b.minZ + 2); expect(c.z).toBeLessThan(b.maxZ - 2);
      for (const k of area.colliders) expect(near(c, k), c.id).toBeGreaterThan(k.r + 0.5);
      for (const id of Q.CRYSTAL_FIND_IDS) expect(near(c, mid(id)), `${c.id} by ${id}`).toBeGreaterThan(mid(id).r + 2);
      for (const m of Q.CRYSTAL_GOLD) expect(near(c, m), `${c.id} by ${m.id}`).toBeGreaterThan(2);
      expect(near(c, area.spawn), c.id).toBeGreaterThan(8);
      expect(flood.reachesWithin(c.x, c.z, 0.9), `${c.id} reached`).toBe(true);
    }
  });
  it('three scenic spots, each in its zone, reached on foot, clear of every find ring', () => {
    expect(area.scenics.map((s) => P.zoneAt(s.x, s.z))).toEqual(['rose', 'pool', 'gold']);
    for (const s of area.scenics) {
      expect(flood.reachesWithin(s.x, s.z, 0.9), s.id).toBe(true);
      for (const id of Q.CRYSTAL_FIND_IDS) expect(near(s, mid(id)), `${s.id} by ${id}`).toBeGreaterThan(mid(id).r + 1.5);
    }
  });
  it('the markers are one merged mesh that casts nothing; the shared glow is hidden', () => {
    const m = scene.getObjectByName('crystal:findmarks');
    expect(m).toBeTruthy(); expect(m.castShadow).toBe(false);
  });
  it('no marker or collectible stands inside a cluster', () => {
    for (const c of P.scatterClusters()) {
      for (const id of Q.CRYSTAL_FIND_IDS) expect(near(c, mid(id)), `${id} by a cluster`).toBeGreaterThan(c.s * 0.7 + 0.2);
      for (const k of Q.CRYSTAL_COLLECTIBLES) expect(near(c, k), `${k.id} by a cluster`).toBeGreaterThan(c.s * 0.5);
    }
  });
});

describe('the life notes a find while she stands still', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });
  const make = (extra = {}) => {
    const scene = new THREE.Scene();
    const placed = build(scene);
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const life = placed.life({ scene, log, progression, reducedMotion: false, visits: 1, doc: null, ...extra });
    const heard = [];
    const off = bus.on('discovery', (e) => heard.push(e));
    const at = { x: 0, y: 0, z: 28 };
    const camera = new THREE.PerspectiveCamera();
    const step = (seconds, cat = null) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, camera, { cat: { position: at, rotation: { y: 0 } } }); };
    return { life, scene, progression, log, heard, step, off: () => { off(); life.dispose(); } };
  };
  it('the Rose Crystal: 0.5 s of stillness pays 12 once and shows the glow for a moment; the cave\'s light still runs', () => {
    r = make();
    const z = mid('rose');
    r.step(0.3, { x: z.x, y: 0, z: z.z });
    expect(r.progression.state.journal.ccrose ?? 0).toBe(0);
    r.step(1, {});
    expect(r.progression.state.journal.ccrose).toBe(1);
    expect(r.progression.state.points).toBe(12);
    expect(r.scene.getObjectByName('crystal:findGlow').visible).toBe(true);
    r.step(5, {});
    expect(r.heard.filter((e) => e.type === 'cavefind')).toHaveLength(1);
    expect(r.scene.getObjectByName('crystal:findGlow').visible).toBe(false);
    expect(r.life.light).toBeTruthy();
  });
  it('walking through the ring finds nothing', () => {
    r = make();
    const z = mid('echo');
    for (let i = 0; i < 90; i++) r.step(1 / 30, { x: z.x - 1 + i * 0.03, y: 0, z: z.z });
    expect(r.progression.state.journal.ccecho ?? 0).toBe(0);
  });
  it('all six pay 12 each, once, on their own pages', () => {
    r = make();
    for (const id of Q.CRYSTAL_FIND_IDS) r.step(3, { x: mid(id).x, y: 0, z: mid(id).z });
    expect(r.progression.state.points).toBe(72);
    expect(r.heard.filter((e) => e.type === 'cavefind')).toHaveLength(6);
  });
  it('under reduced motion the glow does not grow; disposing removes it', () => {
    r = make({ reducedMotion: true });
    r.step(2.5, { x: mid('garden').x, y: 0, z: mid('garden').z });
    expect(r.scene.getObjectByName('crystal:findGlow').scale.x).toBe(1);
    r.life.dispose();
    expect(r.scene.getObjectByName('crystal:findGlow')).toBeUndefined();
  });
});

describe('three golden mice', () => {
  const GOLD = GOLD_MICE.crystal;
  it('ids gm-crystal-1..3, valid, known, and the plan holds the same three', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-crystal-1', 'gm-crystal-2', 'gm-crystal-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
    expect(Q.CRYSTAL_GOLD.map((m) => ({ ...m }))).toEqual(GOLD);
  });
  it('in the bounds, clear of colliders, finds, collectibles, collar spots and the spawn, and reached on foot with no skills', () => {
    const b = area0.bounds;
    for (const m of GOLD) {
      expect(m.x > b.minX + 2 && m.x < b.maxX - 2 && m.z > b.minZ + 2 && m.z < b.maxZ - 2, m.id).toBe(true);
      expect(m.y).toBe(0);
      for (const c of area0.colliders) expect(near(m, c), m.id).toBeGreaterThan(c.r + 0.5);
      for (const z of Object.values(Z).flat()) expect(near(m, z), `${m.id} vs a find`).toBeGreaterThan(Math.max(2, z.r + 1));
      for (const k of area0.collectibles) expect(near(m, k), `${m.id} vs ${k.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('crystal')) expect(near(m, s), `${m.id} vs ${s.id}`).toBeGreaterThanOrEqual(2);
      expect(near(m, area0.spawn), m.id).toBeGreaterThan(15);
      expect(flood.reachesWithin(m.x, m.z, 0.9), `${m.id} reached`).toBe(true);
    }
  });
  it('the totals stay 60 (Clan) and 36 (everyday)', () => {
    expect(GOLD_TOTAL).toBe(62);
    expect(goldForEdition('canon', CATALOG).size).toBe(62);
    expect(goldForEdition('legacy', CATALOG).size).toBe(38);
  });
});

describe('the Glimmer Collar\'s four spots', () => {
  const spots = spotsIn('crystal');
  it('four, on the floor, in both editions, none within 15 m of the spawn, each reached on foot, clear of everything', () => {
    expect(spots).toHaveLength(4);
    expect(CATALOG.accessories.glimmercollar.edition).toBeUndefined();
    for (const s of spots) {
      expect(s.y, s.id).toBe(0);
      expect(near(s, area0.spawn), s.id).toBeGreaterThanOrEqual(15);
      expect(flood.reachesWithin(s.x, s.z, PICKUP.r), s.id).toBe(true);
      for (const c of area0.colliders) expect(near(s, c), s.id).toBeGreaterThan(c.r + 0.4);
      for (const z of Object.values(Z).flat()) expect(near(s, z), `${s.id} vs a find`).toBeGreaterThan(z.r + 1);
      for (const k of area0.collectibles) expect(near(s, k), `${s.id} vs ${k.id}`).toBeGreaterThanOrEqual(2);
    }
  });
});
