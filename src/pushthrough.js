import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { frameColliders } from './propsets.js';
import { mulberry32, seedFromCode } from './rng.js';

// =============================================================================
// Push-throughs — the cat flap in a garden gate, the cat-sized gap in a hedge
// (v21 Stream 3b, Task 14). A cat that walks through the opening swings the
// flap (or rustles the sprigs hanging in the gap, and sways the hedge) the
// way it went, and from then on it never quite stops: a gentle 0.06 rad sway
// stays on it until the walk ends. Nothing is saved, nothing pays and nothing
// goes on any wire.
//
// THE MOVERS ARE EVERY CAT ON MY SCREEN: the local cat and each remote one
// (walk.js / main.js pass their positions). A partner's push is seen here as
// her cat crossing the opening, exactly as mine is, so it swings on my screen
// with no network event. Two co-walkers may see a sway at slightly different
// phases (frame rates differ); it is purely cosmetic, so that is fine. No
// randomness at all, save each gap's sprigs' fixed variety, which hashes the
// flap's own id (never walkRng, never Math.random).
//
// Geometry. The panel's local x runs along the frame and local z is the way
// through (propsets.js's rotY convention). The opening is |x| < width / 2;
// the frame runs from there out to exactly where frameColliders' end circles
// stop (width / 2 + 1.2 + 0.3), measured off the colliders rather than
// restated, so the cat is never held off by thin air past the end and never
// walks into a panel the colliders do not cover. Gate posts reach down below
// the ground (y -0.6), so a gate across the pier or the plank bridge reads as
// standing on pilings where it overhangs the water, not as floating.
//
// Every geometry and material is created per walk and disposed exactly once
// in dispose(), which runs before endWalk's scene traversal (the
// knockables.js pattern) so that traversal never frees them a second time.
// =============================================================================

const SWAY = 0.06;        // rad: the sway a pushed flap never decays below
const MAX_SWING = 1.2;    // rad: a flurry of pushes never flips it over its lintel
const OMEGA = 5.5;        // rad/s: the leaf's natural swing (~0.9 Hz)
const DAMPING = 1.2;      // 1/s: how quickly a hard push dies back to the sway
const IMPULSE = 3.5;      // rad/s: what one push through adds, the way the cat went
const HEDGE_SWAY = 0.3;   // the hedge halves lean this fraction of the sprigs' swing
const RUSTLE = 0.04;      // a sprig's sideways flutter per rad/s of swing speed
const STEP = 1 / 60;      // s: the integration substep
const MAX_DT = 0.25;      // s: a long frame (a tab coming back) is clamped to this
const MAX_STEP = 1.5;     // m: a mover that jumped further than this in a frame teleported
const LINE = 0.01;        // m: closer than this to the panel's line is on neither side
const NEAR = 1;           // m: a side flip only counts this close to the line
const QUIET = 0.35;       // s: a push this soon after the last one on the same flap still swings it, but makes no sound

// A cat stands up to 0.89 m (its ears 0.83, its raised tail 0.89), so both
// openings are clear to 1 m: nothing solid over the cat as it goes through,
// only the leaf or the sprigs it pushes aside.
const OPEN_H = 1.0;       // m: the top of a gate's flap opening (the lintel's underside)
const GATE_H = 1.25;      // m: the gate's top rail
const POST_H = 1.4;       // m: the end posts' tops
const BURY = -0.6;        // m: how far the posts and jambs reach below the ground
const HEDGE_H = 1.2;      // m: the hedge's height
const HEDGE_D = 0.56;     // m: the hedge's depth (the colliders' is 0.6)
const ARCH_Y = 1.0;       // m: the underside of the leaves grown over a gap
const SPRIGS = 5;
const PLANTER_H = 0.3;    // m: the planter boxes along a gate's wings (they show 5 cm above the pier deck)
const PLANTER_D = 0.56;   // m: their depth, inside the colliders' 0.6

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// A box `w` along x, from y0 up to y1, `d` across, centred on x.
function slab(w, y0, y1, d, mat, x = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, y1 - y0, d), mat, x, (y0 + y1) / 2, z);
}

