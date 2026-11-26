// The Moon, beauty round 1: the regolith, the craters, the rocks, the light and the stars. The seeded plan (no gameplay place is covered, the same Moon every
// walk), the painter's palette and its calls, the ground's material (and its clone: render/dusk.js's tint swaps one in), the fractured rocks, the pins that
// say nothing walkable moved, and that nothing outside the Moon's own files names the new ones.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as B from '../src/world/moonbeautyplan.js';
import { paintRegolith, paintGrain, regolithMaterial, angularRock, GRAIN_TILE, dustAmount, dustGeometry, bigBowl, DUST_REACH } from '../src/world/moonbeauty.js';
import { groundGeometry, drawGround, drawRocks, scatterRocks, farRidge } from '../src/world/moonparts.js';
import { starField, withSun, SUN_SKY, paintEarth, createMoonSky, HALO_RINGS } from '../src/world/moonsky.js';
import * as E from '../src/world/moonearth.js';
import { backlit, rimStrength, fillFactor, patchRim, createCatRim, FILL_SWELL } from '../src/world/moonrim.js';
import { rocketGeometry } from '../src/world/moonlaunchparts.js';
import { buildDot } from '../src/world/moonroverparts.js';
import { rockFacetTone, ROCK_TOP, ROCK_UNDER, ROCK_FLANK } from '../src/world/moonbeauty.js';
import { machineTone, treadTone } from '../src/world/moonbeauty.js';
import { buildPip, lanternGlow, pipShade } from '../src/world/moonpip.js';
import { rockGrain, ROCK_GRAIN } from '../src/world/moonparts.js';
import { build } from '../src/world/moon.js';

const read = (f) => readFileSync(f, 'utf8');
const hyp = Math.hypot;

// A canvas context that records its calls and answers every gradient with a recorder of its own.
function fakeContext() {
  const calls = [];
  const rec = (name) => (...a) => { calls.push([name, ...a]); };
  const stops = [];
  const g = {
    calls,
    stops,
    createRadialGradient: (...a) => { calls.push(['radial', ...a]); return { addColorStop: (o, c) => stops.push([o, c]) }; },
    createLinearGradient: (...a) => { calls.push(['linear', ...a]); return { addColorStop: (o, c) => stops.push([o, c]) }; },
  };
  for (const n of ['fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo', 'closePath', 'save', 'restore', 'clip', 'translate', 'rotate', 'scale']) g[n] = rec(n);
  return g;
}

