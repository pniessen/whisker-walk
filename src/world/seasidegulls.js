// =============================================================================
// THE SEASIDE'S GULLS (seasideplan.js SEASIDE_GULLS): herring gulls drawn as
// ONE merged, vertex-coloured, flat-shaded mesh for the whole flock, one draw
// call, no shadow pass, no skeleton. Part of the Seaside's chunk;
// seasidelife.js makes it once a walk.
//
// THE GULL. Low-poly and about 1.1 m across the wings: a white body, head and
// tail; grey wings with black tips; a yellow beak with a red spot on its lower
// edge; orange legs and webbed feet; dark eyes. Six parts share one template
// (body, head, two wings, two legs); each frame the template's vertices are
// written into the flock's position buffer through each part's own joint
// (head at the neck, wings at the shoulders, legs at the hips) and the gull's
// own placement. There is no real Math.random and no clock read: every pose is
// a pure function of the walk's seconds, the gull's hashed phase, and, for the
// hopper alone, where her cat is.
//
// THE MODES (the plan's): post and stand (idle: the head turns, now and then
// dips to peck); walk (ping-pongs along its heading, 16 s a round, legs
// stepping); glide (circles over the water, wings spread, now and then
// beating); hop (see below). Wings are folded (fold 1) when it is on the
// ground, spread (fold 0) and beating in the air; legs hang when it is down
// and tuck back in the air.
//
// THE ONE THAT HOPS OFF. A hop gull rests at its home or its away spot. When
// her cat comes within HOP_NEAR of it, it flies, in about 2.6 s, to its other
// spot, and only if that spot is farther from her cat than the one it leaves
// (by a margin) and the line to it leaves from her side's far end (her cat is
// behind the gull, never between it and where it goes): it never flies toward her, never follows her, and rests 5 s
// after landing before it will go again. It never pecks at her, never blocks
// her and has no collider.
//
// REDUCED MOTION freezes it: every gull holds its pose at t 0, the hopper
// stays put, and the gliders (which cannot stand still in the air) are not
// drawn. LOW and LITE draw fewer (plan rank).
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './localuuids.js';
import { litMaterial } from '../render/materials.js';
import { part } from './seasidedecor.js';
import { SEASIDE_GULLS, SEASIDE_POSTS, POST_TOP, HOP_NEAR, RANK_FOR_RUNG, footY } from './seasideplan.js';

export const FLY_SECONDS = 2.6;
export const HOP_REST = 5;
const WALK_ROUND = 16;
const BODY_Y = 0.23; // the body's middle above the feet
const TAU = Math.PI * 2;

const WHITE = 0xf6f4ef; const GREY = 0xa9b0b9; const BLACK = 0x22252a;
const YELLOW = 0xf2b522; const RED = 0xd9322b; const ORANGE = 0xf08a24; const DARK = 0x1b1b1d;

const P = { BODY: 0, HEAD: 1, WING_R: 2, WING_L: 3, LEG_R: 4, LEG_L: 5 };
const PIVOT = [
  [0, BODY_Y, 0], [0, 0.29, 0.15], [0.085, 0.3, 0.03], [-0.085, 0.3, 0.03], [0.04, 0.16, 0], [-0.04, 0.16, 0],
];

