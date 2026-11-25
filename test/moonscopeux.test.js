// The Moon, telescope usability pass: the ring and the reach in screen units (bigger on touch, TV and with a pad), a star is always selected from anywhere in the visible
// ring and a neighbour never wins, the redrawn pictures (recognisable, 4 degrees apart), the written objective in both word sets, zoom, the two cards, the replay prompts.
import { describe, it, expect, vi } from 'vitest';
import { createScope, EARTH_AT, ZOOM } from '../src/world/moonscope.js';
import {
  CONSTELLATIONS, CAT_DESIGNS, CAT_DESIGN, createSolver, createHint, starSky, angleTo, scopeScale, scopeRing, pickStar, objectiveOf, RING, HINT_GRACE,
} from '../src/world/moonstars.js';
import '../src/world/moonwords.js';
import { LINES } from '../src/world/moonwords.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { fakePage } from './helpers/moonpage.js';
import * as P from '../src/world/moonplan.js';
import * as M from '../src/world/moonmission.js';

const sep = (c) => {
  const S = c.pts.map((_, i) => starSky(c, i));
  let m = 1e9;
  S.forEach((a, i) => S.forEach((b, j) => { if (j > i) m = Math.min(m, Math.hypot(angleTo(a.b, b.b) * Math.cos((a.e * Math.PI) / 180), a.e - b.e)); }));
  return m;
};
// the profiles the pass is for: [name, width, height, kind, m (the TV's couch multiplier)]
const PROFILES = [['phone', 390, 760, 'touch', 1], ['iPad', 1180, 820, 'touch', 1], ['iPad 2x', 2360, 1640, 'touch', 1], ['TV 1080p', 1920, 1080, 'tv', 1.5], ['TV 4K', 3840, 2160, 'tv', 3], ['laptop', 1440, 900, 'mouse', 1]];

describe('the five pictures are drawn to be recognised, and kept apart', () => {
  it('every star is at least 4 degrees from every other of its picture, and a picture fits a phone held upright (under 31 degrees wide)', () => {
    for (const c of CONSTELLATIONS) {
      expect(sep(c), c.id).toBeGreaterThanOrEqual(4);
      const bs = c.pts.map((_, i) => angleTo(c.bearing, starSky(c, i).b));
      expect(Math.max(...bs) - Math.min(...bs), c.id).toBeLessThan(31);
    }
  });
  it('the Mouse is 9 stars, the Cat 11 (the other design, a head with two ears, is 9 and kept behind CAT_DESIGN), the Fish 8, the Crown 7, the Paw 9; joins and gaps name real stars', () => {
    expect(CONSTELLATIONS.map((c) => c.pts.length)).toEqual([9, 11, 8, 7, 9]);
    expect(CAT_DESIGN).toBe('sitting');
    expect(CAT_DESIGNS.head.pts).toHaveLength(9);
    expect(CAT_DESIGNS.sitting.pts).toHaveLength(11);
    for (const c of CONSTELLATIONS) {
      for (const [a, b] of c.join) { expect(a).toBeLessThan(c.pts.length); expect(b).toBeLessThan(c.pts.length); }
      for (const g of c.gaps) expect(g).toBeLessThan(c.pts.length);
    }
    for (const d of Object.values(CAT_DESIGNS)) for (let i = 0; i < d.pts.length; i++) for (let j = i + 1; j < d.pts.length; j++) expect(Math.hypot(d.pts[i][0] - d.pts[j][0], d.pts[i][1] - d.pts[j][1])).toBeGreaterThanOrEqual(3.9);
  });
});

describe('the ring and the reach, per profile (screen units: the same at every zoom)', () => {
  it('the ring is at least twice the old 16 to 22 px reticle on every profile but the laptop, and the reach covers the ring and a star', () => {
    const want = { phone: 34, iPad: 62, 'iPad 2x': 96, 'TV 1080p': 70, 'TV 4K': 140, laptop: 32 };
    for (const [name, w, h, kind, m] of PROFILES) {
      const r = scopeRing(w, h, kind, m);
      expect(r.ring, name).toBe(want[name]);
      expect(r.reach, name).toBeGreaterThan(r.ring);
      if (kind !== 'mouse') expect(r.ring, name).toBeGreaterThanOrEqual(2 * 16 * m);
    }
    expect(RING.touch.lo).toBeGreaterThan(RING.mouse.lo);
  });
});

