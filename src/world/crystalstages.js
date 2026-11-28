// The Crystal Cave's lazy stages (the Reef's way, src/world/reefstages.js). The base chunk (crystal.js and what the cave already builds) holds the start; each stage
// chunk fills ST when it loads, so a stage is always in before build() or the life runs (the area loader awaits them together, in parallel). X0 only reserves the
// slots (each stage is empty but valid); the wing C milestones fill them. Each piece grows under its own budget (scripts/buildjson.mjs, CRYSTAL_STAGE_ENTRY_MODULES).
//   crystalwingc: the river, the falls, the boat, the mushroom grotto and the forge (C1 to C3)
//   crystalplay:  Lumi's cart on the old tracks and the singing chamber (C4, C5)
//   crystalstory: the cave's life side moved out of the landing chunk (2026-11, same behaviour): beauty round 3's alive creatures, layer 4's cave life and C7's errand (ST.story)
//   crystaldeep:  the second story, the Echo Deep behind the singing wall (C0 reserves the slot; empty until its milestones fill it)
// The prompt sources read ST.wingc / ST.play / ST.deep; a slot with nothing in it answers null, so a later milestone never edits crystal.js.
export const ST = {};

export const CRYSTAL_STAGE_MODULES = Object.freeze(['src/world/crystalstagewingc.js', 'src/world/crystalstageplay.js', 'src/world/crystalstagedeep.js', 'src/world/crystalstagestory.js']);

let loading = null;
/** Loads the four stages together; the same promise every time. */
export function loadCrystalStages() {
  loading ??= Promise.all([import('./crystalstagewingc.js'), import('./crystalstageplay.js'), import('./crystalstagedeep.js'), loadCrystalStoryStage()]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}

/** The story stage alone (vitest loads it with crystal.js; the loader above loads it with the rest); the same chunk either way. */
export const loadCrystalStoryStage = () => import('./crystalstagestory.js');
