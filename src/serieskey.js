// The family words' key on this device: the content key (32 bytes) that opens
// the sealed set, kept in localStorage OUTSIDE the save, so it never syncs and
// never reaches the cloud. A device gets it once, from a typed family code
// (serieslock.js), and every later boot opens the set with it, offline.
//
// All three functions swallow storage errors (private mode, a full disk): the
// family's words then work for this session and the code is asked again next time.

export const FAMILY_KEY_STORE = 'whisker-walk-family-words';

// The stored key, or null when there is none or it is not 32 bytes of base64.
export function readFamilyKey(storage) {
  try {
    const text = storage?.getItem(FAMILY_KEY_STORE);
    if (typeof text !== 'string' || text === '') return null;
    const bin = atob(text);
    if (bin.length !== 32) return null;
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

// Whether a key is stored, without decoding it twice.
export function hasFamilyKey(storage) {
  return readFamilyKey(storage) !== null;
}

// true when the key was kept.
export function writeFamilyKey(storage, bytes) {
  try {
    if (!storage || !(bytes instanceof Uint8Array) || bytes.length !== 32) return false;
    storage.setItem(FAMILY_KEY_STORE, btoa(String.fromCharCode(...bytes)));
    return true;
  } catch {
    return false;
  }
}

export function forgetFamilyKey(storage) {
  try {
    if (typeof storage?.removeItem === 'function') storage.removeItem(FAMILY_KEY_STORE);
    else storage?.setItem(FAMILY_KEY_STORE, ''); // a storage with no remove: an empty key reads as none
  } catch {
    /* nothing to forget */
  }
}
