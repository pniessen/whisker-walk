// The Seaside's bathers (src/world/seasidefolk.js): swimwear, poses, the ball, the rungs.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createSeasideFolk, NO_FOLK } = await import('../src/world/seasidefolk.js');
const { createSeasideLife } = await import('../src/world/seasidelife.js');
const { createPeopleKit } = await import('../src/people/index.js');
const plan = await import('../src/world/seasideplan.js');

const make = (opts = {}) => createSeasideFolk({ people: createPeopleKit, lodNear: () => 12, ...opts });
const world = (f) => { const v = new THREE.Vector3(); f.group.updateMatrixWorld(true); return (bone) => bone.getWorldPosition(v.set(0, 0, 0)).clone(); };

describe('seaside folk', () => {
  it('is nobody without a people factory', () => {
    expect(createSeasideFolk({})).toBe(NO_FOLK);
    const life = createSeasideLife({});
    expect(life.folk).toBe(NO_FOLK);
    life.update(0.016, 1, { x: 0, z: 0 });
    life.dispose();
  });

  it('draws the whole plan on the top rung and fewer on LOW and LITE', () => {
    const counts = [0, 3, 5].map((rung) => { const f = make({ rung }); const n = f.figures.length; f.dispose(); return n; });
    expect(counts[0]).toBeGreaterThanOrEqual(9);
    expect(counts[1]).toBeLessThan(counts[0]);
    expect(counts[2]).toBeLessThan(counts[1]);
    expect(counts[2]).toBeGreaterThanOrEqual(3);
  });

  it('dresses them in swimwear: shorts, short sleeves, bare feet; the bare-chested top is skin', () => {
    const f = make();
    for (const fig of f.figures) {
      const look = fig.person.look;
      expect(look.bottom.kind, fig.id).toBe('shorts');
      expect(look.top.kind, fig.id).toBe('tshirt');
      expect(look.shoes, fig.id).toBe(look.skin);
    }
    const bare = plan.SEASIDE_FOLK.find((p) => p.bare);
    expect(f.figures.find((x) => x.id === bare.id).person.look.top.color).toBe(bare.skin);
    // kids are smaller than the grown-ups
    const kid = f.figures.find((x) => x.id === 'toss-child').person.look;
    const adult = f.figures.find((x) => x.id === 'toss-adult').person.look;
    expect(kid.kind).toBe('child');
    expect(kid.height).toBeLessThan(adult.height - 0.2);
    f.dispose();
  });

  it('sits with the legs out in front and the seat low; kneels with a knee near the ground', () => {
    const f = make();
    const sitter = f.figures.find((x) => x.id === 'sit-a');
    sitter.group.rotation.y = 0;
    sitter.group.position.set(0, 0, 0);
    sitter.group.updateMatrixWorld(true);
    const at = (n) => sitter.person.bones[n].getWorldPosition(new THREE.Vector3());
    // the group's front is +z: the feet are in front of the hips, close to the ground, and the hips are low
    expect(at('footL').z - at('pelvis').z).toBeGreaterThan(0.4);
    expect(at('footL').y).toBeLessThan(0.35);
    expect(at('pelvis').y).toBeLessThan(0.3);
    expect(at('head').y).toBeGreaterThan(0.6);
    const kneeler = f.figures.find((x) => x.id === 'kneel-kid');
    kneeler.group.updateMatrixWorld(true);
    const lows = ['kneeL', 'kneeR', 'shinL', 'shinR'].filter((n) => kneeler.person.bones[n]).map((n) => kneeler.person.bones[n].getWorldPosition(new THREE.Vector3()).y);
    expect(Math.min(...lows)).toBeLessThan(0.3);
    f.dispose();
  });

  it('throws the beach ball between the two, on an arc that is a pure function of time', () => {
    const f = make();
    expect(f.ball).toBeTruthy();
    const at = (t) => { f.update(0.016, t, { x: 0, z: 0 }); return f.ball.position.clone(); };
    const a = at(0.65); const b = at(0.65);
    expect(a.equals(b)).toBe(true);
    const mid = at(TOSS_MID());
    expect(mid.y).toBeGreaterThan(at(0).y + 0.5);
    f.dispose();
    const still = make({ reducedMotion: true });
    const p0 = still.ball.position.clone();
    still.update(0.016, 5, { x: 0, z: 0 });
    expect(still.ball.position.equals(p0)).toBe(true);
    still.dispose();
  });

  it('makes them without touching Math.random, and frees everything on dispose', () => {
    const real = Math.random; let draws = 0;
    Math.random = () => { draws++; return real(); };
    try {
      const f = make();
      f.update(0.016, 1, { x: 8, z: 0 });
      f.dispose();
      f.dispose();
    } finally { Math.random = real; }
    expect(draws).toBe(0);
  });

  it('never moves a bather toward her cat: positions are fixed while she walks past', () => {
    const f = make();
    const before = f.figures.map((x) => x.group.position.clone());
    for (let i = 0; i < 40; i++) f.update(0.05, i * 0.05, { x: 9 + i * 0.1, z: -3 });
    f.figures.forEach((x, i) => expect(x.group.position.equals(before[i])).toBe(true));
    f.dispose();
  });
});

function TOSS_MID() { return 1.3; }
