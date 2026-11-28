// Crash-hunt rig: a whole walk (createWalkLifecycle over the real place, with a real headless player) driven by main.js's walkFrame order,
// minus the parts that need a browser (renderer, HUD DOM, coop, perf readout). Seeded fuzz drivers press the pad / keyboard actions in random
// order, teleport the cat beside random solids and points of interest, and feed dt spikes. Used by crashhunt.moon.test.js and crashhunt.reef.test.js.
import * as THREE from 'three';
import { stubCanvasDocument } from './canvas.js';
import { mulberry32 } from '../../src/rng.js';

stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { walkHarness, areas, fakeEl, anything } = await import('./walkharness.js');
const { createPlayer } = await import('../../src/player.js');
const { createInteractions } = await import('../../src/game/interactions.js');
const { createAvatarUpdater } = await import('../../src/game/avatar.js');
const { CATALOG } = await import('../../src/progression.js');
const { PERSONALITIES } = await import('../../src/cat/brain.js');
const { COATS, MARKS, EYES, PATTERNS, FURS, SCARS, CUSTOM_PERSONALITIES } = await import('../../src/customcats.js');

const { fakeDoc } = await import('./couchrig.js');
const { coop } = await import('../../src/coopseam.js');
const { start: startCoop } = await import('../../src/coop/index.js');
const { createGamepad } = await import('../../src/gamepad.js');
const { PAD_BUTTONS } = await import('../../src/gamepadinput.js');
const { createDiscoveryLog } = await import('../../src/discoveries.js');
export { PAD_BUTTONS };
const PAD_ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
export const fakePad = (index, down = [], axes = [0, 0, 0, 0]) => ({ index, connected: true, mapping: 'standard', id: PAD_ID, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });

export const BREEDS = Object.keys(PERSONALITIES); // every preset, hagrid included
export { areas };

const el = () => Object.assign(fakeEl(), { append() {}, prepend() {}, replaceChildren() {}, getBoundingClientRect: () => ({ width: 1, height: 1, left: 0, top: 0 }), dataset: {} });
export function installDocument() {
  globalThis.document = { body: el(), createElement: el, getElementById: () => null, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
}

const SLOTS = ['collar', 'head', 'face', 'neck', 'body', 'back', 'feet'];
const bySlot = {};
for (const [id, a] of Object.entries(CATALOG.accessories)) (bySlot[a.slot] ??= []).push(id);
export const ACCESSORIES = bySlot;

const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length)];
export function randomLook(rnd) {
  return {
    coat: pickOf(rnd, Object.keys(COATS)), marks: pickOf(rnd, Object.keys(MARKS)), eyes: pickOf(rnd, Object.keys(EYES)),
    pattern: pickOf(rnd, PATTERNS)[0], fur: pickOf(rnd, FURS)[0], size: 0.85 + Math.floor(rnd() * 7) * 0.05,
    ...(rnd() < 0.4 ? { scar: pickOf(rnd, SCARS.filter((s) => s[0] !== 'none'))[0] } : {}),
  };
}
// a random worn set: each slot is empty or any catalogue piece for it (shop, prize and found outfits alike)
export function randomWear(rnd, density = 0.6) {
  const wear = {};
  for (const slot of SLOTS) wear[slot] = rnd() < density && bySlot[slot]?.length ? pickOf(rnd, bySlot[slot]) : null;
  return wear;
}

