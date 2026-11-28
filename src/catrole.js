// A made cat's ROLE: the pure rules, the numbers and the save field's cleaner.
// Milestone 1 of "choose your cat's role" (docs spec 2026-11-28, owner's
// changes: roles belong to each made cat, thresholds about half the spec's, no
// elder slowdown, name endings only for names from the game's closed list).
//
// A leaf: it imports the ids (wordids.js) and the word door (wordset.js) and
// nothing else. No DOM, no THREE, no word in a string literal: every role is
// a RANK_KEYS id and everything shown goes through rankWord()/phrase().
//
// WHAT IS STORED, per made cat (a customCats record), is `catRole`:
//   born  the walk total when the cat was made (her own walks start from there)
//   pick  null, or a RANK_KEYS id she chose among the special roles
//   stem  null, or a position in the set's PREFIXES list (the closed pool a
//         name ending is built on; never her own typed name)
//   seen  0..2, the highest earned step whose card was shown (milestone 2)
// A cat at the default ({born:0,pick:null,stem:null,seen:0}) carries no field
// at all, so an old save loads byte-for-byte unchanged.
//
// WHAT IS DERIVED, never stored: the earned step (kit -> apprentice ->
// warrior) from the walks the cat has had, so every device and the cloud
// agree and a step is never lost (walk counters only grow).
//
// Nothing here is a punishment or a score: a role is a label, a size and a
// few lines. Nothing takes paws, progress or a cat away.
import { RANK_KEYS, SET_SHAPE } from './wordids.js';
import { rankShown, wordRule, words } from './wordset.js';

// ---- the ONE table of numbers (change thresholds here and nowhere else) ------
export const ROLE_RULES = Object.freeze({
  // earned steps: this cat's own walks
  apprenticeAt: 3,
  warriorAt: 10,
  // special picks: walks needed, plus facts about her game (data only; the
  // picker, milestone 2, reads these). homeGroup = a home group picked,
  // adopted = her own colony adopted.
  picks: Object.freeze({
    [RANK_KEYS.medicine]: Object.freeze({ walks: 20 }),
    [RANK_KEYS.queen]: Object.freeze({ walks: 20 }),
    [RANK_KEYS.deputy]: Object.freeze({ walks: 25, homeGroup: true }),
    [RANK_KEYS.elder]: Object.freeze({ walks: 30 }),
    [RANK_KEYS.leader]: Object.freeze({ walks: 30, homeGroup: true, adopted: true }),
  }),
  // body scale on top of the cat's own size (a Maine Coon kit is still the bigger kit)
  scale: Object.freeze({
    [RANK_KEYS.kit]: 0.8,
    [RANK_KEYS.apprentice]: 0.92,
  }),
  // no role changes walk speed (the elder slowdown was dropped by the owner)
});

// The order the picker lists the special roles in.
export const PICK_ROLES = Object.freeze([RANK_KEYS.medicine, RANK_KEYS.queen, RANK_KEYS.deputy, RANK_KEYS.elder, RANK_KEYS.leader]);

// ---- ids for the lines and goals (the words live in rolelines.js and the sets) ----
// Three lines each; the warrior has none (a warrior hears today's lines).
export const SAY_COUNT = 3;
export const SAY_ROLES = Object.freeze(Object.values(RANK_KEYS).filter((r) => r !== RANK_KEYS.warrior));
export const sayId = (role, n) => `role.say.${role}.${n}`;
// A small goal flavour per role; the warrior has none.
export const GOAL_ROLES = SAY_ROLES;
export const goalId = (role) => `role.goal.${role}`;

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => (isObj(o) && Object.hasOwn(o, k) ? o[k] : undefined);
const isPick = (v) => typeof v === 'string' && Object.hasOwn(ROLE_RULES.picks, v);
const WALK_CAP = 1e9;
const nat = (v, max) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
const PREFIX_COUNT = SET_SHAPE.PREFIXES.length;

export const DEFAULT_ROLE = Object.freeze({ born: 0, pick: null, stem: null, seen: 0 });

