// The cat key: the pair (player id, player secret) that names one cat to the
// online database, plus the cloud link beside it. "Log in to my cat" (design
// 2026-11-22, milestone 1) makes a loaded cat bring its key to the device, so
// the profile, friends, colony and group name are the same cat there.
//
// Four storage values belong together: the player id, the player secret, the
// cloud code and the cloud row secret. They change together or not at all
// (applyKeyState puts the old ones back if any write fails), and the old four
// are kept beside the save's own before-cloud copy so Undo restores all of them.
//
// Pure and tiny on purpose: it sits in the start-up chunk (main.js reads the
// id through it) so it imports nothing but the player-id test.
import { isPlayerId } from './colony.js';

export const PLAYER_KEY = 'whisker-walk-player';
export const SECRET_KEY = 'whisker-walk-secret';
export const LINK_CODE_KEY = 'whisker-walk-cloudcode';
export const LINK_SECRET_KEY = 'whisker-walk-cloudsecret';
export const KEY_BACKUP_KEY = 'whisker-walk-key.before-cloud';
const FIELDS = [['id', PLAYER_KEY], ['secret', SECRET_KEY], ['code', LINK_CODE_KEY], ['linkSecret', LINK_SECRET_KEY]];

const str = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

// This device's cat id (made and kept on first use), and its secret if one
// exists (never made here: getOrCreateSecret in cloud.js does that). Never
// throws: with no usable storage the id lasts this session only.
export function readCatKey(storage) {
  try {
    let id = storage.getItem(PLAYER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      storage.setItem(PLAYER_KEY, id);
    }
    return { id, secret: str(storage.getItem(SECRET_KEY)) };
  } catch {
    return { id: crypto.randomUUID(), secret: null };
  }
}

// The four values as they are now ({ id, secret, code, linkSecret }, each a
// string or null). Throws if storage cannot be read.
export function snapshotKeyState(storage) {
  const out = {};
  for (const [name, key] of FIELDS) out[name] = str(storage.getItem(key));
  return out;
}

// Make the four values equal `state` (a null removes the value). All or
// nothing: if any write fails, the values that were there before are put back
// and false is returned.
export function applyKeyState(storage, state) {
  let before;
  try { before = snapshotKeyState(storage); } catch { return false; }
  try {
    for (const [name, key] of FIELDS) {
      const v = str(state?.[name]);
      if (v === null) storage.removeItem(key); else storage.setItem(key, v);
    }
    return true;
  } catch {
    try {
      for (const [name, key] of FIELDS) {
        if (before[name] === null) storage.removeItem(key); else storage.setItem(key, before[name]);
      }
    } catch { /* storage is gone; nothing more can be done */ }
    return false;
  }
}

// What a loaded cloud payload says about the cat: its id, if it is a real
// player id, with the row secret that comes with it. null for a payload from a
// build that did not name its cat, or one that names something else (the cloud
// is untrusted). The row secret travels as the player secret: for a row made by
// Save to cloud they are the same value.
export function catKeyFromPayload(payload, rowSecret) {
  const id = payload?.cat?.id;
  if (!isPlayerId(id) || !str(rowSecret)) return null;
  return { id, secret: rowSecret };
}

// Keep the four current values beside the save's before-cloud copy.
// Returns whether the copy was written.
export function backUpCatKey(storage) {
  try {
    storage.setItem(KEY_BACKUP_KEY, JSON.stringify({ at: Date.now(), key: snapshotKeyState(storage) }));
    return true;
  } catch {
    return false;
  }
}

export function hasCatKeyBackup(storage) {
  return readKeyBackup(storage) !== null;
}

function readKeyBackup(storage) {
  try {
    const w = JSON.parse(storage.getItem(KEY_BACKUP_KEY));
    const k = w?.key;
    if (!k || typeof k !== 'object' || !isPlayerId(k.id)) return null;
    return { id: k.id, secret: str(k.secret), code: str(k.code), linkSecret: str(k.linkSecret) };
  } catch {
    return null;
  }
}

// Undo, key side, in two steps so the save and the key can change together:
// useCatKeyBackup puts the kept four back (keeping the copy) and says what it
// found; dropCatKeyBackup clears the copy once the save is back too. If the save
// cannot be restored, the caller puts `undo` back with applyKeyState.
// -> { ok, changed, undo }. ok false: nothing was changed. changed true: the
// device's id or secret is not what it was, so the page must reload. With no
// kept copy it is ok and unchanged.
export function useCatKeyBackup(storage) {
  const kept = readKeyBackup(storage);
  if (!kept) return { ok: true, changed: false, undo: null };
  let before;
  try { before = snapshotKeyState(storage); } catch { return { ok: false, changed: false, undo: null }; }
  if (!applyKeyState(storage, kept)) return { ok: false, changed: false, undo: null };
  return { ok: true, changed: before.id !== kept.id || before.secret !== kept.secret, undo: before };
}

export function dropCatKeyBackup(storage) {
  try { storage.removeItem(KEY_BACKUP_KEY); } catch { /* the copy is harmless left behind */ }
}
