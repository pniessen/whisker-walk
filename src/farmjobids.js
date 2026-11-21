// Appletree Farm's job and find ids, the journal ids made from them, the job
// states and the job numbers: plain constants with no imports. A leaf, so
// the farm's play code can name a job without loading the farm's simulation
// (farmjobs.js re-exports all of it).
export const FARM_JOB_IDS = Object.freeze(['chicks', 'cow', 'goat', 'mice']);
export const FARM_FIND_IDS = Object.freeze(['loftcats', 'eggs', 'owl', 'scarecrow', 'apples', 'ducklings']);
// The journal ids (progression.js JOURNAL_TYPES), one a job and one a find.
export const jobJournalId = (id) => `job${id}`;
export const findJournalId = (id) => `find${id}`;
export const FARM_JOURNAL_TYPES = Object.freeze([...FARM_JOB_IDS.map(jobJournalId), ...FARM_FIND_IDS.map(findJournalId)]);

// Every state a job has, in order. A job only ever moves to the right.
export const JOB_STATES = Object.freeze({
  chicks: Object.freeze(['offer', 'active', 'done']),
  cow: Object.freeze(['offer', 'active', 'milk', 'done']),   // milk: the saucer is out
  goat: Object.freeze(['offer', 'active', 'hat', 'done']),   // hat: the goat has dropped it
  mice: Object.freeze(['offer', 'active', 'done']),
});

// The carryable the farmer's hat is, once the goat has dropped it (carry.js).
export const FARM_HAT_ID = 'farm-job-hat';
export const FARM_HAT_KIND = 'strawhat';

export const JOB = Object.freeze({
  OFFER_R: 3,           // a job is offered this near its giver
  CHICKS: 4,
  COW_SEE: 18,          // the job cow comes for a cat this near (so from the gate, most of the time)
  MILK_R: 1.4,          // the saucer is lapped from this near
  DOOR_R: 2.2,          // the hat is handed in this near the farmhouse door
  // the goat with the hat
  GOAT_OFFER_R: 4.5,
  GOAT_TEASE: 4,        // at a stop it waits until the cat is this near, then skips on
  GOAT_KEEP: 10,        // on a leg it only runs while the cat is this near; else it waits for her
  GOAT_TOUCH: 1.4,      // this near, on the ground, and it is caught
  // ...but a touch only counts as a catch when it was a chase and not a tap:
  // the cat fell behind on this leg and caught up again (GOAT_GAP), or the
  // goat is on a leg slower than any cat walks and has run GOAT_GRACE of it,
  // or it stands cornered at its last stop.
  GOAT_GAP: 2.4,
  GOAT_GRACE: 4,
  GOAT_SPEEDS: Object.freeze([3.9, 3.5, 3.0, 2.6, 2.2]), // one a leg: slower every time
  GOAT_HOP: 0.45,
  GOAT_DROP: 1.1,       // the hat lands this far in front of its nose
  // the grain-store mice
  MOUSE_FLEE: 1.7,
  MOUSE_SPEED: 5.5,
  // the finds
  LOFT_R: 4,
  OWL_R: 3.4,
  OWL_HEAR: 7,
  OWL_PEEK: 2.6,        // seconds one eye stays open (a look, not a job's clock)
  EGGS_R: 1.6,
  SCARECROW_R: 1.9,
  TREE_R: 0.7,
  APPLE_R: 0.12,
  APPLE_BAT: 0.5,
  APPLE_ROLL: 2.6,
  APPLES_MAX: 2,
});
