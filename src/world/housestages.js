// The Old House's lazy stage (Jungle's way, src/world/junglestages.js). The landing chunk (house.js and the old house) holds the start; the one stage chunk
// (housestagewing.js) fills ST.wing when it loads, so the wing is always in before build() or the life runs (the area loader awaits them together, in parallel).
//   wing: the east wing's drawing (housewingparts.js: its furniture builders and the sun patch; housewingfar.js: the far look of its zones) and its discoveries' life (housewingfinds.js),
//         with the secret wonder room's later pieces (Milestone 3). There is no stage c: a slot nobody has filled answers null, so the readers use `ST.wing?.`.
// The stage grows under its own budget (scripts/buildjson.mjs, STAGED_AREAS).
export const ST = {};

export const HOUSE_STAGE_MODULES = Object.freeze(['src/world/housestagewing.js']);

let loading = null;
/** Loads the stage; the same promise every time (a failed download is tried again on the next ask). */
export function loadHouseStages() {
  loading ??= Promise.all([import('./housestagewing.js')]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}
