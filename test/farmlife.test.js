import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { appendFileSync } from 'node:fs';

// How the Farm's animals live (src/farmlife.js) and how farmanimals.js turns
// their parts by it: every cosmetic output deterministic, bounded and free of
// NaN; heads that never turn past a natural limit; a cow's back that stays
// level under a riding or napping cat; the farmer's hat on the goat's mouth;
// reduced motion stilling the idle movements.

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const L = await import('../src/farmlife.js');
const { build } = await import('../src/world/farm.js');
const { createFarmAnimals, COW_LOOK, COW_LOOK_BACK, GOAT_LOOK, DOG_LOOK } = await import('../src/farmanimals.js');
const { LID_OPEN } = await import('../src/farmmodels.js');

const DT = 1 / 30;

function world(opts = {}) {
  const scene = new THREE.Scene();
  const area = build(scene);
  const farm = createFarmAnimals(scene, area, { seed: 'life', ...opts });
  const cat = new THREE.Object3D();
  cat.position.set(0, 0, 46);
  scene.add(cat);
  const player = { speed: 0, zooming: false, inWater: false };
  const session = { perched: null, pounceTime: 0 };
  let t = 0;
  const run = (seconds, each = () => {}) => {
    for (let s = 0; s < seconds; s += DT) { t += DT; farm.update(DT, t, { cat, player, session }); each(t); }
  };
  return { scene, area, farm, cat, player, session, run };
}
const viewOf = (farm, id) => farm.views.find((v) => v.a.id === id);
const finite = (o) => [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.x, o.scale.y, o.scale.z].every(Number.isFinite);

