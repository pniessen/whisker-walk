// Stage "crystaldeep" of the Crystal Cave (see crystalstages.js): the second story, the Echo Deep. C0 reserved the slot; C2 fills the hall shell (crystaldeepplan.js,
// crystaldeepparts.js, crystaldeeplive.js): ST.deep = { colliders(), perches(), life(ctx) }. crystal.js reads those once; C3 and C4 add promptAt, interact and credit
// by spreading ST.deep into a new frozen object (the prompt arbiter reads those through the slot). Everything is behind ?deep=1 (crystalDeepOn): off, the slot answers
// null and empty lists and the rim rocks and pebbles are not cleared, so the cave is exactly what it was.
import { ST } from './crystalstages.js';
import { CRYSTAL_CLEARS } from './crystalplan.js';
import { crystalDeepOn } from '../crystalflag.js';
import { DEEP_CLEARS, deepColliders, deepPerches } from './crystaldeepplan.js';
import { createDeepLife } from './crystaldeeplive.js';

if (crystalDeepOn()) for (const c of DEEP_CLEARS) if (!CRYSTAL_CLEARS.includes(c)) CRYSTAL_CLEARS.push(c);

Object.assign(ST, {
  deep: Object.freeze({
    colliders: () => (crystalDeepOn() ? deepColliders() : []),
    perches: () => (crystalDeepOn() ? deepPerches() : []),
    life: (ctx) => (crystalDeepOn() ? createDeepLife(ctx) : null),
  }),
});
