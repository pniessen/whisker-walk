// The Treehouse village, milestone T7 (Replay): Nutmeg's post round of the day. The plan is a pure function of the room seed (identical for two co-walkers, never saved), once-a-walk pay,
// no failure, the stamp album's bits (OR on merge), every errand spot reachable on foot or by the planned hops and clear of the finds, the mice and the story's places, carried things never
// saved, an errand done by anyone in the room credited through a `th-job` event, the two journal pages, both word sets. Modelled on test/snowvillejob.test.js.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();

const { createProgression, CATALOG, sanitizeSave } = await import('../src/progression.js');
const { mergeSaves, useSaveTools } = await import('../src/catmerge.js');
const { mergeColony } = await import('../src/colony.js');
const { mergeUsage } = await import('../src/usage.js');
const { sanitizeMarks, MARK_AREAS } = await import('../src/marks.js');
const { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } = await import('../src/customcats.js');
const { OUTFIT_IDS, sameWear } = await import('../src/outfits.js');
const { AWARDS } = await import('../src/discoveries.js');
const { phrase } = await import('../src/clanphrases.js');
const { loadTreehouseStages, ST } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const E = await import('../src/world/treehousejob.js');
const P = await import('../src/world/treehouseplan.js');
const W = await import('../src/world/treehousewingplan.js');
const Q = await import('../src/world/treehousefindsplan.js');
const { TREEHOUSE_JOB_LINES: LINES, HINTS } = await import('../src/world/treehousejobwords.js');
const { createTreeErrandLive } = await import('../src/world/treehousejoblive.js');
const { TREEHOUSE_HINTS, TREEHOUSE_JOB_PAGES } = await import('../src/treehousepages.js');
const { renderJournalHtml } = await import('../src/journal.js');
const { setTreehouse } = await import('../src/treehouseflag.js');
const { isWalkableAt } = await import('../src/player.js');

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const B = P.TREEHOUSE_BOUNDS;

describe('the plan', () => {
  it('is deterministic from the seed, identical for two co-walkers, and covers all five errands', () => {
    for (const seed of [1, 77, 123456, 987654321]) expect(E.planTreeErrand(seed, 3)).toEqual(E.planTreeErrand(seed, 99));
    const kinds = new Set();
    for (let s = 1; s < 400; s++) { const p = E.planTreeErrand(s * 7919, 0); kinds.add(p.kind); expect(p.spot).toBeLessThan(6); }
    expect([...kinds].sort()).toEqual([...E.ERRAND_KINDS].sort());
    const solo = new Set();
    for (let v = 0; v < 40; v++) { const a = E.planTreeErrand(undefined, v); expect(a).toEqual(E.planTreeErrand(undefined, v)); solo.add(a.kind); }
    expect(solo.size).toBeGreaterThan(2);
    expect(E.planTreeErrand(NaN, NaN).kind).toBeTruthy();
  });
  it('the constants copy the plan\'s own: the acorns, the post box, the lanterns on perches', () => {
    expect([...E.ACORN_IDS]).toEqual(Q.TREEHOUSE_COLLECTIBLES.filter((c) => c.kind === 'acorn').map((c) => c.id));
    expect(E.ACORNS_NEEDED).toBeLessThanOrEqual(E.ACORN_IDS.length);
    expect(Math.hypot(E.PARCEL.x - P.ANCHORS.postBox.x, E.PARCEL.z - P.ANCHORS.postBox.z)).toBeLessThan(3);
    for (const L of E.LANTERNS) expect(P.TREEHOUSE_PERCHES.some((p) => Math.hypot(p.x - L.x, p.z - L.z) < 0.05 && p.y === L.y), JSON.stringify(L)).toBe(true);
    expect(P.TREEHOUSE_PERCHES.some((p) => Math.hypot(p.x - E.OWL_PERCH.x, p.z - E.OWL_PERCH.z) < 1.1 && p.y === E.OWL_PERCH.y)).toBe(true);
    expect(P.TREEHOUSE_PERCHES.some((p) => Math.hypot(p.x - E.POSTCARD.x, p.z - E.POSTCARD.z) < 1.1 && p.y === E.POSTCARD.y)).toBe(true);
  });
  it('every spot is in bounds, clear of the finds, the mice and the story\'s places, and reachable (on foot, or within a hop of a perch the no-skills test reaches)', () => {
    const area = build(new THREE.Scene());
    const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
    const rep = P.reachReport();
    expect(rep.missing).toEqual([]);
    const avoid = [...Object.values(Q.TREEHOUSE_FIND_ZONES).flat(), ...Q.TREEHOUSE_GOLD, P.TREEHOUSE_SPAWN, W.BASKET, W.BAG, P.ANCHORS.postBox];
    for (const s of E.SPOTS) {
      expect(s.x > B.minX + 2 && s.x < B.maxX - 2 && s.z > B.minZ + 2 && s.z < B.maxZ - 2, JSON.stringify(s)).toBe(true);
      expect(flood.reachesWithin(s.x, s.z, 1), JSON.stringify(s)).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r, JSON.stringify(s)).toBeGreaterThan(1.2);
      for (const a of avoid) expect(Math.hypot(s.x - a.x, s.z - a.z), `${JSON.stringify(s)} vs ${JSON.stringify(a)}`).toBeGreaterThan(2.4);
    }
    expect(flood.reachesWithin(E.PARCEL.x, E.PARCEL.z, 1.0)).toBe(true);
    for (const s of [E.BELL_DOOR, E.POSTCARD, E.OWL_PERCH, E.BAKERY, ...E.LANTERNS]) {
      const near = P.TREEHOUSE_PERCHES.some((p) => Math.abs(p.y - s.y) < 0.01 && Math.hypot(p.x - s.x, p.z - s.z) <= 1.3);
      expect(near, JSON.stringify(s)).toBe(true);
      expect(s.x > B.minX && s.x < B.maxX && s.z > B.minZ && s.z < B.maxZ).toBe(true);
    }
  });
  it('the lanterns light in order only, never backwards, never a failure', () => {
    const L = E.LANTERNS;
    expect(E.lanternStep(0, { x: L[2].x, z: L[2].z, y: L[2].y })).toBe(0); // out of order does nothing
    let n = 0;
    for (const l of L) n = E.lanternStep(n, { x: l.x, z: l.z, y: l.y });
    expect(n).toBe(5);
    expect(E.lanternStep(0, { x: L[0].x, z: L[0].z, y: 0 })).toBe(0); // the ground under a deck is not the deck
    expect(E.lanternStep(NaN, null)).toBe(0); expect(E.lanternStep(9, { x: 0, z: 0 })).toBe(5);
  });
});