describe('farmlife.js: pure, bounded, the same on every device', () => {
  const ts = [];
  for (let t = 0; t < 400; t += 0.037) ts.push(t);
  const within = (v, lo, hi) => Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9;

  it('every output stays inside its stated range, and never NaN', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const t of ts) {
        expect(within(L.blink(t, seed), 0, 1)).toBe(true);
        expect(within(L.slowBlink(t, seed), 0, 1)).toBe(true);
        expect(within(L.breath(t, seed), -1, 1)).toBe(true);
        expect(within(L.sway(t, seed), -1, 1)).toBe(true);
        expect(within(L.flick(t, seed), -1, 1)).toBe(true);
        const c = L.chew(t, seed);
        expect(within(c.open, 0, 1) && within(c.side, -1, 1)).toBe(true);
        const sw = L.swish(t, seed);
        expect(within(sw.z, -1, 1) && within(sw.x, 0, 1)).toBe(true);
        const g = L.graze(t, seed);
        expect(within(g.tug, 0, 1) && within(g.reach, -1, 1)).toBe(true);
        const b = L.lookBack(t, seed, t % 7, Math.floor(t / 7));
        expect(within(b.k, 0, 1)).toBe(true);
        expect(Math.abs(b.side)).toBe(1);
        expect(within(L.moo(t % 3 - 0.5), 0, 1)).toBe(true);
        const h = L.henIdle(t, seed);
        for (const [k, lo] of [['scratch', -1], ['bend', 0], ['peck', 0], ['gaze', -1], ['fluff', 0], ['stretch', 0]]) expect(within(h[k], lo, 1), k).toBe(true);
        expect(within(L.pant(t), 0.1, 1)).toBe(true);
        expect(within(L.wag(t), -1, 1)).toBe(true);
        expect(within(L.playBow(t, seed), 0, 1)).toBe(true);
        expect(within(L.rearUp(t % 1), 0, 1)).toBe(true);
        expect(within(L.tailFlick(t, seed), -1, 1)).toBe(true);
        expect(within(L.tilt(t, seed), -1, 1)).toBe(true);
        const s = L.step(t * 0.7, 0.65);
        expect(within(s.swing, -1, 1) && within(s.lift, 0, 1)).toBe(true);
        const hw = L.henWalk(t * 0.3);
        expect(within(hw.head, -1, 1) && within(hw.feet, -1, 1) && within(hw.lift, -1, 1)).toBe(true);
      }
    }
  });

  it('gives the same answer to the same question, and makes nothing new to give it', () => {
    for (const t of [0, 1.3, 77.7, 391.2]) {
      expect(L.blink(t, 3)).toBe(L.blink(t, 3));
      expect({ ...L.chew(t, 2) }).toEqual({ ...L.chew(t, 2) });
      expect({ ...L.henIdle(t, 5) }).toEqual({ ...L.henIdle(t, 5) });
      expect({ ...L.lookBack(t, 1, 0.5, 3) }).toEqual({ ...L.lookBack(t, 1, 0.5, 3) });
    }
    // the many-answered ones fill a record of their own (no allocation per frame)
    expect(L.step(0.1, 0.5)).toBe(L.step(0.7, 0.5));
    expect(L.chew(1, 1)).toBe(L.chew(2, 1));
    expect(L.swish(1, 1)).toBe(L.swish(2, 1));
    expect(L.graze(1, 1)).toBe(L.graze(2, 1));
    expect(L.lookBack(1, 1)).toBe(L.lookBack(2, 1));
    expect(L.henIdle(1, 1)).toBe(L.henIdle(2, 1));
    expect(L.henWalk(1)).toBe(L.henWalk(2));
  });

  it('no two animals blink in step', () => {
    let same = 0, n = 0;
    for (const t of ts) { const a = L.blink(t, 1) > 0.5, b = L.blink(t, 2) > 0.5; if (a || b) { n++; if (a && b) same++; } }
    expect(n).toBeGreaterThan(10);
    expect(same / n).toBeLessThan(0.2);
  });

  it('a head turned to look never turns past its limit, and lets go far away', () => {
    const a = { x: 0, z: 0, yaw: 0.4 };
    for (let k = 0; k < 360; k += 7) {
      const r = (k * Math.PI) / 180;
      for (const d of [0.5, 2, 5, 8.5]) {
        const y = L.lookYaw(a, Math.sin(r) * d, Math.cos(r) * d, 1.0, 3.5, 8);
        expect(Math.abs(y)).toBeLessThanOrEqual(1.0 + 1e-9);
      }
      expect(L.lookYaw(a, Math.sin(r) * 9, Math.cos(r) * 9, 1.0, 3.5, 8)).toBe(0);
    }
  });

  it('a cow walks in four beats with three feet down; a trot pairs the diagonals', () => {
    for (let p = 0; p < 1; p += 0.01) {
      const down = L.WALK.phase.filter((ph) => L.step(p + ph, L.WALK.duty).lift === 0).length;
      expect(down).toBeGreaterThanOrEqual(2);
    }
    expect(L.TROT.phase[0]).toBe(L.TROT.phase[3]);
    expect(L.TROT.phase[1]).toBe(L.TROT.phase[2]);
  });
});

