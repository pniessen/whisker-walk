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
// visitors (the villager's figure, three meshes each), the juggler and his
// three balls, the runaway balloon, the wisp of candyfloss, and the picture in
// the crystal ball. None of them casts a shadow; the people get the same
// contact shadow a villager has (`groups`, followed by the walk's decals). The
// tins, the ducks and the bell's marker are the meshes world/fair.js built.
// update() allocates nothing.
// =============================================================================
import * as THREE from 'three';
import { createFairGames, GAME } from './fairgames.js';
import { createFairVisitors, visitorCount, VISITOR } from './fairvisitors.js';
import { buildTwolegFigure } from './critters.js';
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
export function createFairShow(scene, area, {
  swept = () => false, strays = 22, camera = null, portrait = () => null, coat = 0xc8a070,
  reducedMotion = false, onEvent = () => {}, ground = FLAT_GROUND, seed,
} = {}) {
  const games = createFairGames(area, seed === undefined ? {} : { seed: `${seed}-games` });
  const visitors = createFairVisitors(area, { count: visitorCount(strays), swept, ...(seed === undefined ? {} : { seed: `${seed}-visitors` }) });
  const A = area.anchors;
  const gy = (x, z) => (ground.flat ? 0 : ground.y(x, z));
  const added = [];
  const groups = [];   // the people: for the walk's contact shadows
  const disposable = [];
  const noCast = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.userData.noCast = true; } }); return o; };
  const place = (o) => { scene.add(o); added.push(o); return o; };

  const built = withLocalUuids('fair-show', () => {
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
    const people = visitors.list.map((v) => {
      const { figure, arm } = buildTwolegFigure({ x: v.look.x, z: v.look.z });
      const group = new THREE.Group();
      group.name = v.id;
      group.add(figure);
      group.position.set(v.x, gy(v.x, v.z), v.z);
      group.rotation.y = v.yaw + Math.PI;
      noCast(group);
      place(group);
      groups.push(group);
      return { v, group, figure, arm, crouch: 0 };
    });

    // ---- the juggler, and his three balls ----
    const jug = buildTwolegFigure({ x: 311.5, z: 77.25 });
    const juggler = new THREE.Group();
    juggler.name = 'fair-juggler';
    juggler.add(jug.figure);
    juggler.position.set(A.juggler.x, gy(A.juggler.x, A.juggler.z), A.juggler.z);
    // he faces where a cat would watch him from
    juggler.rotation.y = Math.atan2(A.jugglerWatch.x - A.juggler.x, A.jugglerWatch.z - A.juggler.z) + Math.PI;
    noCast(juggler);
    place(juggler);
    groups.push(juggler);
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

    return { people, juggler, jugArm: jug.arm, balls, balloon, wisp, face, faceMat };
  });

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

  function posePeople(t, dt) {
    for (let i = 0; i < built.people.length; i++) {
      const p = built.people[i];
      const v = p.v;
      p.group.position.set(v.x, gy(v.x, v.z), v.z);
      p.group.rotation.y = v.yaw + Math.PI;
      const stride = v.walked * 3.4 + i;
      const hello = v.hello > 0;
      // a crouch down to her height, or a wave
      const wantCrouch = hello && v.helloKind === 'crouch' ? 1 : 0;
      p.crouch += (wantCrouch - p.crouch) * Math.min(1, dt * 6);
      p.figure.scale.y = 1 - 0.3 * p.crouch;
      p.figure.position.y = v.moving && !reducedMotion ? Math.abs(Math.sin(stride)) * 0.03 : 0;
      p.figure.rotation.x = -0.28 * p.crouch; // leaning in towards her (the figure faces -z)
      if (hello) {
        p.arm.rotation.x = 0;
        p.arm.rotation.z = v.helloKind === 'wave' ? 2.6 + Math.sin(t * 9) * 0.3 : 1.2 + Math.sin(t * 5) * 0.15;
      } else {
        p.arm.rotation.z = 0.4;
        p.arm.rotation.x = v.moving && !reducedMotion ? Math.sin(stride) * 0.45 : 0;
      }
    }
  }

  function poseJuggler(t) {
    const out = games.ball.out;
    const jy = built.juggler.position.y;
    const yaw = built.juggler.rotation.y - Math.PI;
    const rx = Math.cos(yaw);   // his own right, on the ground
    const rz = -Math.sin(yaw);
    const fx = Math.sin(yaw);   // and the way he faces
    const fz = Math.cos(yaw);
    const n = out ? 2 : 3;
    built.jugArm.rotation.z = 1.0 + Math.sin(t * SHOW.JUGGLE * 2) * 0.35;
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
      posePeople(t, dt);
      poseJuggler(t);
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
      for (const p of built.people) p.group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
      built.juggler.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
      // the tins back on their shelf, the ducks and the marker as they were built
      for (const t of tins) { const h = t.mesh.userData.home; t.mesh.position.set(h.x, h.y, h.z); t.mesh.rotation.set(0, 0, 0); t.k = 0; }
      if (marker) marker.position.y = markerFrom;
    },
  };
  return api;
}

export { VISITOR, visitorCount };
