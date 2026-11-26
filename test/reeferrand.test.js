// The Reef, milestone R7 (Replay): Marlo's errand of the day. The plan is a pure function of the room seed (identical for two co-walkers, never saved, never sent), once-a-walk
// pay, no failure, the postcard album's bits (union on merge), every errand spot reachable on foot from the spawn (only the rings ask for the float), both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as E from '../src/world/reeferrand.js';
import * as P from '../src/world/reefplan.js';
import * as S from '../src/world/reefstory.js';
import { REEF_COLLECTIBLES } from '../src/world/reeffindsplan.js';
import { createErrandLive } from '../src/world/reeferrandlive.js';
import { LINES } from '../src/world/reeferrandwords.js';
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
const B = P.REEF_BOUNDS;

describe('the plan', () => {
  it('is deterministic from the seed, identical for two co-walkers, and covers all six errands', () => {
    for (const seed of [1, 77, 123456, 987654321]) expect(E.planReefErrand(seed, 3)).toEqual(E.planReefErrand(seed, 99));
    const kinds = new Set();
    for (let s = 1; s < 400; s++) { const p = E.planReefErrand(s * 7919, 0); kinds.add(p.kind); expect(p.shell).toBeLessThan(5); expect(p.glove).toBeLessThan(6); }
    expect([...kinds].sort()).toEqual([...E.ERRAND_KINDS].sort());
    const solo = new Set();
    for (let v = 0; v < 40; v++) { const a = E.planReefErrand(undefined, v); expect(a).toEqual(E.planReefErrand(undefined, v)); solo.add(a.kind); }
    expect(solo.size).toBeGreaterThan(3);
    expect(E.planReefErrand(NaN, NaN).kind).toBeTruthy();
  });
  it('every spot is on open sand in bounds, 1.5 m clear of every collider, and reachable on foot from the spawn; only the rings are off the ground', () => {
    const cols = [...P.reefColliders(), ...S.storyColliders()];
    const spots = [...E.GLOVE_SPOTS, E.HAT, E.SNAIL, E.SCHOOL.start, E.SCHOOL.ring, ...E.RINGS, ...REEF_COLLECTIBLES.filter((c) => [...E.GLASS_IDS, ...E.SHELL_IDS].includes(c.id))];
    expect(spots.length).toBe(6 + 2 + 2 + 5 + 8);
    const W = B.maxX - B.minX + 1;
    const seen = new Uint8Array(W * (B.maxZ - B.minZ + 1));
    const idx = (x, z) => (z - B.minZ) * W + (x - B.minX);
    const blocked = (x, z) => cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.4);
    const q = [[P.REEF_SPAWN.x, P.REEF_SPAWN.z]];
    seen[idx(...q[0])] = 1;
    while (q.length) {
      const [x, z] = q.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const nz = z + dz;
        if (nx < B.minX || nx > B.maxX || nz < B.minZ || nz > B.maxZ || seen[idx(nx, nz)] || blocked(nx, nz)) continue;
        seen[idx(nx, nz)] = 1; q.push([nx, nz]);
      }
    }
    for (const s of spots) {
      expect(s.x > B.minX + 2 && s.x < B.maxX - 2 && s.z > B.minZ + 2 && s.z < B.maxZ - 2, JSON.stringify(s)).toBe(true);
      for (const c of cols) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r, JSON.stringify(s)).toBeGreaterThan(1.5);
      expect(seen[idx(Math.round(s.x), Math.round(s.z))], JSON.stringify(s)).toBe(1);
    }
    // the school's line is a straight swim across open sand she can follow
    for (let t = 0; t <= 1; t += 0.05) { const a = E.schoolAt(t); for (const c of cols) expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeGreaterThan(c.r); }
  });
  it('the rings need the float and are inside the float window; nothing else does', () => {
    for (const r of E.RINGS) { expect(r.y - E.RING_TOL).toBeGreaterThanOrEqual(1.1 - 1e-9); expect(r.y).toBeLessThanOrEqual(2.2); }
    expect(E.ringStep(0, E.RINGS[0].x, E.RINGS[0].z, 0)).toBe(0); // on the sand: no
    expect(E.ringStep(0, E.RINGS[0].x, E.RINGS[0].z, E.RINGS[0].y)).toBe(1);
    expect(E.ringStep(0, E.RINGS[1].x, E.RINGS[1].z, E.RINGS[1].y)).toBe(0); // out of order: no change
    expect(E.ringStep(5, 0, 0, 0)).toBe(5);
  });
  it('the school waits for her and never fails; the rule is monotone', () => {
    let p = 0;
    for (let i = 0; i < 40; i++) p = E.schoolStep(p, 99, 0.1);
    expect(p).toBe(0);
    for (let i = 0; i < 2000; i++) { const n = E.schoolStep(p, 3, 0.1); expect(n).toBeGreaterThanOrEqual(p); p = n; }
    expect(p).toBe(1);
  });
});

