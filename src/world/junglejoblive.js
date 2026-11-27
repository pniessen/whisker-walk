// =============================================================================
// MOSSY'S ERRAND OF THE DAY ON A WALK (milestone J7). Made once a walk by world/jungle.js's life (the code is the stage b chunk's); update(dt, t, catPos, camera, session) every frame;
// the walk asks promptAt(catPos) and interact() for the action button. The rules and the plan are world/junglejob.js (pure); this carries one errand out:
//   * It is offered from the WALK AFTER the story (a walk that begins with step 7). planJungleErrand(roomSeed, visits) picks the errand and the frog's or slipper's place, so every cat in a room
//     has the same one; an errand done by anyone in the room is credited to everyone (credit(): a `jl-job` event, each device pays its own save). The errand itself is never saved.
//   * DONE pays AWARDS.junglejob once a walk (log.awardOnce under ERRAND_KEY, which a resumed walk keeps), puts the lowest unset pressing bit into state.jungle.album (12 bits; the merge
//     ORs them) and counts the journal pages jw6 (an errand paid) and jw7 (a new pressing).
// No fail state, nothing timed: a vine stays shaken, a cup stays where it lies. A carried thing is never saved: it is back at its place on the next walk (dispose forgets it). Draws no
// random number and reads no clock (every number is a constant or a walk second). Props are made only for today's errand, never casters, one mesh each, drawn only within PROP_NEAR metres
// of her. No light is made here (the lodge's one PointLight stays the veranda lantern's). No raft, no ride.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './junglemission.js';
import * as E from './junglejob.js';
import './junglejobwords.js';

export const PROP_NEAR = 45; // m: a prop farther than this from her is not drawn
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every line is a literal phrase call so the phrase table's scan reads it
const SAY = Object.freeze({
  'jungle.job.umbrella': () => phrase('jungle.job.umbrella'),
  'jungle.job.frog': () => phrase('jungle.job.frog'),
  'jungle.job.boat': () => phrase('jungle.job.boat'),
  'jungle.job.vines': () => phrase('jungle.job.vines'),
  'jungle.job.rain': () => phrase('jungle.job.rain'),
  'jungle.job.slipper': () => phrase('jungle.job.slipper'),
  'jungle.job.pick.prompt': () => phrase('jungle.job.pick.prompt'),
  'jungle.job.pick.got': () => phrase('jungle.job.pick.got'),
  'jungle.job.umbrella.prompt': () => phrase('jungle.job.umbrella.prompt'),
  'jungle.job.boat.prompt': () => phrase('jungle.job.boat.prompt'),
  'jungle.job.rain.prompt': () => phrase('jungle.job.rain.prompt'),
  'jungle.job.frog.prompt': () => phrase('jungle.job.frog.prompt'),
  'jungle.job.slipper.prompt': () => phrase('jungle.job.slipper.prompt'),
  'jungle.job.vine.prompt': () => phrase('jungle.job.vine.prompt'),
  'jungle.job.vine.shook': () => phrase('jungle.job.vine.shook'),
  'jungle.job.pay': () => phrase('jungle.job.pay'),
  'jungle.job.pressed': () => phrase('jungle.job.pressed'),
  'jungle.job.full': () => phrase('jungle.job.full'),
});

// ---- the props (one mesh each; the parts are joined by hand so this chunk pulls nothing shared into start-up) ----------------------------------------
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
function finish(mesh, name) {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noCast = true;
  return mesh;
}
function joinParts(parts) {
  const pos = new Float32Array(parts.reduce((n, g) => n + g.attributes.position.array.length, 0));
  const col = new Float32Array(pos.length);
  let at = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, at); col.set(g.attributes.color.array, at); at += g.attributes.position.array.length; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
