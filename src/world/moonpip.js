// =============================================================================
// PIP, THE MOON BASE'S LITTLE HELPER ROBOT (milestone 2). A round white robot, cat-sized, on one wheel, with a glowing lantern for a
// head and two dark eyes. Made once a walk by world/moonbaselive.js; update(dt, t, catPos, opts) every frame.
//
// HIS DAY: asleep beside the lander (lantern low, slumped) -> her Interact wakes him (a beep, the lantern comes up, two small hops)
// -> he LEADS: rolls ahead along the plan's waypoints to the airlock's front, waiting whenever she is more than LEAD_WAIT behind
// -> he FOLLOWS the way the Lighthouse's kitten does: her footprints (only where her paws are on the ground), keeping FOLLOW_GAP of
// her path between them, hurrying up to CATCH_MAX when she runs, waiting when she climbs. He never runs off, never fails and never
// stands in a collider: every step goes through pushOut (he is not a collider himself: she walks through him, so he can never block
// a route; where he rests is always clear ground).
// Calls and dances are short and never block: beep() (a hop and a flash), dance() (the base waking). Reduced motion: no hops, bob,
// pulse or spin; he still travels.
// Part of the place's chunk. Draws no random number and reads no clock.
// =============================================================================

import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import { PIP_SLEEP, PIP_LEAD, MOON_BOUNDS } from './moonplan.js';
import { paint } from './moonparts.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dustGeometry } from './moonbeauty.js';

export const PIP = Object.freeze({
  radius: 0.4, // m kept between his middle and a collider's edge
  speed: 2.4, leadSpeed: 2.3, catchMax: 6.2, catchGain: 1.2, gap: 2.0, // m of her path he keeps between them
  leadWait: 12, // m: he waits for her when she is farther than this behind him while he leads
  arrive: 0.9, // m from the last waypoint = arrived
  crumbEvery: 0.6, crumbMax: 200, level: 1.2, hearR: 6, wake: 1.1, beep: 0.8, dance: 2.6, turn: 9,
});

const SQ = (n) => n * n;

// Push (x, z) out of every collider by `pad` m beyond its edge (two passes, so a corner between two settles); true if it moved.
export function pushOut(p, colliders, pad = PIP.radius) {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders ?? []) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const need = c.r + pad;
      const d2 = dx * dx + dz * dz;
      if (d2 >= SQ(need)) continue;
      const d = Math.sqrt(d2);
      const ux = d > 1e-9 ? dx / d : 1;
      const uz = d > 1e-9 ? dz / d : 0;
      p.x = c.x + ux * need;
      p.z = c.z + uz * need;
      moved = true;
    }
  }
  p.x = Math.min(MOON_BOUNDS.maxX - 0.5, Math.max(MOON_BOUNDS.minX + 0.5, p.x));
  p.z = Math.min(MOON_BOUNDS.maxZ - 0.5, Math.max(MOON_BOUNDS.minZ + 0.5, p.z));
  return moved;
}

// One step toward (tx, tz): returns the distance still to go after it. Pure on `p` (moves it).
export function stepToward(p, tx, tz, speed, dt) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return 0;
  const step = Math.min(d, speed * dt);
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  return d - step;
}

const smooth = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const turnTo = (cur, want, k) => { let d = ((want - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return cur + d * Math.min(1, k); };

// (beauty round 4) Pip's tone, baked: the top of the shell a touch brighter, the underside greyer, a ragged scuff band low on the shell where he has rolled through dust,
// and a few dark smears. Into the vertex colours (the geometry is in his own local frame); no draw, no texture.
export function pipShade(geo) {
  const pos = geo.attributes.position; const nor = geo.attributes.normal; const col = geo.attributes.color;
  if (!pos || !nor || !col) return geo;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const up = nor.getY(i);
    let k = 0.9 + 0.12 * up; // lit from above
    const smear = Math.sin(x * 31 + z * 17) * Math.sin(y * 23 - x * 9); // a few dark streaks running down the shell
    if (y > 0.2 && y < 0.62 && smear > 0.55) k *= 0.82;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * (k * 1.0 + (up < 0 ? 0.02 : 0)));
  }
  col.needsUpdate = true;
  return geo;
}

