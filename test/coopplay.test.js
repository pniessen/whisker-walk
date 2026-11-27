import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

// Couch play, milestone 1, end to end with FAKE pads: two pads, two cats, one
// screen, over the real player, the real gamepad glue, the real remote-cat
// drawing and the real camera maths. The browser pane's pictures and a real
// pair of DualSenses are the owner's (docs/superpowers/plans/2026-11-22-couch-coop.md M6).
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { coop } = await import('../src/coopseam.js');
const { start } = await import('../src/coop/index.js');
const { createPlayer, DEFAULT_PITCH } = await import('../src/player.js');
const { createGamepad } = await import('../src/gamepad.js');
const { createRemoteCats } = await import('../src/remotecats.js');
const { buildCat } = await import('../src/cat/model.js');
const { FLAT_GROUND } = await import('../src/ground.js');
const { createProgression, CATALOG } = await import('../src/progression.js');
const { PAD_BUTTONS } = await import('../src/gamepadinput.js');
const { SECOND_ID } = await import('../src/coop/second.js');
const { maxSeparation } = await import('../src/coop/framing.js');

const ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const A = PAD_BUTTONS.A, B = PAD_BUTTONS.B, L1 = PAD_BUTTONS.L1, R1 = PAD_BUTTONS.R1, START = PAD_BUTTONS.START;
const DT = 1 / 60;

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
const fakeDoc = () => ({ createElement: (t) => new El(t), body: new El('body'), head: new El('head') });
const find = (doc, cls) => doc.body.children.find((c) => c.className === cls);

function rig({ areaId = 'neighborhood', net = null, profile = 'tv', unlocked = ['tabby', 'siamese'], follow = true } = {}) {
  const progression = createProgression(memoryStorage());
  progression.state.unlocked.cats = unlocked;
  progression.state.petName = 'Mochi';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
  const cat = buildCat('tabby');
  scene.add(cat);
  const player = createPlayer(camera, { addEventListener() {} });
  player.setAvatar(cat, 3.5);
  player.setGround(FLAT_GROUND);
  player.enable();
  player.setTouchEngaged(true);
  const remotes = createRemoteCats(scene, { ground: FLAT_GROUND });
  const area = { colliders: [], bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 }, waters: [] };
  const session = { areaId, net, scene, cat, remotes, ground: FLAT_GROUND, areaData: area, reducedMotion: false, cameraMode: false, critters: { bumps: [] } };
  const pads = [];
  const doc = fakeDoc();
  const toasts = [], acts = [];
  const resumed = { n: 0 };
  let current = session;
  const g = createGamepad({
    win: { addEventListener() {}, removeEventListener() {} }, nav: { getGamepads: () => pads }, doc: null,
    menuNav: { enter() {}, step() {}, alt() {}, press() {}, scroll() {}, settle() {} },
    getEngaged: () => player.engaged, toast() {},
    onMove: (v) => player.setTouchMove(v),
    onOrbit: (dx, dy) => player.addOrbit(dx, dy),
    onAction: (n) => { if (n === 'pause') player.setTouchEngaged(false); else acts.push(n); },
    onResume: () => player.setTouchEngaged(true), canResume: () => true,
  });
  const ctx = {
    storage: { getItem: () => JSON.stringify({ follow }) },
    nav: { getGamepads: () => pads }, getSession: () => current, player, camera, doc, profile: () => profile,
    getState: () => progression.state, catalog: CATALOG, toast: (m) => toasts.push(m), act: (n) => { if (n === 'pause') player.setTouchEngaged(false); else acts.push(n); },
    voice: (p) => acts.push(`voice:${p}`), resume: () => { resumed.n++; player.setTouchEngaged(true); }, canResume: () => true,
  };
  const h = start(ctx);
  const t0 = performance.now() / 1000;
  const r = {
    h, ctx, pads, session, player, cat, remotes, camera, doc, toasts, acts, resumed, scene, progression,
    setProfile(p) { profile = p; },
    setSession(s) { current = s; },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        coop.poll(DT);
        g.poll(DT, coop.pad);
        if (player.engaged) {
          player.update(DT, area.colliders, area.bounds, area.waters);
          coop.frame?.(DT);
          remotes.update(DT, performance.now() / 1000, area.waters);
        }
      }
    },
    two() { return remotes.list.find((e) => e.playerId === SECOND_ID); },
  };
  void t0;
  return r;
}
const pad = (index, down = [], axes = [0, 0, 0, 0]) => ({
  index, connected: true, mapping: 'standard', id: ID, axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })),
});
const set = (r, ...list) => { r.pads.length = 0; r.pads.push(...list); };
// Seat both pads: pad 0 is cat one, pad 1 presses A and joins.
function joined(opts) {
  const r = rig(opts);
  set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  set(r, pad(0), pad(1, [A])); r.tick(2);
  set(r, pad(0), pad(1)); r.tick(2);
  return r;
}

