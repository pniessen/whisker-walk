const SAVE_KEY = 'whisker-walk-save';
const SAVE_VERSION = 4; // v4: per-slot cosmetic accessories

// v15 Collector's Journal critter types — the fixed vocabulary state.journal
// counts are restricted to (sanitizeState drops anything outside this list).
export const JOURNAL_TYPES = ['bird', 'squirrel', 'butterfly', 'duck', 'seagull', 'crab', 'dog', 'villager', 'firefly', 'mouse'];

// Golden-mouse id shape, e.g. 'gm-neigh-1'. The brief called for validating
// state.golden against a KNOWN_GOLD set imported from src/goldmice.js, but
// that module doesn't exist yet (it lands in Task 5.3) — importing it here
// would make progression.js depend on a not-yet-existing module and invite
// an import cycle once goldmice.js exists. Validating against this id-shape
// pattern instead needs no cross-module import and still rejects anything
// that isn't a plausible golden-mouse id; Task 5.3 can layer a real
// existence check in the game logic that calls recordGolden.
const GOLD_ID_PATTERN = /^gm-[a-z]+-[1-9]$/;
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const RANKS = [
  { at: 0, title: 'House Cat' },
  { at: 150, title: 'Yard Prowler' },
  { at: 400, title: 'Street Smart' },
  { at: 900, title: 'Neighborhood Legend' },
  { at: 2000, title: 'Mythical Feline' },
];

export function rankFor(lifetimePoints) {
  let current = RANKS[0];
  let next = null;
  for (const r of RANKS) {
    if (lifetimePoints >= r.at) current = r;
  }
  const idx = RANKS.indexOf(current);
  next = idx + 1 < RANKS.length ? RANKS[idx + 1] : null;
  return { title: current.title, next };
}

export const CATALOG = {
  cats: {
    tabby: { name: 'Tabby', price: 0 },
    siamese: { name: 'Siamese', price: 30 },
    persian: { name: 'Persian', price: 30 },
    black: { name: 'Black Cat', price: 45 },
    calico: { name: 'Calico', price: 45 },
    mainecoon: { name: 'Maine Coon', price: 60 },
    zeetoo: { name: 'Zeetoo', price: 40 },
    rosa: { name: 'Rosa', price: 40 },
    robbie: { name: 'Robbie', price: 40 },
    hagrid: { name: 'Hagrid', price: 60 },
  },
  accessories: {
    bell: { name: 'Bell Collar', slot: 'collar', price: 20 },
    glow: { name: 'Glow Collar', slot: 'collar', price: 40 },
    bandana: { name: 'Bandana', slot: 'neck', price: 20 },
    booties: { name: 'Rain Booties', slot: 'feet', price: 25 },
    backpack: { name: 'Tiny Backpack', slot: 'back', price: 35 },
    crown: { name: 'Flower Crown', slot: 'head', price: 35 },
    tophat: { name: 'Top Hat', slot: 'head', price: 30 },
    beanie: { name: 'Cozy Beanie', slot: 'head', price: 20 },
    glasses: { name: 'Round Glasses', slot: 'face', price: 25 },
    sunglasses: { name: 'Cool Sunglasses', slot: 'face', price: 25 },
    necktie: { name: 'Necktie', slot: 'neck', price: 25 },
    bowtie: { name: 'Bow Tie', slot: 'neck', price: 25 },
    scarf: { name: 'Cozy Scarf', slot: 'neck', price: 30 },
    hoodie: { name: 'Purple Hoodie', slot: 'body', price: 35 },
    cape: { name: 'Superhero Cape', slot: 'body', price: 40 },
    wings: { name: 'Butterfly Wings', slot: 'back', price: 45 },
    sneakers: { name: 'Sporty Sneakers', slot: 'feet', price: 25 },
    rainboots: { name: 'Rain Boots', slot: 'feet', price: 25 },
  },
  areas: {
    neighborhood: { name: 'Cozy Neighborhood', price: 0 },
    park: { name: 'City Park', price: 50, requires: { area: 'neighborhood', walks: 2 } },
    seaside: { name: 'Seaside', price: 100, requires: { area: 'park', walks: 2 } },
  },
};