describe('the album', () => {
  it('twelve cards; the lowest unset bit is paid; a full album pays no more; junk is repaired', () => {
    expect(E.ALBUM).toHaveLength(12);
    let bits = 0;
    for (let i = 0; i < 12; i++) { expect(E.nextPostcard(bits)).toBe(i); bits = E.withPostcard(bits, i); }
    expect(bits).toBe(4095);
    expect(E.nextPostcard(bits)).toBe(-1);
    expect(E.albumCount(bits)).toBe(12);
    expect(E.withPostcard(5, 99)).toBe(5);
    expect(E.nextPostcard(-3)).toBe(0); expect(E.albumCount(NaN)).toBe(0); expect(E.albumCount(1e12)).toBeLessThanOrEqual(12);
  });
  it('two devices union their postcards and cannot lift the album past 12 bits', () => {
    const f = (reef) => sanitizeSave({ version: 4, reef });
    expect(mergeSaves({ local: f({ step: 7, shells: 7, album: 5 }), cloud: f({ step: 7, shells: 7, album: 10 }) }).save.reef.album).toBe(15);
    expect(mergeSaves({ local: f({ step: 7, album: 3 }), cloud: { version: 4, reef: { step: 7, album: 1e12 } } }).save.reef.album).toBeLessThanOrEqual(4095);
  });
});

// ---- the walk -------------------------------------------------------------------------------------------------------------------------
function rig({ step = 7, album = 0, seed, visits = 0, kind, fixed = null, paid = 0 } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.reef = { step, shells: 7, album };
  progression.addPoints(0);
  const scene = new THREE.Scene();
  const awards = [];
  const log = { awardOnce: (type, key, text) => { if (log.seen.has(key)) return 0; log.seen.add(key); awards.push({ type, key, text }); return AWARDS[type]; }, count: (k) => (log.seen.has(k) ? 1 : 0), mark() {}, seen: new Set(paid ? ['reef-errand'] : []) };
  const meshes = new Map(REEF_COLLECTIBLES.map((c) => [c.id, {}]));
  const session = { cat: { rotation: { y: 0 } }, collectibleMeshes: meshes };
  const marlo = { marlo: { x: -4, z: 30 } };
  const lift = { v: 0 };
  let s = seed;
  if (kind) { for (s = 1; E.planReefErrand(s * 31, 0).kind !== kind; s++); s *= 31; }
  const live = createErrandLive({ scene, progression, log, roomSeed: s, visits, marlo, lift: () => lift.v, ...(fixed ?? {}) });
  const tick = (cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) live.update(dt, i * dt, cat, null, session); };
  const at = (x, z, y) => ({ x, z, y: y ?? P.reefY(x, z) });
  return { progression, scene, awards, log, meshes, session, marlo, lift, live, tick, at };
}
const press = (r, cat) => { r.tick(cat, 1); const line = r.live.promptAt(cat); return { line, k: line ? r.live.interact() : null }; };

