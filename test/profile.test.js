import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { profileFor, startProfile, stopProfile, getProfile, onProfile, forceTv, markTouch, refreshProfile, PROFILES } from '../src/profile.js';

const base = { query: null, tv: false, noTv: false, tvOn: false, override: 'auto', coarse: false, points: 0, side: 900 };
const P = (o) => profileFor({ ...base, ...o });

describe('profileFor: every row of the rule table', () => {
  it('names the four profiles', () => expect([...PROFILES]).toEqual(['phone', 'tablet', 'laptop', 'tv']));
  it('1: ?profile= wins over everything', () => {
    expect(P({ query: 'tablet', tvOn: true, override: 'phone', coarse: true, side: 390 })).toBe('tablet');
    expect(P({ query: 'tv' })).toBe('tv');
    expect(P({ query: 'nonsense', coarse: true, side: 390 })).toBe('phone');
  });
  it('2: tv chunk on, or ?tv=1 / saved tvMode (tv), is tv', () => {
    expect(P({ tvOn: true, coarse: true, side: 390 })).toBe('tv');
    expect(P({ tv: true })).toBe('tv');
    expect(P({ tv: true, override: 'phone' })).toBe('tv');
  });
  it('3: an override other than auto wins over the device', () => {
    expect(P({ override: 'phone' })).toBe('phone');
    expect(P({ override: 'laptop', coarse: true, side: 390 })).toBe('laptop');
    expect(P({ override: 'bogus', coarse: true, side: 390 })).toBe('phone');
  });
  it('4: coarse pointer, shortest side under 600, is phone', () => {
    expect(P({ coarse: true, side: 390 })).toBe('phone');
    expect(P({ coarse: true, side: 599 })).toBe('phone');
  });
  it('5: coarse pointer from 600, or touch points on a big screen, is tablet', () => {
    expect(P({ coarse: true, side: 600 })).toBe('tablet');
    expect(P({ coarse: true, side: 820 })).toBe('tablet');
    expect(P({ points: 5, side: 820 })).toBe('tablet');
  });
  it('6: a fine pointer is laptop, even in a small window', () => {
    expect(P({})).toBe('laptop');
    expect(P({ side: 400 })).toBe('laptop');
    expect(P({ points: 5, side: 400 })).toBe('laptop');
  });
});

describe('profileFor: ?tv= against the override, in every pair', () => {
  it('?tv=0 forbids tv from the override and the saved switch, not from a running chunk or ?profile=', () => {
    expect(P({ noTv: true, tv: true })).toBe('laptop');
    expect(P({ noTv: true, override: 'tv', coarse: true, side: 390 })).toBe('phone');
    expect(P({ noTv: true, tvOn: true })).toBe('tv');
    expect(P({ noTv: true, query: 'tv' })).toBe('tv');
  });
  it('an override of tv makes tv, and ?tv=1 beats a phone override', () => {
    expect(P({ override: 'tv' })).toBe('tv');
    expect(P({ tv: true, override: 'laptop' })).toBe('tv');
  });
});

function fakeEnv(w = 1440, h = 900, coarse = false) {
  const html = new Set();
  const body = new Set();
  const mk = (set) => ({ toggle: (n, on) => (on ? set.add(n) : set.delete(n)), add: (n) => set.add(n), remove: (n) => set.delete(n), contains: (n) => set.has(n) });
  const handlers = {};
  const win = {
    innerWidth: w, innerHeight: h, location: { search: '' }, navigator: { maxTouchPoints: 0 },
    matchMedia: () => ({ matches: coarse }),
    addEventListener: (t, f) => { (handlers[t] ||= []).push(f); },
    removeEventListener: (t, f) => { handlers[t] = (handlers[t] || []).filter((x) => x !== f); },
  };
  const doc = { documentElement: { classList: mk(html) }, body: { classList: mk(body) } };
  return { win, doc, html, body, fire: (t) => (handlers[t] || []).forEach((f) => f()) };
}

