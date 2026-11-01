// The fight camera (Clan Life Part 2): while a clan fight is on, from the
// "Fight!" tap to its end (the walk-over included), no tree canopy or trunk
// may hide either cat. The kid has to read the intruder's move.
//
// HOW. The trees tag their Groups with a few simple solids that hold every
// vertex they draw (builder.js TREE_OCCLUDER / PINE_OCCLUDER, a pine stand
// lists its trees). findOccluders reads them once per walk. When a fight
// starts, and again when the rounds begin, chooseFightView tries camera spots
// on rings round the pair's middle, nearest the current view first, and takes
// the first one whose lines to both cats (paws, body and head, everywhere the
// fight can put them) clear every solid, that keeps both cats in the frame
// above the fight sheet, and that is inside the map and out of every
// collider. The choice is made a handful of times per fight, never per frame,
// and only against the trees near the pair: no raycast into the scene at all.
//
// If no spot is clear (it does not happen on the shipped maps:
// test/fightcamworld.test.js), the best spot's blocking trees are hidden for
// the fight (one Group's `visible`, so fewer draws, never more) and shown
// again after it.
//
// createFightCam blends this view over the follow camera that player.update
// has already placed this frame: in over a third of a second (cut at once
// when the follow view is itself blocked), out over about half a second, and
// both as cuts under reduced motion. It never touches the camera while no
// fight is on, and never in photo mode. Purely local: it draws no rng and
// moves no cat.

// Where on a cat the camera must see: paws, body, and a head lifted by a pounce.
export const CAT_HEIGHTS = Object.freeze([0.08, 0.4, 0.85]);
// The solids grow by this much: the trees sway a little in the wind.
export const OCCLUDER_PAD = 0.15;
// The frame the cats must stay in, in normalised device coordinates. The
// fight sheet covers at most the lower 40% of the screen (to -0.2); the
// bottom edge leaves a margin over it.
export const FIGHT_FRAME = Object.freeze({ x: 0.85, top: 0.85, bottom: -0.08 });
// Where the pair's middle (LOOK_Y up) sits on screen: high, in the open part
// above the sheet.
export const AIM_Y = 0.3;
const LOOK_Y = 0.3;
// Camera spots round the pair's middle: distance and height, best first.
// Low rings look in under the canopies; high ones over the undergrowth.
export const RINGS = Object.freeze([
  { d: 5.5, h: 2.2 }, { d: 5.0, h: 1.3 }, { d: 6.5, h: 2.8 }, { d: 4.6, h: 1.0 },
  { d: 7.5, h: 3.4 }, { d: 6.0, h: 1.1 }, { d: 4.2, h: 0.8 }, { d: 8.5, h: 1.4 },
].map((r) => Object.freeze(r)));
const YAW_STEPS = 24;               // every 15 degrees round
const RING_COST = 2;                // one ring further down the list costs two yaw steps
const AXIS_COST = 4;                // looking down the line between the cats, where one hides the other
const AXIS_ANGLE = (25 * Math.PI) / 180;
const COLLIDER_GAP = 0.3;           // m the camera keeps off a collider
const BOUNDS_GAP = 0.5;             // m it keeps inside the map's edge
const EASE_IN = 0.35;               // s
const EASE_OUT = 0.6;               // s
const FOLLOW_RATE = 8;              // 1/s: a new fight view eases in at this rate
const REACH = Math.max(...RINGS.map((r) => r.d)) + 3;

// --- the trees ---------------------------------------------------------------

