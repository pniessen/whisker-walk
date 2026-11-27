// The Reef, milestone R18: the friendly divers, the research ship above the shimmer and the big spotted shark. The plans (pure poses, in bounds, over the float ceiling,
// never blocking, the shark far from the walk), the drawing (three draws, no light, reduced motion, the lower rungs), the walk (spottable, photo and journal), the words
// in both sets and the source rules. Both Reef stages load together, so nothing here assumes the other stages' regions are absent.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const P = await import('../src/world/reefplan.js');
const V = await import('../src/world/reefdivers.js');
const D = await import('../src/world/reefdiversparts.js');
const M = await import('../src/world/reefmore.js');
const S = await import('../src/world/reefseals.js');
const C = await import('../src/world/reefcritters.js');
const L = await import('../src/world/reeflabplan.js');
const W = await import('../src/world/reefwreckplan.js');
const { LINES } = await import('../src/world/reefdiverswords.js');
const { HINTS } = await import('../src/world/reefwingwords2.js');
const { phrase } = await import('../src/clanphrases.js');
const { CRITTER_INFO } = await import('../src/journal.js');
const { JOURNAL_TYPES, createProgression } = await import('../src/progression.js');
const { REEF_WING_PAGES, REEF_PAGE_WORDS } = await import('../src/reefpages.js');
const { ST } = await import('../src/world/reefstages.js');

const read = (f) => readFileSync(f, 'utf8');
const IDS = ['rfdivers', 'rfvessel', 'rfwhaleshark'];
const FLOAT_CEILING = 2.2;
const BAD = /\b(Zissou|Belafonte|Aquatic|cap|caps|beanie|hat|hats|dark|trapped|stuck|scary|lost forever)\b/i;
const area = build(new THREE.Scene());
const inBounds = (x, z, m = 0) => x > P.REEF_BOUNDS.minX + m && x < P.REEF_BOUNDS.maxX - m && z > P.REEF_BOUNDS.minZ + m && z < P.REEF_BOUNDS.maxZ - m;
const draws = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); return n; };
const tris = (scene) => { let n = 0; for (const k of ['reef:divers', 'reef:bigshark', 'reef:ship']) n += scene.getObjectByName(k).geometry.drawRange.count / 3; return n; };

