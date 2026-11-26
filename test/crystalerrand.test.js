// The Crystal Cave, milestone C7 (Replay): Lumi's glow errand of the day. The plan is a pure function of the room seed (identical for two co-walkers, never saved, never sent),
// once-a-walk pay, no failure, the rubbing album's bits (union on merge), every errand spot reachable on foot from the spawn with no skills and clear of the finds and the mice,
// carried things never saved, both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as E from '../src/world/crystalerrand.js';
import * as P from '../src/world/crystalplan.js';
import * as S from '../src/world/crystalstory.js';
import { CRYSTAL_COLLECTIBLES, CRYSTAL_GOLD, CRYSTAL_FIND_ZONES } from '../src/world/crystalfindsplan.js';
import { createCaveErrandLive } from '../src/world/crystalerrandlive.js';
import { CRYSTAL_ERRAND_LINES as LINES } from '../src/world/crystalerrandwords.js';
import { phrase } from '../src/clanphrases.js';
import { createProgression, sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { AWARDS } from '../src/discoveries.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const read = (f) => readFileSync(f, 'utf8');
const B = P.CRYSTAL_BOUNDS;

describe('the plan', () => {
  it('is deterministic from the seed, identical for two co-walkers, and covers all six errands', () => {
    for (const seed of [1, 77, 123456, 987654321]) expect(E.planCaveErrand(seed, 3)).toEqual(E.planCaveErrand(seed, 99));
    const kinds = new Set();
    for (let s = 1; s < 400; s++) { const p = E.planCaveErrand(s * 7919, 0); kinds.add(p.kind); expect(p.change).toBeLessThan(6); expect(p.spot).toBeLessThan(6); }
    expect([...kinds].sort()).toEqual([...E.ERRAND_KINDS].sort());
    const solo = new Set();
    for (let v = 0; v < 40; v++) { const a = E.planCaveErrand(undefined, v); expect(a).toEqual(E.planCaveErrand(undefined, v)); solo.add(a.kind); }
    expect(solo.size).toBeGreaterThan(3);
    expect(E.planCaveErrand(NaN, NaN).kind).toBeTruthy();
  });
  it('every spot is in bounds, 2.5 m clear of every collider, 3 m clear of the finds, the mice, the spark stones and the Heart, and reachable on foot from the spawn', () => {
    const cols = S.storyColliders();
    const spots = [...E.SPOTS, E.STONE, E.BUG, E.SPARK.start, E.SPARK.ring, ...CRYSTAL_COLLECTIBLES.filter((c) => E.CHANGE_IDS.includes(c.id))];
    expect(spots.length).toBe(6 + 2 + 2 + 6);
    const avoid = [
      ...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_GOLD, ...S.STONES, S.HEART, P.CRYSTAL_SPAWN, S.LUMI.start,
    ];
    const W = B.maxX - B.minX + 1;
    const seen = new Uint8Array(W * (B.maxZ - B.minZ + 1));
    const idx = (x, z) => (z - B.minZ) * W + (x - B.minX);
    const blocked = (x, z) => cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.4);
    const q = [[P.CRYSTAL_SPAWN.x, P.CRYSTAL_SPAWN.z]];
    seen[idx(...q[0])] = 1;
    while (q.length) {
      const [x, z] = q.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const nz = z + dz;
        if (nx < B.minX || nx > B.maxX || nz < B.minZ || nz > B.maxZ || seen[idx(nx, nz)] || blocked(nx, nz)) continue;
        seen[idx(nx, nz)] = 1; q.push([nx, nz]);
      }
    }
    const isFind = (s) => CRYSTAL_COLLECTIBLES.some((c) => c.id === s.id); // the collectibles are the finds' own: only the other spots keep clear of them
    for (const s of spots) {
      expect(s.x > B.minX + 2 && s.x < B.maxX - 2 && s.z > B.minZ + 2 && s.z < B.maxZ - 2, JSON.stringify(s)).toBe(true);
      for (const c of cols) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r, JSON.stringify(s)).toBeGreaterThan(isFind(s) ? 0.4 : 2.5);
      expect(seen[idx(Math.round(s.x), Math.round(s.z))], JSON.stringify(s)).toBe(1);
      if (isFind(s)) continue;
      for (const a of avoid) expect(Math.hypot(s.x - a.x, s.z - a.z), `${JSON.stringify(s)} vs ${JSON.stringify(a)}`).toBeGreaterThan(3);
      for (const c of CRYSTAL_COLLECTIBLES) expect(Math.hypot(s.x - c.x, s.z - c.z), JSON.stringify(s)).toBeGreaterThan(2.4);
    }
    // the spark's line is a straight walk across open floor she can follow
    for (let t = 0; t <= 1; t += 0.05) { const a = E.sparkAt(t); for (const c of cols) expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeGreaterThan(c.r + 0.5); }
  });
  it('the spark waits for her and never fails; the rule is monotone', () => {
    let p = 0;
    for (let i = 0; i < 40; i++) p = E.sparkStep(p, 99, 0.1);
    expect(p).toBe(0);
    for (let i = 0; i < 2000; i++) { const n = E.sparkStep(p, 3, 0.1); expect(n).toBeGreaterThanOrEqual(p); p = n; }
    expect(p).toBe(1);
  });
});