// Every tagged tree in the scene, in world space:
//   [{ obj, x, z, R, top, shapes: [{ t: 'cyl', x, z, r, y0, y1 } | { t: 'ell', x, y, z, r, ry }] }]
// `obj` is the tree's Group (hidden as a last resort), null for a stand's tree.
// R and top bound the shapes, for a quick reject.
export function findOccluders(scene) {
  const out = [];
  scene.updateMatrixWorld?.(true);
  const add = (obj, px, py, pz, s, shapes) => {
    const placed = shapes.map((sh) => (sh.t === 'cyl'
      ? { t: 'cyl', x: px, z: pz, r: sh.r * s, y0: py + sh.y0 * s, y1: py + sh.y1 * s }
      : { t: 'ell', x: px, y: py + sh.y * s, z: pz, r: sh.r * s, ry: sh.ry * s }));
    const R = Math.max(...placed.map((p) => p.r));
    const top = Math.max(...placed.map((p) => (p.t === 'cyl' ? p.y1 : p.y + p.ry)));
    out.push({ obj, x: px, z: pz, R, top, shapes: placed });
  };
  scene.traverse((o) => {
    const one = o.userData?.occluder;
    const stand = o.userData?.occluderStand;
    if (!one && !stand) return;
    const e = o.matrixWorld.elements;
    const s = Math.hypot(e[0], e[1], e[2]);
    if (one) add(o, e[12], e[13], e[14], s, one);
    if (stand) for (const t of stand.trees) add(null, e[12] + t.x * s, e[13], e[14] + t.z * s, s * t.scale, stand.shapes);
  });
  return out;
}

// Whether the segment a→b passes through a vertical cylinder grown by pad.
function hitsCyl(a, b, c, pad) {
  const r = c.r + pad;
  const dx = b.x - a.x, dz = b.z - a.z;
  const fx = a.x - c.x, fz = a.z - c.z;
  const A = dx * dx + dz * dz;
  let t0, t1;
  if (A < 1e-12) {
    if (fx * fx + fz * fz > r * r) return false;
    t0 = 0; t1 = 1;
  } else {
    const B = 2 * (fx * dx + fz * dz);
    const C = fx * fx + fz * fz - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return false;
    const q = Math.sqrt(disc);
    t0 = Math.max(0, (-B - q) / (2 * A));
    t1 = Math.min(1, (-B + q) / (2 * A));
    if (t0 > t1) return false;
  }
  const ya = a.y + (b.y - a.y) * t0, yb = a.y + (b.y - a.y) * t1;
  return Math.max(ya, yb) >= c.y0 - pad && Math.min(ya, yb) <= c.y1 + pad;
}

// Whether a→b passes through an upright ellipsoid grown by pad.
function hitsEll(a, b, e, pad) {
  const r = e.r + pad;
  const k = r / (e.ry + pad); // squash y so the ellipsoid becomes a sphere of radius r
  const ax = a.x - e.x, ay = (a.y - e.y) * k, az = a.z - e.z;
  const dx = b.x - a.x, dy = (b.y - a.y) * k, dz = b.z - a.z;
  const L = dx * dx + dy * dy + dz * dz;
  const t = L < 1e-12 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / L));
  const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
  return px * px + py * py + pz * pz <= r * r;
}

// Whether a→b passes through one tree.
export function segmentBlocked(a, b, occ, pad = OCCLUDER_PAD) {
  // the tree's bounding cylinder first: most trees are nowhere near the line
  if (!hitsCyl(a, b, { x: occ.x, z: occ.z, r: occ.R, y0: -Infinity, y1: occ.top }, pad)) return false;
  for (const s of occ.shapes) {
    if (s.t === 'cyl' ? hitsCyl(a, b, s, pad) : hitsEll(a, b, s, pad)) return true;
  }
  return false;
}

// The first tree a→b passes through, or null.
export function firstBlocker(a, b, occluders, pad = OCCLUDER_PAD) {
  for (const o of occluders) if (segmentBlocked(a, b, o, pad)) return o;
  return null;
}

// --- the subject -------------------------------------------------------------

// The 3D points to keep in view: every spot either cat can stand on (me, it),
// at each of CAT_HEIGHTS, plus (withPath) the walk-over's run, which must not
// be hidden but may cross the frame's edge.
export function subjectPoints(subject, withPath = false) {
  const out = [];
  const spots = withPath ? [...subject.me, ...subject.it, ...(subject.path || [])] : [...subject.me, ...subject.it];
  for (const p of spots) for (const y of CAT_HEIGHTS) out.push({ x: p.x, y, z: p.z });
  return out;
}

// --- one view ----------------------------------------------------------------

// The view from `pos` with the pair's middle AIM_Y up the screen.
function viewFrom(pos, mid, fovY) {
  const dx = mid.x - pos.x, dy = LOOK_Y - pos.y, dz = mid.z - pos.z;
  const h = Math.hypot(dx, dz);
  const dist = Math.hypot(h, dy);
  const pitch = Math.atan2(dy, h) - Math.atan(AIM_Y * Math.tan((fovY * Math.PI) / 360));
  const look = {
    x: pos.x + (dx / h) * Math.cos(pitch) * dist,
    y: pos.y + Math.sin(pitch) * dist,
    z: pos.z + (dz / h) * Math.cos(pitch) * dist,
  };
  return { pos, look };
}

