// The shared camera of couch play: pure maths, no page. Cat one's own camera
// (src/player.js) keeps running; after it, src/coop/index.js re-places the
// camera on the midpoint of the two cats and widens it through the camera's
// own steps (src/camzoom.js) until both cats sit inside a safe box.
//
// The view has a fixed heading: nobody orbits it freely. L1 / R1 turn it a
// quarter, eased, and a stick held through the turn keeps its world direction
// (the caller hands the old heading to player.setInputYaw).
import * as THREE from 'three';
import { zoomView, MAX_ZOOM_STEP } from '../camzoom.js';
import { cameraOffset } from '../catcam.js';

export const SAFE_W = 0.85; // of the half-width of the picture
export const SAFE_H = 0.8; // of the half-height
export const CAT_TOP = 1.1; // a cat and its name tag stand this far above its feet
const QUARTER = Math.PI / 2;
const IN_TAU = 0.2; // widening is quick: a cat never leaves the picture while it catches up
const OUT_TAU = 0.8; // closing in is slow, so the camera does not pump
const TURN_RATE = 8; // 95 % of a quarter turn in about 0.4 s

const cam = new THREE.PerspectiveCamera();
const off = new THREE.Vector3();
const look = new THREE.Vector3();
const p = new THREE.Vector3();
const view = { dist: 0, height: 0 };

function setLens(fov, aspect) {
  if (cam.fov !== fov || cam.aspect !== aspect) { cam.fov = fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
}

/** The camera's offset from the look point at `level`, the heading and the pitch (into `out`). */
export function offsetAt(level, yaw, pitch, out = new THREE.Vector3()) {
  zoomView(level, view);
  return cameraOffset(yaw, pitch, view.dist, view.height, out);
}

/** Do all `pts` ({x, y, z} feet and heads) sit inside the safe box with the camera at `level` on `mid`? */
export function fitsAt(pts, level, mid, yaw, { pitch, lookY, fov, aspect }) {
  setLens(fov, aspect);
  offsetAt(level, yaw, pitch, off);
  cam.position.copy(mid).add(off);
  look.set(mid.x, mid.y + lookY, mid.z);
  cam.lookAt(look);
  cam.updateMatrixWorld(true);
  for (const q of pts) {
    p.copy(q).project(cam);
    if (!(p.z <= 1) || Math.abs(p.x) > SAFE_W || Math.abs(p.y) > SAFE_H) return false;
  }
  return true;
}

/** Are all `pts` inside the safe box (a little slack) as `camera` really sees them now, with whatever pulled it in? */
export function inBox(pts, camera, slack = 0.04) {
  camera.updateMatrixWorld(true);
  for (const q of pts) {
    p.copy(q).project(camera);
    if (!(p.z <= 1) || Math.abs(p.x) > SAFE_W + slack || Math.abs(p.y) > SAFE_H + slack) return false;
  }
  return true;
}

/** The two cats' feet and heads, as a list of points (reused objects: no allocation per frame). */
const pool = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
export function catPoints(a, b) {
  pool[0].set(a.x, a.y, a.z); pool[1].set(a.x, a.y + CAT_TOP, a.z);
  pool[2].set(b.x, b.y, b.z); pool[3].set(b.x, b.y + CAT_TOP, b.z);
  return pool;
}

/**
 * The smallest zoom level at or above `base` that fits the points, or the
 * widest step when even that does not (a bisection: more distance only ever
 * brings the cats closer to the middle of the picture).
 */
export function neededLevel(pts, base, mid, yaw, lens) {
  if (fitsAt(pts, base, mid, yaw, lens)) return base;
  if (!fitsAt(pts, MAX_ZOOM_STEP, mid, yaw, lens)) return MAX_ZOOM_STEP;
  let lo = base, hi = MAX_ZOOM_STEP;
  for (let i = 0; i < 9; i++) {
    const m = (lo + hi) / 2;
    if (fitsAt(pts, m, mid, yaw, lens)) hi = m; else lo = m;
  }
  return hi;
}

const sepCache = new Map();
/**
 * How far apart two cats can stand, side by side across the picture, with the
 * camera at its widest step: the leash of couch play. Read from the live
 * lens, so a 4:3 window gets less than a 16:9 television.
 */
export function maxSeparation(lens) {
  const key = `${lens.fov}|${lens.aspect}|${lens.pitch}|${lens.lookY}`;
  if (sepCache.has(key)) return sepCache.get(key);
  const mid = new THREE.Vector3(0, 0, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let lo = 0, hi = 120;
  for (let i = 0; i < 24; i++) {
    const d = (lo + hi) / 2;
    a.set(-d / 2, 0, 0); b.set(d / 2, 0, 0); // yaw 0: the screen's right is +x
    const pts = catPoints(a, b);
    if (fitsAt(pts, MAX_ZOOM_STEP, mid, 0, lens)) lo = d; else hi = d;
  }
  sepCache.set(key, lo);
  return lo;
}

/** The camera's widening, eased: quick out, slow back in. Snaps under reduced motion. */
export function easeLevel(level, target, dt, reduced) {
  if (reduced || !Number.isFinite(level)) return target;
  const tau = target > level ? IN_TAU : OUT_TAU;
  const next = level + (target - level) * (1 - Math.exp(-Math.max(dt, 0) / tau));
  return Math.abs(target - next) < 0.005 ? target : next;
}

/** The view's heading: a target set in quarter turns, and the eased heading the camera really has. */
export function createHeading(yaw = 0) {
  return {
    target: yaw,
    yaw,
    /** Snap to the nearest quarter (the pair heading a couch walk starts from). */
    square(from) { this.target = Math.round(from / QUARTER) * QUARTER; return this.target; },
    /** One quarter: dir +1 (L1) takes the camera round to the right (the world swings left), -1 (R1) the other way, as the right stick does. */
    turn(dir) { this.target += dir * QUARTER; },
    step(dt, reduced) {
      if (reduced) this.yaw = this.target;
      else {
        const k = 1 - Math.exp(-TURN_RATE * Math.max(dt, 0));
        this.yaw += (this.target - this.yaw) * k;
        if (Math.abs(this.target - this.yaw) < 0.002) this.yaw = this.target;
      }
      return this.yaw;
    },
  };
}
