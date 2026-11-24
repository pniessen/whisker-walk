// =============================================================================
// THE LAUNCH COMPLEX ON A WALK (milestone 6: chapter 3, "Hello"). Made once a walk by world/moonlife.js; update(dt, t, catPos, camera, session)
// every frame; the walk asks promptAt(catPos) and interact() for the action button, as for the base, Star Hill and Dot. The rules are
// world/moonmission.js (the step machine, steps 6 to 8) and world/moonlaunch.js (the flight: a pure function of the seconds since T0); this carries them out:
//
//   6. THE POSTCARD. At the Message Desk in the dome (once Earth is found) a page offers three stamps, a paw, a star, a heart. The one she picks is
//      saved (state.moon.stamp) and the postcard is in her mouth (one thing at a time: the cells are plugged in by now). Interact at the
//      rocket's mailbox slot posts it: step 6. A postcard she still holds at the walk's end is simply not carried next time (the stamp is kept).
//   7. THE LAUNCH. Interact at the Launch Desk's big red button: a countdown (five numbers on the board, a tick a second), the gantry's arm swings away,
//      ignition, the rocket climbs (a plume, a smoke pool, the camera tilting up with it) and goes. With the postcard posted this is the real launch: at
//      ignition step 7 is saved ("sent, reply waiting"). With no postcard it is a free test launch (nothing is saved but the page's count), so a child can just
//      watch and the mission can never be stranded by a missing rocket. Anyone's press launches for everyone in a room: credit({ kind: 'launch', t0, now }).
//      The pad also launches by itself every 5 minutes of the room's clock (a siren, then the board): the DEMO, which saves nothing.
//   8. THE REPLY. Within 6 m of Earthrise Rock, 40 s after the launch (at once if she launched on an earlier walk), Earth's night side blinks her stamp, a chime
//      plays, Pip dances. Step 8, `moonstory` (40 paws once), the Moon Badge (owned and put on if her collar is bare) and the journal's "Hello, Earth!" page.
//      From then on Earth carries her stamp, and the stone binocular stand on the rock (Interact) shows it blinking, close up.
//
// No fail state, nothing timed that she can lose. Reduced motion: a 3 s count, no smoke, no camera tilt, a steady plume. The only clock read is the injected
// ctx.clock (the room's, else the device's wall clock) for the demo. Where there is no document the pages do nothing.
// =============================================================================

import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';
import * as P from './moonplan.js';
import * as M from './moonmission.js';
import * as L from './moonlaunch.js';
import { createZones } from './moonzones.js';
import { createMoonSound } from './moonsound.js';
import { createStampPicker, createEarthView, drawStamp } from './moonstamps.js';

export const REACH_L = Object.freeze({ desk: P.MESSAGE_DESK.reach, rocket: P.ROCKET.reach, button: P.LAUNCH_DESK.reach, level: 1.4 });
export const FAR_ROCKET = 60; // m: beyond this the rocket casts no shadow (the shadow pass is a draw call)
export const FAR_ARM = 90; // m: the gantry's arm swings only for a cat this near (it is a speck beyond, and a draw call)
export const FAR_IDLE = 92; // m: a rocket standing on its pad is drawn only within this of it (a flying one is always drawn)
export const NEAR_SMOKE = 100; // m: the smoke is updated and drawn only within this of the pad
export const REPLY_SEQ = Object.freeze({ blink: 1.3, blinks: 3, steady: 0.7, pay: 3.4, badge: 4.6 }); // seconds after the reply begins
const SAY = {
  'moon.desk.prompt': () => phrase('moon.desk.prompt'),
  'moon.rocket.prompt': () => phrase('moon.rocket.prompt'),
  'moon.launch.prompt': () => phrase('moon.launch.prompt'),
  'moon.binoc.prompt': () => phrase('moon.binoc.prompt'),
};
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