// ---- the model: four meshes, about 640 triangles -------------------------------------------------------------------------
// (beauty round 4) The lantern was one flat colour (a basic material: it is lit by its own colour, the life animates that). A vertex gradient is multiplied into it: the
// brightest at its crown and the middle of its front, dimmer toward its rim and foot, so it reads as a glowing glass globe, not a disc. Pure on the geometry.
export function lanternGlow(geo) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = (pos.getY(i) - 0.72) / 0.15; const z = pos.getZ(i);
    const k = Math.min(1, 0.5 + 0.3 * Math.max(0, y) + 0.5 * Math.max(0, z / 0.15) ** 2 - 0.2 * Math.abs(x / 0.15) ** 3 - 0.2 * Math.max(0, -y)); // front and crown bright, the flanks and foot dim
    col[i * 3] = k; col[i * 3 + 1] = k * 0.97; col[i * 3 + 2] = k * 0.9;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function buildPip() {
  const white = 0xeef1f6;
  const body = [];
  const sph = new THREE.SphereGeometry(0.27, 14, 9); sph.scale(1, 0.92, 1); sph.translate(0, 0.33, 0); body.push(paint(sph, white));
  body.push(paint(new THREE.TorusGeometry(0.265, 0.026, 4, 14).rotateX(Math.PI / 2).translate(0, 0.3, 0), 0x4fd6c4));
  body.push(paint(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 8).translate(0, 0.07, 0), 0x2a2f3a)); // the axle block under him
  body.push(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5).translate(0.15, 0.7, -0.05), 0x7d848f)); // an antenna
  body.push(paint(new THREE.SphereGeometry(0.04, 6, 4).translate(0.15, 0.82, -0.05), 0xffb23c));
  body.push(paint(new THREE.CylinderGeometry(0.1, 0.16, 0.08, 10).translate(0, 0.56, 0), 0x7d848f)); // the neck ring under the lantern
  body.push(paint(new THREE.BoxGeometry(0.1, 0.07, 0.04).translate(0, 0.36, 0.265), 0x4fd6c4)); // a little chest panel
  // (beauty round 4) panel lines and fittings: three thin dark seams round the shell (a belt line and two meridians), a vent of three slots under the chest panel, two
  // shoulder pods with a dark socket each, a lantern cage ring, a kick-plate under the axle block and a battery hatch on the back.
  const seam = (g) => body.push(paint(g, 0x8f98a8));
  seam(new THREE.TorusGeometry(0.272, 0.007, 3, 14).rotateX(Math.PI / 2).translate(0, 0.45, 0));
  seam(new THREE.TorusGeometry(0.273, 0.007, 3, 14).rotateY(Math.PI / 2 + 0.5).translate(0, 0.33, 0).scale(1, 0.92, 1));
  for (let i = 0; i < 3; i++) body.push(paint(new THREE.BoxGeometry(0.1, 0.012, 0.012).translate(0, 0.28 - i * 0.025, 0.272 - i * 0.002), 0x39404c));
  for (const sd of [-1, 1]) body.push(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6).rotateZ(Math.PI / 2).translate(sd * 0.28, 0.33, 0.02), 0x4fd6c4)); // shoulder pods
  body.push(paint(new THREE.CylinderGeometry(0.15, 0.16, 0.02, 10, 1, true).translate(0, 0.62, 0), 0x2a2f3a)); // the cage ring at the lantern's foot
  body.push(paint(new THREE.BoxGeometry(0.15, 0.1, 0.012).translate(0, 0.38, -0.262), 0xc9ced8)); // the battery hatch
  const bodyMesh = new THREE.Mesh(dustGeometry(pipShade(mergeGeometries(body)), () => 0, { reach: 0.32 }), litMaterial(0xffffff, { vertexColors: true, roughness: 0.5 }));  bodyMesh.name = 'pip:body';
  // the lantern: a glowing sphere and a small dark cap (the glow is a basic material, lit by its colour)
  const lantern = new THREE.Mesh(lanternGlow(new THREE.SphereGeometry(0.15, 12, 8).translate(0, 0.72, 0)), new THREE.MeshBasicMaterial({ color: 0x2a2a2a, vertexColors: true }));
  lantern.name = 'pip:lantern';
  const cap = paint(new THREE.ConeGeometry(0.1, 0.1, 8).translate(0, 0.9, 0), 0x2a2f3a);
  const eyes = mergeGeometries([paint(new THREE.SphereGeometry(0.03, 6, 4).scale(1, 1.4, 0.5).translate(-0.055, 0.73, 0.138), 0x1a1f28), paint(new THREE.SphereGeometry(0.03, 6, 4).scale(1, 1.4, 0.5).translate(0.055, 0.73, 0.138), 0x1a1f28), cap,
    // (beauty round 4) a rosy cheek each side and a small smile: a face, not two dots on a disc
    paint(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 6).rotateX(Math.PI / 2).translate(-0.095, 0.7, 0.116), 0xf0907f), paint(new THREE.CylinderGeometry(0.022, 0.022, 0.01, 6).rotateX(Math.PI / 2).translate(0.095, 0.7, 0.116), 0xf0907f),
    paint(new THREE.BoxGeometry(0.03, 0.008, 0.008).translate(0, 0.688, 0.147), 0x1a1f28), paint(new THREE.BoxGeometry(0.014, 0.008, 0.008).rotateZ(-0.7).translate(-0.027, 0.696, 0.143), 0x1a1f28), paint(new THREE.BoxGeometry(0.014, 0.008, 0.008).rotateZ(0.7).translate(0.027, 0.696, 0.143), 0x1a1f28)]);
  const eyeMesh = new THREE.Mesh(eyes, new THREE.MeshBasicMaterial({ vertexColors: true }));
  eyeMesh.name = 'pip:eyes';
  // the wheel: a tyre and a light hub mark on its rim (one mesh: it turns as he rolls), about its own middle
  const wheel = new THREE.Mesh(mergeGeometries([
    paint(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12).rotateZ(Math.PI / 2), 0x30343c),
    paint(new THREE.BoxGeometry(0.11, 0.04, 0.04).translate(0, 0, 0.14), 0x8a96a8),
  ]), litMaterial(0xffffff, { vertexColors: true, roughness: 0.9 }));
  wheel.name = 'pip:wheel';
  wheel.position.y = 0.15;
  const tilt = new THREE.Group(); // the body, lantern and eyes lean and bob together
  tilt.add(bodyMesh, lantern, eyeMesh);
  const group = new THREE.Group();
  group.name = 'pip';
  group.scale.setScalar(0.72); // cat-sized: about 0.7 m to the top of his cap
  group.add(tilt, wheel);
  for (const m of [bodyMesh, lantern, eyeMesh, wheel]) { m.castShadow = false; m.userData.noMerge = true; m.userData.noCast = true; }
  bodyMesh.castShadow = true; delete bodyMesh.userData.noCast;
  return { group, tilt, lantern, wheel, bodyMesh, eyeMesh };
}

