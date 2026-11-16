// The guided first walk and the first camp walk, on a walk (design:
// .claude/plans/guided-first-walk-design.md, sections 3, 7 and 8).
//
// src/tutorial.js is the script (which step, what ends it, the nudges);
// src/leadwait.js is how a leading cat moves; src/ui/guidebubble.js is the
// bubble and the ring. This file joins them to a live walk: it reads what the
// child is doing, tells the script, moves the guide, lays the paw prints,
// gives the gift, and switches the things in the design's "switched off"
// table off and back on.
//
// Everything here is this device's own. Nothing is sent to a co-walker and
// nothing is read from one, and no number is taken from the walk's seeded
// streams: the paw prints wobble by a fixed pattern, the guide is moved by
// plain arithmetic. A walk in a room is never a guided first walk; a first
// camp walk in a room shows only the trail, the pill and the bubble.
//
// walk.js decides whether a walk has a lesson (lessonFor) and puts it on the
// session (session.lesson) before the first frame; main.js hands this module
// to game/tips.js as its `coach`, which begins it on the walk's first engage,
// updates it with real seconds while the walk is played (never while paused)
// and ends it with the walk.

import * as THREE from 'three';
import { createTutorial, guidedStart, STEP, AWAY_M } from '../tutorial.js';
import { createLeader, yawToward, WALK_SPEED, TROT_SPEED, LEAD_NEAR_M } from '../leadwait.js';
import { findPath, pointAlong, pathLength } from '../pathfind.js';
import { line } from '../tutorialwords.js';
import { isWalkableAt } from '../player.js';
import { bus } from '../events.js';

export const GUIDE_AHEAD_M = 9;       // the guide waits this far ahead of the start
export const CAMP_AHEAD_M = 8;        // the camp walk's cat waits this far along the way
export const CAMP_GIFT = 10;          // points on reaching the camp
export const CAMP_CHIP_AFTER_S = 120; // the camp bubble shrinks, and the goals come anyway
const CAMP_HERE_S = 9;                // the arrival line stays this long
const TRAIL_EVERY_S = 2.5;            // paw prints are laid again this often
const TRAIL_AHEAD_M = 7;              // and reach this far ahead of the cat
const REPLAN_S = 1.5;                 // a cat coming after the child looks again this often
const FACTS_EVERY_S = 0.2;
const FEED_REACH_M = 2.2;             // step 3: further than this, she comes over
const GUIDE_LEAD_AHEAD_M = 4.2;       // step 4: she stops this far ahead of the child
const GUIDE_LEAD_NEAR_M = 2.6;        // and sets off again once the child is this near
const DEMO_CLEAR_M = 1.7;             // her pounce is shown this far from the child's cat
const TRAIL_COLOR = 0xf2e04e;         // the paw prints the buried-treasure sniff draws

// The small picture beside each line (touch), and the key shapes (keyboard).
const PICS = Object.freeze({
  'guide.walk': '🐾', 'guide.go': '🐾', 'guide.hello': '😺', 'guide.hello-other': '😺', 'guide.fish': '🐟',
  'guide.follow': '🐾', 'guide.pick-up': '🧶', 'guide.pounce': '🐾', 'guide.done': '⭐', 'guide.home': '🏠',
  'camp.follow': '🏡', 'camp.trail': '🏡', 'camp.here': '🏡',
});
const KEYS = Object.freeze({
  'guide.walk': ['←', '↑', '↓', '→'], 'guide.hello': ['E'], 'guide.fish': ['E'], 'guide.pick-up': ['E'],
  'guide.pounce': ['Space'], 'guide.home': ['Esc'],
});

// Is a lesson's "switched off" table in force on this walk right now? (The
// guided first walk's steps 1 to 5.) Read by walk.js and interactions.js.
export const lessonOpen = (s) => s?.lesson?.open === true;

