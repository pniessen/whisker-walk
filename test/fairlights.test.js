// The Fairground's lights and flutter (world/fairkit.js, src/fairlive.js):
// bulbs that keep their colour at dusk, dim and shrink by the camera, and
// chase along their strings; bunting that flutters; canvas with no
// zero-area triangles. The shaders themselves run on the GPU; here the
// numbers they read, and that each injection found its place in three's
// own shader source.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const kit = await import('../src/world/fairkit.js');
const { stripes, bunting, bulb, bulbString, canvasOf, glowMesh, glowMaterial, setFairClock, FAIR_CLOCK, GLOW_LOOK, FLUTTER, glowNearScale } = kit;
const { build } = await import('../src/world/fair.js');
const { createFairLive } = await import('../src/fairlive.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);
const meshes = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); });

const triArea2 = (p, i) => {
  const a = new THREE.Vector3().fromArray(p, i);
  const b = new THREE.Vector3().fromArray(p, i + 3).sub(a);
  const c = new THREE.Vector3().fromArray(p, i + 6).sub(a);
  return b.cross(c).length();
};
// three's own standard shader, through a material's onBeforeCompile
function compiled(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  return shader;
}

describe('striped canvas', () => {
  it('draws no triangle without area', () => {
    const P = [];
    // a valance: a flat ring with scallops, which used to draw two empty triangles a panel
    stripes(P, 2, 1, 2, 1, [0xff0000, 0xffffff], 0, 0, 0, { sides: 12, scallop: 0.3 });
    expect(P[0].attributes.position.count / 3).toBe(12);
    // a cone drawn up from a point
    const Q = [];
    stripes(Q, 0, 0, 1, 1, [0xff0000], 0, 0, 0, { sides: 8 });
    expect(Q[0].attributes.position.count / 3).toBe(8);
    for (const g of [...P, ...Q]) for (let i = 0; i < g.attributes.position.array.length; i += 9) expect(triArea2(g.attributes.position.array, i)).toBeGreaterThan(1e-7);
  });

  it('leaves none on any canvas at the fair', () => {
    let empty = 0;
    for (const m of meshes) {
      if (m.material?.side !== THREE.DoubleSide || !m.geometry.attributes.fairSway) continue;
      const p = m.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 9) if (triArea2(p, i) < 1e-7) empty++;
    }
    expect(empty).toBe(0);
  });
});

