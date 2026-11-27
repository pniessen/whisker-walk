// Holiday flair on home and the Menu (src/ui/holidayflair.js, the H5 milestone): which holiday shows (the nearer-holiday rule),
// the words, the badges (nine lights, no six-pointed star), reduced motion, the Settings choice, and what is built where.
import { describe, it, expect } from 'vitest';
import { pickHoliday, greeting, menorahSvg, mountFlair, FLAIR_CSS } from '../src/ui/holidayflair.js';
import { setHolidayOverride, hanukkahFirstNight } from '../src/holidays.js';
import { createSettings } from '../src/settings.js';
import { memoryStorage } from './helpers/storage.js';
import { bannedIn } from './helpers/offwords.js';

const at = (m, d, y = 2026) => new Date(y, m - 1, d, 12);
const pick = (p, now) => { setHolidayOverride(null); return pickHoliday(p, now); };

describe('which holiday home shows', () => {
  it('nothing outside every window, and nothing when the choice is Off', () => {
    expect(pick('auto', at(7, 4))).toBe(null);
    expect(pick('off', at(12, 5))).toBe(null);
  });
  it('Winter Lights shows alone in its own days (2 Jan, and 28 Dec in 2026)', () => {
    expect(pick('auto', at(1, 2, 2027))?.id).toBe('winter');
    expect(pick('auto', at(12, 28))?.id).toBe('winter');
  });
  it('the nearer holiday only: Hanukkah on its nights (4 to 12 Dec 2026), Christmas for the rest of the month, the other held for the Menu', () => {
    const [, m, d] = hanukkahFirstNight(2026);
    for (let day = d; day <= 12; day++) expect(pick('auto', at(m, day))).toMatchObject({ id: 'hanukkah', other: 'christmas' });
    expect(pick('auto', at(12, 1))).toMatchObject({ id: 'christmas', other: null });
    expect(pick('auto', at(12, 13))).toMatchObject({ id: 'christmas', other: null });
    expect(pick('auto', at(12, 25))).toMatchObject({ id: 'christmas' });
  });
  it('2027: Hanukkah begins on 24 Dec, Christmas Day itself is Christmas, 26 Dec the day after is Christmas, 27 Dec on is Hanukkah', () => {
    expect(pick('auto', at(12, 24, 2027))?.id).toBe('hanukkah');
    expect(pick('auto', at(12, 25, 2027))?.id).toBe('christmas');
    expect(pick('auto', at(12, 26, 2027))?.id).toBe('christmas');
    expect(pick('auto', at(12, 27, 2027))?.id).toBe('hanukkah');
    expect(pick('auto', at(12, 31, 2027))?.id).toBe('hanukkah');
  });
  it('a chosen holiday in its own window wins; one out of its window falls back to Automatic', () => {
    expect(pick('christmas', at(12, 6))?.id).toBe('christmas');
    expect(pick('hanukkah', at(12, 6))?.id).toBe('hanukkah');
    expect(pick('hanukkah', at(12, 20))?.id).toBe('christmas');
    expect(pick('christmas', at(7, 4))).toBe(null);
  });
  it('the night comes with it (4 Dec is night 1, 12 Dec night 8), and the ?holiday= override pins one', () => {
    expect(pick('auto', at(12, 4))?.night).toBe(1);
    expect(pick('auto', at(12, 12))?.night).toBe(8);
    setHolidayOverride({ holiday: 'hanukkah', night: 5 });
    try { expect(pickHoliday('auto', at(7, 4))).toMatchObject({ id: 'hanukkah', night: 5 }); } finally { setHolidayOverride(null); }
  });
});

