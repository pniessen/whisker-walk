import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Launch A ("Cat, place, go"): the top bar, the Menu and Change place doors,
// the clan moment, Enter-to-start and the Settings Advanced group, driven
// through createHomeBase over a no-DOM stand-in. The WebGL pieces and the
// dressing-room controller are stubbed (its own tests live elsewhere).
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null, ui: { builder: null }, placesArgs: [], closeWardrobe: null }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    dressingMock.ui = { builder: null };
    dressingMock.placesArgs = [];
    dressingMock.closeWardrobe = vi.fn();
    return {
      html: ({ headerHtml, startHtml, extrasHtml }) => `<header>${headerHtml}</header>${extrasHtml ?? ''}${startHtml}`,
      placesHtml: (o) => { dressingMock.placesArgs.push(o); return `<div class="dr-where">${o?.clanLineHtml ?? ''}${o?.denHtml ?? ''}</div>`; },
      closeWardrobe: () => dressingMock.closeWardrobe(),
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      get ui() { return dressingMock.ui; },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { MOMENT_SEEN_KEY, MOMENT_ATTR } = await import('../src/ui/clanpicker.js');
const { PICK_ATTR } = await import('../src/ui/clanpicker.js');
const { MENU_TILES, SHEET_NAME } = await import('../src/ui/dressingroom.js');
const { SKILLS } = await import('../src/skills.js');

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
  el.classList = {
    add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c),
  };
  return el;
}
function fakeDocument() {
  const doc = { defaultView: { innerWidth: 375, innerHeight: 812 } };
  doc.createElement = () => fakeEl(doc);
  doc.docListeners = [];
  doc.addEventListener = (t, f, o) => { doc.docListeners.push({ t, f, o }); };
  doc.removeEventListener = (t, f) => { doc.docListeners = doc.docListeners.filter((l) => !(l.t === t && l.f === f)); };
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  return doc;
}

