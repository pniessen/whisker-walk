// Stage "crystalwingc" of the Crystal Cave (see crystalstages.js): the river, the falls, the boat, the grotto and the forge. Milestone C1 fills the river, the falls and the
// boat (crystalriverplan.js, crystalriverparts.js, crystalriverlive.js); C2 and C3 add the grotto and the forge beside them. The slot is { colliders(), createRiverLive(ctx),
// credit(ev), plan }, read by crystal.js through ST.wingc: it adds the banks to the cave's live colliders and the live's boat to the prompt arbiter's list.
// This chunk also clears the rim rocks and pebbles from the river's footprint, AFTER they are scattered (never through KEEP_OUT): CRYSTAL_CLEARS, like the Reef's.
import { ST } from './crystalstages.js';
import { CRYSTAL_CLEARS } from './crystalplan.js';
import * as plan from './crystalriverplan.js';
import { createRiverLive } from './crystalriverlive.js';
import { createForgeJobLive } from './crystalforgejoblive.js'; // milestone C3: the forge job (its own files)
import './crystalgrottostage.js'; // milestone C2: the mushroom grotto and the forge shell (its own files)

for (const r of plan.CLEARS) if (!CRYSTAL_CLEARS.some((c) => c.minX === r.minX && c.minZ === r.minZ)) CRYSTAL_CLEARS.push({ ...r });

Object.assign(ST, { wingc: Object.freeze({ plan, colliders: plan.riverColliders, createRiverLive, createForgeJobLive, credit: () => null }) });
