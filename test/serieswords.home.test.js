// The series-words snapshot, part 3: the HOME SCREEN. Its title bar, the page
// title, the Settings edition row and its note, the star-name picker in Play
// together, the Colony sheet's banner, the Skills sheet's fighting moves and
// the Journal's chased-off line are written inside createHomeBase's closure,
// so they are recorded by rendering the real home base into a stand-in page
// (the one test/homebase.edition.test.js uses), in both editions.
//
// Only the segments that carry a series word, a group name or one of the
// words written beside them are kept (helpers/serieswords.js seriesFilter):
// the rest of the home screen, and the guided first walk's lines on it, are
// not part of the switch and would only make this snapshot churn.
//
// See test/serieswords.test.js for what the snapshot is for. Re-record ONLY
// when the owner or the older playtester has asked for a wording change in
// the "on" game:  UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords
import { describe, it, expect, vi, afterEach } from 'vitest';

// The home base's WebGL pieces cannot run in node: stub the thumbnails, the
// hero stage and the dressing-room controller (its sheets are recorded from
// the pure builders in serieswords.test.js). The stub keeps onOpenSheet.
let openSheet = null;
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    openSheet = opts.onOpenSheet;
    return {
      html: ({ headerHtml }) => `<header>${headerHtml}</header>`,
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
// 2026-11-17: read through words(), as serieswords.test.js does (see there).
const { words } = await import('../src/wordset.js');
const { HOMES, clanName } = await import('../src/clanhomes.js');
const { clanTitleFor } = await import('../src/clannames.js');
const { checkAgainstFixture, htmlText, seriesFilter } = await import('./helpers/serieswords.js');
const { withStandInWords, leaksIn, standInCount } = await import('./helpers/standinwords.js');

const FIXTURE = 'series-words-on-home.json';
const CLANS = Object.keys(HOMES);
const ME = 'player-me-000001';

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() {}, querySelector() { return null; }, focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
  return el;
}
function fakeDocument() {
  const doc = { defaultView: { innerWidth: 375, innerHeight: 812 }, title: '' };
  doc.createElement = () => fakeEl(doc);
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.splash = fakeEl(doc);
  doc.splashWord = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : id === 'splash' ? doc.splash : null);
  doc.querySelector = (sel) => (sel === '#splash .splash-edition' ? doc.splashWord : null);
  return doc;
}

afterEach(() => { delete globalThis.document; });

const seriesKeep = seriesFilter(
  [...Object.values(words().RANK_WORDS), ...Object.values(words().OUTSIDE_WORDS), ...Object.values(words().PLACE_WORDS), words().CLAN_SUFFIX],
  [...CLANS.map(clanName), ...words().PREFIXES.map((p) => p + words().CLAN_SUFFIX), ...words().PREFIXES.map((p) => p + words().RANK_SUFFIX.leader)],
);

function homeFor(edition, { mine = null, keep = seriesKeep } = {}) {
  const doc = fakeDocument();
  globalThis.document = doc;
  const progression = createProgression(memStorage());
  if (edition !== 'canon') progression.setEdition(edition);
  progression.ensureClanName(ME);
  if (mine && edition === 'canon') progression.setClanPick(mine);
  const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
  const rooms = { available: true, getState: () => null, onChange() {} };
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: ME, toast: () => {} });
  hb.show();
  const out = {
    pageTitle: doc.title,
    splash: [doc.splashWord.textContent, doc.splash.attrs['aria-label']],
    home: htmlText(doc.root.innerHTML).filter(keep),
  };
  for (const sheet of ['settings', 'together', 'colony', 'skills', 'journal']) {
    openSheet(sheet);
    out[sheet] = htmlText(doc.root.innerHTML).filter(keep);
  }
  delete globalThis.document;
  return out;
}

// `keep` picks the segments of each screen that are recorded: the series
// ones for the fixture, every one for the stand-in run below.
function snapshot(keep = seriesKeep) {
  return {
    about: 'The series words on the home screen. Recorded by test/serieswords.home.test.js; see test/serieswords.test.js before re-recording.',
    ownGroupTitleOfThisSave: clanTitleFor(ME),
    clanEdition: {
      beforeAPick: homeFor('canon', { keep }),
      picked: Object.fromEntries(CLANS.map((id) => [id, homeFor('canon', { mine: id, keep }).colony])),
    },
    legacyEdition: homeFor('legacy', { keep }),
  };
}

describe('series words on the home screen, pinned', () => {
  it('the home screen and its sheets show exactly the recorded words', () => {
    checkAgainstFixture(FIXTURE, snapshot());
  });

  it('builds the same snapshot twice in a row', () => {
    expect(JSON.stringify(snapshot())).toBe(JSON.stringify(snapshot()));
  });

  // 2026-11-17. The whole home screen and its sheets (every segment, not only
  // the recorded ones), built with a stand-in word set in use
  // (test/helpers/standinwords.js: nonsense words, NOT the plain game's). Any
  // word of the family's set still on it was fixed at start-up or was not
  // read through src/wordset.js.
  it('with a stand-in word set in use, no word of the "on" set is left on the home screen', () => {
    const snap = withStandInWords(() => snapshot(() => true));
    expect(leaksIn(snap)).toEqual([]);
    expect(standInCount(snap)).toBeGreaterThan(20);
    checkAgainstFixture(FIXTURE, snapshot());
  });
});

// ---- the everyday words ('off'), added 2026-11-18 ------------------------------
// The same snapshot, built by the same code, with the everyday word set in
// use (src/offclanwords.js), recorded in its own fixture. Those words are the
// older playtester's picks; re-record with
//   UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords
// when she or the owner changes one, and read the diff line by line.
const { withOffWords, bannedLeaks, offWordCount } = await import('./helpers/offwords.js');
const { UPDATING_OFF } = await import('./helpers/serieswords.js');

const OFF_FIXTURE = 'series-words-off-home.json';
// The whole home screen and every sheet is recorded here, not only the
// segments with a series word: there is no list of everyday words to pick by.
// All of it but the build stamp in Settings (the commit and the day: not words).
const everything = (text) => !/^Build /.test(text);
const OFF_IGNORE = [
  'Dusk gets brighter, so you can see more.', // a skill's own line: the evening, not a group
];
describe('everyday words: the home screen and its sheets', () => {
  it('shows exactly the recorded everyday words', () => {
    checkAgainstFixture(OFF_FIXTURE, withOffWords(() => snapshot(everything)), UPDATING_OFF);
  });

  it('shows no word of the family\'s set, and plenty of the everyday ones', () => {
    const snap = withOffWords(() => snapshot(everything));
    expect(bannedLeaks(snap, OFF_IGNORE)).toEqual([]);
    expect(offWordCount(snap)).toBeGreaterThan(10);
  });

  it('and the family\'s words are back afterwards', () => {
    withOffWords(() => snapshot(everything));
    checkAgainstFixture(FIXTURE, snapshot());
  });
});