let doc;
let store;
beforeEach(() => {
  vi.useFakeTimers();
  doc = fakeDocument();
  globalThis.document = doc;
  // this device's memory of the clan moment (node may ship its own localStorage)
  store = new Map();
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
const IN_ROOM = { available: true, getState: () => ({ roster: [{ id: 'a' }, { id: 'b' }] }), onChange() {} };

function setup({ rooms = null, sync = null, colonySync = null, onVisitDen = () => {}, state } = {}) {
  const progression = createProgression(memStorage());
  if (state) state(progression.state);
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync, cloud: null, settings, onSettingsChange: () => {}, onVisitDen, colonySync, myId: 'me', toast: () => {} });
  hb.show();
  return { progression, hb };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const moment = () => doc.body.children.find((c) => c.id === 'clan-moment');
const celebration = () => doc.body.children.find((c) => String(c.className).startsWith('visit-cel'));
const tapCel = (el, vc) => el.listeners.click({ target: { closest: () => ({ dataset: { vc } }) } });
const clickRoot = (sels) => doc.root.listeners.click({ target: { id: '', dataset: {}, closest: (sel) => (sels[sel] ?? null) } });
const PLAIN = { milestone: null, visits: 2 };
// a Clan save whose Woods just opened, with no pick of her own
const woodsOpened = (st) => { st.walks.neighborhood = 2; };

describe('the top bar', () => {
  it('has the points pill, the rank pill, the visit pill and a Menu door, and no edition switch', () => {
    const { progression } = setup({ state: (st) => { st.points = 42; st.visits = 23; } });
    const h = html();
    expect(h).toMatch(/<div class="hb-pill hb-points" role="img" aria-label="42 whisker points">/);
    expect(h).toContain('class="hb-pill hb-rank"');
    expect(h).toContain('class="hb-pill dr-visit"');
    expect(h).toContain('Visit 23');
    expect(h).toMatch(/<button class="hb-menu-btn" data-dr-sheet="menu" aria-label="Menu">/);
    expect(h).not.toContain('data-edition-toggle');
    expect(progression.state.points).toBe(42);
  });
  it('the pills come in order: points, rank, visit, then the Menu door', () => {
    setup({ state: (st) => { st.visits = 23; } });
    const h = html();
    const order = ['hb-points', 'hb-rank', 'dr-visit', 'hb-menu-btn'].map((c) => h.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('no visit pill before the first visit', () => {
    setup();
    expect(html()).not.toContain('dr-visit');
  });
  it('the home screen is the cat: no sheet is open and Start is handed to the dressing room', () => {
    setup();
    expect(html()).not.toContain('data-sheet=');
    expect(html().match(/id="btn-start"/g)).toHaveLength(1);
  });
});

describe('the Menu', () => {
  it('shows the kid tiles, the stats line and the grown-ups row, with only Menu\'s doors available', () => {
    setup({ rooms: OPEN_ROOMS, sync: { available: true } });
    openSheet('menu');
    const h = html();
    expect(h).toContain('data-sheet="menu"');
    for (const id of MENU_TILES) expect(h).toContain(`<button class="hb-tile" data-dr-sheet="${id}">`);
    expect(h.match(/class="hb-tile"/g)).toHaveLength(MENU_TILES.length);
    expect(h).toContain('class="hb-menu-stats"');
    expect(h).toContain('For grown-ups');
    for (const id of ['settings', 'sync', 'code']) expect(h).toContain(`<button class="hb-grownup" data-dr-sheet="${id}">`);
    // Friends folded into Play together and the Journal
    expect(h).not.toContain('data-dr-sheet="social"');
    expect(h).not.toContain('Friends');
    expect(SHEET_NAME.together).toBe('Play together');
  });
  it('leaves out the tiles that are not available (no multiplayer: no Play together; no cloud: no Save)', () => {
    setup();
    openSheet('menu');
    const h = html();
    expect(h).not.toContain('data-dr-sheet="together"');
    expect(h).not.toContain('data-dr-sheet="sync"');
    expect(h.match(/class="hb-tile"/g)).toHaveLength(MENU_TILES.length - 1);
    for (const id of ['colony', 'journal', 'album', 'skills', 'controls']) expect(h).toContain(`data-dr-sheet="${id}"`);
    expect(h).toContain('data-dr-sheet="settings"');
    expect(h).toContain('data-dr-sheet="code"');
  });
  it('has a My den tile after Skills that says Visit, and a tap visits the den', () => {
    const onVisitDen = vi.fn();
    setup({ rooms: OPEN_ROOMS, onVisitDen });
    openSheet('menu');
    const h = html();
    const den = '<button class="hb-tile hb-tile-den" id="btn-visit-den" type="button"><span class="hb-tile-icon" aria-hidden="true">🏠</span><span class="hb-tile-name">My den</span><small>Visit</small></button>';
    expect(h).toContain(den);
    expect(h.indexOf(den)).toBeGreaterThan(h.indexOf('data-dr-sheet="skills"'));
    expect(h.indexOf(den)).toBeLessThan(h.indexOf('data-dr-sheet="controls"'));
    expect(h.indexOf(den)).toBeLessThan(h.indexOf('For grown-ups'));
    clickRoot({ '#btn-visit-den': {} });
    expect(onVisitDen).toHaveBeenCalledTimes(1);
  });
  it('has no den tile in a room (the den never joins a room walk)', () => {
    setup({ rooms: IN_ROOM });
    openSheet('menu');
    expect(html()).not.toContain('btn-visit-den');
    expect(html()).toContain('data-dr-sheet="together"');
  });
  it('the Skills tile says how many are earned', () => {
    setup();
    openSheet('menu');
    expect(html()).toContain(`0 of ${SKILLS.length} earned`);
  });
  it('is a door: Back to my cat, no Start dock', () => {
    setup();
    openSheet('menu');
    const h = html();
    expect(h).toContain('hb-sheet hb-door');
    expect(h).toContain('← Back to my cat');
    expect(h).not.toContain('id="btn-start"');
    expect(h).not.toContain('hb-sheet-dock');
  });
  it('sheets opened from the Menu say Back to the menu and go back to it; content sheets keep Start', () => {
    setup();
    openSheet('menu');
    openSheet('skills');
    let h = html();
    expect(h).toContain('data-sheet="skills"');
    expect(h).toContain('← Back to the menu');
    expect(h).not.toContain('← Back to my cat');
    expect(h).toContain('id="btn-start"');
    expect(h).toContain('hb-sheet-dock');
    clickRoot({ '#hb-back': {} });
    expect(html()).toContain('data-sheet="menu"');
    // and from the menu again, to the grown-ups sheets as well
    openSheet('settings');
    expect(html()).toContain('← Back to the menu');
  });
  it('a sheet opened from the Menu has a cat-face Home at the right of the Back row, which goes to the cat', () => {
    setup();
    openSheet('menu');
    openSheet('journal');
    const h = html();
    const row = '<div class="hb-sheet-head"><button id="hb-back" class="hb-back">← Back to the menu</button>'
      + '<button id="hb-home" class="hb-home" type="button" aria-label="Back to my cat"><span aria-hidden="true">🐱</span></button></div>';
    expect(h).toContain(row);
    clickRoot({ '#hb-home': {} });
    expect(html()).not.toContain('data-sheet=');
  });
  it('no Home button where Back already goes home (the Menu, Change place, a sheet opened directly)', () => {
    setup();
    for (const id of ['menu', 'places', 'settings']) {
      openSheet(null);
      openSheet(id);
      expect(html()).toContain('← Back to my cat');
      expect(html()).not.toContain('id="hb-home"');
    }
  });
  it('the Home button is at least 44px', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.hb-sheet .hb-home {'), css.indexOf('}', css.indexOf('.hb-sheet .hb-home {')));
    expect(rule).toMatch(/width: 48px; height: 48px;/);
  });
  it('a sheet opened directly (not from the Menu) goes back to the cat', () => {
    setup();
    openSheet('settings');
    expect(html()).toContain('← Back to my cat');
    clickRoot({ '#hb-back': {} });
    expect(html()).not.toContain('data-sheet=');
  });
  it('Back from the Menu goes to the cat', () => {
    setup();
    openSheet('menu');
    clickRoot({ '#hb-back': {} });
    expect(html()).not.toContain('data-sheet=');
  });
  it('coming home from a walk lands on the cat, not the Menu', () => {
    const { hb } = setup();
    openSheet('menu');
    hb.hide();
    hb.show();
    expect(html()).not.toContain('data-sheet=');
  });
});

describe('Change place (the places sheet)', () => {
  it('hands the dressing room the clan line, and has no den card (the den is a Menu tile)', () => {
    setup();
    openSheet('places');
    const h = html();
    expect(h).toContain('data-sheet="places"');
    expect(h).toContain('Change place');
    expect(h).not.toContain('id="btn-visit-den"');
    expect(h).not.toContain('My den');
    expect(dressingMock.placesArgs.at(-1).denHtml).toBeUndefined();
    expect(h).toContain('hb-door');
    expect(h).toContain('← Back to my cat');
    expect(h).not.toContain('id="btn-start"');
  });
  it('Legacy has no clan line', () => {
    setup({ state: (st) => { st.edition = 'legacy'; woodsOpened(st); } });
    openSheet('places');
    expect(dressingMock.placesArgs.at(-1).clanLineHtml).toBe('');
    expect(html()).not.toContain(MOMENT_ATTR);
  });
  it('Clan Edition before a pick, Woods closed: no clan line; Woods open: a Choose button', () => {
    setup();
    openSheet('places');
    expect(dressingMock.placesArgs.at(-1).clanLineHtml).toBe('');
    setup({ state: woodsOpened });
    openSheet('places');
    expect(dressingMock.placesArgs.at(-1).clanLineHtml).toContain(MOMENT_ATTR);
  });
  it('after a pick the clan line says who she is, and is the door to change it', () => {
    setup({ state: (st) => { st.clanPick = { mine: 'river', partner: null, partnerId: null }; } });
    openSheet('places');
    expect(dressingMock.placesArgs.at(-1).clanLineHtml).toContain('hb-pick-line');
    expect(dressingMock.placesArgs.at(-1).clanLineHtml).toContain(MOMENT_ATTR);
  });
  it('a place she cannot open answers the tap: one line says what is missing, and the card wobbles', () => {
    const toast = vi.fn();
    const progression = createProgression(memStorage());
    progression.state.points = 21;
    progression.state.walks.neighborhood = 2;
    createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast }).show();
    openSheet('places');
    const card = fakeEl(doc);
    doc.root.querySelectorAll = (sel) => (sel === '[data-dr-place="park"]' ? [card] : []);
    dressingMock.opts.onPlaced('park', false);
    expect(toast).toHaveBeenCalledWith('29 more 🐾 to go');
    dressingMock.opts.onChange(); // the render the tap causes
    expect(card.classList.contains('nudge')).toBe(true);
    expect(html()).toContain('data-sheet="places"');
    // a gated one says what it waits for
    progression.state.walks.neighborhood = 0;
    dressingMock.opts.onPlaced('park', false);
    expect(toast).toHaveBeenLastCalledWith(expect.stringMatching(/^opens after 2 walks in .+ · 0\/2 so far$/));
  });
  it('no wobble when she asked for reduced motion (the line still comes)', () => {
    const toast = vi.fn();
    const progression = createProgression(memStorage());
    const calm = { ...settings, all: () => ({ ...settings.all(), reducedMotion: true }) };
    createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings: calm, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast }).show();
    openSheet('places');
    const card = fakeEl(doc);
    doc.root.querySelectorAll = () => [card];
    dressingMock.opts.onPlaced('park', false);
    dressingMock.opts.onChange();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(card.classList.contains('nudge')).toBe(false);
  });
  it('the wobble CSS is skipped under the system reduced-motion setting', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toContain('.hb-places .nudge { animation: hb-nudge');
    expect(css).toContain('@media (prefers-reduced-motion: reduce) { .hb-places .nudge { animation: none; } }');
  });
  it('a place she can walk (onPlaced with an outcome) takes her home; a refused one leaves the sheet', () => {
    setup();
    openSheet('places');
    dressingMock.opts.onPlaced('woods', false);
    expect(dressingMock.opts.onPlaced).toBeTypeOf('function');
    expect(html()).toContain('data-sheet="places"');
    dressingMock.opts.onPlaced('neighborhood', 'set');
    // the next render (any) shows the cat
    dressingMock.opts.onChange();
    expect(html()).not.toContain('data-sheet=');
  });
});

