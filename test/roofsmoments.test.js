import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { createRoofsMoments } from '../src/world/roofsmoments.js';
import { createRoofsLife } from '../src/roofslife.js';
import { ROOFS_DISCOVERIES, ROOFS_PERCHES, TELESCOPE_CRATE, ROOFS_GROUND } from '../src/world/roofsplan.js';
import { createGround } from '../src/ground.js';

// The moments the Rooftops' six finds start (src/world/roofsmoments.js): where
// she is, every frame, against R3's rules; a find not yet seen this walk is
// noted on her save (roofsfinds.js noteRoofsFind) and its moment begins.
const mem = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const area = { anchors: { discoveries: ROOFS_DISCOVERIES } };
const session = () => ({ perched: null, rest: null, traversal: { busy: false } });
const LOFT = ROOFS_DISCOVERIES.loft;
const onLoft = () => new THREE.Vector3(LOFT.x, LOFT.y, LOFT.z);
const offLoft = () => new THREE.Vector3(LOFT.x + 8, LOFT.y, LOFT.z);
function save() {
  const progression = createProgression(mem());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  return { progression, log };
}
// `frames` frames of 1/30 s with her at `pos`
function run(m, pos, frames, s = session(), camera = null) {
  for (let i = 0; i < frames; i++) m.update(1 / 30, pos, camera, s);
}
const discoveries = (spy) => spy.mock.calls.filter((c) => c[0] === 'discovery');

afterEach(() => vi.restoreAllMocks());

describe('the Rooftops\' moments: noting a find', () => {
  it('walking onto the loft writes its page once a walk', () => {
    const { progression, log } = save();
    const spy = vi.spyOn(bus, 'emit');
    const m = createRoofsMoments(area, { log, progression, hud: null });
    run(m, offLoft(), 10);
    expect(progression.state.journal.roofloft ?? 0).toBe(0);
    run(m, onLoft(), 10);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    run(m, offLoft(), 10);
    run(m, onLoft(), 10);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    m.dispose();
    // the next walk counts the page again, and pays and says nothing
    log.startWalk();
    const m2 = createRoofsMoments(area, { log, progression });
    run(m2, onLoft(), 10);
    expect(progression.state.journal.roofloft).toBe(2);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    m2.dispose();
  });

  it('a resumed walk pays and counts nothing twice', () => {
    const { progression, log } = save();
    const spy = vi.spyOn(bus, 'emit');
    const m = createRoofsMoments(area, { log, progression });
    run(m, onLoft(), 5);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    const kept = log.entries();
    m.dispose();
    // the game closed and opened again: the same walk picked up (walkresume.js)
    log.startWalk();
    log.restore(kept);
    expect(kept).toContainEqual(['roofs-find-loft', 1]);
    const again = createRoofsMoments(area, { log, progression });
    run(again, onLoft(), 30);
    expect(progression.state.journal.roofloft).toBe(1);
    expect(progression.state.points).toBe(12);
    expect(discoveries(spy)).toHaveLength(1);
    again.dispose();
    // and on a save that found it before this walk, the restored key alone holds it
    const other = save();
    other.log.restore([['roofs-find-loft', 1]]);
    const m3 = createRoofsMoments(area, other);
    run(m3, onLoft(), 30);
    expect(other.progression.state.journal.roofloft ?? 0).toBe(0);
    expect(other.progression.state.points).toBe(0);
    m3.dispose();
  });

  it('two players in a room each find it on their own save', () => {
    const a = save();
    const b = save();
    const ma = createRoofsMoments(area, a);
    const mb = createRoofsMoments(area, b);
    for (let i = 0; i < 20; i++) {
      ma.update(1 / 30, onLoft(), null, session());
      mb.update(1 / 30, onLoft(), null, session());
    }
    for (const p of [a, b]) {
      expect(p.progression.state.journal.roofloft).toBe(1);
      expect(p.progression.state.points).toBe(12);
    }
    ma.dispose();
    mb.dispose();
  });

  it('no log, no progression: nothing is noted and nothing throws', () => {
    const spy = vi.spyOn(bus, 'emit');
    const m = createRoofsMoments(area, {});
    expect(() => {
      run(m, onLoft(), 10);
      m.update(1 / 30, null, null, null);
      m.update(1 / 30, onLoft(), null, undefined);
    }).not.toThrow();
    expect(discoveries(spy)).toHaveLength(0);
    m.dispose();
  });

  it('the chimney counts her stillness, and moving starts it again', () => {
    const { progression, log } = save();
    const c = ROOFS_DISCOVERIES.chimney;
    const m = createRoofsMoments(area, { log, progression });
    const here = new THREE.Vector3(c.x, c.y, c.z);
    run(m, here, 40); // 1.33 s
    expect(progression.state.journal.roofchimney ?? 0).toBe(0);
    // a step of 0.3 m: still again from there
    here.x += 0.3;
    run(m, here, 40);
    expect(progression.state.journal.roofchimney ?? 0).toBe(0);
    run(m, here, 10); // past 1.5 s still
    expect(progression.state.journal.roofchimney).toBe(1);
    m.dispose();
  });

  it('the telescope is noted from her session\'s perch', () => {
    const { progression, log } = save();
    const crate = ROOFS_PERCHES.find((p) => p.x === TELESCOPE_CRATE.x && p.z === TELESCOPE_CRATE.z);
    const y = createGround(ROOFS_GROUND).y(crate.x, crate.z) + crate.y;
    const pos = new THREE.Vector3(crate.x, y, crate.z);
    const m = createRoofsMoments(area, { log, progression });
    run(m, pos, 5); // on the crate's spot but not perched (a stand-in)
    expect(progression.state.journal.rooftelescope ?? 0).toBe(0);
    run(m, pos, 5, { ...session(), perched: crate });
    expect(progression.state.journal.rooftelescope).toBe(1);
    m.dispose();
  });
});

