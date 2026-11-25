// The Moon, milestone 1: the ground, the sky, Earth and the landing site. The plan's coordinates against the built place, the
// heightfield against the walk's slope rule, the lander's climb on the Moon's budget (and not on Earth's), the sky dress,
// the camera's ease, the skip and the landing dust (on the frame the arc ends), the suit on the cat, and the rocks as
// InstancedMeshes through the walk's own sweeps (the plan's spike question).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { createMoonLife, hopNow, CAMERA_FOLLOW, SKIP_HEIGHT, DUST } from '../src/world/moonlife.js';
import { createMoonSky, starField, earthDirection } from '../src/world/moonsky.js';
import { scatterRocks, farRidge } from '../src/world/moonparts.js';
import { pebbles as beautyPebbles, rimChunks } from '../src/world/moonbeautyplan.js';
import { placeArc, placeBudget } from '../src/placephysics.js';
import { pounceArc, BASE_POUNCE_ARC } from '../src/player.js';
import { BASE_CLIMB_BUDGET, canReach, bestPerch } from '../src/climbing.js';
import { STEP_MAX, MAX_GRADE, FLAT_GROUND } from '../src/ground.js';
import { effectiveWear, isSuitId } from '../src/suithook.js';
import { assignShadowCasters, castsFromBox } from '../src/render/rig.js';
import { mergeStaticProps } from '../src/render/mergeprops.js';
import { scanFootprints } from '../src/render/contactshadows.js';

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const inside = (x, z, m = 0) => x >= P.MOON_BOUNDS.minX + m && x <= P.MOON_BOUNDS.maxX - m && z >= P.MOON_BOUNDS.minZ + m && z <= P.MOON_BOUNDS.maxZ - m;

describe('the built place', () => {
  const { area } = built();
  it('has the plan\'s bounds, spawn and evening look, no water and nothing a later milestone owns', () => {
    expect(area.bounds).toEqual(P.MOON_BOUNDS);
    expect(area.spawn).toEqual({ x: 0, z: 45 });
    expect(area.waters).toEqual([]);
    expect(area.evening).toBe(true);
    for (const key of ['scenics', 'tippables', 'boxes', 'critterSpawns', 'moments', 'puddles']) expect(area[key], key).toEqual([]);
    expect(area.ground.flat).toBe(false);
    expect(typeof area.life).toBe('function');
  });
  it('has wander spots (the walk\'s secrets and strays read them: none would stop a walk at its start), all inside the bounds, clear of colliders, craters\' floors and walkable from the spawn', () => {
    expect(area.pois.length).toBeGreaterThanOrEqual(8);
    const g = area.ground;
    for (const p of area.pois) {
      expect(inside(p.x, p.z, 2), JSON.stringify(p)).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(p.x - c.x, p.z - c.z), JSON.stringify(p)).toBeGreaterThan(c.r + 1);
      // walk a straight line from the spawn in 0.25 m steps: every one legal (craters are walkable, so a straight line is enough)
      const n = Math.ceil(Math.hypot(p.x - 0, p.z - 45) / 0.25);
      let ok = true;
      for (let i = 0; i < n; i++) if (!g.canStep((p.x * i) / n, 45 + ((p.z - 45) * i) / n, (p.x * (i + 1)) / n, 45 + ((p.z - 45) * (i + 1)) / n)) ok = false;
      expect(ok, JSON.stringify(p)).toBe(true);
    }
  });
  it('the spawn is clear: on level dust, with no collider and no rock near it', () => {
    expect(area.ground.y(0, 45)).toBeCloseTo(0, 6);
    for (const c of area.colliders) expect(Math.hypot(c.x - 0, c.z - 45), JSON.stringify(c)).toBeGreaterThan(c.r + 1.5);
    const rocks = scatterRocks();
    for (const list of Object.values(rocks)) for (const r of list) expect(Math.hypot(r.x, r.z - 45), 'a rock near the spawn').toBeGreaterThan(r.s + 4);
  });
  it('every coordinate of the plan is inside the bounds', () => {
    const pts = [P.LANDER, P.FLAG, P.RETURN_GATE, P.STEP_A, P.STEP_B, ...P.POLES, ...P.GATE_STONES, ...P.BOULDERS];
    for (const p of pts) expect(inside(p.x, p.z, 1), JSON.stringify(p)).toBe(true);
    for (const k of P.CRATERS) { expect(inside(k.x - k.r * 1.5, k.z - k.r * 1.5), k.id).toBe(true); expect(inside(k.x + k.r * 1.5, k.z + k.r * 1.5), k.id).toBe(true); }
    // (milestone 8) the Cave Massif's rock reaches past the west edge: a collider's middle may lie beyond the bounds when its disc still reaches in (the walk is stopped at the bounds anyway)
    for (const c of area.colliders) expect(inside(c.x, c.z, -c.r), JSON.stringify(c)).toBe(true);
    for (const p of area.perches) expect(inside(p.x, p.z), JSON.stringify(p)).toBe(true);
  });
  it('no collider sits inside another place of the plan (the ring, the steps, the lander, a crater)', () => {
    for (const b of P.BOULDERS) {
      for (const k of P.CRATERS) expect(Math.hypot(b.x - k.x, b.z - k.z), `${b.x},${b.z} in ${k.id}`).toBeGreaterThan(k.r * 1.1);
      expect(Math.hypot(b.x - P.LANDER.x, b.z - P.LANDER.z)).toBeGreaterThan(8);
    }
  });
});

