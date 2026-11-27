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
  'coop.ready.join': 'Two players? Press ⟦jump⟧ on the second controller to join.',
  'coop.ready.in': (a, b) => `${a} and ${b} are both in.`,
  'coop.ready.swap': 'Second player: press ⟦photo⟧ to swap cats.',
  'coop.leavehint': 'Hold ⟦select⟧ to take a break from the walk.',
  'coop.hints.one': (name) => `${name}: ⟦move⟧ walk · ⟦jump⟧ pounce · ⟦interact⟧ pick up · ⟦pause⟧ pause`,
  'coop.hints.two': (name) => `${name}: ⟦move⟧ walk · ⟦jump⟧ pounce · ⟦interact⟧ pick up · ⟦pause⟧ pause · hold ⟦select⟧ step out`,
  'coop.notready': 'Two cats do not play here yet',
  'coop.lost.title': (name) => `${name}'s controller went to sleep.`,
  'coop.lost.hint': 'Press any button on it to wake it up.',
  'coop.lost.wait': 'Wait for it',
  'coop.lost.without': 'Play without it',
  'coop.hophint': 'Hold ⟦dpad⟧ down to hop to your friend',
  'coop.following': (name) => `${name} is trotting over`,
  'coop.found': (name, what) => `${name} found ${what}`,
  'coop.foundboth': (what) => `You both found ${what}`,
  'coop.edge': (name) => `${name} is out of sight`,
  'coop.pick': (what) => `⟦interact⟧ pick up ${what}`,
  'coop.carry': (what) => `⟦interact⟧ carry the ${what}`,
  'coop.drop': (what) => `⟦interact⟧ put the ${what} down`,
  'coop.dig': '⟦interact⟧ dig it up',
  'coop.sniffed': 'You smell something… follow the paw prints!',
  'coop.nosniff': 'Nothing on the breeze.',
  'coop.tally': (a, na, b, nb) => `${a} found ${na}, ${b} found ${nb}`,
  'coop.left': (name) => `${name} waves goodbye.`,
  'coop.groomhint': (name) => `⟦dpad⟧ left to groom ${name}`,
  'coop.groomed': (a, b) => `${a} and ${b} groom each other 🫧`,
  'coop.tagstart': (by, other) => `${by} tagged ${other}! Pounce back! 🐾`,
  'coop.tagdone': (a, b) => `${a} and ${b} play tag! 🏃`,
  'coop.fightstart': (name, other) => `${name} takes the fight, and ${other} sits and cheers!`,
});

addPhrases(LINES);
