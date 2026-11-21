import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js's):
// the build draws on canvases.
vi.stubGlobal('document', canvasStub);

const { createHouseFinds, FIND_KEY, PIANO_SCALE, STILL } = await import('../src/world/housefinds.js');
const { HOUSE_FINDS } = await import('../src/world/housethings.js');
const {
  HOUSE_LEDGES, HOUSE_ROOMS, HOUSE_LEVELS, SECRET_BOOKCASE, SECRET_OPEN_ROT_Y, secretColliders, roomAt, houseSections,
} = await import('../src/world/houseplan.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { createToy } = await import('../src/toy.js');
const { isWalkableAt } = await import('../src/player.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { bannedIn } = await import('./helpers/offwords.js');
const { findFadeOccluders, createTreeFade } = await import('../src/treefade.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { build } = await import('../src/world/house.js');

// =============================================================================
// The Old House, step 2, Task 6 (rulings D6-D9, D14): the six discoveries at
// run time, on a built house, paid through a real discovery log, with stand-in
// sound and HUD that note their calls. The cat is a point moved frame by frame.
// =============================================================================

const DT = 1 / 60;
const FIND = Object.fromEntries(HOUSE_FINDS.map((f) => [f.id, f]));
const ledge = (id) => HOUSE_LEDGES.find((l) => l.id === id);
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const floorAt = (room) => levelY(HOUSE_ROOMS.find((r) => r.id === room).level);

function recorder(names) {
  const calls = Object.fromEntries(names.map((n) => [n, []]));
  const o = { calls };
  for (const n of names) o[n] = (...a) => { calls[n].push(a); };
  return o;
}

// A built house and its finds, a fresh log and fresh recorders.
function setup({ now = () => new Date(2026, 10, 21, 15, 0), reducedMotion = false } = {}) {
  const scene = new THREE.Scene();
  const record = build(scene);
  const paid = { points: 0 };
  const log = createDiscoveryLog({ addPoints: (n) => { paid.points += n; }, recordFeat() {} });
  log.startWalk();
  const audio = recorder(['playTune', 'musicBoxNote', 'purr']);
  const hud = recorder(['toast']);
  const colliders = record.colliders;
  const f = createHouseFinds({
    finds: record.house.finds, secret: record.house.secret, colliders, parts: record.house.parts, log, hud, audio, reducedMotion, now,
  });
  const cat = new THREE.Vector3();
  let t = 0;
  const step = (x, y, z) => {
    cat.set(x, y, z);
    t += DT;
    f.update(DT, t, cat);
  };
  // she stands at (x, y, z) for `seconds`
  const stay = (x, y, z, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) step(x, y, z); };
  // she walks in a line at `speed` m/s
  const walkLine = (a, b, speed) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / speed / DT));
    for (let i = 0; i <= n; i++) step(a.x + ((b.x - a.x) * i) / n, a.y ?? 0, a.z + ((b.z - a.z) * i) / n);
  };
  return { scene, record, f, log, audio, hud, paid, colliders, stay, step, walkLine, cat };
}

