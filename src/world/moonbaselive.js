// =============================================================================
// THE MOONBASE ON A WALK (milestone 2: chapter 1, "Power"). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera,
// session) every frame; the walk asks promptAt(catPos) and interact() for the action button (game/interactions.js asks an area
// life), exactly as the Lighthouse's kitten and the Greenhouse's jobs. The step machine itself is moonmission.js (pure); this is what
// carries it out: Pip, the two power cells, the Core, the dome's lights, the door, the board, the finds, the gold ring.
//
//   1. WAKE PIP. He sleeps beside the lander. Interact (E / the yellow button / X) wakes him: a beep, the lantern comes up, two small
//      hops, and he rolls ahead toward the dome; she follows; he follows her (world/moonpip.js).
//   2. THE CELLS (either order, one at a time, in her mouth in front of her): the Ridge cell on Skip Ridge's top pillar (only the
//      Moon's doubled climb takes the two jumps: placephysics.js, test/moonbase.test.js) and the Rover cell at the Far Beacon, 70 m
//      east on a plinth (a walk of about 20 s, or a drive in Dot: milestone 3, world/moonroverlive.js; the beacon's lamp blinks while it waits).
//   3. THE CORE. Carrying a cell, E beside the Core plugs it into its own socket. The second one wakes the base: lamps up, the dome's
//      glow, the Core bright, the board lit, a fanfare, Pip's dance, "The base has power!" Saved as state.moon.step 4.
//   Nothing fails, nothing is timed, a cell she is carrying is never saved (the next walk finds it at its own spot), and meowing
//   (the call button) makes Pip beep, show a picture and light a gold ring where the next goal is.
// CO-WALK: credit(ev) takes a step done by anyone in the room the same way her own is (moonmission.credit): a plug or a wake that
// arrives is shown and saved here too. The wire event itself is the room milestone's (a Moon walk is solo until then).
// OFF ON THE MOON (spec 5.3, with strays: false in the area record): the daily goals (the HUD's panel is hidden and session.goals is
// null, the den's way), and the birdsong and crickets (the Moon has no air: the ambience is stopped). Pure of start-up code.
// Draws no random number and reads no clock: every number is a constant here or a walk second.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import { createPip, pushOut } from './moonpip.js';
import { createBoardFace, createBubble } from './moonatlas.js';
import { createMoonSound } from './moonsound.js';
import { findAt, noteMoonFind, inEcho, createDustTally, MOON_FIND_IDS } from './moonfinds.js';
import { COLORS, GLASS, BASE_COL } from './moonbase.js';
import { paint } from './moonparts.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const REACH = Object.freeze({ pip: 2.3, cell: 1.9, core: 3.0, board: 2.7, level: 1.2 }); // m: how near each prompt appears
export const BEAT = Object.freeze({ rise: 2.6, hold: 1.0, earth: 3.4, total: 4.2 }); // s: the base waking
export const RING = Object.freeze({ secs: 7, bubble: 3.2 });
export const CELL_DRAWN = 50; // m (milestone 5): a power cell farther than this from her is not drawn (its capsule and halo are two draws each)
export const NEAR_DOME = 16; // m: a wake-up beat that was saved unseen plays when she is this near the dome
export const DOOR = Object.freeze({ open: 5.2, slide: 1.3, rate: 3 });
const CELL_COLORS = Object.freeze([BASE_COL.teal, BASE_COL.amber, 0xb690ff]); // the third is the Deep Cell's (milestone 8)
const CELL_IDS = Object.freeze([0, 1, 2]);
const ICON = Object.freeze({ pip: '🤖', cell: '🔋', core: '🔌', scope: '🔭', desk: '✉️', rocket: '🚀', button: '🔴', reply: '🌍', cave: '💎', done: '💡' });
const TAU = Math.PI * 2;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
// ('greenhousenote' is the whole-sentence, no-points toast type the start-up HUD already knows; the Moon's own type would cost start-up bytes.)

