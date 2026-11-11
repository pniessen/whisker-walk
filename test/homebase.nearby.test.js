import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Nearby one-tap joining on the home base: the rows in Play together, the
// card over home and its place among the other cards, the Join route with and
// without a cat name, the host's line, and nothing at all outside the app.
// Driven through createHomeBase over a no-DOM stand-in, with the real
// game/nearby.js between a fake app bridge and a fake `rooms`.
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null, ui: { builder: null } }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    dressingMock.ui = { builder: null };
    return {
      html: ({ headerHtml, startHtml, extrasHtml }) => `<header>${headerHtml}</header>${extrasHtml ?? ''}${startHtml}`,
      placesHtml: () => '<div class="dr-where"></div>',
      closeWardrobe() {}, afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      get ui() { return dressingMock.ui; },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { createNearby, NEARBY_OPTED_KEY } = await import('../src/game/nearby.js');

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
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
    focus: vi.fn(),
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
const JOINED = (code) => ({ code, roster: [{ playerId: 'a', petName: 'Robin' }], isHost: false, pair: false, starting: false, hosted: false });
const HOSTED = { code: 'ABCD', roster: [{ playerId: 'me', petName: 'Mittens' }], isHost: true, pair: false, starting: false, hosted: true };

function fakeRooms({ joinOk = true } = {}) {
  let state = null;
  const handlers = [];
  const rooms = {
    available: true,
    getState: () => state,
    onChange: (fn) => handlers.push(fn),
    set(next) { state = next; for (const fn of handlers) fn(); },
    join: vi.fn(async (code) => {
      if (!joinOk) return { ok: false };
      rooms.set(JOINED(code));
      return { ok: true, code };
    }),
    host: vi.fn(async () => { rooms.set(HOSTED); return { ok: true, code: 'ABCD' }; }),
  };
  return rooms;
}

// app: in the app (a bridge) or not. opted: Play together was opened on an
// earlier launch. name: the cat's online name, or none.
function setup({ app = true, opted = true, name = 'Mittens', joinOk = true, greeted = true, state, colonySync = null } = {}) {
  const progression = createProgression(memStorage());
  if (name) progression.state.petName = name;
  if (state) state(progression.state);
  const rooms = fakeRooms({ joinOk });
  const sent = [];
  const storage = memStorage(opted ? { [NEARBY_OPTED_KEY]: '1' } : {});
  const nearby = createNearby({
    bridge: app ? { postMessage: (m) => sent.push(m) } : null,
    storage, rooms, getName: () => progression.state.petName,
  });
  const toasts = [];
  const onCardsClosed = vi.fn();
  const hb = createHomeBase(progression, { photos: [] }, () => {}, rooms, null, null, settings, () => {}, () => {}, colonySync, 'me',
    (t) => toasts.push(t), () => {}, onCardsClosed, { nearby });
  hb.show();
  if (greeted) hb.showVisit({ milestone: null, visits: 2 });
  return { progression, hb, rooms, nearby, sent, storage, toasts, onCardsClosed };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const found = (...list) => ({ rooms: list.map(([code, name]) => ({ code, name })) });
// the same object is handed on as the event's target, so a test can see what the handler did to its button
const tap = (target) => doc.root.listeners.click({ target: Object.assign(target, { id: target.id ?? '', dataset: target.dataset ?? {}, closest: () => null }) });
const card = () => doc.body.children.find((c) => c.id === 'nearby-card');
const moment = () => doc.body.children.find((c) => c.id === 'clan-moment');
// the card's pieces: card > [line, row > [join, later]]
const cardLine = () => card().children[0].children[0].textContent;
const cardJoin = () => card().children[0].children[1].children[0];
const cardLater = () => card().children[0].children[1].children[1];
const ops = (sent) => sent.map((m) => m.op);
const woodsOpened = (st) => { st.walks.neighborhood = 2; };

describe('outside the app (Safari, desktop, Android): no bridge', () => {
  it('Play together is exactly what it was', () => {
    const plain = (() => {
      const progression = createProgression(memStorage());
      progression.state.petName = 'Mittens';
      const hb = createHomeBase(progression, { photos: [] }, () => {}, fakeRooms(), null, null, settings, () => {}, () => {}, null, 'me', () => {});
      hb.show();
      openSheet('together');
      return html();
    })();
    doc = fakeDocument(); globalThis.document = doc;
    const { nearby, sent, storage } = setup({ app: false, opted: false });
    openSheet('together');
    expect(html()).toBe(plain);
    expect(html()).not.toContain('wt-nearby');
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(html()).toBe(plain);
    expect(card()).toBeUndefined();
    expect(sent).toEqual([]);
    expect(storage.map.size).toBe(0);
  });
  it('the room is exactly what it was', () => {
    const { rooms } = setup({ app: false });
    openSheet('together');
    rooms.set(HOSTED);
    expect(html()).toContain('Room ABCD');
    expect(html()).not.toContain('Nearby cats');
  });
  it('a home base made without the option at all still works', () => {
    const progression = createProgression(memStorage());
    const hb = createHomeBase(progression, { photos: [] }, () => {}, fakeRooms(), null, null, settings, () => {}, () => {}, null, 'me', () => {});
    hb.show();
    hb.showVisit({ milestone: null, visits: 2 });
    openSheet('together');
    hb.hide();
    expect(card()).toBeUndefined();
  });
});

describe('the first-use gate, from the home base', () => {
  it('a child who only ever plays alone causes no message, on home, the Menu or a walk', () => {
    const { hb, sent, storage } = setup({ opted: false });
    openSheet('menu');
    openSheet('journal');
    openSheet(null);
    hb.hide();
    hb.show();
    expect(sent).toEqual([]);
    expect(storage.getItem(NEARBY_OPTED_KEY)).toBe(null);
  });
  it('opening Play together is the moment: remembered on the device, and looking starts', () => {
    const { sent, storage } = setup({ opted: false });
    openSheet('together');
    expect(storage.getItem(NEARBY_OPTED_KEY)).toBe('1');
    expect(sent).toEqual([{ op: 'browse' }]);
  });
  it('the flag is not in the save', () => {
    const { progression } = setup({ opted: false });
    openSheet('together');
    expect(JSON.stringify(progression.state)).not.toContain('nearby');
  });
  it('on a later launch looking starts with the home screen, and stops for a walk', () => {
    const { hb, sent } = setup({ opted: true });
    expect(ops(sent)).toEqual(['browse']);
    hb.hide(); // a walk starts
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    hb.show(); // home again
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
  });
  it('looking pauses on the other sheets and comes back on Play together and on home', () => {
    const { sent } = setup();
    openSheet('menu');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    openSheet('together');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
    openSheet(null);
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
  });
});

describe('the rows in Play together', () => {
  it('none found: no row, and no "searching" either', () => {
    setup();
    openSheet('together');
    const h = html();
    expect(h).toContain('id="wt-nearby"');
    expect(h).not.toContain('wt-nearby-row');
    expect(h).not.toMatch(/search|looking/i);
  });
  it('one row per room, above the code box, with a big Join that carries the code', () => {
    const { nearby } = setup();
    nearby.receive(found(['WXYZ', 'Robin'], ['QRST', 'Tiger Lily']));
    openSheet('together');
    const h = html();
    expect(h.match(/class="wt-nearby-row"/g)).toHaveLength(2);
    expect(h).toContain('<b>Robin</b> is starting a walk nearby');
    expect(h).toContain('<b>Tiger Lily</b> is starting a walk nearby');
    expect(h).toContain('<button class="primary wt-nearby-join" data-nearby-code="WXYZ">Join</button>');
    expect(h.indexOf('wt-nearby-row')).toBeGreaterThan(h.indexOf('id="wt-petname-input"'));
    expect(h.indexOf('wt-nearby-row')).toBeLessThan(h.indexOf('id="wt-join-code"'));
    expect(h.indexOf('wt-nearby-row')).toBeLessThan(h.indexOf('id="wt-host"'));
  });
  it('a room that appears or goes while the sheet is open changes only the rows (a half-typed code is kept)', () => {
    const { nearby } = setup();
    openSheet('together');
    const before = html();
    const slot = { innerHTML: '' };
    doc.root.querySelector = (sel) => (sel === '#wt-nearby' ? slot : null);
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(slot.innerHTML).toContain('<b>Robin</b> is starting a walk nearby');
    expect(html()).toBe(before); // the sheet itself was not redrawn
    nearby.receive(found());
    expect(slot.innerHTML).toBe('');
  });
  it('a name is escaped even if the module let one through', () => {
    const { nearby } = setup();
    nearby.rooms = () => [{ code: 'WXYZ', name: '<img src=x onerror=alert(1)>' }];
    openSheet('together');
    expect(html()).not.toContain('<img src=x');
    expect(html()).toContain('&lt;img src=x');
  });
  it('Join with a name set calls the existing join with that code, and the room shows', async () => {
    const { nearby, rooms } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    openSheet('together');
    const btn = { dataset: { nearbyCode: 'WXYZ' }, disabled: false };
    await tap(btn);
    expect(rooms.join).toHaveBeenCalledTimes(1);
    expect(rooms.join).toHaveBeenCalledWith('WXYZ');
    expect(btn.disabled).toBe(true); // a second tap can't send a second join
    expect(html()).toContain('Room WXYZ');
    expect(html()).not.toContain('wt-nearby-row');
  });
  it('Join with no name does not join: it says a name is needed and puts her in the name box', async () => {
    const { nearby, rooms } = setup({ name: null });
    nearby.receive(found(['WXYZ', 'Robin']));
    openSheet('together');
    expect(html()).toContain('data-nearby-code="WXYZ">Join</button>'); // not disabled: it has somewhere to take her
    const nameBox = { focus: vi.fn() };
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? nameBox : null);
    await tap({ dataset: { nearbyCode: 'WXYZ' } });
    expect(rooms.join).not.toHaveBeenCalled();
    expect(html()).toContain('Your cat needs a name before it can join a walk');
    expect(html().indexOf('Your cat needs a name')).toBeLessThan(html().indexOf('id="wt-petname-input"'));
    expect(nameBox.focus).toHaveBeenCalled();
    expect(html()).toContain('wt-nearby-row'); // the row waits for her
  });
  it('once she has a name the line is gone and Join joins', async () => {
    const { nearby, rooms, progression } = setup({ name: null });
    nearby.receive(found(['WXYZ', 'Robin']));
    openSheet('together');
    await tap({ dataset: { nearbyCode: 'WXYZ' } });
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: 'Mittens' } : null);
    await tap({ id: 'wt-petname-save' });
    expect(progression.state.petName).toBe('Mittens');
    expect(html()).not.toContain('Your cat needs a name before');
    await tap({ dataset: { nearbyCode: 'WXYZ' } });
    expect(rooms.join).toHaveBeenCalledWith('WXYZ');
  });
  it('a join that fails says so and leaves the typed code to try', async () => {
    const { nearby } = setup({ joinOk: false });
    nearby.receive(found(['WXYZ', 'Robin']));
    openSheet('together');
    await tap({ dataset: { nearbyCode: 'WXYZ' } });
    expect(html()).toContain('Could not join that walk');
    expect(html()).toContain('id="wt-join-code"');
  });
  it('the typed code still works beside the rows', async () => {
    const { nearby, rooms } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    openSheet('together');
    doc.root.querySelector = (sel) => (sel === '#wt-join-code' ? { value: 'qrst' } : null);
    await tap({ id: 'wt-join' });
    expect(rooms.join).toHaveBeenCalledWith('QRST');
  });
});