describe('the ground', () => {
  const g = P.createMoonGround();
  it('is raised ground in the walk\'s own shape, and 0 at the landing site, the spawn and the gate ring', () => {
    for (const k of ['flat', 'y', 'ceil', 'canStep', 'slide', 'sameLevel', 'gradient', 'tilt']) expect(k in g, k).toBe(true);
    expect(g.flat).toBe(false);
    expect(g.ceil(3, 3)).toBe(Infinity);
    for (const [x, z] of [[0, 45], [0, 40], [-10, 41], [6, 38]]) expect(Math.abs(g.y(x, z)), `${x},${z}`).toBeLessThan(0.02);
  });
  it('the bowls are the plan\'s depth and the ridge is the plan\'s height', () => {
    for (const k of P.CRATERS) expect(g.y(k.x, k.z)).toBeCloseTo(-k.d, 1);
    expect(g.y(P.RIDGE.x, P.RIDGE.z)).toBeGreaterThan(P.RIDGE.h * 0.74);
    expect(g.y(P.RIDGE.x, P.RIDGE.z)).toBeLessThanOrEqual(P.RIDGE.h * 1.001);
  });
  it('craters are walkable: no slope in the bounds steeper than 0.55 (the walk\'s step rule allows nearly 1), and every step along 16 rays through each bowl is legal', () => {
    const out = { x: 0, z: 0 };
    let worst = 0;
    for (let x = P.MOON_BOUNDS.minX; x <= P.MOON_BOUNDS.maxX; x += 0.5) {
      for (let z = P.MOON_BOUNDS.minZ; z <= P.MOON_BOUNDS.maxZ; z += 0.5) {
        if (Math.hypot(x - P.STAR_HILL.x, z - P.STAR_HILL.z) < P.STAR_HILL.rs + P.STAR_HILL.w) continue; // Star Hill's tower is a wall by design (test/moonstarhill.test.js)
        g.gradient(x, z, out);
        worst = Math.max(worst, Math.hypot(out.x, out.z));
      }
    }
    expect(worst).toBeLessThanOrEqual(MAX_GRADE + 0.05); // the twin bowls' crease is the steepest place
    for (const k of P.CRATERS) {
      for (let a = 0; a < 16; a++) {
        const th = (a / 16) * Math.PI * 2;
        const ax = k.x + Math.cos(th) * k.r * 1.7;
        const az = k.z + Math.sin(th) * k.r * 1.7;
        expect(g.canStep(ax, az, k.x, k.z), `${k.id} ray ${a} in`).toBe(true);
        expect(g.canStep(k.x, k.z, ax, az), `${k.id} ray ${a} out`).toBe(true);
      }
    }
    // the ridge crosses north to south as easily
    for (let x = -22; x <= 18; x += 4) expect(g.canStep(x, -40, x, -52), `ridge at ${x}`).toBe(true);
  });
  it('a walking step is never refused on the plain, and the old flat ground is untouched', () => {
    expect(g.canStep(0, 45, 5, 40)).toBe(true);
    expect(FLAT_GROUND.flat).toBe(true);
    expect(STEP_MAX).toBeGreaterThan(0);
  });
  it('the far hills close the edge: higher than the plain at the drawn rim, all the way round', () => {
    const half = P.GROUND_SIZE / 2;
    for (let a = 0; a < 48; a++) {
      const th = (a / 48) * Math.PI * 2;
      const x = Math.max(-half, Math.min(half, Math.cos(th) * 200));
      const z = Math.max(-half, Math.min(half, Math.sin(th) * 200));
      expect(g.y(x, z), `rim ${a}`).toBeGreaterThan(3);
    }
  });
  it('the landing site is level where she stands and tilts nothing', () => {
    const t = g.tilt(0, 45, 0, { pitch: 0, roll: 0 });
    expect(Math.abs(t.pitch)).toBeLessThan(0.01);
    expect(Math.abs(t.roll)).toBeLessThan(0.01);
  });
});