// The garden gate: an end post at each end, a jamb either side of the opening,
// palings between them on two rails, a planter box along the foot of each
// wing, a top rail right across, a lintel over the opening with a short panel
// above it, and the flap leaf (wood, a shade lighter than the palings, with a
// dark hinge bar along its top) hanging from the lintel on its hinge
// (`swinger`, rotation.x).
function buildGate(group, half, end) {
  const wood = litMaterial(0xa9845a);
  const post = litMaterial(0x6e5235);
  const leafMat = litMaterial(0xc29d70); // a shade lighter than the palings
  const hinge = litMaterial(0x3a2c1e);
  const box = litMaterial(0x8a6a42);
  const green = litMaterial(0x5a9444);
  const plant = new THREE.IcosahedronGeometry(0.13, 0);
  for (const side of [-1, 1]) {
    group.add(slab(0.14, BURY, POST_H, 0.14, post, side * (end - 0.07)));
    group.add(slab(0.1, BURY, GATE_H, 0.1, post, side * (half + 0.05)));
    // the palings, between the jamb and the end post
    const x0 = half + 0.1;
    const x1 = end - 0.14;
    const run = x1 - x0;
    const n = Math.max(1, Math.floor((run + 0.04) / 0.15));
    const pitch = run / n;
    const board = new THREE.BoxGeometry(pitch - 0.04, GATE_H - 0.1, 0.03);
    for (let i = 0; i < n; i++) {
      group.add(mesh(board, wood, side * (x0 + (i + 0.5) * pitch), 0.08 + (GATE_H - 0.1) / 2, 0));
    }
    for (const y of [0.3, 1.05]) {
      group.add(mesh(new THREE.BoxGeometry(run, 0.07, 0.04), post, side * (x0 + run / 2), y, 0.035));
    }
    // A planter box along the foot of each wing, as deep as the colliders, so
    // a cat walking square into the gate stops with its paws at the box
    // rather than a quarter-metre short of the palings.
    group.add(slab(run, 0, PLANTER_H, PLANTER_D, box, side * (x0 + run / 2)));
    const plants = Math.max(1, Math.round(run / 0.32));
    for (let i = 0; i < plants; i++) {
      const z = (i % 2 ? -1 : 1) * 0.13;
      group.add(mesh(plant, green, side * (x0 + ((i + 0.5) * run) / plants), PLANTER_H + 0.05, z));
    }
  }
  group.add(slab(2 * (end - 0.14), GATE_H - 0.02, GATE_H + 0.06, 0.06, post));
  group.add(slab(2 * half, OPEN_H, OPEN_H + 0.08, 0.08, post));
  group.add(slab(2 * half, OPEN_H + 0.08, GATE_H - 0.02, 0.03, wood));
  const leaf = new THREE.Group();
  leaf.name = 'leaf';
  leaf.position.y = OPEN_H;
  const h = OPEN_H - 0.08;
  leaf.add(mesh(new THREE.BoxGeometry(2 * half - 0.08, h, 0.025), leafMat, 0, -h / 2, 0));
  // the hinge bar along its top edge, so it reads as a flap and not a sheet
  leaf.add(mesh(new THREE.BoxGeometry(2 * half - 0.04, 0.05, 0.045), hinge, 0, -0.025, 0));
  group.add(leaf);
  return { swingers: [leaf], hedges: [], spin: [] };
}

