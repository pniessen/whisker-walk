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
import { createSplitControl, orbitFor, zoomFor, turnsHeading } from './padsplit.js';
import { createHeading, neededLevel, catPoints, maxSeparation, easeLevel, offsetAt, inBox, SAFE_W, SAFE_H, CAT_TOP } from './framing.js';
import { createMarkers } from './markers.js';
import { bandFactor, createFollow, edgeMarker, createToastQueue, FOLLOW_STOP } from './rules.js';
import { createCoopHud } from './hud.js';
import { createCards } from './cards.js';
import { createFinds } from './finds.js';
import { createFights } from './fights.js';
import { createRides } from './rides.js';
import { createGroom, createTag, GROOM_CALM_S, GROOM_NEAR } from './verbs.js';
import { bus } from '../events.js';
import { pickSecond, profileOf, createMover, SECOND_ID } from './second.js';
import './words.js';
import { phrase } from '../clanphrases.js';
import { glyphify, plainify, padKind } from '../tv/glyphs.js';
import { getProfile } from '../profile.js';
import { pounceArc, DEFAULT_PITCH, isWalkableAt } from '../player.js';
import { PERSONALITIES } from '../cat/brain.js';
import { applyDeadZone, PAD_BUTTONS } from '../gamepadinput.js';
import { tvToastTiming } from '../tv/toasttime.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import { MIN_CAMERA_Y, cameraPullScale, maxZoomStep, cameraClearFraction, CAM_CEIL_CLEAR, MIN_CAM_DIST, CAVE_VIEW } from '../camzoom.js';
import { underCeiling } from '../caves.js';
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
const TIGHT_FOLLOW = Object.freeze({ far: 1.9, stop: 1.2 }); // follow-when-idle in a tight place (metres)
const TIGHT_PULL = 0.6; // the camera pulled in below this share: the tight-place rule
const TAG_SCALE = 0.75; // cat one's own name tag, as game/owntag.js

const nowSec = () => performance.now() / 1000;
const FIND_TYPES = new Set(['collectible', 'legend', 'treasure', 'hunt']);
const isFind = (e) => FIND_TYPES.has(e?.type) || (e?.type === 'perk' && e.key === 'catch');
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
  let kept = apart;
  if (apart > 0) { // the rubber band: the step away slows from full to 35 % over the last 3 m
    kept = apart * bandFactor(r, limit);
    pos.x -= ux * (apart - kept); pos.z -= uz * (apart - kept);
  }
  const excess = kept - Math.max(limit - r, 0);
  if (excess > 0) { pos.x -= ux * excess; pos.z -= uz * excess; }
}

// The fight's new poses as the states every cat draws (src/fightactions.js WIRE_POSE: a test pins the two alike; that file is not start-up, so it is not imported here).
export const WIRE_POSE = Object.freeze({ arch: 'cross', rearUp: 'swipe', flinch: 'scared', pinned: 'scared', pinning: 'stalk', roll: 'pounce' });