describe('the lander\'s climb (the Moon\'s budget, not Earth\'s)', () => {
  const { area } = built();
  const deck = area.perches.find((p) => p.y === 3);
  const stepA = area.perches.find((p) => p.y === 1);
  const stepB = area.perches.find((p) => p.y === 2.1);
  const moon = placeBudget({}, 'moon');
  const earth = placeBudget({}, 'neighborhood');
  const nearDeck = { x: 0, z: 40 + P.LANDER.r + 0.8 };
  it('the deck is one hop from the dust on the Moon, and not on Earth', () => {
    expect(canReach(deck, nearDeck, 0, moon)).toBe(true);
    expect(canReach(deck, nearDeck, 0, earth)).toBe(false);
    expect(canReach(deck, nearDeck, 0, BASE_CLIMB_BUDGET)).toBe(false);
  });
  it('Earth\'s budget still climbs it, by the chain: dust, the crate, the ledge, the deck', () => {
    expect(canReach(stepA, { x: stepA.x + 1.2, z: stepA.z }, 0, earth)).toBe(true);
    expect(canReach(stepB, { x: stepA.x + 0.4, z: stepA.z }, stepA.y, earth)).toBe(true);
    expect(canReach(deck, { x: stepB.x + 1.3, z: stepB.z }, stepB.y, earth)).toBe(true);
  });
  it('a press near the lander picks the highest perch it can reach', () => {
    const pick = bestPerch(area.perches, { x: -1.5, z: 43 }, 0, null, moon);
    expect(pick?.y).toBe(3);
  });
  it('the perches carry no label (nothing is a discovery in this milestone)', () => {
    for (const p of area.perches) expect(p.label).toBeUndefined();
  });
});