// the postcard in her mouth: a small card with her stamp on it (one mesh, one canvas, drawn when it is picked up)
function makePostcard(doc) {
  let cv = null;
  try { cv = doc?.createElement?.('canvas') ?? (typeof document === 'undefined' ? null : document.createElement('canvas')); } catch { cv = null; }
  const g = cv && cv.getContext?.('2d') ? (cv.width = 128, cv.height = 96, cv.getContext('2d')) : null;
  const tex = g ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.375), mat);
  mesh.name = 'moon:postcard';
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  Object.assign(mesh.userData, { noMerge: true, noCast: true, noContactShadow: true });
  return {
    mesh,
    draw(id) {
      if (!g) return;
      g.fillStyle = '#f7f1e0'; g.fillRect(0, 0, 128, 96);
      g.strokeStyle = '#d6584a'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 90);
      drawStamp(g, id, 64, 50, 28);
      tex.needsUpdate = true;
    },
    dispose() { tex?.dispose(); mat.dispose(); mesh.geometry.dispose(); },
  };
}

// the countdown board: one sprite with a big number on a dark screen (nothing until a count is on)
function makeBoard(doc) {
  let cv = null;
  try { cv = doc?.createElement?.('canvas') ?? (typeof document === 'undefined' ? null : document.createElement('canvas')); } catch { cv = null; }
  const g = cv && cv.getContext?.('2d') ? (cv.width = cv.height = 128, cv.getContext('2d')) : null;
  const tex = g ? new THREE.CanvasTexture(cv) : null;
  if (tex) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.name = 'moon:count';
  sprite.visible = false;
  const B = P.COUNT_BOARD;
  sprite.scale.set(B.size, B.size, 1);
  Object.assign(sprite.userData, { noMerge: true, noCast: true, noContactShadow: true });
  let shown = -1;
  return {
    sprite,
    show(n) {
      if (n === shown) return;
      shown = n;
      if (!g) return;
      g.clearRect(0, 0, 128, 128);
      g.fillStyle = '#16212d'; g.fillRect(6, 6, 116, 116);
      g.strokeStyle = '#f0c43c'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
      g.fillStyle = '#ffffff'; g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 64, 70);
      tex.needsUpdate = true;
    },
    dispose() { tex?.dispose(); mat.dispose(); },
  };
}

