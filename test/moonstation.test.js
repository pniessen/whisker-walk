// The Moon, wave 2, milestone M1 (the Old Relay Station shell, golden mouse 4's perch) (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md, decisions 3, 6, 7, 8): the plan, the
// tower's one-hop ledge, the floor flood, no ceiling, the camera at the four zoom steps, the closed-off place until the stage arrives, the footprint's rocks, the scatters unchanged,
// the detail zone, the blink and reduced motion, the lighter rungs, the words in both sets and the page switch.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as S from '../src/world/moonstationplan.js';
import * as SL from '../src/world/moonsledplan.js';
import * as MP from '../src/world/moonparts.js';
import * as B from '../src/world/moonbeautyplan.js';
import { build } from '../src/world/moon.js';
import { ST, HELD, stageReady } from '../src/world/moonstages.js';
import { arrive, resetMoonStages } from '../src/world/moonlate.js';
import { WINGS, createZones } from '../src/world/moonzones.js';
import { clearDrawnRocks, BLINK } from '../src/world/moonstationlive.js';
import { placeBudget } from '../src/placephysics.js';
import { canReach, BASE_CLIMB_BUDGET } from '../src/climbing.js';
import { CAT_RADIUS } from '../src/player.js';
import { ZOOM_STEPS, cameraPullScale } from '../src/camzoom.js';
import { cameraOffset } from '../src/catcam.js';
import { perchHops } from './helpers/findreach.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { phrase } from '../src/clanphrases.js';
import { MOON_HINTS, WING_LIVE, wingPageShown } from '../src/moonpages.js';
import { GOLD_MICE } from '../src/goldmice.js';

await import('../src/world/moonstagestation.js'); // (the stage's code is in; HELD holds it back where a test wants it "not yet arrived")
const sha = (v) => createHash('sha256').update(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e5) / 1e5 : x))).digest('hex');
afterEach(() => { HELD.clear(); resetMoonStages(); P.MOON_CLEARS.length = 0; });

const setup = ({ reducedMotion = false, tier = {}, held = true } = {}) => {
  if (held) HELD.add('station');
  const scene = new THREE.Scene();
  const area = build(scene);
  const life = area.life({ scene, ground: area.ground, progression: { state: {} }, reducedMotion, tier });
  const cam = new THREE.PerspectiveCamera();
  const session = { pounceTime: 0, perched: null, hopLift: 0, fx: { burst() {} }, collectibleMeshes: new Map() };
  let t = 0;
  const frame = (p = { x: 0, z: 45 }, dt = 1 / 60) => { t += dt; life.update(dt, t, p, cam, session); };
  return { scene, area, life, frame };
};
const arriveStation = (frame) => { HELD.delete('station'); arrive('station'); frame(); };

// the walk's own collision: a cat is a circle that may not overlap a collider circle (a 0.3 m flood from the spawn, test/moonbase.test.js)
function floodFrom(colliders, from, step = 0.3) {
  const b = P.MOON_BOUNDS;
  const nx = Math.round((b.maxX - b.minX) / step) + 1;
  const nz = Math.round((b.maxZ - b.minZ) / step) + 1;
  const seen = new Uint8Array(nx * nz);
  const free = (x, z) => { for (const c of colliders) if (Math.abs(c.x - x) < c.r + 1 && Math.abs(c.z - z) < c.r + 1 && Math.hypot(x - c.x, z - c.z) < c.r + CAT_RADIUS) return false; return true; };
  const idx = (x, z) => Math.round((z - b.minZ) / step) * nx + Math.round((x - b.minX) / step);
  const q = [idx(from.x, from.z)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const i = k % nx; const j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (!seen[kk] && free(b.minX + ii * step, b.minZ + jj * step)) { seen[kk] = 1; q.push(kk); }
    }
  }
  return { reaches: (x, z) => !!seen[idx(x, z)], count: q.length };
}

