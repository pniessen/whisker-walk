// =============================================================================
// PIP'S POSTCARD OF THE DAY ON A WALK (milestone 9). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session) every frame; the walk asks promptAt(catPos)
// and interact() for the action button as for the base and the rocket. The rules and the plan are world/moonjob.js (pure); this carries one errand out:
//   * It is offered from the WALK AFTER the story is told (a walk that begins with step 8 or more). planMoonJob(roomSeed, visits) picks the errand, the guest picture and the glove's
//     spot; the Mission Board shows today's errand in its header and Pip's album along its foot; a meow rings the place to go (the base's gold ring: jobGoal), and the board says it in words.
//   * Pebbles: three of the walk's glowing pebbles (picked up as always: session.collectibleMeshes loses them) and Interact at the sample tray.
//     Rounds: Dot driven past the five lit posts in order (a ring of light on the next one). Guest: the telescope draws the day's sixth star picture (moonstarlive.js setGuest).
//     Bound: a hop on the board's lane at least BOUND_MARGIN_CM past her best (moonjumplive.js onHop). Second rocket: moonlaunchlive.js setSecond. Glove: carry it to Pip.
//   * DONE pays AWARDS.moonjob once a walk (log.awardOnce under JOB_KEY: the walk's own once-a-walk rule, which a resumed walk keeps), counts the journal page `mnjob` (the album's
//     count: the save's per-key maximum merges it) and fills the board's next postcard. A partner's finished errand is credit({ kind: 'job', job }): it counts for her too, if it is today's.
// Nothing is saved but the journal count; no fail state, nothing timed. Draws no random number and reads no clock: every number is a constant or a walk second.
// Props are made only for today's errand, never casters, one mesh each, drawn only within PROP_NEAR metres of her (the draw gate).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import * as J from './moonjob.js';
import { createMoonSound } from './moonsound.js';
import { paint } from './moonparts.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PROP_NEAR = 55; // m: a tray or a glove farther than this from her is not drawn
export const GLOVE_REACH = 1.8; // m: pick the glove up
export const PIP_REACH = 2.6; // m: give it to Pip
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every line is a literal phrase('...') so the phrase table's scan reads it
const SAY = Object.freeze({
  'moon.job.pebbles': () => phrase('moon.job.pebbles'),
  'moon.job.rounds': () => phrase('moon.job.rounds'),
  'moon.job.guest': () => phrase('moon.job.guest'),
  'moon.job.bound': () => phrase('moon.job.bound'),
  'moon.job.rocket': () => phrase('moon.job.rocket'),
  'moon.job.glove': () => phrase('moon.job.glove'),
  'moon.job.tray.prompt': () => phrase('moon.job.tray.prompt'),
  'moon.job.tray.need': () => phrase('moon.job.tray.need'),
  'moon.job.glove.prompt': () => phrase('moon.job.glove.prompt'),
  'moon.job.glove.got': () => phrase('moon.job.glove.got'),
  'moon.job.give.prompt': () => phrase('moon.job.give.prompt'),
  'moon.job.pay': () => phrase('moon.job.pay'),
  'moon.job.full': () => phrase('moon.job.full'),
});