describe('on a walk: each errand, once, with no way to fail', () => {
  it('is offered only from the walk after the housewarming', () => {
    const r = rig({ step: 6, kind: 'glove' });
    r.tick(r.at(0, 36), 100);
    expect(r.live.state.eligible).toBe(false);
    expect(r.live.promptAt(r.at(E.GLOVE_SPOTS[r.live.plan.glove].x, E.GLOVE_SPOTS[r.live.plan.glove].z))).toBeNull();
    expect(r.awards).toEqual([]);
    expect(r.live.props).toEqual([]);
  });
  it('glass: three pieces, then Interact beside Marlo (a short hand makes him wait, never scolds)', () => {
    const r = rig({ kind: 'glass' });
    const cat = r.at(-4, 28.5);
    r.tick(cat, 2);
    expect(press(r, cat).k).toBe('glass');
    expect(r.awards).toEqual([]); // nothing taken yet: just the soft line
    r.meshes.delete('reef-6'); r.meshes.delete('reef-7');
    expect(press(r, cat).k).toBe('glass'); expect(r.awards).toEqual([]);
    r.meshes.delete('reef-8');
    expect(press(r, cat).k).toBe('glass');
    expect(r.awards).toHaveLength(1);
    expect(r.awards[0]).toMatchObject({ type: 'reefjob', key: 'reef-errand' });
    expect(r.progression.state.reef.album).toBe(1);
    expect(r.progression.state.reef.step).toBe(7); // nothing else in the story record moved
    // far from Marlo there is no offer at all
    const r2 = rig({ kind: 'glass' });
    r2.tick(r2.at(30, -30), 2);
    expect(r2.live.promptAt(r2.at(30, -30))).toBeNull();
  });
  it('school: it swims on while she is near and she goes through its kelp ring', () => {
    const r = rig({ kind: 'school' });
    r.tick(r.at(-5, 16), 3);
    expect(r.live.state.schoolP).toBe(0); // she is too far from the school
    for (let i = 0; i < 600 && !r.awards.length; i++) {
      const a = E.schoolAt(r.live.state.schoolP);
      r.tick(r.at(a.x + 1, a.z + 2), 1);
    }
    expect(r.live.state.schoolP).toBe(1);
    expect(r.awards).toEqual([]); // not through the ring yet
    r.tick(r.at(E.SCHOOL.ring.x, E.SCHOOL.ring.z), 2);
    expect(r.awards).toHaveLength(1);
  });
  it('shell: the day\'s shell (the seed\'s pick) pays when it is picked up; another one does not', () => {
    const r = rig({ kind: 'shell' });
    const id = E.SHELL_IDS[r.live.plan.shell];
    r.tick(r.at(0, 36), 2);
    for (const other of E.SHELL_IDS.filter((x) => x !== id)) r.meshes.delete(other);
    r.tick(r.at(0, 36), 2);
    expect(r.awards).toEqual([]);
    r.meshes.delete(id);
    r.tick(r.at(0, 36), 2);
    expect(r.awards).toHaveLength(1);
  });
  it('rings: five in order, only by floating', () => {
    const r = rig({ kind: 'rings' });
    r.tick(r.at(0, 36), 1);
    for (const g of E.RINGS) r.tick(r.at(g.x, g.z), 1); // on the sand: nothing
    expect(r.live.state.nextRing).toBe(0);
    r.lift.v = E.RINGS[1].y;
    r.tick(r.at(E.RINGS[1].x, E.RINGS[1].z), 1); // the second first: nothing
    expect(r.live.state.nextRing).toBe(0);
    E.RINGS.forEach((g, i) => { r.lift.v = g.y; r.tick(r.at(g.x, g.z), 1); expect(r.live.state.nextRing).toBe(Math.min(5, i + 1)); });
    expect(r.awards).toHaveLength(1);
  });
  it('snail: pick the hat shell up on foot, carry it to the snail', () => {
    const r = rig({ kind: 'snail' });
    expect(press(r, r.at(E.SNAIL.x, E.SNAIL.z)).line).toBeNull(); // nothing to give yet
    expect(press(r, r.at(E.HAT.x + 0.5, E.HAT.z)).k).toBe('pick');
    expect(press(r, r.at(E.SNAIL.x + 1, E.SNAIL.z)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
  });
  it('glove: at the seed\'s spot, carried to Marlo (not offered while she floats high)', () => {
    const r = rig({ kind: 'glove' });
    const g = E.GLOVE_SPOTS[r.live.plan.glove];
    r.lift.v = 2;
    expect(press(r, r.at(g.x, g.z)).line).toBeNull();
    r.lift.v = 0;
    expect(press(r, r.at(g.x, g.z)).k).toBe('pick');
    expect(press(r, r.at(-4, 28.5)).k).toBe('give');
    expect(r.awards).toHaveLength(1);
    expect(r.live.state.item).toBe('given');
  });
  it('pays 25 paws once a walk, and a resumed walk that already paid offers nothing and pays nothing', () => {
    expect(AWARDS.reefjob).toBe(25);
    const r = rig({ kind: 'glove' });
    const g = E.GLOVE_SPOTS[r.live.plan.glove];
    press(r, r.at(g.x, g.z)); press(r, r.at(-4, 28.5));
    press(r, r.at(g.x, g.z)); press(r, r.at(-4, 28.5)); // again
    expect(r.awards).toHaveLength(1);
    const p = rig({ kind: 'glove', paid: 1 });
    expect(p.live.state.done).toBe(true);
    expect(press(p, p.at(E.GLOVE_SPOTS[p.live.plan.glove].x, E.GLOVE_SPOTS[p.live.plan.glove].z)).line).toBeNull();
    expect(p.awards).toEqual([]);
    expect(p.progression.state.reef.album).toBe(0);
  });
  it('the album gains the lowest free postcard each errand, and a full album still pays the paws', () => {
    const r = rig({ kind: 'glove', album: 0b101 });
    const g = E.GLOVE_SPOTS[r.live.plan.glove];
    press(r, r.at(g.x, g.z)); press(r, r.at(-4, 28.5));
    expect(r.progression.state.reef.album).toBe(0b111);
    const f = rig({ kind: 'glove', album: 4095 });
    const h = E.GLOVE_SPOTS[f.live.plan.glove];
    press(f, f.at(h.x, h.z)); press(f, f.at(-4, 28.5));
    expect(f.awards).toHaveLength(1);
    expect(f.progression.state.reef.album).toBe(4095);
  });
  it('the same room seed gives two partners the same errand and the same spots; the errand itself is never saved or sent', () => {
    const a = rig({ seed: 424242 }); const b = rig({ seed: 424242 });
    expect(a.live.plan).toEqual(b.live.plan);
    expect(Object.keys(a.progression.state.reef).sort()).toEqual(['album', 'shells', 'step']);
    const src = read('src/world/reeferrandlive.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/sendEvent|\bsend\b|credit\s*\(/);
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    expect(read('src/world/reeferrand.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
  it('disposes everything it made', () => {
    const r = rig({ kind: 'school' });
    expect(r.scene.children.length).toBeGreaterThan(0);
    r.live.dispose();
    expect(r.scene.children.length).toBe(0);
  });
});

describe('the words, in both sets', () => {
  it('every line exists, is short and kind, and reads without a series word in the everyday set', () => {
    const ids = Object.keys(LINES);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    const scary = /\b(drown\w*|die|dies|dead|hurt|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*|fail\w*|wrong|lose|lost\b.*cat)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length).toBeLessThanOrEqual(90); });
    }
  });
  it('every phrase(...) call in the errand files has a literal id in the table, and every line of the table is used', () => {
    const src = read('src/world/reeferrandlive.js').replace(/\/\/.*$/gm, '');
    const used = new Set();
    for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
      expect(m[1], `phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
      expect(Object.keys(LINES)).toContain(m[1].slice(1, -1));
      used.add(m[1].slice(1, -1));
    }
    expect([...used].sort()).toEqual(Object.keys(LINES).sort());
    for (const k of E.ERRAND_KINDS) expect(Object.keys(LINES)).toContain(`reef.errand.${k}`);
  });
  it('the Reef\'s journal has the album and errand pages, with hints', () => {
    expect(read('src/reefpages.js')).toMatch(/rfalbum[\s\S]*rferrand/);
  });
});
