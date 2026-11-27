// =============================================================================
// TILLY'S ERRAND OF THE DAY ON A WALK (milestone V7). Made once a walk by world/snowville.js's life (the code is stage chunk b's); update(dt, t, catPos, camera, session) every frame;
// the walk asks promptAt(catPos) and interact() for the action button. The rules and the plan are world/snowvillejob.js (pure); this carries one errand out:
//   * It is offered from the WALK AFTER the story (a walk that begins with step 7). planSnowErrand(roomSeed, visits) picks the errand and the button's place, so every cat in a room has the
//     same one; an errand done by anyone in the room is credited to everyone (credit(): an `sv-job` event, each device pays its own save). The errand itself is never saved.
//   * DONE pays AWARDS.snowjob once a walk (log.awardOnce under ERRAND_KEY: the walk's own once-a-walk rule, which a resumed walk keeps), puts the lowest unset postcard bit into
//     state.snowville.album (12 bits; the merge ORs them) and counts the journal pages sw4 (an errand paid) and sw5 (a new postcard).
// No fail state, nothing timed: the glint waits for her, a button stays where it lies. A carried button, cup or string is never saved: it is back at its place on the next walk, whatever
// ends a walk (dispose forgets it). Draws no random number and reads no clock (every number is a constant or a walk second). Props are made only for today's errand, never casters, one
// mesh each, drawn only within PROP_NEAR metres of her. No light is made here (the place's one PointLight is the brazier's).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './snowvillemission.js';
import * as E from './snowvillejob.js';
import { snowY } from './snowvilleplan.js';
import './snowvillejobwords.js';

export const PROP_NEAR = 45; // m: a prop farther than this from her is not drawn
export const PICK_REACH = E.CUP.reach; // m: pick the button, the cup or the string up
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every line is a literal phrase call so the phrase table's scan reads it
const SAY = Object.freeze({
  'snowville.job.cones': () => phrase('snowville.job.cones'),
  'snowville.job.otter': () => phrase('snowville.job.otter'),
  'snowville.job.button': () => phrase('snowville.job.button'),
  'snowville.job.cup': () => phrase('snowville.job.cup'),
  'snowville.job.lights': () => phrase('snowville.job.lights'),
  'snowville.job.cones.prompt': () => phrase('snowville.job.cones.prompt'),
  'snowville.job.pick.prompt': () => phrase('snowville.job.pick.prompt'),
  'snowville.job.pick.got': () => phrase('snowville.job.pick.got'),
  'snowville.job.button.prompt': () => phrase('snowville.job.button.prompt'),
  'snowville.job.cup.prompt': () => phrase('snowville.job.cup.prompt'),
  'snowville.job.lights.prompt': () => phrase('snowville.job.lights.prompt'),
  'snowville.job.pay': () => phrase('snowville.job.pay'),
  'snowville.job.postcard': () => phrase('snowville.job.postcard'),
  'snowville.job.full': () => phrase('snowville.job.full'),
});