describe('the drawing, as the walk\'s sweeps see it (the rocks as InstancedMeshes: the spike)', () => {
  it('two InstancedMeshes (milestone 4 merged the medium, large and boulder meshes): the small rocks never cast, the big ones do', () => {
    const { scene } = built();
    assignShadowCasters(scene);
    const rocks = scene.children.filter((o) => o.isInstancedMesh);
    expect(rocks.map((r) => r.name)).toEqual(['moon:rocks-small', 'moon:rocks-big']);
    expect(rocks.map((r) => r.count)).toEqual([70 + beautyPebbles().length, 70 + rimChunks().length]); // 70 small and the pebble fields (beauty round 1); 40 medium + 20 large + 10 boulders and the rim chunks
    expect(rocks.map((r) => r.castShadow)).toEqual([false, true]);
    for (const r of rocks) expect(r.receiveShadow).toBe(true);
  });
  it('the prop merge leaves every top-level mesh as it is (the instanced rocks, the ground)', () => {
    const { scene } = built();
    const before = scene.children.map((o) => o.uuid);
    mergeStaticProps(scene);
    expect(scene.children.map((o) => o.uuid)).toEqual(before);
    expect(scene.children.filter((o) => o.isInstancedMesh)).toHaveLength(2);
  });
  it('the contact-shadow scan never gives the plain or a rock a footprint (one decal per top-level prop; the plain\'s props are over its size rule)', () => {
    const { scene } = built();
    const fp = scanFootprints(scene, FLAT_GROUND);
    for (const f of fp) expect(f.halfX).toBeLessThan(5);
    expect(fp.length).toBeLessThanOrEqual(1);
  });
  it('the ground does not cast (it would shadow itself): the sweep leaves it alone', () => {
    const { scene } = built();
    assignShadowCasters(scene);
    const ground = scene.children.find((o) => o.name === 'moon:ground');
    expect(ground.castShadow).toBe(false);
    expect(ground.receiveShadow).toBe(true); // the sweep skips noCast, so the mesh keeps its own flag
  });
  it('rocks keep to the plan: clear of the keep-out places, the bowls\' floors and the boulders; none past the bounds', () => {
    const rocks = scatterRocks();
    for (const [name, list] of Object.entries(rocks)) {
      expect(list.length, name).toBe(name === 'boulder' ? P.BOULDERS.length : P.ROCK_CLASSES[name].count);
      if (name === 'boulder') continue;
      for (const r of list) {
        expect(inside(r.x, r.z)).toBe(true);
        for (const [kx, kz, kr] of P.ROCK_KEEP_OUT) expect(Math.hypot(r.x - kx, r.z - kz)).toBeGreaterThanOrEqual(kr);
        for (const k of P.CRATERS) expect(Math.hypot(r.x - k.x, r.z - k.z)).toBeGreaterThan(k.r * 0.55);
      }
    }
  });
  it('the low tier drops the small rocks and keeps the rest', () => {
    const rocks = scatterRocks(true);
    expect(rocks.small).toHaveLength(0);
    expect(rocks.medium).toHaveLength(P.ROCK_CLASSES.medium.count);
  });
  it('is the same picture every time (no random number, no clock)', () => {
    const a = built();
    const b = built();
    const sum = (s) => { let n = 0; s.traverse((o) => { if (o.geometry?.attributes?.position) for (const v of o.geometry.attributes.position.array) n += v; if (o.isInstancedMesh) for (const v of o.instanceMatrix.array) n += v; }); return n; };
    expect(sum(a.scene)).toBe(sum(b.scene));
  });
});

describe('the budget as the plan states it (row A1 at milestone 1: 40 / 24 / 15,500; milestone 2 is on the way to row A, 100 / 56 / 27,500, and pins its own measure at +12%)', () => {
  it('counting every instance of the rocks, the place draws at most 32,200 triangles in at most 22 meshes, 8 of them casters (milestone 7b measured 22 / 8 / 28,722; milestone 7a measured 22 / 8 / 28,190; milestone 6 22 / 8 / 26,738; milestone 5 measured 19 / 7 / 24,356 with Star Hill; milestone 4 measured 17 / 6 / 21,162 after merging the rocks and the glowing lamps; milestone 3 21 / 8 / 20,014; milestone 2 20 / 8 / 18,726)', () => {
    const { scene } = built();
    let meshes = 0; let tri = 0; let casters = 0;
    const box = new THREE.Box3();
    for (const child of scene.children) {
      box.setFromObject(child);
      const eligible = castsFromBox(box);
      child.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry;
        tri += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
        if (eligible && !o.material.transparent && !o.userData.noCast) casters++;
      });
    }
    expect(meshes).toBeLessThanOrEqual(28);
    expect(casters).toBeLessThanOrEqual(9);
    expect(tri).toBeLessThanOrEqual(45900); // beauty round 1 measured 25 / 8 / 41,010 counting every instance (+6,524: 206 pebbles of 20 triangles and 27 rim chunks of 80 in the two rock meshes; no mesh added), +12%, under the plan's row D (46,500); milestone 8 measured 25 / 8 / 34,486 (+5,764 for the Lava Tube: the massif, the cave's shell, its floor and crystals), +12%;  milestone 7b measured 22 / 8 / 28,722 (+532 for the rifts and the ring gates' posts), +12%; 7a measured 22 / 8 / 28,190 (+1,452 for the Beam Hops, the lane and its posts)
    expect(tri).toBeGreaterThan(16000); // and it is the real ground and the base, not a bare plain any more (milestone 0 was 5,408; milestone 1 14,584)
    // and it is under the plan's row D for the whole place with the Lava Tube (milestone 8: 184 / 100 / 46,500)
    expect(meshes).toBeLessThanOrEqual(184);
    expect(casters).toBeLessThanOrEqual(100);
    expect(tri).toBeLessThanOrEqual(46500);
  });
});

