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
    blockPlayer: vi.fn((id) => { if (!blocked.includes(id)) blocked.push(id); }),
    unblockPlayer: vi.fn((id) => { const i = blocked.indexOf(id); if (i >= 0) blocked.splice(i, 1); }),
    blockedPlayers: () => [...blocked],
  };
}

function setup({ name = 'Mittens', cloud = null, met = createMetPlayers(memStorage()), colonySync = null } = {}) {
  const progression = createProgression(memStorage());
  if (name) progression.state.petName = name;
  const rooms = fakeRooms();
  const toasts = [];
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync: null, cloud, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync, myId: 'me000000', toast: (t) => toasts.push(t), onCelebrate: () => {}, onCardsClosed: () => {}, metPlayers: met });
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

describe('hiding a visitor in Player pets', () => {
  // Catches the roster and the hidden list as loadPlayerPets writes them.
  function catchBoth() {
    const out = { roster: null, hidden: null };
    const slot = { set outerHTML(v) { out.roster = v; } };
    const hiddenSlot = { set innerHTML(v) { out.hidden = v; } };
    doc.root.querySelector = (sel) => (sel === '#player-pets-roster' ? slot : sel === '#player-pets-hidden' ? hiddenSlot : null);
    return out;
  }
  const card = () => doc.body.children.filter((c) => c.id === 'confirm-card').at(-1);
  const answer = (a) => card().listeners.click({ target: { closest: () => ({ getAttribute: () => a }) }, detail: 1 });
  function met2() {
    const met = createMetPlayers(memStorage());
    met.seed(['robin', 'wren']);
    return met;
  }
  it('each row has a Hide button named for the cat', async () => {
    setup({ cloud: fakeCloud({ rows: [row('robin')], profiles: [profile('robin', 'Robin')] }), met: met2() });
    const out = catchBoth();
    openSheet('together');
    await flush();
    expect(out.roster).toContain('aria-label="Hide Robin">Hide</button>');
    expect(out.roster).not.toContain('✕');
    expect(out.hidden).toBe('');
  });
  it('Hide asks first; Not now hides nothing', async () => {
    const cloud = fakeCloud({ rows: [row('robin')], profiles: [profile('robin', 'Robin')] });
    setup({ cloud, met: met2() });
    catchBoth();
    openSheet('together');
    await flush();
    await tap({ dataset: { action: 'hide-player', playerId: 'robin' } });
    const h = card().innerHTML;
    expect(h).toContain('Hide Robin?');
    expect(h).toContain('You won’t see their cat any more.');
    expect(h).toContain('data-confirm="no">Not now</button>');
    expect(h).toContain('data-confirm="yes">Yes, hide</button>');
    expect(h.indexOf('confirm-card-no')).toBeLessThan(h.indexOf('confirm-card-yes'));
    answer('no');
    expect(cloud.blockPlayer).not.toHaveBeenCalled();
  });
  it('Yes, hide hides her; the hidden list names her with Show again, which brings her back', async () => {
    const cloud = fakeCloud({ rows: [row('robin'), row('wren')], profiles: [profile('robin', 'Robin'), profile('wren', '<b>x</b>')] });
    setup({ cloud, met: met2() });
    const out = catchBoth();
    openSheet('together');
    await flush();
    await tap({ dataset: { action: 'hide-player', playerId: 'robin' } });
    await new Promise((r) => setTimeout(r, 650)); // the confirm card's double-tap guard (600 ms)
    answer('yes');
    await flush();
    expect(cloud.blockPlayer).toHaveBeenCalledWith('robin');
    expect(out.roster).not.toContain('Robin');
    expect(out.hidden).toContain('<p class="player-pets-hidden-count">Hidden cats: 1</p>');
    expect(out.hidden).toContain('<span class="friend-name">Robin</span>');
    expect(out.hidden).toContain('data-action="unhide-player" data-player-id="robin" aria-label="Show Robin again">Show again</button>');
    await tap({ dataset: { action: 'unhide-player', playerId: 'robin' } });
    await flush();
    expect(cloud.unblockPlayer).toHaveBeenCalledWith('robin');
    expect(out.roster).toContain('Robin');
    expect(out.hidden).toBe('');
  });
  it('a hidden id with no profile in this fetch is "A hidden cat", and nobody is looked up for it', async () => {
    const cloud = fakeCloud({ rows: [row('robin')], profiles: [profile('robin', 'Robin')], blocked: ['ghost-id'] });
    setup({ cloud, met: met2() });
    const out = catchBoth();
    openSheet('together');
    await flush();
    expect(out.hidden).toContain('Hidden cats: 1');
    expect(out.hidden).toContain('<span class="friend-name">A hidden cat</span>');
    expect(cloud.fetchProfiles).toHaveBeenCalledWith(['robin']);
  });
  it('a hostile hidden name shows the fallback', async () => {
    const cloud = fakeCloud({ rows: [row('robin')], profiles: [profile('robin', '<img src=x>')], blocked: ['robin'] });
    setup({ cloud, met: met2() });
    const out = catchBoth();
    openSheet('together');
    await flush();
    expect(out.hidden).toContain('<span class="friend-name">Mystery Cat</span>');
    expect(out.hidden).not.toContain('src=x');
  });
  it('the Hide control is at least 44px everywhere', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.friend-hide {'), css.indexOf('}', css.indexOf('.friend-hide {')));
    expect(rule).toContain('min-width: 44px; min-height: 44px;');
    expect(css).not.toMatch(/\.friend-hide \{ width: 32px/);
  });
});

describe('every code box has a visible label', () => {
  it('Play together: Room code and Friend code, with the share line under her own code', () => {
    setup({ cloud: fakeCloud() });
    openSheet('together');
    const h = html();
    expect(h).toContain('<label class="code-label" for="wt-join-code">Room code</label>');
    expect(h).toContain('<label class="code-label" for="friend-code-input">Friend code</label>');
    expect(h.indexOf('Your friend code:')).toBeLessThan(h.indexOf('Only share it with people you know.'));
    expect(h.indexOf('Only share it with people you know.')).toBeLessThan(h.indexOf('for="friend-code-input"'));
    expect(h.indexOf('for="wt-join-code"')).toBeLessThan(h.indexOf('id="wt-join-code"'));
  });
  it('placeholders are lightened to at least 4.5:1', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toContain('#homebase input::placeholder { color: #b3bfd1; opacity: 1; }');
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
    expect(html()).toContain('Friends see this name when you play together. Pick a cat name, not your real name.');
  });
  it('is called "Your walking name", with or without one saved', () => {
    setup({ name: null });
    openSheet('together');
    expect(html()).toContain('<p class="wt-first">First, pick your walking name:</p>');
    expect(html()).toContain('aria-label="Your walking name"');
    expect(html()).not.toContain('wt-name-label'); // the line above already names it
    setup({ name: 'Mittens' });
    openSheet('together');
    expect(html()).toContain('<label class="wt-name-label" for="wt-petname-input">Your walking name</label>');
    expect(html()).not.toContain('wt-first');
  });
  it('a name that is not letters is turned down in the walking name\'s words', async () => {
    const { progression } = setup({ name: null });
    openSheet('together');
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: 'R2D2' } : null);
    await tap({ id: 'wt-petname-save' });
    expect(progression.state.petName).toBe(null);
    expect(html()).toContain('A walking name is 2–16 letters, spaces, or hyphens.');
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
      expect(html()).not.toContain('You need a walking name before');
      const focused = [];
      doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: '', focus: () => focused.push(sel) } : sel === '#wt-join-code' ? { value: 'ABCD' } : null);
      await tap({ id });
      expect(html()).toContain('You need a walking name before you can join a walk. Type one here and tap Save:');
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