describe('the running profile', () => {
  let ov;
  beforeEach(() => { vi.useFakeTimers(); ov = 'auto'; });
  afterEach(() => { stopProfile(); vi.useRealTimers(); });

  it('sets exactly one class on html, none for touch-mode on a laptop', () => {
    const e = fakeEnv();
    startProfile(e.win, e.doc, () => ov);
    expect(getProfile()).toBe('laptop');
    expect([...e.html]).toEqual(['laptop']);
    expect(e.body.has('touch-mode')).toBe(false);
  });
  it('a phone gets html.phone and body.touch-mode', () => {
    const e = fakeEnv(390, 844, true);
    startProfile(e.win, e.doc, () => ov);
    expect([...e.html]).toEqual(['phone']);
    expect(e.body.has('touch-mode')).toBe(true);
  });
  it('?profile= is read from the page address, ?tv=0 blocks the override', () => {
    const e = fakeEnv();
    e.win.location.search = '?profile=tablet';
    startProfile(e.win, e.doc, () => ov);
    expect(getProfile()).toBe('tablet');
    stopProfile();
    const f = fakeEnv(390, 844, true);
    f.win.location.search = '?tv=0';
    ov = 'tv';
    startProfile(f.win, f.doc, () => ov);
    expect(getProfile()).toBe('phone');
  });
  it('the override is read again by refreshProfile, at once', () => {
    const e = fakeEnv();
    startProfile(e.win, e.doc, () => ov);
    ov = 'phone';
    refreshProfile();
    expect(getProfile()).toBe('phone');
    expect([...e.html]).toEqual(['phone']);
  });
  it('a resize that lasts 300 ms changes the profile; one that comes back does not', () => {
    const e = fakeEnv(390, 844, true);
    const fn = vi.fn();
    startProfile(e.win, e.doc, () => ov);
    onProfile(fn);
    e.win.innerWidth = 820; e.win.innerHeight = 1180;
    e.fire('resize');
    vi.advanceTimersByTime(299);
    expect(getProfile()).toBe('phone');
    e.win.innerWidth = 390; e.win.innerHeight = 844; // the keyboard closed again
    vi.advanceTimersByTime(10);
    expect(getProfile()).toBe('phone');
    expect(fn).not.toHaveBeenCalled();
    e.win.innerWidth = 820; e.win.innerHeight = 1180;
    e.fire('resize');
    vi.advanceTimersByTime(300);
    expect(getProfile()).toBe('tablet');
    expect(fn).toHaveBeenCalledWith('tablet');
    expect([...e.html]).toEqual(['tablet']);
  });
  it('forceTv puts html.tv on and takes it off again, back to the computed profile', () => {
    const e = fakeEnv(390, 844, true);
    startProfile(e.win, e.doc, () => ov);
    forceTv(true);
    expect(getProfile()).toBe('tv');
    expect([...e.html]).toEqual(['tv']);
    forceTv(false);
    expect([...e.html]).toEqual(['phone']);
  });
  it('forceTv before the profile is started still toggles the tv class on the given page', () => {
    const e = fakeEnv();
    forceTv(true, e.doc);
    expect(e.html.has('tv')).toBe(true);
    forceTv(false, e.doc);
    expect(e.html.has('tv')).toBe(false);
  });
  it('markTouch (the first real touch) writes touch-mode once and stays sticky', () => {
    const e = fakeEnv(390, 844, false);
    startProfile(e.win, e.doc, () => ov);
    expect(getProfile()).toBe('laptop');
    markTouch();
    expect(e.body.has('touch-mode')).toBe(true);
    expect(getProfile()).toBe('phone');
  });
  it('a stopped listener hears nothing', () => {
    const e = fakeEnv();
    startProfile(e.win, e.doc, () => ov);
    const fn = vi.fn();
    const off = onProfile(fn);
    off();
    ov = 'phone';
    refreshProfile();
    expect(fn).not.toHaveBeenCalled();
  });
});
