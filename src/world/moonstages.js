// The Moon's lazy stages. The base chunk (moon.js and what the landing needs: ground, sky, base, Pip, Dot's guide, the plan) draws and
// runs everything through ST; each stage chunk fills ST when it loads, so a stage is always in before build() or the life runs (the
// area loader awaits all three together, in parallel). Same code, same order, same results as when it was one chunk: only the
// download is cut in three, so each piece can grow under its own budget (scripts/buildjson.mjs, MOON_STAGE_MODULES).
//   hill:   Star Hill (the observatory wing, the star-watching life, the scope, the figures)
//   launch: the Launch Complex, the Bounce Park (Beam Hops, hop board) and the bound's rifts and ring gates
//   rover:  the Rover course, the Lava Tube (massif, cave, fill) and the job board
export const ST = {};

export const MOON_STAGE_MODULES = Object.freeze(['src/world/moonstagehill.js', 'src/world/moonstagelaunch.js', 'src/world/moonstagerover.js']);

let loading = null;
/** Loads the three stages together; the same promise every time. */
export function loadMoonStages() {
  loading ??= Promise.all([import('./moonstagehill.js'), import('./moonstagelaunch.js'), import('./moonstagerover.js')]).then(() => ST);
  return loading;
}