// ---- the props (one mesh each) ---------------------------------------------------------------------------------------------------
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
// The painted parts (non-indexed, position and colour only) joined into one geometry by hand: no merge helper is imported, so this chunk pulls nothing shared into start-up.
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
const glowMat = (hex, opacity) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, opacity });
// The snowman's button: a round red disc with a pale rim and two holes (about 0.4 m)
function makeButton() {
  return solid([
    paint(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12).translate(0, 0.03, 0), 0xfff4e0),
    paint(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 12).translate(0, 0.04, 0), 0xc0453f),
    paint(new THREE.BoxGeometry(0.03, 0.08, 0.03).translate(-0.04, 0.05, 0), 0x3a2f48), paint(new THREE.BoxGeometry(0.03, 0.08, 0.03).translate(0.04, 0.05, 0), 0x3a2f48),
  ], 'snowville:jobbutton');
}
// A warm cup: a cream mug with a handle, cocoa on top and a little steam (about 0.35 m)
function makeCup() {
  return solid([
    paint(new THREE.CylinderGeometry(0.13, 0.11, 0.2, 10).translate(0, 0.1, 0), 0xf4e8d2),
    paint(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 10).translate(0, 0.2, 0), 0x7a4a32),
    paint(new THREE.TorusGeometry(0.06, 0.018, 5, 8).translate(0.15, 0.1, 0), 0xf4e8d2),
    paint(new THREE.SphereGeometry(0.04, 6, 4).translate(0, 0.32, 0), 0xffffff), paint(new THREE.SphereGeometry(0.03, 6, 4).translate(0.03, 0.42, 0), 0xf4f7fb),
  ], 'snowville:jobcup');
}
// The loose end of a string of lights: a little spool with five warm bulbs hanging from it (about 0.5 m)
function makeString() {
  const parts = [paint(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8).translate(0, 0.07, 0), 0x6a5242)];
  for (let i = 0; i < 5; i++) parts.push(paint(new THREE.SphereGeometry(0.05, 6, 4).translate(0.12 + i * 0.1, 0.06 + 0.03 * Math.sin(i * 1.3), 0), i % 2 ? 0xffd78a : 0xff9fb4));
  return solid(parts, 'snowville:jobstring');
}
// The ice-glint: a small glowing diamond, one additive mesh
const makeGlint = () => finish(new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), glowMat(0xcfe9ff, 0.9)), 'snowville:jobglint');
// The otter's slide: seven small ice-blue lumps round a circle on the bank, in world coordinates, with a pale hoop over them
function makeRing() {
  const { x, z, r, stalks } = E.GLINT.ring;
  const parts = [];
  for (let i = 0; i < stalks; i++) {
    const a = (i / stalks) * Math.PI * 2;
    const px = x + Math.cos(a) * (r + 0.2);
    const pz = z + Math.sin(a) * (r + 0.2);
    parts.push(paint(new THREE.ConeGeometry(0.2, 1.1 + 0.25 * (i % 2), 5).translate(px, snowY(px, pz) + 0.55, pz), i % 2 ? 0x9ad0f0 : 0xbfe0ff));
  }
  parts.push(paint(new THREE.TorusGeometry(r + 0.2, 0.05, 5, 16).rotateX(Math.PI / 2).translate(x, snowY(x, z) + 1.4, z), 0xe9f4ff));
  return solid(parts, 'snowville:jobring');
}

