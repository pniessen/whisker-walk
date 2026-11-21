import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// =============================================================================
// Market step 3, Task 2 (V1, V2): the fruit stall's apple crate tips and six
// apples roll out across the cobbles; the flower stall's bucket is knocked off
// and its petals scatter where it lands. Both are data, the same on both
// screens: the apple paths come from hash01 and the plan's walkability, the
// petals from the bucket's curated landing spot.
// =============================================================================

const {
  MARKET_APPLE_SALT, APPLES, buildAppleCrate, applePaths, createApples, createPetals,
} = await import('../src/world/marketfruit.js');
const { createMarketLife } = await import('../src/world/marketlife.js');
const { MARKET_ANCHORS } = await import('../src/world/market.js');
const { marketArea, MARKET_REGISTRATION, STALLS, TREAT_STALLS, stallById, toStall, FRUIT_CRATE } = await import('../src/world/marketplan.js');
const { createTippables } = await import('../src/tippables.js');
const { createKnockables } = await import('../src/knockables.js');
const { isWalkableAt } = await import('../src/player.js');
const { closeDiffs } = await import('./helpers/closeto.js');

const CRATE = MARKET_ANCHORS.apples;
const AREA = marketArea();
const LIFE_AREA = { ...AREA, anchors: { apples: { ...CRATE } } };
const BUCKET = MARKET_REGISTRATION.propSet.knockables.find((k) => k.id === 'market-bucket-1');

// The market's tippable crate, as walk.js makes it from the record's row.
const crateSpot = () => ({ x: CRATE.x, z: CRATE.z, kind: 'applecrate', build: buildAppleCrate });
const meshesOf = (root) => {
  const out = [];
  root.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};
const trianglesOf = (root) => meshesOf(root).reduce((n, m) => {
  const g = m.geometry;
  return n + (g.index ? g.index.count : g.attributes.position.count) / 3;
}, 0);
const segDist = (p, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
};
function tippedCrate(scene = new THREE.Scene()) {
  const tp = createTippables(scene, [crateSpot()]);
  tp.tip(tp.list[0]);
  for (let i = 0; i < 20; i++) tp.update(0.05);
  return { scene, tp, entry: tp.list[0] };
}

describe('the apple crate', () => {
  it('is a slatted crate heaped with apples, under 300 triangles, its origin at its base, casting nothing', () => {
    const g = buildAppleCrate();
    expect(g.isGroup).toBe(true);
    const tris = trianglesOf(g);
    expect(tris).toBeGreaterThan(60);
    expect(tris).toBeLessThan(300);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeCloseTo(0, 3);
    expect(box.max.y).toBeGreaterThan(0.25);
    expect(box.max.y).toBeLessThan(0.5);
    for (const m of meshesOf(g)) {
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
    }
    // it stands inside the plan's collider: no part further off its spot than its r
    const pos = [];
    for (const m of meshesOf(g)) {
      const p = m.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) pos.push(Math.hypot(...v.fromBufferAttribute(p, i).applyMatrix4(m.matrix).toArray().filter((_, k) => k !== 1)));
    }
    expect(Math.max(...pos)).toBeLessThanOrEqual(FRUIT_CRATE.r);
  });

  it('lies on its side once over, not sunk into the cobbles', () => {
    const { scene } = tippedCrate();
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    expect(box.min.y).toBeGreaterThan(-0.08);
    expect(box.max.y).toBeLessThan(0.5);
  });
});

