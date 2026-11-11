// Nearby one-tap joining: the page's half. No DOM and no three import;
// everything it touches is handed in, so it is unit-tested headless
// (test/nearby.test.js).
//
// What it is for. A room is still an ordinary online room (game/rooms.js);
// the only new thing is how the second child learns its code. In the iPhone
// and iPad app the shell (ios/WhiskerWalk/Nearby.swift) can see other copies
// of the app on the same local network, so the hosting device says "room
// ABCD, hosted by Mittens" to the room it is in and the other device offers
// a Join button. Nobody types anything. The typed code still works, and is
// the only way in from Safari, a desktop, or another house.
//
// The two directions:
//   page → shell   window.webkit.messageHandlers.nearby.postMessage(msg)
//     { op: 'advertise', code, name }   be findable as this room
//     { op: 'stopAdvertising' }
//     { op: 'browse' }                  look for rooms
//     { op: 'stopBrowsing' }
//   shell → page   a 'whisker-nearby' CustomEvent on window, on every change,
//     detail: { rooms: [{ code, name }] }
//
// When each is on is decided here and nowhere else (wants(), below), and the
// shell is only told when the answer changes.
//
// Using the local network makes iOS ask its one-time "find devices on your
// local network" question. A child who only ever plays alone must never see
// it, so nothing is sent until she has opened Play together or tapped Host
// once on this device (noteOptIn; one localStorage flag, never the save).
//
// What is advertised is the room code and the cat's name, and nothing else:
// no player id, nothing from the save. That is also why a host on this
// device's block list cannot be dropped here: the block list is keyed by
// player id (src/blocklist.js), and a player id is exactly what is never put
// on the air. Whatever the list hid before, it hides still.
//
// Purely local to this device: nothing here is sent to a co-walker, and
// nothing here touches the walk's random numbers.

import { validPetName } from '../net.js';
import { TYPED_CODE } from './rooms.js';

export const NEARBY_HANDLER = 'nearby';
export const NEARBY_EVENT = 'whisker-nearby';
// "She has opened Play together or tapped Host on this device."
export const NEARBY_OPTED_KEY = 'whisker-walk-nearby-opted';
// At most this many rooms are ever listed. A living room has one or two.
export const MAX_NEARBY = 6;
// How much of a report is looked at before giving up on it.
const MAX_SCANNED = 64;
// "Not now" is remembered by room code for this session; this many at most.
const MAX_DISMISSED = 64;

// The screens the home base reports (ui/homebase.js). Looking for rooms
// happens on the cat's screen and on Play together; a hosted room stays
// findable on any of them. 'hidden' is a walk, the den, anything not home.
const LOOKING_SCREENS = ['home', 'together'];
const HOME_SCREENS = ['home', 'together', 'other'];

// The app's message handler, or null anywhere else (Safari, desktop, Android).
// Never throws: a getter that throws, or no window at all, is "no bridge".
export function pickBridge(win = globalThis) {
  try {
    const handler = win?.webkit?.messageHandlers?.[NEARBY_HANDLER];
    return handler && typeof handler.postMessage === 'function' ? handler : null;
  } catch {
    return null;
  }
}

// What the shell reports, believed only as far as it checks out. The shell
// passes on what other devices put on the network, and it is not the only
// thing that can fire an event on window, so every field is read again here:
// a code is exactly what a typed code is (so it can never name a pair room),
// a name passes the check a pet name does (letters, spaces and hyphens: no
// markup can get through it), one row per code, and a short list. This
// device's own room is dropped. Never throws.
export function sanitizeNearby(raw, { ownCode = null, validName = validPetName, max = MAX_NEARBY } = {}) {
  const out = [];
  let list;
  try { list = raw && typeof raw === 'object' ? raw.rooms : null; } catch { return out; }
  if (!Array.isArray(list)) return out;
  const seen = new Set();
  const n = Math.min(list.length, MAX_SCANNED);
  for (let i = 0; i < n && out.length < max; i++) {
    try {
      const entry = list[i];
      if (!entry || typeof entry !== 'object') continue;
      const { code, name } = entry;
      if (typeof code !== 'string' || !TYPED_CODE.test(code)) continue;
      if (typeof name !== 'string' || !validName(name)) continue;
      if (code === ownCode || seen.has(code)) continue;
      seen.add(code);
      out.push({ code, name });
    } catch {
      // an entry whose fields throw is skipped like any other bad one
    }
  }
  return out;
}

