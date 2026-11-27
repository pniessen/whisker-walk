// The Jungle lodge, milestone J3: the six discoveries (rule, pay, words, both sets), the six collectibles, the three golden mice (74 and 50), the six live journal pages and the Fern
// Anklet's four spots. Modelled on test/snowvillefinds.test.js. Plan: docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 3.7, 3.8, 3.10.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLAN_TOTAL, EVERYDAY_TOTAL } from './helpers/goldtotals.js';
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
const { JUNGLE_PAGES, JUNGLE_PAGE_IDS } = await import('../src/junglepages.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { setJungle } = await import('../src/jungleflag.js');
const { loadJungleStages, ST } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build } = await import('../src/world/jungle.js');
const F = await import('../src/world/junglefinds.js');
const Q = await import('../src/world/junglefindsplan.js');
const P = await import('../src/world/jungleplan.js');
const { JUNGLE_FIND_LINES, HINTS } = await import('../src/world/junglefindwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { PROPSETS } = await import('../src/propsets.js').catch(() => ({}));
const { isWalkableAt } = await import('../src/player.js');

const Z = Q.JUNGLE_FIND_ZONES;
const spot = (o) => ({ x: 0, z: 32, still: 0, ...o });
const mid = (id) => Z[id][0];
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const area0 = build(new THREE.Scene());
const flood = floodFrom(area0, area0.spawn, (x, z) => isWalkableAt(area0, x, z));
const YARN = PROPSETS?.jungle ?? [{ x: 8, z: 24 }, { x: -22, z: 14 }];

describe('each find is found by its rule', () => {
  it('the ids map to the reserved page ids in order, and every one has a zone, a line and a hint in both sets', () => {
    expect(Q.JUNGLE_FIND_IDS).toEqual(['lodge', 'river', 'sloth', 'canopy', 'rainbow', 'orchid']);
    expect(JUNGLE_PAGES.map((p) => p[2])).toEqual(Q.JUNGLE_FIND_IDS);
    expect(JUNGLE_PAGE_IDS).toEqual(['jl1', 'jl2', 'jl3', 'jl4', 'jl5', 'jl6']);
    for (const id of Q.JUNGLE_FIND_IDS) { expect(Z[id]).toHaveLength(1); expect(F.JUNGLE_FIND_WORDS[id]()).toMatch(/\S/); }
    for (const id of JUNGLE_PAGE_IDS) { expect(HINTS[id], id).toMatch(/\S/); expect(withOffWords(() => HINTS[id])).toBe(HINTS[id]); }
  });
  it('still long enough inside the ring, not before, not outside, not moving', () => {
    for (const id of Q.JUNGLE_FIND_IDS) {
      const z = mid(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still })), id).toBe(id);
      expect(F.findAt(spot({ x: z.x + z.r - 0.05, z: z.z, still: z.still })), `${id} at the rim`).toBe(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still - 0.1 })), `${id} too soon`).toBe(null);
      expect(F.findAt(spot({ x: z.x + z.r + 0.3, z: z.z, still: 9 })), `${id} outside`).toBe(null);
    }
  });
  it('one spot never finds two: the six rings do not overlap', () => {
    for (const a of Q.JUNGLE_FIND_IDS) for (const b of Q.JUNGLE_FIND_IDS) {
      if (a >= b) continue;
      expect(near(mid(a), mid(b)), `${a}/${b}`).toBeGreaterThan(mid(a).r + mid(b).r);
    }
  });
  it('every ring is inside the bounds, clear of every collider at its middle, reached on foot with no skills', () => {
    for (const id of Q.JUNGLE_FIND_IDS) {
      const z = mid(id);
      expect(z.x - z.r).toBeGreaterThan(P.JUNGLE_BOUNDS.minX + 2); expect(z.x + z.r).toBeLessThan(P.JUNGLE_BOUNDS.maxX - 2);
      expect(z.z - z.r).toBeGreaterThan(P.JUNGLE_BOUNDS.minZ + 2); expect(z.z + z.r).toBeLessThan(P.JUNGLE_BOUNDS.maxZ - 2);
      for (const c of area0.colliders) expect(near(z, c), `${id} by a collider`).toBeGreaterThan(c.r + 0.3);
      expect(flood.reachesWithin(z.x, z.z, z.r), `${id} reached`).toBe(true);
    }
  });
  it('the rule reads where she stands and how still, never a skill, and no file here draws a random number or reads a clock', () => {
    for (const f of globSync('src/world/junglefind*.js')) {
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
  it('the award is 12', () => { expect(AWARDS.junglefind).toBe(12); });
  it('the first time ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    expect(F.noteJungleFind('rainbow', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'junglefind', label: phrase('jungle.find.rainbow'), points: 12, key: 'jungle-find-rainbow' });
    expect(F.noteJungleFind('rainbow', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.jl5).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(F.noteJungleFind('rainbow', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.jl5).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteJungleFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.jungleFindKey('sloth')).toBe('jungle-find-sloth');
    spy.mockRestore();
  });
  it('every id counts on its own page and pays 12 the first time', () => {
    Q.JUNGLE_FIND_IDS.forEach((id, i) => {
      const { progression, log } = rig();
      expect(F.noteJungleFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(progression.state.journal[`jl${i + 1}`]).toBe(1);
    });
    for (const id of JUNGLE_PAGE_IDS) expect(JOURNAL_TYPES).toContain(id);
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteJungleFind('sloth', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteJungleFind('sloth', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.jl3).toBe(1);
    expect(progression.state.points).toBe(12);
  });
});

describe('the words', () => {
  const IDS = Object.keys(JUNGLE_FIND_LINES);
  it('every id is a literal phrase id and every line is present', () => {
    for (const id of Q.JUNGLE_FIND_IDS) expect(IDS).toContain(`jungle.find.${id}`);
    expect(IDS).toContain('jungle.berry'); expect(IDS).toContain('jungle.feather');
    for (const f of globSync('src/world/jungle*.js')) {
      for (const [, arg] of readFileSync(f, 'utf8').matchAll(/\bphrase\(\s*(`[^`]*`|[^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
    }
  });
  it('the everyday set has no series word and no literal Clan (no Kit); no line scolds or scares or runs long', () => {
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
    withOffWords(() => { for (const id of IDS) { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id), id).not.toMatch(/\bKit\b/); } });
    for (const id of IDS) { expect(phrase(id).length, id).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); }
    for (const h of Object.values(HINTS)) expect(h, h).not.toMatch(scary);
    for (const id of ['river', 'sloth', 'canopy', 'rainbow', 'orchid']) expect(withOffWords(() => F.JUNGLE_FIND_WORDS[id]())).toBe(F.JUNGLE_FIND_WORDS[id]());
    expect(withOffWords(() => phrase('jungle.find.lodge'))).toBe('You found the Stilt Lodge! The veranda smells of warm wood and ripe fruit.');
    expect(phrase('jungle.find.lodge')).not.toBe(withOffWords(() => phrase('jungle.find.lodge')));
    for (const f of globSync('src/world/junglefind*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bClan\b/);
  });
});

describe('the collectibles', () => {
  const area = build(new THREE.Scene());
  it('six in all, four berries and two feathers, ids unique, each named in the set in use', () => {
    expect(Q.JUNGLE_COLLECTIBLES).toHaveLength(6);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(6);
    expect(area.collectibles.map((c) => c.label)).toEqual(Q.JUNGLE_COLLECTIBLES.map((k) => (k.kind === 'feather' ? 'a bright feather' : 'a jungle berry')));
  });
  it('all in the bounds, reached on foot, clear of colliders, finds, mice (2 m), anklet spots (2 m), yarn (3 m) and the spawn', () => {
    const b = P.JUNGLE_BOUNDS;
    for (const c of area.collectibles) {
      expect(c.x).toBeGreaterThan(b.minX + 2); expect(c.x).toBeLessThan(b.maxX - 2); expect(c.z).toBeGreaterThan(b.minZ + 2); expect(c.z).toBeLessThan(b.maxZ - 2);
      for (const k of area.colliders) expect(near(c, k), c.id).toBeGreaterThan(k.r + 0.5);
      for (const id of Q.JUNGLE_FIND_IDS) expect(near(c, mid(id)), `${c.id} by ${id}`).toBeGreaterThan(mid(id).r + 2);
      for (const m of Q.JUNGLE_GOLD) expect(near(c, m), `${c.id} by ${m.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('jungle')) expect(near(c, s), `${c.id} by ${s.id}`).toBeGreaterThan(2);
      for (const y of YARN) expect(near(c, y), `${c.id} by yarn`).toBeGreaterThan(3);
      expect(near(c, area.spawn), c.id).toBeGreaterThan(5);
      expect(flood.reachesWithin(c.x, c.z, 0.9), `${c.id} reached`).toBe(true);
    }
  });
  it('before the stage is in, the place builds with none (a slot nobody filled answers null)', () => {
    const was = ST.b;
    try { delete ST.b; const bare = build(new THREE.Scene()); expect(bare.collectibles).toEqual([]); } finally { ST.b = was; }
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
    const at = { x: 0, y: 0, z: 32 };
    const sess = { cat: { position: at, rotation: { y: 0 } } };
    const step = (seconds, cat = null) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, null, sess); };
    return { life, scene, progression, log, heard, step, off: () => { off(); life.dispose(); } };
  };
  it('the lodge: 0.6 s of stillness pays 12 once and shows the glow for a moment; Mossy and the light still run', () => {
    r = make();
    const z = mid('lodge');
    r.step(0.3, { x: z.x, y: 0, z: z.z });
    expect(r.progression.state.journal.jl1 ?? 0).toBe(0);
    r.step(1, {});
    expect(r.progression.state.journal.jl1).toBe(1);
    expect(r.progression.state.points).toBe(12);
    expect(r.scene.getObjectByName('jungle:findGlow').visible).toBe(true);
    r.step(5, {});
    expect(r.heard.filter((e) => e.type === 'junglefind')).toHaveLength(1);
    expect(r.scene.getObjectByName('jungle:findGlow').visible).toBe(false);
    expect(r.life.light).toBeTruthy(); expect(r.life.mossy).toBeTruthy();
  });
  it('walking through the ring finds nothing', () => {
    r = make();
    const z = mid('river');
    for (let i = 0; i < 90; i++) r.step(1 / 30, { x: z.x - 1 + i * 0.03, y: 0, z: z.z });
    expect(r.progression.state.journal.jl2 ?? 0).toBe(0);
  });
  it('all six pay 12 each, once, on their own pages', () => {
    r = make();
    for (const id of Q.JUNGLE_FIND_IDS) r.step(3, { x: mid(id).x, y: 0, z: mid(id).z });
    expect(r.progression.state.points).toBe(72);
    expect(r.heard.filter((e) => e.type === 'junglefind')).toHaveLength(6);
  });
  it('under reduced motion the glow does not grow; disposing removes it', () => {
    r = make({ reducedMotion: true });
    r.step(2.5, { x: mid('orchid').x, y: 0, z: mid('orchid').z });
    expect(r.scene.getObjectByName('jungle:findGlow').scale.x).toBe(1);
    r.life.dispose();
    expect(r.scene.getObjectByName('jungle:findGlow')).toBeUndefined();
  });
});

describe('three golden mice', () => {
  const GOLD = GOLD_MICE.jungle;
  it('ids gm-jungle-1..3, valid, known, in the same order as the plan, and not named in the plan file', () => {
    expect(GOLD.map((m) => m.id)).toEqual(['gm-jungle-1', 'gm-jungle-2', 'gm-jungle-3']);
    for (const m of GOLD) { expect(m.id).toMatch(/^gm-[a-z]{1,24}-[1-9]$/); expect(KNOWN_GOLD.has(m.id)).toBe(true); }
    expect(Q.JUNGLE_GOLD.map((m) => ({ ...m }))).toEqual(GOLD);
    expect(readFileSync(new URL('../src/world/jungleplan.js', import.meta.url), 'utf8')).not.toMatch(/gm-jungle/);
  });
  it('in the bounds, clear of colliders, finds, collectibles, anklet spots and the spawn, and reached on foot', () => {
    const b = area0.bounds;
    const area = build(new THREE.Scene());
    for (const m of GOLD) {
      expect(m.x > b.minX + 2 && m.x < b.maxX - 2 && m.z > b.minZ + 2 && m.z < b.maxZ - 2, m.id).toBe(true);
      expect(m.y, m.id).toBe(m.id === 'gm-jungle-3' ? 1.0 : 0); // two on foot, the third on the canopy walk's low branch (J5, one hop: test/junglewing.test.js)
      for (const c of area0.colliders) expect(near(m, c), m.id).toBeGreaterThan(c.r + 0.5);
      for (const z of Object.values(Z).flat()) expect(near(m, z), `${m.id} vs a find`).toBeGreaterThan(Math.max(2, z.r + 1));
      for (const k of area.collectibles) expect(near(m, k), `${m.id} vs ${k.id}`).toBeGreaterThan(2);
      for (const s of spotsIn('jungle')) expect(near(m, s), `${m.id} vs ${s.id}`).toBeGreaterThanOrEqual(2);
      expect(near(m, area0.spawn), m.id).toBeGreaterThan(15);
      expect(flood.reachesWithin(m.x, m.z, 0.9), `${m.id} reached`).toBe(true);
    }
  });
  it('the totals are 74 (Clan) and 50 (everyday): the three count in both editions', () => {
    expect(GOLD_TOTAL).toBe(CLAN_TOTAL);
    expect(goldForEdition('canon', CATALOG).size).toBe(CLAN_TOTAL);
    expect(goldForEdition('legacy', CATALOG).size).toBe(EVERYDAY_TOTAL);
    expect(goldForEdition('legacy', CATALOG).has('gm-jungle-1')).toBe(true);
  });
});

describe('the Fern Anklet\'s four spots', () => {
  const spots = spotsIn('jungle');
  it('four, on the ground, 15 m from the spawn, 3 m from both yarn spots, clear of every find ring, inside no collider, reached on foot', () => {
    expect(spots).toHaveLength(4);
    for (const s of spots) {
      expect(s.y).toBe(0);
      expect(near(s, area0.spawn), s.id).toBeGreaterThan(15);
      for (const y of YARN) expect(near(s, y), `${s.id} vs yarn`).toBeGreaterThanOrEqual(3);
      for (const z of Object.values(Z).flat()) expect(near(s, z), `${s.id} vs a find ring`).toBeGreaterThan(z.r + 1);
      for (const c of area0.colliders) expect(near(s, c), s.id).toBeGreaterThan(c.r + 0.3);
      expect(flood.reachesWithin(s.x, s.z, 0.9), `${s.id} reached`).toBe(true);
    }
  });
});

describe('the six live journal pages', () => {
  afterEach(() => setJungle(null));
  it('jl1..jl6 are live (named, hinted once the chunk is in), the other eight stay hidden placeholders (jw1, jw2, jw5 are the life pages of J4)', () => {
    const jl = CRITTER_INFO.filter((c) => /^j[lw]\d$/.test(c.id));
    expect(jl).toHaveLength(17);
    for (const c of jl) {
      if ([...JUNGLE_PAGE_IDS, 'jw1', 'jw2', 'jw5', 'jl7', 'jl8'].includes(c.id)) { expect(c.later, c.id).toBeFalsy(); expect(c.jungle).toBe(true); expect(c.hint).toMatch(/\S/); } else expect(c.later, c.id).toBe(true);
    }
    expect(jl.filter((c) => JUNGLE_PAGE_IDS.includes(c.id)).map((c) => c.name)).toEqual(JUNGLE_PAGES.map((p) => p[3]));
  });
  it('they draw only behind ?jungle=1 (the flag is off by default); the hidden ones never draw', () => {
    setJungle(false);
    expect(renderJournalHtml({ jl1: 1 }, 0, 9)).not.toContain('The Stilt Lodge');
    setJungle(true);
    const on = renderJournalHtml({ jl1: 1 }, 0, 9);
    expect(on).toContain('The Stilt Lodge');
    expect(on).not.toContain('Jungle page');
  });
  it('a count draws the name and hint, in the everyday set too', () => {
    setJungle(true);
    expect(withOffWords(() => renderJournalHtml({ jl3: 1 }, 0, 9))).toContain('The Sleepy Sloth');
  });
});
