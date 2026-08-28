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
// prerequisites. Twelve flat unlocks across four families — the spec's full
// twelve. Sea Legs shipped one wave late: v18 descoped it (CF-12) and v20
// reinstated it once water became solid; the history is on its entry below,
// with a pointer at the end of SKILLS where the descope note used to sit.

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

// A plain top-level numeric field on the save (state.duskWalks). Same
// own-property discipline as featTally above: an attacker
// controls the whole payload, so a tally arriving via the PROTOTYPE of the
// state object must not count toward an ability either.
function topLevelTally(state, key) {
  if (!isPlainObject(state)) return 0;
  if (!Object.prototype.hasOwnProperty.call(state, key)) return 0;
  return countOf(state[key]);
}

// One lifetime per-area walk count out of state.walks (e.g. walks.seaside).
// Structurally identical to featTally above and own-property-guarded for the
// same reason: `walks` may be an object whose PROTOTYPE carries a 'seaside'
// key, and an inherited tally must not buy an ability.
function walkTally(state, area) {
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

// ---------------------------------------------------------------------------
// The ♡→♥→💕 friendship ladder — THE rung table
//
// Which greet number lands on which rung, with and without Charmer. This
// answer used to exist in three places at once — progression.friendLevel's
// hardcoded 1/3/6, straycats.js's FRIEND_RUNGS/CHARMER_RUNGS, and a
// FRIEND_GREETS constant right here — and it promptly drifted: a Charmer
// player was toasted "BEST friend 💕" at four greets while the home-base
// roster still drew ♥ for the same cat and the best-friend gift roll waited
// for six. Every reader now imports friendRungs() from here.
//
// It lives in THIS module rather than progression.js because Charmer is the
// thing that moves the rungs, because progression.js already imports
// skills.js (sanitizeSkills validates against SKILL_IDS) so no new module
// edge is created, and because the reverse edge would be an import cycle.
// straycats.js re-exports friendRungs so its own callers keep their path.
//
// Charmer shortens only the two upper rungs — a charming cat is called a
// friend on its second nose-touch and a best friend on its fourth. 'met'
// stays at the first greet, because there is no shorter first greet than one.
//
// This table names RUNGS ONLY, never accrual. progression.recordGreet's
// once-per-cat-per-walk dedup guard is the only thing between the live
// backend's greet counter and a farming exploit, and no ability may reach it.
// ---------------------------------------------------------------------------
export const FRIEND_RUNGS = { met: 1, friend: 3, best: 6 };
const CHARMER_RUNGS = { met: 1, friend: 2, best: 4 };

export function friendRungs(charmer = false) {
  return charmer ? CHARMER_RUNGS : FRIEND_RUNGS;
}

// ---------------------------------------------------------------------------
// The catalog
//
// Each entry: id, family, name, effect (display), feat (display), and
// progress(state) → { have, need }. `have` is returned RAW (not clamped to
// `need`) so the UI can decide whether to show "27/25" or clamp it, and so
// tests can distinguish need-1 / need / need+1.
//
// FEAT SOURCE MAPPING. Every one of the twelve feats now reads a counter
// that faithfully means what the feat says, and the note on each entry says
// which counter and why. Four of them (Spring Paws, Long Zoomies, Fence
// Runner, Night Eyes) originally shipped reading a PROXY, because the action
// they name was either counted under an award type shared with something
// else ('scenic' also means viewpoints; 'goal' also means ordinary goal
// completions) or not counted at all (dusk walks).
//
// Task 1.4 closed all four, and the shape of the fix is worth knowing before
// you add a thirteenth ability: the existing awards were left completely
// untouched — same type, same points, same goals advanced, same
// discovery-log line — and a PARALLEL tally was added next to each
// (feats.perch, feats.race, state.duskWalks). Retyping an award would have
// been the smaller diff and the wrong move: award types are read by the
// goals system, so changing one silently rebalances live gameplay, which the
// spec's non-goals forbid. If a future feat needs a counter that does not
// exist, add one alongside; do not repurpose an award.
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
    // Exact match, via a dedicated tally (Task 1.4). Reaching a vantage
    // perch pays awardOnce('scenic', `perch-…`) — the SAME award type as
    // visiting a scenic spot — so feats.scenic means "perches + viewpoints"
    // and would unlock this CLIMBING ability for a player who only ever
    // strolled to ten viewpoints.
    //
    // The perch call site (game/interactions.js) therefore records a second,
    // dedicated feats.perch tally ALONGSIDE the unchanged 'scenic' award.
    // The award was not retyped: 'scenic' is what GOAL_POOL's 'scenic-spots'
    // goal ("Visit 2 scenic spots") counts, so retyping it would silently
    // make that goal harder — a rebalance the spec's non-goals forbid.
    //
    // The tally is GATED on that awardOnce returning non-zero, so it counts
    // DISTINCT perches per walk. It has to be: climbing onto a perch and
    // hopping straight back down re-enters the branch, so an ungated tally
    // let 100 taps of one key on one low perch buy this ability and Fence
    // Runner (the v18 final review's confirmed exploit). Re-taking the same
    // perch on a LATER walk does count again — that matches the award, and
    // without it a favourite perch would stop advancing the bar forever.
    //
    // NOT retroactive: feats.perch starts at zero for existing saves, like
    // every other feats tally (the spec's locked no-back-fill decision).
    progress: (state) => ({ have: featTally(state, 'perch'), need: 10 }),
  },
  {
    id: 'long-zoomies',
    family: 'traversal',
    name: 'Long Zoomies',
    effect: 'Your zoomies charge runs much longer and recharges faster.',
    feat: 'Finish the daily zoomies race 3 times',
    // Exact match to the spec, via a dedicated tally (Task 1.4). state.race
    // holds only { date, area, bestMs } for the CURRENT course, so it can
    // only ever answer "have you ever finished one" — and the race's own
    // award is awardOnce('goal', 'race-done'), whose 'goal' type is shared
    // with the three ordinary per-walk goal completions, so feats.goal
    // reaches 3 in a single normal walk and would hand this out free.
    //
    // main.js's race-finish branch therefore records a dedicated feats.race
    // tally ALONGSIDE the unchanged awardOnce('goal', 'race-done') call —
    // not by retyping it, which would change what the goals system and the
    // walk summary see.
    //
    // The count is honest for the same reason the perch tally above is: it
    // is gated on that awardOnce returning non-zero, so it counts one finish
    // per walk. Note "the DAILY race" names the course, not a cap on runs —
    // state.race keys off { date, area }, so three walks in one day can each
    // finish it and each one counts. race.js's idle→running→done machine has
    // no path back, so the gate is belt-and-braces against a future edit
    // rather than a live dedup. NOT retroactive (no back-fill).
    progress: (state) => ({ have: featTally(state, 'race'), need: 3 }),
  },
  {
    id: 'fence-runner',
    family: 'traversal',
    name: 'Fence Runner',
    effect: 'Chain perch to perch along a fence line without dropping to the ground between hops.',
    feat: 'Reach 25 vantage perches',
    // Spec wording is "Climb 25 times". A climb IS a perch hop (the same
    // doPounceOrClimb branch in game/interactions.js) and only vantage
    // perches tally, so this reads the same dedicated feats.perch counter
    // Spring Paws does, at a higher threshold — mirroring the Sure Claws
    // (25) / Big Swat (40) pair below, which the spec itself stacks on one
    // counter. The displayed feat says "vantage perches" rather than
    // "climbs" so the player is told what actually advances the bar.
    progress: (state) => ({ have: featTally(state, 'perch'), need: 25 }),
  },
  {
    id: 'sea-legs',
    family: 'traversal',
    name: 'Sea Legs',
    effect: 'Ponds, canals and the sea stop being walls — you wade in and swim across at a little over half your walking pace.',
    feat: 'Complete 5 seaside walks',
    // ---------------------------------------------------------------------
    // REINSTATED in v20. This is the spec's twelfth ability, descoped by v18's
    // CF-12 and brought back once the ruling's premise stopped being true.
    //
    // WHY IT WAS CUT. CF-12: "water in this game has never carried colliders,
    // so every water body is already a walk-over surface". An ability whose
    // whole content is "water becomes traversable at reduced speed" was
    // therefore a pure DOWNGRADE — it would have taken traversal the player
    // already had and charged 0.55x for it. It was removed from the catalog
    // outright rather than shown locked, because its feat was perfectly
    // earnable and a visible entry would have fired the unlock celebration
    // and then done nothing.
    //
    // WHAT CHANGED. v19 declared every water body as data in its area's
    // `waters`, relocated the content that sat in the drink, and pinned with
    // test/water.test.js that nothing the player must reach is wet and that
    // the dry land of each area is one connected piece. v20 then made water
    // solid in player.update's water pass. Water now BLOCKS, so this ability
    // is the thing that opens it: strictly additive, never a downgrade.
    //
    // STILL A SHORTCUT, NEVER A KEY. Nothing in the game is gated behind it —
    // test/water.test.js's reachability sweep proves every collectible,
    // golden mouse, scenic, POI, perch and spawn is reachable dry in all
    // three watered areas, and test/docks.test.js pins the same for the canal
    // that splits the Docks. A player who never earns this loses distance,
    // not content. That is the constraint any future water authoring inherits.
    //
    // THE FEAT: walks.seaside >= 5, unchanged from the spec, and the only
    // predicate in the catalog that is retroactive off a PRE-v18 tally other
    // than golden/friends. Three areas now hold water (park pond, seaside
    // sea, Docks canal), so summing their walk counts was the obvious
    // alternative and was rejected: park walks are far and away the most
    // common, so the sum would hand this out almost incidentally; "walk 5
    // times in areas that happen to have water" is a rule rather than an
    // errand a child can read off the card and go do; and Sea Legs is named
    // for the sea, which is the seaside and nowhere else.
    //
    // NEED 5, also unchanged. It was set when the ability was worth nothing,
    // so re-examining it was the point — but a WALK is the coarsest unit of
    // progress in this game (one whole session), which makes five of them in
    // one specific area already among the longest errands in the catalog,
    // and it keeps the two walk-counting feats (Night Eyes' "Complete 5 dusk
    // walks") priced identically. The ability is a shortcut, not a key, so
    // there is no content for a higher bar to protect.
    //
    // FAMILY: traversal, moved from the spec's mischief. The families group
    // by what an ability DOES, and this one changes where the cat can go and
    // how fast it moves there — the exact thing Spring Paws (reach), Long
    // Zoomies (speed) and Fence Runner (chaining) share. Nothing about
    // swimming is mischief; the v18 grid only put it there to make the
    // families three apiece, and that arithmetic died with the descope
    // (the catalog shipped 3/3/3/2). Traversal now holds four and mischief
    // still holds two, which is the honest grouping and is also where a
    // player wondering how to get across the canal will look.
    //
    // RETROACTIVE, deliberately: an existing save with five seaside walks
    // holds this the instant it loads, via hasSkill's predicate half, before
    // anything writes state.skills. See the union note on hasSkill below —
    // the ability is live from load, and the celebration lands at the first
    // discovery of the next walk (or at its end), exactly like the other
    // retroactive abilities Whisker Sense, Charmer and Far Call.
    progress: (state) => ({ have: walkTally(state, 'seaside'), need: 5 }),
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
    feat: 'Complete 5 dusk walks',
    // Exact match to the spec, via the additive state.duskWalks save field
    // (Task 1.4). It could not be derived from anything already persisted:
    // completeWalk only counts state.walks[area], which is time-of-day
    // blind, and the earlier stand-in — state.journal.firefly, on the
    // reasoning that fireflies only spawn on dusk walks — counted how many
    // fireflies you happened to CHASE, not how many dusk walks you took.
    //
    // completeWalk now takes the walk's duskActive and bumps duskWalks. It
    // is duskActive rather than the raw duskMode deliberately: a solo walk
    // only actually goes dusk when the glow collar is equipped, so ticking
    // the dusk box without the collar must not credit a dusk walk.
    //
    // NOT retroactive: existing saves start at zero, since nothing recorded
    // dusk before v18.
    progress: (state) => ({ have: topLevelTally(state, 'duskWalks'), need: 5 }),
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
    // "Befriend" is read as the ♥ rung of the friendship ladder above, not
    // merely "met" — a cat you nodded at once is not befriended. Reads
    // state.friends, which predates v18, so this is retroactive.
    //
    // Deliberately the BASE rung (FRIEND_RUNGS.friend), not friendRungs(
    // hasSkill(state, 'charmer')).friend: Charmer's own unlock condition must
    // not read a table Charmer moves. Doing so would make the predicate
    // self-reinforcing — the moment it went true the bar would drop to two
    // greets and more cats would qualify — and since earned abilities are
    // never revoked that hysteresis could only ever run one way.
    progress: (state) => ({
      have: friendGreetCounts(state).filter((g) => g >= FRIEND_RUNGS.friend).length,
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
    feat: 'Give or receive 3 gifts',
    // Exact match: 'gift' is its own AWARDS type, paid by both the stray and
    // the ghost gift paths in game/interactions.js. NOT retroactive — the
    // tally starts at zero when v18 ships (see the no-back-fill decision in
    // the spec's Save format section).
    //
    // Threshold lowered 5 → 3 (Task 4.0). The feat reads "give or receive",
    // but GIVING requires this very ability — so until you hold it the only
    // source is RECEIVING, which needs a best-friend stray (six greets, or
    // four with Charmer) AND a 0.3 roll on top, once per walk at most. Five
    // of those is a long RNG grind for a ten-year-old; three is still a
    // real errand. The wording is deliberately left as "give or receive"
    // because that is exactly what the predicate counts — once earned, a
    // gift you leave advances it too.
    progress: (state) => ({ have: featTally(state, 'gift'), need: 3 }),
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
    effect: 'One swat topples a whole cluster — knocked props take their neighbours down with them.',
    feat: 'Tip over 40 things',
    // The effect line used to promise a doubled knock-over REACH as well.
    // That was implemented as a x2 on tippables.nearest(), which is the same
    // call game/interactions.js drives the prompt from, so it pushed the tip
    // prompt out over greet/quest/scratch/boop/dig and left a Big Swat player
    // unable to greet a cat standing near a crate. The spec's "knock-over
    // radius doubles" is now read as the CASCADE radius only (v18 final
    // review), so the reach clause was dropped from the copy rather than left
    // describing behaviour the ability no longer has.
    progress: (state) => ({ have: featTally(state, 'mischief'), need: 40 }),
  },

  // MOVED, not missing: 'sea-legs' was authored here by the spec (mischief),
  // was DESCOPED from this spot in v18 by CF-12, and was REINSTATED in v20
  // under Traversal once water went solid. Its entry above carries the whole
  // history — why it was cut, what made the ruling's premise false, and why
  // it changed family. This line exists so anyone who comes looking at the
  // end of SKILLS (where the descope note used to live) finds the trail.
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
