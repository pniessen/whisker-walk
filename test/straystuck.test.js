import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createStrayCats, strayStream } from '../src/straycats.js';
import { CAT_RADIUS } from '../src/player.js';

// Strays keep off the water (test/straywater.test.js). A stray whose wander
// target lies across water is held at the shore by that push; it gives up on
// the target after about 1.5 s of no progress, the way it would on arriving,
// with the same draws from its own stream and none from any shared one.

function fakeScene() {
  return { add() {}, remove() {} };
}

// A park-sized walk with a pond and a river with a bridge across it.
const AREA = {
  bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  waters: [
    { id: 'pond', kind: 'circle', x: -10, z: 5, r: 8 },
    { id: 'river', kind: 'rect', minX: -50, maxX: 50, minZ: 20, maxZ: 26, decks: [{ minX: 0, maxX: 3, minZ: 20, maxZ: 26 }] },
  ],
};

describe('a stray whose wander target is across the water', () => {
  // The pond is a circle of radius 8 at (-10, 5). A stray on its east shore
  // heading for a target on the west shore walks into the water's edge and
  // is held there by dryGroundPoint. It should notice within about a second
  // and a half, not lean on the shore for the 12 s give-up.
  function stuckStray(seed = 11) {
    const cats = createStrayCats(fakeScene(), AREA, 1, strayStream(seed), { roomSeed: seed });
    const s = cats.strays[0];
    s.personality = 'bold';
    s.group.position.set(-10 + 8 + CAT_RADIUS + 0.05, 0, 5);
    s.state = 'wander';
    s.target = new THREE.Vector3(-10 - 8 - 2, 0, 5);
    s.timer = 12;
    return { cats, s };
  }
  const FAR = new THREE.Vector3(45, 0, -45);
  const OPTS = { stalking: false, catSpeed: 0, toy: null };

  it('gives up and goes idle within about 1.5 s', () => {
    const { cats, s } = stuckStray();
    let gaveUpAt = null;
    for (let i = 0; i < 12 * 30 && gaveUpAt === null; i++) {
      cats.update(1 / 30, i / 30, FAR, OPTS);
      if (s.state !== 'wander') gaveUpAt = (i + 1) / 30;
    }
    expect(gaveUpAt).not.toBe(null);
    expect(gaveUpAt).toBeLessThan(2);
    expect(gaveUpAt).toBeGreaterThan(1);
  });

  it('draws from its own stream exactly what reaching the target draws (pose + timer)', () => {
    const { cats, s } = stuckStray();
    let n = 0;
    const inner = s.wanderRng;
    s.wanderRng = () => { n++; return inner(); };
    for (let i = 0; i < 60 && s.state === 'wander'; i++) cats.update(1 / 30, i / 30, FAR, OPTS);
    // up to the frame it gives up, nothing; then the idle pose and timer
    for (let i = 0; i < 30 && s.state === 'wander'; i++) cats.update(1 / 30, i / 30, FAR, OPTS);
    expect(s.state).toBe('idle');
    expect(n).toBe(2);
  });

  it('a stray walking freely is never cut short', () => {
    const cats = createStrayCats(fakeScene(), AREA, 1, strayStream(3), { roomSeed: 3 });
    const s = cats.strays[0];
    s.group.position.set(30, 0, -30);
    s.state = 'wander';
    s.target = new THREE.Vector3(30, 0, -40);
    s.timer = 12;
    let frames = 0;
    while (s.state === 'wander' && frames < 600) { cats.update(1 / 30, frames / 30, FAR, OPTS); frames++; }
    // 9.6 m at 1.4 m/s: about 6.9 s, the walk's full length
    expect(frames / 30).toBeGreaterThan(6.5);
    expect(Math.hypot(s.group.position.x - 30, s.group.position.z + 40)).toBeLessThan(0.5);
  });

  it('co-walkers at different frame rates still see the stuck cat give up', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 20]) {
      const { cats, s } = stuckStray();
      let tt = 0;
      while (s.state === 'wander' && tt < 12) { cats.update(dt, tt, FAR, OPTS); tt += dt; }
      expect(tt, `dt ${dt}`).toBeLessThan(2);
    }
  });
});

describe('co-walkers and the shore give-up', () => {
  it('two co-walkers on one room seed agree frame for frame, through give-ups at the shore', () => {
    const run = (seed) => {
      const cats = createStrayCats(fakeScene(), AREA, 22, strayStream(seed), { roomSeed: seed });
      const where = [];
      let giveUps = 0;
      for (let i = 0; i < 2400; i++) {
        const before = cats.strays.map((s) => (s.state === 'wander' && s.target ? s.target.clone() : null));
        cats.update(1 / 30, i / 30, new THREE.Vector3(45, 0, -45), { stalking: false, catSpeed: 0, toy: null });
        cats.strays.forEach((s, k) => {
          const t = before[k];
          if (t && s.state === 'idle' && Math.hypot(t.x - s.group.position.x, t.z - s.group.position.z) > 0.5) giveUps++;
        });
        where.push(cats.strays.map((s) => [s.group.position.x, s.group.position.z, s.state]));
      }
      return { where, giveUps };
    };
    for (const seed of [31, 77]) {
      const a = run(seed);
      const b = run(seed);
      expect(b.where).toEqual(a.where);
      expect(a.giveUps, `seed ${seed}: some stray gave up at the water`).toBeGreaterThan(0);
    }
  }, 60000);
});

describe('the shore give-up and the shared streams', () => {
  it('update() never draws from the strays\' shared stream, through give-ups at the shore', () => {
    const base = strayStream(31);
    let drawing = false;
    let after = 0;
    const rng = () => { if (drawing) after++; return base(); };
    const cats = createStrayCats(fakeScene(), AREA, 22, rng, { roomSeed: 31 });
    drawing = true;
    for (let i = 0; i < 1800; i++) cats.update(1 / 30, i / 30, new THREE.Vector3(45, 0, -45), { stalking: false, catSpeed: 0, toy: null });
    expect(after).toBe(0);
  }, 60000);

  it('at different frame rates a stuck cat makes the same wander draws, in the same order', () => {
    const drawsAt = (dt) => {
      const cats = createStrayCats(fakeScene(), AREA, 1, strayStream(11), { roomSeed: 11 });
      const s = cats.strays[0];
      s.personality = 'bold';
      s.group.position.set(-10 + 8 + CAT_RADIUS + 0.05, 0, 5);
      s.state = 'wander';
      s.target = new THREE.Vector3(-20, 0, 5);
      s.timer = 12;
      const seen = [];
      const inner = s.wanderRng;
      s.wanderRng = () => { const v = inner(); seen.push(v); return v; };
      let tt = 0;
      while (s.state === 'wander' && tt < 12) { cats.update(dt, tt, new THREE.Vector3(45, 0, -45), { stalking: false, catSpeed: 0, toy: null }); tt += dt; }
      return seen;
    };
    const a = drawsAt(1 / 30);
    expect(a).toHaveLength(2);
    expect(drawsAt(1 / 60)).toEqual(a);
    expect(drawsAt(1 / 20)).toEqual(a);
  });
});
