// The Sealab's words (milestone R13): the hatch's two prompts and the soft line on arriving. A lazy file, imported by the Reef's lab stage (so by its chunk, never
// start-up): they join the phrase table (addPhrases) when the chunk arrives. The same plain lines in both word sets; no series word is in any
// (test/reeflab.test.js checks both sets). "Tidewell Station" is the station's own name.
import { addPhrases } from '../clanphrases.js';

export const LINES = Object.freeze({
  'reef.lab.down': 'Climb down into Tidewell Station',
  'reef.lab.up': 'Climb up to the open sea',
  'reef.lab.in': 'Tidewell Station. Warm, dry and quiet.',
  // the fuses (R14)
  'reef.lab.fuse.prompt': 'Pick up the fuse',
  'reef.lab.fuse.got': 'A loose fuse. The panel in the control room can use it.',
  'reef.lab.fuse.back': 'The fuse goes back where it was found.',
  'reef.lab.put': 'Put the fuse in the panel',
  'reef.lab.fuse.in': 'Click. One more fuse is in the panel.',
  'reef.lab.power': 'All three fuses are in. The station hums.',
  'reef.lab.pay': 'Tidewell Station has power again',
  // the dome's light show (R15)
  'reef.lab.show.prompt': 'Watch the dome lights',
  'reef.lab.show.start': 'Soft lights ripple past the dome.',
  'reef.life.shark': 'a spotted shark',
  // the written guide's lines for the station (kind, plain, no series word)
  'reef.guide.lab.hatch': 'Climb down by the ring next to the Sunken Boat.',
  'reef.guide.lab.fuse': 'Find a loose fuse ({n} of 3 are in the panel).',
  'reef.guide.lab.sand': 'Find a loose fuse on the sand, {at}.',
  'reef.guide.lab.deliver': 'Carry the fuse to the panel in the control room.',
  'reef.guide.lab.down': 'Carry the fuse down the ring by the Sunken Boat.',
  'reef.guide.lab.up': 'The last fuse is on the sand. Climb up the ladder.',
});

addPhrases(LINES);
