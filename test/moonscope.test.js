// The Moon, milestone 5: the telescope overlay (src/world/moonscope.js). Opens an opaque page, pans and pins by touch, mouse, pad and keyboard,
// a wrong star is a soft hmm that loses nothing, the hint pulses at once, closing frees the canvas and every listener.
import { describe, it, expect, vi } from 'vitest';
import { createScope, EARTH_AT, PAN_SPEED } from '../src/world/moonscope.js';
import { CONSTELLATIONS, createSolver, createHint, starSky, angleTo, STORY_BITS } from '../src/world/moonstars.js';
import { fakePage } from './helpers/moonpage.js';

function rig({ bits = 0, pads = [], reducedMotion = false } = {}) {
  const page = fakePage();
  const solver = createSolver(bits);
  const hint = createHint(solver);
  const results = [];
  const closed = vi.fn();
  const asked = vi.fn();
  const scope = createScope({
    doc: page.doc, win: page.win, solver, hint, sky: [{ b: 10, e: 30, m: 1 }, { b: 200, e: 60, m: 0.5 }], reducedMotion,
    line: (k) => k, pads: () => pads, onResult: (r) => results.push(r), onClose: closed, onAsk: asked,
  });
  return { ...page, solver, hint, scope, results, closed, asked };
}
// put the view on star i of picture c
const aimAt = (r, c, i) => { const s = starSky(CONSTELLATIONS[c], i); r.scope.view.b = s.b; r.scope.view.e = s.e; r.scope.place(); return s; };