describe('the hosting child', () => {
  it('sees one new line in the room while the room can be found', async () => {
    const { sent } = setup();
    openSheet('together');
    await tap({ id: 'wt-host' });
    expect(sent.at(-1)).toEqual({ op: 'advertise', code: 'ABCD', name: 'Mittens' });
    expect(html()).toContain('Room ABCD');
    expect(html()).toContain('Nearby cats can join with one tap');
  });
  it('and not once Start is pressed', async () => {
    const { rooms, sent } = setup();
    openSheet('together');
    await tap({ id: 'wt-host' });
    rooms.set({ ...HOSTED, starting: true });
    expect(sent.at(-1)).toEqual({ op: 'stopAdvertising' });
    expect(html()).not.toContain('Nearby cats');
  });
  it('a child who joined sees no such line', () => {
    const { rooms } = setup();
    openSheet('together');
    rooms.set(JOINED('WXYZ'));
    expect(html()).toContain('Room WXYZ');
    expect(html()).not.toContain('Nearby cats');
  });
  it('tapping Host counts as the first use too', async () => {
    const { nearby } = setup({ opted: false });
    const noted = vi.spyOn(nearby, 'noteOptIn');
    openSheet('together');
    noted.mockClear();
    await tap({ id: 'wt-host' });
    expect(noted).toHaveBeenCalled();
  });
});

