import { ROOFS_REGISTRATION } from '../../src/world/roofsplan.js';

// A copy of a catalog with the Rooftops' row added after the Fairground, the
// place cards' order. Rooftops step 4 made the same edit in src/progression.js,
// so the real catalog comes back as an equal copy, its row unchanged. The
// input is never changed (it may be frozen).
export function withRoofs(catalog) {
  if (Object.hasOwn(catalog.areas, 'roofs')) return { ...catalog, areas: { ...catalog.areas } };
  const areas = {};
  for (const [id, row] of Object.entries(catalog.areas)) {
    areas[id] = row;
    if (id === 'fair') areas.roofs = { ...ROOFS_REGISTRATION.catalog, requires: { ...ROOFS_REGISTRATION.catalog.requires } };
  }
  if (!Object.hasOwn(areas, 'roofs')) areas.roofs = { ...ROOFS_REGISTRATION.catalog, requires: { ...ROOFS_REGISTRATION.catalog.requires } };
  return { ...catalog, areas };
}