describe('the life hands its moments her session', () => {
  const SKY = { skySunset: { top: 0x4a5a8c, horizon: 0xe89a6a }, skyDusk: { top: 0x1f2a52, horizon: 0x8a5a6a } };
  const lifeFor = (ctx) => createRoofsLife({ ...SKY, ...area })({
    scene: { background: null, fog: new THREE.Fog(0, 40, 140) }, sun: { intensity: 0.8 }, fill: { intensity: 0.5 }, ...ctx,
  });

  it('the fifth argument reaches the moments; four arguments still work', () => {
    const { progression, log } = save();
    const life = lifeFor({ log, progression, hud: null });
    life.update(1 / 30, 1000, onLoft(), null); // an older caller: no session
    expect(progression.state.journal.roofloft).toBe(1);
    const crate = ROOFS_PERCHES.find((p) => p.x === TELESCOPE_CRATE.x && p.z === TELESCOPE_CRATE.z);
    const y = createGround(ROOFS_GROUND).y(crate.x, crate.z) + crate.y;
    life.update(1 / 30, 1000, new THREE.Vector3(crate.x, y, crate.z), null, { ...session(), perched: crate });
    expect(progression.state.journal.rooftelescope).toBe(1);
    life.dispose();
  });

  it('a picture page\'s life (no log, no progression) notes nothing', () => {
    const spy = vi.spyOn(bus, 'emit');
    const life = lifeFor({});
    life.update(1 / 30, 1000, onLoft(), null, session());
    expect(discoveries(spy)).toHaveLength(0);
    life.dispose();
  });
});

