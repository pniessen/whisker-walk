import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';
import { profileFor, startProfile, stopProfile, getProfile } from '../src/profile.js';

// Phone and laptop are pinned (docs/superpowers/specs/2026-11-22-device-profiles-design.md, section 5).
// jsdom cannot lay out, so the pin is the CSS that decides the phone and laptop look: every rule for the
// listed selectors in src/style.css, with its @media context, compared with the golden file recorded on
// main before the layout profile existed. The profile classes must add no rule of their own beyond the
// --pv-* values. A deliberate change (M2 phone cleanup) regenerates the golden in the same commit:
//   UPDATE_PROFILE_GOLDEN=1 npx vitest run test/profilepin.test.js
const CSS = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const GOLDEN = new URL('./fixtures/profilepin.golden.json', import.meta.url);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const ctx = (n) => { const out = []; for (let p = n.parent; p && p.type === 'atrule'; p = p.parent) out.unshift(`@${p.name} ${norm(p.params)}`); return out.join(' > '); };

function rules(css) {
  const out = [];
  postcss.parse(css).walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes$/.test(r.parent.name)) return;
    out.push({ sel: norm(r.selector), at: ctx(r), body: norm(r.nodes.map((d) => d.toString()).join(';')) });
  });
  return out;
}

// What decides phone and laptop looks: touch-mode rules and every rule inside a pointer, width or height query.
const touchy = (r) => /body\.touch-mode/.test(r.sel) || /pointer|max-width|max-height|min-width/.test(r.at);
const profileClass = (r) => /html\.(phone|tablet|laptop|tv)\b/.test(r.sel);

describe('phone and laptop are pinned', () => {
  const all = rules(CSS);
  const sel = [...new Set(all.filter(touchy).filter((r) => !profileClass(r)).map((r) => r.sel))].sort();
  const snapshot = Object.fromEntries(sel.map((s) => [s, all.filter((r) => r.sel === s).map((r) => `${r.at ? r.at + ' | ' : ''}${r.body}`)]));

  it('the pinned selector list is large enough to mean something', () => expect(sel.length).toBeGreaterThanOrEqual(60));
  it('every rule for the pinned selectors equals the golden file', () => {
    if (process.env.UPDATE_PROFILE_GOLDEN) writeFileSync(GOLDEN, JSON.stringify(snapshot, null, 1) + '\n');
    expect(snapshot).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
  });
  it('the profile classes only carry the --pv-* values, so they cannot move a look', () => {
    for (const r of all.filter(profileClass)) {
      expect(r.body.split(';').filter(Boolean).every((d) => /^\s*--pv-[a-z]+:/.test(d)), r.sel).toBe(true);
    }
  });
});

describe('with no override a default phone or laptop never gets html.tv', () => {
  const base = { query: null, tv: false, noTv: false, tvOn: false, override: 'auto', points: 0 };
  it('a coarse 390x844 screen is phone', () => expect(profileFor({ ...base, coarse: true, side: 390 })).toBe('phone'));
  it('a fine 1440x900 screen is laptop', () => expect(profileFor({ ...base, coarse: false, side: 900 })).toBe('laptop'));
  it('a phone started with no query writes no html.tv', () => {
    const set = new Set();
    const cl = { toggle: (n, on) => (on ? set.add(n) : set.delete(n)), add: () => {} };
    const win = { innerWidth: 390, innerHeight: 844, location: { search: '' }, navigator: {}, matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} };
    startProfile(win, { documentElement: { classList: cl }, body: { classList: cl } }, () => 'auto');
    expect(getProfile()).toBe('phone');
    expect(set.has('tv')).toBe(false);
    stopProfile();
  });
});