describe('bunting that flutters', () => {
  it('holds each pennant at the wire and lets its tip go', () => {
    const P = [];
    bunting(P, [0, 4, 0], [5, 4, 0], { sag: 0.5 });
    const g = canvasOf(P, 't').geometry;
    const sway = g.attributes.fairSway.array;
    const y = g.attributes.position.array;
    let tips = 0;
    for (let i = 0; i < sway.length; i++) {
      expect(sway[i] === 0 || sway[i] === 1).toBe(true);
      if (sway[i] === 1) {
        tips++;
        // a tip hangs below the wire's ends, never above
        expect(y[i * 3 + 1]).toBeLessThan(4);
      }
    }
    expect(tips).toBe(Math.max(2, Math.round(5 / 0.55)));
  });

  it('gives every canvas mesh at the fair the same attributes, so they still merge together', () => {
    const canvases = meshes.filter((m) => m.material?.side === THREE.DoubleSide && m.material.onBeforeCompile === meshes.find((n) => n.name === 'fairBunting').material.onBeforeCompile);
    expect(canvases.length).toBeGreaterThanOrEqual(10);
    for (const m of canvases) expect(m.geometry.attributes.fairSway, m.name).toBeTruthy();
    // only the bunting moves
    const moving = canvases.filter((m) => m.geometry.attributes.fairSway.array.some((v) => v > 0)).map((m) => m.name);
    expect(moving).toEqual(['fairBunting']);
    // and the prop merge keeps the flutter: the bunting's tips still sway after it
    const s2 = new THREE.Scene();
    build(s2);
    mergeStaticProps(s2);
    let swaying = 0;
    s2.traverse((o) => { if (o.isMesh && o.geometry.attributes.fairSway?.array.some((v) => v > 0)) swaying++; });
    expect(swaying).toBe(1);
  });

  it('flutters in the vertex shader, and stands still with reduced motion', () => {
    const m = meshes.find((n) => n.name === 'fairBunting');
    const s = compiled(m.material);
    expect(s.vertexShader).toContain('attribute float fairSway;');
    expect(s.vertexShader).toMatch(/#include <begin_vertex>\nif \(fairSway > 0\.0/);
    expect(s.uniforms.fairFlutterOn).toBe(FAIR_CLOCK.flutterOn);
    expect(s.uniforms.fairFlutterA).toBe(FAIR_CLOCK.flutterA);
    expect(FLUTTER.amp).toBeLessThanOrEqual(0.12); // a flutter, not a flap
    setFairClock(1000, true);
    expect(FAIR_CLOCK.flutterOn.value).toBe(0);
    setFairClock(1000, false);
    expect(FAIR_CLOCK.flutterOn.value).toBe(1);
  });
});

describe('the glow', () => {
  const glowing = meshes.filter((m) => m.userData.fairGlow);

  it('marks every bulb with its radius and its place in the chase', () => {
    expect(glowing.length).toBeGreaterThanOrEqual(9);
    for (const m of glowing) {
      const a = m.geometry.attributes;
      expect(a.fairChase, m.name).toBeTruthy();
      expect(a.fairBulbR, m.name).toBeTruthy();
      let bulbs = 0;
      for (let i = 0; i < a.fairBulbR.count; i++) {
        if (a.fairBulbR.array[i] === 0) {
          // not a bulb (a stall's sign board, a wagon's window pane): it glows steady
          expect(a.fairChase.array[i]).toBe(-1);
          continue;
        }
        // every bulb chases, and is the size of a bulb
        bulbs++;
        expect(a.fairChase.array[i]).toBeGreaterThan(-0.5);
        expect(a.fairBulbR.array[i]).toBeGreaterThan(0.04);
        expect(a.fairBulbR.array[i]).toBeLessThan(0.1);
      }
      expect(bulbs, m.name).toBeGreaterThan(0);
    }
  });

  it('chases round a ring in whole waves, so there is no seam', () => {
    // a ring of 24 bulbs round the y axis, 3 m across
    const L = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; bulb(L, Math.cos(a) * 1.5, 2, Math.sin(a) * 1.5); }
    const g = glowMesh(L, 'ring', glowMaterial()).geometry;
    const c = Array.from({ length: 24 }, (_, i) => g.attributes.fairChase.array[i * 24]);
    const waves = Math.round((2 * Math.PI * 1.5) / GLOW_LOOK.wave);
    const steps = c.map((v, i) => { let d = c[(i + 1) % 24] - v; d -= Math.round(d / waves) * waves; return d; });
    for (const d of steps) expect(d).toBeCloseTo(waves / 24, 5);
  });

  it('chases along a string from one end to the other', () => {
    const P = [];
    bulbString(P, null, [0, 4, 0], [7, 4, 0], { every: 0.7 });
    const g = glowMesh(P, 's', glowMaterial()).geometry;
    const c = [];
    for (let i = 0; i < g.attributes.fairChase.count; i += 24) c.push(g.attributes.fairChase.array[i]);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    expect(c[1] - c[0]).toBeCloseTo(0.7 / GLOW_LOOK.wave, 5);
  });

  it('keeps anything that is not a bulb steady', () => {
    const L = [];
    kit.box(L, 0.5, 0.4, 0.05, 0, 1, 0, 0xffe0a0); // a window pane
    bulb(L, 0, 2, 0);
    const g = glowMesh(L, 'w', glowMaterial()).geometry;
    expect(g.attributes.fairChase.array[0]).toBe(-1);
    expect(g.attributes.fairBulbR.array[0]).toBe(0);
    const onlyPanes = [];
    kit.box(onlyPanes, 0.5, 0.4, 0.05, 0, 1, 0, 0xffe0a0);
    const h = glowMesh(onlyPanes, 'p', glowMaterial()).geometry;
    expect(h.attributes.fairChase.array.every((v) => v === -1)).toBe(true);
  });

  it('shades a bulb round: its normals point out from its centre', () => {
    const g = bulb([], 1, 2, 3, 0xffffff, 0.06);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const out = new THREE.Vector3(p.getX(i) - 1, p.getY(i) - 2, p.getZ(i) - 3).normalize();
      expect(out.dot(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)))).toBeCloseTo(1, 5);
    }
  });

  it('dims a bulb near the camera, wherever the strings hang', () => {
    expect(glowNearScale(0)).toBeCloseTo(GLOW_LOOK.nearScale, 9);
    expect(glowNearScale(GLOW_LOOK.far)).toBe(1);
    expect(glowNearScale(50)).toBe(1);
    let last = 0;
    for (let d = 0; d < 8; d += 0.25) { const k = glowNearScale(d); expect(k).toBeGreaterThanOrEqual(last); last = k; }
    // at a metre, a bulb gives off a tenth of its glow or less
    expect(glowNearScale(1)).toBeLessThanOrEqual(0.1);
  });

  it('injects its code into three\'s shaders (all in the vertex shader)', () => {
    const s = compiled(area.glow.material);
    for (const piece of ['attribute float fairChase;', 'attribute float fairBulbR;', 'vFairGlow = fairC', 'cameraPosition', 'transformed = fairMid']) expect(s.vertexShader).toContain(piece);
    expect(s.fragmentShader).toContain('varying vec3 vFairGlow;');
    expect(s.fragmentShader).toContain('totalEmissiveRadiance *= vFairGlow;');
    expect(s.uniforms.fairChasePhase).toBe(FAIR_CLOCK.chase);
    expect(s.uniforms.fairChaseOn).toBe(FAIR_CLOCK.chaseOn);
    // the old program would be wrong for the new attributes
    expect(area.glow.material.customProgramCacheKey()).not.toBe('fair-glow-v1');
    // rough: a sign or a pane on it shows no sun glint by day
    expect(area.glow.material.roughness).toBeGreaterThanOrEqual(0.6);
  });
});

