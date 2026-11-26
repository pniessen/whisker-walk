// The Crystal Cave's words (milestone C0 reserves the ids and a few lines; the rules that say them come with their milestones).
// A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up download does
// not carry them (the Reef's way). Page names are in start-up (src/crystalpages.js); the hints and every other line are here. Every line
// reads the same in both word sets except 'crystal.arrive', which takes the Clan set's light flavour; no series word is in the everyday set.
import { addPhrases } from '../clanphrases.js';
import { CRYSTAL_HINTS } from '../crystalpages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? (typeof flavoured === 'function' ? flavoured() : flavoured) : everyday);

export const HINTS = Object.freeze({
  ccrose: 'A great rose-pink crystal waits in the first hall.',
  ccecho: 'A wall that hums back when you touch it.',
  ccpool: 'A calm pool glows softly.',
  ccgold: 'A golden vein shines in the rock.',
  ccgarden: 'Tiny crystals sprout like flowers.',
  ccheart: 'The biggest crystal of all sleeps at the end.',
  ccstonerose: 'A rose-coloured spark stone hides behind a crystal cluster.',
  ccstonesky: 'A sky-blue spark stone lies across the pool.',
  ccstonegold: 'A golden spark stone rests in a cosy nook.',
  ccshow: 'Wake the Heart Crystal and watch the lights dance.',
  ccerrand: 'Once Lumi glows again, she has an errand each walk.',
  ccrubbings: 'Collect rubbings of the crystals.',
});

export const LINES = Object.freeze({
  'crystal.arrive': clan('Welcome to the Crystal Cave!', 'Welcome to the Crystal Cave! The crystals glimmer like Silverpelt.'),
  'crystal.lumi.hello': 'A tiny glow-worm peeks out. Say hello!',
  'crystal.stone.hint': 'A spark stone! Carry it to a great crystal.',
  'crystal.lumi.prompt': 'Say hello to the glow-worm',
  'crystal.lumi.met': 'Lumi\'s glow is sleepy. Meow and she will show you where to look.',
  'crystal.stone.prompt': 'Pick up the spark stone',
  'crystal.stone.find': 'Look for a little glint behind the crystals.',
  'crystal.stone.got': 'Take the spark stone to the great Rose crystal!',
  'crystal.stone.give': 'Set the spark stone on the crystal',
  'crystal.rose.lit': 'The Rose crystal hums and Lumi\'s tail glows pink!',
  'crystal.glow': 'The crystal hums and glows.',
  'crystal.home': 'Home again, warm and cosy.',
});

addPhrases(LINES);
Object.assign(CRYSTAL_HINTS, HINTS);
