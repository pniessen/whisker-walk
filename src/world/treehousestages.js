// The Treehouse village's lazy stages (the Crystal Cave's way, src/world/crystalstages.js). The base chunk (treehouse.js and what the village already builds) holds the
// start; each stage chunk fills ST when it loads, so a stage is always in before build() or the life runs (the area loader awaits them together, in parallel). T1 only
// reserves the slots (each stage is empty but valid); the later milestones fill them. Each piece grows under its own budget (scripts/buildjson.mjs, TREEHOUSE_STAGE_ENTRY_MODULES).
//   treehousebranches: the rope bridge to the Bookshop, the Bell Tower and the firefly supper (T5)
//   treehouselift:     the basket lift, an optional extra (not built in T7: Nutmeg's post round is the branches stage's, so this slot stays empty)
// The prompt sources read ST.branches / ST.lift; a slot with nothing in it answers null, so a later milestone never edits treehouse.js.
export const ST = {};

export const TREEHOUSE_STAGE_MODULES = Object.freeze(['src/world/treehousestagebranches.js', 'src/world/treehousestagelift.js']);

let loading = null;
/** Loads the two stages together; the same promise every time. */
export function loadTreehouseStages() {
  loading ??= Promise.all([import('./treehousestagebranches.js'), import('./treehousestagelift.js')]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}
