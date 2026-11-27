// The Reef's lazy stages (the Moon's way, src/world/moonstages.js). The base chunk (reef.js and the wings already built) holds the start; each stage
// chunk fills ST when it loads, so a stage is always in before build() or the life runs (the area loader awaits them together, in parallel). R10 only
// reserves the slots (each stage is empty but valid); the milestones fill them. Each piece grows under its own budget (scripts/buildjson.mjs, REEF_STAGE_MODULES).
//   lab:   the Sealab (R13 to R15): building, hatch, fuses, shark, dome show
//   wreck: the galleon (R16, R17): ship, brass suit prop, map trail, Captain's Chest
//   ride:  the two mounts (R11, R12): Sea Scooter and Diving Saucer, racks and riding
export const ST = {};

export const REEF_STAGE_MODULES = Object.freeze(['src/world/reefstagelab.js', 'src/world/reefstagewreck.js', 'src/world/reefstageride.js']);

let loading = null;
/** Loads the three stages together; the same promise every time. */
export function loadReefStages() {
  loading ??= Promise.all([import('./reefstagelab.js'), import('./reefstagewreck.js'), import('./reefstageride.js')]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}
