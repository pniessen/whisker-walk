// The lines for a cat's role, in the everyday words (milestone 1 of "choose your
// cat's role"). What the other cats say to her (three lines each, by role) and
// the one-line flavour of her small role goal. The warrior has neither: she
// hears the lines the game already has.
//
// Ids come from catrole.js (sayId, goalId); this file only holds the text and
// is a lazy module: whatever shows these lines (the role card, the clan-life
// talk; milestone 2 and later) imports it, so none of it is in the start-up
// download. The family's set overrides the lines that need its own words in
// its PHRASES (sealed: seriesvault.js), so no series word is typed here, and
// the lines say "plants", "home base" and "the little ones".
//
// Kind by design: no line scolds a small cat, shames a young one, or mentions
// illness, injury or loss. A scrape is as bad as it gets.
// phrase() under another name: the ids here are built from catrole.js's id functions, so the scan
// that wants a literal id at every phrase( call (test/clanphrases.test.js) does not apply; catrole.test.js checks every id.
import { addPhrases, phrase as lineFor } from './clanphrases.js';
import { RANK_KEYS } from './wordids.js';
import { sayId, goalId, SAY_COUNT, SAY_ROLES } from './catrole.js';

const SAY = {
  [RANK_KEYS.kit]: ['Stay close to home base, little one.', 'Careful on the rocks, little one!', 'You are growing fast. We are proud of you.'],
  [RANK_KEYS.apprentice]: ['Learn the bounds well. You are doing great!', 'Ask me anything. Good learners ask a lot.', 'Watch the wind and the ground, and see what the others do.'],
  [RANK_KEYS.elder]: ['Would you tell us a story, wise one?', 'We are lucky to have your wisdom.', 'Come and sit with us. Tell us what you remember.'],
  [RANK_KEYS.queen]: ['How are the little ones today?', 'The little ones are lucky to have you.', 'Is there room in the warm spot for one more?'],
  [RANK_KEYS.medicine]: ['My paw is sore. Could you look at it?', 'Thank you for the plants. They helped so much!', 'You always know just what to do for a scrape.'],
  [RANK_KEYS.deputy]: ['All is quiet on the border. Anything to add?', 'The walk round the border went well. What next?', 'Tell us where you need us today.'],
  [RANK_KEYS.leader]: ['Welcome back. We are glad to see you.', 'Everyone is ready for you to speak.', 'You lead us well, and we are grateful.'],
};

const GOAL = {
  [RANK_KEYS.kit]: 'Find three feathers',
  [RANK_KEYS.apprentice]: 'Walk the bounds with a friend',
  [RANK_KEYS.elder]: 'Tell a story',
  [RANK_KEYS.queen]: 'Tuck in the little ones',
  [RANK_KEYS.medicine]: 'Find three plants',
  [RANK_KEYS.deputy]: 'Check the borders',
  [RANK_KEYS.leader]: 'Call everyone together',
};

export const ROLE_LINES = Object.freeze({
  ...Object.fromEntries(SAY_ROLES.flatMap((r) => SAY[r].map((text, i) => [sayId(r, i), text]))),
  ...Object.fromEntries(SAY_ROLES.map((r) => [goalId(r), GOAL[r]])),
});
addPhrases(ROLE_LINES);

// One line a cat says to her, chosen by `pick` (any whole number: the caller's own seeded draw). Null for the
// warrior (and any id that is not a role): she hears today's lines.
export function roleSay(role, pick) {
  if (!SAY_ROLES.includes(role)) return null;
  const n = Number.isInteger(pick) && pick >= 0 ? pick % SAY_COUNT : 0;
  return lineFor(sayId(role, n));
}

// The flavour line of a role's small goal; null for the warrior.
export function roleGoalLine(role) {
  return SAY_ROLES.includes(role) ? lineFor(goalId(role)) : null;
}
