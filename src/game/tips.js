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
import { bus } from '../events.js';
import { bestPerch, climbBudget, fenceRunning } from '../climbing.js';
import { FLAT_GROUND } from '../ground.js';
import * as THREE from 'three';
import { villagerPos } from '../critters.js';

// The small picture beside each line: things the game already draws.
export const HINT_PICS = Object.freeze({
  look: '👀', creep: '🐾', jump: '🐾', hop: '🐾', photo: '📷', frame: '📷', yarn: '🧶', bat: '🧶',
  call: '😺', sniff: '👃', box: '📦', help: '❗', hiss: '😾', dog: '🐶', swim: '💧', carry: '🐾',
  home: '🏠', chat: '💬', rival: '🐾', stranger: '🐾',
});

const FACTS_EVERY_S = 0.25;
const LOOKED_RAD = 0.6;        // this much turning is "has looked around"
const CRITTER_NEAR_M = 9;
const BOX_NEAR_M = 2;
const HELP_NEAR_M = 14;
const STRAY_REACH_M = 6;       // closer than this, a cat is as good as in reach
const STRAY_FAR_MIN_M = 10;
const STRAY_FAR_MAX_M = 18;

const helpAt = new THREE.Vector3();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Ahead of the view, loosely: in the front half and not far off to one side.
function ahead(from, fwd, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  return d < 0.5 || (dx * fwd.x + dz * fwd.z) / d > 0.35;
}

// walkFacts(session, { player, state, camera }) -> the facts for src/hints.js,
// written into `f` (one object, reused). Reads only; `turned` and `t` are the
// caller's running totals.
export function walkFacts(session, { player, state }, f = {}) {
  const cat = session.cat.position;
  const fwd = player.forward();
  f.room = !!session.net && (session.remotes?.list?.length ?? 0) > 0;
  f.stalking = !!player.stalking && player.speed > 0.3;
  f.perched = !!session.perched;
  f.camera = !!session.cameraMode;
  f.inWater = !!player.inWater;
  f.carrying = !!session.carry?.mouth?.held;
  f.toy = !!session.toy?.active;
  f.bats = session.batCount ?? 0;
  f.inBox = (session.boxTime ?? 0) > 0;
  const busy = !!session.prompt || f.perched || f.inWater || !!session.rest || !!session.fight || f.camera;
  f.idleOpen = busy ? 0 : session.idleTime ?? 0;
  f.challenge = session.clanFight?.uiShowing === 'challenge' && !!state.clanPick?.mine && session.areaId === state.clanPick.mine;

  f.canJump = false;
  if (!f.perched && !player.swimming && !session.chasing) {
    const ground = session.ground ?? FLAT_GROUND;
    f.canJump = !!bestPerch(session.areaData.perches ?? [], cat, player.perchY, session.perched, climbBudget(state),
      { fenceRun: fenceRunning(state), state, ground });
  }

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

export function createTips({ player, progression, settings, hud, getIsTouch }) {
  let live = null; // { session, engine, facts, accum, lastYaw, turned }

  const enabled = () => settings?.get?.('showTips') !== false;

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
      hud.setHint(null);
      if (!session || session.areaId === 'den') return;
      const state = progression.state;
      const walked = Object.values(state.walks).reduce((n, w) => n + (Number.isFinite(w) ? w : 0), 0);
      const engine = createHints({
        count: (id) => progression.state.tutorial.hints[id] ?? 0,
        countUp: (id) => progression.countHint(id),
        enabled,
        show: ({ id, slots }) => hud.setHint(line(`hint.${id}`, { ...slots, touch: !!getIsTouch() }), HINT_PICS[id]),
        hide: () => hud.setHint(null),
      });
      session.hints = engine;
      live = {
        session, engine, accum: 0, turned: 0, lastYaw: null,
        facts: { t: 0, walkNo: walked + 1, looked: (state.tutorial.hints.look ?? 0) >= 3 },
      };
    },
    // Once a frame while the walk is being played.
    update(session, dt) {
      if (!live || live.session !== session) return;
      const f = live.facts;
      f.t += dt;
      // Turning the view (a drag, the mouse): once she has, she knows how.
      const yaw = player.viewYaw();
      if (live.lastYaw !== null && !f.looked) {
        live.turned += Math.abs(yaw - live.lastYaw);
        if (live.turned > LOOKED_RAD) { f.looked = true; progression.knowHint('look'); }
      }
      live.lastYaw = yaw;
      live.accum += dt;
      if (live.accum < FACTS_EVERY_S) return;
      const step = live.accum;
      live.accum = 0;
      if (!enabled() && !live.engine.showing) return; // tips off: nothing to gather
      walkFacts(session, { player, state: progression.state }, f);
      live.engine.update(step, f);
    },
    end() {
      if (live) live.engine.end();
      live = null;
      hud.setHint(null);
    },
  };
}