// summarizeSaveForPreview(s) — reduces a save object down to the four fields
// the cloud-sync "Load from cloud" preview card displays (main.js's
// previewLoad, rendered by ui/homebase.js's renderSync). `s` may be a
// hostile/malformed payload smuggled in via the cloud `saves` table (it's
// read back with no server-side shape validation — see docs/supabase-setup.sql's
// load_save) — every numeric field is coerced through asFiniteNonNeg so
// nothing but a plain finite non-negative number ever reaches the preview
// card, and rank is always one of RANKS' own fixed titles. `s` itself may be
// any type (string, null, array) since a hostile payload could replace the
// whole `save` object — optional chaining below means that never throws.
export function summarizeSaveForPreview(s) {
  const points = asFiniteNonNeg(s?.points, 0);
  const lifetimePoints = asFiniteNonNeg(s?.lifetimePoints, 0);
  const bestWalk = asFiniteNonNeg(s?.bestWalk, 0);
  return { rank: rankFor(lifetimePoints).title, points, lifetimePoints, bestWalk };
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
// exported so other untrusted-input call sites (e.g. main.js's cloud-preview
// summarize, before Task-1-final-fix-wave a raw pass-through that let a
// hostile cloud payload's non-numeric points/lifetimePoints/bestWalk reach
// homebase's innerHTML) can reuse the exact same coercion instead of
// duplicating (and potentially drifting from) it.
export function asFiniteNonNeg(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}
function asFiniteNonNegInt(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}
function asStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : [];
}

function defaultState() {
  return {
    version: SAVE_VERSION,
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0 },
    unlocked: { cats: ['tabby', 'siamese', 'persian'], accessories: ['bell', 'bandana'], areas: ['neighborhood'] },
    equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
    area: 'neighborhood',
    lifetimePoints: 0,
    bestWalk: 0,
    friends: {},
    petName: null,
    journal: {},
    golden: [],
    streak: { last: null, count: 0 },
    kitten: { stage: 0 },
  };
}

// Cloud-loaded (or otherwise externally supplied) journal counts are
// untrusted: each key must be one of the fixed JOURNAL_TYPES and each value
// a finite non-negative integer, or the whole entry is dropped rather than
// coerced/defaulted — an unknown critter type or a garbage count simply
// never makes it into state.journal.
function sanitizeJournal(v) {
  if (!isPlainObject(v)) return {};
  const out = {};
  for (const type of JOURNAL_TYPES) {
    if (!Object.prototype.hasOwnProperty.call(v, type)) continue;
    const n = asFiniteNonNegInt(v[type], undefined);
    if (n !== undefined) out[type] = n;
  }
  return out;
}

