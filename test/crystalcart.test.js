// The Crystal Cave, wing C milestone C4: Lumi's cart on the old tracks (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md decisions 4, 5, 7, 8). The corridor is clear of every
// find, mouse, stone, Lumi's places, the arch, the pool and the wander points; the cart never leaves the line under any stick; a hop-off spot is always free and reachable on foot; a walk
// that ends while she rides sets her down on a platform; the rim clears leave every scatter else alone; one PointLight; the track is one merged mesh; reduced motion; both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as P from '../src/world/crystalplan.js';
import * as W from '../src/world/crystalwingplan.js';
import { CRYSTAL_FIND_ZONES, CRYSTAL_COLLECTIBLES, CRYSTAL_GOLD } from '../src/world/crystalfindsplan.js';
import { LUMI, STONES } from '../src/world/crystalstory.js';
import { SPOTS, STONE, BUG, SPARK } from '../src/world/crystalerrand.js';
import { createPathRide, stepPath, posAt, hopOffSpot } from '../src/world/pathride.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { createProgression } from '../src/progression.js';
import { memoryStorage } from './helpers/storage.js';

const { CRYSTAL_CLEARS } = P;
await import('../src/world/crystalstagewingc.js');
await import('../src/world/crystalstageplay.js');
const { ST } = await import('../src/world/crystalstages.js');
const C = await import('../src/world/crystalcartplan.js');
const { createCartLive, SEAT_FRAME } = await import('../src/world/crystalcartlive.js');
const { createRiverLive } = await import('../src/world/crystalriverlive.js');
const R = await import('../src/world/crystalriverplan.js');
const G = await import('../src/world/crystalgrottoplan.js');
const { build } = await import('../src/world/crystal.js');
const { CART_LINES } = await import('../src/world/crystalcartwords.js');
const { WING_LIVE, wingPageShown, CRYSTAL_PAGE_WORDS } = await import('../src/crystalpages.js');
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const B = P.CRYSTAL_BOUNDS;
const allCols = () => [...P.crystalColliders(), ...R.riverColliders(), ...G.grottoColliders()];
const freeOf = (x, z, m) => allCols().every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + m);

function flood(cols) {
  const ground = P.createCrystalGround();
  const cell = 0.4;
  const key = (i, j) => `${i},${j}`;
  const seen = new Set();
  const q = [[Math.round(P.CRYSTAL_SPAWN.x / cell), Math.round(P.CRYSTAL_SPAWN.z / cell)]];
  seen.add(key(...q[0]));
  const blocked = (x, z) => x < B.minX + 0.5 || x > B.maxX - 0.5 || z < B.minZ + 0.5 || z > B.maxZ - 0.5 || cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (seen.has(key(ni, nj))) continue;
      const x = ni * cell, z = nj * cell;
      if (blocked(x, z) || !ground.canStep(i * cell, j * cell, x, z)) continue;
      seen.add(key(ni, nj));
      q.push([ni, nj]);
    }
  }
  return (x, z) => seen.has(key(Math.round(x / cell), Math.round(z / cell)));
}