describe('the clan moment', () => {
  it('the boot show() alone brings nothing up: it waits for the greeting', () => {
    const { progression } = setup({ state: woodsOpened });
    expect(moment()).toBeUndefined();
    expect(progression.state.clanPick.mine).toBeNull();
  });
  it('shows after showVisit with a dialog of the five cards and Not yet', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    const el = moment();
    expect(el).toBeTruthy();
    expect(el.className).toContain('join-moment');
    expect(el.innerHTML).toContain('role="dialog"');
    expect(el.innerHTML.match(new RegExp(PICK_ATTR, 'g'))).toHaveLength(5);
    expect(el.innerHTML).toContain('Not yet');
  });
  it('does not show for a save that has picked, a Legacy save, or one walk', () => {
    for (const state of [
      (st) => { woodsOpened(st); st.clanPick = { mine: 'moor', partner: null, partnerId: null }; },
      (st) => { woodsOpened(st); st.edition = 'legacy'; },
      (st) => { st.walks.neighborhood = 1; },
    ]) {
      doc = fakeDocument(); globalThis.document = doc;
      const { hb } = setup({ state });
      hb.showVisit(PLAIN);
      expect(moment()).toBeUndefined();
    }
  });
  it('shows for a save that already owns the Woods, whatever its walks', () => {
    const { hb } = setup({ state: (st) => { st.unlocked.areas.push('woods'); } });
    hb.showVisit(PLAIN);
    expect(moment()).toBeTruthy();
  });
  it('waits for a celebration, and shows once it closes', () => {
    const { progression, hb } = setup({ state: woodsOpened });
    const visit = progression.recordVisit(); // visit 1: a milestone
    expect(hb.showVisit(visit, { onClosed: () => {} })).toBe(true);
    expect(moment()).toBeUndefined();
    tapCel(celebration(), 'open');
    vi.advanceTimersByTime(10000);
    expect(hb.visitOpen()).toBe(false);
    expect(moment()).toBeTruthy();
  });
  it('a walk starting over a celebration does not bring it up', () => {
    const { progression, hb } = setup({ state: woodsOpened });
    hb.showVisit({ visits: 2, milestone: null }, { onClosed: () => {} }); // a plain visit's greeting
    hb.hide();
    expect(moment()).toBeUndefined();
  });
  it('waits for the farewell notice and shows when it is closed', () => {
    const { hb } = setup({ state: woodsOpened });
    expect(hb.showNotice('Bye Rosa')).toBe(true);
    hb.showVisit(PLAIN);
    expect(moment()).toBeUndefined();
    const notice = doc.body.children.find((c) => c.id === 'home-notice');
    notice.children[0].children[1].listeners.click(); // its OK
    expect(moment()).toBeTruthy();
  });
  it('is not stacked over the cat builder', () => {
    const { hb } = setup({ state: woodsOpened });
    dressingMock.ui = { builder: { breed: 'tabby' } };
    hb.showVisit(PLAIN);
    expect(moment()).toBeUndefined();
  });
  it('showNews and showNotice refuse while it is up', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    expect(moment()).toBeTruthy();
    expect(hb.showNews('<div>news</div>', null)).toBe(false);
    expect(hb.showNotice('Bye Rosa')).toBe(false);
    expect(doc.body.children.find((c) => c.id === 'colony-news')).toBeUndefined();
  });
  it('the news card waits its turn and the moment follows its dismissal', () => {
    const { hb } = setup({ state: woodsOpened });
    expect(hb.showNews('<button id="colony-news-ok">ok</button>', null)).toBe(true);
    hb.showVisit(PLAIN);
    expect(moment()).toBeUndefined();
    doc.body.children.find((c) => c.id === 'colony-news').listeners.click({ target: { id: 'colony-news-ok' } });
    expect(moment()).toBeTruthy();
  });
  it('a card tap picks that clan, tells the sibling\'s sync, closes the moment and remembers it', () => {
    const noteOwnPick = vi.fn(() => Promise.resolve(true));
    const colonySync = { status: () => ({ mode: 'local' }), pull() {}, noteOwnPick };
    const { progression, hb } = setup({ state: woodsOpened, colonySync });
    hb.showVisit(PLAIN);
    const el = moment();
    const card = { getAttribute: (a) => (a === PICK_ATTR ? 'pines' : null) };
    el.listeners.click({ target: { closest: (sel) => (sel === `[${PICK_ATTR}]` ? card : null) } });
    expect(progression.state.clanPick.mine).toBe('pines');
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
    expect(moment()).toBeUndefined();
    expect(store.get(MOMENT_SEEN_KEY)).toBe('1');
  });
  it('Not yet closes it, marks it seen on this device and picks nothing', () => {
    const noteOwnPick = vi.fn();
    const colonySync = { status: () => ({ mode: 'local' }), pull() {}, noteOwnPick };
    const { progression, hb } = setup({ state: woodsOpened, colonySync });
    hb.showVisit(PLAIN);
    moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } });
    expect(moment()).toBeUndefined();
    expect(store.get(MOMENT_SEEN_KEY)).toBe('1');
    expect(progression.state.clanPick.mine).toBeNull();
    expect(noteOwnPick).not.toHaveBeenCalled();
  });
  it('does not come back after Not yet: not on the next visit, not on the next show', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } });
    hb.showVisit(PLAIN);
    expect(moment()).toBeUndefined();
    hb.hide();
    hb.show();
    expect(moment()).toBeUndefined();
  });
  it('Escape counts as Not yet', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    moment().listeners.keydown({ key: 'Escape' });
    expect(moment()).toBeUndefined();
    expect(store.get(MOMENT_SEEN_KEY)).toBe('1');
  });
  it('a walk starting closes it without marking it seen, so it comes back next time', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    hb.hide();
    expect(moment()).toBeUndefined();
    expect(store.has(MOMENT_SEEN_KEY)).toBe(false);
    hb.show(); // back from the walk: the greeting already ran
    expect(moment()).toBeTruthy();
  });
  it('Change place\'s Choose button brings it back after Not yet', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } });
    openSheet('places');
    clickRoot({ [`[${MOMENT_ATTR}]`]: {} });
    expect(moment()).toBeTruthy();
  });
  it('with a clan picked, Change place\'s clan line opens the same five cards, and a card changes it', () => {
    const noteOwnPick = vi.fn(() => Promise.resolve(true));
    const colonySync = { status: () => ({ mode: 'local' }), pull() {}, noteOwnPick };
    // picked long ago, the moment seen, even with the Woods not open on this save
    const { progression } = setup({ colonySync, state: (st) => { st.clanPick = { mine: 'river', partner: null, partnerId: null }; } });
    store.set(MOMENT_SEEN_KEY, '1');
    openSheet('places');
    clickRoot({ [`[${MOMENT_ATTR}]`]: {} });
    const el = moment();
    expect(el).toBeTruthy();
    expect(el.innerHTML.match(new RegExp(PICK_ATTR, 'g'))).toHaveLength(5);
    const card = { getAttribute: (a) => (a === PICK_ATTR ? 'moor' : null) };
    el.listeners.click({ target: { closest: (sel) => (sel === `[${PICK_ATTR}]` ? card : null) } });
    expect(progression.state.clanPick.mine).toBe('moor');
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
    expect(moment()).toBeUndefined();
    expect(html()).toContain('data-sheet="places"');
  });
  it('a picked clan never brings the moment up by itself, only from its line', () => {
    const { hb } = setup({ state: (st) => { woodsOpened(st); st.clanPick = { mine: 'river', partner: null, partnerId: null }; } });
    hb.showVisit(PLAIN);
    hb.show({ sheet: 'places' });
    expect(moment()).toBeUndefined();
  });
  it('Legacy: the clan line is gone and nothing opens the cards', () => {
    setup({ state: (st) => { st.edition = 'legacy'; st.clanPick = { mine: 'river', partner: null, partnerId: null }; } });
    openSheet('places');
    clickRoot({ [`[${MOMENT_ATTR}]`]: {} });
    expect(moment()).toBeUndefined();
  });
  it('only one is ever up', () => {
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    hb.showVisit(PLAIN);
    hb.show();
    expect(doc.body.children.filter((c) => c.id === 'clan-moment')).toHaveLength(1);
  });
  it('review fix: Not yet tells main the cards are closed (the news may show now); a walk does not', () => {
    const progression = createProgression(memStorage());
    woodsOpened(progression.state);
    const onCardsClosed = vi.fn();
    const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, onCardsClosed });
    hb.show();
    hb.showVisit(PLAIN, { onClosed: () => {} });
    moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } });
    expect(onCardsClosed).toHaveBeenCalledTimes(1);
    // a walk starting under a fresh moment closes it without the hook
    store.clear();
    const p2 = createProgression(memStorage());
    woodsOpened(p2.state);
    const hook2 = vi.fn();
    const hb2 = createHomeBase({ progression: p2, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, onCardsClosed: hook2 });
    hb2.show();
    hb2.showVisit(PLAIN, { onClosed: () => {} });
    expect(moment()).toBeTruthy();
    hb2.hide();
    expect(hook2).not.toHaveBeenCalled();
    expect(hb).toBeTruthy();
  });
  it('review fix: focus goes to the card, never to a clan (a held Enter must not pick one)', () => {
    setup({ state: woodsOpened }).hb.showVisit(PLAIN, { onClosed: () => {} });
    expect(moment().innerHTML).toContain('class="join-moment-card" role="dialog" aria-modal="true" aria-labelledby="join-moment-title" tabindex="-1"');
  });
  it('review fix: Not yet is remembered for the session when storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, writable: true,
      value: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
    });
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN, { onClosed: () => {} });
    moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } });
    hb.show();
    expect(moment()).toBeFalsy();
  });
  it('review fix: never over a content sheet (Change place is fine)', () => {
    const { hb } = setup({ state: woodsOpened });
    openSheet('settings');
    hb.showVisit(PLAIN, { onClosed: () => {} });
    expect(moment()).toBeFalsy();
    openSheet('places');
    hb.show({ sheet: 'places' });
    expect(moment()).toBeTruthy();
  });
  it('works without localStorage (a private window): it shows, and Not yet does not throw', () => {
    delete globalThis.localStorage;
    const { hb } = setup({ state: woodsOpened });
    hb.showVisit(PLAIN);
    expect(moment()).toBeTruthy();
    expect(() => moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } })).not.toThrow();
  });
});