const SETTINGS_KEY = 'whisker-walk-coop'; // couch settings, per device (like the TV switch), never the save
/** Couch settings from this device: { follow, outfit } (follow when idle, on unless switched off; cat two's saved outfit by index, -1 plain, else the first one cat one is not wearing). */
export function readSettings(storage) {
  try { const j = JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}'); return { follow: j.follow !== false, outfit: Number.isInteger(j.outfit) ? j.outfit : undefined }; } catch { return { follow: true, outfit: undefined }; }
}
const SHARED = new Set(['ready', 'pause', 'map']); // the menus either pad may use
const STICK = (pad) => (pad ? applyDeadZone(pad.axes?.[0] || 0, pad.axes?.[1] || 0).mag : 0);

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
    pads: 0, ready: false, couch: false, joined: false, following: [false, false], seats: [null, null], owner: 0, second: null, yaw: 0, level: 0, apart: 0, leash: 0, tight: false,
  };
  const hub = createPadHub();
  const heading = createHeading();
  const splitCtl = createSplitControl(); // S4: shared couch view or a camera each (docs/split-screen-s4.md)
  const doc = ctx.doc ?? (typeof document !== 'undefined' && document.body ? document : null);
  const cards = doc ? createCards({ doc }) : null;
  const view = () => ctx.view?.() ?? { w: doc?.defaultView?.innerWidth ?? globalThis.innerWidth ?? 1920, h: doc?.defaultView?.innerHeight ?? globalThis.innerHeight ?? 1080 };
  const hud = doc ? createCoopHud({ doc, view }) : null;
  const follows = [createFollow(), createFollow()];
  const trotting = [false, false]; // this chunk set that cat's move (so only this chunk clears it)
  const proj = new THREE.Vector3();
  let band = [0, 0]; // seconds each cat has been held by the band or the stop
  const ext = [null, null]; // a line another part of the game put in a prompt slot (handle.prompt)
  let hopHint = [0, 0]; // seconds the hop hint stays up after a cat stopped
  const toasts = createToastQueue({
    life: (t) => tvToastTiming.life(t),
    emit: (it) => {
      const merge = it.key ? { merge: `coop:${it.key}`, mergeText: () => it.both ?? it.text } : undefined;
      if (merge) ctx.toast?.(it.text, 0, merge); else ctx.toast?.(it.text);
      hud?.chipShow(it.slots, [nameOne(), nameTwo()], tvToastTiming.life(it.text), it.text);
    },
  });
  const profile = ctx.profile ?? getProfile;
  const fights = createFights({ ctx }); // one fight at a time; the challenger's pad drives (src/coop/fights.js)
  let fightSaid = false; // the line for the fight on screen was said
  const groom = createGroom(), tagGame = createTag();
  const rides = createRides(); // cat two on the rides of the Fairground (src/coop/rides.js)
  const air = [false, false]; // each cat was in the air last frame (a landing beside the friend is a tag)

  let cur = null; // the session this chunk is working in
  let mover = null; // { player, body }
  let markers = null;
  let tag = null; // the name tag this chunk gave cat one (null: it had its own)
  let pick = null;
  let finds = null; // cat two's finds (src/coop/finds.js), while it is in the walk
  let offBus = null;
  const tally = [0, 0]; // finds this walk by cat one and cat two: said at the walk's end, never saved
  let tallyNames = ['', ''];
  let tallyLeft = 0;
  const own = [null, null]; // a line this chunk puts in a prompt slot (what cat two's X would do)
  let clock = 0;
  let idle = 0; // seconds cat two has stood still
  let hopAt = -Infinity;
  let hopT = 0; // seconds left of cat two's hop: its paws can catch while it is up
  let level = 0; // the camera's eased zoom level while framing both
  let pull = 1;
  let tight = false; // the camera could not frame both cats last frame
  const settings = readSettings(ctx.storage ?? globalThis.localStorage);
  const follow = settings.follow; // the Settings switch for follow-when-idle
  let menuOwner = 0; // the slot whose pad opened the menu: its pad moves the focus and answers every card
  let carry = false; // cat two came along when the walk changed place: it is brought into the next ready place
  let dismissed = false; // "Wait for it" was chosen for the card on screen
  let heldOne = false, heldTwo = false; // a stick held through a turn keeps its world direction
  let padKindNow = 'ps';
  const kinds = ['ps', 'ps']; // each player's own pad picture
  const scr = [{ x: 0, y: 0 }, { x: 0, y: 0 }]; // where each cat's head is on the picture, in pixels
  const lens = { pitch: DEFAULT_PITCH, lookY: CAT_LOOK_Y, fov: 70, aspect: 16 / 9 };
  const prev = { a: new THREE.Vector2(), b: new THREE.Vector2() }; // where each cat stood last frame
  const vel = { a: new THREE.Vector2(), b: new THREE.Vector2() }; // metres a second, for the camera to look ahead
  const mid = new THREE.Vector3();
  const off = new THREE.Vector3();
  const look = new THREE.Vector3(), wish = new THREE.Vector3(); // the camera's look point and wanted spot, for the ground checks
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

  /** The slot whose pad owns the menus now: the one that opened them, or the other when that one's pad is away. */
  function ownerSlot() {
    const ok = (i) => !!state.seats[i] && !state.seats[i].lost;
    return ok(menuOwner) || !ok(1 - menuOwner) ? menuOwner : 1 - menuOwner;
  }

  function leave(toast, keep = false) {
    if (!keep) carry = false;
    if (!state.joined) return;
    const s = cur;
    release();
    if (finds && mover && s) finds.letGo(s, mover.body);
    rides.detach(s);
    fights.detach(); fightSaid = false;
    groom.cancel(); tagGame.reset(); air[0] = air[1] = false; own[0] = null;
    finds = null; offBus?.(); offBus = null; own[1] = null;
    if (mover) { mover.player.setTouchMove(null); mover.player.disable(); }
    mover = null;
    s?.remotes?.remove?.(SECOND_ID);
    ctx.couch?.(false, s);
    markers?.dispose();
    markers = null;
    if (tag) { tag.parent?.remove(tag); tag.material?.map?.dispose(); tag.material?.dispose(); if (s?.cat?.userData?.ownTag === tag) delete s.cat.userData.ownTag; tag = null; }
    hub.release(1);
    state.joined = false;
    splitCtl.reset();
    state.second = null;
    cards?.hideLost();
    if (toast && pick) toasts.push({ slot: 1, one: phrase('coop.left', nameTwo()), found: false });
    pick = null;
  }

  function release() {
    if (heldOne) { ctx.player?.setInputYaw(null); heldOne = false; }
    if (heldTwo) { mover?.player.setInputYaw(null); heldTwo = false; }
  }

  // The walk is over: who found what, once, plain. Never saved.
  function sayTally() {
    const n = tally[0] + tally[1];
    if (n > 0 && cards) { cards.showTally(phrase('coop.tally', tallyNames[0], tally[0], tallyNames[1], tally[1])); tallyLeft = 10; }
    tally[0] = 0; tally[1] = 0;
  }

  function switchSession(next) {
    sayTally();
    fights.detach(); fightSaid = false;
    groom.cancel(); tagGame.reset(); air[0] = air[1] = false; own[0] = null;
    if (state.joined) { // its scene is being thrown away: nothing of the old walk is touched
      rides.detach(null);
      finds = null; offBus?.(); offBus = null; own[1] = null;
      mover?.player.disable();
      mover = null; markers = null; tag = null; pick = null;
      state.joined = false; state.second = null;
      heldOne = heldTwo = false;
    }
    if (!carry) hub.reset(); // a walk that goes on in the next place keeps the pads' seats
    cards?.hideJoin();
    cards?.hideLost();
    cur = next;
    menuOwner = 0;
    dismissed = false;
  }

  // A spot a cat can stand beside the friend at (x, z): clear ground, and on the friend's own level where the ground is raised (never inside a cave's rock or up on a ledge over it).
  const landsAt = (s, from, x, z) => isWalkableAt(s.areaData, x, z) && (s.ground.flat || (s.ground.sameLevel(from.x, from.z, x, z) && s.ground.canStep(from.x, from.z, x, z)));

  /** Where cat two stands beside cat one: to its right when that is clear, else the nearest clear ring spot round it. */
  function spotBeside(s, p) {
    const right = { x: p.x + Math.cos(heading.target) * START_APART, z: p.z - Math.sin(heading.target) * START_APART };
    if (landsAt(s, p, right.x, right.z)) return right;
    for (const radius of [START_APART, 2.4, 3.2, 4.4]) {
      for (let i = 0; i < 8; i++) {
        const a = heading.target + (i * Math.PI) / 4;
        const x = p.x + Math.sin(a) * radius, z = p.z + Math.cos(a) * radius;
        if (landsAt(s, p, x, z)) return { x, z };
      }
    }
    return s.ground.flat ? right : { x: p.x, z: p.z }; // on a perch with no room beside it (a bin top, a stack): on its own spot, never on the level below
  }

  function join() {
    const s = cur;
    const st = ctx.getState?.();
    pick = pickSecond(st, ctx.catalog, settings.outfit);
    const entry = s.remotes.upsert(profileOf(pick));
    ctx.couch?.(true, s); // a slow device draws the shadow-light rung while two cats are out
    entry.local = true; // drawn where it is, with no network's half-second of smoothing
    const yaw0 = ctx.player.viewYaw();
    heading.yaw = yaw0;
    heading.square(yaw0);
    const p = s.cat.position;
    const at = { ...spotBeside(s, p), yaw: s.cat.rotation.y };
    mover = createMover({ ground: s.ground, state: st, pick, at, reducedMotion: !!s.reducedMotion, place: s.areaId });
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
    tallyNames = [nameOne(), nameTwo()];
    if (ctx.progression && ctx.log) {
      finds = createFinds({
        ctx, tally, pick: () => pick,
        drawn: () => cur?.remotes?.list.find((e) => e.playerId === SECOND_ID)?.group,
        said: (slot, label, points) => { hud?.chipShow([slot], [nameOne(), nameTwo()], 2500); if (points > 0) handle.pop(slot, points); },
      });
      // cat one's finds are the walk's own awards: counted here, so the summary says who found what
      offBus = bus.on('discovery', (e) => { if (finds && !finds.busy && isFind(e)) tally[0]++; });
    }
    rides.attach(s);
    fights.attach(s, { drawn: () => cur?.remotes?.list.find((e) => e.playerId === SECOND_ID)?.group, key: () => pick?.key, joined: () => state.joined && !!mover });
    cards?.hideTally(); tallyLeft = 0;
    idle = 0; level = ctx.player.cameraZoomLevel ?? 1; pull = 1;
    prev.a.set(p.x, p.z); prev.b.set(at.x, at.z);
    state.joined = true;
    carry = true;
    state.second = { key: pick.key, name: pick.name };
    toasts.push({ slot: 1, one: phrase('coop.joined', nameTwo()), found: false });
  }

  function turn(dir) {
    const yawNow = heading.yaw;
    if (ctx.player.inputActive && !heldOne) { ctx.player.setInputYaw(yawNow); heldOne = true; }
    if (mover?.player.inputActive && !heldTwo) { mover.player.setInputYaw(yawNow); heldTwo = true; }
    heading.turn(dir);
  }

  function onEvent(ev, engaged, kind) {
    if (ev.type === 'join') join();
    else if (ev.type === 'lost') { if (state.joined) { dismissed = false; if (engaged) ctx.act?.('pause'); } }
    else if (ev.type === 'back') dismissed = false;
    else if (ev.type === 'swap') { if (ev.slot === 1 && kind === 'ready' && state.joined) { hub.swap(); menuOwner = 0; state.seats = hub.seats(); } } // Y on the second pad at the Ready card: the two pads change cats
    else if (ev.type === 'leave') { if (ev.slot === 1 && state.joined) leave(true); } // pad two held Select: cat two waves and steps out; A on that pad brings it back
    else if (ev.type === 'hop') { if (state.joined && engaged) hopFriend(ev.slot); }
    else if (ev.type === 'groom') { if (state.joined && engaged && !fights.on && mover) groom.start(state.apart, calm()); }
    else if (ev.type === 'turn') {
      if (state.joined && engaged && !fights.on) {
        const z = zoomFor(splitCtl.ctl, ev, mover?.player.cameraZoomStep ?? 1, maxZoomStep(cur?.areaId));
        if (z !== null) mover.player.setCameraZoom(z); // split: L1 / R1 on pad two zoom cat two's own camera (pad one's reach the walk's pad code whole)
        else if (turnsHeading(splitCtl.ctl)) turn(ev.dir);
      }
    }
    else if (ev.type === 'start') {
      if (engaged) { menuOwner = ev.slot; if (ev.slot === 1) ctx.act?.('pause'); } // pad one's own Start is the walk's
      else if (ev.slot === ownerSlot() && ctx.canResume?.()) ctx.resume?.(); // the owner pad only: the other pad's Start does nothing in a menu
    }
  }

  // X on cat two's pad: the walk's own finds (src/coop/finds.js), told in its own words.
  function interact() {
    if (!finds || !cur) return;
    const r = finds.interact(cur, mover, mover.body);
    if (r?.kind === 'sniff') ctx.toast?.(phrase(r.found ? 'coop.sniffed' : 'coop.nosniff'));
  }

  function hop() {
    if (mover && cur && rides.jump(cur, mover)) return; // a ride seat in reach: the jump boards it, hops on or gets off
    if (clock < hopAt || !mover) return;
    if (mover.player.canFloat) return; // under the sea A is the kick (setKick), as for cat one: no pounce hop there
    hopAt = clock + HOP_COOLDOWN;
    mover.player.pounce(pounceArc(ctx.getState?.() ?? {}, { reducedMotion: !!cur.reducedMotion }));
    hopT = 0.35;
  }

  // Hop to my friend: the cat lands beside the other one, wherever it stood (the way past a wall).
  function hopFriend(slot) {
    const s = cur;
    if (!s || !mover) return;
    const me = slot === 0 ? s.cat : mover.body;
    const friend = slot === 0 ? mover.body : s.cat;
    if (slot === 1 && rides.busy) return; // on a ride she stays on it
    if (s.traversal?.busy) return; // a crossing or a leap is cat one alone: a hop would land on the plank or in the yard under it
    let spot = null;
    for (const radius of [1.3, 2.2, 3.2, 4.4]) {
      for (let i = 0; i < 8 && !spot; i++) {
        const a = heading.target + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 4) + Math.PI; // behind the friend first, then round
        const x = friend.position.x + Math.sin(a) * radius, z = friend.position.z + Math.cos(a) * radius;
        if (landsAt(s, friend.position, x, z)) spot = { x, z };
      }
      if (spot) break;
    }
    if (!spot && !s.ground.flat && !s.ground.sameLevel(me.position.x, me.position.z, friend.position.x, friend.position.z)) spot = { x: friend.position.x, z: friend.position.z }; // no room on the perch of the friend: on its own spot, same level by being there
    if (!spot) return; // nowhere clear beside the friend: stay put
    me.position.set(spot.x, s.ground.y(spot.x, spot.z), spot.z);
    (slot === 0 ? prev.a : prev.b).set(spot.x, spot.z);
    follows[slot].reset(); trotting[slot] = false;
    markers?.puff(spot.x, me.position.y, spot.z, !!s.reducedMotion);
    ctx.voice?.(1.1);
  }

  /** Trot cat `slot` toward its friend, or give its stick back. */
  const stuck = [{ t: 0, x: 0, z: 0 }, { t: 0, x: 0, z: 0 }]; // a trotting cat that gets nowhere (a cave's wall, a cliff) hops to its friend instead of staying outside
  function trot(slot, on, from, to, stick, dt = 0) {
    const pl = slot === 0 ? ctx.player : mover.player;
    if (on) {
      const k = stuck[slot];
      if (!trotting[slot] || Math.hypot(from.x - k.x, from.z - k.z) > 0.4) { k.x = from.x; k.z = from.z; k.t = 0; }
      else if ((k.t += dt) > 1.5) {
        k.t = 0; pl.setTouchMove(null); trotting[slot] = false;
        const g = cur.ground;
        if (slot === 0 && !g.flat && g.y(to.x, to.z) < g.y(from.x, from.z) - 0.5) follows[0].reset(); // cat one is never called down off a roof or a ledge by its idle trot: only a press of its own hop does that
        else hopFriend(slot);
        return;
      }
      const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz) || 1;
      // the world way to the friend, turned back into the stick's screen space
      const c = Math.cos(heading.yaw), sn = Math.sin(heading.yaw);
      const wx = dx / d, wz = dz / d;
      pl.setTouchMove({ x: (wx * c - wz * sn) * 0.8, z: (wx * sn + wz * c) * 0.8, mag: 0.8 });
      trotting[slot] = true;
    } else if (trotting[slot]) { if (!(stick > 0)) pl.setTouchMove(null); trotting[slot] = false; } // a stick that is pushed already has the cat
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

  /** What is on the screen for the pads: 'walk', the Ready card ('ready'), the pause card ('pause'), the world map ('map'), a place card with a price on it ('buy'), or 'other' (home base, the dressing room, the shops). */
  function menuKind() {
    if (ctx.menuKind) return ctx.menuKind();
    if (ctx.player?.engaged) return 'walk';
    if (typeof doc?.querySelector !== 'function') return 'unknown'; // no page to look at: nothing is shared
    const q = (x) => doc.querySelector(x);
    if (q('#btn-resume')) return cur && !cur.started ? 'ready' : 'pause';
    if (q('[data-sheet="places"]')) return q('.wm-card-buy') ? 'buy' : 'map';
    return 'other';
  }

  // The Ready card's own line about two players, put into the card each frame it is missing (the card is rewritten now and then).
  let readyEl = null, readyHost = null;
  function readyLine(show) {
    const host = show ? (ctx.readyHost ? ctx.readyHost() : doc?.querySelector?.('.pause-card .screen-body')) : null;
    if (!host) { readyEl?.remove?.(); readyEl = null; readyHost = null; return; }
    if (!readyEl || readyEl.isConnected === false || readyHost !== host) {
      readyEl?.remove?.();
      readyEl = doc.createElement('p');
      readyEl.className = 'coop-ready';
      readyEl.setAttribute('role', 'status');
      host.appendChild(readyEl);
      readyHost = host;
    }
    const text = state.joined ? `${phrase('coop.ready.in', nameOne(), nameTwo())} ${phrase('coop.ready.swap')}` : phrase('coop.ready.join');
    if (readyEl.dataset.text !== text) {
      readyEl.dataset.text = text;
      readyEl.innerHTML = glyphify(text, padKindNow);
      readyEl.setAttribute('aria-label', plainify(text, padKindNow));
    }
  }

  // The standing strip of each player's own buttons, in that player's own pad pictures, while two cats walk.
  function hintStrip(show) {
    if (!cards) return;
    if (!show) { cards.showHints(null); return; }
    const t = [phrase('coop.hints.one', nameOne()), phrase('coop.hints.two', nameTwo())];
    cards.showHints(t.map((x, i) => glyphify(x, kinds[i])), t.map((x, i) => plainify(x, kinds[i])));
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
    coop.two = state.joined || carry; // the gates ask: is cat two in this walk, or waiting to come along
    toasts.tick(dt);
    hud?.step(dt);
    if (tallyLeft > 0 && (tallyLeft -= dt) <= 0) cards?.hideTally();
    const s = ctx.getSession?.() ?? null;
    if (s !== cur) switchSession(s);
    const pads = standardPads(ctx.nav);
    state.pads = pads.length;
    state.ready = !!s && !s.net && coopReady(s.areaId);
    const prof = profile();
    // A phone or a tablet shows couch play only when couch play was asked for (the Settings switch, or ?coop=1) and a second pad is there (or already in the walk); ?coop=0 and the switch turn it off.
    const wanted = ctx.enabled ? !!ctx.enabled() : true;
    state.couch = wanted && (prof === 'tv' || prof === 'laptop' || (!!ctx.enabled && (pads.length >= 2 || !!state.seats[1])));
    coop.pad = null;
    if (!ctx.player) return;
    const live = state.couch && state.ready;
    if (!live) {
      if (state.joined) leave(false, state.couch); // a place that is not ready yet: cat two waits, and is brought back to the next ready one
      if (!state.couch) carry = false;
      if (!carry) hub.reset();
      cards?.hideLost();
      cards?.showHints(null);
      hud?.hideAll();
      joinPill(pads, !!ctx.player.engaged, state.couch);
      readyLine(false);
      return;
    }
    const engaged = !!ctx.player.engaged;
    const kind = menuKind();
    const ready = kind === 'ready';
    if (engaged) menuOwner = 0;
    const fightOn = state.joined && fights.on; // a fight sheet is up: the challenger's pad plays it, the other cat sits
    const playing = engaged && !s.cameraMode && !fightOn;
    const { events, two: pad2, pressed } = hub.step(pads, { joinOpen: (engaged || ready) && !state.joined && !!hub.seats()[0] && !hub.seats()[0].lost, engaged: playing, dt });
    // Safe menus (the Ready card, the pause card, the map) answer to whichever pad was used last; every other screen (home, dressing room, shops, a place with a price) is pad one's, so the two cannot fight over a purchase.
    if (!engaged && kind !== 'unknown') {
      const seated = hub.seats();
      if (SHARED.has(kind)) { for (const i of [1, 0]) if (pressed[i] && seated[i] && !seated[i].lost) menuOwner = i; }
      else menuOwner = 0;
    }
    for (const ev of events) onEvent(ev, engaged, kind);
    state.seats = hub.seats();
    if (carry && !state.joined && playing) { // the walk moved to a new place: cat two arrives beside cat one
      if (!state.seats[1]) carry = false;
      else if (!state.seats[1].lost && state.seats[0] && !state.seats[0].lost) join();
    }
    if (state.joined && mover) {
      const sc = splitCtl.step(coop.splitRes);
      if (sc.changed) {
        if (sc.ctl === 'split') mover.player.setCameraZoom(ctx.player.cameraZoomStep ?? 1, { instant: true }); // cat two's camera starts at cat one's zoom
        else { // merged: the shared heading starts from where cat one's camera was and eases to a quarter; held sticks keep their world direction through it
          if (ctx.player.inputActive && !heldOne) { ctx.player.setInputYaw(ctx.player.viewYaw()); heldOne = true; }
          if (mover.player.inputActive && !heldTwo) { mover.player.setInputYaw(mover.player.viewYaw()); heldTwo = true; }
          heading.yaw = ctx.player.viewYaw(); heading.square(heading.yaw);
        }
      }
      if (pad2) {
        const orb = orbitFor(splitCtl.ctl, pad2);
        if (orb) mover.player.addOrbit(orb.dx, orb.dy);
        if (pad2.move !== undefined) mover.player.setTouchMove(pad2.move);
        if (pad2.kick !== undefined) mover.player.setKick(pad2.kick); // the Reef's kick: A held (does nothing where nothing floats)
        for (const a of pad2.actions) {
          if ((a === 'interact' || a === 'meow') && fights.answer(a)) continue; // the pill is cat two's: its Square and Circle answer it
          if (a === 'pounce') hop();
          else if (a === 'meow') { ctx.voice?.(1.26); finds?.meow(cur, mover.body); }
          else if (a === 'interact') interact();
          else if (a === 'camera') ctx.act?.('camera');
        }
      }
      heading.step(dt, !!s.reducedMotion);
      if (splitCtl.ctl !== 'split') { // in the split mapping each camera keeps its own yaw (the orbit)
        ctx.player.setViewYaw(heading.yaw);
        mover.player.setViewYaw(heading.yaw);
      }
      if (heldOne && !ctx.player.inputActive) { ctx.player.setInputYaw(null); heldOne = false; }
      if (heldTwo && !mover.player.inputActive) { mover.player.setInputYaw(null); heldTwo = false; }
      state.yaw = heading.target;
      // Follow when idle: a cat whose stick has rested for 3 s trots to a friend farther than 8 m (any stick ends it).
      const on = follow && playing && !s.cameraMode && !rides.busy && !s.fair?.riding && !s.fair?.hopping && !s.traversal?.busy; // a cat on a ride or a crossing, or its friend, is not called away: cat two waits at the start
      const sticks = [STICK(hub.padOf(0, pads)), STICK(hub.padOf(1, pads))];
      const seat0 = state.seats[0] && !state.seats[0].lost;
      const reach = tight ? TIGHT_FOLLOW : null; // a tight place holds the pair as close as they stand: the idle cat comes along at once, or the walking one is pinned
      const lv = !s.ground.flat && !s.ground.sameLevel(s.cat.position.x, s.cat.position.z, mover.body.position.x, mover.body.position.z); // a friend on another floor (a stair round a tower, a ledge above) is far however close it stands on the map
      const apart = lv ? Math.max(state.apart, 99) : state.apart;
      const goA = follows[0].step(dt, { stick: sticks[0], apart, on: on && seat0, ...reach });
      const goB = follows[1].step(dt, { stick: sticks[1], apart, on, ...reach });
      if (goA || trotting[0]) trot(0, goA, s.cat.position, mover.body.position, sticks[0], dt);
      if (goB || trotting[1]) trot(1, goB, mover.body.position, s.cat.position, sticks[1], dt);
      state.following = [goA, goB];
    } else { state.following = [false, false]; }
    hud?.setOn(state.joined);
    // A slot's pad, for cat one's walk code; the other pad's when it paused and holds the card.
    const p0 = hub.padOf(0, pads);
    const p1 = hub.padOf(1, pads);
    const live2 = !!ctx.player.engaged; // a pause pressed just now counts
    if (!live2) { hud?.prompt(0, null); hud?.prompt(1, null); } // the per-cat prompts belong to the walk: not drawn over the Pause card
    const own0 = ownerSlot();
    state.owner = own0;
    const owner = !live2 && own0 === 1 && p1 ? p1 : p0;
    const walkPad = owner ? padForWalk(owner, live2 && state.joined, splitCtl.ctl === 'split') : null;
    coop.pad = state.joined ? fights.padFor(p0, p1, walkPad) : walkPad; // while a fight sheet is up the challenger's pad is the one read
    if (ready && state.joined && coop.pad) coop.pad = { ...coop.pad, buttons: (coop.pad.buttons ?? []).map((b, i) => (i === PAD_BUTTONS.Y ? false : b)) }; // Y swaps the cats here: it is not also a button of the card
    if (owner) padKindNow = padKind(owner.id);
    if (p0) kinds[0] = padKind(p0.id);
    if (p1) kinds[1] = padKind(p1.id);
    lostCard();
    hintStrip(live2 && state.joined && !fights.on);
    joinPill(pads, live2 || ready, true); // in the walk, and on the Ready card before it starts
    readyLine(ready && pads.length > 0);
  };

  // Both cats have stood still a moment: the time for a groom.
  const calm = () => idle >= GROOM_CALM_S && (cur?.idleTime ?? 0) >= GROOM_CALM_S && !ctx.player.inputActive && !mover?.player.inputActive;

  // Grooming and tag, every frame the second cat is in the walk (src/coop/verbs.js).
  function verbs(s, dt) {
    const names = [nameOne(), nameTwo()];
    tagGame.tick(dt);
    const hopping = [ctx.player.hopY > 0.01, mover.player.hopY > 0.01];
    for (let i = 0; i < 2; i++) {
      if (air[i] && !hopping[i]) { // landed: beside the friend is a tag
        const r = tagGame.land(i, state.apart);
        if (r === 'start') toasts.push({ slot: i, one: phrase('coop.tagstart', names[i], names[1 - i]), found: false });
        else if (r === 'done') {
          const line = phrase('coop.tagdone', names[0], names[1]);
          ctx.log?.awardOnce('tag', 'tag-couch', line);
          s.fx?.burst?.(s.cat.position, 0xffd166, 10);
          toasts.push({ slot: i, one: line, found: false });
        }
      }
      air[i] = hopping[i];
    }
    if (fights.on) groom.cancel();
    if (groom.active) { // both cats groom: the walk's own idle ladder, held at its groom rung
      idle = GROOM_AT + 0.2;
      s.idleTime = GROOM_AT + 0.2;
    }
    const g = groom.step(dt, { apart: state.apart, moving: ctx.player.inputActive || mover.player.inputActive || hopping[0] || hopping[1] });
    if (g.done) {
      const line = phrase('coop.groomed', names[0], names[1]);
      ctx.log?.awardOnce('groom', 'groom-couch', line);
      s.fx?.burst?.(s.cat.position, 0xd8b4e2, 8);
      toasts.push({ slot: 0, one: line, found: false });
    }
  }

  // The fight sheet came up: one line says who fights and who cheers.
  function announceFight(s) {
    if (!fights.on) { fightSaid = false; return; }
    if (fightSaid) return;
    fightSaid = true;
    const f = fights.fighter, names = [nameOne(), nameTwo()];
    toasts.push({ slot: f, one: phrase('coop.fightstart', names[f], names[1 - f]), found: false });
  }

  // After the walk's own interactions: what cat two reaches, finds and smells, and the finds' prompt.
  coop.late = (dt) => {
    const s = cur;
    if (!state.joined || !mover || !s) return;
    const body = mover.body;
    announceFight(s);
    rides.look(dt, nowSec(), s, s.remotes.list.find((e) => e.playerId === SECOND_ID)?.group);
    if (fights.twoFights) { // the fight wrote cat two's picture: its body follows, and cat one sits and cheers
      const g = s.remotes.list.find((e) => e.playerId === SECOND_ID)?.group;
      if (g) { g.position.x = fights.spot.x; g.position.z = fights.spot.z; g.rotation.y = fights.spot.yaw; body.position.x = g.position.x; body.position.z = g.position.z; body.rotation.y = g.rotation.y; }
      s.idleTime = SIT_AT + 0.5;
    }
    const near = !fights.showing && !groom.active && state.apart <= GROOM_NEAR && calm();
    own[0] = near && !s.prompt ? phrase('coop.groomhint', nameTwo()) : null; // cat one's own prompt wins
    if (!finds) { own[1] = near ? phrase('coop.groomhint', nameOne()) : null; return; }
    hopT = Math.max(0, hopT - dt);
    const reveal = (PERSONALITIES[pick?.breed]?.special === 'keenNose' ? 14 : 7);
    for (const [id, m] of s.collectibleMeshes) { // a find lying near cat two shows, as it does near cat one
      if (m.visible) continue;
      const c = s.areaData.collectibles.find((x) => x.id === id);
      if (c && Math.hypot(c.x - body.position.x, c.z - body.position.z) < reveal) m.visible = true;
    }
    finds.frame(dt, s, mover, body, hopT > 0 || mover.player.hopY > 0.01);
    const r = finds.reach(s, mover, body);
    const text = !r ? null : r.kind === 'collect' ? phrase('coop.pick', r.label) : r.kind === 'carry' ? phrase('coop.carry', r.label) : r.kind === 'drop' ? phrase('coop.drop', r.label) : r.kind === 'dig' ? phrase('coop.dig') : r.kind === 'farm' ? r.label : null;
    own[1] = text ?? (near ? phrase('coop.groomhint', nameOne()) : null);
  };

  // After cat one's player.update: cat two's step, the leash, the picture of both.
  coop.secondPos = () => (state.joined && mover ? mover.body.position : null); // where cat two stands (the split HUD's second corner map)
  coop.second = () => (state.joined && mover ? mover.cam : null); // cat two's own follow camera (the split view draws through it)
  coop.frame = (dt) => {
    const s = cur;
    if (!state.joined || !mover || !s) return;
    const cat = s.cat;
    const area = s.areaData;
    const fightAny = fights.on, fightTwo = fights.twoFights;
    if (fightTwo) ctx.player.halt?.(); // cat one watches: the fight is cat two's
    else if (!rides.frame(dt, s, mover)) mover.player.update(dt, area.colliders, area.bounds, area.waters, s.fair?.show?.bumps ?? s.critters?.bumps);
    const body = mover.body;
    lens.fov = ctx.camera.fov;
    lens.aspect = ctx.camera.aspect;

    // The leash: a cat walking away from its friend stops at the widest frame. Each cat is held
    // against where the other STARTED the frame, so neither is ever pulled along by the other: the
    // one that is stopped slides round the circle, the other walks on as it pleases.
    // Where a building has pulled the camera in, the widest frame is not there to be had: the leash
    // then holds the cats no farther apart than they are (the plan's tight-place rule, in its first form).
    const top = maxZoomStep(s.areaId); // the Den stops at the default step: the leash is the room's own
    const wide = maxSeparation(lens, top) * LEASH_MARGIN;
    const splitNow = ctx.split?.(); // ?split=1 (docs/split-screen-s1.md): null = flag off; true while the split picture is (even partly) up, so each cat has its own camera and the shared picture and its leash are off
    const split = !!splitNow;
    const limit = split ? 1e6 : tight ? Math.min(wide, Math.max(state.apart, 2)) : wide;
    state.leash = limit;
    const ride = rides.busy || s.fair?.riding || s.fair?.hopping || s.traversal?.busy; // a ride runs or cat one is on a crossing: the ride or the move carries the cat, so no leash holds it
    if (!fightAny && !ride) { // a fight puts the fighter where it stands and the other cat sits: no leash then
      stop(cat.position, prev.a, prev.b, limit);
      stop(body.position, prev.b, prev.a, limit);
    }
    vel.a.set((cat.position.x - prev.a.x) / Math.max(dt, 1e-3), (cat.position.z - prev.a.y) / Math.max(dt, 1e-3));
    vel.b.set((body.position.x - prev.b.x) / Math.max(dt, 1e-3), (body.position.z - prev.b.y) / Math.max(dt, 1e-3));
    prev.a.set(cat.position.x, cat.position.z);
    prev.b.set(body.position.x, body.position.z);
    state.apart = Math.hypot(cat.position.x - body.position.x, cat.position.z - body.position.z);
    if (splitNow !== null && splitNow !== undefined) { // the inputs of the dynamic split rule (src/coop/splitrule.js), read by splitview.js after this frame
      const lv = !s.ground.flat && !s.ground.sameLevel(cat.position.x, cat.position.z, body.position.x, body.position.z);
      coop.splitInfo = { gap: state.apart, maxSep: maxSeparation(lens, top), top: level >= top - 0.05, sameLevel: !lv };
    }
    verbs(s, dt);
    // Pushing on at the stretch of the band: this cat's own hint says how to hop to the friend.
    const pushing = [ctx.player.inputActive && !trotting[0], mover.player.inputActive && !trotting[1]];
    for (let i = 0; i < 2; i++) {
      if (state.apart > limit - 3 && pushing[i]) hopHint[i] = 1.2; else hopHint[i] = Math.max(0, hopHint[i] - dt);
      const text = hopHint[i] > 0 ? phrase('coop.hophint') : state.following[i] ? phrase('coop.following', i ? nameTwo() : nameOne()) : (ext[i] ?? own[i]);
      if (text) hud?.prompt(i, glyphify(text, kinds[i]), plainify(text, kinds[i])); else hud?.prompt(i, null);
    }
    markers?.step(dt);

    // Cat two, drawn: where its walker stands, how it stands.
    const gy = s.ground.y(body.position.x, body.position.z);
    const speed = mover.player.speed;
    if (fightAny && !fightTwo) idle = SIT_AT + 0.5; // cat two sits and cheers
    else if (rides.busy || speed > 0.3 || mover.player.inputActive || mover.player.hopY > 0.01) idle = 0; else idle += dt;
    msg.pos[0] = body.position.x; msg.pos[1] = body.position.z;
    msg.yaw = body.rotation.y;
    msg.speed = speed;
    msg.h = Math.max(0, body.position.y - gy) + mover.player.floatY; // the Reef's float rides the same height, as it does on the wire
    msg.seat = rides.seat?.rideId === 'slide' ? null : rides.seat?.id ?? null; // the slide is slid on the own clock of each device: drawn where she is
    msg.pose = rides.busy ? 'perch' : mover.player.hopY > 0.01 ? 'pounce'
      : speed > 0.3 ? (mover.player.stalking ? 'stalk' : 'follow')
        : idle > NAP_AT ? 'nap' : idle > SIT_AT ? 'requestPet' : idle > GROOM_AT ? 'groom' : 'follow';
    if (fightTwo) { // the fight's pose, lift and pace, on cat two's picture
      const st = fights.stage;
      msg.pose = WIRE_POSE[st?.fightPose] ?? (st?.fightPose || 'follow'); msg.h = st?.fightLift ?? 0; msg.speed = st?.fightGait ?? 0;
    }
    s.remotes.applyState(msg, nowSec());

    // The marks under the two cats.
    markers.place(0, cat.position.x, s.ground.y(cat.position.x, cat.position.z) + ctx.player.perchY + ctx.player.floatY, cat.position.z);
    markers.place(1, body.position.x, gy + mover.player.perchY + mover.player.floatY, body.position.z);

    // The shared camera: on the middle of the two, widened until both fit.
    one.set(cat.position.x, cat.position.y, cat.position.z);
    two.set(body.position.x, body.position.y + mover.player.floatY, body.position.z); // cat one's own y already holds her float
    mid.set((one.x + two.x) / 2, (one.y + two.y) / 2, (one.z + two.z) / 2);
    if (!split) {
      const base = ctx.player.cameraZoomLevel ?? 1;
      // the widening looks a moment ahead, so cats running apart are not caught by the easing
      soon1.copy(one); soon2.copy(two);
      ahead(soon1, vel.a); ahead(soon2, vel.b);
      const need = neededLevel(catPoints(soon1, soon2), Math.min(base, top), mid, heading.yaw, lens, top);
      level = Math.min(top, easeLevel(Math.max(level, Math.min(base, top)), Math.max(need, Math.min(base, top)), dt, !!s.reducedMotion));
      state.level = level;
      offsetAt(level, heading.yaw, DEFAULT_PITCH, off);
      const dist = Math.hypot(off.x, off.z);
      let want = cameraPullScale(mid, off, dist, area.colliders, area.bounds);
      const gnd = area.cameraGround ?? s.ground;
      if (!gnd.flat) { // raised ground (the Gorge, the Old House): the camera keeps out of rock and under ceilings, and comes in close under a cave's roof, as cat one's own does (M5)
        look.set(mid.x, mid.y + CAT_LOOK_Y, mid.z);
        wish.set(mid.x + off.x, Math.max(MIN_CAMERA_Y, mid.y + off.y), mid.z + off.z);
        want = Math.min(want, cameraClearFraction(look, wish, gnd));
        if (underCeiling(s.ground, cat.position.x, cat.position.y, cat.position.z) || underCeiling(s.ground, body.position.x, body.position.y, body.position.z)) want = Math.min(want, CAVE_VIEW.dist / dist);
        want = Math.max(want, MIN_CAM_DIST / Math.hypot(off.x, off.y, off.z));
      }
      pull = want < pull ? pull + (want - pull) * (1 - Math.exp(-20 * dt)) : pull + (want - pull) * (1 - Math.exp(-2 * dt));
      if (s.reducedMotion) pull = want;
      ctx.camera.position.set(mid.x + off.x * pull, Math.max(MIN_CAMERA_Y, mid.y + off.y * pull), mid.z + off.z * pull);
      if (!gnd.flat) {
        const cp = ctx.camera.position;
        cp.y = Math.min(Math.max(cp.y, gnd.y(cp.x, cp.z) + MIN_CAMERA_Y), gnd.ceil(cp.x, cp.z) - CAM_CEIL_CLEAR);
      }
      ctx.camera.lookAt(mid.x, mid.y + CAT_LOOK_Y, mid.z);
      ctx.camera.updateMatrixWorld(true);
      tight = pull < TIGHT_PULL || !inBox(catPoints(one, two), ctx.camera); // a building has pulled the camera in, or a cat is out of the safe box
      state.tight = tight;
      state.pull = pull;
    }
    if (hud && !split) {
      const { w, h } = view();
      const holds = hub.holds();
      const pts = [one, two];
      for (let i = 0; i < 2; i++) {
        proj.set(pts[i].x, pts[i].y + CAT_TOP, pts[i].z).project(ctx.camera);
        scr[i].x = (proj.x + 1) / 2 * w; scr[i].y = (1 - proj.y) / 2 * h;
        const outSafe = Math.abs(proj.x) > SAFE_W || Math.abs(proj.y) > SAFE_H || !(proj.z <= 1);
        hud.edge(i, edgeMarker(proj, w, h, undefined, pull < TIGHT_PULL && outSafe), phrase('coop.edge', i ? nameTwo() : nameOne()));
        hud.ring(i, holds[i], scr[i].x, scr[i].y);
      }
    }
  };

  const handle = {
    state,
    hub,
    ctx,
    fights,
    get mover() { return mover; }, // the walker of cat two (a test places it)
    /** A find by cat `slot` (0 or 1): a toast with the finder's chip; two cats finding the same `key` within 1.5 s fold into "You both found". */
    found(slot, what, key = null) {
      toasts.push({ key, slot, one: phrase('coop.found', slot ? nameTwo() : nameOne(), what), both: phrase('coop.foundboth', what) });
    },
    /** The "+N" over cat `slot`'s head, in the world. */
    pop(slot, n) { hud?.pop(n, slot, scr[slot].x, scr[slot].y - 24, !!cur?.reducedMotion); },
    /** A line in cat `slot`'s prompt slot (words with ⟦tokens⟧); null clears it. */
    prompt(slot, text) { ext[slot] = text || null; },
    stop() {
      leave(false);
      cards?.dispose();
      hud?.dispose();
      coop.poll = null; coop.two = false; coop.pad = null; coop.frame = null; coop.late = null; delete coop.second; delete coop.secondPos; delete coop.splitInfo; delete coop.splitRes;
    },
  };
  if (import.meta.env?.DEV) globalThis.__coop = handle; // the browser pane's handle (development server only; not in a build)
  return handle;
}