// The hedge with a gap: a clipped hedge either side of the opening (each its
// own `hedge` group, pivoting at its foot so it can lean), leaves grown over
// the gap, and sprigs hanging in it (`sprig`, rotation.x) that a cat brushes
// through. Each sprig's lean and flutter differ a little, fixed by the id.
function buildHedge(group, half, end, id) {
  const leafy = litMaterial(0x4a7f3a);
  const light = litMaterial(0x5f9a48);
  const len = end - half;
  const clump = new THREE.IcosahedronGeometry(0.2, 0);
  const hedges = [];
  for (const side of [-1, 1]) {
    const h = new THREE.Group();
    h.name = 'hedge';
    h.position.x = side * (half + len / 2);
    h.add(slab(len, 0, HEDGE_H - 0.08, HEDGE_D, leafy));
    for (const f of [-0.3, 0, 0.3]) h.add(mesh(clump, light, f * len, HEDGE_H - 0.12, 0));
    group.add(h);
    hedges.push(h);
  }
  group.add(slab(2 * half + 0.1, ARCH_Y, HEDGE_H - 0.06, HEDGE_D * 0.8, leafy));
  const twig = new THREE.IcosahedronGeometry(0.085, 0);
  const rng = mulberry32(seedFromCode(String(id)));
  const swingers = [];
  const spin = [];
  for (let i = 0; i < SPRIGS; i++) {
    const s = new THREE.Group();
    s.name = 'sprig';
    s.position.set(-half + 0.1 + ((2 * half - 0.2) * i) / (SPRIGS - 1), ARCH_Y, 0);
    s.add(mesh(twig, light, 0, -0.14, 0));
    s.add(mesh(twig, leafy, (rng() - 0.5) * 0.08, -0.3, 0));
    s.add(mesh(twig, light, (rng() - 0.5) * 0.08, -0.45, 0));
    group.add(s);
    swingers.push(s);
    spin.push({ lean: 0.75 + rng() * 0.5, flutter: (rng() - 0.5) * 1.2 });
  }
  return { swingers, hedges, spin };
}

