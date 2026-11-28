import { describe, it, expect } from 'vitest';
import {
  bandFactor, BAND_LEN, BAND_MIN, createFollow, FOLLOW_IDLE_S, FOLLOW_FAR, FOLLOW_STOP,
  createHold, HOLD_S, edgeMarker, EDGE_PX, createToastQueue, MERGE_S, KEEP, STALE_S,
} from '../src/coop/rules.js';
import { CSS, FLOOR_BODY, FLOOR_SMALL, createCoopHud } from '../src/coop/hud.js';
import { LINES } from '../src/coop/words.js';
import { phrase } from '../src/clanphrases.js';
import { setSeriesMode, addWordSet, removeWordSet } from '../src/wordset.js';
import * as off from '../src/offclanwords.js';
import { plainify } from '../src/tv/glyphs.js';

// Couch play, milestone 2: each rule alone, with a fake clock (nothing here reads real time).
const DT = 1 / 60;
const run = (n, f) => { let last; for (let i = 0; i < n; i++) last = f(DT); return last; };

describe('the rubber band', () => {
  it('keeps every step in the open, slows to 35 % over the last 3 m, and never touches moving closer (the caller only asks for the away part)', () => {
    const limit = 21;
    expect(bandFactor(0, limit)).toBe(1);
    expect(bandFactor(limit - BAND_LEN, limit)).toBe(1);
    expect(bandFactor(limit - BAND_LEN / 2, limit)).toBeCloseTo((1 + BAND_MIN) / 2, 6);
    expect(bandFactor(limit, limit)).toBeCloseTo(BAND_MIN, 6);
    expect(bandFactor(limit + 5, limit)).toBeCloseTo(BAND_MIN, 6);
    let last = 1;
    for (let r = limit - 3; r <= limit; r += 0.25) { const f = bandFactor(r, limit); expect(f).toBeLessThanOrEqual(last + 1e-9); last = f; }
  });
});

describe('follow when idle', () => {
  const step = (f, o) => run(1, (dt) => f.step(dt, o));
  it('starts after 3 s of no stick, at more than 8 m, and stops at 3 m', () => {
    const f = createFollow();
    expect(run(60 * 2, (dt) => f.step(dt, { apart: 12 }))).toBe(false);
    expect(run(60 * 1.2, (dt) => f.step(dt, { apart: 12 }))).toBe(true);
    expect(FOLLOW_IDLE_S).toBe(3); expect(FOLLOW_FAR).toBe(8); expect(FOLLOW_STOP).toBe(3);
    expect(f.step(DT, { apart: 5 })).toBe(true);
    expect(f.step(DT, { apart: 3 })).toBe(false);
    expect(f.step(DT, { apart: 5 })).toBe(false); // it stopped; it starts again only after resting again
  });
  it('never starts within 8 m, and any stick cancels it at once', () => {
    const f = createFollow();
    expect(run(60 * 10, (dt) => f.step(dt, { apart: 7.9 }))).toBe(false);
    run(60 * 4, (dt) => f.step(dt, { apart: 15 }));
    expect(f.going).toBe(true);
    expect(step(f, { apart: 15, stick: 0.2 })).toBe(false);
    expect(step(f, { apart: 15 })).toBe(false); // the rest begins again
  });
  it('is off when the setting is off', () => {
    const f = createFollow();
    expect(run(60 * 10, (dt) => f.step(dt, { apart: 20, on: false }))).toBe(false);
  });
});

describe('hold D-pad Down', () => {
  it('fills over 0.8 s, fires once, and fires again only after a release', () => {
    const h = createHold();
    const out = [];
    for (let i = 0; i < 60 * 2; i++) out.push(h.step(DT, true));
    expect(out.filter((o) => o.fired)).toHaveLength(1);
    expect(out[Math.floor(HOLD_S * 60) - 10].progress).toBeGreaterThan(0.8);
    expect(out[Math.floor(HOLD_S * 60) - 10].progress).toBeLessThan(1);
    expect(h.step(DT, false).fired).toBe(false);
    run(Math.ceil(HOLD_S * 60) + 2, (dt) => h.step(dt, true));
    expect(h.step(DT, false).progress).toBe(0);
  });
  it('a short hold is nothing; two quick taps are the other way', () => {
    const h = createHold();
    run(30, (dt) => h.step(dt, true)); // 0.5 s: more than a tap, less than a hold
    expect(h.step(DT, false).fired).toBe(false);
    run(60, (dt) => h.step(dt, false));
    run(6, (dt) => h.step(dt, true)); run(6, (dt) => h.step(dt, false));
    const second = run(6, (dt) => h.step(dt, true));
    const rel = h.step(DT, false);
    expect(second.fired || rel.fired).toBe(true);
  });
  it('two taps too far apart are not "twice"', () => {
    const h = createHold();
    run(5, (dt) => h.step(dt, true)); run(60, (dt) => h.step(dt, false));
    run(5, (dt) => h.step(dt, true));
    expect(h.step(DT, false).fired).toBe(false);
  });
});

