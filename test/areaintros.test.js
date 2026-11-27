// The arrival cards of the Crystal Cave, the Moon and the Greenhouse (world/arrivalcard.js and the three *intro.js files).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fakePage } from './helpers/moonpage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { createCrystalIntro, introWords as crystalWords } from '../src/world/crystalintro.js';
import { createMoonIntro, introWords as moonWords } from '../src/world/moonintro.js';
import { createGreenhouseIntro, introWords as ghWords } from '../src/world/greenhouseintro.js';
import { CARD_SECS } from '../src/world/arrivalcard.js';
import { LINES as CL } from '../src/world/crystalwords.js';
import { LINES as ML } from '../src/world/moonwords.js';
import { LINES as GL } from '../src/world/greenhousewords.js';

const prog = (key, v) => ({ state: { [key]: v } });
const banned = /\b(dark|lost forever|trapped|stuck|collapse|cave-in|scary)\b/i;

describe('the line ids', () => {
  it('resolve in both word sets, with three lines each and no banned words', () => {
    for (const [words, table, pre] of [[crystalWords, CL, 'crystal.intro'], [moonWords, ML, 'moon.intro'], [ghWords, GL, 'greenhouse.intro']]) {
      for (const i of [1, 2, 3]) expect(Object.keys(table)).toContain(pre + i);
      const on = words();
      expect(on).toHaveLength(3);
      for (const s of on) { expect(s.length).toBeGreaterThan(10); expect(s).not.toMatch(banned); expect(s).not.toBe(pre + 1); }
      withOffWords(() => { const off = words(); expect(off).toHaveLength(3); for (const s of off) { expect(bannedIn(s)).toBeNull(); expect(s).not.toMatch(banned); } });
    }
  });
  it('the files use only literal ids', () => {
    for (const f of ['crystalintro', 'moonintro', 'greenhouseintro']) {
      const src = readFileSync(`src/world/${f}.js`, 'utf8');
      for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) expect(m[1]).toMatch(/^'[a-z0-9.]+'$/);
    }
  });
});

describe('the card', () => {
  it('Crystal: shows at step 0, not after; closes when Lumi is met, on OK, and after 20 s', () => {
    let p = fakePage();
    expect(createCrystalIntro({ doc: p.doc, win: p.win, progression: prog('crystal', { step: 1 }) }).state.cardOn).toBe(false);
    expect(p.hud.children).toHaveLength(0);
    p = fakePage();
    const pr = prog('crystal', { step: 0 });
    const c = createCrystalIntro({ doc: p.doc, win: p.win, progression: pr });
    expect(c.state.cardOn).toBe(true);
    expect(c.els.card.children.slice(0, 3).map((e) => e.textContent)).toEqual(crystalWords());
    c.update(1); expect(c.state.cardOn).toBe(true);
    pr.state.crystal = { step: 1 }; c.update(0.1); expect(c.state.cardOn).toBe(false);
    const p2 = fakePage();
    const c2 = createCrystalIntro({ doc: p2.doc, win: p2.win, progression: prog('crystal', { step: 0 }) });
    c2.els.card.children[3].fire('click'); expect(c2.state.cardOn).toBe(false);
    const c3 = createCrystalIntro({ doc: p2.doc, win: p2.win, progression: prog('crystal', { step: 0 }) });
    c3.update(CARD_SECS - 1); expect(c3.state.cardOn).toBe(true); c3.update(2); expect(c3.state.cardOn).toBe(false);
    c3.dispose(); expect(c3.els.card.removed).toBe(true);
  });
  it('Moon: shows while Pip sleeps, not once the base has begun (a room whose partner is past step 0)', () => {
    const p = fakePage();
    expect(createMoonIntro({ doc: p.doc, win: p.win, progression: prog('moon', { step: 0, cells: 0 }) }).state.cardOn).toBe(true);
    expect(createMoonIntro({ doc: p.doc, win: p.win, progression: prog('moon', { step: 1, cells: 0 }) }).state.cardOn).toBe(false);
    expect(createMoonIntro({ doc: p.doc, win: p.win, progression: prog('moon', { step: 4, cells: 3 }) }).state.cardOn).toBe(false);
    const pr = prog('moon', { step: 0, cells: 0 });
    const c = createMoonIntro({ doc: p.doc, win: p.win, progression: pr });
    pr.state.moon = { step: 1, cells: 0 }; c.update(0.1); expect(c.state.cardOn).toBe(false);
  });
  it('Greenhouse: first visit only, jobs not done; closes at the first seed or watering', () => {
    const p = fakePage();
    const mk = (visits, journal, st) => createGreenhouseIntro({ doc: p.doc, win: p.win, progression: { state: { journal } }, visits, state: () => st });
    expect(mk(0, {}, { seeds: 0, watered: 0 }).state.cardOn).toBe(true);
    expect(mk(1, {}, { seeds: 0, watered: 0 }).state.cardOn).toBe(true);
    expect(mk(2, {}, { seeds: 0, watered: 0 }).state.cardOn).toBe(false);
    expect(mk(0, { ghjobseeds: 3 }, { seeds: 0, watered: 0 }).state.cardOn).toBe(false);
    const st = { seeds: 0, watered: 0 };
    const c = mk(0, {}, st);
    c.update(1); expect(c.state.cardOn).toBe(true);
    st.seeds = 1; c.update(0.1); expect(c.state.cardOn).toBe(false);
  });
  it('never blocks movement and uses no animation (reduced motion is the same)', () => {
    const p = fakePage();
    const c = createMoonIntro({ doc: p.doc, win: p.win, progression: prog('moon', { step: 0 }) });
    expect(c.els.card.style.pointerEvents).toBe('none');
    expect(c.els.card.children[3].style.pointerEvents).toBe('auto');
    expect(JSON.stringify(c.els.card.style)).not.toMatch(/transition|animation/i);
    expect(readFileSync('src/world/arrivalcard.js', 'utf8').replace(/\/\/.*$/gm, '')).not.toMatch(/transition|animation|requestAnimationFrame|Math\.random/);
  });
});
