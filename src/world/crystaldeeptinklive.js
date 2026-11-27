// =============================================================================
// TINK ON A WALK (second story, milestone C4). createTinkLive(ctx) draws Tink, the lost baby chime-bat (ONE small merged mesh, made only once the prisms are set), runs the pure rules
// (crystaldeepmission.js) and his shy follower (crystaldeeptink.js) for the action button, and pays the end of the story.
//   * Once the prisms are set (deep bit 1) Tink waits on his nest ledge in the Deep Hall. Interact beside him says hello (bit 2) and he follows her, shy, never rushed.
//   * Walk him to his hanging crystals above the Rose hall: both of them near the nook ends it (bit 3): three chimes, the Prism Charm is hers (put on if her neck is bare), 40 paws once
//     (AWARDS.crystaldeep) and the journal pages. The story is over and nothing can go wrong on the way: no timer, no fail.
//   * NOTHING is saved while he follows. Leaving the cave, a teleport or the end of a room just ends the following: next walk he is on his nest ledge (bit 1 or 2) or at his nook (bit 3).
//     If she is ever very far from him he is back at his ledge, waiting. He is never lost.
//   * A partner finishing a step (a wd- event) is credited here in order; a partner finishing the walk makes the charm and paws ours too (each cat pays its own save).
// One slot of the cave prompt arbiter (LIVING_SLOT, read through ST.deep). It draws no random number and reads no clock (the walk dt only). REDUCED MOTION: no bob and no wing roll.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import { crystalDeepOn } from '../crystalflag.js';
import { WING_LIVE } from '../crystalpages.js';
import { crystalColliders, crystalY } from './crystalplan.js';
import * as M from './crystaldeepmission.js';
import * as T from './crystaldeeptink.js';
import * as D from './crystaldeepplan.js';
import './crystaldeeptinkwords.js';

export const CHARM_ID = 'prismcharm';
export const HOME_CAT = 2.8; // m: she is "at the nook" within this of it
export const HOME_TINK = T.TINK.far + 0.5; // m: and he is with her (within this of her: his own following distance and a little over)
export const GIVE_UP = 25; // m: farther than this from her and he is back on his ledge, waiting
export const REST = Object.freeze({ x: -31.35, z: -28.35, y: D.NEST.h + 0.14 }); // on the nest ledge, beside the golden mouse
export const HANG = Object.freeze({ x: D.NOOK.x, z: D.NOOK.z, y: 1.55 }); // under the lintel, among the hanging crystals
export const THANKS = Object.freeze([0, 0.45, 0.9]); // the three thank-you chimes, in walk seconds after he is home
if (crystalDeepOn()) { WING_LIVE.deep = true; WING_LIVE.tink = true; } // the journal pages of the hall and of Tink show once the story is in the game

const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- Tink: one merged mesh (about 150 triangles), soft lavender with a pale belly and rose ears and wing tips ------------------------------
const paint = (geo, hex) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  return g;
};
const tri = (pts, hex) => paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), hex);
export function tinkGeometry() {
  const parts = [
    paint(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.9, 1.1), 0xb9a6e8), // body
    paint(new THREE.SphereGeometry(0.12, 8, 6).scale(0.9, 0.8, 0.5).translate(0, -0.03, 0.1), 0xf2e6ff), // belly
    paint(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.17, 0.08), 0xc4b4f0), // head
    paint(new THREE.SphereGeometry(0.025, 5, 4).translate(-0.05, 0.19, 0.19), 0x2a1a3a), // eyes
    paint(new THREE.SphereGeometry(0.025, 5, 4).translate(0.05, 0.19, 0.19), 0x2a1a3a),
    paint(new THREE.ConeGeometry(0.045, 0.14, 4).translate(-0.07, 0.34, 0.07), 0xb9a6e8), // ears
    paint(new THREE.ConeGeometry(0.045, 0.14, 4).translate(0.07, 0.34, 0.07), 0xb9a6e8),
    paint(new THREE.SphereGeometry(0.02, 4, 3).translate(0, 0.12, 0.22), 0xffc4e0), // nose
  ];
  for (const s of [-1, 1]) {
    parts.push(tri([s * 0.12, 0.05, 0, s * 0.5, 0.2, -0.05, s * 0.4, -0.12, -0.02], 0x8e7ad0)); // a wing
    parts.push(tri([s * 0.4, -0.12, -0.02, s * 0.5, 0.2, -0.05, s * 0.55, -0.05, -0.04], 0xffc4e0)); // its rose tip
  }
  return mergeGeometries(parts);
}