describe('the clock', () => {
  it('runs the chase and the flutter, seamlessly, from the time of day', () => {
    setFairClock(1795051577.25);
    const a = FAIR_CLOCK.chase.value;
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    setFairClock(1795051577.25 + 1 / GLOW_LOOK.speed);
    expect(FAIR_CLOCK.chase.value).toBeCloseTo(a, 5);
    for (const k of ['flutterA', 'flutterB']) {
      expect(FAIR_CLOCK[k].value).toBeGreaterThanOrEqual(0);
      expect(FAIR_CLOCK[k].value).toBeLessThan(Math.PI * 2);
    }
    setFairClock(NaN);
    expect(Number.isFinite(FAIR_CLOCK.chase.value)).toBe(true);
  });

  it('is set by the rides once a frame, and holds still with reduced motion', () => {
    const cat = new THREE.Object3D();
    cat.position.set(0, 0, 20);
    const ctx = { cat, player: { perchY: 0 }, session: { perched: null } };
    let T = 5000;
    const live = createFairLive(scene, area, { now: () => T });
    live.update(0.016, 0, ctx);
    expect(FAIR_CLOCK.chaseOn.value).toBe(1);
    const c0 = FAIR_CLOCK.chase.value;
    T += 0.5;
    live.update(0.016, 0, ctx);
    expect(FAIR_CLOCK.chase.value).not.toBe(c0);
    live.dispose();
    const still = createFairLive(scene, area, { now: () => T, reducedMotion: true });
    still.update(0.016, 0, ctx);
    expect(FAIR_CLOCK.chaseOn.value).toBe(0);
    expect(FAIR_CLOCK.flutterOn.value).toBe(0);
    still.dispose();
  });
});

