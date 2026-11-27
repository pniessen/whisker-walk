// Snowville, milestone V3: the six discoveries (rule, pay, words, both sets), the six collectibles, three scenic spots, the three golden mice (68 and 44), the six live journal pages and the
// Snowflake Scarf's four spots. Plan: docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 1.7, 1.8, 1.10.
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
const { SNOWVILLE_PAGES, SNOWVILLE_PAGE_IDS } = await import('../src/snowvillepages.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { setSnowville } = await import('../src/snowvilleflag.js');
const { loadSnowvilleStages, ST } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const F = await import('../src/world/snowvillefinds.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const P = await import('../src/world/snowvilleplan.js');
const { SNOWVILLE_FIND_LINES, HINTS } = await import('../src/world/snowvillefindwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { PROPSETS } = await import('../src/propsets.js').catch(() => ({}));
const { isWalkableAt } = await import('../src/player.js');

const Z = Q.SNOWVILLE_FIND_ZONES;
const spot = (o) => ({ x: 0, z: 30, still: 0, ...o });
const mid = (id) => Z[id][0];
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const area0 = build(new THREE.Scene());
const flood = floodFrom(area0, area0.spawn, (x, z) => isWalkableAt(area0, x, z));

describe('each find is found by its rule', () => {
  it('the ids map to the reserved page ids in order, and every one has a zone, a line and a hint in both sets', () => {
    expect(Q.SNOWVILLE_FIND_IDS).toEqual(['lantern', 'pond', 'hare', 'fir', 'snowman', 'hearth']);
    expect(SNOWVILLE_PAGES.map((p) => p[2])).toEqual(Q.SNOWVILLE_FIND_IDS);
    expect(SNOWVILLE_PAGE_IDS).toEqual(['sv1', 'sv2', 'sv3', 'sv4', 'sv5', 'sv6']);
    for (const id of Q.SNOWVILLE_FIND_IDS) {
      expect(Z[id]).toHaveLength(1); expect(F.SNOWVILLE_FIND_WORDS[id]()).toMatch(/\S/);
    }
    for (const id of SNOWVILLE_PAGE_IDS) {
      expect(HINTS[id], id).toMatch(/\S/);
      expect(withOffWords(() => HINTS[id])).toBe(HINTS[id]);
    }
  });
  it('still long enough inside the ring, not before, not outside, not moving', () => {
    for (const id of Q.SNOWVILLE_FIND_IDS) {
      const z = mid(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still })), id).toBe(id);
      expect(F.findAt(spot({ x: z.x + z.r - 0.05, z: z.z, still: z.still })), `${id} at the rim`).toBe(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still - 0.1 })), `${id} too soon`).toBe(null);
      expect(F.findAt(spot({ x: z.x + z.r + 0.3, z: z.z, still: 9 })), `${id} outside`).toBe(null);
    }
  });
  it('one spot never finds two: the six rings do not overlap', () => {
    for (const a of Q.SNOWVILLE_FIND_IDS) for (const b of Q.SNOWVILLE_FIND_IDS) {
      if (a >= b) continue;
      expect(near(mid(a), mid(b)), `${a}/${b}`).toBeGreaterThan(mid(a).r + mid(b).r);
    }
  });
  it('every ring is inside the bounds, clear of every collider, reached on foot with no skills (the ones the later stage draws are on bare snow now)', () => {
    for (const id of Q.SNOWVILLE_FIND_IDS) {
      const z = mid(id);
      expect(z.x - z.r).toBeGreaterThan(P.SNOWVILLE_BOUNDS.minX + 2); expect(z.x + z.r).toBeLessThan(P.SNOWVILLE_BOUNDS.maxX - 2);
      expect(z.z - z.r).toBeGreaterThan(P.SNOWVILLE_BOUNDS.minZ + 2); expect(z.z + z.r).toBeLessThan(P.SNOWVILLE_BOUNDS.maxZ - 2);
      // the snowman's and the brazier's rings stand round the solid thing itself; the others' middles are on open snow
      if (id !== 'snowman' && id !== 'hearth') for (const c of area0.colliders) expect(near(z, c), `${id} by a collider`).toBeGreaterThan(c.r + 0.3);
      expect(flood.reachesWithin(z.x, z.z, z.r), `${id} reached`).toBe(true);
    }
  });
  it('the rule reads where she stands and how still, never a skill, and no file here draws a random number or reads a clock', () => {
    for (const f of globSync('src/world/snowvillefind*.js')) {
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
  it('the award is 12', () => { expect(AWARDS.snowfind).toBe(12); });
  it('the first time ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    expect(F.noteSnowvilleFind('hearth', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'snowfind', label: phrase('snowville.find.hearth'), points: 12, key: 'snowville-find-hearth' });
    expect(F.noteSnowvilleFind('hearth', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.sv6).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(F.noteSnowvilleFind('hearth', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.sv6).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteSnowvilleFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.snowvilleFindKey('fir')).toBe('snowville-find-fir');
    spy.mockRestore();
  });
  it('every id counts on its own page and pays 12 the first time', () => {
    Q.SNOWVILLE_FIND_IDS.forEach((id, i) => {
      const { progression, log } = rig();
      expect(F.noteSnowvilleFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(progression.state.journal[`sv${i + 1}`]).toBe(1);
    });
    for (const id of SNOWVILLE_PAGE_IDS) expect(JOURNAL_TYPES).toContain(id);
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteSnowvilleFind('fir', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteSnowvilleFind('fir', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.sv4).toBe(1);
    expect(progression.state.points).toBe(12);
  });
});

describe('the words', () => {
  const IDS = Object.keys(SNOWVILLE_FIND_LINES);
  it('every id is a literal phrase id and every line is present', () => {
    for (const id of Q.SNOWVILLE_FIND_IDS) expect(IDS).toContain(`snowville.find.${id}`);
    expect(IDS).toContain('snowville.cone'); expect(IDS).toContain('snowville.berry');
    for (const f of globSync('src/world/snowville*.js')) {
      for (const [, arg] of readFileSync(f, 'utf8').matchAll(/\bphrase\(\s*(`[^`]*`|[^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
    }
  });
  it('the everyday set has no series word and no literal Clan; no line scolds or scares or runs long', () => {
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
    withOffWords(() => { for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull(); });
    for (const id of IDS) { expect(phrase(id).length, id).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); }
    for (const h of Object.values(HINTS)) expect(h, h).not.toMatch(scary);
    for (const id of ['lantern', 'pond', 'fir', 'snowman']) expect(withOffWords(() => F.SNOWVILLE_FIND_WORDS[id]())).toBe(F.SNOWVILLE_FIND_WORDS[id]());
    expect(withOffWords(() => phrase('snowville.find.hearth'))).toBe('You found the Warm Hearth! The fire crackles and your paws thaw.');
    expect(phrase('snowville.find.hearth')).not.toBe(withOffWords(() => phrase('snowville.find.hearth')));
    for (const f of globSync('src/world/snowvillefind*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bClan\b/);
  });
});

describe('the collectibles and scenic spots', () => {
  const area = build(new THREE.Scene());
  it('six in all, four pinecones and two berries, ids unique, each named in the set in use', () => {
    expect(Q.SNOWVILLE_COLLECTIBLES).toHaveLength(6);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(6);
    expect(area.collectibles.map((c) => c.label)).toEqual(Q.SNOWVILLE_COLLECTIBLES.map((k) => (k.kind === 'berry' ? 'a red winter berry' : 'a pinecone')));
  });
  it('all in the bounds, reached on foot, clear of colliders, finds, mice (2 m), found-scarf spots (2 m) and the spawn', () => {
    const b = P.SNOWVILLE_BOUNDS;
    for (const c of area.collectibles) {
      expect(c.x).toBeGreaterThan(b.minX + 2); expect(c.x).toBeLessThan(b.maxX - 2); expect(c.z).toBeGreaterThan(b.minZ + 2); expect(c.z).toBeLessThan(b.maxZ - 2);
      for (const k of area.colliders) expect(near(c, k), c.id).toBeGreaterThan(k.r + 0.5);
      for (const id of Q.SNOWVILLE_FIND_IDS) expect(near(c, mid(id)), `${c.id} by ${id}`).toBeGreaterThan(mid(id).r + 2);
      for (const m of Q.SNOWVILLE_GOLD) expect(near(c, m), `${c.id} by ${m.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('snowville')) expect(near(c, s), `${c.id} by ${s.id}`).toBeGreaterThan(2);
      expect(near(c, area.spawn), c.id).toBeGreaterThan(5);
      expect(flood.reachesWithin(c.x, c.z, 0.9), `${c.id} reached`).toBe(true);
    }
  });
  it('three scenic spots, reached on foot, clear of every find ring', () => {
    expect(area.scenics).toHaveLength(3);
    for (const s of area.scenics) {
      expect(flood.reachesWithin(s.x, s.z, 0.9), s.id).toBe(true);
      for (const id of Q.SNOWVILLE_FIND_IDS) expect(near(s, mid(id)), `${s.id} by ${id}`).toBeGreaterThan(mid(id).r + 1.5);
    }
  });
  it('before the stage is in, the place builds with none (a slot nobody filled answers null)', () => {
    const was = ST.b;
    try { delete ST.b; const bare = build(new THREE.Scene()); expect(bare.collectibles).toEqual([]); expect(bare.scenics).toEqual([]); } finally { ST.b = was; }
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
    const life = placed.life({ scene, log, progression, reducedMotion: false, tier: null, sendEvent: () => {}, ...extra });
    const heard = [];
    const off = bus.on('discovery', (e) => heard.push(e));
    const at = { x: 0, y: 0, z: 28 };
    const sess = { cat: { position: at, rotation: { y: 0 } } };
    const step = (seconds, cat = null) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, null, sess); };
    return { life, scene, progression, log, heard, step, off: () => { off(); life.dispose(); } };
  };
  it('the snowman: 0.5 s of stillness pays 12 once and shows the glow for a moment; Tilly and the light still run', () => {
    r = make();
    const z = mid('snowman');
    r.step(0.3, { x: z.x, y: 0, z: z.z });
    expect(r.progression.state.journal.sv5 ?? 0).toBe(0);
    r.step(1, {});
    expect(r.progression.state.journal.sv5).toBe(1);
    expect(r.progression.state.points).toBe(12);
    expect(r.scene.getObjectByName('snowville:findGlow').visible).toBe(true);
    r.step(5, {});
    expect(r.heard.filter((e) => e.type === 'snowfind')).toHaveLength(1);
    expect(r.scene.getObjectByName('snowville:findGlow').visible).toBe(false);
    expect(r.life.light).toBeTruthy(); expect(r.life.tilly).toBeTruthy();
  });
  it('walking through the ring finds nothing', () => {
    r = make();
    const z = mid('pond');
    for (let i = 0; i < 90; i++) r.step(1 / 30, { x: z.x - 1 + i * 0.03, y: 0, z: z.z });
    expect(r.progression.state.journal.sv2 ?? 0).toBe(0);
  });
  it('all six pay 12 each, once, on their own pages', () => {
    r = make();
    for (const id of Q.SNOWVILLE_FIND_IDS) r.step(3, { x: mid(id).x, y: 0, z: mid(id).z });
    expect(r.progression.state.points).toBe(72);
    expect(r.heard.filter((e) => e.type === 'snowfind')).toHaveLength(6);
  });
  it('under reduced motion the glow does not grow; disposing removes it', () => {
    r = make({ reducedMotion: true });
    r.step(2.5, { x: mid('hearth').x, y: 0, z: mid('hearth').z });
    expect(r.scene.getObjectByName('snowville:findGlow').scale.x).toBe(1);
    r.life.dispose();
    expect(r.scene.getObjectByName('snowville:findGlow')).toBeUndefined();
  });
});

describe('three golden mice', () => {
  const GOLD = GOLD_MICE.snowville;
  it('ids gm-snowville-1..3, valid, known, in the same order as the plan, and not in KEEP_OUT by name', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-snowville-1', 'gm-snowville-2', 'gm-snowville-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
    expect(Q.SNOWVILLE_GOLD.map((m) => ({ ...m }))).toEqual(GOLD);
    expect(readFileSync(new URL('../src/world/snowvilleplan.js', import.meta.url), 'utf8')).not.toMatch(/gm-snowville/);
  });
  it('in the bounds, clear of colliders, finds, collectibles, scarf spots and the spawn, and reached on foot', () => {
    const b = area0.bounds;
    const area = build(new THREE.Scene());
    for (const m of GOLD) {
      expect(m.x > b.minX + 2 && m.x < b.maxX - 2 && m.z > b.minZ + 2 && m.z < b.maxZ - 2, m.id).toBe(true);
      expect(m.y).toBe(m.id === 'gm-snowville-3' ? 1.0 : 0); // V5: the third is on the hill rock, one hop (test/snowvillewing.test.js climbs it)
      if (m.y === 0) for (const c of area0.colliders) expect(near(m, c), m.id).toBeGreaterThan(c.r + 0.5);
      for (const z of Object.values(Z).flat()) expect(near(m, z), `${m.id} vs a find`).toBeGreaterThan(Math.max(2, z.r + 1));
      for (const k of area.collectibles) expect(near(m, k), `${m.id} vs ${k.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('snowville')) expect(near(m, s), `${m.id} vs ${s.id}`).toBeGreaterThanOrEqual(2);
      expect(near(m, area0.spawn), m.id).toBeGreaterThan(15);
      if (m.y === 0) expect(flood.reachesWithin(m.x, m.z, 0.9), `${m.id} reached`).toBe(true);
    }
  });
  it('the totals are 68 (Clan) and 44 (everyday): the three count in both editions', () => {
    expect(GOLD_TOTAL).toBe(68);
    expect(goldForEdition('canon', CATALOG).size).toBe(68);
    expect(goldForEdition('legacy', CATALOG).size).toBe(44);
    expect(goldForEdition('legacy', CATALOG).has('gm-snowville-1')).toBe(true);
  });
});

describe('the Snowflake Scarf\'s four spots', () => {
  const spots = spotsIn('snowville');
  it('four, on the ground, 15 m from the spawn, 3 m from both yarn spots, 2 m from every find ring, inside no collider, reached on foot', () => {
    expect(spots).toHaveLength(4);
    const yarn = PROPSETS?.snowville ?? [{ x: 8, z: 22 }, { x: -22, z: 12 }];
    for (const s of spots) {
      expect(s.y).toBe(0);
      expect(near(s, area0.spawn), s.id).toBeGreaterThan(15);
      for (const y of yarn) expect(near(s, y), `${s.id} vs yarn`).toBeGreaterThanOrEqual(3);
      for (const z of Object.values(Z).flat()) expect(near(s, z), `${s.id} vs a find ring`).toBeGreaterThan(z.r + 1);
      for (const c of area0.colliders) expect(near(s, c), s.id).toBeGreaterThan(c.r + 0.3);
      expect(flood.reachesWithin(s.x, s.z, 0.9), `${s.id} reached`).toBe(true);
    }
  });
});

describe('the six live journal pages', () => {
  afterEach(() => setSnowville(null));
  it('sv1..sv6 are live (named, hinted once the chunk is in), the other eight stay hidden placeholders', () => {
    const sv = CRITTER_INFO.filter((c) => /^s[vw]\d$/.test(c.id));
    const LIVE = [...SNOWVILLE_PAGE_IDS, 'sw1', 'sw2', 'sw3', 'sv7', 'sv8']; // V5 made the two story pages live (test/snowvillewing.test.js) // V4 made the first three life pages live too (test/snowvillecritters.test.js)
    expect(sv).toHaveLength(17);
    for (const c of sv) {
      if (LIVE.includes(c.id)) { expect(c.later, c.id).toBeFalsy(); expect(c.snowville).toBe(true); expect(c.hint).toMatch(/\S/); } else expect(c.later, c.id).toBe(true);
    }
    expect(sv.filter((c) => SNOWVILLE_PAGE_IDS.includes(c.id)).map((c) => c.name)).toEqual(SNOWVILLE_PAGES.map((p) => p[3]));
  });
  it('they draw behind the switch and hide with ?snowville=0; the hidden ones never draw', () => {
    setSnowville(true);
    const on = renderJournalHtml({ sv1: 1 }, 0, 9);
    expect(on).toContain('The Hill Lantern');
    expect(on).not.toContain('Snowville page');
    setSnowville(false);
    expect(renderJournalHtml({ sv1: 1 }, 0, 9)).not.toContain('The Hill Lantern');
  });
  it('a count draws the name and hint, in the everyday set too', () => {
    setSnowville(true);
    expect(withOffWords(() => renderJournalHtml({ sv3: 1 }, 0, 9))).toContain('The Shy Hare');
  });
});
