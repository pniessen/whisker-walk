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
import { starField, withSun, SUN_SKY, paintEarth, createMoonSky } from '../src/world/moonsky.js';
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
  it('the grain is a mid grey with specks, 2,600 of them', () => {
    const g = fakeContext();
    paintGrain(g);
    expect(g.calls.filter((c) => c[0] === 'fillRect')).toHaveLength(2601);
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

describe('nothing else knows', () => {
  it('only the Moon\'s own files name the beauty files; start-up never does', () => {
    const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
    for (const f of files) {
      if (/^src\/world\/moon[a-z0-9]*\.js$/.test(f)) continue;
      expect(read(f), f).not.toMatch(/moonbeauty/);
    }
    expect(read('src/main.js')).not.toMatch(/moonbeauty/);
  });
  it('draws no random number and reads no clock', () => {
    for (const f of ['src/world/moonbeauty.js', 'src/world/moonbeautyplan.js']) {
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