// createSnowErrandLive(ctx) -> { update, promptAt, interact, credit, state, plan, dispose }
// ctx: { scene, reducedMotion, progression, log, audio, roomSeed, visits, tilly (world/snowvillelife.js's createTilly result, read for her place), send (tells the room an errand is done) }
export function createSnowErrandLive(ctx) {
  const { scene, reducedMotion = false, progression = null, log = null, audio = null } = ctx;
  const tillyAt = () => ctx.tilly?.tilly ?? null;
  const eligible = M.normalize(progression?.state?.snowville).step >= M.STEP.done; // the story was told before this walk began
  const plan = E.planSnowErrand(ctx.roomSeed, ctx.visits ?? 0);
  const kind = plan.kind;
  let done = !!log && log.count(E.ERRAND_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let target = null;
  let told = false;
  let session0 = null;
  let glintP = 0;
  let item = 'home'; // button, cup or string: 'home' | 'carried' | 'given' (never saved)
  const props = [];
  const own = (m) => { props.push(m); scene.add(m); return m; };
  let itemMesh = null; let glintMesh = null; let ringMesh = null;

  const active = () => eligible && !done && !disposed;
  const spot = E.SPOTS[plan.spot];
  const home = kind === 'button' ? spot : kind === 'cup' ? E.CUP : E.STRING;
  const dest = kind === 'button' ? E.SNOWMAN : kind === 'cup' ? E.ROBIN : E.HILL_LANTERN;
  const presentNow = () => (session0?.collectibleMeshes && typeof session0.collectibleMeshes.keys === 'function' ? [...session0.collectibleMeshes.keys()] : null);
  const conesGone = () => { const ids = presentNow(); return ids ? E.gone(ids, E.CONE_IDS) : 0; };

  if (eligible && !done) {
    if (kind === 'button') itemMesh = own(makeButton());
    else if (kind === 'cup') itemMesh = own(makeCup());
    else if (kind === 'lights') itemMesh = own(makeString());
    else if (kind === 'otter') { glintMesh = own(makeGlint()); ringMesh = own(makeRing()); }
  }

  // The item at its home (button, cup or string), or brought to where it was wanted: the button on the snowman's middle ball, the cup under the robin's lamp, the lights by the lantern.
  function place(given) {
    const m = itemMesh;
    const at = given ? dest : home;
    const onSnowman = given && kind === 'button';
    m.scale.setScalar(onSnowman ? 2.2 : 1.6);
    m.position.set(at.x, snowY(at.x, at.z) + (onSnowman ? 1.25 : 0.06) + (given || reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6)), at.z + (onSnowman ? 0.47 : 0));
    m.rotation.set(onSnowman ? Math.PI / 2 : 0, 0.8, 0);
    m.visible = true;
  }

  // ---- done ---------------------------------------------------------------------------------------------------------------------------
  function complete({ remote = false } = {}) {
    if (!active()) return false;
    done = true;
    const paid = log ? log.awardOnce('snowjob', E.ERRAND_KEY, SAY['snowville.job.pay']()) : 0;
    if (paid > 0 || !log) {
      const bits = progression?.state?.snowville?.album ?? 0;
      const i = E.nextPostcard(bits);
      if (i >= 0 && progression?.state) {
        progression.state.snowville = { ...(progression.state.snowville ?? {}), album: E.withPostcard(bits, i) };
        progression.addPoints?.(0); // the save's own "persist now": it adds nothing
        try { progression.recordSighting?.('sw5'); } catch { /* a stand-in save */ }
        say('snowville-job-card', `${E.ALBUM[i][0]} ${SAY['snowville.job.postcard']()}`);
        if (E.nextPostcard(progression.state.snowville.album) < 0) say('snowville-job-full', SAY['snowville.job.full']());
      }
      try { progression?.recordSighting?.('sw4'); } catch { /* a stand-in save */ }
    }
    if (!remote) ctx.send?.(E.JOB_WIRE);
    for (const m of props) if (m !== itemMesh && m !== ringMesh) m.visible = false; // the errand is over: nothing left to find
    if (itemMesh) { item = 'given'; place(true); } // what was carried stays where it was brought
    audio?.chime?.();
    return true;
  }

  // ---- the action button ----------------------------------------------------------------------------------------------------------
  const nearTilly = (p) => { const m = tillyAt(); return !!m && dist(p, m) < E.TILLY_REACH; };
  function decide(catPos) {
    if (!active() || !catPos) return null;
    if (kind === 'cones') return conesGone() >= E.CONES_NEEDED && nearTilly(catPos) ? { kind: 'cones', line: SAY['snowville.job.cones.prompt']() } : null;
    if (kind === 'button' || kind === 'cup' || kind === 'lights') {
      if (item === 'home' && dist(catPos, home) < PICK_REACH) return { kind: 'pick', line: SAY['snowville.job.pick.prompt']() };
      if (item === 'carried' && dist(catPos, dest) < dest.reach) return { kind: 'give', line: SAY[`snowville.job.${kind}.prompt`]() };
    }
    return null;
  }
  const lineOf = () => SAY[`snowville.job.${kind}`]();

  return {
    plan,
    get state() { return { clock, kind, eligible, done, item, glintP, cones: conesGone() }; },
    get props() { return props.slice(); },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'cones') complete();
      else if (t.kind === 'pick') {
        item = 'carried';
        audio?.chime?.();
        say('snowville-job-got', SAY['snowville.job.pick.got']());
      } else if (t.kind === 'give') complete();
      return t.kind;
    },
    // an errand done by anyone in the room (an `sv-job` event): the same pay on this device, once
    credit(ev) {
      if (!E.isJobEvent(ev) || disposed) return null;
      return complete({ remote: true }) ? 'job' : null;
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      session0 = session ?? session0;
      if (!active()) return;
      if (!told && clock > 2.5) { told = true; say('snowville-job-today', lineOf()); }
      const near = (p) => !catPos || dist(catPos, p) <= PROP_NEAR;
      const bob = reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6);
      if (kind === 'otter' && glintMesh) {
        glintP = E.glintStep(glintP, catPos ? dist(catPos, E.glintAt(glintP)) : 99, step);
        const at = E.glintAt(glintP);
        glintMesh.position.set(at.x, snowY(at.x, at.z) + 0.8 + bob * 2, at.z);
        glintMesh.rotation.y = reducedMotion ? 0 : clock * 1.5;
        glintMesh.visible = near(at);
        ringMesh.visible = near(E.GLINT.ring);
        if (glintP >= 1 && catPos && dist(catPos, E.GLINT.ring) <= E.GLINT.ring.r) complete();
      } else if (itemMesh) {
        const m = itemMesh;
        if (item === 'carried' && catPos) {
          const yaw = session?.cat?.rotation?.y ?? 0;
          m.position.set(catPos.x - Math.sin(yaw) * 0.45, (catPos.y ?? 0) + 0.62, catPos.z - Math.cos(yaw) * 0.45);
          m.rotation.set(-0.9, yaw, 0, 'YXZ');
          m.scale.setScalar(0.9);
          m.visible = true;
        } else { place(false); m.visible = near(home); }
      }
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
