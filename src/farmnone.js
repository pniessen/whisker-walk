// What a walk away from the Farm has: no imports, a leaf (farmanimals.js re-exports it).
// What a walk that is not at the Farm has.
export const NO_FARM = Object.freeze({
  sim: null,
  jobs: null,
  riding: null,
  spottable: Object.freeze([]),
  perches: Object.freeze([]),
  groups: Object.freeze([]),
  extras: Object.freeze([]),
  update() {},
  reactToMeow() { return null; },
  actionFor() { return null; },
  act() { return false; },
  dispose() {},
});
