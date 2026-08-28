import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  createPlayer,
  pounceArc,
  hopOffset,
  BASE_POUNCE_ARC,
  BASE_POUNCE_HOP,
  SPRING_PAWS_HOP,
  POUNCE_HOP_TIME,
  FLAT_POUNCE_ARC,
} from '../src/player.js';
import { climbBudget } from '../src/climbing.js';
import { createInteractions } from '../src/game/interactions.js';
import { createAvatarUpdater } from '../src/game/avatar.js';
import { createDiscoveryLog } from '../src/discoveries.js';

// ---------------------------------------------------------------------------
// v18 CF-9a — the pounce hop arc.
//
// Spring Paws promised two things and shipped one. "You can reach perches a
// longer hop away" was the climb budget (climbing.js, test/climbing.test.js);
// "your pounce jump goes markedly higher" had NOTHING behind it — pounce()
// was a horizontal-only lunge and the cat's Y was pinned to perchY every
// frame, so there was no jump height in the game to raise.
//
// These tests pin the four things that make the arc safe as well as visible:
// it exists, the ability makes it markedly higher, it never touches perchY
// (so it can never acquire a perch or find a golden mouse), and the cat lands
// back on perchY exactly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The pure arc
// ---------------------------------------------------------------------------

describe('hopOffset', () => {
  it('peaks at exactly `height` halfway through the window', () => {
    expect(hopOffset(POUNCE_HOP_TIME / 2, BASE_POUNCE_ARC)).toBeCloseTo(BASE_POUNCE_HOP, 12);
  });

  it('is exactly 0 at both ends and outside the window — no epsilon to drift on', () => {
    expect(hopOffset(0, BASE_POUNCE_ARC)).toBe(0);
    expect(hopOffset(POUNCE_HOP_TIME, BASE_POUNCE_ARC)).toBe(0);
    expect(hopOffset(POUNCE_HOP_TIME + 1, BASE_POUNCE_ARC)).toBe(0);
    expect(hopOffset(-1, BASE_POUNCE_ARC)).toBe(0);
  });

  it('rises then falls, and never exceeds its own peak', () => {
    let prev = 0;
    let rising = true;
    let peak = 0;
    for (let t = 0.01; t < POUNCE_HOP_TIME; t += 0.01) {
      const y = hopOffset(t, BASE_POUNCE_ARC);
      peak = Math.max(peak, y);
      if (rising && y < prev) rising = false;
      if (!rising) expect(y).toBeLessThanOrEqual(prev + 1e-12);
      prev = y;
    }
    expect(rising).toBe(false);            // it did come back down
    expect(peak).toBeLessThanOrEqual(BASE_POUNCE_HOP + 1e-12);
  });

  it('degrades to a flat hop rather than NaN on a malformed arc', () => {
    for (const arc of [null, undefined, {}, 'nope', { height: NaN, time: 0.3 },
      { height: -1, time: 0.3 }, { height: 0.35, time: 0 }]) {
      expect(hopOffset(0.1, arc)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Which arc a save gets
// ---------------------------------------------------------------------------

describe('pounceArc', () => {
  it('gives an unskilled cat a real but modest hop', () => {
    expect(pounceArc({ skills: [], feats: {} })).toEqual({ height: BASE_POUNCE_HOP, time: POUNCE_HOP_TIME });
    expect(BASE_POUNCE_HOP).toBeGreaterThan(0);
  });

  it('Spring Paws makes it markedly higher, not marginally', () => {
    const base = pounceArc({ skills: [] });
    const spring = pounceArc({ skills: ['spring-paws'] });
    expect(spring.height).toBe(SPRING_PAWS_HOP);
    // "Markedly" is the word the ability's own catalog copy uses, so pin a
    // real multiple rather than mere inequality — a 10% lift would satisfy
    // `>` and still leave the promise unkept.
    expect(spring.height).toBeGreaterThan(base.height * 2);
  });

  it('shares the pounce pose window, so the paws land on the landing thump', () => {
    // game/interactions.js sets session.pounceTime = 0.3 on the same press
    // and game/avatar.js fires the dust poof + landThump when it expires.
    expect(POUNCE_HOP_TIME).toBe(0.3);
    expect(pounceArc({}).time).toBe(POUNCE_HOP_TIME);
    expect(pounceArc({ skills: ['spring-paws'] }).time).toBe(POUNCE_HOP_TIME);
  });

  it('flattens under reducedMotion, the way the walk body-bob is dropped', () => {
    expect(pounceArc({ skills: [] }, { reducedMotion: true })).toBe(FLAT_POUNCE_ARC);
    expect(pounceArc({ skills: ['spring-paws'] }, { reducedMotion: true }).height).toBe(0);
  });

  it('survives a hostile save by falling back to the baseline arc', () => {
    for (const state of [null, undefined, 'nope', 7, [], { skills: 'x', feats: 7 }]) {
      expect(pounceArc(state)).toBe(BASE_POUNCE_ARC);
    }
    // ...and an INHERITED perch tally must not buy the taller hop, same rule
    // hasSkill applies everywhere else.
    expect(pounceArc({ feats: Object.create({ perch: 999 }) })).toBe(BASE_POUNCE_ARC);
  });

  it('is earned by the feat, not only by a persisted skills array', () => {
    expect(pounceArc({ feats: { perch: 9 } }).height).toBe(BASE_POUNCE_HOP);
    expect(pounceArc({ feats: { perch: 10 } }).height).toBe(SPRING_PAWS_HOP);
  });
});

describe('the arc never out-promises the climb rule', () => {
  // The arc is FEEL; climbBudget is RULE. If a hop ever peaked above the
  // height the same save is allowed to climb, the cat would be seen sailing
  // over a ledge that bestPerch then refuses — which is exactly the "did the
  // game just cheat me?" reading this split exists to avoid. Asserted for
  // both saves, so raising either number without the other fails here.
  for (const [name, state] of [['unskilled', { skills: [] }], ['Spring Paws', { skills: ['spring-paws'] }]]) {
    it(`stays under the climb budget for a ${name} cat`, () => {
      expect(pounceArc(state).height).toBeLessThan(climbBudget(state).climb);
    });
  }

  it('leaves the lowest shipped perch (y 0.72) untopped by an unskilled hop', () => {
    expect(BASE_POUNCE_HOP).toBeLessThan(0.72);
  });
});

// ---------------------------------------------------------------------------
// The live player: the arc as it actually moves the avatar
// ---------------------------------------------------------------------------

// createPlayer registers pointer-lock/key listeners on `document` at
// construction and reads document.pointerLockElement in disable(); tests run
// in a plain node environment, so install the minimum it touches. Same shape
// as test/remotecats.test.js's withFakeDocument.
function withFakeDocument() {
  const prev = globalThis.document;
  globalThis.document = {
    addEventListener() {},
    pointerLockElement: null,
    exitPointerLock() {},
  };
  return () => {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  };
}

describe('player.pounce — the hop on a live avatar', () => {
  let restoreDoc;
  let player;
  let cat;

  beforeEach(() => {
    restoreDoc = withFakeDocument();
    const camera = new THREE.PerspectiveCamera();
    player = createPlayer(camera, { addEventListener() {} });
    cat = new THREE.Object3D();
    player.setAvatar(cat, 3.5);
    player.enable();
  });

  afterEach(() => restoreDoc());

  // Six 0.05s frames is exactly the 0.3s window; the arc peaks on frame 3.
  const FRAME = 0.05;
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) player.update(FRAME, [], null);
  };

  it('lifts the cat off the ground and brings it back down within the window', () => {
    expect(cat.position.y).toBe(0);
    player.pounce(BASE_POUNCE_ARC);
    step(1);
    expect(cat.position.y).toBeGreaterThan(0);
    step(2);
    expect(cat.position.y).toBeCloseTo(BASE_POUNCE_HOP, 3); // apex, frame 3
    step(3);
    expect(cat.position.y).toBe(0);                          // landed, frame 6
    expect(player.hopY).toBe(0);
  });

  it('Spring Paws visibly clears the unskilled hop the whole way up', () => {
    const heights = (arc) => {
      const p = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
      const c = new THREE.Object3D();
      p.setAvatar(c, 3.5);
      p.enable();
      p.pounce(arc);
      const ys = [];
      for (let i = 0; i < 6; i++) {
        p.update(FRAME, [], null);
        ys.push(c.position.y);
      }
      return ys;
    };
    const base = heights(pounceArc({ skills: [] }));
    const spring = heights(pounceArc({ skills: ['spring-paws'] }));
    for (let i = 0; i < base.length; i++) {
      if (base[i] === 0) expect(spring[i]).toBe(0);          // both land together
      else expect(spring[i]).toBeGreaterThan(base[i]);
    }
    expect(Math.max(...spring)).toBeCloseTo(SPRING_PAWS_HOP, 3);
  });

  it('never touches perchY — a hop cannot become a perch', () => {
    player.pounce(pounceArc({ skills: ['spring-paws'] }));
    for (let i = 0; i < 8; i++) {
      player.update(FRAME, [], null);
      // perchY is what bestPerch/canReach climb FROM, what goldMice.checkFind
      // matches against, and what gates the collider push. The hop must be
      // invisible to all three.
      expect(player.perchY).toBe(0);
    }
  });

  it('adds to perchY rather than replacing it, and lands back on it exactly', () => {
    player.perchY = 2.6;              // standing on a rooftop ridge
    cat.position.set(0, 2.6, 0);
    player.pounce(BASE_POUNCE_ARC);
    step(3);
    expect(cat.position.y).toBeCloseTo(2.6 + BASE_POUNCE_HOP, 3);
    step(3);
    expect(cat.position.y).toBe(2.6); // exactly, not 2.6 + epsilon
    expect(player.perchY).toBe(2.6);
  });

  it('survives a zero-length frame on the frame the hop begins', () => {
    // hopOffset is 0 at BOTH ends of the arc, so an exit condition that
    // watched the OFFSET cancelled the hop whenever hopTime was still 0 —
    // which is precisely what a dt of 0 leaves behind on the first frame.
    // dt comes from THREE.Clock.getDelta(), and browsers clamp timer
    // resolution for Spectre mitigation (Firefox to 1ms by default), so two
    // renders inside one clock tick really do yield 0. The symptom was a
    // pounce that silently lost its bounce, at a rate nobody could
    // reproduce on purpose. player.js clears on the WINDOW expiring instead.
    player.pounce(BASE_POUNCE_ARC);
    player.update(0, [], null);
    expect(cat.position.y).toBe(0);   // no lift yet — no time has passed
    step(3);
    expect(cat.position.y).toBeCloseTo(BASE_POUNCE_HOP, 3); // still airborne
    step(3);
    expect(cat.position.y).toBe(0);   // and still lands exactly
  });

  it('does not drift across repeated pounces', () => {
    for (let i = 0; i < 5; i++) {
      player.pounce(pounceArc({ skills: ['spring-paws'] }));
      step(8);
      expect(cat.position.y).toBe(0);
    }
  });

  it('keeps pushing the cat out of colliders mid-hop', () => {
    // The whole reason the hop is not stored in perchY: player.js skips the
    // collider push whenever perchY !== 0, so a hop that lived there would
    // let a pouncing cat cross a building.
    const wall = { x: 0, z: 0, r: 1.5 };
    cat.position.set(0.2, 0, 0.1);
    player.pounce(pounceArc({ skills: ['spring-paws'] }));
    let sawAir = false;
    for (let i = 0; i < 5; i++) {
      player.update(FRAME, [wall], null);
      if (player.hopY > 0) sawAir = true;
      const d = Math.hypot(cat.position.x - wall.x, cat.position.z - wall.z);
      expect(d).toBeGreaterThanOrEqual(wall.r + 0.35 - 1e-9);
    }
    expect(sawAir).toBe(true); // the frames above really were airborne ones
  });

  it('a flat arc leaves the cat exactly where the old pounce did', () => {
    player.pounce(FLAT_POUNCE_ARC);
    for (let i = 0; i < 8; i++) {
      player.update(FRAME, [], null);
      expect(cat.position.y).toBe(0);
    }
  });

  it('halt(), disable() and setAvatar() all leave the cat on the ground', () => {
    const midHop = (act) => {
      player.pounce(pounceArc({ skills: ['spring-paws'] }));
      step(2);
      expect(player.hopY).toBeGreaterThan(0);
      act();
      expect(player.hopY).toBe(0);
    };
    // halt(): the perch branch of doPounceOrClimb and main.js's scare freeze
    // both call it, so neither can strand a live arc on top of a perch.
    midHop(() => player.halt());
    player.enable();
    midHop(() => player.disable());
    player.enable();
    midHop(() => player.setAvatar(cat, 3.5));
  });

  it('leaves the cat grounded if the walk ends mid-hop', () => {
    player.pounce(pounceArc({ skills: ['spring-paws'] }));
    step(2);
    player.disable();                 // endWalk
    player.update(FRAME, [], null);   // ignored while disabled
    player.enable();
    player.update(FRAME, [], null);
    expect(cat.position.y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The press: doPounceOrClimb hands the live save's arc to player.pounce
//
// Same failure shape CF-10a had (bestPerch called with four arguments, so the
// budget silently defaulted and Spring Paws did nothing in the running game):
// an arc that exists in player.js but is never handed the save is an ability
// that is built, tested and inert.
// ---------------------------------------------------------------------------

describe('doPounceOrClimb — the hop arc is read per press (v18 CF-9a)', () => {
  function harness(state, { reducedMotion } = {}) {
    const progression = { state, recordFeat() {}, addPoints() {} };
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const session = {
      areaData: { perches: [] },      // nothing in reach: always a plain pounce
      cat: { position: new THREE.Vector3(0, 0, 0) },
      perched: null,
      pounceCooldown: 0,
      reducedMotion,
      fx: { burst() {} },
    };
    const arcs = [];
    const player = { perchY: 0, halt() {}, pounce(arc) { arcs.push(arc); } };
    const { doPounceOrClimb } = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player, progression, log,
      hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    const press = () => { session.pounceCooldown = 0; doPounceOrClimb(); };
    return { session, press, arcs };
  }

  it('gives an unskilled press the baseline arc', () => {
    const h = harness({ skills: [], feats: {} });
    h.press();
    expect(h.arcs).toEqual([BASE_POUNCE_ARC]);
  });

  it('gives a Spring Paws press the taller arc', () => {
    const h = harness({ skills: ['spring-paws'] });
    h.press();
    expect(h.arcs[0].height).toBe(SPRING_PAWS_HOP);
  });

  it('reads the save live, so the skill earned mid-walk lifts the NEXT press', () => {
    // The precedent this follows is climbBudget's: computed inside
    // doPounceOrClimb, never captured at walk start.
    const state = { skills: [], feats: { perch: 9 } };
    const h = harness(state);
    h.press();
    expect(h.arcs[0].height).toBe(BASE_POUNCE_HOP);
    state.feats.perch = 10;           // 10th vantage perch reached
    h.press();
    expect(h.arcs[1].height).toBe(SPRING_PAWS_HOP);
  });

  it('honours the walk\'s reducedMotion snapshot', () => {
    const h = harness({ skills: ['spring-paws'] }, { reducedMotion: true });
    h.press();
    expect(h.arcs[0].height).toBe(0);
  });

  it('treats a session with no reducedMotion field as motion-allowed', () => {
    const h = harness({ skills: [] });
    h.press();
    expect(h.arcs[0].height).toBe(BASE_POUNCE_HOP);
  });

  it('still sets the pounce pose window the arc is tied to', () => {
    const h = harness({ skills: [] });
    h.press();
    expect(h.session.pounceTime).toBe(POUNCE_HOP_TIME);
    expect(h.session.pounceCooldown).toBe(1.2);
  });
});

// ---------------------------------------------------------------------------
// The lift must not become distance
//
// game/avatar.js measures several proximity checks in 3D against the cat's
// position. The pounce hunt catch's radius (critters.pounceCatch, 0.9) is the
// SAME SIZE as the Spring Paws arc, so a cat measured from its drawn body
// would be exactly out of range of a squirrel standing directly underneath
// it — the earned ability making its own signature move harder. avatar.js
// therefore projects onto player.perchY before measuring. These drive the
// real updateAvatar, so the projection is pinned rather than described.
// ---------------------------------------------------------------------------

describe('updateAvatar measures from the paws, not the drawn body', () => {
  const part = () => new THREE.Object3D();

  function avatarHarness() {
    const cat = new THREE.Object3D();
    cat.userData = {
      breed: 'tabby',
      parts: {
        body: part(), head: part(), tail: part(),
        tailPivots: [part(), part()],
        legs: [part(), part(), part(), part()],
        earL: part(), earR: part(),
      },
    };
    const player = {
      perchY: 0, speedFactor: 1, speed: 0,
      inputActive: false, stalking: false,
      forward: () => new THREE.Vector3(0, 0, -1),
    };
    const hunted = [];
    const batted = [];
    const s = {
      cat,
      perched: null,
      freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0,
      idleTime: 0, stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0,
      pose: 'follow',
      net: null,
      balkedPuddles: new Set(),
      areaData: { puddles: [], boxes: [] },
      fx: { burst() {} },
      critters: {
        setFleeModifier() {}, markStalked() {},
        catchAt: () => null,
        pounceCatch: (pos) => { hunted.push(pos.clone()); return null; },
      },
      toy: { active: true, idleTime: 0, mesh: { position: new THREE.Vector3(0, 0.2, 0) }, bat: () => batted.push(1), retrieve() {} },
      batReady: true, batCount: 0,
      toyGhost: { visible: false, position: new THREE.Vector3() },
      remotes: { list: [] },
      groomTimers: new Map(),
    };
    const { updateAvatar } = createAvatarUpdater({
      player,
      progression: { state: { equipped: { collar: 'none', feet: 'none' } }, recordSighting() {} },
      settings: { get: () => false },
      log: { award() {}, awardOnce: () => 0 },
      hud: { toast() {} },
      audio: { landThump() {}, step() {}, purr() {}, fanfare() {} },
      petNameFor: () => 'x', completeTag() {}, noteBat() {},
    });
    return { s, cat, player, updateAvatar, hunted, batted };
  }

  it('hunts from the ground plane while the cat is drawn mid-arc', () => {
    const h = avatarHarness();
    // Mid-hop: the renderer has already put the cat SPRING_PAWS_HOP above
    // its perch (player.js writes perchY + hopOffset); perchY itself is 0.
    h.cat.position.set(3, SPRING_PAWS_HOP, 4);
    h.s.pounceTime = 0.2;
    h.updateAvatar(h.s, 1 / 60, 0);
    expect(h.hunted).toHaveLength(1);
    expect(h.hunted[0].y).toBe(0);                    // projected onto perchY
    expect(h.hunted[0].x).toBe(3);
    expect(h.hunted[0].z).toBe(4);
  });

  it('projects onto the perch, not onto zero, when the cat is perched', () => {
    const h = avatarHarness();
    h.player.perchY = 2.6;
    h.cat.position.set(0, 2.6 + BASE_POUNCE_HOP, 0);
    h.s.pounceTime = 0.2;
    h.updateAvatar(h.s, 1 / 60, 0);
    expect(h.hunted[0].y).toBe(2.6);
  });

  it('still bats the yarn ball the cat is hopping over', () => {
    // The bat radius is 0.5 and the ball sits at y 0.2. A Spring Paws apex
    // puts 0.7 of vertical between them on its own, which is outside the
    // radius before any horizontal offset at all — so unprojected, a cat
    // could not bat a ball it was pouncing straight onto. 0.3 horizontal is
    // comfortably in range once projected (0.36) and out of it if the
    // projection is ever removed (0.76).
    const h = avatarHarness();
    h.cat.position.set(0.3, SPRING_PAWS_HOP, 0);
    h.updateAvatar(h.s, 1 / 60, 0);
    expect(h.batted).toHaveLength(1);
  });
});
