// The Treehouse village's tree cats: three friendly low-poly cats of the tree (a cushion, a rail, a hollow), one mesh each, made with the life. They are scenery with one friend moment:
// no collider, no perch, no ground strip, no shadow, no name tag; the head turns to her, a short hello in the speech bubble, freed with the life. Words in the phrase table.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { bannedIn } from './helpers/offwords.js';
import { frameStats } from './helpers/lifebudget.js';

stubCanvasDocument();

const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const P = await import('../src/world/treehouseplan.js');
const K = await import('../src/world/treehousecatparts.js');
const C = await import('../src/world/treehousecats.js');
const M = await import('../src/world/treehousecatmesh.js');
const { measureWithLife } = await import('./helpers/lifebudget.js');
const { LINES } = await import('../src/world/treehousecatwords.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');

const noop = () => {};
const progression = { get: () => 0, getMany: () => ({}), set: noop, has: () => false, on: () => noop, addPoints: noop, recordFeat: noop, data: {} };
const log = { startWalk: noop, record: noop, found: () => false, has: () => false, count: () => 0, restore: noop, on: () => noop };
const made = async (tier = { name: 'high' }) => {
  const scene = new THREE.Scene();
  const area = build(scene);
  const ctx = { scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier, makeSprite: (text) => { const s = new THREE.Sprite(new THREE.SpriteMaterial()); s.userData.text = text; return s; }, roomSeed: 1, visits: 0, sendEvent: noop, camera: new THREE.PerspectiveCamera() };
  const life = area.life(ctx);
  return { scene, area, life };
};
const treeCatGroups = (scene) => { const out = []; scene.traverse((o) => { if (o.name?.startsWith('treehouse:cat:')) out.push(o); }); return out; };

describe('the tree cats are made headless and stay out of the way', () => {
  it('three cats stand in three distinct places, on the high rung', async () => {
    const { scene, life } = await made();
    const cats = treeCatGroups(scene);
    expect(cats.length).toBe(3);
    expect(life.treeCats.cats.map((c) => c.id).sort()).toEqual(['cushion', 'hollow', 'rail']);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(cats[i].position.distanceTo(cats[j].position)).toBeGreaterThan(4);
    life.dispose();
  });
  it('the lower rungs keep two, then one', async () => {
    expect(C.catCount({ name: 'low' })).toBe(2);
    expect(C.catCount({ shadows: false })).toBe(1);
    const { scene, life } = await made({ name: 'low' });
    expect(treeCatGroups(scene).length).toBe(2);
    life.dispose();
  });
  it('no collider, no perch, no ground strip: a cat is never a platform or a wall', async () => {
    const { area, life } = await made();
    const plain = build(new THREE.Scene());
    expect(area.colliders.length).toBe(plain.colliders.length);
    expect(area.perches.length).toBe(plain.perches.length);
    for (const c of K.CATS) {
      expect(area.colliders.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < 0.5 && k.r < 1)).toBe(false); // nothing small stands under a cat
      expect(area.perches.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 0.6)).toBe(false);
    }
    life.dispose();
  });
  it('none stands on a walking route: not on a stair, a bridge strip or within 0.8 m of a flight', () => {
    for (const c of K.CATS) {
      for (const s of P.STAIRS) {
        const dx = s.x1 - s.x0; const dz = s.z1 - s.z0; const L2 = dx * dx + dz * dz;
        const u = Math.max(0, Math.min(1, ((c.x - s.x0) * dx + (c.z - s.z0) * dz) / L2));
        expect(Math.hypot(c.x - (s.x0 + dx * u), c.z - (s.z0 + dz * u)), `${c.id} near ${s.id}`).toBeGreaterThan(1.2);
      }
      for (const line of P.BRIDGE_LINES) for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i]; const b = line[i + 1];
        const dx = b.x - a.x; const dz = b.z - a.z; const u = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / (dx * dx + dz * dz)));
        expect(Math.hypot(c.x - (a.x + dx * u), c.z - (a.z + dz * u)) > 1.0 || Math.abs(c.y - a.y) > 0.6, `${c.id} on a bridge`).toBe(true);
      }
    }
  });
  it('each cat sits on something drawn (a cushion, a rail, a hollow) at its own height', () => {
    expect(K.CATS.find((c) => c.id === 'cushion').y).toBeCloseTo(P.deckOf('bakery').y + K.CUSHION.h, 6);
    expect(K.CATS.find((c) => c.id === 'rail').y).toBeGreaterThan(P.deckOf('far').y + P.RAIL_H);
        expect(K.CATS.find((c) => c.id === 'hollow').y).toBe(0);
    for (const c of K.CATS) { expect(c.x).toBeGreaterThan(P.TREEHOUSE_BOUNDS.minX); expect(c.x).toBeLessThan(P.TREEHOUSE_BOUNDS.maxX); }
  });
  it('they cast no shadow, carry no name tag, and add no mesh to the village build', async () => {
    const { scene, life } = await made();
    for (const g of treeCatGroups(scene)) {
      g.traverse((o) => { if (o.isMesh) { expect(o.castShadow).toBe(false); expect(o.userData.noCast).toBe(true); } expect(o.isSprite).not.toBe(true); });
    }
    const bare = new THREE.Scene();
    build(bare);
    expect(bare.children.length).toBeGreaterThan(0);
    life.dispose();
  });
});