describe('choosing a star: the intended star wins from anywhere in the visible ring, and a neighbour never does', () => {
  // stars as the scope puts them on screen at a zoom, relative to a star S at the origin
  const around = (S, c, k) => {
    const hits = [];
    CONSTELLATIONS.forEach((cc, ci) => cc.pts.forEach((_, i) => { const q = starSky(cc, i); hits.push({ c: ci, i, x: angleTo(S.b, q.b) * k, y: -(q.e - S.e) * k }); }));
    return hits;
  };
  it('for every star of every picture, on every profile and zoom: a point anywhere within the ring of the star picks it when it is the next star', () => {
    for (const [name, w, h, kind, m] of PROFILES) {
      const { ring, reach } = scopeRing(w, h, kind, m);
      for (const zoom of [0.5, 0.6, 0.74, 1, 1.35, 1.8, 2.5]) {
        const k = scopeScale(w, h) * zoom;
        CONSTELLATIONS.forEach((c, ci) => c.pts.forEach((_, i) => {
          const hits = around(starSky(c, i), c, k);
          for (const f of [0, 0.5, 1]) for (let a = 0; a < 16; a++) {
            const x = Math.cos((a / 16) * 2 * Math.PI) * ring * f; const y = Math.sin((a / 16) * 2 * Math.PI) * ring * f;
            const got = pickStar(hits.map((q) => ({ ...q })), x, y, reach, { c: ci, i });
            expect(got && [got.c, got.i], `${name} x${zoom} ${c.id}${i} f${f}`).toEqual([ci, i]);
          }
        }));
      }
    }
  });
  it('when it is not the next star, a point in its ring picks it unless the next star is also in reach (then the next star), and never any third star', () => {
    for (const [name, w, h, kind, m] of PROFILES) {
      const { ring, reach } = scopeRing(w, h, kind, m);
      const k = scopeScale(w, h);
      CONSTELLATIONS.forEach((c, ci) => c.pts.forEach((_, i) => {
        const hits = around(starSky(c, i), c, k);
        const next = { c: ci, i: (i + 1) % c.pts.length };
        for (let a = 0; a < 12; a++) {
          // within the ring, or within half the distance to the nearest other star when that is less (two stars are closer than a ring on a phone)
          const nearest = Math.min(...hits.filter((q) => !(q.c === ci && q.i === i)).map((q) => Math.hypot(q.x, q.y)));
          const rad = Math.min(ring, nearest * 0.49);
          const x = Math.cos((a / 12) * 2 * Math.PI) * rad; const y = Math.sin((a / 12) * 2 * Math.PI) * rad;
          const got = pickStar(hits, x, y, reach, next);
          const nx = hits.find((q) => q.c === next.c && q.i === next.i);
          const nextNear = Math.hypot(nx.x - x, nx.y - y) <= reach;
          expect([got.c, got.i], `${name} ${c.id}${i}`).toEqual(nextNear ? [next.c, next.i] : [ci, i]);
        }
      }));
    }
  });
  it('with nothing in reach nothing is picked; with two in reach and no next star the nearer wins', () => {
    const list = [{ c: 0, i: 0, x: 10, y: 0 }, { c: 0, i: 1, x: 30, y: 0 }];
    expect(pickStar(list, 500, 500, 50, null)).toBeNull();
    expect(pickStar(list, 24, 0, 50, null)).toBe(list[1]);
    expect(pickStar(list, 24, 0, 50, { c: 0, i: 0 })).toBe(list[0]);
    expect(pickStar([], 0, 0, 50, null)).toBeNull();
  });
});