function tris(list, hex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(2), 3));
  return part(g, hex);
}
// a wing, the right one's points (x out, z forward) from its shoulder; the left mirrors x
function wingParts(side) {
  const m = (a) => [side * a[0] + PIVOT[side > 0 ? P.WING_R : P.WING_L][0], a[1] + PIVOT[P.WING_R][1], a[2] + PIVOT[P.WING_R][2]];
  const A = m([0, 0, 0.1]); const B = m([0, 0, -0.13]); const C = m([0.3, 0, 0.07]); const D = m([0.32, 0, -0.15]);
  const F = m([0.44, 0, 0.0]); const E = m([0.5, 0, -0.1]);
  return [tris([[A, C, D], [A, D, B]], GREY), tris([[C, F, E], [C, E, D]], BLACK)];
}
// the template: [{ geo, part }]
function template() {
  const out = [];
  const add = (geo, partId) => out.push({ geo, part: partId });
  add(part(new THREE.SphereGeometry(1, 7, 4).scale(0.1, 0.095, 0.22).translate(0, BODY_Y, 0), WHITE), P.BODY);
  add(part(new THREE.BoxGeometry(0.09, 0.02, 0.14).translate(0, BODY_Y + 0.025, -0.27), WHITE), P.BODY);
  add(part(new THREE.SphereGeometry(0.062, 6, 4).translate(0, BODY_Y + 0.11, 0.2), WHITE), P.HEAD);
  add(part(new THREE.ConeGeometry(0.022, 0.1, 5).rotateX(Math.PI / 2).translate(0, BODY_Y + 0.105, 0.31), YELLOW), P.HEAD);
  add(part(new THREE.BoxGeometry(0.016, 0.012, 0.022).translate(0, BODY_Y + 0.084, 0.335), RED), P.HEAD);
  for (const s of [-1, 1]) add(part(new THREE.BoxGeometry(0.012, 0.012, 0.012).translate(s * 0.045, BODY_Y + 0.122, 0.225), DARK), P.HEAD);
  for (const g of wingParts(1)) add(g, P.WING_R);
  for (const g of wingParts(-1)) add(g, P.WING_L);
  for (const [s, id] of [[1, P.LEG_R], [-1, P.LEG_L]]) {
    add(part(new THREE.BoxGeometry(0.018, 0.16, 0.018).translate(s * 0.04, 0.08, 0), ORANGE), id);
    add(part(new THREE.BoxGeometry(0.05, 0.012, 0.075).translate(s * 0.04, 0.006, 0.02), ORANGE), id);
  }
  return out;
}

const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export const NO_GULLS = Object.freeze({ mesh: null, gulls: Object.freeze([]), update() {}, dispose() {} });

export const createSeasideGulls = (opts = {}) => withLocalUuids('seaside-gulls-build', () => buildGulls(opts));

