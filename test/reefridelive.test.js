// The Reef, milestone R12: the two mounts live (Sea Scooter and yellow Diving Saucer). The racks' plan, boarding and leaving through the prompt arbiter, the
// seat record (swim pose, perchY turns the float off, the camera), the air gauge frozen while she rides, never stuck (random sticks, every walk ending while
// riding sets her down on free ground), rides cannot enter the Sealab (or a galleon keepOut), reduced motion and the lower rungs, the words in both sets and
// the source rules. The pure sim is test/reefride.test.js (R11).
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { isWalkableAt, createPlayer } from '../src/player.js';
import { mulberry32 } from '../src/rng.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const P = await import('../src/world/reefplan.js');
const L = await import('../src/world/reeflabplan.js');
const R = await import('../src/world/reefride.js');
const Z = await import('../src/world/reefrideplan.js');
const Q = await import('../src/world/reeffindsplan.js');
const S = await import('../src/world/reefstory.js');
const { LINES } = await import('../src/world/reefridewords.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression } = await import('../src/progression.js');
const { placeFloat } = await import('../src/placephysics.js');
const RP = await import('../src/reefpages.js');
const { ST } = await import('../src/world/reefstages.js');

const read = (f) => readFileSync(f, 'utf8');
const DT = 1 / 30;

describe('the plan (reefrideplan.js)', () => {
  const area = build(new THREE.Scene());
  it('two racks, each on open sand, 3 m clear of every solid, find, pocket, mouse and scenic spot, well off the Sealab, and not on the hatch', () => {
    expect(Z.RACK_IDS).toEqual(['scooter', 'saucer']);
    const solids = area.colliders;
    const marks = [...S.POCKETS.map((p) => [p, 2.5]), ...Q.REEF_SCENICS.map((p) => [p, 2]), ...Q.REEF_COLLECTIBLES.map((p) => [p, 2]), ...Q.REEF_GOLD.map((p) => [p, 3]),
      ...Object.values(Q.REEF_FIND_MARKS).map((p) => [p, 3]), ...P.KEEP_OUT.map((k) => [{ x: k[0], z: k[1] }, k[2]]), [S.MARLO.start, 3], [L.HATCH.outside, 3], [L.HATCH.outside.landing, 2.5]];
    for (const r of Object.values(Z.RACKS)) {
      for (const c of solids) expect(Math.hypot(r.x - c.x, r.z - c.z) - c.r - r.park, `${r.id} vs ${JSON.stringify(c)}`).toBeGreaterThan(1.5);
      for (const [p, d] of marks) expect(Math.hypot(r.x - p.x, r.z - p.z) - r.park, `${r.id} vs ${JSON.stringify(p)}`).toBeGreaterThan(d - 1.5);
      expect(L.LAB_FOOT.minX - r.x).toBeGreaterThan(10);
      expect(R.isFree(r.x, r.z, { colliders: solids, keepOut: Z.rideKeepOut() }, R.RIDES[r.id].radius)).toBe(true);
      expect(Math.hypot(r.x - ST.lab.plan.HATCH.outside.x, r.z - ST.lab.plan.HATCH.outside.z)).toBeLessThan(12); // beside the Boat and the hatch
      expect(isWalkableAt(area, r.x + r.reach - 0.5, r.z)).toBe(true);
    }
    expect(Math.hypot(Z.RACKS.scooter.x - Z.RACKS.saucer.x, Z.RACKS.scooter.z - Z.RACKS.saucer.z)).toBeGreaterThan(R.RIDES.scooter.radius + R.RIDES.saucer.radius + 1);
  });
  it('the sim\'s bounds are the plan\'s, and the keepOut holds the Sealab\'s footprint (and any later one handed in)', () => {
    expect(R.REEF_BOUNDS).toEqual(P.REEF_BOUNDS);
    expect(Z.rideKeepOut()).toEqual([{ ...L.LAB_FOOT }]);
    expect(Z.rideKeepOut([{ minX: 1, maxX: 2, minZ: 3, maxZ: 4 }])).toHaveLength(2);
    expect(Z.REST.scooter).toBeLessThan(R.RIDES.scooter.seatY);
    expect(Z.REST.saucer).toBeLessThan(R.RIDES.saucer.seatY);
  });
  it('the build draws the racks and both mounts (five meshes, no new light)', () => {
    const sc = new THREE.Scene();
    build(sc);
    for (const n of ['ride:racks', 'ride:scooter', 'ride:saucer', 'ride:scooter:prop']) expect(sc.getObjectByName(n), n).toBeTruthy();
    let lights = 0;
    sc.traverse((o) => { if (o.isPointLight) lights++; });
    expect(lights).toBe(1); // the Sealab's one
    let tris = 0;
    for (const n of ['ride:racks', 'ride:scooter', 'ride:saucer']) sc.getObjectByName(n).traverse((o) => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
    expect(tris).toBeLessThan(2210); // (the saucer's polish round: 1,972 measured, +12%)
  });
});

describe('on a walk', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); });
  const fakePlayer = () => ({ perchY: 0, floatY: 0, inputActive: false, kickHeld: false, dir: { x: 0, z: 0 }, halt() {}, clearFloat() {}, inputDirection() { return { x: this.dir.x, z: this.dir.z }; } });
  const make = ({ real = false, extra = {}, at = 'scooter' } = {}) => {
    const sc = new THREE.Scene();
    const placed = build(sc);
    const progression = createProgression(memoryStorage());
    const camera = new THREE.PerspectiveCamera();
    const cat = new THREE.Group();
    const r = Z.RACKS[at];
    cat.position.set(r.x + 1.6, P.reefY(r.x + 1.6, r.z), r.z);
    let player;
    if (real) {
      player = createPlayer(camera, null, { headless: true });
      player.setAvatar(cat, 0.7);
      player.setFloat(placeFloat('reef'));
      player.setGround(placed.ground);
      player.enable();
    } else player = fakePlayer();
    const life = placed.life({ scene: sc, progression, player, reducedMotion: false, visits: 1, doc: null, ...extra });
    const session = { cat, perched: null, perchHold: null, idleTime: 0, fair: { riding: null, marker: 1 } };
    const orig = session.fair;
    const m = { life, scene: sc, player, cat, session, placed, camera, progression, orig, t: 0, real };
    m.tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        m.t += DT;
        if (real) player.update(DT, [], P.REEF_BOUNDS, []);
        life.update(DT, m.t, cat.position, camera, session);
        session.fair.update(DT, m.t, { cat, player, session });
        session.fair.late(DT, m.t, { cat, player, session });
      }
    };
    m.board = () => { const q = life.ride.sims[at]; cat.position.set(q.x + 1.5, P.reefY(q.x + 1.5, q.z), q.z); m.tick(2); expect(life.promptAt(cat.position)).toBe(phrase(`reef.ride.${at}`)); life.interact(); m.tick(2); };
    m.hopOff = () => { expect(life.promptAt(cat.position)).toBe(phrase('reef.ride.off')); life.interact(); m.tick(2); };
    made.push(m);
    return m;
  };
  const said = (v) => (typeof v === 'string' ? v : '');
  const free = (m, x, z) => {
    const env = { colliders: m.placed.colliders.filter((c) => !c.ride), keepOut: Z.rideKeepOut() };
    return R.isFree(x, z, env, 0.3, 0.3) && isWalkableAt(m.placed, x, z);
  };

  it('beside a rack she is offered "hop on" (the story\'s offers come after it); far from both she is offered nothing from the mounts', () => {
    const m = make();
    m.tick(2);
    expect(m.life.promptAt(m.cat.position)).toBe('Hop on the Sea Scooter');
    m.cat.position.set(0, P.reefY(0, 20), 20);
    expect(said(m.life.promptAt(m.cat.position))).not.toMatch(/Hop on|Climb into/);
    const s = make({ at: 'saucer' });
    s.tick(2);
    expect(s.life.promptAt(s.cat.position)).toBe('Climb into the Diving Saucer');
  });

  it('the saucer\'s landing gear: down while it is parked, telescopes up into the hull within a second of lift-off, comes down again on landing (also under reduced motion)', () => {
    for (const reducedMotion of [false, true]) {
      const m = make({ at: 'saucer', extra: { reducedMotion } });
      const legs = m.scene.getObjectByName('ride:saucer:legs');
      expect(legs).toBeTruthy();
      expect(legs.children).toHaveLength(1); // one mesh for all three legs
      m.tick(2);
      expect(legs.scale.y).toBe(1);
      m.board();
      m.tick(30); // a second
      expect(legs.scale.y).toBeLessThan(0.1);
      m.hopOff();
      m.tick(30);
      expect(legs.scale.y).toBeGreaterThan(0.95);
      // a short smooth motion, not a jump: partway through, the gear is between the two
      m.board();
      m.tick(3);
      expect(legs.scale.y).toBeLessThan(1);
      expect(legs.scale.y).toBeGreaterThan(0.1);
    }
  });

  it('hop on: the walk\'s seat record (sits, swims), the seat height as perchY, the co-walk seat id, the journal count once, the first soft line; hop off puts it all back', () => {
    for (const at of ['scooter', 'saucer']) {
      const m = make({ at });
      m.board();
      expect(m.life.ride.riding).toBe(true);
      expect(m.session.perched).toBeTruthy();
      expect(m.session.perched.swim).toBe(true);
      expect(m.session.perched.pose).toBe('requestPet');
      expect(m.session.perchHold).toBe(m.session.perched);
      expect(m.player.perchY).toBeGreaterThan(0.3);
      expect(m.session.fair.riding).toEqual({ id: `reef-${at}`, rideId: 'reef' });
      expect(m.session.fair.marker).toBe(1); // the walk's own fair is copied, not replaced
      expect(m.progression.state.journal[`rf${at}`]).toBe(1);
      m.hopOff();
      expect(m.session.perched).toBeNull();
      expect(m.session.perchHold).toBeNull();
      expect(m.player.perchY).toBe(0);
      expect(m.session.fair.riding).toBeNull();
      expect(m.progression.state.journal[`rf${at}`]).toBe(1);
      m.board(); // she can hop on again from beside it
      m.hopOff();
      expect(m.progression.state.journal[`rf${at}`]).toBe(1); // counted once a walk
    }
  });

  it('the stick steers, the mount rises while the kick is held and settles when it is let go; the cat is carried on the seat', () => {
    const m = make();
    m.board();
    const sim = m.life.ride.sims.scooter;
    const y0 = sim.y;
    m.player.inputActive = true; m.player.dir = { x: 0, z: -1 };
    m.tick(60);
    expect(Math.hypot(sim.x - Z.RACKS.scooter.x, sim.z - Z.RACKS.scooter.z)).toBeGreaterThan(3);
    expect(m.cat.position.x).toBeCloseTo(sim.x, 0);
    m.player.kickHeld = true;
    m.tick(60);
    expect(sim.hold).toBeGreaterThan(R.RIDES.scooter.seatY + 0.5);
    expect(sim.y).toBeGreaterThan(y0);
    expect(m.cat.position.y).toBeCloseTo(sim.y + R.RIDES.scooter.seatsAt[0].y, 1);
    m.player.kickHeld = false;
    m.tick(180);
    expect(sim.hold).toBeCloseTo(R.RIDES.scooter.seatY, 1);
  });

  it('with the real player: the float is off while she rides (perchY), floatY stays 0, and the float is back after hop off', () => {
    const m = make({ real: true });
    m.tick(2);
    m.board();
    expect(m.player.perchY).toBeGreaterThan(0.3);
    m.tick(30);
    expect(m.player.floatY).toBe(0);
    m.hopOff();
    expect(m.player.perchY).toBe(0);
    expect(m.player.canFloat).toBe(true);
  });

  for (const kind of ['scooter', 'saucer']) {
    it(`${kind}: random sticks and kicks for a minute never leave the mount in a collider, the Sealab's footprint or the bounds, and it is never stuck`, () => {
      const m = make({ at: kind });
      m.board();
      const sim = m.life.ride.sims[kind];
      const rnd = mulberry32(kind === 'scooter' ? 11 : 12);
      let dir = { x: 0, z: -1 };
      let moved = 0;
      let last = { x: sim.x, z: sim.z };
      for (let i = 0; i < 30 * 60; i++) {
        if (i % 45 === 0) dir = { x: rnd() * 2 - 1, z: rnd() * 2 - 1 };
        m.player.inputActive = rnd() > 0.1;
        m.player.dir = dir;
        m.player.kickHeld = rnd() > 0.7;
        m.tick(1);
        const env = { colliders: m.placed.colliders.filter((c) => !c.ride), keepOut: Z.rideKeepOut() };
        if (!R.isFree(sim.x, sim.z, env, R.RIDES[kind].radius, 0.95)) throw new Error(`${kind} at ${sim.x},${sim.z} (step ${i})`);
        expect(sim.x < L.LAB_FOOT.minX || sim.x > L.LAB_FOOT.maxX || sim.z < L.LAB_FOOT.minZ || sim.z > L.LAB_FOOT.maxZ).toBe(true);
        if (i % 30 === 29) { moved += Math.hypot(sim.x - last.x, sim.z - last.z); last = { x: sim.x, z: sim.z }; }
        // hop off at random moments (every few seconds): always onto free ground, and on again
        if (i % 197 === 196) {
          m.player.inputActive = false;
          m.hopOff();
          expect(free(m, m.cat.position.x, m.cat.position.z), `hop-off ${i} at ${m.cat.position.x},${m.cat.position.z}`).toBe(true);
          expect(m.cat.position.y).toBe(P.reefY(m.cat.position.x, m.cat.position.z));
          // back on: stand beside the mount
          m.cat.position.set(sim.x + R.RIDES[kind].radius * 0.5 + 1.2, P.reefY(sim.x + 2, sim.z), sim.z);
          m.tick(2);
          if (m.life.promptAt(m.cat.position)) { m.life.interact(); m.tick(2); }
          if (!m.life.ride.riding) { m.cat.position.set(sim.x + 1, P.reefY(sim.x, sim.z), sim.z); m.tick(1); m.life.promptAt(m.cat.position); m.life.interact(); m.tick(2); }
          expect(m.life.ride.riding).toBe(true);
        }
      }
      expect(moved).toBeGreaterThan(25); // it travelled: never stuck
    });
  }

  it('driving straight at the Sealab stops at its footprint, and a galleon keepOut handed in is kept out of too', () => {
    const m = make({ at: 'saucer' });
    m.board();
    const sim = m.life.ride.sims.saucer;
    m.player.inputActive = true; m.player.dir = { x: 1, z: 0 };
    m.tick(30 * 80);
    expect(sim.x).toBeLessThanOrEqual(L.LAB_FOOT.minX - R.RIDES.saucer.radius + 0.01);
    expect(sim.x).toBeGreaterThan(L.LAB_FOOT.minX - 40);
    const g = { minX: -26, maxX: -22, minZ: -34, maxZ: -20 };
    const wreck = ST.wreck;
    ST.wreck = Object.freeze({ rideKeepOut: () => [g] });
    try {
      const k = make({ at: 'scooter' });
      k.board();
      const s2 = k.life.ride.sims.scooter;
      k.player.inputActive = true; k.player.dir = { x: 0.3, z: 1 };
      k.tick(30 * 30);
      for (let i = 0; i < 30 * 20; i++) { k.player.dir = { x: 1, z: 0.6 }; k.tick(1); const inside = s2.x > g.minX && s2.x < g.maxX && s2.z > g.minZ && s2.z < g.maxZ; if (inside) throw new Error('entered the galleon\'s keepOut'); }
    } finally { ST.wreck = wreck; }
  }, 120000); // heavy sim; the CI shards run it near the 30 s default under load

  it('a walk that ends while she rides sets her on free ground, the gauge running, the walk\'s own fair back, the parked mounts gone from the list', () => {
    for (const at of ['scooter', 'saucer']) {
      const m = make({ at });
      m.board();
      const sim = m.life.ride.sims[at];
      m.player.inputActive = true; m.player.dir = { x: -1, z: 0.4 };
      m.tick(30 * 20);
      const spot = m.session.fair.groundSpot();
      expect(spot).toBeTruthy();
      expect(free(m, spot.x, spot.z)).toBe(true);
      const n = m.placed.colliders.length;
      m.life.dispose();
      made.splice(made.indexOf(m), 1);
      expect(m.session.fair).toBe(m.orig);
      expect(m.session.perched).toBeNull();
      expect(m.player.perchY).toBe(0);
      expect(free(m, m.cat.position.x, m.cat.position.z), `${at} ${m.cat.position.x},${m.cat.position.z}`).toBe(true);
      expect(m.placed.colliders.some((c) => c.ride)).toBe(false);
      expect(m.placed.colliders.length).toBeLessThan(n);
      expect(sim.speed).toBe(0);
    }
  });

  it('parked, each mount is a small collider a cat walks round; while she rides it, it is none', () => {
    const m = make();
    m.tick(1);
    expect(m.placed.colliders.filter((c) => c.ride).map((c) => c.ride).sort()).toEqual(['saucer', 'scooter']);
    m.board();
    expect(m.placed.colliders.filter((c) => c.ride).map((c) => c.ride)).toEqual(['saucer']);
    m.hopOff();
    expect(m.placed.colliders.filter((c) => c.ride)).toHaveLength(2);
  });

  it('reduced motion freezes the propeller, the bob and the trail; the lower rungs draw a smaller trail and the lite rung none', () => {
    const spin = (extra) => {
      const m = make(extra);
      m.board();
      m.player.inputActive = true; m.player.dir = { x: 0, z: -1 };
      m.tick(60);
      const prop = m.scene.getObjectByName('ride:scooter:prop');
      let bubbles = 0;
      m.scene.traverse((o) => { if (o.name === 'ride:bubble') bubbles++; });
      return { rot: prop.rotation.z, bubbles, body: m.scene.getObjectByName('ride:scooter') };
    };
    const rm = spin({ extra: { reducedMotion: true } });
    expect(rm.rot).toBe(0);
    expect(rm.bubbles).toBe(0);
    const hi = spin({});
    expect(hi.rot).not.toBe(0);
    expect(hi.bubbles).toBe(16);
    expect(spin({ extra: { tier: { name: 'low', rung: 3, shadows: true } } }).bubbles).toBe(8);
    expect(spin({ extra: { tier: { name: 'lite', rung: 4, shadows: false } } }).bubbles).toBe(0);
  });

  it('is deterministic: the same sticks give the same ride twice, and the life draws no random number', () => {
    const run = () => {
      const m = make();
      m.board();
      const rnd = mulberry32(5);
      for (let i = 0; i < 600; i++) { if (i % 40 === 0) m.player.dir = { x: rnd() * 2 - 1, z: rnd() * 2 - 1 }; m.player.inputActive = true; m.player.kickHeld = i % 90 < 30; m.tick(1); }
      const s = m.life.ride.sims.scooter;
      return [s.x, s.z, s.yaw, s.y, m.cat.position.y];
    };
    expect(run()).toEqual(run());
  });
});