describe('Enter starts the walk from home', () => {
  const press = (over = {}) => {
    const e = { key: 'Enter', repeat: false, preventDefault: vi.fn(), ...over };
    for (const l of doc.docListeners.filter((x) => x.t === 'keydown')) l.f(e);
    return e;
  };
  function withStart() {
    const start = { disabled: false, click: vi.fn() };
    doc.root.querySelector = (sel) => (sel === '#btn-start' ? start : null);
    return start;
  }
  it('presses Start when nothing is focused and nothing is up, once the greeting has run', () => {
    const { hb, progression } = setup();
    const start = withStart();
    press(); // under the boot splash: no walk yet
    expect(start.click).not.toHaveBeenCalled();
    hb.showVisit({ visits: 2, milestone: null }, { onClosed: () => {} }); // a plain visit's greeting
    const e = press();
    expect(start.click).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
  });
  it('does nothing in a sheet, over the moment or the builder, on a focused control, or for other keys', () => {
    const { hb } = setup({ state: woodsOpened });
    const start = withStart();
    press({ key: 'a' });
    press({ repeat: true });
    press({ shiftKey: true });
    doc.activeElement = { id: 'some-button' };
    press();
    doc.activeElement = undefined;
    dressingMock.ui = { builder: { breed: 'tabby' } };
    press();
    dressingMock.ui = { builder: null };
    openSheet('menu');
    press();
    openSheet(null);
    hb.showVisit(PLAIN); // the moment is up
    press();
    expect(start.click).not.toHaveBeenCalled();
  });
  it('does not press a disabled Start', () => {
    setup();
    const start = withStart();
    start.disabled = true;
    press();
    expect(start.click).not.toHaveBeenCalled();
  });
});

