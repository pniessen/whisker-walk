// ww-private-family-file
// The private family edition's area: the house engine over the family plan. Milestone 0 builds the
// one-room placeholder plan; the real plan arrives in milestone 1. Only reachable through the
// `__PRIVATE_FAMILY__` block in src/world/areas.js.
import { build as buildHouse } from '../world/house.js';
import { FAMILY_PLACEHOLDER_PLAN } from './placeholderplan.js';
import { FAMILY_SENTINEL } from './sentinel.js';

export { FAMILY_SENTINEL };
export const FAMILY_PLAN = FAMILY_PLACEHOLDER_PLAN;

export function build(scene, opts = {}) {
  return buildHouse(scene, { ...opts, plan: FAMILY_PLAN });
}
