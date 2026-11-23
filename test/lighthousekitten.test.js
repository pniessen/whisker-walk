import { describe, it, expect, afterEach } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const L = await import('../src/world/lighthouseplan.js');
const C = await import('../src/world/lighthousecats.js');
const { bus } = await import('../src/events.js');
const { lightRig } = await import('./helpers/lighthouselife.js');
const { route } = await import('./helpers/lighthousepath.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { inWater } = await import('../src/world/water.js');
const { phrase } = await import('../src/clanphrases.js');
const { AWARDS } = await import('../src/discoveries.js');

// Lighthouse Point, milestone 3: the kitten job. The keeper's cat at the cottage door, her kitten in one of three
// hiding places, the paw prints, the follow and the way home. No clock, no failure, per device, nothing sent.

const area = L.lighthouseArea();
const SPOTS = L.KITTEN_SPOTS;
const visitsFor = (i) => [...Array(200).keys()].find((v) => C.kittenSpotIndex(undefined, v) === i);
let r;
afterEach(() => { r?.dispose(); r = null; });

describe('where the kitten hides', () => {
  it('three places, picked from the room seed (two screens agree) or, alone, from how many times she has walked here', () => {
    expect(SPOTS.map((s) => s.id)).toEqual(['pool', 'cave', 'boat']);
    for (let seed = 0; seed < 50; seed++) expect(C.kittenSpotIndex(seed * 7919 + 13)).toBe(C.kittenSpotIndex(seed * 7919 + 13));
    const roomPicks = new Set(Array.from({ length: 200 }, (_, i) => C.kittenSpotIndex(i * 104729 + 1)));
    expect(roomPicks).toEqual(new Set([0, 1, 2]));
    const soloPicks = Array.from({ length: 60 }, (_, v) => C.kittenSpotIndex(undefined, v));
    expect(new Set(soloPicks)).toEqual(new Set([0, 1, 2]));
    // a different place on neighbouring walks more often than not
    let changes = 0;
    for (let v = 1; v < soloPicks.length; v++) if (soloPicks[v] !== soloPicks[v - 1]) changes++;
    expect(changes).toBeGreaterThan(20);
    // a room: both screens take the same index from the same seed, whatever each has walked
    expect(C.kittenSpotIndex(424242, 3)).toBe(C.kittenSpotIndex(424242, 77));
    // a seed that is no number (never from walk.js) still gives a place
    for (const bad of ['x', NaN, {}, Infinity]) expect([0, 1, 2]).toContain(C.kittenSpotIndex(bad));
  });
  it('the salt is its own: none of the walk\'s, none of the beam\'s', async () => {
    const { LIGHT_BEAM_SALT } = await import('../src/world/lighthouselife.js');
    expect(C.LIGHT_KITTEN_SALT).not.toBe(LIGHT_BEAM_SALT);
    expect(C.LIGHT_KITTEN_SALT).toBeGreaterThan(0x100000);
  });
  it('each hiding place is dry open ground she can reach from the spawn on foot (no Long Leap, no Spring Paws), and the way on to the cottage door too', () => {
    const flood = floodTraversal(area);
    const reach = flood.reachable(flood.regionAt(area.spawn.x, area.spawn.z));
    for (const s of SPOTS) {
      expect(inWater(area.waters, s.x, s.z), s.id).toBe(false);
      expect(area.colliders.every((c) => Math.hypot(s.x - c.x, s.z - c.z) >= c.r + 0.35), s.id).toBe(true);
      expect(reach.has(flood.regionAt(s.x, s.z)), s.id).toBe(true);
      expect(route(area, s, L.KEEPER_DOOR), `${s.id} to the door`).not.toBeNull();
      expect(route(area, area.spawn, s), `spawn to ${s.id}`).not.toBeNull();
    }
    expect(reach.has(flood.regionAt(L.KEEPER_DOOR.x, L.KEEPER_DOOR.z))).toBe(true);
  });
  it('none is beside a find, a golden mouse, a collectible or a scenic (2 m), and none is in a find\'s zone', () => {
    const others = [...L.LIGHTHOUSE_GOLD, ...L.LIGHTHOUSE_COLLECTIBLES, ...L.LIGHTHOUSE_SCENICS];
    for (const s of SPOTS) {
      for (const o of others) expect(Math.hypot(s.x - o.x, s.z - o.z), `${s.id} / ${o.id}`).toBeGreaterThan(2);
      for (const zs of Object.values(L.LIGHTHOUSE_FIND_ZONES)) for (const z of zs) {
        const d = Math.hypot(s.x - z.x, s.z - z.z);
        if (z.meow || z.belled) continue; // the echo's zone: a kitten sitting there is not a find
        expect(d > z.r + 1 || Math.abs(z.y - area.ground.y(s.x, s.z)) > z.dy, `${s.id} in a find's zone`).toBe(true);
      }
    }
  });
});

describe('the paw prints', () => {
  it('lead to the kitten: on its level, out of water and walls, ending short of it, never more than 16 m long', () => {
    for (const s of SPOTS) {
      const pts = C.trailPrints(s, { ground: area.ground, colliders: area.colliders, waters: area.waters });
      expect(pts.length, s.id).toBeGreaterThan(4);
      const level = area.ground.y(s.x, s.z);
      for (const p of pts) {
        expect(inWater(area.waters, p.x, p.z), s.id).toBe(false);
        expect(Math.abs(area.ground.y(p.x, p.z) - level), s.id).toBeLessThan(0.11);
        expect(area.colliders.every((c) => Math.hypot(p.x - c.x, p.z - c.z) >= c.r + 0.15), s.id).toBe(true);
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        expect(d, s.id).toBeGreaterThan(2);
        expect(d, s.id).toBeLessThan(17);
      }
    }
  });
  it('are one mesh of flat discs, gone once she is found', () => {
    r = lightRig({ visits: visitsFor(0) });
    const m = r.life.cats.meshes.trail;
    expect(m).toBeTruthy();
    expect(m.parent).toBe(r.scene);
    expect(m.visible).toBe(true);
    const s = r.life.cats.spot;
    r.step(0.5, { x: s.x + 1.5, y: 0, z: s.z });
    expect(r.life.cats.interact()).toBe('found');
    expect(m.visible).toBe(false);
  });
});

describe('the waiting kitten', () => {
  it('waits where she hid, never runs off and never fails, however long (no state has a clock)', () => {
    r = lightRig({ visits: visitsFor(1) });
    const k = r.life.cats.meshes.kitten;
    const s = r.life.cats.spot;
    const start = { x: k.position.x, z: k.position.z };
    r.step(1, { x: 14, y: 0, z: 36 });
    for (let i = 0; i < 20; i++) r.step(30, { x: 14, y: 0, z: 36 }); // ten minutes with her nowhere near
    expect(r.life.cats.state).toBe('hidden');
    expect({ x: k.position.x, z: k.position.z }).toEqual(start);
    expect(start).toEqual({ x: s.x, z: s.z });
    expect(r.events.filter((e) => e.type === 'lighthousejob')).toHaveLength(0);
    // and a cat standing beside her for ten minutes does not make her go away either
    r.step(1, { x: s.x + 1.8, y: 0, z: s.z });
    for (let i = 0; i < 20; i++) r.step(30);
    expect(r.life.cats.state).toBe('hidden');
    expect(r.life.cats.promptAt(r.at)).toBe('E — say hello to the kitten');
  });
  it('mews when she is within 14 m (a sound every 6 s, one line once) and is silent beyond it', () => {
    const calls = [];
    const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => { calls.push('osc'); return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (g) => g, start() {}, stop() {}, disconnect() {} }; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }) }), getMaster: () => ({}) };
    r = lightRig({ visits: visitsFor(2), audio });
    const s = r.life.cats.spot;
    r.step(20, { x: s.x + C.HEAR_R + 3, y: 0, z: s.z });
    expect(calls).toEqual([]);
    expect(r.events.filter((e) => e.key === 'lighthouse-kitten-hear')).toHaveLength(0);
    r.step(0.2, { x: s.x + C.HEAR_R - 2, y: 0, z: s.z });
    expect(calls).toHaveLength(1);
    expect(r.events.filter((e) => e.key === 'lighthouse-kitten-hear')).toHaveLength(1);
    expect(r.events.find((e) => e.key === 'lighthouse-kitten-hear')).toMatchObject({ type: 'lighthousenote', label: 'Mew! Mew! Where is that coming from?', points: 0 });
    r.step(C.MEW_EVERY * 3);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(r.events.filter((e) => e.key === 'lighthouse-kitten-hear')).toHaveLength(1);
  });
  it('the keeper\'s cat paces on the porch and sits looking at the shore, the same at every time (a loop of walk seconds); near her, one line says her kitten is missing', () => {
    r = lightRig();
    const m = r.life.cats.meshes.mother;
    const seen = [];
    for (let t = 0; t < C.PACE.cycle * 2; t += 0.5) { r.step(0.5, { x: -20, y: 6, z: -7 }); seen.push([m.position.x, m.position.z]); }
    for (const [x, z] of seen) {
      expect(x).toBeGreaterThan(L.KEEPER_PACE.a.x - 0.01); expect(x).toBeLessThan(L.KEEPER_PACE.b.x + 0.01);
      expect(z).toBeGreaterThanOrEqual(Math.min(L.KEEPER_PACE.a.z, L.KEEPER_PACE.b.z) - 0.01);
      expect(z).toBeLessThanOrEqual(Math.max(L.KEEPER_PACE.a.z, L.KEEPER_PACE.b.z) + 0.01);
      expect(area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r), `porch ${x}, ${z}`).toBe(true);
    }
    const half = seen.length / 2;
    seen.slice(0, half).forEach(([x, z], i) => { expect(x).toBeCloseTo(seen[half + i][0], 6); expect(z).toBeCloseTo(seen[half + i][1], 6); }); // a loop, with no draw in it
    expect(new Set(seen.map(([, z]) => z)).size).toBeGreaterThan(3); // she does walk
    // the offer: one line, once, with the set's word for a house cat
    expect(r.events.filter((e) => e.key === 'lighthouse-kitten-offer')).toHaveLength(0);
    r.step(0.2, { x: L.KEEPER_DOOR.x + 4, y: 6, z: L.KEEPER_DOOR.z });
    r.step(5);
    const offers = r.events.filter((e) => e.key === 'lighthouse-kitten-offer');
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ type: 'lighthousenote', label: 'The cottage kittypet keeps looking down at the shore. Her kitten is missing! 🐾', points: 0 });
    expect(withOffWords(() => phrase('lighthouse.kitten.offer', 'house cat'))).toBe('The cottage house cat keeps looking down at the shore. Her kitten is missing! 🐾');
  });
  it('the cats are drawn only within 48 m of her', () => {
    r = lightRig({ visits: visitsFor(1) });
    r.step(0.5, { x: 14, y: 0, z: 36 });
    expect(r.life.cats.meshes.mother.visible).toBe(false); // 55 m from the cottage
    expect(r.life.cats.meshes.kitten.visible).toBe(false); // 60 m from the cave
    r.step(0.5, { x: -12, y: 0, z: -19 });
    expect(r.life.cats.meshes.kitten.visible).toBe(true);
  });
});

