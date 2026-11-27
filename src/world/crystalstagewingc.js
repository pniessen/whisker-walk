// Stage "crystalwingc" of the Crystal Cave (see crystalstages.js): the river, the falls, the boat, the grotto and the forge. Empty in X0: the slot is reserved,
// the milestones C1 to C3 fill it. A filled slot is { plan, promptSources: { boat, forge }, credit(ev), ... } (read by crystal.js through ST.wingc).
import { ST } from './crystalstages.js';
import './crystalgrottostage.js'; // milestone C2: the mushroom grotto and the forge shell (its own files)

Object.assign(ST, { wingc: Object.freeze({}) });
