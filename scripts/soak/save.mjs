// The save the soak driver plants in localStorage before the game starts, so a
// run lands on the home screen with the chosen cat, every place open, the
// guided first walk done and no cards in the way. The game's own loader
// (progression.js sanitizeState) repairs anything wrong, so this stays small.
export const SAVE_KEY = 'whisker-walk-save';
export const SETTINGS_KEY = 'whisker-walk-settings';

// Pinned to CATALOG.areas / CATALOG.cats by test/soakargs.test.js.
export const ALL_PLACES = Object.freeze([
  'reef', 'moon', 'neighborhood', 'park', 'farm', 'fair', 'roofs', 'market', 'house', 'seaside', 'lighthouse',
  'treehouse', 'greenhouse', 'crystal', 'snowville', 'jungle', 'docks', 'woods', 'river', 'moor', 'pines', 'gorge',
]);
export const PRESET_CATS = Object.freeze([
  'tabby', 'siamese', 'persian', 'black', 'calico', 'mainecoon', 'zeetoo', 'robbie', 'd2', 'digit', 'hagrid',
]);

const CUSTOM_LOOK = Object.freeze({ coat: 'ginger', marks: 'chocolate', pattern: 'stripes', fur: 'fluffy', eyes: 'green', size: 1 });

// cat: a preset id, or 'custom' for one hand-built cat in slot mine1.
export function buildSeedSave({ place, cat }) {
  const custom = cat === 'custom';
  const walks = Object.fromEntries(ALL_PLACES.map((p) => [p, 5]));
  const save = {
    version: 4,
    points: 500,
    lifetimePoints: 500,
    walks: { ...walks, neighborhood: 5, den: 0 },
    unlocked: { cats: [...PRESET_CATS], accessories: [], areas: [...ALL_PLACES] },
    equipped: { cat: custom ? 'tabby' : cat, collar: null, custom: custom ? 'mine1' : null },
    customCats: custom ? [{ id: 'mine1', name: 'Soak', personality: 'keenNose', look: { ...CUSTOM_LOOK } }] : [],
    area: place,
    petName: 'Soak',
    edition: 'canon',
    clanPick: { mine: 'woods', partner: null, partnerId: null },
    tutorial: { first: 'done', camp: true, hints: {}, told: { thing: null, visits: 0 } },
  };
  return save;
}

export function seedSettings({ tv, couch }) {
  return { muted: true, volume: 0, musicVolume: 0, tvMode: !!tv, couchMode: !!couch, showTips: false, perfReadout: true };
}

export const isKnownPlace = (p) => ALL_PLACES.includes(p);
export const isKnownCat = (c) => c === 'custom' || PRESET_CATS.includes(c);
