// A small, per-device "hide this visitor" list (final fix wave, Task 3).
//
// record_friend_greet (docs/supabase-setup.sql) validates the CALLER's own
// identity but never validates p_other_id — any client that knows another
// player's playerId can drive greets against them, and spawnGhosts (main.js)
// materializes those as uninvited ghost visits with no consent step on the
// victim's side. This module is NOT a fix for that (see the "Known
// limitation — unilateral friendships" note in
// docs/superpowers/specs/2026-08-01-whisker-walk-v7-online.md) — it only
// lets a player stop *looking at* a given playerId on THIS device: it
// doesn't stop the greet from being recorded server-side, and a different
// browser/device for the same player starts unblocked.
//
// Storage shape: a JSON array of playerId strings under 'whisker-walk-blocked'.

const KEY = 'whisker-walk-blocked';

function readSet(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x) => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set(); // corrupt JSON / storage unavailable — start clean rather than throw
  }
}

function writeSet(storage, set) {
  try {
    storage.setItem(KEY, JSON.stringify([...set]));
  } catch (err) {
    console.warn('Whisker Walk: could not persist blocked list', err);
  }
}

// createBlockList(storage) -> { has, add, remove, all }
//
// storage: any localStorage-shaped object ({ getItem, setItem }) — same
// convention as createProgression(storage)/createSettings(storage), so
// main.js wires this up identically (window.localStorage in the browser, a
// fake in tests).
export function createBlockList(storage) {
  let blocked = readSet(storage);
  return {
    has(playerId) {
      return blocked.has(playerId);
    },
    add(playerId) {
      if (typeof playerId !== 'string' || !playerId) return;
      if (blocked.has(playerId)) return;
      blocked = new Set(blocked);
      blocked.add(playerId);
      writeSet(storage, blocked);
    },
    remove(playerId) {
      if (!blocked.has(playerId)) return;
      blocked = new Set(blocked);
      blocked.delete(playerId);
      writeSet(storage, blocked);
    },
    all() {
      return [...blocked];
    },
  };
}
