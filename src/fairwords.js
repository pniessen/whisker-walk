// The lines of the Fairground's rides, by ride.
//
// Every line is in the phrase table (src/clanphrases.js, the later table), so
// a set of words can say one differently. This file only gives each its place:
// the table's test wants every phrase() call to name its id in full, so the
// ids are spelled out here, once, and the game asks by ride id (src/fairsim.js).
import { phrase } from './clanphrases.js';

// The journal page of each ride (src/progression.js JOURNAL_TYPES).
export const RIDE_PAGE = Object.freeze({ mgr: 'ridemgr', wheel: 'ridewheel', cups: 'ridecups', slide: 'rideslide', coaster: 'ridecoaster' });

// The first time ever on a ride: one friendly line.
export const RIDE_TOASTS = Object.freeze({
  mgr: () => phrase('fair.toast.mgr'),
  wheel: () => phrase('fair.toast.wheel'),
  cups: () => phrase('fair.toast.cups'),
  slide: () => phrase('fair.toast.slide'),
  coaster: () => phrase('fair.toast.coaster'),
  boat: () => phrase('fair.toast.boat'), // once a walk, no journal page (game/fairplay.js)
});

// The journal's pages (src/journal.js), by journal id.
export const RIDE_PAGE_WORDS = Object.freeze({
  ridemgr: Object.freeze({ name: () => phrase('fair.page.mgr.name'), hint: () => phrase('fair.page.mgr.hint') }),
  ridewheel: Object.freeze({ name: () => phrase('fair.page.wheel.name'), hint: () => phrase('fair.page.wheel.hint') }),
  ridecups: Object.freeze({ name: () => phrase('fair.page.cups.name'), hint: () => phrase('fair.page.cups.hint') }),
  rideslide: Object.freeze({ name: () => phrase('fair.page.slide.name'), hint: () => phrase('fair.page.slide.hint') }),
  ridecoaster: Object.freeze({ name: () => phrase('fair.page.coaster.name'), hint: () => phrase('fair.page.coaster.hint') }),
});

// ---- step 3: the three games and the six finds -------------------------------
// A game's lines: `prompt` at its spot, `again` there once it is won, `start`
// when it is taken on, `first` the first win ever (it names the prize), `won`
// any later win (the award's line).
export const GAME_WORDS = Object.freeze({
  cans: Object.freeze({
    prompt: () => phrase('fair.cans.prompt'),
    again: () => phrase('fair.cans.again'),
    start: () => phrase('fair.cans.start'),
    first: () => phrase('fair.cans.first'),
    won: () => phrase('fair.cans.won'),
    batPrompt: () => phrase('fair.cans.batPrompt'),
    hit: (n) => phrase('fair.cans.hit', n),
  }),
  ducks: Object.freeze({
    prompt: () => phrase('fair.ducks.prompt'),
    again: () => phrase('fair.ducks.again'),
    start: () => phrase('fair.ducks.start'),
    first: () => phrase('fair.ducks.first'),
    won: () => phrase('fair.ducks.won'),
    pickPrompt: () => phrase('fair.ducks.pickPrompt'),
    plain: () => phrase('fair.ducks.plain'),
  }),
  bell: Object.freeze({
    prompt: () => phrase('fair.bell.prompt'),
    again: () => phrase('fair.bell.again'),
    start: () => phrase('fair.bell.start'),
    first: () => phrase('fair.bell.first'),
    won: () => phrase('fair.bell.won'),
    low: () => phrase('fair.bell.low'),
    close: () => phrase('fair.bell.close'),
  }),
});
export const GAME_AGAIN = () => phrase('fair.game.again');
export const PRIZE_WEAR = () => phrase('fair.prize.wear');
export const VISITOR_HELLO = () => phrase('fair.visitor.hello');

// A find's lines: `first` the first time ever (the award's line), `again` on
// any later walk.
export const FAIR_FIND_WORDS = Object.freeze({
  fortune: Object.freeze({ first: () => phrase('fair.find.fortune.first'), again: () => phrase('fair.find.fortune.again') }),
  musicbox: Object.freeze({ first: () => phrase('fair.find.musicbox.first'), again: () => phrase('fair.find.musicbox.again') }),
  candyfloss: Object.freeze({ first: () => phrase('fair.find.candyfloss.first'), again: () => phrase('fair.find.candyfloss.again') }),
  juggler: Object.freeze({ first: () => phrase('fair.find.juggler.first'), again: () => phrase('fair.find.juggler.again') }),
  balloon: Object.freeze({ first: () => phrase('fair.find.balloon.first'), again: () => phrase('fair.find.balloon.again') }),
  lookout: Object.freeze({ first: () => phrase('fair.find.lookout.first'), again: () => phrase('fair.find.lookout.again') }),
});

// The journal's pages for the games and the finds (src/journal.js), by journal id.
export const FAIR_PAGE_WORDS = Object.freeze({
  gamecans: Object.freeze({ name: () => phrase('fair.page.cans.name'), hint: () => phrase('fair.page.cans.hint') }),
  gameducks: Object.freeze({ name: () => phrase('fair.page.ducks.name'), hint: () => phrase('fair.page.ducks.hint') }),
  gamebell: Object.freeze({ name: () => phrase('fair.page.bell.name'), hint: () => phrase('fair.page.bell.hint') }),
  fairfortune: Object.freeze({ name: () => phrase('fair.page.fortune.name'), hint: () => phrase('fair.page.fortune.hint') }),
  fairmusicbox: Object.freeze({ name: () => phrase('fair.page.musicbox.name'), hint: () => phrase('fair.page.musicbox.hint') }),
  faircandyfloss: Object.freeze({ name: () => phrase('fair.page.candyfloss.name'), hint: () => phrase('fair.page.candyfloss.hint') }),
  fairjuggler: Object.freeze({ name: () => phrase('fair.page.juggler.name'), hint: () => phrase('fair.page.juggler.hint') }),
  fairballoon: Object.freeze({ name: () => phrase('fair.page.balloon.name'), hint: () => phrase('fair.page.balloon.hint') }),
  fairlookout: Object.freeze({ name: () => phrase('fair.page.lookout.name'), hint: () => phrase('fair.page.lookout.hint') }),
});
