// The border patrol fight (2026-11-04, plan
// docs/superpowers/plans/2026-11-04-border-patrol-fight.md): in another clan's
// territory, its border patrol warrior (rivalcats.js, with a `foe`) squares up
// to a trespasser and offers Fight! or Run. This is the home fight
// (clanfight.js, createClanFight) over the patrol: the same rounds, rules,
// camera and sheet. Only its words and a few options differ, all set here:
//   - the pill shows where the patrol would have chased (inside its border,
//     within NOTICE_DIST), says "<Name> of <Clan> blocks your path!" and offers
//     Run for Back off;
//   - Run, a lost fight, or BORDER_CHALLENGE_WAIT seconds with no answer is
//     today's chase (patrol.chaseNow); a win makes it stand down for the walk
//     (the patrol's `flee`) and pays the `border` award once a walk;
//   - the wire events are patrol-fight / patrol-done (netevents.js).
// Like clanfight.js it is never handed progression: the fight's record
// (fightrecord.js, built in walk.js) arrives as onWon / onLost.
import { createClanFight } from './clanfight.js';
import { isTrespassing } from '../rivalclans.js';
import { NOTICE_DIST } from '../rivalcats.js';

export const BORDER_CHALLENGE_WAIT = 8; // s an unanswered pill waits before the chase (B4)
export const BORDER_ASK = Object.freeze({ ask: 'blocks your path!', off: 'Run' });
export const BORDER_EVENTS = Object.freeze({ fight: 'patrol-fight', done: 'patrol-done' });

export function borderWords(areaId) {
  return {
    award: (name) => ({ type: 'border', key: `border-${areaId}`, text: `You faced down ${name}! 🛡️` }),
    won: (name) => `${name} lets you pass. 🐾`,
    lost: (name, scarred) => (scarred
      ? `${name} won this time. That scratch will heal in a few walks!`
      : `${name} won this time. Try again soon!`),
  };
}

// `patrol` is session.rival (its `foe` and `chaseNow`); everything else is
// createClanFight's, as walk.js hands the home fight.
export function createBorderFight({ patrol, areaId, onLost = () => {}, ...rest }) {
  return createClanFight({
    ...rest,
    areaId,
    intruders: patrol.foe,
    clanHome: false,
    hostileTo: (cur, cat) => isTrespassing(areaId, cat.x, cat.z),
    challengeRange: NOTICE_DIST,
    challengeWait: BORDER_CHALLENGE_WAIT,
    onBackOff: () => patrol.chaseNow(),
    challengeWords: BORDER_ASK,
    words: borderWords(areaId),
    eventTypes: BORDER_EVENTS,
    // A loss is reported (her cat's fading scar), then today's chase.
    onLost: (r) => { onLost(r); patrol.chaseNow(); },
  });
}