describe('the clock', () => {
  it('strikes the hour when she stays at its foot, and pays once a walk', () => {
    const s = setup({ now: () => new Date(2026, 10, 21, 15, 0) });
    const c = FIND.clock;
    s.stay(c.x, 0, c.z, 0.9);
    expect(s.audio.calls.playTune).toHaveLength(0); // not yet: 1 s
    s.stay(c.x, 0, c.z, 0.2);
    expect(s.audio.calls.playTune).toHaveLength(1);
    const notes = s.audio.calls.playTune[0][0];
    expect(notes).toHaveLength(3); // 15:00 strikes 3
    for (const [i, n] of notes.entries()) {
      expect(n.freq).toBe(196);
      expect(n.at).toBeCloseTo(i * 1.1, 9);
    }
    expect(s.log.count(FIND_KEY('clock'))).toBe(1);
    expect(s.paid.points).toBe(12);
    // staying on does not strike again
    s.stay(c.x, 0, c.z, 3);
    expect(s.audio.calls.playTune).toHaveLength(1);
    // a step off, still within r + 1, and back: no strike
    s.stay(c.x + c.r + 0.5, 0, c.z, 0.5);
    s.stay(c.x, 0, c.z, 1.1);
    expect(s.audio.calls.playTune).toHaveLength(1);
    // walked off and come back: it strikes again, and pays nothing more
    s.stay(c.x + 3, 0, c.z, 0.2);
    s.stay(c.x, 0, c.z, 1.1);
    expect(s.audio.calls.playTune).toHaveLength(2);
    expect(s.paid.points).toBe(12);
    expect(s.log.count(FIND_KEY('clock'))).toBe(1);
  }, 60_000);

  it('strikes 12 at midnight and once at one, and its pendulum swings at 1 Hz but stands still under reduced motion', () => {
    for (const [h, n] of [[0, 12], [12, 12], [13, 1], [23, 11]]) {
      const s = setup({ now: () => new Date(2026, 10, 21, h, 30) });
      s.stay(FIND.clock.x, 0, FIND.clock.z, 1.1);
      expect(s.audio.calls.playTune[0][0], `${h}:30`).toHaveLength(n);
    }
    const s = setup();
    const p = s.record.house.parts.pendulum;
    const seen = [];
    for (let i = 0; i < 60; i++) { s.step(0, 0, 9.5); seen.push(p.rotation.z); }
    expect(Math.max(...seen)).toBeGreaterThan(0.05);
    expect(Math.min(...seen)).toBeLessThan(-0.05);
    // a whole second later it is where it was (1 Hz)
    const a = p.rotation.z;
    for (let i = 0; i < 60; i++) s.step(0, 0, 9.5);
    expect(p.rotation.z).toBeCloseTo(a, 6);
    const still = setup({ reducedMotion: true });
    for (let i = 0; i < 60; i++) { still.step(0, 0, 9.5); expect(still.record.house.parts.pendulum.rotation.z).toBe(0); }
  }, 60_000);
});

describe('the piano', () => {
  it('plays a note for each key she steps on, west to east, and a tune for six', () => {
    const s = setup();
    const k = ledge('parlour-keys');
    const z = (k.minZ + k.maxZ) / 2;
    // on the floor in front of it: nothing
    s.walkLine({ x: k.minX + 0.02, y: floorAt('parlour'), z }, { x: k.maxX - 0.02, z }, 0.5);
    expect(s.audio.calls.musicBoxNote).toHaveLength(0);
    // up on the keys, west to east
    const pointsAtNote = [];
    const a = { x: k.minX + 0.02, y: k.y, z };
    const b = { x: k.maxX - 0.02, z };
    const n = Math.round(Math.hypot(b.x - a.x, 0) / 0.5 / DT);
    for (let i = 0; i <= n; i++) {
      const before = s.audio.calls.musicBoxNote.length;
      s.step(a.x + ((b.x - a.x) * i) / n, k.y, z);
      if (s.audio.calls.musicBoxNote.length > before) pointsAtNote.push(s.paid.points);
    }
    expect(s.audio.calls.musicBoxNote.map((c) => c[0])).toEqual([...PIANO_SCALE]);
    // C4 to C5, rising
    expect(PIANO_SCALE).toEqual([262, 294, 330, 349, 392, 440, 494, 523]);
    // paid as the sixth key sounds, not before
    expect(pointsAtNote).toEqual([0, 0, 0, 0, 0, 12, 12, 12]);
    expect(s.log.count(FIND_KEY('piano'))).toBe(1);
    // her paws a little over the keys (0.1 m) still play them; a jump higher does not
    const before = s.audio.calls.musicBoxNote.length;
    s.step(k.minX + 0.05, k.y + 0.3, z);
    s.step(k.minX + 0.05, k.y + 0.08, z);
    expect(s.audio.calls.musicBoxNote.length).toBe(before + 1);
  }, 60_000);

  it('five keys, a hop down, and five more is not a tune', () => {
    const s = setup();
    const k = ledge('parlour-keys');
    const z = (k.minZ + k.maxZ) / 2;
    const w = (k.maxX - k.minX) / 8;
    const keyX = (i) => k.minX + (i + 0.5) * w;
    for (let i = 0; i < 5; i++) s.stay(keyX(i), k.y, z, 0.1);
    s.stay(keyX(4), floorAt('parlour'), z + 0.6, 0.2);
    for (let i = 3; i < 8; i++) s.stay(keyX(i), k.y, z, 0.1);
    expect(s.audio.calls.musicBoxNote).toHaveLength(10);
    expect(s.paid.points).toBe(0);
    // the same key twice is one key
    s.stay(keyX(4), floorAt('parlour'), z + 0.6, 0.2);
    for (let i = 0; i < 20; i++) s.stay(keyX(i % 2), k.y, z, 0.05);
    expect(s.audio.calls.musicBoxNote).toHaveLength(30);
    expect(s.paid.points).toBe(0);
  }, 60_000);
});