// ---------------------------------------------------------------------------
// Which lesson, if any, a walk about to start has.
//
//   first  the guided first walk: a solo walk on the street, for a save whose
//          tutorial.first is null (the whole walk) or 'part' (one more try,
//          from step 2). A walk picked up again carries its own step.
//   camp   the first walk on home land after the pick: once (tutorial.camp),
//          never in Legacy Edition. In a room it is the trail, the pill and
//          the bubble only.
// Pure over the save and the walk's facts.
// ---------------------------------------------------------------------------
export function lessonFor(state, { areaId, room = false, resume = null, clanEdition = false, hasCamp = false } = {}) {
  const t = state?.tutorial ?? {};
  if (!room && areaId === 'neighborhood') {
    if (resume) {
      const g = resume.guide;
      if (g && Number.isInteger(g.step) && g.step < STEP.off) return { kind: 'first', step: g.step, did: g.did ?? {}, name: g.name ?? null, gift: g.gift ?? 0, resumed: true };
    } else {
      const start = guidedStart(Object.hasOwn(t, 'first') ? t.first : 'old'); // null is a new save; no field at all is not
      if (start) return { kind: 'first', step: start.step, did: {}, name: start.step > STEP.walk ? t.guide ?? null : null, resumed: false };
    }
  }
  if (clanEdition && hasCamp && t.camp === false && !!state?.clanPick?.mine && areaId === state.clanPick.mine) {
    return { kind: 'camp', room: !!room, resumed: !!resume };
  }
  return null;
}

// The view heading (player.setViewYaw, cat.rotation.y) that looks from one
// spot toward another.
export function headingToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

// Where the guide waits: GUIDE_AHEAD_M ahead of the start, the way the cat
// faces (into the area, -z), or the furthest spot short of that a cat can
// stand on.
export function guideSpot(areaData, ahead = GUIDE_AHEAD_M) {
  const s = areaData.spawn;
  for (let d = ahead; d >= 4; d -= 1) {
    if (isWalkableAt(areaData, s.x, s.z - d)) return { x: s.x, z: s.z - d };
  }
  return { x: s.x, z: s.z - 4 };
}

// A spot `dist` metres from (x, z) that a cat can stand on: the first of
// eight ways round, starting ahead (-z).
function spotNear(areaData, at, dist) {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const p = { x: at.x - Math.sin(a) * dist, z: at.z - Math.cos(a) * dist };
    if (isWalkableAt(areaData, p.x, p.z)) return p;
  }
  return { x: at.x, z: at.z };
}

// Picks this walk's guide and stands her where she waits. `name` asks for the
// same cat as before (a walk picked up again, a second try); `near` stands
// her beside the child instead of ahead of the start. Moves one cat; draws
// nothing. null when the walk has no stray to be a guide.
export function placeGuide(strayCats, areaData, { name = null, near = null } = {}) {
  const named = typeof name === 'string' ? strayCats.strays.find((s) => s.name === name && !s.cross) : null;
  const stray = named ?? strayCats.pickGuide?.() ?? null;
  if (!stray) return null;
  const from = near ?? areaData.spawn;
  const spot = near ? spotNear(areaData, near, 2.5) : guideSpot(areaData);
  strayCats.standAt(stray, spot.x, spot.z, yawToward(spot.x, spot.z, from.x, from.z));
  return stray;
}

// The camp walk's waiting cat: one of the group's roaming cats (never one
// that keeps the camp), stood CAMP_AHEAD_M along the way to the camp.
export function placeCampGuide(clanCats, way, from) {
  const cat = clanCats?.list?.find((c) => !c.camp && !c.buddy) ?? null;
  if (!cat || !way || !way.length) return null;
  const spot = pointAlong(from, way, CAMP_AHEAD_M);
  if (!clanCats.standAt?.(cat, spot.x, spot.z, yawToward(spot.x, spot.z, from.x, from.z))) return null;
  return cat;
}

// A leading cat trots a little faster than the child's cat walks (its pace is
// its breed's), so it stays ahead to be followed; it still stops and waits.
const leadSpeed = (L) => Math.max(TROT_SPEED, (Number.isFinite(L?.pace) ? L.pace : 0) * 1.15);

