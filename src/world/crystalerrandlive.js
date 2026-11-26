// =============================================================================
// LUMI'S GLOW ERRAND OF THE DAY ON A WALK (milestone C7). Made once a walk by world/crystal.js's life; update(dt, t, catPos, camera, session) every frame; the walk asks promptAt(catPos)
// and interact() for the action button. The rules and the plan are world/crystalerrand.js (pure); this carries one errand out:
//   * It is offered from the WALK AFTER the story (a walk that begins with step 7). planCaveErrand(roomSeed, visits) picks the errand, the day's changed glint and the glove's and the dim
//     cluster's place, so every cat in a room has the same one. Nothing is sent to a partner and the errand itself is never saved.
//   * DONE pays AWARDS.cavejob once a walk (log.awardOnce under ERRAND_KEY: the walk's own once-a-walk rule, which a resumed walk keeps), puts the lowest unset rubbing bit into
//     state.crystal.album (12 bits; the merge unions them) and counts the journal pages `ccrubbings` (a new rubbing) and `ccerrand` (an errand paid).
// No fail state, nothing timed: the spark waits for her, a glove stays where it lies. A carried glove or stone is never saved: it is back at its place on the next walk, whatever ends
// a walk (dispose forgets it). Draws no random number and reads no clock (every number is a constant or a walk second). Props are made only for today's errand, never casters, one
// mesh each, drawn only within PROP_NEAR metres of her. The cave's one PointLight is not touched.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from '../crystalmission.js';
import * as E from './crystalerrand.js';
import * as K from './crystalparts.js';
import { crystalY } from './crystalplan.js';
import { CRYSTAL_COLLECTIBLES } from './crystalfindsplan.js';
import './crystalerrandwords.js';

export const PROP_NEAR = 45; // m: a prop farther than this from her is not drawn
export const PICK_REACH = 1.8; // m: pick the glove or the stone up
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every line is a literal phrase call so the phrase table's scan reads it
const SAY = Object.freeze({
  'crystal.errand.glints': () => phrase('crystal.errand.glints'),
  'crystal.errand.relight': () => phrase('crystal.errand.relight'),
  'crystal.errand.follow': () => phrase('crystal.errand.follow'),
  'crystal.errand.change': () => phrase('crystal.errand.change'),
  'crystal.errand.bug': () => phrase('crystal.errand.bug'),
  'crystal.errand.glove': () => phrase('crystal.errand.glove'),
  'crystal.errand.give.prompt': () => phrase('crystal.errand.give.prompt'),
  'crystal.errand.glints.need': () => phrase('crystal.errand.glints.need'),
  'crystal.errand.pick.prompt': () => phrase('crystal.errand.pick.prompt'),
  'crystal.errand.pick.got': () => phrase('crystal.errand.pick.got'),
  'crystal.errand.bug.prompt': () => phrase('crystal.errand.bug.prompt'),
  'crystal.errand.relight.prompt': () => phrase('crystal.errand.relight.prompt'),
  'crystal.errand.pay': () => phrase('crystal.errand.pay'),
  'crystal.errand.rubbing': () => phrase('crystal.errand.rubbing'),
  'crystal.errand.full': () => phrase('crystal.errand.full'),
});

