// The journal hints of the Moon's Old Relay Station (X0 reserved the five ids in src/moonpages.js MOON_WING_PAGES). A lazy file, imported by the station's stage (so never the landing
// or start-up): the hints join MOON_HINTS when the stage arrives. The same in both word sets (no series word is in any, no banned word); the literal phrase ids are listed so the phrase
// table knows them (the later milestones add their own lines beside these).
import { MOON_HINTS } from '../moonpages.js';
import { addPhrases } from '../clanphrases.js';

export const HINTS = Object.freeze({
  mnstation: 'An old station waits out past the rover track.',
  mnsignal: 'Pip hears a faint beep from far away.',
  mnrelay: 'Three little parts could wake the station.',
  mnsled: 'A moon sled waits at its rack.',
  mnlap: 'Slide all the way round the sled lane.',
});

export const MOON_STATION_LINES = Object.freeze({
  'moon.ws.station.hint': HINTS.mnstation,
  'moon.ws.signal.hint': HINTS.mnsignal,
  'moon.ws.relay.hint': HINTS.mnrelay,
  'moon.ws.sled.hint': HINTS.mnsled,
  'moon.ws.lap.hint': HINTS.mnlap,
  'moon.ws.station.photo': 'the Old Relay Station', // the photo and journal subject's label (milestone M1)
});

Object.assign(MOON_HINTS, HINTS);
addPhrases(MOON_STATION_LINES);
