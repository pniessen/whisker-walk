// The Moon's words (milestone 0 reserved the ids; milestone 2 says the lines of chapter 1 and adds the Clan set's flavour to the two it shows).
// A lazy file: they join the phrase table (src/clanphrases.js, addPhrases) when the place's chunk arrives, so the start-up
// download does not carry them (the Lighthouse's way). The page names are in start-up (src/moonpages.js: the journal is
// drawn before the place has ever been walked); the hints and every other line are here. Every line reads the same in both
// word sets except those two: no series word is in the everyday set. The Clan set's light flavour (the spec's "Silverpelt" lines:
// moon.arrive and moon.earth since milestone 2; moon.scope.milky and moon.home) is added with the milestone that shows each line. The
// cape stays "Starlight Cape" in both sets (milestone 4: its wardrobe name is start-up text, so a Clan name costs start-up bytes).
// test/moonseams.test.js checks both sets.
import { addPhrases } from '../clanphrases.js';
import { MOON_HINTS } from '../moonpages.js';
import { seriesMode, SERIES_ON } from '../wordset.js';

// The Clan set's light flavour (the spec's section 7.6): a line that takes it is a function that reads the set in use WHEN IT IS SAID
// (never kept), so the everyday set is the plain base and a series word is only ever in the branch the Clan set takes.
const clan = (everyday, flavoured) => () => (seriesMode() === SERIES_ON ? flavoured : everyday);

// the journal's hints, by page id (the unspotted cards read them through src/moonpages.js)
export const HINTS = Object.freeze({
  mnflag: 'A flag stands by the lander. Stand beside it.',
  mnecho: 'Call out from the middle of a crater.',
  mndust: 'Walk across the smooth, untouched dust.',
  mncheese: 'Something golden shines at the bottom of the big bowl.',
  mndish: 'Stand under the big radio dish.',
  mngarden: 'Glowing plants grow inside the dome.',
  mnstory: 'Help Pip say hello to Earth.',
  mnrover: 'Hop in the little moon buggy.',
  mnlaunch: 'Send a postcard home on the rocket.',
  mnscope: 'Join the stars into pictures.',
  mnjump: 'Jump as far as you can.',
  mnjob: 'Pip has a small job for you each day.',
});

