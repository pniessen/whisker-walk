import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const { createHouseWalk } = await import('./helpers/housewalk.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { HOUSE_ROOMS, HOUSE_STAIRS, roomAt, stairAt } = await import('../src/world/houseplan.js');
const { HOUSE_SHOTS, HOUSE_TOURS, createHousePilot } = await import('../src/world/housetour.js');
const { behindYaw } = await import('../src/traversal.js');
const { MAX_ZOOM_STEP } = await import('../src/camzoom.js');

// =============================================================================
// The Old House, Task 7: the shots and the tours for the film, walked by the
// real player with the stick alone.
// =============================================================================

const DT = 1 / 30; // the picture page steps 1/30 s per captured frame
const ROOM_IDS = HOUSE_ROOMS.map((r) => r.id);
const SERIES_WORDS = /twoleg|clan|thunder|shadow|river|wind|star|warrior|kittypet/i;
const durations = {};

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
  let up = 0;
  let down = 0;
  let lastY = null;
  let high = -Infinity;
  let low = Infinity;
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
    for (const sec of w.area.sections) if (w.sink.fraction(sec.id) < 0.5) sunk = true;
    if (s === 'main' && lastY !== null) {
      if (w.cat.position.y > lastY + 1e-4) up++;
      else if (w.cat.position.y < lastY - 1e-4) down++;
    }
    lastY = w.cat.position.y;
    high = Math.max(high, w.cat.position.y);
    low = Math.min(low, w.cat.position.y);
  }
  durations[name] = t;
  if (process.env.WW_TOUR_LOG) fs.appendFileSync(process.env.WW_TOUR_LOG, `${name} ${t.toFixed(2)} s\n`);
  return { result, rooms, stairs, captions, worst, sunk, high, low, up, down, seconds: t };
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
      if (!flood.reachesWithin(s.at[0], s.at[1], 0.3)) bad.push(`${name}: not reachable`);
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
      const r = walkTour(name);
      expect(r.result.done).toBe(true);
      expect(r.result.failed).toBe(null);
      expect([...r.rooms].sort()).toEqual([...ROOM_IDS].sort());
      expect(r.worst).toBeLessThanOrEqual(8);
      for (const c of r.captions) {
        expect(c.length).toBeLessThan(40);
        expect(c).not.toMatch(SERIES_WORDS);
      }
      expect(r.seconds).toBeGreaterThan(10);
    }, 90_000);
  }

  it('the film is a stair up, a stair down, a wall sinking and the zoom to Farther in 30 to 45 s', () => {
    const r = walkTour('film');
    expect(r.high).toBeGreaterThan(3.9); // up to the attic
    expect(r.low).toBeLessThan(-1.5); // down to the cellar
    expect(r.up).toBeGreaterThan(20); // up the big stairs ...
    expect(r.down).toBeGreaterThan(20); // ... and down them again
    expect(r.sunk).toBe(true);
    expect(r.seconds).toBeGreaterThanOrEqual(30);
    expect(r.seconds).toBeLessThanOrEqual(45);
    expect(HOUSE_TOURS.film.steps.some((s) => s.zoom === 3)).toBe(true);
    expect(durations.film).toBeLessThanOrEqual(45);
  }, 90_000);
});