const solid = (parts, name) => finish(new THREE.Mesh(joinParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true })), name);
const ring = () => paint(new THREE.TorusGeometry(0.34, 0.025, 4, 14).rotateX(Math.PI / 2).translate(0, 0.08, 0), 0xffe9a8); // the glowing ring that says "look here"
// A leaf umbrella: a broad green leaf on a thin stick (about 0.5 m)
const makeUmbrella = () => solid([
  paint(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5).translate(0, 0.2, 0), 0x8a6240), paint(new THREE.ConeGeometry(0.3, 0.16, 8).translate(0, 0.46, 0), 0x4fae5a),
], 'jungle:jobumbrella');
// A leaf boat: a folded green leaf with a small stick mast (about 0.5 m)
const makeBoat = () => solid([
  paint(new THREE.BoxGeometry(0.46, 0.06, 0.2).translate(0, 0.04, 0), 0x6cbc54), paint(new THREE.BoxGeometry(0.18, 0.06, 0.12).translate(0.26, 0.07, 0), 0x6cbc54),
  paint(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4).translate(0, 0.2, 0), 0x8a6240), paint(new THREE.BoxGeometry(0.01, 0.16, 0.14).translate(0.06, 0.26, 0), 0xf4e8d2),
], 'jungle:jobboat');
// A cup of rainwater: a little brown cup with a bright blue top (about 0.2 m)
const makeCup = () => solid([
  paint(new THREE.CylinderGeometry(0.1, 0.07, 0.16, 8).translate(0, 0.08, 0), 0xb98a5a), paint(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 8).translate(0, 0.15, 0), 0x6ab8e8),
], 'jungle:jobcup');
// The rainbow frog: a round little frog with a stripe of every colour down its back, and a glowing ring so it can be spotted from a way off (about 0.5 m)
const makeFrog = () => solid([
  paint(new THREE.SphereGeometry(0.17, 8, 6).scale(1, 0.7, 1.2).translate(0, 0.14, 0), 0x58c868), paint(new THREE.BoxGeometry(0.05, 0.02, 0.3).translate(-0.06, 0.26, 0), 0xe85a5a),
  paint(new THREE.BoxGeometry(0.05, 0.02, 0.3).translate(0, 0.27, 0), 0xf0c84a), paint(new THREE.BoxGeometry(0.05, 0.02, 0.3).translate(0.06, 0.26, 0), 0x5a9ae8), ring(),
], 'jungle:jobfrog');
// Mossy's slipper: a soft red slipper with the glowing ring (about 0.4 m)
const makeSlipper = () => solid([
  paint(new THREE.BoxGeometry(0.34, 0.08, 0.16).translate(0, 0.05, 0), 0xc0453f), paint(new THREE.SphereGeometry(0.1, 8, 6).scale(1.2, 0.8, 1).translate(0.08, 0.1, 0), 0xe0605a), ring(),
], 'jungle:jobslipper');
// A hanging vine: a long green strand with two leaves and a faint ring at its foot. Basic material, so it reads without any light: green, and a brighter green once shaken.
const makeVine = () => finish(new THREE.Mesh(joinParts([
  paint(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 5).translate(0, 1.2, 0), 0xffffff), paint(new THREE.SphereGeometry(0.16, 6, 4).scale(1.4, 0.5, 1).translate(0.14, 0.7, 0), 0xffffff),
  paint(new THREE.SphereGeometry(0.16, 6, 4).scale(1.4, 0.5, 1).translate(-0.14, 1.3, 0), 0xffffff), ring(),
]), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x4a8a3a, fog: true })), 'jungle:jobvine');
const VINE_COLOR = Object.freeze({ fresh: 0x4a8a3a, shaken: 0xa8e070 });
const MAKE = Object.freeze({ umbrella: makeUmbrella, boat: makeBoat, rain: makeCup, frog: makeFrog, slipper: makeSlipper });

