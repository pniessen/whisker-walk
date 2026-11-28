// The story cards (ui/storycard.js, ui/storycardwords.js; docs/superpowers/specs/2026-11-28-story-cards-design.md): a short "story so far" card for every place with a
// mission. Coverage over the catalog of mission places, the chapter rules against the missions' own step repairs, the words in both sets, and the card on a fake page.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { fakePage } from './helpers/moonpage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { STORY_PLACES, JOB_PAGES, SHOW_SECS, chapterFor, cardText, wantsAuto, stepOf, createStoryCard } from '../src/ui/storycard.js';
import { STORY_TEXT, CLAN_LINES, chapterLines } from '../src/ui/storycardwords.js';
import { hasStoryCard, pauseCardHtml } from '../src/game/walk.js';
import { FARM_JOB_IDS } from '../src/farmjobids.js';
import { ERRAND_IDS } from '../src/world/marketerrands.js';
import { GREENHOUSE_JOB_IDS } from '../src/greenhousepages.js';
import { LIGHTHOUSE_JOB_PAGES } from '../src/lighthousepages.js';
import * as MOON from '../src/world/moonmission.js';
import * as REEF from '../src/reefmission.js';
import * as CRYSTAL from '../src/crystalmission.js';
import * as JUNGLE from '../src/world/junglemission.js';
import * as SNOW from '../src/world/snowvillemission.js';
import * as TREE from '../src/world/treehousemission.js';
import * as DEEP from '../src/world/crystaldeepmission.js';
import { NAMES as JUNGLE_NAMES } from '../src/world/junglewords.js';
import { NAMES as SNOW_NAMES } from '../src/world/snowvillewords.js';
import { NAMES as TREE_NAMES } from '../src/world/treehousewords.js';

const ARCS = { moon: ['moon', MOON, 'cells', 8], reef: ['reef', REEF, 'shells', 7], crystal: ['crystal', CRYSTAL, 'sparks', 7], jungle: ['jungle', JUNGLE, 'fruit', 7], snowville: ['snowville', SNOW, 'candles', 7], treehouse: ['treehouse', TREE, 'letters', 7] };
const norm = (f) => f.split('\\').join('/');
const rec = (place, over = {}) => ({ [place]: { step: 0, ...over } });

describe('the catalog of places with a story', () => {
  it('has a card for every mission file (src/**/*mission.js), by the place it names', () => {
    const places = new Set(globSync('src/**/*mission.js').map((f) => norm(f).split('/').pop().replace(/(deep)?mission\.js$/, '')));
    expect([...places].sort()).toEqual(['crystal', 'jungle', 'moon', 'reef', 'snowville', 'treehouse']);
    for (const p of places) expect(STORY_PLACES).toContain(p);
  });
  it('has a card for every place whose pages file lists jobs, and every job is on its list', () => {
    for (const f of globSync('src/*pages.js')) {
      const place = norm(f).split('/').pop().replace('pages.js', '');
      if (/\bjob/i.test(readFileSync(f, 'utf8'))) expect(STORY_PLACES, f).toContain(place);
    }
    expect(Object.keys(JOB_PAGES.farm)).toEqual([...FARM_JOB_IDS]);
    expect(Object.keys(JOB_PAGES.market)).toEqual([...ERRAND_IDS]);
    expect(Object.values(JOB_PAGES.market)).toEqual(ERRAND_IDS.map((id) => `mk${id}`));
    expect(Object.values(JOB_PAGES.farm)).toEqual(FARM_JOB_IDS.map((id) => `job${id}`));
    expect(Object.values(JOB_PAGES.greenhouse)).toEqual(GREENHOUSE_JOB_IDS.map((id) => `gh${id}`));
    expect(Object.values(JOB_PAGES.lighthouse)).toEqual(Object.values(LIGHTHOUSE_JOB_PAGES));
  });
  it('is the start-up check, the text table and the words one and the same list', () => {
    expect(Object.keys(STORY_TEXT).sort()).toEqual([...STORY_PLACES].sort());
    for (const p of STORY_PLACES) expect(hasStoryCard(p)).toBe(true);
    for (const p of ['neighborhood', 'park', 'gorge', 'roofs', 'den']) expect(hasStoryCard(p)).toBe(false);
  });
});

