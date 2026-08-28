// v20 "Ruffled Fur" — the data and rules layer for the enemy system.
//
// Greeting a stray can go badly: the cat takes against you and stays cross
// across walks until a gift makes it up to it. This module owns the RULES —
// the hostility roll, the chance and its modifiers, the grudge predicates,
// and the scuffle's cost and rate limit. It owns no pixels, no prompts, no
// audio and no save writes; the world/UI half wires against the API below
// and every persisted mutation goes through progression.js.
//
// PURITY, and the one import.
//
// This is modelled on src/skills.js: no THREE, no DOM, nothing from
// src/game/* or src/main.js, no module-scope side effects, and every
// predicate total over a hostile save payload (see the coercion preamble
// below). It is callable from a unit test, from the home-base UI and from
// deep inside the per-frame render loop alike.
//
// It is NOT zero-import, and that is deliberate. It imports exactly two
// modules, both of which are themselves zero-import, so both edges are
// unconditionally cycle-free. skills.js, for two things this module must not
// own a second copy of:
//
//   * friendRungs(), THE rung table. D5 makes a cat at the `friend` or
//     `best` rung permanently immune, so "which rung is this cat on" is a
//     load-bearing input here. That question already lived in three places
//     at once before v18 and promptly drifted (CF-4: a Charmer player was
//     toasted "BEST friend 💕" at four greets while the roster still drew ♥
//     for the same cat). Re-deriving it here would be a fourth copy.
//   * hasSkill(), because Charmer is one of the two modifiers on the chance
//     and is also what moves the rungs.
//
// progression.js imports THIS module (for bearsGrudge / isGrudgeName), the
// same way it already imports SKILL_IDS from skills.js, so there is exactly
// one definition of "is this cat cross with me". The resulting graph is
// enemies → skills, progression → { skills, enemies }: acyclic, and skills.js
// keeps its zero-import property untouched.
//
// And rng.js, for mulberry32/seedFromCode: that module exists precisely so
// seeded randomness is not re-implemented per caller, and copying it here to
// preserve a zero-import badge would be the wrong trade.

import { friendRungs, hasSkill } from './skills.js';
import { mulberry32, seedFromCode } from './rng.js';

// ---------------------------------------------------------------------------
// Hostile-state coercion
//
// Every predicate below reads a save object that may have arrived from the
// cloud `saves` table, which stores the payload as opaque jsonb with no
// server-side shape validation (docs/supabase-setup.sql's load_save). It can
// therefore be ANY type — a string, a number, null, an array — with any
// sub-object mistyped or missing. These helpers mirror skills.js's own
// preamble, which mirrors progression.js's asFiniteNonNeg; they are
// duplicated rather than imported because progression.js is the module that
// imports THIS one and the reverse edge would be a cycle. Nothing here may
// ever throw.
// ---------------------------------------------------------------------------

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Anything that isn't a plain finite non-negative number reads as 0, so a
// hostile payload's '9e99', {}, NaN, Infinity or -1 can never satisfy a
// rung check.
function countOf(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

// One cat's lifetime greet count out of state.friends. Own-property checked
// for the same reason skills.js's featTally is: an attacker controls the
// whole payload, and an INHERITED entry (a `friends` object whose prototype
// carries 'Pickles') must not make a cat look befriended — here that would
// hand out D5's permanent immunity for free.
function greetsFor(state, name) {
  const friends = state?.friends;
  if (!isPlainObject(friends) || typeof name !== 'string') return 0;
  if (!Object.prototype.hasOwnProperty.call(friends, name)) return 0;
  const f = friends[name];
  return isPlainObject(f) ? countOf(f.greets) : 0;
}

// ---------------------------------------------------------------------------
// The grudge's name vocabulary
//
// D1: a grudge is keyed on the cat's NAME, because that is the only identity
// a stray has across walks — state.friends is keyed the same way, and
// straycats.js derives breed from the name, so a given name is always the
// same cat when it is redrawn into a later walk's 22-of-48 shuffle.
//
// The accepted shape is exactly sanitizeFriends' key rule (a non-empty
// string of at most 24 characters) and for exactly the same reason: the two
// tables are keyed on the same thing, and a name that could live in one but
// not the other would be a cat that can be your friend but never cross with
// you, or the reverse. 24 comfortably clears the longest shipped stray name
// ('Baron von Fluff', 15) with room for future ones.
//
// Nothing beyond length is checked. A name is never used as an object key
// anywhere in this feature (see sanitizeGrudges in progression.js — the
// persisted field is an ARRAY of strings), and it is escaped at render like
// every other cat name, so '__proto__' is inert as a value rather than
// something that has to be filtered out.
// ---------------------------------------------------------------------------
export const GRUDGE_NAME_MAX = 24;

export function isGrudgeName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= GRUDGE_NAME_MAX;
}

