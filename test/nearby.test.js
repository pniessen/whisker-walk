import { describe, it, expect, vi } from 'vitest';
import {
  createNearby, sanitizeNearby, pickBridge,
  NEARBY_EVENT, NEARBY_HANDLER, NEARBY_OPTED_KEY, MAX_NEARBY,
} from '../src/game/nearby.js';
import { TYPED_CODE } from '../src/game/rooms.js';

// Nearby one-tap joining: the page's half. The shell (ios/WhiskerWalk/
// Nearby.swift) finds rooms on the local network and reports them; this
// module decides when it may look, when it may be seen, and what of its
// reports is believed. Everything is handed in, so nothing here needs a
// phone, a network or a DOM.

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

// A stand-in for game/rooms.js's `rooms`: getState() and onChange().
function fakeRooms() {
  let state = null;
  const handlers = [];
  return {
    available: true,
    getState: () => state,
    onChange: (fn) => handlers.push(fn),
    set(next) { state = next; for (const fn of handlers) fn(); },
  };
}
const HOSTED = { code: 'ABCD', roster: [], isHost: true, pair: false, starting: false, hosted: true };

function setup({ opted = true, name = 'Mittens', bridge, storage } = {}) {
  const sent = [];
  const b = bridge === undefined ? { postMessage: (m) => sent.push(m) } : bridge;
  const store = storage ?? memStorage(opted ? { [NEARBY_OPTED_KEY]: '1' } : {});
  const rooms = fakeRooms();
  let petName = name;
  const nearby = createNearby({ bridge: b, storage: store, rooms, getName: () => petName });
  return { nearby, sent, rooms, store, setName: (n) => { petName = n; } };
}
const ops = (sent) => sent.map((m) => m.op);
const found = (...list) => ({ rooms: list.map(([code, name]) => ({ code, name })) });

describe('the names the two sides share', () => {
  it('the handler, the event and the one localStorage flag', () => {
    expect(NEARBY_HANDLER).toBe('nearby');
    expect(NEARBY_EVENT).toBe('whisker-nearby');
    expect(NEARBY_OPTED_KEY).toBe('whisker-walk-nearby-opted');
    expect(MAX_NEARBY).toBe(6);
  });
});

describe('pickBridge', () => {
  it('is the app\'s nearby handler, or null anywhere else', () => {
    const handler = { postMessage() {} };
    expect(pickBridge({ webkit: { messageHandlers: { nearby: handler } } })).toBe(handler);
    expect(pickBridge({})).toBe(null);
    expect(pickBridge({ webkit: {} })).toBe(null);
    expect(pickBridge({ webkit: { messageHandlers: {} } })).toBe(null);
    expect(pickBridge({ webkit: { messageHandlers: { nearby: {} } } })).toBe(null);
    expect(pickBridge(null)).toBe(null);
    expect(pickBridge({ get webkit() { throw new Error('no'); } })).toBe(null);
  });
});

