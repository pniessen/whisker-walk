import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SKILLS, SKILL_IDS } from '../src/skills.js';
import { ICONS, LINES } from '../src/ui/skillbadgewords.js';
import { createBadgeStrip, PHONE_MAX, POP_MS, POP_WAIT_MS } from '../src/ui/skillbadges.js';
import { phrase, addPhrases } from '../src/clanphrases.js';
import { setSeriesMode, addWordSet, removeWordSet } from '../src/wordset.js';
import * as off from '../src/offclanwords.js';
import { readFileSync } from 'node:fs';

// Skill badges on the walking screen (owner backlog 2026-11-21). The strip reads the ids the save lists and writes nothing.
class El {
  constructor() { this.children = []; this.cls = new Set(); this.style = {}; this.attrs = {}; this.dataset = {}; this.ls = {}; this.own = ''; this.offsetHeight = 0; }
  set className(v) { this.cls = new Set(v.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.cls].join(' '); }
  get classList() { return { toggle: (c, on) => (on ? this.cls.add(c) : this.cls.delete(c)), add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c), contains: (c) => this.cls.has(c) }; }
  set textContent(v) { this.own = String(v); this.children = []; }
  get textContent() { return this.own; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { this.ls[t] = f; }
  remove() {}
  querySelector() { return null; }
  getBoundingClientRect() { return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }; }
}
const mk = () => {
  const doc = { createElement: () => new El(), defaultView: null };
  const root = new El();
  root.ownerDocument = doc;
  return root;
};
const ids = (strip) => strip.element.children.map((b) => b.dataset.skill || b.own);

describe('the badge words and pictures', () => {
  it('every skill has a picture, and none is left over', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...SKILL_IDS].sort());
    for (const id of SKILL_IDS) expect(ICONS[id].length).toBeGreaterThan(0);
  });
  for (const mode of ['on', 'off']) {
    it(`says every line in the ${mode} word set`, () => {
      addPhrases(LINES);
      if (mode === 'off') addWordSet('off', off);
      setSeriesMode(mode);
      try {
        for (const id of Object.keys(LINES)) {
          const t = phrase(id, id.endsWith('more') || id.endsWith('moreAria') ? 3 : 'Spring Paws');
          expect(t.length).toBeGreaterThan(1);
          expect(t).not.toMatch(/clan/i);
        }
        expect(phrase('skillbadge.named', 'Spring Paws')).toBe('Skill: Spring Paws');
      } finally { setSeriesMode('on'); if (mode === 'off') removeWordSet('off'); }
    });
  }
});

