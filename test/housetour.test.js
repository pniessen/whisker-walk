import { describe, it, expect, vi } from 'vitest';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const { createHouseWalk } = await import('./helpers/housewalk.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { HOUSE_ROOMS, HOUSE_STAIRS, roomAt, stairAt } = await import('../src/world/houseplan.js');
const { HOUSE_SHOTS, HOUSE_TOURS, createHousePilot } = await import('../src/world/housetour.js');
const { behindYaw, facingYaw } = await import('../src/traversal.js');
const { MAX_ZOOM_STEP } = await import('../src/camzoom.js');
const { HOUSE_LEDGES, secretColliders } = await import('../src/world/houseplan.js');
const { HOUSE_PERCHES } = await import('../src/world/housemoves.js');
const { HOUSE_FINDS, HOUSE_GOLD_MICE } = await import('../src/world/housethings.js');
const { createHouseFinds, FIND_KEY } = await import('../src/world/housefinds.js');

// =============================================================================
// The Old House, Task 7: the shots and the tours for the film, walked by the
// real player with the stick alone.
// =============================================================================

const DT = 1 / 30; // the picture page steps 1/30 s per captured frame
const ROOM_IDS = HOUSE_ROOMS.map((r) => r.id);
const SERIES_WORDS = /twoleg|clan|thunder|shadow|river|wind|star|warrior|kittypet/i;
// Each tour is walked once (it takes a while), and its tests share the result.
const walked = {};
const walkOnce = (name) => (walked[name] ??= walkTour(name));

function walkTour(name) {
  const tour = HOUSE_TOURS[name];
  const w = createHouseWalk({ reducedMotion: false });
  const f = tour.start.face;
  w.place(tour.start.x, tour.start.z, behindYaw(f[0], f[1]), 1);
  const pilot = createHousePilot(tour);
  const rooms = new Set();
  const stairs = new Set();
  const captions = [];
  let run = 0;
  let worst = 0;
  let sunk = false;
  const was = new Map(w.area.sections.map((sec) => [sec.id, w.sink.fraction(sec.id)]));
  let up = 0;
  let down = 0;
  let lastY = null;
  let high = -Infinity;
  let low = Infinity;
  let farther = null; // the last frame at zoom step 3: where the camera looks from
  let t = 0;
  let result = { done: false, failed: null, caption: null };
  for (; t < 300; t += DT) {
    result = pilot.step(DT, { player: w.player, cat: w.cat });
    if (result.caption && captions[captions.length - 1] !== result.caption) captions.push(result.caption);
    if (result.done) break;
    w.frame(DT);
    const r = roomAt(w.cat.position.x, w.cat.position.z);
    if (r) rooms.add(r);
    const s = stairAt(w.cat.position.x, w.cat.position.z);
    if (s) stairs.add(s);
    run = w.blockers().length ? run + 1 : 0;
    worst = Math.max(worst, run);
    // a wall seen going down on the way (the start's own are settled down already)
    for (const sec of w.area.sections) {
      const f = w.sink.fraction(sec.id);
      if (f < (was.get(sec.id) ?? 1) - 1e-6 && f < 0.5) sunk = true;
      was.set(sec.id, f);
    }
    if (s === 'main' && lastY !== null) {
      if (w.cat.position.y > lastY + 1e-4) up++;
      else if (w.cat.position.y < lastY - 1e-4) down++;
    }
    lastY = w.cat.position.y;
    high = Math.max(high, w.cat.position.y);
    low = Math.min(low, w.cat.position.y);
    if (w.player.cameraZoomStep === 3) farther = { cam: w.camera.position.clone(), cat: w.cat.position.clone(), room: r };
  }
  return { result, rooms, stairs, captions, worst, sunk, high, low, up, down, seconds: t, farther, endZoom: w.player.cameraZoomStep };
}

describe('the shots', () => {
  it('puts every shot on a reachable spot where the camera sees her', () => {
    const w = createHouseWalk({ reducedMotion: true });
    const flood = houseFlood(w.area, w.area.spawn, 0.25);
    const names = Object.keys(HOUSE_SHOTS);
    for (const id of ROOM_IDS) expect(names).toContain(id);
    for (const n of ['stairs-up', 'stairs-back', 'stairs-cellar', 'dollhouse', 'dollhouse-far', 'levels', 'wall-sink']) expect(names).toContain(n);
    const bad = [];
    for (const [name, s] of Object.entries(HOUSE_SHOTS)) {
      // step 2: a shot on a furniture top or a perch is reached by a move, not on foot
      // (the step 2 shots' own test places her there)
      if (!s.ledge && !s.perch && !flood.reachesWithin(s.at[0], s.at[1], 0.3)) bad.push(`${name}: not reachable`);
      expect(Number.isInteger(s.zoom) && s.zoom >= 0 && s.zoom <= MAX_ZOOM_STEP).toBe(true);
      w.place(s.at[0], s.at[1], behindYaw(s.face[0], s.face[1]), s.zoom);
      const b = w.blockers();
      if (b.length) bad.push(`${name}: ${b.join(' ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('keeps the shots where they were promised', () => {
    expect(HOUSE_SHOTS['dollhouse'].zoom).toBe(3);
    expect(HOUSE_SHOTS['dollhouse-far'].zoom).toBe(2);
    expect(roomAt(...HOUSE_SHOTS['dollhouse'].at)).toBe('parlour');
    expect(roomAt(...HOUSE_SHOTS['dollhouse-far'].at)).toBe('parlour');
    expect(stairAt(...HOUSE_SHOTS['stairs-up'].at)).toBe('main');
    expect(stairAt(...HOUSE_SHOTS['stairs-back'].at)).toBe('back');
    expect(stairAt(...HOUSE_SHOTS['stairs-cellar'].at)).toBe('cellar');
    for (const n of ['stairs-up', 'stairs-back', 'stairs-cellar']) expect(HOUSE_SHOTS[n].zoom).toBe(1);
    expect(HOUSE_SHOTS['levels'].zoom).toBe(3);
  });

  it('shows the hall wall sunk in the wall-sink shot', () => {
    const w = createHouseWalk({ reducedMotion: true });
    const s = HOUSE_SHOTS['wall-sink'];
    expect(roomAt(...s.at)).toBe('hall');
    w.place(s.at[0], s.at[1], behindYaw(s.face[0], s.face[1]), s.zoom);
    expect(w.camera.position.z).toBeGreaterThan(12);
    expect(w.area.sections.some((sec) => w.sink.fraction(sec.id) < 0.5)).toBe(true);
  });

  it('gives every shot and caption plain words', () => {
    for (const [name, s] of Object.entries(HOUSE_SHOTS)) {
      if (s.caption !== undefined) expect(s.caption).not.toMatch(SERIES_WORDS);
      expect(name).toBeTruthy();
    }
  });
});

describe('the tours', () => {
  for (const name of ['grand', 'film']) {
    it(`walks the ${name} tour with the real player and the stick alone`, () => {
      const r = walkOnce(name);
      expect(r.result.done).toBe(true);
      expect(r.result.failed).toBe(null);
      expect([...r.rooms].sort()).toEqual([...ROOM_IDS].sort());
      expect(r.worst).toBeLessThanOrEqual(8);
      for (const c of r.captions) {
        expect(c.length).toBeLessThan(40);
        expect(c).not.toMatch(SERIES_WORDS);
      }
      expect(r.seconds).toBeGreaterThan(10);
      expect(r.seconds).toBeLessThanOrEqual(45);
    }, 90_000);

    // Final fix F2: at Farther the camera looks east over the house from the
    // attic's west end, not west over the lawn with the attic alone in view.
    it(`zooms the ${name} tour out to Farther looking east over the house`, () => {
      const { farther } = walkOnce(name);
      expect(farther).not.toBe(null);
      expect(farther.room).toBe('attic');
      expect(farther.cam.x).toBeLessThan(farther.cat.x - 5); // the camera well west of her ...
      expect(Math.abs(farther.cam.x - farther.cat.x)).toBeGreaterThan(Math.abs(farther.cam.z - farther.cat.z)); // ... mostly west
      // the owner's film (grand) ends there, on the whole house
      if (name === 'grand') expect(walkOnce(name).endZoom).toBe(3);
    }, 90_000);
  }

  it('the film is a stair up, a stair down, a wall sinking and the zoom to Farther in 30 to 45 s', () => {
    const r = walkOnce('film');
    expect(r.high).toBeGreaterThan(3.9); // up to the attic
    expect(r.low).toBeLessThan(-1.5); // down to the cellar
    expect(r.up).toBeGreaterThan(20); // up the big stairs ...
    expect(r.down).toBeGreaterThan(20); // ... and down them again
    expect(r.sunk).toBe(true);
    expect(r.seconds).toBeGreaterThanOrEqual(30);
    expect(r.seconds).toBeLessThanOrEqual(45);
    expect(HOUSE_TOURS.film.steps.some((s) => s.zoom === 3)).toBe(true);
  }, 90_000);
});

// =============================================================================
// The Old House step 2, Task 9: the shots of the things to do, the library climb
// and the film of everything, walked by the real player with the stick and the
// jump button alone.
// =============================================================================

const NEW_SHOTS = ['clock', 'piano', 'attic-window', 'bookcase-open', 'secret-stair', 'cushion', 'toys', 'knock', 'mice',
  'mice-cellar', 'gold-library', 'gold-wardrobe', 'gold-cellar', 'climb-plank', 'hud'];

// A tour walked as the picture page walks it: from its start, facing its way, the
// traversal runtime on the house's moves, the six finds run after each frame with a
// stub log (the log's own rule: a key pays once).
function walkMoves(name) {
  const tour = HOUSE_TOURS[name];
  const w = createHouseWalk({ moves: true, reducedMotion: false });
  const f = tour.start.face;
  w.place(tour.start.x, tour.start.z, behindYaw(f[0], f[1]), 1);
  w.cat.rotation.y = facingYaw(f[0], f[1]);
  const paid = [];
  const seen = new Set();
  const log = { awardOnce(type, key) { if (seen.has(key)) return 0; seen.add(key); paid.push({ type, key }); return 12; } };
  const finds = createHouseFinds({
    finds: HOUSE_FINDS, secret: { group: null, shut: secretColliders(false), open: secretColliders(true) },
    colliders: w.area.colliders, log, reducedMotion: false, now: () => new Date(2026, 10, 21, 15, 0),
  });
  const pilot = createHousePilot(tour);
  const ctx = { player: w.player, cat: w.cat, live: w.traversal, ctx: w.ctx };
  const gold = new Set();
  let run = 0;
  let worst = 0;
  const tops = new Set(); // the ledges she stood on, her paws at their tops, between moves
  let secretHigh = false; // she passed z -2 on the secret stair
  let t = 0;
  let result = { done: false, failed: null };
  for (; t < 120; t += DT) {
    result = pilot.step(DT, ctx);
    if (result.done) break;
    w.frame(DT);
    finds.update(DT, t, w.cat.position);
    const p = w.cat.position;
    run = w.blockers().length ? run + 1 : 0;
    worst = Math.max(worst, run);
    if (!w.traversal.busy) {
      for (const l of HOUSE_LEDGES) {
        if (p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= 0.05) tops.add(l.id);
      }
    }
    if (stairAt(p.x, p.z) === 'secret' && p.z < -2) secretHigh = true;
    // goldmice.js checkFind's reach: 1.0 m across, 0.9 m up or down from her paws
    for (const m of HOUSE_GOLD_MICE) {
      if (Math.hypot(m.x - p.x, m.z - p.z) < 1.0 && Math.abs(w.area.ground.y(m.x, m.z) + m.y - p.y) < 0.9) gold.add(m.id);
    }
  }
  finds.dispose();
  return { w, result, worst, tops, secretHigh, paid, gold, seconds: t, end: w.cat.position.clone() };
}

describe('step 2: the shots of the things to do', () => {
  it('puts every new shot where the camera sees her', () => {
    const w = createHouseWalk({ moves: true });
    const open = createHouseWalk({ moves: true, secretOpen: true });
    const bad = [];
    for (const name of NEW_SHOTS) {
      const s = HOUSE_SHOTS[name];
      expect(s, name).toBeTruthy();
      expect(s.caption, name).not.toMatch(SERIES_WORDS);
      const walk = s.open ? open : w;
      const yaw = behindYaw(s.face[0], s.face[1]);
      if (s.ledge) {
        expect(HOUSE_LEDGES.some((l) => l.id === s.ledge), name).toBe(true);
        walk.placeOnLedge(s.ledge, s.at[0], s.at[1], yaw, s.zoom); // throws if `at` is not on it
      } else if (s.perch) {
        const p = HOUSE_PERCHES.find((q) => q.id === s.perch);
        expect(p, name).toBeTruthy();
        expect([p.x, p.z]).toEqual([...s.at]);
        walk.placeOnPerch(p, yaw, s.zoom);
      } else {
        walk.place(s.at[0], s.at[1], yaw, s.zoom);
      }
      const b = walk.blockers();
      if (b.length) bad.push(`${name}: ${b.join(' ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('stands her where each find goes off, and off the golden mice so they show', () => {
    const at = (name) => HOUSE_SHOTS[name].at;
    const near = (name, id) => {
      const f = HOUSE_FINDS.find((q) => q.id === id);
      return Math.hypot(at(name)[0] - f.x, at(name)[1] - f.z) <= f.r;
    };
    expect(near('clock', 'clock')).toBe(true);
    expect(near('cushion', 'cushion')).toBe(true);
    expect(near('toys', 'toys')).toBe(true);
    expect(HOUSE_SHOTS.piano.ledge).toBe('parlour-keys');
    expect(HOUSE_SHOTS['attic-window'].ledge).toBe('attic-seat');
    expect(HOUSE_SHOTS['bookcase-open'].open).toBe(true);
    expect(stairAt(...at('secret-stair'))).toBe('secret');
    expect(roomAt(...at('mice'))).toBe('kitchen');
    expect(roomAt(...at('mice-cellar'))).toBe('cellar');
    expect(HOUSE_SHOTS.hud.hud).toBe(true);
    expect(HOUSE_SHOTS.hud.zoom).toBe(1);
    expect(roomAt(...at('hud'))).toBe('hall');
    for (const [name, id] of [['gold-library', 'gm-house-1'], ['gold-wardrobe', 'gm-house-2'], ['gold-cellar', 'gm-house-3']]) {
      const m = HOUSE_GOLD_MICE.find((q) => q.id === id);
      const d = Math.hypot(at(name)[0] - m.x, at(name)[1] - m.z);
      expect(d, name).toBeGreaterThan(1.0); // outside checkFind's reach: the mouse is still there
      expect(d, name).toBeLessThan(3.5);
    }
  });
});

describe('step 2: the climb and the things film', () => {
  it('walks the climb tour with the real player, the stick and the jump button alone', () => {
    const r = walkMoves('climb');
    expect(r.result.done).toBe(true);
    expect(r.result.failed).toBe(null);
    // up the steps, onto both north bookcases, across to the west one, down by the big books
    expect([...r.tops].sort()).toEqual(['library-bigbooks', 'library-books-n1', 'library-books-n2', 'library-books-w', 'library-steps']);
    expect(r.end.y).toBeCloseTo(0, 6); // back on the library floor
    expect(roomAt(r.end.x, r.end.z)).toBe('library');
    expect(r.gold.has('gm-house-1')).toBe(true);
    expect(r.worst).toBeLessThanOrEqual(8);
  }, 90_000);

  it('the things film shows every find and the secret stair in 40 to 60 s', () => {
    const r = walkMoves('things');
    expect(r.result.done).toBe(true);
    expect(r.result.failed).toBe(null);
    const keys = r.paid.map((p) => p.key);
    expect(keys.slice().sort()).toEqual(HOUSE_FINDS.map((f) => FIND_KEY(f.id)).sort());
    expect(r.paid.every((p) => p.type === 'housefind')).toBe(true);
    expect(r.secretHigh).toBe(true);
    for (const id of ['library-books-w', 'bedroom-wardrobe', 'parlour-keys', 'attic-seat']) expect(r.tops.has(id), id).toBe(true);
    expect(r.gold.has('gm-house-1')).toBe(true);
    expect(r.gold.has('gm-house-2')).toBe(true);
    expect(r.seconds).toBeGreaterThanOrEqual(40);
    expect(r.seconds).toBeLessThanOrEqual(60);
    expect(r.worst).toBeLessThanOrEqual(8);
    for (const s of HOUSE_TOURS.things.steps) {
      if (s.caption) {
        expect(s.caption.length).toBeLessThan(40);
        expect(s.caption).not.toMatch(SERIES_WORDS);
      }
    }
    expect(HOUSE_TOURS.things.steps.at(-1).zoom).toBe(2);
  }, 90_000);
});