// ---------------------------------------------------------------------------
// The chance
//
// BASE = 5%. One greet in twenty goes badly.
//
// GOAL BALANCE (spec §5). GOAL_POOL's 'greet-cats' goal ("Greet 3 cats",
// type 'friend', target 3) counts awardOnce('friend', …) discoveries, and a
// hostile greet pays nothing — so the hostile chance is a tax on the supply
// of friend awards and the 3-friend goal must never be in danger. A walk
// spawns 22 strays (14 on the coarse/mobile tier — game/walk.js:495), so:
//
//   * EXPECTED HOSTILE COUNT PER WALK: 22 x 0.05 = 1.1 cross cats, i.e.
//     about one a walk. On the coarse tier it is 14 x 0.05 = 0.7, and for a
//     Charmer player it halves to 0.55 (0.35 coarse).
//   * The goal needs 3 friendly greets out of 22 candidates. It is only
//     unreachable if 20 or more of the 22 roll hostile, which is
//     C(22,20) x 0.05^20 x 0.95^2 ≈ 2e-24 — not a risk, a rounding error.
//   * The real cost is the extra walking: 3 / 0.95 ≈ 3.16 greets to collect
//     3 awards, i.e. one extra cat approached every six walks or so.
//   * Grudges PERSIST (D1) and a cross cat offers no greet prompt, so the
//     supply also shrinks over time. It cannot shrink below the goal in
//     practice: with 48 names in straycats.js's CAT_NAMES and 22 drawn per
//     walk, fewer than 3 greetable cats on the map needs ~42 of the 48 names
//     cross at once — ~38 walks of never once offering a gift AND never once
//     getting a cat to the `friend` rung, which is where D5's permanent
//     immunity takes cats out of the rollable pool three greets at a time.
//
// The chance is also floored by the feature having to be VISIBLE: at 5% a
// child meets a cross cat on most walks, which is what makes the
// reconciliation beat — the whole point of the wave — something they
// actually get to play.
//
// CHARMER halves it rather than zeroing it. D5 names Charmer as a modifier
// on the chance, and it is the game's existing "cats like you more"
// ability, so the direction is not in question; halving keeps the mechanic
// alive for a player who has earned it instead of switching the feature off
// for everyone past five befriended cats.
// ---------------------------------------------------------------------------
export const HOSTILE_CHANCE = 0.05;
export const CHARMER_HOSTILE_CHANCE = 0.025;

// The one place the modifier is applied. Both public entry points below go
// through it so the chance cannot be selected two ways — the same
// single-table discipline friendRungs enforces for the rungs.
function chanceWith(charmer) {
  return charmer ? CHARMER_HOSTILE_CHANCE : HOSTILE_CHANCE;
}

// hostileChance(state) → the chance THIS save rolls against. Takes the whole
// save rather than a boolean so no caller has to remember which skill id
// moves it; a garbage state simply reads as "no Charmer" and gets the base
// rate. Exported for the Skills tab / debug readouts — the greet path wants
// shouldTurnHostile, not this.
export function hostileChance(state) {
  return chanceWith(hasSkill(state, 'charmer'));
}

// ---------------------------------------------------------------------------
// The roll — read spec §3 before changing anything here
//
// walkRng is THE WRONG STREAM and must not be used. game/walk.js:272-287 is
// explicit: it may have no lazy or conditional consumers, because two
// co-walkers on one room seed would draw it a different number of times and
// silently diverge from that point on. A greet-time roll is by definition
// lazy, conditional and player-paced — precisely the forbidden case.
//
// Bare Math.random() is also wrong: CF-7, the firefly desync and the Far
// Call approach note are three separate scars from exactly that.
//
// So the roll is a pure function of a DERIVED per-(walk, cat) seed — the
// same construction catreplies already uses for picking a cat's spoken line
// (game/walk.js:760). Both inputs are already in hand at the greet site. It
// is order-independent, so it cannot desync anything; it is stable within a
// walk, so the same greet cannot be re-rolled by mashing E; and because D4
// makes hostility a private per-device fact, it does not matter that
// walkStamp differs between clients.
//
// That stability is also the anti-farm property. There is no "try again":
// (walkStamp, name) fixes the answer for the whole walk, so no amount of
// re-approaching, re-greeting or greeting-by-chat can shake a different
// outcome out of the same cat. Compare the v18 feats.perch exploit, where an
// ungated tally let one perch be re-counted a hundred times.
// ---------------------------------------------------------------------------

