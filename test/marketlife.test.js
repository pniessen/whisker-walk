import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// =============================================================================
// The Market's life finds the six (Market step 3, Task 6): a built square, a
// stand-in for the walk's session (what the life reads: rest, perched, the
// player's speed, the cat's heading, the tippables, the knockables, the
// remotes) and the walk's own critters (critters.js, the square's spawns).
// Each find is noted on her own save the first time it is found on a walk;
// the bicycle rocks and rings its bell when she lands in its basket.
// =============================================================================

const { build } = await import('../src/world/market.js');
const { MUSICIAN, BICYCLE_BASKET, PIGEON_PATCH, MARKET_REGISTRATION } = await import('../src/world/marketplan.js');
const { MARKET_FIND_ANCHORS: A } = await import('../src/world/marketfinds.js');
const { BASKET_ROCK } = await import('../src/world/marketlife.js');
const { BELL } = await import('../src/world/marketsound.js');
const { createTippables } = await import('../src/tippables.js');
const { createKnockables } = await import('../src/knockables.js');
const { createCritters } = await import('../src/critters.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { createPeopleKit } = await import('../src/people/index.js');
const { mulberry32 } = await import('../src/rng.js');
const { bus } = await import('../src/events.js');
const { createRests, REST_REACH } = await import('../src/rests.js');

afterEach(() => vi.restoreAllMocks());

const DT = 1 / 30;
const mem = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const save = () => {
  const progression = createProgression(mem());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  return { progression, log };
};
// her heading to face `to` from where she is (the cat faces -z at yaw 0: player.js)
const faceTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// A fake of the game's audio, just enough for the bell (marketsound.js).
function fakeAudio() {
  const param = () => {
    const p = { value: 1, events: [] };
    for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
      p[k] = (x, t) => { p.events.push([k, x, t]); };
    }
    return p;
  };
  const node = (extra) => {
    const n = { connections: [], connect(t) { n.connections.push(t); return t; }, start(t) { n.startAt = t; }, stop() {}, disconnect() {}, ...extra };
    return n;
  };
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    oscs: [],
    createGain: () => node({ gain: param() }),
    createOscillator() { const n = node({ frequency: param(), type: 'sine' }); ctx.oscs.push(n); return n; },
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createBufferSource: () => node({ buffer: null, playbackRate: param() }),
    createBuffer: (c, length, rate) => { const d = new Float32Array(length); return { length, sampleRate: rate, getChannelData: () => d }; },
  };
  const master = node({ gain: param() });
  return { ctx, getContext: () => ctx, getMaster: () => master, isMuted: () => false };
}
const bellOscs = (audio) => audio.ctx.oscs.filter((o) => o.frequency.events.find((e) => e[0] === 'setValueAtTime')?.[1] === BELL.f);
const peakOf = (o) => Math.max(0, ...o.connections[0].gain.events.map((e) => (Number.isFinite(e[1]) ? e[1] : 0)));

// One device's walk in the square: the build, the session the life reads,
// the walk's critters (the square's own spawns, on a seeded stream) and the
// life made the way walk.js makes it (area.life(ctx)).
function square({ log = null, progression = null, people = null, audio = null, reducedMotion = false, critters: withCritters = true } = {}) {
  const scene = new THREE.Scene();
  const area = build(scene);
  const cat = new THREE.Object3D();
  const session = {
    cat,
    rest: null,
    perched: null,
    player: { speed: 0 },
    tippables: createTippables(scene, area.tippables),
    knockables: createKnockables(scene, MARKET_REGISTRATION.propSet.knockables),
    remotes: { list: [] },
  };
  const critters = withCritters ? createCritters(scene, area.critterSpawns, { rng: mulberry32(7), motionRng: mulberry32(11) }) : null;
  const life = area.life({ scene, critters, log, progression, people, audio, reducedMotion });
  const w = { scene, area, cat, session, critters, life, t: 0 };
  w.at = (x, z, yaw = cat.rotation.y) => { cat.position.set(x, 0, z); cat.rotation.y = yaw; };
  // n frames: `each(w)` first (move her), then what main.js runs before the life
  w.frames = (n, each = null) => {
    for (let i = 0; i < n; i++) {
      w.t += DT;
      each?.(w);
      if (session.rest) session.rest.t += DT;
      session.tippables.update(DT);
      session.knockables.update(DT);
      critters?.update(DT, w.t, cat.position, cat.position, cat);
      life.update(DT, w.t, cat.position, null, session);
    }
  };
  w.secs = (s, each) => w.frames(Math.round(s * 30), each);
  return w;
}
// A drink at the fountain: three seconds head down (avatar.js ends it), then up.
function drinkAt(w, p, yaw) {
  w.at(p.x, p.z, yaw);
  w.session.rest = { kind: 'drink', t: 0 };
  w.secs(3);
  w.session.rest = null;
}
const DRINK = { x: A.fountain.x, z: A.fountain.z + 0.4 };
const LISTEN = { x: MUSICIAN.x + 0.9, z: MUSICIAN.z + 1.2 };

