import { describe, it, expect, vi } from 'vitest';
import { uiScale, applyScale, IDLE_CURSOR_MS } from '../src/tv/scale.js';
import { start } from '../src/tv/index.js';
import { padText, padHtml, tvState, resetTv } from '../src/tvseam.js';

describe('uiScale', () => {
  it('is 1 up to 1920, grows to 2 at 3840 and stays there', () => {
    expect(uiScale(1280)).toBe(1);
    expect(uiScale(1440)).toBe(1);
    expect(uiScale(1920)).toBe(1);
    expect(uiScale(2560)).toBeCloseTo(1.3333, 3);
    expect(uiScale(3840)).toBe(2);
    expect(uiScale(5000)).toBe(2);
  });
  it('junk gives 1', () => {
    for (const j of [undefined, null, NaN, 0, -5, 'wide', Infinity]) expect(uiScale(j)).toBe(1);
  });
});

function rig(width = 1920) {
  const props = {};
  const cls = new Set();
  const listeners = {};
  let timers = [];
  const doc = {
    documentElement: {
      style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } },
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    },
    body: { classList: { add: (c) => cls.add(`body:${c}`), remove: (c) => cls.delete(`body:${c}`), contains: (c) => cls.has(`body:${c}`) } },
  };
  const win = {
    innerWidth: width,
    addEventListener: (t, f) => { (listeners[t] ||= new Set()).add(f); },
    removeEventListener: (t, f) => listeners[t]?.delete(f),
    requestAnimationFrame: (f) => { f(); return 1; },
    setTimeout: (f, ms) => { const t = { f, ms }; timers.push(t); return t; },
    clearTimeout: (t) => { timers = timers.filter((x) => x !== t); },
  };
  const fire = (t) => listeners[t]?.forEach((f) => f({}));
  return { doc, win, props, cls, listeners, fire, timers: () => timers };
}

describe('applyScale', () => {
  it('sets the three variables and follows a resize', () => {
    const r = rig(1920);
    const s = applyScale(r.doc, r.win);
    expect(r.props).toEqual({ '--tv-s': '1', '--tv-safe-x': '5vw', '--tv-safe-y': '5vh' });
    r.win.innerWidth = 3840;
    r.fire('resize');
    expect(r.props['--tv-s']).toBe('2');
    s.destroy();
    expect(r.props).toEqual({});
    expect(r.listeners.resize.size).toBe(0);
  });
  it('hides the cursor after it has been still, and shows it again on a move', () => {
    const r = rig();
    applyScale(r.doc, r.win);
    expect(r.timers()[0].ms).toBe(IDLE_CURSOR_MS);
    r.timers()[0].f();
    expect(r.cls.has('body:tv-idle')).toBe(true);
    r.fire('pointermove');
    expect(r.cls.has('body:tv-idle')).toBe(false);
    expect(r.timers().at(-1).ms).toBe(IDLE_CURSOR_MS);
  });
});

describe('the chunk start', () => {
  it('adds html.tv with the scale, and stop() takes everything away', async () => {
    const r = rig(2560);
    const h = await start({ doc: r.doc, win: r.win, padInfo: () => null });
    expect(r.cls.has('tv')).toBe(true);
    expect(r.props['--tv-s']).toBe('1.333');
    h.stop();
    expect(r.cls.has('tv')).toBe(false);
    expect(r.props).toEqual({});
  });

  it('gives the seam its button pictures, by the pad in use, and takes them away on stop', async () => {
    resetTv();
    const r = rig();
    let info = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', vendor: '054c' };
    const h = await start({ doc: r.doc, win: r.win, padInfo: () => info });
    expect(padText('⟦jump⟧ go')).toBe('✕ go');
    expect(padHtml('⟦jump⟧')).toMatch(/^<svg /);
    info = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', vendor: '045e' };
    expect(padText('⟦jump⟧')).toBe('A');
    h.stop();
    expect(padText('⟦jump⟧')).toBe('⟦jump⟧');
    expect(padHtml('x')).toBeNull();
    expect(tvState.input).toBe('keys');
  });
});
