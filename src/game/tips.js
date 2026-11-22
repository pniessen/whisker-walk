// The hints on a walk: gathers the facts src/hints.js asks about, hands it the
// things that just happened, and puts the line on the HUD. (Design:
// .claude/plans/guided-first-walk-design.md, section 4.)
//
// Everything here is this device's own: nothing is sent to a co-walker,
// nothing is read from one, and no dice are thrown, so two players' worlds
// stay the same whatever either is being told. The facts are read a few
// times a second, not every frame.
//
// Things that happen in a moment arrive on the bus:
//   bus.emit('tip', { id, name })   the thing a hint is about just happened
//   bus.emit('tip:did', { id })     the child did what a hint asks
// The guided first walk (step 3 of the build) reaches the engine as
// session.hints (setBlocked(true) while one of its steps is open).

import { createHints } from '../hints.js';
import { line } from '../tutorialwords.js';
import { onTv } from '../tvseam.js';
import { bus } from '../events.js';
import { bestPerch, climbBudget, fenceRunning } from '../climbing.js';
import { FLAT_GROUND } from '../ground.js';
import * as THREE from 'three';
import { villagerPos } from '../critters.js';
import { TWINKLE_RANGE } from '../foundwear/rules.js';

// The small picture beside each line: things the game already draws.
export const HINT_PICS = Object.freeze({
  look: '👀', creep: '🐾', jump: '🐾', hop: '🐾', photo: '📷', frame: '📷', yarn: '🧶', bat: '🧶', 'yarn-carry': '🧶', tkey: '🧶',
  call: '😺', sniff: '👃', box: '📦', help: '❗', hiss: '😾', dog: '🐶', swim: '💧', carry: '🐾',
  home: '🏠', chat: '💬', rival: '🐾', stranger: '🐾',
  roofs: '🕊️',
  market: '🧺',
  house: '🕰️',
  find: '✨', 'find-kept': '👕', map: '🗺️',
});

const FACTS_EVERY_S = 0.25;
const LOOKED_RAD = 0.6;        // this much turning is "has looked around"
const CRITTER_NEAR_M = 9;
const BOX_NEAR_M = 2;
const HELP_NEAR_M = 14;
const STRAY_REACH_M = 6;       // closer than this, a cat is as good as in reach
const STRAY_FAR_MIN_M = 10;
const STRAY_FAR_MAX_M = 18;
const YARN_NEAR_M = 8;

const helpAt = new THREE.Vector3();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Ahead of the view, loosely: in the front half and not far off to one side.
function ahead(from, fwd, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  return d < 0.5 || (dx * fwd.x + dz * fwd.z) / d > 0.35;
}

// What the Fairground's rides would do with the press (src/fairlive.js
// pawKind): 'up', 'down', 'none' or null (not theirs). Asked from the ground,
// a perch or a seat alike: on the merry-go-round's platform the press hops
// up onto a horse, and on the coaster's platform it boards the train, or does
// nothing while the train is away. Never while the moves are busy.
function ridePaw(session, player) {
  if (session.traversal?.busy || !session.fair?.pawKind) return null;
  return session.fair.pawKind(session.cat, player, session);
}

// climbInReach(session, player, state) -> true when the paw would climb:
// a perch in reach from where the cat is (a higher one, when perched), or a
// seat of one of the Fairground's rides (src/fairlive.js). In the press's own
// order (game/interactions.js doPounceOrClimb): a ride's seat first (never
// while the moves are busy), then the moves (src/traversallive.js) where they
// would take the press (true for a climb-up, false for a leap, a drop, a look
// or a press on a crossing or mid-hop), then the perches. NO_TRAVERSAL (every
// shipped area) never takes it.
export function climbInReach(session, player, state, ride = ridePaw(session, player)) {
  if (player.swimming || session.chasing) return false;
  if (ride) return ride === 'up';
  const move = session.traversal?.pressKind?.({ cat: session.cat, player, session }) ?? null;
  if (move) return move === 'climb';
  const ground = session.ground ?? FLAT_GROUND;
  const next = bestPerch(session.areaData.perches ?? [], session.cat.position, player.perchY, session.perched, climbBudget(state),
    { fenceRun: fenceRunning(state), state, ground });
  // From a perch, bestPerch also offers drops; only a higher perch is a climb.
  if (next && (!session.perched || next.y > player.perchY + 0.05)) return true;
  return false;
}

