// The den panel's own words (den shop UX). Furniture names and spot labels
// are not series words, so the family set ('on') and the everyday set ('off')
// read the same here; denWord takes the mode anyway so a later difference is
// one entry, not a new path. Pad glyph lines live in src/tv/padwords.js.
export const WORDS = Object.freeze({
  den: 'Den',
  myDen: '🏠 My den',
  tabShop: 'Shop',
  tabThings: 'My things',
  placeIt: 'Place it now',
  later: 'Later',
  putAway: 'Put away',
  walkIn: 'Walk in',
  done: 'Done',
  isYours: '{name} is yours!',
  needMore: 'Need {n} more 🐾',
  handPlace: 'Pick a spot for {name}',
});

export const DEN_WORD_IDS = Object.freeze(Object.keys(WORDS));

// denWord(id, mode, slots) -> the line, slots like {name} filled in; '' for an unknown id.
export function denWord(id, _mode, slots = {}) {
  if (!Object.prototype.hasOwnProperty.call(WORDS, id)) return '';
  return WORDS[id].replace(/\{(\w+)\}/g, (m, k) => (k in slots ? String(slots[k]) : m));
}
