import { ROOFS_REGISTRATION } from '../../src/world/roofsplan.js';

// A copy of a catalog with the Rooftops' row added after the Fairground, the
// place cards' order. Step 4 makes the same edit in src/progression.js. The
// input is never changed (it may be frozen).
export function withRoofs(catalog) {
  const areas = {};
  for (const [id, row] of Object.entries(catalog.areas)) {
    areas[id] = row;
    if (id === 'fair') areas.roofs = { ...ROOFS_REGISTRATION.catalog, requires: { ...ROOFS_REGISTRATION.catalog.requires } };
  }
  if (!Object.hasOwn(areas, 'roofs')) areas.roofs = { ...ROOFS_REGISTRATION.catalog, requires: { ...ROOFS_REGISTRATION.catalog.requires } };
  return { ...catalog, areas };
}
