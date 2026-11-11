// The walk session: the one list of every field a walk session can hold.
//
// startWalk (game/walk.js) builds a session with createSession({...}) and
// hands it to setSession; main.js, game/interactions.js, game/netevents.js,
// game/avatar.js, game/clanfight.js, game/crossing.js and friends read and
// write it from then on. Before this file the only way to know what a
// session held was to read all of them: the literal in startWalk named some
// fields, and dozens more were assigned onto it later, one by one.
//
// createSession returns a plain, mutable object with EVERY field below
// present from the start: the ones passed in keep their values, the rest
// start as `undefined` — exactly what code saw before the late assignment
// existed, so no reader's behaviour changes (nothing enumerates a session's
// keys). It throws on a key it does not know, so a typo at construction
// fails loudly. It does not seal or proxy the object: production code may
// still assign any field at any time, and test/session.test.js is what
// keeps this list honest — it scans src/ for session field assignments and
// fails on any name missing here.
//
// "Passed in" fields are the ones startWalk's literal supplies (the
// comments beside each initialiser in walk.js say how it is built);
// "late" fields are assigned after construction, by the file named.

/** [name, one-line description] in groups; order here is documentation only. */
const FIELDS = [
  // ── World: the scene and the area it was built from ─────────────────────
  ['scene', 'the THREE.Scene this walk renders'],
  ['areaData', 'the area definition (bounds, colliders, spawn, scenics…) the walk was built from'],
  ['areaId', 'late (walk.js): the area id, set beside the race'],
  ['ground', "the area's ground (groundOf(areaData)) every system stands on"],
  ['tier', "the render quality tier this walk was built at"],
  ['useComposer', 'whether frames go through the post-fx composer (tier.postFx; adaptquality.js may turn it off)'],
  ['duskMode', 'the walk was asked for at dusk'],
  ['duskActive', 'the walk was ACTUALLY dusk (glow-collar gated) — endWalk credits duskWalks from this, not duskMode'],
  ['reducedMotion', 'the reduced-motion setting, read once per walk rather than per frame'],
  ['weather', "this walk's weather (condition, rain…)"],
  ['areaLife', "the area's own life (Gorge birds, cave glow, ambience mix) or NO_AREA_LIFE"],
  ['walkStamp', "this walk's id stamp (kept across a mid-walk resume)"],
  ['soloSeed', "a solo walk's seed for walkresume.js (undefined on a room walk)"],
  ['resumeTries', 'how many times picking this walk up has failed (main.js clears it once it runs)'],
  ['resumed', 'late (walk.js): this walk was picked up again from a mid-walk save'],
  ['healthy', 'late (main.js): the last frame ran clean — false after a frame error, true again after a good frame'],

  // ── Render rigs: each a { update, dispose }-shaped helper ───────────────
  ['fx', 'one-shot particle effects (createFx)'],
  ['water', "the area's water surfaces bundled as one rig (safe with no water)"],
  ['waterDress', "the area's water dressing (reeds, lily pads…)"],
  ['wind', 'the wind field the area registered into'],
  ['grass', 'lawn tufts, updated beside wind'],
  ['duskLawn', "the dusk tint on ground and grass (when the walk has a dusk look)"],
  ['paws', 'paw prints the cat leaves'],
  ['splash', 'water splashes'],
  ['fish', 'fish jumping in the water'],
  ['clouds', 'drifting sky clouds (render/clouds.js), per-area seed, never walkRng'],
  ['ambient', 'drifting leaves and fluff (reads the weather live)'],
  ['shadows', "the sun's view-following shadow camera rig, refitted every frame after the player moves"],
  ['decals', 'contact-shadow decals, updated once per frame after everything that owns one moved'],
  ['skyLife', 'sky birds on their own rng stream (no-op stub in the den)'],
  ['treeFade', 'late (walk.js): fades trees that hide the cat from the camera'],
  ['rustle', 'late (walk.js): bush rustles as the cat brushes past'],
  ['fightCam', 'late (walk.js): the fight camera, or null where no fight can happen'],
  ['minimap', 'late (walk.js): the corner map, or null in the den'],
  ['minimapShown', "late (walk.js, main.js): the player's engaged state the corner map last showed, or null"],
  ['raceRingShown', 'late (walk.js, main.js): the race ring the HUD last pointed at, or null'],

  // ── The player's cat ────────────────────────────────────────────────────
  ['cat', "the player's cat group"],
  ['pose', 'the wire pose this frame (avatar.js), sent to co-walkers'],
  ['idleTime', 'seconds standing still (avatar.js)'],
  ['freezeTime', 'seconds the cat is frozen (a scuffle, a fright)'],
  ['boxTime', 'seconds sitting in a box'],
  ['perched', 'the perch the cat is on, or null'],
  ['pounceTime', 'seconds left in the current pounce'],
  ['pounceCooldown', 'seconds until the next pounce'],
  ['landTime', 'seconds of landing squash left'],
  ['stepPhase', 'the walk-cycle phase'],
  ['slowmoTime', 'seconds of slow-mo left (a stalked hunt)'],
  ['stretchTime', 'seconds of wake-up stretch left'],
  ['sniffTime', 'seconds of sniff left'],
  ['rest', 'the current rest { kind, t } (a drink, a nap), or null'],
  ['chasing', 'late (walk.js): a dog or rival is chasing the cat (avatar.js plays the run gait)'],
  ['slopeTilt', 'late (avatar.js): the eased { pitch, roll } lean into the slope'],
  ['cameraMode', 'photo camera mode is on'],
  ['wasZooming', 'the cat was doing zoomies last frame'],
  ['zoomTrailAccum', 'seconds since the last zoomies trail puff'],

  // ── Other cats and creatures ────────────────────────────────────────────
  ['critters', 'mice, birds and other critters to hunt'],
  ['strayCats', 'the stray cats (straycats.js)'],
  ['clanCats', "the territory's clan, a list apart from the strays (Clan Life Part 1)"],
  ['denCats', 'colony cats lounging in the den (den only)'],
  ['ghosts', "friends' ghost cats (NO_GHOSTS until rolled)"],
  ['remotes', "co-walkers' cats"],
  ['clanBuddy', 'the clanmate on patrol with me, or null (interactions.js)'],
  ['intruders', 'late (walk.js): a neighbouring clan\'s warrior crossing the territory, or NO_INTRUDERS'],
  ['clanFight', 'late (walk.js): the clan fight / border-patrol fight, or NO_CLAN_FIGHT'],
  ['rival', "late (walk.js): the rival's border and its patrol, or NO_RIVAL"],
  ['dog', 'late (walk.js): the yard dog'],
  ['kittenEnc', 'late (walk.js): the lost-kitten encounter, or null'],
  ['kittenPlanKind', 'late (walk.js): which kitten encounter was planned, or null'],
  ['enemies', "the enemy system's per-walk scratch log (who swatted, who was forgiven)"],

  // ── Clan and territory ──────────────────────────────────────────────────
  ['campMarker', "the clan camp's marker for the corner map, or null"],
  ['postMarkers', 'border posts for the corner map (null in the den and in Legacy)'],
  ['clanPaid', 'per-walk pay caps for the clan verbs (interactions.js CLAN_PAY_CAP)'],
  ['clanHome', 'late (walk.js): the clan whose home this territory is, or null'],
  ['clanEdition', 'late (walk.js): the save is on the Clan Edition'],
  ['colonyWalk', 'solo, or a room of only my colony partner — gates the live colony-feed event'],
  ['crossing', 'late (crossing.js): the border-crossing card being asked { to, name, going? }, or null'],
  ['crossLed', 'late (crossing.js): a co-walker already led this walk across a border'],

  // ── Things in the world ─────────────────────────────────────────────────
  ['collectibleMeshes', 'collectible id → mesh'],
  ['goldMice', 'late (walk.js): golden mice, or the inert NO_GOLD_MICE stub'],
  ['secrets', 'secret spots to find'],
  ['tippables', 'things the cat can tip over'],
  ['knockables', 'things the cat can knock off a ledge'],
  ['pushThroughs', 'cat flaps and other push-through gaps'],
  ['rests', 'places to drink or nap (birdbaths…)'],
  ['playerMarks', "the player's scent marks and scratch posts"],
  ['gifts', 'gifts stashed at scenics'],
  ['scent', 'the scent trail system (draws on walkRng)'],
  ['scenicsVisited', 'late (walk.js): scenic ids visited this walk, or null in the den'],
  ['balkedPuddles', 'puddles the cat has already balked at'],
  ['race', 'late (walk.js): the climb race, or null'],
  ['raceDate', "late (walk.js): today's date, for the race's once-a-day best"],

  // ── Quest, carry, toy ───────────────────────────────────────────────────
  ['quest', 'the current quest, or null'],
  ['questGiver', "the quest giver's cat"],
  ['questObject', 'the quest object to find'],
  ['questTrailAt', 'late (interactions.js): when the quest trail was last laid'],
  ['carry', "carrying: the mouth, the carryable items, and the deck test"],
  ['walk', 'per-walk carry tally { carried, carryCap }'],
  ['toy', 'the toy ball'],
  ['toyGhost', "the yarn-rally ghost ball: a marker at a remote player's toy, batted to ask for authority"],
  ['remoteToy', "a co-walker's toy state { ownerId, pos, at }, or null"],
  ['batCount', 'how many bats in a row the toy has had'],
  ['batReady', 'the toy can be batted again'],

  // ── Senses, prompts, moments ────────────────────────────────────────────
  ['noseNextAt', 'late (interactions.js): when the nose hint may refresh next'],
  ['whiskerNextAt', 'late (interactions.js): when the whisker tingle may fire next'],
  ['prompt', 'the action prompt on screen, or null'],
  ['lastPromptKind', 'the kind of the last prompt shown, or null'],
  ['momentTimer', 'seconds until the next ambient moment'],
  ['activeMoment', 'the ambient moment playing { m, timeLeft }, or null'],

  // ── Score and goals ─────────────────────────────────────────────────────
  ['goals', "this walk's goals, or null in the den (every consumer treats null as no goal HUD)"],
  ['startPoints', 'points at walk start, for the summary'],
  ['discoveryCount', 'discoveries this walk'],
  ['catsGreeted', 'cats greeted this walk'],
  ['rankTitle', 'the rank title shown, updated when it changes'],

  // ── Fight (clanfight.js) ────────────────────────────────────────────────
  ['fight', 'late (clanfight.js): the fight in progress, or null'],
  ['fightPose', "late (clanfight.js): the cat's pose in the fight"],
  ['fightLift', "late (clanfight.js): the cat's lift in the fight"],
  ['fightPitch', "late (clanfight.js): the cat's pitch in the fight"],
  ['fightRoll', "late (clanfight.js): the cat's roll in the fight"],
  ['fightGait', "late (clanfight.js): the cat's run speed walking over to the fight"],

  // ── Online: rooms and co-walks ──────────────────────────────────────────
  ['net', 'late (walk.js): the room connection — undefined on a solo walk'],
  ['playerId', 'late (walk.js): my id in the room — undefined on a solo walk'],
  ['petName', "late (walk.js): my cat's name as co-walkers see it — undefined on a solo walk"],
  ['netSendAccum', 'seconds since the last position send'],
  ['isBlocked', 'late (walk.js): (id) → whether I blocked that player — room walks only'],
  ['chatBubbles', 'late (walk.js): chat bubbles over cats'],
  ['chatWheel', 'late (walk.js): the phrase wheel'],
  ['sendPhrase', 'late (walk.js): sends a chat phrase (keyboard-driven send)'],
  ['chatHintPending', 'late (walk.js, main.js): the chat hint is still to be shown'],
  ['pendingBoop', 'a boop I asked for, or null'],
  ['incomingBoop', 'a boop asked of me, or null'],
  ['tagChain', 'the pounce-tag chain, or null'],
  ['groomTimers', 'player id → mutual-grooming timer'],
  ['duetWindow', 'the open meow-duet window, or null'],
  ['rally', 'the yarn rally in progress { count, lastId, at }, or null'],

  // ── Start and end of the walk ───────────────────────────────────────────
  ['welcome', 'late (walk.js): the welcome line on the Ready card'],
  ['portrait', "late (walk.js): her cat's picture for the Ready card and summary"],
  ['started', 'late (walk.js, main.js): the Ready card has been dismissed'],
  ['startLines', 'late (walk.js): lines to toast once the walk starts, or null'],
  ['arrivalLine', "late (walk.js): the wanderer's arrival line, or null"],
  ['moveLines', 'late (walk.js): toasts for newly unlocked fight moves, or null'],
];

/** Every field a walk session can hold, in the order above. */
export const SESSION_FIELDS = Object.freeze(FIELDS.map(([name]) => name));

const KNOWN = new Set(SESSION_FIELDS);

/**
 * createSession(fields) → a plain mutable session with every SESSION_FIELDS
 * key present: the values passed in, `undefined` for the rest. Throws on an
 * unknown key (a typo at construction).
 */
export function createSession(fields) {
  for (const key of Object.keys(fields)) {
    if (!KNOWN.has(key)) throw new Error(`createSession: unknown session field "${key}" (add it to src/game/session.js)`);
  }
  const session = {};
  for (const name of SESSION_FIELDS) session[name] = Object.hasOwn(fields, name) ? fields[name] : undefined;
  return session;
}