// climbBadge(session, player, state) -> 'up' (a climb in reach), 'down' (on a
// perch with nothing higher in reach: the paw hops down) or null. The paw
// button wears it (ui/touchui.js setClimb, controls review 2026-11-19), from
// the facts the hints use; main.js asks a few times a second.
export function climbBadge(session, player, state) {
  if (!session?.cat || !session.areaData || session.fight) return null;
  const ride = player.swimming || session.chasing ? null : ridePaw(session, player);
  if (climbInReach(session, player, state, ride)) return 'up';
  if (ride) return ride === 'down' ? 'down' : null; // waiting for the next seat: the paw does nothing just now
  return session.perched ? 'down' : null;
}

// walkFacts(session, { player, state, camera }) -> the facts for src/hints.js,
// written into `f` (one object, reused). Reads only; `turned` and `t` are the
// caller's running totals.
export function walkFacts(session, { player, state }, f = {}) {
  const cat = session.cat.position;
  const fwd = player.forward();
  f.place = session.areaId;
  // The walk's find (foundwear/live.js; NO_FIND is taken): twinkling and ahead.
  const find = session.find;
  f.findNear = !!find && !find.taken && !!find.spot
    && dist(find.spot, cat) < TWINKLE_RANGE && ahead(cat, fwd, find.spot);
  f.room = !!session.net && (session.remotes?.list?.length ?? 0) > 0;
  f.stalking = !!player.stalking && player.speed > 0.3;
  f.perched = !!session.perched;
  f.camera = !!session.cameraMode;
  f.inWater = !!player.inWater;
  const held = session.carry?.mouth?.held;
  // the yarn ball has a line of its own; a Market treat is eaten in a moment,
  // never carried home (carry.js `treat`)
  f.carrying = !!held && !held.toy && !held.treat;
  f.yarnHeld = !!session.toy?.held;
  // the yarn ball she has touched (a ball still lying where it was found is
  // nobody's yet, toy.js)
  f.toy = !!session.toy?.active && session.toy.claimed !== false;
  f.yarnNear = false;
  if (session.toy?.active && !session.toy.held && session.toy.mesh) {
    const p = session.toy.mesh.position;
    f.yarnNear = dist(p, cat) < YARN_NEAR_M && ahead(cat, fwd, p);
  }
  f.bats = session.batCount ?? 0;
  f.inBox = (session.boxTime ?? 0) > 0;
  const busy = !!session.prompt || f.perched || f.inWater || !!session.rest || !!session.fight || f.camera;
  f.idleOpen = busy ? 0 : session.idleTime ?? 0;
  f.challenge = session.clanFight?.uiShowing === 'challenge' && !!state.clanPick?.mine && session.areaId === state.clanPick.mine;

  f.canJump = !f.perched && climbInReach(session, player, state);

  f.critterNear = false;
  for (const c of session.critters?.list ?? []) {
    if (c.hidden || c.type === 'villager' || c.type === 'dog') continue;
    const p = c.group.position;
    if (dist(p, cat) < CRITTER_NEAR_M && ahead(cat, fwd, p)) { f.critterNear = true; break; }
  }

  let nearest = Infinity;
  let far = false;
  for (const s of session.strayCats?.strays ?? []) {
    const d = dist(s.group.position, cat);
    if (d < nearest) nearest = d;
    if (d >= STRAY_FAR_MIN_M && d <= STRAY_FAR_MAX_M) far = true;
  }
  f.strayFar = far && nearest > STRAY_REACH_M;

  f.nearBox = (session.areaData.boxes ?? []).some((b) => dist(b, cat) < BOX_NEAR_M);

  f.helpInView = false;
  if (session.quest?.state === 'offered' && session.questGiver) {
    const p = villagerPos(session.questGiver, helpAt);
    f.helpInView = dist(p, cat) < HELP_NEAR_M && ahead(cat, fwd, p);
  }
  return f;
}

