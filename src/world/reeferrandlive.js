// =============================================================================
// MARLO'S ERRAND OF THE DAY ON A WALK (milestone R7). Made once a walk by world/reefstorylife.js; update(dt, t, catPos, camera, session) every frame; the walk asks promptAt(catPos)
// and interact() for the action button. The rules and the plan are world/reeferrand.js (pure); this carries one errand out:
//   * It is offered from the WALK AFTER the housewarming (a walk that begins with step 7). planReefErrand(roomSeed, visits) picks the errand, the day's shell and the glove's spot, so
//     every cat in a room has the same one. Nothing is sent to a partner and the errand itself is never saved.
//   * DONE pays AWARDS.reefjob once a walk (log.awardOnce under ERRAND_KEY: the walk's own once-a-walk rule, which a resumed walk keeps), puts the lowest unset postcard bit into
//     state.reef.album (12 bits; the merge unions them) and counts the journal pages `rfalbum` (a new postcard) and `rferrand` (an errand paid).
// No fail state, nothing timed: the school waits for her, a glove stays where it lies. Draws no random number and reads no clock (every number is a constant or a walk second).
// The float height arrives as a number (`lift`, handed over by world/reefstorylife.js); this file never names the player's property. Props are made only for today's errand,
// never casters, one mesh each, drawn only within PROP_NEAR metres of her.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from '../reefmission.js';
import * as E from './reeferrand.js';
import * as K from './reefparts.js';
import { reefY } from './reefplan.js';
import { REEF_COLLECTIBLES } from './reeffindsplan.js';
import './reeferrandwords.js';

export const PROP_NEAR = 45; // m: a prop farther than this from her is not drawn
export const PICK_REACH = 1.8; // m: pick the glove or the hat shell up
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every line is a literal phrase call so the phrase table's scan reads it
const SAY = Object.freeze({
  'reef.errand.glass': () => phrase('reef.errand.glass'),
  'reef.errand.school': () => phrase('reef.errand.school'),
  'reef.errand.shell': () => phrase('reef.errand.shell'),
  'reef.errand.rings': () => phrase('reef.errand.rings'),
  'reef.errand.snail': () => phrase('reef.errand.snail'),
  'reef.errand.glove': () => phrase('reef.errand.glove'),
  'reef.errand.give.prompt': () => phrase('reef.errand.give.prompt'),
  'reef.errand.glass.need': () => phrase('reef.errand.glass.need'),
  'reef.errand.pick.prompt': () => phrase('reef.errand.pick.prompt'),
  'reef.errand.pick.got': () => phrase('reef.errand.pick.got'),
  'reef.errand.snail.prompt': () => phrase('reef.errand.snail.prompt'),
  'reef.errand.ring': () => phrase('reef.errand.ring'),
  'reef.errand.pay': () => phrase('reef.errand.pay'),
  'reef.errand.postcard': () => phrase('reef.errand.postcard'),
  'reef.errand.full': () => phrase('reef.errand.full'),
});

