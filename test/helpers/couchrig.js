// A couch-play rig with FAKE pads for the M4 tests: the real player, gamepad glue, remote-cat drawing, progression and
// discovery log; fake session pieces. Same shape as test/coopplay.test.js's own rig, plus a menu navigator that counts
// its presses and a fight stand-in a test can fill.
import * as THREE from 'three';
import { stubCanvasDocument } from './canvas.js';
import { memoryStorage } from './storage.js';

stubCanvasDocument({ pointerLock: true, measureText: 10 });
export const { coop } = await import('../../src/coopseam.js');
const { start } = await import('../../src/coop/index.js');
const { createPlayer } = await import('../../src/player.js');
const { createGamepad } = await import('../../src/gamepad.js');
const { createRemoteCats } = await import('../../src/remotecats.js');
const { buildCat } = await import('../../src/cat/model.js');
const { FLAT_GROUND } = await import('../../src/ground.js');
const { createProgression, CATALOG } = await import('../../src/progression.js');
const { createDiscoveryLog } = await import('../../src/discoveries.js');
const { PAD_BUTTONS } = await import('../../src/gamepadinput.js');
const { SECOND_ID } = await import('../../src/coop/second.js');
export { PAD_BUTTONS, SECOND_ID, FLAT_GROUND, createRemoteCats, CATALOG, THREE };

export const ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
export const DT = 1 / 60;

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.ls = {}; this.hidden = false; this.className = ''; this.textContent = ''; this.innerHTML = ''; this.type = ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  addEventListener(t, f) { this.ls[t] = f; }
  focus() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  click() { this.ls.click?.(); }
}
export const fakeDoc = () => ({ createElement: (t) => new El(t), body: new El('body'), head: new El('head') });

export function newSession(areaId, { ground = FLAT_GROUND } = {}) {
  const scene = new THREE.Scene();
  const cat = buildCat('tabby');
  scene.add(cat);
  const remotes = createRemoteCats(scene, { ground });
  const area = { colliders: [], bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 }, waters: [], collectibles: [] };
  return {
    areaId, net: null, scene, cat, remotes, ground, areaData: area, reducedMotion: false, cameraMode: false, critters: { bumps: [] },
    collectibleMeshes: new Map(), walk: { carried: 0, carryCap: 5 }, fx: { burst() {} }, idleTime: 0, prompt: null,
    goldMice: { checkFind: () => null, nearestUnfound: () => null, remove() {} }, carry: null, scent: null,
  };
}

export function rig({ areaId = 'neighborhood', profile = 'tv', unlocked = ['tabby', 'siamese'], clanFight = null, ctxExtra = {}, sessionExtra = {} } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.unlocked.cats = unlocked;
  progression.state.petName = 'Mochi';
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
  const session = newSession(areaId);
  if (clanFight) session.clanFight = clanFight;
  Object.assign(session, sessionExtra);
  const cat = session.cat;
  const player = createPlayer(camera, { addEventListener() {} });
  player.setAvatar(cat, 3.5);
  player.setGround(FLAT_GROUND);
  player.enable();
  player.setTouchEngaged(true);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const pads = [];
  const doc = fakeDoc();
  const toasts = [], acts = [];
  const resumed = { n: 0 };
  const presses = [];
  let current = session;
  const g = createGamepad({
    win: { addEventListener() {}, removeEventListener() {} }, nav: { getGamepads: () => pads }, doc: null,
    menuNav: { enter() {}, step() {}, alt() {}, press() { presses.push(1); }, scroll() {}, settle() {} },
    getEngaged: () => player.engaged, toast() {},
    isFighting: () => current?.clanFight?.uiShowing === 'fight',
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onAction: (n) => { if (n === 'pause') player.setTouchEngaged(false); else if (n === 'interact' || n === 'meow') { if (!answer(current?.clanFight, n)) acts.push(n); } else acts.push(n); },
    onResume: () => player.setTouchEngaged(true), canResume: () => true,
  });
  const answer = (cf, name) => { if (cf?.uiShowing !== 'challenge') return false; cf.key(name === 'interact' ? 'e' : 'q'); return true; }; // ui/fightui.js answerChallenge, as main.js calls it
  const ctx = {
    storage: { getItem: () => JSON.stringify({ follow: true }) },
    nav: { getGamepads: () => pads }, getSession: () => current, player, camera, doc, profile: () => profile,
    getState: () => progression.state, catalog: CATALOG, progression, log, audio: {}, toast: (m) => toasts.push(m),
    act: (n) => { if (n === 'pause') player.setTouchEngaged(false); else acts.push(n); },
    voice: (p) => acts.push(`voice:${p}`), resume: () => { resumed.n++; player.setTouchEngaged(true); }, canResume: () => true,
    ...ctxExtra,
  };
  const h = start(ctx);
  const r = {
    h, ctx, pads, session, player, cat, camera, doc, toasts, acts, resumed, progression, log, presses,
    get remotes() { return current.remotes; },
    setProfile(p) { profile = p; },
    setSession(s) { current = s; },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        coop.poll(DT);
        g.poll(DT, coop.pad);
        if (player.engaged) {
          const a = current.areaData;
          current.traversal?.update?.(DT, 0, { cat: current.cat, player, session: current }); // the moves of a place that has them (the Rooftops), before the player as main.js runs them
          player.update(DT, a.colliders, a.bounds, a.waters);
          coop.frame?.(DT);
          current.fair?.update?.(DT, 0, { cat: current.cat, player, session: current }); // the rides of the Fairground, as main.js runs them after player.update (a place that has none: nothing)
          current.fair?.late?.(DT, 0, { cat: current.cat, player, session: current });
          current.traversal?.late?.(DT, 0, { cat: current.cat, player, session: current });
          current.clanFight?.update?.(DT, current); // main.js: the fight, after everything that moves the cat
          current.remotes.update(DT, performance.now() / 1000, a.waters, current.fair); // main.js: the remote cats move before coop.late draws on top of them
          coop.late?.(DT);
        } else current.clanFight?.update?.(DT, current);
      }
    },
    two() { return current.remotes.list.find((e) => e.playerId === SECOND_ID); },
  };
  return r;
}

export const pad = (index, down = [], axes = [0, 0, 0, 0]) => ({
  index, connected: true, mapping: 'standard', id: ID, axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});
export const set = (r, ...list) => { r.pads.length = 0; r.pads.push(...list); };
export function joined(opts) {
  const r = rig(opts);
  set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  set(r, pad(0), pad(1, [PAD_BUTTONS.A])); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  return r;
}
export const find = (doc, cls) => doc.body.children.find((c) => c.className === cls);
export const reset = () => { coop.poll = null; coop.two = false; coop.pad = null; coop.frame = null; coop.late = null; };