// The hints count REAL seconds, not the walk's own clock: the walk's clock
// runs slow on a device that cannot keep up (its step is capped), and "twelve
// seconds" and "one a minute" are promises about the child's time. A gap
// longer than this between two frames is a pause (the card was up), not play.
const REAL_STEP_MAX_S = 1;

// `bubble` (ui/guidebubble.js) draws the line with the ring round its control;
// without one the line goes straight to the HUD. `coach` is the guided walk
// (game/guidewalk.js): begun, updated with the same real seconds and ended
// here, so it runs exactly when the hints do (never while the walk is paused)
// and is told about the walk after session.hints exists.
export function createTips({ player, progression, settings, hud, getIsTouch, now = () => performance.now(), bubble = null, coach = null }) {
  let live = null; // { session, engine, facts, accum, lastYaw, turned, lastAt }
  let coached = null; // { session, lastAt }: a walk the coach is on (the den has no hints, but none of its own either)
  const showLine = (text, pic, ring) => (bubble ? bubble.hint(text, pic, ring) : hud.setHint(text, pic));

  const enabled = () => settings?.get?.('showTips') !== false;

  // The hint on screen, so a change of input (TV mode: pad words or key words) says it again in the new words.
  let shown = null;
  const say = (e) => { shown = e; showLine(line(`hint.${e.id}`, { ...e.slots, touch: !!getIsTouch(), glyph: true }), HINT_PICS[e.id], e.ring); };
  onTv(() => { if (shown && live?.engine.showing) say(shown); });

  bus.on('tip', (e) => {
    if (live && e && typeof e.id === 'string') live.engine.offer(e.id, e.name ? { name: e.name } : null);
  });
  bus.on('tip:did', (e) => {
    if (live && e && typeof e.id === 'string') live.engine.done(e.id);
  });

  return {
    // A walk begins. The den has no hints (nothing in the table happens there).
    begin(session) {
      live = null;
      coached = null;
      showLine(null);
      if (!session || session.areaId === 'den') return;
      const state = progression.state;
      const walked = Object.values(state.walks).reduce((n, w) => n + (Number.isFinite(w) ? w : 0), 0);
      const engine = createHints({
        count: (id) => progression.state.tutorial.hints[id] ?? 0,
        countUp: (id) => progression.countHint(id),
        enabled,
        show: say,
        hide: () => { shown = null; showLine(null); },
      });
      session.hints = engine;
      live = {
        session, engine, accum: 0, turned: 0, lastYaw: null, lastAt: null,
        facts: { t: 0, walkNo: walked + 1, looked: (state.tutorial.hints.look ?? 0) >= 3 },
      };
      if (coach) { coached = { session }; coach.begin(session); }
    },
    // Once a frame while the walk is being played.
    update(session, dt) {
      if (!live || live.session !== session) return;
      const f = live.facts;
      const at = now();
      const real = live.lastAt === null ? dt : Math.min(REAL_STEP_MAX_S, Math.max(0, (at - live.lastAt) / 1000));
      live.lastAt = at;
      if (coach && coached?.session === session) coach.update(session, real);
      f.t += real;
      // Turning the view (a drag, the mouse): once she has, she knows how.
      const yaw = player.viewYaw();
      if (live.lastYaw !== null && !f.looked) {
        live.turned += Math.abs(yaw - live.lastYaw);
        if (live.turned > LOOKED_RAD) { f.looked = true; progression.knowHint('look'); }
      }
      live.lastYaw = yaw;
      live.accum += real;
      if (live.accum < FACTS_EVERY_S) return;
      const step = live.accum;
      live.accum = 0;
      bubble?.update(); // the ring follows its control
      if (!enabled() && !live.engine.showing) return; // tips off: nothing to gather
      walkFacts(session, { player, state: progression.state }, f);
      live.engine.update(step, f);
    },
    end() {
      if (live) live.engine.end();
      live = null;
      if (coach && coached) coach.end();
      coached = null;
      showLine(null);
    },
  };
}
