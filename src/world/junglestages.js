// The Jungle lodge's lazy stages (Snowville's way, src/world/snowvillestages.js). The base chunk (jungle.js: the lodge, the ring and the green ground) holds the start; each stage chunk
// fills ST when it loads, so a stage is always in before build() or the life runs (the area loader awaits them together, in parallel). J1 only reserves the slots (each
// stage is empty but valid); the later milestones fill them. Each piece grows under its own budget (scripts/buildjson.mjs, JUNGLE_STAGE_ENTRY_MODULES).
//   jungleb: the river's far bank, the canopy walk and the Rain Supper (J5)
//   junglec: the raft (not built in J7: Mossy's errand is stage b's, so this slot stays empty)
// A slot with nothing in it answers null, so a later milestone never edits jungle.js.
export const ST = {};

export const JUNGLE_STAGE_MODULES = Object.freeze(['src/world/junglestageb.js', 'src/world/junglestagec.js']);

let loading = null;
/** Loads the two stages together; the same promise every time. */
export function loadJungleStages() {
  loading ??= Promise.all([import('./junglestageb.js'), import('./junglestagec.js')]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}
