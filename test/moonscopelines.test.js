// The Moon's telescope: no line may run across the whole view. A picture standing on the far side of the sky from where the telescope looks (its stars either side of the
// opposite bearing) used to be drawn with a chord across the screen (the iPad's four bright blue lines); the Milky Way stays a faint soft band; and the zoomed-out view
// (0.5x) keeps the stars apart and the middle's elevation inside the sky.
import { describe, it, expect } from 'vitest';
import { createScope, ZOOM, EARTH_AT } from '../src/world/moonscope.js';
import { CONSTELLATIONS, createSolver, createHint, starSky, angleTo, scopeScale } from '../src/world/moonstars.js';
import '../src/world/moonwords.js';
import { fakePage } from './helpers/moonpage.js';

const GUEST = { id: 'star', bearing: 210, elev: 40, pts: [[0, 6], [-4, -5], [5, 1], [-5, 1], [4, -5]] };
function rig(bits, w, h, guest = true) {
  const page = fakePage({ width: w, height: h });
  const list = guest ? [...CONSTELLATIONS, GUEST] : CONSTELLATIONS;
  const solver = createSolver(bits, list);
  const scope = createScope({ doc: page.doc, win: page.win, solver, hint: createHint(solver), sky: [], reducedMotion: true, pictures: list, line: (k) => k, pads: () => [], onResult() {} });
  const segs = []; const strokes = [];
  let cur = null; let n = 0;
  page.ctx.beginPath = () => { cur = null; n = 0; };
  page.ctx.moveTo = (x, y) => { cur = [x, y]; };
  page.ctx.lineTo = (x, y) => { if (cur) segs.push({ dx: x - cur[0], dy: y - cur[1], style: String(page.ctx.strokeStyle), lw: page.ctx.lineWidth }); cur = [x, y]; n++; };
  page.ctx.stroke = () => { strokes.push({ style: String(page.ctx.strokeStyle), lw: page.ctx.lineWidth, n }); };
  return { scope, segs, strokes, page };
}

describe('no line runs across the telescope view', () => {
  for (const [name, w, h] of [['iPad', 1180, 820], ['phone', 390, 760]]) {
    it(`${name}: every drawn segment is as long as its stars are apart on the sky, at any bearing (the wrap at 0 and 360 and the far side of the view), zoom and elevation`, () => {
      for (const bits of [0, 3, 31]) {
        const r = rig(bits, w, h);
        r.scope.open(GUEST);
        for (const zoom of [0.5, 1, 1.35, 2.5]) {
          r.scope.setZoom(zoom, true);
          const k = scopeScale(w, h) * zoom;
          for (let b = 0; b < 360; b += 15) for (const e of [10, 40, 70]) {
            r.scope.view.b = b; r.scope.view.e = e;
            r.segs.length = 0;
            r.scope.update(0.016, 0);
            // the longest real segment: the Great Cat's base is about 50 degrees; the Milky Way's are 10 degrees
            for (const s of r.segs) expect(Math.hypot(s.dx, s.dy) / k, `${name} bits${bits} z${zoom} b${b} e${e} ${s.style}`).toBeLessThan(60);
          }
        }
      }
    });
    it(`${name}: the Milky Way is only ever a faint stroke (alpha under 0.06)`, () => {
      const r = rig(0, w, h);
      r.scope.open(GUEST);
      r.scope.update(0.016, 0);
      const wide = r.strokes.filter((s) => s.lw > 20);
      expect(wide.length).toBeGreaterThan(0);
      for (const s of wide) expect(Number(/,([\d.]+)\)$/.exec(s.style)[1])).toBeLessThan(0.06);
    });
  }
});

describe('the wider view (0.5x)', () => {
  it('the zoom range is 0.5x to 2.5x', () => { expect(ZOOM.min).toBe(0.5); expect(ZOOM.max).toBe(2.5); });
  it('no two stars of any picture are closer than 12 px apart at the lowest zoom on a phone', () => {
    const k = scopeScale(390, 760) * ZOOM.min;
    for (const c of [...CONSTELLATIONS, GUEST]) {
      for (let i = 0; i < c.pts.length; i++) for (let j = i + 1; j < c.pts.length; j++) {
        const a = starSky(c, i); const b = starSky(c, j);
        expect(Math.hypot(angleTo(a.b, b.b) * k, (a.e - b.e) * k), `${c.id} ${i}-${j}`).toBeGreaterThanOrEqual(12);
      }
    }
  });
  it('zoomed out, panning keeps the middle where the window shows no more than the sky', () => {
    const r = rig(0, 1180, 820, false);
    r.scope.open();
    r.scope.setZoom(ZOOM.min, true);
    r.scope.update(0.016, 0);
    const k = scopeScale(1180, 820) * ZOOM.min;
    for (const e of [0, 6, 90]) { r.scope.view.e = e; r.scope.update(0.016, 0); expect(r.scope.view.e - 410 / k).toBeGreaterThanOrEqual(-8.01); expect(r.scope.view.e + 410 / k).toBeLessThanOrEqual(98.01); }
  });
  it('Earth is in view at 0.5x when the telescope looks at it', () => {
    const r = rig(3, 1180, 820, false);
    r.scope.open({ bearing: EARTH_AT.b, elev: EARTH_AT.e });
    r.scope.setZoom(ZOOM.min, true);
    r.scope.update(0.016, 0);
    expect(Math.abs(angleTo(r.scope.view.b, EARTH_AT.b)) * scopeScale(1180, 820) * ZOOM.min).toBeLessThan(590);
  });
});
