// =============================================================================
// THE MOON'S LATE ARRIVALS (background loading). A lazy file, fetched with the walk's start only while a stage is still on its way: it draws a late stage into a kit and
// group of its own (the same draws as moon.js's build, the same order), fades it in (moonfade.js), wakes the stage's lives in the stand-ins' places and opens the region
// its rings shut. Nothing here is on the landing's path. No random number, no clock of its own.
// =============================================================================
import * as THREE from 'three';
import { addPhrases } from '../clanphrases.js';
import * as K from './moonparts.js';
import { ST, stageReady, stageEvent, HELD, STAGE_ORDER } from './moonstages.js';
import { createFader, materialsOf } from './moonfade.js';
import { REGIONS, ringFor, nearRegion, WAIT_NEAR } from './moonregions.js';
import { IDLE, idleStart, nextIdleRing, idlePaused, progressMark } from './moonidle.js';

export { createFader };

// the one line for a place whose stage is still arriving (or did not come): both word sets read the same (the base life says it: moonbaselive.js notice)
export const STAGE_LINES = Object.freeze({ 'moon.stage.wait': 'The path ahead is still waking up.' });
addPhrases(STAGE_LINES);

const IMPORTS = { hill: () => import('./moonstagehill.js'), launch: () => import('./moonstagelaunch.js'), rover: () => import('./moonstagerover.js'), station: () => import('./moonstagestation.js') };
let started = null;
async function fetchStage(id, imports) {
  for (let attempt = 0; attempt < 2; attempt++) { // one retry, then the area stays closed off (never an error screen)
    try { await imports[id](); stageEvent(id, true); return true; } catch { /* retry once */ }
  }
  stageEvent(id, false);
  return false;
}
/** Fetches the stages not yet in, in STAGE_ORDER, all at once (so on a normal connection nothing is ever seen arriving); the same promise every time. */
export function startMoonStages({ imports = IMPORTS } = {}) {
  started ??= Promise.all(STAGE_ORDER.filter((id) => !stageReady(id)).map((id) => fetchStage(id, imports))).then(() => (imports.station ? fetchStage('station', imports) : null)).then(() => ST); // the Old Relay Station (wing E) comes last (its own closed-off disc and arrival: stationBegin, applyStation below; its relay, sled and riding slots read null until it is in)
  return started;
}
/** Test hook: lets a held stage in and says so. */
export function arrive(id) { HELD.delete(id); stageEvent(id, true); }
/** Test hook: forget the one-shot start. */
export function resetMoonStages() { started = null; HELD.clear(); }

/** closeRings(L): shuts the places of every stage not in yet with rings of invisible colliders. */
export function closeRings(L) {
  for (const id of L.closed) {
    const list = REGIONS[id].flatMap(ringFor);
    L.rings.set(id, list);
    for (const c of list) L.colliders.push(c);
  }
}
/** openRegion(id, L): the stage is in (or the walk is over): its rings come out. */
export function openRegion(id, L) {
  L.closed.delete(id);
  for (const c of L.rings.get(id) ?? []) { const i = L.colliders.indexOf(c); if (i >= 0) L.colliders.splice(i, 1); }
  L.rings.delete(id);
}
/** waiting(L, catPos): a friendly line, once for each shut place a cat reaches (the same line for one still arriving and one that did not come). */
export function waiting(L, catPos, dt = 0, t = 0) {
  const w = L.st; // the Old Relay Station: its fade, its blink and its zone, and the same line near its closed-off disc
  if (w) {
    w.fader?.update(dt);
    w.live?.update(dt, t, catPos);
    if (!w.live && catPos && !w.said && nearRegion(catPos.x, catPos.z, ['s'], WAIT_NEAR, { s: [STATION_GATE] })) { w.said = true; L.base.notice('station'); }
  }
  if (!L.closed.size || !catPos) return;
  const id = nearRegion(catPos.x, catPos.z, [...L.closed]);
  if (id && !L.said.has(id)) { L.said.add(id); L.base.notice(id); }
}

// ---- the Old Relay Station (wing E, milestone M1): not one of the three landing stages (no stand-in life, no part of the job's "all three"); its place is shut by a ring until it is in ----
const STATION_GATE = Object.freeze({ x: 44, z: 36, r: 8.2 }); // equals world/moonstationplan.js GATE (the plan is in the stage, which is not in yet)
/** stationBegin(L): called by the life when this file is in. In (a later walk): drawn at once. Not in: its place is shut and (outside tests) the fetch is started. */
export function stationBegin(L) {
  if (!L.stages || L.st) return;
  L.st = { rings: [], said: false, fader: null, live: null };
  if (stageReady('station')) { applyStation(L); return; }
  L.st.rings = ringFor(STATION_GATE).map((c) => ({ ...c, station: true })); // (marked: the three landing stages' rings are counted without these)
  for (const c of L.st.rings) L.colliders.push(c);
  if (!import.meta.env?.VITEST) startMoonStages(); // (a test calls arrive() itself)
}
/** applyStation(L): the stage is in: the ring comes out and the station goes up (fading in; at once in reduced motion). */
export function applyStation(L) {
  const w = L.st;
  if (!w || w.live || !ST.createStationLive) return;
  for (const c of w.rings) { const i = L.colliders.indexOf(c); if (i >= 0) L.colliders.splice(i, 1); }
  w.rings = [];
  const known = materialsOf(L.scene);
  w.live = ST.createStationLive({ scene: L.scene, reducedMotion: L.reducedMotion, tier: L.tier, colliders: L.colliders, perches: L.perches, spot: L.spot });
  if (!L.reducedMotion) { w.fader = createFader({ reducedMotion: false }); w.fader.add([w.live.group], known); }
  L.base.refresh?.();
}
/** stationEnd(L): the walk is over: the fade is finished, the station taken down, its ring out. */
export function stationEnd(L) {
  const w = L.st;
  if (!w) return;
  w.fader?.flush();
  w.live?.dispose();
  for (const c of w.rings) { const i = L.colliders.indexOf(c); if (i >= 0) L.colliders.splice(i, 1); }
  L.st = null;
}

