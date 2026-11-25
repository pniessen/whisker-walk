// =============================================================================
// STAR HILL ON A WALK (milestone 5: chapter 2, "Aim"). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every
// frame; the walk asks promptAt(catPos) and interact() for the action button, as for the base and Dot. This is what carries the telescope
// game out; the rules are world/moonstars.js (pure) and the page is world/moonscope.js (the 2D overlay):
//   * THE WING'S DRAWING is held as a stand-in beyond 55 m (world/moonzones.js): the tower and its ramp always, the observatory, table
//     and ceiling only within range;
//   * THE TELESCOPE: Interact on the observatory's floor opens the scope. The 3D scene is hidden under it (scene.visible = false: nothing is
//     drawn twice) and the cat is held where she stands (the rover's hook, session.fair.update, hands this life the player each frame). Closing
//     frees the canvas and shows the scene again. A picture traced is saved (state.moon.scope, one bit each, the Mouse and the Cat are what find
//     Earth: mission step 5: world/moonmission.js) and glows on the real sky, on the Star Table and (all five) as the Great Cat on the sky and
//     on the observatory's ceiling. The Old Dish turns to face Earth once it is found;
//   * THE STAR TABLE at the hill's foot shows the five pictures dim until traced; Interact says what is left.
// No fail state, nothing timed but the 20 s hint. Draws no random number and reads no clock: every number is a constant or a walk second.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import { createZones } from './moonzones.js';
import { createMoonSound } from './moonsound.js';
import { starField } from './moonsky.js';
import { createScope } from './moonscope.js';
import { skyFigureGeometry, setLevel, figureMaterial } from './moonfigures.js';
import { CONSTELLATIONS, ALL_BITS, createSolver, createHint, bearingOf, cleanBits } from './moonstars.js';

export const DISH_TURN = Object.freeze({ to: 1.36, secs: 2.6 }); // the Old Dish swings from the east to Earth (78 degrees)
export const LEVEL = Object.freeze({ lit: 0.95, dim: 0.2, cat: 0.6, ceilingDim: 0.18 });
export const HINT_NEAR = 34; // m: the wing's hint line shows within this of the hill (once a walk, when the base is awake and Earth not found)
// the page's own words, each a literal phrase id (the phrase table's scan reads them)
const SCOPE_LINES = Object.freeze({
  'moon.scope.hmm': () => phrase('moon.scope.hmm'),
  'moon.scope.close': () => phrase('moon.scope.close'),
  'moon.scope.hintbtn': () => phrase('moon.scope.hintbtn'),
  'moon.pad.scope': () => phrase('moon.pad.scope'),
  'moon.star.mouse': () => phrase('moon.star.mouse'),
  'moon.star.cat': () => phrase('moon.star.cat'),
  'moon.star.fish': () => phrase('moon.star.fish'),
  'moon.star.crown': () => phrase('moon.star.crown'),
  'moon.star.paw': () => phrase('moon.star.paw'),
  // (milestone 9) the twelve guest pictures of Pip's postcards
  'moon.guest.star': () => phrase('moon.guest.star'),
  'moon.guest.boat': () => phrase('moon.guest.boat'),
  'moon.guest.house': () => phrase('moon.guest.house'),
  'moon.guest.tree': () => phrase('moon.guest.tree'),
  'moon.guest.heart': () => phrase('moon.guest.heart'),
  'moon.guest.kite': () => phrase('moon.guest.kite'),
  'moon.guest.moon': () => phrase('moon.guest.moon'),
  'moon.guest.bell': () => phrase('moon.guest.bell'),
  'moon.guest.flower': () => phrase('moon.guest.flower'),
  'moon.guest.rocket': () => phrase('moon.guest.rocket'),
  'moon.guest.key': () => phrase('moon.guest.key'),
  'moon.guest.cup': () => phrase('moon.guest.cup'),
});
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