describe('the words, the journal and the source rules', () => {
  const BAD = /\b(dark|lost forever|trapped|stuck|collapse|cave-in|scary|Zissou|Belafonte|Aquatic|cap|beanie)\b/i;
  it('the five lines are in the phrase table, short, kind and the same plain base in both word sets', () => {
    expect(Object.keys(LINES)).toEqual(['reef.ride.scooter', 'reef.ride.saucer', 'reef.ride.off', 'reef.ride.tip.scooter', 'reef.ride.tip.saucer']);
    for (const [id, line] of Object.entries(LINES)) {
      expect(phrase(id), id).toBe(line);
      expect(line.length).toBeLessThanOrEqual(60);
      expect(line).not.toMatch(BAD);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(line); });
    }
  });
  it('both pages are live, with a kind hint and name', () => {
    expect(RP.WING_LIVE.scooter && RP.WING_LIVE.saucer).toBe(true);
    for (const id of ['rfscooter', 'rfsaucer']) { expect(RP.REEF_PAGE_WORDS[id].hint()).not.toBe(''); expect(RP.REEF_PAGE_WORDS[id].hint()).not.toMatch(BAD); expect(RP.REEF_PAGE_WORDS[id].name()).not.toMatch(BAD); }
  });
  it('no banned word or film name in any ride file (comments aside); no random number, clock, light or save access; the ride chunk imports only its own files, the phrase table and the lab plan', () => {
    for (const f of globSync('src/world/reefride*.js')) {
      const src = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/Zissou|Belafonte|Aquatic|beanie|\bcap\b|lost forever|trapped|scary|cave-in|collapse/i);
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|PointLight|localStorage/);
      for (const [, spec] of read(f).matchAll(/^import .*?from '(.+?)';/gm)) expect(spec, `${f} imports ${spec}`).toMatch(/^(\.\/reef(ride|rideparts|rideplan|ridelive|ridewords)\.js|\.\.\/clanphrases\.js|\.\/reeflabplan\.js|\.\/reefstages\.js)$/);
    }
    expect(read('src/world/reefstageride.js')).toMatch(/import \{ ST \} from '\.\/reefstages\.js'/);
  });
  it('the only line in avatar.js that reads the seat\'s swim flag is the shared one, and nothing outside the Reef sets it', () => {
    expect(read('src/game/avatar.js')).toMatch(/floating \|\|= !!s\.perched\?\.swim;/);
    for (const f of globSync('src/**/*.js')) if (!/reef/.test(f)) expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/swim:\s*true/);
  });
});