describe('the ground mesh', () => {
  it('its grid lines run in order, 2 m across the plain and coarser in the hills, and its height is the plan\'s height', () => {
    const { scene } = built();
    const ground = scene.children.find((o) => o.name === 'moon:ground');
    const pos = ground.geometry.attributes.position;
    const xs = new Set();
    const zs = new Set();
    for (let i = 0; i < pos.count; i++) { xs.add(+pos.getX(i).toFixed(4)); zs.add(+pos.getZ(i).toFixed(4)); }
    const sorted = (set) => [...set].sort((a, b) => a - b);
    for (const list of [sorted(xs), sorted(zs)]) {
      expect(list[0]).toBe(-65);
      expect(list[list.length - 1]).toBe(65);
      for (let i = 1; i < list.length; i++) { expect(list[i] - list[i - 1]).toBeGreaterThan(0.5); expect(list[i] - list[i - 1]).toBeLessThanOrEqual(6); }
    }
    // vertices are in grid order: each row left to right, rows front to back (no jumbled triangle spans the plain)
    for (let i = 1; i < pos.count; i++) {
      const dx = Math.abs(pos.getX(i) - pos.getX(i - 1));
      const dz = Math.abs(pos.getZ(i) - pos.getZ(i - 1));
      if (dz === 0) expect(dx).toBeLessThanOrEqual(6);
    }
    for (let i = 0; i < pos.count; i += 37) expect(pos.getY(i)).toBeCloseTo(P.moonBaseY(pos.getX(i), pos.getZ(i)) + farRidge(pos.getX(i), pos.getZ(i)), 4); // the plain's own height (beauty round 2: plus the far skyline, drawn only beyond the bounds): Star Hill is its own mesh
    let big = 0;
    const idx = ground.geometry.index;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i); const b = idx.getX(i + 1); const c = idx.getX(i + 2);
      const span = Math.max(Math.hypot(pos.getX(a) - pos.getX(b), pos.getZ(a) - pos.getZ(b)), Math.hypot(pos.getX(b) - pos.getX(c), pos.getZ(b) - pos.getZ(c)), Math.hypot(pos.getX(a) - pos.getX(c), pos.getZ(a) - pos.getZ(c)));
      if (span > 9) big++;
    }
    expect(big).toBe(0);
  });
});

describe('the sky', () => {
  it('1,800 stars on a full device, 900 on the lite rung (beauty round 1: a dense sky, a third of it a faint Milky Way), a seeded sky, crowded low and all above the horizon', () => {
    const full = starField(P.STARS.full);
    expect(full.pos.length / 3).toBe(1800);
    const again = starField(P.STARS.full);
    expect(Array.from(again.pos.slice(0, 30))).toEqual(Array.from(full.pos.slice(0, 30)));
    for (let i = 0; i < 1800; i++) expect(full.pos[i * 3 + 1]).toBeGreaterThan(0);
    const scene = new THREE.Scene();
    const lite = createMoonSky({ scene, tier: { shadows: false } });
    expect(lite.stars.geometry.attributes.position.count).toBe(900 + 2); // (beauty round 2: and the sun's two points)
    lite.dispose();
    const high = createMoonSky({ scene, tier: { shadows: true } });
    expect(high.stars.geometry.attributes.position.count).toBe(1800 + 2);
    high.dispose();
    expect(scene.children).toHaveLength(0);
  });
  it('Earth stands 21 degrees up and 12 degrees east of north, about 8 degrees across', () => {
    const d = earthDirection;
    expect(Math.asin(d.y) * 180 / Math.PI).toBeCloseTo(21, 5);
    expect(Math.atan2(d.x, -d.z) * 180 / Math.PI).toBeCloseTo(12, 5);
    expect(2 * Math.atan((P.EARTH.size / 2) / P.EARTH.radius) * 180 / Math.PI).toBeGreaterThan(8);
    expect(2 * Math.atan((P.EARTH.size / 2) / P.EARTH.radius) * 180 / Math.PI).toBeLessThan(8.6);
  });
  it('hangs on the camera, never casts, never merges, opts out of the sweeps, and draws before the world', () => {
    const scene = new THREE.Scene();
    const sky = createMoonSky({ scene, tier: {} });
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(7, 3, 44);
    sky.update(cam, 3);
    expect(sky.stars.position.toArray()).toEqual([7, 3, 44]);
    for (const o of scene.children) { expect(o.userData.noCast).toBe(true); expect(o.userData.noMerge).toBe(true); expect(o.castShadow).toBe(false); expect(o.frustumCulled).toBe(false); }
    sky.dispose();
  });
});