describe('sanitizeNearby: what the shell reports is not believed as it comes', () => {
  it('keeps a well-formed list', () => {
    expect(sanitizeNearby(found(['ABCD', 'Mittens'], ['X2Y9', 'Robin Hood']))).toEqual([
      { code: 'ABCD', name: 'Mittens' }, { code: 'X2Y9', name: 'Robin Hood' },
    ]);
  });
  it('a code must be exactly what a typed code is', () => {
    for (const code of ['abcd', 'ABC', 'ABCDE', 'AB D', 'AB-D', '', 'P0123456789abcdef', 1234, null, undefined, {}, ['ABCD']]) {
      expect(sanitizeNearby({ rooms: [{ code, name: 'Mittens' }] }), String(code)).toEqual([]);
    }
    expect(TYPED_CODE.test('ABCD')).toBe(true);
    expect(TYPED_CODE.test('P0123456789abcdef')).toBe(false); // never a pair room
  });
  it('a name must pass the same check a pet name does', () => {
    for (const name of ['', 'A', '<img src=x onerror=alert(1)>', 'Mittens<b>', '"quoted"', 'Seventeen Letters X', '9Lives', 'Mit tens', 'Zoë', 42, null, undefined, { toString: () => 'Mittens' }]) {
      expect(sanitizeNearby({ rooms: [{ code: 'ABCD', name }] }), String(name)).toEqual([]);
    }
    // the pet-name word list applies here too
    expect(sanitizeNearby({ rooms: [{ code: 'ABCD', name: 'Nazi Cat' }] })).toEqual([]);
  });
  it('drops garbage entries and keeps the good ones, and copies only code and name', () => {
    const out = sanitizeNearby({ rooms: [null, 7, 'ABCD', [], { code: 'ABCD' }, { name: 'Robin' }, { code: 'WXYZ', name: 'Robin', playerId: 'p1', __proto__: { x: 1 } }] });
    expect(out).toEqual([{ code: 'WXYZ', name: 'Robin' }]);
    expect(Object.keys(out[0])).toEqual(['code', 'name']);
  });
  it('anything that is not { rooms: [...] } is an empty list', () => {
    for (const raw of [null, undefined, 'ABCD', 7, [], [{ code: 'ABCD', name: 'Mittens' }], {}, { rooms: 'ABCD' }, { rooms: { 0: { code: 'ABCD', name: 'Mittens' }, length: 1 } }]) {
      expect(sanitizeNearby(raw)).toEqual([]);
    }
  });
  it('one row per code (the first wins) and never more than MAX_NEARBY', () => {
    expect(sanitizeNearby(found(['ABCD', 'Mittens'], ['ABCD', 'Robin']))).toEqual([{ code: 'ABCD', name: 'Mittens' }]);
    const many = Array.from({ length: 40 }, (_, i) => [`A${String(100 + i)}`, 'Mittens']);
    const out = sanitizeNearby(found(...many));
    expect(out).toHaveLength(MAX_NEARBY);
    expect(out[0].code).toBe('A100');
  });
  it('looks at a bounded number of entries, however long the list is', () => {
    const junk = Array.from({ length: 5000 }, () => ({ code: 'bad', name: 'x' }));
    expect(sanitizeNearby({ rooms: [...junk, { code: 'ABCD', name: 'Mittens' }] })).toEqual([]);
  });
  it('drops this device\'s own room', () => {
    expect(sanitizeNearby(found(['ABCD', 'Mittens'], ['WXYZ', 'Robin']), { ownCode: 'ABCD' })).toEqual([{ code: 'WXYZ', name: 'Robin' }]);
  });
  it('never throws on a hostile object', () => {
    const hostile = { get rooms() { throw new Error('boom'); } };
    expect(sanitizeNearby(hostile)).toEqual([]);
    const entry = { get code() { throw new Error('boom'); }, name: 'Mittens' };
    expect(sanitizeNearby({ rooms: [entry, { code: 'ABCD', name: 'Mittens' }] })).toEqual([{ code: 'ABCD', name: 'Mittens' }]);
  });
});

describe('outside the app there is no bridge', () => {
  it('nothing is available, nothing is sent, nothing is listed and nothing throws', () => {
    const { nearby, rooms, store } = setup({ bridge: null, opted: false });
    expect(nearby.available).toBe(false);
    nearby.noteOptIn();
    nearby.setScreen('together');
    nearby.setVisible(true);
    rooms.set(HOSTED);
    nearby.receive(found(['WXYZ', 'Robin']));
    nearby.refresh();
    expect(nearby.rooms()).toEqual([]);
    expect(nearby.cardRoom()).toBe(null);
    expect(nearby.advertising()).toBe(false);
    expect(nearby.browsing()).toBe(false);
    // not even the flag: a browser never has a prompt to hold back
    expect(store.map.size).toBe(0);
  });
  it('a bridge without postMessage is no bridge', () => {
    const { nearby } = setup({ bridge: {} });
    expect(nearby.available).toBe(false);
  });
});

describe('the first-use gate (iOS asks about the local network the first time it is used)', () => {
  it('a child who never opens Play together is never the cause of a message', () => {
    const { nearby, sent, rooms } = setup({ opted: false });
    nearby.setScreen('home');
    nearby.setVisible(true);
    nearby.refresh();
    rooms.set(HOSTED); // even a hosted room (it cannot happen without the sheet, but still)
    expect(sent).toEqual([]);
    expect(nearby.browsing()).toBe(false);
    expect(nearby.advertising()).toBe(false);
  });
  it('opening Play together (or tapping Host) is remembered on this device, and looking starts', () => {
    const { nearby, sent, store } = setup({ opted: false });
    nearby.setScreen('together');
    expect(sent).toEqual([]);
    nearby.noteOptIn();
    expect(store.getItem(NEARBY_OPTED_KEY)).toBe('1');
    expect(sent).toEqual([{ op: 'browse' }]);
  });
  it('the next launch starts looking from the home screen', () => {
    const { nearby, sent } = setup({ opted: true });
    expect(sent).toEqual([]); // nothing until home is showing
    nearby.setScreen('home');
    expect(sent).toEqual([{ op: 'browse' }]);
  });
  it('storage that throws: remembered for this session only, and nothing breaks', () => {
    const storage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    const { nearby, sent } = setup({ storage });
    nearby.setScreen('home');
    expect(sent).toEqual([]);
    nearby.noteOptIn();
    expect(sent).toEqual([{ op: 'browse' }]);
  });
  it('only the exact flag counts', () => {
    const { nearby, sent } = setup({ storage: memStorage({ [NEARBY_OPTED_KEY]: 'true' }) });
    nearby.setScreen('home');
    expect(sent).toEqual([]);
  });
});