// Where world point p lands on screen (normalised device coordinates; z is
// the depth in front of the camera), for a camera at view.pos looking at
// view.look with no roll, as three.js's lookAt sets it.
export function projectPoint(view, p, aspect, fovY) {
  const { pos, look } = view;
  let fx = look.x - pos.x, fy = look.y - pos.y, fz = look.z - pos.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // right = forward x up, up' = right x forward
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const vx = p.x - pos.x, vy = p.y - pos.y, vz = p.z - pos.z;
  const depth = vx * fx + vy * fy + vz * fz;
  const tanV = Math.tan((fovY * Math.PI) / 360);
  return {
    x: (vx * rx + vz * rz) / (depth * tanV * aspect),
    y: (vx * ux + vy * uy + vz * uz) / (depth * tanV),
    z: depth,
  };
}

function inFrame(view, pts, aspect, fovY) {
  for (const p of pts) {
    const q = projectPoint(view, p, aspect, fovY);
    if (q.z < 0.5 || Math.abs(q.x) > FIGHT_FRAME.x || q.y > FIGHT_FRAME.top || q.y < FIGHT_FRAME.bottom) return false;
  }
  return true;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The camera spots to try, cheapest first: yaw0 itself, then 15-degree steps
// either way, on each ring; ring0 (the ring already in use) costs nothing.
function candidates(subject, yaw0, ring0) {
  const list = [];
  const ax = Math.atan2(subject.axis.x, subject.axis.z);
  RINGS.forEach((ring, ri) => {
    const rc = ri === ring0 ? 0 : RING_COST * (ri + (ring0 == null ? 0 : 1));
    for (let k = 0; k < YAW_STEPS; k++) {
      const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      const yaw = wrap(yaw0 + (step * 2 * Math.PI) / YAW_STEPS);
      const off = Math.abs(wrap(yaw - ax));
      const along = off < AXIS_ANGLE || Math.PI - off < AXIS_ANGLE;
      list.push({ yaw, ri, cost: Math.abs(step) + rc + (along ? AXIS_COST : 0) });
    }
  });
  // a stable sort: equal costs keep their order, so the choice is deterministic
  return list.map((c, i) => ({ ...c, i })).sort((p, q) => p.cost - q.cost || p.i - q.i);
}

// The fight view: { pos, look, yaw, ring, clear, blockers }. clear is false
// only when no spot clears every tree; blockers then lists the trees (each
// with its Group) whose hiding clears the chosen spot.
export function chooseFightView({ subject, occluders = [], colliders = [], bounds = null, yaw0 = 0, ring0 = null, aspect = 1, fovY = 70 }) {
  const { mid } = subject;
  const near = occluders.filter((o) => Math.hypot(o.x - mid.x, o.z - mid.z) <= REACH + o.R);
  const framePts = subjectPoints(subject, false);
  const seePts = subjectPoints(subject, true);
  let fallback = null;
  for (const c of candidates(subject, yaw0, ring0)) {
    const ring = RINGS[c.ri];
    const pos = { x: mid.x + Math.sin(c.yaw) * ring.d, y: ring.h, z: mid.z + Math.cos(c.yaw) * ring.d };
    if (bounds && (pos.x < bounds.minX + BOUNDS_GAP || pos.x > bounds.maxX - BOUNDS_GAP ||
      pos.z < bounds.minZ + BOUNDS_GAP || pos.z > bounds.maxZ - BOUNDS_GAP)) continue;
    if (colliders.some((k) => Math.hypot(pos.x - k.x, pos.z - k.z) < k.r + COLLIDER_GAP)) continue;
    const view = viewFrom(pos, mid, fovY);
    if (!inFrame(view, framePts, aspect, fovY)) continue;
    const blockers = new Set();
    let hideable = true;
    for (const p of seePts) {
      for (const o of near) {
        if (blockers.has(o) || !segmentBlocked(pos, p, o)) continue;
        blockers.add(o);
        if (!o.obj) hideable = false;
      }
      if (!fallback && !hideable) break;
    }
    if (blockers.size === 0) return { ...view, yaw: c.yaw, ring: c.ri, clear: true, blockers: [] };
    if (hideable && (!fallback || blockers.size < fallback.blockers.length)) {
      fallback = { ...view, yaw: c.yaw, ring: c.ri, clear: false, blockers: [...blockers] };
    }
  }
  if (fallback) return fallback;
  // Nothing fits at all (a cat pinned in a corner of the map): the first ring
  // straight back, as the follow camera would be.
  const ring = RINGS[0];
  const pos = { x: mid.x + Math.sin(yaw0) * ring.d, y: ring.h, z: mid.z + Math.cos(yaw0) * ring.d };
  return { ...viewFrom(pos, mid, fovY), yaw: yaw0, ring: 0, clear: false, blockers: [] };
}

// --- the blend ---------------------------------------------------------------

const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, t) => a + (b - a) * t;

