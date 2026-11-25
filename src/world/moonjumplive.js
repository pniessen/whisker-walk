// =============================================================================
// THE MOON'S JUMPING ON A WALK (milestone 7a, the safe half). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every frame.
//   * THE COURSE LAMPS: a ring round the top of every perch of the three ring-free courses (Skip Ridge, Earthrise Rock, the Beam Hops), dim until she has stood
//     on it this walk and warm after. When all eight Beam Hops are lit they turn gold, a chime plays and "Every beam is lit!" shows once. Nothing is saved.
//   * THE HOP BOARD: a start line and a lane of level dust east of the line (world/moonjump.js has the rules); a hop from behind the line that lands in the lane is
//     measured, in centimetres, from the line to the paws. The board's screen shows the hop and her best; a better hop of this cat is saved (state.moon.jump[catId],
//     whole centimetres, at most 2000, six cats at most: the save's own limits), chimes, and says "New record!". The journal's "Long Jump" page counts one a walk.
// A hop that does not count (off the lane, from a perch, onto a slope) is simply not measured. No fail state, nothing timed, no text but numbers on the screen.
// The only reads are the walk's own session (pounceTime, perched) and her position; no clock of its own, no random number. Where there is no document the screen is blank.
// =============================================================================

import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as J from './moonjump.js';
import { makeLamps, makeScreen, JUMP_COL } from './moonjumpparts.js';
import { createMoonSound } from './moonsound.js';

export const LAMPS_NEAR = 60; // m from the courses' middle: farther than this the lamps' one draw call is skipped
export const RIDGE_HINT_NEAR = 8; // m from Skip Ridge's first pillar: the paw-button line shows once a walk
export const BEAMS_NEAR = 40; // m from the Beam Hops' middle (they lie in the east, 50 m from the other courses)
export const HINT_NEAR = 7; // m from the start line: the board's hint shows once a walk
const COURSES = Object.freeze({ x: 0, z: -36 });
const FIRST_BEAM = P.SKIP.length + P.ROCK_LEDGES.length; // index of the first Beam Hop among the lamps
const SAY = { 'moon.jump.hint': () => phrase('moon.jump.hint'), 'moon.jump.record': () => phrase('moon.jump.record'), 'moon.jump.beams': () => phrase('moon.jump.beams'), 'moon.ridge.paw': () => phrase('moon.ridge.paw') };
const say = (key) => bus.emit('discovery', { type: 'greenhousenote', key, label: SAY[key](), points: 0, repeat: false });

