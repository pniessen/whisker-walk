// The Fairground's three games, their journal pages and what the first win at
// each gives to wear (docs/superpowers/specs/2026-11-18-fairground-design.md,
// "Midway games" and "Prizes"). Plain data with no imports, so the save
// (src/progression.js), the games (src/fairgames.js) and the dress-up can all
// read it.
//
// A prize is a CATALOG accessory flagged `prize` (never bought, never traded,
// never in a code) and `fair` (the game it is won at). The save keeps no list
// of them: a game's journal page counts its wins, and every game won at least
// once has its prize owned, rebuilt on every load, as the visit prizes are.
export const FAIR_GAME_IDS = Object.freeze(['cans', 'ducks', 'bell']);
export const FAIR_FIND_IDS = Object.freeze(['fortune', 'musicbox', 'candyfloss', 'juggler', 'balloon', 'lookout']);
export const gameJournalId = (id) => `game${id}`;
export const fairFindJournalId = (id) => `fair${id}`;
export const FAIR_JOURNAL_TYPES = Object.freeze([...FAIR_GAME_IDS.map(gameJournalId), ...FAIR_FIND_IDS.map(fairFindJournalId)]);

// game → the accessory its first win gives
export const FAIR_PRIZES = Object.freeze({ cans: 'papercrown', ducks: 'prizerosette', bell: 'tailballoon' });
export const FAIR_PRIZE_IDS = Object.freeze(Object.values(FAIR_PRIZES));

// The prizes a journal has won: every game whose page has a count.
export function fairPrizesWonBy(journal) {
  const out = [];
  for (const game of FAIR_GAME_IDS) {
    const n = journal?.[gameJournalId(game)];
    if (Number.isFinite(n) && n > 0) out.push(FAIR_PRIZES[game]);
  }
  return out;
}