// Golden-mouse ids: string + GOLD_ID_PATTERN shape check (see the comment on
// GOLD_ID_PATTERN above for why this replaces a KNOWN_GOLD import), plus
// dedupe — a hostile or corrupted payload could otherwise list the same id
// twice.
function sanitizeGolden(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const id of v) {
    if (typeof id === 'string' && GOLD_ID_PATTERN.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function sanitizeStreak(v) {
  const last = typeof v?.last === 'string' && YMD_PATTERN.test(v.last) ? v.last : null;
  const count = asFiniteNonNegInt(v?.count, 0);
  return { last, count };
}

function sanitizeKitten(v) {
  const stage = asFiniteNonNegInt(v?.stage, 0);
  return { stage: Math.min(3, stage) };
}

function ymdToUTCms(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// Cloud-loaded (or otherwise externally supplied) friends are untrusted:
// homebase interpolates the name/breed into innerHTML, so every key/value
// is type- and shape-checked here rather than trusted wholesale — a bad
// name/breed is dropped (name) or coerced to a safe default (breed).
function sanitizeFriends(v) {
  if (!isPlainObject(v)) return {};
  const knownBreeds = new Set(Object.keys(CATALOG.cats));
  const out = {};
  for (const [name, f] of Object.entries(v)) {
    if (typeof name !== 'string' || name.length === 0 || name.length > 24) continue;
    if (!isPlainObject(f)) continue;
    out[name] = {
      breed: typeof f.breed === 'string' && knownBreeds.has(f.breed) ? f.breed : 'tabby',
      greets: asFiniteNonNegInt(f.greets, 0),
      lastWalk: typeof f.lastWalk === 'string' ? f.lastWalk : null,
    };
  }
  return out;
}

// A cloud-loaded (or otherwise externally supplied/corrupted) save is
// untrusted input: version acceptance/migration alone isn't enough — a
// payload can claim version 3 while missing or mistyping any field, which
// would otherwise leave `state` in a shape homebase's render() throws on
// (e.g. missing `equipped`/`friends`), and since it's already persisted by
// the time that happens, every subsequent boot crashes too. Every field is
// therefore individually type-checked here and either kept or defaulted —
// never merged in wholesale.
function sanitizeState(parsed) {
  const d = defaultState();
  if (!isPlainObject(parsed)) return d;

  const knownCats = new Set(Object.keys(CATALOG.cats));
  const knownAcc = new Set(Object.keys(CATALOG.accessories));
  const knownAreas = new Set(Object.keys(CATALOG.areas));

  const unlockedCats = asStringArray(parsed.unlocked?.cats).filter((id) => knownCats.has(id));
  const unlockedAcc = asStringArray(parsed.unlocked?.accessories).filter((id) => knownAcc.has(id));
  const unlockedAreas = asStringArray(parsed.unlocked?.areas).filter((id) => knownAreas.has(id));
  // starter unlocks are guaranteed on every fresh save (defaultState) —
  // guarantee them here too so a malformed/truncated payload never leaves
  // the player with zero cats/areas to actually play with.
  for (const id of d.unlocked.cats) if (!unlockedCats.includes(id)) unlockedCats.push(id);
  for (const id of d.unlocked.accessories) if (!unlockedAcc.includes(id)) unlockedAcc.push(id);
  for (const id of d.unlocked.areas) if (!unlockedAreas.includes(id)) unlockedAreas.push(id);

  const equippedCat = typeof parsed.equipped?.cat === 'string' && unlockedCats.includes(parsed.equipped.cat)
    ? parsed.equipped.cat : d.equipped.cat;
  const collar = parsed.equipped?.collar;
  const equippedCollar = typeof collar === 'string' && unlockedAcc.includes(collar) && CATALOG.accessories[collar]?.slot === 'collar'
    ? collar : null;
  // Cat Couture v4: the single `outfit` slot became six cosmetic slots
  // (head/face/neck/body/back/feet) — each is validated the same way collar
  // is above: a value survives only if it's a string, actually unlocked, and
  // its catalog entry's slot matches the slot key it's sitting in.
  const equippedSlots = {};
  for (const slotKey of ['head', 'face', 'neck', 'body', 'back', 'feet']) {
    const v = parsed.equipped?.[slotKey];
    equippedSlots[slotKey] = typeof v === 'string' && unlockedAcc.includes(v) && CATALOG.accessories[v]?.slot === slotKey
      ? v : null;
  }

  const area = typeof parsed.area === 'string' && unlockedAreas.includes(parsed.area) ? parsed.area : d.area;

  const walks = {};
  for (const key of Object.keys(d.walks)) walks[key] = asFiniteNonNegInt(parsed.walks?.[key], 0);

  return {
    version: SAVE_VERSION,
    points: asFiniteNonNeg(parsed.points, 0),
    walks,
    unlocked: { cats: unlockedCats, accessories: unlockedAcc, areas: unlockedAreas },
    equipped: { cat: equippedCat, collar: equippedCollar, ...equippedSlots },
    area,
    lifetimePoints: asFiniteNonNeg(parsed.lifetimePoints, 0),
    bestWalk: asFiniteNonNeg(parsed.bestWalk, 0),
    friends: sanitizeFriends(parsed.friends),
    petName: typeof parsed.petName === 'string' ? parsed.petName.slice(0, 16) : null,
    journal: sanitizeJournal(parsed.journal),
    golden: sanitizeGolden(parsed.golden),
    streak: sanitizeStreak(parsed.streak),
    kitten: sanitizeKitten(parsed.kitten),
  };
}

// v3 → v4: the single `outfit` slot became six cosmetic slots. Re-home the
// equipped outfit item into whatever slot its catalog entry now uses, so
// nobody loses the accessory they were wearing. Shared by both the v3 and
// v2 branches below (a v2 save is migrated 2 → 3 → 4 by building the v3
// shape and routing it through this same function, rather than duplicating
// the re-homing logic).
function migrateV3ToV4(parsed) {
  // AUDIT CARVE-OUT: the only permitted live 'outfit' reads in src/ — this
  // migration must read the legacy field by name to re-home old saves.
  const worn = parsed.equipped?.outfit;
  const slot = typeof worn === 'string' ? CATALOG.accessories[worn]?.slot : null;
  const { outfit, ...rest } = parsed.equipped ?? {};
  return sanitizeState({
    ...parsed,
    version: 4,
    equipped: { ...rest, ...(slot ? { [slot]: worn } : {}) },
  });
}

// Shared by createProgression's initial load AND replaceFromPayload below —
// a cloud-loaded (or otherwise externally supplied) save must go through
// the exact same parse/version-migration/sanitize path as a normal boot,
// so there's only one place that knows how to read whisker-walk-save.
function loadState(storage) {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === SAVE_VERSION) return sanitizeState(parsed);
      if (parsed && parsed.version === 3) {
        return migrateV3ToV4(parsed);
      }
      if (parsed && parsed.version === 2) {
        return migrateV3ToV4({ ...parsed, version: 3, lifetimePoints: parsed.points, bestWalk: 0, friends: {}, petName: null });
      }
      console.warn('Whisker Walk: incompatible save, starting fresh');
    }
  } catch (err) {
    console.warn('Whisker Walk: could not read save, starting fresh', err);
  }
  return defaultState();
}

