import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { bigScreenFullscreen, watchForTv, setTv, resetTv, tvHooks } from '../src/tvseam.js';
import { createGamepad } from '../src/gamepad.js';
import { offer } from '../src/tv/offer.js';
import { createSettings } from '../src/settings.js';
import { CONFIRM_DELAY_MS } from '../src/ui/colonypanel.js';
import { createConfirmCard } from '../src/ui/confirmcard.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const win = (o = {}) => ({ screen: { width: 1920, height: 1080 }, innerWidth: 1920, innerHeight: 1080, document: { fullscreenElement: null }, ...o });

beforeEach(() => resetTv());
afterEach(() => resetTv());

describe('bigScreenFullscreen', () => {
  it('a laptop screen never qualifies, however full', () => {
    expect(bigScreenFullscreen(win({ screen: { width: 1728, height: 1117 }, innerWidth: 1728, innerHeight: 1117 }))).toBe(false);
    expect(bigScreenFullscreen(win({ screen: { width: 1440, height: 900 }, innerWidth: 1440, innerHeight: 900, document: { fullscreenElement: {} } }))).toBe(false);
  });
  it('a 1920 window that does not fill the screen is not full screen', () => {
    expect(bigScreenFullscreen(win({ screen: { width: 2560, height: 1440 }, innerWidth: 1920, innerHeight: 1000 }))).toBe(false);
  });
  it('1920 and full screen qualifies, by size or by the fullscreen element, and so does a 4K one', () => {
    expect(bigScreenFullscreen(win())).toBe(true);
    expect(bigScreenFullscreen(win({ screen: { width: 2560, height: 1440 }, innerWidth: 1920, innerHeight: 1000, document: { fullscreenElement: {} } }))).toBe(true);
    expect(bigScreenFullscreen(win({ screen: { width: 3840, height: 2160 }, innerWidth: 3840, innerHeight: 2160 }))).toBe(true);
  });
  it('1900 is the line, and a missing screen is a no', () => {
    expect(bigScreenFullscreen(win({ screen: { width: 1900, height: 1000 }, innerWidth: 1900, innerHeight: 1000 }))).toBe(true);
    expect(bigScreenFullscreen(win({ screen: { width: 1899, height: 1000 }, innerWidth: 1899, innerHeight: 1000 }))).toBe(false);
    expect(bigScreenFullscreen({ innerWidth: 1920 })).toBe(false);
  });
});

describe('when the offer is made', () => {
  const rig = (o = {}) => {
    const settings = createSettings(memStorage());
    const state = { home: true, ...o };
    const onOffer = vi.fn();
    const check = watchForTv({ win: state.win ?? win(), settings, homeClear: () => state.home, onOffer });
    return { settings, state, onOffer, check };
  };

  it('once, on the first pad use at home base on a big full-screen window', () => {
    const r = rig();
    r.check();
    expect(r.onOffer).toHaveBeenCalledTimes(1);
    r.check();
    r.check();
    expect(r.onOffer).toHaveBeenCalledTimes(1);
  });

  it('never without a pad use: nothing asks until check() is called (main.js calls it only from onPadUse)', () => {
    const r = rig();
    expect(r.onOffer).not.toHaveBeenCalled();
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main.match(/tvOffer\(\)/g)).toHaveLength(1);
    expect(main).toMatch(/onPadUse: \(i\) => \{ if \(tvHooks\.padUse\) tvHooks\.padUse\(i\); else padHintsOn\(i\); tvOffer\(\); \}/);
  });

  it('not on a laptop, not in a window that is not full, not when declined, not when already on', () => {
    const laptop = rig({ win: win({ screen: { width: 1728, height: 1117 }, innerWidth: 1728, innerHeight: 1117 }) });
    laptop.check();
    expect(laptop.onOffer).not.toHaveBeenCalled();
    const windowed = rig({ win: win({ screen: { width: 2560, height: 1440 }, innerWidth: 1500, innerHeight: 1000 }) }); // too small a window, and not full screen
    windowed.check();
    expect(windowed.onOffer).not.toHaveBeenCalled();
    const declined = rig();
    declined.settings.set('tvOfferDeclined', true);
    declined.check();
    expect(declined.onOffer).not.toHaveBeenCalled();
    const on = rig();
    on.settings.set('tvMode', true);
    on.check();
    expect(on.onOffer).not.toHaveBeenCalled();
    const forced = rig();
    setTv({ on: true }); // ?tv=1 for this page load
    forced.check();
    expect(forced.onOffer).not.toHaveBeenCalled();
  });

  it('never with a walk live or a card up; it waits, and asks at the next bare home screen', () => {
    const r = rig({ home: false });
    r.check();
    r.check();
    expect(r.onOffer).not.toHaveBeenCalled();
    r.state.home = true;
    r.check();
    expect(r.onOffer).toHaveBeenCalledTimes(1);
  });
});