describe('edge markers', () => {
  it('none for a cat in the picture; one inside the safe margins, at least 48 px, pointing the way, for a cat out of it', () => {
    expect(edgeMarker({ x: 0.4, y: -0.2, z: 0.5 }, 1920, 1080).show).toBe(false);
    const m = edgeMarker({ x: 3, y: 0, z: 0.9 }, 1920, 1080);
    expect(m.show).toBe(true);
    expect(m.x).toBeCloseTo(1920 - 0.05 * 1920 - EDGE_PX / 2, 4);
    expect(m.y).toBeCloseTo(540, 4);
    expect(m.angle).toBeCloseTo(0, 6);
    expect(EDGE_PX).toBeGreaterThanOrEqual(48);
    const up = edgeMarker({ x: 0, y: 5, z: 0.9 }, 1920, 1080);
    expect(up.y).toBeCloseTo(0.05 * 1080 + EDGE_PX / 2, 4);
    expect(up.angle).toBeCloseTo(-Math.PI / 2, 6);
    for (const [x, y] of [[9, 9], [-9, 2], [2, -9], [-0.5, 7]]) {
      const e = edgeMarker({ x, y, z: 0.5 }, 1280, 720);
      expect(e.x).toBeGreaterThanOrEqual(0.05 * 1280 + EDGE_PX / 2 - 1e-6);
      expect(e.x).toBeLessThanOrEqual(1280 * 0.95 - EDGE_PX / 2 + 1e-6);
      expect(e.y).toBeGreaterThanOrEqual(0.05 * 720 + EDGE_PX / 2 - 1e-6);
      expect(e.y).toBeLessThanOrEqual(720 * 0.95 - EDGE_PX / 2 + 1e-6);
    }
  });
  it('a cat behind the camera points the opposite way, and the tight-place rule can force a marker inside the picture', () => {
    const b = edgeMarker({ x: 0.5, y: 0, z: 1.4 }, 1920, 1080);
    expect(b.show).toBe(true);
    expect(b.x).toBeLessThan(960);
    expect(edgeMarker({ x: 0.9, y: 0, z: 0.5 }, 1920, 1080, EDGE_PX, true).show).toBe(true);
  });
});

describe('the toast queue', () => {
  const rig = (ms = 3000) => {
    const shown = [];
    const q = createToastQueue({ emit: (i) => shown.push(i), life: () => ms });
    const tick = (s) => run(Math.round(s * 60), (dt) => q.tick(dt));
    return { q, shown, tick };
  };
  it('shows one line at a time, each for its life, in order', () => {
    const { q, shown, tick } = rig();
    q.push({ slot: 0, one: 'a', found: false }); q.push({ slot: 1, one: 'b', found: false });
    tick(0.1);
    expect(shown.map((s) => s.text)).toEqual(['a']);
    tick(2.5);
    expect(shown).toHaveLength(1);
    tick(1);
    expect(shown.map((s) => s.text)).toEqual(['a', 'b']);
    expect(shown[1].slots).toEqual([1]);
  });
  it('two finds of the same thing within 1.5 s fold into one "both" line, on screen or waiting', () => {
    const a = rig();
    a.q.push({ key: 'k', slot: 0, one: 'one', both: 'both' }); a.tick(0.1);
    a.tick(MERGE_S - 0.5);
    a.q.push({ key: 'k', slot: 1, one: 'one', both: 'both' });
    expect(a.shown.map((s) => [s.text, s.merge])).toEqual([['one', false], ['both', true]]);
    expect(a.shown[1].slots).toEqual([0, 1]);
    const b = rig();
    b.q.push({ slot: 0, one: 'busy', found: false }); b.tick(0.1);
    b.q.push({ key: 'k', slot: 0, one: 'one', both: 'both' });
    b.tick(0.5);
    b.q.push({ key: 'k', slot: 1, one: 'one', both: 'both' });
    b.tick(4);
    expect(b.shown.map((s) => s.text)).toEqual(['busy', 'both']);
  });
  it('does not fold a find 1.5 s or more later, or the same cat twice', () => {
    const { q, shown, tick } = rig();
    q.push({ key: 'k', slot: 0, one: 'one', both: 'both' }); tick(0.1);
    tick(MERGE_S + 0.2);
    q.push({ key: 'k', slot: 1, one: 'again', both: 'both' });
    q.push({ key: 'k', slot: 1, one: 'again2', both: 'both' });
    tick(8);
    expect(shown.map((s) => s.text)).not.toContain('both');
  });
  it('keeps the latest four waiting and never shows a found line late', () => {
    const { q, shown, tick } = rig();
    q.push({ slot: 0, one: 'busy', found: false }); tick(0.1);
    for (let i = 0; i < KEEP + 3; i++) q.push({ slot: i % 2, one: `f${i}` });
    expect(q.waiting).toBe(KEEP);
    tick(STALE_S + 1);
    tick(20);
    expect(shown.map((s) => s.text)).not.toContain('f0');
    const old = rig(30000); // a long line holds the screen
    old.q.push({ slot: 0, one: 'busy', found: false }); old.tick(0.1);
    old.q.push({ slot: 0, one: 'stale' });
    old.tick(STALE_S + 1);
    expect(old.q.waiting).toBe(0);
    expect(old.shown.map((s) => s.text)).toEqual(['busy']);
  });
});