describe('the life: the camera\'s ease, the skip and the landing dust', () => {
  const state = {};
  const mk = (over = {}) => {
    const scene = new THREE.Scene();
    const bursts = [];
    const session = { pounceTime: 0, perched: null, hopLift: 0, fx: { burst: (...a) => bursts.push(a) } };
    const life = createMoonLife({ scene, reducedMotion: false, tier: {}, progression: { state }, ...over });
    return { scene, life, session, bursts, cam: new THREE.PerspectiveCamera(), cat: new THREE.Vector3(0, 0, 45) };
  };
  const arc = placeArc(pounceArc(state, { reducedMotion: false }), 'moon');
  it('the arc is the Moon\'s: 1.4 m high, 1.08 s', () => {
    expect(arc.height).toBeCloseTo(1.4, 6);
    expect(arc.time).toBeCloseTo(1.08, 6);
    expect(BASE_POUNCE_ARC.height).toBeCloseTo(0.35, 6);
  });
  it('the camera follows 60 percent of the hop: at the top it is 0.4 of 1.4 m lower than a plain follow', () => {
    const { life, session, cam, cat } = mk();
    expect(CAMERA_FOLLOW).toBe(0.6);
    cam.position.set(0, 5, 49);
    session.pounceTime = arc.time / 2; // the middle of the window: the top of the hop
    life.update(1 / 60, 1, cat, cam, session);
    expect(hopNow(arc, arc.time / 2)).toBeCloseTo(1.4, 6);
    expect(cam.position.y).toBeCloseTo(5 - 1.4 * 0.4, 6);
    // on the ground, or with no hop: the camera is not touched
    cam.position.set(0, 5, 49);
    session.pounceTime = 0;
    life.update(1 / 60, 1, cat, cam, session);
    expect(cam.position.y).toBe(5);
  });
  it('reduced motion: the arc is flat, so the camera never moves, and there is no skip', () => {
    const { life, session, cam } = mk({ reducedMotion: true });
    cam.position.set(0, 5, 49);
    session.pounceTime = 0.5;
    life.update(1 / 60, 1, new THREE.Vector3(0, 0, 45), cam, session);
    expect(cam.position.y).toBe(5);
    const at = new THREE.Vector3(0, 0, 45);
    for (let i = 0; i < 90; i++) { at.z -= 0.06; session.pounceTime = 0; life.update(1 / 60, i / 60, at, cam, session); expect(session.hopLift).toBe(0); }
  });
  it('the skip: 0.1 m at the most, each stride, only while she walks on the ground', () => {
    const { life, session, cam } = mk();
    const at = new THREE.Vector3(0, 0, 45);
    let max = 0;
    let lows = 0;
    for (let i = 0; i < 180; i++) { at.z -= 0.06; life.update(1 / 60, i / 60, at, cam, session); max = Math.max(max, session.hopLift); if (i > 10 && session.hopLift < 0.01) lows++; }
    expect(max).toBeLessThanOrEqual(SKIP_HEIGHT + 1e-9);
    expect(max).toBeGreaterThan(0.09);
    expect(lows).toBeGreaterThan(2); // it comes back to the ground each stride
    // standing still: none; in the air or on a perch: none
    for (let i = 0; i < 5; i++) life.update(1 / 60, 4 + i / 60, at, cam, session);
    expect(session.hopLift).toBe(0);
    session.perched = {};
    at.z -= 0.06;
    life.update(1 / 60, 5, at, cam, session);
    expect(session.hopLift).toBe(0);
  });
  it('the landing dust comes on the very frame game/avatar.js plays the thump (the frame the pounce window ends)', () => {
    const { life, session, bursts, cam, cat } = mk();
    session.pounceTime = arc.time; // the press
    const dt = 1 / 60;
    let thumpFrame = -1;
    let dustFrame = -1;
    for (let f = 0; f < 120 && thumpFrame < 0; f++) {
      const before = bursts.length;
      life.update(dt, f * dt, cat, cam, session);
      if (bursts.length > before) dustFrame = f;
      // game/avatar.js, later in the same frame: the window runs down and the thump plays when it ends
      const was = session.pounceTime > 0;
      if (session.pounceTime > 0) session.pounceTime -= dt;
      if (was && session.pounceTime <= 0) thumpFrame = f;
    }
    expect(thumpFrame).toBeGreaterThan(60);
    expect(dustFrame).toBe(thumpFrame);
    expect(bursts).toHaveLength(1);
    const [pos, color, count, opts] = bursts[0];
    expect(pos).toBe(cat);
    expect(count).toBe(DUST.count);
    expect(color).toBe(DUST.color);
    expect(opts.ttl).toBeCloseTo(1.2, 6);
  });
  it('ten puffs on a full device, five on the lite rung; the burst itself is silent in reduced motion (fx\'s own rule)', () => {
    const { life, session, bursts, cam, cat } = mk({ tier: { shadows: false } });
    session.pounceTime = 0.01;
    life.update(1 / 60, 0, cat, cam, session);
    expect(bursts[0][2]).toBe(5);
  });
  it('disposes the sky and puts the skip back', () => {
    const { life, scene, session, cam, cat } = mk();
    life.update(1 / 60, 0, cat, cam, session);
    expect(scene.children.length).toBeGreaterThan(0);
    session.hopLift = 0.07;
    life.dispose();
    expect(scene.children).toHaveLength(0);
    expect(session.hopLift).toBe(0);
  });
  it('the sky is already in place before the first frame (the Ready card shows the walk\'s first view), not at the origin', () => {
    const { life } = mk();
    expect(life.sky.stars.position.toArray()).toEqual([0, 2.9, 49.4]);
  });
  it('with a canvas (the browser): Earth and its cloud disc are drawn, sit over the spawn from the first frame, face the camera, and the clouds drift but not on the lite rung or in reduced motion', () => {
    const fake = new Proxy(function () {}, { get: (_t, k) => (k === 'addColorStop' ? () => {} : fake), apply: () => fake });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fake }) };
    try {
      const { life, cam } = mk();
      const e = life.sky.earth;
      expect(e).not.toBeNull();
      expect(life.sky.clouds).not.toBeNull();
      expect(Math.hypot(e.position.x - 0, e.position.z - 49.4)).toBeGreaterThan(P.EARTH.radius * 0.9);
      expect(e.position.y).toBeGreaterThan(80);
      cam.position.set(3, 3, 40);
      cam.quaternion.setFromEuler(new THREE.Euler(0, 0.4, 0));
      life.sky.update(cam, 100);
      expect(e.quaternion.toArray()).toEqual(cam.quaternion.toArray());
      expect(life.sky.clouds.material.map.offset.x).toBeCloseTo(0.4, 6);
      for (const over of [{ reducedMotion: true }, { tier: { shadows: false } }]) {
        const m = mk(over);
        m.life.sky.update(m.cam, 100);
        expect(m.life.sky.clouds.material.map.offset.x).toBe(0);
      }
      expect(e.userData.noCast).toBe(true);
      life.dispose();
    } finally { delete globalThis.document; }
  });
  it('the sky is black: no horizon haze under the stars', () => {
    const { scene } = mk();
    expect(scene.background.isColor).toBe(true);
    expect(scene.background.getHex()).toBe(0x010208);
  });
});