// Any input -> a whole, trusted catRole. Total: junk gives the default.
export function sanitizeCatRole(v) {
  if (!isObj(v)) return DEFAULT_ROLE;
  const stem = own(v, 'stem');
  const pick = own(v, 'pick');
  return {
    born: nat(own(v, 'born'), WALK_CAP),
    pick: isPick(pick) ? pick : null,
    stem: typeof stem === 'number' && Number.isInteger(stem) && stem >= 0 && stem < PREFIX_COUNT ? stem : null,
    seen: Math.min(2, nat(own(v, 'seen'), 2)),
  };
}

export function isDefaultRole(r) {
  return r.born === 0 && r.pick === null && r.stem === null && r.seen === 0;
}

// The walks of a save: every area's count added up (junk counts as 0).
export function totalWalks(walks) {
  if (!isObj(walks)) return 0;
  let n = 0;
  for (const k of Object.keys(walks)) {
    const v = walks[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) n += Math.floor(v);
  }
  return Math.min(n, WALK_CAP);
}

// This cat's own walks: the save's total less the total when she was made.
export function catWalks(total, role) {
  const t = typeof total === 'number' && Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  return Math.max(0, t - sanitizeCatRole(role).born);
}

// kit -> apprentice -> warrior by this cat's walks. Total over junk (a kit).
export function earnedRank(walks) {
  const n = typeof walks === 'number' && Number.isFinite(walks) ? walks : 0;
  if (n >= ROLE_RULES.warriorAt) return RANK_KEYS.warrior;
  if (n >= ROLE_RULES.apprenticeAt) return RANK_KEYS.apprentice;
  return RANK_KEYS.kit;
}

// Walks still to go for a pick, 0 when the walks are enough (the card says "N more walks").
export function walksToGo(role, walks) {
  const rule = isPick(role) ? ROLE_RULES.picks[role] : null;
  if (!rule) return 0;
  const n = typeof walks === 'number' && Number.isFinite(walks) ? walks : 0;
  return Math.max(0, rule.walks - Math.floor(n));
}

// The special roles she may be offered now: this set shows the role as itself
// (the everyday set folds the deputy and the queen into the ranger), she has
// the walks, and the group facts hold. `facts` = { walks, homeGroup, adopted }.
export function pickableRoles(facts) {
  const f = isObj(facts) ? facts : {};
  return PICK_ROLES.filter((id) => {
    const rule = ROLE_RULES.picks[id];
    return rankShown(id) === id
      && walksToGo(id, f.walks) === 0
      && (!rule.homeGroup || f.homeGroup === true)
      && (!rule.adopted || f.adopted === true);
  });
}

// The role in force: her pick when this set can show it, else the earned step.
// A pick the set cannot show (the queen under the everyday words) is KEPT in
// the save, so switching back restores it, and reads as the earned step now.
// A stored pick is trusted: thresholds gate the OFFERING, never the keeping.
export function effectiveRole(role, walks) {
  const r = sanitizeCatRole(role);
  if (r.pick !== null && rankShown(r.pick) === r.pick) return r.pick;
  return earnedRank(walks);
}

// The body scale multiplier for a role (1 for everything but kit and apprentice).
export function roleScale(role) {
  return typeof role === 'string' && Object.hasOwn(ROLE_RULES.scale, role) ? ROLE_RULES.scale[role] : 1;
}

// The name she sees on her cat: the stem's name with the role's ending, ONLY
// for a stem from the closed pool, and never in a set whose cats keep their own
// names. Her typed name is never touched (no stem -> `name` unchanged).
export function shownName(name, role, stem) {
  if (!Number.isInteger(stem) || stem < 0 || wordRule('storedNames')) return name;
  const { PREFIXES, RANK_SUFFIX, WARRIOR_SUFFIXES } = words();
  if (stem >= PREFIXES.length) return name;
  const end = Object.hasOwn(RANK_SUFFIX, role) ? RANK_SUFFIX[role] : WARRIOR_SUFFIXES[stem % WARRIOR_SUFFIXES.length];
  return PREFIXES[stem] + end;
}