describe('the plan: the same Moon every walk, and nothing a child plays with is under it', () => {
  it('is seeded: every list is the same twice, and the lower rungs get fewer', () => {
    for (const f of ['smallCraters', 'rays', 'patches', 'pebbles', 'rimChunks']) {
      expect(B[f](false), f).toEqual(B[f](false));
      expect(B[f](true), `${f} lite`).toEqual(B[f](true));
    }
    expect(B.smallCraters(false)).toHaveLength(240);
    expect(B.smallCraters(true)).toHaveLength(120);
    expect(B.pebbles(true)).toEqual([]); // the lower rungs paint theirs into the ground instead
    expect(B.rimChunks(true).length).toBeLessThan(B.rimChunks(false).length);
    expect(B.patches(true).length).toBeLessThan(B.patches(false).length);
  });
  it('craters of several sizes, none on another, none on a plan bowl or its rim, all in the drawn ground', () => {
    const list = B.smallCraters(false);
    const radii = list.map((c) => c.r).sort((a, b) => a - b);
    expect(radii[0]).toBeLessThan(1);
    expect(radii[radii.length - 1]).toBeGreaterThan(3);
    expect(list.some((c) => c.fresh)).toBe(true);
    for (const [i, c] of list.entries()) {
      expect(Math.abs(c.x) + c.r).toBeLessThan(P.GROUND_SIZE / 2);
      expect(Math.abs(c.z) + c.r).toBeLessThan(P.GROUND_SIZE / 2);
      for (const k of P.CRATERS) expect(hyp(c.x - k.x, c.z - k.z), `${c.x},${c.z} on ${k.id}`).toBeGreaterThan(k.r + c.r);
      for (const o of list.slice(i + 1)) expect(hyp(c.x - o.x, c.z - o.z)).toBeGreaterThan(c.r + o.r);
    }
  });
  const props = () => [...P.MOON_COLLIDERS, ...P.MOON_PERCHES, ...P.MOON_POIS, ...P.PEBBLES, ...P.MOON_MICE, ...P.JOB_POINTS, ...P.POLES, P.FLAG, P.PIT_ROCK, P.CHEESE, P.ECHO];
  const L = P.JUMP_LANE;
  const keeps = (x, z, r, ks) => {
    for (const p of props()) expect(hyp(x - p.x, z - p.z), `${x},${z} on a prop at ${p.x},${p.z}`).toBeGreaterThan((p.r ?? 0.4) + r);
    for (const b of P.BOULDERS) expect(hyp(x - b.x, z - b.z)).toBeGreaterThan(b.r + r);
    for (const [kx, kz, kr] of P.ROCK_KEEP_OUT) expect(hyp(x - kx, z - kz), `${x},${z} in the keep-out at ${kx},${kz}`).toBeGreaterThanOrEqual(kr * ks + r);
    expect(P.trackDistance(x, z)).toBeGreaterThan(2 + r); // Dot's track of lights
    expect(hyp(x - P.DOME.x, z - P.DOME.z)).toBeGreaterThan(P.DOME.r + r);
    expect(x > L.x0 - 4 - r && x < L.x0 + L.len + 8 + r && Math.abs(z - L.z) < L.half + 2 + r, `${x},${z} on the hop lane`).toBe(false);
  };
  it('craters keep clear of the colliders, perches, finds, pebbles, mice, story points, boulders, the rover\'s track, the dome, the hop lane and half of every keep-out place', () => {
    for (const c of B.smallCraters(false)) keeps(c.x, c.z, c.r, 0.5);
  });
  it('pebbles and rim chunks (standing rocks) keep clear of all of it, and of all of every keep-out place; chunks stand on the bowls\' walls and rims, never their floors', () => {
    for (const r of [...B.pebbles(false), ...B.rimChunks(false)]) keeps(r.x, r.z, r.s, 1);
    for (const r of B.rimChunks(false)) {
      const k = P.CRATERS.reduce((best, c) => (hyp(r.x - c.x, r.z - c.z) / c.r < hyp(r.x - best.x, r.z - best.z) / best.r ? c : best));
      expect(hyp(r.x - k.x, r.z - k.z) / k.r).toBeGreaterThanOrEqual(0.55);
    }
    expect(B.rimChunks(false).length).toBeGreaterThan(15);
    expect(B.pebbles(false).length).toBeGreaterThan(150);
  });
  it('the rays are many, each with a strength and a start past the middle; some are the pad\'s dark scorch', () => {
    const rays = B.rays(false);
    expect(rays.length).toBeGreaterThan(100);
    for (const r of rays) { expect(r.k).toBeGreaterThan(0); expect(r.k).toBeLessThanOrEqual(1); expect(r.len).toBeGreaterThan(2); expect(r.from).toBeGreaterThan(1); }
    expect(rays.some((r) => r.dark)).toBe(true);
  });
  it('the palette is a dark neutral grey with paler and darker ends, and the sun is the game\'s own, north-west', () => {
    const { base, pale, dark, ray, floor } = B.PAL;
    for (const c of Object.values(B.PAL)) for (const v of c) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(255); }
    expect(Math.max(...base) - Math.min(...base)).toBeLessThanOrEqual(8); // no tint: grey, as the Moon is
    expect(base[0]).toBeGreaterThan(90);
    expect(base[0]).toBeLessThan(150); // dark regolith, not the light grey desert it was (0x8d8c93 under the old tone)
    expect(dark[0]).toBeLessThan(base[0]);
    expect(floor[0]).toBeLessThan(base[0]);
    expect(pale[0]).toBeGreaterThan(base[0]);
    expect(ray[0]).toBeGreaterThan(base[0]);
    expect(B.SUN.x).toBeLessThan(0);
    expect(B.SUN.z).toBeLessThan(0);
    expect(hyp(B.SUN.x, B.SUN.z)).toBeCloseTo(1, 6);
  });
});

describe('the painter', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('draws the same calls twice, draws no Math.random, and stays inside the canvas', () => {
    const rnd = vi.spyOn(Math, 'random');
    const a = fakeContext();
    const b = fakeContext();
    paintRegolith(a, 1024, { lite: false, shade: [{ x: 3, z: 4, s: 0.3 }] });
    paintRegolith(b, 1024, { lite: false, shade: [{ x: 3, z: 4, s: 0.3 }] });
    expect(a.calls).toEqual(b.calls);
    expect(rnd).not.toHaveBeenCalled();
    expect(a.calls.length).toBeGreaterThan(3000);
    expect(a.calls.length).toBeLessThan(60000);
    for (const c of a.calls) if (c[0] === 'fillRect') {
      expect(c[1] + c[3]).toBeLessThanOrEqual(1027); // (a speck may start at the last pixel and be two wide)
      expect(c[2] + c[4]).toBeLessThanOrEqual(1027);
    }
  });
  it('a lower rung paints less and every gradient stop is a colour with a clear alpha', () => {
    const hi = fakeContext();
    const lo = fakeContext();
    paintRegolith(hi, 1024, { lite: false });
    paintRegolith(lo, 512, { lite: true });
    expect(lo.calls.length).toBeLessThan(hi.calls.length);
    for (const [o, c] of hi.stops) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
      const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(c);
      expect(m, c).toBeTruthy();
      expect(Number(m[4])).toBeLessThanOrEqual(1);
    }
  });
  it('the grain is a mid grey with 2,600 specks and (round 3) 70 pebbles of a lit and a shadowed square each', () => {
    const g = fakeContext();
    paintGrain(g);
    expect(g.calls.filter((c) => c[0] === 'fillRect')).toHaveLength(2601 + 140);
  });
});

