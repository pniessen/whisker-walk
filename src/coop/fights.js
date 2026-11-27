// Fights with two cats (couch play, milestone 4). The walk's fight (game/clanfight.js,
// border patrol and away challengers included) is one object holding one cat: the
// session's. This file lets a second cat be that one without the fight knowing:
//
//   * ONE FIGHT AT A TIME: there is one fight object, so there is one pill and one sheet;
//     the challenger is whichever cat the challenge came to first (cat one if both), and
//     it keeps the fight until the pill and the sheet are gone and a short quiet has passed.
//   * THE CHALLENGER'S PAD DRIVES: the pad that is read for menus is the challenger's while
//     the fight sheet is up; the other pad is ignored by it. The pill (Fight! / Back off)
//     answers to the challenger's Square and Circle only.
//   * THE OTHER CAT SITS AND CHEERS: it is held still (index.js) and sits.
//   * THE RECORD IS THE CHALLENGER'S: a scar from a lost fight is written under that cat's
//     key (cat two is a cat of the same save), and shown on that cat. A win counts for the
//     household, as ever. Nothing else is written.
//
// Cat two as the challenger: the fight is handed a stage, the session with cat two's drawn
// cat as `cat`, for that fight only; its writes (spot, pose) come back out through
// stage.* and index.js carries them onto cat two's body and picture.
import { setCatScars } from '../cat/scarmesh.js';

export const QUIET_S = 1.5; // seconds with nothing to challenge before the challenger may change

/**
 * Who is the challenger now. prev: 0 or 1. busy: a pill or a fight is on (the challenger
 * stays). oneCan / twoCan: that cat could be challenged this frame. quiet: seconds since
 * there was anything for cat two to be challenged by.
 */
export function pickFighter(prev, { busy = false, oneCan = false, twoCan = false, quiet = 0 } = {}) {
  if (busy) return prev;
  if (oneCan) return 0;
  if (twoCan) return 1;
  return prev === 1 && quiet < QUIET_S ? 1 : 0;
}

/** The pad the walk's own code should read for menus and the pill while a fight is up (a copy, never the browser's snapshot). */
export function padForPill(pad, mine) {
  if (!pad || mine) return pad;
  return { ...pad, buttons: (pad.buttons ?? []).map((b, i) => (i === 1 || i === 2 ? false : b)) }; // Circle and Square belong to the challenger
}

/**
 * ctx: { progression }. Wired by index.js per walk: attach(session, { drawn, key, joined }) wraps the
 * session's fight, detach() puts it back. `state` is what a test or the pane reads.
 */
export function createFights({ ctx }) {
  const state = { fighter: 0, showing: null };
  let cf = null, orig = null, stage = null, quiet = 0, ownCan = null;
  let getKey = () => null, getDrawn = () => null, isOn = () => false;
  let origScar = null, wrapScar = null;

  function installScar() {
    const p = ctx.progression;
    if (!p || typeof p.scarCat !== 'function' || wrapScar) return;
    origScar = p.scarCat;
    // The fight record (game/fightrecord.js) files a lost fight's scar under cat one's key; for cat two's fight it is cat two's.
    wrapScar = (key, site) => {
      const k = state.fighter === 1 ? getKey() : null;
      if (!k) return origScar.call(p, key, site);
      const ok = origScar.call(p, k, site);
      const g = getDrawn();
      if (ok && g) { try { setCatScars(g, p.catScars(k)); } catch { /* the picture is a nicety */ } }
      return ok;
    };
    p.scarCat = wrapScar;
  }
  function removeScar() {
    const p = ctx.progression;
    if (p && wrapScar && p.scarCat === wrapScar) p.scarCat = origScar;
    wrapScar = null; origScar = null;
  }

  const spot = { x: 0, z: 0, yaw: 0 };
  return {
    state,
    get fighter() { return state.fighter; },
    get stage() { return stage; },
    /** 'challenge' | 'fight' | null: what the walk's fight shows now. */
    get showing() { return cf?.uiShowing ?? null; },
    get on() { return (cf?.uiShowing ?? null) === 'fight'; },
    /** Cat two is the one in the fight (so its spot, pose and lift come from the stage). */
    get twoFights() { return state.fighter === 1 && (cf?.uiShowing ?? null) === 'fight'; },
    /** Where the fight last put cat two (written each frame it runs; coop.late puts the picture back there after the remote draw). */
    spot,
    attach(s, { drawn, key, joined }) {
      this.detach();
      const f = s?.clanFight;
      if (!f || Object.isFrozen(f) || typeof f.update !== 'function') return false;
      cf = f; orig = f.update; getDrawn = drawn; getKey = key; isOn = joined;
      stage = Object.create(s, { cat: { get: () => getDrawn() } });
      quiet = 0; state.fighter = 0; ownCan = null;
      f.update = function update(dt, sess) {
        if (sess !== s || !isOn() || !getDrawn()) { state.fighter = 0; return orig.call(f, dt, sess); }
        const busy = f.uiShowing !== null || (f.engagedVisit ?? null) !== null;
        let oneCan = false, twoCan = false;
        if (!busy) {
          oneCan = !!f.wouldChallenge?.(sess);
          twoCan = !oneCan && !!f.wouldChallenge?.(stage);
          quiet = twoCan ? 0 : quiet + dt;
        }
        state.fighter = pickFighter(state.fighter, { busy, oneCan, twoCan, quiet });
        state.showing = f.uiShowing;
        const r = orig.call(f, dt, state.fighter === 1 ? stage : sess);
        const g = state.fighter === 1 && f.uiShowing === 'fight' ? getDrawn() : null;
        if (g) { spot.x = g.position.x; spot.z = g.position.z; spot.yaw = g.rotation.y; } // where the fight put cat two: the remote draw would lerp it away before coop.late
        state.showing = f.uiShowing;
        return r;
      };
      installScar();
      return true;
    },
    detach() {
      if (cf && orig) cf.update = orig;
      cf = null; orig = null; stage = null; ownCan = null;
      state.fighter = 0; state.showing = null;
      removeScar();
    },
    /** Pad two pressed Square (interact) or Circle (meow) while the pill is cat two's: it answers the pill. True when consumed. */
    answer(name) {
      if (!cf || state.fighter !== 1 || cf.uiShowing !== 'challenge') return false;
      if (name !== 'interact' && name !== 'meow') return false; // ui/fightui.js answerChallenge, the walk's own rule: Square is Fight!, Circle is Back off
      cf.key(name === 'interact' ? 'e' : 'q');
      return true;
    },
    /** The walk's pad for this frame: the challenger's own while its sheet is up; cat one's with the pill's buttons taken away while the pill is cat two's. */
    padFor(p0, p1, current) {
      if (!cf) return current;
      if (cf.uiShowing === 'fight' && state.fighter === 1 && p1) return p1;
      if (cf.uiShowing === 'challenge' && state.fighter === 1) return padForPill(current, false);
      return current;
    },
  };
}
