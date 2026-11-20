import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
// stage and the dressing-room controller. The controller stub keeps the
// onOpenSheet callback so a test can open the Settings sheet.
let openSheet = null;
let drOpts = null;
const placesCalls = [];
// The world map's pan (ui/mappan.js) needs a real box: record each attach.
const attaches = [];
const pans = [];
vi.mock('../src/ui/mappan.js', () => ({
  attachMapPan: vi.fn((frame, opts) => {
    attaches.push(opts);
    // as the real one: a hidden screen has no size yet, so nothing to wire
    if (globalThis.document?.root?.classList.contains('hidden')) return null;
    const pan = { view: opts.view, detach: vi.fn() };
    pans.push(pan);
    return pan;
  }),
}));
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const stub = {
  ui: { mapCard: null },
  html: ({ headerHtml }) => `<header>${headerHtml}</header>`,
  afterRender() {}, handleClick() { return false; }, clearPreview() {},
  placesHtml: (o) => { placesCalls.push(o); return `<div class="dr-where">${o?.clanLineHtml ?? ''}${o?.denHtml ?? ''}</div>`; },
  closeWardrobe() {},
  handleInput() { return false; }, captureFocus() { return null; }, startAllowed() { return true; },
  back: vi.fn(() => { stub.ui.mapCard = null; return true; }),
  restoreFocus: vi.fn(),
  handleKeydown: vi.fn(() => false),
};
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    openSheet = opts.onOpenSheet;
    drOpts = opts;
    return stub;
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// No jsdom here: a tiny element stand-in, enough for the home base.
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() {},
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
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  return doc;
}

let doc;
beforeEach(() => {
  doc = fakeDocument();
  globalThis.document = doc;
  attaches.length = 0;
  pans.length = 0;
  stub.ui.mapCard = null;
  stub.back.mockClear();
  stub.restoreFocus.mockClear();
  stub.handleKeydown.mockClear();
});
afterEach(() => {
  delete globalThis.document;
});

function setup() {
  const progression = createProgression(memStorage());
  const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
  hb.show();
  openSheet('controls');
  return { progression };
}

describe('Sound & controls: the map row', () => {
  it('shows North up and Turns with me, with the saved mode selected', () => {
    const { progression } = setup();
    const html = doc.root.innerHTML;
    expect(html).toContain('id="set-map-mode"');
    expect(html).toMatch(/<option value="north" selected>North up<\/option>/);
    expect(html).toContain('<option value="turn" >Turns with me</option>');
    progression.setMapMode('turn');
    openSheet('controls');
    expect(doc.root.innerHTML).toMatch(/<option value="turn" selected>Turns with me<\/option>/);
  });

  it('choosing an option saves it with setMapMode', () => {
    const { progression } = setup();
    const spy = vi.spyOn(progression, 'setMapMode');
    doc.root.listeners.change({ target: { id: 'set-map-mode', value: 'turn', dataset: {} } });
    expect(spy).toHaveBeenCalledWith('turn');
    expect(progression.state.mapMode).toBe('turn');
    expect(doc.root.innerHTML).toMatch(/<option value="turn" selected>/);
    doc.root.listeners.change({ target: { id: 'set-map-mode', value: 'north', dataset: {} } });
    expect(spy).toHaveBeenLastCalledWith('north');
    expect(progression.state.mapMode).toBe('north');
  });
});

describe("show({ sheet: 'places' })", () => {
  function make() {
    const progression = createProgression(memStorage());
    const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
    return createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
  }
  it('opens the Change place sheet with no other sheet open', () => {
    const hb = make();
    hb.show();
    openSheet('settings');
    expect(doc.root.innerHTML).toContain('data-sheet="settings"');
    placesCalls.length = 0;
    hb.show({ sheet: 'places' });
    expect(doc.root.innerHTML).toContain('data-sheet="places"');
    expect(doc.root.innerHTML).not.toContain('data-sheet="settings"');
    expect(doc.root.innerHTML).toContain('Change place');
    expect(placesCalls).toHaveLength(1);
    expect(doc.root.innerHTML).toContain('← Back to my cat');
    expect(doc.root.classList.contains('hidden')).toBe(false);
  });
  it('a plain show() lands on the cat, never on the places sheet', () => {
    const hb = make();
    hb.show({ sheet: 'places' });
    expect(doc.root.innerHTML).toContain('data-sheet="places"');
    hb.hide();
    hb.show();
    expect(doc.root.innerHTML).not.toContain('data-sheet=');
  });
  it('an unknown sheet is ignored', () => {
    const hb = make();
    hb.show({ sheet: 'nope' });
    expect(doc.root.innerHTML).not.toContain('data-sheet=');
  });
  it('the old pill option does nothing', () => {
    const hb = make();
    hb.show({ pill: 'where' });
    expect(doc.root.innerHTML).not.toContain('data-sheet=');
  });
});