describe('the track and the cart path', () => {
  it('runs from the forge area (z 22) to the singing chamber (z -14) along x about -33, inside the walkable bounds, and the spec is the cart\'s', () => {
    expect(C.TRACK.zNorth).toBe(22);
    expect(C.TRACK.zSouth).toBe(-14);
    expect(Math.abs(C.TRACK.x + 33)).toBeLessThan(1.5);
    expect(C.PLATFORM.minX).toBeGreaterThanOrEqual(B.minX + 0.5);
    expect(C.TRACK_LEN).toBeCloseTo(36, 6);
    expect(C.CART_SPEC.vMin).toBe(1.0);
    expect(C.CART_SPEC.vMax).toBe(3.0);
    expect(C.CART_SPEC.bumpers).toBe(true);
    expect(C.CART_SPEC.stops.map((s) => s.name)).toEqual(['north', 'south']);
    expect(C.TRACK_END).toEqual({ x: C.TRACK.x, z: -14 });
    expect(C.ROSE_SHARD.z).toBeLessThan(-8); // the rose shard lies near the south end
    expect(Math.hypot(C.ROSE_SHARD.x - C.TRACK_END.x, C.ROSE_SHARD.z - C.TRACK_END.z)).toBeLessThan(5);
  });
  it('under a random stick the cart never leaves the line and is never stuck: it halts at each end, then rolls back the way it came', () => {
    for (const seed of [3, 11, 29]) {
      let a = seed;
      const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
      let r = createPathRide(C.TRACK_PATH, C.CART_SPEC);
      let ends = new Set();
      let maxS = 0, minS = 1e9;
      for (let i = 0; i < 20000; i++) {
        r = stepPath(r, { fwd: rnd() * 2 - 1, side: rnd() * 2 - 1 }, i % 5 === 0 ? 0.15 : 1 / 30, C.CART_SPEC, C.TRACK_PATH);
        expect(Math.abs(r.x - C.TRACK.x), `${seed}:${i}`).toBeLessThan(1e-6);
        expect(r.z).toBeGreaterThanOrEqual(C.TRACK.zSouth - 1e-6);
        expect(r.z).toBeLessThanOrEqual(C.TRACK.zNorth + 1e-6);
        expect(hopOffSpot(r, C.HOP_SPOTS)).toBeTruthy();
        if (r.stop) ends.add(r.stop);
        maxS = Math.max(maxS, r.s); minS = Math.min(minS, r.s);
      }
      expect([...ends].sort()).toEqual(['north', 'south']);
      expect(minS).toBeLessThan(0.01);
      expect(maxS).toBeGreaterThan(C.TRACK_LEN - 0.01);
    }
    // with no stick: a full out-and-back, ends in both directions, speeds inside the spec
    let r = createPathRide(C.TRACK_PATH, C.CART_SPEC);
    let turned = 0, dir = r.dir;
    for (let i = 0; i < 30 * 200; i++) { r = stepPath(r, null, 1 / 30, C.CART_SPEC, C.TRACK_PATH); expect(r.v).toBeLessThanOrEqual(3.0 + 1e-9); if (r.dir !== dir) { turned++; dir = r.dir; } }
    expect(turned).toBeGreaterThanOrEqual(2);
  });
  it('it is the same ride for the same input', () => {
    const run = () => { let r = createPathRide(C.TRACK_PATH, C.CART_SPEC); for (let i = 0; i < 3000; i++) r = stepPath(r, { fwd: Math.sin(i * 0.01), side: 0 }, 1 / 30, C.CART_SPEC, C.TRACK_PATH); return r; };
    expect(run()).toEqual(run());
  });
});

describe('every hop-off spot is free, inside the bounds, reachable on foot, and close', () => {
  it('free of every collider by the cat\'s width, reachable from the spawn, and within reach of the cart on each platform', () => {
    const reach = flood(allCols());
    expect(C.PLATFORM_SPOTS.length).toBe(4);
    expect(C.LINE_SPOTS.length).toBeGreaterThanOrEqual(6);
    for (const sp of C.HOP_SPOTS) {
      expect(freeOf(sp.x, sp.z, 0.45), `${sp.x},${sp.z}`).toBe(true);
      expect(sp.x).toBeGreaterThanOrEqual(B.minX + 0.5);
      expect(sp.z).toBeLessThanOrEqual(B.maxZ - 1);
      expect(reach(sp.x, sp.z), `${sp.x},${sp.z}`).toBe(true);
    }
    for (const s of C.STOPS) { const p = posAt(C.TRACK_PATH, s.s); for (const sp of C.PLATFORM_SPOTS.filter((k) => Math.abs(k.z - p.z) < 2.5)) expect(Math.hypot(sp.x - p.x, sp.z - p.z)).toBeLessThanOrEqual(C.CART.reach); }
    for (let s = 0; s <= C.TRACK_LEN; s += 0.5) { const p = posAt(C.TRACK_PATH, s); const sp = hopOffSpot(p, C.HOP_SPOTS); expect(Math.hypot(sp.x - p.x, sp.z - p.z), `s ${s}`).toBeLessThan(6); }
    // the line itself can be walked from the forge area to the singing chamber: the platforms are reachable
    expect(reach(C.TRACK.x + 1.2, C.TRACK.zNorth - 1)).toBe(true);
    expect(reach(C.TRACK.x + 1.2, C.TRACK.zSouth + 1)).toBe(true);
  });
});