// who: { breed } or { custom: look }
export function makeWalk({ areaId, who, wear = {}, reducedMotion = false, tier = 'high', seed = 1, state = null }) {
  installDocument();
  const camera = new THREE.PerspectiveCamera();
  const player = createPlayer(camera, null, { headless: true });
  const save = (p) => {
    p.setTutorialFirst('done');
    p.state.walks.park = 2;
    for (const slot of SLOTS) {
      p.state.equipped[slot] = wear[slot] ?? null;
      if (wear[slot] && !p.state.unlocked.accessories.includes(wear[slot])) p.state.unlocked.accessories.push(wear[slot]);
    }
    if (who.custom) {
      const personality = Object.keys(CUSTOM_PERSONALITIES)[seed % 6];
      p.state.customCats = [{ id: 'mine1', name: 'Crash', personality, look: who.custom }];
      p.state.equipped.custom = 'mine1';
    } else {
      p.state.equipped.cat = who.breed;
      if (!p.state.unlocked.cats.includes(who.breed)) p.state.unlocked.cats.push(who.breed);
    }
    // a late-game save: the Reef's and Moon's own gates are open and every swim / float skill is owned
    p.state.unlocked.areas.push(areaId);
    p.state.walks[areaId] = 3;
    if (state) state(p.state);
  };
  const settingsValues = { reducedMotion, ...(tier === 'low' ? { quality: 'low' } : {}) };
  const h = walkHarness({ save, player, settingsValues });
  h.progression.state.settings = h.progression.state.settings ?? {};
  h.w.startWalk({ areaOverride: areaId });
  const session = h.getSession();
  if (!session) throw new Error('no session');
  return { ...h, session, player, camera, areaId };
}

const hud = anything({ toast() {} });
// Couch play: the real coop chunk (cat two, the pad hub, the gamepad glue) wired to the walk as main.js wires it: coop.poll and the gamepad poll
// at the top of the frame, coop.frame after player.update, coop.late after the avatar. Two fake DualSense pads; pads[] is what a fuzz step drives.
export function makeCouch(walk) {
  const { session: s, player, progression, camera } = walk;
  const pads = [];
  const toasts = [];
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const cdoc = fakeDoc();
  const ctx = {
    storage: { getItem: () => JSON.stringify({ follow: true }) },
    nav: { getGamepads: () => pads }, getSession: () => s, player, camera, doc: cdoc, profile: () => 'tv',
    getState: () => progression.state, catalog: CATALOG, progression, log, audio: {}, toast: (m) => toasts.push(m),
    act: (n) => { if (n === 'pause') player.setTouchEngaged(false); },
    voice: () => {}, resume: () => player.setTouchEngaged(true), canResume: () => true,
  };
  const h = startCoop(ctx);
  const g = createGamepad({
    win: { addEventListener() {}, removeEventListener() {} }, nav: { getGamepads: () => pads }, doc: null,
    menuNav: { enter() {}, step() {}, alt() {}, press() {}, scroll() {}, settle() {} },
    getEngaged: () => player.engaged, toast() {}, isFighting: () => false,
    onMove: (v) => player.setTouchMove(v), onOrbit: (dx, dy) => player.addOrbit(dx, dy), onKick: (v) => player.setKick(v),
    onAction: (n) => { if (n === 'pause') player.setTouchEngaged(false); else walk.onPadAction?.(n); },
    onResume: () => player.setTouchEngaged(true), canResume: () => true,
  });
  const set = (...list) => { pads.length = 0; pads.push(...list); };
  const poll = (dt) => { coop.poll?.(dt); g.poll(dt, coop.pad); };
  const join = () => {
    for (const [a, b] of [[[PAD_BUTTONS.X], []], [[], []], [[], [PAD_BUTTONS.A]], [[], []]]) { set(fakePad(0, a), fakePad(1, b)); for (let i = 0; i < 2; i++) poll(1 / 60); }
  };
  return { pads, set, poll, join, toasts, h, stop() { try { h.stop?.(); } catch { /* */ } coop.poll = null; coop.two = false; coop.pad = null; coop.frame = null; coop.late = null; } };
}