// ---- the props (one mesh each) ---------------------------------------------------------------------------------------------------
const flat = (geo, hex) => paint(geo, hex);
function propMaterial() { return new THREE.MeshLambertMaterial({ vertexColors: true }); }
function finish(mesh, name) {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noCast = true;
  return mesh;
}
// Pip's sample tray: a low round stone table with a lip, and three dim dishes on it
function makeTray() {
  const parts = [
    flat(new THREE.CylinderGeometry(0.7, 0.8, 0.12, 12).translate(0, 0.06, 0), 0x6f7480),
    flat(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 8).translate(0, 0.4, 0), 0x8d93a0),
    flat(new THREE.CylinderGeometry(0.75, 0.6, 0.12, 14).translate(0, 0.74, 0), 0xc9ced8),
    ...[0, 1, 2].map((i) => flat(new THREE.CylinderGeometry(0.17, 0.14, 0.06, 10).translate(Math.cos((i / 3) * Math.PI * 2) * 0.38, 0.83, Math.sin((i / 3) * Math.PI * 2) * 0.38), 0x2a3140)),
  ];
  return finish(new THREE.Mesh(mergeGeometries(parts), propMaterial()), 'moon:jobtray');
}
// The lost glove: a palm, four fingers, a thumb and a cuff (about 0.4 m), warm orange with a pale cuff
function makeGlove() {
  const box = (w, h, d, x, y, z, hex) => flat(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
  const parts = [
    box(0.2, 0.06, 0.22, 0, 0, 0, 0xf08a3a),
    box(0.04, 0.05, 0.16, -0.075, 0, -0.18, 0xf08a3a), box(0.04, 0.05, 0.18, -0.025, 0, -0.19, 0xf08a3a),
    box(0.04, 0.05, 0.17, 0.025, 0, -0.185, 0xf08a3a), box(0.04, 0.05, 0.14, 0.075, 0, -0.165, 0xf08a3a),
    box(0.04, 0.05, 0.12, 0.14, 0, -0.04, 0xf08a3a),
    box(0.22, 0.09, 0.07, 0, 0, 0.14, 0xf4efe2),
  ];
  const m = finish(new THREE.Mesh(mergeGeometries(parts), propMaterial()), 'moon:jobglove');
  m.scale.setScalar(1.8);
  return m;
}
// A ring of light on the ground with a pale shaft over it, one mesh (vertex-coloured, additive): Dot's next post
function makeMarker() {
  const seg = 28;
  const pos = [];
  const col = [];
  const c = new THREE.Color(0x9fffe0);
  const add = (x, y, z, k) => { pos.push(x, y, z); col.push(c.r * k, c.g * k, c.b * k); };
  const r0 = 1.3; const r1 = 1.8;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2; const a1 = ((i + 1) / seg) * Math.PI * 2;
    add(Math.cos(a0) * r0, 0.08, Math.sin(a0) * r0, 0.9); add(Math.cos(a0) * r1, 0.08, Math.sin(a0) * r1, 0.9); add(Math.cos(a1) * r1, 0.08, Math.sin(a1) * r1, 0.9);
    add(Math.cos(a0) * r0, 0.08, Math.sin(a0) * r0, 0.9); add(Math.cos(a1) * r1, 0.08, Math.sin(a1) * r1, 0.9); add(Math.cos(a1) * r0, 0.08, Math.sin(a1) * r0, 0.9);
    // the shaft: a thin open wall 4.5 m high, bright at the foot, gone at the top
    add(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, 0.55); add(Math.cos(a0) * r0, 4.5, Math.sin(a0) * r0, 0); add(Math.cos(a1) * r0, 4.5, Math.sin(a1) * r0, 0);
    add(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, 0.55); add(Math.cos(a1) * r0, 4.5, Math.sin(a1) * r0, 0); add(Math.cos(a1) * r0, 0, Math.sin(a1) * r0, 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: 0.55, side: THREE.DoubleSide, forceSinglePass: true });
  const m = finish(new THREE.Mesh(g, mat), 'moon:jobmarker');
  m.frustumCulled = false;
  return m;
}