// Rooftops step 5, Task 5: what each moment looks like (R6-R9).
describe('the Rooftops\' moments: the ring, the view and the pane', () => {
  const C = ROOFS_DISCOVERIES.chimney;
  const V = ROOFS_DISCOVERIES.vane;
  const stub = () => {
    const at = [];
    let walk = 0;
    return { at, tick: (dt) => { walk += dt; }, ring: { puff: () => at.push(walk), update() {}, dispose() {} } };
  };

  it('still by the warm chimney it puffs a ring, then one every 7 s; moving stops it', () => {
    const s = stub();
    const m = createRoofsMoments(area, { ring: s.ring });
    const here = new THREE.Vector3(C.x, C.y, C.z);
    for (let i = 0; i < 600; i++) { s.tick(1 / 30); m.update(1 / 30, here, null, session()); }
    expect(s.at).toHaveLength(3);
    [1.5, 8.5, 15.5].forEach((t, k) => expect(Math.abs(s.at[k] - t), `ring ${k}`).toBeLessThan(0.1)); // to the frame
    // moving about on the stack: no more rings
    for (let i = 0; i < 300; i++) {
      s.tick(1 / 30);
      m.update(1 / 30, new THREE.Vector3(C.x + (i % 2 ? 0.2 : -0.2), C.y, C.z), null, session());
    }
    expect(s.at).toHaveLength(3);
    // a nap is still: it puffs again, and goes on puffing
    for (let i = 0; i < 300; i++) { s.tick(1 / 30); m.update(1 / 30, here, null, { ...session(), rest: { kind: 'nap' } }); }
    expect(s.at).toHaveLength(5);
    m.dispose();
  });

  it('the ring is the warm chimney pot\'s, made where the place has its pots, and taken away', async () => {
    const { SMOKE_POTS } = await import('../src/world/roofsplan.js');
    const scene = new THREE.Scene();
    const pot = { x: C.x, y: 8.72, z: 6.95 };
    const m = createRoofsMoments({ ...area, potTops: { [SMOKE_POTS[0]]: pot } }, { scene });
    const ring = scene.children.find((o) => o.name === 'roofsRing');
    expect(ring).toBeDefined();
    expect(ring.visible).toBe(false);
    run(m, new THREE.Vector3(C.x, C.y, C.z), 50);
    expect(ring.visible).toBe(true);
    expect(Math.hypot(ring.position.x - pot.x, ring.position.z - pot.z)).toBeLessThan(0.1);
    m.dispose();
    expect(scene.children).toEqual([]);
    // no pots, no ring; no scene, no ring
    const s2 = new THREE.Scene();
    createRoofsMoments(area, { scene: s2 }).dispose();
    expect(s2.children).toEqual([]);
  });

  it('the tower view, at most 18 degrees down, behind her and above her paws', async () => {
    const { TOWER_VIEW, towerView } = await import('../src/world/roofsmoments.js');
    expect(TOWER_VIEW).toEqual({ settle: 0.8, rate: 1.6, back: 2.4, up: 1.5, look: { x: 8, y: 4, z: 30 }, maxPitch: 18 * Math.PI / 180 });
    const cat = new THREE.Vector3(V.x, V.y, V.z);
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    for (const c of [cat, new THREE.Vector3(V.x + 0.6, V.y, V.z - 0.9), new THREE.Vector3(V.x, V.y + 9, V.z)]) {
      towerView(c, pos, look);
      const pitch = Math.atan2(pos.y - look.y, Math.hypot(look.x - pos.x, look.z - pos.z));
      expect(pitch).toBeLessThanOrEqual(TOWER_VIEW.maxPitch + 1e-9);
      expect(pitch).toBeGreaterThan(0); // looking down over the town, never up at the sky
      expect(pos.y - c.y).toBeCloseTo(1.5, 9);
      const [bx, bz] = [pos.x - c.x, pos.z - c.z];
      expect(Math.hypot(bx, bz)).toBeCloseTo(2.4, 9);
      const [lx, lz] = [TOWER_VIEW.look.x - c.x, TOWER_VIEW.look.z - c.z];
      expect((bx * lx + bz * lz) / (Math.hypot(bx, bz) * Math.hypot(lx, lz))).toBeCloseTo(-1, 9);
    }
    // from the vane's own spot it looks at the view itself (15.7 degrees: under the cap)
    towerView(cat, pos, look);
    expect([look.x, look.y, look.z]).toEqual([8, 4, 30]);
  });

  it('the tower view eases in once she is still, and out when she moves', async () => {
    const { TOWER_VIEW, towerView } = await import('../src/world/roofsmoments.js');
    const cat = new THREE.Vector3(V.x, V.y, V.z);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const fov = camera.fov;
    // player.update's follow camera, every frame, before the moments
    const follow = (c) => {
      camera.position.set(c.x, c.y + 2, c.z - 4);
      camera.lookAt(c.x, c.y + 0.3, c.z);
    };
    const step = (m, c, s, n) => {
      for (let i = 0; i < n; i++) { follow(c); m.update(1 / 30, c, camera, s); }
    };
    const m = createRoofsMoments(area, {});
    step(m, cat, session(), 23); // 0.77 s
    expect(m.viewWeight).toBe(0);
    step(m, cat, session(), 19); // 1.4 s
    expect(m.viewWeight).toBeGreaterThan(0);
    expect(m.viewWeight).toBeLessThanOrEqual(0.65);
    step(m, cat, session(), 78); // 4 s
    expect(m.viewWeight).toBeGreaterThan(0.95);
    // the camera is the view's: behind her, looking out at most 18 degrees down, no roll, the same lens
    const want = new THREE.Vector3();
    towerView(cat, want, new THREE.Vector3());
    expect(camera.position.distanceTo(want)).toBeLessThan(0.2);
    const dir = camera.getWorldDirection(new THREE.Vector3());
    expect(Math.asin(-dir.y)).toBeLessThanOrEqual(TOWER_VIEW.maxPitch + 0.01);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    expect(Math.abs(right.y)).toBeLessThan(1e-6);
    expect(camera.fov).toBe(fov);
    // she moves: it lets go
    for (let i = 0; i < 90; i++) {
      const c = new THREE.Vector3(V.x + (i % 2 ? 0.1 : -0.1), V.y, V.z);
      follow(c);
      m.update(1 / 30, c, camera, session());
    }
    expect(m.viewWeight).toBeLessThan(0.05);
    m.dispose();
    // mid-hop it never starts; under reduced motion never at all
    const busy = createRoofsMoments(area, {});
    step(busy, cat, { ...session(), traversal: { busy: true } }, 120);
    expect(busy.viewWeight).toBe(0);
    const calm = createRoofsMoments(area, { reducedMotion: true });
    step(calm, cat, session(), 120);
    expect(calm.viewWeight).toBe(0);
    follow(cat);
    const before = camera.position.clone();
    calm.update(1 / 30, cat, camera, session());
    expect(camera.position.toArray()).toEqual(before.toArray());
    // nowhere else on the roofs
    const away = createRoofsMoments(area, {});
    step(away, new THREE.Vector3(C.x, C.y, C.z), session(), 120);
    expect(away.viewWeight).toBe(0);
  });

  // Fix round 1: the blend is in angles round her. A follow camera 4 m back
  // and 2 m up, `off` radians round her from the view's own side, looking at her.
  describe('the tower view from a follow camera on another side of her', () => {
    const DEG = Math.PI / 180;
    const cat = new THREE.Vector3(V.x, V.y, V.z);
    const setup = async () => {
      const { TOWER_VIEW, towerView } = await import('../src/world/roofsmoments.js');
      const vp = new THREE.Vector3();
      towerView(cat, vp, new THREE.Vector3());
      const side = Math.atan2(vp.x - cat.x, vp.z - cat.z);
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
      const follow = (c, off) => {
        camera.position.set(c.x + Math.sin(side + off) * 4, c.y + 2, c.z + Math.cos(side + off) * 4);
        camera.lookAt(c.x, c.y + 0.3, c.z);
      };
      const followPitch = Math.atan2(2 - 0.3, 4);
      const cap = Math.max(followPitch, TOWER_VIEW.maxPitch) + 1e-6;
      return { camera, follow, cap };
    };
    // one frame: the follow camera, then the moments; the bounds checked on
    // what they leave. The turn: the blend's own at most 150 degrees a second
    // (frame-rate aware), on top of whatever the follow camera turned itself.
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const faceOf = (camera, dir = new THREE.Vector3()) => {
      camera.getWorldDirection(dir);
      return Math.atan2(dir.x, dir.z);
    };
    const watch = (camera, cap, dt = 1 / 30) => {
      let last = null;
      let lastFollow = null;
      const dir = new THREE.Vector3();
      return (c, followFace = null) => {
        camera.getWorldDirection(dir);
        const pitch = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
        expect(pitch).toBeLessThanOrEqual(cap);
        const face = Math.atan2(dir.x, dir.z);
        const own = followFace !== null && lastFollow !== null ? Math.abs(wrap(followFace - lastFollow)) : 0;
        if (last !== null) expect(Math.abs(wrap(face - last))).toBeLessThanOrEqual(own + 150 * DEG * dt + 0.2 * DEG);
        last = face;
        lastFollow = followFace;
        expect(camera.position.distanceTo(c)).toBeGreaterThanOrEqual(1.5);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        expect(Math.abs(right.y)).toBeLessThan(1e-6);
      };
    };

    it('at 90 and 180 degrees off it never eases in', async () => {
      const { camera, follow } = await setup();
      for (const off of [90 * DEG, -90 * DEG, 180 * DEG]) {
        const m = createRoofsMoments(area, {});
        for (let i = 0; i < 150; i++) { follow(cat, off); m.update(1 / 30, cat, camera, session()); }
        expect(m.viewWeight, `${off / DEG} degrees`).toBe(0);
        m.dispose();
      }
    });

    it('at 0 and 60 degrees off it eases in and out within the bounds every frame', async () => {
      const { camera, follow, cap } = await setup();
      for (const off of [0, 60 * DEG, -60 * DEG]) {
        const m = createRoofsMoments(area, {});
        const check = watch(camera, cap);
        for (let i = 0; i < 150; i++) { follow(cat, off); m.update(1 / 30, cat, camera, session()); check(cat); }
        expect(m.viewWeight, `${off / DEG} degrees in`).toBeGreaterThan(0.95);
        for (let i = 0; i < 120; i++) {
          const c = new THREE.Vector3(V.x + (i % 2 ? 0.1 : -0.1), V.y, V.z);
          follow(c, off);
          m.update(1 / 30, c, camera, session());
          check(c);
        }
        expect(m.viewWeight, `${off / DEG} degrees out`).toBeLessThan(0.05);
        m.dispose();
      }
    });

    // Fix round 2: the stick spins the follow camera round her while the
    // view is fully in. One frame: the follow camera placed, then the moments.
    const spin = async ({ turns, rate, fps }) => {
      const { camera, follow, cap } = await setup();
      const dt = 1 / fps;
      const m = createRoofsMoments(area, {});
      for (let i = 0; i < 5 * fps; i++) { follow(cat, 0); m.update(dt, cat, camera, session()); }
      expect(m.viewWeight).toBe(1);
      const check = watch(camera, cap, dt);
      const dir = new THREE.Vector3();
      const frame = (off) => {
        follow(cat, off);
        const ff = faceOf(camera, dir);
        m.update(dt, cat, camera, session());
        check(cat, ff);
      };
      check(cat, faceOf(camera, dir));
      // spinning: it only ever eases out
      const steps = Math.round((turns * 2 * Math.PI) / (rate * dt));
      const ws = [];
      for (let k = 1; k <= steps; k++) {
        frame(k * rate * dt);
        ws.push(m.viewWeight);
      }
      for (let k = 1; k < ws.length; k++) expect(ws[k]).toBeLessThanOrEqual(ws[k - 1] + 1e-12);
      // stopped on the view's own side: back in, the short way round her
      const yawOf = () => Math.atan2(camera.position.x - cat.x, camera.position.z - cat.z);
      let orbit = 0;
      let prev = yawOf();
      for (let i = 0; i < 6 * fps; i++) {
        frame(steps * rate * dt);
        const y = yawOf();
        orbit += Math.abs(wrap(y - prev));
        prev = y;
      }
      expect(m.viewWeight).toBe(1);
      m.dispose();
      return { ws, orbit, dt };
    };

    it('the stick spins the follow camera a full turn at 180 degrees a second: it lets go, then comes back the short way', async () => {
      const { ws, orbit, dt } = await spin({ turns: 1, rate: 180 * DEG, fps: 30 });
      const below = ws.findIndex((w) => w < 0.1);
      expect(below).toBeGreaterThanOrEqual(0);
      expect(below * dt).toBeLessThanOrEqual(2); // within the one turn
      expect(orbit).toBeLessThanOrEqual(180 * DEG);
    });

    it('two full turns, and a fast turn at 300 degrees a second: the same', async () => {
      const two = await spin({ turns: 2, rate: 180 * DEG, fps: 30 });
      expect(two.ws[two.ws.length - 1]).toBeLessThan(0.1);
      expect(two.orbit).toBeLessThanOrEqual(180 * DEG);
      // a 1.2 s turn: it is letting go by the end (eased out, never back), and comes back the short way
      const fast = await spin({ turns: 1, rate: 300 * DEG, fps: 30 });
      expect(fast.ws[fast.ws.length - 1]).toBeLessThan(0.25);
      expect(fast.orbit).toBeLessThanOrEqual(180 * DEG);
    });

    it('at 20 frames a second the bounds hold too', async () => {
      const { ws, orbit } = await spin({ turns: 1, rate: 180 * DEG, fps: 20 });
      expect(ws[ws.length - 1]).toBeLessThan(0.1);
      expect(orbit).toBeLessThanOrEqual(180 * DEG);
      // and easing in from 60 degrees off, then out, at 20 fps
      const { camera, follow, cap } = await setup();
      const m = createRoofsMoments(area, {});
      const check = watch(camera, cap, 1 / 20);
      for (let i = 0; i < 100; i++) { follow(cat, 60 * DEG); m.update(1 / 20, cat, camera, session()); check(cat); }
      expect(m.viewWeight).toBe(1);
      for (let i = 0; i < 80; i++) {
        const c = new THREE.Vector3(V.x + (i % 2 ? 0.1 : -0.1), V.y, V.z);
        follow(c, 60 * DEG);
        m.update(1 / 20, c, camera, session());
        check(c);
      }
      expect(m.viewWeight).toBe(0);
      m.dispose();
    });

    it('easing out after it was fully in, with the follow camera moved 120 degrees away, keeps the same bounds', async () => {
      const { camera, follow, cap } = await setup();
      for (const turn of [120 * DEG, -120 * DEG]) {
        const m = createRoofsMoments(area, {});
        for (let i = 0; i < 150; i++) { follow(cat, 60 * DEG); m.update(1 / 30, cat, camera, session()); }
        expect(m.viewWeight).toBe(1);
        const check = watch(camera, cap);
        check(cat); // the view's own picture, the frame before
        for (let i = 0; i < 150; i++) {
          const c = new THREE.Vector3(V.x + (i % 2 ? 0.1 : -0.1), V.y, V.z);
          follow(c, 60 * DEG + turn);
          m.update(1 / 30, c, camera, session());
          check(c);
        }
        expect(m.viewWeight).toBe(0);
        m.dispose();
      }
    });
  });

  it('the moon: in over 0.8 s on the crate, held at most 6 s, out over 0.8 s, out at once when she hops down', async () => {
    const { MOON_VIEW, moonOpacity } = await import('../src/world/roofsmoments.js');
    expect(MOON_VIEW).toEqual({ fadeIn: 0.8, hold: 6, fadeOut: 0.8 });
    expect(moonOpacity(0, null)).toBe(0);
    expect(moonOpacity(0.4, null)).toBeCloseTo(0.5, 6);
    expect(moonOpacity(1, null)).toBe(1);
    expect(moonOpacity(6.4, null)).toBeCloseTo(0.5, 6);
    expect(moonOpacity(7, null)).toBe(0);
    expect(moonOpacity(2, 0.4)).toBeCloseTo(0.5, 6);
    expect(moonOpacity(2, 0.8)).toBe(0);
    expect(moonOpacity(0.4, 0.4)).toBeCloseTo(0.25, 6); // hopping down half way in
    for (let k = 1; k <= 100; k++) {
      expect(moonOpacity(2, k / 100)).toBeLessThanOrEqual(moonOpacity(2, (k - 1) / 100));
      const v = moonOpacity(k * 0.08, null);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('the attic pane sits on the skylight\'s glass', async () => {
    const { createAtticPane, paintAttic } = await import('../src/world/roofsmoments.js');
    const { SKYLIGHT, LEVELS } = await import('../src/world/roofsplan.js');
    const { fakePage } = await import('./helpers/fakepage.js');
    const page = fakePage();
    const scene = new THREE.Scene();
    const pane = createAtticPane(scene, area, page);
    expect(scene.children).toEqual([pane]);
    expect(pane.isMesh).toBe(true);
    const g = pane.geometry;
    expect((g.index ? g.index.count : g.attributes.position.count) / 3).toBe(2);
    expect(pane.castShadow).toBe(false);
    expect(pane.userData.noCast).toBe(true);
    expect(pane.position.x).toBeCloseTo(SKYLIGHT.x, 9);
    expect(pane.position.z).toBeCloseTo(SKYLIGHT.z, 9);
    expect(pane.position.y).toBeCloseTo(LEVELS.FLAT + 0.035, 9);
    // flat, facing up, inside the glass
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(pane.quaternion);
    expect(n.y).toBeCloseTo(1, 9);
    const box = new THREE.Box3().setFromObject(pane);
    expect(box.max.x - box.min.x).toBeCloseTo(SKYLIGHT.w - 0.08, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(SKYLIGHT.d - 0.08, 6);
    expect(pane.material.toneMapped).toBe(false);
    expect(pane.material.map.image.width).toBe(128);
    expect(pane.material.map.image.height).toBe(160);
    // painted: warm all over first, and nothing in it is black
    const fills = page.painted.filter((p) => p.call === 'fillRect' || p.call === 'fill');
    expect(fills.length).toBeGreaterThan(4);
    const styles = page.painted.filter((p) => p.set === 'fillStyle').map((p) => p.value).filter((v) => typeof v === 'string');
    for (const s of styles) expect(s.toLowerCase()).not.toMatch(/^(#000|#000000|black|rgb\(0, ?0, ?0\))$/);
    expect(typeof paintAttic).toBe('function');
    // headless: no pane
    expect(createAtticPane(new THREE.Scene(), area, undefined)).toBeNull();
    expect(createAtticPane(new THREE.Scene(), area, null)).toBeNull();
  });

  it('the moments make the pane where there is a page, and take it away', async () => {
    const { fakePage } = await import('./helpers/fakepage.js');
    const scene = new THREE.Scene();
    const m = createRoofsMoments(area, { scene, doc: fakePage() });
    const pane = scene.children.find((o) => o.name === 'roofsAttic');
    expect(pane).toBeDefined();
    const disposed = [];
    pane.geometry.addEventListener('dispose', () => disposed.push('geometry'));
    pane.material.addEventListener('dispose', () => disposed.push('material'));
    pane.material.map.addEventListener('dispose', () => disposed.push('map'));
    run(m, onLoft(), 5);
    m.dispose();
    expect(scene.children).toEqual([]);
    expect(disposed.sort()).toEqual(['geometry', 'map', 'material']);
  });

  it('the attic is painted once a walk, however long she stays', async () => {
    const { fakePage } = await import('./helpers/fakepage.js');
    const page = fakePage();
    const scene = new THREE.Scene();
    const m = createRoofsMoments(area, { scene, doc: page });
    const sky = ROOFS_DISCOVERIES.skylight;
    run(m, new THREE.Vector3(sky.x, sky.y, sky.z), 300); // standing at the attic window
    run(m, onLoft(), 300);
    // paintAttic's one wall gradient, and its first fill, once
    expect(page.painted.filter((p) => p.call === 'createLinearGradient')).toHaveLength(1);
    expect(page.painted.filter((p) => p.call === 'fillRect' && p.args[0] === 0 && p.args[1] === 0 && p.args[2] === 128 && p.args[3] === 160)).toHaveLength(2); // the wall, and the lamp's glow over it
    m.dispose();
  });
});
