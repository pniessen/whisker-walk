// More than one player on one device and browser. Pure and tiny (it runs at start-up, before any save is read).
//
// The FIRST player keeps the names the game always had: no suffix, no copy, no migration, so every save
// that exists today is untouched. Each further player (p2, p3, ...) gets the same keys with ".p2", ".p3"
// on the end, for everything classified as the cat's own in src/savekeys.js (the save and its backups, the
// cat key and cloud link, photos, met players, first-time guides, a walk left half way, the rollback slot).
// The device's settings (sound, TV mode, couch, graphics) are not suffixed: all players share them.
//
// How it works without touching the rest of the game: before anything reads a save, playerboot.js puts a
// scoped storage in place of window.localStorage for a later player. It maps a cat key to its suffixed name
// on the way in and out, so progression.js, the cloud code and the rest all keep using their usual names and
// cannot reach another player's data. Switching players or adding one only writes the small index
// (PLAYERS_KEY) and reloads the page; it never writes to another player's keys.
//
// A new player has a new cat key and no cloud link (cat key keys are per player), so nothing of theirs is
// ever written over another player's cloud copy.
import { classify, PLAYERS_KEY, FRESH_BACKUP_KEY } from './savekeys.js';

export { PLAYERS_KEY };
export const FIRST_ID = 'p1';
export const MAX_PLAYERS = 6;
const ID_RE = /^p[1-9]$/;
const SUFFIXED_RE = /^(.*)\.(p[2-9])$/;
export const NEW_PLAYER_BACKUP = '.before-new-player';

/** '' for the first player (the old names, unchanged), '.p2' for the second, and so on. */
export const suffixOf = (id) => (typeof id === 'string' && ID_RE.test(id) && id !== FIRST_ID ? `.${id}` : '');

/** Keys that belong to a player: the cat's own (savekeys.js) and the rollback slot. */
export const isPlayerKey = (key) => typeof key === 'string' && (classify(key) === 'reset' || key === FRESH_BACKUP_KEY);

const DEFAULT_INDEX = () => ({ active: FIRST_ID, players: [{ id: FIRST_ID }] });

/** The index from its stored text. Anything odd (absent, corrupt, wrong shape) gives the first player alone. */
export function parseIndex(raw) {
  let v = null;
  try { v = JSON.parse(raw); } catch { return DEFAULT_INDEX(); }
  if (!v || typeof v !== 'object' || !Array.isArray(v.players)) return DEFAULT_INDEX();
  const seen = new Set([FIRST_ID]);
  const players = [{ id: FIRST_ID }];
  for (const p of v.players) {
    const id = p && typeof p === 'object' ? p.id : null;
    if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id) || players.length >= MAX_PLAYERS) continue;
    seen.add(id);
    players.push({ id });
  }
  const active = typeof v.active === 'string' && seen.has(v.active) ? v.active : FIRST_ID;
  return { active, players };
}

export function readIndex(raw) {
  try { return parseIndex(raw?.getItem(PLAYERS_KEY)); } catch { return DEFAULT_INDEX(); }
}

const indexText = (idx) => JSON.stringify({ v: 1, active: idx.active, players: idx.players.map((p) => ({ id: p.id })) });

function writeIndex(raw, idx) {
  try {
    const text = indexText(idx);
    raw.setItem(PLAYERS_KEY, text);
    return raw.getItem(PLAYERS_KEY) === text;
  } catch { return false; }
}

/** The suffix of the player who is playing now ('' for the first). */
export function activeSuffix(raw) { return suffixOf(readIndex(raw).active); }

/** Make `id` the player (they must be on the list). Only writes the index. -> true when it took. */
export function setActive(raw, id) {
  const idx = readIndex(raw);
  if (!idx.players.some((p) => p.id === id)) return false;
  if (idx.active === id) return true;
  return writeIndex(raw, { ...idx, active: id });
}

/**
 * Start a new player: keep a copy of the current player's save beside it (".before-new-player"), add the
 * next id to the list and make it the player. Nothing of the current player is changed or removed. The
 * caller reloads the page. -> { ok, id } or { ok: false, error: 'full' | 'nocopy' | 'nowrite' }.
 */
export function addPlayer(raw, { saveKey } = {}) {
  const idx = readIndex(raw);
  if (idx.players.length >= MAX_PLAYERS) return { ok: false, error: 'full' };
  const id = ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'].find((c) => !idx.players.some((p) => p.id === c));
  if (!id) return { ok: false, error: 'full' };
  const sfx = suffixOf(idx.active);
  try {
    const have = typeof saveKey === 'string' ? raw.getItem(saveKey + sfx) : null;
    if (have) {
      const copyKey = saveKey + NEW_PLAYER_BACKUP + sfx;
      raw.setItem(copyKey, have);
      if (raw.getItem(copyKey) !== have) return { ok: false, error: 'nocopy' };
    }
  } catch { return { ok: false, error: 'nocopy' }; }
  if (!writeIndex(raw, { active: id, players: [...idx.players, { id }] })) return { ok: false, error: 'nowrite' };
  return { ok: true, id };
}

