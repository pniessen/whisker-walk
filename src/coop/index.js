// Couch play chunk: reached only through import('./coop/index.js') from
// main.js (src/coopseam.js has the start-up side). Two cats on one screen, two
// pads (docs/superpowers/specs/2026-11-22-couch-coop-design.md, milestone 1):
//
//   pad one (and the keyboard, and touch) drive cat one, exactly as today;
//   a second pad joins with a press and drives cat two, a local co-walker: a
//   headless player (src/coop/second.js) drawn through remotecats.js;
//   the camera frames both cats from a fixed heading that L1 / R1 turn by
//   quarters (src/coop/framing.js); either pad can pause; a pad that goes to
//   sleep pauses the walk and is asked for.
//
// Nothing here is reached with the flag off, on a phone or a tablet, in an
// online co-walk, or in a place whose row in table.js is not ready.
import { coop } from '../coopseam.js';
import { coopReady } from './table.js';
import { createPadHub, padForWalk } from './padhub.js';
import { createHeading, neededLevel, catPoints, maxSeparation, easeLevel, offsetAt, inBox } from './framing.js';
import { createMarkers } from './markers.js';
import { createCards } from './cards.js';
import { pickSecond, profileOf, createMover, SECOND_ID } from './second.js';
import './words.js';
import { phrase } from '../clanphrases.js';
import { glyphify, plainify, padKind } from '../tv/glyphs.js';
import { getProfile } from '../profile.js';
import { pounceArc, DEFAULT_PITCH } from '../player.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import { MIN_CAMERA_Y, cameraPullScale } from '../camzoom.js';
import { makeNameTag } from '../nametag.js';
import { activeCat } from '../customcats.js';
import * as THREE from 'three';

/** The standard-mapped pads the page can see, in the order the browser lists them. */
export function standardPads(nav) {
  let all;
  try { all = nav?.getGamepads?.() || []; } catch { return []; }
  return [...all].filter((p) => p && p.connected && p.mapping === 'standard');
}

const HOP_COOLDOWN = 0.8; // seconds between cat two's hops: a press in the air does not start another
const SIT_AT = 10; // the walk's own idle ladder (game/avatar.js), cat two's share of it
const GROOM_AT = 6;
const NAP_AT = 16;
const START_APART = 1.6; // metres: where cat two appears, to cat one's right
const LEASH_MARGIN = 0.95;
const TAG_SCALE = 0.75; // cat one's own name tag, as game/owntag.js

const nowSec = () => performance.now() / 1000;
const LOOK_AHEAD = 0.3; // seconds of a cat's own pace the camera widens for
const MAX_AHEAD = 2; // metres

/**
 * Holds a cat to `limit` metres from its friend. `pos` is where this frame's step ended, `was` where
 * the cat began it, `other` where the friend began it (so neither is ever pulled by the other). Only
 * the part of the step that goes farther from the friend, past the limit, is taken away: the cat
 * slides sideways, walks back toward its friend, and uses whatever room is left.
 */
function stop(pos, was, other, limit) {
  const rx = was.x - other.x, rz = was.y - other.y;
  const r = Math.hypot(rx, rz);
  if (r < 1e-6) return;
  const ux = rx / r, uz = rz / r;
  const apart = (pos.x - was.x) * ux + (pos.z - was.y) * uz; // metres this step goes away from the friend
  const excess = apart - Math.max(limit - r, 0);
  if (excess > 0) { pos.x -= ux * excess; pos.z -= uz * excess; }
}

/** `p` moved a little along the way it is going (a copy-free nudge of the framing point, never of the cat). */
function ahead(p, v) {
  const m = Math.hypot(v.x, v.y);
  const k = m > 1e-6 ? Math.min(LOOK_AHEAD, MAX_AHEAD / m) : 0;
  p.x += v.x * k; p.z += v.y * k;
}

/**
 * Starts the chunk. ctx: { nav, getSession, player, camera, getState, act,
 * resume, canResume, voice, toast, catalog, profile, doc }. Couch play and an online
 * co-walk exclude each other, so a session with a net is never ready.
 * Returns { stop, state, hub }; state is what a test or the browser pane reads.
 */