// update(dt, { subject, cameraMode, camera, cat }) after player.update has
// placed the follow camera and the fight has placed the cats. `subject` is
// clanfight's cameraSubject (null when no fight is on); `cat` is my cat's
// position, which the follow camera looks at. Returns whether it moved the
// camera this frame.
export function createFightCam({ occluders = [], colliders = [], bounds = null, reducedMotion = false, lookY = 0.6 } = {}) {
  let w = 0;            // 0 follow camera .. 1 fight camera
  let view = null;      // the chosen view
  let cur = null;       // where the fight camera is, easing toward view
  let lastSubject = null;
  let lastAspect = 0;
  let hidden = [];

  function show() {
    for (const o of hidden) o.obj.visible = true;
    hidden = [];
  }

  function choose(subject, camera) {
    const mid = subject.mid;
    const from = cur ? cur.pos : camera.position;
    const yaw0 = Math.atan2(from.x - mid.x, from.z - mid.z);
    const next = chooseFightView({
      subject, occluders, colliders, bounds, yaw0, ring0: view ? view.ring : null,
      aspect: camera.aspect, fovY: camera.fov,
    });
    show();
    for (const o of next.blockers) { o.obj.visible = false; hidden.push(o); }
    return next;
  }

  function followBlocked(subject, camera) {
    const pos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    return subjectPoints(subject, false).some((p) => firstBlocker(pos, p, occluders));
  }

  const api = {
    get weight() { return w; },
    get view() { return view; },
    update(dt, { subject, cameraMode = false, camera, cat }) {
      const active = !!subject && !cameraMode;
      if (!active) {
        lastSubject = null;
        show();
        if (cameraMode || reducedMotion) w = 0;
        else w = Math.max(0, w - dt / EASE_OUT);
        if (w === 0) { view = null; cur = null; return false; }
      } else if (subject !== lastSubject || camera.aspect !== lastAspect) {
        const entering = w === 0;
        view = choose(subject, camera);
        lastSubject = subject;
        lastAspect = camera.aspect;
        if (entering) {
          cur = { pos: { ...view.pos }, look: { ...view.look } };
          if (reducedMotion || followBlocked(subject, camera)) w = 1;
        }
      }
      if (active) {
        w = reducedMotion ? 1 : Math.min(1, w + dt / EASE_IN);
        const k = reducedMotion ? 1 : 1 - Math.exp(-FOLLOW_RATE * Math.max(dt, 0));
        for (const key of ['pos', 'look']) {
          for (const ax of ['x', 'y', 'z']) cur[key][ax] = lerp(cur[key][ax], view[key][ax], k);
        }
      }
      const s = smooth(w);
      const fp = camera.position;
      const fl = { x: cat.x, y: (cat.y ?? 0) + lookY, z: cat.z };
      const px = lerp(fp.x, cur.pos.x, s), py = lerp(fp.y, cur.pos.y, s), pz = lerp(fp.z, cur.pos.z, s);
      camera.position.set(px, py, pz);
      camera.lookAt(lerp(fl.x, cur.look.x, s), lerp(fl.y, cur.look.y, s), lerp(fl.z, cur.look.z, s));
      return true;
    },
    // The walk ended: every hidden tree back, nothing held.
    dispose() { show(); view = null; cur = null; w = 0; lastSubject = null; },
  };
  return api;
}