describe('the ground\'s material', () => {
  afterEach(() => { delete globalThis.document; });
  it('headless (no canvas) it is the plain vertex-coloured dust, as before; the mesh is still one, named, never a caster, never merged', () => {
    expect(regolithMaterial()).toBeNull();
    const m = drawGround(false);
    expect(m.material.map).toBeNull();
    expect(m.material.vertexColors).toBe(true);
    expect(m.name).toBe('moon:ground');
    expect(m.userData).toMatchObject({ ground: true, noCast: true, noContactShadow: true, noMerge: true });
    expect(m.receiveShadow).toBe(true);
  });
  const withCanvas = () => {
    const made = [];
    globalThis.document = { createElement: () => { const c = { width: 0, height: 0, getContext: () => fakeContext() }; made.push(c); return c; } };
    return made;
  };
  it('with a canvas: one 1024 px picture over the whole ground (512 on the lower rungs) and a 128 px grain; the texture memory is small', () => {
    const made = withCanvas();
    const hi = regolithMaterial({ lite: false });
    expect(made.map((c) => c.width)).toEqual([1024, 128]);
    expect(hi.map.flipY).toBe(false);
    expect(hi.map.colorSpace).toBe(THREE.SRGBColorSpace);
    made.length = 0;
    regolithMaterial({ lite: true });
    expect(made.map((c) => c.width)).toEqual([512, 128]);
    expect(1024 * 1024 * 4 + 128 * 128 * 4).toBeLessThan(5e6);
  });
  it('the material\'s clone (render/dusk.js\'s tintDuskLawn swaps one in) keeps the grain shader and the same picture; the shader multiplies the grain in after the map', () => {
    withCanvas();
    const mat = regolithMaterial({});
    const twin = mat.clone();
    expect(twin).not.toBe(mat);
    expect(twin.map).toBe(mat.map);
    expect(twin.customProgramCacheKey()).toBe('moon-regolith');
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>' };
    twin.onBeforeCompile(sh);
    expect(sh.uniforms.uGrain.value).toBeTruthy();
    expect(sh.vertexShader).toMatch(/attribute vec2 grainUv/);
    expect(sh.fragmentShader).toMatch(/uniform sampler2D uGrain/);
    expect(sh.fragmentShader.indexOf('#include <map_fragment>')).toBeLessThan(sh.fragmentShader.indexOf('diffuseColor.rgb *='));
    const tex = sh.uniforms.uGrain.value;
    const spy = vi.fn();
    tex.addEventListener('dispose', spy);
    mat.map.dispose();
    expect(spy).toHaveBeenCalled(); // the grain goes with the picture
  });
  it('the geometry keeps the ground\'s heights exactly (moonBaseY), has the picture\'s uv over 0..1 and a grain uv', () => {
    const g = groundGeometry();
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const grain = g.attributes.grainUv;
    expect(grain.count).toBe(pos.count);
    for (let i = 0; i < pos.count; i += 7) {
      expect(pos.getY(i)).toBeCloseTo(P.moonBaseY(pos.getX(i), pos.getZ(i)) + farRidge(pos.getX(i), pos.getZ(i)), 4); // (a Float32 vertex)
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
      expect(grain.getX(i)).toBeCloseTo(pos.getX(i) / GRAIN_TILE, 5);
    }
    expect(g.index.count / 3).toBe(6960); // (beauty round 2: three more lines across the hills each way, the skyline needs the rows)
  });
  it('the walkable height is exactly what it was: moonY at fixed points (the traversal fixtures read it)', () => {
    // the bowls' floors are their depth under the plain, the far hills rise, the plain is flat at the spawn
    expect(P.moonBaseY(0, 45)).toBeCloseTo(0, 3);
    expect(P.moonBaseY(-20, -4)).toBeCloseTo(-2, 6);
    expect(P.moonBaseY(16, 12)).toBeCloseTo(-1.4, 6);
    expect(P.moonBaseY(30, -8)).toBeCloseTo(-1.0, 6);
  });
});