describe('the Market life finds the six', () => {
  it('drinking at the fountain writes its page once a walk', () => {
    const s = save();
    let w = square(s);
    const found = vi.spyOn(bus, 'emit');
    drinkAt(w, DRINK, faceTo(DRINK, { x: 0, z: 0 }));
    w.secs(5); // still where she drank, facing the fountain
    expect(s.progression.state.journal.marketfountain).toBe(1);
    expect(s.progression.state.points).toBe(12);
    drinkAt(w, DRINK, 0);
    w.secs(1);
    expect(s.progression.state.journal.marketfountain).toBe(1);
    expect(found.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(1);
    // the fountain only: never the musician, 2 m off, however she faces
    expect(s.progression.state.journal.marketmusician ?? 0).toBe(0);
    drinkAt(w, DRINK, faceTo(DRINK, MUSICIAN));
    expect(s.progression.state.journal.marketmusician ?? 0).toBe(0);
    w.life.dispose();
    // the next walk counts it again, and pays nothing more
    s.log.startWalk();
    w = square(s);
    drinkAt(w, DRINK, 0);
    expect(s.progression.state.journal.marketfountain).toBe(2);
    expect(s.progression.state.points).toBe(12);
    w.life.dispose();
  });

  it('a drink or a nap from the edge of the rest\'s reach finds its page (and the drink never the musician)', () => {
    const scene = new THREE.Scene();
    const rests = createRests(scene, MARKET_REGISTRATION.propSet.rests);
    const r = REST_REACH - 0.01;
    // the edge toward the musician (the nearest the drink comes to the pitch), and away from it
    const toM = Math.atan2(MUSICIAN.z - A.fountain.z, MUSICIAN.x - A.fountain.x);
    for (const a of [toM, toM + Math.PI / 2, Math.PI / 2]) {
      const s = save();
      const w = square(s);
      const p = { x: A.fountain.x + r * Math.cos(a), z: A.fountain.z + r * Math.sin(a) };
      // the game offers the drink there (interactions.js: rests.nearest within REST_REACH)
      expect(rests.nearest({ x: p.x, z: p.z }, REST_REACH)?.kind, `${a}`).toBe('drink');
      drinkAt(w, p, faceTo(p, MUSICIAN)); // even facing the musician
      w.secs(5, (ww) => { ww.cat.rotation.y = faceTo(p, { x: 0, z: 0 }); }); // then on, facing the fountain
      expect(s.progression.state.journal.marketfountain, `${a}`).toBe(1);
      expect(s.progression.state.journal.marketmusician ?? 0, `${a}`).toBe(0);
      // and the nap at the sacks' reach
      const q = { x: A.sacks.x + r * Math.cos(a), z: A.sacks.z + r * Math.sin(a) };
      expect(rests.nearest({ x: q.x, z: q.z }, REST_REACH)?.kind, `${a}`).toBe('nap');
      w.at(q.x, q.z, 0);
      w.session.rest = { kind: 'nap', t: 0 };
      w.secs(3);
      w.session.rest = null;
      expect(s.progression.state.journal.marketsacks, `${a}`).toBe(1);
      w.life.dispose();
    }
    rests.dispose?.();
  });

  it('listening to the musician finds the musician, and only that', () => {
    const s = save();
    const w = square(s);
    w.at(LISTEN.x, LISTEN.z, faceTo(LISTEN, MUSICIAN));
    w.secs(1.8);
    expect(s.progression.state.journal.marketmusician ?? 0).toBe(0);
    // a step resets the count: still 2 s from there
    w.at(LISTEN.x + 0.1, LISTEN.z, faceTo(LISTEN, MUSICIAN));
    w.secs(1.8);
    expect(s.progression.state.journal.marketmusician ?? 0).toBe(0);
    w.secs(0.4);
    expect(s.progression.state.journal.marketmusician).toBe(1);
    for (const k of ['marketfountain', 'marketpigeons', 'marketsacks', 'marketbasket', 'marketapples']) {
      expect(s.progression.state.journal[k] ?? 0, k).toBe(0);
    }
    w.life.dispose();
  });

  it('running at the pigeons scatters them and finds them', () => {
    const pigeonsOf = (w) => w.critters.list.filter((c) => c.def.labelAs === 'pigeon');
    // from 6 m west of their patch, east toward it: running (2 m/s), walking (1 m/s),
    // and running with no player in the session (her speed from her paws)
    for (const [speed, player, finds] of [[2, true, true], [1, true, false], [2, false, true]]) {
      const s = save();
      const w = square(s);
      if (!player) delete w.session.player;
      const pigeons = pigeonsOf(w);
      expect(pigeons).toHaveLength(5);
      w.at(PIGEON_PATCH.x - 6, PIGEON_PATCH.z, faceTo({ x: 0, z: 0 }, { x: 1, z: 0 }));
      w.frames(1);
      expect(pigeons.some((p) => p.fleeing), `${speed}`).toBe(false);
      w.secs(5.2 / speed, (ww) => { // 5.2 m on: about a metre short of the patch's middle
        ww.cat.position.x += speed * DT;
        if (player) ww.session.player.speed = speed;
      });
      expect(pigeons.some((p) => p.fleeing), `${speed} scattered`).toBe(true);
      expect(s.progression.state.journal.marketpigeons ?? 0, `${speed} ${player}`).toBe(finds ? 1 : 0);
      w.life.dispose();
    }
  });

  it('a resumed walk pays and counts nothing twice', () => {
    const s = save();
    let w = square(s);
    const napAt = (ww) => {
      ww.at(A.sacks.x, A.sacks.z, 0);
      ww.session.rest = { kind: 'nap', t: 0 };
      ww.secs(3);
      ww.session.rest = null;
    };
    napAt(w);
    expect(s.progression.state.journal.marketsacks).toBe(1);
    expect(s.progression.state.points).toBe(12);
    w.life.dispose();
    // the game closes and opens again: the same walk, picked up (game/walkresume.js)
    const entries = s.log.entries();
    expect(entries).toContainEqual(['market-find-sacks', 1]);
    s.log.startWalk();
    s.log.restore([['market-find-sacks', 1]]);
    const spy = vi.spyOn(bus, 'emit');
    w = square(s);
    napAt(w);
    expect(s.progression.state.journal.marketsacks).toBe(1);
    expect(s.progression.state.points).toBe(12);
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    w.life.dispose();
  });

  it('two players each find it on their own save', () => {
    const a = save();
    const b = save();
    const wa = square(a);
    const wb = square(b);
    // both stand by the apple crate; she paws it over on her screen, and the
    // tip reaches the other over the existing `tip` event (tipById)
    wa.at(A.apples.x + 1.2, A.apples.z, 0);
    wb.at(A.apples.x - 1.5, A.apples.z + 0.8, 0);
    wa.frames(2);
    wb.frames(2);
    wa.session.tippables.tip(wa.session.tippables.list[0]);
    expect(wb.session.tippables.tipById('tip-0')).toBe(true);
    wa.frames(30);
    wb.frames(30);
    for (const s of [a, b]) {
      expect(s.progression.state.journal.marketapples).toBe(1);
      expect(s.progression.state.points).toBe(12);
    }
    // each on her own: a third, far from the crate when it went over, finds nothing
    const c = save();
    const wc = square(c);
    wc.at(A.apples.x + 6, A.apples.z, 0);
    wc.frames(2);
    expect(wc.session.tippables.tipById('tip-0')).toBe(true);
    wc.frames(30);
    expect(c.progression.state.journal.marketapples ?? 0).toBe(0);
    for (const w of [wa, wb, wc]) w.life.dispose();
  });

  it('landing in the basket rocks the bicycle and rings its bell; still under reduced motion', () => {
    for (const reducedMotion of [false, true]) {
      const audio = fakeAudio();
      const s = save();
      const w = square({ ...s, audio, reducedMotion });
      const bike = w.area.bicycle;
      expect(bike?.name).toBe('marketClutter:bicycle');
      const rest = { x: bike.rotation.x, y: bike.rotation.y, z: bike.rotation.z };
      w.at(BICYCLE_BASKET.x + 1, BICYCLE_BASKET.z + 0.6, 0);
      w.frames(3);
      expect(bellOscs(audio)).toHaveLength(0);
      // up she hops
      w.at(BICYCLE_BASKET.x, BICYCLE_BASKET.z);
      w.cat.position.y = BICYCLE_BASKET.y;
      w.session.perched = w.area.perches.find((p) => p.x === BICYCLE_BASKET.x && p.z === BICYCLE_BASKET.z);
      expect(w.session.perched).toBeTruthy();
      const rock = [];
      w.secs(BASKET_ROCK.secs + 0.5, (ww) => rock.push(ww.area.bicycle.rotation.x - rest.x));
      expect(s.progression.state.journal.marketbasket).toBe(1);
      // the bell, twice (two strikes), once a landing
      expect(new Set(bellOscs(audio).map((o) => o.startAt.toFixed(3))).size).toBe(2);
      const most = Math.max(...rock.map(Math.abs));
      if (reducedMotion) expect(most, 'held still').toBe(0);
      else {
        expect(most).toBeGreaterThan(0.01);
        expect(most).toBeLessThanOrEqual((2 * Math.PI) / 180 + 1e-9);
        expect(rock.some((r) => r > 0.005) && rock.some((r) => r < -0.005)).toBe(true);
      }
      // still again, and no turn or tip of any other kind
      expect(rock[rock.length - 1]).toBe(0);
      expect(bike.rotation.y).toBe(rest.y);
      expect(bike.rotation.z).toBe(rest.z);
      expect(bike.position.y).toBe(0);
      // sitting on in it: no more bell; down and up again: another
      w.secs(2);
      expect(bellOscs(audio)).toHaveLength(2);
      const perch = w.session.perched;
      w.session.perched = null;
      w.frames(3);
      w.session.perched = perch;
      w.frames(3);
      expect(bellOscs(audio)).toHaveLength(4);
      expect(s.progression.state.journal.marketbasket).toBe(1); // once a walk
      w.life.dispose();
    }
  });

  it("a partner's landing rocks it too, its bell as loud as she is near", () => {
    const peaks = [];
    for (const d of [2, 8, 20]) {
      const audio = fakeAudio();
      const w = square({ audio });
      const bike = w.area.bicycle;
      const partner = { group: new THREE.Object3D(), h: 0 };
      partner.group.position.set(BICYCLE_BASKET.x + 1, 0, BICYCLE_BASKET.z + 0.6);
      w.session.remotes.list.push(partner);
      w.at(BICYCLE_BASKET.x - d, BICYCLE_BASKET.z + 0.6, 0);
      w.frames(3);
      partner.group.position.set(BICYCLE_BASKET.x, 0, BICYCLE_BASKET.z);
      partner.h = BICYCLE_BASKET.y;
      let most = 0;
      w.secs(1, () => { most = Math.max(most, Math.abs(bike.rotation.x)); });
      expect(most, `${d} m`).toBeGreaterThan(0.01);
      const ring = bellOscs(audio);
      peaks.push(ring.length ? Math.max(...ring.map(peakOf)) : 0);
      w.life.dispose();
    }
    // near: rung, quieter than her own; further: quieter; out of earshot: not at all
    expect(peaks[0]).toBeGreaterThan(0);
    expect(peaks[0]).toBeLessThan(BELL.gain);
    expect(peaks[1]).toBeLessThan(peaks[0]);
    expect(peaks[2]).toBe(0);
  });

  it('no log, no progression: nothing is noted and nothing throws', () => {
    const spy = vi.spyOn(bus, 'emit');
    const w = square();
    const base = w.area.bicycle.rotation.x;
    drinkAt(w, DRINK, 0);
    w.at(LISTEN.x, LISTEN.z, faceTo(LISTEN, MUSICIAN));
    w.secs(3);
    w.at(A.sacks.x, A.sacks.z, 0);
    w.session.rest = { kind: 'nap', t: 0 };
    w.secs(3);
    w.session.rest = null;
    w.at(A.apples.x + 1, A.apples.z, 0);
    w.session.tippables.tip(w.session.tippables.list[0]);
    w.secs(1);
    w.at(PIGEON_PATCH.x - 6, PIGEON_PATCH.z, 0);
    w.secs(2.6, (ww) => { ww.cat.position.x += 2 * DT; ww.session.player.speed = 2; });
    w.at(BICYCLE_BASKET.x, BICYCLE_BASKET.z);
    w.session.perched = { ...BICYCLE_BASKET };
    let rocked = 0;
    w.secs(1, () => { rocked = Math.max(rocked, Math.abs(w.area.bicycle.rotation.x - base)); });
    expect(rocked).toBeGreaterThan(0.01); // the moment still plays
    expect(spy.mock.calls.filter((c) => c[0] === 'discovery')).toHaveLength(0);
    // and no session, no cat: nothing breaks
    w.life.update(DT, w.t, null, null, null);
    w.life.update(DT, w.t, w.cat.position, null, {});
    w.life.dispose();
    w.life.update(DT, w.t, w.cat.position, null, w.session);
  });

  it('the life adds at most 10 meshes, no casters, under 3,500 triangles, and update allocates nothing', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const count = () => {
      let meshes = 0;
      let casters = 0;
      let triangles = 0;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        if (o.castShadow) casters++;
        const g = o.geometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      });
      return { meshes, casters, triangles };
    };
    const session = {
      cat: new THREE.Object3D(),
      rest: null,
      perched: null,
      player: { speed: 0 },
      tippables: createTippables(scene, area.tippables),
      knockables: createKnockables(scene, MARKET_REGISTRATION.propSet.knockables),
      remotes: { list: [] },
    };
    const before = count();
    const life = area.life({ scene, people: createPeopleKit, audio: fakeAudio(), critters: null });
    const step = (n) => {
      for (let i = 0; i < n; i++) {
        session.tippables.update(DT);
        session.knockables.update(DT);
        life.update(DT, i * DT, session.cat.position, null, session);
      }
    };
    // everything it ever shows: the apples rolled, the petals scattered
    session.tippables.tip(session.tippables.list[0]);
    expect(session.knockables.knockById('market-bucket-1')).toBe(true);
    step(90);
    expect(scene.getObjectByName('marketApples')?.visible).toBe(true);
    expect(scene.getObjectByName('marketMusician')).toBeTruthy();
    const after = count();
    expect(after.meshes - before.meshes).toBeLessThanOrEqual(10);
    expect(after.casters - before.casters).toBe(0);
    expect(after.triangles - before.triangles).toBeLessThan(3500);
    // a frame of it, steady: no new vectors, arrays or objects
    session.cat.position.set(LISTEN.x, 0, LISTEN.z);
    step(5);
    const spies = [
      vi.spyOn(THREE.Vector3.prototype, 'clone'),
      vi.spyOn(THREE.Matrix4.prototype, 'clone'),
      vi.spyOn(THREE.Quaternion.prototype, 'clone'),
      vi.spyOn(Array.prototype, 'map'),
      vi.spyOn(Array.prototype, 'filter'),
      vi.spyOn(Array.prototype, 'slice'),
    ];
    step(60);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(0);
    life.dispose();
  });
});