describe('Settings: Advanced', () => {
  it('has an Advanced heading before the performance readout and the quality select', () => {
    setup();
    openSheet('settings');
    const h = html();
    const adv = h.indexOf('<h3 class="settings-group">Advanced</h3>');
    expect(adv).toBeGreaterThan(0);
    expect(h.indexOf('id="set-perf-readout"')).toBeGreaterThan(adv);
    expect(h.indexOf('id="set-quality"')).toBeGreaterThan(adv);
    // the edition stays above it
    expect(h.indexOf('id="set-edition"')).toBeGreaterThan(0);
    expect(h.indexOf('id="set-edition"')).toBeLessThan(adv);
  });
  it('the grown-ups sheets have no Start dock: nothing says Start under Start over', () => {
    setup();
    for (const id of ['settings', 'code']) {
      openSheet(id);
      expect(html()).toContain(`data-sheet="${id}"`);
      expect(html()).not.toContain('id="btn-start"');
      expect(html()).not.toContain('hb-sheet-dock');
    }
  });
  it('a children\'s sheet keeps a slim dock: where, and Start', () => {
    setup();
    openSheet('journal');
    const h = html();
    expect(h).toContain('hb-sheet-dock');
    expect(h).toContain('Walking in <b>');
    expect(h).toContain('id="btn-start"');
    expect(h).not.toContain('id="dusk-toggle"');
  });
});

