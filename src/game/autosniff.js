// The stand-still sniff (guided-first-walk design, section 5; the owner's
// answer 3). The cat sniffs by itself when it has stood still for two seconds
// within sniffing range of a buried treasure, at most once every twenty
// seconds: it lowers its nose and the paw prints appear. A touch player has
// no E key and so no other way to sniff; E still works on a keyboard.
//
// It throws no dice: the trail's wobble is a fixed pattern (scent.js
// standSniff), so standing still never moves a draw of the walk's stream.
// Nothing goes on the wire: the trail is this player's own, as E's is.

import { PERSONALITIES } from '../cat/brain.js';
import { bus } from '../events.js';

export const AUTO_SNIFF_STILL_S = 2;
export const AUTO_SNIFF_EVERY_S = 20;

// How far the nose reaches: the same as an E sniff (main.js).
export function sniffRange(breed) {
  return PERSONALITIES[breed]?.special === 'keenNose' ? 30 : 18;
}

// Once a frame while the walk is played. Returns the treasure sniffed out, or
// null. Not while the cat is busy: a button is up (she is next to something),
// on a perch, in a photo, a fight, a rest, a chase or a fright.
export function tickAutoSniff(session, dt) {
  session.walkTime = (session.walkTime ?? 0) + dt;
  if (!session.scent?.standSniff) return null;
  if ((session.idleTime ?? 0) < AUTO_SNIFF_STILL_S) return null;
  if (session.walkTime - (session.autoSniffAt ?? -Infinity) < AUTO_SNIFF_EVERY_S) return null;
  if (session.prompt || session.perched || session.cameraMode || session.fight || session.rest
    || session.chasing || session.freezeTime > 0) return null;
  const found = session.scent.standSniff(session.cat.position, sniffRange(session.cat.userData?.breed));
  if (!found) return null;
  session.autoSniffAt = session.walkTime;
  session.sniffTime = 1; // the nose goes down (avatar.js plays the pose)
  bus.emit('tip', { id: 'sniff' });
  return found;
}
