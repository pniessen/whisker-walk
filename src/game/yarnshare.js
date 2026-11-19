// One yarn ball between co-walkers (controls review, 2026-11-19), on the
// protocol the yarn rally already had: the state message's `toy: [x, z]` and
// the 'bat' / 'yarn-authority' events. Nothing new goes on the wire.
//
// Every device places its own copy of the ball at the same spot (the room's
// seed picks it). A ball still lying there is nobody's and is never sent. The
// first device to touch it (a bat or a pick-up: toy.js `claimed`) sends its
// position in every state message; the others then hide their resting copy
// and draw the ghost ball where she says it is. Batting the ghost asks the
// owner for it (avatar.js, netevents.js: the rally, unchanged). While the
// owner holds it in her mouth a bat at the ghost is ignored on her side: no
// snatching from a mouth.
//
// Two devices that touched it in the same second both think it is theirs.
// The lower player id keeps it; the other lets go of its copy without a word.
// A device whose owner went quiet for a second (left, or the line dropped)
// gets the ball back at the ghost's last place, nobody's again, and the first
// touch decides as before.
//
// Pure apart from the toy and the mouth it is handed: no THREE, no DOM.

// A co-walker's toy report is fresh this long (main.js's ghost rule always
// used the same second).
export const TOY_FRESH_S = 1;
// After a rally handoff, the old owner's last state may still be on its way:
// for this long it cannot win a tie it never entered.
export const HANDOFF_GRACE_S = 0.6;
// With no ball anywhere for this long (every co-walker says null and this
// device has none), it comes back to its spot.
export const ALONE_HOME_S = 3;

// Let go of the ball without a word: out of the mouth, off the screen.
export function letGoOfYarn(s) {
  if (s.carry?.mouth?.held?.toy) {
    s.carry.mouth.held = null;
    s.carry.mouth.grip = 0;
  }
  s.toy.retrieve();
}

// shareYarn(s, now, dt) -> true when the ghost ball should be drawn. Once a
// frame in a walk together; a walk alone never calls it.
export function shareYarn(s, now, dt = 0) {
  const toy = s.toy;
  const r = s.remoteToy;
  if (r && now - r.at < TOY_FRESH_S) {
    s.yarnAlone = 0;
    if (toy.active && !toy.claimed) {
      // she touched it first: my resting copy goes
      toy.retrieve();
    } else if (toy.active && toy.claimed && r.ownerId !== s.playerId && String(r.ownerId) < String(s.playerId)
        && !(now < (s.yarnGrace ?? 0))) {
      // we both did, in the same moment: the lower id keeps it
      letGoOfYarn(s);
    }
    return !toy.active;
  }
  if (r) {
    // the owner went quiet: the ball stays where she last had it, nobody's
    s.remoteToy = null;
    if (!toy.active) toy.placeAt({ x: r.pos[0], z: r.pos[1] });
    return false;
  }
  if (!toy.active && toy.spot) {
    s.yarnAlone = (s.yarnAlone ?? 0) + dt;
    if (s.yarnAlone >= ALONE_HOME_S) {
      s.yarnAlone = 0;
      toy.placeAt(toy.spot);
    }
  } else {
    s.yarnAlone = 0;
  }
  return false;
}

// The state message's toy: this device's ball once it has touched it (in the
// mouth too: the mouth is where it is), else null.
export function toyForState(toy) {
  return toy.active && toy.claimed ? [toy.mesh.position.x, toy.mesh.position.z] : null;
}