// ---- the props (one mesh each) ---------------------------------------------------------------------------------------------------
function propMaterial() { return new THREE.MeshLambertMaterial({ vertexColors: true }); }
function finish(mesh, name) {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noCast = true;
  return mesh;
}
const solid = (parts, name) => finish(new THREE.Mesh(mergeGeometries(parts), propMaterial()), name);
const paint = K.paint;
// The lost glove: a palm, four fingers, a thumb and a cuff (about 0.7 m), warm orange with a pale cuff
function makeGlove() {
  const box = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
  const o = 0xf08a3a;
  const m = solid([
    box(0.2, 0.06, 0.22, 0, 0, 0, o), box(0.04, 0.05, 0.16, -0.075, 0, -0.18, o), box(0.04, 0.05, 0.18, -0.025, 0, -0.19, o),
    box(0.04, 0.05, 0.17, 0.025, 0, -0.185, o), box(0.04, 0.05, 0.14, 0.075, 0, -0.165, o), box(0.04, 0.05, 0.12, 0.14, 0, -0.04, o),
    box(0.22, 0.09, 0.07, 0, 0, 0.14, 0xf4efe2),
  ], 'reef:errandglove');
  m.scale.setScalar(1.8);
  return m;
}
// A small hat shell: a pink half-dome with a tiny point on top (about 0.4 m)
function makeHat() {
  return solid([
    paint(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0, 0), 0xf29bb5),
    paint(new THREE.ConeGeometry(0.08, 0.18, 6).translate(0, 0.26, 0), 0xffd0de),
    paint(new THREE.CylinderGeometry(0.22, 0.24, 0.04, 10).translate(0, 0.0, 0), 0xc86a8a),
  ], 'reef:errandhat');
}
// The sleepy snail: a soft body, a spiral shell of two rings and a closed eye (a z mark floats over it in the light, never text)
function makeSnail() {
  return solid([
    paint(new THREE.SphereGeometry(0.34, 10, 6).scale(1.5, 0.5, 0.8).translate(0, 0.17, 0), 0xcdbfa4),
    paint(new THREE.SphereGeometry(0.34, 10, 8).translate(-0.12, 0.5, 0), 0xb08a5e),
    paint(new THREE.TorusGeometry(0.22, 0.05, 5, 10).rotateY(Math.PI / 2).translate(-0.12, 0.5, 0.0), 0x8a6a40),
    paint(new THREE.SphereGeometry(0.16, 8, 6).translate(0.5, 0.33, 0), 0xdccfb6),
    paint(new THREE.BoxGeometry(0.05, 0.02, 0.12).translate(0.62, 0.38, 0), 0x4a3b2a),
  ], 'reef:errandsnail');
}
// The school: nine little fish in one loose blob (about 2.4 m across), one mesh
function makeSchool() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const x = Math.cos(a) * (0.4 + (i % 3) * 0.35);
    const y = ((i * 7) % 5) * 0.16 - 0.3;
    const z = Math.sin(a) * (0.4 + ((i + 1) % 3) * 0.3);
    const hex = i % 3 === 0 ? 0xffb347 : 0xffd27a;
    parts.push(paint(new THREE.ConeGeometry(0.1, 0.34, 5).rotateZ(-Math.PI / 2).translate(x, y, z), hex));
    parts.push(paint(new THREE.ConeGeometry(0.09, 0.14, 4).rotateZ(Math.PI / 2).translate(x - 0.22, y, z), 0xff9a2e));
  }
  return solid(parts, 'reef:errandschool');
}
// The ring of kelp: eight tall stalks round a circle on the seabed, in world coordinates (static)
function makeKelpRing() {
  const { x, z, r, stalks } = E.SCHOOL.ring;
  const parts = [];
  for (let i = 0; i < stalks; i++) {
    const a = (i / stalks) * Math.PI * 2;
    const sx = x + Math.cos(a) * (r + 0.2);
    const sz = z + Math.sin(a) * (r + 0.2);
    parts.push(paint(new THREE.CylinderGeometry(0.06, 0.18, 3.2, 5).translate(sx, reefY(sx, sz) + 1.6, sz), i % 2 ? 0x3f9a4c : 0x56b45c));
    parts.push(paint(new THREE.SphereGeometry(0.22, 6, 4).translate(sx, reefY(sx, sz) + 3.3, sz), 0x6fcf6e));
  }
  // a pale arch across the top so it reads as a ring from afar
  parts.push(paint(new THREE.TorusGeometry(r + 0.2, 0.07, 5, 16).rotateX(Math.PI / 2).translate(x, reefY(x, z) + 3.1, z), 0x9fe6a0));
  return solid(parts, 'reef:errandkelp');
}
// One bubble ring: a translucent torus (additive, one mesh), standing upright and turned to face the way she comes from
function makeRingMesh(yaw) {
  const g = new THREE.TorusGeometry(E.RING_R, 0.09, 6, 20);
  const mat = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: 0.6 });
  const m = finish(new THREE.Mesh(g, mat), 'reef:errandring');
  m.rotation.y = yaw;
  return m;
}
// The changed shell's glow: a soft pink halo over its spot (one additive sphere)
function makeGlow() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7fb0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity: 0.45 });
  return finish(new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat), 'reef:errandglow');
}