describe('the card over home', () => {
  it('"<Name> is starting a walk nearby. Join?" with Join and Not now', () => {
    const { nearby } = setup();
    expect(card()).toBeUndefined();
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeTruthy();
    expect(cardLine()).toBe('Robin is starting a walk nearby. Join?');
    expect(cardJoin().textContent).toBe('Join');
    expect(cardLater().textContent).toBe('Not now');
  });
  it('the name is set as text, never as markup', () => {
    const { nearby } = setup();
    nearby.cardRoom = () => ({ code: 'WXYZ', name: '<b>x</b>' });
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card().innerHTML).toBe('');
    expect(cardLine()).toBe('<b>x</b> is starting a walk nearby. Join?');
  });
  it('only one, however many rooms there are', () => {
    const { nearby } = setup();
    nearby.receive(found(['WXYZ', 'Robin'], ['QRST', 'Tiger']));
    nearby.receive(found(['WXYZ', 'Robin'], ['QRST', 'Tiger'], ['LMNO', 'Smudge']));
    expect(doc.body.children.filter((c) => c.id === 'nearby-card')).toHaveLength(1);
    expect(cardLine()).toContain('Robin');
  });
  it('goes when the room goes', () => {
    const { nearby } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    nearby.receive(found());
    expect(card()).toBeUndefined();
  });
  it('"Not now" hides that room\'s card until a new room appears', () => {
    const { nearby } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    cardLater().listeners.click();
    expect(card()).toBeUndefined();
    nearby.receive(found());
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeUndefined();
    nearby.receive(found(['WXYZ', 'Robin'], ['QRST', 'Robin']));
    expect(cardLine()).toBe('Robin is starting a walk nearby. Join?');
  });
  it('Escape is "Not now"', () => {
    const { nearby } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    card().listeners.keydown({ key: 'Escape' });
    expect(card()).toBeUndefined();
    expect(nearby.cardRoom()).toBe(null);
  });
  it('Join joins with that code and lands in the room on Play together', async () => {
    const { nearby, rooms } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    await cardJoin().listeners.click();
    expect(rooms.join).toHaveBeenCalledWith('WXYZ');
    expect(card()).toBeUndefined();
    expect(html()).toContain('data-sheet="together"');
    expect(html()).toContain('Room WXYZ');
  });
  it('a second tap on Join while the first is on its way does nothing', async () => {
    const { nearby, rooms } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    const join = cardJoin();
    const first = join.listeners.click();
    join.listeners.click();
    await first;
    expect(rooms.join).toHaveBeenCalledTimes(1);
  });
  it('Join with no name: no join, Play together opens with the line and the name box', async () => {
    const { nearby, rooms } = setup({ name: null });
    nearby.receive(found(['WXYZ', 'Robin']));
    const nameBox = { focus: vi.fn() };
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? nameBox : null);
    await cardJoin().listeners.click();
    expect(rooms.join).not.toHaveBeenCalled();
    expect(card()).toBeUndefined();
    expect(html()).toContain('data-sheet="together"');
    expect(html()).toContain('Your cat needs a name before it can join a walk');
    expect(html()).toContain('data-nearby-code="WXYZ"');
    expect(nameBox.focus).toHaveBeenCalled();
  });
  it('a join that fails says so on Play together, and that room does not ask again', async () => {
    const { nearby } = setup({ joinOk: false });
    nearby.receive(found(['WXYZ', 'Robin']));
    await cardJoin().listeners.click();
    expect(html()).toContain('data-sheet="together"');
    expect(html()).toContain('Could not join that walk');
    openSheet(null);
    expect(card()).toBeUndefined();
  });
});

