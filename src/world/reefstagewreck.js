// Stage "wreck" of the Reef (the galleon, R16; see reefstages.js). Fills ST.wreck with what reef.js calls: install(env) (the deck's raised ground and the cabin's
// ceiling join the ground, once, first thing in build), draw(kit, M, K), colliders(), life(ctx). R17 adds the map and the Captain's Chest here.
import { ST } from './reefstages.js';
import { installWreckGround, wreckColliders, WRECK_CLUES } from './reefwreckplan.js';

Object.assign(ST, { wreck: Object.freeze({ install: installWreckGround, colliders: wreckColliders, clues: WRECK_CLUES }) });