describe('finding the kitten and taking her home', () => {
  // The cat walks the real route at 2.2 m/s with the kitten at her heels; `follow` steps both.
  function walkRoute(rig, pts, { speed = 2.2, then = 0 } = {}) {
    let i = 0;
    let acc = 0;
    const pos = { ...pts[0] };
    const total = pts.length;
    for (let frame = 0; frame < 30 * 600 && i < total - 1; frame++) {
      const a = pts[i]; const b = pts[i + 1];
      const d = Math.hypot(b.x - a.x, b.z - a.z) || 1e-9;
      acc += (speed / 30) / d;
      if (acc >= 1) { acc = 0; i++; }
      const k = Math.min(1, acc);
      const y = a.y + (b.y - a.y) * k;
      pos.x = a.x + (b.x - a.x) * k; pos.z = a.z + (b.z - a.z) * k; pos.y = y;
      rig.step(1 / 30, pos);
    }
    if (then) rig.step(then);
    return pos;
  }

  for (const idx of [0, 1, 2]) {
    it(`hiding place ${SPOTS[idx].id}: she is offered the prompt within 2.2 m, E brings the kitten, and she follows over the real ground to the cottage door, where the job pays 25 once`, () => {
      r = lightRig({ visits: visitsFor(idx) });
      const s = r.life.cats.spot;
      expect(s.id).toBe(SPOTS[idx].id);
      // the walk from the spawn to the kitten
      const there = route(area, area.spawn, { x: s.x + 1.2, z: s.z });
      expect(there).not.toBeNull();
      walkRoute(r, there);
      expect(r.life.cats.promptAt(r.at)).toBe('E — say hello to the kitten');
      expect(r.life.promptAt(r.at)).toBe('E — say hello to the kitten'); // what game/interactions.js asks the life
      r.step(0.1, { x: s.x + 2.6, y: r.at.y, z: s.z });
      expect(r.life.promptAt(r.at)).toBeNull(); // 2.6 m: too far
      r.step(0.1, { x: s.x + 1.2, y: r.at.y, z: s.z });
      r.life.interact();
      expect(r.life.cats.state).toBe('following');
      expect(r.events.some((e) => e.key === 'lighthouse-kitten-found' && e.label === 'There you are, little one! Stay close. 💕')).toBe(true);
      expect(r.life.promptAt(r.at)).toBeNull(); // no second offer
      // home, by the real route, the kitten behind her all the way
      const home = route(area, { x: s.x + 1.2, z: s.z }, L.KEEPER_DOOR);
      expect(home).not.toBeNull();
      const k = r.life.cats.meshes.kitten;
      let worst = 0;
      const stepAndMeasure = (pts) => {
        let i = 0; let acc = 0; const pos = { ...pts[0] };
        for (let frame = 0; frame < 30 * 900 && i < pts.length - 1 && r.life.cats.state === 'following'; frame++) {
          const a = pts[i]; const b = pts[i + 1];
          const d = Math.hypot(b.x - a.x, b.z - a.z) || 1e-9;
          acc += (2.2 / 30) / d;
          if (acc >= 1) { acc = 0; i++; }
          pos.x = a.x + (b.x - a.x) * Math.min(1, acc); pos.z = a.z + (b.z - a.z) * Math.min(1, acc); pos.y = a.y + (b.y - a.y) * Math.min(1, acc);
          r.step(1 / 30, pos);
          worst = Math.max(worst, Math.hypot(k.position.x - pos.x, k.position.z - pos.z));
          // never in water, never in a wall, always on the ground under her
          expect(inWater(area.waters, k.position.x, k.position.z)).toBe(false);
          expect(Math.abs(k.position.y - area.ground.y(k.position.x, k.position.z))).toBeLessThan(0.05);
        }
        return pos;
      };
      stepAndMeasure(home);
      expect(r.life.cats.state === 'following' || r.life.cats.state === 'tumbling' || r.life.cats.state === 'home').toBe(true);
      expect(worst).toBeLessThan(9); // she keeps up, a few paces behind
      r.step(8, r.at); // the cat waits at the door
      expect(r.life.cats.state).toBe('home');
      expect(k.visible).toBe(false);
      const jobs = r.events.filter((e) => e.type === 'lighthousejob');
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ key: C.KITTEN_KEY, label: 'Home safe! The kitten tumbles in and Mum purrs. 😻', points: AWARDS.lighthousejob, repeat: false });
      expect(AWARDS.lighthousejob).toBe(25);
      expect(r.progression.state.journal.lhjobkitten).toBe(1);
      r.step(60);
      expect(r.events.filter((e) => e.type === 'lighthousejob')).toHaveLength(1);
      expect(r.life.promptAt(r.at)).toBeNull();
    }, 90000);
  }

  it('the kitten\'s follow stops at the cottage door: she goes no further in than the porch\'s door, and the cat\'s walk is not needed to finish', () => {
    r = lightRig({ visits: visitsFor(2) });
    const s = r.life.cats.spot;
    r.step(0.5, { x: s.x + 1.2, y: 0, z: s.z });
    r.life.interact();
    const home = route(area, { x: s.x + 1.2, z: s.z }, L.KEEPER_DOOR);
    for (const p of home) r.step(0.4, p);
    r.step(20, home.at(-1));
    const k = r.life.cats.meshes.kitten;
    expect(r.life.cats.state).toBe('home');
    // wherever she ended, she is not inside the cottage's walls, and she is within a stride of the door
    expect(area.colliders.filter((c) => c.r > 2).every((c) => Math.hypot(k.position.x - c.x, k.position.z - c.z) >= c.r - 0.5)).toBe(true);
    expect(Math.hypot(k.position.x - L.KEEPER_DOOR.x, k.position.z - L.KEEPER_DOOR.z)).toBeLessThan(C.HOME_R + 1);
  });

  it('the stair does not lose her: while the cat is off the ground or on another level she waits at its foot, and follows again when the cat comes down', () => {
    r = lightRig({ visits: visitsFor(0) });
    const k = r.life.cats.meshes.kitten;
    const s = r.life.cats.spot;
    r.step(0.5, { x: s.x + 1.2, y: 0, z: s.z });
    r.life.interact();
    walkRoute(r, route(area, { x: s.x + 1.2, z: s.z }, { x: -24, z: -8 })); // up the cliff path to the plateau
    r.step(6, r.at);
    expect(Math.hypot(k.position.x + 24, k.position.z + 8)).toBeLessThan(C.FOLLOW_GAP + 0.6);
    expect(Math.abs(k.position.y - 6)).toBeLessThan(0.05);
    // up the stair (her paws over the plateau): no new footprints, so she waits near the foot
    const foot = { x: k.position.x, z: k.position.z };
    walkRoute(r, route(area, { x: -24, z: -8 }, { x: L.LANDINGS[0].x, z: L.LANDINGS[0].z }));
    for (const [y, p] of [[6, L.LANDINGS[0]], [8.5, L.LANDINGS[1]], [11, L.LANDINGS[2]], [13.5, L.LANDINGS[3]]]) r.step(2, { x: p.x, y, z: p.z });
    r.step(30, { x: L.LANDINGS[3].x, y: 13.5, z: L.LANDINGS[3].z });
    expect(Math.hypot(k.position.x - L.LANDINGS[0].x, k.position.z - L.LANDINGS[0].z)).toBeLessThan(C.FOLLOW_GAP + 1.2); // at the foot, not on the stair
    void foot;
    expect(Math.abs(k.position.y - 6)).toBeLessThan(0.05);
    expect(r.life.cats.state).toBe('following');
    // and when she comes down she follows again
    r.step(0.5, { x: L.LANDINGS[0].x, y: 6, z: L.LANDINGS[0].z });
    r.step(8, { x: -24, y: 6, z: -8 });
    expect(Math.hypot(k.position.x + 24, k.position.z + 8)).toBeLessThan(C.FOLLOW_GAP + 0.5);
  });

  it('a walk picked up again after the job finds the kitten home, no offer, no prompt, nothing paid again', () => {
    r = lightRig({ visits: visitsFor(0), restore: [[C.KITTEN_KEY, 1]] });
    const s = r.life.cats.spot;
    expect(r.life.cats.state).toBe('home');
    expect(r.life.cats.meshes.kitten.visible).toBe(false);
    expect(r.life.cats.meshes.trail).toBeNull();
    r.step(0.5, { x: s.x + 1, y: 0, z: s.z });
    expect(r.life.promptAt(r.at)).toBeNull();
    r.step(0.5, { x: L.KEEPER_DOOR.x + 2, y: 6, z: L.KEEPER_DOOR.z });
    r.step(10);
    expect(r.events).toEqual([]);
    expect(r.progression.state.points).toBe(0);
  });

  it('the next walk is a new job (once a walk), and each of two players is paid on her own save', () => {
    const a = lightRig({ visits: visitsFor(0) });
    const b = lightRig({ visits: visitsFor(0) });
    for (const rg of [a, b]) {
      const s = rg.life.cats.spot;
      rg.step(0.5, { x: s.x + 1.2, y: 0, z: s.z });
      rg.life.interact();
      const home = route(area, { x: s.x + 1.2, z: s.z }, L.KEEPER_DOOR);
      for (const p of home) rg.step(0.45, p);
      rg.step(15, home.at(-1));
      expect(rg.life.cats.state).toBe('home');
    }
    expect(a.progression.state.points).toBe(25);
    expect(b.progression.state.points).toBe(25);
    a.dispose(); b.dispose();
  }, 90000);

  it('nothing is sent to a partner: no network event is made by the job, whatever the session offers', () => {
    const sent = [];
    r = lightRig({ visits: visitsFor(0) });
    const net = { sendEvent: (e) => sent.push(e) };
    const s = r.life.cats.spot;
    const session = { tippables: r.tippables, net };
    for (let i = 0; i < 30 * 3; i++) r.life.update(1 / 30, 0, { x: s.x + 1.2, y: 0, z: s.z }, r.camera, session);
    r.life.interact();
    for (let i = 0; i < 30 * 3; i++) r.life.update(1 / 30, 0, { x: s.x + 1.2, y: 0, z: s.z }, r.camera, session);
    expect(sent).toEqual([]);
    void bus;
  });
});