// Her own cat's name (the builder's) and her walking name (state.petName) are
// two things. Walking a cat she made, its name is offered; only her tap saves it.
describe("offering her own cat's name as her walking name", () => {
  const makeCat = (progression, name) => {
    const id = progression.createCustomCat({ name, personality: 'keenNose', look: {} });
    progression.equipCustom(id);
    return id;
  };
  const USE = 'id="wt-petname-use"';
  it('a ready-made cat gets no offer', () => {
    setup({ name: null });
    openSheet('together');
    expect(html()).not.toContain(USE);
  });
  it('walking a cat she made and named: a "Use" button, and nothing is saved by showing it', () => {
    const { progression } = setup({ name: null });
    makeCat(progression, 'Mango');
    openSheet('together');
    expect(html()).toContain('<button type="button" id="wt-petname-use" class="wt-name-use">Use “Mango”</button>');
    expect(html()).toContain('aria-label="Your walking name" value=""'); // the box is not filled in for her
    expect(progression.state.petName).toBe(null);
  });
  it('opening other sheets, Host and Join never save it', async () => {
    const { progression, rooms } = setup({ name: null });
    makeCat(progression, 'Mango');
    openSheet('together');
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: '', focus() {} } : sel === '#wt-join-code' ? { value: 'ABCD' } : null);
    await tap({ id: 'wt-host' });
    await tap({ id: 'wt-join' });
    openSheet('colony');
    openSheet('together');
    expect(progression.state.petName).toBe(null);
    expect(rooms.host).not.toHaveBeenCalled();
    expect(html()).toContain(USE); // still on offer
  });
  it('a tap on it saves that name; the offer and the "first" line go', async () => {
    const { progression } = setup({ name: null });
    makeCat(progression, 'Mango');
    openSheet('together');
    await tap({ id: 'wt-petname-use' });
    expect(progression.state.petName).toBe('Mango');
    expect(html()).not.toContain(USE);
    expect(html()).not.toContain('wt-first');
    expect(html()).toContain('value="Mango"');
  });
  it('a name she could not type in herself is not offered, and a stale tap saves nothing', async () => {
    const { progression } = setup({ name: null });
    makeCat(progression, 'Tiktok Tom'); // fine for a cat nobody else sees, not for a new online name
    openSheet('together');
    expect(html()).not.toContain(USE);
    await tap({ id: 'wt-petname-use' });
    expect(progression.state.petName).toBe(null);
  });
  it('no offer once she has a walking name, or when she walks a ready-made cat again', () => {
    const a = setup({ name: 'Mittens' });
    makeCat(a.progression, 'Mango');
    openSheet('together');
    expect(html()).not.toContain(USE);
    const b = setup({ name: null });
    makeCat(b.progression, 'Mango');
    b.progression.equipCat('tabby');
    openSheet('together');
    expect(html()).not.toContain(USE);
  });
});

describe('Colony with no walking name yet', () => {
  const needsName = () => ({ status: () => ({ mode: 'needs-name' }), onChange() {}, pairing: {} });
  it('its button opens Play together, says why above the name box, and puts her in it', async () => {
    const { progression } = setup({ name: null, colonySync: needsName() });
    openSheet('colony');
    expect(html()).toContain('To share your colony, you need a walking name first.');
    expect(html()).toContain('<button type="button" id="colony-pair-name" class="colony-pair-btn">Pick your walking name →</button>');
    const focused = [];
    doc.root.querySelector = (sel) => (sel === '#wt-petname-input' ? { value: '', focus: () => focused.push(sel) } : null);
    await tap({ id: 'colony-pair-name' });
    expect(html()).toContain('<h2>Play together 👫</h2>');
    expect(html()).toContain('<p class="wt-first wt-name-needed">You need a walking name before you can share your colony. Type one here and tap Save:</p>');
    expect(html().indexOf('wt-name-needed')).toBeLessThan(html().indexOf('id="wt-petname-input"'));
    expect(focused).toEqual(['#wt-petname-input']);
    expect(progression.state.petName).toBe(null);
  });
});