const LANTERN = { off: new THREE.Color(0x3a3322), on: new THREE.Color(0xffe39a) };
const SCRATCH = new THREE.Color();

// createPip({ scene, ground, colliders, reducedMotion, awake }) -> pip
export function createPip({ scene, ground, colliders = [], reducedMotion = false, awake = false }) {
  const built = buildPip();
  const { group, tilt, lantern, wheel } = built;
  const pos = { x: PIP_SLEEP.x, z: PIP_SLEEP.z };
  const lastCrumb = { x: 0, z: 0, y: 0, set: false };
  const crumbs = [];
  let state = awake ? 'following' : 'asleep';
  let t0 = 0; // the clock the state began on
  let clock = 0;
  let yaw = Math.PI; // faces the spawn (it is south of him: +z), asleep
  let lead = 0; // the waypoint he rolls to
  let moving = false;
  let speedNow = 0;
  let beepAt = -10;
  let danceAt = -10;
  let roll = 0;
  let lantern01 = awake ? 1 : 0.12;
  let disposed = false;
  let dtLast = 0.016;
  scene.add(group);
  place();

  function place() {
    group.position.set(pos.x, ground.y(pos.x, pos.z), pos.z);
    group.rotation.y = yaw;
  }

  function startLead() { state = 'leading'; lead = 0; t0 = clock; }

  return {
    group,
    get state() { return state; },
    get position() { return pos; },
    get lantern() { return lantern01; },
    get moving() { return moving; },
    get crumbs() { return crumbs; },
    wake() {
      if (state !== 'asleep') return false;
      state = 'waking';
      t0 = clock;
      return true;
    },
    // the saved game says he is awake already: up and idle where he slept (the walk's start)
    setAwake() { if (state === 'asleep') { state = 'following'; lantern01 = 1; } },
    // she has been carried a long way (Dot): his footprints to her old place are no way to follow her now; he starts from where she is
    rejoin() { crumbs.length = 0; lastCrumb.set = false; },
    beep() { beepAt = clock; },
    dance() { danceAt = clock; },
    lookAt(x, z) { yaw = Math.atan2(x - pos.x, z - pos.z); },
    // one frame; `cat` = { x, y, z, perched }
    update(dt, t, cat) {
      if (disposed) return;
      const step = dt > 0 ? dt : 0;
      if (step > 0) dtLast = step;
      clock += step;
      moving = false;
      const d2cat = cat ? Math.hypot(cat.x - pos.x, cat.z - pos.z) : Infinity;

      if (state === 'waking') {
        if (clock - t0 >= PIP.wake) startLead();
      } else if (state === 'leading') {
        const wp = PIP_LEAD[lead];
        if (wp && d2cat <= PIP.leadWait) {
          const left = stepToward(pos, wp.x, wp.z, PIP.leadSpeed, step);
          pushOut(pos, colliders);
          moving = true;
          speedNow = PIP.leadSpeed;
          yaw = turnTo(yaw, Math.atan2(wp.x - pos.x, wp.z - pos.z), PIP.turn * step);
          if (left < PIP.arrive) { lead += 1; if (lead >= PIP_LEAD.length) { state = 'following'; lastCrumb.set = false; crumbs.length = 0; } }
        }
      } else if (state === 'following' && cat) {
        // her footprints, only where her paws are on the ground and on her own level (a ledge is left to the cat)
        const onGround = Math.abs(cat.y - ground.y(cat.x, cat.z)) < 0.35 && !cat.perched;
        if (onGround && (!lastCrumb.set || Math.hypot(cat.x - lastCrumb.x, cat.z - lastCrumb.z) >= PIP.crumbEvery) && (!lastCrumb.set || Math.abs(cat.y - lastCrumb.y) <= PIP.level)) {
          lastCrumb.x = cat.x; lastCrumb.z = cat.z; lastCrumb.y = cat.y; lastCrumb.set = true;
          crumbs.push({ x: cat.x, z: cat.z });
          if (crumbs.length > PIP.crumbMax) crumbs.shift();
        }
        if (crumbs.length) {
          let gap = Math.hypot(crumbs[0].x - pos.x, crumbs[0].z - pos.z);
          for (let i = 1; i < crumbs.length; i++) gap += Math.hypot(crumbs[i].x - crumbs[i - 1].x, crumbs[i].z - crumbs[i - 1].z);
          if (gap > PIP.gap) {
            const speed = Math.min(PIP.catchMax, PIP.speed + PIP.catchGain * (gap - PIP.gap));
            stepToward(pos, crumbs[0].x, crumbs[0].z, speed, step);
            pushOut(pos, colliders);
            moving = true;
            speedNow = speed;
            yaw = turnTo(yaw, Math.atan2(crumbs[0].x - pos.x, crumbs[0].z - pos.z), PIP.turn * step);
            if (Math.hypot(crumbs[0].x - pos.x, crumbs[0].z - pos.z) < 0.15 && crumbs.length > 1) crumbs.shift();
          }
        }
        if (!moving && d2cat < PIP.hearR) yaw = turnTo(yaw, Math.atan2(cat.x - pos.x, cat.z - pos.z), 3 * step);
      }
      place();
      animate(t);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose(); });
    },
  };

  function animate(t) {
      const still = reducedMotion;
      // the lantern: low asleep, up over the wake, a gentle pulse awake, a flash on a beep and in the dance
      let want = state === 'asleep' ? 0.12 : 1;
      if (state === 'asleep' && !still) want = 0.12 + 0.05 * Math.sin(t * 1.4);
      if (state === 'waking') want = 0.12 + 0.88 * smooth((clock - t0) / PIP.wake);
      else if (state !== 'asleep' && !still) want = 0.88 + 0.12 * Math.sin(t * 2.2);
      const sinceBeep = clock - beepAt;
      if (sinceBeep < PIP.beep) want = Math.max(want, 1.4 * (1 - sinceBeep / PIP.beep));
      lantern01 += (want - lantern01) * Math.min(1, 12 * dtLast);
      SCRATCH.copy(LANTERN.off).lerp(LANTERN.on, Math.min(1, lantern01));
      if (lantern01 > 1) SCRATCH.multiplyScalar(lantern01);
      lantern.material.color.copy(SCRATCH);

      // the body: slumped asleep, the wake's two hops, the beep's hop, the dance's spin
      let lean = 0; let lift = 0; let spin = 0; let sag = 1;
      if (state === 'asleep') { lean = 0.32; sag = 0.82; } else if (!still) {
        if (state === 'waking') { const k = (clock - t0) / PIP.wake; lean = 0.32 * (1 - smooth(k * 1.4)); sag = 0.82 + 0.18 * smooth(k * 1.4); lift = 0.16 * Math.abs(Math.sin(k * Math.PI * 2)) * (k < 1 ? 1 : 0); } else if (moving) { lean = -0.07; lift = 0.012 * Math.abs(Math.sin(t * 11)); }
        if (sinceBeep < PIP.beep) lift += 0.14 * Math.sin((sinceBeep / PIP.beep) * Math.PI);
        const sd = clock - danceAt;
        if (sd >= 0 && sd < PIP.dance) { lift += 0.2 * Math.abs(Math.sin(sd * 6)); spin = (sd / PIP.dance) * Math.PI * 4; }
      } else if (state === 'waking') { sag = 1; }
      tilt.rotation.set(lean, spin, 0);
      tilt.scale.y = sag;
      tilt.position.y = lift;
      if (moving && !still) { roll += (speedNow / 0.15) * dtLast; wheel.rotation.x = roll; }
  }
}