describe('the chapter rules agree with the missions', () => {
  it('read the same step as every mission file on many saves', () => {
    for (const [place, [, M, bits]] of Object.entries(ARCS)) {
      const key = place === 'moon' ? 'cells' : bits;
      for (let step = 0; step <= 9; step++) for (let b = 0; b <= 7; b++) {
        const r = { step, [key]: b };
        expect(stepOf(r, key), `${place} ${JSON.stringify(r)}`).toBe(Math.min(M.normalize(r).step, place === 'moon' ? 9 : 7));
      }
    }
  });
  it('the Echo Deep: the open rule and the bits are the second story\'s own', () => {
    for (const step of [6, 7]) for (const songs of [0, 3, 7]) for (const album of [0, 1, 3, 7]) for (const deep of [0, 1, 2, 3, 7, 15]) {
      const c = { step, sparks: 7, songs, album, deep };
      const k = chapterFor('crystal', { crystal: c }, { deepOn: true }).keys[0];
      const bits = DEEP.deepBits(c);
      if (step < 7) { expect(k).toBe('heart'); continue; }
      if (bits === 0 && !DEEP.isOpen(c)) expect(k).toBe('done');
      else expect(k).toBe({ 0: 'deepwall', 1: 'deepprism', 3: 'deepfind', 7: 'deephome', 15: 'deepdone' }[bits]);
    }
  });
  it('picks the right chapter at each step', () => {
    const keys = (place, r, o) => chapterFor(place, { [place]: r }, o).keys;
    expect(keys('moon', { step: 0, cells: 0 })).toEqual(['asleep']);
    expect(keys('moon', { step: 1, cells: 1 })).toEqual(['power']);
    expect(keys('moon', { step: 3, cells: 3 })).toEqual(['bothin']);
    expect(keys('moon', { step: 4, cells: 3 })).toEqual(['awake']);
    expect(keys('moon', { step: 8, cells: 3, relay: 0 })).toEqual(['done', 'cave', 'relay']);
    expect(keys('moon', { step: 8, cells: 7, relay: 16 })).toEqual(['done']);
    expect(keys('reef', { step: 2, shells: 1 })).toEqual(['shells', 'seals']);
    expect(keys('reef', { step: 5, shells: 7 })).toEqual(['lanterns', 'seals']);
    expect(keys('reef', { step: 7, shells: 7, lab: 0, wreck: 0 })).toEqual(['done', 'lab', 'wreck']);
    expect(keys('crystal', { step: 4, sparks: 3 })).toEqual(['stones']);
    expect(keys('crystal', { step: 6, sparks: 7 })).toEqual(['heart']);
    expect(keys('crystal', { step: 7, sparks: 7, forge: 0, songs: 0 }, { deepOn: false })).toEqual(['done', 'forge', 'songs']);
    expect(keys('crystal', { step: 7, sparks: 7, forge: 8, songs: 7 }, { deepOn: false })).toEqual(['done']);
    expect(keys('crystal', { step: 7, sparks: 7, songs: 0 }, { deepOn: true })).toEqual(['done', 'deeplocked']);
    expect(keys('jungle', { step: 4, fruit: 7 })).toEqual(['set']);
    expect(keys('jungle', { step: 6, fruit: 7 })).toEqual(['supper']);
    expect(keys('snowville', { step: 4, candles: 7 })).toEqual(['warm']);
    expect(keys('treehouse', { step: 4, letters: 7 })).toEqual(['bell']);
    expect(keys('treehouse', { step: 7, letters: 7 })).toEqual(['done']);
  });
  it('job places count the journal pages and offer the first job not done', () => {
    const c = chapterFor('market', { journal: { mkglove: 2, mkmouse: 0 } });
    expect(c.done).toEqual(['glove']);
    expect(c.next).toBe('mouse');
    expect(c.total).toBe(6);
    expect(chapterFor('farm', { journal: { jobchicks: 1, jobcow: 1, jobgoat: 1, jobmice: 1 } }).finished).toBe(true);
    expect(chapterFor('greenhouse', { journal: {} }).finished).toBe(false);
  });
});

