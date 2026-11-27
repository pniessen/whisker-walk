// Stage "station" of the Moon (see moonstages.js): the Old Relay Station (wing E). M1 is its shell: the plan, the drawing and the live (walls, tower and ledge, console, dish, panels, the blink
// lights, the photo subject); the sled and the second arc come with M2 and M3 (read by moonlife.js through ST.station: { relay, sled, riding, frame }). Fetched in the background after the three
// landing stages (moonlate.js startMoonStages); never part of the landing. moonlate.js closes its place off until it is in and wakes it (stationBegin, applyStation).
import { ST } from './moonstages.js';
import './moonstationwords.js'; // the wing's journal hints and lines
import { drawStation } from './moonstationparts.js';
import { createStationLive } from './moonstationlive.js';

Object.assign(ST, { station: {}, drawStation, createStationLive }); // (station: the slots moonlife.js reads: the sled's `sled`, `riding` and `frame` while its live is up (M2); M3 adds `relay`)