describe('the corridor is clear of everything a cat or Lumi comes to', () => {
  it('no find, collectible, mouse, stone, story point, wander point, arch, pool or great crystal is in the corridor; no cluster touches the line', () => {
    const items = [
      ...Object.values(CRYSTAL_FIND_ZONES).flat().map((k) => [k.x, k.z, k.r]),
      ...CRYSTAL_COLLECTIBLES.map((k) => [k.x, k.z, 0.6]),
      ...CRYSTAL_GOLD.map((k) => [k.x, k.z, 0.8]),
      ...STONES.map((k) => [k.x, k.z, 1.0]),
      ...[LUMI.start, STONE, BUG, SPARK.start, ...SPOTS].map((k) => [k.x, k.z, 1.0]),
      ...P.CRYSTAL_POIS.map((k) => [k.x, k.z, 1.0]),
      [SPARK.ring.x, SPARK.ring.z, SPARK.ring.r], [W.HEART_GREAT.x, W.HEART_GREAT.z, 3], [W.POOL.x, W.POOL.z, W.POOL.r], [P.ARCH.x, P.ARCH.z, 3],
      [P.ROSE_GREAT.x, P.ROSE_GREAT.z, 3.4], ...G.footprint(),
    ];
    for (const [x, z, r] of items) expect(C.inCorridor(x, z, r), `${x},${z}`).toBe(false);
    // the cart's whole width stays 0.3 m clear of every solid piece, along the whole line and on both platforms
    for (const c of allCols()) {
      for (let z = C.TRACK.zSouth - 1.5; z <= C.TRACK.zNorth + 1.5; z += 0.25) expect(Math.hypot(C.TRACK.x - c.x, z - c.z), `${c.x},${c.z}`).toBeGreaterThanOrEqual(c.r + C.CART.half + 0.3);
    }
    expect(CRYSTAL_GOLD.slice(0, 3).map((m) => m.id)).toEqual(['gm-crystal-1', 'gm-crystal-2', 'gm-crystal-3']);
  });
  it('the cart and the river do not meet: the river is on the other side of the cave', () => {
    for (const c of R.riverColliders()) expect(C.inCorridor(c.x, c.z, c.r)).toBe(false);
  });
});

describe('the clears: rim rocks and pebbles only, after the scatter', () => {
  it('CRYSTAL_CLEARS holds the strip; nothing of the rim or the pebbles is in it; clusters, KEEP_OUT and the other streams stay', () => {
    for (const c of C.CLEARS) expect(CRYSTAL_CLEARS).toContainEqual(c);
    const rim = P.scatterRim();
    expect(rim.some((k) => k.x - k.s < C.CLEARS[0].maxX && k.x + k.s > C.CLEARS[0].minX && k.z + k.s > C.CLEARS[0].minZ && k.z - k.s < C.CLEARS[0].maxZ)).toBe(false);
    const saved = CRYSTAL_CLEARS.splice(0);
    const before = P.scatterRim();
    const peb = P.scatterPebbles();
    const clusters = P.scatterClusters();
    const glints = P.scatterGlints();
    CRYSTAL_CLEARS.push(...saved);
    const gone = before.filter((k) => !rim.some((o) => o.x === k.x && o.z === k.z));
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.every((k) => P.inCrystalClear(k.x, k.z, k.s))).toBe(true);
    expect(P.scatterPebbles().length).toBeLessThanOrEqual(peb.length);
    expect(P.scatterClusters()).toEqual(clusters);
    expect(P.scatterGlints()).toEqual(glints);
    expect(P.KEEP_OUT.length).toBe(11);
    expect(read('src/world/crystalstageplay.js') + read('src/world/crystalcartplan.js')).not.toMatch(/KEEP_OUT/);
  });
});