// The card itself, over a small fake DOM.
function fakeEnv({ home = true } = {}) {
  const added = [];
  const el = () => {
    const e = {
      attrs: {}, listeners: {}, removed: false, className: '', id: '', classList: { add() {}, remove() {} },
      setAttribute(k, v) { e.attrs[k] = v; },
      addEventListener(t, f) { e.listeners[t] = f; },
      querySelector: () => null, remove() { e.removed = true; },
      set innerHTML(v) { e.html = v; }, get innerHTML() { return e.html; },
    };
    return e;
  };
  const doc = {
    createElement: el,
    getElementById: () => ({ after: (e) => added.push(e) }),
    body: { appendChild: (e) => added.push(e) },
    activeElement: null,
  };
  const timers = [];
  const w = { setInterval: (f) => { timers.push(f); return timers.length; }, clearInterval() {} };
  const state = { home };
  const settings = createSettings(memStorage());
  const enable = vi.fn();
  return { doc, win: w, settings, enable, state, added, timers, ctx: { doc, win: w, settings, homeClear: () => state.home, enable, createConfirmCard } };
}
const click = (card, answer, detail = 1) => card.listeners.click({ detail, target: { closest: () => ({ getAttribute: () => answer }) } });

describe('the offer card', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is a pad layer with the words of the offer, mounted after the home base', () => {
    const e = fakeEnv();
    const { up } = offer(e.ctx);
    expect(up).toBe(true);
    const el = e.added[0];
    expect(el.attrs['data-pad-layer']).toBe('');
    expect(el.html).toContain('Use TV mode?');
    expect(el.html).toContain('Bigger words, made for the sofa.');
    expect(el.html).toContain('Not now');
    // "Not now" comes first, so a pad lands on the safe answer
    expect(el.html.indexOf('Not now')).toBeLessThan(el.html.indexOf('Yes, use it'));
  });

  it('Yes (after the confirm delay) turns TV mode on and starts it; Not now is remembered for good', () => {
    const yes = fakeEnv();
    const a = offer(yes.ctx);
    vi.advanceTimersByTime(CONFIRM_DELAY_MS + 10);
    click(yes.added[0], 'yes');
    expect(yes.settings.get('tvMode')).toBe(true);
    expect(yes.enable).toHaveBeenCalledTimes(1);
    expect(yes.settings.get('tvOfferDeclined')).toBe(false);
    expect(a.card.isOpen()).toBe(false);

    const no = fakeEnv();
    offer(no.ctx);
    click(no.added[0], 'no');
    expect(no.settings.get('tvOfferDeclined')).toBe(true);
    expect(no.settings.get('tvMode')).toBe(false);
    expect(no.enable).not.toHaveBeenCalled();
  });

  it('a Yes too soon (a pad\'s A lands the instant the card opens) does not turn it on', () => {
    const e = fakeEnv();
    offer(e.ctx);
    click(e.added[0], 'yes');
    expect(e.settings.get('tvMode')).toBe(false);
    expect(e.enable).not.toHaveBeenCalled();
  });

  it('B is "Not now": the pad\'s Back cancels the card, and that is remembered', () => {
    const e = fakeEnv();
    const { card } = offer(e.ctx);
    card.cancel();
    expect(e.settings.get('tvOfferDeclined')).toBe(true);
  });

  it('the pad\'s B, through the gamepad and main.js\'s padBack, answers "Not now" and it is remembered', () => {
    const e = fakeEnv();
    const { card } = offer(e.ctx);
    // main.js's padBack, as written there: the TV card first, then the home base's own layers
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toMatch(/function padBack\(\) \{\s*if \(tvHooks\.back\?\.\(\)\) return;/);
    const homeBack = vi.fn(() => false);
    const padBack = () => { if (tvHooks.back?.()) return; homeBack(); };
    let held = false;
    const padObj = () => ({ index: 0, connected: true, mapping: 'standard', id: 'x', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: held && i === 1, value: held && i === 1 ? 1 : 0 })) });
    const g = createGamepad({
      win: { addEventListener() {}, removeEventListener() {} }, nav: { getGamepads: () => [padObj()] }, doc: null,
      menuNav: { enter() {}, step() {}, alt() {}, press() {}, scroll() {}, settle() {} }, getEngaged: () => false, padBack,
    });
    g.poll(0.016); // menu mode
    held = true;
    g.poll(0.016); // B pressed
    expect(card.isOpen()).toBe(false);
    expect(e.settings.get('tvOfferDeclined')).toBe(true);
    expect(homeBack).not.toHaveBeenCalled();
    expect(tvHooks.back).toBeNull();
    // with no offer up, B falls through to the home base
    held = false; g.poll(0.016); held = true; g.poll(0.016);
    expect(homeBack).toHaveBeenCalledTimes(1);
  });

  it('it is not put up over a walk or another card', () => {
    const e = fakeEnv({ home: false });
    expect(offer(e.ctx).up).toBe(false);
    expect(e.added).toHaveLength(0);
  });

  it('if a walk starts under it, the card comes down unanswered and nothing is remembered', () => {
    const e = fakeEnv();
    const { card } = offer(e.ctx);
    expect(card.isOpen()).toBe(true);
    e.state.home = false;
    e.timers[0]();
    expect(card.isOpen()).toBe(false);
    expect(e.added[0].removed).toBe(true);
    expect(e.settings.get('tvOfferDeclined')).toBe(false);
    expect(e.settings.get('tvMode')).toBe(false);
  });
});

