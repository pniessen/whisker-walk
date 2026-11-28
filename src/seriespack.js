// Packs a word set to JSON and back, so the family's set can be sealed
// (seriescrypto.js) and committed as ciphertext. Pure: no imports.
//
// A set is a module of plain data: strings, numbers, frozen lists and tables,
// and Sets (DENIED_NAMES). A function cannot be packed, and a set that has one
// throws, so the set stays data only.
//
// packSet(mod)    JSON of every own export, top-level keys in sorted order.
//                 Nested keys keep their order (a table's order is read by the
//                 game: Object.values(CAT_PREFIXES) is a list). A Set is
//                 {"$set":[...]}.
// unpackSet(json) the set again, deep-frozen, with each {"$set":[...]} a Set.

const SET_MARK = '$set';

function check(value, path) {
  if (typeof value === 'function') throw new Error(`Whisker Walk: word set has a function at ${path}`);
  if (value === undefined || typeof value === 'symbol' || typeof value === 'bigint') throw new Error(`Whisker Walk: word set has a value that cannot be packed at ${path}`);
  if (value instanceof Set) [...value].forEach((v, i) => check(v, `${path}{${i}}`));
  else if (Array.isArray(value)) value.forEach((v, i) => check(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const k of Object.keys(value)) check(value[k], `${path}.${k}`);
}

export function packSet(mod) {
  const top = {};
  for (const k of Object.keys(mod).sort()) {
    check(mod[k], k);
    top[k] = mod[k];
  }
  return JSON.stringify(top, (_key, v) => (v instanceof Set ? { [SET_MARK]: [...v] } : v));
}

function revive(v) {
  if (Array.isArray(v)) return Object.freeze(v.map(revive));
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === SET_MARK && Array.isArray(v[SET_MARK])) return new Set(v[SET_MARK]);
    const out = {};
    for (const k of keys) out[k] = revive(v[k]);
    return Object.freeze(out);
  }
  return v;
}

export function unpackSet(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Whisker Walk: a packed word set is a table');
  return revive(parsed);
}