export function createJumpLive({ scene, reducedMotion = false, ground, audio = null, progression = null, doc = null, air = () => 0, onHop = null } = {}) {
  const gy = ground?.y ?? P.moonY;
  const sound = createMoonSound(audio);
  const lamps = makeLamps();
  const screen = makeScreen(doc ?? (typeof document === 'undefined' ? null : document));
  scene.add(lamps.mesh);
  scene.add(screen.sprite);
  const catId = J.jumpCatId(progression?.state);
  // her name tag on the board: only a cat she made (state.customCats); the game's own cats have no tag here (the catalog is start-up code the Moon's chunk keeps off)
  const name = (() => {
    const s = progression?.state;
    const raw = s?.customCats?.find?.((c) => c.id === s?.equipped?.custom)?.name ?? '';
    return typeof raw === 'string' ? raw.slice(0, 10) : '';
  })();
  const lit = new Set();
  let allLit = false;
  let airborne = false;
  let from = null; // where she took off (her position the frame before the pounce window opened)
  let fromGround = 0;
  let last = 0; // this walk's last measured hop, cm
  let recordShown = false;
  let usedJournal = false;
  let hinted = false;
  let ridgeHinted = false;
  let prev = null;

  const best = () => J.bestOf(progression?.state?.moon, catId);
  const paintScreen = () => screen.draw({ last, best: best(), record: recordShown, name });
  paintScreen();

  function light(i) {
    if (i < 0 || lit.has(i)) return false;
    lit.add(i);
    lamps.paint(i, i < P.SKIP.length ? JUMP_COL.litSkip : i < FIRST_BEAM ? JUMP_COL.lit : JUMP_COL.litBeam); // (Ridge clarity) teal on Skip Ridge, amber on the Beam Hops
    sound.click();
    return true;
  }
  function checkBeams() {
    if (allLit) return;
    for (let i = FIRST_BEAM; i < P.COURSE_LAMPS.length; i++) if (!lit.has(i)) return;
    allLit = true;
    for (let i = FIRST_BEAM; i < P.COURSE_LAMPS.length; i++) lamps.paint(i, JUMP_COL.gold);
    sound.traced();
    say('moon.jump.beams');
  }

  // the journal's Long Jump page counts once a walk, for the board's first measured hop or (milestone 7b) the first lit ring
  function countJournal() {
    if (usedJournal) return;
    usedJournal = true;
    try { progression?.recordSighting?.('mnjump'); } catch { /* a stand-in save */ }
  }

  function land(pos, session) {
    const cm = J.measureHop(from, pos, { perched: false, groundFrom: fromGround, groundTo: gy(pos.x, pos.z) });
    if (cm === null || session?.perched || air() > 0.05) return; // (milestone 7b) a bound still in the air is not a landing
    last = cm;
    const before = best(); // (milestone 9) her best before this hop: Pip's "beat your bound" errand asks for a margin over it
    const r = J.improve(progression?.state?.moon, catId, cm);
    recordShown = r.record;
    if (r.kept && progression?.state) {
      progression.state.moon = r.moon;
      try { progression.addPoints?.(0); } catch { /* a stand-in save */ }
    }
    countJournal();
    paintScreen();
    try { onHop?.({ cm, before, record: r.record }); } catch { /* the errand's hook must never stop a hop */ }
    if (r.record) { sound.traced(); say('moon.jump.record'); } else sound.pin(Math.min(12, Math.floor(cm / 100)));
  }

  return {
    lit,
    screen,
    lamps,
    get last() { return last; },
    count: countJournal,
    update(dt, t, catPos, camera, session) {
      const left = session?.pounceTime ?? 0;
      if (!airborne && left > 0) {
        airborne = true;
        from = prev ? { x: prev.x, z: prev.z } : { x: catPos.x, z: catPos.z };
        fromGround = gy(from.x, from.z);
        if (session?.perched || !J.takeoffOk(from.x, from.z, false)) from = null; // not a counted take-off: the landing will not be measured
      } else if (airborne && left - dt <= 0) {
        airborne = false;
        if (from) land(catPos, session);
        from = null;
      }
      prev = { x: catPos.x, z: catPos.z };
      // the lamps
      const near = Math.hypot(catPos.x - COURSES.x, catPos.z - COURSES.z) <= LAMPS_NEAR || Math.hypot(catPos.x - P.BEAM_MID.x, catPos.z - P.BEAM_MID.z) <= BEAMS_NEAR; // (the Beam Hops lie in the east now)
      lamps.mesh.visible = near;
      if (session?.perched) { if (light(J.lampUnder(session.perched, P.COURSE_LAMPS))) checkBeams(); }
      // the board's screen: drawn only within reach of seeing it
      const B = P.JUMP_BOARD;
      screen.sprite.visible = Math.hypot(catPos.x - B.x, catPos.z - B.z) <= B.near;
      // (Ridge clarity) the first time she is near the foot of Skip Ridge's first pillar on the dust with the Ridge cell still to fetch: the paw button is the way up
      if (!ridgeHinted && !session?.perched && Math.hypot(catPos.x - P.SKIP[0].x, catPos.z - P.SKIP[0].z) <= RIDGE_HINT_NEAR) {
        const m = progression?.state?.moon;
        if ((m?.step ?? 0) >= 1 && !((m?.cells ?? 0) & 1)) { ridgeHinted = true; say('moon.ridge.paw'); }
      }
      if (!hinted && Math.hypot(catPos.x - P.JUMP_LANE.x0, catPos.z - P.JUMP_LANE.z) <= HINT_NEAR) { hinted = true; say('moon.jump.hint'); }
    },
    dispose() {
      scene.remove(lamps.mesh);
      scene.remove(screen.sprite);
      lamps.dispose();
      screen.dispose();
      sound.dispose();
    },
  };
}