describe('when this device looks for rooms (browsing)', () => {
  it('on the home screen and on Play together, with no room', () => {
    for (const screen of ['home', 'together']) {
      const { nearby, sent } = setup();
      nearby.setScreen(screen);
      expect(sent, screen).toEqual([{ op: 'browse' }]);
      expect(nearby.browsing()).toBe(true);
    }
  });
  it('not on another sheet, and not while home is hidden (a walk, the den)', () => {
    for (const screen of ['other', 'hidden', 'walk', undefined, null, 7]) {
      const { nearby, sent } = setup();
      nearby.setScreen(screen);
      expect(sent, String(screen)).toEqual([]);
    }
  });
  it('one message per change, never a repeat', () => {
    const { nearby, sent } = setup();
    nearby.setScreen('home');
    nearby.setScreen('home');
    nearby.refresh();
    nearby.setScreen('together');
    nearby.setScreen('home');
    expect(sent).toEqual([{ op: 'browse' }]);
    nearby.setScreen('other');
    nearby.setScreen('other');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    nearby.setScreen('home');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
  });
  it('stops when a walk starts (home is hidden) and comes back when home is shown again', () => {
    const { nearby, sent } = setup();
    nearby.setScreen('home');
    nearby.setScreen('hidden');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    nearby.setScreen('home');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
  });
  it('stops when the page is hidden (the app put away) and comes back with it', () => {
    const { nearby, sent } = setup();
    nearby.setScreen('home');
    nearby.setVisible(false);
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    nearby.setVisible(true);
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
  });
  it('stops the moment a room is pending, joined or hosted, and resumes when it is left', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set({ code: 'WXYZ', roster: [], isHost: false, pair: false, starting: false, hosted: false });
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    expect(nearby.browsing()).toBe(false);
    rooms.set(null);
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'browse']);
  });
  it('what was found is forgotten when looking stops', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(nearby.rooms()).toEqual([{ code: 'WXYZ', name: 'Robin' }]);
    nearby.setScreen('hidden');
    expect(nearby.rooms()).toEqual([]);
    nearby.setScreen('home');
    expect(nearby.rooms()).toEqual([]); // until the shell reports again
  });
  it('a report that arrives while not looking is ignored', () => {
    const { nearby } = setup();
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(nearby.rooms()).toEqual([]);
    nearby.setScreen('other');
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(nearby.rooms()).toEqual([]);
  });
  it('a bridge that throws is a missed message, nothing more', () => {
    const { nearby } = setup({ bridge: { postMessage() { throw new Error('gone'); } } });
    expect(() => nearby.setScreen('home')).not.toThrow();
  });
});

