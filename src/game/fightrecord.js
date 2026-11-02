// Fight moves and scars: the fight's record. The clan fight (game/clanfight.js)
// is never handed progression; it reports the end of a fight through onWon /
// onLost, and this module turns those into exactly the allowed save writes:
// a win counts (fightsWon), teaches the moves that count earns (one toast
// each, R5) and scars the intruder she beat; a loss scars her own cat. Hagrid's
// fights come with site null (R6): counted, nobody scarred. Nothing else.
import { unlockToast } from '../fightmoves.js';
import { isCastId } from '../scars.js';

export function createFightRecord({
  progression, hud, scarKey = null,
  setMyScars = () => {}, setIntruderScars = () => {}, onScarsChanged = () => {},
}) {
  return {
    onWon({ visit, castId, site } = {}) {
      for (const id of progression.recordFightWon()) hud.toast(unlockToast(id));
      if (site && isCastId(castId) && progression.scarIntruder(castId, site)) {
        setIntruderScars(visit, progression.intruderScars(castId));
      }
    },
    onLost({ site } = {}) {
      if (!site || !scarKey) return;
      if (!progression.scarCat(scarKey, site)) return;
      setMyScars(progression.catScars(scarKey));
      onScarsChanged();
    },
  };
}
