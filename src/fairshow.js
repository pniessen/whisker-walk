// =============================================================================
// The Fairground's games, finds and visitors in the walk: the simulations
// (src/fairgames.js, src/fairvisitors.js) drawn, and the cat's part in them.
//
// game/walk.js builds one for a Fairground walk and hands it to the rides
// (src/fairlive.js `attach`), which run it once a frame after the rides have
// moved her. game/interactions.js asks actionFor() for the prompt and calls
// act() on E; a meow goes to meow().
//
// WHAT IT ADDS TO THE SCENE (test/fairgames.test.js pins the totals): the
// visitors (one mesh a person), the juggler and his three balls, the runaway
// balloon, the wisp of candyfloss, and the picture in the crystal ball. None
// of them casts a shadow; the people get the same contact shadow a villager
// has (`groups`, followed by the walk's decals). The tins, the ducks and the
// bell's marker are the meshes world/fair.js built. update() allocates
// nothing.
//
// THE PEOPLE (the people kit, src/people/, in the fair's pack with this file;
// lifelike people, Task 14): each visitor is the person its look spot gives,
// one mesh a person, a pair's child a second person with a group of its own
// where the simulation has it (childX/childZ/childYaw). They walk by their
// own metres walked, say hello with a wave or a kneel on one knee (an older
// person bows), look at her only when stopped (watching or saying hello),
// never while walking; the juggler is dressed by hand at 1.76 m and each hand
// follows the nearest ball. Their soft bumps (each person's fixed circles,
// rulings R30/R32/R36) are one list updated in place, `bumps`, that the walk
// hands to player.update (test/fairshow.people.test.js).
// =============================================================================
import * as THREE from 'three';
import { createFairGames, GAME } from './fairgames.js';
import { createFairVisitors, visitorCount, VISITOR } from './fairvisitors.js';
import { createPeopleKit } from './people/index.js';
import { litMaterial } from './render/materials.js';
import { withLocalUuids } from './world/localuuids.js';
import { FLAT_GROUND } from './ground.js';

export const SHOW = Object.freeze({
  TIN_FALL: 0.5,       // seconds a batted tin takes to tumble to rest
  TIN_BACK: 0.45,      // and to hop back onto the shelf
  MARKER_UP: 0.55,     // seconds the bell's marker takes to shoot up
  MARKER_HOLD: 1.3,    // and stays there
  MARKER_DOWN: 0.9,    // and slides back down
  BALLOON_Y: 1.25,     // how high the runaway balloon floats (its string hangs to a cat's reach)
  PFF: 0.7,            // seconds a caught balloon takes to go down
  JUGGLE: 2.3,         // radians a second round the juggler's pattern
});

// The juggler with the people kit, dressed by hand at 1.76 m (spec,
// "Behaviour details"), in a T-shirt.
const JUGGLER = Object.freeze({ x: 311.5, z: 77.25, kind: 'adult', sex: 'm', top: Object.freeze({ kind: 'tshirt' }), height: 1.76 });
// his hands: the juggle pose's upper arm and forearm pitch (src/people/pose.js
// juggling), the hand's middle along it (in hand lengths), how far out from
// the shoulder and ahead of him a hand is, how far up and down it may follow
// a ball from its place, how far under the ball it stays, and its ease (1/s)
const JUGGLE_UA = 0.35;
const JUGGLE_FA = 1.25;
const HAND_MID = 0.46;
const HAND_OUT = 0.03;
const HAND_AHEAD = 0.36;
const HAND_UP = 0.16;
const HAND_DOWN = 0.06;
const HAND_GAP = 0.03;
const HAND_EASE = 12;
// a child walks while it moves faster than this (m/s); anyone keeps their
// stride this long after they stop (s)
const WALK_MIN = 0.05;
const WALK_HOLD = 0.25;
// a hello that comes mid-stride: the feet come together (standing) this long
// first, so the wave or the kneel starts from a stand (s)
const STRIDE_STOP = 0.3;

const ease = (from, to, k) => from + (to - from) * Math.min(1, Math.max(0, k));
const smooth = (k) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };
const JUGGLE_COLORS = Object.freeze([0xe2433a, 0x4eb86a, 0xf7c93b]);

