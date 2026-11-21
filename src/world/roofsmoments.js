// =============================================================================
// THE ROOFTOPS' MOMENTS (Rooftops step 5). Made by the area life
// (src/roofslife.js) where the place has its discoveries (area.anchors
// .discoveries), updated every frame after the flock, disposed with the life.
// Chunk code: start-up never imports it.
//
// FINDING (Task 4, R3). Every frame it reads her paws (catPos), her session's
// perch (session.perched) and how long she has stood still, and asks
// roofsfinds.js findAt which of the six she is at. A find not yet seen this
// walk is noted on her save (noteRoofsFind: the first time ever pays
// AWARDS.roofsfind and says its line; every walk counts once on its page, by
// the discovery log's key, so a walk picked up again counts nothing twice),
// then its moment starts (start(id): Tasks 5-6 fill it).
//   * Without a log or a progression (the picture pages) nothing is noted;
//     the moments still play.
//   * In a room each device runs its own walk, so each player is noted on her
//     own save, once.
//
// STILL. She is still while her paws stay within STILL_EPS of where she came
// to rest; a step further starts the count again from there. Measured from
// that spot rather than frame to frame, so a slow stalk never counts as still
// whatever the frame rate. A nap is still. Walk seconds only: no clock, no
// random stream.
// =============================================================================
import { findAt, noteRoofsFind } from './roofsfinds.js';

export const STILL_EPS = 0.05; // m

// createRoofsMoments(area, { log, progression, hud, birds, scene,
// reducedMotion, doc }) → { update(dt, catPos, camera, session), dispose() }.
// Finding reads only the log and the progression; the rest are the moments'
// (Tasks 5-6).
export function createRoofsMoments(area, opts = {}) {
  const { log = null, progression = null } = opts;
  const anchors = area?.anchors?.discoveries ?? null;
  const found = new Set(); // this walk's
  const spot = { x: 0, y: 0, z: 0, perched: null, still: 0 };
  const rest = { x: 0, y: 0, z: 0, set: false };

  // A find's moment, the first time it is found this walk (Tasks 5-6).
  function start(_id) {}

  function stillness(dt, p) {
    if (!rest.set || Math.hypot(p.x - rest.x, p.y - rest.y, p.z - rest.z) >= STILL_EPS) {
      rest.x = p.x;
      rest.y = p.y;
      rest.z = p.z;
      rest.set = true;
      spot.still = 0;
    } else {
      spot.still += dt;
    }
  }

  return {
    update(dt, catPos = null, _camera = null, session = null) {
      if (!catPos) return;
      stillness(dt, catPos);
      spot.x = catPos.x;
      spot.y = catPos.y;
      spot.z = catPos.z;
      spot.perched = session?.perched ?? null;
      const id = findAt(anchors, spot);
      if (!id || found.has(id)) return;
      found.add(id);
      if (log && progression) noteRoofsFind(id, { log, progression });
      start(id);
    },
    dispose() {
      found.clear();
    },
  };
}