describe('the words and the pictures', () => {
  it('one plain line per holiday, the night in the Hanukkah one, no banned or series words', () => {
    expect(greeting('christmas')).toBe('Merry Christmas! Lights are up all over.');
    expect(greeting('hanukkah', 3)).toBe('Happy Hanukkah! Tonight is night 3.');
    expect(greeting('winter')).toBe('Happy Winter Lights!');
    for (const g of [greeting('christmas'), greeting('hanukkah', 3), greeting('hanukkah', 0), greeting('winter')]) expect(bannedIn(g)).toBe(null);
  });
  it('the menorah badge has nine lights, the shamash higher, and exactly the nights lit, left to right', () => {
    for (let n = 0; n <= 8; n++) {
      const svg = menorahSvg(n);
      expect(svg.match(/<ellipse/g).length).toBe(9);
      expect(svg.match(/fill="#ffc247"/g).length).toBe(n + 1); // the shamash always
      const ys = [...svg.matchAll(/<ellipse cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
      const shamash = ys.find(([x]) => x === 20);
      expect(Math.min(...ys.map(([, y]) => y))).toBe(shamash[1]);
      const lit = [...svg.matchAll(/<ellipse cx="([\d.]+)"[^>]*fill="(#ffc247|#6f7d94)"/g)].filter((m) => m[1] !== '20').sort((a, b) => a[1] - b[1]).map((m) => m[2] === '#ffc247');
      expect(lit).toEqual(Array.from({ length: 8 }, (_, i) => i < n));
    }
  });
  it('no six-pointed star and no text drawn in any badge, no image loaded', () => {
    for (const s of [menorahSvg(3), FLAIR_CSS]) { expect(s).not.toMatch(/<text|<image|url\(|star of david/i); }
  });
  it('the lights and the snow stop under reduced motion, on the system setting and on the game\'s own', () => {
    expect(FLAIR_CSS).toMatch(/html\.hf-still \.hf-strip[^{]*\{ animation: none/);
    expect(FLAIR_CSS).toMatch(/prefers-reduced-motion: reduce\) \{ \.hf-strip, \.hf-snow::after \{ animation: none/);
    expect(FLAIR_CSS).not.toMatch(/animation:[^;]*\b0?\.\d+s\b/); // nothing flashes: only the 6 s fades
  });
  it('phone and TV sizes are set, and the greeting sits out of the way of the birthday banner', () => {
    expect(FLAIR_CSS).toMatch(/html\.phone \.hf-strip \{ height: 6px/);
    expect(FLAIR_CSS).toMatch(/html\.phone \.hf-badge \{ height: 28px/);
    expect(FLAIR_CSS).toMatch(/html\.tv \.hf-badge/);
    expect(FLAIR_CSS).toMatch(/\.dr-stage\.party-on \.hf-greet \{ display: none/);
  });
});

describe('the Settings choice', () => {
  it('Automatic, Christmas, Hanukkah and Off, Automatic by default, junk is Automatic, stored on this device only', () => {
    const storage = memoryStorage();
    const s = createSettings(storage);
    expect(s.get('holidayDecor')).toBe('auto');
    for (const v of ['christmas', 'hanukkah', 'off', 'auto']) { s.set('holidayDecor', v); expect(createSettings(storage).get('holidayDecor')).toBe(v); }
    s.set('holidayDecor', 'easter'); expect(s.get('holidayDecor')).toBe('auto');
    s.set('holidayDecor', 'off'); s.set('holidayDecor', 7); expect(s.get('holidayDecor')).toBe('off');
    expect(s.get('holidayDecor')).not.toBeUndefined();
  });
});

// A stand-in for the few DOM calls the module makes.
function node(cls = '', kids = {}) {
  const n = { className: cls, dataset: {}, attrs: {}, children: [], text: '', innerHTML: '', after(x) { n.sibling = x; }, before(x) { n.sibling = x; },
    classList: { add: (c) => { n.className += ` ${c}`; }, contains: (c) => n.className.split(/\s+/).includes(c), toggle() {} },
    setAttribute(k, v) { n.attrs[k] = v; }, appendChild(c) { n.children.push(c); return c; }, set textContent(v) { n.text = v; }, get textContent() { return n.text; },
    querySelector: (sel) => kids[sel] ?? null };
  return n;
}
function fakeRoot({ home = true, menu = false } = {}) {
  const made = [];
  const doc = { head: node(), documentElement: node(), getElementById: () => null, createElement: () => { const e = node(); made.push(e); return e; } };
  const top = node('dr-top', { '.dr-visit': node('hb-pill dr-visit'), '.dr-title': node('dr-title') });
  const stage = node('dr-stage');
  const m = node('hb-menu', { h2: node() });
  const root = { ownerDocument: doc, querySelector: (sel) => (sel === '.dr-top' && home ? top : sel === '#dr-stage' && home ? stage : sel === '.hb-menu' && menu ? m : null) };
  return { root, doc, top, stage, m, made };
}

describe('what is built where', () => {
  it('home gets a strip, a badge and a greeting; once only; the Menu gets a tint and both lines when two holidays overlap', () => {
    const r = fakeRoot({ home: true, menu: true });
    expect(mountFlair(r.root, { now: at(12, 6) })).toBe(true);
    expect(r.top.children.some((c) => c.className === 'hf-strip' && c.dataset.hf === 'hanukkah' && c.attrs['aria-hidden'] === 'true')).toBe(true);
    expect(r.stage.children[0].text).toBe('Happy Hanukkah! Tonight is night 3.');
    expect(r.m.className).toContain('hf-menu'); expect(r.m.dataset.hf).toBe('hanukkah');
    const n = r.made.length;
    mountFlair(r.root, { now: at(12, 6) });
    expect(r.made.length).toBe(n); // dressed already: left alone
  });
  it('outside every window, or Off, nothing is built at all', () => {
    for (const [p, now] of [['auto', at(7, 4)], ['off', at(12, 6)]]) { const r = fakeRoot(); expect(mountFlair(r.root, { pick: p, now })).toBe(false); expect(r.made.length).toBe(0); }
  });
  it('snow-dust only for Winter Lights; the badge of a holiday shows its own thing', () => {
    const r = fakeRoot(); mountFlair(r.root, { now: at(1, 3, 2027) });
    expect(r.top.querySelector('.dr-title').className).toContain('hf-snow');
    const c = fakeRoot(); mountFlair(c.root, { now: at(12, 20) });
    expect(c.top.querySelector('.dr-title').className).not.toContain('hf-snow');
  });
});
