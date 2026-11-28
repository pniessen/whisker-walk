import { describe, it, expect } from 'vitest';
import { createSplitRule, dividerAt, viewRects, SPLIT_AT, MERGE_AT, HOLD_MS, TRANSITION_MS } from '../src/coop/splitrule.js';

const MAX = 40;
const base = { maxSep: MAX, top: true, sameLevel: true, reducedMotion: false, dt: 0.016 };
/** run the rule for `ms` of game time with fixed inputs; returns the last output and the clock */
function run(rule, clock, ms, inp) {
  let out;
  for (let i = 0; i < Math.ceil(ms / 16); i++) { clock.t += 16; out = rule.step({ ...base, ...inp, nowMs: clock.t }); }
  return out;
}

describe('split rule thresholds', () => {
  it('constants are the owner-agreed ones', () => {
    expect([SPLIT_AT, MERGE_AT, HOLD_MS, TRANSITION_MS]).toEqual([0.8, 0.5, 1000, 400]);
  });
  it('stays shared under 0.8 maxSep and splits above it, only at the widest zoom', () => {
    const c = { t: 0 }; const r = createSplitRule();
    expect(run(r, c, 2000, { gap: 0.79 * MAX }).mode).toBe('shared');
    expect(run(r, c, 2000, { gap: 0.9 * MAX, top: false }).mode).toBe('shared');
    const o = run(r, c, 2000, { gap: 0.81 * MAX });
    expect(o.mode).toBe('split'); expect(o.reason).toBe('apart'); expect(o.t).toBe(1); expect(o.dividerX).toBe(0.5);
  });
  it('merges below 0.5 maxSep only (the band between keeps split)', () => {
    const c = { t: 0 }; const r = createSplitRule();
    run(r, c, 2000, { gap: 0.9 * MAX });
    expect(run(r, c, 3000, { gap: 0.6 * MAX }).mode).toBe('split');
    expect(run(r, c, 3000, { gap: 0.51 * MAX }).mode).toBe('split');
    const o = run(r, c, 3000, { gap: 0.49 * MAX });
    expect(o.mode).toBe('shared'); expect(o.t).toBe(0); expect(o.dividerX).toBe(1);
  });
  it('different levels force split at any distance, and block the merge', () => {
    const c = { t: 0 }; const r = createSplitRule();
    const o = run(r, c, 2000, { gap: 1, sameLevel: false, top: false });
    expect(o.mode).toBe('split'); expect(o.reason).toBe('levels');
    expect(run(r, c, 3000, { gap: 1, sameLevel: false }).mode).toBe('split');
    expect(run(r, c, 3000, { gap: 1, sameLevel: true }).mode).toBe('shared');
  });
});

describe('hysteresis and hold', () => {
  it('a gap wobbling across both thresholds every frame changes mode at most once a second', () => {
    const c = { t: 0 }; const r = createSplitRule();
    let changes = 0; let prev = 'shared';
    for (let i = 0; i < 600; i++) { // ~9.6 s
      c.t += 16;
      const gap = (i % 2 ? 0.95 : 0.3) * MAX; // worst case: swings across split and merge lines
      const o = r.step({ ...base, gap, nowMs: c.t });
      if (o.mode !== prev) { changes++; prev = o.mode; }
    }
    expect(changes).toBeLessThanOrEqual(Math.ceil(9.6));
    expect(changes).toBeGreaterThan(0);
  });
  it('a gap hovering at 0.8 (inside the band) never flickers', () => {
    const c = { t: 0 }; const r = createSplitRule();
    let changes = 0; let prev = 'shared';
    for (let i = 0; i < 600; i++) {
      c.t += 16;
      const o = r.step({ ...base, gap: (0.8 + (i % 2 ? 0.01 : -0.01)) * MAX, nowMs: c.t });
      if (o.mode !== prev) { changes++; prev = o.mode; }
    }
    expect(changes).toBe(1); // splits once, then the 0.5 merge line keeps it split
  });
  it('holds a state at least HOLD_MS after a change, even if the inputs flip back at once', () => {
    const c = { t: 5000 }; const r = createSplitRule();
    r.step({ ...base, gap: 0.9 * MAX, nowMs: c.t }); // split at 5000
    let flippedAt = null;
    for (let i = 1; i < 200; i++) {
      c.t += 16;
      const o = r.step({ ...base, gap: 1, nowMs: c.t });
      if (o.mode === 'shared') { flippedAt = c.t - 5000; break; }
    }
    expect(flippedAt).toBeGreaterThanOrEqual(HOLD_MS);
    expect(flippedAt).toBeLessThan(HOLD_MS + 40);
  });
});

