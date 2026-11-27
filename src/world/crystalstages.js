// The Crystal Cave's lazy stages (the Reef's way, src/world/reefstages.js). The base chunk (crystal.js and what the cave already builds) holds the start; each stage
// chunk fills ST when it loads, so a stage is always in before build() or the life runs (the area loader awaits them together, in parallel). X0 only reserves the
// slots (each stage is empty but valid); the wing C milestones fill them. Each piece grows under its own budget (scripts/buildjson.mjs, CRYSTAL_STAGE_ENTRY_MODULES).
//   crystalwingc: the river, the falls, the boat, the mushroom grotto and the forge (C1 to C3)
//   crystalplay:  Lumi's cart on the old tracks and the singing chamber (C4, C5)
// The prompt sources read ST.wingc / ST.play; a slot with nothing in it answers null, so a later milestone never edits crystal.js.
export const ST = {};

export const CRYSTAL_STAGE_MODULES = Object.freeze(['src/world/crystalstagewingc.js', 'src/world/crystalstageplay.js']);

let loading = null;
/** Loads the two stages together; the same promise every time. */
export function loadCrystalStages() {
  loading ??= Promise.all([import('./crystalstagewingc.js'), import('./crystalstageplay.js')]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}
