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
const { RANK_WORDS, OUTSIDE_WORDS, PLACE_WORDS, CLAN_SUFFIX, PREFIXES, RANK_SUFFIX } = await import('../src/clanwords.js');
const { HOMES, clanName } = await import('../src/clanhomes.js');
const { clanTitleFor } = await import('../src/clannames.js');
const { checkAgainstFixture, htmlText, seriesFilter } = await import('./helpers/serieswords.js');

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

const keep = seriesFilter(
  [...Object.values(RANK_WORDS), ...Object.values(OUTSIDE_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX],
  [...CLANS.map(clanName), ...PREFIXES.map((p) => p + CLAN_SUFFIX), ...PREFIXES.map((p) => p + RANK_SUFFIX.leader)],
);

function homeFor(edition, { mine = null } = {}) {
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

function snapshot() {
  return {
    about: 'The series words on the home screen. Recorded by test/serieswords.home.test.js; see test/serieswords.test.js before re-recording.',
    ownGroupTitleOfThisSave: clanTitleFor(ME),
    clanEdition: {
      beforeAPick: homeFor('canon'),
      picked: Object.fromEntries(CLANS.map((id) => [id, homeFor('canon', { mine: id }).colony])),
    },
    legacyEdition: homeFor('legacy'),
  };
}

describe('series words on the home screen, pinned', () => {
  it('the home screen and its sheets show exactly the recorded words', () => {
    checkAgainstFixture(FIXTURE, snapshot());
  });

  it('builds the same snapshot twice in a row', () => {
    expect(JSON.stringify(snapshot())).toBe(JSON.stringify(snapshot()));
  });
});