function buildGulls({ reducedMotion = false, rung = 0 } = {}) {
  const maxRank = RANK_FOR_RUNG(rung);
  const plan = SEASIDE_GULLS.filter((g) => g.rank <= maxRank && !(reducedMotion && g.mode === 'glide'));
  if (!plan.length) return NO_GULLS;
  const tpl = template();
  const per = tpl.reduce((n, p) => n + p.geo.attributes.position.count, 0);
  const partOf = new Uint8Array(per);
  { let k = 0; for (const p of tpl) for (let i = 0; i < p.geo.attributes.position.count; i++) partOf[k++] = p.part; }
  const merged = mergeGeometries(tpl.map((p) => p.geo), false);
  for (const p of tpl) p.geo.dispose();
  const base = merged.attributes.position.array.slice(); // the template's local positions
  const n = plan.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(per * n * 3);
  const col = new Float32Array(per * n * 3);
  for (let i = 0; i < n; i++) col.set(merged.attributes.color.array, i * per * 3);
  const nrm = new Float32Array(per * n * 3);
  for (let i = 0; i < n; i++) nrm.set(merged.attributes.normal.array, i * per * 3);
  merged.dispose();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  // everything lies within the beach and the bay: never culled by a stale sphere
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(10, 4, 0), 140);
  const mesh = withLocalUuids('seaside-gulls', () => {
    const m = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    m.name = 'seasideGulls';
    m.frustumCulled = false;
    m.userData.noCast = true;
    return m;
  });

  // each gull's state
  const gulls = plan.map((g) => {
    const ph = g.phase ?? hash01(g.id);
    const st = {
      g, ph, x: 0, y: 0, z: 0, yaw: g.yaw ?? 0, pitch: 0, roll: 0,
      fold: 1, flap: 0, tuck: 0, step: 0, peck: 0, turn: 0, bob: 0,
      // hop
      at: 'home', fly: -1, from: null, to: null, rest: 0, restYaw: g.yaw ?? 0,
    };
    return st;
  });

  const _q = new THREE.Quaternion(); const _qz = new THREE.Quaternion(); const _qg = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _m = new THREE.Matrix4(); const _pm = new THREE.Matrix4(); const _full = new THREE.Matrix4();
  const _v = new THREE.Vector3(); const _one = new THREE.Vector3(1, 1, 1); const _pos = new THREE.Vector3();
  const _Y = new THREE.Vector3(0, 1, 0); const _Z = new THREE.Vector3(0, 0, 1);
  const fulls = Array.from({ length: 6 }, () => new THREE.Matrix4());

  // a part's own motion about its joint, in the gull's frame (written into fulls[k])
  function partMatrix(k, q, gMat) {
    _pm.makeRotationFromQuaternion(q);
    _v.set(PIVOT[k][0], PIVOT[k][1], PIVOT[k][2]).applyQuaternion(q);
    _pm.setPosition(PIVOT[k][0] - _v.x, PIVOT[k][1] - _v.y, PIVOT[k][2] - _v.z);
    fulls[k].multiplyMatrices(gMat, _pm);
  }

  function write(i, s) {
    _pos.set(s.x, s.y, s.z);
    _e.set(s.pitch, s.yaw, s.roll, 'YXZ');
    _qg.setFromEuler(_e);
    _m.compose(_pos, _qg, _one);
    fulls[P.BODY].copy(_m);
    // head: idle turn and pecking
    _e.set(s.peck + 0.06 * Math.sin(s.ph * 40), s.turn, 0, 'YXZ');
    partMatrix(P.HEAD, _q.setFromEuler(_e), _m);
    // wings: fold about y (the right folds back by +90 deg), beat about z
    for (const [k, side] of [[P.WING_R, 1], [P.WING_L, -1]]) {
      _q.setFromAxisAngle(_Y, side * s.fold * 1.5);
      _qz.setFromAxisAngle(_Z, side * s.flap);
      partMatrix(k, _q.premultiply(_qz), _m);
    }
    // legs: tucked back in the air, stepping on the ground
    for (const [k, side] of [[P.LEG_R, 1], [P.LEG_L, -1]]) {
      _e.set(s.tuck * 1.4 + side * s.step, 0, 0, 'XYZ');
      partMatrix(k, _q.setFromEuler(_e), _m);
    }
    const o = i * per * 3;
    for (let v = 0; v < per; v++) {
      const e = fulls[partOf[v]].elements;
      const x = base[v * 3]; const y = base[v * 3 + 1]; const z = base[v * 3 + 2];
      pos[o + v * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + v * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + v * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }

  // the idle head: a slow look about, and now and then a peck
  function idle(s, t) {
    const a = t * 0.9 + s.ph * TAU;
    s.turn = 0.7 * Math.sin(a * 0.45) * Math.sin(a * 0.17 + 1);
    const k = ((t / 6.5 + s.ph) % 1 + 1) % 1;
    s.peck = k < 0.12 ? 0.9 * Math.sin((k / 0.12) * Math.PI) : 0.05 * Math.sin(a);
  }
  function grounded(s) { s.fold = 1; s.flap = 0; s.tuck = 0; s.step = 0; s.pitch = 0; s.roll = 0; }

  function poseGull(s, t, dt, cat) {
    const g = s.g;
    if (g.mode === 'post') {
      const p = SEASIDE_POSTS[g.post];
      grounded(s); idle(s, t);
      s.x = p.x; s.z = p.z; s.y = POST_TOP + 0.045;
      s.yaw = g.yaw + 0.3 * Math.sin(t * 0.12 + s.ph * TAU);
    } else if (g.mode === 'stand') {
      grounded(s); idle(s, t);
      s.x = g.x; s.z = g.z; s.y = footY(g.x, g.z);
      s.yaw = g.yaw + 0.25 * Math.sin(t * 0.1 + s.ph * TAU);
    } else if (g.mode === 'walk') {
      grounded(s);
      const tt = (((t + s.ph * WALK_ROUND) % WALK_ROUND) + WALK_ROUND) % WALK_ROUND;
      // out along the heading (4..7 s), turn about (7.5..8.5), back (9..12), turn again (12.5..13.5)
      const prog = tt < 4 ? 0 : tt < 7 ? (tt - 4) / 3 : tt < 9 ? 1 : tt < 12 ? 1 - (tt - 9) / 3 : 0;
      const turned = ss(7.5, 8.5, tt) - ss(12.5, 13.5, tt);
      s.yaw = g.yaw + Math.PI * turned;
      s.x = g.x + Math.sin(g.yaw) * g.reach * prog;
      s.z = g.z + Math.cos(g.yaw) * g.reach * prog;
      s.y = footY(s.x, s.z);
      const going = ss(4, 4.4, tt) * (1 - ss(6.6, 7, tt)) + ss(9, 9.4, tt) * (1 - ss(11.6, 12, tt));
      if (going > 0.001) {
        const walked = (tt < 8 ? prog : 2 - prog) * g.reach;
        const ph = (walked / 0.32) * TAU;
        s.step = 0.55 * Math.sin(ph) * going;
        s.y += 0.012 * Math.abs(Math.sin(ph)) * going;
        s.peck = 0.1 * Math.sin(ph * 0.5) * going; s.turn = 0;
      } else idle(s, t);
    } else if (g.mode === 'glide') {
      const a = g.speed * t + s.ph * TAU;
      s.x = g.cx + g.radius * Math.cos(a); s.z = g.cz + g.radius * Math.sin(a);
      const dir = g.speed >= 0 ? 1 : -1;
      s.yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      s.y = g.height - BODY_Y + 0.4 * Math.sin(0.7 * t + s.ph * TAU);
      s.fold = 0; s.tuck = 1; s.step = 0; s.pitch = 0.05; s.roll = 0.3 * dir;
      const beating = ss(1 - 2 * g.flap, 1.15 - 2 * g.flap, Math.sin(t * 0.21 + s.ph * 9));
      s.flap = 0.1 + beating * 0.75 * Math.sin(t * 17.5);
      s.peck = 0; s.turn = 0;
    } else if (g.mode === 'hop') {
      hop(s, t, dt, cat);
    }
  }

  function hop(s, t, dt, cat) {
    const g = s.g;
    if (s.fly >= 0) {
      s.fly += dt;
      if (s.fly >= FLY_SECONDS) { s.fly = -1; s.at = s.to === g.home ? 'home' : 'away'; s.rest = HOP_REST; s.restYaw = s.yaw; }
    } else {
      s.rest = Math.max(0, s.rest - dt);
      const cur = s.at === 'home' ? g.home : g.away;
      const other = s.at === 'home' ? g.away : g.home;
      // only away from her: the flight's line leaves from the spot with her behind it (no nearer point on the line than
      // the start), and the other spot is the farther from her
      if (s.rest <= 0 && cat && Math.hypot(cat.x - cur.x, cat.z - cur.z) < HOP_NEAR
        && (cat.x - cur.x) * (other.x - cur.x) + (cat.z - cur.z) * (other.z - cur.z) <= 0
        && Math.hypot(cat.x - other.x, cat.z - other.z) > Math.hypot(cat.x - cur.x, cat.z - cur.z) + 1.5) {
        s.fly = 0; s.from = cur; s.to = other;
      }
    }
    if (s.fly >= 0) {
      const u = s.fly / FLY_SECONDS;
      const e = ss(0, 1, u);
      const dx = s.to.x - s.from.x; const dz = s.to.z - s.from.z;
      s.x = s.from.x + dx * e; s.z = s.from.z + dz * e;
      s.y = footY(s.x, s.z) + 2.4 * Math.sin(Math.PI * u) ** 1.3;
      s.yaw = Math.atan2(dx, dz);
      s.pitch = -0.4 * (1 - ss(0.1, 0.5, u)) - 0.35 * ss(0.8, 0.95, u) * (1 - ss(0.95, 1, u));
      s.roll = 0;
      s.fold = (1 - ss(0, 0.1, u)) + ss(0.9, 1, u);
      s.tuck = ss(0.08, 0.3, u) * (1 - ss(0.72, 0.95, u));
      s.flap = (0.2 + 0.85 * Math.sin(s.fly * 22)) * (1 - ss(0.65, 0.9, u)) * ss(0, 0.06, u);
      s.step = 0; s.peck = 0; s.turn = 0;
    } else {
      const at = s.at === 'home' ? g.home : g.away;
      grounded(s); idle(s, t);
      s.x = at.x; s.z = at.z; s.y = footY(at.x, at.z);
      s.yaw = s.restYaw + 0.2 * Math.sin(t * 0.1 + s.ph * TAU);
    }
  }

  let frozen = false;
  function update(dt, t, cat) {
    if (frozen) return;
    for (let i = 0; i < n; i++) { poseGull(gulls[i], reducedMotion ? 0 : t, reducedMotion ? 0 : dt, reducedMotion ? null : cat); write(i, gulls[i]); }
    geo.attributes.position.needsUpdate = true;
    if (reducedMotion) frozen = true; // the one write is the pose, held
  }
  update(0, 0, null);

  return {
    mesh, gulls, update,
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mesh.material.dispose();
    },
  };
}