export function createProgression(storage) {
  let state = loadState(storage);

  const save = () => {
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Whisker Walk: could not write save', err);
    }
  };

  const api = {
    get state() {
      return state;
    },
    addPoints(n) {
      state.points += n;
      state.lifetimePoints += n;
      save();
    },
    isUnlocked(kind, id) {
      return state.unlocked[kind].includes(id);
    },
    canBuy(kind, id) {
      const item = CATALOG[kind][id];
      if (!item || api.isUnlocked(kind, id) || state.points < item.price) return false;
      if (item.requires && state.walks[item.requires.area] < item.requires.walks) return false;
      return true;
    },
    buy(kind, id) {
      if (!api.canBuy(kind, id)) return false;
      state.points -= CATALOG[kind][id].price;
      state.unlocked[kind].push(id);
      save();
      return true;
    },
    equipCat(id) {
      if (api.isUnlocked('cats', id)) {
        state.equipped.cat = id;
        save();
      }
    },
    equipAccessory(id) {
      const item = CATALOG.accessories[id];
      if (item && api.isUnlocked('accessories', id)) {
        state.equipped[item.slot] = id;
        save();
      }
    },
    unequip(slot) {
      state.equipped[slot] = null;
      save();
    },
    setArea(id) {
      if (api.isUnlocked('areas', id)) {
        state.area = id;
        save();
      }
    },
    completeWalk() {
      state.walks[state.area] += 1;
      save();
    },
    recordGreet(name, breed, walkStamp) {
      const f = state.friends[name] ?? (state.friends[name] = { breed, greets: 0, lastWalk: null });
      if (f.lastWalk === walkStamp) return null;
      f.lastWalk = walkStamp;
      f.greets += 1;
      save();
      if (f.greets === 1) return 'met';
      if (f.greets === 3) return 'friend';
      if (f.greets === 6) return 'best';
      return null;
    },
    friendLevel(name) {
      const g = state.friends[name]?.greets ?? 0;
      return g >= 6 ? 'best' : g >= 3 ? 'friend' : g >= 1 ? 'met' : 'none';
    },
    recordWalkScore(points) {
      if (points > state.bestWalk) {
        state.bestWalk = points;
        save();
        return true;
      }
      return false;
    },
    reset() {
      state = defaultState();
      save();
    },
    setPetName(name) {
      state.petName = name;
      save();
    },
    // recordSighting(type) — increments the journal count for a known
    // critter type; unrecognized types (typos, future-removed types, or a
    // hostile caller) are silently ignored rather than polluting
    // state.journal with keys sanitizeState would strip on next load.
    recordSighting(type) {
      if (!JOURNAL_TYPES.includes(type)) return;
      state.journal[type] = (state.journal[type] ?? 0) + 1;
      save();
    },
    // recordGolden(id) → bool — records a newly found golden mouse. Returns
    // false (no-op) for an id that doesn't match GOLD_ID_PATTERN or one
    // already recorded, so callers can gate a "new find" toast on the
    // return value.
    recordGolden(id) {
      if (typeof id !== 'string' || !GOLD_ID_PATTERN.test(id) || state.golden.includes(id)) return false;
      state.golden.push(id);
      save();
      return true;
    },
    // recordStreakWalk(todayStr) → { count, bonus } — todayStr is a
    // YYYY-MM-DD string from the caller's local walk-completion clock.
    // Same day as last recorded walk: streak count unchanged, bonus 0 (no
    // double-dipping same-day walks). Exactly one UTC calendar day after
    // the last recorded date: streak continues, count+1. Anything else
    // (first ever walk, or a gap): streak resets to 1. bonus is
    // min(5*count, 25), awarded only when the day actually changed — the
    // caller is responsible for adding bonus to points so it can show the
    // toast itself rather than this module reaching into addPoints.
    recordStreakWalk(todayStr) {
      const { last, count } = state.streak;
      if (last === todayStr) {
        return { count, bonus: 0 };
      }
      const consecutive = last != null && (ymdToUTCms(todayStr) - ymdToUTCms(last) === 86400000);
      const newCount = consecutive ? count + 1 : 1;
      const bonus = Math.min(5 * newCount, 25);
      state.streak = { last: todayStr, count: newCount };
      save();
      return { count: newCount, bonus };
    },
    // setKittenStage(n) — clamps to 0..3 and is monotonic: a lower/equal
    // stage than the current one is ignored, so a stale or out-of-order
    // call (e.g. two quest branches racing) can never regress growth.
    setKittenStage(n) {
      const v = asFiniteNonNegInt(n, undefined);
      if (v === undefined) return;
      const bounded = Math.min(3, v);
      if (bounded > state.kitten.stage) {
        state.kitten.stage = bounded;
        save();
      }
    },
    // replaceFromPayload(rawSaveObject) — used by cloud "Load from cloud":
    // writes the raw object straight to storage under the save key, then
    // reloads live state through the SAME loadState() the constructor uses,
    // so a v2-format cloud payload migrates exactly like a normal v2 save
    // would on next boot instead of needing its own migration logic here.
    replaceFromPayload(rawSaveObject) {
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(rawSaveObject));
      } catch (err) {
        console.warn('Whisker Walk: could not write cloud save', err);
      }
      state = loadState(storage);
    },
  };
  return api;
}