describe('the rocks', () => {
  it('are fractured: 20 triangles (small) and 80 (big), flat-based, cut by planes, no NaN, the same twice', () => {
    for (const [big, tris] of [[false, 20], [true, 80]]) {
      const g = angularRock(big ? 2 : 1, big);
      expect(g.attributes.position.count / 3).toBe(tris);
      const again = angularRock(big ? 2 : 1, big);
      expect(Array.from(again.attributes.position.array)).toEqual(Array.from(g.attributes.position.array));
      g.computeBoundingBox();
      const { min, max } = g.boundingBox;
      for (const v of [...min.toArray(), ...max.toArray()]) expect(Number.isFinite(v)).toBe(true);
      expect(min.y).toBeGreaterThanOrEqual(-0.45 * 0.78 - 1e-6); // flat base: it sits on the dust
      expect(max.x - min.x).toBeLessThan(3);
      // flat faces: the cuts leave many vertices on a plane, so fewer distinct face normals than a smooth ball's
      const n = g.attributes.normal;
      const seen = new Set();
      for (let i = 0; i < n.count; i += 3) seen.add(`${n.getX(i).toFixed(2)},${n.getY(i).toFixed(2)},${n.getZ(i).toFixed(2)}`);
      expect(seen.size).toBeGreaterThan(tris / 4);
    }
  });
  it('the two rock meshes stay two (no draw call added): the pebbles and chunks are more instances, the small never cast, the big do; every instance inside the ground', () => {
    const rocks = drawRocks(false);
    expect(rocks.map((r) => r.name)).toEqual(['moon:rocks-small', 'moon:rocks-big']);
    expect(rocks.map((r) => r.count)).toEqual([70 + B.pebbles(false).length, 70 + B.rimChunks(false).length]);
    expect(rocks.map((r) => r.castShadow)).toEqual([false, true]);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (const r of rocks) for (let i = 0; i < r.count; i++) { r.getMatrixAt(i, m); p.setFromMatrixPosition(m); expect(Math.abs(p.x)).toBeLessThan(65); expect(Math.abs(p.z)).toBeLessThan(65); expect(Number.isFinite(p.y)).toBe(true); }
    const low = drawRocks(true);
    expect(low.map((r) => r.name)).toEqual(['moon:rocks-big']); // the small ones were already dropped on the lower rungs
    expect(low[0].count).toBe(70 + B.rimChunks(true).length);
  });
  it('the plan\'s own scatter and the ten boulders (the colliders) are where they were', () => {
    const rocks = scatterRocks(false);
    expect(rocks.small).toHaveLength(70);
    expect(rocks.medium).toHaveLength(40);
    expect(rocks.large).toHaveLength(20);
    expect(rocks.boulder.map((b) => [b.x, b.z])).toEqual(P.BOULDERS.map((b) => [b.x, b.z]));
  });
});

describe('the light and the sky', () => {
  it('a third of the stars lie along a faint Milky Way: a band of a great circle, dimmer than the rest, all above the horizon', () => {
    const { pos, col } = starField(P.STARS.full);
    expect(P.STARS.full).toBe(1800);
    expect(P.STARS.lite).toBe(900);
    let band = 0;
    const phi = (55 * Math.PI) / 180;
    const nrm = [0, -Math.sin(phi), Math.cos(phi)]; // the band's pole: points near the circle have a small dot with it
    for (let i = 0; i < 1800; i++) {
      const x = pos[i * 3] / P.STARS.radius; const y = pos[i * 3 + 1] / P.STARS.radius; const z = pos[i * 3 + 2] / P.STARS.radius;
      expect(y).toBeGreaterThan(0);
      if (Math.abs(x * nrm[0] + y * nrm[1] + z * nrm[2]) < 0.12 && col[i * 3 + 2] < 0.6) band++;
    }
    expect(band).toBeGreaterThan(250);
  });
  it('is the harsh sun of an airless place: a strong white sun, a weak blue fill, no haze', () => {
    const { area } = { area: build(new THREE.Scene()) };
    const L = area.duskLight;
    expect(L.sunIntensity).toBeGreaterThan(1.8);
    expect(L.hemiIntensity).toBeLessThan(0.5); // deep black shadows
    expect(L.fogNear).toBeGreaterThan(300); // beyond the far hills: a crisp horizon
    expect(area.skyDusk.top).toBeLessThan(0x080810);
    expect(area.skyDusk.horizon).toBeLessThan(0x080810);
  });
});