afterEach(() => { coop.poll = null; coop.pad = null; coop.frame = null; vi.restoreAllMocks(); });

describe('the join prompt', () => {
  it('shows "press A on a second controller" while a pad is there and nobody has joined, in the pad\'s own pictures', () => {
    const r = rig();
    r.tick(1);
    expect(find(r.doc, 'coop-join').hidden).toBe(true); // no pad yet
    set(r, pad(0)); r.tick(1);
    const pill = find(r.doc, 'coop-join');
    expect(pill.hidden).toBe(false);
    expect(pill.innerHTML).toContain('<svg'); // the cross, drawn
    expect(pill.attrs['aria-label']).toBe('Press ✕ on a second controller to play together');
    expect(pill.attrs.role).toBe('status');
  });

  it('is gone once the second cat has joined', () => {
    const r = joined();
    expect(r.h.state.joined).toBe(true);
    expect(find(r.doc, 'coop-join').hidden).toBe(true);
  });

  it('says "not here yet" in a place that is not ready, with two pads, and never joins there', () => {
    const r = rig({ areaId: 'fair' });
    set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
    expect(find(r.doc, 'coop-join').attrs['aria-label']).toBe('Two cats do not play here yet');
    set(r, pad(0), pad(1, [A])); r.tick(3);
    expect(r.h.state.joined).toBe(false);
    expect(r.two()).toBeUndefined();
  });
});

describe('who is where', () => {
  it('pad two\'s A joins a second cat beside the first; a toast says its name; it is a simple local co-walker', () => {
    const r = joined();
    expect(r.h.state.joined).toBe(true);
    const e = r.two();
    expect(e).toBeTruthy();
    expect(e.local).toBe(true);
    expect(e.petName).toBe('Siamese'); // another cat of the save; cat one is the tabby
    expect(e.group.visible).toBe(true);
    expect(e.tag).toBeTruthy(); // a name above it
    expect(r.cat.userData.ownTag).toBeTruthy(); // and above cat one
    expect(Math.hypot(e.group.position.x - r.cat.position.x, e.group.position.z - r.cat.position.z)).toBeGreaterThan(1);
    expect(r.toasts).toEqual(['Siamese is here too!']);
  });

  it('pad one drives cat one only, pad two drives cat two only', () => {
    const r = joined();
    const c1 = r.cat.position.clone(), c2 = r.two().group.position.clone();
    set(r, pad(0, [], [0, -1, 0, 0]), pad(1)); r.tick(60);
    expect(r.cat.position.distanceTo(c1)).toBeGreaterThan(2);
    expect(r.two().group.position.distanceTo(c2)).toBeLessThan(0.01);
    set(r, pad(0), pad(1)); r.tick(60); // cat one glides to a stop
    const c1b = r.cat.position.clone(), c2b = r.two().group.position.clone();
    set(r, pad(0), pad(1, [], [0, 1, 0, 0])); r.tick(60);
    expect(r.cat.position.distanceTo(c1b)).toBeLessThan(0.01);
    expect(r.two().group.position.distanceTo(c2b)).toBeGreaterThan(2);
  });

  it('the keyboard and touch stay with cat one (they drive the player, not the second cat)', () => {
    const r = joined();
    const c2 = r.two().group.position.clone();
    r.player.setTouchMove({ x: 1, z: 0, mag: 1 }); // what a thumb or the keys do
    r.tick(60);
    expect(r.cat.position.x).toBeGreaterThan(2);
    expect(r.two().group.position.distanceTo(c2)).toBeLessThan(0.01);
  });

  it('cat two\'s right stick turns nothing and L1 R1 are not zoom for either pad', () => {
    const r = joined();
    const yaw = r.player.viewYaw();
    set(r, pad(0, [], [0, 0, 1, 0]), pad(1, [], [0, 0, -1, 0])); r.tick(30);
    expect(r.player.viewYaw()).toBeCloseTo(yaw, 6);
    expect(r.acts).not.toContain('zoomIn');
    expect(r.acts).not.toContain('zoomOut');
  });

  it('each cat hops on its own A: cat two\'s hop lifts only cat two, and a press in the air does not start another', () => {
    const r = joined();
    set(r, pad(0), pad(1, [A])); r.tick(6);
    expect(r.two().h).toBeGreaterThan(0.05);
    expect(r.cat.position.y).toBeLessThan(0.01);
    set(r, pad(0), pad(1)); r.tick(2);
    const first = r.h.state;
    void first;
    for (let i = 0; i < 4; i++) { set(r, pad(0), pad(1, [A])); r.tick(1); set(r, pad(0), pad(1)); r.tick(1); }
    r.tick(40);
    expect(r.two().h).toBeLessThan(0.01); // it came down and was not kept up
    set(r, pad(0, [A]), pad(1)); r.tick(2);
    expect(r.acts).toContain('pounce'); // cat one's own A is the walk's, as today
  });

  it('B on pad two is cat two\'s meow, in a higher voice', () => {
    const r = joined();
    set(r, pad(0), pad(1, [B])); r.tick(1);
    expect(r.acts).toContain('voice:1.26');
    expect(r.acts).not.toContain('meow');
  });
});