/** drawLate(id, env) -> the group of what stage `id` brings (not yet in the scene). env: { B, wingOpts, decor } from build(). */
export function drawLate(id, { B, wingOpts, decor }) {
  const g = new THREE.Group();
  g.name = `moonLate:${id}`;
  const k2 = K.createKit('moon');
  const M2 = K.moonMaterials();
  decor(k2, M2, { hill: stageReady('hill'), launch: stageReady('launch'), rover: stageReady('rover') });
  const extra = [];
  if (id === 'rover') {
    ST.drawRoverCourse(k2, M2, B);
    ST.drawLavaKit(k2, M2, B);
    const fill = ST.drawFill();
    fill.visible = false;
    extra.push(ST.drawMassif(M2), ST.drawCave(), fill);
  } else if (id === 'hill') {
    const w = ST.drawWing(k2, M2);
    w.wing.visible = false;
    extra.push(w.wing);
  } else {
    ST.drawLaunchStanding(k2, M2); ST.drawBeams(k2, M2); ST.drawLane(k2, M2); ST.drawRifts(k2, M2); ST.drawRingPosts(k2, M2);
    const C = ST.drawLaunchWing(M2, wingOpts);
    C.arm.visible = false;
    extra.push(C.group);
  }
  const p2 = new THREE.Group();
  p2.name = 'moonPlace:late';
  for (const m of k2.meshes()) p2.add(m);
  g.add(p2, ...extra);
  return g;
}

/** applyStage(id, L): stage `id` is in. L is the life's own: { scene, stages, closed, slots, spottable, fader, mk, open, base, deep }. */
export function applyStage(id, L) {
  const { scene, slots, mk } = L;
  if (id === 'station') { applyStation(L); return; }
  if (!L.closed.has(id)) return;
  const known = materialsOf(scene);
  const group = drawLate(id, L.stages.env);
  scene.add(group);
  const before = new Set(scene.children);
  if (id === 'hill') { slots.star.set(mk.star()); const r = mk.robots(); slots.robots.set(r); L.spottable.push(...r.spottable); }
  else if (id === 'launch') { slots.launch.set(mk.launch()); slots.jump.set(mk.jump()); slots.bound.set(mk.bound()); }
  else slots.rover.set(mk.rover());
  openRegion(id, L);
  if (!L.closed.size && slots.job && !slots.job.real) slots.job.set(mk.job()); // the errands need all three
  L.base.refresh?.();
  L.deep.refresh?.();
  L.fader.add([group, ...scene.children.filter((c) => !before.has(c) && c !== group)], known);
}

export const IDLE_LOOK = 0.5; // s: the idle ring looks at the goal and what changed this often (not every frame)
/** createIdle(life) -> step(dt, catPos, session): the idle ring's schedule (moved here from moonlife.js to keep the landing's chunk small). */
export function createIdle({ base, launch, star, job, rover, jump, deep, progression, finale }) {
  // what moved her on since the last look (a mark that changes), the schedule's state, and the half-second the goal is looked at
  let idle = idleStart();
  let idleMark = null;
  let idleAcc = 0;
  return function idleStep(dt, catPos, session) {
    idleAcc += dt;
    if (idleAcc < IDLE_LOOK) return;
    const span = Math.min(idleAcc, 1); // a stalled frame (a hidden tab) is not half a minute of idling
    idleAcc = 0;
    const b = base.state;
    const rec = b.record;
    const lf = launch.state;
    const gp = base.goalNow();
    const mark = progressMark({ step: rec.step, cells: rec.cells, scope: progression?.state?.moon?.scope ?? 0, stamp: progression?.state?.moon?.stamp ?? -1, carrying: b.carrying ?? -1, pip: b.pip, riding: rover.riding,
      card: lf.carryingCard, flight: !!lf.flight, reply: lf.reply, job: JSON.stringify([job.state.taken, job.state.next, job.state.glove, job.state.done]), finds: base.finds + (session?.collectibleMeshes?.size ?? 0), calls: base.calls, hops: JSON.stringify(jump.last ?? null) });
    const reached = !!catPos && Math.hypot(catPos.x - gp.x, catPos.z - gp.z) < IDLE.reach;
    const progress = (idleMark !== null && mark !== idleMark) || reached;
    idleMark = mark;
    const fin = deep.state.finale;
    const paused = idlePaused({ open: star.state.open || lf.open, flight: !!lf.flight, beat: b.beat, finale: fin !== null && fin < finale, riding: rover.riding, goal: gp.g });
    const r = nextIdleRing(idle, span, { progress, paused, target: gp.g.kind !== 'done' });
    idle = r.state;
    if (r.ring) base.autoCall(r.first);
  };
}