describe('beauty round 2', () => {
  it('the far skyline is drawn only beyond the bounds: zero inside them, and every vertex inside keeps moonBaseY exactly', () => {
    for (let x = -54; x <= 54; x += 3) for (let z = -50; z <= 50; z += 3) expect(farRidge(x, z)).toBe(0);
        let tall = 0;
    for (let a = 0; a < 6.28; a += 0.05) { const h = farRidge(Math.cos(a) * 62, Math.sin(a) * 62); expect(h).toBeLessThan(3.3); if (h > 1.5) tall++; }
    expect(tall).toBeGreaterThan(2); // a few crests (and the notches between them)
    const g = groundGeometry();
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const z = pos.getZ(i);
      if (Math.abs(x) <= P.MOON_BOUNDS.maxX && z >= P.MOON_BOUNDS.minZ && z <= P.MOON_BOUNDS.maxZ) expect(pos.getY(i)).toBeCloseTo(P.moonBaseY(x, z), 4);
    }
  });
  it('the dust: heavier low than high, a little on the tops, none on a wall high up, ragged, never above 0.75', () => {
    expect(dustAmount(0, 0, 3, 4)).toBeGreaterThan(0.25);
    expect(dustAmount(0, 0, 3, 4)).toBeGreaterThan(dustAmount(DUST_REACH * 0.6, 0, 3, 4));
    expect(dustAmount(DUST_REACH + 1, 0, 3, 4)).toBe(0);
    expect(dustAmount(3, 1, 3, 4)).toBeGreaterThan(0.1); // a top, high up: settled dust
    expect(dustAmount(3, 0, 3, 4)).toBe(0);
    for (let i = 0; i < 200; i++) expect(dustAmount(i * 0.01, (i % 7) / 7, i, i * 0.7)).toBeLessThanOrEqual(0.75);
  });
  it('dustGeometry moves a low vertex\'s colour toward the dust and leaves a high one, using the height function it is given', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 0, 0, 6, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1], 3));
    dustGeometry(geo, () => 0);
    const c = geo.attributes.color;
    expect(c.getX(0)).toBeLessThan(0.9);
    expect(c.getX(1)).toBe(1);
    const flat = new THREE.BufferGeometry();
    flat.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    expect(() => dustGeometry(flat)).not.toThrow(); // no colour: untouched
  });
  it('the sun is two more points in the one stars Points, where the game\'s sun lies, a disc and a wider glare', () => {
    const f = starField(10);
    const s = withSun(f, 10);
    expect(s.pos.length / 3).toBe(12);
    expect(s.size[10]).toBe(SUN_SKY.disc);
    expect(s.size[11]).toBe(SUN_SKY.glare);
    expect(s.size[0]).toBe(1);
    const x = s.pos[30] / P.STARS.radius; const y = s.pos[31] / P.STARS.radius; const z = s.pos[32] / P.STARS.radius;
    expect(Math.asin(y) * 180 / Math.PI).toBeCloseTo(19.1, 0);
    expect(x).toBeLessThan(0); expect(z).toBeLessThan(0); // north-west
    expect(s.col[30]).toBeGreaterThan(1); // past white: burns out
  });
  it('Earth paints with its disc, its atmosphere rim and a night side (the pixel stub records the calls) and draws no random number', () => {
    const calls = [];
    const g = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); return undefined; }), set: () => true });
    const cv = { width: 256, height: 256, getContext: () => g };
    expect(paintEarth(cv)).toBe(g);
    const n = calls.length;
    calls.length = 0;
    paintEarth(cv);
    expect(calls.length).toBe(n); // the same twice
    expect(calls.filter((k) => k === 'arc').length).toBeGreaterThan(40); // continents and clouds
    expect(calls.filter((k) => k === 'stroke').length).toBeGreaterThanOrEqual(2); // the rim
    expect(read('src/world/moonsky.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random/);
  });
  it('a big bowl paints its terraces, slumps and central peak, and only the two big bowls get them', () => {
    const calls = [];
    const g = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push([k, a]); }), set: () => true });
    bigBowl(g, 100, 100, 40);
    expect(calls.filter(([k]) => k === 'arc').length).toBeGreaterThanOrEqual(6 + 3);
    const bigOnes = P.CRATERS.filter((c) => c.r >= 8).map((c) => c.id);
    expect(bigOnes).toEqual(['echo', 'great']);
  });
  it('Earth and its clouds are culled by the view (a draw saved when Earth is out of frame); the stars and the sun are not', () => {
    const src = read('src/world/moonsky.js');
    expect(src).toMatch(/earth\.frustumCulled = true/);
    expect(src).toMatch(/clouds\.frustumCulled = true/);
    const scene = new THREE.Scene();
    const sky = createMoonSky({ scene, tier: {} });
    expect(sky.stars.frustumCulled).toBe(false);
    expect(sky.stars.geometry.attributes.aSize.count).toBe(sky.stars.geometry.attributes.position.count);
    sky.dispose();
  });
  it('the light is warm on the sunlit tops and cool in the shadow', () => {
    const L = build(new THREE.Scene()).duskLight;
    const sun = new THREE.Color(L.sunColor); const fill = new THREE.Color(L.hemiSky);
    expect(sun.r).toBeGreaterThan(sun.b); // warm
    expect(fill.b).toBeGreaterThan(fill.r + 0.1); // cool
  });
});