describe('the attic window', () => {
  it('pays when she is up on the seat, not below it', () => {
    const s = setup();
    const l = ledge('attic-seat');
    const x = (l.minX + l.maxX) / 2;
    const z = (l.minZ + l.maxZ) / 2;
    s.stay(x, floorAt('attic'), z, 1);
    expect(s.paid.points).toBe(0);
    s.stay(x, l.y, z, DT);
    expect(s.paid.points).toBe(12);
    expect(s.log.count(FIND_KEY('window'))).toBe(1);
    s.stay(x, floorAt('attic'), z, 0.5);
    s.stay(x, l.y, z, 0.5);
    expect(s.paid.points).toBe(12);
  }, 60_000);
});

describe('the secret bookcase', () => {
  const b = SECRET_BOOKCASE;
  const hasCircle = (list, c) => list.some((q) => q.secret && Math.abs(q.x - c.x) < 1e-9 && Math.abs(q.z - c.z) < 1e-9 && q.r === c.r);

  for (const [side, z] of [['the library', 3.0], ['the stair', 1.0]]) {
    it(`swings open when she stands at it from ${side}, and stays open`, () => {
      const s = setup();
      const pivot = s.record.house.secret.group;
      const leaf = pivot.userData.leaf;
      // the walk's tree fade reads the fade shapes once, before any frame
      const entries = findFadeOccluders(s.scene);
      const entry = entries.find((e) => e.obj === leaf);
      expect([entry.x, entry.z]).toEqual([expect.closeTo(-6, 6), expect.closeTo(2, 6)]);
      expect(s.f.open).toBe(false);
      expect(isWalkableAt({ ...s.record, colliders: s.colliders }, -6, 2)).toBe(false);
      const len = s.colliders.length;
      let held = 0;
      while (!s.f.open && held < 100) { s.step(-6, 0, z); held++; }
      expect(Math.abs(held * DT - b.holdS)).toBeLessThanOrEqual(2 * DT);
      expect(s.f.open).toBe(true);
      expect(s.paid.points).toBe(12);
      expect(s.log.count(FIND_KEY('bookcase'))).toBe(1);
      // the live colliders: the shut row out, the open row in, the rest untouched
      // (the hinge's circle is in both rows)
      for (const c of secretColliders(false)) expect(hasCircle(s.colliders, c)).toBe(hasCircle(secretColliders(true), c));
      expect(s.colliders.filter((c) => c.secret)).toEqual(secretColliders(true));
      for (const c of secretColliders(true)) expect(hasCircle(s.colliders, c)).toBe(true);
      expect(s.colliders.length).toBe(len - secretColliders(false).length + secretColliders(true).length);
      expect(isWalkableAt({ ...s.record, colliders: s.colliders }, -6, 2)).toBe(true);
      // it swings over openS: not there yet one frame early, there one frame late
      const start = pivot.rotation.y;
      expect(Math.abs(start - SECRET_OPEN_ROT_Y)).toBeGreaterThan(0.1);
      let frames = 0;
      while (Math.abs(pivot.rotation.y - SECRET_OPEN_ROT_Y) > 1e-9 && frames < 1000) { s.step(-6, 0, z); frames++; }
      expect(Math.abs(frames * DT - b.openS)).toBeLessThanOrEqual(2 * DT);
      // the fade shape went with it: round the open leaf's middle, along z from the hinge
      expect(entry.x).toBeCloseTo(b.hinge.x, 6);
      expect(entry.z).toBeCloseTo(b.hinge.z + b.w / 2, 6);
      for (const sh of entry.shapes) {
        expect(sh.x).toBeCloseTo(entry.x, 9);
        expect(sh.z).toBeCloseTo(entry.z, 9);
      }
      // and the real tree fade takes it from there: a camera west of the open leaf, looking at her
      // east of it, two metres off the shut leaf's middle
      const fade = createTreeFade(entries, { reducedMotion: true });
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(-9, 1.6, 4.0);
      fade.update(DT, camera, { x: -5.6, y: 0.4, z: 4.0 });
      expect(fade.faded().has(leaf)).toBe(true);
      fade.dispose();
      // she walks off: it stays open and pays nothing more
      s.stay(0, 0, 9.5, 5);
      s.stay(-6, 0, z, 1);
      expect(s.f.open).toBe(true);
      expect(pivot.rotation.y).toBe(SECRET_OPEN_ROT_Y);
      expect(s.paid.points).toBe(12);
      expect(s.colliders.filter((c) => c.secret)).toHaveLength(secretColliders(true).length);
    }, 60_000);
  }

  it('opens at once under reduced motion', () => {
    const s = setup({ reducedMotion: true });
    s.stay(-6, 0, 3.0, 0.65);
    expect(s.f.open).toBe(true);
    expect(s.record.house.secret.group.rotation.y).toBe(SECRET_OPEN_ROT_Y);
  }, 60_000);

  it('is kept out of the prop merge with every moving part: each keeps its own mesh, in the scene', () => {
    const s = setup();
    expect(s.record.house.secret.group.userData.noMerge).toBe(true);
    mergeStaticProps(s.scene);
    const inScene = (o) => { let a = o; while (a.parent) a = a.parent; return a === s.scene; };
    const leaf = s.record.house.secret.group.userData.leaf;
    expect(leaf.children.filter((c) => c.isMesh)).toHaveLength(1);
    const { pendulum, keys, lid, toys } = s.record.house.parts;
    expect(keys).toHaveLength(8);
    for (const m of [leaf, pendulum, ...keys, lid, ...toys.map((q) => q.mesh)]) {
      expect(inScene(m), m.name).toBe(true);
      if (m !== leaf) expect(m.isMesh && m.castShadow, m.name).toBe(false);
    }
    // and they still move: the bookcase swings, the keys dip, after the merge
    s.stay(-6, 0, 3.0, 2);
    expect(s.record.house.secret.group.rotation.y).toBe(SECRET_OPEN_ROT_Y);
    const k = ledge('parlour-keys');
    s.step(k.minX + 0.05, k.y, (k.minZ + k.maxZ) / 2);
    expect(keys[0].position.y).toBeLessThan(0);
    expect(keys.slice(1).every((m) => m.position.y === 0)).toBe(true);
  }, 60_000);
});

