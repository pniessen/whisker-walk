// =============================================================================
// NUTMEG'S POST ROUND OF THE DAY ON A WALK (milestone T7). Made once a walk by world/treehouse.js's life (the code is the branches stage's); update(dt, t, catPos, camera, session) every
// frame; the walk asks promptAt(catPos) and interact() for the action button. The rules and the plan are world/treehousejob.js (pure); this carries one errand out:
//   * It is offered from the WALK AFTER the story (a walk that begins with step 7). planTreeErrand(roomSeed, visits) picks the errand and the stamp's place, so every cat in a room has the same
//     one; an errand done by anyone in the room is credited to everyone (credit(): a `th-job` event, each device pays its own save). The errand itself is never saved.
//   * DONE pays AWARDS.treejob once a walk (log.awardOnce under ERRAND_KEY, which a resumed walk keeps), puts the lowest unset stamp bit into state.treehouse.album (12 bits; the merge ORs
//     them) and counts the journal pages tl4 (an errand paid) and tl5 (a new stamp).
// No fail state, nothing timed: a lantern stays lit once she has touched it, a parcel stays where it lies. A carried parcel or postcard is never saved: it is back at its place on the next walk
// (dispose forgets it). Draws no random number and reads no clock (every number is a constant or a walk second). Props are made only for today's errand, never casters, one mesh each, drawn
// only within PROP_NEAR metres of her. No light is made here (the village's one PointLight stays Nutmeg's).
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as M from './treehousemission.js';
import * as E from './treehousejob.js';
import './treehousejobwords.js';

export const PROP_NEAR = 45; // m: a prop farther than this from her is not drawn
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// every line is a literal phrase call so the phrase table's scan reads it
const SAY = Object.freeze({
  'treehouse.job.parcel': () => phrase('treehouse.job.parcel'),
  'treehouse.job.stamp': () => phrase('treehouse.job.stamp'),
  'treehouse.job.lanterns': () => phrase('treehouse.job.lanterns'),
  'treehouse.job.postcard': () => phrase('treehouse.job.postcard'),
  'treehouse.job.acorns': () => phrase('treehouse.job.acorns'),
  'treehouse.job.pick.prompt': () => phrase('treehouse.job.pick.prompt'),
  'treehouse.job.pick.got': () => phrase('treehouse.job.pick.got'),
  'treehouse.job.parcel.prompt': () => phrase('treehouse.job.parcel.prompt'),
  'treehouse.job.postcard.prompt': () => phrase('treehouse.job.postcard.prompt'),
  'treehouse.job.acorns.prompt': () => phrase('treehouse.job.acorns.prompt'),
  'treehouse.job.stamp.prompt': () => phrase('treehouse.job.stamp.prompt'),
  'treehouse.job.lantern': () => phrase('treehouse.job.lantern'),
  'treehouse.job.pay': () => phrase('treehouse.job.pay'),
  'treehouse.job.stampnew': () => phrase('treehouse.job.stampnew'),
  'treehouse.job.full': () => phrase('treehouse.job.full'),
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
// A string-tied parcel: a brown box with a cream ribbon (about 0.4 m)
const makeParcel = () => solid([
  paint(new THREE.BoxGeometry(0.4, 0.26, 0.3).translate(0, 0.13, 0), 0xb98a5a),
  paint(new THREE.BoxGeometry(0.06, 0.28, 0.32).translate(0, 0.13, 0), 0xf4e8d2), paint(new THREE.BoxGeometry(0.42, 0.28, 0.05).translate(0, 0.13, 0), 0xf4e8d2),
], 'treehouse:jobparcel');
// A postcard: a flat cream card with a leaf-green stripe and a red stamp corner (about 0.4 m)
const makePostcard = () => solid([
  paint(new THREE.BoxGeometry(0.4, 0.03, 0.28).translate(0, 0.03, 0), 0xf6efdc), paint(new THREE.BoxGeometry(0.4, 0.035, 0.05).translate(0, 0.033, 0.1), 0x7cbc54),
  paint(new THREE.BoxGeometry(0.07, 0.04, 0.07).translate(0.14, 0.035, -0.08), 0xc0453f),
], 'treehouse:jobpostcard');
// Nutmeg's best stamp: a small wooden handle on a red pad, with a glowing ring so it can be spotted from a way off (about 0.5 m)
const makeStamp = () => solid([
  paint(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10).translate(0, 0.03, 0), 0xc0453f), paint(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8).translate(0, 0.16, 0), 0x8a6240),
  paint(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.3, 0), 0xd9b44a), paint(new THREE.TorusGeometry(0.34, 0.025, 4, 14).rotateX(Math.PI / 2).translate(0, 0.08, 0), 0xffe9a8),
], 'treehouse:jobstamp');
// A lantern: a little cage of warm glass on a hook. Basic material, so it reads dim or bright without any light: dim until it is next, bright once lit.
const makeLantern = () => finish(new THREE.Mesh(joinParts([
  paint(new THREE.CylinderGeometry(0.16, 0.2, 0.34, 8).translate(0, 0.17, 0), 0xffffff), paint(new THREE.ConeGeometry(0.2, 0.14, 8).translate(0, 0.41, 0), 0xffffff), paint(new THREE.SphereGeometry(0.05, 6, 4).translate(0, 0.52, 0), 0xffffff),
]), new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x8a6a3a, fog: true })), 'treehouse:joblantern');
const LANTERN_COLOR = Object.freeze({ dim: 0x8a6a3a, next: 0xffd78a, lit: 0xfff1c0 });

