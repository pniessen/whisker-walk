// Snowville's lazy stages (the Crystal Cave's way, src/world/crystalstages.js). The base chunk (snowville.js: the square and the spawn court) holds the start; each stage chunk
// fills ST when it loads, so a stage is always in before build() or the life runs (the area loader awaits them together, in parallel). V1 only reserves the slots (each
// stage is empty but valid); the later milestones fill them. Each piece grows under its own budget (scripts/buildjson.mjs, SNOWVILLE_STAGE_ENTRY_MODULES).
//   snowvilleb: the pond, the sled hill and Lantern Night (V5)
//   snowvillestory: the village's life side moved out of the landing chunk (2026-11, same behaviour): beauty passes 4 to 8 (wonder, living, weather, vista, reactions, the alive creatures) and the sound beds (ST.story)
//   snowvillec: the sled run (a later milestone; V7 has no ride, so it stays empty. Tilly's errand of the day is stage b's)
// A slot with nothing in it answers null, so a later milestone never edits snowville.js.
export const ST = {};

export const SNOWVILLE_STAGE_MODULES = Object.freeze(['src/world/snowvillestageb.js', 'src/world/snowvillestagec.js', 'src/world/snowvillestagestory.js']);

let loading = null;
/** Loads the three stages together; the same promise every time. */
export function loadSnowvilleStages() {
  loading ??= Promise.all([import('./snowvillestageb.js'), import('./snowvillestagec.js'), loadSnowvilleStoryStage()]).then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}

/** The story stage alone (vitest loads it with snowvillelight.js; the loader above loads it with the rest); the same chunk either way. */
export const loadSnowvilleStoryStage = () => import('./snowvillestagestory.js');