// Beauty pass 2: lit bulbs swell, the midway has a calliope, a crowd and a bell.
describe('the midway after dark (beauty pass 2)', () => {
  it('lights swell the bulbs through one shared number', async () => {
    const { setFairGlow } = await import('../src/world/fair.js');
    setFairGlow(area, 1);
    expect(FAIR_CLOCK.lit.value).toBe(1);
    setFairGlow(area, 0);
    expect(FAIR_CLOCK.lit.value).toBe(0);
    expect(GLOW_LOOK.halo).toBeGreaterThan(0);
  });
  it('the calliope, murmur and bell play near the merry-go-round and are silent far away', async () => {
    const { MIDWAY } = await import('../src/fairlive.js');
    const run = (x, z) => {
      const events = [];
      let T = 100;
      const live = createFairLive(scene, area, { now: () => T, onEvent: (e) => events.push(e) });
      const cat = new THREE.Object3D(); cat.position.set(x, 0, z);
      const player = { speed: 0, perchY: 0, halt() {}, setViewYaw() {} };
      const session = { perched: null, idleTime: 0 };
      for (let i = 0; i < 1800; i++) { T += 1 / 30; live.update(1 / 30, i / 30, { cat, player, session }); }
      return events;
    };
    const near = run(0, 9.6);
    const kinds = new Set(near.map((e) => e.type));
    expect(kinds.has('calliope')).toBe(true);
    expect(kinds.has('murmur')).toBe(true);
    const far = run(-40, -40);
    expect(far.some((e) => ['calliope', 'murmur', 'bell'].includes(e.type))).toBe(false);
    expect(MIDWAY.hear).toBeGreaterThan(MIDWAY.bellHear);
  });
});

