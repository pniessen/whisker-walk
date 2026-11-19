// Found outfits: every walk hides one find-only outfit at a hand-placed spot.
// This module gathers the records (one file per slot group: head.js, face.js,
// neck.js, body.js, feet.js; each file's header says what a record is) and
// makes the catalog entries src/progression.js appends to CATALOG.accessories.
//
// It imports only the record files (and they only clanphrases.js), never
// progression.js, so the catalog can import it without a cycle. Nothing here
// is random or reads the clock: two players on one walk see the same thing.
//
// ADDING ONE (the seam later outfits come through):
//   1. a record at the end of its slot group's file, with its id, slot, place,
//      emoji and name. Its id must be new: one a shop or prize item already
//      has (BASE_ACCESSORY_IDS, src/progression.js) is skipped by the catalog,
//      so the hand-written item stays, and the test reports it;
//   2. its name, 'wear.<id>.name', in the later table of src/clanphrases.js,
//      then re-record test/fixtures/series-words-on-later.json
//      (UPDATE_OFF_SNAPSHOT=1 npx vitest run test/offwords.test.js; the diff
//      only adds rows);
//   3. its mesh on the cat, and its mesh count in
//      test/fixtures/accessory-mesh-delta.json, in CATALOG.accessories' order
//      (that is FOUND_WEAR's order: head, face, neck, body, feet);
//   4. for a head, face, neck or collar one, Hagrid the hen's version
//      (src/cat/model.js) and its count in test/hagrid.test.js DELTA. He wears
//      no body, back or feet item.
// test/foundwear.test.js runs validateFoundWear over all of it.
import { HEAD_WEAR } from './head.js';
import { FACE_WEAR } from './face.js';
import { NECK_WEAR } from './neck.js';
import { BODY_WEAR } from './body.js';
import { FEET_WEAR } from './feet.js';

// Each record file, and the CATALOG.accessories slots its records may use.
export const SLOT_GROUPS = Object.freeze({
  head: Object.freeze(['head']),
  face: Object.freeze(['face']),
  neck: Object.freeze(['neck', 'collar']),
  body: Object.freeze(['body', 'back']),
  feet: Object.freeze(['feet']),
});

// An outfit id: 3 to 20 lowercase letters.
export const WEAR_ID = /^[a-z]{3,20}$/;
// At most this many outfits are hidden in one place.
export const WEAR_PER_AREA = 4;

// Every record: head, face, neck, body and feet, each file in its own order.
export const FOUND_WEAR = Object.freeze([...HEAD_WEAR, ...FACE_WEAR, ...NECK_WEAR, ...BODY_WEAR, ...FEET_WEAR]);
export const FOUND_WEAR_IDS = Object.freeze(FOUND_WEAR.map((r) => r.id));

const BY_ID = new Map(FOUND_WEAR.map((r) => [r.id, r]));
const BY_AREA = new Map();
for (const r of FOUND_WEAR) {
  if (!BY_AREA.has(r.find)) BY_AREA.set(r.find, []);
  BY_AREA.get(r.find).push(r);
}
for (const [area, list] of BY_AREA) BY_AREA.set(area, Object.freeze(list));
const NONE = Object.freeze([]);

// The records hidden in one place, in FOUND_WEAR's order. [] for a place with
// none, an unknown id, or anything that is not a string.
export function foundWearIn(areaId) {
  return (typeof areaId === 'string' && BY_AREA.get(areaId)) || NONE;
}

// One record by id, or null.
export function foundRecord(id) {
  return (typeof id === 'string' && BY_ID.get(id)) || null;
}

// Every problem with a set of record files, one line each; [] when there is
// none. `groups` is { head, face, neck, body, feet }, each a file's records.
// `areaIds` are the places an outfit may be hidden in (CATALOG.areas' ids);
// `takenIds` are the accessory ids already used by something else.
export function validateFoundWear(groups, { areaIds = [], takenIds = [] } = {}) {
  const problems = [];
  const areas = new Set(areaIds);
  const taken = new Set(takenIds);
  const seen = new Set();
  const perArea = new Map();
  for (const [group, slots] of Object.entries(SLOT_GROUPS)) {
    const list = groups?.[group] ?? [];
    if (!Array.isArray(list)) { problems.push(`${group}: not a list of records`); continue; }
    list.forEach((r, i) => {
      const at = `${group}[${i}]`;
      if (!r || typeof r !== 'object') { problems.push(`${at}: not a record`); return; }
      const label = `${at} ${JSON.stringify(r.id)}`;
      if (typeof r.id !== 'string' || !WEAR_ID.test(r.id)) problems.push(`${label}: the id is not 3 to 20 lowercase letters`);
      else if (seen.has(r.id)) problems.push(`${label}: the id is used twice`);
      else if (taken.has(r.id)) problems.push(`${label}: the id is already another accessory's`);
      if (typeof r.id === 'string') seen.add(r.id);
      if (!slots.includes(r.slot)) problems.push(`${label}: slot ${JSON.stringify(r.slot)} is not one of ${group}.js's (${slots.join(', ')})`);
      if (typeof r.find !== 'string' || !areas.has(r.find)) problems.push(`${label}: ${JSON.stringify(r.find)} is not a place`);
      else perArea.set(r.find, (perArea.get(r.find) ?? 0) + 1);
      if (typeof r.emoji !== 'string' || r.emoji.length === 0) problems.push(`${label}: no emoji`);
      let name;
      try { name = typeof r.name === 'function' ? r.name() : undefined; } catch { name = undefined; }
      if (typeof name !== 'string' || name.length === 0) problems.push(`${label}: name() does not give a name`);
    });
  }
  for (const [area, n] of perArea) {
    if (n > WEAR_PER_AREA) problems.push(`${area}: ${n} outfits, more than ${WEAR_PER_AREA}`);
  }
  return problems;
}

// The CATALOG.accessories entries, in FOUND_WEAR's order. Each is a prize
// (never bought, traded or given by a code) flagged `find` with its place.
// The name is read through the record's phrase each time it is asked for.
export const FOUND_CATALOG = Object.freeze(Object.fromEntries(FOUND_WEAR.map((record) => [record.id, {
  get name() { return record.name(); },
  slot: record.slot,
  price: 0,
  prize: true,
  find: record.find,
  emoji: record.emoji,
}])));
