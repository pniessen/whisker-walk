// v18 "Cat Skills" — the static catalog of the twelve earned abilities and
// the feat predicates that unlock them.
//
// This module is deliberately PURE and has ZERO imports: no THREE, no DOM,
// nothing from src/game/* or src/main.js, and nothing from progression.js
// either. Two reasons:
//
//  1. hasSkill() is the contract every v18 ability gates its effect behind,
//     so it has to be callable from a unit test, from the home-base UI, and
//     from deep inside the per-frame render loop without dragging a
//     dependency graph along.
//  2. progression.js imports SKILL_IDS from here (sanitizeSkills validates
//     against the catalog). Keeping this file import-free makes that edge
//     unconditionally cycle-free.
//
// Abilities are permanent and always-on: no loadout, no respec, no
// prerequisites. Twelve flat unlocks across four families.

// ---------------------------------------------------------------------------
// Hostile-state coercion
//
// Every predicate below reads a save object that may have arrived from the
// cloud `saves` table, which stores the payload as opaque jsonb with no
// server-side shape validation (docs/supabase-setup.sql's load_save). It can
// therefore be ANY type — a string, a number, null, an array — with any
// sub-object mistyped or missing. These helpers mirror the optional-chaining
// + coerce style progression.js's summarizeSaveForPreview/asFiniteNonNeg
// already use; they are duplicated rather than imported so this module keeps
// its zero-import property (see header). Nothing here may ever throw.
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Anything that isn't a plain finite non-negative number reads as 0, so a
// hostile payload's '9e99', {}, NaN, Infinity or -1 can never satisfy a feat.
function countOf(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

// One lifetime discovery tally out of state.feats (Task 1.1). The
// hasOwnProperty check is not paranoia-for-its-own-sake: `feats` may be an
// object whose prototype carries a 'mischief' or 'scenic' key (an attacker
// controls the whole payload, and a later Object.assign/spread of an
// attacker-shaped object is enough), and an INHERITED tally must never count
// toward an ability.
function featTally(state, type) {
  const feats = state?.feats;
  if (!isPlainObject(feats)) return 0;
  if (!Object.prototype.hasOwnProperty.call(feats, type)) return 0;
  return countOf(feats[type]);
}

// One critter count out of state.journal — same threat model as featTally.
function journalTally(state, type) {
  const journal = state?.journal;
  if (!isPlainObject(journal)) return 0;
  if (!Object.prototype.hasOwnProperty.call(journal, type)) return 0;
  return countOf(journal[type]);
}

// Completed-walk count for one area out of state.walks.
function walkCount(state, area) {
  const walks = state?.walks;
  if (!isPlainObject(walks)) return 0;
  if (!Object.prototype.hasOwnProperty.call(walks, area)) return 0;
  return countOf(walks[area]);
}

// state.golden is an array of golden-mouse ids; a non-array (or a payload
// that replaced it with a string of the right length) counts as zero found.
function goldenCount(state) {
  return Array.isArray(state?.golden) ? state.golden.length : 0;
}

// Greet counts across state.friends, one entry per cat/pet ever greeted.
// Returns a plain number array so both social predicates (Charmer counts
// entries at the 'friend' rung, Far Call sums the whole thing) can share one
// safe traversal.
function friendGreetCounts(state) {
  const friends = state?.friends;
  if (!isPlainObject(friends)) return [];
  return Object.values(friends).map((f) => (isPlainObject(f) ? countOf(f.greets) : 0));
}

// The 'friend' rung of progression.js's ♡→♥→💕 ladder (friendLevel: 1 greet
// = met, 3 = friend, 6 = best). Referenced by name here so Charmer's notion
// of "befriended" can never drift from the ladder the rest of the game shows.
const FRIEND_GREETS = 3;

// ---------------------------------------------------------------------------
// The catalog
//
// Each entry: id, family, name, effect (display), feat (display), and
// progress(state) → { have, need }. `have` is returned RAW (not clamped to
// `need`) so the UI can decide whether to show "27/25" or clamp it, and so
// tests can distinguish need-1 / need / need+1.
//
// FEAT SOURCE MAPPING. Several spec feats name an action the game does not
// count under its own award type; the note on each entry says which existing
// counter was chosen and why. Two feats (Long Zoomies, Night Eyes) have no
// faithful source at all and are documented as deviations — see the comments
// on those two entries.
// ---------------------------------------------------------------------------

export const SKILL_FAMILIES = [
  { id: 'traversal', name: 'Traversal', emoji: '🧗' },
  { id: 'senses', name: 'Senses', emoji: '👃' },
  { id: 'social', name: 'Social', emoji: '💕' },
  { id: 'mischief', name: 'Mischief', emoji: '😼' },
];

export const SKILLS = [
  // --- Traversal ---------------------------------------------------------
  {
    id: 'spring-paws',
    family: 'traversal',
    name: 'Spring Paws',
    effect: 'Your pounce jump goes markedly higher, and you can reach perches a longer hop away.',
    feat: 'Reach 10 vantage perches',
    // AMBIGUITY: reaching a vantage perch pays awardOnce('scenic', `perch-…`)
    // (game/interactions.js), the SAME award type as visiting a scenic spot
    // (`scenic-…`). state.feats is keyed by award type only, so there is no
    // way to separate the two from the single pay() hook — feats.scenic is
    // "vantage perches + scenic viewpoints". Chosen anyway because it is the
    // only counter that exists and it is at least directionally right: both
    // halves are "go somewhere and look at the view".
    progress: (state) => ({ have: featTally(state, 'scenic'), need: 10 }),
  },
  {
    id: 'long-zoomies',
    family: 'traversal',
    name: 'Long Zoomies',
    effect: 'Your zoomies charge runs much longer and recharges faster.',
    feat: 'Finish the daily zoomies race',
    // DEVIATION from the spec's "Finish the daily race 3 times". Nothing in
    // the save counts race finishes: state.race holds only { date, area,
    // bestMs } for the CURRENT course, and the race's own award is
    // awardOnce('goal', 'race-done') (main.js) — 'goal' is shared with the
    // three per-walk goal completions, so feats.goal hits 3 in a single
    // ordinary walk and would hand this ability out for free.
    //
    // state.race.bestMs is therefore used as a "have you ever finished a
    // daily race" flag: need 1, not 3. It is monotonic (a new day with no
    // race leaves the previous date/bestMs in place, so it never falls back
    // to null), retroactive for existing saves, and — unlike feats.goal —
    // it cannot be satisfied without actually running the race.
    //
    // UPGRADE PATH: give the race its own AWARDS type at main.js's
    // awardOnce('goal', 'race-done') call site, then switch this to
    // featTally(state, 'race') with need 3. That call site belongs to a
    // Stage 2 task; Task 1.2 is not allowed to touch main.js.
    progress: (state) => {
      const ms = state?.race?.bestMs;
      const finished = typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? 1 : 0;
      return { have: finished, need: 1 };
    },
  },
  {
    id: 'fence-runner',
    family: 'traversal',
    name: 'Fence Runner',
    effect: 'Chain perch to perch along a fence line without dropping to the ground between hops.',
    feat: 'Reach 25 vantage perches',
    // Spec wording is "Climb 25 times". A climb IS a perch hop (the same
    // handleInteract branch in game/interactions.js), and only vantage
    // perches pay out, so feats.scenic is the closest existing counter —
    // the same one Spring Paws reads, at a higher threshold. That mirrors
    // the Sure Claws (25) / Big Swat (40) pair below, which the spec itself
    // stacks on one counter, so a shared traversal counter is in keeping.
    // The displayed feat says "vantage perches" rather than "climbs" so the
    // player is told what actually advances the bar.
    progress: (state) => ({ have: featTally(state, 'scenic'), need: 25 }),
  },

  // --- Senses ------------------------------------------------------------
  {
    id: 'twitchy-nose',
    family: 'senses',
    name: 'Twitchy Nose',
    effect: 'A scent trail drifts toward the nearest collectible you have not picked up yet.',
    feat: 'Collect 20 treasures',
    // AMBIGUITY: 'treasure' is a real AWARDS key, but it pays for the
    // kitten quest's BURIED treasure specifically (one per walk), while the
    // pick-ups this ability points at are awardOnce('collectible', …).
    // feats.collectible is the counter the ability's own effect refers to,
    // so that is the one read here; the spec's display wording is kept
    // because "treasures" is what the game calls collectibles to the player
    // (see GOAL_POOL's 'Collect 2 treasures', which is also type
    // 'collectible').
    progress: (state) => ({ have: featTally(state, 'collectible'), need: 20 }),
  },
  {
    id: 'night-eyes',
    family: 'senses',
    name: 'Night Eyes',
    effect: 'Dusk walks brighten — atmospheric instead of squint-inducing.',
    feat: 'Spot 10 fireflies on dusk walks',
    // DEVIATION from the spec's "Complete 5 dusk walks". Dusk is a per-walk
    // option and is not persisted anywhere: completeWalk only increments
    // state.walks[area], so there is no dusk-walk tally to read and adding
    // one would need a third new save field plus a main.js change, both out
    // of scope for Task 1.1/1.2.
    //
    // state.journal.firefly is used instead because fireflies are
    // DUSK-EXCLUSIVE: game/walk.js passes `spawnFireflies: duskActive` and
    // that is the only firefly spawn path in the game, so every firefly in
    // the journal is proof of a dusk walk. Eight spawn per dusk walk, so
    // need 10 guarantees at least two separate dusk walks — closer to the
    // spec's intent than need 5 (satisfiable in one walk) would be. Also
    // retroactive, which "5 dusk walks" could never have been.
    progress: (state) => ({ have: journalTally(state, 'firefly'), need: 10 }),
  },
  {
    id: 'whisker-sense',
    family: 'senses',
    name: 'Whisker Sense',
    effect: 'A shimmer and a ping whenever an unfound golden mouse is close by.',
    feat: 'Find 3 golden mice',
    // Exact match: state.golden is the list of golden-mouse ids found, and
    // it predates v18, so this feat is fully retroactive.
    progress: (state) => ({ have: goldenCount(state), need: 3 }),
  },

  // --- Social ------------------------------------------------------------
  {
    id: 'charmer',
    family: 'social',
    name: 'Charmer',
    effect: 'Strays warm to you faster — the ♡→♥→💕 ladder climbs on fewer greets.',
    feat: 'Befriend 5 cats',
    // "Befriend" is read as the ♥ rung of the existing friendship ladder
    // (3 greets = 'friend' in progression.js's friendLevel), not merely
    // "met" — a cat you nodded at once is not befriended. Reads
    // state.friends, which predates v18, so this is retroactive.
    progress: (state) => ({
      have: friendGreetCounts(state).filter((g) => g >= FRIEND_GREETS).length,
      need: 5,
    }),
  },
  {
    id: 'far-call',
    family: 'social',
    name: 'Far Call',
    effect: 'A held meow carries far and draws nearby strays and critters toward you.',
    feat: 'Greet 30 cats',
    // AMBIGUITY: feats.friend would also plausibly serve, but it counts
    // awardOnce('friend', …) — the FIRST greet of each cat per walk, i.e.
    // closer to "meet 30 cats". The sum of state.friends[*].greets is the
    // literal lifetime greet count the ♡→♥→💕 ladder is built on, it is
    // capped at one per cat per walk by recordGreet's lastWalk guard (so it
    // cannot be farmed by holding E), and it is retroactive.
    progress: (state) => ({
      have: friendGreetCounts(state).reduce((a, b) => a + b, 0),
      need: 30,
    }),
  },
  {
    id: 'gift-paws',
    family: 'social',
    name: 'Gift Paws',
    effect: 'Leave a gift at a scenic spot for ghosts and co-walkers to find.',
    feat: 'Give or receive 5 gifts',
    // Exact match: 'gift' is its own AWARDS type, paid by both the stray and
    // the ghost gift paths in game/interactions.js. NOT retroactive — the
    // tally starts at zero when v18 ships (see the no-back-fill decision in
    // the spec's Save format section).
    progress: (state) => ({ have: featTally(state, 'gift'), need: 5 }),
  },

  // --- Mischief ----------------------------------------------------------
  {
    id: 'sure-claws',
    family: 'mischief',
    name: 'Sure Claws',
    effect: 'Climb anything — trees, fences, and props that used to be scenery.',
    feat: 'Tip over 25 things',
    // Exact match: every tip-over is awardOnce('mischief', …).
    progress: (state) => ({ have: featTally(state, 'mischief'), need: 25 }),
  },
  {
    id: 'big-swat',
    family: 'mischief',
    name: 'Big Swat',
    effect: 'Your knock-over reach doubles, and tipping cascades into neighbours.',
    feat: 'Tip over 40 things',
    progress: (state) => ({ have: featTally(state, 'mischief'), need: 40 }),
  },
  {
    id: 'sea-legs',
    family: 'mischief',
    name: 'Sea Legs',
    effect: 'Swim — water becomes crossable at a slower paddle.',
    feat: 'Complete 5 seaside walks',
    // Exact match: state.walks.seaside, incremented by completeWalk. Fully
    // retroactive.
    progress: (state) => ({ have: walkCount(state, 'seaside'), need: 5 }),
  },
];

// Catalog ids in catalog order. progression.js's sanitizeSkills imports this
// both for membership validation and for the array cap (a save can never
// hold more unlocked skills than the catalog has entries).
export const SKILL_IDS = SKILLS.map((s) => s.id);

const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

// Ids the save says are already earned. Stored rather than derived (spec):
// once a child has earned an ability, a later threshold change must never
// revoke it. Non-array / non-string entries are ignored rather than throwing.
function persistedSkillIds(state) {
  const skills = state?.skills;
  if (!Array.isArray(skills)) return [];
  return skills.filter((id) => typeof id === 'string');
}

// hasSkill(state, id) → boolean. THE contract every v18 ability gates on.
//
// True when `id` is a real catalog id AND either (a) the save already lists
// it as earned, or (b) its feat predicate is satisfied right now. The union
// is deliberate:
//
//  - (a) alone would mean an ability stays dead until whatever writes
//    state.skills has run, coupling every ability task to the UI task.
//  - (b) alone would let a threshold change revoke an earned ability, which
//    the spec explicitly forbids.
//
// Unknown ids return false rather than throwing, and `state` may be any type
// at all (see the coercion helpers at the top of this file).
export function hasSkill(state, id) {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) return false;
  if (persistedSkillIds(state).includes(id)) return true;
  const { have, need } = skill.progress(state);
  return have >= need;
}

// unlockedSkills(state) → array of earned ability ids, in catalog order.
// Same union rule as hasSkill (persisted OR predicate-satisfied), so the
// caller that writes state.skills can simply persist this list.
export function unlockedSkills(state) {
  return SKILLS.filter((s) => hasSkill(state, s.id)).map((s) => s.id);
}

// skillProgress(state, id) → { have, need } for one ability, or null for an
// unknown id. Convenience wrapper so UI code never has to look the entry up
// itself (and never has to handle a missing entry).
export function skillProgress(state, id) {
  const skill = SKILL_BY_ID.get(id);
  if (!skill) return null;
  return skill.progress(state);
}