describe('Change place: the world map on the home screen', () => {
  function make() {
    const progression = createProgression(memStorage());
    const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
    const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
    hb.show();
    return { hb, progression };
  }

  it("opening Change place attaches the pan, centred on today's place, and hands focus to the dressing room", () => {
    make();
    stub.restoreFocus.mockClear();
    openSheet('places');
    expect(doc.root.innerHTML).toContain('data-sheet="places"');
    const opts = attaches.at(-1);
    expect(opts).toBeTruthy();
    // the drawn box, with the Moor's top margin (never the bare 1500 x 880)
    expect(opts.world).toEqual({ x: 0, y: -20, w: 1500, h: 900 });
    expect(opts.view).toBeNull();
    expect(opts.focus).toEqual([843, 566]);
    expect(opts.targets).toHaveLength(12);
    expect(typeof opts.onView).toBe('function');
    expect(stub.restoreFocus).toHaveBeenCalledWith(doc.root, null);
  });

  it('the view survives a re-render and is forgotten when the sheet is opened afresh', () => {
    make();
    openSheet('places');
    const V = { x: 100, y: 50, w: 600, h: 400 };
    attaches.at(-1).onView(V);
    const before = pans.at(-1);
    drOpts.onChange();
    expect(before.detach).toHaveBeenCalled();
    expect(attaches.at(-1).view).toEqual(V);
    const last = pans.at(-1);
    openSheet(null); // Back home
    expect(last.detach).toHaveBeenCalled();
    const n = attaches.length;
    drOpts.onChange(); // a home render attaches nothing
    expect(attaches).toHaveLength(n);
    openSheet('places');
    expect(attaches.at(-1).view).toBeNull();
  });

  it('an open card is a layer: Back closes it and Change place stays', () => {
    const { hb } = make();
    openSheet('places');
    expect(hb.depth()).toBe(1);
    stub.ui.mapCard = 'park';
    expect(hb.depth()).toBe(2);
    expect(hb.back()).toBe(true);
    expect(stub.back).toHaveBeenCalled();
    expect(doc.root.innerHTML).toContain('data-sheet="places"');
    expect(hb.depth()).toBe(1);
  });

  it('leaving Change place with a card open closes the card', () => {
    make();
    openSheet('places');
    stub.ui.mapCard = 'park';
    openSheet(null);
    expect(stub.back).toHaveBeenCalled();
    expect(stub.ui.mapCard).toBeNull();
  });

  it('a key press on the home screen goes to the dressing room', () => {
    make();
    openSheet('places');
    const e = { key: 'Enter', target: {} };
    doc.root.listeners.keydown(e);
    expect(stub.handleKeydown).toHaveBeenCalledWith(e);
  });

  it('a place she cannot open wobbles on the map too', () => {
    make();
    openSheet('places');
    const asked = [];
    doc.root.querySelectorAll = (sel) => { asked.push(sel); return []; };
    drOpts.onPlaced('farm', null);
    drOpts.onChange();
    expect(asked).toContain('[data-dr-place="farm"]');
    expect(asked).toContain('[data-dr-map-place="farm"]');
  });

  it('a border crossing opens Change place on the hidden screen: the pan is wired once it shows', () => {
    const { hb } = make();
    hb.hide();
    const n = pans.length;
    hb.show({ sheet: 'places' });
    expect(doc.root.innerHTML).toContain('data-sheet="places"');
    expect(pans).toHaveLength(n + 1);
    expect(attaches.at(-1).view).toBeNull();
  });

  it('Legacy attaches no pan', () => {
    const { progression } = make();
    progression.setEdition('legacy');
    const n = attaches.length;
    openSheet('places');
    expect(doc.root.innerHTML).toContain('data-sheet="places"');
    expect(attaches).toHaveLength(n);
  });
});