describe('Settings in two halves', () => {
  const KIDS = ['set-volume', 'set-music-volume', 'set-muted', 'set-left-handed', 'set-invert-y', 'set-map-mode', 'set-reduced-motion', 'set-hide-chat'];
  const GROWN = ['set-edition', 'set-quality', 'set-perf-readout', 'btn-reset'];
  it('Sound & controls is a kid tile holding sound and the controls, in order, with a slim dock', () => {
    setup();
    openSheet('menu');
    expect(html()).toMatch(/<button class="hb-tile" data-dr-sheet="controls"><span class="hb-tile-icon" aria-hidden="true">🔊<\/span><span class="hb-tile-name">Sound &amp; controls<\/span>/);
    openSheet('controls');
    const h = html();
    expect(h).toContain('data-sheet="controls"');
    expect(h).toContain('← Back to the menu');
    const at = KIDS.map((id) => h.indexOf(`id="${id}"`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const id of GROWN) expect(h).not.toContain(`id="${id}"`);
    expect(h).toContain('hb-sheet-dock');
    expect(h).toContain('id="btn-start"');
    expect(h).not.toContain('id="dusk-toggle"');
  });
  it('Game settings, under For grown-ups, keeps the edition, graphics, the readout, and Start over last', () => {
    setup();
    openSheet('menu');
    expect(html()).toContain('<button class="hb-grownup" data-dr-sheet="settings"><span aria-hidden="true">⚙️</span> Game settings</button>');
    openSheet('settings');
    const h = html();
    expect(h).toContain('<h2>Game settings ⚙️</h2>');
    for (const id of GROWN) expect(h).toContain(`id="${id}"`);
    for (const id of KIDS) expect(h).not.toContain(`id="${id}"`);
    // Start over is the last thing on the sheet: no dock under it
    const reset = '<button id="btn-reset" class="danger">Start over</button>';
    expect(h.slice(h.indexOf(reset) + reset.length).replace(/<\/section>|<\/div>|\s/g, '')).toBe('');
  });
  it('the controls keep their wiring from the new sheet', () => {
    const set = vi.fn();
    const onChange = vi.fn();
    const progression = createProgression(memStorage());
    const s2 = { get: () => null, set, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
    createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings: s2, onSettingsChange: onChange, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} }).show();
    openSheet('controls');
    doc.root.listeners.click({ target: { id: 'set-left-handed', checked: true, dataset: {}, closest: () => null } });
    expect(set).toHaveBeenCalledWith('leftHanded', true);
    doc.root.listeners.input({ target: { id: 'set-volume', value: '40', dataset: {}, style: { setProperty() {} }, classList: { contains: () => true } } });
    expect(set).toHaveBeenCalledWith('volume', 0.4);
    doc.root.listeners.change({ target: { id: 'set-map-mode', value: 'turn', dataset: {} } });
    expect(progression.state.mapMode).toBe('turn');
    expect(onChange).toHaveBeenCalled();
  });
});

