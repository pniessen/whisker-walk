// The journal hints of the Reef's second wave (R10 reserved the nine ids in src/reefpages.js REEF_WING_PAGES). A lazy file, imported by reef.js (so
// by the Reef's chunk, never start-up): the hints join REEF_HINTS when the chunk arrives. The same in both word sets (no series word is in any).
// test/reefseams.test.js checks both sets.
import { REEF_HINTS } from '../reefpages.js';

export const HINTS = Object.freeze({
  rflab: 'A dry research station sits on the seabed.',
  rffuses: 'Three fuses are loose around the station.',
  rfshow: 'When the power is back, the dome glows.',
  rfshark: 'A spotted shark glides past the station.',
  rfgalleon: 'A sunken ship rests in the south-east.',
  rfmap: 'A torn map lies in the old cabin.',
  rfcaptchest: 'X marks where a chest lies buried.',
  rfscooter: 'A little scooter waits on a rack.',
  rfsaucer: 'A yellow saucer waits on a rack.',
  // R18 (the divers, the research ship and the big spotted shark: the lines are in reefdiverswords.js)
  rfdivers: 'Friendly divers drift over the sand. Come close and they wave.',
  rfvessel: 'Look up through the shimmer to see a ship floating on top.',
  rfwhaleshark: 'A huge, gentle spotted shark glides in wide circles, far out in the blue.',
});

Object.assign(REEF_HINTS, HINTS);
