import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { painted } from './marketparts.js';
import { bus } from '../events.js';
import { withLocalUuids } from './localuuids.js';
import { buildCat, catStyle } from '../cat/model.js';
import { animateCat } from '../cat/animator.js';
import { leanOnGround } from '../ground.js';
import { keepOutPoint } from '../keepout.js';
import { ERRAND, ERRAND_IDS, errandKey, errandPageId, initial, apply, isDone, awningAt, musicianSpot } from './marketerrands.js';
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
const popcount = (b) => { let n = 0; for (let v = b >>> 0; v; v >>>= 1) n += v & 1; return n; };
const DART_S = 0.45; // seconds a mouse takes between two spots
const FLY_S = 1.3; // a pigeon's flight
const MOUSE_SEE = 8; // she is told about the mouse within this
const SHOW_R = 40; // the stray is drawn within this of her
const FOLLOW_SPEED = 2.4;
const CATCH_MAX = 5;
const CATCH_GAIN = 1.0;
const SNAP_SPEED = 12; // a step faster than this is a perch snap or a respawn, not her running
const YAW = (dx, dz) => Math.atan2(dx, dz) + Math.PI; // the model faces -z
const STRAY_LOOK = Object.freeze({ ...catStyle('tabby'), base: 0x7d7468, belly: 0xd9d0bd, accent: 0x4f4840 });