describe('transition', () => {
  it('takes about 400 ms, progress monotone, divider slides 1 -> 0.5 and back', () => {
    const c = { t: 0 }; const r = createSplitRule();
    run(r, c, 1500, { gap: 1 });
    let prevT = 0; let prevD = 1; let n = 0;
    for (let i = 0; i < 40; i++) {
      c.t += 16;
      const o = r.step({ ...base, gap: 0.95 * MAX, nowMs: c.t });
      expect(o.t).toBeGreaterThanOrEqual(prevT);
      expect(o.dividerX).toBeLessThanOrEqual(prevD);
      expect(o.active).toBe(true);
      if (o.t < 1) n++;
      prevT = o.t; prevD = o.dividerX;
    }
    expect(prevT).toBe(1);
    expect(n * 16).toBeGreaterThanOrEqual(TRANSITION_MS - 32);
    expect(n * 16).toBeLessThanOrEqual(TRANSITION_MS + 32);
    // and back
    run(r, c, 1100, { gap: 1 }); // merge decision happens once held, then slides
    expect(r.step({ ...base, gap: 1, nowMs: c.t + 16 }).t).toBe(0);
  });
  it('reducedMotion snaps both ways in one step', () => {
    const c = { t: 0 }; const r = createSplitRule();
    c.t += 16;
    const o = r.step({ ...base, gap: 0.95 * MAX, reducedMotion: true, nowMs: c.t });
    expect(o.t).toBe(1); expect(o.dividerX).toBe(0.5);
    c.t += 1100;
    const p = r.step({ ...base, gap: 1, reducedMotion: true, nowMs: c.t });
    expect(p.t).toBe(0); expect(p.active).toBe(false);
  });
  it('dividerAt is monotone, clamped, 1 at 0 and 0.5 at 1', () => {
    expect(dividerAt(0)).toBe(1); expect(dividerAt(1)).toBe(0.5);
    expect(dividerAt(-1)).toBe(1); expect(dividerAt(2)).toBe(0.5);
    let prev = 1;
    for (let i = 1; i <= 100; i++) { const d = dividerAt(i / 100); expect(d).toBeLessThanOrEqual(prev); prev = d; }
  });
});

describe('viewRects', () => {
  it('1280x720 split: two 640 halves', () => {
    const v = viewRects(1280, 720, 1, 0.5);
    expect(v.dev).toEqual([{ x: 0, y: 0, w: 640, h: 720 }, { x: 640, y: 0, w: 640, h: 720 }]);
  });
  it('1920x1080 at the quarter point of the slide', () => {
    const v = viewRects(1920, 1080, 1, 0.75);
    expect(v.dev[0].w).toBe(1440); expect(v.dev[1]).toEqual({ x: 1440, y: 0, w: 480, h: 1080 });
    expect(v.aspects[0]).toBeCloseTo(1440 / 1080, 12);
  });
  it('shared (divider 1): only the left view, the whole screen', () => {
    const v = viewRects(1920, 1080, 2, 1);
    expect(v.dev).toEqual([{ x: 0, y: 0, w: 3840, h: 2160 }]);
    expect(v.css).toEqual([{ x: 0, y: 0, w: 1920, h: 1080 }]);
  });
  it('odd widths and pixel ratios tile exactly for every divider position', () => {
    for (const w of [1281, 1919, 777, 3]) for (const dpr of [1, 1.25, 1.5, 2, 3]) for (let i = 0; i <= 20; i++) {
      const d = 1 - i / 40;
      const v = viewRects(w, 721, dpr, d);
      const bw = Math.round(w * dpr);
      expect(v.dev[0].x).toBe(0);
      const last = v.dev.at(-1);
      expect(last.x + last.w).toBe(bw);
      if (v.dev[1]) expect(v.dev[0].w).toBe(v.dev[1].x);
      v.css.forEach((r, k) => { expect(Math.round(r.x * dpr)).toBe(v.dev[k].x); expect(Math.round(r.w * dpr)).toBe(v.dev[k].w); });
    }
  });
});