// createJobLive(ctx) -> { update, promptAt, interact, credit, goal, onHop, state, plan, dispose }
// ctx: { scene, reducedMotion, ground, progression, log, audio, roomSeed, visits, base, star, launch, rover }
export function createJobLive(ctx) {
  const { scene, reducedMotion = false } = ctx;
  const ground = ctx.ground ?? { y: P.moonY };
  const progression = ctx.progression ?? null;
  const log = ctx.log ?? null;
  const sound = createMoonSound(ctx.audio ?? null);
  const base = ctx.base ?? null;
  const star = ctx.star ?? null;
  const launch = ctx.launch ?? null;
  const rover = ctx.rover ?? null;
  const rec = () => M.normalize(progression?.state?.moon);
  const eligible = rec().step >= M.STEP.replied; // the story was told before this walk began
  const plan = J.planMoonJob(ctx.roomSeed, ctx.visits ?? 0, ctx.boundOn === undefined ? {} : { bound: !!ctx.boundOn }); // (boundOn: a test's switch; the walk leaves it to world/moonswitch.js)
  const kind = plan.kind;
  let done = !!log && log.count(J.JOB_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let target = null;
  let told = false;
  let pos = { x: P.MOON_SPAWN.x, z: P.MOON_SPAWN.z, y: 0 };
  // progress
  let startIds = null; // the pebbles present when the walk began
  let taken = 0;
  let next = 0; // Dot's next post
  let glove = 'home'; // 'home' | 'carried' | 'given'
  let tray = null;
  let gloveMesh = null;
  let marker = null;
  const later = [];

  const active = () => eligible && !done && !disposed;
  const spot = J.GLOVE_SPOTS[plan.glove];
  const albumNow = () => J.albumCount(progression?.state?.journal?.mnjob);
  const paintBoard = () => base?.board?.setAlbum?.(eligible || albumNow() > 0 ? { count: albumNow(), job: eligible ? J.JOB_ICON[kind] : null, jobDone: done, cards: J.ALBUM } : null);

  // ---- the props of today's errand ----------------------------------------------------------------------------------------------
  if (eligible && !done) {
    if (kind === 'pebbles') {
      tray = makeTray();
      tray.position.set(J.SAMPLE_TRAY.x, ground.y(J.SAMPLE_TRAY.x, J.SAMPLE_TRAY.z), J.SAMPLE_TRAY.z);
      scene.add(tray);
    } else if (kind === 'glove') {
      gloveMesh = makeGlove();
      scene.add(gloveMesh);
    } else if (kind === 'rounds') {
      marker = makeMarker();
      marker.visible = false;
      scene.add(marker);
    } else if (kind === 'guest') star?.setGuest?.(J.GUEST_POOL[plan.guest], () => complete(false));
    else if (kind === 'rocket') launch?.setSecond?.(() => complete(false));
  }
  paintBoard();

  // ---- done ---------------------------------------------------------------------------------------------------------------------------
  function complete(remote) {
    if (!active()) return false;
    done = true;
    const count = albumNow();
    const paid = log ? log.awardOnce('moonjob', J.JOB_KEY, SAY['moon.job.pay']()) : 0;
    if (paid > 0 || !log) { try { progression?.recordSighting?.('mnjob'); } catch { /* a stand-in save */ } }
    sound.traced();
    paintBoard();
    if (kind === 'guest') star?.setGuest?.(null);
    if (kind === 'rocket') launch?.setSecond?.(null);
    if (J.albumCount(count + 1) >= J.ALBUM_SIZE && count < J.ALBUM_SIZE) later.push({ at: clock + 2.4, fn: () => say('moon-job-full', SAY['moon.job.full']()) });
    void remote;
    return true;
  }

  // ---- where the ring should point -----------------------------------------------------------------------------------------------------
  function goal() {
    if (!active()) return null;
    const at = (x, z, line, icon = J.JOB_ICON[kind]) => ({ x, z, y: ground.y(x, z), icon, line });
    if (kind === 'pebbles') {
      if (taken >= J.PEBBLES_NEEDED) return at(J.SAMPLE_TRAY.x, J.SAMPLE_TRAY.z, SAY['moon.job.pebbles']());
      let best = null;
      for (const p of P.PEBBLES) if (!startIds || (startIds.has(p.id) && presentNow().has(p.id))) if (!best || dist(p, pos) < dist(best, pos)) best = p;
      return at(best ? best.x : J.SAMPLE_TRAY.x, best ? best.z : J.SAMPLE_TRAY.z, SAY['moon.job.pebbles']());
    }
    if (kind === 'rounds') {
      const s = rover?.state;
      if (s && !s.riding && next === 0) return at(P.DOT_PARK.x, P.DOT_PARK.z, SAY['moon.job.rounds']());
      const p = J.ROUND_POSTS[Math.min(next, J.ROUND_POSTS.length - 1)];
      return at(p.x, p.z, SAY['moon.job.rounds']());
    }
    if (kind === 'guest') { const p = P.rampPoint(0.04, 0); return at(p.x, p.z, SAY['moon.job.guest']()); }
    if (kind === 'bound') return at(P.JUMP_LANE.x0, P.JUMP_LANE.z, SAY['moon.job.bound']());
    if (kind === 'rocket') {
      const stage = launch?.second?.stage ?? 0;
      const p = stage === 0 ? P.MESSAGE_DESK : stage === 1 ? P.ROCKET_SLOT : P.LAUNCH_DESK;
      return at(p.x, p.z, SAY['moon.job.rocket']());
    }
    if (glove === 'carried' && base?.pip) return at(base.pip.position.x, base.pip.position.z, SAY['moon.job.glove']());
    return at(spot.x, spot.z, SAY['moon.job.glove']());
  }

  let session0 = null;
  const presentNow = () => new Set(session0?.collectibleMeshes && typeof session0.collectibleMeshes.keys === 'function' ? [...session0.collectibleMeshes.keys()] : []);

  // ---- the action button ----------------------------------------------------------------------------------------------------------
  const level = (p, y) => Math.abs(p.y - y) < 1.2;
  function decide(catPos) {
    if (!active() || !catPos) return null;
    if (kind === 'pebbles' && dist(catPos, J.SAMPLE_TRAY) < J.SAMPLE_TRAY.reach && level(catPos, ground.y(J.SAMPLE_TRAY.x, J.SAMPLE_TRAY.z))) return { kind: 'tray', line: SAY['moon.job.tray.prompt']() };
    if (kind === 'glove') {
      const free = (base?.state?.carrying ?? null) === null && (launch?.carryingCard ?? -1) < 0;
      if (glove === 'home' && free && dist(catPos, spot) < GLOVE_REACH && level(catPos, ground.y(spot.x, spot.z))) return { kind: 'pick', line: SAY['moon.job.glove.prompt']() };
      if (glove === 'carried' && base?.pip && dist(catPos, base.pip.position) < PIP_REACH) return { kind: 'give', line: SAY['moon.job.give.prompt']() };
    }
    return null;
  }

  return {
    plan,
    get state() { return { clock, kind, eligible, done, taken, next, glove, startIds: startIds ? [...startIds] : null }; },
    get tray() { return tray; },
    get glove() { return gloveMesh; },
    get marker() { return marker; },
    goal,
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'tray') {
        if (taken >= J.PEBBLES_NEEDED) complete(false);
        else say('moon-job-tray', SAY['moon.job.tray.need']());
      } else if (t.kind === 'pick') {
        glove = 'carried';
        sound.chirp();
        say('moon-job-glove', SAY['moon.job.glove.got']());
      } else if (t.kind === 'give') {
        glove = 'given';
        complete(false);
      }
      return t.kind;
    },
    // a partner's finished errand (the wire event is the room milestone's): it counts for her too when it is today's own; anything else is ignored
    credit(ev) {
      if (!J.validJobCredit(ev, plan)) return null;
      return complete(true) ? 'job' : null;
    },
    // the jump board's hop (moonjumplive.js onHop): the "beat your bound" errand
    onHop(h) {
      if (kind === 'bound' && active() && J.beatsBest(h?.cm, h?.before)) complete(false);
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      clock += dt > 0 ? dt : 0;
      for (let i = later.length - 1; i >= 0; i--) if (clock >= later[i].at) later.splice(i, 1)[0].fn();
      if (catPos) pos = { x: catPos.x, z: catPos.z, y: catPos.y ?? 0 };
      session0 = session ?? session0;
      if (!active()) return;
      if (!told && clock > 2.5) { told = true; const g = goal(); if (g?.line) say('moon-job-today', g.line); }
      const near = (p) => !catPos || dist(catPos, p) <= PROP_NEAR;
      if (kind === 'pebbles') {
        const present = presentNow();
        if (!startIds && session0?.collectibleMeshes) startIds = new Set(P.PEBBLES.map((p) => p.id).filter((id) => present.has(id)));
        if (startIds) { const n = J.pebblesTaken(startIds, present); if (n !== taken) { if (n > taken) sound.pin(n); taken = n; } }
        if (tray) tray.visible = near(J.SAMPLE_TRAY);
      } else if (kind === 'rounds') {
        const s = rover?.state;
        if (s?.riding && next < J.ROUND_POSTS.length) {
          const n = J.roundsStep(next, s.x, s.z);
          if (n !== next) {
            next = n;
            if (next >= J.ROUND_POSTS.length) complete(false);
            else sound.pin(next);
          }
        }
        if (marker && active()) {
          const p = J.ROUND_POSTS[Math.min(next, J.ROUND_POSTS.length - 1)];
          marker.visible = near(p);
          marker.position.set(p.x, ground.y(p.x, p.z), p.z);
          marker.scale.setScalar(reducedMotion ? 1 : 1 + 0.06 * Math.sin(clock * 3));
        }
      } else if (kind === 'glove' && gloveMesh) {
        if (glove === 'carried' && (base?.state?.carrying ?? null) !== null) glove = 'home'; // a cell in her mouth takes the place: the glove goes back where it lay
        const bob = reducedMotion ? 0 : 0.04 * Math.sin(clock * 1.6);
        if (glove === 'carried' && catPos) {
          const yaw = session?.cat?.rotation?.y ?? 0;
          gloveMesh.position.set(catPos.x - Math.sin(yaw) * 0.45, catPos.y + 0.62, catPos.z - Math.cos(yaw) * 0.45);
          gloveMesh.rotation.set(-0.9, yaw, 0, 'YXZ'); // fingers up and forward, where she can be seen to hold it
          gloveMesh.scale.setScalar(1.0);
          gloveMesh.visible = true;
        } else {
          gloveMesh.scale.setScalar(1.8);
          gloveMesh.position.set(spot.x, ground.y(spot.x, spot.z) + 0.06 + bob, spot.z);
          gloveMesh.rotation.set(0, 0.8, 0);
          gloveMesh.visible = near(spot);
        }
      }
      void camera;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (kind === 'guest') star?.setGuest?.(null);
      if (kind === 'rocket') launch?.setSecond?.(null);
      for (const m of [tray, gloveMesh, marker]) {
        if (!m) continue;
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      sound.dispose();
    },
  };
}
