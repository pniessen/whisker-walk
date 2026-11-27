// Stage "housewing" of the Old House (see housestages.js): the east wing's pieces, their far look and their discoveries' life. Fills ST.wing; nothing else imports these three files.
import { ST } from './housestages.js';
import { WING_BUILDERS, WING_FLAT_BUILDERS, sunPatchMesh, SUN_DAY, SUN_DUSK, wonderParts } from './housewingparts.js';
import { wingFarMesh } from './housewingfar.js';
import { createHouseWingFinds } from './housewingfinds.js';

ST.wing = Object.freeze({
  builders: WING_BUILDERS,
  flatBuilders: WING_FLAT_BUILDERS,
  sunPatchMesh,
  wonderParts,
  sunDay: SUN_DAY,
  sunDusk: SUN_DUSK,
  wingFarMesh,
  createFinds: createHouseWingFinds,
});
