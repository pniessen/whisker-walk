// Split screen (S2): makes the camera-following systems right when two cameras draw one frame.
// Lazy: imported by splitview.js (or the picture page) only behind ?split=1. The maths is in splitcentre.js.
//
// The wiring (see docs/split-screen-s2.md): once per frame, then around each view's renderer.render:
//   sys.beginFrame(session, [cam0, cam1], [cat0Pos, cat1Pos]);
//   for each view i:  sys.beforeView(i, cams[i], catPos[i], session);  renderer.render(...);  sys.afterView();
// afterView() after the LAST view puts everything back, so a frame that is not split draws as ever.
//
// Per system (what and why):
//   shadows   ONE map per frame: refitted on the midpoint of the two views' fit centres with a bigger radius
//             (shadowSplitFit), drawn during view 0's render, kept (shadowMap.autoUpdate off) for view 1.
//   grass     two patches: grass.view(i, cam) swaps in view i's own instance buffers (re-laid ~1/s per patch).
//   clouds, stars, moon   slid onto the view's camera (clouds.view): no per-instance work.
//   rain      the column re-posed round the view's camera (weather.view).
//   ambient, treefade, strip tiles, people   take cat two as a second focus (their update runs in the main loop,
//             so they see it one frame late, which is invisible): setSecond.
import * as THREE from 'three';
import { fitCentre, lightBasis, snapToTexelGrid, SHADOW_LEAD_FRACTION, SHADOW_BACKOFF } from '../render/shadowfit.js';
import { setSecondCameraAll } from '../people/index.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import { assignShadowCastersFor, trimShadowCasters } from '../render/rig.js';
import { SECOND_ID } from './second.js';
import { shadowSplitFit, shadowScale } from './splitcentre.js';

const secondGroup = (session) => session?.remotes?.list?.find((e) => e.playerId === SECOND_ID)?.group ?? null;
/** Cat two's position (it is drawn as a remote cat), or null. */
export const secondCatPos = (session) => secondGroup(session)?.position ?? null;
const swept = new WeakSet();
// A remote cat joins the scene after the walk's caster sweep, so it casts no shadow (nor does a co-walker
// today). Cat two is half of the picture here, so it gets the same rule once, with the rung's part trim.
function ensureCasters(session) {
  const g = secondGroup(session);
  if (!g || swept.has(g)) return;
  swept.add(g);
  assignShadowCastersFor(g);
  const min = session.tier?.shadowMinPart;
  if (min > 0) trimShadowCasters({ children: [g], updateMatrixWorld: () => g.updateMatrixWorld(true) }, min);
}

export function createSplitSys({ renderer }) {
  let sun = null; let sunScene = null;
  let base = null; // the sun's one-view numbers, read once per walk: { radius, normalBias, pcf, direction, basis }
  let fitted = false; // the map is refitted this frame (restore it at the end)
  let wasAuto = true;
  let views = 0;
  let cam0 = null; let sess = null;
  let last = { radius: 0, covered: true }; // for tests and the picture page
  const centreA = new THREE.Vector3(); const centreB = new THREE.Vector3();
  const look2 = { x: 0, y: 0, z: 0 };

  function findSun(scene) {
    if (sunScene === scene) return;
    sunScene = scene; sun = null; base = null;
    scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.castShadow) sun = o; });
    if (!sun) return;
    const cam = sun.shadow.camera;
    // `direction` as shadowfit.js held it (position - target, normalised) is recoverable only while the rig has
    // not moved the light; the rig moves BOTH together, so the difference is still the direction.
    const d = sun.position.clone().sub(sun.target.position).normalize();
    base = { radius: cam.right, normalBias: sun.shadow.normalBias, pcf: sun.shadow.radius, direction: d, basis: lightBasis(d) };
  }

  function beginFrame(session, cams, cats) {
    views = 0; cam0 = cams[0]; sess = session;
    const c2 = cats[1];
    session.stripTiles?.setSecond?.(c2.x, c2.z);
    session.ambient?.setSecond?.(cams[1], c2);
    look2.x = c2.x; look2.y = c2.y + CAT_LOOK_Y; look2.z = c2.z;
    session.treeFade?.setSecond?.(cams[1], look2);
    setSecondCameraAll(cams[1]);
    // shadows
    ensureCasters(session);
    findSun(session.scene);
    fitted = false;
    if (sun && base) { // (the one-view numbers may have changed with a quality step: read them each frame, they were restored)
      base.radius = sun.shadow.camera.right; base.normalBias = sun.shadow.normalBias; base.pcf = sun.shadow.radius;
    }
    if (!sun || !base || !renderer.shadowMap.enabled || sun.shadow.autoUpdate === false || sun.shadow.intensity === 0) return;
    const lead = base.radius * SHADOW_LEAD_FRACTION;
    fitCentre(cams[0], lead, centreA); fitCentre(cams[1], lead, centreB);
    const f = shadowSplitFit(centreA, centreB, base.basis, base.radius);
    last = { radius: f.radius, covered: f.covered };
    const sc = shadowScale(f.radius, base.radius);
    const sh = sun.shadow; const sc3 = sh.camera;
    sc3.left = -f.radius; sc3.right = f.radius; sc3.top = f.radius; sc3.bottom = -f.radius;
    sc3.updateProjectionMatrix();
    sh.normalBias = base.normalBias * sc.normalBiasK;
    sh.radius = base.pcf * sc.pcfRadiusK;
    const texel = (2 * f.radius) / sh.mapSize.x;
    snapToTexelGrid(sun.target.position.set(f.x, centreA.y, f.z), base.basis, texel, sun.target.position);
    sun.target.updateMatrixWorld();
    sun.position.copy(sun.target.position).addScaledVector(base.direction, SHADOW_BACKOFF);
    wasAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true; // drawn once, during view 0's render
    fitted = true;
  }

  function beforeView(i, camera, catPos, session) {
    session.grass?.view?.(i, camera);
    session.clouds?.view?.(camera);
    session.weather?.view?.(camera);
  }

  function afterView() {
    if (++views < 2) return;
    // after the last view: everything back on cat one
    if (sess) {
      sess.grass?.view?.(0, cam0);
      sess.clouds?.view?.(cam0);
      sess.weather?.view?.(cam0);
    }
    if (fitted) {
      const sh = sun.shadow; const sc3 = sh.camera; const r = base.radius;
      sc3.left = -r; sc3.right = r; sc3.top = r; sc3.bottom = -r;
      sc3.updateProjectionMatrix();
      sh.normalBias = base.normalBias; sh.radius = base.pcf;
      renderer.shadowMap.autoUpdate = wasAuto;
      fitted = false;
    }
  }

  return { beginFrame, beforeView, afterView, get last() { return last; } };
}