/**
 * A localStorage-shaped view for one later player: the cat's keys are read and written under their
 * suffixed names; every other key (the device's) goes straight through. Listing shows this player's keys
 * under their plain names and hides every other player's.
 */
export function scopedStorage(raw, suffix) {
  const map = (k) => (suffix && isPlayerKey(k) ? k + suffix : k);
  // what a raw key is to this player: its plain name, or null when it is somebody else's
  const plain = (k) => {
    if (typeof k !== 'string') return null;
    const m = SUFFIXED_RE.exec(k);
    if (m && isPlayerKey(m[1])) return `.${m[2]}` === suffix ? m[1] : null;
    return isPlayerKey(k) ? null : k; // a plain cat key is the first player's
  };
  const names = () => {
    const out = [];
    try { for (let i = 0; i < raw.length; i++) { const p = plain(raw.key(i)); if (p !== null) out.push(p); } } catch { /* unlistable */ }
    return out;
  };
  return {
    getItem: (k) => raw.getItem(map(k)),
    setItem: (k, v) => raw.setItem(map(k), v),
    removeItem: (k) => raw.removeItem(map(k)),
    key: (i) => names()[i] ?? null,
    get length() { return names().length; },
  };
}

/**
 * Run once at start-up, before any save is read. A later player: window.localStorage becomes their scoped
 * view. The first player: nothing changes at all. -> { active, count, ok } (ok false: the scope could not
 * be put in place, so the page stays on the first player's names and the player UI stays hidden).
 */
export function installPlayerStorage(win) {
  let raw = null;
  try { raw = win.localStorage; } catch { return { active: FIRST_ID, count: 1, ok: false, supported: false }; }
  if (!raw) return { active: FIRST_ID, count: 1, ok: false, supported: false };
  const idx = readIndex(raw);
  if (idx.active === FIRST_ID) return { active: FIRST_ID, count: idx.players.length, ok: true, supported: true };
  try {
    const scoped = scopedStorage(raw, suffixOf(idx.active));
    Object.defineProperty(win, 'localStorage', { configurable: true, get: () => scoped });
    if (win.localStorage !== scoped) throw new Error('not replaced');
    return { active: idx.active, count: idx.players.length, ok: true, supported: true, raw };
  } catch {
    // Never run a later player on the first player's names: put the first player back in front.
    try { writeIndex(raw, { ...idx, active: FIRST_ID }); } catch { /* nothing more to do */ }
    return { active: FIRST_ID, count: idx.players.length, ok: false, supported: false };
  }
}

/** The raw, unscoped storage (the index lives there), even when a later player is playing. */
export function rawStorageOf(win, installed) {
  return installed?.raw ?? win.localStorage;
}

/** A player's save as { name, points } for the list. `nameOf(catId)` and the save's own custom cats give the name. */
export function summarizeSave(rawSave, nameOf = () => null) {
  let s = null;
  try { s = JSON.parse(rawSave); } catch { return { name: null, points: 0 }; }
  if (!s || typeof s !== 'object') return { name: null, points: 0 };
  const eq = s.equipped && typeof s.equipped === 'object' ? s.equipped : {};
  const custom = Array.isArray(s.customCats) ? s.customCats.find((c) => c && c.id === eq.custom) : null;
  let name = typeof custom?.name === 'string' && custom.name ? custom.name : null;
  if (!name && typeof eq.cat === 'string') { try { name = nameOf(eq.cat) || null; } catch { name = null; } }
  const points = Number.isFinite(s.points) ? Math.max(0, Math.floor(s.points)) : 0;
  return { name, points, equipped: eq };
}

/** The list for the Switch player screen: [{ id, label, points, active }], from the raw storage. */
export function listPlayers(raw, { saveKey, nameOf } = {}) {
  const idx = readIndex(raw);
  return idx.players.map((p, i) => {
    let text = null;
    try { text = raw.getItem(saveKey + suffixOf(p.id)); } catch { /* shown as new */ }
    const sum = text ? summarizeSave(text, nameOf) : { name: null, points: 0 };
    return { id: p.id, label: sum.name || `Player ${i + 1}`, points: sum.points, active: p.id === idx.active, equipped: sum.equipped ?? null };
  });
}