// ---- the props (one mesh each) ---------------------------------------------------------------------------------------------------
function finish(mesh, name) {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noMerge = true;
  mesh.userData.noCast = true;
  return mesh;
}
const solid = (parts, name) => finish(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true })), name);
const glowMat = (hex, opacity) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity });
const paint = K.paint;
// The dropped glove: a palm, four fingers, a thumb and a cuff (about 0.7 m), warm orange with a pale cuff
function makeGlove() {
  const box = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
  const o = 0xf08a3a;
  const m = solid([
    box(0.2, 0.06, 0.22, 0, 0, 0, o), box(0.04, 0.05, 0.16, -0.075, 0, -0.18, o), box(0.04, 0.05, 0.18, -0.025, 0, -0.19, o),
    box(0.04, 0.05, 0.17, 0.025, 0, -0.185, o), box(0.04, 0.05, 0.14, 0.075, 0, -0.165, o), box(0.04, 0.05, 0.12, 0.14, 0, -0.04, o),
    box(0.22, 0.09, 0.07, 0, 0, 0.14, 0xf4efe2),
  ], 'crystal:errandglove');
  m.scale.setScalar(1.8);
  return m;
}
// A small smooth stone: a pale grey-lilac pebble (about 0.4 m) with a warm rim
function makeStone() {
  return solid([
    paint(new THREE.SphereGeometry(0.22, 10, 6).scale(1, 0.62, 0.85).translate(0, 0.1, 0), 0xcdbfd6),
    paint(new THREE.CylinderGeometry(0.2, 0.23, 0.04, 10).translate(0, 0, 0), 0xb09ab8),
  ], 'crystal:errandstone');
}
// The sleepy glow-bug: a soft round body with a dim tail lamp and a closed eye
function makeBug() {
  return solid([
    paint(new THREE.SphereGeometry(0.3, 10, 6).scale(1.5, 0.6, 0.85).translate(0, 0.17, 0), 0x9a86b0),
    paint(new THREE.SphereGeometry(0.18, 8, 6).translate(-0.5, 0.18, 0), 0xc8f0a8),
    paint(new THREE.SphereGeometry(0.16, 8, 6).translate(0.46, 0.22, 0), 0xb4a0c8),
    paint(new THREE.BoxGeometry(0.05, 0.02, 0.12).translate(0.58, 0.27, 0), 0x3a2f48),
  ], 'crystal:errandbug');
}
// The spark: a small glowing star, one additive mesh
function makeSpark() {
  return finish(new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glowMat(0xfff0b0, 0.85)), 'crystal:errandspark');
}
// The ring of small crystals: eight prisms round a circle on the floor, in world coordinates (static), with a pale arch over them
function makeRing() {
  const { x, z, r, stalks } = E.SPARK.ring;
  const parts = [];
  for (let i = 0; i < stalks; i++) {
    const a = (i / stalks) * Math.PI * 2;
    parts.push(K.crystalPrism(0.22, 1.5 + 0.3 * (i % 2), i % 2 ? 'blue' : 'heart', x + Math.cos(a) * (r + 0.2), z + Math.sin(a) * (r + 0.2), 0, a, true));
  }
  parts.push(paint(new THREE.TorusGeometry(r + 0.2, 0.06, 5, 16).rotateX(Math.PI / 2).translate(x, crystalY(x, z) + 1.7, z), 0xffe9c0));
  return solid(parts, 'crystal:errandring');
}
// The dim cluster (lit = false: grey-lilac, no glow) and the same five crystals awake (lit = true), both in world coordinates at one spot
function makeCluster(spot, lit) {
  const parts = [];
  for (let n = 0; n < 5; n++) {
    const a = n * 2.4;
    const sp = n === 0 ? 0 : 0.5;
    const h = n === 0 ? 1.6 : 0.9 + 0.2 * (n % 3);
    const px = spot.x + Math.cos(a) * sp;
    const pz = spot.z + Math.sin(a) * sp;
    if (lit) parts.push(K.crystalPrism(n === 0 ? 0.26 : 0.17, h, n % 2 ? 'blue' : 'rose', px, pz, 0, a, true));
    else parts.push(paint(new THREE.ConeGeometry(n === 0 ? 0.26 : 0.17, h, 6).translate(px, crystalY(px, pz) + h / 2, pz), n % 2 ? 0x7d7088 : 0x8a7d94));
  }
  return solid(parts, lit ? 'crystal:errandlit' : 'crystal:errandcluster');
}
// The changed glint's halo: a soft violet glow over its spot (one additive sphere)
function makeGlow() {
  return finish(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glowMat(0xc58cff, 0.45)), 'crystal:errandglow');
}