describe('opening and closing', () => {
  it('opens one opaque full-screen page with a canvas the size of the window, a close button and a hint button, each with a name for a screen reader', () => {
    const r = rig();
    expect(r.scope.open()).toBe(true);
    expect(r.scope.isOpen).toBe(true);
    const root = r.doc.body.children[0];
    expect(root).toBe(r.scope.element);
    expect(root.style.position).toBe('fixed');
    expect(root.style.background).toMatch(/^#0/); // opaque
    const [canvas, close, bulb] = root.children;
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(540);
    expect(close.attrs['aria-label']).toBe('moon.scope.close');
    expect(bulb.attrs['aria-label']).toBe('moon.scope.hintbtn');
    expect(r.scope.open()).toBe(false); // already open
    expect(r.doc.body.children).toHaveLength(1);
  });
  it('closing frees the canvas\'s pixels, removes the page and every listener, and tells the life', () => {
    const r = rig();
    r.scope.open();
    const canvas = r.scope.canvas;
    expect(r.win.count()).toBeGreaterThan(0);
    expect(r.scope.close()).toBe(true);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(r.doc.body.children).toHaveLength(0);
    expect(r.win.count()).toBe(0);
    expect(canvas.count()).toBe(0);
    expect(r.closed).toHaveBeenCalledTimes(1);
    expect(r.scope.isOpen).toBe(false);
    expect(r.scope.close()).toBe(false);
    r.scope.update(1, 1); // a frame after closing draws nothing and throws nothing
    expect(r.closed).toHaveBeenCalledTimes(1);
  });
  it('a page opened and closed 20 times leaves nothing behind', () => {
    const r = rig();
    for (let i = 0; i < 20; i++) { r.scope.open(); r.scope.close(); }
    expect(r.doc.body.children).toHaveLength(0);
    expect(r.win.count()).toBe(0);
  });
  it('opens on the first picture still to do (the Mouse, then the Cat), on Earth when all five are done', () => {
    for (const [bits, want] of [[0, CONSTELLATIONS[0]], [1, CONSTELLATIONS[1]], [3, CONSTELLATIONS[2]], [31, { bearing: EARTH_AT.b, elev: EARTH_AT.e }]]) {
      const r = rig({ bits });
      r.scope.open();
      expect(r.scope.view.b, `bits ${bits}`).toBeCloseTo(want.bearing, 6);
      expect(r.scope.view.e).toBeCloseTo(want.elev, 6);
      r.scope.close();
    }
  });
  it('the cross and the bulb buttons close it and ask for the hint', () => {
    const r = rig();
    r.scope.open();
    const [, close, bulb] = r.scope.element.children;
    bulb.fire('click');
    expect(r.asked).toHaveBeenCalledTimes(1);
    expect(r.hint.tick(0)).toEqual({ c: 0, i: 0 });
    close.fire('click');
    expect(r.scope.isOpen).toBe(false);
  });
  it('draws a frame with and without the pad, in reduced motion, at a phone\'s shape and a television\'s, without throwing', () => {
    for (const [w, h] of [[390, 760], [1920, 1080]]) {
      const r = rig({ reducedMotion: true });
      r.win.innerWidth = w; r.win.innerHeight = h;
      r.scope.open();
      for (let i = 0; i < 5; i++) r.scope.update(1 / 30, i / 30);
      expect(r.scope.canvas.width).toBe(w);
      r.scope.close();
    }
  });
});

describe('touch and mouse', () => {
  it('a tap within 40 px of a star pins it (the first star of the Mouse), a tap in empty sky does nothing', () => {
    const r = rig();
    r.scope.open();
    r.scope.place();
    const h = r.scope.hits.find((s) => s.c === 0 && s.i === 0);
    expect(h).toBeTruthy();
    const down = (x, y) => { r.scope.canvas.fire('pointerdown', { pointerId: 1, clientX: x, clientY: y, pointerType: 'touch' }); r.scope.canvas.fire('pointerup', { pointerId: 1, clientX: x, clientY: y, pointerType: 'touch' }); };
    down(h.x + 3, h.y - 30); // 30 px off: inside 40
    expect(r.results.map((x) => x.kind)).toEqual(['pin']);
    expect(r.solver.pins(0)).toBe(1);
    down(5, 5); // empty sky (no star there)
    expect(r.results).toHaveLength(1);
  });
  it('a wrong star is a hmm: the line fades, nothing is lost, and the right star still pins', () => {
    const r = rig();
    r.scope.open();
    r.scope.place();
    const pt = (c, i) => r.scope.hits.find((s) => s.c === c && s.i === i);
    r.scope.tap(pt(0, 0).x, pt(0, 0).y);
    const wrong = pt(0, 3);
    r.scope.tap(wrong.x, wrong.y);
    expect(r.results.map((x) => x.kind)).toEqual(['pin', 'hmm']);
    expect(r.scope.said.text).toBe('moon.scope.hmm');
    expect(r.solver.pins(0)).toBe(1);
    r.scope.tap(pt(0, 1).x, pt(0, 1).y);
    expect(r.solver.pins(0)).toBe(2);
    for (let i = 0; i < 100; i++) r.scope.update(0.05, i * 0.05);
    expect(r.scope.said).toBeNull(); // the words go by themselves
  });
  it('dragging pans the sky (the other way: the sky follows the finger) and a drag is not a tap', () => {
    const r = rig();
    r.scope.open();
    const b0 = r.scope.view.b;
    const e0 = r.scope.view.e;
    const c = r.scope.canvas;
    c.fire('pointerdown', { pointerId: 1, clientX: 400, clientY: 300 });
    c.fire('pointermove', { pointerId: 1, clientX: 460, clientY: 330 });
    c.fire('pointerup', { pointerId: 1, clientX: 460, clientY: 330 });
    expect(angleTo(b0, r.scope.view.b)).toBeLessThan(0); // finger right: the sky goes right: the view goes west
    expect(r.scope.view.e).toBeGreaterThan(e0); // finger down: the sky goes down: the view goes up
    expect(r.results).toHaveLength(0);
  });
  it('the view stays between 6 and 82 degrees up and wraps round the compass', () => {
    const r = rig();
    r.scope.open();
    r.scope.view.e = 80;
    const c = r.scope.canvas;
    c.fire('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    c.fire('pointermove', { pointerId: 1, clientX: 0, clientY: 3000 });
    expect(r.scope.view.e).toBeLessThanOrEqual(82);
    c.fire('pointermove', { pointerId: 1, clientX: 0, clientY: -9000 });
    expect(r.scope.view.e).toBeGreaterThanOrEqual(6);
    r.scope.view.b = 1;
    c.fire('pointermove', { pointerId: 1, clientX: 5000, clientY: -9000 });
    expect(r.scope.view.b).toBeGreaterThanOrEqual(0);
    expect(r.scope.view.b).toBeLessThan(360);
  });
  it('with the pointer locked (a desktop walk) moving the mouse pans and a click pins the star under the ring', () => {
    const r = rig();
    r.scope.open();
    r.doc.pointerLockElement = {};
    aimAt(r, 0, 0);
    r.scope.canvas.fire('pointerdown', { pointerId: 1 });
    expect(r.results.map((x) => x.kind)).toEqual(['pin']);
    const b = r.scope.view.b;
    r.scope.canvas.fire('pointermove', { movementX: 40, movementY: 0 });
    expect(r.scope.view.b).not.toBe(b);
  });
});

describe('keyboard', () => {
  it('arrows and WASD pan while held, Space and Enter pin the star under the ring, and these keys do not reach the walk', () => {
    const r = rig();
    r.scope.open();
    const down = r.win.fire('keydown', { code: 'ArrowRight' });
    expect(down.stopped).toBe(true);
    expect(down.prevented).toBe(true);
    const b0 = r.scope.view.b;
    r.scope.update(0.5, 0.5);
    expect(angleTo(b0, r.scope.view.b)).toBeCloseTo(PAN_SPEED * 0.1 * 1, 1); // a frame is clamped to 0.1 s
    r.win.fire('keyup', { code: 'ArrowRight' });
    const b1 = r.scope.view.b;
    r.scope.update(0.1, 0.6);
    expect(r.scope.view.b).toBeCloseTo(b1, 6);
    aimAt(r, 0, 0);
    const sp = r.win.fire('keydown', { code: 'Space' });
    expect(sp.stopped).toBe(true);
    expect(r.results.map((x) => x.kind)).toEqual(['pin']);
    aimAt(r, 0, 1);
    r.win.fire('keydown', { code: 'Enter' });
    expect(r.solver.pins(0)).toBe(2);
    const other = r.win.fire('keydown', { code: 'KeyZ' });
    expect(other.stopped).toBe(false); // not ours
  });
  it('Escape, Backspace, E and Q close it; H asks for the hint; a held key\'s repeat does not pin twice', () => {
    for (const code of ['Escape', 'Backspace', 'KeyE', 'KeyQ']) {
      const r = rig();
      r.scope.open();
      const e = r.win.fire('keydown', { code });
      expect(e.stopped, code).toBe(true);
      expect(r.scope.isOpen, code).toBe(false);
    }
    const r = rig();
    r.scope.open();
    r.win.fire('keydown', { code: 'KeyH' });
    expect(r.asked).toHaveBeenCalled();
    aimAt(r, 0, 0);
    r.win.fire('keydown', { code: 'Space' });
    r.win.fire('keydown', { code: 'Space', repeat: true });
    expect(r.solver.pins(0)).toBe(1);
  });
  it('the ring snaps to the nearest star within 70 px, so a pin by keyboard or pad needs no steady aim; away from every star it pins nothing', () => {
    const r = rig();
    r.scope.open();
    const s = starSky(CONSTELLATIONS[0], 0);
    r.scope.view.b = s.b + 1.5; r.scope.view.e = s.e - 1; // a couple of degrees off: about 35 px
    r.scope.place();
    r.win.fire('keydown', { code: 'Space' });
    expect(r.solver.pins(0)).toBe(1);
    r.scope.view.b = 120; r.scope.view.e = 75; // empty sky
    r.scope.place();
    r.win.fire('keydown', { code: 'Space' });
    expect(r.results).toHaveLength(1);
  });
});

describe('the pad', () => {
  const pad = (axes = [0, 0, 0, 0], down = []) => ({ connected: true, axes, buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })) });
  it('the stick pans the sky, A pins the star under the ring, B closes, X shows the hint', () => {
    const state = { p: pad() };
    const r = rig();
    r.scope.close();
    const page = fakePage();
    const solver = createSolver(0);
    const hint = createHint(solver);
    const kinds = [];
    const asked = vi.fn();
    const scope = createScope({ doc: page.doc, win: page.win, solver, hint, sky: [], line: (k) => k, pads: () => [state.p], onResult: (x) => kinds.push(x.kind), onAsk: asked });
    scope.open();
    state.p = pad([0.9, 0, 0, 0]);
    const b0 = scope.view.b;
    scope.update(0.1, 0.1);
    expect(angleTo(b0, scope.view.b)).toBeGreaterThan(2);
    state.p = pad([0, 0, 0, 0]);
    scope.update(0.1, 0.2);
    const s = starSky(CONSTELLATIONS[0], 0);
    scope.view.b = s.b; scope.view.e = s.e;
    scope.place();
    state.p = pad([0, 0, 0, 0], [0]);
    scope.update(0.05, 0.3);
    expect(kinds).toEqual(['pin']);
    scope.update(0.05, 0.35);
    expect(kinds).toEqual(['pin']); // held: once
    state.p = pad([0, 0, 0, 0], [2]);
    scope.update(0.05, 0.4);
    expect(asked).toHaveBeenCalledTimes(1);
    state.p = pad([0, 0, 0, 0], [1]);
    scope.update(0.05, 0.45);
    expect(scope.isOpen).toBe(false);
  });
  it('a B held when it opened (the press that backed out of something) closes nothing until it is let go', () => {
    const page = fakePage();
    const solver = createSolver(0);
    let p = pad([0, 0, 0, 0], [1]);
    const scope = createScope({ doc: page.doc, win: page.win, solver, hint: createHint(solver), sky: [], line: (k) => k, pads: () => [p] });
    scope.open();
    scope.update(0.05, 0.1);
    expect(scope.isOpen).toBe(true);
    p = pad();
    scope.update(0.05, 0.2);
    p = pad([0, 0, 0, 0], [1]);
    scope.update(0.05, 0.3);
    expect(scope.isOpen).toBe(false);
  });
  it('the press that opened the scope (A held) is not a pin', () => {
    const page = fakePage();
    const solver = createSolver(0);
    const hint = createHint(solver);
    const kinds = [];
    const p = pad([0, 0, 0, 0], [0]);
    const scope = createScope({ doc: page.doc, win: page.win, solver, hint, sky: [], line: (k) => k, pads: () => [p], onResult: (x) => kinds.push(x.kind) });
    scope.open();
    const s = starSky(CONSTELLATIONS[0], 0);
    scope.view.b = s.b; scope.view.e = s.e;
    scope.update(0.05, 0.1);
    expect(kinds).toEqual([]);
  });
  it('a stick at rest (inside the dead zone) does not drift the view', () => {
    const page = fakePage();
    const solver = createSolver(0);
    const scope = createScope({ doc: page.doc, win: page.win, solver, hint: createHint(solver), sky: [], line: (k) => k, pads: () => [pad([0.1, -0.12, 0.05, 0.1])] });
    scope.open();
    const b = scope.view.b; const e = scope.view.e;
    for (let i = 0; i < 30; i++) scope.update(0.05, i * 0.05);
    expect(scope.view.b).toBeCloseTo(b, 9);
    expect(scope.view.e).toBeCloseTo(e, 9);
  });
});

