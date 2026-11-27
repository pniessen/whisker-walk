// Wing C's mushroom grotto and forge shell (milestone C2), joined to the cave through the stage registry: loaded with the `crystalwingc` stage (one import line in
// crystalstagewingc.js), so its chunk's size is counted there and the cave's base chunk never carries it. It fills ST.grotto with what crystal.js reads (the colliders, the shelf's
// perch, the life), and pushes its two footprints into CRYSTAL_CLEARS once, so the rim rocks and pebbles are taken out of them AFTER the scatter (never through KEEP_OUT).
import { ST } from './crystalstages.js';
import { CRYSTAL_CLEARS } from './crystalplan.js';
import { GROTTO_CLEARS, grottoColliders, grottoPerches } from './crystalgrottoplan.js';
import { createGrottoLife } from './crystalgrottolive.js';

for (const c of GROTTO_CLEARS) if (!CRYSTAL_CLEARS.includes(c)) CRYSTAL_CLEARS.push(c);

ST.grotto = Object.freeze({ colliders: grottoColliders, perches: grottoPerches, life: createGrottoLife });