// createJungleErrandLive(ctx) -> { update, promptAt, interact, credit, state, plan, props, dispose }
// ctx: { scene, reducedMotion, progression, log, audio, roomSeed, visits, send (tells the room an errand is done) }
export function createJungleErrandLive(ctx) {
  const { scene, reducedMotion = false, progression = null, log = null, audio = null } = ctx;
  const eligible = M.normalize(progression?.state?.jungle).step >= M.STEP.done; // the story was told before this walk began
  const plan = E.planJungleErrand(ctx.roomSeed, ctx.visits ?? 0);
  const kind = plan.kind;
  const carry = E.CARRIES[kind] ?? null; // umbrella, boat, rain
  let done = !!log && log.count(E.ERRAND_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let target = null;
  let told = false;
  let shaken = 0; // vines: a bit mask of three
  let item = 'home'; // umbrella, boat or rain: 'home' | 'carried' | 'given' (never saved)
  const props = [];
  const own = (m) => { props.push(m); scene.add(m); return m; };
  let itemMesh = null; let seekMesh = null; let vineMeshes = [];

  const active = () => eligible && !done && !disposed;
  const seekAt = kind === 'frog' ? E.FROG_SPOTS[plan.spot] : kind === 'slipper' ? E.SLIPPER_SPOTS[plan.spot] : null;
  const high = (p, at) => (p.y ?? 0) >= (at.minY ?? -1);

  if (eligible && !done) {
    if (carry) itemMesh = own(MAKE[kind]());
    else if (seekAt) seekMesh = own(MAKE[kind]());
    else if (kind === 'vines') vineMeshes = E.VINES.map((V) => { const m = own(makeVine()); m.position.set(V.x, 1.3, V.z); m.scale.setScalar(1.6); return m; });
  }

  function place(given) {
    const m = itemMesh;
    const at = given ? carry.dest : carry.home;
    m.scale.setScalar(1.5);
    m.position.set(at.x, at.y + 0.06 + (given || reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6)), at.z);
    m.rotation.set(0, 0.8, 0);
    m.visible = true;
  }
  function paintVines() {
    vineMeshes.forEach((m, i) => {
      const was = shaken & (1 << i);
      m.material.color.setHex(was ? VINE_COLOR.shaken : VINE_COLOR.fresh);
      m.rotation.z = reducedMotion || !was ? 0 : 0.12 * Math.sin(clock * 2.2 + i);
    });
  }

  // ---- done ---------------------------------------------------------------------------------------------------------------------------
  function complete({ remote = false } = {}) {
    if (!active()) return false;
    done = true;
    const paid = log ? log.awardOnce('junglejob', E.ERRAND_KEY, SAY['jungle.job.pay']()) : 0;
    if (paid > 0 || !log) {
      const bits = progression?.state?.jungle?.album ?? 0;
      const i = E.nextPressing(bits);
      if (i >= 0 && progression?.state) {
        progression.state.jungle = { ...(progression.state.jungle ?? {}), album: E.withPressing(bits, i) };
        progression.addPoints?.(0); // the save's own "persist now": it adds nothing
        try { progression.recordSighting?.('jw7'); } catch { /* a stand-in save */ }
        say('jungle-job-card', `${E.ALBUM[i][0]} ${SAY['jungle.job.pressed']()}`);
        if (E.nextPressing(progression.state.jungle.album) < 0) say('jungle-job-full', SAY['jungle.job.full']());
      }
      try { progression?.recordSighting?.('jw6'); } catch { /* a stand-in save */ }
    }
    if (!remote) ctx.send?.(E.JOB_WIRE);
    for (const m of props) if (m !== itemMesh && !vineMeshes.includes(m)) m.visible = false; // the errand is over: nothing left to find
    if (vineMeshes.length) { shaken = 7; paintVines(); }
    if (itemMesh) { item = 'given'; place(true); } // what was carried stays where it was brought
    audio?.chime?.();
    return true;
  }

  // ---- the action button ----------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (!active() || !catPos) return null;
    if (seekAt) return dist(catPos, seekAt) < E.SEEK_REACH ? { kind: 'seek', line: SAY[`jungle.job.${kind}.prompt`]() } : null;
    if (kind === 'vines') {
      const n = E.vineStep(shaken, catPos);
      return n !== shaken ? { kind: 'vine', pos: catPos, line: SAY['jungle.job.vine.prompt']() } : null;
    }
    if (carry) {
      if (item === 'home' && dist(catPos, carry.home) < carry.home.reach) return { kind: 'pick', line: SAY['jungle.job.pick.prompt']() };
      if (item === 'carried' && dist(catPos, carry.dest) < carry.dest.reach && high(catPos, carry.dest)) return { kind: 'give', line: SAY[`jungle.job.${kind}.prompt`]() };
    }
    return null;
  }
  const lineOf = () => SAY[`jungle.job.${kind}`]();

  return {
    plan,
    get state() { return { clock, kind, eligible, done, item, shaken }; },
    get props() { return props.slice(); },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'seek' || t.kind === 'give') complete();
      else if (t.kind === 'pick') {
        item = 'carried';
        audio?.chime?.();
        say('jungle-job-got', SAY['jungle.job.pick.got']());
      } else if (t.kind === 'vine') {
        shaken = E.vineStep(shaken, t.pos);
        paintVines();
        audio?.chime?.();
        if (E.vineCount(shaken) >= E.VINES.length) complete();
        else say('jungle-job-vine', SAY['jungle.job.vine.shook']());
      }
      return t.kind;
    },
    // an errand done by anyone in the room (a `jl-job` event): the same pay on this device, once
    credit(ev) {
      if (!E.isJobEvent(ev) || disposed) return null;
      return complete({ remote: true }) ? 'job' : null;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      if (!active()) return;
      if (!told && clock > 2.5) { told = true; say('jungle-job-today', lineOf()); }
      const near = (p) => !catPos || dist(catPos, p) <= PROP_NEAR;
      if (kind === 'vines') {
        paintVines();
        vineMeshes.forEach((m, i) => { m.visible = near(E.VINES[i]); });
      } else if (seekMesh) {
        seekMesh.position.set(seekAt.x, 0.06 + (reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6)), seekAt.z);
        seekMesh.rotation.y = reducedMotion ? 0.4 : clock * 0.9;
        seekMesh.scale.setScalar(1.8);
        seekMesh.visible = near(seekAt);
      } else if (itemMesh) {
        const m = itemMesh;
        if (item === 'carried' && catPos) {
          const yaw = session?.cat?.rotation?.y ?? 0;
          m.position.set(catPos.x - Math.sin(yaw) * 0.45, (catPos.y ?? 0) + 0.62, catPos.z - Math.cos(yaw) * 0.45);
          m.rotation.set(-0.9, yaw, 0, 'YXZ');
          m.scale.setScalar(0.9);
          m.visible = true;
        } else { place(false); m.visible = near(carry.home); }
      }
      void t; void camera;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      item = 'home'; // a carried thing is not kept: the next walk finds it at its own place
      for (const m of props) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