describe('the offer with a pad in hand (no fullscreen needed)', () => {
  const offered = (w) => { const onOffer = vi.fn(); const check = watchForTv({ win: w, settings: createSettings(memStorage()), homeClear: () => true, onOffer }); check(); return onOffer.mock.calls.length; };
  it('fires on a large window that is not full screen', () => {
    expect(offered(win({ screen: { width: 2560, height: 1440 }, innerWidth: 1700, innerHeight: 900 }))).toBe(1);
  });
  it('fires on a 1920x1080 or 3840x2160 screen even in a small window; not on a laptop\'s own screen', () => {
    expect(offered(win({ screen: { width: 1920, height: 1080 }, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 }))).toBe(1);
    expect(offered(win({ screen: { width: 3840, height: 2160 }, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 2 }))).toBe(1);
    expect(offered(win({ screen: { width: 1728, height: 1117 }, innerWidth: 1200, innerHeight: 800, devicePixelRatio: 2 }))).toBe(0);
  });
  it('not with a small window on a small screen', () => {
    expect(offered(win({ screen: { width: 1440, height: 900 }, innerWidth: 1000, innerHeight: 700 }))).toBe(0);
  });
  it('never on a touch device', () => {
    expect(offered(win({ navigator: { maxTouchPoints: 5 } }))).toBe(0);
    expect(offered(win({ screen: { width: 2560, height: 1440 }, innerWidth: 1700, navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: true }) }))).toBe(0);
  });
  it('not again after Not now', () => {
    const settings = createSettings(memStorage());
    settings.set('tvOfferDeclined', true);
    const onOffer = vi.fn();
    watchForTv({ win: win({ innerWidth: 1700 }), settings, homeClear: () => true, onOffer })();
    expect(onOffer).not.toHaveBeenCalled();
  });
});