// The Vibration switch (src/haptics.js): in Sound & controls, right under
// Mute, and only where something can buzz (main.js passes haptics.available:
// an iPhone in the app, or a touch browser with navigator.vibrate). Desktop,
// Safari and an iPad never see a switch that does nothing.
describe('the Vibration switch', () => {
  const controls = (opts) => {
    const set = vi.fn();
    const onChange = vi.fn();
    const progression = createProgression(memStorage());
    const s2 = { get: () => null, set, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto', haptics: opts?.on ?? true }) };
    createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings: s2, onSettingsChange: onChange, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {},
      ...(opts?.haptics === undefined ? {} : { haptics: opts.haptics }) }).show();
    openSheet('controls');
    return { set, onChange };
  };
  it('is not there where nothing can buzz, or when nobody says', () => {
    controls();
    expect(html()).not.toContain('set-haptics');
    controls({ haptics: false });
    expect(html()).not.toContain('set-haptics');
    expect(html()).not.toContain('Vibration');
  });
  it('is there, on, right under Mute, where something can', () => {
    controls({ haptics: true });
    const h = html();
    expect(h).toContain('<input type="checkbox" role="switch" id="set-haptics" checked />');
    expect(h).toContain('Vibration');
    expect(h.indexOf('id="set-muted"')).toBeLessThan(h.indexOf('id="set-haptics"'));
    expect(h.indexOf('id="set-haptics"')).toBeLessThan(h.indexOf('id="set-left-handed"'));
    controls({ haptics: true, on: false });
    expect(html()).toContain('<input type="checkbox" role="switch" id="set-haptics" />');
  });
  it('is wired like its neighbours', () => {
    const { set, onChange } = controls({ haptics: true });
    doc.root.listeners.click({ target: { id: 'set-haptics', checked: false, dataset: {}, closest: () => null } });
    expect(set).toHaveBeenCalledWith('haptics', false);
    expect(onChange).toHaveBeenCalled();
  });
  it('is never on the grown-ups\' sheet', () => {
    controls({ haptics: true });
    openSheet('settings');
    expect(html()).not.toContain('set-haptics');
  });
});

describe('Play together holds the friends (Friends folded in)', () => {
  const CLOUD = () => ({
    available: true, myId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    fetchFriendships: vi.fn(() => Promise.resolve([])), fetchProfiles: vi.fn(() => Promise.resolve([])),
  });
  function setupCloud({ state, colonySync = null } = {}) {
    const progression = createProgression(memStorage());
    if (state) state(progression.state);
    const cloud = CLOUD();
    const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: OPEN_ROOMS, sync: null, cloud, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync, myId: 'me', toast: () => {} });
    hb.show();
    return { progression, cloud };
  }
  it('in order: the cat\'s name, start or join a room, then Player pets and the friend code', () => {
    setupCloud({ state: (st) => { st.petName = 'Mittens'; } });
    openSheet('together');
    const h = html();
    const order = ['id="wt-petname-input"', 'id="wt-host"', 'id="wt-join"', 'id="player-pets-section"', 'Your friend code:', 'id="friend-code-add"'].map((x) => h.indexOf(x));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).not.toContain('Stray cats');
  });
  it('the walk with her sibling comes after the name and before the room buttons', () => {
    const colony = { id: 'c1', partner: { playerId: 'p2', petName: 'Robin' } };
    const colonySync = { status: () => ({ mode: 'paired' }), pull() {} };
    setupCloud({ colonySync, state: (st) => { st.petName = 'Mittens'; st.colony = { ...st.colony, ...colony }; } });
    openSheet('together');
    const h = html();
    expect(h).toContain('id="wt-pair-walk"');
    expect(h).toContain('Walk with Robin');
    expect(h.indexOf('wt-pair')).toBeGreaterThan(h.indexOf('id="wt-petname-input"'));
    expect(h.indexOf('wt-pair')).toBeLessThan(h.indexOf('id="wt-host"'));
  });
  it('opening Play together loads the Player pets, as opening Friends did', () => {
    const { cloud } = setupCloud();
    openSheet('together');
    expect(cloud.fetchFriendships).toHaveBeenCalled();
  });
  it('anything still opening the old Friends sheet lands on Play together', () => {
    const { cloud } = setupCloud();
    openSheet('social');
    expect(html()).toContain('data-sheet="together"');
    expect(cloud.fetchFriendships).toHaveBeenCalled();
  });
  it('with no name yet, the friend code points up at the name box', () => {
    setupCloud();
    openSheet('together');
    expect(html()).toContain('Pick your walking name at the top to add friends by code.');
  });
  it('the stray cats are in the Journal', () => {
    const { progression } = setupCloud();
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    openSheet('journal');
    const h = html();
    expect(h).toContain('<h3>Stray cats</h3>');
    expect(h).toContain('Smudge');
    expect(h.indexOf('Stray cats')).toBeLessThan(h.indexOf('hb-sheet-dock'));
  });
});