describe('the plan (reefdivers.js)', () => {
  it('the numbers copied from reefplan.js are equal to it, the salt is its own, and the stage is in', () => {
    expect(V.GROUND_NUMBERS.SURFACE_Y).toBe(P.SURFACE_Y);
    expect(V.GROUND_NUMBERS.REEF_BOUNDS).toEqual(P.REEF_BOUNDS);
    const all = [...Object.values(M.SALTS), ...Object.values(S.SALTS), ...Object.values(C.SALTS)];
    expect(all).not.toContain(V.DIVER_SALT);
    expect(ST.ride.createDiversLive).toBeTypeOf('function');
    for (let i = 0; i < 20; i++) { const h = V.hash01(i, V.DIVER_SALT); expect(h).toBe(S.hash01(i, V.DIVER_SALT)); }
  });
  it('three divers (two buddies and one at the ladder), always in bounds and above the float ceiling, clear of the Sealab and the galleon', () => {
    expect(V.DIVERS).toHaveLength(3);
    V.useGround(P.reefY);
    const out = {};
    for (const d of V.DIVERS) {
      for (let t = 0; t < 400; t += 0.5) {
        V.diverPose(d, t, null, out);
        expect(inBounds(out.x, out.z, 1)).toBe(true);
        expect(out.y - P.reefY(out.x, out.z)).toBeGreaterThan(FLOAT_CEILING + 0.6);
        expect(out.y).toBeLessThan(P.SURFACE_Y - 2);
        expect(out.x > L.LAB_FOOT.maxX + 4 || out.x < L.LAB_FOOT.minX - 4 || out.z > L.LAB_FOOT.maxZ + 4).toBe(true);
        expect(Math.hypot(out.x - W.WRECK.x, out.z - W.WRECK.z)).toBeGreaterThan(14);
      }
    }
  });
  it('a pose is a pure function of the clock and her place; same in, same out', () => {
    V.useGround(P.reefY);
    for (const d of V.DIVERS) expect(V.diverPose(d, 12.3, { x: 5, z: 9 }, {})).toEqual(V.diverPose(d, 12.3, { x: 5, z: 9 }, {}));
    expect(V.diverPose(V.DIVERS[0], 0, null, {})).toEqual(V.diverPose(V.DIVERS[0], -5, null, {}));
  });
  it('a diver waves when she is near, not when she is far, and eases aside when she comes close (never blocking)', () => {
    V.useGround(P.reefY);
    const d = V.DIVERS[0]; const base = V.diverPose(d, 5, null, {});
    expect(V.diverPose(d, 5, { x: base.x + 20, z: base.z }, {}).wave).toBe(0);
    expect(V.diverPose(d, 5, { x: base.x + V.WAVE_FULL - 0.5, z: base.z }, {}).wave).toBe(1);
    const mid = V.diverPose(d, 5, { x: base.x + 8.5, z: base.z }, {}).wave;
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
    const near = V.diverPose(d, 5, { x: base.x + 0.5, z: base.z }, {});
    expect(Math.hypot(near.x - (base.x + 0.5), near.z - base.z)).toBeGreaterThan(1.6);
    const dead = V.diverPose(d, 5, { x: base.x, z: base.z }, {});
    expect(Number.isFinite(dead.x) && Number.isFinite(dead.z) && Number.isFinite(dead.yaw)).toBe(true);
  });
  it('the shark stays at least 8 m beyond the walk\'s edge all the way round, and large, slow and in the open', () => {
    V.useGround(P.reefY);
    const out = {}; let far = 0;
    for (let t = 0; t < V.SHARK.secs; t += 0.5) {
      V.sharkPose(t, out);
      expect(V.outsideBounds(out.x, out.z)).toBeGreaterThanOrEqual(V.SHARK_KEEP);
      expect(out.y).toBeLessThan(P.SURFACE_Y);
      far = Math.max(far, out.x);
    }
    expect(V.SHARK_KEEP).toBeGreaterThanOrEqual(8);
    expect(V.SHARK.size * 6.4).toBeGreaterThan(8);
    V.sharkPose(V.SHARK_STILL, out);
    expect(V.outsideBounds(out.x, out.z)).toBeGreaterThan(8);
    expect(V.outsideBounds(out.x, out.z)).toBeLessThan(25); // the still picture is in sight
    expect(far).toBeGreaterThan(30);
  });
  it('the ship lies on the shimmer ceiling over open sand, clear of the spawn, the ladder arch, the Sealab and the galleon', () => {
    expect(V.VESSEL.keelY).toBeLessThan(P.SURFACE_Y); expect(V.VESSEL.keelY).toBeGreaterThan(P.SURFACE_Y - 3);
    expect(V.VESSEL.length).toBeGreaterThan(18); expect(V.VESSEL.length).toBeLessThan(32);
    expect(inBounds(V.VESSEL.x - 12, V.VESSEL.z, 1) && inBounds(V.VESSEL.x + 12, V.VESSEL.z, 1)).toBe(true);
    expect(Math.hypot(V.VESSEL.x - P.REEF_SPAWN.x, V.VESSEL.z - P.REEF_SPAWN.z)).toBeGreaterThan(20);
    expect(V.VESSEL.z).toBeGreaterThan(L.LAB_FOOT.maxZ + 20);
    expect(V.LADDER_AT.bottom).toBeGreaterThan(P.DUNE_MAX + FLOAT_CEILING);
    expect(V.LADDER_AT.top).toBeGreaterThan(P.SURFACE_Y);
  });
});

