// The Reef, milestone R3: the six discoveries (three live, three ready and inactive until R8), what each pays and says, the eight collectibles, the scenic
// spots, the two word sets, the drawn markers, and the life that notes a find while she stands still.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();

const { createProgression, JOURNAL_TYPES } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { REEF_PAGES, REEF_JOURNAL_TYPES } = await import('../src/reefpages.js');
const { build } = await import('../src/world/reef.js');
const F = await import('../src/world/reeffinds.js');
const Q = await import('../src/world/reeffindsplan.js');
const P = await import('../src/world/reefplan.js');
const { FIND_LINES } = await import('../src/world/reeffindwords.js');
const { phrase } = await import('../src/clanphrases.js');

const Z = Q.REEF_FIND_ZONES;
const spot = (o) => ({ x: 0, z: 36, still: 0, ...o });
const mid = (id) => Z[id][0];

describe('each find is found by its rule', () => {
  it('the ids are the page ids, in order, and every one has a zone and a line', () => {
    expect(Q.REEF_FIND_IDS).toEqual(['boat', 'oyster', 'seahorse', 'cave', 'chest', 'anchor']);
    expect(REEF_PAGES.slice(0, 6).map((p) => p[2])).toEqual(Q.REEF_FIND_IDS);
    for (const id of Q.REEF_FIND_IDS) { expect(Z[id]).toHaveLength(1); expect(F.REEF_FIND_WORDS[id]()).toMatch(/\S/); }
  });
  it('the oyster, the seahorse and the chest are live: still long enough inside the ring, not before, not outside, not moving', () => {
    for (const [id, secs] of [['oyster', 1.2], ['seahorse', 2], ['chest', 0.6]]) {
      const z = mid(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: secs })), id).toBe(id);
      expect(F.findAt(spot({ x: z.x + z.r - 0.05, z: z.z, still: secs })), `${id} at the rim`).toBe(id);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: secs - 0.1 })), `${id} too soon`).toBe(null);
      expect(F.findAt(spot({ x: z.x + z.r + 0.3, z: z.z, still: 9 })), `${id} outside`).toBe(null);
    }
  });
  it('the boat, the anchor and the cave are ready but inactive: the rule finds nothing until R8 turns them on', () => {
    for (const id of ['boat', 'anchor', 'cave']) {
      const z = mid(id);
      expect(z.active, id).toBe(false);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: 9 })), id).toBe(null);
      expect(F.findAt(spot({ x: z.x, z: z.z, still: 9 }), Z, { all: true }), `${id} with all`).toBe(id);
      // switching one on in a copy of the plan finds it, nothing else changes
      const on = { ...Z, [id]: [{ ...z, active: true }] };
      expect(F.findAt(spot({ x: z.x, z: z.z, still: z.still }), on)).toBe(id);
    }
  });
  it('the float height never matters: the rule reads where she stands and how still, not floatY', () => {
    const code = readFileSync('src/world/reeffinds.js', 'utf8').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/floatY/);
    for (const f of globSync('src/world/reef*.js')) expect(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''), f).not.toMatch(/\bfloatY\b/);
  });
  it('one spot never finds two: the six rings do not overlap', () => {
    for (const a of Q.REEF_FIND_IDS) for (const b of Q.REEF_FIND_IDS) {
      if (a >= b) continue;
      expect(Math.hypot(mid(a).x - mid(b).x, mid(a).z - mid(b).z), `${a}/${b}`).toBeGreaterThan(mid(a).r + mid(b).r);
    }
  });
  it('the live zones are on open sand, in the zones the plan names, clear of every collider and the spawn', () => {
    expect(P.zoneAt(mid('oyster').x, mid('oyster').z)).toBe('coral');
    expect(P.zoneAt(mid('seahorse').x, mid('seahorse').z)).toBe('kelp');
    expect(P.zoneAt(mid('chest').x, mid('chest').z)).toBe('flats');
    const cols = P.reefColliders();
    for (const id of Q.REEF_FIND_IDS) {
      const z = mid(id);
      expect(z.x - z.r).toBeGreaterThan(P.REEF_BOUNDS.minX); expect(z.x + z.r).toBeLessThan(P.REEF_BOUNDS.maxX);
      expect(z.z - z.r).toBeGreaterThan(P.REEF_BOUNDS.minZ); expect(z.z + z.r).toBeLessThan(P.REEF_BOUNDS.maxZ);
      for (const c of cols) expect(Math.hypot(z.x - c.x, z.z - c.z), `${id} by a collider`).toBeGreaterThan(c.r);
      expect(Math.hypot(z.x - P.REEF_SPAWN.x, z.z - P.REEF_SPAWN.z), id).toBeGreaterThan(15);
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
  it('the award is the reserved 12', () => { expect(AWARDS.reeffind).toBe(12); });
  it('the first time ever pays 12 and says its line; later walks count once and say nothing', () => {
    const { progression, log } = rig();
    const spy = vi.spyOn(bus, 'emit');
    expect(F.noteReefFind('oyster', { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
    const ev = spy.mock.calls.filter((c) => c[0] === 'discovery');
    expect(ev).toHaveLength(1);
    expect(ev[0][1]).toMatchObject({ type: 'reeffind', label: phrase('reef.find.oyster'), points: 12, key: 'reef-find-oyster' });
    expect(F.noteReefFind('oyster', { log, progression }).fresh).toBe(false);
    expect(progression.state.journal.rfoyster).toBe(1);
    expect(progression.state.points).toBe(12);
    log.startWalk();
    spy.mockClear();
    expect(F.noteReefFind('oyster', { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
    expect(progression.state.journal.rfoyster).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    expect(F.noteReefFind('nope', { log, progression }).fresh).toBe(false);
    expect(F.reefFindKey('chest')).toBe('reef-find-chest');
    spy.mockRestore();
  });
  it('every id counts on its own page and pays 12 the first time (the three inactive ones too: ready for R8)', () => {
    for (const id of Q.REEF_FIND_IDS) {
      const { progression, log } = rig();
      expect(F.noteReefFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(progression.state.journal[`rf${id}`]).toBe(1);
    }
    expect(JOURNAL_TYPES.filter((t) => REEF_JOURNAL_TYPES.includes(t))).toEqual(REEF_JOURNAL_TYPES);
  });
  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = rig();
    F.noteReefFind('chest', { log, progression });
    const entries = log.entries();
    const log2 = createDiscoveryLog(progression);
    log2.startWalk();
    log2.restore(entries);
    expect(F.noteReefFind('chest', { log: log2, progression }).fresh).toBe(false);
    expect(progression.state.journal.rfchest).toBe(1);
    expect(progression.state.points).toBe(12);
  });
  it('two players each find it on their own save', () => {
    const a = rig(); const b = rig();
    expect(F.noteReefFind('seahorse', a).points).toBe(12);
    expect(F.noteReefFind('seahorse', b).points).toBe(12);
  });
});

describe('the words', () => {
  const IDS = Object.keys(FIND_LINES);
  it('every id is a literal phrase id (so the word tables can see it), none is in start-up, every line is present', () => {
    for (const id of ['boat', 'oyster', 'seahorse', 'cave', 'chest', 'anchor']) expect(IDS).toContain(`reef.find.${id}`);
    expect(IDS).toContain('reef.shell'); expect(IDS).toContain('reef.glass');
    for (const f of globSync('src/world/reef*.js')) {
      const src = readFileSync(f, 'utf8');
      for (const [, arg] of src.matchAll(/\bphrase\(\s*([^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
    }
  });
  it('the everyday set is the plain base with no series word; the Clan set adds light flavour only; no line scolds, scares or runs long', () => {
    const scary = /\b(drown\w*|die|dies|dead|hurt|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*)\b/i;
    withOffWords(() => { for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull(); });
    for (const id of IDS) { expect(phrase(id).length, id).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); }
    expect(withOffWords(() => phrase('reef.find.boat'))).toBe('You found the Sunken Boat! Old planks, and a lovely place to hide.');
    expect(phrase('reef.find.boat')).toMatch(/Silverpelt|StarClan/);
    expect(withOffWords(() => phrase('reef.find.seahorse'))).toBe('A tiny seahorse peeks out of the kelp. Hello!');
    for (const id of ['oyster', 'cave', 'chest', 'anchor']) expect(withOffWords(() => F.REEF_FIND_WORDS[id]())).toBe(F.REEF_FIND_WORDS[id]());
  });
});

describe('the collectibles and scenic spots', () => {
  const { scene, area } = (() => { const sc = new THREE.Scene(); return { scene: sc, area: build(sc) }; })();
  it('eight in all, five shells and three pieces of sea-glass, ids unique, each named in the set in use', () => {
    expect(Q.REEF_COLLECTIBLES).toHaveLength(8);
    expect(Q.REEF_COLLECTIBLES.filter((k) => k.kind === 'shell')).toHaveLength(5);
    expect(Q.REEF_COLLECTIBLES.filter((k) => k.kind === 'glass')).toHaveLength(3);
    expect(new Set(area.collectibles.map((c) => c.id)).size).toBe(8);
    expect(area.collectibles.map((c) => c.label)).toEqual(Q.REEF_COLLECTIBLES.map((k) => (k.kind === 'glass' ? 'a piece of sea-glass' : 'a pearly shell')));
  });
  it('all in the bounds and clear of every collider, the spawn, every find ring and every golden mouse (2 m), none in a keep-out middle', () => {
    const b = P.REEF_BOUNDS;
    for (const c of area.collectibles) {
      expect(c.x).toBeGreaterThan(b.minX + 2); expect(c.x).toBeLessThan(b.maxX - 2); expect(c.z).toBeGreaterThan(b.minZ + 2); expect(c.z).toBeLessThan(b.maxZ - 2);
      for (const k of area.colliders) expect(Math.hypot(c.x - k.x, c.z - k.z), c.id).toBeGreaterThan(k.r + 0.5);
      for (const id of Q.REEF_FIND_IDS) expect(Math.hypot(c.x - mid(id).x, c.z - mid(id).z), `${c.id} by ${id}`).toBeGreaterThan(mid(id).r + 2);
      for (const m of Q.REEF_GOLD) expect(Math.hypot(c.x - m.x, c.z - m.z), `${c.id} by ${m.id}`).toBeGreaterThan(2);
      expect(Math.hypot(c.x - area.spawn.x, c.z - area.spawn.z), c.id).toBeGreaterThan(8);
    }
  });
  it('three scenic spots, in the bounds, each in its own zone', () => {
    expect(area.scenics.map((s) => P.zoneAt(s.x, s.z))).toEqual(['kelp', 'coral', 'flats']);
    for (const s of area.scenics) for (const id of Q.REEF_FIND_IDS) expect(Math.hypot(s.x - mid(id).x, s.z - mid(id).z), `${s.id} by ${id}`).toBeGreaterThan(mid(id).r + 1.5);
  });
  it('the three live finds and the two bubble columns are drawn, each in one merged mesh; the shared glow is hidden', () => {
    expect(scene.getObjectByName('reef-find:paint')).toBeTruthy();
    expect(scene.getObjectByName('reef:columns')).toBeTruthy();
    for (const c of Q.BUBBLE_COLUMNS) expect(c.top).toBeGreaterThan(Q.REEF_GOLD.find((m) => m.x === c.x && m.z === c.z).y);
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
    const at = { x: 0, y: 0, z: 36 };
    const camera = new THREE.PerspectiveCamera();
    const step = (seconds, cat = null) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) life.update(1 / 30, 0, at, camera, { cat: { position: at, rotation: { y: 0 } } }); };
    return { life, scene, progression, log, heard, step, off: () => { off(); life.dispose(); } };
  };
  it('the oyster: 1.2 s of stillness pays 12 once, shows the glow for a moment; the lighting and the kelp of R1 still run', () => {
    r = make();
    const z = mid('oyster');
    r.step(0.8, { x: z.x, y: 0, z: z.z });
    expect(r.progression.state.journal.rfoyster ?? 0).toBe(0);
    r.step(1, {});
    expect(r.progression.state.journal.rfoyster).toBe(1);
    expect(r.progression.state.points).toBe(12);
    expect(r.scene.getObjectByName('reef:findGlow').visible).toBe(true);
    r.step(5, {});
    expect(r.progression.state.journal.rfoyster).toBe(1); // once a walk
    expect(r.heard.filter((e) => e.type === 'reeffind')).toHaveLength(1);
    expect(r.scene.getObjectByName('reef:findGlow').visible).toBe(false);
    expect(r.life.air).toBeTruthy(); // R1's life is still returned whole
  });
  it('walking through the ring finds nothing (the stillness starts again whenever she moves)', () => {
    r = make();
    const z = mid('chest');
    for (let i = 0; i < 90; i++) r.step(1 / 30, { x: z.x - 1 + i * 0.03, y: 0, z: z.z });
    expect(r.progression.state.journal.rfchest ?? 0).toBe(0);
  });
  it('the three placeholder finds find nothing even when she stands in them for a while', () => {
    r = make();
    for (const id of ['boat', 'anchor', 'cave']) r.step(10, { x: mid(id).x, y: 0, z: mid(id).z });
    expect(r.progression.state.points).toBe(0);
  });
  it('under reduced motion the glow does not grow; disposing removes it', () => {
    r = make({ reducedMotion: true });
    const z = mid('seahorse');
    r.step(2.5, { x: z.x, y: 0, z: z.z });
    const g = r.scene.getObjectByName('reef:findGlow');
    expect(g.scale.x).toBe(1);
    r.life.dispose();
    expect(r.scene.getObjectByName('reef:findGlow')).toBeUndefined();
  });
});