// Keeps the hostility stream from being the SAME number catreplies derives
// from the same (walk, cat) pair. The two already diverge downstream (they
// run different functions over the seed), but a shared seed is a coupling
// waiting to matter — a cat's hostility must never correlate with which line
// it happens to speak. 0x9e3779b9 is the usual golden-ratio mixing constant.
const HOSTILE_SALT = 0x9e3779b9;

// hostileSeed(walkStamp, name) → uint32. Exported so a test can assert both
// outcomes deterministically by naming a seed rather than guessing at one.
//
// This is catreplies' per-(walk, cat) construction — a per-walk base plus a
// per-cat offset, order-independent and stable within a walk — with ONE
// deliberate substitution. catreplies takes its per-cat offset from
// game/util.js's hashName, a plain SUM OF CHAR CODES, and a sum collides on
// any permutation of the same letters: over straycats.js's 48 shipped names
// it yields only 43 distinct offsets, so five pairs of cats would share an
// outcome on every walk, forever. That is invisible in catreplies (two cats
// saying the same line is fine) and is not fine here.
//
// The offset therefore comes from seedFromCode — the FNV-1a hash rng.js
// already exports, which separates all 48 names, and separates them on every
// walk once the base is added. Using it also means this module needs nothing
// from src/game/*, which the header rules out anyway.
//
// Both inputs are coerced through String() because seedFromCode calls
// .toUpperCase(): an absent or hostile walkStamp/name must roll, not throw.
export function hostileSeed(walkStamp, name) {
  const base = seedFromCode(String(walkStamp ?? ''));
  const offset = seedFromCode(String(name ?? ''));
  return ((base + offset) ^ HOSTILE_SALT) >>> 0;
}

// rollHostile(walkStamp, name, { charmer }) → bool. THE roll, with no
// eligibility rules attached — see shouldTurnHostile below for the one
// callers should actually use. Split out so a test can pin the roll itself
// (both outcomes, from named seeds) separately from the immunity rules.
//
// Exactly one draw from a mulberry32 seeded on the pair. One draw, not a
// retained generator: a retained one would make the answer depend on how
// many times it had been called, which is the lazy-consumer bug this whole
// construction exists to avoid.
export function rollHostile(walkStamp, name, { charmer = false } = {}) {
  return mulberry32(hostileSeed(walkStamp, name))() < chanceWith(charmer);
}

// ---------------------------------------------------------------------------
// Grudge predicates — "is this cat cross with me, given a save"
//
// state.grudges is an array of cat names (see progression.js's
// sanitizeGrudges for the shape and why it is an array rather than an
// object). Both readers below are total over garbage: a grudges field that
// is a string, a number, null or an object reads as "no grudges" rather
// than throwing.
// ---------------------------------------------------------------------------

// bearsGrudge(state, name) → bool. progression.hasGrudge delegates to this
// so the live save and any loose payload answer the same question the same
// way.
export function bearsGrudge(state, name) {
  if (!isGrudgeName(name)) return false;
  const grudges = state?.grudges;
  return Array.isArray(grudges) && grudges.includes(name);
}

// grudgeNames(state) → a fresh array of the names this save is cross with,
// for the home-base roster and the "who do I still owe a gift" UI. Fresh so
// a caller can sort or splice it without touching the save; filtered so a
// payload that padded the array with non-strings cannot reach a renderer.
export function grudgeNames(state) {
  const grudges = state?.grudges;
  if (!Array.isArray(grudges)) return [];
  return grudges.filter(isGrudgeName);
}

// ---------------------------------------------------------------------------
// Eligibility — D5, "a friend never turns on you"
// ---------------------------------------------------------------------------

// isHostilityImmune(state, name) → bool. A cat at the `friend` or `best`
// rung is immune, PERMANENTLY. Reads the shared rung table through
// friendRungs(hasSkill(state, 'charmer')) — the exact expression
// progression.friendLevel uses — so a Charmer player's cats become immune on
// the same greet the roster starts drawing them as ♥, and CF-4 cannot
// recur here.
//
// Note the asymmetry with Charmer's own feat predicate in skills.js, which
// deliberately reads the BASE rung to avoid a self-reinforcing unlock. There
// is no such loop here: immunity does not feed back into whether Charmer is
// earned.
export function isHostilityImmune(state, name) {
  const rungs = friendRungs(hasSkill(state, 'charmer'));
  return greetsFor(state, name) >= rungs.friend;
}