describe('the drawing and the walk', () => {
  const walk = (opts = {}) => {
    const scene = new THREE.Scene();
    const life = area.life({ scene, progression: createProgression(memoryStorage()), audio: null, tier: null, reducedMotion: false, visits: 1, doc: null, log: { awardOnce: () => 0, count: () => 0, mark() {} }, ...opts });
    return { scene, life };
  };
  const named = (scene, n) => scene.getObjectByName(n);
  const snapshot = (scene, n) => Array.from(named(scene, n).geometry.attributes.position.array.slice(0, 400));
  const cat = new THREE.Vector3(30, 0, 5);

  it('adds three draws (divers, shark, ship) and no light; the ship is a few thousand triangles at most', () => {
    const base = new THREE.Scene(); const { life: l0 } = { life: area.life({ scene: base, progression: createProgression(memoryStorage()), audio: null, tier: null, reducedMotion: false, visits: 1, doc: null, log: { awardOnce: () => 0, count: () => 0, mark() {} } }) };
    const withDivers = draws(base);
    for (const n of ['reef:divers', 'reef:bigshark', 'reef:ship']) expect(named(base, n), n).toBeTruthy();
    expect(withDivers).toBeGreaterThanOrEqual(3);
    let lights = 0; base.traverse((o) => { if (o.isPointLight) lights++; });
    expect(lights).toBe(0); // (the Sealab's one is drawn by build(), into another scene)
    for (const n of ['reef:divers', 'reef:bigshark', 'reef:ship']) { const g = named(base, n).geometry; expect(g.drawRange.count / 3, n).toBeGreaterThan(300); expect(g.drawRange.count / 3, n).toBeLessThan(4000); expect(named(base, n).material.vertexColors).toBe(true); }
    l0.dispose();
    for (const n of ['reef:divers', 'reef:bigshark', 'reef:ship']) expect(named(base, n), n).toBeFalsy();
  });
  it('photo and journal subjects: three diver spots, the ship and the shark, each with its own page, label and a range that fits', () => {
    const { life } = walk();
    const spots = life.spottable.filter((s) => IDS.includes(s.type));
    expect(spots.filter((s) => s.type === 'rfdivers')).toHaveLength(3);
    expect(spots.filter((s) => s.type === 'rfvessel')).toHaveLength(1);
    expect(spots.filter((s) => s.type === 'rfwhaleshark')).toHaveLength(1);
    for (const s of spots) { expect(s.pos).toBeInstanceOf(THREE.Vector3); expect(s.label).toMatch(/^a /); expect(JOURNAL_TYPES).toContain(s.type); expect(s.range).toBeGreaterThanOrEqual(8); }
    life.dispose();
  });
  it('moves with the clock, the same clock gives the same picture twice, and a diver raises a hand when she is near', () => {
    const run = (c) => { const { scene, life } = walk(); for (let i = 0; i < 40; i++) life.update(0.1, i * 0.1, c); const out = [snapshot(scene, 'reef:divers'), snapshot(scene, 'reef:bigshark')]; life.dispose(); return out; };
    expect(run(cat)).toEqual(run(cat));
    expect(run(cat)[0]).not.toEqual(run(new THREE.Vector3(24, 0, 8))[0]);
    const { scene, life } = walk(); const first = snapshot(scene, 'reef:bigshark');
    for (let i = 0; i < 50; i++) life.update(0.1, 0, cat);
    expect(snapshot(scene, 'reef:bigshark')).not.toEqual(first);
  });
  it('the ship bobs a hand\'s breadth, and not at all under reduced motion; reduced motion keeps one picture of the shark and the divers', () => {
    const a = walk(); for (let i = 0; i < 30; i++) a.life.update(0.2, 0, cat);
    const y = named(a.scene, 'reef:ship').position.y; expect(Math.abs(y)).toBeLessThanOrEqual(0.1); expect(y).not.toBe(0);
    const { scene, life } = walk({ reducedMotion: true });
    const before = [snapshot(scene, 'reef:divers'), snapshot(scene, 'reef:bigshark')];
    for (let i = 0; i < 60; i++) life.update(0.2, 0, new THREE.Vector3(100, 0, 100));
    expect([snapshot(scene, 'reef:divers'), snapshot(scene, 'reef:bigshark')]).toEqual(before);
    expect(named(scene, 'reef:ship').position.y).toBe(0);
    for (let i = 0; i < 5; i++) life.update(0.2, 0, new THREE.Vector3(24, 0, 8)); // near: the hand comes up, still
    const again = snapshot(scene, 'reef:divers');
    for (let i = 0; i < 20; i++) life.update(0.2, 0, new THREE.Vector3(24, 0, 8));
    expect(snapshot(scene, 'reef:divers')).toEqual(again);
    a.life.dispose(); life.dispose();
  });
  it('the low rungs keep two divers and fewer spots on the shark', () => {
    const hi = walk(); const lo = walk({ tier: { name: 'low', rung: 3 } }); const lite = walk({ tier: { shadows: false } });
    const divers = (w) => w.life.spottable.filter((s) => s.type === 'rfdivers').length;
    expect(divers(hi)).toBe(3); expect(divers(lo)).toBe(2); expect(divers(lite)).toBe(2);
    expect(tris(lo.scene)).toBeLessThan(tris(hi.scene));
    for (const w of [hi, lo, lite]) w.life.dispose();
  });
  it('draws no random number and reads no clock but the walk\'s, builds no light, and makes no collider', () => {
    for (const f of ['reefdivers', 'reefdiversparts', 'reefdiverslive', 'reefdiverswords']) {
      const src = read(`src/world/${f}.js`).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|performance\.now|Date\.now|PointLight|SpotLight|colliders/);
    }
    expect(read('src/world/reefdivers.js')).not.toMatch(/from '\.\/reef(plan|seals)/); // a stage imports nothing of the main chunk's
    for (const f of ['reefdiversparts', 'reefdiverslive', 'reefdiverswords']) expect(read(`src/world/${f}.js`)).not.toMatch(/from '\.\/reef(plan|seals|more|sealsparts|moreparts)/);
  });
  it('the drawing has no hat of any kind: the diver is drawn from a wetsuit, bare head, goggles up, tank and fins', () => {
    const src = read('src/world/reefdiversparts.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\b(cap|hat|beanie|hood|helmet)\b/i);
    for (const look of V.LOOKS) expect(['short', 'tail', 'bare']).toContain(look.style);
    expect(V.LOOKS.some((l) => l.hair === null)).toBe(true);
    expect(D.drawDiver).toBeTypeOf('function');
  });
});

describe('the words and the journal', () => {
  it('three pages appended at the very end of JOURNAL_TYPES, with names from start-up and hints from the lazy words', () => {
    expect(JOURNAL_TYPES.slice(-3)).toEqual(IDS);
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    for (const id of IDS) {
      const card = CRITTER_INFO.find((c) => c.id === id);
      expect(card.reef).toBe(true);
      expect(REEF_WING_PAGES.find((p) => p[0] === id)).toBeTruthy();
      expect(card.name.length).toBeGreaterThan(3); expect(card.name.length).toBeLessThanOrEqual(18);
      expect(card.hint).toBe(HINTS[id]); expect(REEF_PAGE_WORDS[id].hint()).toBe(HINTS[id]);
      expect(`${card.name} ${card.hint}`).not.toMatch(BAD);
      withOffWords(() => expect(bannedIn(`${card.name} ${card.hint}`)).toBeNull());
    }
    const p = createProgression(memoryStorage());
    for (const id of IDS) p.recordSighting(id);
    for (const id of IDS) expect(p.state.journal[id]).toBeGreaterThan(0);
  });
  it('the lines read well in both word sets, with no banned word and no series word in the everyday set', () => {
    for (const id of Object.keys(LINES)) {
      expect(phrase(id), id).toMatch(/\S/);
      expect(phrase(id)).not.toMatch(BAD);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).not.toMatch(BAD); });
    }
    withOffWords(() => { expect(phrase('reef.life.divers')).toBe('a friendly diver'); expect(phrase('reef.life.vessel')).toBe('a research ship, high above'); expect(phrase('reef.life.whaleshark')).toBe('a big spotted shark'); });
  });
  it('no source file of the milestone uses a name from the films it was inspired by', () => {
    for (const f of ['reefdivers', 'reefdiversparts', 'reefdiverslive', 'reefdiverswords']) expect(read(`src/world/${f}.js`), f).not.toMatch(/Zissou|Belafonte|Aquatic/i);
  });
});
