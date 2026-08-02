const SAVE_KEY = 'whisker-walk-save';
const SAVE_VERSION = 3; // v3: lifetime points, best walk, cat friends

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
    bandana: { name: 'Bandana', slot: 'outfit', price: 20 },
    booties: { name: 'Rain Booties', slot: 'outfit', price: 25 },
    backpack: { name: 'Tiny Backpack', slot: 'outfit', price: 35 },
    crown: { name: 'Flower Crown', slot: 'outfit', price: 35 },
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
    equipped: { cat: 'tabby', collar: null, outfit: null },
    area: 'neighborhood',
    lifetimePoints: 0,
    bestWalk: 0,
    friends: {},
    petName: null,
  };
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
  const outfit = parsed.equipped?.outfit;
  const equippedOutfit = typeof outfit === 'string' && unlockedAcc.includes(outfit) && CATALOG.accessories[outfit]?.slot === 'outfit'
    ? outfit : null;

  const area = typeof parsed.area === 'string' && unlockedAreas.includes(parsed.area) ? parsed.area : d.area;

  const walks = {};
  for (const key of Object.keys(d.walks)) walks[key] = asFiniteNonNegInt(parsed.walks?.[key], 0);

  return {
    version: SAVE_VERSION,
    points: asFiniteNonNeg(parsed.points, 0),
    walks,
    unlocked: { cats: unlockedCats, accessories: unlockedAcc, areas: unlockedAreas },
    equipped: { cat: equippedCat, collar: equippedCollar, outfit: equippedOutfit },
    area,
    lifetimePoints: asFiniteNonNeg(parsed.lifetimePoints, 0),
    bestWalk: asFiniteNonNeg(parsed.bestWalk, 0),
    friends: sanitizeFriends(parsed.friends),
    petName: typeof parsed.petName === 'string' ? parsed.petName.slice(0, 16) : null,
  };
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
      if (parsed && parsed.version === 2) {
        return sanitizeState({ ...parsed, version: 3, lifetimePoints: parsed.points, bestWalk: 0, friends: {}, petName: null });
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
