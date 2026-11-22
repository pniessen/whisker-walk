import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// =============================================================================
// The Market's street musician (step 3, V7): one person by the fountain, made
// through the one figure function the stallholders use (marketkeeper.js's
// marketFigure), bowing a fiddle on walk seconds, never moving from the pitch.
// The square's life (marketlife.js) stands them there when the walk hands it
// the people factory, and plays the market's sounds when it hands it audio.
// =============================================================================

const { createMusician, MUSICIAN_BOW } = await import('../src/world/marketfolk.js');
const { marketFigure, personKeeper } = await import('../src/marketkeeper.js');
const { createPeopleKit } = await import('../src/people/index.js');
const { MUSICIAN } = await import('../src/world/marketplan.js');
const { createMarketLife } = await import('../src/world/marketlife.js');

afterEach(() => vi.restoreAllMocks());

const triangles = (o) => {
  let n = 0;
  o.traverse((m) => {
    if (!m.isMesh) return;
    const g = m.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
};
const isUnder = (o, parent) => {
  for (let p = o.parent; p; p = p.parent) if (p === parent) return true;
  return false;
};

describe('the street musician (marketfolk.js)', () => {
  it('the musician is built through the one figure function', () => {
    const scene = new THREE.Scene();
    const figure = vi.fn((spot) => marketFigure(spot));
    const m = createMusician(scene, MUSICIAN, { figure, people: createPeopleKit, y: 0.02 });
    expect(figure).toHaveBeenCalledTimes(1);
    const spot = figure.mock.calls[0][0];
    expect({ x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw }).toEqual({ x: MUSICIAN.x, y: 0.02, z: MUSICIAN.z, yaw: MUSICIAN.yaw });
    expect(spot.people).toBe(createPeopleKit); // the pack's factory, handed on
    // the figure's own group is the musician's, in the scene
    expect(m.group).toBe(figure.mock.results[0].value.group);
    expect(m.group.parent).toBe(scene);
    m.dispose();
    // the default is the one function, and it is the people's person
    expect(marketFigure).toBe(personKeeper);
    const plain = createMusician(scene, MUSICIAN, { people: createPeopleKit });
    expect(plain.figure.person.look.kind).not.toBe('child');
    expect(plain.group.name).toBe('marketMusician');
    plain.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('holds a fiddle up at the chin, the bow in the bowing hand', () => {
    const scene = new THREE.Scene();
    const m = createMusician(scene, MUSICIAN, { people: createPeopleKit });
    scene.updateMatrixWorld(true);
    // the bow rides the bowing arm; the fiddle the still left arm's side of the body
    expect(isUnder(m.bow, m.figure.arm)).toBe(true);
    expect(isUnder(m.fiddle, m.group)).toBe(true);
    expect(isUnder(m.fiddle, m.figure.arm)).toBe(false);
    // the fiddle mesh holds the fiddle (up at the chin) and its open case (on the cobbles)
    const pts = [];
    const pos = m.fiddle.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.fiddle.matrixWorld));
    const up = pts.filter((p) => p.y > 0.6);
    const low = pts.filter((p) => p.y <= 0.6);
    expect(up.length).toBeGreaterThan(0);
    expect(low.length).toBeGreaterThan(0);
    const fiddle = new THREE.Box3().setFromPoints(up).getCenter(new THREE.Vector3());
    const box = new THREE.Box3().setFromPoints(low);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01); // the case lies on the cobbles
    expect(box.max.y).toBeLessThan(0.35);
    for (const p of low) expect(Math.hypot(p.x - MUSICIAN.x, p.z - MUSICIAN.z)).toBeLessThan(MUSICIAN.r + 0.2); // on the pitch
    const fiddleLen = new THREE.Box3().setFromPoints(up).getSize(new THREE.Vector3()).length();
    expect(fiddleLen).toBeGreaterThan(0.45);
    expect(fiddleLen).toBeLessThan(0.8);
    const bow = new THREE.Box3().setFromObject(m.bow).getCenter(new THREE.Vector3());
    // up at the chest and chin, a hand's length and more in front of them
    const front = new THREE.Vector3(Math.sin(MUSICIAN.yaw), 0, Math.cos(MUSICIAN.yaw));
    const at = new THREE.Vector3(MUSICIAN.x, 0, MUSICIAN.z);
    expect(fiddle.y).toBeGreaterThan(1.0);
    expect(fiddle.y).toBeLessThan(m.figure.headY);
    expect(fiddle.clone().sub(at).dot(front)).toBeGreaterThan(0.1);
    expect(bow.y).toBeGreaterThan(0.95);
    expect(bow.clone().sub(at).dot(front)).toBeGreaterThan(0.1);
    // the props are small: under 200 triangles, the fiddle case on the cobbles included
    expect(triangles(m.fiddle) + triangles(m.bow)).toBeLessThan(200);
    m.dispose();
  });

  it('bows on walk seconds, never moves, casts nothing, and goes on dispose', () => {
    const scene = new THREE.Scene();
    const m = createMusician(scene, MUSICIAN, { people: createPeopleKit });
    const arm = m.figure.arm;
    const rest = m.rest;
    expect(rest).toBeCloseTo(arm.rotation.z, 12);
    const pos = m.group.position.clone();
    const yaw = m.group.rotation.y;
    expect(pos.x).toBe(MUSICIAN.x);
    expect(pos.z).toBe(MUSICIAN.z);
    expect(yaw).toBe(MUSICIAN.yaw);
    for (const t of [0, 0.3, 1.1, 2.9, 17.4, 600.25]) {
      m.update(t);
      expect(arm.rotation.z, `t ${t}`).toBeCloseTo(rest + MUSICIAN_BOW.swing * Math.sin(MUSICIAN_BOW.rate * t), 12);
      expect(m.group.position.equals(pos)).toBe(true);
      expect(m.group.rotation.y).toBe(yaw);
    }
    expect(MUSICIAN_BOW).toEqual({ swing: 0.25, still: 0.08, rate: 2.4 });
    // casting nothing: the walk's caster sweep leaves it alone
    let meshes = 0;
    m.group.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      expect(o.castShadow, o.name).toBe(false);
      expect(o.userData.noCast, o.name).toBe(true);
    });
    expect(meshes).toBe(3); // the person, the fiddle (with its case), the bow
    const geos = [];
    m.group.traverse((o) => { if (o.isMesh) geos.push(vi.spyOn(o.geometry, 'dispose')); });
    m.dispose();
    expect(scene.children).toHaveLength(0);
    for (const d of geos) expect(d).toHaveBeenCalled();
    m.dispose(); // twice is harmless
    m.update(3); // and after it, nothing moves
    // under reduced motion the bow still moves, a little
    const calm = createMusician(scene, MUSICIAN, { people: createPeopleKit, reducedMotion: true });
    calm.update(0.65);
    expect(calm.figure.arm.rotation.z).toBeCloseTo(calm.rest + MUSICIAN_BOW.still * Math.sin(MUSICIAN_BOW.rate * 0.65), 12);
    calm.dispose();
  });

  it('draws nothing from Math.random', () => {
    const scene = new THREE.Scene();
    const random = vi.spyOn(Math, 'random');
    const a = createMusician(scene, MUSICIAN, { people: createPeopleKit });
    const b = createMusician(scene, MUSICIAN, { people: createPeopleKit });
    for (let i = 0; i < 90; i++) { a.update(i / 30); b.update(i / 30); }
    expect(random).not.toHaveBeenCalled();
    // and the same spot is the same musician
    expect(b.figure.person.look).toEqual(a.figure.person.look);
    a.dispose();
    b.dispose();
  });
});

describe("the square's life stands the musician at its pitch", () => {
  const AREA = { look: null, anchors: {} };
  it('with the people factory: the musician, bowing on the walk\'s seconds; without it, nobody', () => {
    const scene = new THREE.Scene();
    const life = createMarketLife(AREA, { scene, people: createPeopleKit, reducedMotion: false });
    const g = scene.getObjectByName('marketMusician');
    expect(g).toBeTruthy();
    expect(g.position.x).toBe(MUSICIAN.x);
    expect(g.position.z).toBe(MUSICIAN.z);
    const arm = [];
    for (let i = 0; i < 20; i++) {
      life.update(1 / 30, i / 30, null, null, null);
      arm.push(g.getObjectByName('marketMusicianBow').parent.rotation.z);
    }
    expect(new Set(arm.map((v) => v.toFixed(6))).size).toBeGreaterThan(10);
    life.dispose();
    expect(scene.getObjectByName('marketMusician')).toBeUndefined();
    // the picture pages and the tests' lives with no factory: no musician, nothing breaks
    const bare = createMarketLife(AREA, { scene });
    expect(scene.getObjectByName('marketMusician')).toBeUndefined();
    bare.update(1 / 30, 0, null, null, null);
    bare.dispose();
  });
});