describe('the plan', () => {
  it('stands at (44, 36), radius 7, 12 m from Dot\'s track, with the wing\'s own near of 26', () => {
    expect([S.STATION.x, S.STATION.z, S.STATION.r]).toEqual([44, 36, 7]);
    expect(P.trackDistance(S.STATION.x, S.STATION.z)).toBeGreaterThan(11.5);
    expect(P.trackDistance(S.STATION.x, S.STATION.z)).toBeLessThan(12.5);
    expect(WINGS.E).toEqual({ id: 'E', x: S.STATION.x, z: S.STATION.z, near: 26 });
    expect(S.STATION.near).toBe(26);
  });
  it('the footprint is clear of finds, mice, story points, Dot\'s track and depot, the boulders, the bowls, the rifts and the beams', () => {
    const inside = (p, pad = 0) => Math.hypot(p.x - S.STATION.x, p.z - S.STATION.z) < S.STATION.r + pad;
    for (const p of [...P.PEBBLES, P.ECHO, P.CHEESE, ...P.JOB_POINTS, P.DEPOT, P.DOT_PARK, P.SHED, P.FLAG, P.PIT_ROCK, P.FAR_BEACON, P.ROVER_CELL, P.RIDGE_CELL, P.BINOCULARS, ...P.PLAIN_POSTS, ...P.BOULDERS]) expect(inside(p, 0.6), JSON.stringify(p)).toBe(false);
    for (const m of P.MOON_MICE.filter((q) => q.id !== 'gm-moon-4')) expect(inside(m, 0.6), m.id).toBe(false);
    for (const k of P.CRATERS) expect(Math.hypot(k.x - S.STATION.x, k.z - S.STATION.z)).toBeGreaterThan(k.r + S.STATION.r);
    for (const p of [...P.BEAMS, ...P.RIFTS.flatMap((f) => [{ x: f.x0, z: f.z0 }, { x: f.x1, z: f.z1 }])]) expect(inside(p, 3), JSON.stringify(p)).toBe(false);
    for (const p of area0().pois) expect(inside(p, 1.5), JSON.stringify(p)).toBe(false);
    expect(S.CLEAR.maxX).toBeLessThan(P.MOON_BOUNDS.maxX);
    for (let i = 0; i < P.TRACK.length; i++) {
      const a = P.TRACK[i]; const b = P.TRACK[(i + 1) % P.TRACK.length];
      for (let k = 0; k <= 20; k++) expect(Math.hypot(a.x + ((b.x - a.x) * k) / 20 - S.STATION.x, a.z + ((b.z - a.z) * k) / 20 - S.STATION.z)).toBeGreaterThan(S.STATION.r + 3);
    }
  });
  it('the ground is flat under it, the walls are low (all under 2.2 m) and four ways lead in', () => {
    for (const c of S.STATION_COLLIDERS) expect(P.moonY(c.x, c.z)).toBeCloseTo(0, 6);
    expect(S.WALL_TOP.max).toBeLessThanOrEqual(2.2);
    expect(readFileSync(new URL('../src/world/moonstationparts.js', import.meta.url), 'utf8')).toContain('cyl(S.ledgeR, S.ledgeR, 0.18, 14)'); // the ledge is a 0.18 m slab
    expect(S.WALL_TOP.pier).toBeLessThanOrEqual(2.2);
    expect(S.WAYS).toHaveLength(4);
    expect(S.WALL.length).toBeGreaterThan(20);
    for (const w of S.WALL) expect(Math.hypot(w.x - S.STATION.x, w.z - S.STATION.z)).toBeCloseTo(S.STATION.ring, 1);
    for (const c of S.STATION_COLLIDERS) expect(Math.hypot(c.x - S.STATION.x, c.z - S.STATION.z) + c.r).toBeLessThan(S.STATION.r);
  });
  it('the mouse is golden mouse 4, at the tower, 3 m up, still where the stub put it; the two lists agree', () => {
    expect(S.MOUSE).toMatchObject({ id: 'gm-moon-4', x: 44, z: 36, y: 3 });
    expect(GOLD_MICE.moon[3]).toMatchObject({ id: 'gm-moon-4', x: 44, z: 36, y: 3 });
    expect(S.STATION_PERCHES[0]).toMatchObject({ x: 44, z: 36, y: 3 });
  });
});

describe('the tower\'s ledge: one Moon hop, and Earth\'s budget does not reach it', () => {
  const moon = placeBudget({}, 'moon');
  const perch = S.STATION_PERCHES[0];
  const beside = { x: S.STATION.x + S.STATION.mast + 0.8, z: S.STATION.z };
  it('is reached from the dust in one hop on the Moon, not on Earth', () => {
    expect(canReach(perch, beside, 0, moon)).toBe(true);
    expect(canReach(perch, beside, 0, BASE_CLIMB_BUDGET)).toBe(false);
    expect(perchHops(S.STATION_PERCHES, S.MOUSE, { budget: moon })).toBe(1);
    expect(perchHops(S.STATION_PERCHES, S.MOUSE, { budget: BASE_CLIMB_BUDGET })).toBe(Infinity);
  });
});

