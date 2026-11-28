// The Lighthouse Point's one lazy stage (the Crystal Cave's way, src/world/crystalstages.js). The base chunk (lighthouse.js: the headland, the tower and their drawing, and the life's beam and finds) holds the
// start; the story stage chunk fills ST when it loads, so it is always in before the life runs (the area loader awaits it with the base chunk, in parallel). No change of behaviour: the code moved, nothing else did.
//   lighthousestory: the headland's life side: the sound (lighthousesound.js), the weather as events (pass 6), the vistas (pass 7), the alive creatures and wonders (lighthousealive.js), the find looks and the keeper's cats
export const ST = {};

export const LIGHTHOUSE_STAGE_MODULES = Object.freeze(['src/world/lighthousestagestory.js']);

let loading = null;
/** Loads the stage; the same promise every time. */
export function loadLighthouseStages() {
  loading ??= loadLighthouseStoryStage().then(() => ST).catch((e) => { loading = null; throw e; });
  return loading;
}

/** The story stage alone (vitest loads it with lighthouselife.js; the loader above loads it with the base chunk); the same chunk either way. */
export const loadLighthouseStoryStage = () => import('./lighthousestagestory.js');