// createTreeErrandLive(ctx) -> { update, promptAt, interact, credit, state, plan, props, dispose }
// ctx: { scene, reducedMotion, progression, log, audio, roomSeed, visits, send (tells the room an errand is done) }
export function createTreeErrandLive(ctx) {
  const { scene, reducedMotion = false, progression = null, log = null, audio = null } = ctx;
  const eligible = M.normalize(progression?.state?.treehouse).step >= M.STEP.done; // the story was told before this walk began
  const plan = E.planTreeErrand(ctx.roomSeed, ctx.visits ?? 0);
  const kind = plan.kind;
  let done = !!log && log.count(E.ERRAND_KEY) > 0; // a resumed walk that already paid it
  let clock = 0;
  let disposed = false;
  let target = null;
  let told = false;
  let session0 = null;
  let lit = 0;
  let item = 'home'; // parcel or postcard: 'home' | 'carried' | 'given' (never saved)
  const props = [];
  const own = (m) => { props.push(m); scene.add(m); return m; };
  let itemMesh = null; let stampMesh = null; let lanternMeshes = [];

  const active = () => eligible && !done && !disposed;
  const home = kind === 'parcel' ? E.PARCEL : kind === 'postcard' ? E.POSTCARD : E.SPOTS[plan.spot];
  const dest = kind === 'parcel' ? E.BELL_DOOR : E.OWL_PERCH;
  const presentNow = () => (session0?.collectibleMeshes && typeof session0.collectibleMeshes.keys === 'function' ? [...session0.collectibleMeshes.keys()] : null);
  const acornsGone = () => { const ids = presentNow(); return ids ? E.gone(ids, E.ACORN_IDS) : 0; };
  const high = (p, at) => (p.y ?? 0) >= (at.minY ?? -1);

  if (eligible && !done) {
    if (kind === 'parcel') itemMesh = own(makeParcel());
    else if (kind === 'postcard') itemMesh = own(makePostcard());
    else if (kind === 'stamp') stampMesh = own(makeStamp());
    else if (kind === 'lanterns') lanternMeshes = E.LANTERNS.map((L) => { const m = own(makeLantern()); m.position.set(L.x, L.y + 0.9, L.z); m.scale.setScalar(1.8); return m; });
  }

  function place(given) {
    const m = itemMesh;
    const at = given ? dest : home;
    m.scale.setScalar(1.5);
    m.position.set(at.x, at.y + 0.06 + (given || reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6)), at.z);
    m.rotation.set(0, 0.8, 0);
    m.visible = true;
  }
  function paintLanterns() {
    lanternMeshes.forEach((m, i) => {
      m.material.color.setHex(i < lit ? LANTERN_COLOR.lit : i === lit ? LANTERN_COLOR.next : LANTERN_COLOR.dim);
      m.position.y = E.LANTERNS[i].y + 0.9 + (reducedMotion || i !== lit ? 0 : 0.06 * Math.sin(clock * 2));
    });
  }

  // ---- done ---------------------------------------------------------------------------------------------------------------------------
  function complete({ remote = false } = {}) {
    if (!active()) return false;
    done = true;
    const paid = log ? log.awardOnce('treejob', E.ERRAND_KEY, SAY['treehouse.job.pay']()) : 0;
    if (paid > 0 || !log) {
      const bits = progression?.state?.treehouse?.album ?? 0;
      const i = E.nextStamp(bits);
      if (i >= 0 && progression?.state) {
        progression.state.treehouse = { ...(progression.state.treehouse ?? {}), album: E.withStamp(bits, i) };
        progression.addPoints?.(0); // the save's own "persist now": it adds nothing
        try { progression.recordSighting?.('tl5'); } catch { /* a stand-in save */ }
        say('treehouse-job-card', `${E.ALBUM[i][0]} ${SAY['treehouse.job.stampnew']()}`);
        if (E.nextStamp(progression.state.treehouse.album) < 0) say('treehouse-job-full', SAY['treehouse.job.full']());
      }
      try { progression?.recordSighting?.('tl4'); } catch { /* a stand-in save */ }
    }
    if (!remote) ctx.send?.(E.JOB_WIRE);
    for (const m of props) if (m !== itemMesh && !lanternMeshes.includes(m)) m.visible = false; // the errand is over: nothing left to find
    if (lanternMeshes.length) { lit = E.LANTERNS.length; paintLanterns(); }
    if (itemMesh) { item = 'given'; place(true); } // what was carried stays where it was brought
    audio?.chime?.();
    return true;
  }

  // ---- the action button ----------------------------------------------------------------------------------------------------------
  function decide(catPos) {
    if (!active() || !catPos) return null;
    if (kind === 'acorns') return acornsGone() >= E.ACORNS_NEEDED && dist(catPos, E.BAKERY) < E.BAKERY.reach && high(catPos, E.BAKERY) ? { kind: 'acorns', line: SAY['treehouse.job.acorns.prompt']() } : null;
    if (kind === 'stamp') return dist(catPos, home) < E.STAMP_REACH ? { kind: 'stamp', line: SAY['treehouse.job.stamp.prompt']() } : null;
    if (kind === 'parcel' || kind === 'postcard') {
      if (item === 'home' && dist(catPos, home) < home.reach && high(catPos, home)) return { kind: 'pick', line: SAY['treehouse.job.pick.prompt']() };
      if (item === 'carried' && dist(catPos, dest) < dest.reach && high(catPos, dest)) return { kind: 'give', line: SAY[`treehouse.job.${kind}.prompt`]() };
    }
    return null;
  }
  const lineOf = () => SAY[`treehouse.job.${kind}`]();

  return {
    plan,
    get state() { return { clock, kind, eligible, done, item, lit, acorns: acornsGone() }; },
    get props() { return props.slice(); },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'acorns' || t.kind === 'stamp') complete();
      else if (t.kind === 'pick') {
        item = 'carried';
        audio?.chime?.();
        say('treehouse-job-got', SAY['treehouse.job.pick.got']());
      } else if (t.kind === 'give') complete();
      return t.kind;
    },
    // an errand done by anyone in the room (a `th-job` event): the same pay on this device, once
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
      if (!told && clock > 2.5) { told = true; say('treehouse-job-today', lineOf()); }
      const near = (p) => !catPos || dist(catPos, p) <= PROP_NEAR;
      if (kind === 'lanterns') {
        const was = lit;
        if (catPos) lit = E.lanternStep(lit, catPos);
        if (lit > was) { audio?.chime?.(); if (lit < E.LANTERNS.length) say('treehouse-job-lantern', SAY['treehouse.job.lantern']()); }
        paintLanterns();
        lanternMeshes.forEach((m, i) => { m.visible = near(E.LANTERNS[i]); });
        if (lit >= E.LANTERNS.length) complete();
      } else if (kind === 'stamp' && stampMesh) {
        stampMesh.position.set(home.x, 0.06 + (reducedMotion ? 0 : 0.05 * Math.sin(clock * 1.6)), home.z);
        stampMesh.rotation.y = reducedMotion ? 0.4 : clock * 0.9;
        stampMesh.scale.setScalar(1.8);
        stampMesh.visible = near(home);
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