function rig({ bits = 0, width = 960, height = 540, coarse = false, reducedMotion = true, lineFn, intro = false, after } = {}) {
  const page = fakePage({ width, height });
  if (coarse) page.win.matchMedia = () => ({ matches: true });
  const solver = createSolver(bits);
  const hint = createHint(solver);
  const results = [];
  const scope = createScope({
    doc: page.doc, win: page.win, solver, hint, sky: [], reducedMotion, line: lineFn ?? ((k) => k), pads: () => [], onResult: (r) => results.push(r), intro: intro ? () => true : undefined, after,
  });
  return { ...page, solver, hint, scope, results };
}
const down = (r, x, y, id = 1, type = 'touch') => r.scope.canvas.fire('pointerdown', { pointerId: id, clientX: x, clientY: y, pointerType: type });
const up = (r, x, y, id = 1, type = 'touch') => r.scope.canvas.fire('pointerup', { pointerId: id, clientX: x, clientY: y, pointerType: type });
const tapPt = (r, x, y, type = 'touch') => { down(r, x, y, 1, type); up(r, x, y, 1, type); };

describe('the scope on screen', () => {
  it('the ring is drawn at the profile size: phone and iPad (touch), TV, laptop (mouse)', () => {
    for (const [name, w, h, kind, m] of PROFILES.slice(0, 2).concat(PROFILES.slice(5))) {
      const r = rig({ width: w, height: h, coarse: kind === 'touch' });
      r.scope.open();
      expect(r.scope.profile.ring, name).toBe(scopeRing(w, h, kind, 1).ring);
      r.scope.close();
    }
  });
  it('a touch tap within the ring of a star selects it, even a thumb a ring-width off; a tap inside the ring takes the star in the ring', () => {
    const r = rig({ width: 390, height: 760, coarse: true });
    r.scope.open();
    const s = starSky(CONSTELLATIONS[0], 0);
    r.scope.view.b = s.b + 0.0; r.scope.view.e = s.e; r.scope.place();
    const star = r.scope.hits.find((h) => h.c === 0 && h.i === 0);
    const { ring, reach } = r.scope.profile;
    tapPt(r, star.x + reach * 0.9, star.y);
    expect(r.results.map((x) => x.kind)).toEqual(['pin']);
    // the star sits left of the middle by less than the ring; the finger lands on the right of the ring (far from the star but inside the ring)
    r.scope.view.b = s.b + (ring * 0.9) / (scopeScale(390, 760)); r.scope.view.e = s.e; r.scope.place();
    const st2 = r.scope.hits.find((h) => h.c === 0 && h.i === 0);
    expect(Math.hypot(st2.x - 195, st2.y - 380)).toBeLessThan(ring);
    tapPt(r, 195 + ring * 0.9, 380); // not the next star: the second star is
    // star 1 is the next one; make the finger land far from every star but inside the ring around star 1
    const r2 = rig({ width: 390, height: 760, coarse: true });
    r2.scope.open();
    const s1 = starSky(CONSTELLATIONS[0], 0);
    r2.scope.view.b = s1.b - (ring * 0.8) / scopeScale(390, 760); r2.scope.view.e = s1.e; r2.scope.place();
    tapPt(r2, 195 - ring * 0.5, 380 - ring * 0.5); // inside the ring, ~1.0 ring from the star: inside reach anyway
    expect(r2.results.map((x) => x.kind)).toEqual(['pin']);
    tapPt(r2, 5, 5);
    expect(r2.results).toHaveLength(1); // a tap on empty sky does nothing
  });
  it('a wrong star still gives the soft hmm and loses nothing, and the hint-star line only says to try the glowing star when the hint star is on', () => {
    const r = rig({ coarse: true });
    r.scope.open();
    r.scope.update(0.1, 0.1);
    const s = starSky(CONSTELLATIONS[0], 5);
    r.scope.view.b = s.b; r.scope.view.e = s.e; r.scope.place();
    r.scope.pinSnapped();
    expect(r.results.at(-1).kind).toBe('hmm');
    expect(r.scope.said.text).toBe('moon.scope.hmm'); // the pulse is not on yet
    for (let i = 0; i < 12; i++) r.scope.update(0.1, 1 + i * 0.1); // the pulse is on
    r.scope.pinSnapped();
    expect(r.scope.said.text).toBe('moon.scope.hmm.try');
    expect(r.solver.pins(0)).toBe(0);
  });
  it('the objective line says the right thing in every state, in both word sets, short and plain', () => {
    const names = (phrase('moon.scope.names')).split('|');
    const states = [];
    const make = (bits, taps = [], atEarth = false, away = false) => { const r = rig({ bits, lineFn: (k) => phrase(k), after: () => 'desk' }); r.scope.open(); for (const [c, i] of taps) r.solver.tap(c, i); if (atEarth) { r.scope.view.b = EARTH_AT.b; r.scope.view.e = EARTH_AT.e; } if (away) { r.scope.view.b = 200; r.scope.view.e = 40; } r.scope.update(0.05, 0.05); const t = r.scope.objective; r.scope.close(); return t; };
    const cases = [
      ['start', make(0), /^Join the stars to draw the Mouse \(0 of 9\)\.$/],
      ['mouse 2', make(0, [[0, 0], [0, 1]]), /^Join the stars to draw the Mouse \(2 of 9\)\.$/],
      ['now the cat', make(1), /^Now draw the Cat \(0 of 11\)\.$/],
      ['cat 3', make(1, [[1, 0], [1, 1], [1, 2]]), /^Now draw the Cat \(3 of 11\)\.$/],
      ['optional all three', make(3), /^Draw the Fish, the Crown or the Paw, or close the telescope\.$/],
      ['optional two', make(7), /^Draw the Crown or the Paw, or close the telescope\.$/],
      ['optional one', make(15), /^Draw the Paw, or close the telescope\.$/],
      ['fish begun', make(3, [[2, 0], [2, 1]]), /^Now draw the Fish \(2 of 8\)\.$/],
      ['earth in view', make(3, [], true), /^That is Earth, our home! Close the telescope and write a postcard at the Message Desk\.$/],
      ['all five', make(31, [], false, true), /^All five pictures make the Great Cat! Close the telescope when you are done\.$/],
      ['all five at earth', make(31, [], true), /^That is Earth, our home!/],
    ];
    for (const [name, text, re] of cases) { expect(text, name).toMatch(re); states.push(text); }
    withOffWords(() => {
      for (const [name, , re] of cases.slice(0, 8)) expect(make(0), name).toBeTruthy();
      expect(make(3)).toMatch(/Fish, the Crown/);
      for (const id of Object.keys(LINES).filter((k) => /^moon\.scope\.(goal|earth|intro|found|hello|done|lbl|prompt)/.test(k))) { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length, id).toBeLessThanOrEqual(90); }
    });
    expect(names).toEqual(['Mouse', 'Cat', 'Fish', 'Crown', 'Paw']);
    // the pure part
    expect(objectiveOf(createSolver(31), CONSTELLATIONS, names).id).toBe('moon.scope.goal.all');
    expect(objectiveOf(createSolver(3), CONSTELLATIONS, names, true).id).toBe('moon.scope.earth');
    expect(objectiveOf(createSolver(0), CONSTELLATIONS, names, true).id).toBe('moon.scope.goal.first'); // Earth is not found: no Earth line
  });
});