// the slot the cave reads (crystal.js: ST.deep.promptAt, interact, credit, goalFor); it asks whichever walk is current
let current = null;
export const LIVING_SLOT = Object.freeze({
  promptAt: (p) => current?.promptAt(p) ?? null,
  interact: () => current?.interact() ?? null,
  credit: (ev) => current?.credit(ev) ?? null,
  goalFor: (prev, errand) => current?.goalFor(prev, errand) ?? prev,
});

// createTinkLive(ctx) -> { promptAt, interact, credit, goalFor, update, state, dispose }; ctx: { scene, progression, audio, log, reducedMotion, send | sendEvent }
export function createTinkLive(ctx) {
  const { scene, reducedMotion = false, progression = null, audio = null, log = null } = ctx;
  const send = ctx.send ?? ctx.sendEvent;
  const rec = () => progression?.state?.crystal;
  const colliders = () => [...crystalColliders(), ...D.deepColliders()];
  const m = { x: REST.x, z: REST.z, yaw: 0, moving: false, chasing: false };
  let y = 0;
  let clock = 0;
  let disposed = false;
  let following = false; // NEVER saved
  let mesh = null;
  let target = null;
  let chimes = []; // walk seconds of the chimes still to sound
  let placed = false;

  const here = () => M.deepBits(rec());
  const present = () => M.unlocked(rec()) && (here() & M.PRISMS) !== 0;
  const resting = () => (here() & M.HOME ? HANG : REST);
  const sight = (id) => { try { progression?.recordSighting?.(id); } catch { /* a stand-in save */ } };
  function commit(deep) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.crystal = { ...(pr.state.crystal ?? {}), deep };
    pr.addPoints?.(0); // the save persists now: it adds nothing
  }
  function perform(step, remote = false) {
    const r = remote ? M.credit(rec(), step) : M.apply(rec(), step);
    if (!r.changed) return null;
    commit(r.crystal.deep);
    return r.effect;
  }
  // Tink is home: the charm, the paws once, three chimes, the pages
  function celebrate() {
    following = false;
    chimes = THANKS.map((d) => clock + d);
    const st = progression?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes(CHARM_ID)) st.unlocked.accessories.push(CHARM_ID);
    if (st?.equipped && st.equipped.neck == null) st.equipped.neck = CHARM_ID;
    if (log?.awardOnce) log.awardOnce('crystaldeep', 'crystal-deep', phrase('crystal.deep.tink.pay'));
    say('crystal-deep-home', phrase('crystal.deep.tink.home'));
    say('crystal-deep-charm', phrase('crystal.deep.tink.charm'));
    sight('ccdeep'); sight('cctink');
  }

  function ensureMesh() {
    if (mesh || disposed) return mesh;
    mesh = new THREE.Mesh(tinkGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    mesh.name = 'crystal:deep:tink';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    Object.assign(mesh.userData, { noMerge: true, noCast: true, noContactShadow: true });
    scene.add(mesh);
    return mesh;
  }

  const canGreet = (cat) => !disposed && !!cat && present() && !(here() & M.HOME) && !following && dist(cat, m) < T.TINK.reach;

  // the goal for the guide (the forge kind of goal: line, chip, icon): Lumi first, then the errand of the day, then Tink
  function goalFor(prev, errand = null) {
    if (disposed || (prev?.g && prev.g.kind !== 'rest')) return prev;
    if (errand?.eligible && !errand.done) return prev;
    const g = M.nextGoal(rec(), following);
    if (g.kind !== 'find' && g.kind !== 'walk') return prev;
    const p = g.kind === 'walk' ? D.NOOK : REST;
    const line = g.kind === 'walk' ? phrase('crystal.deep.guide.walk') : phrase('crystal.deep.guide.find');
    const chip = g.kind === 'walk' ? phrase('crystal.deep.guide.chip.walk') : phrase('crystal.deep.guide.chip.find');
    return { g: { kind: 'forge', icon: 'spark', line, chip }, x: p.x, z: p.z, y: crystalY(p.x, p.z) + 0.5 };
  }

  function put(t, step, cat) {
    const bob = reducedMotion ? 0 : 0.08 * Math.sin(t * 2.1);
    const goal = following ? crystalY(m.x, m.z) + 0.55 + bob : crystalY(resting().x, resting().z) + resting().y + bob * 0.4;
    y = reducedMotion || !placed ? goal : y + (goal - y) * Math.min(1, step * 4);
    placed = true;
    const show = present() && (following || (!!cat && D.nearDeep(cat.x, cat.z, D.NEAR)));
    if (!show && !mesh) return;
    const me = ensureMesh();
    me.visible = show;
    me.position.set(m.x, y, m.z);
    if (cat && !m.moving && dist(cat, m) < 9) m.yaw = Math.atan2(cat.x - m.x, cat.z - m.z);
    me.rotation.y = m.yaw;
    me.rotation.z = reducedMotion ? 0 : following && m.moving ? 0.14 * Math.sin(t * 11) : 0.04 * Math.sin(t * 1.9);
  }

  const self = {
    get state() { return { clock, following, record: rec(), present: present(), x: m.x, z: m.z, y, goal: M.nextGoal(rec(), following) }; },
    get mesh() { return mesh; },
    goalFor,
    promptAt(cat) {
      target = canGreet(cat) ? 'greet' : null;
      return target ? phrase('crystal.deep.tink.hello') : null;
    },
    interact() {
      if (!target || disposed) return null;
      target = null;
      if (!(here() & M.FOUND)) {
        if (perform({ kind: 'found' })) send?.(M.wire({ kind: 'found' }));
      } else say('crystal-deep-back', phrase('crystal.deep.tink.back'));
      following = true;
      m.chasing = false;
      audio?.chime?.();
      say('crystal-deep-greet', phrase('crystal.deep.tink.greet'));
      sight('cctink');
      return 'greet';
    },
    // a step done by anyone in the room (a wd- event); anything else (and the errand wd-errand, C6) is nothing here
    credit(ev) {
      const step = M.toStep(ev);
      if (!step || disposed) return null;
      const effect = perform(step, true);
      if (!effect) return null;
      if (effect === 'home') celebrate();
      return effect;
    },
    update(dt, t, cat = null) {
      if (disposed) return;
      const step = dt > 0 ? Math.min(dt, 0.5) : 0;
      clock += step;
      while (chimes.length && clock >= chimes[0]) { chimes.shift(); audio?.chime?.(); }
      if (!present()) { following = false; return; }
      if (following && cat) {
        if (dist(cat, m) > GIVE_UP) following = false; // never lost: back on his ledge
        else {
          T.tinkStep(m, cat, step, { follow: true, colliders: colliders() });
          if (dist(cat, D.NOOK) <= HOME_CAT && dist(m, cat) <= HOME_TINK && here() === 7 && perform({ kind: 'home' })) { celebrate(); send?.(M.wire({ kind: 'home' })); }
        }
      }
      if (!following) {
        const p = resting();
        const d = dist(m, p);
        if (reducedMotion || d < 0.05 || !placed) { m.x = p.x; m.z = p.z; m.moving = false; } else { const k = Math.min(1, (2.4 * step) / d); m.x += (p.x - m.x) * k; m.z += (p.z - m.z) * k; m.moving = true; }
      }
      put(t, step, cat);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      following = false; // a Tink followed when the walk ends is not kept: next walk he is on his ledge or at his nook
      if (current === self) current = null;
      if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
    },
  };
  return self;
}

// one walk: makes Tink, registers him for the slot and hands the hall life one object that updates and disposes both
export function withLiving(ctx, base) {
  const tink = createTinkLive(ctx);
  current = tink;
  return Object.create(base, {
    tink: { value: tink },
    update: { value: (dt, t, catPos) => { base.update(dt, t, catPos); tink.update(dt, t, catPos); } },
    dispose: { value: () => { tink.dispose(); base.dispose(); } },
  });
}