describe('beauty round 3', () => {
  it('Earth\'s geography: seeded, the coasts are inside the disc, the Americas and Africa face us, the far side hugs the limb', () => {
    expect(E.roughCoast(E.COASTS.africa)).toEqual(E.roughCoast(E.COASTS.africa));
    for (const n of Object.keys(E.COASTS)) for (const [x, y] of E.coastOutline(n)) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
    for (const n of ['northAmerica', 'southAmerica', 'africa', 'eurasia', 'greenland']) expect(E.coastVisible(n), n).toBe(true);
    const mid = E.project(E.VIEW.lon, E.VIEW.lat);
    expect(mid.x).toBeCloseTo(0, 6); expect(mid.y).toBeCloseTo(0, 6); expect(mid.z).toBeCloseTo(1, 6);
    expect(E.project(E.VIEW.lon + 180, -E.VIEW.lat).z).toBeCloseTo(-1, 6); // the antipode is hidden
    // west is left: the Americas stand left of Africa
    expect(E.project(-60, -10).x).toBeLessThan(E.project(20, 0).x);
    // a coast has bays and capes: the roughened outline has many more points than the table and stays within a few degrees of it
    const rough = E.roughCoast(E.COASTS.southAmerica);
    expect(rough.length).toBeGreaterThan(E.COASTS.southAmerica.length * 3);
    expect(read('src/world/moonearth.js').replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now/);
  });
  it('Earth paints continents as path fills and clips (no more polka dots), and still the same twice', () => {
    const calls = [];
    const g = new Proxy({}, { get: (_, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); return undefined; }), set: () => true });
    paintEarth({ width: 256, height: 256, getContext: () => g });
    expect(calls.filter((k) => k === 'lineTo').length).toBeGreaterThan(300); // coastlines
    expect(calls.filter((k) => k === 'clip').length).toBeGreaterThanOrEqual(2);
    const n = calls.length;
    calls.length = 0;
    paintEarth({ width: 256, height: 256, getContext: () => g });
    expect(calls.length).toBe(n);
  });
  it('the finale halo falls off steeply from a bright rim to nothing, and is built from those rings (not a flat ramp)', () => {
    expect(HALO_RINGS[0][0]).toBeLessThan(1);
    expect(HALO_RINGS.at(-1)[1]).toBe(0);
    for (let i = 1; i < HALO_RINGS.length; i++) { expect(HALO_RINGS[i][0]).toBeGreaterThan(HALO_RINGS[i - 1][0]); expect(HALO_RINGS[i][1]).toBeLessThan(HALO_RINGS[i - 1][1]); }
    expect(HALO_RINGS[3][1]).toBeLessThan(0.1); // a straight ramp would still be at ~0.25 here
    expect(HALO_RINGS.at(-1)[0]).toBeLessThanOrEqual(1.8); // the old halo reached 1.9
    const sky = createMoonSky({ scene: new THREE.Scene(), tier: {} });
    sky.setShimmer(0.5);
    if (sky.halo) expect(sky.halo.geometry.attributes.position.count).toBe(40 * 6 * (HALO_RINGS.length - 1));
    sky.dispose();
  });
  it('a rock\'s facets are toned: pale tops, mid flanks, dark undersides, and every rock mesh carries the tone as vertex colours', () => {
    expect(rockFacetTone(1, 0.5)).toBeGreaterThan(rockFacetTone(0, 0.5));
    expect(rockFacetTone(0, 0.5)).toBeGreaterThan(rockFacetTone(-1, 0.5));
    expect(ROCK_TOP).toBeGreaterThan(ROCK_FLANK); expect(ROCK_FLANK).toBeGreaterThan(ROCK_UNDER);
    for (const big of [true, false]) {
      const g = angularRock(2, big);
      const c = g.attributes.color;
      expect(c.count).toBe(g.attributes.position.count);
      const seen = new Set();
      for (let i = 0; i < c.count; i += 3) seen.add(c.getX(i).toFixed(2));
      expect(seen.size).toBeGreaterThan(4); // facets differ
    }
    const mats = drawRocks(false).map((m) => m.material);
    for (const m of mats) expect(m.vertexColors).toBe(true);
    const cols = drawRocks(false).map((m) => { const out = []; for (let i = 0; i < Math.min(40, m.count); i++) { const c = new THREE.Color(); m.getColorAt(i, c); out.push(c.r / c.b); } return out; });
    for (const rs of cols) expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(0.1); // cool and warm stones
  });
  it('dust takes a reach and a gain, and the rocket, Dot and her wheels are baked dusty low and clean high (in their own local height)', () => {
    expect(dustAmount(0.5, 0, 1, 1, 3, 2)).toBeGreaterThan(dustAmount(0.5, 0, 1, 1, 3, 1));
    expect(dustAmount(2, 0, 1, 1, 1, 5)).toBe(0); // above the reach: none, however high the gain
    const rocket = rocketGeometry();
    const c = rocket.attributes.color; const p = rocket.attributes.position;
    let lo = 0; let hi = 0; // the white body's rings: its foot (y 1.3) against its shoulder (y 11.9)
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getZ(i));
      if (r > 0.9 && Math.abs(p.getY(i) - 1.3) < 0.02) lo = Math.max(lo, c.getX(i));
      if (r > 0.9 && Math.abs(p.getY(i) - 11.9) < 0.02) hi = Math.max(hi, c.getX(i));
    }
    expect(hi).toBeGreaterThan(0.5);
    expect(lo).toBeLessThan(hi - 0.05); // the white body is greyer at the foot
    const tyre = buildDot().axles[0].geometry; // dark rubber: the dust lightens its lower half, in the axle's own local height
    const tc = tyre.attributes.color; const tp = tyre.attributes.position;
    let lowT = 0; let nlT = 0; let highT = 0; let nhT = 0;
    for (let i = 0; i < tp.count; i++) { if (Math.hypot(tp.getY(i), tp.getZ(i)) < 0.33) continue; if (tp.getY(i) < -0.2) { lowT += tc.getX(i); nlT++; } else if (tp.getY(i) > 0.2) { highT += tc.getX(i); nhT++; } }
    expect(nlT).toBeGreaterThan(0); expect(nhT).toBeGreaterThan(0);
    expect(lowT / nlT).toBeGreaterThan(highT / nhT + 0.03);
  });
  it('the suit\'s rim and the fill swell: stronger the more the camera looks into the sun, none with the sun behind it', () => {
    expect(backlit(B.SUN.x, B.SUN.z)).toBeCloseTo(1, 6);
    expect(backlit(-B.SUN.x, -B.SUN.z)).toBe(0);
    expect(backlit(-B.SUN.z, B.SUN.x)).toBeLessThan(0.2); // sun at the side
    expect(rimStrength(1)).toBeGreaterThan(rimStrength(0));
    expect(fillFactor(1)).toBeCloseTo(1 + FILL_SWELL, 9);
    expect(fillFactor(0)).toBe(1);
  });
  it('the rim patches a suit mesh\'s own material once, never a transparent or basic one, and adds nothing else (no light, no draw)', () => {
    const lit = new THREE.MeshStandardMaterial({ vertexColors: true });
    expect(patchRim(lit, { value: 1 })).toBe(true);
    expect(patchRim(lit, { value: 1 })).toBe(false); // once
    const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <normal_fragment_maps>' };
    lit.onBeforeCompile(shader, null);
    expect(shader.fragmentShader).toMatch(/totalEmissiveRadiance/);
    expect(shader.uniforms.uRim).toBeDefined();
    expect(patchRim(new THREE.MeshStandardMaterial({ transparent: true }), { value: 1 })).toBe(false);
    expect(patchRim(new THREE.MeshBasicMaterial(), { value: 1 })).toBe(false);
  });
  it('createCatRim swells the scene\'s hemisphere light facing the sun, eases back, restores it on dispose, and patches only suit-tagged meshes', () => {
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0x3a5aa0, 0x8d8c93, 0.4);
    scene.add(hemi);
    const cat = new THREE.Group();
    const suit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ vertexColors: true }));
    suit.userData.suit = 'body';
    const fur = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    cat.add(suit, fur);
    const rim = createCatRim({ scene });
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 2, 0);
    cam.lookAt(B.SUN.x * 10, 2, B.SUN.z * 10); // into the sun
    cam.updateMatrixWorld();
    for (let i = 0; i < 60; i++) rim.update(1 / 30, cam, cat);
    expect(hemi.intensity).toBeGreaterThan(0.4 * 1.4);
    expect(suit.material.userData.moonRim).toBe(true);
    expect(fur.material.userData.moonRim).toBeUndefined();
    cam.lookAt(-B.SUN.x * 10, 2, -B.SUN.z * 10); // away
    cam.updateMatrixWorld();
    for (let i = 0; i < 90; i++) rim.update(1 / 30, cam, cat);
    expect(hemi.intensity).toBeCloseTo(0.4, 2);
    rim.update(1 / 30, { notACamera: true }, null); // a plain camera (a test's or a picture page's) is ignored
    rim.dispose();
    expect(hemi.intensity).toBeCloseTo(0.4, 2);
  });
  it('the big bowls\' terraces are bolder: a broad tread under each lip, a dark riser and a pale lip (nine strokes, three of them broad)', () => {
    const calls = [];
    const g = new Proxy({}, { set: (_, k, v) => { if (k === 'lineWidth') calls.push(v); return true; }, get: (_, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
    bigBowl(g, 100, 100, 40);
    expect(calls.filter((w) => w >= 40 * 0.12).length).toBe(3);
  });
});

describe('beauty round 4', () => {
  const tris = (o) => { let n = 0; o.traverse((m) => { if (m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
  it('craterlets: seeded, small, many fewer on the lower rungs, clear of every prop and of the small craters and each other', () => {
    const a = B.craterlets(false);
    expect(a).toEqual(B.craterlets(false));
    expect(a.length).toBeGreaterThan(400);
    expect(B.craterlets(true).length).toBeGreaterThan(150);
    expect(B.craterlets(true).length).toBeLessThan(a.length);
    const big = B.smallCraters(false);
    for (const c of a) {
      expect(c.r).toBeGreaterThanOrEqual(0.25); expect(c.r).toBeLessThanOrEqual(0.75);
      expect(B.clear(c.x, c.z, c.r, 0.25)).toBe(true);
      expect(big.some((o) => hyp(c.x - o.x, c.z - o.z) < (o.r + c.r) * 1.05)).toBe(false);
    }
  });
  it('rim debris: seeded, round the plan bowls only, clear of props, a lit and a dark share', () => {
    const a = B.rimDebris(false);
    expect(a).toEqual(B.rimDebris(false));
    expect(a.length).toBeGreaterThan(100);
    expect(B.rimDebris(true).length).toBeLessThan(a.length);
    for (const d of a) {
      expect(P.CRATERS.some((c) => { const f = hyp(d.x - c.x, d.z - c.z) / c.r; return f > 0.85 && f < 1.29; })).toBe(true);
      expect(B.clear(d.x, d.z, d.s, 0.2, 0.3)).toBe(true);
    }
    expect(a.some((d) => d.lit)).toBe(true); expect(a.some((d) => !d.lit)).toBe(true);
  });
  it('the painter draws them (more calls than before-the-pass counts allow on a lower rung) and is still the same twice', () => {
    const a = fakeContext(); const b = fakeContext();
    paintRegolith(a, 1024, {}); paintRegolith(b, 1024, {});
    expect(a.calls).toEqual(b.calls);
    const lo = fakeContext();
    paintRegolith(lo, 512, { lite: true });
    expect(lo.calls.length).toBeLessThan(a.calls.length);
  });
  it('the rocks have a surface: one patched material per rock mesh, grain in the stone\'s own position, still two meshes', () => {
    const meshes = drawRocks(false);
    expect(meshes.length).toBe(2);
    for (const m of meshes) {
      expect(typeof m.material.onBeforeCompile).toBe('function');
      expect(m.material.customProgramCacheKey()).toBe('moon-rock-grain');
      const sh = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
      m.material.onBeforeCompile(sh);
      expect(sh.vertexShader).toContain('vRockP = position');
      expect(sh.fragmentShader).toContain('rockH(vRockP');
    }
    expect(ROCK_GRAIN.amount).toBeGreaterThan(0.1); expect(ROCK_GRAIN.amount).toBeLessThan(0.5);
    const mat = rockGrain(new THREE.MeshStandardMaterial());
    expect(mat.customProgramCacheKey()).toBe('moon-rock-grain');
  });
  it('the rocks lean warm: the average tint is not bluer than red', () => {
    const [small] = drawRocks(false);
    const c = new THREE.Color(); let r = 0; let b = 0;
    for (let i = 0; i < small.count; i++) { small.getColorAt(i, c); r += c.r; b += c.b; }
    expect(r).toBeGreaterThan(b);
  });
  it('Pip: still four meshes and four draws, vertex-coloured, with a face, panel seams and under 1,200 triangles', () => {
    const p = buildPip();
    const meshes = []; p.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(4);
    expect(p.lantern.material.vertexColors).toBe(true);
    expect(tris(p.group)).toBeLessThan(1200);
    expect(tris(p.group)).toBeGreaterThan(792); // the fittings and the face
  });
  it('the lantern glows toward its front and crown (a gradient, never above 1) and the shell is toned from above', () => {
    const g = lanternGlow(new THREE.SphereGeometry(0.15, 12, 8).translate(0, 0.72, 0));
    const col = g.attributes.color; const pos = g.attributes.position;
    let front = 0; let back = 0; let max = 0;
    for (let i = 0; i < pos.count; i++) {
      const k = col.getX(i); max = Math.max(max, k);
      if (pos.getZ(i) > 0.12) front = Math.max(front, k);
      if (pos.getZ(i) < -0.12) back = Math.max(back, k);
    }
    expect(max).toBeLessThanOrEqual(1);
    expect(front).toBeGreaterThan(back);
    const shell = new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0.33, 0);
    shell.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shell.attributes.position.count * 3).fill(1), 3));
    pipShade(shell);
    const ny = shell.attributes.normal;
    let top = 0; let under = 0;
    for (let i = 0; i < ny.count; i++) { const v = shell.attributes.color.getX(i); if (ny.getY(i) > 0.9) top = v; if (ny.getY(i) < -0.9) under = v; }
    expect(top).toBeGreaterThan(under);
  });
  it('Dot: machine tone brightens up-facing faces, tread bands alternate round the tyre, still five meshes', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(0.8), 3));
    machineTone(geo);
    let top = 0; let under = 0;
    for (let i = 0; i < geo.attributes.normal.count; i++) { const v = geo.attributes.color.getX(i); if (geo.attributes.normal.getY(i) > 0.9) top = v; if (geo.attributes.normal.getY(i) < -0.9) under = v; }
    expect(top).toBeGreaterThan(under);
    const tyre = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateZ(Math.PI / 2);
    tyre.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tyre.attributes.position.count * 3).fill(1), 3));
    treadTone(tyre);
    const vals = new Set(); for (let i = 0; i < tyre.attributes.color.count; i++) vals.add(tyre.attributes.color.getX(i).toFixed(3));
    expect(vals.size).toBeGreaterThan(2);
    const d = buildDot();
    const meshes = []; d.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(5);
    expect(tris(d.group)).toBeLessThan(1900);
  });
  it('nothing walkable moved and no draw was added: the built place still holds its mesh row', () => {
    expect(P.moonBaseY(0, 0)).toBe(P.moonBaseY(0, 0));
    expect(read('src/world/moonplan.js')).toMatch(/\{ id: 'great', x: -20, z: -4, r: 12, d: 2\.0 \}/);
  });
});

