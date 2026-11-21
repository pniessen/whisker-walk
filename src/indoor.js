// The places under a roof (Old House step 1, ruling H7): the den and the Old
// House. Indoors there is no weather, no secrets, no strays or legend, no
// daily goals, no sky birds and no corner map (game/walk.js), and the sound is
// the den's fire, never birdsong or crickets (audio.js). The den's own rules
// (its zoom cap, its shop, its placed furniture) stay keyed on 'den' alone.
// Imports nothing, so it sits in start-up at no cost.
export const INDOOR_AREAS = Object.freeze(['den', 'house']);

export function isIndoor(id) {
  return INDOOR_AREAS.includes(id);
}