function glowDisc(r, hex, k, seg = 20) {
  const c = new THREE.Color(hex);
  const pos = [];
  const col = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU; const a1 = ((i + 1) / seg) * TAU;
    for (const [px, py, f] of [[0, 0, k], [Math.cos(a0) * r, Math.sin(a0) * r, 0], [Math.cos(a1) * r, Math.sin(a1) * r, 0]]) { pos.push(px, py, 0); col.push(c.r * f, c.g * f, c.b * f); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
// A flat ring of light on the dust: bright at the inner edge, fading to nothing at the outer (the dome's glow on the ground outside its wall).
function glowRing(r0, r1, hex, k, seg = 40) {
  const c = new THREE.Color(hex);
  const pos = [];
  const col = [];
  const at = (a, r, f) => { pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); col.push(c.r * f, c.g * f, c.b * f); };
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU; const a1 = ((i + 1) / seg) * TAU;
    at(a0, r0, k); at(a0, r1, 0); at(a1, r1, 0);
    at(a0, r0, k); at(a1, r1, 0); at(a1, r0, k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const additive = (opacity = 1) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity, side: THREE.DoubleSide, forceSinglePass: true });

// One power cell: a glowing capsule with two white caps (one mesh, vertex-coloured) and a soft halo that faces the camera (a second).
function makeCell(id) {
  const g = new THREE.Group();
  g.name = `moon:cell${id}`;
  const parts = [
    paint(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), CELL_COLORS[id]),
    paint(new THREE.CylinderGeometry(0.15, 0.2, 0.08, 8).translate(0, 0.29, 0), 0xf1f3f8),
    paint(new THREE.CylinderGeometry(0.2, 0.15, 0.08, 8).translate(0, -0.29, 0), 0xf1f3f8),
  ];
  const body = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true }));
  const halo = new THREE.Mesh(glowDisc(0.95, CELL_COLORS[id], 0.55), additive(0.9));
  halo.name = 'halo';
  const spin = new THREE.Group(); // the capsule turns; its halo does not (it faces the camera)
  spin.name = 'spin';
  spin.add(body);
  g.add(spin, halo);
  for (const m of [body, halo]) { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; }
  return g;
}