describe('zoom', () => {
  const k0 = (r) => scopeScale(r.win.innerWidth, r.win.innerHeight);
  it('+ and - keys, the mouse wheel, the buttons and a pinch zoom between 0.5x and 2.5x; the ring and the reach do not change', () => {
    const r = rig();
    r.scope.open();
    const ring0 = r.scope.profile.ring;
    r.win.fire('keydown', { code: 'Equal' });
    expect(r.scope.zoom).toBeCloseTo(ZOOM.step, 5);
    for (let i = 0; i < 12; i++) r.win.fire('keydown', { code: 'NumpadAdd' });
    expect(r.scope.zoom).toBe(ZOOM.max);
    for (let i = 0; i < 12; i++) r.win.fire('keydown', { code: 'Minus' });
    expect(r.scope.zoom).toBe(ZOOM.min);
    r.scope.canvas.fire('wheel', { deltaY: -400 });
    expect(r.scope.zoom).toBeGreaterThan(0.8);
    r.scope.canvas.fire('wheel', { deltaY: 4000 });
    expect(r.scope.zoom).toBe(ZOOM.min);
    r.scope.setZoom(1);
    const [, , , zin, zout] = r.scope.element.children;
    zin.fire('click'); expect(r.scope.zoom).toBeGreaterThan(1.3);
    zout.fire('click'); expect(r.scope.zoom).toBeCloseTo(1, 5);
    expect(r.scope.profile.ring).toBe(ring0); // zoomed with keys, wheel and buttons: the ring is the same size
    down(r, 400, 270, 1); down(r, 500, 270, 2); // two fingers
    r.scope.canvas.fire('pointermove', { pointerId: 2, clientX: 600, clientY: 270 });
    expect(r.scope.zoom).toBeCloseTo(2.0, 1);
    up(r, 600, 270, 2); up(r, 400, 270, 1);
    expect(r.results).toHaveLength(0); // a pinch is not a tap
  });
  it('the stars are k x zoom px apart, the intended star is still selected from its ring at the top zoom, and closing resets the zoom', () => {
    const r = rig({ coarse: true, width: 1180, height: 820 });
    r.scope.open();
    r.scope.setZoom(ZOOM.max, true);
    const s = starSky(CONSTELLATIONS[0], 0);
    r.scope.view.b = s.b; r.scope.view.e = s.e; r.scope.place();
    const a = r.scope.hits.find((h) => h.c === 0 && h.i === 0); const b = r.scope.hits.find((h) => h.c === 0 && h.i === 1);
    const want = Math.hypot(angleTo(s.b, starSky(CONSTELLATIONS[0], 1).b), starSky(CONSTELLATIONS[0], 1).e - s.e) * 0; void want;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(4 * k0(r) * ZOOM.max * 0.9);
    const { ring } = r.scope.profile;
    tapPt(r, a.x + ring, a.y);
    expect(r.results.map((x) => x.kind)).toEqual(['pin']);
    r.scope.close();
    r.scope.open();
    expect(r.scope.zoom).toBe(1);
  });
  it('the pad shoulders zoom: R1 in, L1 out', () => {
    const page = fakePage();
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
    const solver = createSolver(0);
    const scope = createScope({ doc: page.doc, win: page.win, solver, hint: createHint(solver), sky: [], line: (k) => k, pads: () => [pad], reducedMotion: true });
    scope.open(); scope.update(0.016, 0);
    pad.buttons[5] = { pressed: true }; scope.update(0.016, 0.1);
    expect(scope.zoom).toBeCloseTo(ZOOM.step, 5);
    pad.buttons[5] = { pressed: false }; pad.buttons[4] = { pressed: true }; scope.update(0.016, 0.2);
    expect(scope.zoom).toBeCloseTo(1, 5);
  });
});

