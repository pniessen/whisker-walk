// Stage "station" of the Moon (see moonstages.js): the Old Relay Station (wing E), its sled and the second arc. Empty in X0: the slot is reserved, the milestones M1 to M3 fill it
// (read by moonlife.js through ST.station: { relay, sled, riding }). Fetched in the background after the three landing stages (moonlate.js startMoonStages); never part of the landing.
import { ST } from './moonstages.js';
import './moonstationwords.js'; // the wing's journal hints and lines (X0)

Object.assign(ST, { station: Object.freeze({}) });
