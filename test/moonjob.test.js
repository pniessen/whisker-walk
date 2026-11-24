// The Moon, milestone 9: Pip's postcard of the day, the pure rules (src/world/moonjob.js): the errand is a pure function of the room's seed and the walk count, the same for a
// room, all six come up, the bound's errand is swapped when the bound is off, the places (glove, tray, posts) stand on open dust, the guest pictures are simple and clear of the five,
// the album's count and its merge by maximum (the save's journal rule), and no Math.random or clock anywhere in the file.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as J from '../src/world/moonjob.js';
import * as P from '../src/world/moonplan.js';
import { CONSTELLATIONS, starSky, createSolver } from '../src/world/moonstars.js';
import { build } from '../src/world/moon.js';
import { MOON_SPOTS } from '../src/foundwear/spots/moon.js';
import { createProgression, sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });

describe('the pick', () => {
  it('is a pure function of the seed and the visits: the same answer every time, no random number, no clock', () => {
    const rnd = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');
    for (const [seed, visits] of [[undefined, 0], [undefined, 7], [12345, 0], [12345, 99], [987654321, 3], [null, 5]]) {
      const a = J.planMoonJob(seed, visits);
      expect(J.planMoonJob(seed, visits)).toEqual(a);
      expect(J.JOB_KINDS).toContain(a.kind);
      expect(a.guest).toBeGreaterThanOrEqual(0);
      expect(a.guest).toBeLessThan(12);
      expect(a.glove).toBeGreaterThanOrEqual(0);
      expect(a.glove).toBeLessThan(6);
    }
    expect(rnd).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    rnd.mockRestore(); now.mockRestore();
    const src = readFileSync(new URL('../src/world/moonjob.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
  });
  it('is the same for everyone in a room (the room\'s seed decides; one cat\'s walk count does not), and a solo cat\'s day is her walk count', () => {
    for (const seed of [1, 77, 4242, 123456789]) {
      const a = J.planMoonJob(seed, 0);
      for (const visits of [1, 5, 40]) expect(J.planMoonJob(seed, visits)).toEqual(a);
    }
    const days = new Set(Array.from({ length: 40 }, (_, v) => J.planMoonJob(undefined, v).kind));
    expect(days.size).toBeGreaterThan(3); // a solo cat meets different errands on different walks
  });
  it('lets every errand, every guest picture and every glove spot come up', () => {
    const kinds = new Set();
    const guests = new Set();
    const spots = new Set();
    for (let v = 0; v < 400; v++) { const p = J.planMoonJob(undefined, v); kinds.add(p.kind); guests.add(p.guest); spots.add(p.glove); }
    for (let s = 1; s < 400; s++) { const p = J.planMoonJob(s * 137, 0); kinds.add(p.kind); guests.add(p.guest); spots.add(p.glove); }
    expect([...kinds].sort()).toEqual([...J.JOB_KINDS].sort());
    expect(guests.size).toBe(12);
    expect(spots.size).toBe(6);
  });
  it('swaps the bound\'s errand for the pebbles when the bound is not built (and only then)', () => {
    let swapped = 0;
    for (let v = 0; v < 400; v++) {
      const on = J.planMoonJob(undefined, v, { bound: true });
      const off = J.planMoonJob(undefined, v, { bound: false });
      expect(off.kind).not.toBe('bound');
      if (on.kind === 'bound') { expect(off.kind).toBe('pebbles'); swapped++; } else expect(off.kind).toBe(on.kind);
      expect(off.guest).toBe(on.guest);
      expect(off.glove).toBe(on.glove);
    }
    expect(swapped).toBeGreaterThan(20);
  });
  it('a hostile or odd seed still answers a real errand', () => {
    for (const seed of [NaN, Infinity, -5, 'x', {}, 1e308]) for (const visits of [NaN, -1, 'a', undefined, 1e12]) {
      const p = J.planMoonJob(seed, visits);
      expect(J.JOB_KINDS).toContain(p.kind);
      expect(Number.isInteger(p.guest) && p.guest >= 0 && p.guest < 12).toBe(true);
      expect(Number.isInteger(p.glove) && p.glove >= 0 && p.glove < 6).toBe(true);
    }
  });
});

describe('the places', () => {
  const area = build(new THREE.Scene());
  const cols = area.colliders;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const clearOfColliders = (p, gap) => cols.every((c) => dist(p, c) >= c.r + gap);
  const others = [...P.PEBBLES, ...P.MOON_MICE, ...P.JOB_POINTS, ...MOON_SPOTS];
  it('six glove spots, on open dust: inside the bounds, 2 m clear of every collider, 3 m from a pebble, a golden mouse, a find spot, a job point and the track and the hop lane', () => {
    expect(J.GLOVE_SPOTS).toHaveLength(6);
    for (const g of J.GLOVE_SPOTS) {
      expect(g.x).toBeGreaterThan(P.MOON_BOUNDS.minX + 4); expect(g.x).toBeLessThan(P.MOON_BOUNDS.maxX - 4);
      expect(g.z).toBeGreaterThan(P.MOON_BOUNDS.minZ + 4); expect(g.z).toBeLessThan(P.MOON_BOUNDS.maxZ - 4);
      expect(clearOfColliders(g, 2), `${g.x},${g.z} collider`).toBe(true);
      for (const o of others) expect(dist(g, o), `${g.x},${g.z} near ${o.id ?? ''}`).toBeGreaterThanOrEqual(3);
      expect(P.trackDistance(g.x, g.z), `${g.x},${g.z} track`).toBeGreaterThanOrEqual(3);
      expect(Math.abs(P.moonY(g.x, g.z) - P.moonY(g.x + 1.2, g.z)), 'flat').toBeLessThan(0.3);
    }
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) expect(dist(J.GLOVE_SPOTS[i], J.GLOVE_SPOTS[j])).toBeGreaterThan(12);
  });
  it('the sample tray stands on open dust outside the airlock, clear of every collider, pebble and find spot', () => {
    const t = J.SAMPLE_TRAY;
    expect(clearOfColliders(t, 1.8)).toBe(true);
    for (const o of others) expect(dist(t, o)).toBeGreaterThanOrEqual(3);
    expect(dist(t, P.AIRLOCK.front)).toBeLessThan(8);
  });
  it('Dot\'s rounds are five of the track\'s own corners, the loop in order, ending at the depot; a post is passed in order or not at all', () => {
    expect(J.ROUND_POSTS).toHaveLength(5);
    for (const p of J.ROUND_POSTS) expect(P.trackDistance(p.x, p.z)).toBeLessThan(0.01);
    expect(dist(J.ROUND_POSTS[4], P.DEPOT)).toBeLessThan(6);
    let next = 0;
    // passing the third first changes nothing; the first, then the rest, in order
    expect(J.roundsStep(0, J.ROUND_POSTS[2].x, J.ROUND_POSTS[2].z)).toBe(0);
    expect(J.roundsStep(0, 1e3, 1e3)).toBe(0);
    for (let i = 0; i < 5; i++) { next = J.roundsStep(next, J.ROUND_POSTS[i].x + 2, J.ROUND_POSTS[i].z - 2); expect(next).toBe(i + 1); }
    expect(J.roundsStep(5, J.ROUND_POSTS[0].x, J.ROUND_POSTS[0].z)).toBe(5);
    expect(J.roundsStep(-1, 0, 0)).toBe(-1);
  });
});

describe('the guest star pictures', () => {
  it('twelve simple pictures of 5 or 6 stars each, every one with its own name, pinned in order, with stars 2 degrees or more apart', () => {
    expect(J.GUEST_POOL).toHaveLength(12);
    expect(new Set(J.GUEST_POOL.map((p) => p.id)).size).toBe(12);
    for (const pic of J.GUEST_POOL) {
      expect(pic.pts.length).toBeGreaterThanOrEqual(5);
      expect(pic.pts.length).toBeLessThanOrEqual(6);
      for (let i = 0; i < pic.pts.length; i++) for (let j = i + 1; j < pic.pts.length; j++) {
        expect(Math.hypot(pic.pts[i][0] - pic.pts[j][0], pic.pts[i][1] - pic.pts[j][1]), `${pic.id} ${i} ${j}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('every guest star is at least 4 degrees from every star of the five pictures (no tap can be ambiguous) and the window of 40 by 32 degrees holds a whole picture', () => {
    const deg = (a, b) => Math.hypot(((((a.b - b.b) % 360) + 540) % 360) - 180, a.e - b.e);
    for (const pic of J.GUEST_POOL) {
      const xs = pic.pts.map((p) => p[0]); const ys = pic.pts.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(36);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(28);
      for (let i = 0; i < pic.pts.length; i++) {
        const g = starSky(pic, i);
        for (const c of CONSTELLATIONS) for (let k = 0; k < c.pts.length; k++) expect(deg(g, starSky(c, k)), `${pic.id} vs ${c.id}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('the telescope\'s sixth picture', () => {
  const list = (i) => [...CONSTELLATIONS, J.GUEST_POOL[i]];
  it('is solved like the five: stars in order, a wrong star loses nothing, the last is done; the five\'s bits and the Great Cat\'s test are not touched', () => {
    for (let g = 0; g < 12; g++) {
      const s = createSolver(0, list(g));
      const n = J.GUEST_POOL[g].pts.length;
      expect(s.tap(5, 1).kind).toBe('hmm');
      for (let i = 0; i < n - 1; i++) expect(s.tap(5, i).kind).toBe('pin');
      expect(s.tap(5, n - 1).kind).toBe('done');
      expect(s.done(5)).toBe(true);
      expect(s.bits & 31).toBe(0);
    }
    const all = createSolver(31, list(0));
    expect(all.focus()).toBe(5); // today's picture is the one to do, the five being done
    expect(all.next()).toEqual({ c: 5, i: 0 });
    expect(createSolver(31).focus()).toBe(-1); // without a guest, as it was
  });
  it('is the telescope\'s first look before the five she may still do, but a picture she is half way through keeps the hint', () => {
    const s = createSolver(0, list(3));
    expect(s.focus()).toBe(5);
    s.tap(0, 0);
    expect(s.focus()).toBe(0);
    expect(createSolver(0).focus()).toBe(0);
  });
  it('a tap on a star of a picture that is not in play is a miss', () => {
    expect(createSolver(0).tap(5, 0).kind).toBe('miss');
  });
});

describe('the album', () => {
  it('is the journal page\'s count, between 0 and 12, and the postcard each errand earns is the next one (the last when it is full)', () => {
    expect(J.albumCount(undefined)).toBe(0);
    expect(J.albumCount(-3)).toBe(0);
    expect(J.albumCount(NaN)).toBe(0);
    expect(J.albumCount(5)).toBe(5);
    expect(J.albumCount(12)).toBe(12);
    expect(J.albumCount(400)).toBe(12);
    expect(J.ALBUM).toHaveLength(12);
    expect(new Set(J.ALBUM.map((a) => a[0])).size).toBe(12);
    expect(J.postcardFor(0)).toBe(J.ALBUM[0]);
    expect(J.postcardFor(11)).toBe(J.ALBUM[11]);
    expect(J.postcardFor(30)).toBe(J.ALBUM[11]);
  });
  it('merges by maximum: through the helper and through the real save merge of two devices (neither loses a postcard)', () => {
    expect(J.mergeAlbum(3, 7)).toBe(7);
    expect(J.mergeAlbum(9, 2)).toBe(9);
    expect(J.mergeAlbum(undefined, 4)).toBe(4);
    expect(J.mergeAlbum(20, 5)).toBe(12);
    const fresh = (journal) => sanitizeSave({ version: 4, journal });
    const r = mergeSaves({ local: fresh({ mnjob: 3 }), cloud: fresh({ mnjob: 8 }) }).save.journal.mnjob;
    expect(r).toBe(8);
    expect(mergeSaves({ local: fresh({ mnjob: 11 }), cloud: fresh({ mnjob: 2 }) }).save.journal.mnjob).toBe(11);
    expect(J.albumCount(r)).toBe(8);
  });
  it('needs no field of its own: the sanitiser keeps the page\'s count and the moon record is untouched by it', () => {
    const p = createProgression({ getItem: () => null, setItem() {} });
    p.recordSighting('mnjob');
    p.recordSighting('mnjob');
    expect(p.state.journal.mnjob).toBe(2);
    expect(Object.keys(p.state.moon).sort()).toEqual(['cells', 'jump', 'scope', 'stamp', 'step']);
  });
});

describe('the progress rules', () => {
  it('counts the pebbles gone from the walk\'s collectibles since the start, and no more', () => {
    const ids = P.PEBBLES.map((p) => p.id);
    expect(J.pebblesTaken(ids, ids)).toBe(0);
    expect(J.pebblesTaken(ids, ids.slice(3))).toBe(3);
    expect(J.pebblesTaken(ids.slice(2), ids.slice(2))).toBe(0); // two were picked before the count began
    expect(J.pebblesTaken(ids, [])).toBe(8);
    expect(J.pebblesTaken(ids, [...ids, 'other'])).toBe(0);
  });
  it('a hop beats her best only by the margin (10 cm); from nothing, any hop of 10 cm or more', () => {
    expect(J.beatsBest(509, 500)).toBe(false);
    expect(J.beatsBest(510, 500)).toBe(true);
    expect(J.beatsBest(60, undefined)).toBe(true);
    expect(J.beatsBest(5, 0)).toBe(false);
    expect(J.beatsBest(NaN, 100)).toBe(false);
  });
  it('a room\'s credit counts only for today\'s own errand', () => {
    const plan = { kind: 'glove' };
    expect(J.validJobCredit({ kind: 'job', job: 'glove' }, plan)).toBe(true);
    expect(J.validJobCredit({ kind: 'job', job: 'rounds' }, plan)).toBe(false);
    expect(J.validJobCredit({ kind: 'job' }, plan)).toBe(false);
    expect(J.validJobCredit({ kind: 'wake', job: 'glove' }, plan)).toBe(false);
    expect(J.validJobCredit(null, plan)).toBe(false);
    expect(J.validJobCredit('job', plan)).toBe(false);
  });
});