describe('Day / Dusk in Change place', () => {
  function setupStart({ glow = true, rooms = null } = {}) {
    const progression = createProgression(memStorage());
    if (glow) { progression.state.unlocked.accessories.push('glow'); progression.state.equipped.collar = 'glow'; }
    const onStartWalk = vi.fn();
    const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk, rooms, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
    hb.show();
    return { progression, hb, onStartWalk };
  }
  const chooseDusk = (checked) => doc.root.listeners.change({ target: { id: 'dusk-toggle', checked, dataset: {} } });
  const pressStart = () => doc.root.listeners.click({ target: { id: 'btn-start', dataset: {}, closest: () => null } });
  it('is at the top of Change place, labelled Day and Dusk, the real control keeping its id', () => {
    setupStart();
    openSheet('places');
    const h = html();
    expect(h).toContain('<span class="hb-dusk-day">☀️ Day</span><span class="hb-dusk-night">🌙 Dusk</span>');
    expect(h).toMatch(/<input type="checkbox" id="dusk-toggle" role="switch" aria-label="Dusk walk"\s*\/>/);
    expect(h.indexOf('class="hb-dusk"')).toBeLessThan(h.indexOf('class="dr-where"'));
    expect(h).not.toContain('Glow Collar');
  });
  it('without the Glow Collar it is greyed and says why, instead of hiding', () => {
    setupStart({ glow: false });
    openSheet('places');
    const h = html();
    expect(h).toContain('class="hb-dusk off"');
    expect(h).toMatch(/id="dusk-toggle"[^>]*aria-describedby="dusk-why" disabled/);
    expect(h).toContain('<small class="hb-dusk-why" id="dusk-why">wear the Glow Collar</small>');
  });
  it('home shows a small moon when dusk is chosen, and Start from home walks at dusk', () => {
    const { onStartWalk } = setupStart();
    expect(html()).not.toContain('dr-dusk-badge');
    openSheet('places');
    chooseDusk(true);
    openSheet(null);
    expect(html()).toContain('<span class="dr-dusk-badge" role="img" aria-label="Dusk walk">🌙</span>');
    expect(html()).not.toContain('id="dusk-toggle"'); // status, not a control
    pressStart();
    expect(onStartWalk).toHaveBeenLastCalledWith({ duskMode: true });
  });
  it('the choice stands when home is shown again (back from a walk)', () => {
    const { hb, onStartWalk } = setupStart();
    openSheet('places');
    chooseDusk(true);
    hb.hide();
    hb.show();
    expect(html()).toContain('dr-dusk-badge');
    openSheet('places');
    expect(html()).toMatch(/id="dusk-toggle"[^>]*checked/);
    openSheet(null);
    pressStart();
    expect(onStartWalk).toHaveBeenLastCalledWith({ duskMode: true });
  });
  it('dusk only counts while the Glow Collar is on', () => {
    const { progression, onStartWalk } = setupStart();
    openSheet('places');
    chooseDusk(true);
    progression.state.equipped.collar = null;
    openSheet(null);
    expect(html()).not.toContain('dr-dusk-badge');
    pressStart();
    expect(onStartWalk).toHaveBeenLastCalledWith({ duskMode: false });
  });
  it('Play together has no copy of the switch, and a room start gets the dusk chosen', () => {
    const { onStartWalk } = setupStart({ rooms: OPEN_ROOMS });
    openSheet('places');
    chooseDusk(true);
    openSheet('together');
    expect(html()).not.toContain('id="dusk-toggle"');
    expect(html()).toContain('id="btn-start"');
    pressStart();
    expect(onStartWalk).toHaveBeenLastCalledWith({ duskMode: true });
  });
});

describe('coming home', () => {
  it('show() lands on the cat, whatever sheet the walk was started from', () => {
    const { hb } = setup();
    openSheet('menu');
    openSheet('journal');
    expect(html()).toContain('data-sheet="journal"');
    hb.hide();
    hb.show(); // back from the walk
    expect(html()).not.toContain('data-sheet=');
    expect(html()).not.toContain('← Back to the menu');
  });
  it('hide() puts the wardrobe away', () => {
    const { hb } = setup();
    hb.hide();
    expect(dressingMock.closeWardrobe).toHaveBeenCalled();
  });
});