// createFairShow(scene, area, opts) → the games, finds and visitors of one walk.
//   area               world/fair.js's record
//   opts.swept(x, z)   where a ride sweeps (src/fairsim.js): the visitors keep out
//   opts.strays        the quality tier's count knob (src/render/quality.js): how many visitors
//   opts.camera        the game's camera (the crystal ball's picture faces it)
//   opts.portrait()    → a picture of her own cat (a data URL, src/thumbnails.js), or null
//   opts.coat          her coat's colour, for the crystal ball when there is no picture
//   opts.onEvent(e)    every event of the games, the finds and the visitors
//   opts.seed          their own dice
//   opts.people        the people kit's factory (src/people/index.js createPeopleKit, its default)
//   opts.lodNear()     the live rung's near/far switch distance (the kit's own 12 m without it)
export function createFairShow(scene, area, {
  swept = () => false, strays = 22, camera = null, portrait = () => null, coat = 0xc8a070,
  reducedMotion = false, onEvent = () => {}, ground = FLAT_GROUND, seed, people: makeKit = createPeopleKit, lodNear,
} = {}) {
  const games = createFairGames(area, seed === undefined ? {} : { seed: `${seed}-games` });
  // (a visitor saying hello holds still: ruling R41, src/fairvisitors.js)
  const visitors = createFairVisitors(area, {
    count: visitorCount(strays), swept, ...(seed === undefined ? {} : { seed: `${seed}-visitors` }),
  });
  const A = area.anchors;
  const gy = (x, z) => (ground.flat ? 0 : ground.y(x, z));
  const added = [];
  const groups = [];   // the people: for the walk's contact shadows
  const disposable = [];
  const noCast = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.userData.noCast = true; } }); return o; };
  const place = (o) => { scene.add(o); added.push(o); return o; };
  // the people kit: built inside the show's own uuid block, so its draws
  // come from that local stream and the real count is unchanged
  let kit = null;
  // the soft bumps: every person's circles, world x/z, updated in place
  const bumps = [];

  const built = withLocalUuids('fair-show', () => {
    kit = (typeof makeKit === 'function' ? makeKit : createPeopleKit)({ camera, reducedMotion, ...(typeof lodNear === 'function' ? { lodNear } : {}) });
    const mat = litMaterial(0xffffff, { vertexColors: true, flatShading: true });
    disposable.push(mat);
    const tinted = (geo, hex) => {
      const c = new THREE.Color(hex);
      const n = geo.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      disposable.push(geo);
      return geo;
    };

    // ---- the visitors ----
    // (each person in a group of its own, the figure at its middle, so a
    // pair's child stands where the simulation has it)
    const figures = [];
    const personGroup = (name, person, x, z, yaw) => {
      const group = new THREE.Group();
      group.name = name;
      group.add(person.figure);
      group.position.set(x, gy(x, z), z);
      group.rotation.y = yaw + Math.PI;
      noCast(group);
      place(group);
      groups.push(group);
      return group;
    };
    const figureOf = (person, group, v, child, juggler) => {
      const f = { person, group, v, child, juggler, mode: 'stand', walked: 0, walkFor: 0, stopFor: 0, lastX: 0, lastZ: 0, sc: null,
        gaze: kit.createGaze(person.look), circles: kit.bumpCircles(person.look), at: bumps.length, upper: null };
      for (const c of f.circles) bumps.push({ x: 0, z: 0, r: c.r });
      figures.push(f);
      return f;
    };
    for (const v of visitors.list) {
      const spot = kit.buildSpot({ x: v.look.x, z: v.look.z });
      figureOf(spot.people[0], personGroup(v.id, spot.people[0], v.x, v.z, v.yaw), v, false, false);
      if (spot.people[1]) {
        const kid = figureOf(spot.people[1], personGroup(`${v.id}-child`, spot.people[1], v.childX, v.childZ, v.childYaw), v, true, false);
        kid.lastX = v.childX;
        kid.lastZ = v.childZ;
      }
    }

    // ---- the juggler, and his three balls ----
    // he faces where a cat would watch him from
    const jugYaw = Math.atan2(A.jugglerWatch.x - A.juggler.x, A.jugglerWatch.z - A.juggler.z);
    // dressed by hand, at 1.76 m
    const jugSpot = kit.buildSpot(JUGGLER);
    const juggler = personGroup('fair-juggler', jugSpot.people[0], A.juggler.x, A.juggler.z, jugYaw);
    const jug = figureOf(jugSpot.people[0], juggler, null, false, true);
    // where in the pose's rotations each upper arm's pitch is (the bones are in the pose's order)
    const order = jugSpot.people[0].skeleton.bones;
    jug.upper = [order.indexOf(jugSpot.people[0].bones.upperArmL) * 3, order.indexOf(jugSpot.people[0].bones.upperArmR) * 3];
    jug.hands = [0, 0]; // each hand's height, eased (m, from the ground)
    const balls = JUGGLE_COLORS.map((hex, i) => {
      const m = new THREE.Mesh(tinted(new THREE.IcosahedronGeometry(GAME.BALL_R, 1), hex), mat);
      m.name = `fair-juggle-ball-${i}`;
      return place(noCast(m));
    });

    // ---- the runaway balloon: one mesh, balloon, knot and string ----
    const bg = new THREE.SphereGeometry(0.3, 10, 8).scale(1, 1.18, 1).translate(0, 0.36, 0);
    const knot = new THREE.ConeGeometry(0.05, 0.08, 5).translate(0, -0.02, 0);
    const string = new THREE.CylinderGeometry(0.008, 0.008, 0.85, 4).translate(0, -0.48, 0);
    const paint = (geo, hex) => { const g = geo.toNonIndexed(); geo.dispose(); return tinted(g, hex); };
    const parts = [paint(bg, 0xe2433a), paint(knot, 0xb8322c), paint(string, 0xf4f0e8)];
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const size = name === 'uv' ? 2 : 3;
      const total = parts.reduce((n, g) => n + g.getAttribute(name).count, 0);
      const arr = new Float32Array(total * size);
      let o = 0;
      for (const g of parts) { arr.set(g.getAttribute(name).array, o); o += g.getAttribute(name).array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    disposable.push(merged);
    const balloon = new THREE.Mesh(merged, mat);
    balloon.name = 'fair-runaway-balloon';
    place(noCast(balloon));

    // ---- the wisp of candyfloss: a pink puff, hung on her head when it sticks ----
    const wisp = new THREE.Mesh(tinted(new THREE.IcosahedronGeometry(0.04, 1).scale(1.5, 0.8, 0.9), 0xf9a8cf), mat);
    wisp.name = 'fair-candyfloss-wisp';
    wisp.visible = false;
    noCast(wisp);

    // ---- the picture in the crystal ball: made the first time it is looked into ----
    const faceMat = new THREE.SpriteMaterial({ color: coat, transparent: true, opacity: 0, depthWrite: false });
    disposable.push(faceMat);
    const face = new THREE.Sprite(faceMat);
    face.name = 'fair-crystal-face';
    face.scale.setScalar(0.42);
    face.visible = false;
    place(face);

    return { figures, jugFig: jug, juggler, balls, balloon, wisp, face, faceMat };
  });

  // the bumps are where everyone stands before the first frame (the walk's
  // first player.update comes before the show's first update)
  placeBumps();

  // ---- the game pieces world/fair.js built ---------------------------------------------
  const tinMeshes = area.rides.tinCans ?? [];
  const duckMeshes = area.rides.ducks ?? [];
  const marker = area.rides.bell?.marker ?? null;
  const markerFrom = area.rides.bell?.from ?? 0;
  const markerTo = area.rides.bell?.to ?? 0;
  const duckY = duckMeshes[0]?.position.y ?? 0.1;
  // the shelf's own directions: along it, and out behind it (away from the counter)
  const shelf = (() => {
    const a = tinMeshes[0]?.userData.home ?? { x: 0, y: 0, z: 0 };
    const b = tinMeshes[2]?.userData.home ?? { x: 1, y: 0, z: 0 };
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const ax = (b.x - a.x) / len;
    const az = (b.z - a.z) / len;
    const mid = tinMeshes[1]?.userData.home ?? a;
    let bx = -az;
    let bz = ax;
    if ((A.tinCanCounter.x - mid.x) * bx + (A.tinCanCounter.z - mid.z) * bz > 0) { bx = -bx; bz = -bz; }
    return { ax, az, bx, bz, y: a.y, mid };
  })();
  // where each tin lies once it is down: along the shelf, either side of the middle
  const TIN_REST = Object.freeze([-0.62, 0.48, 0.66, -0.4, 0.3, -0.16]);
  const tins = tinMeshes.map((mesh, i) => ({ mesh, k: 0, to: 0 })); // k: 0 on the stack, 1 lying down
  let tinsMoving = false;
  // the bell's marker: how far up (0..1), and the pounce that sent it
  const mark = { level: 0, t: -1, shown: 0, hits: 0 };

  const simCat = { x: 0, y: 0, z: 0, perched: false, perch: null, inWater: false, speed: 0, pouncing: false, fx: 0, fz: -1, mouthFull: false };
  let faceTried = false;
  let faceShown = 0;
  let wispOn = null; // the head the wisp hangs on
  let pff = -1;      // seconds since the balloon was caught

  function readCat(cat, player, session) {
    const perch = session.perched ?? null;
    simCat.x = cat.position.x;
    simCat.z = cat.position.z;
    simCat.y = perch ? perch.y ?? 0 : 0;
    simCat.perched = !!perch;
    simCat.perch = perch;
    simCat.inWater = !!player.inWater;
    simCat.speed = player.speed ?? 0;
    simCat.pouncing = (session.pounceTime ?? 0) > 0;
    simCat.fx = -Math.sin(cat.rotation.y);
    simCat.fz = -Math.cos(cat.rotation.y);
    simCat.mouthFull = !!session.carry?.mouth?.held;
    return simCat;
  }

  function poseTins(dt) {
    if (!tinsMoving) return;
    tinsMoving = false;
    for (let i = 0; i < tins.length; i++) {
      const t = tins[i];
      const want = games.tins[i].down ? 1 : 0;
      if (t.k === want) continue;
      t.k = want > t.k ? Math.min(1, t.k + dt / SHOW.TIN_FALL) : Math.max(0, t.k - dt / SHOW.TIN_BACK);
      if (t.k !== want) tinsMoving = true;
      const home = t.mesh.userData.home;
      const k = smooth(t.k);
      const side = TIN_REST[i % TIN_REST.length];
      // off the stack: along the shelf to its place, a little back, up and over on the way
      const x = home.x + (shelf.mid.x + shelf.ax * side - home.x) * k + shelf.bx * 0.08 * k;
      const z = home.z + (shelf.mid.z + shelf.az * side - home.z) * k + shelf.bz * 0.08 * k;
      const lie = shelf.y + 0.09;
      const y = home.y + (lie - home.y) * k + Math.sin(Math.PI * t.k) * 0.32;
      t.mesh.position.set(x, y, z);
      t.mesh.rotation.set(0, 0, 0);
      // tumbling over to lie on its side, along the shelf
      t.mesh.rotateOnWorldAxis(AXIS.set(shelf.bx, 0, shelf.bz), (side < 0 ? 1 : -1) * (Math.PI / 2) * k + Math.sin(Math.PI * t.k) * 2.2);
    }
  }
  const AXIS = new THREE.Vector3();

  function poseDucks(t, cat) {
    for (let i = 0; i < duckMeshes.length; i++) {
      const d = games.ducks[i];
      const m = duckMeshes[i];
      if (d.held) {
        // in her mouth: just ahead of her nose
        m.position.set(cat.position.x + simCat.fx * 0.34, cat.position.y + 0.3, cat.position.z + simCat.fz * 0.34);
        m.rotation.set(0, cat.rotation.y + Math.PI / 2, 0);
      } else {
        const bob = reducedMotion ? 0 : Math.sin(t * 1.7 + i * 1.3) * 0.012;
        m.position.set(d.x, duckY + bob, d.z);
        m.rotation.set(0, d.yaw, reducedMotion ? 0 : Math.sin(t * 1.3 + i) * 0.06);
      }
    }
  }

  function poseMarker(dt) {
    if (!marker) return;
    if (mark.hits !== games.bell.hits) { mark.hits = games.bell.hits; mark.t = 0; mark.level = games.bell.level; mark.from = mark.shown; }
    if (mark.t < 0) return;
    mark.t += dt;
    const hold = games.bell.rung ? SHOW.MARKER_HOLD * 1.6 : SHOW.MARKER_HOLD;
    if (mark.t < SHOW.MARKER_UP) {
      const k = mark.t / SHOW.MARKER_UP;
      mark.shown = ease(mark.from ?? 0, mark.level, 1 - (1 - k) * (1 - k)); // fast off the pad, slowing to its top
    } else if (mark.t < SHOW.MARKER_UP + hold) {
      mark.shown = mark.level;
    } else {
      const k = (mark.t - SHOW.MARKER_UP - hold) / SHOW.MARKER_DOWN;
      mark.shown = ease(mark.level, 0, smooth(k));
      if (k >= 1) { mark.t = -1; mark.shown = 0; }
    }
    marker.position.y = markerFrom + (markerTo - markerFrom) * mark.shown;
  }

  // ---- the people --------------------------------------------------------------------------
  // One pose spec and one gaze options object for everyone, every frame.
  const spec = { mode: 'stand', t: 0, walked: 0, reducedMotion };
  const gazeOpts = { target: null, reducedMotion, near: null, turnBody: false };
  const seeAll = !camera; // (no camera, in a test: everyone counts as in view)
  const HER = new THREE.Vector3();
  // The held-out hand of a kneel or a bow (ruling R41): the head scratch's
  // held state and its guard (src/people/reach.js stepScratch), with no head
  // to reach for (no touch at the Fairground: the hand is held out low and
  // still), kept clear of her volumes and drawn back, rising, when she comes
  // close. One options object; her volumes filled in place once a frame.
  const scratchOpts = { headTop: null, volumes: null, mayPlan: false };
  let herVol = null;

  // Each person where the simulation has them (a pair's child at its own
  // spot, facing its own way), and whether they are walking: a grown-up while
  // the simulation moves it, a child while it moves faster than WALK_MIN (its
  // own metres walked counted here). WALK_HOLD keeps a stop-start stroll in
  // its stride rather than flicking to standing for a frame.
  function placeFigures(dt) {
    const figs = built.figures;
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i];
      if (f.juggler) continue;
      const v = f.v;
      let x, z, yaw, moved;
      if (f.child) {
        x = v.childX; z = v.childZ; yaw = v.childYaw;
        const step = Math.hypot(x - f.lastX, z - f.lastZ);
        f.walked += step;
        f.lastX = x; f.lastZ = z;
        moved = dt > 0 && step > WALK_MIN * dt;
      } else {
        x = v.x; z = v.z; yaw = v.yaw;
        f.walked = v.walked;
        moved = v.moving;
      }
      f.walkFor = moved ? WALK_HOLD : Math.max(0, f.walkFor - dt);
      f.group.position.set(x, gy(x, z), z);
      f.group.rotation.y = yaw + Math.PI;
      f.group.updateWorldMatrix(false, false);
    }
  }

  // The soft bumps: each person's circles (figure frame) turned and moved by
  // where they stand. In place: the same objects every frame.
  function placeBumps() {
    const figs = built.figures;
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i];
      const g = f.group;
      const c = Math.cos(g.rotation.y);
      const sn = Math.sin(g.rotation.y);
      for (let k = 0; k < f.circles.length; k++) {
        const b = f.circles[k];
        const o = bumps[f.at + k];
        o.x = g.position.x + b.x * c + b.z * sn;
        o.z = g.position.z - b.x * sn + b.z * c;
      }
    }
  }

  // What each visitor does, by the priority: a hello (a wave, or a kneel on
  // one knee: an older person bows, as pose() has it), walking, standing. A
  // child walks while it moves, waves when its grown-up waves, else stands. A
  // grown-up looks at her only when stopped, watching a ride or saying hello;
  // its child looks when it does and is not walking (and is near exactly when
  // the grown-up is: R27). Only people in view are posed; the choice is made
  // for all.
  function poseFigures(t, dt, cat) {
    const parts = cat?.userData?.parts;
    const head = parts?.head;
    const her = head ? head.getWorldPosition(HER) : null;
    let volsDone = false;
    const figs = built.figures;
    let adult = null; // the last grown-up: a child follows its own
    let adultLooks = false;
    for (let i = 0; i < figs.length; i++) {
      const f = figs[i];
      if (f.juggler) continue;
      const v = f.v;
      const walking = f.walkFor > 0;
      let mode;
      let looks;
      if (!f.child) {
        const hello = v.hello > 0;
        // a hello that comes mid-stride stops the stride first (STRIDE_STOP standing)
        if (hello && f.mode === 'walk') f.stopFor = STRIDE_STOP;
        if (f.stopFor > 0) f.stopFor = hello ? f.stopFor - dt : 0;
        mode = hello ? (f.stopFor > 0 ? 'stand' : v.helloKind === 'wave' ? 'wave' : 'kneel') : walking ? 'walk' : 'stand';
        if (mode === 'kneel' && f.person.look.kind === 'older') mode = 'bow';
        looks = !!her && mode !== 'walk' && (hello || v.mode === 'watch');
        adult = f;
        adultLooks = looks;
      } else {
        // (it waves when its grown-up does: after the grown-up's stride has stopped)
        mode = walking ? 'walk' : adult.mode === 'wave' ? 'wave' : 'stand';
        looks = adultLooks && mode !== 'walk';
      }
      f.mode = mode;
      const holding = mode === 'kneel' || mode === 'bow';
      if (!holding) f.sc = null;
      else if (!f.sc) f.sc = kit.createScratch(); // a fresh one each hello (R18)
      if (!seeAll && !f.person.inView) continue;
      spec.mode = mode;
      spec.t = t;
      spec.walked = f.walked;
      kit.pose(f.person, spec);
      kit.applyPose(f.person, dt);
      gazeOpts.target = looks ? her : null;
      gazeOpts.near = f.child && looks ? adult.gaze.near : null;
      gazeOpts.turnBody = mode === 'kneel';
      kit.stepGaze(f.person, f.gaze, dt, t, gazeOpts);
      if (holding) {
        if (!volsDone && head && parts.body) herVol = kit.catVolumes(cat, herVol);
        volsDone = true;
        scratchOpts.volumes = head && parts.body ? herVol : null;
        kit.stepScratch(f.person, f.sc, dt, scratchOpts);
      }
    }
  }

  // The juggler: the juggle's forearms forward, each hand's height following
  // the nearest ball (eased, within a hand's reach of its place), by the
  // upper arm's pitch about the shoulder; his eyes blink, and his head keeps
  // to the juggle's own (it looks at no one: the gaze is given no target).
  const BALL_AT = new THREE.Vector3();
  function poseJugglerFigure(t, dt) {
    const f = built.jugFig;
    const p = f.person;
    const d = p.look.dims;
    if (!f.handRest) {
      f.handReach = d.forearm + HAND_MID * d.hand;
      f.handRest = d.shoulderY - (d.upperArm * Math.cos(JUGGLE_UA) + f.handReach * Math.cos(JUGGLE_UA + JUGGLE_FA));
      f.hands[0] = f.handRest;
      f.hands[1] = f.handRest;
    }
    const g = f.group;
    const c = Math.cos(g.rotation.y);
    const sn = Math.sin(g.rotation.y);
    const n = games.ball.out ? 2 : 3; // the ball she bats away is not in the cascade
    for (let h = 0; h < 2; h++) {
      const sd = h === 0 ? -1 : 1; // the figure's left, then its right
      const hx = sd * (d.shoulderX + HAND_OUT);
      let best = Infinity;
      let want = f.hands[h];
      for (let i = 0; i < n; i++) {
        // the ball in his own frame (the figure faces -z)
        const b = built.balls[i].position;
        const dx = b.x - g.position.x;
        const dz = b.z - g.position.z;
        BALL_AT.set(dx * c - dz * sn, b.y - g.position.y, dx * sn + dz * c);
        const dd = (BALL_AT.x - hx) ** 2 + (BALL_AT.y - f.hands[h]) ** 2 + (BALL_AT.z + HAND_AHEAD) ** 2;
        if (dd < best) { best = dd; want = BALL_AT.y - GAME.BALL_R - HAND_GAP; }
      }
      want = Math.min(f.handRest + HAND_UP, Math.max(f.handRest - HAND_DOWN, want));
      f.hands[h] += (want - f.hands[h]) * Math.min(1, dt * HAND_EASE);
    }
    f.mode = 'juggle';
    if (!seeAll && !p.inView) return;
    spec.mode = 'juggle';
    spec.t = t;
    spec.walked = 0;
    kit.pose(p, spec);
    // the upper arm's pitch that puts the hand at its height (a few Newton steps)
    const r = p.target.rot;
    for (let h = 0; h < 2; h++) {
      let th = JUGGLE_UA;
      for (let k = 0; k < 4; k++) {
        const y = d.shoulderY - d.upperArm * Math.cos(th) - f.handReach * Math.cos(th + JUGGLE_FA);
        const dy = d.upperArm * Math.sin(th) + f.handReach * Math.sin(th + JUGGLE_FA);
        th = Math.min(1.1, Math.max(0, th - (y - f.hands[h]) / Math.max(0.05, dy)));
      }
      r[f.upper[h]] = th;
    }
    kit.applyPose(p, dt);
    gazeOpts.target = null;
    gazeOpts.near = null;
    gazeOpts.turnBody = false;
    kit.stepGaze(p, f.gaze, dt, t, gazeOpts);
  }

  function poseJuggler(t, dt) {
    const out = games.ball.out;
    const jy = built.juggler.position.y;
    const yaw = built.juggler.rotation.y - Math.PI;
    const rx = Math.cos(yaw);   // his own right, on the ground
    const rz = -Math.sin(yaw);
    const fx = Math.sin(yaw);   // and the way he faces
    const fz = Math.cos(yaw);
    const n = out ? 2 : 3;
    for (let i = 0; i < 3; i++) {
      const b = built.balls[i];
      if (out && i === 2) {
        const ball = games.ball;
        b.position.set(ball.x, gy(ball.x, ball.z) + ball.y, ball.z);
        b.rotation.x = ball.spin;
        continue;
      }
      // a cascade: side to side between his hands, up and over
      const p = (reducedMotion ? 0.6 : t * SHOW.JUGGLE) + (i * Math.PI * 2) / n;
      const side = Math.sin(p) * 0.24;
      const up = 1.22 + Math.abs(Math.cos(p)) * 0.5;
      b.position.set(A.juggler.x + rx * side + fx * 0.3, jy + up, A.juggler.z + rz * side + fz * 0.3);
    }
    poseJugglerFigure(t, dt);
  }

  function poseBalloon(t, dt) {
    const s = games.balloon;
    const m = built.balloon;
    if (s.state === 'caught') {
      if (pff < 0) { m.visible = false; return; }
      // pff: it goes down small and soft, and is gone
      pff += dt;
      const k = Math.min(1, pff / SHOW.PFF);
      m.scale.setScalar(1 - 0.85 * smooth(k));
      m.position.y = gy(s.x, s.z) + SHOW.BALLOON_Y * (1 - smooth(k)) + 0.1;
      m.rotation.z = Math.sin(pff * 14) * 0.25 * (1 - k);
      if (k >= 1) { m.visible = false; pff = -1; }
      return;
    }
    const bob = reducedMotion ? 0 : Math.sin(t * 1.4) * 0.09;
    m.position.set(s.x, gy(s.x, s.z) + SHOW.BALLOON_Y + bob, s.z);
    m.rotation.z = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.08 + (s.shy ? 0.12 : 0);
  }

  function poseWisp(cat) {
    const want = games.wisp.t > 0;
    const head = cat.userData?.parts?.head ?? null;
    if (want && head && wispOn !== head) {
      // on her whiskers: beside her nose (the head's own frame; front is -z)
      built.wisp.position.set(0.075, -0.035, -0.19);
      head.add(built.wisp);
      wispOn = head;
    }
    built.wisp.visible = want && !!wispOn;
  }

  const TO_CAM = new THREE.Vector3();
  function poseFace(dt) {
    const ball = area.rides.crystalBall;
    if (!ball) return;
    const want = games.fortune.showing ? 1 : 0;
    if (want && !faceTried) {
      // her own picture, taken once, the first time she looks in
      faceTried = true;
      let url = null;
      try { url = portrait(); } catch { url = null; }
      if (url && typeof THREE.TextureLoader === 'function' && typeof Image !== 'undefined') {
        const tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        built.faceMat.map = tex;
        built.faceMat.color.set(0xffffff);
        built.faceMat.needsUpdate = true;
        disposable.push(tex);
      }
    }
    faceShown += (want - faceShown) * Math.min(1, dt * 3);
    if (faceShown < 0.01 && !want) { built.face.visible = false; built.faceMat.opacity = 0; return; }
    built.face.visible = true;
    built.faceMat.opacity = faceShown * (built.faceMat.map ? 0.95 : 0.7);
    // on the ball's near side, whichever way it is looked at
    ball.getWorldPosition(built.face.position);
    if (camera) {
      TO_CAM.copy(camera.position).sub(built.face.position).normalize();
      built.face.position.addScaledVector(TO_CAM, 0.26);
    }
  }

  const api = {
    games,
    visitors,
    groups,
    get meshes() { return added; },
    // each person ({ person, group, v, child, juggler,
    // mode, walked, gaze }), and their soft bumps, one list of { x, z, r }
    // updated in place each frame (walk.js hands it to player.update)
    get people() { return built.figures; },
    bumps,

    update(dt, t, { cat, player, session }) {
      const c = readCat(cat, player, session);
      games.step(dt, c);
      visitors.step(dt, c);
      const ev = games.events;
      for (let i = 0; i < ev.length; i++) {
        const e = ev[i];
        if (e.type === 'tins-down' || e.type === 'tins-restack') tinsMoving = true;
        else if (e.type === 'balloon-caught') pff = 0;
        onEvent(e);
      }
      ev.length = 0;
      const ve = visitors.events;
      for (let i = 0; i < ve.length; i++) onEvent(ve[i]);
      ve.length = 0;
      poseTins(dt);
      poseDucks(t, cat);
      poseMarker(dt);
      placeFigures(dt);
      if (!seeAll) kit.update();
      poseFigures(t, dt, cat);
      placeBumps();
      poseJuggler(t, dt);
      poseBalloon(t, dt);
      poseWisp(cat);
      poseFace(dt);
    },

    // What E would do for a game where the cat stands (fairgames.js actionFor), or null.
    actionFor() { return games.actionFor(simCat); },
    // E: does it. Returns whether anything happened.
    act(action) {
      const did = games.act(action, simCat);
      const ev = games.events;
      for (let i = 0; i < ev.length; i++) {
        if (ev[i].type === 'tins-down' || ev[i].type === 'tins-restack') tinsMoving = true;
        onEvent(ev[i]);
      }
      ev.length = 0;
      return did;
    },
    // A meow: the visitors near her say hello. Returns how many.
    meow(pos) {
      const n = visitors.meow(pos);
      const ve = visitors.events;
      for (let i = 0; i < ve.length; i++) onEvent(ve[i]);
      ve.length = 0;
      return n;
    },

    dispose() {
      for (const o of added) scene.remove(o);
      built.wisp.parent?.remove(built.wisp);
      for (const d of disposable) d.dispose?.();
      kit.dispose(); // every person's geometries, skeletons and the shared material
      // the tins back on their shelf, the ducks and the marker as they were built
      for (const t of tins) { const h = t.mesh.userData.home; t.mesh.position.set(h.x, h.y, h.z); t.mesh.rotation.set(0, 0, 0); t.k = 0; }
      if (marker) marker.position.y = markerFrom;
    },
  };
  return api;
}

export { VISITOR, visitorCount };
