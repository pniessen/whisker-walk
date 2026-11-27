// =============================================================================
// THE SEASIDE'S BATHERS (seasideplan.js SEASIDE_FOLK): jointed people from the
// pack's people kit (src/people/, the Fairground's and the Market's figure),
// in swimwear, at their hand-picked spots. Part of the Seaside's chunk;
// seasidelife.js makes it once a walk when the walk hands it the people
// factory (ctx.people); no factory (the picture pages, the plain tests) means
// nobody.
//
// createSeasideFolk({ people, lodNear, reducedMotion, rung }) ->
//   { group, figures, ball, update(dt, t, catPos), dispose() }
//   group   one Group; the caller adds it to the scene
//   figures [{ id, role, group, person }] the people drawn on this rung
//           (plan rank <= RANK_FOR_RUNG(rung): LOW and LITE draw fewer)
//   ball    the beach ball's mesh (one, vertex-coloured), or null
//
// Poses (the people's own modes, set once or each frame as the role asks):
//   stand / wade   the standing idle (weight shift, breath; none under reduced motion)
//   sit            legs out in front on the towel, hands in the lap, the head
//                  slowly turning toward the sea: set once on the bones, then
//                  only the head (a pure function of time and the person's own phase)
//   kneel          the people's kneel, once
//   toss           both forearms up in front (the people's juggle at t 0),
//                  once; the ball goes between the two on an arc that is a
//                  pure function of time (held in the hands under reduced motion)
//   vendor         stand; waves (the people's wave) while her cat is within
//                  WAVE_NEAR m, and otherwise stands. Nobody ever steps toward
//                  her cat, turns to follow it or blocks it (the stands are
//                  the only solid things, seasideplan.js).
// Each figure is near or far detail by her cat's distance (the walk's rung's
// near distance, hysteresis 1 m, as marketkeeper.js does); one further than
// FAR_POSE metres is not posed that frame. Everything is made inside
// withLocalUuids on the spot's own key, so making them draws nothing from
// Math.random; no clock is read.
// =============================================================================
import * as THREE from 'three';
import { withLocalUuids } from './localuuids.js';
import { litMaterial } from '../render/materials.js';
import { part } from './seasidedecor.js';
import { SEASIDE_FOLK, RANK_FOR_RUNG, footY } from './seasideplan.js';

export const WAVE_NEAR = 6;
const FAR_POSE = 32;
const HYSTERESIS = 1;
const TOSS_SECONDS = 2.6;
const BALL_R = 0.15;
const BALL_COLOURS = [0xe2433a, 0xf4efe4, 0x3d7cc9, 0xf4efe4, 0xf7c93b, 0xf4efe4];

export const NO_FOLK = Object.freeze({ group: null, figures: Object.freeze([]), ball: null, update() {}, dispose() {} });

// what a bather wears: the swim top (the skin itself on a bare chest), shorts,
// bare feet, a sunhat where the plan gives a colour
function swimDef(e, kind) {
  return {
    x: e.x, z: e.z, kind, sex: e.sex, skin: e.skin,
    top: { kind: 'tshirt', color: e.bare ? e.skin : e.top },
    bottom: { kind: 'shorts', color: e.bottom },
    shoes: e.skin,
    hat: e.hat ? { kind: 'sunhat', color: e.hat } : null,
    glasses: false,
  };
}