describe('when this device can be found (advertising)', () => {
  it('only a room this child hosted, with the code and the cat\'s name and nothing else', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set(HOSTED);
    expect(sent).toEqual([{ op: 'browse' }, { op: 'stopBrowsing' }, { op: 'advertise', code: 'ABCD', name: 'Mittens' }]);
    expect(Object.keys(sent[2]).sort()).toEqual(['code', 'name', 'op']);
    expect(nearby.advertising()).toBe(true);
  });
  it('still on, back on the home screen or on another sheet, while the room waits', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set(HOSTED);
    nearby.setScreen('home');
    nearby.setScreen('other');
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'advertise']);
  });
  it('never a room this device joined, even when it has become the room\'s host', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set({ ...HOSTED, hosted: false, isHost: true });
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
    expect(nearby.advertising()).toBe(false);
  });
  it('never the siblings\' pair room', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set({ ...HOSTED, code: 'P0123456789abcdef', pair: true });
    rooms.set({ ...HOSTED, code: 'P0123456789abcdef', pair: false });
    rooms.set({ ...HOSTED, pair: true });
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing']);
  });
  it('never without a name that passes the pet-name check', () => {
    for (const name of [null, '', 'x', '<b>Mittens</b>', 'Nazi Cat']) {
      const { nearby, sent, rooms } = setup({ name });
      nearby.setScreen('together');
      rooms.set(HOSTED);
      expect(ops(sent), String(name)).toEqual(['browse', 'stopBrowsing']);
    }
  });
  it('stops when Start is pressed (the room is starting)', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set(HOSTED);
    rooms.set({ ...HOSTED, starting: true });
    expect(ops(sent)).toEqual(['browse', 'stopBrowsing', 'advertise', 'stopAdvertising']);
    expect(nearby.advertising()).toBe(false);
  });
  it('stops when the walk starts, when the room is left, and when the app is put away', () => {
    const walk = setup();
    walk.nearby.setScreen('together');
    walk.rooms.set(HOSTED);
    walk.nearby.setScreen('hidden');
    expect(ops(walk.sent).at(-1)).toBe('stopAdvertising');

    const leave = setup();
    leave.nearby.setScreen('together');
    leave.rooms.set(HOSTED);
    leave.rooms.set(null);
    expect(ops(leave.sent)).toEqual(['browse', 'stopBrowsing', 'advertise', 'stopAdvertising', 'browse']);

    const away = setup();
    away.nearby.setScreen('together');
    away.rooms.set(HOSTED);
    away.nearby.setVisible(false);
    expect(ops(away.sent).at(-1)).toBe('stopAdvertising');
    away.nearby.setVisible(true);
    expect(away.sent.at(-1)).toEqual({ op: 'advertise', code: 'ABCD', name: 'Mittens' });
  });
  it('a roster change does not send the same advertisement again', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set(HOSTED);
    rooms.set({ ...HOSTED, roster: [{ playerId: 'a' }, { playerId: 'b' }] });
    expect(ops(sent).filter((o) => o === 'advertise')).toHaveLength(1);
  });
  it('a new name while the room waits replaces the advertisement', () => {
    const { nearby, sent, rooms, setName } = setup();
    nearby.setScreen('together');
    rooms.set(HOSTED);
    setName('Robin');
    nearby.refresh();
    expect(sent.at(-1)).toEqual({ op: 'advertise', code: 'ABCD', name: 'Robin' });
  });
  it('is never on at the same time as looking', () => {
    const { nearby, rooms } = setup();
    nearby.setScreen('together');
    for (const st of [null, HOSTED, { ...HOSTED, starting: true }, { ...HOSTED, hosted: false }, null]) {
      rooms.set(st);
      expect(nearby.advertising() && nearby.browsing()).toBe(false);
    }
  });
});

describe('the rooms found nearby', () => {
  it('tells listeners when the list changes, and only then', () => {
    const { nearby } = setup();
    const changed = vi.fn();
    nearby.onChange(changed);
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(changed).toHaveBeenCalledTimes(1);
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(changed).toHaveBeenCalledTimes(1);
    nearby.receive(found());
    expect(changed).toHaveBeenCalledTimes(2);
    expect(nearby.rooms()).toEqual([]);
    nearby.receive({ rooms: [{ code: 'bad', name: 'x' }] });
    expect(changed).toHaveBeenCalledTimes(2);
  });
  it('a listener that throws does not stop the others', () => {
    const { nearby } = setup();
    const second = vi.fn();
    nearby.onChange(() => { throw new Error('boom'); });
    nearby.onChange(second);
    nearby.setScreen('home');
    expect(() => nearby.receive(found(['WXYZ', 'Robin']))).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('hands out copies: a caller cannot change the list', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    nearby.rooms()[0].name = '<b>';
    nearby.rooms().length = 0;
    expect(nearby.rooms()).toEqual([{ code: 'WXYZ', name: 'Robin' }]);
  });
});

describe('the home card and "Not now"', () => {
  it('the card is for the first room found', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    expect(nearby.cardRoom()).toBe(null);
    nearby.receive(found(['WXYZ', 'Robin'], ['ABCD', 'Mittens']));
    expect(nearby.cardRoom()).toEqual({ code: 'WXYZ', name: 'Robin' });
  });
  it('"Not now" hides that room\'s card, even when the room flickers away and back', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    nearby.dismiss('WXYZ');
    expect(nearby.cardRoom()).toBe(null);
    expect(nearby.rooms()).toEqual([{ code: 'WXYZ', name: 'Robin' }]); // the sheet's row stays
    nearby.receive(found());
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(nearby.cardRoom()).toBe(null);
  });
  it('and stays hidden across a walk', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    nearby.dismiss('WXYZ');
    nearby.setScreen('hidden');
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    expect(nearby.cardRoom()).toBe(null);
  });
  it('a new room (a new code) brings a card again', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    nearby.dismiss('WXYZ');
    nearby.receive(found(['WXYZ', 'Robin'], ['QRST', 'Robin']));
    expect(nearby.cardRoom()).toEqual({ code: 'QRST', name: 'Robin' });
  });
  it('dismissing tells listeners, and garbage is ignored', () => {
    const { nearby } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    const changed = vi.fn();
    nearby.onChange(changed);
    nearby.dismiss(null);
    nearby.dismiss('nope');
    expect(changed).not.toHaveBeenCalled();
    nearby.dismiss('WXYZ');
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it('no card while a room is pending', () => {
    const { nearby, rooms } = setup();
    nearby.setScreen('home');
    nearby.receive(found(['WXYZ', 'Robin']));
    rooms.set({ ...HOSTED, hosted: false, code: 'WXYZ' });
    expect(nearby.cardRoom()).toBe(null);
  });
});