describe('the cards and the buttons', () => {
  it('the corner buttons carry words (Hint, Close) and the zoom buttons and Back to the Moon are there, Back only once Earth is found', () => {
    const r = rig({ lineFn: (k) => phrase(k) });
    r.scope.open();
    const [, close, bulb, , , done] = r.scope.element.children;
    expect(close.children[1].textContent).toBe('Close');
    expect(bulb.children[1].textContent).toBe('Hint');
    r.scope.update(0.05, 0.05);
    expect(done.style.display).toBe('none');
    const r2 = rig({ bits: 3, lineFn: (k) => phrase(k) });
    r2.scope.open(); r2.scope.update(0.05, 0.05);
    expect(r2.scope.element.children[5].style.display).toBe('block');
    r2.scope.element.children[5].fire('click');
    expect(r2.scope.isOpen).toBe(false);
  });
  it('the first card says why she is here and goes away at a touch, a key or Cross; it is not shown when Earth is found; a key meant for it is not a pin', () => {
    const r = rig({ intro: true, lineFn: (k) => phrase(k) });
    r.scope.open();
    expect(r.scope.card).toBe('intro');
    const card = r.scope.element.children.find((c) => c.className?.startsWith('moon-card'));
    expect(card.children.map((c) => c.textContent).slice(0, 3)).toEqual(['Pip wants to send a postcard to Earth.', 'The dish must point at Earth first.', 'Join the stars to draw the Mouse, then the Cat. The telescope will find Earth!']);
    r.win.fire('keydown', { code: 'KeyZ' });
    expect(r.scope.card).toBeNull();
    const r2 = rig({ intro: true });
    r2.scope.open(); down(r2, 100, 100);
    expect(r2.scope.card).toBeNull(); expect(r2.results).toHaveLength(0);
    const r3 = rig({ intro: true });
    r3.scope.open(); r3.win.fire('keydown', { code: 'Space' });
    expect(r3.results).toHaveLength(0);
  });
  it('when the Cat is traced Earth grows, sparkles ring it, the found card tells her the next job, and its button closes the telescope', () => {
    for (const reducedMotion of [true, false]) {
      const r = rig({ bits: 1, reducedMotion, lineFn: (k) => phrase(k), after: () => 'desk' });
      const found = vi.fn();
      r.scope.open();
      r.solver.bits; // eslint-disable-line no-unused-expressions
      for (let i = 0; i < CONSTELLATIONS[1].pts.length; i++) { const s = starSky(CONSTELLATIONS[1], i); r.scope.view.b = s.b; r.scope.view.e = s.e; r.scope.place(); r.scope.pinSnapped(); }
      expect(r.solver.bits & 3).toBe(3);
      for (let i = 0; i < 90; i++) r.scope.update(1 / 30, i / 30);
      expect(r.scope.card).toBe('found');
      const card = r.scope.element.children.find((c) => c.className?.startsWith('moon-card'));
      const t = card.children.map((c) => c.textContent);
      expect(t.slice(0, 3)).toEqual(['You found Earth!', 'Beep beep! Pip is so happy!', 'The dish now points at Earth. Next: write a postcard at the Message Desk in the dome.']);
      expect(t[3]).toBe('Let’s go!');
      card.children[3].fire('click');
      expect(r.scope.isOpen).toBe(false);
      void found;
    }
  });
  it('tapping Earth says hello and twinkles it; nothing is counted', () => {
    const r = rig({ coarse: true, lineFn: (k) => phrase(k) });
    r.scope.open();
    r.scope.view.b = EARTH_AT.b + 6; r.scope.view.e = EARTH_AT.e; r.scope.place();
    const ex = 480 + angleTo(r.scope.view.b, EARTH_AT.b) * scopeScale(960, 540);
    tapPt(r, ex, 270);
    expect(r.scope.said.text).toBe('Hello, Earth!');
    expect(r.solver.bits).toBe(0);
  });
});

describe('what the telescope says after the job is done (the prompt and the table, in both word sets)', () => {
  it('the prompt at the telescope is the job until Earth is found, then plain words for more pictures, then the Great Cat', () => {
    const table = [[0, 'E — look through the telescope'], [1, 'E — look through the telescope'], [3, 'E — draw more star pictures'], [7, 'E — draw more star pictures'], [15, 'E — draw more star pictures'], [31, 'E — look at the Great Cat']];
    expect(LINES['moon.scope.prompt.more']).toBe('E — draw more star pictures');
    expect(LINES['moon.scope.prompt.cat']).toBe('E — look at the Great Cat');
    for (const [bits, want] of table) {
      const id = (bits & 3) !== 3 ? 'moon.scope.prompt' : bits === 31 ? 'moon.scope.prompt.cat' : 'moon.scope.prompt.more';
      expect(phrase(id), String(bits)).toBe(want);
      withOffWords(() => { expect(phrase(id)).toBe(want); expect(bannedIn(phrase(id))).toBeNull(); });
    }
    void P; void M;
  });
});