describe('the suit', () => {
  const own = { collar: 'bell', head: 'crown', face: null, neck: 'scarf', body: 'cape', back: 'backpack', feet: null };
  const places = ['neighborhood', 'park', 'seaside', 'docks', 'woods', 'river', 'moor', 'pines', 'gorge', 'farm', 'fair', 'roofs', 'market', 'house', 'lighthouse', 'greenhouse', 'den', 'constructor', '__proto__', undefined];
  it('on the Moon her cat is drawn in the space suit and her own wear is untouched; every other place is the wear as it is', () => {
    const worn = effectiveWear(own, 'moon');
    expect(isSuitId(worn.head) && isSuitId(worn.body) && isSuitId(worn.back) && isSuitId(worn.feet)).toBe(true);
    expect(worn.neck).toBeNull();
    expect(worn.collar).toBe('bell');
    expect(own).toEqual({ collar: 'bell', head: 'crown', face: null, neck: 'scarf', body: 'cape', back: 'backpack', feet: null });
    for (const place of places) expect(effectiveWear(own, place)).toBe(own);
    expect(effectiveWear(own, 'moon', null, { hen: true })).toEqual({ ...own, head: 'suit-helmet-space' });
  });
  it('the kit\'s own copy (the one the walk asks, so start-up carries none of it) is the same map, for a cat and for a hen, and nothing for any other place', async () => {
    const { SUIT_KIT } = await import('../src/cat/suitkit.js');
    for (const w of [own, { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }, { collar: 'glow', head: 'party', face: 'glasses', neck: 'bow', body: 'sweater', back: 'wings', feet: 'boots' }]) {
      expect(SUIT_KIT.dress(w, 'moon', false)).toEqual(effectiveWear(w, 'moon'));
      expect(SUIT_KIT.dress(w, 'moon', true)).toEqual(effectiveWear(w, 'moon', null, { hen: true }));
    }
    for (const place of places) expect(SUIT_KIT.dress(own, place, false), String(place)).toBeNull();
  });
  it('the walk builds her cat through the registered kit (one call: her breed\'s own hen rule, her wear back when there is none) and start-up never names the suit kit', () => {
    const walk = readFileSync('src/game/walk.js', 'utf8');
    expect(walk).toMatch(/suitKit\(\)\?\.dress\(worn, areaId, hen\) \?\? worn/);
    expect(walk).not.toMatch(/suitkit/); // (a gate's own suit goes through effectiveWear first: the teleport gates, src/teleport.js)
    expect(readFileSync('src/main.js', 'utf8')).not.toMatch(/suitkit/);
    expect(readFileSync('src/suithook.js', 'utf8')).toMatch(/LOOK_OF_PLACE = Object\.freeze\(\{ moon: 'space' \}\)/);
  });
  it('building the Moon registers the kit, and her cat is then drawn with the suit\'s live parts', async () => {
    const { suitKit } = await import('../src/suithook.js');
    build(new THREE.Scene());
    expect(suitKit()).not.toBeNull();
    const { buildCat } = await import('../src/cat/model.js');
    const cat = buildCat('tabby', suitKit().dress({ collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }, 'moon', false));
    expect(typeof cat.userData.suitTick).toBe('function');
  });
});