// shouldTurnHostile(state, name, walkStamp, opts) → bool. The single
// question the greet path asks: does THIS greet of THIS cat on THIS walk go
// badly? Ordered cheapest-and-most-decisive first.
//
// `forgivenThisWalk` closes a beat that would otherwise be broken. The roll
// is a pure function of (walkStamp, name), so a cat that rolled hostile at
// the start of a walk STILL rolls hostile after you have made it up to it —
// reconciling and then greeting would drop the cat straight back into a
// grudge and the payoff beat would eat itself. The reconciliation path
// therefore marks the name forgiven for the rest of the walk (see
// createEnemyWalkLog below) and passes that flag here, which is what lets
// spec §4's "the greet then proceeds normally" actually be normal.
//
// Callers are still responsible for D2: strays only, never the named family
// pets and never ghost visitors. That guard belongs at the call site,
// because this module has no way to tell one cat object from another.
export function shouldTurnHostile(state, name, walkStamp, { forgivenThisWalk = false } = {}) {
  if (!isGrudgeName(name)) return false;
  if (forgivenThisWalk) return false;
  if (bearsGrudge(state, name)) return false;      // already cross; nothing to roll for
  if (isHostilityImmune(state, name)) return false; // D5
  return rollHostile(walkStamp, name, { charmer: hasSkill(state, 'charmer') });
}

// ---------------------------------------------------------------------------
// The scuffle — D3 and D6
//
// D6: built from the vocabulary the dog scare already established
// (critters.js → main.js:412, which sets session.freezeTime = 1.5, halts the
// player and plays the `scared` pose) plus a point cost. No hit points, no
// health bar, no way to lose a walk.
//
// SCUFFLE_FREEZE is that same 1.5s, named here rather than retyped at the
// call site so the two hostile mechanics in the game cannot drift apart.
//
// SCUFFLE_COST = 5 spendable points. Sized against the award it stands
// opposite: AWARDS.friend is 6, so a scuffle costs slightly LESS than the
// greet that went wrong would have paid. That is the sting the user asked
// for — fewer hats this week — without a bad walk ever ending in the red.
//
// SCUFFLE_MAX_PER_WALK = 3, and at most ONE per cat per walk. Both caps are
// load-bearing:
//
//   * per cat, because a cross cat you are standing next to would otherwise
//     swat you every time a 1.5s freeze expired, which drains a player who
//     is merely trying to walk past;
//   * per walk, because grudges persist and accumulate — a player with
//     fifteen grudges crossing a map of 22 strays could otherwise be taxed
//     fifteen times in one walk for a feature they are actively trying to
//     fix. Three caps the worst walk at 15 points, which is most of a Bell
//     Collar (20) and a small fraction of an ordinary walk's take (three
//     goals alone pay 45, plus 40 for the jackpot).
//
// The cost is deducted through progression.deductPoints, which touches
// state.points ONLY and floors at zero. state.lifetimePoints is never
// touched, so a rank can never go backwards — see D3 and the comment on
// deductPoints itself.
// ---------------------------------------------------------------------------
export const SCUFFLE_COST = 5;
export const SCUFFLE_FREEZE = 1.5;
export const SCUFFLE_MAX_PER_WALK = 3;

// createEnemyWalkLog() → the per-walk, in-memory scratch state the enemy
// system needs. Nothing here is persisted: both facts it holds are true only
// for the walk in progress, and a walk that ends simply drops it.
//
// It is a factory rather than module state for the reason every other
// per-walk object in the game is (goals, the discovery log): two sessions
// must never share one, and a test must be able to make a fresh one.
//
// allowScuffle(name) mutates on success, mirroring walk.js's
// sendGate.allow(playerId) — the caller writes `if (!log.allowScuffle(name))
// return;` and the rate limit is impossible to forget. It is the ONLY thing
// that may authorise a deduction, so the point cost is charged at most
// SCUFFLE_MAX_PER_WALK times per walk no matter how the call site is wired.
//
// The caller must ALSO gate on session.freezeTime <= 0 (spec §4: a scuffle
// must never fire while the player is already frozen) and on bearsGrudge.
// Those are session/save reads this module has no handle on.
export function createEnemyWalkLog() {
  const scuffled = new Set();
  const forgiven = new Set();
  return {
    // true at most once per cat and at most SCUFFLE_MAX_PER_WALK times per
    // walk; marks the cat used on the way out.
    allowScuffle(name) {
      if (!isGrudgeName(name)) return false;
      if (scuffled.has(name)) return false;
      if (scuffled.size >= SCUFFLE_MAX_PER_WALK) return false;
      scuffled.add(name);
      return true;
    },
    scuffleCount() {
      return scuffled.size;
    },
    // Marks a cat reconciled for the remainder of this walk. Call it only
    // when progression.forgiveGrudge actually returned true, so a no-op
    // forgive cannot silently grant a re-roll exemption.
    markForgiven(name) {
      if (isGrudgeName(name)) forgiven.add(name);
    },
    wasForgiven(name) {
      return isGrudgeName(name) && forgiven.has(name);
    },
  };
}