describe('the album', () => {
  it('twelve rubbings; the lowest unset bit is paid; a full album pays no more; junk is repaired', () => {
    expect(E.ALBUM).toHaveLength(12);
    let bits = 0;
    for (let i = 0; i < 12; i++) { expect(E.nextRubbing(bits)).toBe(i); bits = E.withRubbing(bits, i); }
    expect(bits).toBe(4095);
    expect(E.nextRubbing(bits)).toBe(-1);
    expect(E.albumCount(bits)).toBe(12);
    expect(E.withRubbing(5, 99)).toBe(5);
    expect(E.nextRubbing(-3)).toBe(0); expect(E.albumCount(NaN)).toBe(0); expect(E.albumCount(1e12)).toBeLessThanOrEqual(12);
  });
  it('two devices union their rubbings and cannot lift the album past 12 bits', () => {
    const f = (crystal) => sanitizeSave({ version: 4, crystal });
    expect(mergeSaves({ local: f({ step: 7, sparks: 7, album: 5 }), cloud: f({ step: 7, sparks: 7, album: 10 }) }).save.crystal.album).toBe(15);
    expect(mergeSaves({ local: f({ step: 7, album: 3 }), cloud: { version: 4, crystal: { step: 7, album: 1e12 } } }).save.crystal.album).toBeLessThanOrEqual(4095);
  });
});

// ---- the walk -------------------------------------------------------------------------------------------------------------------------
function rig({ step = 7, album = 0, seed, visits = 0, kind, paid = 0 } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.crystal = { step, sparks: 7, album };
  progression.addPoints(0);
  const scene = new THREE.Scene();
  const awards = [];
  const log = { awardOnce: (type, key, text) => { if (log.seen.has(key)) return 0; log.seen.add(key); awards.push({ type, key, text }); return AWARDS[type]; }, count: (k) => (log.seen.has(k) ? 1 : 0), mark() {}, seen: new Set(paid ? ['cave-errand'] : []) };
  const meshes = new Map(CRYSTAL_COLLECTIBLES.map((c) => [c.id, {}]));
  const session = { cat: { rotation: { y: 0 } }, collectibleMeshes: meshes };
  const lumi = { lumi: { x: 0, z: 26 } };
  let s = seed;
  if (kind) { for (s = 1; E.planCaveErrand(s * 31, 0).kind !== kind; s++); s *= 31; }
  const live = createCaveErrandLive({ scene, progression, log, roomSeed: s, visits, lumi });
  const tick = (cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) live.update(dt, i * dt, cat, null, session); };
  const at = (x, z) => ({ x, z, y: P.crystalY(x, z) });
  return { progression, scene, awards, log, meshes, session, lumi, live, tick, at };
}
const press = (r, cat) => { r.tick(cat, 1); const line = r.live.promptAt(cat); return { line, k: line ? r.live.interact() : null }; };
const nearLumi = (r) => r.at(r.lumi.lumi.x + 1, r.lumi.lumi.z);

