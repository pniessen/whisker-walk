// The Treehouse, beauty pass 4 (2026-11-28): stories in the details, the seasons and a rare surprise, paid for by trimmed unseen geometry.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const G = await import('../src/world/treehouseglow.js');
const T = await import('../src/world/treehousetales.js');
const SE = await import('../src/world/treehouseseason.js');
const SU = await import('../src/world/treehousesurprise.js');
const C = await import('../src/world/treehousecritters.js');
const P = await import('../src/world/treehouseplan.js');

describe('treehouse beauty pass 4', () => {
  it('is net-negative: 23 meshes and 1 caster as before, 1,7xx fewer triangles than pass 3 (62,139)', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBe(23);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBe(60413);
    expect(r.whole.triangles).toBeLessThan(62139);
  });

  it('the seasons: four weights that add up to 1, a plateau for each and a cross-fade at the boundary', () => {
    const at = (m, d) => SE.seasonOf(new Date(2026, m - 1, d, 12));
    for (const [m, d, i] of [[1, 15, 3], [4, 15, 0], [7, 15, 1], [10, 15, 2], [12, 20, 3]]) { const w = at(m, d); expect(w[i]).toBeCloseTo(1, 5); }
    for (let day = 1; day <= 365; day += 3) { const w = SE.seasonOf(new Date(2026, 0, day, 12)); expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5); expect(Math.min(...w)).toBeGreaterThanOrEqual(-1e-9); }
    const eve = at(11, 28); expect(eve[2]).toBeGreaterThan(0.6); expect(eve[3]).toBeGreaterThan(0.2); // the end of November: autumn going over to winter
    expect(at(12, 1)[3]).toBeCloseTo(0.5, 1);
    expect(SE.seasonWeights({ season: 'spring' })).toEqual([1, 0, 0, 0]);
    expect(SE.dominant(SE.seasonOf(new Date(2026, 6, 4)))).toBe('summer');
    expect(SE.seasonOf('not a date').length).toBe(4);
  });

  it('the shaders carry the seasons, the tales and the rainbow, and the lit windows carry the tales', () => {
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    const M = { paint: new THREE.MeshStandardMaterial(), leaves: new THREE.MeshStandardMaterial(), glow: new THREE.MeshBasicMaterial({ vertexColors: true }) };
    const sky = G.skyPatch(M);
    const p = { ...sh, uniforms: {} }; M.paint.onBeforeCompile(p);
    const l = { ...sh, uniforms: {} }; M.leaves.onBeforeCompile(l);
    const g = { ...sh, uniforms: {} }; M.glow.onBeforeCompile(g);
    expect(l.fragmentShader).toMatch(/blos/);
    expect(l.fragmentShader).toMatch(/RAINBOW/);
    expect(p.fragmentShader).toMatch(/WINTER GLINTS/);
    expect(p.fragmentShader).toMatch(/vec4 tale\(/);
    expect(g.fragmentShader).toMatch(/tale\(vTw/);
    expect(p.uniforms.uSeason).toBeTruthy();
    expect(g.uniforms.uDecA.value.length).toBe(T.TALE_SLOTS);
    sky.setSeason([0, 0, 0, 1]); expect(sky.uniforms.uSeason.value.w).toBe(1);
    sky.setRain(0.5); expect(sky.uniforms.uRain.value).toBe(0.5);
    sky.update(1, { x: 0, y: 0, z: 0 }, false, 'lite'); expect(sky.uniforms.uTale.value).toBe(0);
    sky.update(2, { x: 0, y: 0, z: 0 }, false, 'high'); expect(sky.uniforms.uTale.value).toBe(1);
  });

  it('the tales: ten painted decals, all in the village, each of a known kind, none outside the shader slots', () => {
    const d = T.talesPlan();
    expect(d.length).toBe(10);
    expect(d.length).toBeLessThanOrEqual(T.TALE_SLOTS);
    const kinds = new Set(Object.values(T.KIND));
    for (const x of d) {
      expect(kinds.has(x.kind)).toBe(true);
      expect(Math.abs(x.x)).toBeLessThan(P.TREEHOUSE_BOUNDS.maxX);
      expect(Math.abs(x.z)).toBeLessThan(P.TREEHOUSE_BOUNDS.maxZ);
      expect(x.hw).toBeGreaterThan(0); expect(x.hh).toBeGreaterThan(0);
    }
    expect(new Set(d.map((x) => x.kind)).size).toBe(10);
  });

  it('the high bridge has its flags and kite, the hammock and the telescope stand on their decks', () => {
    const hb = T.highBridgePlan();
    expect(hb.flags.length).toBeGreaterThanOrEqual(10);
    expect(new Set(T.FLAG_HUES).size).toBeGreaterThanOrEqual(5);
    expect(hb.kite.y).toBeGreaterThan(P.BRIDGE_LINES[1][0].y + 2);
    const h = T.hammockPlan(); const far = P.deckOf('far');
    expect(h.x).toBeGreaterThan(far.x - far.w / 2); expect(h.z0).toBeGreaterThan(far.z - far.d / 2); expect(h.z1).toBeLessThan(far.z + far.d / 2);
    const t = T.telescopePlan(); const crown = P.deckOf('crown');
    expect(Math.abs(t.x - crown.x)).toBeLessThan(crown.w / 2); expect(Math.abs(t.z - crown.z)).toBeLessThan(crown.d / 2);
    const b = T.boardPlan(); const books = P.deckOf('books');
    expect(Math.hypot(b.x - books.hut.x, b.z - books.hut.z)).toBeLessThan(books.hut.r);
    expect(b.nx * b.nx + b.nz * b.nz).toBeCloseTo(1, 5);
  });

  describe('the rare surprise', () => {
    it('about one walk in five, deterministic, and never in the wrong light', () => {
      let n = 0; const kinds = new Set();
      for (let v = 0; v < 400; v++) { const a = SU.planSurprise({ seed: 7, visits: v }); const b = SU.planSurprise({ seed: 7, visits: v }); expect(a).toEqual(b); if (a) { n++; kinds.add(a.kind); expect(a.at).toBeGreaterThanOrEqual(SU.WINDOW.from); expect(a.kind).not.toBe('lanterns'); } }
      expect(n).toBeGreaterThan(40); expect(n).toBeLessThan(130);
      expect(kinds.has('rainbow')).toBe(true);
      for (let v = 0; v < 200; v++) { const a = SU.planSurprise({ seed: 3, visits: v, dusk: true }); if (a) expect(a.kind).not.toBe('rainbow'); }
      expect(SU.planSurprise({ forced: 'heart', forcedAt: 4 })).toEqual({ kind: 'heart', at: 4 });
      expect(SU.planSurprise({ forced: 'nonsense', seed: 1, visits: 1 })).toEqual(SU.planSurprise({ seed: 1, visits: 1 }));
    });
    it('the owl leaves her ledge and comes back to it, the heart forms and scatters, the lanterns rise and fade', () => {
      const ledge = C.OWL;
      const a0 = SU.owlAt(0, ledge); expect(a0.x).toBeCloseTo(ledge.x, 3); expect(a0.y).toBeCloseTo(ledge.y, 3); expect(a0.z).toBeCloseTo(ledge.z, 3);
      const a1 = SU.owlAt(SU.DUR.owl, ledge); expect(a1.x).toBeCloseTo(ledge.x, 3); expect(a1.z).toBeCloseTo(ledge.z, 3);
      let far = 0; for (let t = 0; t <= SU.DUR.owl; t += 0.25) { const o = SU.owlAt(t, ledge); far = Math.max(far, Math.hypot(o.x - ledge.x, o.z - ledge.z)); expect(Number.isFinite(o.yaw)).toBe(true); expect(o.y).toBeGreaterThan(2); }
      expect(far).toBeGreaterThan(20); // over the platforms and the Bakery
      const anchor = { x: 0, y: 3, z: 0, rx: 1, rz: 0 };
      const held = []; for (let i = 0; i < 40; i++) held.push(SU.heartAt(i, 40, 5, anchor, {}).x);
      expect(Math.max(...held)).toBeGreaterThan(1.5); expect(Math.min(...held)).toBeLessThan(-1.5);
      const top = SU.heartAt(0, 40, 5, anchor, {}); expect(top.y).toBeGreaterThan(anchor.y); // the dip at the top of the heart is at index 0
      const late = SU.heartAt(10, 40, SU.DUR.heart, anchor, {}); expect(late.glow).toBeLessThan(0.5);
      expect(SU.lanternAt(0, 12, -1, {}).fade).toBe(0);
      const mid = SU.lanternAt(0, 12, 25, {}); expect(mid.fade).toBe(1); expect(mid.y).toBeGreaterThan(4);
      expect(SU.lanternAt(0, 12, SU.DUR.lanterns, {}).fade).toBeLessThan(0.7);
      expect(SU.rainK(0)).toBe(0); expect(SU.rainK(20)).toBeGreaterThan(0.8); expect(SU.rainK(SU.DUR.rainbow)).toBeLessThan(0.05);
    });
    it('the life shows it: a forced lantern flock is visible and goes away again; reduced motion shows none; the rainbow drives the shader', () => {
      const scene = new THREE.Scene();
      const M = { paint: new THREE.MeshStandardMaterial(), leaves: new THREE.MeshStandardMaterial() };
      const leaves = new THREE.Mesh(new THREE.BufferGeometry(), M.leaves); leaves.name = 'treehouse:leaves'; scene.add(leaves);
      const sky = G.skyPatch(M);
      const mk = (extra) => C.createTreehouseCritters({ scene, tier: { name: 'high', shadows: true }, ...extra });
      const c = mk({ surprise: 'lanterns', surpriseAt: 1 });
      const lp = scene.getObjectByName('treehouse:lanterns');
      expect(lp.visible).toBe(false);
      for (let t = 0; t < 20; t += 1 / 30) c.update(1 / 30, t, { x: 0, y: 0, z: 0 }, null);
      expect(lp.visible).toBe(true);
      let shown = 0; const pos = lp.geometry.attributes.position.array; for (let k = 0; k < pos.length / 3; k++) if (pos[k * 3 + 1] > 0) shown++;
      expect(shown).toBeGreaterThanOrEqual(5);
      for (let t = 20; t < 70; t += 1 / 30) c.update(1 / 30, t, { x: 0, y: 0, z: 0 }, null);
      expect(lp.visible).toBe(false);
      c.dispose();
      const still = mk({ surprise: 'lanterns', reducedMotion: true });
      for (let t = 0; t < 10; t += 1 / 10) still.update(0.1, t, { x: 0, y: 0, z: 0 }, null);
      expect(scene.getObjectByName('treehouse:lanterns').visible).toBe(false);
      still.dispose();
      const rb = mk({ surprise: 'rainbow', surpriseAt: 1 });
      for (let t = 0; t < 15; t += 1 / 30) rb.update(1 / 30, t, { x: 0, y: 0, z: 0 }, null);
      expect(sky.uniforms.uRain.value).toBeGreaterThan(0.5);
      for (let t = 15; t < 60; t += 1 / 30) rb.update(1 / 30, t, { x: 0, y: 0, z: 0 }, null);
      expect(sky.uniforms.uRain.value).toBe(0);
      rb.dispose();
    });
    it('winter strings fairy lights along the rails, the other seasons hide them; the falling leaves take the season\'s colours', () => {
      const lights = (season) => {
        const scene = new THREE.Scene();
        const c = C.createTreehouseCritters({ scene, tier: { name: 'high', shadows: true }, season });
        c.update(1 / 30, 1, { x: 0, y: 0, z: 0 }, null);
        const F = scene.getObjectByName('treehouse:fireflies').geometry.attributes.position.array; const off = (C.COUNTS.high.flies + C.COUNTS.high.motes) * 3;
        let up = 0; for (let k = 0; k < C.FAIRY.high; k++) if (F[off + k * 3 + 1] > 0) up++;
        const col = scene.getObjectByName('treehouse:fallingleaves').geometry.attributes.color.array;
        c.dispose();
        return { up, r: col[0], g: col[1], b: col[2] };
      };
      expect(lights('winter').up).toBe(C.FAIRY.high);
      expect(lights('summer').up).toBe(0);
      const w = lights('winter'); const au = lights('autumn');
      expect(w.b).toBeGreaterThan(0.8); expect(au.b).toBeLessThan(0.5); // flakes against gold
    });
  });

  it('draws no collider, perch or standable surface: the ground is the plan\'s own', () => {
    const a = build(new THREE.Scene());
    expect(Array.isArray(a.perches)).toBe(true);
    expect(a.colliders.length).toBeGreaterThan(5);
    expect(a.ground).toBe(P.TREEHOUSE_GROUND);
  });
});