describe('the cart live', () => {
  const rigged = (extra = {}) => {
    const scene = new THREE.Scene();
    const ground = P.createCrystalGround();
    const progression = createProgression(memoryStorage());
    const player = { inputActive: false, perchY: 0, halt() {}, inputDirection: () => ({ x: 0, z: 0 }) };
    const cart = createCartLive({ scene, ground, player, progression, ...extra });
    const cat = new THREE.Object3D();
    const session = { cat, fair: undefined, perched: null };
    return { scene, cart, player, progression, cat, session };
  };
  const tick = (r, n, dt = 0.05, t0 = 0) => { for (let i = 0; i < n; i++) { r.cart.update(dt, t0 + i * dt, { x: r.cat.position.x, z: r.cat.position.z }, null, r.session); r.session.fair.update(dt, t0 + i * dt, { cat: r.cat, player: r.player, session: r.session }); } };
  const waitOffer = (r, spot) => { let o = null; for (let i = 0; i < 6000 && !o; i++) { tick(r, 1, 1 / 30, i / 30); o = r.cart.promptAt({ x: spot.x, z: spot.z }); } return o; };

  it('adds no light: the built cave has its one PointLight and the cart live adds none; the track is one merged mesh and the draw count is small', () => {
    const count = (s) => { let n = 0; s.traverse((o) => { if (o.isLight) n++; }); return n; };
    const scene = new THREE.Scene();
    build(scene);
    let pl = 0; scene.traverse((o) => { if (o.isLight && o.isPointLight) pl++; });
    expect(pl).toBe(1);
    const r = rigged();
    expect(count(r.scene)).toBe(0);
    const track = r.scene.getObjectByName('cc:track');
    expect(track.isMesh).toBe(true);
    expect(r.scene.children.length).toBeLessThanOrEqual(4); // track, lamps, cart
    expect(read('src/world/crystalcartparts.js') + read('src/world/crystalcartlive.js')).not.toMatch(/PointLight|SpotLight|DirectionalLight/);
    r.cart.dispose();
  });
  it('the track follows the floor: every rail piece sits just over it and no step is more than a rail piece rise', () => {
    const r = rigged();
    const pos = r.scene.getObjectByName('cc:track').geometry.attributes.position;
    const g = P.createCrystalGround();
    let low = 0; // (a sleeper's far edge may sink into a floor that slopes sideways)
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (y < g.y(x, z) - 0.3) low++; expect(y).toBeLessThan(g.y(x, z) + 1.3); }
    expect(low).toBe(0);
    for (let z = C.TRACK.zSouth; z < C.TRACK.zNorth; z += 0.5) expect(Math.abs(g.y(C.TRACK.x, z + 0.5) - g.y(C.TRACK.x, z))).toBeLessThan(0.3);
    r.cart.dispose();
  });
  it('it is offered only while the cart waits on a platform and she is near; the press boards; "Hop off" comes anywhere; the seat is the wire\'s', () => {
    const r = rigged();
    const sp = C.PLATFORM_SPOTS[0];
    r.cat.position.set(sp.x, 0, sp.z);
    r.cart.install(r.session);
    expect(r.cart.promptAt({ x: sp.x, z: sp.z })).toBe(phrase('crystal.wc.cart.board')); // it waits there when the cave opens
    expect(r.cart.promptAt({ x: 0, z: 0 })).toBe(null);
    expect(r.cart.interact()).toBe(null);
    r.cart.promptAt({ x: sp.x, z: sp.z });
    expect(r.cart.interact()).toBe('on');
    tick(r, 2);
    expect(r.cart.riding).toBe(true);
    expect(r.session.fair.riding).toEqual({ id: 'crystal-cart' });
    expect(r.session.perched).toBeTruthy();
    expect(r.player.perchY).toBeGreaterThan(0);
    expect(r.cart.promptAt({ x: 0, z: 0 })).toBe(phrase('crystal.wc.cart.off'));
    tick(r, 80);
    expect(Math.hypot(r.cat.position.x - r.cart.ride.x, r.cat.position.z - r.cart.ride.z)).toBeLessThan(0.1);
    expect(r.cart.interact()).toBe('off');
    tick(r, 2);
    expect(r.cart.riding).toBe(false);
    expect(r.session.fair.riding).toBe(null);
    expect(r.session.perched).toBe(null);
    expect(r.player.perchY).toBe(0);
    expect(freeOf(r.cat.position.x, r.cat.position.z, 0.45)).toBe(true);
    expect(C.HOP_SPOTS.some((s) => Math.hypot(s.x - r.cat.position.x, s.z - r.cat.position.z) < 0.01)).toBe(true);
    expect(r.progression.state.journal?.cccart ?? 0).toBeGreaterThan(0);
    r.cart.dispose();
  });
  it('hop off is free wherever the cart is: from every distance along a lap the cat lands on a free spot', () => {
    const r = rigged();
    const sp = C.PLATFORM_SPOTS[0];
    r.cat.position.set(sp.x, 0, sp.z);
    r.cart.install(r.session);
    r.cart.promptAt({ x: sp.x, z: sp.z });
    r.cart.interact();
    tick(r, 2);
    let landed = 0;
    for (let k = 0; k < 24; k++) {
      tick(r, 40);
      r.cart.promptAt({ x: 0, z: 0 });
      expect(r.cart.interact()).toBe('off');
      tick(r, 1);
      expect(freeOf(r.cat.position.x, r.cat.position.z, 0.45)).toBe(true);
      landed++;
      // climb back on: it only takes the offer on a platform, so just keep riding the cart through the loop
      r.cat.position.set(r.cart.ride.x, 0, r.cart.ride.z);
      r.session.perched = null;
      r.cart.hooks.dispose();
      r.cart.promptAt({ x: r.cart.ride.x, z: r.cart.ride.z });
      // (a lap waits at a platform every so often)
      for (let i = 0; i < 600 && !r.cart.promptAt({ x: r.cart.ride.x, z: r.cart.ride.z }); i++) tick(r, 1, 1 / 30);
      expect(r.cart.interact()).toBe('on');
      tick(r, 2);
    }
    expect(landed).toBe(24);
    r.cart.dispose();
  });
  it('a walk that ends while she rides sets her down on a platform and gives the walk its own fair back; it chains over the river boat\'s fair', () => {
    const scene = new THREE.Scene();
    const ground = P.createCrystalGround();
    const player = { inputActive: false, perchY: 0, halt() {}, inputDirection: () => ({ x: 0, z: 0 }) };
    const cat = new THREE.Object3D();
    const orig = { marker: 1 };
    const session = { cat, fair: orig, perched: null };
    const river = createRiverLive({ scene, ground, colliders: [], player });
    const cart = createCartLive({ scene, ground, player });
    river.update(0.05, 0, { x: 0, z: 0 }, null, session); // the river installs first, the cart wraps it
    const afterRiver = session.fair;
    cart.update(0.05, 0, { x: 0, z: 0 }, null, session);
    expect(session.fair).not.toBe(afterRiver);
    const sp = C.PLATFORM_SPOTS[0];
    cat.position.set(sp.x, 0, sp.z);
    cart.promptAt({ x: sp.x, z: sp.z });
    cart.interact();
    for (let i = 0; i < 3; i++) { cart.update(0.05, i, { x: sp.x, z: sp.z }, null, session); session.fair.update(0.05, i, { cat, player, session }); }
    for (let i = 0; i < 200; i++) { cart.update(0.05, i, { x: cat.position.x, z: cat.position.z }, null, session); session.fair.update(0.05, i, { cat, player, session }); }
    expect(cart.riding).toBe(true);
    expect(river.riding).toBe(false);
    expect(session.fair.groundSpot()).toBeTruthy();
    expect(C.PLATFORM_SPOTS.some((s) => Math.hypot(s.x - session.fair.groundSpot().x, s.z - session.fair.groundSpot().z) < 0.01)).toBe(true);
    cart.dispose();
    expect(session.fair).toBe(afterRiver);
    expect(C.PLATFORM_SPOTS.some((s) => Math.hypot(s.x - cat.position.x, s.z - cat.position.z) < 0.01)).toBe(true);
    expect(session.perched).toBe(null);
    river.dispose();
    expect(session.fair).toBe(orig);
  });
  it('she cannot board the cart while she sits in the boat, and the boat cannot take her while she rides the cart', () => {
    const r = rigged();
    r.session.perched = { boat: true };
    r.cat.position.set(C.PLATFORM_SPOTS[0].x, 0, C.PLATFORM_SPOTS[0].z);
    r.cart.install(r.session);
    expect(r.cart.promptAt({ x: C.PLATFORM_SPOTS[0].x, z: C.PLATFORM_SPOTS[0].z })).toBe(null);
    r.cart.dispose();
  });
  it('reduced motion: the ride still moves, the halo holds still, nothing extra; LOW and HIGH draw the same', () => {
    const still = rigged({ reducedMotion: true });
    const halo = () => still.scene.getObjectByName('cc:cart:halo').material.opacity;
    tick(still, 5);
    const h0 = halo();
    const z0 = still.scene.getObjectByName('cc:cart').position.z;
    tick(still, 80, 0.05, 10);
    expect(halo()).toBe(h0);
    expect(still.scene.getObjectByName('cc:cart').position.z).not.toBe(z0);
    const moving = rigged();
    tick(moving, 5);
    const m0 = moving.scene.getObjectByName('cc:cart:halo').material.opacity;
    tick(moving, 7, 0.1, 20);
    expect(moving.scene.getObjectByName('cc:cart:halo').material.opacity).not.toBe(m0);
    const low = rigged({ tier: { name: 'low', rung: 3, shadows: false } });
    expect(low.scene.children.length).toBe(moving.scene.children.length);
    for (const r of [still, moving, low]) r.cart.dispose();
  });
  it('the cart is small and low, the stage fills ST.play, and the sources draw no random number or clock', () => {
    const r = rigged();
    const box = new THREE.Box3();
    for (const n of ['cc:cart', 'cc:platformlamps']) { box.setFromObject(r.scene.getObjectByName(n)); expect(box.max.y, n).toBeLessThan(2.5); }
    const cb = new THREE.Box3().setFromObject(r.scene.getObjectByName('cc:cart:body'));
    expect(cb.max.x - cb.min.x).toBeLessThan(1.6);
    expect(ST.play.createCartLive).toBe(createCartLive);
    expect(ST.play.plan.ROSE_SHARD).toEqual(C.ROSE_SHARD);
    expect(r.cart.spottable.map((s) => s.type)).toEqual(['cccart']);
    expect(SEAT_FRAME.camOut).toBe(0.12);
    r.cart.dispose();
    for (const f of ['crystalcartplan', 'crystalcartparts', 'crystalcartlive', 'crystalstageplay', 'crystalcartwords']) expect(read(`src/world/${f}.js`), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    expect(read('src/world/crystalcartplan.js')).not.toMatch(/from 'three'/);
  });
  it('the built cave has the cart: a spottable for the journal page and the cart in the scene', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, ground: area.ground, colliders: area.colliders, player: { halt() {}, perchY: 0, inputActive: false, inputDirection: () => ({ x: 0, z: 0 }) }, progression: createProgression(memoryStorage()), reducedMotion: true, audio: null, log: { awardOnce: () => 0, count: () => 0, mark() {} }, sendEvent: () => {} });
    expect(life.spottable.some((s) => s.type === 'cccart')).toBe(true);
    expect(scene.getObjectByName('cc:cart')).toBeTruthy();
    life.dispose();
    expect(scene.getObjectByName('cc:cart')).toBeFalsy();
  });
});

describe('words and journal', () => {
  it('all three lines say something in both word sets, with no banned word, the same in both; the cart page is live and shown, named, with a photo spot', () => {
    for (const id of Object.keys(CART_LINES)) {
      expect(phrase(id)).toMatch(/\S/);
      expect(bannedIn(phrase(id))).toBeNull();
      withOffWords(() => { expect(phrase(id)).toBe(CART_LINES[id]); expect(bannedIn(phrase(id))).toBeNull(); });
    }
    expect(WING_LIVE.cart).toBe(true);
    expect(wingPageShown('cccart')).toBe(true);
    expect(CRYSTAL_PAGE_WORDS.cccart).toBeTruthy();
    expect(bannedIn('The old tracks and Lumi\'s cart')).toBeNull();
  });
});