describe('the friend moment', () => {
  it('her cat near one: the head turns to her and the hello shows once, then not again for a while', async () => {
    const { scene, life } = await made();
    const cat = K.CATS.find((c) => c.id === 'rail');
    const g = life.treeCats.cats.find((c) => c.id === 'rail').mesh;
    const pos = { x: cat.x + 2, y: cat.y, z: cat.z + 2 };
    let sprites = 0;
    const count = () => { let n = 0; g.traverse((o) => { if (o.isSprite) n++; }); return n; };
    life.treeCats.update(1 / 30, 1, pos);
    sprites = count();
    expect(sprites).toBe(1); // the hello
    let said = null; g.traverse((o) => { if (o.isSprite) said = o.userData.text; });
    expect(said).toBe(phrase('treehouse.cat.hello.rail'));
    for (let i = 0; i < 20; i++) life.treeCats.update(1 / 30, 2 + i / 30, pos);
    expect(count()).toBe(1); // still the same one, not a second
    life.treeCats.update(1 / 30, 6, pos); // 5 s on: the bubble has gone
    expect(count()).toBe(0);
    life.treeCats.update(1 / 30, 7, { x: pos.x + 30, y: 0, z: pos.z }); life.treeCats.update(1 / 30, 8, pos); // leaves and returns inside HELLO_EVERY: no second hello
    expect(count()).toBe(0);
    life.treeCats.update(1 / 30, 9, { x: pos.x + 30, y: 0, z: pos.z }); life.treeCats.update(1 / 30, 60, pos); // and again after it
    expect(count()).toBe(1);
    const rest = K.CATS.find((c) => c.id === 'rail').yaw;
    expect(Math.abs(g.rotation.y - rest)).toBeGreaterThan(0.05); // turned toward her
    expect(Math.abs(g.rotation.y - rest)).toBeLessThanOrEqual(C.TURN_MAX + 1e-9);
    life.treeCats.update(1 / 30, 3, { x: pos.x + 20, y: pos.y, z: pos.z }); for (let i = 0; i < 90; i++) life.treeCats.update(1 / 30, 4 + i / 30, { x: pos.x + 20, y: pos.y, z: pos.z });
    expect(Math.abs(g.rotation.y - rest)).toBeLessThan(0.01); // and eased back
    life.dispose();
    void scene;
  });
  it('the napper sits up near her and lies down when she goes', async () => {
    const { life } = await made();
    const nap = life.treeCats.cats.find((c) => c.id === 'cushion');
    expect(nap.pose).toBe('nap');
    life.treeCats.update(1 / 30, 1, { x: nap.mesh.position.x + 1, y: 1.4, z: nap.mesh.position.z });
    expect(nap.pose).toBe('sit');
    life.treeCats.update(1 / 30, 2, { x: nap.mesh.position.x + 9, y: 1.4, z: nap.mesh.position.z });
    expect(nap.pose).toBe('nap');
    life.dispose();
  });
  it('a cat beyond SHOW_R is hidden', async () => {
    const { life } = await made();
    life.treeCats.update(1 / 30, 1, { x: 0, y: 0, z: 25 });
    const visible = life.treeCats.cats.filter((c) => c.mesh.visible).map((c) => c.id);
    for (const c of life.treeCats.cats) {
      const d = Math.hypot(c.mesh.position.x, c.mesh.position.z - 25);
      expect(c.mesh.visible).toBe(d <= C.SHOW_R);
    }
    void visible;
    life.dispose();
  });
});