describe('what stays as it was', () => {
  it('the move row is the same as milestone 0 (the camera ease and the skip live in the Moon\'s own chunk)', () => {
    expect(placeBudget({}, 'moon').climb).toBeCloseTo(3.2, 6);
    const src = readFileSync('src/placephysics.js', 'utf8');
    expect(src).toMatch(/moon: Object\.freeze\(\{ medium: 'vacuum', pace: 0\.9, hopHeightMul: 4, hopTimeMul: 3\.6, climbMul: 2, reachMul: 1\.5, skip: 0\.1 \}\)/);
  });
  it('the Moon\'s files import no other place; the shared world kit is the builder, the suit kit and the ground rule only', () => {
    for (const f of ['moon', 'moonplan', 'moonparts', 'moonsky', 'moonlife']) {
      const src = readFileSync(`src/world/${f}.js`, 'utf8');
      for (const m of src.matchAll(/^import .*?from '(.+?)';/gm)) {
        expect(m[1], `${f} imports ${m[1]}`).toMatch(/^(three|three\/examples\/jsm\/utils\/BufferGeometryUtils\.js|\.\/(builder|localuuids|moon[a-z]*)\.js|\.\.\/(ground|rng|player|placephysics)\.js|\.\.\/render\/materials\.js|\.\.\/cat\/suitkit\.js)$/);
      }
    }
  });
});