// createBaseLife(ctx) -> { update, promptAt, interact, credit, state, pip, dispose }
// ctx: { scene, ground, colliders, perches, progression, log, audio, reducedMotion }
export function createBaseLife(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const ground = ctx.ground ?? { y: P.moonY };
  const colliders = ctx.colliders ?? P.MOON_COLLIDERS;
  const progression = ctx.progression ?? null;
  const log = ctx.log ?? null;
  const audio = ctx.audio ?? null;
  const sound = createMoonSound(audio);
  const cardIn = ctx.cardCarried ?? (() => false); // (milestone 6) is a postcard in her mouth (the Launch Complex's)
  let clock = 0;
  let disposed = false;
  let quieted = false;
  let target = null; // what the action button would do now
  let carrying = null; // the cell in her mouth: 0, 1 or null (never saved)
  let beat = null; // { t0 } while the base is waking
  let beatSeen = false;
  let power = 0;
  let door = 0;
  let ringT = -100;
  let ringGoal = null;
  let bubbleT = -100;
  let meowed = false;
  const told = new Set();
  const rest = { x: 1e9, z: 1e9, since: 0 }; // where her paws came to rest, and since when (the finds' stillness)
  const dust = createDustTally(); // Quiet Dust: metres walked on the Quiet Plain
  const timers = [];
  const rec = () => M.normalize(progression?.state?.moon);
  const later = (secs, fn) => timers.push({ at: clock + secs, fn });

  // ---- the meshes ------------------------------------------------------------------------------------------------------
  const byName = (n) => scene.getObjectByName(n) ?? null;
  const lamp = byName('moon:lamp');
  const coreglow = byName('moon:coreglow');
  const glass = byName('moon:glass');
  const doorL = byName('moon:doorL');
  const doorR = byName('moon:doorR');
  const boardMesh = byName('moon:board');
  const doorZ = [doorL?.position.z ?? 0, doorR?.position.z ?? 0];
  const beacon = byName('moon:beacon'); // the Far Beacon's lamp: it blinks while the Rover cell waits and rests once the cell is taken
  const board = createBoardFace(boardMesh);
  const cells = CELL_IDS.map(makeCell);
  const cellPlace = (id) => (id === 0 ? { x: P.RIDGE_CELL.x, z: P.RIDGE_CELL.z, y: ground.y(P.RIDGE_CELL.x, P.RIDGE_CELL.z) + P.RIDGE_CELL.y + 0.42 }
    : id === M.DEEP ? { x: P.DEEP_CELL.x, z: P.DEEP_CELL.z, y: ground.y(P.DEEP_CELL.x, P.DEEP_CELL.z) + P.DEEP_CELL.y + 0.42 } // on its pedestal in the cave (milestone 8)
    : { x: P.ROVER_CELL.x, z: P.ROVER_CELL.z, y: ground.y(P.ROVER_CELL.x, P.ROVER_CELL.z) + 0.84 });
  const socketPlace = (id) => { const k = id === M.DEEP ? P.DEEP_SOCKET : P.SOCKETS[id]; return { x: k.x, z: k.z, y: k.y + 0.32 }; };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.12, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true, forceSinglePass: true }));
  ring.name = 'moon:goalring';
  const shaftGeo = new THREE.CylinderGeometry(0.42, 0.42, 9, 12, 1, true).translate(0, 4.5, 0);
  { const pos = shaftGeo.attributes.position; const col = new Float32Array(pos.count * 3); const c = new THREE.Color(0xffd45a); for (let i = 0; i < pos.count; i++) { const k = 1 - pos.getY(i) / 9; col[i * 3] = c.r * k * 0.8; col[i * 3 + 1] = c.g * k * 0.8; col[i * 3 + 2] = c.b * k * 0.8; } shaftGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const shaft = new THREE.Mesh(shaftGeo, additive(0));
  shaft.name = 'moon:goalshaft';
  const bubble = createBubble();
  for (const m of [ring, shaft]) { m.visible = false; m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; m.frustumCulled = false; }
  // the dome's glow on the dust when the base is awake: a warm soft disc round it (additive, never a light)
  const glow = new THREE.Mesh(glowRing(P.DOME.wall + 0.9, 17, 0xffe2a8, 0.6), additive(0));
  glow.name = 'moon:domeglow';
  glow.position.set(P.DOME.x, P.moonY(P.DOME.x, P.DOME.z) + 0.1, P.DOME.z);
  glow.visible = false;
  glow.renderOrder = 2;
  for (const m of [glow]) { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; m.frustumCulled = false; }
  scene.add(...cells, ring, shaft, bubble.sprite, glow);

  const pip = createPip({ scene, ground, colliders, reducedMotion, awake: rec().step >= M.STEP.pip });
  if (rec().step >= M.STEP.pip) pip.setAwake();
  const cellMode = [null, null, null]; // 'home' | 'carried' | 'plugged'
  function setCellModes() {
    const r = rec();
    for (const id of CELL_IDS) cellMode[id] = r.cells & (1 << id) ? 'plugged' : carrying === id ? 'carried' : 'home';
  }
  setCellModes();
  if (rec().step >= M.STEP.awake) power = 1;
  if (rec().step === M.STEP.both) beatSeen = false;
  board.setMarks(M.boardMarks(rec()));
  applyPower();
  for (const id of CELL_IDS) placeCell(id, 0, null, null, null);

  // one cell where its mode says: home on its pillar or plinth, in front of her mouth, or in its socket
  function placeCell(id, t, catPos, session, camera) {
    const c = cells[id];
    const mode = cellMode[id];
    const bob = reducedMotion ? 0 : 0.06 * Math.sin(t * 1.7 + id);
    let p;
    if (mode === 'plugged') p = socketPlace(id);
    else if (mode === 'carried' && catPos) {
      const yaw = session?.cat?.rotation?.y ?? 0;
      p = { x: catPos.x - Math.sin(yaw) * 0.45, z: catPos.z - Math.cos(yaw) * 0.45, y: catPos.y + 0.55 };
    } else p = cellPlace(id);
    c.position.set(p.x, p.y + (mode === 'home' ? bob : 0), p.z);
    const spin = c.getObjectByName('spin');
    if (spin) spin.rotation.y = reducedMotion ? 0 : t * 0.9;
    const halo = c.getObjectByName('halo');
    if (halo && camera) halo.quaternion.copy(camera.quaternion);
    if (halo) halo.visible = mode !== 'plugged' || power < 1; // a plugged cell is only a glow in the Core once the base is awake
    c.scale.setScalar(mode === 'plugged' ? 0.9 : 1);
    // (milestone 5) the draw budget: a cell far from her (the other one, on its pillar or its plinth) is a speck: its two meshes are not drawn
    c.visible = !catPos || Math.hypot(catPos.x - p.x, catPos.z - p.z) <= CELL_DRAWN;
  }

  // ---- saving ----------------------------------------------------------------------------------------------------------
  // The one write: the record onto the save (addPoints(0) is the save's own "persist now": it adds nothing).
  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.moon = { ...(pr.state.moon ?? {}), step: next.step, cells: next.cells };
    pr.addPoints?.(0);
    board.setMarks(M.boardMarks(next));
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.moon, ev) : M.apply(progression?.state?.moon, ev);
    if (!r.changed) return null;
    commit(r.moon);
    setCellModes();
    return r.effect;
  }

  // ---- what the base looks like at a power level (0 asleep, 1 awake) -----------------------------------------------------
  function applyPower() {
    if (lamp) lamp.material.color.copy(COLORS.lampDim).lerp(COLORS.lampOn, power);
    if (coreglow) coreglow.material.color.copy(COLORS.coreDim).lerp(COLORS.coreOn, power);
    if (glass) glass.material.opacity = GLASS.cold + (GLASS.warm - GLASS.cold) * power;
    glow.visible = power > 0;
    glow.material.opacity = 0.5 * power;
  }

  // ---- the moments -----------------------------------------------------------------------------------------------------
  function wakePip(remote) {
    pip.wake();
    sound.beep();
    pip.beep();
    say('moon-pip-wake', phrase('moon.pip.wake'));
    later(1.3, () => say('moon-pip-goal', phrase('moon.pip.goal')));
    later(8, () => { if (rec().step < M.STEP.awake && !told.has('meow')) { told.add('meow'); say('moon-meow-hint', phrase('moon.meow.hint')); } });
    void remote;
  }
  function startBeat() {
    if (beat || beatSeen) return;
    beat = { t0: clock };
    sound.hum();
    audio?.fanfare?.();
    pip.dance();
    later(0.3, () => say('moon-core-on', phrase('moon.core.on')));
    later(BEAT.earth, () => say('moon-earth', phrase('moon.earth')));
  }
  function plugged(effect, id) {
    sound.click();
    if (effect === 'both') startBeat();
    else if (effect === 'deep') { /* the Deep Cell: its own beat is world/moondeeplive.js's, which sees the cell go in */ }
    else say('moon-core-plug', phrase('moon.core.plug1'));
    void id;
  }

  // (milestone 9) once the story is told, Pip's errand of the day is what the ring and the board point at (carrying the Deep Cell is still to the Core first)
  const jobGoal = () => (carrying === null && rec().step >= M.STEP.replied ? ctx.jobGoal?.() ?? null : null);
  function goalPoint() {
    const jg = jobGoal();
    if (jg) return { g: { kind: 'job', icon: jg.icon }, x: jg.x, z: jg.z, y: jg.y };
    const g = M.nextGoal(progression?.state?.moon, carrying, cardIn());
    if (g.kind === 'pip') return { g, x: pip.position.x, z: pip.position.z, y: ground.y(pip.position.x, pip.position.z) };
    if (g.kind === 'cell') { const p = cellPlace(g.cell); return { g, x: p.x, z: p.z, y: p.y - 0.42 }; }
    if (g.kind === 'core') return { g, x: P.CORE.x, z: P.CORE.z, y: ground.y(P.CORE.x, P.CORE.z) };
    if (g.kind === 'scope') { const p = P.rampPoint(0.04, 0); return { g, x: p.x, z: p.z, y: ground.y(p.x, p.z) }; } // the ramp's mouth at Star Hill's foot
    if (g.kind === 'desk') return { g, x: P.MESSAGE_DESK.x, z: P.MESSAGE_DESK.z, y: ground.y(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) }; // milestone 6: the Message Desk
    if (g.kind === 'rocket') return { g, x: P.ROCKET_SLOT.x, z: P.ROCKET_SLOT.z, y: ground.y(P.ROCKET_SLOT.x, P.ROCKET_SLOT.z) };
    if (g.kind === 'button') return { g, x: P.LAUNCH_DESK.x, z: P.LAUNCH_DESK.z, y: ground.y(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z) };
    if (g.kind === 'reply') { const l = P.ROCK_LEDGES[0]; return { g, x: l.x, z: l.z, y: ground.y(l.x, l.z) }; } // the foot of Earthrise Rock's ledges
    if (g.kind === 'cave') return { g, x: P.MOUTH_FRONT.x, z: P.MOUTH_FRONT.z, y: ground.y(P.MOUTH_FRONT.x, P.MOUTH_FRONT.z) }; // milestone 8: the Lava Tube's mouth
    return { g, x: P.BOARD.x + 1.6, z: P.BOARD.z, y: ground.y(P.BOARD.x, P.BOARD.z) };
  }
  // her meow (or the board): Pip beeps, shows a picture and a gold ring and light show where the next goal is
  function callPip() {
    const gp = goalPoint();
    ringGoal = gp;
    ringT = clock;
    bubbleT = clock;
    bubble.show(gp.g.icon ?? ICON[gp.g.kind] ?? ICON.done);
    pip.beep();
    sound.chirp();
    if (rec().step >= M.STEP.pip) pip.lookAt(gp.x, gp.z);
    if (gp.g.kind === 'pip') say('moon-pip-hint', phrase('moon.pip.hint'));
  }
  const offMeow = bus.on('tip:did', (e) => { if (e && e.id === 'call') meowed = true; });

  // ---- the action button -----------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (disposed || !catPos) return null;
    const r = rec();
    const level = (y) => Math.abs(catPos.y - y) < REACH.level;
    if (r.step < M.STEP.pip && pip.state === 'asleep' && dist(catPos, pip.position) < REACH.pip && level(ground.y(pip.position.x, pip.position.z))) return { kind: 'wake', line: phrase('moon.pip.prompt') };
    if (carrying !== null && dist(catPos, P.CORE) < REACH.core) return { kind: 'plug', cell: carrying, line: phrase('moon.core.prompt') };
    if (carrying === null && r.step >= M.STEP.pip) {
      for (const id of CELL_IDS) {
        if (cellMode[id] !== 'home') continue;
        if (id === M.DEEP && r.step < M.STEP.awake) continue; // the Deep Cell is for a woken base (milestone 8)
        const p = cellPlace(id);
        if (dist(catPos, p) < REACH.cell && level(p.y)) return { kind: 'pick', cell: id, line: phrase('moon.cell.prompt') };
      }
    }
    if (dist(catPos, { x: P.BOARD.x + 1.5, z: P.BOARD.z }) < REACH.board) return { kind: 'board', line: phrase('moon.board.prompt') };
    return null;
  }

  return {
    get state() { return { clock, carrying, power, door, pip: pip.state, beat: !!beat, cellMode: cellMode.slice(), record: rec() }; },
    get pip() { return pip; },
    get cells() { return cells; },
    get ring() { return ring; },
    get board() { return board; },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'wake') {
        if (perform({ kind: 'wake' })) wakePip(false);
      } else if (t.kind === 'pick') {
        carrying = t.cell;
        setCellModes();
        sound.chirp();
        if (t.cell === M.DEEP) say('moon-deep-got', phrase('moon.deep.got'));
        else say('moon-cell-got', phrase('moon.cell.got'));
      } else if (t.kind === 'plug') {
        const id = t.cell;
        carrying = null;
        const effect = perform({ kind: 'plug', cell: id });
        setCellModes();
        if (effect) plugged(effect, id);
      } else if (t.kind === 'board') {
        callPip();
        const g = M.nextGoal(progression?.state?.moon, carrying, cardIn()).kind;
        const jg = jobGoal();
        if (jg) say('moon-board', jg.line);
        else say('moon-board', phrase(g === 'pip' ? 'moon.goal.pip' : g === 'cell' ? 'moon.goal.cells' : g === 'core' ? 'moon.goal.core' : g === 'scope' ? 'moon.goal.scope' : g === 'cave' ? 'moon.goal.cave'
          : g === 'desk' ? 'moon.goal.card' : g === 'rocket' ? 'moon.goal.rocket' : g === 'button' ? 'moon.goal.button' : g === 'reply' ? 'moon.goal.reply' : 'moon.goal.done'));
      }
      return t.kind;
    },
    // a step done by anyone in the room (the wire event is the room milestone's): the same effects as her own, no carrying involved
    credit(ev) {
      const effect = perform(ev, { remote: true });
      if (!effect) return null;
      if (effect === 'wake') wakePip(true);
      else {
        if (ev.cell === carrying) carrying = null; // someone else plugged the cell she was holding: it is in the Core now
        setCellModes();
        plugged(effect, ev.cell);
      }
      return effect;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      const r = rec();

      if (!quieted && session) {
        // the Moon has no daily goals and no air (spec 5.3): the goals panel goes, the birdsong and crickets stop
        quieted = true;
        session.goals = null;
        try { globalThis.document?.getElementById?.('hud-goals')?.classList.add('hidden'); } catch { /* no page */ }
        audio?.stopAmbient?.();
      }

      // timers and the first-time lines
      for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { const f = timers.splice(i, 1)[0].fn; f(); }
      if (!told.has('arrive') && clock > 1.2) { told.add('arrive'); say('moon-arrive', phrase('moon.arrive')); }
      if (!told.has('pip') && clock > 3.6 && r.step === M.STEP.asleep) { told.add('pip'); say('moon-pip-hint', phrase('moon.pip.hint')); }
      if (catPos) {
        if (r.step >= M.STEP.pip && carrying === null) {
          if (!told.has('ridge') && !(r.cells & 1) && dist(catPos, P.SKIP[0]) < 26) { told.add('ridge'); say('moon-cell-ridge', phrase('moon.cell.ridge.hint')); }
          if (!told.has('rover') && !(r.cells & 2) && dist(catPos, P.ROVER_CELL) < 26) { told.add('rover'); say('moon-cell-rover', phrase('moon.cell.rover.hint')); }
          if (!told.has('dot') && !(r.cells & 2) && dist(catPos, P.DEPOT) < 24) { told.add('dot'); say('moon-dot-hint', phrase('moon.rover.hint')); }
        }
        // (milestone 8) the base is awake and a cell glows in the cave: a line once a walk when she comes near the mouth
        if (r.step >= M.STEP.awake && carrying === null && !(r.cells & 4) && !told.has('deep') && dist(catPos, P.MOUTH) < 22) {
          told.add('deep');
          say('moon-deep-hint', phrase('moon.deep.hint'));
        }
        // a wake-up beat saved unseen (both cells were in when the walk ended): it plays when she is near the dome
        if (r.step === M.STEP.both && !beat && !beatSeen && dist(catPos, P.DOME) < NEAR_DOME) startBeat();
      }

      // the Far Beacon: an amber blink while the Rover cell waits for her, a calm teal glow once it has been taken
      if (beacon) {
        const waiting = cellMode[1] === 'home';
        const blink = waiting ? (reducedMotion ? 1 : 0.35 + 0.65 * (Math.sin(t * 3.2) > 0.2 ? 1 : 0.15)) : 0.55;
        beacon.material.color.setHex(waiting ? 0xffffff : 0x9ae8dc).multiplyScalar(blink);
      }

      // her meow, the call
      if (meowed) {
        meowed = false;
        // a meow with her paws in the Echo Crater's middle: the echo (Echo Crater's find)
        if (catPos && log && progression && inEcho(catPos)) { sound.echo(); noteMoonFind('echo', { log, progression }); }
        if (!beat) callPip();
      }

      // the beat
      if (beat) {
        const k = clock - beat.t0;
        power = smooth(k / BEAT.rise);
        applyPower();
        if (k >= BEAT.total) {
          beat = null;
          beatSeen = true;
          power = 1;
          applyPower();
          perform({ kind: 'beat' });
        }
      } else if (r.step >= M.STEP.awake && power < 1) { power = 1; applyPower(); }

      // Pip
      pip.update(step, t, catPos ? { x: catPos.x, y: catPos.y, z: catPos.z, perched: !!session?.perched } : null);

      // the cells: each where its mode says
      for (const id of CELL_IDS) placeCell(id, t, catPos, session, camera);

      // the door slides apart as she comes (and shuts behind her): purely for show, it never stops her
      if (doorL && doorR) {
        const near = catPos && Math.hypot(catPos.x - P.AIRLOCK.x1, catPos.z - P.AIRLOCK.z) < DOOR.open;
        door += ((near ? 1 : 0) - door) * Math.min(1, DOOR.rate * step);
        if (reducedMotion) door = near ? 1 : 0;
        doorL.position.z = doorZ[0] - DOOR.slide * door;
        doorR.position.z = doorZ[1] + DOOR.slide * door;
      }

      // the gold ring and Pip's picture
      const rk = clock - ringT;
      if (ringGoal && rk >= 0 && rk < RING.secs) {
        const fade = smooth(rk / 0.5) * (1 - smooth((rk - (RING.secs - 1.2)) / 1.2));
        const pulse = reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 5);
        ring.visible = shaft.visible = true;
        ring.position.set(ringGoal.x, ringGoal.y + 0.06, ringGoal.z);
        shaft.position.copy(ring.position);
        ring.material.opacity = 0.85 * fade * pulse;
        shaft.material.opacity = 0.65 * fade;
        ring.scale.setScalar(reducedMotion ? 1 : 1 + 0.12 * Math.sin(t * 3));
      } else { ring.visible = shaft.visible = false; }
      const bk = clock - bubbleT;
      if (bk >= 0 && bk < RING.bubble) {
        bubble.sprite.visible = true;
        bubble.sprite.position.set(pip.position.x, ground.y(pip.position.x, pip.position.z) + 1.1 + (reducedMotion ? 0 : 0.05 * Math.sin(t * 4)), pip.position.z);
        bubble.sprite.material.opacity = smooth(bk / 0.25) * (1 - smooth((bk - (RING.bubble - 0.6)) / 0.6));
      } else bubble.sprite.visible = false;

      // the finds: her paws, how long she has stood still
      if (catPos && log && progression) {
        if (Math.hypot(catPos.x - rest.x, catPos.z - rest.z) > 0.05) { rest.x = catPos.x; rest.z = catPos.z; rest.since = clock; }
        const id = findAt({ x: catPos.x, y: catPos.y, z: catPos.z, still: clock - rest.since });
        if (id) noteMoonFind(id, { log, progression });
        if (dust.add(catPos.x, catPos.z)) noteMoonFind('dust', { log, progression });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offMeow?.();
      sound.dispose();
      pip.dispose();
      board.dispose();
      bubble.dispose();
      for (const o of [...cells, ring, shaft, bubble.sprite, glow]) {
        scene.remove(o);
        o.traverse?.((m) => { m.geometry?.dispose?.(); if (m.material && m.material !== bubble.sprite.material) m.material.dispose?.(); });
      }
      if (doorL) doorL.position.z = doorZ[0];
      if (doorR) doorR.position.z = doorZ[1];
    },
  };
}

export { MOON_FIND_IDS, pushOut };