describe('the album', () => {
  it('twelve stamps; the lowest unset bit is paid; a full album pays no more; junk is repaired', () => {
    expect(E.ALBUM).toHaveLength(12);
    let bits = 0;
    for (let i = 0; i < 12; i++) { expect(E.nextStamp(bits)).toBe(i); bits = E.withStamp(bits, i); }
    expect(bits).toBe(4095);
    expect(E.nextStamp(bits)).toBe(-1);
    expect(E.albumCount(bits)).toBe(12);
    expect(E.withStamp(5, 99)).toBe(5);
    expect(E.nextStamp(-3)).toBe(0); expect(E.albumCount(NaN)).toBe(0); expect(E.albumCount(1e12)).toBeLessThanOrEqual(12);
  });
  it('two devices OR their stamps and cannot lift the album past 12 bits', () => {
    const f = (treehouse) => sanitizeSave({ version: 4, treehouse });
    expect(mergeSaves({ local: f({ step: 7, letters: 7, album: 5 }), cloud: f({ step: 7, letters: 7, album: 10 }) }).save.treehouse.album).toBe(15);
    expect(mergeSaves({ local: f({ step: 7, album: 3 }), cloud: { version: 4, treehouse: { step: 7, album: 1e12 } } }).save.treehouse.album).toBeLessThanOrEqual(4095);
  });
});

function rig({ step = 7, album = 0, seed, visits = 0, kind, paid = 0 } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.treehouse = { step, letters: 7, album };
  progression.addPoints(0);
  const scene = new THREE.Scene();
  const awards = [];
  const sent = [];
  const log = { awardOnce: (type, key, text) => { if (log.seen.has(key)) return 0; log.seen.add(key); awards.push({ type, key, text }); return AWARDS[type]; }, count: (k) => (log.seen.has(k) ? 1 : 0), mark() {}, seen: new Set(paid ? ['treehouse-errand'] : []) };
  const meshes = new Map(Q.TREEHOUSE_COLLECTIBLES.map((c) => [c.id, {}]));
  const session = { cat: { rotation: { y: 0 } }, collectibleMeshes: meshes };
  let s = seed;
  if (kind) { for (s = 1; E.planTreeErrand(s * 31, 0).kind !== kind; s++); s *= 31; }
  const live = createTreeErrandLive({ scene, progression, log, roomSeed: s, visits, send: (ev) => sent.push(ev) });
  const tick = (cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) live.update(dt, i * dt, cat, null, session); };
  const at = (x, z, y = 0) => ({ x, z, y });
  return { progression, scene, awards, sent, log, meshes, session, live, tick, at };
}
const press = (r, cat) => { r.tick(cat, 1); const line = r.live.promptAt(cat); return { line, k: line ? r.live.interact() : null }; };
const atP = (r, p, dx = 0) => r.at(p.x + dx, p.z, p.y);