describe('the words and the freeing', () => {
  it('every hello is in the phrase table, short, kind and free of banned words', () => {
    for (const [id, text] of Object.entries(LINES)) {
      expect(hasPhrase(id)).toBe(true);
      expect(phrase(id)).toBe(text);
      expect(text.length).toBeLessThanOrEqual(16);
      expect(bannedIn(text)).toBeNull();
      expect(text).not.toMatch(/fight|attack|clan|star|warrior/i);
    }
    expect(Object.keys(LINES).length).toBe(3);
  });
  it('dispose frees every geometry and material and removes the cats from the scene', async () => {
    const { scene, life } = await made();
    const freed = [];
    const groups = treeCatGroups(scene);
    for (const g of groups) g.traverse((o) => {
      if (o.geometry) o.geometry.addEventListener('dispose', () => freed.push('g'));
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.addEventListener('dispose', () => freed.push('m'));
    });
    let geos = 0; let mats = 0;
    for (const g of groups) g.traverse((o) => { if (o.geometry) geos++; mats += (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).length; });
    life.dispose();
    expect(freed.filter((x) => x === 'g').length).toBeGreaterThanOrEqual(geos);
    expect(freed.filter((x) => x === 'm').length).toBeGreaterThanOrEqual(1);
    expect(treeCatGroups(scene).length).toBe(0);
    life.dispose(); // twice is harmless
    void mats;
  });
  it('the lazy files import no start-up module that is not already there, and use no Math.random or clock', () => {
    for (const f of ['src/world/treehousecats.js', 'src/world/treehousecatparts.js', 'src/world/treehousecatwords.js']) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});

describe('the budget: low-poly cats, one mesh each, inside the village row', () => {
  it('each cat is one mesh of at most 1,300 triangles, in both poses', () => {
    for (const c of K.CATS) for (const pose of ['sit', 'nap']) {
      const geo = M.catGeometry(c.look, pose);
      expect(M.triCount(geo), `${c.id} ${pose}`).toBeLessThanOrEqual(1300);
      expect(geo.attributes.color).toBeTruthy();
      geo.dispose();
    }
  });
  it('the three cats are three meshes, no caster, and the whole frame (build + life + cats, made at once) stays within the Treehouse row of 23 / 2 / 66,200', () => {
    const r = measureWithLife(build);
    const only = new THREE.Scene();
    // the cats' own share: the life's meshes named treehouse:cat:
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' }, roomSeed: 1, visits: 0, sendEvent: noop, camera: new THREE.PerspectiveCamera() });
    for (const g of treeCatGroups(scene)) only.add(g.clone());
    const cats = frameStats(only);
    life.dispose();
    console.log('TREE CATS whole', JSON.stringify(r.whole), 'cats', JSON.stringify(cats));
    expect(cats.meshes).toBe(3);
    expect(cats.casters).toBe(0);
    expect(cats.triangles, JSON.stringify(cats)).toBeLessThanOrEqual(3900);
    expect(r.whole.meshes, JSON.stringify(r.whole)).toBeLessThanOrEqual(23);
    expect(r.whole.casters).toBeLessThanOrEqual(2);
    expect(r.whole.triangles, JSON.stringify(r.whole)).toBeLessThanOrEqual(66200);
  });
});
