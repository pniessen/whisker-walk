// Every sentence of the guided first walk, the hints, the goals' "how" lines
// and the home screen's "next thing" line, in one table. Nothing else holds
// tutorial text (design: .claude/plans/guided-first-walk-design.md, 2026-11-15).
//
// Pure: no DOM, no THREE; its one import is the door to the word sets
// (wordset.js, a leaf), since 2026-11-18. Each line has a touch form and a
// keyboard form (the same words where the design gives only one), and may
// carry {slots} the caller fills. The words are neutral: they read the same
// whether or not the book-series wording is on, so none of them names a
// group, a rank or an outsider. Names of places, things to wear and ranks
// arrive through the slots from the game's own name tables.
//
// line() gives PLAIN TEXT. A slot may hold a name a player typed, so a caller
// sets the result as text (textContent) or escapes it (escapeHtml), never as
// HTML.
import { words } from './wordset.js';

const same = (s) => Object.freeze({ touch: s, keys: s });
const two = (touch, keys) => Object.freeze({ touch, keys });

// The slots the code fills. tutorialwords.test.js checks every {slot} in the
// table is one of these.
export const SLOTS = Object.freeze(['name', 'place', 'thing', 'n', 'rank']);

export const WORDS = Object.freeze({
  // ---- The start of a touch walk (walk.js TOUCH_START_HINT) ----------------
  'start.touch': same('Push the circle to walk. Drag to look around.'),

  // ---- Hints (design section 4), keyed hint.<id>; src/hints.js has the rules
  'hint.look': two('Drag here to look around.', 'Move the mouse to look around.'),
  'hint.creep': two('{name} is shy. Push the circle gently to creep.', '{name} is shy. Hold Shift to creep.'),
  'hint.jump': two('Tap the paw to jump up.', 'Press Space to jump up.'),
  'hint.hop': two('Tap the paw again to hop down.', 'Press Space again to hop down.'),
  'hint.photo': two('Tap 📷 to take a photo.', 'Press C to take a photo.'),
  'hint.frame': two('Point at an animal. Tap the screen.', 'Point at an animal. Click.'),
  'hint.yarn': two('Tap 🧶 to play with your yarn.', 'Press T to play with your yarn.'),
  'hint.bat': same('Run into the ball to bat it.'),
  'hint.call': two('Tap 😺 to call a cat over.', 'Press V to call a cat over.'),
  'hint.sniff': same('You smell something! Follow the paw prints.'),
  'hint.box': same('Walk into the box and stop.'),
  'hint.help': two('Someone needs help. Walk up and tap the button.', 'Someone needs help. Walk up and press E.'),
  'hint.hiss': same('{name} is cross today. Try again on another walk.'),
  'hint.dog': same('That is the dog\'s garden. Walk round it.'),
  'hint.swim': same('You can swim! Walk to the bank to climb out.'),
  'hint.carry': same('You can carry it home. Or put it down.'),
  'hint.home': two('Tap ⏸ when you want to go home.', 'Press Esc when you want to go home.'),
  'hint.chat': two('Tap 💬 to say something.', 'Press Enter to say something.'),
  'hint.rival': same('This land is theirs. You can come back another way.'),
  'hint.stranger': same('A stranger is on your land. You choose: chase or leave.'),

  // ---- Goals' "how" lines (design section 5), keyed how.<goal id> ----------
  'how.spot-critters': same('Walk near a bird, a mouse or a squirrel.'),
  'how.collect': two('Find something shiny. Tap the button.', 'Find something shiny. Press E.'),
  'how.tip-things': two('Walk up to a pot or a bin. Tap the button.', 'Walk up to a pot or a bin. Press E.'),
  'how.greet-cats': two('Walk up to a cat. Tap the button.', 'Walk up to a cat. Press E.'),
  'how.take-photos': two('Tap 📷. Point at an animal. Tap the screen.', 'Press C. Point at an animal. Click.'),
  'how.get-scratches': two('Find a person. Tap the button.', 'Find a person. Press E.'),
  'how.yarn-play': two('Tap 🧶. Run into the ball 4 times.', 'Press T. Run into the ball 4 times.'),
  'how.dig-treasure': same('Stand still to sniff. Follow the paw prints. Dig!'),
  'how.box-sit': same('Walk into a cardboard box and stop.'),
  'how.scenic-spots': same('Go to a ☆ on the map.'),
  'how.pounce-play': two('Creep close. Then tap the paw.', 'Hold Shift to creep close. Then press Space.'),

  // ---- The home screen's "next thing" line (design section 6) --------------
  // src/ui/nextthing.js has the rules; the number is the rule's.
  'home.present': same('Tap the present! 🎁'),                                   // 1
  'home.first': same('A friend is waiting outside. Tap Start!'),                // 2
  'home.part': same('{name} has more to show you. Tap Start!'),                 // 3
  'home.pick': same('The wild cats have seen you. Pick your home!'),            // 4
  'home.camp': same('Your new home is {place}. Go and see your camp!'),         // 5
  'home.way': same('The way to your home starts in {place}.'),                  // 6
  'home.opens': same('One more walk here and {place} opens!'),                  // 7
  'home.wear': same('You have enough for the {thing}. Tap Dress up!'),          // 8
  'home.feed': same('Feed {name} again: {n} of 6.'),                            // 9
  'home.nearly': same('{n} more 🐾 and the {thing} is yours.'),                 // 10
  'home.den': same('{name} is waiting in your den.'),                           // 11
  'home.rank': same('{n} 🐾 more to become a {rank}.'),                         // 12
  // Not in the design: rule 12 has nothing to count once the last rank is
  // reached, and the line is "always exactly one".
  'home.top': same('Your cat is ready for a walk.'),
  // Rule 3 before the guide's name is known.
  'home.part-friend': same('Your friend has more to show you. Tap Start!'),

  // ---- The guided first walk (design section 3). Step 3 of the build shows
  // these; they are here so the walk holds no text of its own. --------------
  'guide.walk': two('Push the circle to walk.', 'Press the arrow keys to walk.'),
  'guide.walk-more': two('Put your thumb on the circle. Slide it up.', 'The arrow keys are next to the letters.'),
  'guide.go': same('Walk to {name}.'),
  'guide.hello': two('Tap the button to say hello.', 'Press E to say hello.'),
  'guide.hello-other': same('Nice! Now say hello to {name}.'),
  'guide.fish': two('{name} is hungry. Tap the button again.', '{name} is hungry. Press E again.'),
  'guide.follow': same('Follow {name}!'),
  'guide.pick-up': two('Tap the button to pick it up.', 'Press E to pick it up.'),
  'guide.pounce': two('Tap the paw to pounce!', 'Press Space to pounce!'),
  'guide.done': same('You did it! {name} is your friend now.'),
  'guide.home': two('Tap ⏸ when you want to go home.', 'Press Esc when you want to go home.'),
  'guide.summary-first': same('Your first walk! ⭐'),
  'guide.summary-friend': same('New friend: {name} ♡'),
  'guide.summary-gift': same('A gift from {name}: +20 🐾'),
  'guide.skip': same('Skip the lesson'),
  'guide.replay': same('Play the first walk again'),
  'guide.replay-set': same('Your next street walk is the first walk.'),
  // The "Ready?" card on a keyboard player's very first walk: one line, not
  // the whole list (the pause card keeps the list).
  'ready.keys': same('Arrow keys to walk'),

  // ---- The first walk on home land (design section 7), for step 4 ----------
  'camp.follow': same('Follow {name} to your camp.'),
  'camp.here': same('This is your camp. Say hello to everyone!'),
  // With nobody to lead (a walk together, or no cat free to wait).
  'camp.trail': same('Follow the paw prints to your camp.'),
  // The distance pill's words; the metres follow.
  'camp.pill': same('Your camp 🏡'),

  // ---- Settings -------------------------------------------------------------
  'settings.tips': same('Show tips'),
});

export function hasLine(id) {
  return typeof id === 'string' && Object.hasOwn(WORDS, id);
}

// line(id, { touch, name, place, … }) -> the sentence as plain text, or ''
// for an id the table does not hold. A slot the caller did not fill is left
// out (the test pins that every caller fills its slots).
//
// A word set may carry lines of its own (LINES in wordset.js, keyed by these
// ids, each with a touch and a keys form): that set's line is said in place of
// this table's. The family's set has none, so every line is this table's.
export function line(id, { touch = false, ...slots } = {}) {
  if (!hasLine(id)) return '';
  const own = words().LINES;
  const entry = own && Object.hasOwn(own, id) ? own[id] : WORDS[id];
  const form = touch ? entry.touch : entry.keys;
  return form.replace(/\{(\w+)\}/g, (_, k) => (Object.hasOwn(slots, k) && slots[k] != null ? String(slots[k]) : ''));
}

// Both forms at once, for a place that draws the two and lets the page's
// touch mode pick (the goals' "how" line).
export function bothForms(id, slots = {}) {
  return { touch: line(id, { ...slots, touch: true }), keys: line(id, { ...slots, touch: false }) };
}