// createNearby({ bridge, storage, rooms, getName }) → the object main.js and
// the home base use.
//   bridge   pickBridge(window): the app's handler, or null outside the app
//   storage  localStorage-shaped, for the one first-use flag
//   rooms    game/rooms.js's `rooms` (getState, onChange)
//   getName  () => this device's cat name (progression.state.petName)
export function createNearby({
  bridge = null,
  storage = null,
  rooms = null,
  getName = () => null,
  validName = validPetName,
} = {}) {
  const available = !!bridge && typeof bridge.postMessage === 'function';
  let screen = 'hidden';
  let visible = true;
  let optedThisSession = false;
  let found = [];             // the sanitized list, as last reported
  let browsingNow = false;    // what the shell was last told
  let advertisedAs = null;    // 'CODE|Name' the shell was last told, or null
  const dismissed = new Set();
  const handlers = [];

  function notify() {
    for (const fn of handlers) {
      try { fn(); } catch (err) { console.warn('Whisker Walk: nearby listener failed', err); }
    }
  }

  function post(msg) {
    try { bridge.postMessage(msg); } catch { /* a bridge torn down: a missed message, nothing more */ }
  }

  function opted() {
    if (optedThisSession) return true;
    try { return storage?.getItem?.(NEARBY_OPTED_KEY) === '1'; } catch { return false; }
  }

  function roomState() {
    try { return rooms?.getState?.() ?? null; } catch { return null; }
  }

  // The whole rule, in one place.
  //   advertise: this child tapped Host, the room is an ordinary code room
  //     that is still waiting (not starting, no walk: home is showing), and
  //     the cat has a name fit to show.
  //   browse: the cat's screen or Play together is showing and there is no
  //     room at all.
  // Neither before the first-use gate, neither while the page is hidden, and
  // never both at once (one needs a room, the other needs none).
  function wants() {
    if (!available || !visible || !opted()) return { advertise: null, browse: false };
    const room = roomState();
    if (!room) return { advertise: null, browse: LOOKING_SCREENS.includes(screen) };
    let name = null;
    try { name = getName(); } catch { name = null; }
    const findable = room.hosted === true && room.pair !== true && room.starting !== true
      && typeof room.code === 'string' && TYPED_CODE.test(room.code)
      && HOME_SCREENS.includes(screen) && typeof name === 'string' && validName(name);
    return { advertise: findable ? { code: room.code, name } : null, browse: false };
  }

  function refresh() {
    if (!available) return;
    const want = wants();
    let changed = false;
    // Stops go out before starts, so the shell is never asked to do both.
    if (!want.browse && browsingNow) {
      browsingNow = false;
      post({ op: 'stopBrowsing' });
      // What was found is only true while looking.
      if (found.length) { found = []; changed = true; }
    }
    const key = want.advertise ? `${want.advertise.code}|${want.advertise.name}` : null;
    if (key !== advertisedAs) {
      advertisedAs = key;
      post(want.advertise ? { op: 'advertise', code: want.advertise.code, name: want.advertise.name } : { op: 'stopAdvertising' });
      changed = true;
    }
    if (want.browse && !browsingNow) {
      browsingNow = true;
      post({ op: 'browse' });
    }
    if (changed) notify();
  }

  // A room made, joined, started or left changes what is wanted. Subscribed
  // here, when main.js makes this (before the home base subscribes), so the
  // home base's own re-render already sees the new answer.
  try { if (available) rooms?.onChange?.(refresh); } catch { /* no rooms: nothing to follow */ }

  return {
    available,
    refresh,
    // 'home' (the cat's screen), 'together' (Play together), 'other' (any
    // other sheet) or 'hidden' (a walk). Anything else reads as hidden.
    setScreen(next) {
      const s = HOME_SCREENS.includes(next) ? next : 'hidden';
      if (s === screen) return;
      screen = s;
      refresh();
    },
    // The page hidden is the app put away: everything stops until it is back.
    setVisible(next) {
      const v = next !== false;
      if (v === visible) return;
      visible = v;
      refresh();
    },
    // She opened Play together or tapped Host: from now on this device may
    // use the local network (and iOS may ask its question).
    noteOptIn() {
      if (!available || opted()) return;
      optedThisSession = true;
      try { storage?.setItem?.(NEARBY_OPTED_KEY, '1'); } catch { /* private storage: this session only */ }
      refresh();
    },
    // The shell's 'whisker-nearby' event detail.
    receive(detail) {
      if (!available || !browsingNow) return;
      const next = sanitizeNearby(detail, { ownCode: roomState()?.code ?? null, validName });
      const same = next.length === found.length && next.every((r, i) => r.code === found[i].code && r.name === found[i].name);
      if (same) return;
      found = next;
      notify();
    },
    rooms() {
      return found.map((r) => ({ code: r.code, name: r.name }));
    },
    // The room the home card offers: the first one she has not said "Not now"
    // to. None while a room is pending.
    cardRoom() {
      if (!available || roomState()) return null;
      const r = found.find((x) => !dismissed.has(x.code));
      return r ? { code: r.code, name: r.name } : null;
    },
    // "Not now": no card for this room again this session. Kept by code and
    // not forgotten when the room drops out of the list, because discovery
    // flickers and a walk empties the list; a new room has a new code.
    dismiss(code) {
      if (typeof code !== 'string' || !TYPED_CODE.test(code) || dismissed.has(code)) return;
      if (dismissed.size >= MAX_DISMISSED) dismissed.delete(dismissed.values().next().value);
      dismissed.add(code);
      notify();
    },
    advertising: () => advertisedAs !== null,
    browsing: () => browsingNow,
    onChange(fn) {
      if (typeof fn === 'function') handlers.push(fn);
    },
  };
}