describe('the strip', () => {
  let timers;
  const setTimer = (fn, ms) => { const t = { fn, ms, on: true }; timers.push(t); return t; };
  const clearTimer = (t) => { t.on = false; };
  const run = (ms) => { for (const t of timers.filter((x) => x.on && x.ms <= ms)) { t.on = false; t.fn(); } };
  const hudStub = (busy = () => false) => { const toasts = []; return { toasts, toast: (t) => toasts.push(t), toastBusy: busy }; };
  beforeEach(() => { timers = []; });
  afterEach(() => vi.restoreAllMocks());

  it('shows nothing until a skill is earned, then only the earned ones in catalog order, without a pop', () => {
    const s = createBadgeStrip({ root: mk(), hud: hudStub(), setTimer, clearTimer, profile: () => 'laptop' });
    s.set([]);
    expect(s.element.cls.has('hidden')).toBe(true);
    s.set(['big-swat', 'spring-paws', 'nonsense', 7]);
    expect(ids(s)).toEqual(['spring-paws', 'big-swat']);
    expect(s.element.cls.has('hidden')).toBe(false);
    expect(s.element.children.every((b) => !b.cls.has('pop'))).toBe(true);
  });
  it('a tap names the skill as a toast', () => {
    const hud = hudStub();
    const s = createBadgeStrip({ root: mk(), hud, setTimer, clearTimer, profile: () => 'laptop' });
    s.set(['charmer']);
    s.element.children[0].ls.click();
    expect(hud.toasts).toEqual(['Skill: Charmer']);
  });
  it('a skill earned mid-walk pops in at the end, one at a time, the first wearing the gold ring', () => {
    const s = createBadgeStrip({ root: mk(), hud: hudStub(), setTimer, clearTimer, profile: () => 'laptop' });
    s.set(['spring-paws']);
    s.earn(['charmer', 'big-swat']);
    expect(ids(s)).toEqual(['spring-paws', 'charmer']);
    expect(s.element.children[1].cls.has('pop')).toBe(true);
    expect(s.element.children[1].cls.has('new')).toBe(true);
    expect(s.waiting).toEqual(['big-swat']);
    run(POP_MS);
    expect(ids(s)).toEqual(['spring-paws', 'charmer', 'big-swat']);
    expect(s.element.children[1].cls.has('pop')).toBe(false);
    expect(s.element.children[2].cls.has('pop')).toBe(true);
    s.earn(['charmer']); // not twice
    expect(s.shown.filter((x) => x === 'charmer').length).toBe(1);
  });
  it('on a phone a pop waits for the toast ahead of it, but never longer than the cap', () => {
    let busy = true;
    const s = createBadgeStrip({ root: mk(), hud: hudStub(() => busy), setTimer, clearTimer, profile: () => 'phone' });
    s.set([]);
    s.earn(['charmer']);
    expect(s.shown).toEqual([]);
    busy = false;
    run(400);
    expect(s.shown).toEqual(['charmer']);
    // a toast that never ends
    timers = [];
    busy = true;
    const t = createBadgeStrip({ root: mk(), hud: hudStub(() => busy), setTimer, clearTimer, profile: () => 'phone' });
    t.set([]);
    t.earn(['big-swat']);
    for (let i = 0; i < POP_WAIT_MS / 400 + 2; i++) run(400);
    expect(t.shown).toEqual(['big-swat']);
  });
  it('a phone folds the older badges into +n; a laptop shows them all', () => {
    const phone = createBadgeStrip({ root: mk(), hud: hudStub(), setTimer, clearTimer, profile: () => 'phone' });
    phone.set(SKILL_IDS);
    expect(phone.element.children.length).toBe(PHONE_MAX);
    expect(phone.element.children[0].own).toBe(`+${SKILL_IDS.length - PHONE_MAX + 1}`);
    expect(phone.element.children.at(-1).dataset.skill).toBe(SKILLS.at(-1).id);
    const laptop = createBadgeStrip({ root: mk(), hud: hudStub(), setTimer, clearTimer, profile: () => 'laptop' });
    laptop.set(SKILL_IDS);
    expect(laptop.element.children.length).toBe(SKILL_IDS.length);
  });
  it('a new walk clears a waiting pop', () => {
    const s = createBadgeStrip({ root: mk(), hud: hudStub(), setTimer, clearTimer, profile: () => 'laptop' });
    s.set(['spring-paws']);
    s.earn(['charmer', 'big-swat']);
    s.set(['spring-paws', 'charmer']);
    expect(s.waiting).toEqual([]);
    expect(ids(s)).toEqual(['spring-paws', 'charmer']);
  });
});

describe('the wiring', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  it('hud.js loads the strip lazily and walk.js hands it only the saved ids', () => {
    const hud = read('../src/ui/hud.js');
    expect(hud).toMatch(/import\('\.\/skillbadges\.js'\)/);
    expect(hud).not.toMatch(/^import .*skillbadges/m);
    const walk = read('../src/game/walk.js');
    expect(walk).toContain('hud.setBadges?.(state.skills)');
    expect(walk).toContain('hud.earnBadges?.(added)');
  });
  it('the strip never writes a save', () => {
    expect(read('../src/ui/skillbadges.js')).not.toMatch(/progression|localStorage|save\(/);
  });
  it('the CSS gives phone, tablet-and-laptop and TV sizes, reduced motion, and hides behind TV cards', () => {
    const css = read('../src/style.css'); const tv = read('../src/tv/tv.css');
    expect(css).toMatch(/html\.phone \.hud-badge \{ width: 24px/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.hud-badge\.pop \{ animation: none/);
    expect(tv).toMatch(/html\.tv \.hud-badge \{ width: calc\(48px/);
    expect(tv).toContain('.hud-area, .hud-badges) { visibility: hidden; }');
  });
  it('the row wraps and stops before the minimap, on TV too, keeping the gold ring and the pop', () => {
    const css = read('../src/style.css'); const tv = read('../src/tv/tv.css');
    expect(css).toMatch(/\.hud-badges \{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/\.hud-badges \{[^}]*max-width: calc\(100vw - 32px - var\(--map-size\)/);
    expect(tv).toMatch(/html\.tv \.hud-badges \{[^}]*max-width: calc\([^;]*var\(--map-size\)/);
    expect(css).toMatch(/\.hud-badge\.new \{ border-color: #f2c14e/);
    expect(css).toMatch(/\.hud-badge\.pop \{ animation: badge-pop/);
  });
});
