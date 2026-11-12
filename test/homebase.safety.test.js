import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Child-safety pass on the home base's online bits: every name or breed that
// came from another device (the room roster, a profiles row, a friend code) is
// shown only if it is a good pet name / a known breed; Player pets lists only
// players this device met; a hidden visitor is not in the room list; a new cat
// in the room is announced; and the name box says not to use a real name.
// Same no-DOM stand-in as test/homebase.nearby.test.js.
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    return {
      html: ({ headerHtml, startHtml, extrasHtml }) => `<header>${headerHtml}</header>${extrasHtml ?? ''}${startHtml}`,
      placesHtml: () => '<div class="dr-where"></div>',
      closeWardrobe() {}, afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      get ui() { return { builder: null }; },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { createMetPlayers } = await import('../src/metplayers.js');

// Things a stranger might put where a cat name goes. None may reach the screen.
const HOSTILE = [
  '<img src=x onerror=alert(1)>',
  'x'.repeat(500),
  'Kitty 😺',
  '‮niboR',
  'https://example.com',
  'Call 5551234567',
  'Snapchat Me',
];

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() {}, querySelector() { return null; }, focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
  return el;
}
let doc;
beforeEach(() => {
  doc = { defaultView: { innerWidth: 375, innerHeight: 812 } };
  doc.createElement = () => fakeEl(doc);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  globalThis.document = doc;
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  });
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
});

const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
function fakeRooms() {
  let state = null;
  const handlers = [];
  return {
    available: true,
    getState: () => state,
    onChange: (fn) => handlers.push(fn),
    set(next) { state = next; for (const fn of handlers) fn(); },
    join: vi.fn(async () => ({ ok: true })), host: vi.fn(async () => ({ ok: true })), leave: vi.fn(async () => {}),
  };
}
const room = (roster) => ({ code: 'ABCD', roster, isHost: true, pair: false, starting: false, hosted: true });

function fakeCloud({ rows = [], profiles = [], blocked = [], codeRows = [], addStatus = 'added' } = {}) {
  return {
    available: true,
    myId: 'me000000',
    fetchFriendships: vi.fn(async () => rows),
    fetchProfiles: vi.fn(async (ids) => profiles.filter((p) => ids.includes(p.player_id))),
    findByFriendCode: vi.fn(async () => codeRows),
    addFriendByCode: vi.fn(async () => ({ status: addStatus })),
    isBlocked: (id) => blocked.includes(id),
    blockPlayer() {},
  };
}

