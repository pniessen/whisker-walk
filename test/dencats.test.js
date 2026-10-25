import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createDenCats } from '../src/dencats.js';
import { clearsCamera } from '../src/den.js';

// Headless scene, like test/catnames.test.js: the module only add()s and remove()s.
function makeScene() {
  const added = new Set();
  return { added, add(o) { added.add(o); }, remove(o) { added.delete(o); } };
}
const cat = (name, home, act, spot = 'home') => ({
  name, breed: 'tabby', wear: null, home, moment: { act, spot },
});
// Boxes and tipped cups are the only scene objects that are not cats.
const extras = (scene, dc) => [...scene.added].filter((o) => !dc.list.some((c) => c.group === o));

describe('createDenCats', () => {
  it('builds one cat per entry, standing off its spot toward the centre', () => {
    const scene = makeScene();
    const dc = createDenCats(scene, [cat('Pickles', { x: 6, z: -6 }, 'nap')], { reducedMotion: false });
    expect(dc.list).toHaveLength(1);
    const p = dc.list[0].group.position;
    expect(Math.hypot(p.x, p.z)).toBeLessThan(Math.hypot(6, -6));
    expect(Math.hypot(p.x - 6, p.z + 6)).toBeCloseTo(0.9, 5);
    expect(dc.list[0].name).toBe('Pickles');
    expect(scene.added.has(dc.list[0].group)).toBe(true);
  });
  it('a cat on the centre spot still stands off it, and stays inside the room', () => {
    const dc = createDenCats(makeScene(), [cat('Pickles', { x: 0, z: 0 }, 'nap')], {});
    const p = dc.list[0].group.position;
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.9, 5);
  });
  it('a box moment adds a box, a knocked moment adds a tipped object, a nap adds nothing', () => {
    const counts = {};
    for (const act of ['nap', 'groom', 'window', 'box', 'knocked']) {
      const scene = makeScene();
      const dc = createDenCats(scene, [cat('Pickles', { x: 6, z: -6 }, act, act === 'window' ? 'window' : act === 'nap' || act === 'groom' ? 'home' : 'corner-a')], {});
      counts[act] = extras(scene, dc).length;
      expect(dc.list[0].moment.act).toBe(act);
    }
    expect(counts.nap).toBe(0);
    expect(counts.groom).toBe(0);
    expect(counts.window).toBe(0);
    expect(counts.box).toBe(1);
    expect(counts.knocked).toBe(1);
  });
  it('the box is open-top and short enough to leave the opening shot alone', () => {
    const scene = makeScene();
    const dc = createDenCats(scene, [cat('Pickles', { x: 0, z: 2 }, 'box', 'rug-spot')], {});
    const [box] = extras(scene, dc);
    const bb = new THREE.Box3().setFromObject(box);
    expect(bb.max.y).toBeLessThanOrEqual(0.5);
    expect(clearsCamera(box.position.x, box.position.z, 0.5, bb.max.y)).toBe(true);
  });
  it('a moment spot moves the cat: a window cat stands by the window, not at home', () => {
    const dc = createDenCats(makeScene(), [cat('Pickles', { x: 6, z: -6 }, 'window', 'window')], {});
    const p = dc.list[0].group.position;
    expect(Math.hypot(p.x - 0, p.z + 6.5)).toBeCloseTo(0.9, 5);
  });
  it('two cats headed for the same spot never stand on each other', () => {
    const dc = createDenCats(makeScene(), [
      cat('Pickles', { x: 6, z: -6 }, 'window', 'window'),
      cat('Mochi', { x: -6, z: -6 }, 'window', 'window'),
      cat('Biscuit', { x: 0, z: 2 }, 'window', 'window'),
    ], {});
    const ps = dc.list.map((c) => c.group.position);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) expect(ps[i].distanceTo(ps[j])).toBeGreaterThan(0.7);
    }
    for (const p of ps) expect(Math.abs(p.x) <= 7.5 && Math.abs(p.z) <= 7.5).toBe(true);
  });
  it('nearest returns the cat in range and null otherwise', () => {
    const dc = createDenCats(makeScene(), [
      cat('Pickles', { x: 6, z: -6 }, 'nap'),
      cat('Mochi', { x: -6, z: -6 }, 'groom'),
    ], {});
    const at = dc.list[0].group.position;
    expect(dc.nearest(new THREE.Vector3(at.x + 1, 0, at.z), 2).name).toBe('Pickles');
    expect(dc.nearest(new THREE.Vector3(0, 0, 4), 2)).toBe(null);
  });
  it('update poses cats without throwing, with or without a player position', () => {
    const dc = createDenCats(makeScene(), [
      cat('Pickles', { x: 6, z: -6 }, 'nap'),
      cat('Mochi', { x: -6, z: -6 }, 'box', 'corner-a'),
      cat('Biscuit', { x: 3, z: 3 }, 'window', 'window'),
    ], { reducedMotion: true });
    const before = dc.list.map((c) => c.group.position.clone());
    dc.update(0.016, 1.5);
    dc.update(0.016, 1.6, new THREE.Vector3(0, 0, 4));
    dc.list.forEach((c, i) => expect(c.group.position.distanceTo(before[i])).toBeLessThan(0.3));
  });
  it('dispose removes everything it added', () => {
    const scene = makeScene();
    const dc = createDenCats(scene, [
      cat('Pickles', { x: 6, z: -6 }, 'box', 'corner-a'),
      cat('Mochi', { x: -6, z: -6 }, 'knocked', 'corner-b'),
      cat('Biscuit', { x: 3, z: 3 }, 'nap'),
    ], {});
    expect(scene.added.size).toBeGreaterThan(3);
    dc.dispose();
    expect(scene.added.size).toBe(0);
  });
  it('an empty colony builds nothing', () => {
    const scene = makeScene();
    const dc = createDenCats(scene, [], {});
    expect(dc.list).toEqual([]);
    expect(dc.nearest(new THREE.Vector3(), 5)).toBe(null);
    dc.update(0.1, 1);
    dc.dispose();
    expect(scene.added.size).toBe(0);
  });
});