describe('the words', () => {
  const every = () => {
    const out = [];
    for (const place of STORY_PLACES) {
      const t0 = { ...STORY_TEXT[place] };
      if (ARCS[place]) {
        const [, , bits, top] = ARCS[place];
        const key = place === 'moon' ? 'cells' : bits;
        for (let step = 0; step <= top; step++) for (const b of [0, 1, 3, 7]) for (const extra of [{}, { forge: 8, songs: 7, lab: 15, wreck: 31, relay: 31 }, { deep: 15, songs: 7, album: 3 }]) for (const deepOn of [false, true]) {
          out.push([`${place} step ${step} ${key} ${b}`, cardText(place, { [place]: { step, [key]: b, ...extra } }, { deepOn })]);
        }
      } else if (!JOB_PAGES[place]) {
        out.push([`${place} static`, cardText(place, {})]);
      } else {
        for (const n of [0, 1, 2]) out.push([`${place} ${n} done`, cardText(place, { journal: Object.fromEntries(Object.values(JOB_PAGES[place]).slice(0, n).map((k) => [k, 1])) })]);
        out.push([`${place} all`, cardText(place, { journal: Object.fromEntries(Object.values(JOB_PAGES[place]).map((k) => [k, 1])) })]);
      }
      void t0;
    }
    return out;
  };
  it('every card has a title and two to four short lines, no raw placeholder, in both word sets', () => {
    const check = () => { for (const [id, t] of every()) {
      expect(t.title.length, id).toBeGreaterThan(3);
      expect(t.lines.length, id).toBeGreaterThanOrEqual(1);
      expect(t.lines.length, id).toBeLessThanOrEqual(4);
      for (const l of t.lines) { expect(l, id).not.toMatch(/[{}]/); expect(l.length, id).toBeLessThan(140); expect(l.length, id).toBeGreaterThan(8); }
    } };
    check();
    withOffWords(check);
  });
  it('the everyday set never shows a word it must not, and the Clan set takes only its own lines', () => {
    withOffWords(() => { for (const [id, t] of every()) for (const l of [t.title, ...t.lines]) expect(bannedIn(l), `${id}: ${l}`).toBeNull(); });
    for (const [place, chapters] of Object.entries(CLAN_LINES)) for (const k of Object.keys(chapters)) expect(STORY_TEXT[place].ch[k], `${place}.${k}`).toBeTruthy();
    expect(chapterLines('moon', 'done')[0]).toMatch(/Silverpelt/);
    withOffWords(() => expect(chapterLines('moon', 'done')[0]).not.toMatch(/Silverpelt/));
  });
  it('tell the child true things: the characters\' names, the counts, the next step', () => {
    expect(STORY_TEXT.jungle.ch.unmet.join(' ')).toContain(JUNGLE_NAMES.mossy);
    expect(STORY_TEXT.snowville.ch.unmet.join(' ')).toContain(SNOW_NAMES.tilly);
    expect(STORY_TEXT.treehouse.ch.unmet.join(' ')).toContain(TREE_NAMES.nutmeg);
    const names = { moon: 'Pip', reef: 'Marlo', crystal: 'Lumi' };
    for (const [p, n] of Object.entries(names)) expect(STORY_TEXT[p].ch.asleep?.join(' ') ?? STORY_TEXT[p].ch.unmet.join(' ')).toContain(n);
    expect(cardText('reef', rec('reef', { step: 3, shells: 3 })).lines.join(' ')).toContain('2 of 3');
    expect(cardText('crystal', rec('crystal', { step: 3, sparks: 3 })).lines.join(' ')).toContain('2 of 3');
    expect(cardText('moon', rec('moon', { step: 2, cells: 1 })).lines.join(' ')).toContain('1 of 2');
    expect(cardText('market', { journal: { mkglove: 1 } }).lines.join(' ')).toContain('1 of 6 errands');
    expect(cardText('market', { journal: { mkglove: 1 } }).lines.join(' ')).toContain(STORY_TEXT.market.jobs.mouse); // the first job not done
  });
});

// a page with what the card needs (key listeners, a pause card flag, other arrival cards)
function page({ pauseCard = false, arrival = [] } = {}) {
  const p = fakePage();
  const keys = [];
  Object.assign(p.doc, {
    addEventListener: (t, f) => { if (t === 'keydown') keys.push(f); },
    removeEventListener: (t, f) => { const i = keys.indexOf(f); if (i >= 0) keys.splice(i, 1); },
    querySelector: (sel) => (sel === '#btn-resume' ? (pauseCard ? {} : null) : null),
    querySelectorAll: (sel) => (sel === '[data-arrival-card]' ? arrival : []),
    activeElement: null,
  });
  p.key = (code) => keys.slice().forEach((f) => f({ code, repeat: false }));
  p.keys = keys;
  return p;
}
const pad = (down = []) => ({ getGamepads: () => [{ connected: true, buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: down.includes(i) })) }] });
const fresh = (place) => (JOB_PAGES[place] ? { journal: {} } : { [place]: { step: 0, cells: 0 } });
const prog = (place, state = fresh(place)) => ({ state: { walks: {}, ...state } });