// createStarLive(ctx) -> { update, promptAt, interact, frame, state, scope, dispose }
// ctx: { scene, reducedMotion, ground, tier, audio, progression, doc, win }
export function createStarLive(ctx) {
  const { scene, reducedMotion = false, progression = null } = ctx;
  const ground = ctx.ground ?? { y: P.moonY };
  const doc = ctx.doc ?? (typeof document === 'undefined' ? null : document);
  const win = ctx.win ?? (typeof window === 'undefined' ? null : window);
  const lite = ctx.tier?.shadows === false;
  const sound = createMoonSound(ctx.audio ?? null);
  const zones = createZones();
  const O = P.OBSERVATORY;
  const byName = (n) => scene.getObjectByName(n) ?? null;
  const wing = byName('moon:wing');
  const wingFigs = byName('moon:wingfigs'); // the table's pictures ('tc0'..'tc4') and the ceiling's Great Cat ('ceilcat') in one additive mesh
  const dish = byName('moon:dish');
  const floorY = ground.y(O.x, O.z);
  const rec = () => progression?.state?.moon ?? {};
  const bitsNow = () => cleanBits(rec().scope);

  let disposed = false;
  let clock = 0;
  let target = null; // what the action button would do: { kind: 'scope' | 'table', line }
  let toldHint = false;
  let toldMilky = false;
  let sceneWas = true;
  let hold = null; // { pos, yaw } where the cat is held while the scope is open
  let lastSession = null;
  let sky = null; // the seeded stars as bearings (made when the scope opens, dropped when it closes)
  let solver = null;
  let hintT = null;
  let guest = null; // (milestone 9) { pic, done } the day's guest star picture while Pip's errand asks for it; its bit is never saved
  let dishA = 0;
  let dishTo = 0;
  let dishStart = -1;
  let wasAimed = false;
  const later = [];

  // ---- the sky's figures (hung on the camera like the stars) -------------------------------------------------------------------
  const skyGeo = skyFigureGeometry();
  const figs = new THREE.Mesh(skyGeo, figureMaterial());
  figs.name = 'moon:skyfigs';
  figs.frustumCulled = false;
  figs.renderOrder = -1;
  figs.castShadow = false;
  figs.receiveShadow = false;
  Object.assign(figs.userData, { noCast: true, noMerge: true, noContactShadow: true, clouds: true });
  scene.add(figs);

  // every figure's lit level from the saved bits
  function paintLevels() {
    const bits = bitsNow();
    CONSTELLATIONS.forEach((_, i) => {
      const on = (bits >> i) & 1;
      setLevel(skyGeo, `c${i}`, on ? LEVEL.lit : 0);
      if (wingFigs) setLevel(wingFigs.geometry, `tc${i}`, on ? LEVEL.lit : LEVEL.dim);
    });
    const all = bits === ALL_BITS;
    setLevel(skyGeo, 'cat', all ? LEVEL.cat : 0);
    if (wingFigs) setLevel(wingFigs.geometry, 'ceilcat', all ? 1 : LEVEL.ceilingDim);
    figs.visible = bits !== 0;
  }
  paintLevels();

  // ---- the Old Dish: turned to Earth once Earth is found --------------------------------------------------------------------
  function setDish(a) {
    dishA = a;
    if (!dish) return;
    const c = P.OLD_DISH;
    const co = Math.cos(a); const si = Math.sin(a);
    dish.rotation.y = a;
    dish.position.set(c.x - (c.x * co + c.z * si), 0, c.z - (-c.x * si + c.z * co));
  }
  if (M.earthFound(rec())) { dishTo = DISH_TURN.to; setDish(DISH_TURN.to); wasAimed = true; }

  // ---- the saving ------------------------------------------------------------------------------------------------------------
  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.moon = { ...(pr.state.moon ?? {}), ...next };
    pr.addPoints?.(0); // the save's own "persist now": adds nothing
  }
  function perform(ev) {
    const r = M.apply(progression?.state?.moon, ev);
    if (!r.changed) return null;
    commit({ step: r.moon.step, cells: r.moon.cells, scope: M.scopeBits(r.moon) });
    return r.effect;
  }

  // ---- the telescope --------------------------------------------------------------------------------------------------------
  let scope = null;
  function openScope() {
    if (scope?.isOpen || !doc?.body) return;
    const field = starField(lite ? 350 : 700);
    sky = [];
    for (let i = 0; i < field.pos.length; i += 3) {
      const d = bearingOf(field.pos[i], field.pos[i + 1], field.pos[i + 2]);
      sky.push({ b: d.b, e: d.e, m: Math.min(1, field.col[i + 2] * 1.1) });
    }
    const pictures = guest && !guest.done ? [...CONSTELLATIONS, guest.pic] : CONSTELLATIONS;
    solver = createSolver(bitsNow(), pictures);
    hintT = createHint(solver);
    scope = createScope({
      doc, win, solver, hint: hintT, sky, reducedMotion, lite, pictures,
      line: (key) => SCOPE_LINES[key]?.() ?? '',
      pads: () => { try { return Array.from(globalThis.navigator?.getGamepads?.() ?? []).filter((p) => p && p.connected); } catch { return []; } },
      onResult,
      onAsk: () => sound.chirp?.(),
      onClose: closed,
    });
    const s = lastSession;
    hold = s?.cat ? { x: s.cat.position.x, y: s.cat.position.y, z: s.cat.position.z, yaw: s.cat.rotation.y } : null;
    sceneWas = scene.visible;
    scene.visible = false; // the 3D render pauses under the opaque overlay: nothing is drawn twice
    scope.open(guest && !guest.done ? guest.pic : null); // the day's guest picture is where the telescope looks first
    if (!toldMilky) { toldMilky = true; scope.caption(phrase('moon.scope.milky')); }
  }
  function closed() {
    scene.visible = sceneWas;
    hold = null;
    sky = null;
    solver = null;
    hintT = null;
    paintLevels();
  }
  function onResult(res) {
    if (res.c >= CONSTELLATIONS.length) { // the guest picture (milestone 9): a pin chimes, the last one is the errand done; nothing about it is saved here
      if (res.kind === 'pin') sound.pin(res.i);
      else if (res.kind === 'hmm') sound.hmm();
      else if (res.kind === 'done' && guest && !guest.done) { guest.done = true; sound.traced(); guest.onDone?.(); }
      return;
    }
    if (res.kind === 'pin') sound.pin(res.i);
    else if (res.kind === 'hmm') sound.hmm();
    else if (res.kind === 'done') {
      sound.traced();
      const before = bitsNow();
      const effect = perform({ kind: 'trace', id: res.c });
      if (!(before & (1 << res.c))) { try { progression?.recordSighting?.('mnscope'); } catch { /* a stand-in save */ } }
      paintLevels();
      if (effect === 'earth') later.push({ at: clock + 1.0, fn: () => say('moon-scope-found', phrase('moon.scope.found')) });
      if (bitsNow() === ALL_BITS && !(before === ALL_BITS)) later.push({ at: clock + 1.8, fn: () => say('moon-scope-cat', phrase('moon.scope.cat')) });
    }
  }
  // the hook the rover's walk hook hands us each frame: the cat is held while the scope is open
  function frame(dt, t, { cat, player, session }) {
    lastSession = session ?? lastSession;
    if (!scope?.isOpen || !hold) return;
    cat.position.set(hold.x, hold.y, hold.z);
    cat.rotation.y = hold.yaw;
    player?.halt?.();
    if (session) { session.idleTime = 0; session.pounceTime = 0; }
  }

  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call' && scope?.isOpen) hintT?.ask(); });

  function decide(catPos) {
    if (disposed || !catPos || scope?.isOpen) return null;
    if (dist(catPos, O) < O.reach && Math.abs(catPos.y - floorY) < O.level) return { kind: 'scope', line: phrase('moon.scope.prompt') };
    if (dist(catPos, P.STAR_TABLE) < P.STAR_TABLE.reach && Math.abs(catPos.y - ground.y(P.STAR_TABLE.x, P.STAR_TABLE.z)) < 1.2) return { kind: 'table', line: phrase('moon.table.prompt') };
    return null;
  }

  return {
    get scope() { return scope; },
    get state() { return { clock, open: !!scope?.isOpen, bits: bitsNow(), dish: dishA, near: zones.near('B'), target }; },
    get figs() { return figs; },
    frame,
    // (milestone 9) Pip's errand asks for the day's guest star picture in the telescope (pic: a moonjob.js GUEST_POOL entry), or no longer (null); onDone says it was traced
    setGuest(pic, onDone = null) { guest = pic ? { pic, done: false, onDone } : null; },
    get guest() { return guest; },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'scope') openScope();
      else if (t.kind === 'table') {
        const bits = bitsNow();
        say('moon-table', phrase(!M.storyTraced(rec()) ? 'moon.table.story' : bits === ALL_BITS ? 'moon.table.done' : 'moon.table.more'));
      }
      return t.kind;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      lastSession = session ?? lastSession;
      for (let i = later.length - 1; i >= 0; i--) if (clock >= later[i].at) later.splice(i, 1)[0].fn();
      if (camera) figs.position.copy(camera.position);
      // the zone: the wing's detail is drawn within range
      if (catPos && wing) wing.visible = zones.update(catPos.x, catPos.z).B;
      // Earth found on another device (a merge) or before the base woke: the step lifts here
      const r = rec();
      if (M.storyTraced(r) && r.step === M.STEP.awake) {
        const e = perform({ kind: 'aim' });
        if (e) later.push({ at: clock + 0.5, fn: () => say('moon-scope-found', phrase('moon.scope.found')) });
      }
      // the Old Dish turns once Earth is found (at once on a walk that begins found)
      const aimed = M.earthFound(rec());
      if (aimed && !wasAimed) { wasAimed = true; dishTo = DISH_TURN.to; dishStart = clock; if (dishA === 0 && reducedMotion) setDish(dishTo); }
      if (dishStart >= 0 && dishA !== dishTo) { const k = reducedMotion ? 1 : smooth((clock - dishStart) / DISH_TURN.secs); setDish(dishTo * k); if (k >= 1) dishStart = -1; }
      // the hint line, once a walk
      if (!toldHint && catPos && r.step === M.STEP.awake && dist(catPos, P.STAR_HILL) < HINT_NEAR) { toldHint = true; say('moon-scope-hint', phrase('moon.scope.hint')); }
      // the scope: the page is drawn
      if (scope?.isOpen) {
        scope.update(step, t);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      if (scope?.isOpen) scope.close();
      scene.visible = true;
      sound.dispose();
      scene.remove(figs);
      figs.geometry.dispose();
      figs.material.dispose();
      if (dish) { dish.rotation.y = 0; dish.position.set(0, 0, 0); }
    },
  };
}