export function start(ctx) {
  const state = {
    pads: 0, ready: false, couch: false, joined: false, seats: [null, null], second: null, yaw: 0, level: 0, apart: 0, leash: 0, tight: false,
  };
  const hub = createPadHub();
  const heading = createHeading();
  const doc = ctx.doc ?? (typeof document !== 'undefined' && document.body ? document : null);
  const cards = doc ? createCards({ doc }) : null;
  const profile = ctx.profile ?? getProfile;

  let cur = null; // the session this chunk is working in
  let mover = null; // { player, body }
  let markers = null;
  let tag = null; // the name tag this chunk gave cat one (null: it had its own)
  let pick = null;
  let clock = 0;
  let idle = 0; // seconds cat two has stood still
  let hopAt = -Infinity;
  let level = 0; // the camera's eased zoom level while framing both
  let pull = 1;
  let tight = false; // the camera could not frame both cats last frame
  let menuOwner = 0; // the slot whose pad moves the pause card's focus
  let dismissed = false; // "Wait for it" was chosen for the card on screen
  let heldOne = false, heldTwo = false; // a stick held through a turn keeps its world direction
  let padKindNow = 'ps';
  const lens = { pitch: DEFAULT_PITCH, lookY: CAT_LOOK_Y, fov: 70, aspect: 16 / 9 };
  const prev = { a: new THREE.Vector2(), b: new THREE.Vector2() }; // where each cat stood last frame
  const vel = { a: new THREE.Vector2(), b: new THREE.Vector2() }; // metres a second, for the camera to look ahead
  const mid = new THREE.Vector3();
  const off = new THREE.Vector3();
  const one = new THREE.Vector3();
  const two = new THREE.Vector3();
  const soon1 = new THREE.Vector3();
  const soon2 = new THREE.Vector3();
  const msg = { id: SECOND_ID, pos: [0, 0], yaw: 0, pose: 'follow', speed: 0, h: 0 };

  const nameOne = () => {
    const st = ctx.getState?.();
    const a = st ? activeCat(st) : null;
    return (a?.name || st?.petName || ctx.catalog?.cats[a?.breed ?? 'tabby']?.name || '').slice(0, 16);
  };
  const nameTwo = () => pick?.name ?? '';

  function leave(toast) {
    if (!state.joined) return;
    const s = cur;
    release();
    if (mover) { mover.player.setTouchMove(null); mover.player.disable(); }
    mover = null;
    s?.remotes?.remove?.(SECOND_ID);
    markers?.dispose();
    markers = null;
    if (tag) { tag.parent?.remove(tag); tag.material?.map?.dispose(); tag.material?.dispose(); if (s?.cat?.userData?.ownTag === tag) delete s.cat.userData.ownTag; tag = null; }
    hub.release(1);
    state.joined = false;
    state.second = null;
    cards?.hideLost();
    if (toast && pick) ctx.toast?.(phrase('coop.left', nameTwo()));
    pick = null;
  }

  function release() {
    if (heldOne) { ctx.player?.setInputYaw(null); heldOne = false; }
    if (heldTwo) { mover?.player.setInputYaw(null); heldTwo = false; }
  }

  function switchSession(next) {
    if (state.joined) { // its scene is being thrown away: nothing of the old walk is touched
      mover?.player.disable();
      mover = null; markers = null; tag = null; pick = null;
      state.joined = false; state.second = null;
      heldOne = heldTwo = false;
    }
    hub.reset();
    cards?.hideJoin();
    cards?.hideLost();
    cur = next;
    menuOwner = 0;
    dismissed = false;
  }

  function join() {
    const s = cur;
    const st = ctx.getState?.();
    pick = pickSecond(st, ctx.catalog);
    const entry = s.remotes.upsert(profileOf(pick));
    entry.local = true; // drawn where it is, with no network's half-second of smoothing
    const yaw0 = ctx.player.viewYaw();
    heading.yaw = yaw0;
    heading.square(yaw0);
    const right = { x: Math.cos(heading.target), z: -Math.sin(heading.target) };
    const p = s.cat.position;
    const at = { x: p.x + right.x * START_APART, z: p.z + right.z * START_APART, yaw: s.cat.rotation.y };
    mover = createMover({ ground: s.ground, state: st, pick, at, reducedMotion: !!s.reducedMotion });
    markers = createMarkers(s.scene);
    if (!s.cat.userData.ownTag) { // cat one's name, so both cats read
      const t = makeNameTag(nameOne(), { fit: true });
      if (t) {
        t.scale.multiplyScalar(TAG_SCALE);
        t.material.depthTest = false; t.material.depthWrite = false; t.renderOrder = 999; t.visible = true;
        s.cat.add(t);
        s.cat.userData.ownTag = t;
        tag = t;
      }
    }
    idle = 0; level = ctx.player.cameraZoomLevel ?? 1; pull = 1;
    prev.a.set(p.x, p.z); prev.b.set(at.x, at.z);
    state.joined = true;
    state.second = { key: pick.key, name: pick.name };
    ctx.toast?.(phrase('coop.joined', nameTwo()));
  }

  function turn(dir) {
    const yawNow = heading.yaw;
    if (ctx.player.inputActive && !heldOne) { ctx.player.setInputYaw(yawNow); heldOne = true; }
    if (mover?.player.inputActive && !heldTwo) { mover.player.setInputYaw(yawNow); heldTwo = true; }
    heading.turn(dir);
  }

  function onEvent(ev, engaged) {
    if (ev.type === 'join') join();
    else if (ev.type === 'lost') { if (state.joined) { dismissed = false; if (engaged) ctx.act?.('pause'); } }
    else if (ev.type === 'back') dismissed = false;
    else if (ev.type === 'turn') { if (state.joined && engaged) turn(ev.dir); }
    else if (ev.type === 'start') {
      if (engaged) { menuOwner = ev.slot; if (ev.slot === 1) ctx.act?.('pause'); } // pad one's own Start is the walk's
      else if (ctx.canResume?.()) ctx.resume?.();
    }
  }

  function hop() {
    if (clock < hopAt || !mover) return;
    hopAt = clock + HOP_COOLDOWN;
    mover.player.pounce(pounceArc(ctx.getState?.() ?? {}, { reducedMotion: !!cur.reducedMotion }));
  }

  function lostCard() {
    const slot = state.seats.findIndex((x) => x?.lost);
    if (!state.joined || slot < 0 || dismissed) { cards?.hideLost(); return; }
    cards?.showLost({
      title: phrase('coop.lost.title', slot === 0 ? nameOne() : nameTwo()),
      hint: phrase('coop.lost.hint'),
      wait: phrase('coop.lost.wait'),
      without: phrase('coop.lost.without'),
      onWait: () => { dismissed = true; cards.hideLost(); },
      onWithout: () => { if (slot === 1) leave(true); else hub.release(0); cards.hideLost(); },
    });
  }

  function joinPill(pads, engaged, couch) {
    if (!cards) return;
    if (!couch || !cur || !engaged || state.joined || pads.length === 0) { cards.hideJoin(); return; }
    if (!state.ready) {
      if (pads.length >= 2) cards.showJoin(glyphify(phrase('coop.notready'), padKindNow), plainify(phrase('coop.notready'), padKindNow));
      else cards.hideJoin();
      return;
    }
    const text = phrase('coop.join');
    cards.showJoin(glyphify(text, padKindNow), plainify(text, padKindNow));
  }

  coop.poll = (dt) => {
    clock += dt;
    const s = ctx.getSession?.() ?? null;
    if (s !== cur) switchSession(s);
    const pads = standardPads(ctx.nav);
    state.pads = pads.length;
    state.ready = !!s && !s.net && coopReady(s.areaId);
    const prof = profile();
    state.couch = prof === 'tv' || prof === 'laptop'; // a phone or a tablet never shows couch play
    coop.pad = null;
    if (!ctx.player) return;
    const live = state.couch && state.ready;
    if (!live) {
      if (state.joined) leave(false);
      hub.reset();
      cards?.hideLost();
      joinPill(pads, !!ctx.player.engaged, state.couch);
      return;
    }
    const engaged = !!ctx.player.engaged;
    if (engaged) menuOwner = 0;
    const playing = engaged && !s.cameraMode;
    const { events, two: pad2 } = hub.step(pads, { joinOpen: engaged && !state.joined && !!hub.seats()[0] && !hub.seats()[0].lost, engaged: playing, dt });
    for (const ev of events) onEvent(ev, engaged);
    state.seats = hub.seats();
    if (state.joined && mover) {
      if (pad2) {
        if (pad2.move !== undefined) mover.player.setTouchMove(pad2.move);
        for (const a of pad2.actions) {
          if (a === 'pounce') hop();
          else if (a === 'meow') ctx.voice?.(1.26);
          else if (a === 'camera') ctx.act?.('camera');
        }
      }
      heading.step(dt, !!s.reducedMotion);
      ctx.player.setViewYaw(heading.yaw);
      mover.player.setViewYaw(heading.yaw);
      if (heldOne && !ctx.player.inputActive) { ctx.player.setInputYaw(null); heldOne = false; }
      if (heldTwo && !mover.player.inputActive) { mover.player.setInputYaw(null); heldTwo = false; }
      state.yaw = heading.target;
    }
    // A slot's pad, for cat one's walk code; the other pad's when it paused and holds the card.
    const p0 = hub.padOf(0, pads);
    const p1 = hub.padOf(1, pads);
    const live2 = !!ctx.player.engaged; // a pause pressed just now counts
    const owner = !live2 && (menuOwner === 1 || (state.seats[0]?.lost)) && p1 ? p1 : p0;
    coop.pad = owner ? padForWalk(owner, live2 && state.joined) : null;
    if (owner) padKindNow = padKind(owner.id);
    lostCard();
    joinPill(pads, live2, true);
  };

  // After cat one's player.update: cat two's step, the leash, the picture of both.
  coop.frame = (dt) => {
    const s = cur;
    if (!state.joined || !mover || !s) return;
    const cat = s.cat;
    const area = s.areaData;
    mover.player.update(dt, area.colliders, area.bounds, area.waters, s.fair?.show?.bumps ?? s.critters?.bumps);
    const body = mover.body;
    lens.fov = ctx.camera.fov;
    lens.aspect = ctx.camera.aspect;

    // The leash: a cat walking away from its friend stops at the widest frame. Each cat is held
    // against where the other STARTED the frame, so neither is ever pulled along by the other: the
    // one that is stopped slides round the circle, the other walks on as it pleases.
    // Where a building has pulled the camera in, the widest frame is not there to be had: the leash
    // then holds the cats no farther apart than they are (the plan's tight-place rule, in its first form).
    const wide = maxSeparation(lens) * LEASH_MARGIN;
    const limit = tight ? Math.min(wide, Math.max(state.apart, 2)) : wide;
    state.leash = limit;
    stop(cat.position, prev.a, prev.b, limit);
    stop(body.position, prev.b, prev.a, limit);
    vel.a.set((cat.position.x - prev.a.x) / Math.max(dt, 1e-3), (cat.position.z - prev.a.y) / Math.max(dt, 1e-3));
    vel.b.set((body.position.x - prev.b.x) / Math.max(dt, 1e-3), (body.position.z - prev.b.y) / Math.max(dt, 1e-3));
    prev.a.set(cat.position.x, cat.position.z);
    prev.b.set(body.position.x, body.position.z);
    state.apart = Math.hypot(cat.position.x - body.position.x, cat.position.z - body.position.z);

    // Cat two, drawn: where its walker stands, how it stands.
    const gy = s.ground.y(body.position.x, body.position.z);
    const speed = mover.player.speed;
    if (speed > 0.3 || mover.player.inputActive || mover.player.hopY > 0.01) idle = 0; else idle += dt;
    msg.pos[0] = body.position.x; msg.pos[1] = body.position.z;
    msg.yaw = body.rotation.y;
    msg.speed = speed;
    msg.h = Math.max(0, body.position.y - gy);
    msg.pose = mover.player.hopY > 0.01 ? 'pounce'
      : speed > 0.3 ? (mover.player.stalking ? 'stalk' : 'follow')
        : idle > NAP_AT ? 'nap' : idle > SIT_AT ? 'requestPet' : idle > GROOM_AT ? 'groom' : 'follow';
    s.remotes.applyState(msg, nowSec());

    // The marks under the two cats.
    markers.place(0, cat.position.x, s.ground.y(cat.position.x, cat.position.z) + ctx.player.perchY + ctx.player.floatY, cat.position.z);
    markers.place(1, body.position.x, gy + mover.player.perchY + mover.player.floatY, body.position.z);

    // The shared camera: on the middle of the two, widened until both fit.
    one.set(cat.position.x, cat.position.y, cat.position.z);
    two.set(body.position.x, body.position.y, body.position.z);
    mid.set((one.x + two.x) / 2, (one.y + two.y) / 2, (one.z + two.z) / 2);
    const base = ctx.player.cameraZoomLevel ?? 1;
    // the widening looks a moment ahead, so cats running apart are not caught by the easing
    soon1.copy(one); soon2.copy(two);
    ahead(soon1, vel.a); ahead(soon2, vel.b);
    const need = neededLevel(catPoints(soon1, soon2), base, mid, heading.yaw, lens);
    level = easeLevel(Math.max(level, base), Math.max(need, base), dt, !!s.reducedMotion);
    state.level = level;
    offsetAt(level, heading.yaw, DEFAULT_PITCH, off);
    const dist = Math.hypot(off.x, off.z);
    const want = cameraPullScale(mid, off, dist, area.colliders, area.bounds);
    pull = want < pull ? pull + (want - pull) * (1 - Math.exp(-20 * dt)) : pull + (want - pull) * (1 - Math.exp(-2 * dt));
    if (s.reducedMotion) pull = want;
    ctx.camera.position.set(mid.x + off.x * pull, Math.max(MIN_CAMERA_Y, mid.y + off.y * pull), mid.z + off.z * pull);
    ctx.camera.lookAt(mid.x, mid.y + CAT_LOOK_Y, mid.z);
    ctx.camera.updateMatrixWorld(true);
    tight = !inBox(catPoints(one, two), ctx.camera);
    state.tight = tight;
  };

  const handle = {
    state,
    hub,
    ctx,
    stop() {
      leave(false);
      cards?.dispose();
      coop.poll = null; coop.pad = null; coop.frame = null;
    },
  };
  if (import.meta.env?.DEV) globalThis.__coop = handle; // the browser pane's handle (development server only; not in a build)
  return handle;
}