describe('the HUD pieces keep the TV floors', () => {
  it('every TV font size in the chunk\'s CSS is at least 24 px (20 px for the small chip)', () => {
    const tv = [...CSS.matchAll(/html\.tv[^{]*\{[^}]*font-size:(\d+)px/g)].map((m) => Number(m[1]));
    expect(tv.length).toBeGreaterThan(1);
    for (const px of tv) expect(px).toBeGreaterThanOrEqual(FLOOR_BODY);
    const all = [...CSS.matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));
    for (const px of all) expect(px).toBeGreaterThanOrEqual(FLOOR_SMALL);
    expect(FLOOR_BODY).toBe(24); expect(FLOOR_SMALL).toBe(20);
  });
  it('the edge marker is 48 px square or more, the slots at most 30 % wide, and everything sits inside the 5 % margins', () => {
    expect(CSS).toMatch(new RegExp(`\\.coop-edge\\{[^}]*width:${EDGE_PX}px;height:${EDGE_PX}px`));
    expect(CSS).toMatch(/\.coop-slot\{[^}]*max-width:30vw/);
    expect(CSS).toMatch(/\.coop-slot\.left\{left:5vw\}/);
    expect(CSS).toMatch(/\.coop-slot\.right\{right:5vw/);
    expect(CSS).toMatch(/\.coop-chip\{top:max\(5vh/);
  });
  it('a shape as well as a colour: circle for cat one, diamond for cat two, on the markers', () => {
    expect(CSS).toMatch(/\.coop-edge\.s0\{border-radius:50%\}/);
    expect(CSS).toMatch(/\.coop-edge\.s1\{clip-path:polygon/);
  });
  it('the hud object builds with a fake page and tidies up', () => {
    class El { constructor() { this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.hidden = false; }
      setAttribute(k, v) { this.attrs[k] = v; } appendChild(c) { this.children.push(c); c.parent = this; return c; } append(...c) { c.forEach((x) => this.appendChild(x)); }
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); } }
    const doc = { createElement: () => new El(), body: new El(), head: new El(), documentElement: { classList: { add() {}, remove() {} } } };
    const hud = createCoopHud({ doc });
    hud.edge(1, { show: true, x: 100, y: 80, angle: 1 }, 'x');
    expect(hud.edges[1].hidden).toBe(false);
    hud.dispose();
    expect(doc.body.children).toHaveLength(0);
  });
});

describe('the new words, in both word sets', () => {
  const NEW = ['coop.hophint', 'coop.following', 'coop.found', 'coop.foundboth', 'coop.edge'];
  for (const mode of ['on', 'off']) {
    it(`${mode}: each new line reads, carries the cat's name where it should, and no button name`, () => {
      setSeriesMode(mode);
      try {
        for (const id of NEW) expect(Object.keys(LINES)).toContain(id);
        expect(phrase('coop.found', 'Pip', 'a golden mouse')).toBe('Pip found a golden mouse');
        expect(phrase('coop.foundboth', 'a golden mouse')).toBe('You both found a golden mouse');
        expect(phrase('coop.following', 'Pip')).toContain('Pip');
        expect(phrase('coop.edge', 'Pip')).toContain('Pip');
        expect(plainify(phrase('coop.hophint'), 'ps')).toBe('Hold ✚ down to hop to your friend');
        expect(plainify(phrase('coop.hophint'), 'xbox')).not.toContain('⟦');
        for (const t of [phrase('coop.found', 'Pip', 'x'), phrase('coop.hophint'), phrase('coop.edge', 'Pip')]) expect(t).not.toMatch(/player\s*[12]|clan|warrior/i);
      } finally { setSeriesMode('on'); }
    });
  }
});