// createLaunchLive(ctx) -> { update, promptAt, interact, credit, frame, tilt, state, flight, dispose, ... }
// ctx: { scene, reducedMotion, ground, tier, audio, progression, log, doc, win, clock, pip, sky, pads }
export function createLaunchLive(ctx) {
  const { scene, reducedMotion = false, progression = null, log = null } = ctx;
  const ground = ctx.ground ?? { y: P.moonY };
  const doc = ctx.doc ?? (typeof document === 'undefined' ? null : document);
  const win = ctx.win ?? (typeof window === 'undefined' ? null : window);
  // the room's clock if the walk gives one, else the device's wall clock; with no page at all (the tests) a clock that never reaches a demo's T0, so nothing launches by itself
  const wall = ctx.clock ?? (typeof document === 'undefined' ? () => 0 : () => Date.now() / 1000);
  const sound = createMoonSound(ctx.audio ?? null);
  const zones = createZones();
  const byName = (n) => scene.getObjectByName(n) ?? null;
  const rocket = byName('moon:rocket');
  const arm = byName('moon:arm');
  const plume = byName('moon:plume');
  const smoke = byName('moon:smoke');
  if (reducedMotion && smoke) { smoke.visible = false; smoke.parent?.remove(smoke); }
  const puffs = reducedMotion ? 0 : smoke?.geometry?.attributes?.position?.count ?? 0;
  const baseY = ground.y(P.ROCKET.x, P.ROCKET.z);
  const standY = baseY + P.ROCKET.stand;
  const ledge = P.ROCK_LEDGES[2];
  const ledgeTop = ground.y(ledge.x, ledge.z) + ledge.y;
  const rec = () => progression?.state?.moon ?? {};
  const norm = () => M.normalize(rec());

  let clock = 0;
  let disposed = false;
  let target = null;
  let carryingCard = -1; // the stamp on the postcard in her mouth, or -1 (never saved)
  let flight = null; // { t0, real, demo, reduced, cd, lastPhase, sentSaid }
  let lastLaunchAt = null; // this walk's own launch (walk seconds): the reply waits 40 s after it; null = launched on an earlier walk (or not at all this walk)
  let reply = null; // { t0 } while the answer plays
  let demoCycle = -1;
  let sirenCycle = -1;
  let toldWait = false;
  let countedThisWalk = false;
  let sceneHold = null;
  const later = [];
  const wasPos = { x: 1e9, z: 1e9 };

  const postcard = makePostcard(doc);
  const board = makeBoard(doc);
  scene.add(postcard.mesh, board.sprite);
  const boardBase = ground.y(P.COUNT_BOARD.x, P.COUNT_BOARD.z);
  board.sprite.position.set(P.COUNT_BOARD.x, boardBase + P.COUNT_BOARD.y, P.COUNT_BOARD.z);

  // ---- the pages -------------------------------------------------------------------------------------------------------------------
  const lineOf = (key) => SAY[key]?.() ?? ''; // (every id is a literal phrase('...') in SAY, where the phrase table's scan reads it)
  const picker = createStampPicker({
    doc, win, pads: ctx.pads, line: (key) => lineOf2(key),
    selected: Math.max(0, M.stampOf(rec())),
    onPick: (id) => choose(id),
    onClose: () => { sceneHold = null; },
  });
  function lineOf2(key) {
    switch (key) {
      case 'moon.stamp.ask': return phrase('moon.stamp.ask');
      case 'moon.stamp.paw': return phrase('moon.stamp.paw');
      case 'moon.stamp.star': return phrase('moon.stamp.star');
      case 'moon.stamp.heart': return phrase('moon.stamp.heart');
      case 'moon.stamp.close': return phrase('moon.stamp.close');
      case 'moon.binoc.close': return phrase('moon.binoc.close');
      default: return '';
    }
  }
  const view = createEarthView({ doc, win, pads: ctx.pads, line: (key) => lineOf2(key), reducedMotion, stamp: -1, onClose: () => { sceneHold = null; } });

  // ---- the saving ------------------------------------------------------------------------------------------------------------------
  function commit(next) {
    const pr = progression;
    if (!pr?.state) return;
    pr.state.moon = { ...(pr.state.moon ?? {}), step: next.step, cells: next.cells, scope: M.scopeBits(next), stamp: M.stampOf(next) };
    pr.addPoints?.(0); // the save's own "persist now": adds nothing
  }
  function perform(ev, { remote = false } = {}) {
    const r = remote ? M.credit(progression?.state?.moon, ev) : M.apply(progression?.state?.moon, ev);
    if (!r.changed) return null;
    commit(r.moon);
    return r.effect;
  }

  // ---- Earth's answer, on the sky ---------------------------------------------------------------------------------------------------
  const stampNow = () => M.stampOf(rec());
  function paintSky() {
    const sky = ctx.sky;
    if (!sky?.setReply) return;
    const s = stampNow();
    if (!M.storyDone(rec()) || s < 0) { if (!reply) sky.setReply(0, 0); return; }
    if (reply) {
      const k = clock - reply.t0;
      const seq = REPLY_SEQ;
      let level;
      if (reducedMotion) level = 1;
      else if (k < seq.blink * seq.blinks) level = 0.5 + 0.5 * Math.sin((k / seq.blink) * Math.PI * 2 - Math.PI / 2); // three slow blinks, one every 1.3 s
      else level = 0.6 + 0.4 * smooth(1 - (k - seq.blink * seq.blinks) / 2);
      sky.setReply(s, level);
    } else sky.setReply(s, 0.6); // from now on Earth carries her stamp
  }

  function finishStory() {
    const pr = progression;
    const st = pr?.state;
    if (st?.unlocked?.accessories && !st.unlocked.accessories.includes('moonbadge')) st.unlocked.accessories.push('moonbadge');
    if (st?.equipped && st.equipped.collar == null) st.equipped.collar = 'moonbadge';
    try { pr?.recordSighting?.('mnstory'); } catch { /* a stand-in save */ }
    if (log) log.awardOnce('moonstory', 'moon-story', phrase('moon.story.pay'));
    later.push({ at: clock + REPLY_SEQ.badge, fn: () => say('moon-badge', phrase('moon.badge')) });
  }
  function startReply() {
    if (reply) return;
    const effect = perform({ kind: 'reply' });
    if (!effect) return;
    reply = { t0: clock };
    sound.reply();
    ctx.pip?.dance?.();
    ctx.pip?.beep?.();
    later.push({ at: clock + 1.2, fn: () => say('moon-reply', phrase('moon.reply')) });
    later.push({ at: clock + REPLY_SEQ.pay, fn: finishStory });
  }

  // ---- the launch -------------------------------------------------------------------------------------------------------------------
  function startFlight({ t0, real, demo = false, silent = false }) {
    if (flight) return false;
    flight = { t0, real, demo, reduced: reducedMotion, cd: L.createCountdown(reducedMotion) };
    if (silent && flight.cd.advance(clock - t0).some((ev) => ev.kind === 'go')) onGo(true); // joined late: what was already counted is not counted again, but the ignition still counts
    return true;
  }
  function onGo(silent = false) {
    if (!silent) {
      sound.tick(true);
      sound.rumble();
      if (!flight.demo) say('moon-go', phrase('moon.count.go')); // a demo's lift-off is only to watch: no toast, no count
    }
    if (!flight.demo && !countedThisWalk) {
      countedThisWalk = true; // the journal's "Rocket Launch" page counts the walks a rocket was launched on
      try { progression?.recordSighting?.('mnlaunch'); } catch { /* a stand-in save */ }
    }
    if (flight.real && perform({ kind: 'launch' })) {
      lastLaunchAt = flight.t0;
      if (!silent) later.push({ at: clock + 5, fn: () => say('moon-sent', phrase('moon.launch.sent')) });
    }
  }
  // her own press on the big red button: a real launch with the postcard posted, else a free test launch
  function press() {
    if (flight) {
      if (flight.demo && !flight.real && norm().step === M.STEP.loaded && (clock - flight.t0) < L.countOf(reducedMotion)) flight.real = true; // she joined a demo's count: it is hers
      return;
    }
    startFlight({ t0: clock, real: norm().step === M.STEP.loaded });
  }

  // ---- the postcard ------------------------------------------------------------------------------------------------------------------
  function choose(id) {
    const effect = perform({ kind: 'stamp', id });
    if (effect === null && stampNow() !== id) return; // not at this step
    carryingCard = id;
    postcard.draw(id);
    sound.chirp?.();
    say('moon-card-got', phrase('moon.card.got'));
  }
  function post() {
    const effect = perform({ kind: 'load' });
    if (!effect) return;
    carryingCard = -1;
    sound.click();
    say('moon-card-posted', phrase('moon.rocket.loaded'));
  }

  // ---- the action button ----------------------------------------------------------------------------------------------------------------
  const level = (catPos, y) => Math.abs(catPos.y - y) < REACH_L.level;
  function decide(catPos) {
    if (disposed || !catPos || picker.isOpen || view.isOpen) return null;
    const step = norm().step;
    if (dist(catPos, P.MESSAGE_DESK) < REACH_L.desk && level(catPos, ground.y(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z)) && step >= M.STEP.awake && step < M.STEP.loaded) return { kind: 'desk', line: lineOf('moon.desk.prompt') };
    if (carryingCard >= 0 && step === M.STEP.aimed && dist(catPos, P.ROCKET) < REACH_L.rocket && level(catPos, baseY)) return { kind: 'rocket', line: lineOf('moon.rocket.prompt') };
    const inCount = flight && flight.demo && (clock - flight.t0) < L.countOf(reducedMotion);
    if ((!flight || inCount) && dist(catPos, P.LAUNCH_DESK) < REACH_L.button && level(catPos, ground.y(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z))) return { kind: 'button', line: lineOf('moon.launch.prompt') };
    if (dist(catPos, P.BINOCULARS) < P.BINOCULARS.reach && Math.abs(catPos.y - ledgeTop) < P.BINOCULARS.level) return { kind: 'binoc', line: lineOf('moon.binoc.prompt') };
    return null;
  }

  function holdAt(session) {
    const s = session ?? lastSession;
    sceneHold = s?.cat ? { x: s.cat.position.x, y: s.cat.position.y, z: s.cat.position.z, yaw: s.cat.rotation.y } : { x: 0, y: 0, z: 0, yaw: 0 };
  }
  let lastSession = null;

  const api = {
    get state() {
      return { clock, carryingCard, flight: flight ? { t0: flight.t0, real: flight.real, demo: flight.demo } : null, reply: !!reply, lastLaunchAt, open: picker.isOpen || view.isOpen, record: rec() };
    },
    get picker() { return picker; },
    get view() { return view; },
    get board() { return board; },
    get postcard() { return postcard; },
    get carryingCard() { return carryingCard; },
    // the camera's tilt this frame (radians; 0 unless a launch is climbing): the Moon's life applies it before the sky is placed
    tilt() { return flight && !reducedMotion ? L.launchPose(clock - flight.t0, false).tilt : 0; },
    promptAt(catPos) {
      target = decide(catPos);
      return target ? target.line : null;
    },
    interact() {
      if (!target || disposed) return null;
      const t = target;
      target = null;
      if (t.kind === 'desk') {
        if (norm().step === M.STEP.awake) say('moon-desk-later', phrase('moon.goal.scope'));
        else { holdAt(); picker.open(); }
      } else if (t.kind === 'rocket') post();
      else if (t.kind === 'button') press();
      else if (t.kind === 'binoc') { holdAt(); view.setStamp(M.storyDone(rec()) ? stampNow() : -1); view.open(); }
      return t.kind;
    },
    // anyone's press launches for everyone (the wire event itself is the room milestone's; the hook is this): { kind: 'launch', t0, now } with both
    // readings from the room's clock. Moves this device's own step only if its own postcard is posted. A bad event does nothing.
    credit(ev) {
      if (!ev || typeof ev !== 'object' || ev.kind !== 'launch') return null;
      const total = L.totalOf(reducedMotion);
      const elapsed = Number.isFinite(ev.t0) && Number.isFinite(ev.now) ? ev.now - ev.t0 : NaN;
      if (!(elapsed >= 0 && elapsed < total)) return null;
      if (flight) return null; // one rocket at a time
      startFlight({ t0: clock - elapsed, real: norm().step === M.STEP.loaded, silent: elapsed > 0.25 });
      return 'launch';
    },
    // the walk's own hook (the rover's, every frame): the cat is held where she stands while a page is open
    frame(dt, t, { cat, player, session } = {}) {
      lastSession = session ?? lastSession;
      if (!(picker.isOpen || view.isOpen) || !sceneHold || !cat) return;
      cat.position.set(sceneHold.x, sceneHold.y, sceneHold.z);
      cat.rotation.y = sceneHold.yaw;
      player?.halt?.();
      if (session) { session.idleTime = 0; session.pounceTime = 0; }
    },
    update(dt, t, catPos = null, camera = null, session = null) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      clock += step;
      lastSession = session ?? lastSession;
      for (let i = later.length - 1; i >= 0; i--) if (clock >= later[i].at) later.splice(i, 1)[0].fn();
      picker.update(step);
      view.update(step, t);

      const r = norm();
      const near = catPos ? zones.update(catPos.x, catPos.z).C : false;

      // the demo: every 5 minutes of the room's clock the pad launches by itself (a siren first); it saves nothing
      const d = L.demoState(wall());
      if (d.siren && sirenCycle !== d.cycle) { sirenCycle = d.cycle; if (!flight) sound.siren(); }
      if (!flight && demoCycle !== d.cycle && d.elapsed >= 0 && d.elapsed < L.totalOf(reducedMotion)) {
        demoCycle = d.cycle;
        startFlight({ t0: clock - d.elapsed, real: false, demo: true, silent: d.elapsed > 0.25 });
      }

      // the flight
      let pose = null;
      if (flight) {
        const e = clock - flight.t0;
        pose = L.launchPose(e, reducedMotion);
        for (const ev of flight.cd.advance(e)) {
          if (ev.kind === 'tick') { sound.tick(false); board.show(ev.n); }
          else onGo();
        }
        if (pose.over) {
          flight = null;
          pose = null;
        }
      }
      // (a demo whose cycle has gone by does not come back; a real flight is over after its 40 s)

      // the pictures
      const flying = !!pose;
      if (rocket) {
        const p = pose ?? L.launchPose(-1, reducedMotion);
        rocket.visible = p.rocketOn && (flying || !catPos || dist(catPos, P.PAD) < FAR_IDLE); // a standing rocket past 90 m is a speck: not drawn (a draw call); a flying one always
        rocket.position.y = standY + p.rocketY;
        rocket.scale.setScalar(Math.max(0.001, p.rocketScale));
        rocket.castShadow = !!catPos && dist(catPos, P.PAD) < FAR_ROCKET && p.rocketY < 20;
      }
      if (arm) {
        arm.visible = near || (flying && !!catPos && dist(catPos, P.PAD) < FAR_ARM);
        arm.rotation.y = P.GANTRY.swing * (pose ? pose.gantry : 0);
      }
      if (plume) {
        const on = !!pose && pose.plume > 0.002;
        plume.visible = on;
        if (on) {
          plume.position.set(P.ROCKET.x, standY + pose.plumeY - 0.15, P.ROCKET.z);
          plume.material.opacity = pose.plume;
          // out of the picture the glow is the fading dot: grown with the distance so it still reads as a spark in the sky (it dims as it goes)
          const far = camera ? Math.hypot(camera.position.x - P.ROCKET.x, camera.position.y - (standY + pose.plumeY), camera.position.z - P.ROCKET.z) : 0;
          const s = pose.rocketOn ? 1 : Math.min(6, Math.max(1, far / 45));
          plume.scale.set(s, s * (0.7 + 0.3 * pose.plume), s);
          if (camera) plume.rotation.y = Math.atan2(camera.position.x - P.ROCKET.x, camera.position.z - P.ROCKET.z);
        }
      }
      if (smoke && puffs > 0) {
        const on = !!pose && pose.smoke && !!catPos && dist(catPos, P.PAD) < NEAR_SMOKE;
        smoke.visible = on;
        if (on) {
          const pos = smoke.geometry.attributes.position;
          const col = smoke.geometry.attributes.color;
          const e = clock - flight.t0;
          for (let i = 0; i < puffs; i++) {
            const s = L.smokePuff(i, puffs, e, false);
            pos.setXYZ(i, P.PAD.x + s.x, baseY + s.y, P.PAD.z + s.z);
            const a = s.alive ? s.alpha : 0;
            col.setXYZ(i, 0.82 * a, 0.83 * a, 0.86 * a);
          }
          pos.needsUpdate = true;
          col.needsUpdate = true;
        }
      }
      // the countdown board: while a count is on, within sight
      const counting = !!pose && pose.phase === 'count';
      board.sprite.visible = counting && (!catPos || dist(catPos, P.PAD) < 130);
      if (counting) board.show(pose.count);

      // the postcard in her mouth
      if (carryingCard >= 0 && catPos) {
        const yaw = session?.cat?.rotation?.y ?? 0;
        postcard.mesh.visible = true;
        postcard.mesh.position.set(catPos.x - Math.sin(yaw) * 0.45, catPos.y + 0.55, catPos.z - Math.cos(yaw) * 0.45);
        postcard.mesh.rotation.y = yaw + Math.PI;
      } else postcard.mesh.visible = false;
      if (r.step >= M.STEP.loaded) carryingCard = -1; // it is in the rocket

      // Earth's answer: she waits on the ridge
      if (catPos && r.step === M.STEP.sent && !reply) {
        const nearRock = dist(catPos, ledge) <= P.REPLY_NEAR;
        if (nearRock) {
          const since = lastLaunchAt === null ? null : clock - lastLaunchAt;
          if (L.replyReady(since)) startReply();
          else if (!toldWait) { toldWait = true; say('moon-reply-wait', phrase('moon.reply.wait')); }
        }
      }
      if (reply && clock - reply.t0 > REPLY_SEQ.blink * REPLY_SEQ.blinks + 3) reply = null;
      paintSky();
      void camera; void wasPos;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      picker.close();
      view.close();
      sound.dispose();
      scene.remove(postcard.mesh, board.sprite);
      postcard.dispose();
      board.dispose();
      if (rocket) { rocket.visible = true; rocket.position.y = standY; rocket.scale.setScalar(1); rocket.castShadow = true; }
      if (arm) { arm.visible = true; arm.rotation.y = 0; }
      if (plume) plume.visible = false;
      if (smoke) smoke.visible = false;
      ctx.sky?.setReply?.(0, 0);
    },
  };
  paintSky();
  return api;
}