describe('the hearth cushion', () => {
  it('pays only when she stays still on it', () => {
    const s = setup();
    const c = FIND.cushion;
    const y = floorAt('parlour');
    // trotting across it: nothing
    s.walkLine({ x: c.x - 1.5, y, z: c.z }, { x: c.x + 1.5, z: c.z }, 1.5);
    s.walkLine({ x: c.x + 1.5, y, z: c.z }, { x: c.x - 1.5, z: c.z }, 1.5);
    expect(s.audio.calls.purr).toHaveLength(0);
    expect(s.paid.points).toBe(0);
    // still on it for 1.5 s: a purr and the pay
    s.stay(c.x, y, c.z, 1.4);
    expect(s.paid.points).toBe(0);
    s.stay(c.x, y, c.z, 0.2);
    expect(s.audio.calls.purr).toEqual([[1.2]]);
    expect(s.paid.points).toBe(12);
    // and creeping slower than STILL still counts as still (a second time, after leaving)
    s.stay(c.x + 2, y, c.z, 0.2);
    const n = Math.round(1.6 / DT);
    for (let i = 0; i < n; i++) s.step(c.x + (i / n) * (STILL * 0.8 * 1.6) - 0.1, y, c.z);
    expect(s.audio.calls.purr).toHaveLength(2);
    expect(s.paid.points).toBe(12);
  }, 60_000);
});