// Beauty pass 3: the fair notices her and lives (fairalive.js, fairkit.js setFairCat).
describe('the fair reacts to her (beauty pass 3)', () => {
  it('the shaders read where she is, and the numbers follow her and hold still with reduced motion', async () => {
    const { setFairCat, CAT_LOOK } = await import('../src/world/fairkit.js');
    const gs = compiled(glowMaterial());
    expect(gs.vertexShader).toContain('fairCatK');
    expect(gs.uniforms.fairCatX).toBe(FAIR_CLOCK.catX);
    const cs = compiled(meshes.find((n) => n.name === 'fairBunting').material);
    expect(cs.vertexShader).toContain('fairCatOn');
    setFairCat(3, -4, 100.1, 0.5);
    expect([FAIR_CLOCK.catX.value, FAIR_CLOCK.catZ.value, FAIR_CLOCK.catOn.value]).toEqual([3, -4, 1]);
    expect(FAIR_CLOCK.beat.value).toBeGreaterThan(0);
    setFairCat(3, -4, 100.1, 0.5, true);
    expect([FAIR_CLOCK.catOn.value, FAIR_CLOCK.beat.value, FAIR_CLOCK.breath.value]).toEqual([0, 0, 0]);
    expect(CAT_LOOK.flutter).toBeGreaterThan(0);
  });
  it('kicked bits, steam and a dusk firework are five Points and no mesh; reduced motion draws none; a lite pool is smaller', async () => {
    const { createFairAlive, fireAt, ALIVE } = await import('../src/fairalive.js');
    const sc = new THREE.Scene();
    const a = createFairAlive({ scene: sc });
    const pts = []; sc.traverse((o) => { if (o.isPoints) pts.push(o); });
    expect(pts.length).toBe(13); // pass 3 and 4's five, the balloon's basket, pass 5's six, pass 7's vista pool
    expect(sc.children.some((c) => c.isMesh)).toBe(false);
    let moved = 0;
    for (let i = 0; i < 90; i++) { a.update(1 / 30, 5000 + i / 30, { x: i * 0.06, z: 20 }, 1, 2); }
    const bits = pts.find((p) => p.name === 'fair:bits');
    for (let i = 0; i < a.counts.bits; i++) if (bits.geometry.attributes.position.array[i * 3 + 1] > -900) moved++;
    expect(moved).toBeGreaterThan(0);
    a.dispose();
    const rm = createFairAlive({ scene: new THREE.Scene(), reducedMotion: true });
    expect(rm.counts.bits + rm.counts.steam + rm.counts.spark).toBe(0);
    const lite = createFairAlive({ scene: new THREE.Scene(), scale: 0.25 });
    expect(lite.counts.bits).toBeLessThan(a.counts.bits);
    expect(lite.counts.spark).toBe(0);
    const f = fireAt(1000);
    expect(f.local).toBeGreaterThanOrEqual(0);
    expect(f.local).toBeLessThan(ALIVE.fireEvery);
  });
  it('a ride that she walks up to rings and whooshes, never while she is riding', () => {
    const events = [];
    let T = 100;
    const live = createFairLive(scene, area, { now: () => T, onEvent: (e) => events.push(e) });
    const cat = new THREE.Object3D(); cat.position.set(0, 0, 4.5);
    const player = { speed: 0, perchY: 0, halt() {}, setViewYaw() {} };
    for (let i = 0; i < 120; i++) { T += 1 / 30; live.update(1 / 30, i / 30, { cat, player, session: { perched: null } }); }
    const kinds = events.map((e) => e.type);
    expect(kinds).toContain('ride-whoosh');
    const rings = events.filter((e) => e.type === 'bell' && e.volume === 0.7).length;
    expect(rings).toBeLessThanOrEqual(1);
    events.length = 0;
    for (let i = 0; i < 120; i++) { T += 1 / 30; live.update(1 / 30, i / 30, { cat, player, session: { perched: { id: 'seat' } } }); }
    expect(events.some((e) => e.type === 'ride-whoosh')).toBe(false);
    live.dispose();
  });

  it('beauty pass 4: the rare moments are pure functions of the time of day, rare, and the season recolours the paint', async () => {
    const { balloonAt, cannonAt, flockAt, luckyAt, createFairAlive } = await import('../src/fairalive.js');
    const { SEASONS, seasonOf, setFairSeason, fairSeason } = kit;
    let b = 0; let c = 0; let f = 0; let l = 0; const N = 20000;
    for (let T = 0; T < 86400; T += 4.3) { if (balloonAt(T)) b++; if (cannonAt(T) >= 0) c++; if (flockAt(T) >= 0) f++; if (luckyAt(T)) l++; }
    for (const n of [b, c, f, l]) { expect(n).toBeGreaterThan(0); expect(n / (86400 / 4.3)).toBeLessThan(0.45); }
    expect(balloonAt(12345.6)).toEqual(balloonAt(12345.6));
    expect(seasonOf(new Date(2026, 3, 1))).toBe('spring');
    expect(seasonOf(new Date(2026, 6, 1))).toBe('summer');
    expect(seasonOf(new Date(2026, 9, 31))).toBe('autumn');
    expect(seasonOf(new Date(2026, 0, 5))).toBe('winter');
    expect(SEASONS.autumn.bunting).not.toEqual(SEASONS.summer.bunting);
    setFairSeason('nonsense'); expect(Object.keys(SEASONS)).toContain(fairSeason());
    // a lucky bulb turns gold once when she passes it, and a firework's burst pops once, never muted by a wrong volume
    let Tl = 0; for (; Tl < 86400 && !luckyAt(Tl); Tl += 1);
    const lk = luckyAt(Tl);
    const sc = new THREE.Scene(); const ev = [];
    const a = createFairAlive({ scene: sc, onEvent: (e) => ev.push(e) });
    for (let i = 0; i < 40; i++) a.update(1 / 30, Tl + i / 30, { x: lk.x, z: lk.z + 1 }, 1, 0);
    expect(ev.filter((e) => e.type === 'lucky').length).toBe(1);
    const rm = []; const r = createFairAlive({ scene: new THREE.Scene(), reducedMotion: true, onEvent: (e) => rm.push(e) });
    r.update(1 / 30, Tl, { x: lk.x, z: lk.z }, 1, 0);
    expect(rm.length).toBe(0);
  });
});