function setup({ name = 'Mittens', cloud = null, met = createMetPlayers(memStorage()) } = {}) {
  const progression = createProgression(memStorage());
  if (name) progression.state.petName = name;
  const rooms = fakeRooms();
  const toasts = [];
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync: null, cloud, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me000000', toast: (t) => toasts.push(t), onCelebrate: () => {}, onCardsClosed: () => {}, metPlayers: met });
  hb.show();
  hb.showVisit({ milestone: null, visits: 2 });
  return { progression, hb, rooms, toasts, met };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const tap = (target) => doc.root.listeners.click({ target: Object.assign(target, { id: target.id ?? '', dataset: target.dataset ?? {}, closest: () => null }) });
const flush = () => new Promise((r) => setTimeout(r, 0));

// Player pets fills a placeholder after render; catch what it writes.
function catchRoster() {
  const out = { html: null };
  const slot = { set outerHTML(v) { out.html = v; } };
  doc.root.querySelector = (sel) => (sel === '#player-pets-roster' ? slot : null);
  return out;
}
const row = (other, greets = 3) => ({ a_id: 'me000000', b_id: other, greets });
const profile = (id, petName, breed = 'tabby') => ({ player_id: id, pet_name: petName, breed, last_seen: new Date().toISOString() });

describe('the room list (lobby chips)', () => {
  it('a hostile name in presence shows as Mystery Cat', () => {
    const { rooms } = setup();
    openSheet('together');
    for (const bad of HOSTILE) {
      rooms.set(room([{ playerId: 'me000000', petName: 'Mittens' }, { playerId: 'zz', petName: bad }]));
      const h = html();
      expect(h).toContain('<span class="wt-roster-chip">🟢 Mystery Cat</span>');
      expect(h).not.toContain('src=x');
      expect(h).not.toContain('xxxxxxxxxxxxxxxxxxxx');
      expect(h).not.toContain('‮');
      expect(h).not.toContain('example.com');
      expect(h).not.toContain('5551234567');
    }
  });
  it('a hidden visitor is not listed or named', () => {
    const { rooms } = setup({ cloud: fakeCloud({ blocked: ['zz'] }) });
    openSheet('together');
    rooms.set(room([{ playerId: 'me000000', petName: 'Mittens' }, { playerId: 'zz', petName: 'Stranger' }]));
    expect(html()).not.toContain('Stranger');
    expect(html()).toContain('🟢 Mittens');
  });
  it('a cat who comes into the room after me is announced, by a safe name, once', () => {
    const { rooms, toasts } = setup();
    openSheet('together');
    rooms.set(room([{ playerId: 'me000000', petName: 'Mittens' }]));
    expect(toasts).toEqual([]);
    rooms.set(room([{ playerId: 'me000000', petName: 'Mittens' }, { playerId: 'rr', petName: 'Robin' }]));
    rooms.set(room([{ playerId: 'me000000', petName: 'Mittens' }, { playerId: 'rr', petName: 'Robin' }]));
    rooms.set(room([{ playerId: 'me000000', petName: 'Mittens' }, { playerId: 'rr', petName: 'Robin' }, { playerId: 'zz', petName: '<b>hi</b>' }]));
    expect(toasts).toEqual(['Robin joined 🐾', 'Mystery Cat joined 🐾']);
  });
  it('whoever was already there when I joined is not announced, and a hidden visitor never is', () => {
    const { rooms, toasts } = setup({ cloud: fakeCloud({ blocked: ['zz'] }) });
    openSheet('together');
    rooms.set(room([{ playerId: 'aa', petName: 'Robin' }, { playerId: 'me000000', petName: 'Mittens' }]));
    rooms.set(room([{ playerId: 'aa', petName: 'Robin' }, { playerId: 'me000000', petName: 'Mittens' }, { playerId: 'zz', petName: 'Sneak' }]));
    expect(toasts).toEqual([]);
  });
});

describe('Player pets', () => {
  it('a row the server holds but this device never met is not shown', async () => {
    const met = createMetPlayers(memStorage());
    met.seed(['robin']); // the friends this device had
    const cloud = fakeCloud({
      rows: [row('robin'), row('stranger')],
      profiles: [profile('robin', 'Robin'), profile('stranger', 'Free Gems')],
    });
    setup({ cloud, met });
    const out = catchRoster();
    openSheet('together');
    await flush();
    expect(out.html).toContain('Robin');
    expect(out.html).not.toContain('Free Gems');
    expect(out.html).not.toContain('stranger');
    expect(cloud.fetchProfiles).toHaveBeenCalledWith(['robin']); // a stranger's profile is not even fetched
  });
  it('hostile names and breeds in a met player\'s row show the fallback', async () => {
    for (const bad of HOSTILE) {
      const met = createMetPlayers(memStorage());
      met.seed(['robin']);
      setup({ cloud: fakeCloud({ rows: [row('robin')], profiles: [profile('robin', bad, bad)] }), met });
      const out = catchRoster();
      openSheet('together');
      await flush();
      expect(out.html).toContain('<span class="friend-name">Mystery Cat</span> — cat,');
      expect(out.html).not.toContain('src=x');
      expect(out.html).not.toContain('‮');
      expect(out.html).not.toContain('5551234567');
    }
  });
  it('first run on a device: the friends already on the server are kept (once)', async () => {
    const met = createMetPlayers(memStorage());
    setup({ cloud: fakeCloud({ rows: [row('robin')], profiles: [profile('robin', 'Robin')] }), met });
    const out = catchRoster();
    openSheet('together');
    await flush();
    expect(out.html).toContain('Robin');
    expect(met.seeded()).toBe(true);
  });
});

describe('friend code', () => {
  async function lookUp(hb, cloud) {
    openSheet('together');
    doc.root.querySelector = (sel) => (sel === '#friend-code-input' ? { value: 'CAT-ABCDEF12' } : null);
    await tap({ id: 'friend-code-add' });
  }
  it('the confirm shows a hostile name and breed as the fallback', async () => {
    for (const bad of HOSTILE) {
      const cloud = fakeCloud({ codeRows: [profile('abcdef12-x', bad, bad)] });
      const { hb } = setup({ cloud });
      await lookUp(hb, cloud);
      const h = html();
      expect(h).toContain('Add <strong>Mystery Cat</strong>');
      expect(h).toContain('(cat) as a friend?');
      expect(h).not.toContain('src=x');
      expect(h).not.toContain('5551234567');
    }
  });
  it('a friend added by code is met, so she shows in Player pets', async () => {
    const met = createMetPlayers(memStorage());
    met.seed([]);
    const cloud = fakeCloud({ codeRows: [profile('abcdef12-x', 'Robin')] });
    const { hb } = setup({ cloud, met });
    await lookUp(hb, cloud);
    await tap({ id: 'friend-code-confirm' });
    expect(met.has('abcdef12-x')).toBe(true);
    expect(html()).toContain('Added Robin as a friend!');
  });
});

describe('the name box', () => {
  it('says not to use a real name', () => {
    setup({ name: null });
    openSheet('together');
    expect(html()).toContain('Pick a cat name, not your real name. Other players can see it.');
  });
  it('a new name with one of the wider list\'s words is turned down kindly', async () => {
    const { progression } = setup({ name: null });
    openSheet('together');
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: 'Snapchat Me' } : null);
    await tap({ id: 'wt-petname-save' });
    expect(progression.state.petName).toBe(null);
    expect(html()).toContain('Please pick a different name.');
  });
  it('a cat already named with one of those words can still Host and Join', () => {
    setup({ name: 'Pisstopher' });
    openSheet('together');
    expect(html()).toContain('<button id="wt-host">Host a walk</button>');
  });
});

describe('Host and Join with no cat name yet', () => {
  for (const id of ['wt-host', 'wt-join']) {
    it(`${id}: stays tappable; a tap says a name is needed and goes to the name box`, async () => {
      const { rooms } = setup({ name: null });
      openSheet('together');
      expect(html()).toContain(`<button id="${id}">`);
      expect(html()).not.toContain('Your cat needs a name before');
      const focused = [];
      doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: '', focus: () => focused.push(sel) } : sel === '#wt-join-code' ? { value: 'ABCD' } : null);
      await tap({ id });
      expect(html()).toContain('Your cat needs a name before it can join a walk. Type one here and tap Save:');
      expect(focused).toEqual(['#wt-petname-input']);
      expect(rooms.host).not.toHaveBeenCalled();
      expect(rooms.join).not.toHaveBeenCalled();
    });
  }
  it('the disabled look reaches Host too (its gold is set by id)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.walk-together button:disabled'), css.indexOf('}', css.indexOf('.walk-together button:disabled')));
    expect(rule).toContain('.walk-together #wt-host:disabled');
    expect(css.indexOf('.walk-together #wt-host:disabled')).toBeGreaterThan(css.indexOf('.walk-together #wt-host:hover'));
  });
});