export function makeFrameRunner(walk, rnd, { couch = null } = {}) {
  const { session: s, player, progression } = walk;
  const settings = { get: () => null };
  const log = anything();
  const audio = anything();
  const stubs = { petNameFor: () => '', completeBoop: () => {}, completeTag: () => {}, noteBat: () => {} };
  const inter = createInteractions({
    MP: false, pid: 'me', getCloud: () => null, getPsecret: () => null, getSession: () => s, getIsTouch: () => false,
    player, progression, log, hud, audio, catVoice: () => {}, snapPhoto: () => {}, petNameFor: stubs.petNameFor, completeBoop: stubs.completeBoop,
  });
  const av = createAvatarUpdater({ player, progression, settings, log, hud, audio, petNameFor: stubs.petNameFor, completeTag: stubs.completeTag, noteBat: stubs.noteBat });
  const moveCtx = { cat: null, session: null };
  let t = 0;
  const call = (o, k, ...a) => (o && typeof o[k] === 'function' ? o[k](...a) : undefined);
  // main.js walkFrame's order (the part inside `if (player.engaged)`), every call optional-chained as main's own are not: a missing hook in the
  // real walk would throw, so only hooks the real walk also guards with ?. are tolerated missing here (checked by the test: session.fair etc. exist)
  function frame(dtRaw) {
    const dt = dtRaw; // the caller applies main's Math.min(delta, 0.05) cap, or deliberately does not
    t += dt;
    const cat = s.cat;
    moveCtx.cat = cat; moveCtx.session = s;
    if (couch) couch.poll(dt);
    s.traversal.update(dt, t, moveCtx);
    player.update(dt, s.areaData.colliders, s.areaData.bounds, s.areaData.waters, s.fair?.show?.bumps ?? s.critters?.bumps);
    coop.frame?.(dt);
    if (s.slowmoTime > 0) s.slowmoTime -= dt;
    const wdt = s.slowmoTime > 0 ? dt * 0.35 : dt;
    s.critters.update(wdt, t, cat.position, cat.position, cat);
    s.strayCats.update(wdt, t, cat.position, { stalking: player.stalking, catSpeed: player.speed, toy: s.toy });
    s.clanCats.update(wdt, t, cat.position);
    s.birthday?.update(wdt, t, cat.position);
    s.intruders.update(dt, cat.position);
    s.toy.update(dt, s.areaData.bounds);
    s.weather.update(dt, walk.camera.position, walk.camera);
    s.areaLife.update(dt, t, cat.position, walk.camera, s);
    s.secrets.update(dt, t, cat.position, player.speed);
    s.goldMice.update(t);
    s.rival.update(dt, t, cat.position, cat);
    s.dog.update(dt, cat.position, cat, { stalking: player.stalking });
    s.farm.update(dt, t, { cat, player, session: s });
    s.fair.update(dt, t, { cat, player, session: s });
    s.market?.update(dt, t, { cat, player, session: s });
    s.clanFight.update(dt, s);
    s.stripTiles?.update(dt, cat.position.x, cat.position.z);
    s.rustle?.update(dt, cat.position);
    const floatLift = +player.floatY || 0;
    const pawsY = s.ground.flat ? player.perchY + floatLift : s.ground.y(cat.position.x, cat.position.z) + player.perchY + floatLift;
    s.goldMice.checkFind(cat.position, pawsY);
    s.find.update(dt, t, { x: cat.position.x, z: cat.position.z, pawsY, remotes: s.remotes.list, busy: false });
    s.kittenEnc.update(dt, cat.position);
    s.race.update(dt, cat.position, walk.camera);
    s.tippables.update(dt);
    s.knockables.update(dt);
    s.carry.items.update(dt);
    s.scent.update(dt);
    s.fx.update(dt, walk.camera);
    s.skyLife.update(dt);
    s.water.update(dt);
    s.waterDress.update(dt);
    s.shadows.update(s.ground.y(player.position.x, player.position.z), dt);
    s.wind.update(t, 1);
    s.grass.update(t, 1);
    s.paws.update(dt, { x: cat.position.x, z: cat.position.z, grounded: !s.perched && player.perchY === 0 && !(player.hopY > 0) && !player.inWater });
    s.balloons.update(dt, t, { x: cat.position.x, y: cat.position.y, z: cat.position.z, yaw: cat.rotation.y, hidden: player.inWater || !!s.fair?.riding });
    s.clouds.update(t);
    s.ambient.update(t, 1);
    s.remotes.update(dt, t, s.areaData.waters, s.fair);
    s.splash.track(player.waterState, cat.position.x, cat.position.z, cat.rotation.y, player.speed, cat.scale.y, dt, player.hopY);
    s.fish.update(dt);
    s.splash.update(dt);
    s.ghosts.update(dt, t);
    s.denCats.update(dt, t, cat.position);
    s.decals.update();
    av.updateAvatar(s, dt, t);
    s.fair.late(dt, t, { cat, player, session: s });
    s.traversal.late(dt, t, moveCtx);
    coop.late?.(dt);
    inter.updateInteractions(s);
    av.updateMoments(s, dt);
    // positions stay finite
    const p = cat.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) throw new Error(`cat position not finite: ${p.x},${p.y},${p.z}`);
    const c = walk.camera.position;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) throw new Error(`camera position not finite: ${c.x},${c.y},${c.z}`);
    for (const k of ['perchY', 'floatY']) if (player[k] !== undefined && !Number.isFinite(player[k])) throw new Error(`player.${k} not finite: ${player[k]}`);
  }
  return { frame, inter, get t() { return t; } };
}

