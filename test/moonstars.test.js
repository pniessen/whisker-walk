// The Moon, milestone 5: the star pictures' data and the pure solver (src/world/moonstars.js). The right order, a wrong star never loses
// progress, every picture keeps its own count, the hint after 20 seconds, tolerance and snap, the positions on the sky.
import { describe, it, expect } from 'vitest';
import {
  CONSTELLATIONS, STAR_COUNT, ALL_BITS, STORY_BITS, HINT_SECS, GREAT_CAT, TOLERANCE, WINDOW,
  starSky, catSky, skyDir, bearingOf, createSolver, createHint, nearestStar, scopeScale, angleTo, firstUndone, bitsOf, cleanBits,
} from '../src/world/moonstars.js';
import { earthDirection } from '../src/world/moonsky.js';
import { LINES, HINTS } from '../src/world/moonwords.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

describe('the data', () => {
  it('five pictures, 27 stars: the Mouse 4, the Cat 7, the Fish 6, the Crown 5, the Paw 5, in the order of the save bits', () => {
    expect(CONSTELLATIONS.map((c) => c.id)).toEqual(['mouse', 'cat', 'fish', 'crown', 'paw']);
    expect(CONSTELLATIONS.map((c) => c.pts.length)).toEqual([4, 7, 6, 5, 5]);
    expect(STAR_COUNT).toBe(27);
    expect(ALL_BITS).toBe(31);
    expect(STORY_BITS).toBe(3);
    expect(HINT_SECS).toBe(20);
    expect(WINDOW).toEqual({ w: 60, h: 40 });
  });
  it('every star is above the horizon and under the zenith, no two stars of one picture are the same point, and each picture fits a 60 by 40 window', () => {
    for (const c of CONSTELLATIONS) {
      const seen = new Set();
      let minB = 1e9; let maxB = -1e9; let minE = 1e9; let maxE = -1e9;
      for (let i = 0; i < c.pts.length; i++) {
        const s = starSky(c, i);
        expect(s.e, `${c.id} ${i}`).toBeGreaterThan(8);
        expect(s.e).toBeLessThan(80);
        const key = `${s.b.toFixed(2)}:${s.e.toFixed(2)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        const db = angleTo(c.bearing, s.b);
        minB = Math.min(minB, db); maxB = Math.max(maxB, db); minE = Math.min(minE, s.e); maxE = Math.max(maxE, s.e);
      }
      expect(maxB - minB).toBeLessThan(WINDOW.w - 10);
      expect(maxE - minE).toBeLessThan(WINDOW.h - 10);
    }
  });
  it('the pictures do not crowd each other: any two stars of different pictures are at least 4 degrees apart', () => {
    const all = [];
    CONSTELLATIONS.forEach((c, ci) => c.pts.forEach((_, i) => all.push({ ci, ...starSky(c, i) })));
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      if (all[a].ci === all[b].ci) continue;
      const db = angleTo(all[a].b, all[b].b) * Math.cos((all[a].e * Math.PI) / 180);
      expect(Math.hypot(db, all[a].e - all[b].e), `${a} ${b}`).toBeGreaterThan(4);
    }
  });
  it('the Great Cat is a closed outline of 16 points, a tail of 4 and two eyes, on the sky above the horizon', () => {
    expect(GREAT_CAT.outline).toHaveLength(16);
    expect(GREAT_CAT.tail).toHaveLength(4);
    expect(GREAT_CAT.eyes).toHaveLength(2);
    for (const [x, y] of [...GREAT_CAT.outline, ...GREAT_CAT.tail, ...GREAT_CAT.eyes]) {
      const s = catSky(x, y);
      expect(s.e).toBeGreaterThan(20);
      expect(s.e).toBeLessThan(80);
    }
  });
  it('the direction of a bearing and elevation is the one Earth stands in (north is -z, east is +x), and bearingOf undoes it', () => {
    const d = skyDir(12, 21);
    expect(d.x).toBeCloseTo(earthDirection.x, 6);
    expect(d.y).toBeCloseTo(earthDirection.y, 6);
    expect(d.z).toBeCloseTo(earthDirection.z, 6);
    for (const [b, e] of [[0, 10], [90, 45], [200, 60], [335, 30]]) {
      const v = skyDir(b, e);
      const back = bearingOf(v.x, v.y, v.z);
      expect(back.b).toBeCloseTo(b, 6);
      expect(back.e).toBeCloseTo(e, 6);
    }
  });
});

describe('the solver', () => {
  it('pins the stars of a picture in order and finishes it on the last', () => {
    const s = createSolver(0);
    const mouse = CONSTELLATIONS[0].pts.length;
    for (let i = 0; i < mouse - 1; i++) expect(s.tap(0, i).kind).toBe('pin');
    expect(s.pins(0)).toBe(mouse - 1);
    const r = s.tap(0, mouse - 1);
    expect(r.kind).toBe('done');
    expect(r.bits).toBe(1);
    expect(s.done(0)).toBe(true);
    expect(s.bits).toBe(1);
  });
  it('a wrong star is a hmm and loses nothing: not the next, not a later one, not another picture\'s', () => {
    const s = createSolver(0);
    s.tap(1, 0); s.tap(1, 1);
    expect(s.tap(1, 4).kind).toBe('hmm');
    expect(s.tap(1, 6).kind).toBe('hmm');
    expect(s.tap(0, 2).kind).toBe('hmm'); // a middle star of another picture
    expect(s.pins(1)).toBe(2);
    expect(s.pins(0)).toBe(0);
    expect(s.tap(1, 2).kind).toBe('pin'); // and the right one still goes on from where she was
    expect(s.pins(1)).toBe(3);
  });
  it('a star already pinned is "again", a star of a finished picture is "known", nothing there is a miss; none changes anything', () => {
    const s = createSolver(1); // the Mouse is done
    expect(s.tap(0, 0).kind).toBe('known');
    expect(s.tap(1, 0).kind).toBe('pin');
    expect(s.tap(1, 0).kind).toBe('again');
    for (const bad of [[-1, 0], [9, 0], [1, 99], [1, -1], [null, 0], [1.5, 0], ['a', 'b']]) expect(s.tap(...bad).kind).toBe('miss');
    expect(s.pins(1)).toBe(1);
    expect(s.bits).toBe(1);
  });
  it('every picture keeps its own progress: leave one half drawn, do another, come back', () => {
    const s = createSolver(0);
    s.tap(2, 0); s.tap(2, 1);
    for (let i = 0; i < 4; i++) s.tap(0, i);
    expect(s.done(0)).toBe(true);
    expect(s.pins(2)).toBe(2);
    expect(s.tap(2, 2).kind).toBe('pin');
  });
  it('all five tapped through in any order give 31, and no sequence of taps ever lowers a bit or a count', () => {
    const s = createSolver(0);
    for (const c of [3, 0, 4, 1, 2]) CONSTELLATIONS[c].pts.forEach((_, i) => s.tap(c, i));
    expect(s.bits).toBe(31);
    // a hostile stream of taps (a seeded walk through every star, in the wrong order too) never loses anything
    const t = createSolver(0);
    let prevBits = 0;
    const counts = [0, 0, 0, 0, 0];
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let n = 0; n < 3000; n++) {
      const c = Math.floor(rnd() * 5);
      const i = Math.floor(rnd() * CONSTELLATIONS[c].pts.length);
      t.tap(c, i);
      expect(t.bits & prevBits).toBe(prevBits);
      prevBits = t.bits;
      for (let k = 0; k < 5; k++) { expect(t.pins(k)).toBeGreaterThanOrEqual(counts[k]); counts[k] = t.pins(k); }
    }
  });
  it('starts from the saved bits (a done picture is already pinned), cleaning a hostile number', () => {
    expect(createSolver(5).bits).toBe(5);
    expect(createSolver(5).pins(2)).toBe(CONSTELLATIONS[2].pts.length);
    expect(createSolver(-3).bits).toBe(0);
    expect(createSolver(1.5).bits).toBe(0);
    expect(createSolver(255).bits).toBe(31);
    expect(createSolver('x').bits).toBe(0);
    expect(cleanBits(NaN)).toBe(0);
    expect(bitsOf(5)).toEqual([true, false, true, false, false]);
    expect(firstUndone(1)).toBe(1);
    expect(firstUndone(31)).toBe(-1);
  });
  it('the focus is the picture last pinned, else one begun, else the first not done; next() is its next star, null when all are done', () => {
    const s = createSolver(0);
    expect(s.focus()).toBe(0);
    expect(s.next()).toEqual({ c: 0, i: 0 });
    s.tap(1, 0);
    expect(s.focus()).toBe(1);
    expect(s.next()).toEqual({ c: 1, i: 1 });
    s.tap(3, 0);
    expect(s.focus()).toBe(3);
    for (let i = 1; i < CONSTELLATIONS[3].pts.length; i++) s.tap(3, i);
    expect(s.focus()).toBe(1); // the Crown is done: the one still begun
    const full = createSolver(31);
    expect(full.focus()).toBe(-1);
    expect(full.next()).toBeNull();
  });
});

describe('the hint', () => {
  it('shows nothing before 20 seconds, then the next star of the picture she is on, and keeps showing it until a pin', () => {
    const s = createSolver(0);
    const h = createHint(s);
    expect(h.tick(10)).toBeNull();
    expect(h.tick(9.9)).toBeNull();
    expect(h.tick(0.1)).toEqual({ c: 0, i: 0 });
    expect(h.tick(1)).toEqual({ c: 0, i: 0 });
    s.tap(0, 0);
    h.reset();
    expect(h.tick(5)).toBeNull();
    expect(h.tick(15)).toEqual({ c: 0, i: 1 });
  });
  it('a wrong star does not move the hint along, a pin resets the clock, and the meow asks at once', () => {
    const s = createSolver(0);
    const h = createHint(s);
    h.tick(19);
    s.tap(0, 3); // wrong
    expect(h.tick(1)).toEqual({ c: 0, i: 0 });
    h.reset();
    expect(h.tick(1)).toBeNull();
    h.ask();
    expect(h.tick(0)).toEqual({ c: 0, i: 0 });
    h.reset();
    expect(h.tick(0)).toBeNull();
  });
  it('a negative or zero step does not run the clock backwards or forwards, and there is no hint when every picture is done', () => {
    const s = createSolver(0);
    const h = createHint(s);
    h.tick(-5); h.tick(0); h.tick(NaN);
    expect(h.idle).toBe(0);
    const done = createHint(createSolver(31));
    expect(done.tick(100)).toBeNull();
  });
});

describe('aiming', () => {
  const list = [{ c: 0, i: 0, x: 100, y: 100 }, { c: 0, i: 1, x: 130, y: 100 }, { c: 1, i: 0, x: 400, y: 300 }];
  it('a tap takes the nearest star within the tolerance (40 px on touch), none when none is that near, the first on a tie', () => {
    expect(nearestStar(list, 105, 104, TOLERANCE.touch)).toBe(list[0]);
    expect(nearestStar(list, 125, 100, TOLERANCE.touch)).toBe(list[1]);
    expect(nearestStar(list, 115, 100, TOLERANCE.touch)).toBe(list[0]);
    expect(nearestStar(list, 200, 200, TOLERANCE.touch)).toBeNull();
    expect(nearestStar(list, 139.9, 100, 10)).toBe(list[1]);
    expect(nearestStar(list, 141, 100, 10)).toBeNull();
    expect(nearestStar([], 1, 1, 40)).toBeNull();
    expect(TOLERANCE.touch).toBe(40);
  });
  it('the scale shows at least 40 by 32 degrees on any screen (a phone upright, a television wide)', () => {
    for (const [w, h] of [[960, 540], [390, 760], [1920, 1080], [820, 1180]]) {
      const k = scopeScale(w, h);
      expect(w / k).toBeGreaterThanOrEqual(40 - 1e-6);
      expect(h / k).toBeGreaterThanOrEqual(32 - 1e-6);
    }
  });
  it('angleTo is the short way round', () => {
    expect(angleTo(350, 10)).toBe(20);
    expect(angleTo(10, 350)).toBe(-20);
    expect(angleTo(0, 180)).toBe(-180);
  });
});

describe('the words (both sets, lazy)', () => {
  const ids = ['moon.scope.prompt', 'moon.table.prompt', 'moon.scope.hint', 'moon.goal.scope', 'moon.scope.found', 'moon.scope.cat', 'moon.scope.close', 'moon.scope.hintbtn',
    ...CONSTELLATIONS.map((c) => `moon.star.${c.id}`), 'moon.table.story', 'moon.table.more', 'moon.table.done', 'moon.scope.hmm'];
  it('every new line is there, clean, short, and the same in both sets; the Milky Way line is the one Clan flavour', () => {
    expect(ids).toHaveLength(16 + 1);
    const clan = Object.fromEntries(ids.map((id) => [id, phrase(id)]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(ids.map((id) => [id, phrase(id)])); for (const id of ids) expect(bannedIn(phrase(id)), id).toBeNull(); });
    expect(everyday).toEqual(clan);
    for (const id of ids) { expect(LINES[id], id).toBeTruthy(); expect(clan[id], id).toMatch(/\S/); expect(clan[id].length, id).toBeLessThan(70); }
    expect(clan['moon.scope.hmm']).toBe('Hmm, not that one.');
    expect(phrase('moon.scope.milky')).toBe('Silverpelt is out.');
    withOffWords(() => expect(phrase('moon.scope.milky')).toBe('The Milky Way is out.'));
  });
  it('the journal hint for the star pictures page is there (the page itself is start-up, as milestone 0 left it)', () => {
    expect(HINTS.mnscope).toMatch(/\S/);
  });
});
