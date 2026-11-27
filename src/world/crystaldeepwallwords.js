// The words of the Echo Deep wall and prisms (second story, milestone C3): the offer at the singing wall, its toasts, the prism offer and its toasts. A lazy file (the deep stage chunk,
// never start-up). Both word sets read the same plain lines (no series word, none of the banned words); every id is a literal (the phrase table scan reads them).
import { addPhrases } from '../clanphrases.js';

const same = (line) => () => line;

export const CRYSTAL_DEEP_WALL_LINES = Object.freeze({
  'crystal.deep.wall.prompt': same('Hum back to the wall'),
  'crystal.deep.wall.listen': same('The wall hums a tiny tune. Step on the glowing stones in the same order.'),
  'crystal.deep.wall.open': same('The wall slides open, and a warm glow spills out.'),
  'crystal.deep.wall.partner': same('Your friend woke the singing wall, and it slid open.'),
  'crystal.deep.prism.turn': same('Turn the prism'),
  'crystal.deep.prism.fits': same('That one fits, and it glows.'),
  'crystal.deep.prism.done': same('The three prisms agree, and the door-crystal lights up!'),
  'crystal.deep.prism.partner': same('Your friend set the prisms, and the door-crystal glows.'),
});

addPhrases(CRYSTAL_DEEP_WALL_LINES);