describe('the apples roll', () => {
  it("every apple's path stays on walkable cobbles", () => {
    const { entry } = tippedCrate();
    const paths = applePaths(AREA, CRATE, entry.group.rotation.y);
    expect(paths).toHaveLength(APPLES.n);
    for (const [i, p] of paths.entries()) {
      const len = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
      expect(len, `apple ${i}`).toBeLessThanOrEqual(APPLES.roll.max + 1e-9);
      expect(len, `apple ${i} rolls`).toBeGreaterThan(0.5);
      const steps = Math.ceil(len / 0.05);
      for (let k = 0; k <= steps; k++) {
        const u = steps ? k / steps : 0;
        const x = p.x0 + (p.x1 - p.x0) * u;
        const z = p.z0 + (p.z1 - p.z0) * u;
        expect(isWalkableAt(AREA, x, z), `apple ${i} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(true);
      }
      expect(Math.hypot(p.x1 - CRATE.x, p.z1 - CRATE.z), `apple ${i}`).toBeGreaterThanOrEqual(0.3);
      // the end is the last walkable point: one more step out is past its roll or off the cobbles
      const dx = (p.x1 - CRATE.x), dz = (p.z1 - CRATE.z);
      const d = Math.hypot(dx, dz);
      const nx = CRATE.x + (dx / d) * (d + 0.05), nz = CRATE.z + (dz / d) * (d + 0.05);
      const past = Math.hypot(nx - p.x0, nz - p.z0) > len + 0.04;
      expect(past || !isWalkableAt(AREA, nx, nz), `apple ${i}`).toBe(true);
    }
  });

  it("the apples roll out of the side the crate's mouth faces once it is over", () => {
    const { scene, entry } = tippedCrate();
    scene.updateMatrixWorld(true);
    const mouth = new THREE.Vector3(0, 1, 0).applyQuaternion(entry.group.quaternion);
    const mx = mouth.x / Math.hypot(mouth.x, mouth.z), mz = mouth.z / Math.hypot(mouth.x, mouth.z);
    for (const p of applePaths(AREA, CRATE, entry.group.rotation.y)) {
      const dx = p.x1 - CRATE.x, dz = p.z1 - CRATE.z;
      const d = Math.hypot(dx, dz);
      // inside the fan: within half the spread (and a little jitter) of the mouth's line
      expect((dx * mx + dz * mz) / d).toBeGreaterThan(Math.cos(APPLES.spread / 2 + 0.05));
    }
  });

  it("the apples never settle in a treat counter's watch zone or across a way to a treat", () => {
    const { entry } = tippedCrate();
    for (const p of applePaths(AREA, CRATE, entry.group.rotation.y)) {
      for (const id of TREAT_STALLS) {
        const s = stallById(id);
        const { lx, lz } = toStall(s, p.x1, p.z1);
        const inZone = Math.abs(lx) <= s.w / 2 + 1.5 && lz >= s.d / 2 - 0.5 && lz <= s.d / 2 + 3.7;
        expect(inZone, id).toBe(false);
      }
      for (const s of STALLS) {
        if (!s.treat || !s.hide) continue;
        expect(segDist({ x: p.x1, z: p.z1 }, s.hide, s.treat), s.id).toBeGreaterThan(1);
      }
    }
  });

  it('two devices roll the same apples to the same spots', () => {
    // the test's own scenes are made first (a three.js object's uuid draws on Math.random)
    const scenes = [0, 1, 2, 3].map(() => new THREE.Scene());
    const random = vi.spyOn(Math, 'random');
    try {
      const a = tippedCrate(scenes[0]);
      const b = tippedCrate(scenes[1]);
      expect(b.entry.group.rotation.y).toBe(a.entry.group.rotation.y);
      const pa = applePaths(AREA, CRATE, a.entry.group.rotation.y);
      const pb = applePaths(marketArea(), { ...CRATE }, b.entry.group.rotation.y);
      expect(pb).toEqual(pa);
      // and once rolled they lie at those spots on both screens
      const ends = (paths, scene) => {
        const apples = createApples(scene, paths, { reducedMotion: false });
        apples.start();
        for (let i = 0; i < 100; i++) apples.update(1 / 30);
        const m = new THREE.Matrix4();
        const v = new THREE.Vector3();
        const out = [];
        for (let i = 0; i < paths.length; i++) {
          apples.mesh.getMatrixAt(i, m);
          out.push(v.setFromMatrixPosition(m).toArray());
        }
        apples.dispose();
        return out;
      };
      const ea = ends(pa, scenes[2]);
      expect(closeDiffs(ends(pb, scenes[3]), ea)).toEqual([]);
      for (const [i, p] of pa.entries()) {
        expect(ea[i][0]).toBeCloseTo(p.x1, 5);
        expect(ea[i][2]).toBeCloseTo(p.z1, 5);
        expect(ea[i][1]).toBeCloseTo(APPLES.r, 3);
      }
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
    expect(Number.isFinite(MARKET_APPLE_SALT)).toBe(true);
  });

  it('the apples lie still once rolled, and nothing allocates per frame', () => {
    const scene = new THREE.Scene();
    const paths = applePaths(AREA, CRATE, tippedCrate().entry.group.rotation.y);
    const apples = createApples(scene, paths, { reducedMotion: false });
    expect(apples.mesh.isInstancedMesh).toBe(true);
    expect(apples.mesh.material.vertexColors).toBe(true); // the stems brown, the apples their own colours
    expect(apples.mesh.count).toBe(APPLES.n);
    expect(apples.mesh.visible).toBe(false); // nothing until the crate goes over
    const children = scene.children.length;
    const array = apples.mesh.instanceMatrix.array;
    const geometry = apples.mesh.geometry;
    apples.start();
    expect(apples.mesh.visible).toBe(true);
    const mid = [];
    for (let i = 0; i < 20; i++) {
      apples.update(1 / 60);
      mid.push(Array.from(array.slice(12, 15)));
    }
    // still rolling: the first apple has moved between frames
    expect(mid[19]).not.toEqual(mid[5]);
    for (let i = 0; i < 200; i++) apples.update(1 / 60);
    const still = Array.from(array);
    const version = apples.mesh.instanceMatrix.version;
    for (let i = 0; i < 200; i++) apples.update(1 / 60);
    expect(Array.from(apples.mesh.instanceMatrix.array)).toEqual(still);
    expect(apples.mesh.instanceMatrix.version).toBe(version); // nothing written once still
    expect(apples.mesh.instanceMatrix.array).toBe(array);
    expect(apples.mesh.geometry).toBe(geometry);
    expect(scene.children.length).toBe(children);
    apples.dispose();
    expect(scene.children.length).toBe(children - 1);
  });

  it('under reduced motion the apples are simply there, at their ends, at the same rest as anywhere', () => {
    const scene = new THREE.Scene();
    const paths = applePaths(AREA, CRATE, tippedCrate().entry.group.rotation.y);
    const apples = createApples(scene, paths, { reducedMotion: true });
    apples.start();
    apples.update(1 / 60);
    const rolled = createApples(scene, paths, { reducedMotion: false });
    rolled.start();
    for (let i = 0; i < 200; i++) rolled.update(1 / 60);
    expect(closeDiffs(Array.from(apples.mesh.instanceMatrix.array), Array.from(rolled.mesh.instanceMatrix.array), 1e-6)).toEqual([]);
    rolled.dispose();
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (let i = 0; i < paths.length; i++) {
      apples.mesh.getMatrixAt(i, m);
      v.setFromMatrixPosition(m);
      expect(v.x).toBeCloseTo(paths[i].x1, 5);
      expect(v.z).toBeCloseTo(paths[i].z1, 5);
    }
    apples.dispose();
  });
});

// A stand-in for the walk's session: just what the life reads.
function standIn(scene) {
  const tippables = createTippables(scene, [crateSpot()]);
  const knockables = createKnockables(scene, MARKET_REGISTRATION.propSet.knockables);
  return { tippables, knockables };
}
const frames = (life, session, n, extra = () => {}) => {
  for (let i = 0; i < n; i++) {
    session.tippables.update(1 / 30);
    session.knockables.update(1 / 30);
    extra();
    life.update(1 / 30, i / 30, null, null, session);
  }
};

describe('the market life', () => {
  it('a tipped crate on either device starts the apples', () => {
    for (const how of ['tip', 'tipById']) {
      const scene = new THREE.Scene();
      const session = standIn(scene);
      const life = createMarketLife(LIFE_AREA, { scene, dusk: false, reducedMotion: false });
      frames(life, session, 10);
      expect(scene.getObjectByName('marketApples'), how).toBeUndefined();
      if (how === 'tip') session.tippables.tip(session.tippables.list[0]);
      else expect(session.tippables.tipById('tip-0')).toBe(true);
      // not while the crate is still going over: once it is nearly down (anim 0.25 s left)
      frames(life, session, 6);
      expect(session.tippables.list[0].anim, how).toBeGreaterThan(0.25);
      expect(scene.getObjectByName('marketApples'), how).toBeUndefined();
      frames(life, session, 2);
      expect(session.tippables.list[0].anim, how).toBeLessThanOrEqual(0.25);
      expect(scene.getObjectByName('marketApples')?.visible, how).toBe(true);
      frames(life, session, 90);
      const apples = scene.getObjectByName('marketApples');
      expect(apples?.visible, how).toBe(true);
      const paths = applePaths(LIFE_AREA, CRATE, session.tippables.list[0].group.rotation.y);
      const m = new THREE.Matrix4();
      const v = new THREE.Vector3();
      for (let i = 0; i < paths.length; i++) {
        apples.getMatrixAt(i, m);
        v.setFromMatrixPosition(m);
        expect(v.x, how).toBeCloseTo(paths[i].x1, 5);
        expect(v.z, how).toBeCloseTo(paths[i].z1, 5);
      }
      life.dispose();
      expect(scene.getObjectByName('marketApples')).toBeUndefined();
    }
  });

  it("the apples roll over the plan's square, whatever this device added to the live record", () => {
    // the walk pushes this device's own colliders (scratch posts, gate frames, rests,
    // a birthday cake) onto the record: one right across the apples' fan
    const plan = applePaths(marketArea(), CRATE, tippedCrate().entry.group.rotation.y);
    const mid = plan[2];
    const blocked = { ...LIFE_AREA, colliders: [...AREA.colliders, { x: (mid.x0 + mid.x1) / 2, z: (mid.z0 + mid.z1) / 2, r: 0.5 }] };
    expect(applePaths(blocked, CRATE, tippedCrate().entry.group.rotation.y)).not.toEqual(plan);
    const scene = new THREE.Scene();
    const session = standIn(scene);
    const life = createMarketLife(blocked, { scene, dusk: false, reducedMotion: false });
    session.tippables.tip(session.tippables.list[0]);
    frames(life, session, 120);
    const apples = scene.getObjectByName('marketApples');
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (let i = 0; i < plan.length; i++) {
      apples.getMatrixAt(i, m);
      v.setFromMatrixPosition(m);
      expect(v.x).toBeCloseTo(plan[i].x1, 5);
      expect(v.z).toBeCloseTo(plan[i].z1, 5);
    }
    life.dispose();
  });

  it('the petals show where the bucket lands, once, and stay', () => {
    const scene = new THREE.Scene();
    const session = standIn(scene);
    const life = createMarketLife(LIFE_AREA, { scene, dusk: false, reducedMotion: false });
    const petals = scene.getObjectByName('marketPetals');
    expect(petals.isMesh).toBe(true);
    expect(petals.visible).toBe(false);
    frames(life, session, 10);
    expect(petals.visible).toBe(false);
    // the cafe cup going over shows nothing
    session.knockables.knockById('market-cup-1');
    frames(life, session, 30);
    expect(petals.visible).toBe(false);
    expect(session.knockables.knockById('market-bucket-1')).toBe(true);
    frames(life, session, 3);
    expect(petals.visible).toBe(false); // still falling
    frames(life, session, 30);
    expect(petals.visible).toBe(true);
    const children = scene.children.length;
    frames(life, session, 100);
    expect(petals.visible).toBe(true);
    expect(scene.children.length).toBe(children);
    // a flat ring about where it lies, r <= 0.6
    scene.updateMatrixWorld(true);
    const p = petals.geometry.attributes.position;
    const v = new THREE.Vector3();
    let near = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(petals.matrixWorld);
      const r = Math.hypot(v.x - BUCKET.fallTo.x, v.z - BUCKET.fallTo.z);
      expect(r).toBeLessThanOrEqual(0.6 + 1e-6);
      if (r < 0.15) near++;
      expect(v.y).toBeGreaterThan(0);
      expect(v.y).toBeLessThan(0.05);
    }
    expect(near).toBe(0); // a ring: none under the bucket itself
    expect(p.count).toBeGreaterThanOrEqual(10 * 3);
    life.dispose();
    expect(scene.getObjectByName('marketPetals')).toBeUndefined();
  });

  it('the crate, the apples and the petals cast nothing; the life adds at most 3 meshes for them', () => {
    const scene = new THREE.Scene();
    const session = standIn(scene);
    const before = meshesOf(scene).length;
    const life = createMarketLife(LIFE_AREA, { scene, dusk: false, reducedMotion: false });
    session.tippables.tip(session.tippables.list[0]);
    session.knockables.knockById('market-bucket-1');
    frames(life, session, 90);
    const added = meshesOf(scene).length - before;
    expect(added).toBeLessThanOrEqual(3);
    for (const name of ['marketApples', 'marketPetals']) {
      const m = scene.getObjectByName(name);
      expect(m.castShadow, name).toBe(false);
      expect(m.userData.noCast, name).toBe(true);
    }
    for (const m of meshesOf(session.tippables.list[0].group)) {
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
    }
    life.dispose();
  });

  it('the petals are the same on both screens, from data', () => {
    const scenes = [new THREE.Scene(), new THREE.Scene()];
    const random = vi.spyOn(Math, 'random');
    try {
      const pos = (scene) => {
        const petals = createPetals(scene, BUCKET.fallTo);
        const out = Array.from(petals.mesh.geometry.attributes.position.array);
        petals.dispose();
        return out;
      };
      expect(pos(scenes[0])).toEqual(pos(scenes[1]));
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