describe('pause: either pad', () => {
  it('Start on pad two pauses the walk, and the card is pad two\'s to move', () => {
    const r = joined();
    set(r, pad(0), pad(1, [START])); r.tick(1);
    expect(r.player.engaged).toBe(false);
    set(r, pad(0), pad(1)); r.tick(1);
    expect(coop.pad.index).toBe(1); // pad two's pad is the one the menu reads
  });

  it('Start on pad one pauses it, and either pad\'s Start resumes', () => {
    const r = joined();
    set(r, pad(0, [START]), pad(1)); r.tick(1);
    expect(r.player.engaged).toBe(false);
    set(r, pad(0), pad(1)); r.tick(1);
    expect(coop.pad.index).toBe(0);
    set(r, pad(0), pad(1, [START])); r.tick(1);
    expect(r.player.engaged).toBe(true);
    expect(r.resumed.n).toBeGreaterThan(0);
  });

  it('while paused neither cat moves', () => {
    const r = joined();
    set(r, pad(0), pad(1, [], [0, 1, 0, 0])); r.tick(5);
    set(r, pad(0, [START]), pad(1)); r.tick(1);
    const c = r.two().group.position.clone();
    set(r, pad(0), pad(1, [], [0, 1, 0, 0])); r.tick(30);
    expect(r.two().group.position.distanceTo(c)).toBeLessThan(0.01);
  });
});

describe('a controller goes to sleep', () => {
  it('pauses the walk at once and asks for that cat\'s controller by name, with real buttons', () => {
    const r = joined();
    set(r, pad(0)); r.tick(1);
    expect(r.player.engaged).toBe(false);
    const card = find(r.doc, 'coop-lost');
    expect(card.hidden).toBe(false);
    expect(card.attrs['data-pad-layer']).toBe('coop-lost');
    const [inner] = card.children;
    expect(inner.children[0].textContent).toBe("Siamese's controller went to sleep.");
    expect(inner.children[2].children.map((b) => b.tag)).toEqual(['button', 'button']);
  });

  it('any button on a pad that is not seated wakes it, under any index, and the card goes', () => {
    const r = joined();
    set(r, pad(0)); r.tick(1);
    set(r, pad(0), pad(7)); r.tick(2);
    expect(find(r.doc, 'coop-lost').hidden).toBe(false);
    set(r, pad(0), pad(7, [PAD_BUTTONS.Y])); r.tick(1);
    set(r, pad(0), pad(7)); r.tick(1);
    expect(find(r.doc, 'coop-lost').hidden).toBe(true);
    expect(r.h.state.seats[1]).toEqual({ index: 7, lost: false });
    expect(r.h.state.joined).toBe(true);
  });

  it('"Play without it" sends cat two off with a wave; the walk goes on with one cat; A on a pad joins again', () => {
    const r = joined();
    set(r, pad(0)); r.tick(1);
    const [inner] = find(r.doc, 'coop-lost').children;
    inner.children[2].children[1].click();
    expect(r.h.state.joined).toBe(false);
    expect(r.two()).toBeUndefined();
    r.tick(400); // the one-line toast queue: the welcome has its turn first
    expect(r.toasts.at(-1)).toBe('Siamese waves goodbye.');
    expect(find(r.doc, 'coop-lost').hidden).toBe(true);
    expect(r.cat.userData.ownTag).toBeUndefined();
    r.player.setTouchEngaged(true); // the walk was paused; resumed
    set(r, pad(0), pad(2, [A])); r.tick(2);
    expect(r.h.state.joined).toBe(true);
  });

  it('"Wait for it" closes the card and keeps cat two\'s seat', () => {
    const r = joined();
    set(r, pad(0)); r.tick(1);
    const [inner] = find(r.doc, 'coop-lost').children;
    inner.children[2].children[0].click();
    expect(find(r.doc, 'coop-lost').hidden).toBe(true);
    expect(r.h.state.joined).toBe(true);
    expect(r.h.state.seats[1].lost).toBe(true);
  });

  it('cat one\'s pad going away asks for cat one by name, and pad two can work the card meanwhile', () => {
    const r = joined();
    set(r, pad(1)); r.tick(1);
    const [inner] = find(r.doc, 'coop-lost').children;
    expect(inner.children[0].textContent).toBe("Mochi's controller went to sleep.");
    expect(coop.pad.index).toBe(1);
  });

  it('with cat two never joined, a lost pad is today\'s solo behaviour: no card, no pause', () => {
    const r = rig();
    set(r, pad(0, [PAD_BUTTONS.X])); r.tick(2);
    set(r); r.tick(2);
    expect(r.player.engaged).toBe(true);
    expect(find(r.doc, 'coop-lost').hidden).toBe(true);
  });
});