describe('on a walk: each errand, once, with no way to fail', () => {
  it('is offered only from the walk after the story', () => {
    const r = rig({ step: 6, kind: 'stamp' });
    const g = E.SPOTS[r.live.plan.spot];
    r.tick(r.at(0, 25), 100);
    expect(r.live.state.eligible).toBe(false);
    expect(r.live.promptAt(r.at(g.x, g.z))).toBeNull();
    expect(r.live.credit(E.JOB_WIRE)).toBeNull();
    expect(r.awards).toEqual([]);
    expect(r.live.props).toEqual([]);
  });
  it('acorns: three of the four, then Interact at the Bakery (a short hand makes no offer, never scolds)', () => {
    const r = rig({ kind: 'acorns' });
    const cat = atP(r, E.BAKERY, 1);
    r.tick(cat, 2);
    expect(press(r, cat).line).toBeNull();
    r.meshes.delete('tree-1'); r.meshes.delete('tree-2');
    expect(press(r, cat).line).toBeNull(); expect(r.awards).toEqual([]);
    r.meshes.delete('tree-4');
    expect(press(r, r.at(E.BAKERY.x + 1, E.BAKERY.z, 0)).line).toBeNull(); // the roots under the deck are not the deck
    expect(press(r, r.at(20, -10)).line).toBeNull();
    expect(press(r, cat).k).toBe('acorns');
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ type: 'treejob', key: 'treehouse-errand' });
    expect(r.progression.state.treehouse.album).toBe(1);
    expect(r.progression.state.treehouse.step).toBe(7); // nothing else in the story record moved
    expect(r.progression.state.treehouse.letters).toBe(7);
    expect(r.sent).toEqual([{ kind: 'th-job' }]);
  });
  it('stamp: the seed\'s place, Interact beside it', () => {
    const r = rig({ kind: 'stamp' });
    const g = E.SPOTS[r.live.plan.spot];
    expect(press(r, r.at(g.x + 8, g.z)).line).toBeNull();
    expect(r.live.props).toHaveLength(1);
    expect(press(r, r.at(g.x + 1, g.z)).k).toBe('stamp');
    expect(r.awards).toHaveLength(1);
    expect(r.progression.state.treehouse.album).toBe(1);
  });
  it('lanterns: five in order, up the planned hops, then paid; out of order does nothing', () => {
    const r = rig({ kind: 'lanterns' });
    expect(r.live.props).toHaveLength(5);
    r.tick(atP(r, E.LANTERNS[3]), 3);
    expect(r.live.state.lit).toBe(0);
    for (let i = 0; i < 4; i++) { r.tick(atP(r, E.LANTERNS[i]), 2); expect(r.live.state.lit).toBe(i + 1); expect(r.awards).toEqual([]); }
    r.tick(atP(r, E.LANTERNS[4]), 2);
    expect(r.awards).toHaveLength(1);
    expect(r.live.state.lit).toBe(5);
    expect(r.progression.state.treehouse.album).toBe(1);
  });
  it('parcel: from the post box to the Bell Tower door, and a carried parcel is not kept past the walk', () => {
    const r = rig({ kind: 'parcel' });
    expect(press(r, atP(r, E.BELL_DOOR)).line).toBeNull(); // nothing to give yet
    expect(press(r, atP(r, E.PARCEL, 0.5)).k).toBe('pick');
    expect(r.live.state.item).toBe('carried');
    expect(JSON.stringify(r.progression.state)).not.toMatch(/parcel|carried/);
    expect(press(r, r.at(E.BELL_DOOR.x, E.BELL_DOOR.z, 0)).line).toBeNull(); // the roots under the deck are not the deck
    expect(press(r, atP(r, E.BELL_DOOR, 0.5)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
    expect(r.live.state.item).toBe('given');
    const c = rig({ kind: 'parcel' });
    press(c, atP(c, E.PARCEL));
    c.live.dispose(); // the walk ends carrying it
    expect(c.progression.state.treehouse.album).toBe(0);
    expect(rig({ kind: 'parcel' }).live.state.item).toBe('home');
  });
  it('postcard: from the Bookshop deck to the owl\'s ledge', () => {
    const r = rig({ kind: 'postcard' });
    expect(press(r, r.at(E.POSTCARD.x, E.POSTCARD.z, 0)).line).toBeNull(); // on the ground under the deck: no
    expect(press(r, atP(r, E.POSTCARD)).k).toBe('pick');
    expect(press(r, atP(r, E.OWL_PERCH, 0.5)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
    expect(r.progression.state.treehouse.album).toBe(1);
  });
  it('pays 25 paws once a walk, and a resumed walk that already paid offers nothing and pays nothing', () => {
    expect(AWARDS.treejob).toBe(25);
    const r = rig({ kind: 'parcel' });
    for (let i = 0; i < 2; i++) { press(r, atP(r, E.PARCEL)); press(r, atP(r, E.BELL_DOOR)); }
    expect(r.awards).toHaveLength(1);
    const p = rig({ kind: 'parcel', paid: 1 });
    expect(p.live.state.done).toBe(true);
    expect(press(p, atP(p, E.PARCEL)).line).toBeNull();
    expect(p.awards).toEqual([]);
    expect(p.progression.state.treehouse.album).toBe(0);
  });
  it('the album gains the lowest free stamp each errand, and a full album still pays the paws', () => {
    const r = rig({ kind: 'parcel', album: 0b101 });
    press(r, atP(r, E.PARCEL)); press(r, atP(r, E.BELL_DOOR));
    expect(r.progression.state.treehouse.album).toBe(0b111);
    const f = rig({ kind: 'parcel', album: 4095 });
    press(f, atP(f, E.PARCEL)); press(f, atP(f, E.BELL_DOOR));
    expect(f.awards).toHaveLength(1);
    expect(f.progression.state.treehouse.album).toBe(4095);
  });
  it('a partner\'s errand is credited to ours once (a th-job event), pays our own save and is not sent back', () => {
    const r = rig({ kind: 'lanterns' });
    expect(r.live.credit({ kind: 'th-meet' })).toBeNull();
    expect(r.live.credit(E.JOB_WIRE)).toBe('job');
    expect(r.awards).toHaveLength(1);
    expect(r.progression.state.treehouse.album).toBe(1);
    expect(r.sent).toEqual([]);
    expect(r.live.credit(E.JOB_WIRE)).toBeNull();
    expect(r.awards).toHaveLength(1);
  });
  it('the life hands the room\'s events to the errand first and the branches stage fills the slot', () => {
    expect(typeof ST.branches.errand).toBe('function');
    expect(read('src/world/treehouse.js')).toMatch(/errand\?\.credit\(ev\) \?\? wing\?\.credit\(ev\) \?\? nutmeg\.credit\(ev\)/);
    expect(read('src/world/treehousestagelift.js')).not.toMatch(/job/); // nothing went into the empty lift stage
  });
  it('the same room seed gives two partners the same errand and the same spot; the errand itself is never saved', () => {
    const a = rig({ seed: 424242 }); const b = rig({ seed: 424242 });
    expect(a.live.plan).toEqual(b.live.plan);
    expect(Object.keys(a.progression.state.treehouse).sort()).toEqual(['album', 'letters', 'step']);
    const src = read('src/world/treehousejoblive.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|PointLight/);
    expect(read('src/world/treehousejob.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it('disposes everything it made', () => {
    for (const kind of ['lanterns', 'stamp', 'parcel']) {
      const r = rig({ kind });
      expect(r.scene.children.length).toBeGreaterThan(0);
      r.live.dispose();
      expect(r.scene.children.length).toBe(0);
    }
  });
});

describe('the words and the journal, in both sets', () => {
  it('every line exists, is short and kind, and reads without a series word in the everyday set', () => {
    const ids = Object.keys(LINES);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|drown\w*|die|dies|dead|hurt|fail\w*|wrong|kit)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary); expect(s, id).not.toMatch(/\bClan\b/);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); });
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); withOffWords(() => expect(bannedIn(h)).toBeNull()); }
  });
  it('every phrase(...) call in the errand file has a literal id in the table, and every line of the table is used', () => {
    const src = read('src/world/treehousejoblive.js').replace(/\/\/.*$/gm, '');
    const used = new Set();
    for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
      expect(m[1], `phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
      expect(Object.keys(LINES)).toContain(m[1].slice(1, -1));
      used.add(m[1].slice(1, -1));
    }
    expect([...used].sort()).toEqual(Object.keys(LINES).sort());
    for (const k of E.ERRAND_KINDS) expect(Object.keys(LINES)).toContain(`treehouse.job.${k}`);
  });
  it('the journal has the post round and stamp pages live, with hints, and they count', () => {
    expect(TREEHOUSE_JOB_PAGES.map((p) => p[0])).toEqual(['tl4', 'tl5']);
    for (const [id] of TREEHOUSE_JOB_PAGES) { expect(HINTS[id]).toMatch(/\S/); expect(TREEHOUSE_HINTS[id]).toBe(HINTS[id]); }
    try {
      setTreehouse(false); expect(renderJournalHtml({ tl4: 2, tl5: 1 }, 0, 18)).not.toContain('The Stamp Album');
      setTreehouse(true);
      const html = renderJournalHtml({ tl4: 2, tl5: 1 }, 0, 18);
      expect(html).toContain('The Post Round');
      expect(html).toContain('The Stamp Album');
    } finally { setTreehouse(null); }
    const r = rig({ kind: 'lanterns' });
    r.live.credit(E.JOB_WIRE);
    expect(r.progression.state.journal.tl4).toBe(1);
    expect(r.progression.state.journal.tl5).toBe(1);
  });
});
