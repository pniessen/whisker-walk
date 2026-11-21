// The lines of the Market Square: its treats and what is said about them.
//
// Every line is in the phrase table (src/clanphrases.js, the later table), the
// same in every set of words. This file gives each its place; the table's test
// wants every phrase() call to name its id in full, so the ids are spelled out
// here, once, and the game asks by treat kind.
import { phrase } from './clanphrases.js';

// A treat's `name` ("a fish head", for a line to say) and the `prompt` shown
// beside it, by treat kind.
export const TREAT_WORDS = Object.freeze({
  fishhead: Object.freeze({ get name() { return phrase('market.treat.fishhead'); }, get prompt() { return phrase('market.grab.fishhead'); } }),
  sausageroll: Object.freeze({ get name() { return phrase('market.treat.sausageroll'); }, get prompt() { return phrase('market.grab.sausageroll'); } }),
  cheddar: Object.freeze({ get name() { return phrase('market.treat.cheddar'); }, get prompt() { return phrase('market.grab.cheddar'); } }),
  cream: Object.freeze({ get name() { return phrase('market.treat.cream'); }, get prompt() { return phrase('market.grab.cream'); } }),
  crumbs: Object.freeze({ get name() { return phrase('market.treat.crumbs'); }, get prompt() { return phrase('market.grab.crumbs'); } }),
});

// The market's one-time and award lines.
export const MARKET_LINES = Object.freeze({
  eatFirst: (treat) => phrase('market.eat.first', treat), // the award's line
  eatAgain: (treat) => phrase('market.eat.again', treat),
  shoo: () => phrase('market.shoo'),
  laugh: () => phrase('market.laugh'),
  coo: () => phrase('market.coo'),
  teamEater: (partner) => phrase('market.team.eater', partner),
  teamDistracter: (partner) => phrase('market.team.distracter', partner), // the award's line
  summaryTreats: () => phrase('market.summary.treats'),
});
