import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { painted } from './marketparts.js';
import { bus } from '../events.js';
import { withLocalUuids } from './localuuids.js';
import { ERRAND, ERRAND_IDS, errandKey, errandPageId, initial, apply, isDone } from './marketerrands.js';
import { ERRAND_WORDS } from './marketerrandwords.js';

// =============================================================================
// THE MARKET'S SIX MISSIONS ON A WALK (docs/superpowers/specs/2026-11-27-market-missions.md). Made once a walk by
// world/marketlife.js; update(dt, t, catPos, session) every frame. The step machines are world/marketerrands.js; this
// file draws their little props, feeds them what she does, and says and pays what they answer.
//
// PER DEVICE, like the Farm's jobs: nothing is sent to a co-walker, and each child's own save and own walk carry her own.
// Each pays AWARDS.marketjob once a walk and counts on its journal page; a walk picked up again finds the ones it already
// paid finished (log.count). Props are made here, in the life (not in the build), in tiny meshes, under their own uuid
// stream. Draws no random number: the pigeons' flight is a function of the table's own spot.
// =============================================================================

const SAY = (key, label) => bus.emit('discovery', { type: 'marketnote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const DART_S = 0.45; // seconds a mouse takes between two spots
const FLY_S = 1.3; // a pigeon's flight
const MOUSE_SEE = 8; // she is told about the mouse within this

// One merged, vertex-coloured mesh a prop (the life's meshes are counted: test/marketlife.test.js), no shadow, marked as a
// mission prop so the life's own budget counts leave it to test/marketerrands.test.js.
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const at = (geo, x, y, z) => geo.translate(x, y, z);
function prop(name, geos) {
  const m = new THREE.Mesh(mergeGeometries(geos), MAT.clone());
  m.name = name;
  m.castShadow = false;
  m.userData.errand = true;
  m.userData.noCast = true;
  return m;
}

function buildMouse() {
  const body = painted(new THREE.SphereGeometry(0.06, 8, 6).scale(0.8, 0.8, 1.4), 0x9a9aa6);
  return prop('marketMouse', [
    at(body, 0, 0.05, 0), at(painted(new THREE.SphereGeometry(0.03, 6, 5), 0x9a9aa6), 0, 0.06, -0.09),
    at(painted(new THREE.BoxGeometry(0.01, 0.01, 0.12), 0xd98a9a), 0, 0.03, 0.13),
    at(painted(new THREE.SphereGeometry(0.018, 5, 4), 0xd98a9a), -0.025, 0.1, -0.08), at(painted(new THREE.SphereGeometry(0.018, 5, 4), 0xd98a9a), 0.025, 0.1, -0.08),
  ]);
}

function buildPigeon() {
  return prop('marketErrandPigeon', [
    at(painted(new THREE.SphereGeometry(0.1, 8, 6).scale(0.8, 0.8, 1.3), 0x8d93a0), 0, 0.1, 0),
    at(painted(new THREE.SphereGeometry(0.05, 7, 5), 0x6f7584), 0, 0.2, -0.1),
    at(painted(new THREE.ConeGeometry(0.016, 0.05, 5).rotateX(-Math.PI / 2), 0xe0b060), 0, 0.2, -0.17),
    at(painted(new THREE.BoxGeometry(0.08, 0.02, 0.16), 0x707684), 0, 0.12, 0.13),
  ]);
}

// createErrands(ctx) -> { update(dt, t, catPos, session), state, dispose() }
// ctx: { scene, ground, log, progression, reducedMotion }
export function createErrands(ctx = {}) {
  const { scene = null, ground = null, log = null, progression = null, reducedMotion = false } = ctx;
  const y0 = (x, z) => (ground?.y ? ground.y(x, z) : 0);
  const state = Object.fromEntries(ERRAND_IDS.map((id) => [id, initial(id)]));
  const said = new Set();
  const say = (key, text) => { if (said.has(key)) return; said.add(key); SAY(`market-errand-say-${key}`, text); };
  let disposed = false;
  let clock = 0;

  // a walk picked up again: what it already paid is finished
  const doneAtStart = (id) => !!log && log.count(errandKey(id)) > 0;
  const finished = new Set(ERRAND_IDS.filter(doneAtStart));
  for (const id of finished) {
    if (id === 'mouse') state.mouse = { n: 4 };
    else if (id === 'glove') state.glove = { stage: 2 };
    else if (id === 'pigeons') state.pigeons = { bits: 7 };
  }

  function pay(id) {
    if (finished.has(id)) return;
    finished.add(id);
    const line = ERRAND_WORDS[id].done();
    const paid = log ? log.awardOnce('marketjob', errandKey(id), line) : 0;
    if (!log) SAY(`market-errand-${id}`, line);
    if (paid > 0) progression?.recordSighting?.(errandPageId(id));
  }

  const made = scene ? withLocalUuids('market-errands', () => {
    const mouse = buildMouse();
    const pigeons = ERRAND.TABLES.map(() => buildPigeon());
    return { mouse, pigeons };
  }) : null;
  const mouse = made?.mouse ?? null;
  let mouseFrom = ERRAND.MOUSE_SPOTS[0];
  let mouseTo = ERRAND.MOUSE_SPOTS[0];
  let mouseT = DART_S;
    const placeMouse = (x, z) => { if (mouse) mouse.position.set(x, y0(x, z), z); };
  if (mouse) {
    placeMouse(mouseFrom.x, mouseFrom.z);
    mouse.visible = state.mouse.n < 4;
    scene.add(mouse);
  }
  const flights = ERRAND.TABLES.map(() => ({ t: -1, dx: 0, dz: 0 }));
  if (made) {
    made.pigeons.forEach((p, i) => {
      const tb = ERRAND.TABLES[i];
      p.position.set(tb.x, ERRAND.TABLE_Y, tb.z);
      p.rotation.y = i * 2.1;
      p.visible = !(state.pigeons.bits & (1 << i));
      scene.add(p);
    });
  }

  function step(id, ev, session) {
    const r = apply(id, state[id], ev);
    state[id] = r.st;
    if (r.effect) react(id, r.effect, session);
    return r.effect;
  }

  function react(id, effect, session) {
    if (id === 'mouse') {
      if (effect === 'dart' || effect === 'home') {
        const n = Math.min(3, state.mouse.n);
        mouseFrom = { x: mouse ? mouse.position.x : mouseTo.x, z: mouse ? mouse.position.z : mouseTo.z };
        mouseTo = ERRAND.MOUSE_SPOTS[n];
        mouseT = 0;
        if (effect === 'home') { mouseTo = mouseFrom; mouseT = -DART_S; pay('mouse'); }
        else say('mouse-dart', ERRAND_WORDS.mouse.dart());
      }
    } else if (id === 'glove') {
      if (effect === 'got') say('glove-got', ERRAND_WORDS.glove.got());
      else if (effect === 'done') {
        const c = session?.carry;
        if (c?.mouth?.held?.id === ERRAND.GLOVE_ID) { c.mouth.held = null; c.mouth.grip = 0; }
        c?.items?.showAt?.(ERRAND.GLOVE_ID, ERRAND.GLOVE_OWNER.x + 0.5, ERRAND.GLOVE_OWNER.z - 0.9);
        pay('glove');
      }
    } else if (id === 'pigeons') {
      if (effect === 'done') pay('pigeons');
      else say(`pigeons-${state.pigeons.bits}`, ERRAND_WORDS.pigeons.flush());
    }
  }

  function update(dt, t, catPos, session = null) {
    if (disposed || !catPos) return;
    const step_ = dt > 0 ? dt : 0;
    clock += step_;
    // ---- the mouse
    if (state.mouse.n < 4) {
      const here = mouse ? mouse.position : mouseTo;
      const d = dist(catPos, here);
      if (state.mouse.n === 0 && d <= MOUSE_SEE) say('mouse-sight', ERRAND_WORDS.mouse.sight());
      if (mouseT >= DART_S) step('mouse', { kind: 'near', d }, session);
    }
    if (mouse && mouse.visible) {
      if (mouseT < 0) { // ducking into the cheese: it shrinks away
        mouseT += step_;
        mouse.scale.setScalar(Math.max(0.01, -mouseT / DART_S));
        if (mouseT >= 0) { mouse.visible = false; mouseT = DART_S; }
      } else if (mouseT < DART_S) {
        mouseT += step_;
        const k = Math.max(0, Math.min(1, mouseT / DART_S));
        placeMouse(mouseFrom.x + (mouseTo.x - mouseFrom.x) * k, mouseFrom.z + (mouseTo.z - mouseFrom.z) * k);
        mouse.rotation.y = Math.atan2(mouseTo.x - mouseFrom.x, mouseTo.z - mouseFrom.z) + Math.PI;
      }
    }
    // ---- the lost glove
    if (!isDone('glove', state.glove)) {
      const held = session?.carry?.mouth?.held?.id === ERRAND.GLOVE_ID;
      step('glove', { kind: 'held', held }, session);
      if (held) step('glove', { kind: 'give', d: dist(catPos, ERRAND.GLOVE_OWNER) }, session);
    }
    // ---- the pigeons on the tables
    if (state.pigeons.bits !== 7 || flights.some((f) => f.t >= 0)) {
      for (let i = 0; i < ERRAND.TABLES.length; i++) {
        const f = flights[i];
        const tb = ERRAND.TABLES[i];
        if (f.t < 0 && !(state.pigeons.bits & (1 << i)) && dist(catPos, tb) <= ERRAND.PIGEON_R) {
          const dx = tb.x - catPos.x, dz = tb.z - catPos.z, l = Math.hypot(dx, dz) || 1;
          f.t = 0; f.dx = dx / l; f.dz = dz / l;
          step('pigeons', { kind: 'flush', table: i }, session);
        }
        const p = made?.pigeons[i];
        if (p && f.t >= 0) {
          f.t += step_;
          const k = Math.min(1, f.t / FLY_S);
          if (reducedMotion || k >= 1) { p.visible = false; f.t = -2; } else {
            p.position.set(tb.x + f.dx * 7 * k, ERRAND.TABLE_Y + 3.2 * Math.sin(k * Math.PI * 0.5) * k + 0.6 * k, tb.z + f.dz * 7 * k);
            p.rotation.y = Math.atan2(f.dx, f.dz);
          }
        }
      }
    }
  }

  return {
    get state() { return state; },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      const gone = [mouse, ...(made?.pigeons ?? [])];
      for (const g of gone) {
        if (!g) continue;
        g.removeFromParent();
        g.geometry.dispose();
        g.material.dispose();
      }
    },
  };
}