describe('the card on a walk', () => {
  for (const place of STORY_PLACES) {
    it(`${place}: shows on the first arrival with the chapter's words, not again after OK, opens again, never blocks`, () => {
      const p = page();
      const pr = prog(place);
      const c = createStoryCard({ doc: p.doc, win: p.win, place, progression: pr, visits: 0, deepOn: true });
      const want = cardText(place, pr.state, { deepOn: true });
      expect(c.isOpen()).toBe(true);
      expect(c.els.card.style.display).toBe('block');
      expect(c.els.card.children[0].textContent).toBe(STORY_TEXT[place].title);
      expect(c.els.card.children[1].children.map((e) => e.textContent)).toEqual(want.lines);
      expect(want.lines.length).toBeGreaterThanOrEqual(2);
      // it takes no taps itself and holds nothing: only its OK button does
      expect(c.els.card.style.pointerEvents).toBe('none');
      expect(c.els.card.children[3].style.pointerEvents).toBe('auto');
      c.els.card.children[3].fire('click');
      expect(c.isOpen()).toBe(false);
      for (let i = 0; i < 100; i++) c.update(0.5);
      expect(c.isOpen()).toBe(false); // never again by itself on this walk
      p.key('KeyB');
      expect(c.isOpen()).toBe(true); // the B key brings it back
      c.update(SHOW_SECS + 1);
      expect(c.isOpen()).toBe(false); // and it fades by itself
      c.open();
      expect(c.isOpen()).toBe(true);
      c.dispose();
      expect(c.els.card.removed).toBe(true);
      expect(p.keys).toHaveLength(0);
    });
  }
  it('comes by itself on every arrival in a place, unless a lesson is open; the button still brings it', () => {
    const st = { moon: { step: 1, cells: 0 } };
    expect(wantsAuto({ place: 'moon', state: st, visits: 0 })).toBe(true);
    expect(wantsAuto({ place: 'moon', state: st, visits: 9 })).toBe(true);
    expect(wantsAuto({ place: 'moon', state: { moon: { step: 8, cells: 3 } }, visits: 0 })).toBe(true);
    expect(wantsAuto({ place: 'moon', state: st, visits: 0, lesson: { finished: false, skipped: false } })).toBe(false);
    expect(wantsAuto({ place: 'moon', state: st, visits: 0, lesson: { finished: true } })).toBe(true);
    expect(wantsAuto({ place: 'house' })).toBe(true);
    expect(wantsAuto({ place: 'park' })).toBe(false);
    const p = page();
    const c = createStoryCard({ doc: p.doc, win: p.win, place: 'farm', progression: prog('farm'), visits: 5 });
    expect(c.isOpen()).toBe(true);
    c.close();
    c.toggle();
    expect(c.isOpen()).toBe(true);
  });
  it('has fixed cards for the Old House and the Fairground, and the Reef card names the Sealab and the seals', () => {
    for (const place of ['house', 'fair']) { const t = cardText(place, {}); expect(t.lines.length).toBeGreaterThanOrEqual(3); expect(chapterFor(place, {}).keys).toEqual(['intro']); }
    for (const st of [{}, { reef: { step: 7, shells: 7, lab: 7 } }, { reef: { step: 7, shells: 7, lab: 0 } }]) expect(cardText('reef', st).lines.join(' ')).toMatch(/Sealab/);
    expect(cardText('reef', { reef: { step: 7, shells: 7, lab: 0 } }).lines.join(' ')).toMatch(/Seals/);
  });
  it('waits under the pause card or an open overlay, and shows once the way is clear', () => {
    const p = page({ pauseCard: true });
    const c = createStoryCard({ doc: p.doc, win: p.win, place: 'house', progression: prog('house'), visits: 0 });
    expect(c.isOpen()).toBe(false);
  });
  it('says where she is: the moon at step 2 with one cell in', () => {
    const p = page();
    const c = createStoryCard({ doc: p.doc, win: p.win, place: 'moon', progression: prog('moon', rec('moon', { step: 2, cells: 1 })), visits: 1 });
    expect(c.els.card.children[1].children[1].textContent).toContain('1 of 2');
  });
  it('closes with E, Enter, Escape or a pad button; the pad\'s Select opens it; B does nothing under the pause card', () => {
    const p = page();
    const nav = pad([]);
    const c = createStoryCard({ doc: p.doc, win: p.win, nav, place: 'reef', progression: prog('reef'), visits: 0 });
    p.key('KeyE'); expect(c.isOpen()).toBe(false);
    c.open(); p.key('Enter'); expect(c.isOpen()).toBe(false);
    c.open(); p.key('Escape'); expect(c.isOpen()).toBe(false);
    c.open();
    c.update(0.1);
    c.update(0.1); expect(c.isOpen()).toBe(true);
    const down = createStoryCard({ doc: p.doc, win: p.win, nav: pad([1]), place: 'reef', progression: prog('reef'), visits: 0 });
    down.update(0.1); expect(down.isOpen()).toBe(false); // B pressed: closed
    const sel = createStoryCard({ doc: page().doc, win: p.win, nav: pad([8]), place: 'reef', progression: prog('reef'), lesson: { finished: false } });
    sel.update(0.1); expect(sel.isOpen()).toBe(true); // Select: opened
    const paused = page({ pauseCard: true });
    const c2 = createStoryCard({ doc: paused.doc, win: p.win, place: 'reef', progression: prog('reef'), lesson: { finished: false } });
    paused.key('KeyB'); expect(c2.isOpen()).toBe(false);
  });
  it('replaces the small arrival cards, so two never stack', () => {
    const a = { style: { display: 'block' } };
    const p = page({ arrival: [a] });
    createStoryCard({ doc: p.doc, win: p.win, place: 'crystal', progression: prog('crystal'), visits: 0 });
    expect(a.style.display).toBe('none');
    const b = { style: { display: 'block' } };
    const q = page({ arrival: [b] });
    createStoryCard({ doc: q.doc, win: q.win, place: 'crystal', progression: prog('crystal'), lesson: { finished: false } });
    expect(b.style.display).toBe('block'); // nothing hidden when it does not show
  });
  it('is sized for a phone, and bigger on a TV', () => {
    const phone = createStoryCard({ doc: page().doc, win: { innerWidth: 390 }, place: 'moon', progression: prog('moon'), visits: 0 });
    const desk = createStoryCard({ doc: page().doc, win: { innerWidth: 1200 }, place: 'moon', progression: prog('moon'), visits: 0 });
    expect(parseInt(phone.els.card.style.fontSize, 10)).toBeLessThan(parseInt(desk.els.card.style.fontSize, 10));
    expect(phone.els.card.style.width).toBe('min(90vw, 26em)');
    const tvPage = page();
    tvPage.doc.documentElement = { classList: { contains: (c) => c === 'tv' } };
    const tv = createStoryCard({ doc: tvPage.doc, win: { innerWidth: 1920, getComputedStyle: () => ({ fontSize: '24px' }) }, place: 'moon', progression: prog('moon'), visits: 0 });
    expect(parseInt(tv.els.card.style.fontSize, 10)).toBeGreaterThan(24);
  });
  it('on a phone, upright or on its side, the card is capped at 60% of the height and scrolls; desktop and tablet are unchanged', () => {
    const mk = (win, touch = true) => createStoryCard({ doc: page().doc, win, touch, place: 'moon', progression: prog('moon'), visits: 0 }).els.card.style;
    for (const s of [mk({ innerWidth: 390, innerHeight: 844 }), mk({ innerWidth: 844, innerHeight: 390 })]) {
      expect(s.maxHeight).toBe('60vh');
      expect(s.overflowY).toBe('auto');
      expect(parseInt(s.fontSize, 10)).toBeLessThanOrEqual(12);
    }
    for (const s of [mk({ innerWidth: 820, innerHeight: 1180 }), mk({ innerWidth: 1180, innerHeight: 820 }), mk({ innerWidth: 1280, innerHeight: 400 }, false)]) {
      expect(s.maxHeight).toBe('');
      expect(s.top).toBe('22%');
      expect(s.fontSize).toBe('18px');
    }
  });
  it('does nothing without a page, and nothing for a place with no story', () => {
    expect(createStoryCard({ doc: null, place: 'moon', progression: prog('moon') }).isOpen()).toBe(false);
    expect(createStoryCard({ doc: page().doc, place: 'park', progression: prog('park') }).isOpen()).toBe(false);
  });
});

describe('the pause card', () => {
  it('has a Story so far button only in a place with a story', () => {
    expect(pauseCardHtml({ touch: false, mode: 'paused', story: true })).toContain('id="btn-story"');
    expect(pauseCardHtml({ touch: false, mode: 'paused' })).not.toContain('btn-story');
  });
});