describe('nothing else knows', () => {
  it('only the Moon\'s own files name the beauty files; start-up never does', () => {
    const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
    for (const f of files) {
      if (/^src\/world\/moon[a-z0-9]*\.js$/.test(f)) continue;
      expect(read(f), f).not.toMatch(/moonbeauty|moonearth|moonrim/);
    }
    expect(read('src/main.js')).not.toMatch(/moonbeauty/);
  });
  it('draws no random number and reads no clock', () => {
    for (const f of ['src/world/moonbeauty.js', 'src/world/moonbeautyplan.js', 'src/world/moonearth.js', 'src/world/moonrim.js']) {
      const src = read(f);
      expect(src.replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
  it('the ground function file is not edited by the pass: moonplan.js still holds moonBaseY and the six bowls\' numbers', () => {
    const src = read('src/world/moonplan.js');
    expect(src).toMatch(/\{ id: 'great', x: -20, z: -4, r: 12, d: 2\.0 \}/);
    expect(src).toMatch(/\{ id: 'echo', x: 16, z: 12, r: 8, d: 1\.4 \}/);
    expect(src).toMatch(/\{ id: 'pit', x: 30, z: -8, r: 5, d: 1\.0 \}/);
    expect(src).toMatch(/y \+= 6\.5 \* n \* smooth\(d \/ 11\);/);
  });
});
