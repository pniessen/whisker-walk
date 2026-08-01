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
  };
}

export function createProgression(storage) {
  let state = defaultState();
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === SAVE_VERSION) state = parsed;
      else if (parsed && parsed.version === 2) {
        state = { ...parsed, version: 3, lifetimePoints: parsed.points, bestWalk: 0, friends: {} };
      } else console.warn('Whisker Walk: incompatible save, starting fresh');
    }
  } catch (err) {
    console.warn('Whisker Walk: could not read save, starting fresh', err);
  }

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
  };
  return api;
}