// the actions, as the pad / keyboard / touch buttons reach them
export const ACTIONS = ['interact', 'interact', 'interact', 'pounce', 'pounce', 'meow', 'camera', 'pause', 'resume', 'kickOn', 'kickOff', 'stick', 'stick', 'stickOff', 'orbit', 'tele', 'tele', 'teleSpot', 'noop'];

export function dtSpike(rnd) {
  const r = rnd();
  if (r < 0.04) return 0;
  if (r < 0.1) return 0.5 + rnd() * 4.5; // a hidden tab coming back
  if (r < 0.2) return 0.05;
  if (r < 0.25) return 1e-6;
  return (0.004 + rnd() * 0.04); // 250 fps down to 24 fps
}

// opts.cap: apply main.js's min(delta, 0.05) (default true). spots: [{x, z}] named places to jump to.
export function fuzz(walk, runner, rnd, { steps = 200, spots = [], cap = true, actions = ACTIONS, onStep, couch = null } = {}) {
  const { session: s, player } = walk;
  player.setTouchEngaged(true);
  const solids = (s.areaData.colliders ?? []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.z));
  const groundY = (x, z) => s.ground.y(x, z);
  const place = (x, z) => { s.cat.position.set(x, groundY(x, z), z); };
  for (let i = 0; i < steps; i++) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = pickOf(rnd, actions);
      switch (a) {
        case 'interact': case 'pounce': case 'meow': case 'camera': runner.inter.handleTouchAction(a); break;
        case 'pause': runner.inter.handleTouchAction('pause'); break;
        case 'resume': player.setTouchEngaged(true); break;
        case 'kickOn': player.setKick(true); break;
        case 'kickOff': player.setKick(false); break;
        case 'stick': { const ang = rnd() * Math.PI * 2; const mag = rnd() < 0.3 ? 1 : rnd(); player.setTouchMove({ x: Math.sin(ang) * mag, z: Math.cos(ang) * mag, mag }); break; }
        case 'stickOff': player.setTouchMove(null); break;
        case 'orbit': player.addOrbit((rnd() - 0.5) * 80, (rnd() - 0.5) * 40); break;
        case 'tele': if (solids.length) { const c = pickOf(rnd, solids); const ang = rnd() * Math.PI * 2; const d = (c.r ?? 0.5) + 0.5 + rnd() * 2; place(c.x + Math.cos(ang) * d, c.z + Math.sin(ang) * d); } break;
        case 'teleSpot': if (spots.length) { const q = pickOf(rnd, spots); place(q.x + (rnd() - 0.5) * 2.4, q.z + (rnd() - 0.5) * 2.4); } break;
        default: break;
      }
    }
    if (couch) {
      // both pads, random buttons and sticks (pad 0 is cat one's, pad 1 cat two's)
      const btn = () => (rnd() < 0.5 ? [] : [Math.floor(rnd() * 16)]);
      const ax = () => [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2];
      couch.set(fakePad(0, btn(), rnd() < 0.5 ? ax() : [0, 0, 0, 0]), fakePad(1, btn(), rnd() < 0.7 ? ax() : [0, 0, 0, 0]));
    }
    const raw = dtSpike(rnd);
    const dt = cap ? Math.min(raw, 0.05) : raw;
    runner.frame(dt);
    if (onStep) onStep(i);
  }
}
// CRASHHUNT_SEED=n shifts every seed, to hunt wider by hand; the committed default (0) is the deterministic set
export const SEED_SHIFT = Number(process.env.CRASHHUNT_SEED) * 10007 || 0;
export const rngFor = (seed) => mulberry32((seed + SEED_SHIFT) >>> 0);
