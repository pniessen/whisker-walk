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
  'crystal.intro1': 'Welcome to the Crystal Cave! A baby glow-worm named Lumi has lost her glow.',
  'crystal.intro2': 'Find three spark stones: rose, sky blue and gold.',
  'crystal.intro3': 'Carry each one to its great crystal and light up the cave.',
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
  // the written guide (world/crystalguide.js): the goal line and the chip beside Lumi's picture. {at} {m} {c} are filled in by the guide.
  'crystal.guide.hello': 'Say hello to Lumi, the little glow-worm near the entrance.',
  'crystal.guide.stone0': 'Find the rose spark stone: a glint behind the crystals in the Rose hall, {at}.',
  'crystal.guide.stone1': 'Find the sky spark stone: across the Blue Pool to the east. Hop or stroll round.',
  'crystal.guide.stone2': 'Find the gold spark stone: in a cosy nook of the Gold Gallery, far north.',
  'crystal.guide.carry': 'Take the spark stone to the great {c} crystal ({m} m).',
  'crystal.guide.carry.near': 'Give the spark stone to the great {c} crystal.',
  'crystal.guide.names': 'Rose|Blue|Gold',
  'crystal.guide.heart': 'Wake the Heart Crystal, far to the north-east ({m} m).',
  'crystal.guide.heart.near': 'Wake the Heart Crystal.',
  'crystal.guide.show': 'The Heart Crystal is waking. Watch the lights dance!',
  'crystal.guide.errand': 'Lumi\u2019s errand of the day: go and see her.',
  'crystal.guide.chip.hello': 'Say hello to Lumi',
  'crystal.guide.chip.stone': 'Lumi needs a spark stone',
  'crystal.guide.chip.deliver': 'Take it to the great crystal',
  'crystal.guide.chip.heart': 'Wake the Heart Crystal',
  'crystal.guide.chip.errand': 'Lumi has an errand',
  'crystal.guide.at': '{d} of the entrance arch',
  'crystal.guide.dirs': 'north|north-east|east|south-east|south|south-west|west|north-west',
  'crystal.home': 'Home again, warm and cosy.',
});

addPhrases(LINES);
Object.assign(CRYSTAL_HINTS, HINTS);