// createErrandLive(ctx) -> { update, promptAt, interact, state, plan, dispose }
// ctx: { scene, reducedMotion, progression, log, audio, roomSeed, visits, marlo (world/reefmarlo.js's), lift: () => float height over the sand (a number) }
export function createErrandLive(ctx) {
  const { scene, reducedMotion = false, progression = null, log = null, audio = null } = ctx;
  const lift = typeof ctx.lift === 'function' ? ctx.lift : () => 0;
  const marloAt = () => ctx.marlo?.marlo ?? null;
  const eligible = M.normalize(progression?.state?.reef).step >= M.STEP.done; // the story was told before this walk began
  const plan = E.planReefErrand(ctx.roomSeed, ctx.visits ?? 0);
  const kind = plan.kind;
  let done = !!log && log.count(E.ERRAND_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let target = null;
  let told = false;
  let pos = { x: 0, z: 0, y: 0 };
  let startIds = null; // the glass and shells present when the walk began
  let session0 = null;
  let schoolP = 0;
  let nextRing = 0;
  let item = 'home'; // glove or hat shell: 'home' | 'carried' | 'given'
  const props = [];
  const own = (m) => { props.push(m); scene.add(m); return m; };
  let gloveMesh = null; let hatMesh = null; let snailMesh = null; let schoolMesh = null; let kelpMesh = null; let glow = null;
  let ringMeshes = [];

  const active = () => eligible && !done && !disposed;
  const spot = E.GLOVE_SPOTS[plan.glove];
  const shellSpot = REEF_COLLECTIBLES.find((c) => c.id === E.SHELL_IDS[plan.shell]);
  const presentNow = () => new Set(session0?.collectibleMeshes && typeof session0.collectibleMeshes.keys === 'function' ? [...session0.collectibleMeshes.keys()] : []);

  if (eligible && !done) {
    if (kind === 'glove') gloveMesh = own(makeGlove());
    else if (kind === 'snail') { hatMesh = own(makeHat()); snailMesh = own(makeSnail()); snailMesh.position.set(E.SNAIL.x, reefY(E.SNAIL.x, E.SNAIL.z), E.SNAIL.z); }
    else if (kind === 'school') { schoolMesh = own(makeSchool()); kelpMesh = own(makeKelpRing()); }
    else if (kind === 'shell') glow = own(makeGlow());
    else if (kind === 'rings') {
      ringMeshes = E.RINGS.map((r, i) => {
        const from = i === 0 ? { x: 0, z: 36 } : E.RINGS[i - 1];
        const m = own(makeRingMesh(Math.atan2(r.x - from.x, r.z - from.z)));
        m.position.set(r.x, reefY(r.x, r.z) + r.y, r.z);
        return m;
      });
    }
  }

  // ---- done ---------------------------------------------------------------------------------------------------------------------------
  function complete() {
    if (!active()) return false;
    done = true;
    const paid = log ? log.awardOnce('reefjob', E.ERRAND_KEY, SAY['reef.errand.pay']()) : 0;
    if (paid > 0 || !log) {
      const bits = progression?.state?.reef?.album ?? 0;
      const i = E.nextPostcard(bits);
      if (i >= 0 && progression?.state) {
        progression.state.reef = { ...(progression.state.reef ?? {}), album: E.withPostcard(bits, i) };
        progression.addPoints?.(0); // the save's own "persist now": it adds nothing
        try { progression.recordSighting?.('rfalbum'); } catch { /* a stand-in save */ }
        say('reef-errand-card', `${E.ALBUM[i][0]} ${SAY['reef.errand.postcard']()}`);
        if (E.nextPostcard(progression.state.reef.album) < 0) say('reef-errand-full', SAY['reef.errand.full']());
      }
      try { progression?.recordSighting?.('rferrand'); } catch { /* a stand-in save */ }
    }
    for (const m of props) if (m !== snailMesh && m !== kelpMesh) m.visible = false; // the errand is over: nothing left to find
    audio?.chime?.();
    return true;
  }

  // ---- the action button ----------------------------------------------------------------------------------------------------------
  const onGround = () => lift() < 1.2;
  const nearMarlo = (p) => { const m = marloAt(); return !!m && dist(p, m) < E.MARLO_REACH; };
  function decide(catPos) {
    if (!active() || !catPos) return null;
    if (kind === 'glass' && nearMarlo(catPos)) return { kind: 'glass', line: SAY['reef.errand.give.prompt']() };
    if (kind === 'glove') {
      if (item === 'home' && onGround() && dist(catPos, spot) < PICK_REACH) return { kind: 'pick', line: SAY['reef.errand.pick.prompt']() };
      if (item === 'carried' && nearMarlo(catPos)) return { kind: 'give', line: SAY['reef.errand.give.prompt']() };
    }
    if (kind === 'snail') {
      if (item === 'home' && onGround() && dist(catPos, E.HAT) < E.HAT.reach) return { kind: 'pick', line: SAY['reef.errand.pick.prompt']() };
      if (item === 'carried' && dist(catPos, E.SNAIL) < E.SNAIL.reach) return { kind: 'give', line: SAY['reef.errand.snail.prompt']() };
    }
    return null;
  }
  const lineOf = () => SAY[`reef.errand.${kind}`]();
  const glassTaken = () => (startIds ? E.taken(startIds, presentNow(), E.GLASS_IDS) : 0);

  return {
    plan,
    get state() { return { clock, kind, eligible, done, item, schoolP, nextRing, glass: glassTaken() }; },
    get props() { return props.slice(); },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'glass') {
        if (glassTaken() >= E.GLASS_IDS.length) complete();
        else say('reef-errand-need', SAY['reef.errand.glass.need']());
      } else if (t.kind === 'pick') {
        item = 'carried';
        audio?.chime?.();
        say('reef-errand-got', SAY['reef.errand.pick.got']());
      } else if (t.kind === 'give') {
        item = 'given';
        complete();
      }
      return t.kind;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      if (catPos) pos = { x: catPos.x, z: catPos.z, y: catPos.y ?? 0 };
      session0 = session ?? session0;
      if (!active()) return;
      if (!told && clock > 2.5) { told = true; say('reef-errand-today', lineOf()); }
      if (!startIds && session0?.collectibleMeshes) startIds = presentNow();
      const near = (p) => !catPos || dist(catPos, p) <= PROP_NEAR;
      const bob = reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6);
      if (kind === 'shell' && glow) {
        if (startIds?.has(shellSpot.id) && !presentNow().has(shellSpot.id)) { complete(); return; }
        glow.position.set(shellSpot.x, reefY(shellSpot.x, shellSpot.z) + 0.35 + bob, shellSpot.z);
        glow.visible = presentNow().has(shellSpot.id) && near(shellSpot);
      } else if (kind === 'school' && schoolMesh) {
        schoolP = E.schoolStep(schoolP, catPos ? dist(catPos, E.schoolAt(schoolP)) : 99, step);
        const at = E.schoolAt(schoolP);
        const yaw = Math.atan2(E.SCHOOL.ring.x - E.SCHOOL.start.x, E.SCHOOL.ring.z - E.SCHOOL.start.z);
        schoolMesh.position.set(at.x, reefY(at.x, at.z) + 1.5 + bob * 2, at.z);
        schoolMesh.rotation.y = yaw - Math.PI / 2 + (reducedMotion ? 0 : 0.15 * Math.sin(clock * 2.2));
        schoolMesh.visible = near(at);
        kelpMesh.visible = near(E.SCHOOL.ring);
        if (schoolP >= 1 && catPos && dist(catPos, E.SCHOOL.ring) <= E.SCHOOL.ring.r) complete();
      } else if (kind === 'rings' && ringMeshes.length) {
        const n = catPos ? E.ringStep(nextRing, catPos.x, catPos.z, lift()) : nextRing;
        if (n !== nextRing) { nextRing = n; if (nextRing < E.RINGS.length) { audio?.chime?.(); say('reef-errand-ring', SAY['reef.errand.ring']()); } }
        ringMeshes.forEach((m, i) => {
          m.visible = i >= nextRing && near(E.RINGS[i]);
          m.material.opacity = i === nextRing ? 0.85 : 0.35;
          m.scale.setScalar(reducedMotion || i !== nextRing ? 1 : 1 + 0.05 * Math.sin(clock * 3));
        });
        if (nextRing >= E.RINGS.length) complete();
      } else if ((kind === 'glove' && gloveMesh) || (kind === 'snail' && hatMesh)) {
        const m = kind === 'glove' ? gloveMesh : hatMesh;
        const home = kind === 'glove' ? spot : E.HAT;
        if (item === 'carried' && catPos) {
          const yaw = session?.cat?.rotation?.y ?? 0;
          m.position.set(catPos.x - Math.sin(yaw) * 0.45, catPos.y + 0.62, catPos.z - Math.cos(yaw) * 0.45);
          m.rotation.set(-0.9, yaw, 0, 'YXZ');
          m.scale.setScalar(kind === 'glove' ? 1.0 : 0.8);
          m.visible = true;
        } else {
          m.scale.setScalar(kind === 'glove' ? 1.8 : 1);
          m.position.set(home.x, reefY(home.x, home.z) + 0.06 + bob, home.z);
          m.rotation.set(0, 0.8, 0);
          m.visible = near(home);
        }
      }
      if (snailMesh) snailMesh.visible = near(E.SNAIL);
      void t; void camera;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of props) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