// createPushThroughs(scene, flaps, { reducedMotion }) — flaps is
// propsFor(areaId).flaps: [{ id, kind: 'flap'|'gap', x, z, rotY, width }].
// Entries are { id, kind, group, swing, vel, pushed }: `swing` is how far it
// has swung toward its local +z (rad; the gate's leaf, a gap's sprigs), `vel`
// its rate, and `pushed` whether any cat has been through it yet this walk.
// `colliders` is every frame's circles, for walk.js to make solid.
//
// update(dt, movers) — movers are THREE.Vector3 positions (mine first, then
// my co-walkers'). Every push swings it; update returns the ones worth a
// sound, as [{ id, kind, by }] with `by` the mover's index (the same array
// each call, valid until the next one). A push within QUIET seconds of the
// last push on the same flap is not returned, so a cat rocking back and forth
// in the opening thunks once, not on every crossing.
//
// With reducedMotion a push still swings it (that is the answer to what the
// cat did), but it then comes to rest instead of swaying for good: the same
// rule wind.js applies to the foliage.
export function createPushThroughs(scene, flaps, { reducedMotion = false } = {}) {
  const items = [];
  const rigs = new Map(); // entry → its geometry and its pieces, kept off the public shape
  const colliders = [];
  const pushes = [];
  const seen = new Map(); // mover → { x, z, frame, sides } (last definite side per entry)
  let frame = 0;
  let clock = 0; // s: this walk's push-through time, for the sound cooldown
  let disposed = false;

  for (const f of flaps ?? []) {
    if (!f || (f.kind !== 'flap' && f.kind !== 'gap')) continue;
    const frameC = frameColliders(f);
    if (frameC.length === 0) continue;
    const ax = Math.cos(f.rotY);
    const az = -Math.sin(f.rotY);
    const half = f.width / 2;
    const end = Math.max(...frameC.map((c) => Math.abs((c.x - f.x) * ax + (c.z - f.z) * az) + c.r));
    const group = new THREE.Group();
    group.position.set(f.x, 0, f.z);
    group.rotation.y = f.rotY;
    const parts = f.kind === 'flap' ? buildGate(group, half, end) : buildHedge(group, half, end, f.id);
    scene.add(group);
    colliders.push(...frameC);
    const entry = { id: f.id, kind: f.kind, group, swing: 0, vel: 0, pushed: false };
    items.push(entry);
    rigs.set(entry, {
      ...parts,
      x: f.x, z: f.z, half,
      lastPush: -Infinity,
      ax, az, nx: Math.sin(f.rotY), nz: Math.cos(f.rotY),
    });
  }

  function pose(entry) {
    const r = rigs.get(entry);
    if (entry.kind === 'flap') {
      // hinged at its top: a positive rotation.x swings the bottom toward -z
      r.swingers[0].rotation.x = -entry.swing;
      return;
    }
    r.swingers.forEach((s, i) => {
      s.rotation.x = -entry.swing * r.spin[i].lean;
      s.rotation.z = entry.vel * RUSTLE * r.spin[i].flutter;
    });
    // pivoting at its foot: a positive rotation.x leans the top toward +z
    for (const h of r.hedges) h.rotation.x = entry.swing * HEDGE_SWAY;
  }

  function step(entry, h) {
    entry.vel += (-OMEGA * OMEGA * entry.swing - DAMPING * entry.vel) * h;
    entry.swing += entry.vel * h;
    if (Math.abs(entry.swing) > MAX_SWING) {
      entry.swing = Math.sign(entry.swing) * MAX_SWING;
      if (entry.vel * entry.swing > 0) entry.vel *= -0.3; // a soft bump, back the other way
    }
    if (!reducedMotion) {
      const amp = Math.hypot(entry.swing, entry.vel / OMEGA);
      if (amp === 0) entry.vel = SWAY * OMEGA;
      else if (amp < SWAY) {
        entry.swing *= SWAY / amp;
        entry.vel *= SWAY / amp;
      }
    }
  }

  // Which movers walked through which openings since last frame. A mover's
  // side of each panel's line is remembered only once it is clearly off the
  // line, so a cat that creeps across, a frame at a time, still counts, and
  // one walking along the line never does.
  function detect(movers) {
    frame++;
    movers.forEach((m, by) => {
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.z)) return;
      let rec = seen.get(m);
      const fresh = !rec || Math.hypot(m.x - rec.x, m.z - rec.z) > MAX_STEP;
      if (!rec) {
        rec = { x: 0, z: 0, frame: 0, sides: new Int8Array(items.length) };
        seen.set(m, rec);
      }
      rec.x = m.x;
      rec.z = m.z;
      rec.frame = frame;
      items.forEach((e, i) => {
        const r = rigs.get(e);
        const dx = m.x - r.x;
        const dz = m.z - r.z;
        const n = dx * r.nx + dz * r.nz;
        const side = n > LINE ? 1 : n < -LINE ? -1 : 0;
        if (side === 0) return;
        const was = rec.sides[i];
        rec.sides[i] = side;
        if (fresh || was === 0 || was === side || Math.abs(n) > NEAR) return;
        if (Math.abs(dx * r.ax + dz * r.az) > r.half) return;
        e.vel += side * IMPULSE;
        e.pushed = true;
        if (clock - r.lastPush >= QUIET) pushes.push({ id: e.id, kind: e.kind, by });
        r.lastPush = clock;
      });
    });
    // a mover missing this frame (a partner who left) starts afresh if she returns
    for (const [m, rec] of seen) if (rec.frame !== frame) seen.delete(m);
  }

  return {
    list: items,
    colliders,
    update(dt, movers) {
      pushes.length = 0;
      if (disposed || !(dt > 0)) return pushes;
      const left = Math.min(dt, MAX_DT);
      clock += left;
      if (Array.isArray(movers)) detect(movers);
      for (const e of items) {
        if (!e.pushed) continue;
        for (let t = left; t > 1e-9; t -= STEP) step(e, Math.min(STEP, t));
        pose(e);
      }
      return pushes;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geos = new Set();
      const mats = new Set();
      for (const e of items) {
        scene.remove(e.group);
        e.group.traverse((o) => {
          if (o.geometry) geos.add(o.geometry);
          if (o.material) {
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
          }
        });
      }
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      items.length = 0;
      colliders.length = 0;
      rigs.clear();
      seen.clear();
    },
  };
}