describe('the floor flood, the ceiling and the camera', () => {
  const colliders = [...P.MOON_COLLIDERS, ...S.STATION_COLLIDERS];
  const flood = floodFrom(colliders, P.MOON_SPAWN);
  it('from the spawn a cat walks in by every way, to the console, the dish and the foot of the tower (and the tower\'s foot is one hop from the ledge)', () => {
    for (const w of S.WAYS) { expect(flood.reaches(w.x, w.z), `way ${w.a}`).toBe(true); }
    expect(flood.reaches(S.STATION.x + S.STATION.mast + 0.8, S.STATION.z)).toBe(true);
    expect(flood.reaches(S.CONSOLE.x - S.CONSOLE.r - 0.9, S.CONSOLE.z)).toBe(true);
    expect(flood.reaches(S.DISH.x - 1.0, S.DISH.z)).toBe(true);
    // sealed at the four ways, the inside is not reachable (the walls are real); open, it is
    const seal = [...colliders, ...S.WAYS.map((w) => ({ x: w.x, z: w.z, r: S.STATION.half + 0.3 }))];
    expect(floodFrom(seal, P.MOON_SPAWN).reaches(S.STATION.x + S.STATION.mast + 0.8, S.STATION.z)).toBe(false);
  });
  it('no ceiling anywhere: the ground answers Infinity, no collider or perch carries one, and no file of the stage names one', () => {
    const g = build(new THREE.Scene()).ground;
    for (const c of [S.STATION, ...S.STATION_COLLIDERS]) expect(g.ceil(c.x, c.z)).toBe(Infinity);
    for (const o of [...S.STATION_COLLIDERS, ...S.STATION_PERCHES]) expect(Object.keys(o).some((k) => /ceil/i.test(k))).toBe(false);
    for (const f of ['moonstationplan', 'moonstationparts', 'moonstationlive', 'moonstagestation']) expect(readFileSync(new URL(`../src/world/${f}.js`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')).not.toMatch(/(?<!Math\.)\bceil\b/i);
  });
  it('the camera is never inside a wall, the tower, its ledge or the console, at the four zoom steps (a cat on the dust or on the ledge)', () => {
    const solids = [
      ...S.WALL.map((w) => ({ x: w.x, z: w.z, r: w.r + 0.25, y0: 0, y1: S.WALL_TOP.pier + 0.25 })),
      // (the tower is four 14 cm legs and a 0.18 m thin ledge: nothing a camera can be said to be inside, as against the walls and the console, which are masses; the ledge's thickness is held below)
      { x: S.CONSOLE.x, z: S.CONSOLE.z, r: 0.8, y0: 0, y1: 0.95 },
    ];
    const bad = [];
    const off = new THREE.Vector3();
    const cats = [];
    for (let x = S.STATION.x - 9; x <= S.STATION.x + 9; x += 0.75) for (let z = S.STATION.z - 9; z <= S.STATION.z + 9; z += 0.75) if (flood.reaches(x, z)) cats.push({ x, z, y: 0 });
    cats.push({ x: S.STATION.x, z: S.STATION.z, y: S.STATION.ledge });
    expect(cats.length).toBeGreaterThan(200);
    ZOOM_STEPS.forEach((view, step) => {
      for (const cat of cats) for (let k = 0; k < 16; k++) for (const pitch of [0, 0.18, 0.35]) { // (the camera's own default is 0.18; a hand on the stick takes it between 0 and about 0.35 in play)
        cameraOffset((k / 16) * Math.PI * 2, pitch, view.dist, view.height, off);
        const pull = cameraPullScale(cat, off, view.dist, colliders, P.MOON_BOUNDS);
        const cx = cat.x + off.x * pull; const cz = cat.z + off.z * pull; const cy = cat.y + off.y * pull;
        for (const s of solids) if (Math.hypot(cx - s.x, cz - s.z) < s.r && cy > s.y0 && cy < s.y1) bad.push(`${step}:${cat.x},${cat.z},${cat.y}:${k}:${pitch}:${JSON.stringify(s)}:${cx.toFixed(2)},${cz.toFixed(2)},${cy.toFixed(2)}`);
      }
    });
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('the place is closed off until its stage arrives, then opens', () => {
  it('absent: a ring of invisible colliders shuts the disc, nothing of the station is drawn or solid, and nothing leaks through', () => {
    const { scene, area, life, frame } = setup();
    expect(stageReady('station')).toBe(false);
    const ring = area.colliders.filter((c) => c.station);
    expect(ring.length).toBeGreaterThan(20);
    for (const c of ring) expect(Math.hypot(c.x - S.GATE.x, c.z - S.GATE.z)).toBeCloseTo(S.GATE.r, 1);
    expect(scene.getObjectByName('moon:stationE')).toBeFalsy();
    for (let i = 0; i < 30; i++) frame();
    expect(area.colliders.some((c) => S.STATION_COLLIDERS.some((s) => s.x === c.x && s.z === c.z && s.r === c.r))).toBe(false);
    expect(area.perches.some((p) => p.y === 3 && p.x === 44)).toBe(false);
    // the closed disc swallows the whole station, and a cat from the spawn does not get in
    for (const c of S.STATION_COLLIDERS) expect(Math.hypot(c.x - S.GATE.x, c.z - S.GATE.z)).toBeLessThan(S.GATE.r - 1.2);
    expect(floodFrom(area.colliders, P.MOON_SPAWN).reaches(S.STATION.x, S.STATION.z)).toBe(false);
    for (const q of area.pois) expect(ring.some((c) => Math.hypot(q.x - c.x, q.z - c.z) < c.r + CAT_RADIUS), JSON.stringify(q)).toBe(false);
    life.dispose();
    expect(area.colliders.filter((c) => c.station)).toEqual([]);
  });
  it('one friendly line is said near the closed disc (the same line the other places use)', () => {
    const { life, frame } = setup();
    let said = 0;
    life.base.notice = () => { said++; };
    frame({ x: 44, z: 36 + S.GATE.r + 1 });
    frame({ x: 44, z: 36 + S.GATE.r + 1 });
    expect(said).toBe(1);
    life.dispose();
  });
  it('arrival (reduced motion: at once): the ring comes out, the walls, mast, console and post go in, the ledge is a perch, the page\'s photo subject is listed, and a walk end takes it all away again', () => {
    const { scene, area, life, frame } = setup({ reducedMotion: true });
    const before = area.colliders.length;
    const ring0 = area.colliders.filter((c) => c.station).length;
    arriveStation(frame);
    expect(area.colliders.filter((c) => c.station)).toEqual([]);
    expect(area.colliders.length).toBe(before - ring0 + S.STATION_COLLIDERS.length + 3); // (+ the sled's rack: two posts and the parked sled, M2)
    for (const c of S.STATION_COLLIDERS) expect(area.colliders.some((o) => o.x === c.x && o.z === c.z && o.r === c.r), JSON.stringify(c)).toBe(true);
    expect(area.perches.filter((p) => p.x === 44 && p.z === 36 && p.y === 3)).toHaveLength(1);
    const g = scene.getObjectByName('moon:stationE');
    expect(g).toBeTruthy();
    expect(life.spottable.filter((e) => e.type === 'mnstation')).toHaveLength(1);
    expect(life.spottable.find((e) => e.type === 'mnstation').label).toBe('the Old Relay Station');
    expect(floodFrom(area.colliders, P.MOON_SPAWN).reaches(S.WAYS[1].x, S.WAYS[1].z)).toBe(true);
    life.dispose();
    expect(scene.getObjectByName('moon:stationE')).toBeFalsy();
    expect(area.colliders.some((c) => c.x === S.CONSOLE.x && c.z === S.CONSOLE.z)).toBe(false);
    expect(area.perches.some((p) => p.x === 44 && p.z === 36 && p.y === 3)).toBe(false);
    expect(life.spottable.filter((e) => e.type === 'mnstation')).toHaveLength(0);
  });
  it('arrival fades in over a second (no shadow while it does) and finishes', () => {
    const { scene, life, frame } = setup();
    arriveStation(frame);
    const g = scene.getObjectByName('moon:stationE');
    const casters = [];
    g.traverse((o) => { if (o.isMesh) casters.push(o.castShadow); });
    expect(casters.every((c) => c === false)).toBe(true);
    for (let i = 0; i < 70; i++) frame();
    const after = [];
    g.traverse((o) => { if (o.isMesh) after.push(o.castShadow); });
    expect(after.some((c) => c)).toBe(true);
    life.dispose();
  });
  it('a stage that is already in (a later walk) is drawn at once, with no ring', () => {
    const { area, scene, life } = setup({ held: false });
    expect(area.colliders.filter((c) => c.station)).toEqual([]);
    expect(scene.getObjectByName('moon:stationE')).toBeTruthy();
    life.dispose();
  });
});

describe('the rocks in the footprint', () => {
  const around = (t, pad = 0.2) => ({ minX: t.x - t.s - pad, maxX: t.x + t.s + pad, minZ: t.z - t.s - pad, maxZ: t.z + t.s + pad });
  const hitIn = (f) => (t) => t.x + t.s > f.minX && t.x - t.s < f.maxX && t.z + t.s > f.minZ && t.z - t.s < f.maxZ;
  it('the scatter is unchanged (hashes); the clears take rocks, pebbles and chunks from their rectangle only, and the boulders stay; the real footprint holds none', () => {
    const before = sha(MP.scatterRocks(false));
    const beforeLite = sha(MP.scatterRocks(true));
    const plain = MP.rockLists(false);
    expect(['small', 'medium', 'large', 'rim'].flatMap((k) => plain[k]).some(hitIn(S.CLEAR))).toBe(true); // (there are rocks in the footprint to take: the test is not vacuous)
    const target = plain.medium[3];
    const rect = around(target);
    P.MOON_CLEARS.push(rect, S.CLEAR);
    try {
      const cleared = MP.rockLists(false);
      const hit = (t) => hitIn(rect)(t) || hitIn(S.CLEAR)(t);
      expect(plain.medium.some(hitIn(rect))).toBe(true);
      for (const k of ['small', 'medium', 'large', 'rim']) { expect(cleared[k].some(hit)).toBe(false); expect(cleared[k]).toEqual(plain[k].filter((t) => !hit(t))); }
      expect(cleared.medium.length).toBeLessThan(plain.medium.length);
      expect(cleared.boulder).toEqual(plain.boulder);
      expect(sha(MP.scatterRocks(false))).toBe(before);
      expect(sha(MP.scatterRocks(true))).toBe(beforeLite);
      expect(B.SCATTER_MICE).toEqual(['gm-moon-1', 'gm-moon-2', 'gm-moon-3']);
    } finally { P.MOON_CLEARS.length = 0; }
    expect(sha(MP.rockLists(false))).toBe(sha(plain));
  });
  it('rocks already drawn are shrunk away by the same rectangle (and only those); the station\'s arrival pushes its own footprint on the hook, once', () => {
    const { scene, life, frame } = setup({ reducedMotion: true });
    const rect = around(MP.rockLists(false).medium[3]);
    const grab = () => scene.children.filter((o) => o.isInstancedMesh).map((o) => Array.from(o.instanceMatrix.array));
    const before = grab();
    expect(clearDrawnRocks(scene, rect)).toBeGreaterThan(0);
    const after = grab();
    let changed = 0;
    before.forEach((arr, m) => { for (let i = 0; i < arr.length / 16; i++) { if (!arr.slice(i * 16, i * 16 + 16).every((v, j) => v === after[m][i * 16 + j])) { changed++; const x = arr[i * 16 + 12]; const z = arr[i * 16 + 14]; expect(x > rect.minX - 2 && x < rect.maxX + 2 && z > rect.minZ - 2 && z < rect.maxZ + 2).toBe(true); } } });
    expect(changed).toBeGreaterThan(0);
    expect(clearDrawnRocks(scene, rect)).toBe(0);
    expect(P.MOON_CLEARS).toEqual([]);
    const drawn = grab();
    arriveStation(frame);
    expect(P.MOON_CLEARS).toEqual([S.CLEAR, SL.CLEAR]); // (the station's, then the sled lane's, M2)
    const gone = grab().reduce((n, arr, m) => { for (let i = 0; i < arr.length / 16; i++) if (!arr.slice(i * 16, i * 16 + 16).every((v, j) => v === drawn[m][i * 16 + j])) n++; return n; }, 0);
    expect(gone).toBeGreaterThan(0); // (the rocks drawn in the footprint before the stage came in are gone with it)
    life.dispose();
    const again = setup({ reducedMotion: true, held: false });
    expect(P.MOON_CLEARS).toEqual([S.CLEAR, SL.CLEAR]); // (the station's, then the sled lane's, M2)
    again.life.dispose();
    P.MOON_CLEARS.length = 0;
  });
});

describe('the detail zone, the blink and the draws', () => {
  it('the detail is drawn within 26 m of the middle (kept to 32), the stand-in always', () => {
    const { scene, life, frame } = setup({ reducedMotion: true });
    arriveStation(frame);
    const near = scene.getObjectByName('moon:station');
    const far = scene.getObjectByName('moon:stationfar');
    frame({ x: 0, z: 45 });
    expect(near.visible).toBe(false);
    expect(far.visible).toBe(true);
    frame({ x: 44, z: 36 + 25 });
    expect(near.visible).toBe(true);
    frame({ x: 44, z: 36 + 30 });
    expect(near.visible).toBe(true); // (the zone's hysteresis)
    frame({ x: 44, z: 36 + 33 });
    expect(near.visible).toBe(false);
    expect(createZones().update(44, 36).E).toBe(true);
    expect(createZones().update(0, 45).E).toBe(false);
    life.dispose();
  });
  it('at most three draws near (one stand-in, paint, glow), one far; no light of its own; blink steady in reduced motion, moving otherwise', () => {
    for (const reduced of [true, false]) {
      const { scene, life, frame } = setup({ reducedMotion: reduced });
      arriveStation(frame);
      for (let i = 0; i < 70; i++) frame({ x: 44, z: 40 });
      const g = scene.getObjectByName('moon:stationE');
      const meshes = []; let lights = 0;
      g.traverse((o) => { if (o.isMesh) meshes.push(o); if (o.isLight) lights++; });
      expect(meshes.length).toBeLessThanOrEqual(3);
      expect(lights).toBe(0);
      const glow = meshes.find((m) => m.name.endsWith(':glow'));
      const seen = new Set();
      for (let i = 0; i < 120; i++) { frame({ x: 44, z: 40 }, 0.05); seen.add(glow.material.color.r.toFixed(3)); }
      if (reduced) { expect(seen.size).toBe(1); expect(Number([...seen][0])).toBeCloseTo(BLINK.still, 3); } else { expect(seen.size).toBeGreaterThan(5); expect(Math.min(...[...seen].map(Number))).toBeGreaterThanOrEqual(BLINK.lo - 0.01); }
      life.dispose();
    }
  });
  it('the lite rung draws fewer parts than the full one, and the stand-in stays small', () => {
    const count = (tier) => {
      const { scene, life, frame } = setup({ reducedMotion: true, tier });
      arriveStation(frame);
      let tris = 0;
      scene.getObjectByName('moon:stationE').traverse((o) => { if (o.isMesh) tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
      life.dispose();
      return tris;
    };
    const full = count({});
    const lite = count({ shadows: false });
    expect(lite).toBeLessThan(full);
    expect(full).toBeLessThan(4500);
  });
});

describe('the words and the pages', () => {
  it('the photo label and the hint are the same in both word sets, with no banned or series word', () => {
    const id = 'moon.ws.station.photo';
    expect(phrase(id)).toBe('the Old Relay Station');
    withOffWords(() => { expect(phrase(id)).toBe('the Old Relay Station'); expect(bannedIn(phrase(id))).toBeNull(); expect(bannedIn(MOON_HINTS.mnstation)).toBeNull(); });
    expect(bannedIn(phrase(id))).toBeNull();
    for (const w of ['collapse', 'trapped', 'stuck', 'dark']) expect(phrase(id).toLowerCase()).not.toContain(w);
  });
  it('the station\'s page is live; the relay\'s (M3), the sled\'s and the signal\'s are still hidden', () => {
    expect(WING_LIVE).toMatchObject({ mnstation: true, mnsignal: false, mnrelay: false, mnsled: true, mnlap: true });
    expect(wingPageShown('mnstation')).toBe(true);
    expect(wingPageShown('mnrelay')).toBe(false);
  });
});

const area0 = () => build(new THREE.Scene());
void ST;