// main.js boots the whole game and cannot run headless, so its wiring is
// pinned by its text, as the haptics' is.
describe('main.js wiring', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const mod = readFileSync(new URL('../src/game/nearby.js', import.meta.url), 'utf8');
  it('made after the rooms and before the home base, which is handed it', () => {
    const made = main.indexOf('const nearby = createNearby({');
    expect(made).toBeGreaterThan(main.indexOf('} = createRooms({'));
    expect(made).toBeLessThan(main.indexOf('const homebase = createHomeBase('));
    expect(main).toContain('bridge: pickBridge(window), storage: window.localStorage, rooms,');
    expect(main).toContain('haptics: haptics.available, nearby });');
  });
  it('hears the shell\'s event and follows the page being hidden', () => {
    expect(main).toContain('window.addEventListener(NEARBY_EVENT, (e) => nearby.receive(e.detail));');
    expect(main).toContain('const nearbySeen = () => nearby.setVisible(!document.hidden);');
    expect(main).toContain("document.addEventListener('visibilitychange', nearbySeen);");
  });
  it('the module never touches the walk\'s random numbers: its only imports are the two checks and the diagnostics record', () => {
    expect(mod).not.toMatch(/walkRng|Math\.random|fetch\(/);
    expect(mod.match(/^import .*$/gm)).toEqual([
      "import { validPetName } from '../net.js';",
      "import { TYPED_CODE } from './rooms.js';",
      "import { note } from '../diagnostics.js';",
    ]);
  });
});

// The app's side is Swift (ios/WhiskerWalk/Nearby.swift) and is tested there
// (NearbyTests.swift). The words the two sides must agree on are pinned here
// by its text, so a rename on one side fails a test instead of going quiet.
describe('the two sides agree', async () => {
  const { readFileSync } = await import('node:fs');
  const swift = readFileSync(new URL('../ios/WhiskerWalk/Nearby.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../ios/Info.plist', import.meta.url), 'utf8');
  it('on the handler, the event and the cap', () => {
    expect(swift).toContain(`static let handlerName = "${NEARBY_HANDLER}"`);
    expect(swift).toContain(`static let eventName = "${NEARBY_EVENT}"`);
    expect(swift).toContain(`static let maxRooms = ${MAX_NEARBY}`);
  });
  it('on the four messages, which are every message this module can send', () => {
    const { nearby, sent, rooms } = setup();
    nearby.setScreen('together');
    rooms.set(HOSTED);
    rooms.set(null);
    nearby.setScreen('hidden');
    const sentOps = [...new Set(ops(sent))].sort();
    expect(sentOps).toEqual(['advertise', 'browse', 'stopAdvertising', 'stopBrowsing']);
    for (const op of sentOps) expect(swift).toContain(`case "${op}":`);
    expect(swift.match(/case "[A-Za-z]+":/g)).toHaveLength(4);
  });
  it('the app never opens a session, sends data, or uses the device\'s name as its peer name', () => {
    const code = swift.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/MCSession\(|\.send\(|invitePeer|UIDevice\.current\.name/);
    expect(code).toContain('invitationHandler(false, nil)');
    expect(code).toContain('static let peerName = "Whisker Walk"');
  });
  it('Info.plist says why, and lists the service the app uses', () => {
    expect(plist).toContain('<key>NSLocalNetworkUsageDescription</key>');
    expect(plist).toContain('<string>_whisker-walk._tcp</string>');
    expect(plist).toContain('<string>_whisker-walk._udp</string>');
    expect(swift).toContain('static let serviceType = "whisker-walk"');
  });
});