export function createSeasideFolk({ people, lodNear, reducedMotion = false, rung = 0 } = {}) {
  if (typeof people !== 'function') return NO_FOLK;
  const maxRank = RANK_FOR_RUNG(rung);
  const group = withLocalUuids('seaside-folk-group', () => new THREE.Group());
  group.name = 'seasideFolk';
  const figures = [];
  const kit = withLocalUuids('seaside-folk-kit', () => people({ reducedMotion, lodNear }));

  // one person at the spot: the kit's, the unwanted half of a child's pair freed at once
  function person(def, kind) {
    const spot = kit.buildSpot(def);
    const keep = kind === 'child' ? spot.people[1] : spot.people[0];
    for (const p of spot.people) {
      if (p === keep) continue;
      kit.people.splice(kit.people.indexOf(p), 1);
      p.dispose();
    }
    return keep;
  }
  function add(id, role, def, kind, at, yaw, rank) {
    if (rank > maxRank) return null;
    return withLocalUuids(`seaside-folk:${id}`, () => {
      const p = person(def, kind);
      const g = new THREE.Group();
      g.name = `seasideFolk:${id}`;
      p.figure.rotation.y = Math.PI; // the kit's figure faces -z; the group's front is +z
      g.add(p.figure);
      g.position.set(at.x, footY(at.x, at.z), at.z);
      g.rotation.y = yaw;
      g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.userData.noCast = true; } });
      p.setDetail('far');
      group.add(g);
      const f = { id, role, group: g, person: p, x: at.x, z: at.z, seed: p.look.seed };
      figures.push(f);
      return f;
    });
  }
  const pose = (f, mode, t, dt) => { kit.pose(f.person, { mode, t, reducedMotion }); kit.applyPose(f.person, dt); };

  // legs out in front, hands in the lap: the rotations set on the targets, applied once
  function sit(f) {
    const pr = f.person;
    kit.pose(pr, { mode: 'stand', t: 0, reducedMotion: true });
    const r = pr.target.rot;
    const J = (n) => pr.skeleton.bones.findIndex((b) => b.name === n) * 3;
    for (const [side, s] of [['L', -1], ['R', 1]]) {
      r[J(`thigh${side}`)] = 1.5; r[J(`thigh${side}`) + 2] = s * 0.12;
      r[J(`shin${side}`)] = -0.12; r[J(`foot${side}`)] = 0.05;
      r[J(`upperArm${side}`)] = 0.42; r[J(`upperArm${side}`) + 2] = s * 0.1;
      r[J(`forearm${side}`)] = 1.05;
    }
    r[J('chest')] = -0.06;
    kit.applyPose(pr, 0);
    f.neck = pr.bones.neck;
  }

  for (const e of SEASIDE_FOLK) {
    const f = add(e.id, e.role, swimDef(e, e.kind), e.kind, e, e.yaw, e.rank);
    if (!f) continue;
    if (e.role === 'sit') sit(f);
    else if (e.role === 'kneel') pose(f, 'kneel', 0, 0);
    else if (e.role === 'toss') pose(f, 'juggle', 0, 0);
    else pose(f, 'stand', 0, 0);
    if (e.adultAt) {
      const a = swimDef({ ...e, x: e.adultAt.x, z: e.adultAt.z, top: e.adultTop, bottom: e.adultBottom, skin: e.adultSkin, sex: 'f', bare: false, hat: 0xe8d8a8 }, 'adult');
      const toward = Math.atan2(e.x - e.adultAt.x, e.z - e.adultAt.z);
      const af = add(`${e.id}-adult`, 'stand', a, 'adult', e.adultAt, toward, 2);
      if (af) pose(af, 'stand', 0, 0);
    }
  }

  // the ball: one mesh, six stripes, thrown from one to the other
  const tossers = figures.filter((f) => f.role === 'toss');
  let ball = null;
  if (tossers.length === 2) {
    ball = withLocalUuids('seaside-folk-ball', () => {
      const geo = part(new THREE.SphereGeometry(BALL_R, 12, 6), 0xffffff, (cx, cz) => BALL_COLOURS[Math.floor(((Math.atan2(cz, cx) / (Math.PI * 2)) + 1) % 1 * 6) % 6]);
      const m = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
      m.name = 'seasideBall';
      m.userData.noCast = true;
      return m;
    });
    group.add(ball);
  }
  const hands = (f) => f.person.look.height * 0.62;
  function placeBall(t) {
    const [a, b] = tossers;
    const u = reducedMotion ? 0 : t / TOSS_SECONDS;
    const k = Math.floor(u); const s = u - k;
    const from = k % 2 === 0 ? a : b; const to = from === a ? b : a;
    const e = s * s * (3 - 2 * s);
    const arc = reducedMotion ? 0 : 4 * s * (1 - s) * 1.1;
    ball.position.set(from.x + (to.x - from.x) * e, footY(from.x, from.z) + hands(from) + (hands(to) - hands(from)) * e + arc, from.z + (to.z - from.z) * e);
    ball.rotation.set(0.3, reducedMotion ? 0 : t * 1.5, 0.2);
  }
  if (ball) placeBall(0);

  function update(dt, t, cat) {
    const n = typeof lodNear === 'function' ? lodNear() : 12;
    const near = Number.isFinite(n) ? n : 12;
    for (const f of figures) {
      const d = Math.hypot(cat.x - f.x, cat.z - f.z);
      const p = f.person;
      if (d >= near + HYSTERESIS) { if (p.detail !== 'far') p.setDetail('far'); } else if (d <= near - HYSTERESIS) { if (p.detail !== 'near') p.setDetail('near'); }
      if (d > FAR_POSE || reducedMotion) continue;
      if (f.role === 'stand' || f.role === 'wade') pose(f, 'stand', t, dt);
      else if (f.role === 'sit' && f.neck) f.neck.rotation.y = 0.35 * Math.sin(t * 0.35 + f.seed * 6.2832);
    }
    if (ball) placeBall(t);
  }

  return {
    group, figures, ball, update,
    dispose() {
      group.removeFromParent();
      if (ball) { ball.geometry.dispose(); ball.material.dispose(); }
      kit.dispose();
      figures.length = 0;
    },
  };
}