describe('on a walk: each errand, once, with no way to fail', () => {
  it('is offered only from the walk after the story', () => {
    const r = rig({ step: 6, kind: 'glove' });
    r.tick(r.at(0, 28), 100);
    expect(r.live.state.eligible).toBe(false);
    expect(r.live.promptAt(r.at(E.SPOTS[r.live.plan.spot].x, E.SPOTS[r.live.plan.spot].z))).toBeNull();
    expect(r.awards).toEqual([]);
    expect(r.live.props).toEqual([]);
  });
  it('glints: three bits, then Interact beside Lumi (a short hand makes her wait, never scolds)', () => {
    const r = rig({ kind: 'glints' });
    const cat = nearLumi(r);
    r.tick(cat, 2);
    expect(press(r, cat).k).toBe('glints');
    expect(r.awards).toEqual([]);
    r.meshes.delete('cave-1'); r.meshes.delete('cave-3');
    expect(press(r, cat).k).toBe('glints'); expect(r.awards).toEqual([]);
    r.meshes.delete('cave-4');
    expect(press(r, cat).k).toBe('glints');
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ type: 'cavejob', key: 'cave-errand' });
    expect(r.progression.state.crystal.album).toBe(1);
    expect(r.progression.state.crystal.step).toBe(7); // nothing else in the story record moved
    const r2 = rig({ kind: 'glints' });
    r2.tick(r2.at(30, -20), 2);
    expect(r2.live.promptAt(r2.at(30, -20))).toBeNull(); // far from Lumi there is no offer at all
  });
  it('follow: the spark moves on while she is near and she goes through its ring', () => {
    const r = rig({ kind: 'follow' });
    r.tick(r.at(-20, 20), 3);
    expect(r.live.state.sparkP).toBe(0);
    for (let i = 0; i < 600 && !r.awards.length; i++) {
      const a = E.sparkAt(r.live.state.sparkP);
      r.tick(r.at(a.x + 1, a.z + 2), 1);
    }
    expect(r.live.state.sparkP).toBe(1);
    expect(r.awards).toEqual([]);
    r.tick(r.at(E.SPARK.ring.x, E.SPARK.ring.z), 2);
    expect(r.awards).toHaveLength(1);
  });
  it('change: the day\'s glint pays when it is picked up; another one does not', () => {
    const r = rig({ kind: 'change' });
    const id = E.CHANGE_IDS[r.live.plan.change];
    r.tick(r.at(0, 28), 2);
    for (const other of E.CHANGE_IDS.filter((x) => x !== id)) r.meshes.delete(other);
    r.tick(r.at(0, 28), 2);
    expect(r.awards).toEqual([]);
    r.meshes.delete(id);
    r.tick(r.at(0, 28), 2);
    expect(r.awards).toHaveLength(1);
  });
  it('relight: stand by the dim cluster and Interact; it lights up and stays lit', () => {
    const r = rig({ kind: 'relight' });
    const g = E.SPOTS[r.live.plan.spot];
    expect(press(r, r.at(0, 28)).line).toBeNull();
    expect(press(r, r.at(g.x + 1, g.z)).k).toBe('relight');
    expect(r.awards).toHaveLength(1);
    expect(r.live.props.find((m) => m.name === 'crystal:errandlit').visible).toBe(true);
    expect(r.live.props.find((m) => m.name === 'crystal:errandcluster').visible).toBe(false);
  });
  it('bug: pick the stone up, carry it to the bug', () => {
    const r = rig({ kind: 'bug' });
    expect(press(r, r.at(E.BUG.x, E.BUG.z)).line).toBeNull(); // nothing to give yet
    expect(press(r, r.at(E.STONE.x + 0.5, E.STONE.z)).k).toBe('pick');
    expect(press(r, r.at(E.BUG.x + 1, E.BUG.z)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
  });
  it('glove: at the seed\'s spot, carried to Lumi, and a carried glove is not kept past the walk', () => {
    const r = rig({ kind: 'glove' });
    const g = E.SPOTS[r.live.plan.spot];
    expect(press(r, r.at(g.x, g.z)).k).toBe('pick');
    expect(r.live.state.item).toBe('carried');
    expect(JSON.stringify(r.progression.state)).not.toMatch(/glove|carried/);
    expect(press(r, nearLumi(r)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
    expect(r.live.state.item).toBe('given');
    const c = rig({ kind: 'glove' });
    press(c, c.at(g.x, g.z));
    c.live.dispose(); // the walk ends carrying it
    expect(c.progression.state.crystal.album).toBe(0);
    expect(rig({ kind: 'glove' }).live.state.item).toBe('home'); // the next walk finds it at its place
  });
  it('pays 25 paws once a walk, and a resumed walk that already paid offers nothing and pays nothing', () => {
    expect(AWARDS.cavejob).toBe(25);
    const r = rig({ kind: 'glove' });
    const g = E.SPOTS[r.live.plan.spot];
    press(r, r.at(g.x, g.z)); press(r, nearLumi(r));
    press(r, r.at(g.x, g.z)); press(r, nearLumi(r)); // again
    expect(r.awards).toHaveLength(1);
    const p = rig({ kind: 'glove', paid: 1 });
    expect(p.live.state.done).toBe(true);
    expect(press(p, p.at(g.x, g.z)).line).toBeNull();
    expect(p.awards).toEqual([]);
    expect(p.progression.state.crystal.album).toBe(0);
  });
  it('the album gains the lowest free rubbing each errand, and a full album still pays the paws', () => {
    const r = rig({ kind: 'glove', album: 0b101 });
    const g = E.SPOTS[r.live.plan.spot];
    press(r, r.at(g.x, g.z)); press(r, nearLumi(r));
    expect(r.progression.state.crystal.album).toBe(0b111);
    const f = rig({ kind: 'glove', album: 4095 });
    press(f, f.at(g.x, g.z)); press(f, nearLumi(f));
    expect(f.awards).toHaveLength(1);
    expect(f.progression.state.crystal.album).toBe(4095);
  });
  it('the same room seed gives two partners the same errand and the same spots; the errand itself is never saved or sent', () => {
    const a = rig({ seed: 424242 }); const b = rig({ seed: 424242 });
    expect(a.live.plan).toEqual(b.live.plan);
    expect(Object.keys(a.progression.state.crystal).sort()).toEqual(['album', 'sparks', 'step']);
    const src = read('src/world/crystalerrandlive.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/sendEvent|\bsend\b|credit\s*\(/);
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|PointLight/);
    expect(read('src/world/crystalerrand.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it('disposes everything it made', () => {
    const r = rig({ kind: 'follow' });
    expect(r.scene.children.length).toBeGreaterThan(0);
    r.live.dispose();
    expect(r.scene.children.length).toBe(0);
  });
});

describe('the words, in both sets', () => {
  it('every line exists, is short and kind, and reads without a series word in the everyday set', () => {
    const ids = Object.keys(LINES);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|cave-in|scary|scared|afraid|danger\w*|drown\w*|die|dies|dead|hurt|fail\w*|wrong)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length).toBeLessThanOrEqual(90); });
    }
  });
  it('every phrase(...) call in the errand file has a literal id in the table, and every line of the table is used', () => {
    const src = read('src/world/crystalerrandlive.js').replace(/\/\/.*$/gm, '');
    const used = new Set();
    for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
      expect(m[1], `phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
      expect(Object.keys(LINES)).toContain(m[1].slice(1, -1));
      used.add(m[1].slice(1, -1));
    }
    expect([...used].sort()).toEqual(Object.keys(LINES).sort());
    for (const k of E.ERRAND_KINDS) expect(Object.keys(LINES)).toContain(`crystal.errand.${k}`);
  });
  it('the cave\'s journal has the errand and rubbings pages, with hints', () => {
    expect(read('src/crystalpages.js')).toMatch(/ccerrand[\s\S]*ccrubbings/);
  });
});