describe('the game through the overlay', () => {
  const trace = (r, c) => { for (let i = 0; i < CONSTELLATIONS[c].pts.length; i++) { aimAt(r, c, i); r.win.fire('keydown', { code: 'Space' }); } };
  it('tracing the Mouse then the Cat by keyboard saves two bits and slides the view to Earth', () => {
    const r = rig();
    r.scope.open();
    trace(r, 0);
    expect(r.results.at(-1).kind).toBe('done');
    expect(r.solver.bits).toBe(1);
    expect(r.scope.said.text).toBe('moon.star.mouse');
    trace(r, 1);
    expect(r.solver.bits & STORY_BITS).toBe(STORY_BITS);
    for (let i = 0; i < 60; i++) r.scope.update(0.05, i * 0.05);
    expect(angleTo(r.scope.view.b, EARTH_AT.b)).toBeCloseTo(0, 3);
    expect(r.scope.view.e).toBeCloseTo(EARTH_AT.e, 3);
  });
  it('the next star pulses at once (within a second of opening), a wrong star does not hide it, and a pin moves it to the next star', () => {
    const r = rig();
    r.scope.open();
    const spy = vi.spyOn(r.hint, 'tick');
    for (let i = 0; i < 10; i++) r.scope.update(0.05, i * 0.05); // half a second
    expect(spy.mock.results.at(-1).value).toBeNull();
    for (let i = 0; i < 6; i++) r.scope.update(0.05, 1 + i * 0.05);
    expect(spy.mock.results.at(-1).value).toEqual({ c: 0, i: 0 });
    aimAt(r, 0, 5); r.win.fire('keydown', { code: 'Space' }); // a wrong star
    r.scope.update(0.05, 2);
    expect(spy.mock.results.at(-1).value).toEqual({ c: 0, i: 0 });
    aimAt(r, 0, 0);
    r.win.fire('keydown', { code: 'Space' });
    r.scope.update(0.1, 3);
    expect(spy.mock.results.at(-1).value).toBeNull(); // a pin restarts the short wait
    for (let i = 0; i < 12; i++) r.scope.update(0.05, 3.1 + i * 0.05);
    expect(spy.mock.results.at(-1).value).toEqual({ c: 0, i: 1 });
  });
  it('a picture already traced is shown as known: its stars do not pin again and the saved bits are not lost', () => {
    const r = rig({ bits: 1 });
    r.scope.open();
    aimAt(r, 0, 0);
    r.win.fire('keydown', { code: 'Space' });
    expect(r.results.map((x) => x.kind)).toEqual(['known']);
    expect(r.solver.bits).toBe(1);
  });
});
