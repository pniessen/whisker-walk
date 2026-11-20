import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Menu review #7 (2026-11-20): Colony becomes "My clan" ("My cats" in the
// everyday words), and the cat friends live there: her stray friends (from the
// Journal) and the player pets (from Play together). Driven through
// createHomeBase over the same no-DOM stand-in as homebase.grownups.test.js.
vi.mock('../src/thumbnails.js', () => ({ fillFoundThumbs: () => {}, menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null, ui: { builder: null } }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    dressingMock.ui = { builder: null };
    return {
      html: ({ headerHtml, startHtml, extrasHtml }) => `<header>${headerHtml}</header>${extrasHtml ?? ''}${startHtml}`,
      placesHtml: () => '<div class="dr-where"></div>',
      closeWardrobe() {},
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      get ui() { return dressingMock.ui; },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { SHEET_NAME, SHEET_LABEL } = await import('../src/ui/dressingroom.js');
const { phrase } = await import('../src/clanphrases.js');
const { words } = await import('../src/wordset.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { renderColonyHtml, renderPairingHtml, pairingErrorLine, renderNewsHtml } = await import('../src/ui/colonypanel.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, removed: false, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() { el.removed = true; if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
    querySelector() { return null; },
    focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
  return el;
}
function fakeDocument() {
  const doc = { defaultView: { innerWidth: 375, innerHeight: 812 } };
  doc.createElement = () => fakeEl(doc);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  return doc;
}

let doc;
beforeEach(() => {
  vi.useFakeTimers();
  doc = fakeDocument();
  globalThis.document = doc;
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.document;
  delete globalThis.localStorage;
});

const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
const OPEN_ROOMS = { available: true, getState: () => null, onChange() {} };
const cloudStub = () => ({
  available: true, myId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  fetchFriendships: vi.fn(() => Promise.resolve([])), fetchProfiles: vi.fn(() => Promise.resolve([])),
});
function setup({ cloud = null, state, colonySync = null, toast = () => {} } = {}) {
  const progression = createProgression(memStorage());
  if (state) state(progression.state);
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: OPEN_ROOMS, sync: null, cloud, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync, myId: 'me', toast });
  hb.show();
  return { progression, hb };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const tileName = (h) => (h.match(/data-dr-sheet="colony"[^>]*>[\s\S]*?<span class="hb-tile-name">([^<]*)<\/span>/) ?? [])[1];

describe('the phrase', () => {
  it('is built from the word set\'s group word in the family words, and plain in the everyday words', () => {
    expect(phrase('menu.myCats')).toBe(`My ${words().CLAN_SUFFIX.toLowerCase()}`);
    expect(phrase('menu.myCats')).toBe('My clan');
    withOffWords(() => expect(phrase('menu.myCats')).toBe('My cats'));
  });
  it('names the sheet wherever a label is read', () => {
    expect(SHEET_NAME.colony).toBe('My clan');
    expect(SHEET_LABEL.colony).toBe('🐈 My clan');
    withOffWords(() => expect(SHEET_LABEL.colony).toBe('🐈 My cats'));
  });
});

describe('My clan on the Menu and as a sheet', () => {
  it('the Menu tile and the sheet heading say My clan', () => {
    setup();
    openSheet('menu');
    expect(tileName(html())).toBe('My clan');
    openSheet('colony');
    expect(html()).toContain('<h2>My clan 🐈</h2>');
  });
  it('says My cats in the everyday words', () => {
    withOffWords(() => {
      setup();
      openSheet('menu');
      expect(tileName(html())).toBe('My cats');
      openSheet('colony');
      expect(html()).toContain('<h2>My cats 🐈</h2>');
    });
  });
});

describe('the cat friends live in My clan', () => {
  it('colony cards, then Stray cats, then Player pets; the pets load when the sheet opens', () => {
    const cloud = cloudStub();
    const { progression } = setup({ cloud });
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    openSheet('colony');
    const h = html();
    expect(h).toContain('class="friends-section"');
    expect(h).toContain('<h3>Stray cats</h3>');
    expect(h).toContain('Smudge');
    expect(h).toContain('<h3>Player pets</h3>');
    expect(h.indexOf('colony-section')).toBeLessThan(h.indexOf('<h3>Stray cats</h3>'));
    expect(h.indexOf('<h3>Stray cats</h3>')).toBeLessThan(h.indexOf('<h3>Player pets</h3>'));
    expect(cloud.fetchFriendships).toHaveBeenCalled();
  });
  it('the Journal has no Stray cats; Play together has no Player pets but keeps the friend code', () => {
    const cloud = cloudStub();
    setup({ cloud, state: (st) => { st.petName = 'Mittens'; } });
    openSheet('journal');
    expect(html()).not.toContain('Stray cats');
    openSheet('together');
    const h = html();
    expect(h).not.toContain('Player pets');
    expect(h).toContain('id="friend-code-input"');
    expect(h).toContain('id="friend-code-add"');
    expect(cloud.fetchFriendships).not.toHaveBeenCalled();
  });
  it('offline: Stray cats stay, there is no Player pets, nothing throws', () => {
    const { progression } = setup({ cloud: null });
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    expect(() => openSheet('colony')).not.toThrow();
    const h = html();
    expect(h).toContain('<h3>Stray cats</h3>');
    expect(h).not.toContain('Player pets');
  });
});

describe('Legacy Edition', () => {
  it('renders My clan with the colony cards and the Stray cats', () => {
    const { progression } = setup({ state: (st) => { st.edition = 'legacy'; } });
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    openSheet('menu');
    expect(tileName(html())).toBe('My clan');
    expect(() => openSheet('colony')).not.toThrow();
    const h = html();
    expect(h).toContain('data-sheet="colony"');
    expect(h).toContain('<h2>My clan 🐈</h2>');
    expect(h).toContain('class="colony-section"');
    expect(h).toContain('class="friends-section"');
    expect(h).toContain('<h3>Stray cats</h3>');
    expect(h).toContain('Smudge');
    expect(h.indexOf('class="colony-section"')).toBeLessThan(h.indexOf('<h3>Stray cats</h3>'));
  });
});

describe('Player pets load once per open of My clan', () => {
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  it('a render while the sheet is open does not fetch again or show "loading…"; reopening fetches afresh', async () => {
    const cloud = cloudStub();
    setup({ cloud });
    openSheet('colony');
    expect(cloud.fetchFriendships).toHaveBeenCalledTimes(1);
    await flush();
    dressingMock.opts.onChange(); // any render while open (a buy, a room change)
    dressingMock.opts.onChange();
    await flush();
    expect(cloud.fetchFriendships).toHaveBeenCalledTimes(1);
    expect(html()).toContain('<h3>Player pets</h3>');
    expect(html()).not.toContain('loading…');
    expect(html()).toContain('No player pets yet');
    openSheet('menu');
    openSheet('colony');
    expect(cloud.fetchFriendships).toHaveBeenCalledTimes(2);
  });
  it('opening it from show({ sheet }) fetches too, once', async () => {
    const cloud = cloudStub();
    const { hb } = setup({ cloud });
    hb.show({ sheet: 'colony' });
    expect(cloud.fetchFriendships).toHaveBeenCalledTimes(1);
    dressingMock.opts.onChange();
    expect(cloud.fetchFriendships).toHaveBeenCalledTimes(1);
  });
});

// Follow-up (owner, 2026-11-20): the everyday words say "cats", never "colony" or "crew".
describe('plain words on My cats (everyday set)', () => {
  const sync = (status) => ({ status: () => status, pull() {}, onChange() {} });
  const cat = (name, tamedBy) => ({ name, finder: 'me', area: 'park', x: 1, z: 1, wear: null, tamedBy, tamedWalk: tamedBy ? 1 : null });
  const textOf = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const sheetText = ({ colonySync, cats = [] }) => {
    setup({ colonySync, state: (st) => { st.colony.cats = cats; st.colony.feeds = []; } });
    openSheet('colony');
    return textOf(html());
  };
  const saves = {
    'no colony cats': { colonySync: sync({ mode: 'local' }) },
    'some cats, tamed and not': { colonySync: sync({ mode: 'unpaired' }), cats: [cat('Biscuit', 'me'), cat('Pickles', null)] },
    'offline': { colonySync: sync({ mode: 'offline' }), cats: [cat('Biscuit', 'me')] },
    'not set up': { colonySync: sync({ mode: 'not-set-up' }) },
    'needs a friend name': { colonySync: sync({ mode: 'needs-name' }) },
    'someone wants to share': { colonySync: sync({ mode: 'unpaired', invite: { code: 'ABCDEF', joinerPetName: 'Mia' } }) },
  };
  for (const [name, save] of Object.entries(saves)) {
    it(`the sheet shows no colony or crew word: ${name}`, () => {
      withOffWords(() => expect(sheetText(save)).not.toMatch(/colony|crew/i));
    });
  }
  it('says the new words', () => {
    withOffWords(() => {
      expect(sheetText(saves['no colony cats'])).toContain('No cats here yet — touch noses with a stray, then feed it 🐟');
      expect(sheetText(saves.offline)).toContain("Can't reach your cats' list right now — your cats are safe on this device");
      expect(sheetText(saves['not set up'])).toContain("Sharing your cats isn't switched on yet");
      expect(sheetText(saves['needs a friend name'])).toContain('To share your cats, you need a friend name first.');
      expect(sheetText(saves['someone wants to share'])).toContain('Mia wants to share your cats. Is that them?');
      expect(sheetText({ colonySync: sync({ mode: 'unpaired' }) })).toContain('Share your cats with your brother or sister');
      expect(pairingErrorLine('already-paired')).toBe('This player is already sharing their cats.');
      const full = renderColonyHtml({ colony: { cats: Array.from({ length: 12 }, (_, i) => cat(`C${i}`, 'me')), feeds: [] }, members: 1, now: 0 });
      expect(textOf(full)).toContain('Your cats’ home is full — 12 cats live here 🏠 Share your cats with your brother or sister to make room for 24.');
    });
  });
  it('the family words are exactly what they were', () => {
    expect(sheetText(saves['no colony cats'])).toContain('No colony cats yet — touch noses with a stray, then feed it 🐟');
    expect(sheetText(saves.offline)).toContain("Can't reach the colony right now — your cats are safe on this device");
    expect(sheetText(saves['not set up'])).toContain("Colony sharing isn't switched on yet");
    expect(sheetText(saves['needs a friend name'])).toContain('To share your colony, you need a friend name first.');
    expect(sheetText(saves['someone wants to share'])).toContain('Mia wants to share your colony. Is that them?');
    expect(sheetText({ colonySync: sync({ mode: 'unpaired' }) })).toContain('🐈 Share your colony with your brother or sister');
    expect(pairingErrorLine('already-paired')).toBe('This player is already sharing a colony.');
    const full = renderColonyHtml({ colony: { cats: Array.from({ length: 12 }, (_, i) => cat(`C${i}`, 'me')), feeds: [] }, members: 1, now: 0 });
    expect(full).toContain('<p class="colony-full">The colony is full — 12 cats call it home 🏠 Share it with your brother or sister to make room for 24.</p>');
  });
});

describe('the pairing toast and the news line (follow-up)', () => {
  const pairedToast = () => {
    const toast = vi.fn();
    let status = { mode: 'unpaired', invite: { code: 'ABCDEF' } };
    setup({ colonySync: { status: () => status, pull() {}, onChange() {} }, toast, state: (st) => { st.colony.partner = { playerId: 'p2', petName: 'Mia' }; } });
    openSheet('colony');
    status = { mode: 'paired' };
    dressingMock.opts.onChange();
    return toast;
  };
  it('everyday words: your cats', () => {
    withOffWords(() => {
      expect(pairedToast()).toHaveBeenCalledWith("You're sharing your cats with Mia! 🐾");
      expect(renderNewsHtml({ lines: ['x'], any: true })).toContain("What's new with your cats");
    });
  });
  it('family words: exactly as before', () => {
    expect(pairedToast()).toHaveBeenCalledWith("You're sharing a colony with Mia! 🐾");
    expect(renderNewsHtml({ lines: ['x'], any: true })).toContain("<p class=\"colony-news-sub\">What's new in your colony</p>");
  });
});

describe('the Journal points to My clan', () => {
  const lineHtml = () => (html().match(/<button type="button" class="hb-journal-friends"[^>]*>[\s\S]*?<\/button>/) ?? [])[0];
  it('a quiet line, not a primary button, in the clan words and in the everyday words', () => {
    setup();
    openSheet('journal');
    const line = lineHtml();
    expect(line).toContain('data-dr-sheet="colony"');
    expect(line).toContain('Your cat friends are in My clan now ›');
    expect(line).not.toContain('primary');
    expect(html()).not.toContain('Stray cats');
    withOffWords(() => {
      setup();
      openSheet('journal');
      expect(lineHtml()).toContain('Your cat friends are in My cats now ›');
    });
  });
  it('shows offline too (no cloud)', () => {
    setup({ cloud: null });
    openSheet('journal');
    expect(lineHtml()).toContain('My clan');
  });
  it('opens My clan, and Back goes to the Journal, then where the Journal came from; depth agrees', () => {
    const { hb } = setup();
    openSheet('menu');
    openSheet('journal');
    expect(hb.depth()).toBe(2);
    openSheet('colony'); // what the line's data-dr-sheet does
    expect(html()).toContain('data-sheet="colony"');
    expect(hb.depth()).toBe(3);
    expect(html()).toContain('← Back to the journal');
    expect(hb.back()).toBe(true);
    expect(html()).toContain('data-sheet="journal"');
    expect(hb.depth()).toBe(2);
    expect(hb.back()).toBe(true);
    expect(html()).toContain('data-sheet="menu"');
    expect(hb.depth()).toBe(1);
  });
  it('from a Journal opened off the home screen, My clan is two layers and Back returns to the Journal, then home', () => {
    const { hb } = setup();
    openSheet('journal');
    expect(hb.depth()).toBe(1);
    openSheet('colony');
    expect(hb.depth()).toBe(2);
    expect(hb.back()).toBe(true);
    expect(html()).toContain('data-sheet="journal"');
    expect(hb.depth()).toBe(1);
    expect(hb.back()).toBe(true);
    expect(hb.depth()).toBe(0);
  });
  it('My clan opened from the Menu still goes back to the Menu', () => {
    const { hb } = setup();
    openSheet('menu');
    openSheet('colony');
    expect(hb.depth()).toBe(2);
    expect(html()).toContain('← Back to the menu');
  });
});