describe('the animals as farmanimals.js poses them', () => {
  it('turns every part within its limits, with no NaN anywhere, over a minute of a cat about the farm', () => {
    const w = world();
    const cows = w.farm.sim.cows, goats = w.farm.sim.goats, dog = w.farm.sim.dog;
    // the cat strolls past the cows, through the goats' paddock, by the dog and the hens
    const path = [cows[0], goats[0], dog, w.farm.sim.hens[0], cows[1]].map((a) => ({ x: a.x + 2.2, z: a.z + 1.4 }));
    let leg = 0, worst = { cowJaw: 0, cowChew: 0, cowYaw: 0, goatYaw: 0, dogYaw: 0 };
    w.run(75, (t) => {
      const to = path[Math.min(path.length - 1, Math.floor(t / 15))];
      w.cat.position.x += (to.x - w.cat.position.x) * 0.05;
      w.cat.position.z += (to.z - w.cat.position.z) * 0.05;
      if (Math.floor(t / 15) !== leg) leg = Math.floor(t / 15);
      for (const v of w.farm.views) {
        v.group.traverse((o) => { if (!finite(o)) throw new Error(`NaN in ${v.a.id}`); });
        const p = v.parts;
        if (p.lids) {
          expect(p.lids.scale.y).toBeGreaterThanOrEqual(LID_OPEN - 1e-9);
          expect(p.lids.scale.y).toBeLessThanOrEqual(1 + 1e-9);
        }
        if (v.a.type === 'cow') {
          expect(p.jaw.rotation.x).toBeGreaterThanOrEqual(-1e-9);
          expect(p.jaw.rotation.x).toBeLessThanOrEqual(0.3 + 1e-9);   // a moo's open mouth at most
          if (t - v.k.mooAt > 2) worst.cowChew = Math.max(worst.cowChew, p.jaw.rotation.x); // chewing: lips barely part
          expect(Math.abs(p.jaw.rotation.y)).toBeLessThanOrEqual(0.06 + 1e-9);
          expect(Math.abs(p.ears.rotation.y)).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(Math.abs(p.ears.rotation.z)).toBeLessThanOrEqual(0.16 + 1e-9);
          for (const s of p.shins) expect(Math.abs(s.rotation.x)).toBeLessThanOrEqual(1.1);
          for (const l of p.legs) expect(Math.abs(l.rotation.x)).toBeLessThanOrEqual(0.47);
          const yaw = Math.abs(p.head.rotation.y + p.skull.rotation.y);
          worst.cowYaw = Math.max(worst.cowYaw, yaw);
          // not ridden: no further round than she looks at a cat, and a reach to the side to graze
          if (!v.a.ridden) expect(yaw).toBeLessThanOrEqual(COW_LOOK + 0.17);
        } else if (v.a.type === 'farmgoat') {
          expect(Math.abs(p.head.rotation.y)).toBeLessThanOrEqual(GOAT_LOOK + 1e-9);
          worst.goatYaw = Math.max(worst.goatYaw, Math.abs(p.head.rotation.y));
          expect(p.jaw.rotation.x).toBeGreaterThanOrEqual(0);
          expect(p.jaw.rotation.x).toBeLessThanOrEqual(0.1 + 1e-9);
          expect(Math.abs(p.tail.rotation.z)).toBeLessThanOrEqual(0.7 + 1e-9);
        } else if (v.a.type === 'sheepdog') {
          expect(Math.abs(p.head.rotation.y)).toBeLessThanOrEqual(DOG_LOOK + 1e-9);
          worst.dogYaw = Math.max(worst.dogYaw, Math.abs(p.head.rotation.y));
          expect(p.jaw.rotation.x).toBeGreaterThanOrEqual(0);
          expect(p.jaw.rotation.x).toBeLessThanOrEqual(0.16 + 1e-9);
          for (const e of p.ears) { expect(e.rotation.x).toBeGreaterThanOrEqual(-0.1 - 1e-9); expect(e.rotation.x).toBeLessThanOrEqual(0.6 + 1e-9); }
        } else if (v.a.type === 'hen') {
          expect(p.head.rotation.x).toBeGreaterThanOrEqual(-0.16);
          expect(p.head.rotation.x).toBeLessThanOrEqual(1.65);
          expect(p.beak.rotation.x).toBeLessThanOrEqual(0.96);
        }
      }
    });
    expect(worst.cowChew).toBeLessThanOrEqual(0.035 + 1e-9);
    // and they did look: at the cat going by
    expect(worst.cowYaw).toBeGreaterThan(0.2);
    expect(worst.goatYaw + worst.dogYaw).toBeGreaterThan(0.2);
  });

  it('keeps the seat level on a cow\'s back through a walk and while she turns to look back at the cat', () => {
    for (const id of ['cow-1', 'cow-3']) {
      const w = world();
      const cow = w.farm.sim.cows.find((c) => c.id === id);
      const v = viewOf(w.farm, id);
      w.run(0.5);
      w.session.perched = cow.perch;
      w.cat.position.set(cow.perch.x, cow.perch.y, cow.perch.z);
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const from = new THREE.Vector3();
      let lo = Infinity, hi = -Infinity, walked = 0, looked = 0;
      const start = cow.walked;
      w.run(60, () => {
        v.group.updateMatrixWorld(true);
        from.set(cow.perch.x, 4, cow.perch.z);
        ray.set(from, down);
        const hit = ray.intersectObject(v.parts.torso, false)[0];
        expect(hit, id).toBeTruthy();
        lo = Math.min(lo, hit.point.y); hi = Math.max(hi, hit.point.y);
        looked = Math.max(looked, Math.abs(v.k.turn));
      });
      walked = cow.walked - start;
      expect(walked, id).toBeGreaterThan(1.5 * cow.scale * 2); // two rounds of her feet at least
      expect(looked, id).toBeGreaterThan(1.2);                 // and she turned right round to look
      // the back under the cat: at the perch's height, and rocking by no more than 1.5 cm
      expect(Math.abs(hi - cow.perch.y), id).toBeLessThan(0.05);
      expect(Math.abs(lo - cow.perch.y), id).toBeLessThan(0.05);
      expect(hi - lo, id).toBeLessThan(0.015);
      if (process.env.WW_LIFE_LOG) appendFileSync(process.env.WW_LIFE_LOG, `${id} seat ${lo.toFixed(4)}..${hi.toFixed(4)} perch ${cow.perch.y} walked ${walked.toFixed(2)} looked ${looked.toFixed(2)}\n`);
    }
  });

  it('keeps the farmer\'s hat on the goat\'s mouth however it moves its head', () => {
    const w = world();
    const goat = w.farm.jobs.hatGoat;
    const v = viewOf(w.farm, goat.id);
    const hat = v.parts.mouth.children[0];
    expect(hat).toBeTruthy();
    expect(v.parts.mouth.position.toArray()).toEqual([0, 0.145, 0.375]);
    const jaw = new THREE.Vector3(), mouth = new THREE.Vector3();
    let far = 0;
    // the cat in the paddock beside it: it trots over, rears a little and butts
    w.cat.position.set(goat.x + 2, 0, goat.z + 1);
    let butted = false;
    w.run(30, () => {
      if (goat.mode === 'butt') butted = true;
      v.group.updateMatrixWorld(true);
      v.parts.jaw.getWorldPosition(jaw);
      v.parts.mouth.getWorldPosition(mouth);
      far = Math.max(far, jaw.distanceTo(mouth));
      expect(hat.parent).toBe(v.parts.mouth);
    });
    expect(butted).toBe(true);
    // the jaw's hinge to the mouth's corner: a hand's breadth on a goat drawn 1.25 times
    expect(far).toBeLessThan(0.36);
  });

  it('with reduced motion the idle movements stop; what means something still moves', () => {
    const w = world({ reducedMotion: true });
    w.cat.position.set(80, 0, 80);
    let walked = 0;
    w.run(30, () => {
      for (const v of w.farm.views) {
        const p = v.parts;
        if (v.a.type === 'cow' || v.a.type === 'farmgoat') {
          expect(p.lids.visible).toBe(false); // no blinks
          expect(p.torso.scale.x).toBe(1);    // no breath
          expect(p.tail.rotation.z).toBe(0);  // no swish or flick
          expect(p.ears.rotation.y).toBe(0);
          expect(p.body.rotation.z).toBe(0);  // no weight shifts
        }
        if (v.a.type === 'cow') expect(p.jaw.rotation.x).toBe(0); // no chewing (nobody moos at her)
        if (v.a.type === 'sheepdog') expect(p.torso.scale.x).toBe(1);
        if (v.a.type === 'hen') expect(p.trunk.scale.x).toBe(1);
        if (v.a.type === 'cow' && v.a.moving) walked++;
      }
    });
    expect(walked).toBeGreaterThan(0); // the cows still amble about, legs and all
  });

  it('is the same from one device to the next: two farms with one seed pose every part alike', () => {
    const pose = () => {
      const w = world();
      w.cat.position.set(w.farm.sim.cows[0].x + 2, 0, w.farm.sim.cows[0].z + 2);
      w.run(20);
      const out = [];
      for (const v of w.farm.views) v.group.traverse((o) => out.push(o.rotation.x, o.rotation.y, o.rotation.z, o.scale.y, o.visible ? 1 : 0));
      return out;
    };
    expect(pose()).toEqual(pose());
  });
});
