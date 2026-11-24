// Everything couch play says, in one lazy file. The lines join the phrase table
// (src/clanphrases.js, addPhrases) when the chunk arrives, so none of it is in
// the start-up download; they go through phrase() like every other line, so a
// word set's own PHRASES still wins (the everyday set reads the same today).
// ⟦tokens⟧ are button pictures (src/tv/glyphs.js), never a button's name, so
// one line serves a PlayStation pad and an Xbox pad. No "Player 1/2": cats are
// called by their names. Both sets are checked by test/coopwords.test.js.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'coop.join': 'Press ⟦jump⟧ on a second controller to play together',
  'coop.joined': (name) => `${name} is here too!`,
  'coop.notready': 'Two cats do not play here yet',
  'coop.lost.title': (name) => `${name}'s controller went to sleep.`,
  'coop.lost.hint': 'Press any button on it to wake it up.',
  'coop.lost.wait': 'Wait for it',
  'coop.lost.without': 'Play without it',
  'coop.left': (name) => `${name} waves goodbye.`,
});

addPhrases(LINES);