export const LINES = Object.freeze({
  // the story and the place (the spec's samples)
  'moon.arrive': clan('Welcome to the Moon!', 'Welcome to the Moon! The stars are out.'),
  'moon.pip.wake': 'Beep! Hello!',
  'moon.pip.goal': 'Let’s say hello to Earth!',
  'moon.core.on': 'The base has power!',
  'moon.earth': clan('Earth is out. Look up!', 'Earth is out. Silverpelt shines beside it.'),
  'moon.scope.milky': clan('The Milky Way is out.', 'Silverpelt is out.'),
  'moon.scope.hmm': 'Hmm, not that one.',
  'moon.stamp.ask': 'Pick a stamp for your postcard.',
  'moon.count.go': 'Lift-off!',
  'moon.reply': 'Earth says hello back!',
  'moon.badge': 'A Moon Badge!',
  'moon.cape': 'Starlight Cape, in your wardrobe.',
  'moon.job.glove': 'Earth lost a glove. Can you find it?',
  'moon.rover.in': 'Hop in',
  'moon.rover.prompt': 'E — hop in Dot',
  'moon.rover.out': 'E — hop out',
  'moon.rover.honk': 'E — honk the horn',
  'moon.rover.hint': 'Dot the rover waits at the depot. Hop in and follow the lights!',
  'moon.rover.drive': 'Push to steer. Meow to honk!',
  'moon.home': 'Take the gate home when you’re ready.',
  // milestone 2: Pip, the power cells, the Core, the board, the first three finds (the same in both sets)
  'moon.pip.prompt': 'E — wake Pip',
  'moon.pip.hint': 'A little robot sleeps by the lander. Go and wake him!',
  'moon.meow.hint': 'Meow to call Pip. A gold ring shows the way.',
  'moon.cell.prompt': 'E — pick up the power cell',
  'moon.cell.got': 'A power cell! Take it to the base.',
  'moon.cell.ridge.hint': 'A power cell glows on the tall rocks. Hop up!',
  'moon.cell.rover.hint': 'Another power cell waits by the far beacon.',
  'moon.core.prompt': 'E — plug in the power cell',
  'moon.core.plug1': 'Click! One more cell to go.',
  'moon.board.prompt': 'E — look at the mission board',
  'moon.goal.pip': 'Wake Pip, asleep by the lander.',
  'moon.goal.cells': 'Find the two power cells.',
  'moon.goal.core': 'Plug the cell into the Core.',
  'moon.goal.done': 'The base is awake!',
  // each find reads after "You spotted " (the toast's lead for a type with no lead of its own)
  'moon.find.flag': 'the first flag on the Moon',
  'moon.find.dish': 'the Old Dish, listening to space',
  'moon.find.garden': 'the glowing Star Garden',
  // milestone 4: the other three finds, the pebbles, the cape's toast
  'moon.find.echo': 'Echo Crater, where your meow comes back',
  'moon.find.dust': 'the quiet dust, keeping your paw prints',
  'moon.find.cheese': 'the Moon Cheese, a golden wedge',
  'moon.pebble': 'a glowing pebble',
  // milestone 5: Star Hill, the telescope, the star pictures, the Star Table (the same in both sets; the Milky Way line above is the one Clan flavour)
  'moon.scope.prompt': 'E — look through the telescope',
  'moon.table.prompt': 'E — look at the star table',
  'moon.scope.hint': 'A telescope waits on Star Hill. Find Earth in the stars!',
  'moon.goal.scope': 'Climb Star Hill and find Earth in the telescope.',
  'moon.scope.found': 'You found Earth! The dish is looking at it.',
  'moon.scope.cat': 'All five star pictures make the Great Cat!',
  'moon.scope.close': 'Close the telescope',
  'moon.scope.hintbtn': 'Show the next star',
  'moon.star.mouse': 'You drew the Mouse!',
  'moon.star.cat': 'You drew the Cat!',
  'moon.star.fish': 'You drew the Fish!',
  'moon.star.crown': 'You drew the Crown!',
  'moon.star.paw': 'You drew the Paw!',
  'moon.table.story': 'Trace the Mouse and the Cat in the telescope to find Earth.',
  'moon.table.more': 'Earth is found! Can you trace all five star pictures?',
  'moon.table.done': 'Every star picture is traced. The Great Cat shines!',
  // milestone 6: the Message Desk, the postcard, the rocket, the launch, Earth's answer (the same in both sets; 'moon.count.go', 'moon.reply' and 'moon.badge' are above)
  'moon.desk.prompt': 'E — write a postcard',
  'moon.stamp.paw': 'A paw stamp',
  'moon.stamp.star': 'A star stamp',
  'moon.stamp.heart': 'A heart stamp',
  'moon.stamp.close': 'Close',
  'moon.card.got': 'Your postcard is ready! Take it to the rocket.',
  'moon.rocket.prompt': 'E — post the postcard',
  'moon.rocket.loaded': 'The postcard is in the rocket!',
  'moon.launch.prompt': 'E — press the big red button',
  'moon.launch.sent': 'The postcard is on its way. Wait on the ridge for Earth to answer.',
  'moon.reply.wait': 'Earth got the postcard. Wait here for its answer.',
  'moon.story.pay': 'Earth saying hello back, with your stamp',
  'moon.binoc.prompt': 'E — look at Earth',
  'moon.binoc.close': 'Close',
  'moon.goal.card': 'Write a postcard at the message desk in the dome.',
  'moon.goal.rocket': 'Post the postcard in the rocket.',
  'moon.goal.button': 'Press the big red button!',
  'moon.goal.reply': 'Wait on Earthrise Rock. Earth will answer.',
  // milestone 7a: the hop board and the course lamps (the same in both sets)
  'moon.jump.hint': 'Hop from the line. The board shows how far!',
  'moon.jump.record': 'New record!',
  'moon.jump.beams': 'Every beam is lit!',
  // (milestone 7b) the ring gates of the bound
  'moon.ring.hint': 'Run, then pounce. Bound through the rings!',
  'moon.ring.all': 'Every ring is lit!',
  // (milestone 8) the Lava Tube and the Deep Cell (the same in both sets)
  'moon.deep.hint': 'Something glows deep in the cave.',
  'moon.deep.got': 'A Deep Cell! Take it to the Core.',
  'moon.deep.bloom': 'The Star Garden is blooming!',
  'moon.deep.finale': 'Earth is shining extra bright!',
  'moon.goal.cave': 'A glowing cell waits deep in the cave.',
});

addPhrases(LINES);
Object.assign(MOON_HINTS, HINTS);
