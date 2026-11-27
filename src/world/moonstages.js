// The Moon's lazy stages. The base chunk (moon.js and what the landing needs: ground, sky, base, Pip, Dot's guide, the plan) draws and
// runs everything through ST; each stage chunk fills ST when it loads. The area loader awaits stage A only (the landing); the other three
// are fetched at once in the background, nearest-needed first (moonlate.js startMoonStages: rover, hill, launch), and each is added to the walk
// as it arrives (moonlife.js applies it: the stage's drawing fades in, its lives wake, its closed-off region opens). Same code, same order,
// same results as when it was one chunk when all three are in before build() (tests, loadMoonStages): only the download is cut in four.
//   hill:   Star Hill (the observatory wing, the star-watching life, the scope, the figures)
//   launch: the Launch Complex, the Bounce Park (Beam Hops, hop board) and the bound's rifts and ring gates
//   rover:  the Rover course, the Lava Tube (massif, cave, fill), the job board and the base's decor
export const ST = {};

export const STAGE_ORDER = ['rover', 'hill', 'launch']; // nearest-needed first: the second power cell and Dot, then the telescope, then the rocket
const SENTINEL = { hill: 'drawWing', launch: 'drawLaunchStanding', rover: 'drawRoverCourse' }; // what each stage puts in ST

/** Test hook: ids held "not yet arrived" even though their code is in ST (the tests load all three). arrive(id) lets one in. */
export const HELD = new Set();
const listeners = new Set();
/** A stage came in (ok) or gave up (not ok, after one retry): say so to every walk waiting for it. */
export const stageEvent = (id, ok) => listeners.forEach((f) => f(id, ok));

/** Is the stage's code in (and not held back by a test)? */
export const stageReady = (id) => !HELD.has(id) && !!ST[SENTINEL[id]];
/** Calls fn(id, ok) when a stage arrives (ok) or gives up (not ok); returns the way to stop. */
export function onStage(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let loading = null;
/** Loads the three stages together (tests, and anything that needs the whole Moon at once); the same promise every time. */
export function loadMoonStages() {
  loading ??= Promise.all([import('./moonstagehill.js'), import('./moonstagelaunch.js'), import('./moonstagerover.js')]).then(() => ST);
  return loading;
}

/** The walk's side of the loading: what build() drew (drawn), the stages that arrived and wait to be applied (pending), env for moonlate.js's drawing (set by build) and the way to stop listening. */
export function createStageControl() {
  const ctl = { drawn: {}, pending: [] };
  ctl.stop = onStage((id, ok) => { if (ok && !ctl.drawn[id]) ctl.pending.push(id); });
  return ctl;
}