// A fixed wobble for the paw prints, so laying them takes nothing from the
// walk's stream (scent.js standSniff's pattern).
function wobbler() {
  let i = 0;
  return () => {
    i += 1;
    const v = Math.sin(i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
}

// The flat ring on the ground under the guide while the child is asked to
// walk to her. A child of her group, so it goes with her and is freed with
// the scene; it casts nothing and no shadow sweep sees it (added after them).
function groundRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.8, 28),
    new THREE.MeshBasicMaterial({ color: TRAIL_COLOR, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.userData.contactDecal = true;
  ring.userData.noCast = true;
  return ring;
}

export function createGuideWalk({
  player, progression, settings, hud, audio, bubble, touchUI,
  getIsTouch = () => false,
  // interactions.js: can this stray be fed on this walk? (The colony's rules.)
  canFeedStray = () => true,
  // The pause card is rebuilt when the lesson's state changes under it.
  onLessonChange = () => {},
} = {}) {
  let rt = null; // the live lesson's running state

  const reduced = (s) => !!s?.reducedMotion || settings?.get?.('reducedMotion') === true;
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---- a leading cat on this walk -------------------------------------------
  // `cats` is strayCats or clanCats (both have setLead); `cat` one of theirs.
  function escort(session, cats, cat, walkable) {
    const p = cat.group.position;
    // The leader checks each stride against the ground its owner allows
    // (`hold` arrives with the first frame the owner moves it).
    let hold = null;
    const leader = createLeader({
      x: p.x, z: p.z, yaw: cat.group.rotation.y,
      fix: (pos, px, pz) => { if (hold) hold(cat, pos, px, pz); },
    });
    const area = session.areaData;
    const ground = session.ground;
    const canStep = ground && !ground.flat && typeof ground.canStep === 'function'
      ? (ax, az, bx, bz) => ground.canStep(ax, az, bx, bz) : null;
    const memo = {};
    const way = (from, to) => findPath(walkable, area.bounds, from, to, { canStep, memo }) ?? [{ x: to.x, z: to.z }];
    cats.setLead(cat, (c, dt, catPos, holdFn) => {
      hold = holdFn;
      const r = leader.step(dt, catPos);
      c.group.position.x = leader.pos.x;
      c.group.position.z = leader.pos.z;
      c.group.rotation.y = leader.yaw;
      return r;
    });
    const e = {
      cat, leader, way,
      coming: false,   // walking to the child
      replan: 0,
      // Walk to the child and sit `standoff` metres off, round whatever is in
      // the way; looked at again every REPLAN_S while the child moves.
      comeTo(child, { standoff = 1.5, speed = WALK_SPEED } = {}) {
        e.coming = { standoff, speed };
        e.replan = REPLAN_S;
        leader.goTo(way(leader.pos, child), { standoff, speed });
      },
      tick(dt, child) {
        if (!e.coming) return;
        if (flat(leader.pos, child) <= e.coming.standoff + 0.4) { e.coming = false; leader.sit(); return; }
        e.replan -= dt;
        if (e.replan <= 0 || leader.arrived) {
          e.replan = REPLAN_S;
          leader.goTo(way(leader.pos, child), e.coming);
        }
      },
      leadTo(dest, opts = {}) {
        e.coming = false;
        leader.lead(way(leader.pos, dest), opts);
      },
      release() {
        cats.setLead(cat, null);
      },
    };
    return e;
  }

  // ---- paw prints -----------------------------------------------------------
  function layTrail(session, to, wobble) {
    const cat = session.cat.position;
    if (!to || flat(cat, to) < 1.2) return;
    session.scent?.trailTo?.(cat, to, {
      maxDist: TRAIL_AHEAD_M, steps: reduced(session) ? 3 : 6, life: 4, peak: 0.8, color: TRAIL_COLOR, rand: wobble,
    });
  }

  // ---- the things switched off, and back on ---------------------------------
  function switchOff(session) {
    session.strayCats?.setCalm?.(true);
    session.hints?.setBlocked?.(true);
    hud.setToastCap?.(1);
  }
  // `hints` false keeps the hints held back a little longer: at the finish
  // they wait until the finish line and the way home have been read.
  function switchOn(session, { hints = true } = {}) {
    session.strayCats?.setCalm?.(false);
    if (hints) session.hints?.setBlocked?.(false);
    hud.setToastCap?.(null);
  }
  function showGoals(session) {
    const L = session.lesson;
    if (!L || !L.heldGoals || session.goals) return;
    session.goals = L.heldGoals;
    L.heldGoals = null;
    hud.setGoals(session.goals.goals);
  }

  // =========================================================================
  // The guided first walk
  // =========================================================================
  function beginFirst(session) {
    const L = session.lesson;
    const stray = L.stray;
    const name = stray.name;
    const wobble = wobbler();
    if (L.finished) {
      // A walk picked up again after its finish: only the small last line.
      rt = { kind: 'first', session, L, name, tut: L.tutorial, idle: true };
      session.hints?.setBlocked?.(false);
      showGoals(session);
      paint();
      return;
    }
    const walkable = (x, z) => isWalkableAt(session.areaData, x, z);
    const e = escort(session, session.strayCats, stray, walkable);
    e.leader.sit();
    rt = {
      kind: 'first', session, L, e, name, wobble,
      tut: L.tutorial,
      last: { x: session.cat.position.x, z: session.cat.position.z },
      moved: L.tutorial.step > STEP.walk ? 99 : 0,
      accum: FACTS_EVERY_S, trailIn: 0, restIn: 2,
      slow: false, target: null, ring: null, freeIn: null, demoIn: null,
      facts: { moved: 0, active: false, guideDist: 0, canFeed: true, hasTreasure: true },
    };
    L.open = L.tutorial.open;
    if (L.open) switchOff(session);
    // The save: a new child's guided walk is now "left half way" until its
    // finish; a second try is the last one. A walk picked up again changes
    // nothing here.
    if (!L.resumed) {
      if (progression.state.tutorial.first === 'part') progression.setTutorialFirst('done');
      else progression.setTutorialFirst('part');
    }
    progression.setTutorialGuide?.(name);
    if (L.tutorial.step <= STEP.hello) {
      rt.ring = groundRing();
      stray.group.add(rt.ring);
    }
    // She meows once: here I am.
    audio.trill?.(0.7, 1.35);
    paint();
  }

  function dropGroundRing() {
    if (!rt?.ring) return;
    rt.ring.parent?.remove(rt.ring);
    rt.ring.geometry.dispose();
    rt.ring.material.dispose();
    rt.ring = null;
  }

  // The treasure she leads to: the nearest one still on the ground.
  function pickTreasure(session, from) {
    let best = null;
    let bestD = Infinity;
    for (const c of session.areaData.collectibles ?? []) {
      if (!session.collectibleMeshes.has(c.id) || (c.y ?? 0) > 0.5) continue;
      const d = flat(from, c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }
  const treasureLeft = (session) => session.walk.carried < session.walk.carryCap && !!pickTreasure(session, session.cat.position);

  function startLead() {
    const { session, e } = rt;
    rt.target = pickTreasure(session, e.leader.pos);
    if (!rt.target) return;
    // She stops every few metres and looks back (closer than a leader's usual
    // gap: on a phone a cat six metres off to one side is out of the picture).
    e.leadTo(rt.target, { speed: rt.slow ? WALK_SPEED : leadSpeed(rt.L), standoff: 1.1, ahead: GUIDE_LEAD_AHEAD_M, near: GUIDE_LEAD_NEAR_M });
  }

  function promptOf(session) {
    const p = session.prompt;
    if (!p) return null;
    if (p.kind === 'stray' && p.data === rt.L.stray) return 'hello';
    if (p.kind === 'stray-feed' && p.data === rt.L.stray) return 'fish';
    if (p.kind === 'collect' && session.walk.carried < session.walk.carryCap) return 'pickup';
    return null;
  }

  function paint() {
    if (!rt) return;
    const touch = !!getIsTouch();
    if (rt.kind === 'first') {
      const v = rt.tut.view({ prompt: promptOf(rt.session) });
      bubble.guide(v ? {
        text: line(v.id, { touch, name: rt.name }),
        more: v.more ? line(v.more, { touch }) : null,
        pic: PICS[v.id] ?? '🐾',
        keys: touch ? null : KEYS[v.id] ?? null,
        chip: v.chip, ring: v.ring, grow: v.grow, thumb: v.thumb,
      } : null);
    } else {
      const id = rt.arrived ? 'camp.here' : rt.name ? 'camp.follow' : 'camp.trail';
      bubble.guide(rt.done ? null : {
        text: line(id, { touch, name: rt.name ?? '' }), pic: PICS[id], more: null, keys: null,
        chip: rt.chip && !rt.arrived ? 'paw' : null, ring: null, grow: false, thumb: null,
      });
    }
  }

  function finishFirst() {
    const { session, L, e } = rt;
    L.open = false;
    L.finished = true;
    switchOn(session, { hints: false });
    dropGroundRing();
    progression.setTutorialFirst('done');
    const gift = progression.giveTutorialGift?.() ?? 0;
    L.gift = gift;
    // She jumps for joy; leaves burst; the new-skill tune.
    e.coming = false;
    rt.demoIn = null;
    e.leader.sit();
    e.leader.pose('pounce', 1.4);
    session.fx?.burst(L.stray.group.position, 0xf2c14e, 26);
    session.fx?.burst(session.cat.position, 0x8ae08a, 18);
    audio.unlockFanfare?.();
    if (gift > 0) {
      hud.setPoints(progression.state.points);
      session.fx?.popup?.(session.cat.position, `+${gift} 🐾`, { value: gift });
    }
    showGoals(session);
    rt.freeIn = 5; // then she wanders like any friendly stray
    onLessonChange(session);
  }

  function applyFirst(effects) {
    const { session, e, L } = rt;
    const child = session.cat.position;
    for (const fx of effects) {
      if (fx.t === 'meow') {
        audio.trill?.(0.7, 1.35);
      } else if (fx.t === 'steps') {
        // (Already on her way to the child: she just keeps coming.)
        if (!e.coming) e.leader.steps(fx.n);
      } else if (fx.t === 'come') {
        e.comeTo(child, { standoff: 1.4 });
      } else if (fx.t === 'rub') {
        e.comeTo(child, { standoff: 0.8 });
      } else if (fx.t === 'trail') {
        rt.trailIn = 0;
      } else if (fx.t === 'lead') {
        rt.slow = false;
        startLead();
      } else if (fx.t === 'halfback') {
        e.coming = false;
        e.leader.approach({ standoff: 2, budget: flat(e.leader.pos, child) / 2, speed: TROT_SPEED });
        rt.relead = true;
      } else if (fx.t === 'back') {
        e.comeTo(child, { standoff: 1.6, speed: TROT_SPEED });
        rt.slow = true;
        rt.relead = true;
      } else if (fx.t === 'demo') {
        // She pounces on the spot, a clear step away from the child's cat.
        e.coming = false;
        const gap = flat(e.leader.pos, child);
        if (gap < DEMO_CLEAR_M) {
          const ux = gap > 0.05 ? (e.leader.pos.x - child.x) / gap : 1;
          const uz = gap > 0.05 ? (e.leader.pos.z - child.z) / gap : 0;
          e.leader.goTo({ x: child.x + ux * DEMO_CLEAR_M, z: child.z + uz * DEMO_CLEAR_M }, { speed: TROT_SPEED });
          rt.demoIn = 1.2;
        } else {
          e.leader.sit();
          rt.demoIn = 0;
        }
      } else if (fx.t === 'finish') {
        finishFirst();
      } else if (fx.t === 'step') {
        if (fx.step > STEP.hello) dropGroundRing();
        // The last line is a chip now: the hints may have the bubble again.
        if (fx.step === STEP.free) session.hints?.setBlocked?.(false);
        L.open = rt.tut.open;
        rt.relead = false;
      }
    }
  }

  function updateFirst(dt) {
    if (rt.idle) return;
    const { session, tut, e, L } = rt;
    const child = session.cat.position;
    // Metres walked: a jump of more than a stride or two is not walking.
    const d = flat(child, rt.last);
    if (d < 1.5) rt.moved += d;
    rt.last.x = child.x; rt.last.z = child.z;
    e.tick(dt, child);
    if (rt.demoIn !== null) {
      rt.demoIn -= dt;
      if (rt.demoIn <= 0 || (e.leader.order === 'go' && e.leader.arrived)) {
        rt.demoIn = null;
        e.leader.sit();
        e.leader.pose('pounce', 0.9);
        session.fx?.burst(L.stray.group.position, 0xd8cdb8, 6);
      }
    }
    if (rt.freeIn !== null) {
      rt.freeIn -= dt;
      if (rt.freeIn <= 0) { rt.freeIn = null; e.release(); }
    }
    rt.accum += dt;
    if (rt.accum < FACTS_EVERY_S) return;
    const step = rt.accum;
    rt.accum = 0;
    const f = rt.facts;
    f.moved = rt.moved;
    f.active = (player.speed ?? 0) > 0.3;
    f.guideDist = flat(child, e.leader.pos);
    if (tut.open) {
      f.canFeed = !!canFeedStray(session, L.stray) || tut.did.fish;
      f.hasTreasure = treasureLeft(session);
    }
    applyFirst(tut.update(step, f));
    if (!rt) return;
    const at = tut.step;
    if (tut.open) {
      // Step 1: the walk circle is shown again if a first touch put it away.
      if (at === STEP.walk) {
        rt.restIn -= step;
        if (!f.active && rt.restIn <= 0) { rt.restIn = 2; touchUI?.restAgain?.(); }
      }
      // She never lets the child get lost: far off, she trots after and sits
      // a little way ahead (steps 2 to 4); in step 3 she stays in reach.
      const far = at === STEP.fish ? FEED_REACH_M : AWAY_M;
      if (at >= STEP.hello && at <= STEP.follow && f.guideDist > far && !e.coming && !e.leader.posing) {
        e.comeTo(child, { standoff: at === STEP.fish ? 1.4 : 3, speed: TROT_SPEED * 1.25 });
        if (at === STEP.follow) rt.relead = true;
      }
      // Step 4: back beside the child, she sets off for the treasure again.
      if (at === STEP.follow && rt.relead && !e.coming && f.guideDist < GUIDE_LEAD_NEAR_M + 0.6
          && (e.leader.order !== 'approach' || e.leader.arrived)) {
        rt.relead = false;
        startLead();
      }
      // Paw prints: to her (step 2), and to her as she leads (step 4).
      rt.trailIn -= step;
      if (rt.trailIn <= 0 && (at === STEP.hello || at === STEP.follow) && !promptOf(session)) {
        rt.trailIn = TRAIL_EVERY_S;
        layTrail(session, e.leader.pos, rt.wobble);
      }
    }
    paint();
    bubble.update();
  }

  // =========================================================================
  // The first camp walk
  // =========================================================================
  function beginCamp(session) {
    const L = session.lesson;
    const walkable = L.walkable ?? ((x, z) => isWalkableAt(session.areaData, x, z));
    const e = L.cat ? escort(session, session.clanCats, L.cat, walkable) : null;
    const memo = {};
    const ground = session.ground;
    const canStep = ground && !ground.flat && typeof ground.canStep === 'function'
      ? (ax, az, bx, bz) => ground.canStep(ax, az, bx, bz) : null;
    rt = {
      kind: 'camp', session, L, e, wobble: wobbler(),
      name: L.cat && session.clanEdition ? L.cat.name : null,
      camp: L.camp,
      wayFrom: (from) => findPath(walkable, session.areaData.bounds, from, L.camp, { canStep, memo }) ?? [{ x: L.camp.x, z: L.camp.z }],
      accum: FACTS_EVERY_S, trailIn: 0, t: 0, hereFor: 0,
      arrived: false, done: false, chip: false, objective: false,
    };
    if (session.campMarker) session.campMarker.pulse = reduced(session) ? 'still' : 'beat';
    if (e) e.leadTo(L.camp, { speed: leadSpeed(L), standoff: Math.max(2, (L.camp.r ?? 6) - 2.5) });
    // One thing at a time: no hint takes the bubble on the way to the camp.
    session.hints?.setBlocked?.(true);
    paint();
  }

  function endCamp(session, { arrived }) {
    const L = session.lesson;
    if (session.campMarker) delete session.campMarker.pulse;
    if (rt.objective) { hud.setObjective(null); rt.objective = false; }
    session.hints?.setBlocked?.(false);
    progression.setTutorialCamp?.();
    rt.e?.release();
    showGoals(session);
    L.finished = true;
    if (!arrived) { rt.done = true; paint(); }
    onLessonChange(session);
  }

  function updateCamp(dt) {
    const { session, e, L } = rt;
    const child = session.cat.position;
    if (e) e.tick(dt, child);
    rt.accum += dt;
    if (rt.accum < FACTS_EVERY_S) return;
    const step = rt.accum;
    rt.accum = 0;
    if (rt.done) return;
    if (rt.arrived) {
      rt.hereFor += step;
      if (rt.hereFor >= CAMP_HERE_S) { rt.done = true; paint(); }
      return;
    }
    rt.t += step;
    const dist = flat(child, rt.camp);
    // The pill, unless a race or an errand is using it.
    const busy = session.quest?.state === 'active' || (session.race?.state && session.race.state !== 'idle' && session.race.state !== 'done');
    if (!busy) { hud.setObjective(line('camp.pill'), dist); rt.objective = true; }
    else rt.objective = false;
    if (dist <= (rt.camp.r ?? 6) + 0.5) {
      // Arrived: a sparkle, a small gift, the words.
      rt.arrived = true;
      session.fx?.burst(child, 0xf2c14e, 22);
      audio.chime?.();
      progression.addPoints(CAMP_GIFT);
      hud.setPoints(progression.state.points);
      session.fx?.popup?.(child, `+${CAMP_GIFT} 🐾`, { value: CAMP_GIFT });
      endCamp(session, { arrived: true });
      paint();
      return;
    }
    if (!rt.chip && rt.t >= CAMP_CHIP_AFTER_S) {
      // Two minutes of other things: the bubble shrinks and the goals come
      // anyway. The trail and the cat keep pointing.
      rt.chip = true;
      session.hints?.setBlocked?.(false);
      showGoals(session);
    }
    if (e) {
      // Left far behind, the cat comes back for the child, then leads again.
      const gap = flat(child, e.leader.pos);
      if (gap > AWAY_M && !e.coming) { e.comeTo(child, { standoff: 3, speed: TROT_SPEED * 1.25 }); rt.relead = true; }
      if (rt.relead && !e.coming && gap < LEAD_NEAR_M + 0.5) {
        rt.relead = false;
        e.leadTo(L.camp, { speed: leadSpeed(L), standoff: Math.max(2, (L.camp.r ?? 6) - 2.5) });
      }
    }
    rt.trailIn -= step;
    if (rt.trailIn <= 0) {
      rt.trailIn = TRAIL_EVERY_S;
      const way = rt.wayFrom(child);
      if (pathLength(child, way) > 1.5) layTrail(session, pointAlong(child, way, TRAIL_AHEAD_M), rt.wobble);
    }
    paint();
    bubble.update();
  }

  // What the child just did, from interactions.js.
  bus.on('guide:did', (ev) => {
    if (!rt || rt.kind !== 'first' || !ev || typeof ev.what !== 'string') return;
    const guide = !!ev.stray && ev.stray === rt.L.stray;
    applyFirst(rt.tut.note(ev.what, { guide }));
    paint();
  });

  return {
    // The walk's first engage.
    begin(session) {
      rt = null;
      bubble.guide(null);
      const L = session?.lesson;
      if (!L) return;
      if (L.kind === 'first' && L.stray && L.tutorial && !L.tutorial.skipped) beginFirst(session);
      else if (L.kind === 'camp' && !L.finished) beginCamp(session);
    },
    // Once a frame while the walk is played, with real seconds.
    update(session, dt) {
      if (!rt || rt.session !== session) return;
      if (rt.kind === 'first') updateFirst(dt);
      else updateCamp(dt);
    },
    // "Skip the lesson" on the pause card: one tap, nothing asked. The walk
    // becomes an ordinary walk and the three goals appear.
    skip(session) {
      const L = session?.lesson;
      if (!L || L.finished || L.skipped) return false;
      L.skipped = true;
      if (L.kind === 'first') {
        L.tutorial.skip();
        L.open = false;
        progression.setTutorialFirst('skipped');
        if (rt && rt.session === session) {
          switchOn(session);
          dropGroundRing();
          rt.e.release();
        }
        hud.setLesson?.(false);
        showGoals(session);
      } else if (rt && rt.session === session) {
        endCamp(session, { arrived: false });
      } else {
        progression.setTutorialCamp?.();
        showGoals(session);
      }
      rt = null;
      bubble.guide(null);
      onLessonChange(session);
      return true;
    },
    end() {
      if (rt) {
        hud.setToastCap?.(null);
        if (rt.objective) hud.setObjective(null);
      }
      rt = null;
      bubble.clear();
    },
  };
}

// The lesson a walk carries on its session, built by walk.js once the cats
// exist. null when the walk turns out to have nobody to lead (no stray).
export function buildFirstLesson(plan, { strayCats, areaData, goals, resume, pace = 0 }) {
  const stray = placeGuide(strayCats, areaData, {
    name: plan.name,
    near: plan.resumed && resume ? { x: resume.x, z: resume.z } : null,
  });
  if (!stray) return null;
  // A walk picked up again after the hello: she has been greeted on this walk
  // already, so the yellow button goes straight on to the fish.
  if (plan.resumed && plan.did?.hello) stray.greeted = true;
  return {
    kind: 'first', stray, pace, open: plan.step <= STEP.pounce, resumed: !!plan.resumed,
    // Picked up again after its finish: straight to the small last line.
    tutorial: createTutorial({ step: plan.step >= STEP.finish ? STEP.free : plan.step, did: plan.did }),
    heldGoals: goals, finished: plan.step >= STEP.finish, skipped: false, gift: plan.gift ?? 0,
  };
}