describe('the card never stacks, and always gives way', () => {
  it('not under the boot splash: it waits for the greeting', () => {
    const { nearby, hb } = setup({ greeted: false });
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeUndefined();
    hb.showVisit({ milestone: null, visits: 2 });
    expect(card()).toBeTruthy();
  });
  it('not over a sheet; it comes up when she is back on the cat', () => {
    const { nearby } = setup();
    openSheet('together');
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeUndefined();
    openSheet(null);
    expect(card()).toBeTruthy();
    openSheet('menu');
    expect(card()).toBeUndefined();
  });
  it('not over the cat builder', () => {
    const { nearby } = setup();
    dressingMock.ui.builder = {};
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeUndefined();
  });
  it('not while a room is pending', () => {
    const { nearby, rooms } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    rooms.set(JOINED('QRST'));
    expect(card()).toBeUndefined();
  });
  it('yields to a walk: gone without being dismissed, and back when home is', () => {
    const { nearby, hb } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    hb.hide();
    expect(card()).toBeUndefined();
    hb.show();
    expect(card()).toBeUndefined(); // looking has only just started again
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeTruthy();
  });
  it('nothing goes up over a walk', () => {
    const { nearby, hb } = setup();
    hb.hide();
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeUndefined();
  });
  it('waits for the news card, and shows when it is dismissed', () => {
    const { nearby, hb } = setup();
    expect(hb.showNews('<button id="colony-news-ok">ok</button>', null)).toBe(true);
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(card()).toBeUndefined();
    const news = doc.body.children.find((c) => c.id === 'colony-news');
    news.listeners.click({ target: { id: 'colony-news-ok' } });
    expect(card()).toBeTruthy();
  });
  it('steps aside for the news card (not dismissed) and comes back after it', () => {
    const { nearby, hb } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(hb.showNews('<button id="colony-news-ok">ok</button>', null)).toBe(true);
    expect(card()).toBeUndefined();
    expect(doc.body.children.filter((c) => !c.removed && (c.id === 'colony-news' || c.id === 'nearby-card'))).toHaveLength(1);
    doc.body.children.find((c) => c.id === 'colony-news').listeners.click({ target: { id: 'colony-news-ok' } });
    expect(card()).toBeTruthy();
  });
  it('steps aside for the farewell notice, which is never refused because of it', () => {
    const { nearby, hb } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(hb.showNotice('Bye Rosa')).toBe(true);
    expect(card()).toBeUndefined();
    const notice = doc.body.children.find((c) => c.id === 'home-notice');
    notice.children[0].children[1].listeners.click();
    expect(card()).toBeTruthy();
  });
  it('the clan moment goes first, and the card follows its "Not yet"', () => {
    const { nearby, hb } = setup({ greeted: false, state: woodsOpened });
    nearby.receive(found(['WXYZ', 'Robin']));
    hb.showVisit({ milestone: null, visits: 2 });
    expect(moment()).toBeTruthy();
    expect(card()).toBeUndefined();
    moment().listeners.click({ target: { closest: (sel) => (sel === '.join-moment-later' ? {} : null) } });
    expect(moment()).toBeUndefined();
    expect(card()).toBeTruthy();
  });
  it('"Not now" lets the cards that waited behind it go up', () => {
    const { nearby, onCardsClosed } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    onCardsClosed.mockClear();
    cardLater().listeners.click();
    expect(onCardsClosed).toHaveBeenCalledTimes(1); // main.js shows unread news from here
  });
  it('a visit celebration goes first: no card while it is up, whatever arrives', () => {
    const { nearby, hb, progression } = setup({ greeted: false });
    nearby.receive(found(['WXYZ', 'Robin']));
    const visit = progression.recordVisit(); // visit 1 is a milestone
    expect(hb.showVisit(visit, { onClosed: () => {} })).toBe(true);
    expect(hb.visitOpen()).toBe(true);
    expect(card()).toBeUndefined();
    nearby.receive(found(['WXYZ', 'Robin'], ['QRST', 'Tiger']));
    expect(card()).toBeUndefined();
  });
  it('Enter does not start a walk from under the card', () => {
    const { nearby } = setup();
    const start = { disabled: false, click: vi.fn() };
    doc.root.querySelector = (sel) => (sel === '#btn-start' ? start : null);
    nearby.receive(found(['WXYZ', 'Robin']));
    const e = { key: 'Enter', repeat: false, preventDefault: vi.fn() };
    for (const l of doc.docListeners.filter((x) => x.t === 'keydown')) l.f(e);
    expect(start.click).not.toHaveBeenCalled();
  });
});
