// Stage "lab" of the Reef: the Sealab (see reefstages.js). Milestone R13 is the shell: the plan, the building, the hatch and its travel. The Reef (reef.js) calls
// register(P) first thing in build(), which tells its plan three things (and nothing else): the seabed under the footprint is flat (REEF_FLATS), the footprint's
// plants and decor are taken away after they are scattered (REEF_CLEARS), and the rooms' ceiling is finite (REEF_CEIL_REGIONS: the close-in cave camera turns on
// under it). This file imports nothing of the Reef's plan (the plan comes in as P), so the chunk stays out of start-up's way.
import { ST } from './reefstages.js';
import * as plan from './reeflabplan.js';
import { buildLab, useKit } from './reeflabparts.js';
import { createLabLive } from './reeflablive.js';
import { createLabStory } from './reeflabstory.js';

function register(P, kit) {
  useKit(kit);
  if (P.REEF_FLATS.some((f) => f.minX === plan.LAB_FOOT.minX && f.minZ === plan.LAB_FOOT.minZ)) return;
  P.REEF_FLATS.push(plan.labFlat());
  P.REEF_CLEARS.push(...plan.labClears());
  P.REEF_CEIL_REGIONS.push(plan.labCeilRegion());
}

Object.assign(ST, { lab: Object.freeze({ plan, register, buildLab, createLabLive, createLabStory, colliders: plan.labColliders }) });
