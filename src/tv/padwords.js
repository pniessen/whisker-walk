// What the game says when the pad is the last input. One table keyed by the
// same ids as tutorialwords.js WORDS (a pad form for every line whose keyboard
// form names a key or the mouse), plus the TV-only ids (pad.*). Lines carry
// ⟦tokens⟧ for button pictures (glyphs.js), never a button's name, so one line
// serves both PlayStation and Xbox pads. The words are neutral, like WORDS:
// they read the same in the family's set and the everyday one. A word set may
// carry PAD_LINES of its own (keyed the same way); its line wins.
//
// The pad's map is gamepadinput.js's: jump = Cross/A, interact = Square/X,
// meow = Circle/B, photo = Triangle/Y, move = left stick, look = right stick.
import { words } from '../wordset.js';
import { line } from '../tutorialwords.js';

export const PAD_WORDS = Object.freeze({
  // hints
  'hint.look': 'Push ⟦look⟧ to look around.',
  'hint.creep': '{name} is shy. Push ⟦move⟧ gently to creep.',
  'hint.jump': 'Press ⟦jump⟧ to jump up.',
  'hint.hop': 'Press ⟦jump⟧ again to hop down.',
  'hint.photo': 'Press ⟦photo⟧ to take a photo.',
  'hint.frame': 'Point at an animal. Press ⟦jump⟧.',
  'hint.map': 'Pick a place with ⟦dpad⟧. Press ⟦confirm⟧.',
  'hint.call': 'Press ⟦meow⟧ to call a cat over.',
  'hint.help': 'Someone needs help. Walk up and press ⟦interact⟧.',
  'hint.home': 'Press ⟦pause⟧ when you want to go home.',
  'hint.chat': 'Chat needs a keyboard or a touch screen.',
  // goals' "how"
  'how.collect': 'Find something shiny. Press ⟦interact⟧.',
  'how.tip-things': 'Walk up to a pot or a bin. Press ⟦interact⟧.',
  'how.greet-cats': 'Walk up to a cat. Press ⟦interact⟧.',
  'how.take-photos': 'Press ⟦photo⟧. Point at an animal. Press ⟦jump⟧.',
  'how.get-scratches': 'Find a person. Press ⟦interact⟧.',
  'how.pounce-play': 'Creep close. Then press ⟦jump⟧.',
  // the guided first walk
  'guide.walk': 'Push ⟦move⟧ to walk.',
  'guide.walk-more': 'Push ⟦move⟧ up with your thumb.',
  'guide.hello': 'Press ⟦interact⟧ to say hello.',
  'guide.fish': '{name} is hungry. Press ⟦interact⟧ again.',
  'guide.pick-up': 'Press ⟦interact⟧ to pick it up.',
  'guide.pounce': 'Press ⟦jump⟧ to pounce!',
  'guide.home': 'Press ⟦pause⟧ when you want to go home.',
  'ready.keys': 'Push ⟦move⟧ to walk',
  // the home screen's next-thing line: a pad has no click
  'home.present': 'Press ⟦confirm⟧ on the present! 🎁',
  'home.first': 'A friend is waiting. Press ⟦confirm⟧ on Explore!',
  'home.part': '{name} has more to show. Press ⟦confirm⟧ on Explore!',
  'home.part-friend': 'Your friend has more to see. Press ⟦confirm⟧ on Explore!',
  'home.wear': 'Enough for the {thing}! Press ⟦confirm⟧ on Dress up.',

  // TV-only lines
  // the walk's key strip, in place of KEY_STRIP
  'pad.strip': '⟦move⟧ move · ⟦jump⟧ jump · ⟦interact⟧ do it · ⟦meow⟧ meow · ⟦photo⟧ photo · ⟦pause⟧ pause',
  // the pause and Ready? card's list, in place of KEYS_HINT (one piece per control, split on " · ")
  'pad.pause.controls': '⟦move⟧ walk · ⟦look⟧ look · ⟦jump⟧ jump/climb/pounce · ⟦interact⟧ do it/sniff · ⟦meow⟧ meow · ⟦photo⟧ photo · ⟦zoomOut⟧⟦zoomIn⟧ zoom · ⟦pause⟧ pause',
  // the den walk's note under the pause card
  'pad.den.hint': 'Press ⟦pause⟧, then 🛋️ Den shop to decorate',
  // the photo viewfinder's one line
  'pad.vf.hint': '📷 ⟦jump⟧ to snap · ⟦photo⟧ to lower',
  // the fight pill and sheet
  'pad.fight.go': 'Fight!',
  'pad.fight.off': 'Back off',
  // the offer to use TV mode (T9)
  'pad.offer.title': 'Use TV mode?',
  'pad.offer.note': 'Bigger words, made for the sofa.',
  'pad.offer.yes': 'Yes, use it',
  'pad.offer.no': 'Not now',
});

let busy = false;

/**
 * The pad form of a line, with {slots} filled, or null for an id that is not a line at all.
 * Looks in the word set's own PAD_LINES, then PAD_WORDS, then falls back to the keyboard
 * form of line() (a line with no pad form still reads, in its key words).
 */
export function padLine(id, slots = {}) {
  if (busy) return null; // the fallback below calls line(), which asks us again
  const own = words().PAD_LINES;
  const text = (own && Object.hasOwn(own, id) && own[id]) || (Object.hasOwn(PAD_WORDS, id) && PAD_WORDS[id]) || null;
  if (text == null) {
    busy = true;
    try { return line(id, { ...slots, touch: false }) || null; } finally { busy = false; }
  }
  return text.replace(/\{(\w+)\}/g, (_, k) => (Object.hasOwn(slots, k) && slots[k] != null ? String(slots[k]) : ''));
}
