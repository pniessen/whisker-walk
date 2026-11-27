// =============================================================================
// THE MOON: ITS FRIENDLY ROBOTS AND LIGHT ON A WALK. Survey drones, the dusty cleaner bot, the rover convoy, the lunar moths, the pixel visitor and the moonling
// (world/moonrobots.js is their plans and poses, moonrobotsparts.js their drawing): three draws (the robots' box soup, the drones' glow patches, the moths' points).
// Everything is decoration: a pose is a function of the clock this life adds up from the walk's own dt (and of two slow bits of state: the convoy's road driven and the
// shy ones' own little moods); nothing chases her, blocks her or touches what she owns. Under reduced motion it is drawn once and stays.
// The robots are also photo and journal subjects: `spottable` is the list the walk reads (src/game/photo.js, src/game/interactions.js).
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import * as R from './moonrobots.js';
import * as D from './moonrobotsparts.js';
import { moonY } from './moonplan.js';
import './moonlifewords.js';

const radial = () => {
  const n = 16; const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 7.5; const a = Math.max(0, 1 - d) ** 1.6; const i = (y * n + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(a * 255); }
  const t = new THREE.DataTexture(data, n, n); t.needsUpdate = true; return t;
};

// createRobotsLive({ scene, reducedMotion, tier, roomSeed, visits, audio, roverAt }) -> { update(dt, t, catPos, camera, session), dispose(), spottable, counts, state }
export function createRobotsLive({ scene, reducedMotion = false, tier = null, roomSeed = 0, visits = 0, audio = null, roverAt = () => null }) {
  const rung = R.lifeRung(tier);
  const cnt = R.LIFE_COUNT[rung];
  const seed = typeof roomSeed === 'number' ? roomSeed : 0;
  const drones = R.DRONES.slice(0, cnt.drones);
  const moths = R.MOTHS.slice(0, cnt.moths);
  const convoyN = cnt.convoy;
  const pixIdx = R.pixelSpotIndex(seed, visits);
  const spot = R.PIXEL_SPOTS[pixIdx];
  const mlSpot = R.PIXEL_SPOTS[R.moonlingSpotIndex(seed, visits, pixIdx)];
  const blinkPhase = R.PIXEL_PHASE(seed, visits);
  const side = R.hash01(pixIdx + 3, R.SALTS.moonling) * R.TAU; // the side of its rock the moonling peeks out on
  const sideX = Math.cos(side); const sideZ = Math.sin(side);

  let clock = 0; let drawnOnce = false;
  let convoyD = reducedMotion ? 40 : 0;
  let cat = null; let prevCat = null; let catSpeed = 0;
  const fwd = new THREE.Vector3();
  // the pixel visitor's little machine: resting at `from`, or hopping from `from` to `to` (hopT seconds in)
  const px = { from: { x: spot.x, z: spot.z }, to: { x: spot.x, z: spot.z }, hopT: reducedMotion ? -1 : 0, rest: 0.6, k: 0, yaw: 0, frozen: false, arms: false };
  R.pixelStop(spot, 0, px.to);
  const pxPose = {}; let pxShown = 1;
  // the moonling's moods
  const ml = { peek: reducedMotion ? 1 : 0, shy: 0, still: 0, wave: 0, hop: 0, cool: 3, d: 99 };
  const mlPose = {}; const dp = {}; const cp = {}; const rp = {}; const mp = {};

  const spottable = [];
  const mk = (type, label, range) => { const e = { type, label, pos: new THREE.Vector3(), range }; spottable.push(e); return e; };
  const droneSpots = drones.map(() => mk('mldrone', phrase('moon.life.drone'), 12));
  const cleanSpot = mk('mlcleaner', phrase('moon.life.cleaner'), 9);
  const convoySpots = Array.from({ length: convoyN }, () => mk('mlconvoy', phrase('moon.life.convoy'), 9));
  const mothSpots = moths.map(() => mk('mlmoth', phrase('moon.life.moth'), 6));
  const pixelSpot = mk('mlpixel', phrase('moon.life.pixel'), R.PIXEL.look);
  const moonlingSpot = mk('mlmoonling', phrase('moon.life.moonling'), 0);

  const robots = new D.Boxes(260);
  const robotMesh = D.soupMesh(robots, 'moon:robots');
  scene.add(robotMesh.mesh);
  // the glow patches (additive) under the drones
  const glowPos = new Float32Array(drones.length * D.GLOW_VERTS * 3); const glowCol = new Float32Array(glowPos.length);
  const glowGeo = new THREE.BufferGeometry();
  const glowP = new THREE.BufferAttribute(glowPos, 3); glowP.setUsage(THREE.DynamicDrawUsage);
  const glowC = new THREE.BufferAttribute(glowCol, 3); glowC.setUsage(THREE.DynamicDrawUsage);
  glowGeo.setAttribute('position', glowP); glowGeo.setAttribute('color', glowC);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, side: THREE.DoubleSide, forceSinglePass: true });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.name = 'moon:droneGlow'; glowMesh.frustumCulled = false; glowMesh.renderOrder = 2;
  Object.assign(glowMesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(glowMesh);
  // the moths: soft points
  const mothPos = new Float32Array(moths.length * 3); const mothCol = new Float32Array(moths.length * 3);
  const mothGeo = new THREE.BufferGeometry();
  const mothP = new THREE.BufferAttribute(mothPos, 3); mothP.setUsage(THREE.DynamicDrawUsage);
  const mothC = new THREE.BufferAttribute(mothCol, 3); mothC.setUsage(THREE.DynamicDrawUsage);
  mothGeo.setAttribute('position', mothP); mothGeo.setAttribute('color', mothC);
  const mothTex = radial();
  const mothMat = new THREE.PointsMaterial({ size: 0.3, sizeAttenuation: true, vertexColors: true, map: mothTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const mothMesh = new THREE.Points(mothGeo, mothMat);
  mothMesh.name = 'moon:moths'; mothMesh.frustumCulled = false;
  Object.assign(mothMesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(mothMesh);

  const rockYaw = side;
  const mlHome = { x: mlSpot.x, z: mlSpot.z };

  function stepPixel(d) {
    const P = R.PIXEL;
    if (!cat) return;
    const dist = Math.hypot(cat.x - px.from.x, cat.z - px.from.z);
    if (px.hopT >= 0) { // in the air: it finishes its hop, always
      px.hopT += d;
      if (px.hopT >= P.hop) { px.hopT = -1; px.rest = 0; px.from = { x: px.to.x, z: px.to.z }; px.k++; }
      return;
    }
    // at rest: frozen while she looks at it (within 12 m); away from her when she is within 3 m; else the next hashed stop after its rest
    const dx = px.from.x - cat.x; const dz = px.from.z - cat.z;
    const dl = Math.hypot(dx, dz);
    const looking = pxShown > 0 && dl < P.look && dl > 1e-6 && (dx * fwd.x + dz * fwd.z) / dl > P.lookCos;
    px.frozen = looking;
    px.rest += d;
    px.yaw = Math.atan2(cat.x - px.from.x, cat.z - px.from.z);
    if (dist < P.flee && px.rest > 0.3) { R.pixelFlee(spot, cat, px.to); px.hopT = 0; px.arms = false; return; }
    if (looking) { px.arms = true; px.rest = Math.min(px.rest, P.rest - 0.2); return; }
    px.arms = false;
    if (px.rest >= P.rest) { R.pixelStop(spot, px.k + 1, px.to); px.yaw = Math.atan2(px.to.x - px.from.x, px.to.z - px.from.z); px.hopT = 0; }
  }

  function stepMoonling(d) {
    const M = R.MOONLING;
    if (!cat) return;
    const dx = cat.x - mlHome.x; const dz = cat.z - mlHome.z;
    const dist = Math.hypot(dx, dz);
    const closing = dist < ml.d - 1e-4;
    ml.d = dist;
    ml.cool -= d; ml.shy = Math.max(0, ml.shy - d);
    if (catSpeed > M.runSpeed && dist < M.runReach && closing) ml.shy = 6; // she runs at it: it drifts back and waits a while
    const want = dist < M.near && ml.shy <= 0 ? 1 : 0;
    ml.peek += (want - ml.peek) * (1 - Math.exp(-d / 0.8));
    if (ml.peek > 0.8 && dist < M.sit && catSpeed < 0.3) ml.still += d; else ml.still = 0;
    if (ml.still > M.sitFor && ml.cool <= 0 && ml.wave <= 0) { ml.wave = M.wave; ml.hop = M.hop; ml.cool = M.cooldown; audio?.chime?.(); }
    ml.wave = Math.max(0, ml.wave - d); ml.hop = Math.max(0, ml.hop - d);
  }

  function draw() {
    robots.begin();
    // the drones and their glow
    drones.forEach((dr, i) => {
      R.dronePose(dr, clock, dp);
      const g = moonY(dp.x, dp.z);
      D.drawDrone(robots, dp.x, g + dp.h, dp.z, dp);
      droneSpots[i].pos.set(dp.x, g + dp.h, dp.z);
      D.writeGlow(glowPos, glowCol, i * D.GLOW_VERTS, dp.x, dp.z, 1.7 + dp.h * 0.25, dp.glow, moonY);
    });
    // the cleaner bot
    R.cleanerPose(clock, cp);
    const cg = moonY(cp.x, cp.z);
    D.drawCleaner(robots, cp.x, cg, cp.z, cp);
    cleanSpot.pos.set(cp.x, cg + 0.5, cp.z);
    // the convoy
    for (let i = 0; i < convoyN; i++) {
      R.convoyPose(i, convoyD, rp);
      const y = moonY(rp.x, rp.z);
      D.drawMiniRover(robots, rp.x, y, rp.z, rp, i);
      convoySpots[i].pos.set(rp.x, y + 0.4, rp.z);
    }
    // the pixel visitor (a sprite at dusk: it blinks in and out)
    pxShown = reducedMotion ? 1 : R.pixelShown(clock, blinkPhase);
    if (px.hopT >= 0) R.pixelHop(px.from, px.to, px.hopT / R.PIXEL.hop, pxPose); else { pxPose.x = px.from.x; pxPose.z = px.from.z; pxPose.h = 0; pxPose.squash = 1 - 0.05 * Math.sin(clock * 3) * (px.frozen ? 0 : 1); }
    const py = moonY(pxPose.x, pxPose.z);
    if (pxShown) D.drawPixel(robots, pxPose.x, py + pxPose.h, pxPose.z, px.yaw, pxPose.squash, px.arms);
    pixelSpot.pos.set(pxPose.x, py + pxPose.h + 0.4, pxPose.z);
    pixelSpot.range = pxShown ? R.PIXEL.look : 0;
    // the moonling and its rock
    const rg = moonY(mlHome.x, mlHome.z);
    D.drawRock(robots, mlHome.x, rg, mlHome.z, rockYaw);
    R.moonlingPose(reducedMotion ? 0 : clock, mlPose);
    if (ml.peek > 0.05) {
      const out = R.MOONLING.rock * 0.5 + 0.7 * ml.peek;
      const mx = mlHome.x + sideX * out; const mz = mlHome.z + sideZ * out;
      const my = moonY(mx, mz);
      const q = ml.hop > 0 ? 1 - ml.hop / R.MOONLING.hop : -1;
      const hh = q >= 0 ? 0.4 * 4 * q * (1 - q) : 0;
      const yaw = cat ? Math.atan2(cat.x - mx, cat.z - mz) : -side;
      D.drawMoonling(robots, mx, my + hh, mz, yaw, Math.min(1, ml.peek * 1.5), mlPose, ml.wave, rung);
      moonlingSpot.pos.set(mx, my + 0.4 + hh, mz);
      moonlingSpot.range = ml.peek > 0.6 ? 10 : 0;
    } else { moonlingSpot.pos.set(mlHome.x, rg + 0.4, mlHome.z); moonlingSpot.range = 0; }
    D.commit(robotMesh, robots);
    glowP.needsUpdate = true; glowC.needsUpdate = true;
    // the moths
    moths.forEach((m, i) => {
      R.mothPose(m, clock, mp);
      const y = moonY(mp.x, mp.z) + mp.h;
      mothPos[i * 3] = mp.x; mothPos[i * 3 + 1] = y; mothPos[i * 3 + 2] = mp.z;
      const k = mp.glow;
      mothCol[i * 3] = (0.9 - 0.3 * mp.tone) * k; mothCol[i * 3 + 1] = (0.95 + 0.05 * mp.tone) * k; mothCol[i * 3 + 2] = (0.6 + 0.4 * mp.tone) * k;
      mothSpots[i].pos.set(mp.x, y, mp.z);
    });
    mothP.needsUpdate = true; mothC.needsUpdate = true;
  }

  return {
    spottable,
    counts: { rung, drones: drones.length, convoy: convoyN, moths: moths.length, pixel: 1, cleaner: 1, moonling: 1, meshes: 3, pixelSpot: pixIdx },
    get state() { return { clock, convoyD, pixel: { ...px, shown: pxShown }, moonling: { ...ml }, spot, mlSpot }; },
    update(dt, t, catPos, camera, hidden = false) {
      const d = dt > 0 ? Math.min(dt, 0.25) : 0;
      if (catPos) {
        if (prevCat && d > 0) { const v = Math.hypot(catPos.x - prevCat.x, catPos.z - prevCat.z) / d; catSpeed = v < 20 ? v : 0; } // (a jump of the camera or an arrival is no run)
        prevCat = { x: catPos.x, z: catPos.z }; cat = catPos;
      }
      if (camera?.getWorldDirection) { camera.getWorldDirection(fwd); const l = Math.hypot(fwd.x, fwd.z) || 1; fwd.x /= l; fwd.z /= l; }
      robotMesh.mesh.visible = glowMesh.visible = mothMesh.visible = !hidden; // deep in the Lava Tube nothing outside is drawn
      if (hidden) return;
      if (reducedMotion) { if (!drawnOnce) { drawnOnce = true; draw(); } return; }
      clock += d;
      // the convoy rolls unless her own rover (being driven) is within 4 m of the leader or any of them
      const rv = roverAt();
      let halt = false;
      if (rv?.riding) {
        for (let i = 0; i < convoyN; i++) { const p = convoySpots[i].pos; if (Math.hypot(p.x - rv.x, p.z - rv.z) < R.CONVOY.stopNear) halt = true; }
      }
      if (!halt) convoyD += R.CONVOY.speed * d;
      stepPixel(d);
      stepMoonling(d);
      draw();
    },
    dispose() {
      scene.remove(robotMesh.mesh); robotMesh.geo.dispose(); robotMesh.mat.dispose();
      scene.remove(glowMesh); glowGeo.dispose(); glowMat.dispose();
      scene.remove(mothMesh); mothGeo.dispose(); mothMat.dispose(); mothTex.dispose();
    },
  };
}
