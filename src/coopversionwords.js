// The two lines of the co-walk version check (lobby.js partnerOlder / unknownPlaceFrom, shown by rooms.js).
// They live here, not in clanphrases.js, so a few bytes do not land in the table that the lazy places share.
// Plain words, the same in both word sets (Clan and everyday); a set's own PHRASES would still win.
import { addPhrases } from './clanphrases.js';

export const COOP_VERSION_LINES = Object.freeze({
  'coop.partnerOlder': 'Your friend needs to update the game: close it and open it again.',
  'coop.partnerNoPlace': 'Your friend\'s game does not know that place yet. They can close it and open it again.',
});

addPhrases(COOP_VERSION_LINES);
