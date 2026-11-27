// Stage "crystalplay" of the Crystal Cave (see crystalstages.js): Lumi's cart on the old tracks (C4) and the singing chamber (C5, crystalsongstage.js: createSong, pads, credit). It fills ST.play with what crystal.js reads:
// { plan, createCartLive(ctx), credit(ev) }; the live a cave makes with it is the prompt arbiter's cart source and a spottable. This chunk also clears the rim rocks and pebbles from
// the track's strip, AFTER they are scattered (never through KEEP_OUT): CRYSTAL_CLEARS, like the Reef's and the river's.
import { ST } from './crystalstages.js';
import { CRYSTAL_CLEARS } from './crystalplan.js';
import * as plan from './crystalcartplan.js';
import { createCartLive } from './crystalcartlive.js';
import { SONG_SLOTS } from './crystalsongstage.js';

for (const r of plan.CLEARS) if (!CRYSTAL_CLEARS.some((c) => c.minX === r.minX && c.minZ === r.minZ)) CRYSTAL_CLEARS.push({ ...r });

Object.assign(ST, { play: Object.freeze({ plan, createCartLive, credit: (ev) => SONG_SLOTS.credit(ev), createSong: SONG_SLOTS.createSong, pads: SONG_SLOTS.pads }) });