// One merged, vertex-coloured mesh a prop (the life's meshes are counted: test/marketlife.test.js), no shadow, marked as a
// mission prop so the life's own budget counts leave it to test/marketerrands.test.js.
const at = (geo, x, y, z) => geo.translate(x, y, z);
function prop(name, geos) {
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true }));
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
// ctx: { scene, ground, area, log, progression, reducedMotion }
export function createErrands(ctx = {}) {
  const { scene = null, ground = null, area = null, log = null, progression = null, reducedMotion = false } = ctx;
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
    else if (id === 'stray') state.stray = { stage: 2 };
  }
  // fed on an earlier walk (his journal page has a count): he follows her from the start, and the mission is not offered again
  const journalStray = progression?.state?.journal?.mkstray;
  const follower = Number.isFinite(journalStray) && journalStray > 0;
  if (follower) { state.stray = { stage: 2 }; finished.add('stray'); }

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

  // the hungry stray: the game's own cat model, made when she first comes near (or at once, if he follows)
  let stray = null;
  let strayMood = follower ? 'follow' : 'sit'; // sit -> (fed) eat; follow
  let eatLeft = 0;
  let pickedUp = false; // the fish head's carryable has been made
  const strayPos = { x: ERRAND.STRAY_SPOT.x, z: ERRAND.STRAY_SPOT.z };
  function makeStray(from) {
    if (stray || !scene) return;
    stray = withLocalUuids('market-errand-stray', () => {
      const c = buildCat('tabby', undefined, { style: STRAY_LOOK });
      c.name = 'marketStray';
      c.traverse((o) => { o.castShadow = false; o.userData.errand = true; });
      return c;
    });
    if (follower && from) { strayPos.x = from.x; strayPos.z = from.z + 2.5; }
    stray.position.set(strayPos.x, y0(strayPos.x, strayPos.z), strayPos.z);
    scene.add(stray);
  }
  function strayStep(dt, t, catOne, session) {
    const t2 = twoHere();
    const catPos = t2 && dist(t2, strayPos) < dist(catOne, strayPos) ? t2 : catOne;
    if (!stray) { if (follower || dist(catPos, strayPos) <= SHOW_R) makeStray(catPos); if (!stray) return; }
    const d = dist(catPos, strayPos);
    stray.visible = d <= SHOW_R;
    if (!stray.visible) return;
    if (strayMood === 'follow') {
      const gap = d - ERRAND.FOLLOW_GAP;
      let moving = false;
      let speed = FOLLOW_SPEED;
      if (gap > 0.05) {
        speed = Math.min(CATCH_MAX, FOLLOW_SPEED + CATCH_GAIN * gap);
        const k = Math.min(gap, speed * dt) / d;
        const q = area ? keepOutPoint(area, strayPos.x + (catPos.x - strayPos.x) * k, strayPos.z + (catPos.z - strayPos.z) * k, true) : { x: strayPos.x + (catPos.x - strayPos.x) * k, z: strayPos.z + (catPos.z - strayPos.z) * k };
        strayPos.x = q.x; strayPos.z = q.z;
        stray.rotation.y = YAW(catPos.x - strayPos.x, catPos.z - strayPos.z);
        moving = true;
        say('stray-follows', ERRAND_WORDS.stray.follows());
      }
      animateCat(stray, moving ? 'follow' : 'requestPet', t, moving ? speed : 0, reducedMotion);
    } else {
      if (d < 6) stray.rotation.y = YAW(catPos.x - strayPos.x, catPos.z - strayPos.z);
      if (eatLeft > 0) eatLeft -= dt;
      animateCat(stray, 'requestPet', t, 0, reducedMotion);
    }
    stray.position.set(strayPos.x, y0(strayPos.x, strayPos.z), strayPos.z);
    if (ground) leanOnGround(stray, ground);
  }
  function fishHead(session) {
    const items = session?.carry?.items;
    if (!items || pickedUp) return items ?? null;
    pickedUp = true;
    items.addHidden?.({ id: ERRAND.FISH_HEAD_ID, kind: 'fishhead', x: ERRAND.FISH_HEAD_SPOT.x, z: ERRAND.FISH_HEAD_SPOT.z });
    return items;
  }

  // the bell (marketlife.js calls bellRung when she lands in the bicycle's basket)
  let bellCount = 0;
  let perchedWas = null;
  // her speed over the frame, for the fiddler's song
  const prev = { x: 0, z: 0, set: false, speed: 0 };

  // COUCH PLAY'S CAT TWO (src/coop/finds.js hands it in, once a frame, through second()): the same six missions, from its
  // own spot and its own mouth. Missions are the household's, so a mission done once is done (one pay, by the keys above);
  // the stray follows whichever cat is nearer; the song counts the cat that is calm beside the fiddler. Nothing is sent.
  const TWO_FRESH_S = 0.25;
  let two = null; // { x, z, speed, heldId, release(id) }
  let twoAge = 99;
  const twoHere = () => (two && twoAge <= TWO_FRESH_S ? two : null);

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
        if (two?.heldId === ERRAND.GLOVE_ID) two.release?.(ERRAND.GLOVE_ID);
        c?.items?.showAt?.(ERRAND.GLOVE_ID, ERRAND.GLOVE_OWNER.x + 0.5, ERRAND.GLOVE_OWNER.z - 0.9);
        pay('glove');
      }
    } else if (id === 'pigeons') {
      if (effect === 'done') pay('pigeons');
      else say(`pigeons-${state.pigeons.bits}`, ERRAND_WORDS.pigeons.flush());
    } else if (id === 'bell') {
      const n = bellCount;
      if (effect === 'ring') say(`bell-ring-${n}`, ERRAND_WORDS.bell.ring());
      else if (effect === 'land') say(`bell-land-${n}-${state.bell.seen}`, ERRAND_WORDS.bell.land(popcount(state.bell.seen)));
      else if (effect === 'late') say(`bell-late-${n}`, ERRAND_WORDS.bell.late());
      else if (effect === 'done') pay('bell');
    } else if (id === 'stray') {
      if (effect === 'met') {
        say('stray-met', ERRAND_WORDS.stray.met());
        fishHead(session)?.placeAt?.(ERRAND.FISH_HEAD_ID, ERRAND.FISH_HEAD_SPOT.x, ERRAND.FISH_HEAD_SPOT.z);
      } else if (effect === 'done') {
        const c = session?.carry;
        if (c?.mouth?.held?.id === ERRAND.FISH_HEAD_ID) { c.mouth.held = null; c.mouth.grip = 0; }
        if (two?.heldId === ERRAND.FISH_HEAD_ID) two.release?.(ERRAND.FISH_HEAD_ID);
        c?.items?.take?.(ERRAND.FISH_HEAD_ID);
        eatLeft = 3;
        pay('stray');
      }
    } else if (id === 'fiddle') {
      if (effect === 'start') say(`fiddle-start-${fiddleStarts}`, ERRAND_WORDS.fiddle.start());
      else if (effect === 'broke') { fiddleStarts++; say(`fiddle-broke-${fiddleStarts}`, ERRAND_WORDS.fiddle.broke()); }
      else if (effect === 'done') pay('fiddle');
    }
  }
  let fiddleStarts = 0;

  function update(dt, t, catPos, session = null) {
    if (disposed || !catPos) return;
    const step_ = dt > 0 ? dt : 0;
    twoAge += step_;
    later(step_, t, catPos, session);
    clock += step_;
    // ---- the mouse
    if (state.mouse.n < 4) {
      const here = mouse ? mouse.position : mouseTo;
      const d = dist(catPos, here);
      if (state.mouse.n === 0 && d <= MOUSE_SEE) say('mouse-sight', ERRAND_WORDS.mouse.sight());
      if (mouseT >= DART_S && d <= ERRAND.MOUSE_FLEE) step('mouse', { kind: 'near', d }, session);
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
      const heldOne = session?.carry?.mouth?.held?.id === ERRAND.GLOVE_ID;
      const held = heldOne || twoHere()?.heldId === ERRAND.GLOVE_ID;
      if (held !== (state.glove.stage === 1)) step('glove', { kind: 'held', held }, session);
      if (heldOne && dist(catPos, ERRAND.GLOVE_OWNER) <= ERRAND.GLOVE_R) step('glove', { kind: 'give', d: dist(catPos, ERRAND.GLOVE_OWNER) }, session);
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

  function later(dt, t, catPos, session) {
    // her speed, for the song (a perch snap or a respawn does not count)
    if (prev.set && dt > 0) { const v = dist(catPos, prev) / dt; if (v <= SNAP_SPEED) prev.speed = v; }
    prev.x = catPos.x; prev.z = catPos.z; prev.set = true;
    // ---- the bell's awning run
    if (state.bell.t >= 0) step('bell', { kind: 'tick', dt }, session);
    const perched = session?.perched ?? null;
    if (perched !== perchedWas) {
      perchedWas = perched;
      const i = awningAt(perched);
      if (i >= 0) step('bell', { kind: 'land', roof: i }, session);
    }
    // ---- the hungry stray
    if (!finished.has('stray') && state.stray.stage < 2) {
      const t2 = twoHere();
      const dSee = Math.min(dist(catPos, strayPos), t2 ? dist(t2, strayPos) : Infinity);
      if (state.stray.stage === 0) {
        if (dSee <= ERRAND.STRAY_SEE) step('stray', { kind: 'see', d: dSee }, session);
      } else if (session?.carry?.mouth?.held?.id === ERRAND.FISH_HEAD_ID && dist(catPos, strayPos) <= ERRAND.STRAY_FEED_R) {
        step('stray', { kind: 'feed', d: dist(catPos, strayPos) }, session);
      } else if (t2?.heldId === ERRAND.FISH_HEAD_ID && dist(t2, strayPos) <= ERRAND.STRAY_FEED_R) {
        step('stray', { kind: 'feed', d: dist(t2, strayPos) }, session);
      }
    }
    strayStep(dt, t, catPos, session);
    // ---- the fiddler's song
    if (!isDone('fiddle', state.fiddle) && !finished.has('fiddle')) {
      let d = dist(catPos, musicianSpot);
      let speed = session?.rest?.kind === 'drink' ? 99 : prev.speed;
      const t2 = twoHere();
      if (t2 && dist(t2, musicianSpot) <= ERRAND.SONG_R && t2.speed <= ERRAND.STILL_SPEED && !(d <= ERRAND.SONG_R && speed <= ERRAND.STILL_SPEED)) { d = dist(t2, musicianSpot); speed = t2.speed; } // the calm one listens for them both
      if (d <= ERRAND.SONG_R || state.fiddle.secs > 0) step('fiddle', { kind: 'listen', dt, d, speed }, session); // (a drink at the fountain, 2 m off, is the fountain's own, as for the finds)
    }
  }

  // Cat two, once a frame (couch play): `p` is { x, z, speed, heldId, release(id), session }, or null when it has gone.
  // What needs no one's mouth (the mouse, the pigeons, the song's ear and the stray's eyes) is read from its spot here and in
  // update(); what needs a held thing (the glove, the fish head) is given here, by the same steps cat one's frame takes.
  function second(p, session = null) {
    if (disposed) return;
    if (!p) { two = null; twoAge = 99; return; }
    two = p;
    twoAge = 0;
    const pos = { x: p.x, z: p.z };
    if (state.mouse.n < 4) {
      const here = mouse ? mouse.position : mouseTo;
      const d = dist(pos, here);
      if (state.mouse.n === 0 && d <= MOUSE_SEE) say('mouse-sight', ERRAND_WORDS.mouse.sight());
      if (mouseT >= DART_S && d <= ERRAND.MOUSE_FLEE) step('mouse', { kind: 'near', d }, session);
    }
    if (!isDone('glove', state.glove) && p.heldId === ERRAND.GLOVE_ID) {
      if (state.glove.stage !== 1) step('glove', { kind: 'held', held: true }, session);
      if (dist(pos, ERRAND.GLOVE_OWNER) <= ERRAND.GLOVE_R) step('glove', { kind: 'give', d: dist(pos, ERRAND.GLOVE_OWNER) }, session);
    }
    if (state.pigeons.bits !== 7) {
      for (let i = 0; i < ERRAND.TABLES.length; i++) {
        const f = flights[i];
        const tb = ERRAND.TABLES[i];
        if (f.t < 0 && !(state.pigeons.bits & (1 << i)) && dist(pos, tb) <= ERRAND.PIGEON_R) {
          const dx = tb.x - pos.x, dz = tb.z - pos.z, l = Math.hypot(dx, dz) || 1;
          f.t = 0; f.dx = dx / l; f.dz = dz / l;
          step('pigeons', { kind: 'flush', table: i }, session);
        }
      }
    }
  }

  return {
    get state() { return state; },
    second,
    bellRung() {
      if (disposed || isDone('bell', state.bell)) return;
      bellCount++;
      step('bell', { kind: 'ring' }, null);
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (stray) {
        stray.removeFromParent();
        stray.traverse((o) => { o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose(); });
        stray = null;
      }
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
