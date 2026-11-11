// The players THIS device has met: booped on a walk, or added by friend code.
//
// The server's friendships table can be written by anyone for any pair
// (record_friend_greet checks only the caller), so a stranger can make a row
// that names a child. The Player pets list and the ghost visits show a row only
// when its other player is in this list, so nobody can make themselves appear
// on a child's screen on their own.
//
// Per device, like the player id it sits beside (main.js keeps that in
// localStorage['whisker-walk-player'], not in the save): the server's rows are
// keyed by that id, so a save loaded on another device has a different id and
// none of these rows anyway. Same storage pattern as src/blocklist.js.
//
// Storage: { ids: [playerId, ...], seeded: true } under 'whisker-walk-met'.
// `seeded` is the one-time carry-over: the first time a device that already had
// friends runs this, the rows it has then are taken as met (they are the
// friends the child has been seeing all along), and from then on only a boop or
// a friend code adds anyone.

export const MET_KEY = 'whisker-walk-met';
const MAX_MET = 500; // far more than any child meets; keeps a bad save small

function read(storage) {
  try {
    const raw = storage?.getItem?.(MET_KEY);
    if (!raw) return { ids: new Set(), seeded: false };
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((x) => typeof x === 'string' && x.length > 0) : [];
    return { ids: new Set(ids.slice(0, MAX_MET)), seeded: parsed?.seeded === true };
  } catch {
    return { ids: new Set(), seeded: false };
  }
}

// createMetPlayers(storage) -> { has, add, seeded, seed, all }
export function createMetPlayers(storage) {
  let { ids, seeded } = read(storage);
  function write() {
    try {
      storage?.setItem?.(MET_KEY, JSON.stringify({ ids: [...ids], seeded }));
    } catch (err) {
      console.warn('Whisker Walk: could not save the met list', err);
    }
  }
  return {
    has: (id) => ids.has(id),
    add(id) {
      if (typeof id !== 'string' || !id || ids.has(id) || ids.size >= MAX_MET) return;
      ids = new Set(ids);
      ids.add(id);
      write();
    },
    seeded: () => seeded,
    // The one-time carry-over (see the top of this file). A no-op once done.
    seed(existingIds) {
      if (seeded) return;
      seeded = true;
      ids = new Set(ids);
      for (const id of Array.isArray(existingIds) ? existingIds : []) {
        if (typeof id === 'string' && id && ids.size < MAX_MET) ids.add(id);
      }
      write();
    },
    all: () => [...ids],
  };
}

// metOnly(met, otherIds) -> the ids to show, seeding first if this device has
// never been seeded. Used by the Player pets list and by spawnGhosts.
export function metOnly(met, otherIds) {
  const list = Array.isArray(otherIds) ? otherIds : [];
  if (!met.seeded()) met.seed(list);
  return list.filter((id) => met.has(id));
}

// The device's own list, made on first use from localStorage (or a stand-in
// that keeps nothing, when storage is unavailable).
let shared = null;
export function deviceMetPlayers() {
  if (!shared) {
    let storage = null;
    try { storage = globalThis.localStorage ?? null; } catch { storage = null; }
    shared = createMetPlayers(storage);
  }
  return shared;
}