// createCaveErrandLive(ctx) -> { update, promptAt, interact, state, plan, dispose }
// ctx: { scene, reducedMotion, progression, log, audio, roomSeed, visits, lumi (world/crystallife.js's createLumi result, read for her place) }
export function createCaveErrandLive(ctx) {
  const { scene, reducedMotion = false, progression = null, log = null, audio = null } = ctx;
  const lumiAt = () => ctx.lumi?.lumi ?? null;
  const eligible = M.normalize(progression?.state?.crystal).step >= M.STEP.done; // the story was told before this walk began
  const plan = E.planCaveErrand(ctx.roomSeed, ctx.visits ?? 0);
  const kind = plan.kind;
  let done = !!log && log.count(E.ERRAND_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let target = null;
  let told = false;
  let startIds = null; // the glints and finds present when the walk began
  let session0 = null;
  let sparkP = 0;
  let item = 'home'; // glove or stone: 'home' | 'carried' | 'given' (never saved)
  const props = [];
  const own = (m) => { props.push(m); scene.add(m); return m; };
  let gloveMesh = null; let stoneMesh = null; let bugMesh = null; let sparkMesh = null; let ringMesh = null; let glow = null; let dimMesh = null; let litMesh = null;

  const active = () => eligible && !done && !disposed;
  const spot = E.SPOTS[plan.spot];
  const changed = CRYSTAL_COLLECTIBLES.find((c) => c.id === E.CHANGE_IDS[plan.change]);
  const presentNow = () => new Set(session0?.collectibleMeshes && typeof session0.collectibleMeshes.keys === 'function' ? [...session0.collectibleMeshes.keys()] : []);

  if (eligible && !done) {
    if (kind === 'glove') gloveMesh = own(makeGlove());
    else if (kind === 'bug') { stoneMesh = own(makeStone()); bugMesh = own(makeBug()); bugMesh.position.set(E.BUG.x, crystalY(E.BUG.x, E.BUG.z), E.BUG.z); }
    else if (kind === 'follow') { sparkMesh = own(makeSpark()); ringMesh = own(makeRing()); }
    else if (kind === 'change') glow = own(makeGlow());
    else if (kind === 'relight') { dimMesh = own(makeCluster(spot, false)); litMesh = own(makeCluster(spot, true)); litMesh.visible = false; }
  }

  // ---- done ---------------------------------------------------------------------------------------------------------------------------
  function complete() {
    if (!active()) return false;
    done = true;
    const paid = log ? log.awardOnce('cavejob', E.ERRAND_KEY, SAY['crystal.errand.pay']()) : 0;
    if (paid > 0 || !log) {
      const bits = progression?.state?.crystal?.album ?? 0;
      const i = E.nextRubbing(bits);
      if (i >= 0 && progression?.state) {
        progression.state.crystal = { ...(progression.state.crystal ?? {}), album: E.withRubbing(bits, i) };
        progression.addPoints?.(0); // the save's own "persist now": it adds nothing
        try { progression.recordSighting?.('ccrubbings'); } catch { /* a stand-in save */ }
        say('crystal-errand-card', `${E.ALBUM[i][0]} ${SAY['crystal.errand.rubbing']()}`);
        if (E.nextRubbing(progression.state.crystal.album) < 0) say('crystal-errand-full', SAY['crystal.errand.full']());
      }
      try { progression?.recordSighting?.('ccerrand'); } catch { /* a stand-in save */ }
    }
    for (const m of props) if (m !== bugMesh && m !== ringMesh && m !== litMesh) m.visible = false; // the errand is over: nothing left to find
    if (litMesh) litMesh.visible = true;
    audio?.chime?.();
    return true;
  }

  // ---- the action button ----------------------------------------------------------------------------------------------------------
  const nearLumi = (p) => { const m = lumiAt(); return !!m && dist(p, m) < E.LUMI_REACH; };
  function decide(catPos) {
    if (!active() || !catPos) return null;
    if (kind === 'glints' && nearLumi(catPos)) return { kind: 'glints', line: SAY['crystal.errand.give.prompt']() };
    if (kind === 'relight' && dist(catPos, spot) < E.CLUSTER_REACH) return { kind: 'relight', line: SAY['crystal.errand.relight.prompt']() };
    if (kind === 'glove') {
      if (item === 'home' && dist(catPos, spot) < PICK_REACH) return { kind: 'pick', line: SAY['crystal.errand.pick.prompt']() };
      if (item === 'carried' && nearLumi(catPos)) return { kind: 'give', line: SAY['crystal.errand.give.prompt']() };
    }
    if (kind === 'bug') {
      if (item === 'home' && dist(catPos, E.STONE) < E.STONE.reach) return { kind: 'pick', line: SAY['crystal.errand.pick.prompt']() };
      if (item === 'carried' && dist(catPos, E.BUG) < E.BUG.reach) return { kind: 'give', line: SAY['crystal.errand.bug.prompt']() };
    }
    return null;
  }
  const lineOf = () => SAY[`crystal.errand.${kind}`]();
  const glintsTaken = () => (startIds ? E.taken(startIds, presentNow(), E.GLINT_IDS) : 0);

  return {
    plan,
    get state() { return { clock, kind, eligible, done, item, sparkP, glints: glintsTaken() }; },
    get props() { return props.slice(); },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'glints') {
        if (glintsTaken() >= E.GLINT_IDS.length) complete();
        else say('crystal-errand-need', SAY['crystal.errand.glints.need']());
      } else if (t.kind === 'relight') {
        complete();
      } else if (t.kind === 'pick') {
        item = 'carried';
        audio?.chime?.();
        say('crystal-errand-got', SAY['crystal.errand.pick.got']());
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
      session0 = session ?? session0;
      if (!active()) return;
      if (!told && clock > 2.5) { told = true; say('crystal-errand-today', lineOf()); }
      if (!startIds && session0?.collectibleMeshes) startIds = presentNow();
      const near = (p) => !catPos || dist(catPos, p) <= PROP_NEAR;
      const bob = reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6);
      if (kind === 'change' && glow) {
        if (startIds?.has(changed.id) && !presentNow().has(changed.id)) { complete(); return; }
        glow.position.set(changed.x, crystalY(changed.x, changed.z) + 0.4 + bob, changed.z);
        glow.visible = presentNow().has(changed.id) && near(changed);
      } else if (kind === 'follow' && sparkMesh) {
        sparkP = E.sparkStep(sparkP, catPos ? dist(catPos, E.sparkAt(sparkP)) : 99, step);
        const at = E.sparkAt(sparkP);
        sparkMesh.position.set(at.x, crystalY(at.x, at.z) + 0.9 + bob * 2, at.z);
        sparkMesh.rotation.y = reducedMotion ? 0 : clock * 1.5;
        sparkMesh.visible = near(at);
        ringMesh.visible = near(E.SPARK.ring);
        if (sparkP >= 1 && catPos && dist(catPos, E.SPARK.ring) <= E.SPARK.ring.r) complete();
      } else if (kind === 'relight' && dimMesh) {
        dimMesh.visible = near(spot);
      } else if ((kind === 'glove' && gloveMesh) || (kind === 'bug' && stoneMesh)) {
        const m = kind === 'glove' ? gloveMesh : stoneMesh;
        const home = kind === 'glove' ? spot : E.STONE;
        if (item === 'carried' && catPos) {
          const yaw = session?.cat?.rotation?.y ?? 0;
          m.position.set(catPos.x - Math.sin(yaw) * 0.45, (catPos.y ?? 0) + 0.62, catPos.z - Math.cos(yaw) * 0.45);
          m.rotation.set(-0.9, yaw, 0, 'YXZ');
          m.scale.setScalar(kind === 'glove' ? 1.0 : 0.8);
          m.visible = true;
        } else {
          m.scale.setScalar(kind === 'glove' ? 1.8 : 1);
          m.position.set(home.x, crystalY(home.x, home.z) + 0.06 + bob, home.z);
          m.rotation.set(0, 0.8, 0);
          m.visible = near(home);
        }
      }
      if (bugMesh) bugMesh.visible = near(E.BUG);
      void t; void camera;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      item = 'home'; // a carried item is not kept: the next walk finds it at its own place
      for (const m of props) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