describe('the box of toys', () => {
  it('tips out its toys when she noses at it', () => {
    const s = setup();
    const c = FIND.toys;
    const { lid, toys } = s.record.house.parts;
    expect(toys).toHaveLength(3);
    const lid0 = lid.rotation.x;
    const from = toys.map((q) => q.mesh.position.clone());
    s.stay(c.x, floorAt('attic'), c.z, 0.45);
    expect(lid.rotation.x).toBe(lid0);
    s.stay(c.x, floorAt('attic'), c.z, 0.1);
    expect(s.paid.points).toBe(12);
    expect(s.log.count(FIND_KEY('toys'))).toBe(1);
    s.stay(c.x, floorAt('attic'), c.z, 0.2);
    expect(Math.abs(lid.rotation.x - lid0)).toBeGreaterThan(0.5); // tipping
    expect(toys.some((q, i) => q.mesh.position.distanceTo(from[i]) > 0.05)).toBe(true); // tumbling
    s.stay(c.x, floorAt('attic'), c.z, 0.7);
    for (const q of toys) {
      expect(q.mesh.position.x).toBeCloseTo(q.rest.x, 6);
      expect(q.mesh.position.y).toBeCloseTo(q.rest.y, 6);
      expect(q.mesh.position.z).toBeCloseTo(q.rest.z, 6);
    }
    // the toys rest on the attic floor in front of the box, within her reach
    s.scene.updateMatrixWorld(true);
    for (const q of toys) {
      const w = q.mesh.getWorldPosition(new THREE.Vector3());
      expect(roomAt(w.x, w.z)).toBe('attic');
      expect(w.y).toBeGreaterThanOrEqual(floorAt('attic') - 1e-6);
      expect(w.y).toBeLessThan(floorAt('attic') + 0.1);
      expect(Math.hypot(w.x - c.x, w.z - c.z)).toBeLessThan(1);
    }
    expect(s.paid.points).toBe(12);
  }, 60_000);

  it('under reduced motion the toys are out at once', () => {
    const s = setup({ reducedMotion: true });
    const c = FIND.toys;
    s.stay(c.x, floorAt('attic'), c.z, 0.55);
    for (const q of s.record.house.parts.toys) expect(q.mesh.position.distanceTo(q.rest)).toBeLessThan(1e-9);
  }, 60_000);
});

describe('the yarn ball', () => {
  // the hall's west wall (the library beyond it), at its longest stretch of solid wall
  const wall = houseSections().filter((q) => q.owner === 'hall' && q.kind === 'wall' && q.x0 === -4 && q.x1 === -4)
    .sort((a, b) => Math.abs(b.z1 - b.z0) - Math.abs(a.z1 - a.z0))[0];
  const wallZ = (wall.z0 + wall.z1) / 2;

  const batAtWall = (withLife) => {
    const scene = new THREE.Scene();
    const record = build(scene);
    const toy = createToy(scene, { ground: record.ground, rng: () => 0.5 });
    const life = withLife ? record.life({ scene, reducedMotion: true, toy, audio: recorder(['playTune', 'musicBoxNote', 'purr']), hud: recorder(['toast']) }) : null;
    const camera = new THREE.PerspectiveCamera();
    const cat = new THREE.Vector3(2, 0, 9.5);
    camera.position.set(2, 2, 13);
    let t = 0;
    life?.update(DT, t, cat, camera); // the first frame settles
    toy.placeAt({ x: -3, z: wallZ });
    toy.throwFrom(new THREE.Vector3(-3, 0.3, wallZ), new THREE.Vector3(-1, 0, 0), 6);
    const rooms = new Set();
    for (let i = 0; i < 180; i++) {
      t += DT;
      toy.update(DT, record.bounds);
      life?.update(DT, t, cat, camera);
      const p = toy.mesh.position;
      rooms.add(roomAt(p.x, p.z));
    }
    life?.dispose();
    return { rooms, toy };
  };

  it('the life stops it at the wall: it stays in the hall', () => {
    expect(wall).toBeTruthy();
    const { rooms, toy } = batAtWall(true);
    expect([...rooms]).toEqual(['hall']);
    expect(toy.mesh.position.x).toBeGreaterThan(-4);
  }, 60_000);

  it('without the life it would have rolled through into the library', () => {
    const { rooms } = batAtWall(false);
    expect(rooms.has('library')).toBe(true);
  }, 60_000);
});

describe('the words', () => {
  const IDS = ['clock', 'piano', 'window', 'bookcase', 'cushion', 'toys'];
  it('every find speaks from the word tables in both sets, with no series word in the everyday set', () => {
    expect(HOUSE_FINDS.map((f) => f.id)).toEqual(IDS);
    for (const id of IDS) {
      const [on, off] = [phrase(`house.find.${id}`, 3), withOffWords(() => phrase(`house.find.${id}`, 3))];
      for (const w of [on, off]) {
        expect(typeof w, id).toBe('string');
        expect(w.length, id).toBeGreaterThan(0);
        expect(w, id).not.toMatch(/house\.find/);
      }
      expect(bannedIn(off), id).toBe(null);
    }
    expect(phrase('house.find.clock', 3)).toBe('The old clock bongs 3 times! 🕰️');
    expect(phrase('house.find.clock', 1)).toBe('The old clock bongs 1 time! 🕰️');
  });
});