describe('the shared camera', () => {
  const inFrame = (r, obj) => {
    const v = new THREE.Vector3(obj.position.x, obj.position.y + 0.5, obj.position.z).project(r.camera);
    return Math.abs(v.x) <= 0.86 && Math.abs(v.y) <= 0.81 && v.z < 1;
  };

  it('frames the midpoint of the two cats, and both are inside the safe box', () => {
    const r = joined();
    r.camera.updateMatrixWorld(true);
    const e = r.two().group;
    expect(inFrame(r, r.cat)).toBe(true);
    expect(inFrame(r, e)).toBe(true);
    const mid = new THREE.Vector3().addVectors(r.cat.position, e.position).multiplyScalar(0.5);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(r.camera.quaternion);
    const toMid = mid.clone().sub(r.camera.position).normalize();
    expect(look.angleTo(toMid)).toBeLessThan(0.2);
  });

  it('widens as the cats part and keeps both in the picture, up to the leash', () => {
    const r = joined();
    const l0 = r.h.state.level;
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1, [], [-1, 0, 0, 0])); r.tick(240);
    r.camera.updateMatrixWorld(true);
    expect(r.h.state.level).toBeGreaterThan(l0 + 0.5);
    expect(inFrame(r, r.cat)).toBe(true);
    expect(inFrame(r, r.two().group)).toBe(true);
  });

  it('the leash: cats walking apart stop at the widest frame and never leave it', () => {
    const r = joined();
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1, [], [-1, 0, 0, 0]));
    // neither is ever pulled along by the other: cat one's stick is east and it never goes west, cat two's the other way
    let lastOne = r.cat.position.x, lastTwo = r.two().group.position.x;
    for (let i = 0; i < 60 * 12; i++) {
      r.tick(1);
      expect(r.cat.position.x).toBeGreaterThanOrEqual(lastOne - 1e-6);
      expect(r.two().group.position.x).toBeLessThanOrEqual(lastTwo + 1e-6);
      lastOne = r.cat.position.x; lastTwo = r.two().group.position.x;
    }
    const limit = maxSeparation({ pitch: DEFAULT_PITCH, lookY: 0.6, fov: 70, aspect: 16 / 9 });
    const apart = Math.hypot(r.cat.position.x - r.two().group.position.x, r.cat.position.z - r.two().group.position.z);
    expect(apart).toBeLessThanOrEqual(limit + 0.01);
    expect(apart).toBeGreaterThan(limit * 0.85); // they really did walk to the limit
    r.camera.updateMatrixWorld(true);
    expect(inFrame(r, r.cat)).toBe(true);
    expect(inFrame(r, r.two().group)).toBe(true);
    // and they can walk back together at once
    set(r, pad(0, [], [-1, 0, 0, 0]), pad(1, [], [1, 0, 0, 0])); r.tick(60);
    expect(Math.hypot(r.cat.position.x - r.two().group.position.x, r.cat.position.z - r.two().group.position.z)).toBeLessThan(apart - 3);
  });

  it('a cat standing still is never pulled by the other one walking away, and a cat at the leash still slides sideways', () => {
    const r = joined({ follow: false });
    const still = r.two().group.position.clone();
    set(r, pad(0, [], [-1, 0, 0, 0]), pad(1)); r.tick(60 * 10); // cat one walks west, away from cat two, to the leash and on pushing
    expect(r.two().group.position.distanceTo(still)).toBeLessThan(0.01);
    const apart = Math.hypot(r.cat.position.x - still.x, r.cat.position.z - still.z);
    expect(apart).toBeLessThanOrEqual(r.h.state.leash + 0.01);
    const z0 = r.cat.position.z;
    set(r, pad(0, [], [-1, -1, 0, 0]), pad(1)); r.tick(60); // west and north: the west part stops, the north part is walked
    expect(z0 - r.cat.position.z).toBeGreaterThan(2.5);
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1)); r.tick(60); // and back toward its friend at once
    expect(Math.hypot(r.cat.position.x - still.x, r.cat.position.z - still.z)).toBeLessThan(apart - 2);
  });

  it('where a building pulls the camera in so both cats cannot be framed, they may come together but no farther apart', () => {
    const r = joined();
    r.session.areaData.colliders.push({ x: 0, z: 9, r: 3.5 }); // a house the wide camera would stand inside
    set(r, pad(0, [], [-1, 0, 0, 0]), pad(1, [], [1, 0, 0, 0]));
    let tight = false;
    for (let i = 0; i < 60 * 8; i++) { r.tick(1); tight ||= r.h.state.tight; }
    expect(tight).toBe(true);
    const frozen = r.h.state.apart;
    r.tick(60);
    expect(r.h.state.apart).toBeLessThanOrEqual(frozen + 0.05); // still pushing apart: nothing more
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1, [], [-1, 0, 0, 0])); r.tick(60);
    expect(r.h.state.apart).toBeLessThan(frozen - 2); // together again
  });

  it('the view has a fixed heading: free orbit is off, and L1 / R1 on either pad turn it a quarter', () => {
    const r = joined();
    expect(r.h.state.yaw).toBe(0);
    set(r, pad(0, [L1]), pad(1)); r.tick(1);
    set(r, pad(0), pad(1)); r.tick(70);
    expect(r.h.state.yaw).toBeCloseTo(Math.PI / 2, 6);
    expect(r.player.viewYaw()).toBeCloseTo(Math.PI / 2, 2);
    set(r, pad(0), pad(1, [R1])); r.tick(1);
    set(r, pad(0), pad(1, [R1])); r.tick(1); // held: one turn
    set(r, pad(0), pad(1)); r.tick(40);
    expect(r.h.state.yaw).toBeCloseTo(0, 6);
    set(r, pad(0), pad(1, [R1])); r.tick(1);
    set(r, pad(0), pad(1)); r.tick(40);
    expect(r.h.state.yaw).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('a stick held through a turn keeps its world direction until it is let go', () => {
    const r = joined();
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1)); r.tick(30); // cat one walks east
    const x0 = r.cat.position.x, z0 = r.cat.position.z;
    set(r, pad(0, [L1], [1, 0, 0, 0]), pad(1)); r.tick(1);
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1)); r.tick(60); // the view has turned; the stick is still held
    expect(r.cat.position.x - x0).toBeGreaterThan(3);
    expect(Math.abs(r.cat.position.z - z0)).toBeLessThan(0.5);
    set(r, pad(0), pad(1)); r.tick(5);
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1)); r.tick(60); // pushed again after letting go: the new view's right
    expect(Math.abs(r.cat.position.z - z0)).toBeGreaterThan(3);
  });

  it('with reduced motion the turn and the widening snap', () => {
    const r = joined();
    r.session.reducedMotion = true;
    set(r, pad(0, [L1]), pad(1)); r.tick(2);
    expect(r.player.viewYaw()).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('the marks under the cats', () => {
  it('a blue circle under cat one and an orange diamond under cat two, both few triangles and not shadow casters', () => {
    const r = joined();
    const marks = r.scene.children.filter((o) => o.isMesh && o.userData.noCast && o.material.transparent && !o.userData.puff);
    expect(marks).toHaveLength(2);
    const [c, d] = marks;
    expect(c.material.color.getHex()).toBe(0x3b82f6);
    expect(d.material.color.getHex()).toBe(0xf59e0b);
    expect(c.geometry.index ? c.geometry.index.count / 3 : c.geometry.attributes.position.count / 3).toBeLessThanOrEqual(64);
    expect(d.geometry.index.count / 3).toBe(8);
    expect(c.visible && d.visible).toBe(true);
    expect(c.position.x).toBeCloseTo(r.cat.position.x, 6);
    expect(d.position.x).toBeCloseTo(r.two().group.position.x, 6);
    expect(c.castShadow || d.castShadow).toBe(false);
  });
});

describe('the TV\'s sizes', () => {
  it('its two pieces of page keep the 24 px floor on a TV, 48 px buttons, and the 5 % margins', () => {
    const r = rig({ profile: 'tv' });
    const css = r.doc.head.children[0].textContent;
    expect(css).toMatch(/html\.tv \.coop-join[^{]*\{[^}]*font-size:24px/);
    expect(css).toMatch(/html\.tv \.coop-lost\{[^}]*font-size:24px/);
    expect(css).toMatch(/\.coop-lost button\{[^}]*min-height:48px/);
    expect(css).toMatch(/\.coop-join\{[^}]*top:max\(13vh/); // under the rank badge, inside the safe margin
    expect(css).toMatch(/max-width:min\(80vw/);
    expect(css).not.toMatch(/font-size:\s*(1[0-9]|[0-9])px/); // nothing below 20 px except the 17 / 18 px laptop base
  });
});

describe('where couch play does not exist', () => {
  it('a phone and a tablet never show it: no prompt, no pad taken, no join', () => {
    for (const p of ['phone', 'tablet']) {
      const r = rig({ profile: p });
      set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(3);
      set(r, pad(0), pad(1, [A])); r.tick(3);
      expect(find(r.doc, 'coop-join').hidden, p).toBe(true);
      expect(r.h.state.joined, p).toBe(false);
      expect(coop.pad, p).toBeNull();
      expect(r.h.state.couch, p).toBe(false);
    }
  });

  it('the laptop and the TV both do', () => {
    for (const p of ['laptop', 'tv']) {
      const r = rig({ profile: p });
      set(r, pad(0)); r.tick(1);
      expect(find(r.doc, 'coop-join').hidden, p).toBe(false);
    }
  });

  it('an online co-walk and a place that is not ready leave solo play exactly as it is', () => {
    for (const o of [{ net: {} }, { areaId: 'fair' }]) {
      const r = rig(o);
      set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
      set(r, pad(0), pad(1, [A])); r.tick(2);
      expect(r.h.state.joined).toBe(false);
      expect(coop.pad).toBeNull();
    }
  });

  it('a profile that turns into a phone mid-walk sends cat two away', () => {
    const r = joined();
    r.setProfile('phone');
    r.tick(2);
    expect(r.h.state.joined).toBe(false);
    expect(r.two()).toBeUndefined();
  });

  it('a new walk starts clean: nothing of the last walk\'s second cat is touched', () => {
    const r = joined();
    const old = r.session;
    const fresh = { ...old, remotes: createRemoteCats(new THREE.Scene(), { ground: FLAT_GROUND }), scene: new THREE.Scene() };
    r.setSession(fresh);
    r.tick(1);
    expect(r.h.state.joined).toBe(false);
    expect(fresh.remotes.list).toHaveLength(0);
    set(r, pad(0, [PAD_BUTTONS.X]), pad(1)); r.tick(2);
    expect(find(r.doc, 'coop-join').hidden).toBe(false); // ready to join again
  });

  it('stop() puts the seam back to nothing listening', () => {
    const r = joined();
    r.h.stop();
    expect(coop.poll).toBeNull();
    expect(coop.pad).toBeNull();
    expect(coop.frame).toBeNull();
    expect(r.two()).toBeUndefined();
  });
});

describe('couch play is offline', () => {
  it('a whole join-and-walk makes no request of any kind', () => {
    const calls = [];
    vi.stubGlobal('fetch', (...a) => { calls.push(['fetch', a]); return Promise.reject(new Error('offline')); });
    vi.stubGlobal('XMLHttpRequest', function () { calls.push(['xhr']); });
    vi.stubGlobal('WebSocket', function () { calls.push(['ws']); });
    const r = joined();
    set(r, pad(0, [], [1, 0, 0, 0]), pad(1, [A], [-1, 0, 0, 0])); r.tick(120);
    set(r, pad(0, [L1]), pad(1)); r.tick(30);
    set(r, pad(0)); r.tick(2);
    expect(calls).toEqual([]);
    vi.unstubAllGlobals();
    stubCanvasDocument({ pointerLock: true, measureText: 10 });
  });
});

// ---- milestone 2: the camera's rules and the HUD, over the same fake pads ----
const DOWN = 13; // D-pad Down
const gap = (r) => Math.hypot(r.cat.position.x - r.two().group.position.x, r.cat.position.z - r.two().group.position.z);
const west = (r, n, both = false) => { set(r, pad(0, [], [-1, 0, 0, 0]), pad(1, [], both ? [1, 0, 0, 0] : [0, 0, 0, 0])); r.tick(n); };

describe('milestone 2: follow when idle', () => {
  it('a cat whose stick rested for 3 s trots toward a friend farther than 8 m, and stops about 3 m away', () => {
    const r = joined();
    west(r, 60 * 5, true);
    set(r, pad(0), pad(1));
    const far = gap(r);
    expect(far).toBeGreaterThan(8);
    r.tick(60 * 2); // 2 s: not yet
    expect(r.h.state.following).toEqual([false, false]);
    r.tick(60 * 2); // past 3 s
    expect(r.h.state.following[1]).toBe(true);
    r.tick(60 * 12);
    expect(gap(r)).toBeLessThan(4.2);
    expect(gap(r)).toBeGreaterThan(1);
    expect(r.h.state.following).toEqual([false, false]);
  });

  it('any stick input cancels it at once, and the Settings switch (localStorage) turns it off', () => {
    const r = joined();
    west(r, 60 * 5, true);
    set(r, pad(0), pad(1)); r.tick(60 * 4);
    expect(r.h.state.following[1]).toBe(true);
    set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(1); // cat two pushes away from its friend
    expect(r.h.state.following[1]).toBe(false);
    const off = joined({ follow: false });
    west(off, 60 * 5, true);
    set(off, pad(0), pad(1)); off.tick(60 * 8);
    expect(off.h.state.following).toEqual([false, false]);
    expect(gap(off)).toBeGreaterThan(8);
  });
});

describe('milestone 2: hold D-pad Down to hop to my friend', () => {
  it('a ring fills over the cat for 0.8 s, then it lands beside its friend and the stick is its own again', () => {
    const r = joined({ follow: false });
    west(r, 60 * 5);
    const far = gap(r);
    expect(far).toBeGreaterThan(8);
    set(r, pad(0, [DOWN]), pad(1)); r.tick(30);
    expect(r.h.hub.holds()[0]).toBeGreaterThan(0.5);
    expect(r.h.hub.holds()[0]).toBeLessThan(1);
    const ring = r.doc.body.children.filter((c) => c.className === 'coop-ring')[0];
    expect(ring.hidden).toBe(false);
    expect(gap(r)).toBeGreaterThan(far - 1); // not yet
    r.tick(30);
    expect(gap(r)).toBeLessThan(3.4);
    expect(gap(r)).toBeGreaterThan(0.8);
    expect(r.acts).toContain('voice:1.1');
    set(r, pad(0), pad(1)); r.tick(2);
    expect(ring.hidden).toBe(true);
  });

  it('either pad does it for its own cat, and tapping twice is the other way', () => {
    const r = joined({ follow: false });
    west(r, 60 * 5);
    set(r, pad(0), pad(1, [DOWN])); r.tick(4);
    set(r, pad(0), pad(1)); r.tick(6);
    expect(gap(r)).toBeGreaterThan(8); // one tap is nothing
    set(r, pad(0), pad(1, [DOWN])); r.tick(4);
    set(r, pad(0), pad(1)); r.tick(3);
    expect(gap(r)).toBeLessThan(3.4);
  });

  it('lands on clear ground, never inside a collider, and stays put when nothing is clear', () => {
    const r = joined({ follow: false });
    west(r, 60 * 5);
    const friend = r.two().group.position;
    r.session.areaData.colliders.push({ x: friend.x + 1.3, z: friend.z, r: 1 }, { x: friend.x - 1.3, z: friend.z, r: 1 });
    set(r, pad(0, [DOWN]), pad(1)); r.tick(60);
    expect(gap(r)).toBeLessThan(4);
    for (const c of r.session.areaData.colliders) expect(Math.hypot(r.cat.position.x - c.x, r.cat.position.z - c.z)).toBeGreaterThan(c.r + 0.3);
  });
});

describe('milestone 2: the band, the hint and the tight-place rule', () => {
  it('a cat pushing on at the end of the band reads its own hint with the pad\'s picture, and loses it again', () => {
    const r = joined({ follow: false });
    const [left, right] = r.doc.body.children.filter((c) => c.className.startsWith('coop-slot'));
    expect(left.hidden).toBe(true);
    west(r, 60 * 8);
    expect(left.hidden).toBe(false);
    expect(left.attrs['aria-label']).toContain('hop to your friend');
    expect(left.innerHTML).toContain('<svg');
    expect(right.hidden).toBe(true); // cat two was not pushing
    set(r, pad(0), pad(1)); r.tick(100);
    expect(left.hidden).toBe(true);
  });

  it('the band slows the last 3 m: a cat moves less per second near the leash than in the open', () => {
    const r = joined({ follow: false });
    west(r, 60 * 3);
    const open = r.cat.position.x;
    r.tick(30);
    const openStep = open - r.cat.position.x;
    west(r, 60 * 6);
    const lim = r.h.state.leash;
    expect(gap(r)).toBeGreaterThan(lim - 3);
    const x0 = r.cat.position.x;
    r.tick(30);
    expect(x0 - r.cat.position.x).toBeLessThan(openStep * 0.5);
  });

  it('a building ring that pulls the camera in tightens the leash and marks the cat who is out of the safe box', () => {
    const r = joined({ follow: false });
    west(r, 60 * 4);
    r.tick(60);
    const wide = r.h.state.leash;
    const m = r.cat.position, b = r.session.areaData.bounds; // a wall close behind the cats: the camera cannot back off
    b.maxZ = m.z + 1.2; b.minZ = m.z - 1.2;
    r.tick(60);
    expect(r.h.state.pull).toBeLessThan(0.6);
    expect(r.h.state.tight).toBe(true);
    r.tick(5);
    expect(r.h.state.leash).toBeLessThan(wide);
  });
});

describe('milestone 2: toasts with a finder chip, the +N pop, the two prompt slots', () => {
  it('a find shows the finder\'s chip (shape, colour and name) with the line', () => {
    const r = joined();
    r.tick(400);
    r.toasts.length = 0;
    r.h.found(1, 'a golden mouse', 'gm-1');
    r.tick(2);
    expect(r.toasts).toEqual(['Siamese found a golden mouse']);
    const chip = find(r.doc, 'coop-chip');
    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe('◆ Siamese');
    expect(chip.style['--c']).toBe('#f59e0b');
    r.tick(60 * 6);
    expect(chip.hidden).toBe(true);
  });

  it('two finds of the same thing within 1.5 s fold into "You both found", one toast', () => {
    const r = joined();
    r.tick(400);
    r.toasts.length = 0;
    r.h.found(0, 'a golden mouse', 'gm-2');
    r.tick(1);
    r.h.found(1, 'a golden mouse', 'gm-2');
    r.tick(2);
    expect(r.toasts).toEqual(['Mochi found a golden mouse', 'You both found a golden mouse']);
  });

  it('+N floats up over the finder in the world and is gone after about a second', () => {
    const r = joined();
    r.h.pop(1, 3);
    const pops = r.doc.body.children.filter((c) => c.className === 'coop-pop');
    expect(pops).toHaveLength(1);
    expect(pops[0].textContent).toBe('+3');
    r.tick(30);
    expect(pops[0].style.transform).toMatch(/translate\(/);
    r.tick(60);
    expect(r.doc.body.children.filter((c) => c.className === 'coop-pop')).toHaveLength(0);
  });

  it('the two prompt slots are real, separate, and a line in one never shows in the other', () => {
    const r = joined();
    const [left, right] = r.doc.body.children.filter((c) => c.className.startsWith('coop-slot'));
    r.h.prompt(1, 'Press ⟦interact⟧ to sniff');
    r.tick(1);
    expect(right.hidden).toBe(false);
    expect(left.hidden).toBe(true);
    expect(right.attrs['aria-label']).toBe('Press □ to sniff');
    r.h.prompt(1, null);
    r.tick(1);
    expect(right.hidden).toBe(true);
  });
});
