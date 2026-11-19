// =============================================================================
// Strip tiles (bigger areas, docs/superpowers/specs/2026-11-19-bigger-areas-design.md).
//
// A STRIP is a rectangle of new ground outside an area's frozen core. It is
// cut into square TILES of about 20 m. What grows on a tile is a pure function
// of (area, strip, tile index): each tile draws from its own seeded stream, so
// a tile looks the same whenever and on whatever device it is built, and
// building or dropping one never moves another.
//
// What exists from the start of a walk is cheap and whole: the bounds, the
// ground, the water and every collider (a tree's circle is read from the same
// pure content, with no mesh). What is DRAWN streams: a tile's things are built
// when the cat comes within a layer's `show` range and dropped when it is past
// the layer's `hide` range. The gap between the two is the hysteresis, so a
// cat pacing a boundary does not build and drop the same tile over and over.
//
// This file is the arithmetic only: no THREE, no dice of its own, no clock.
// render/striptiles.js makes the meshes.
// =============================================================================

export const TILE_SIZE = 20;

// The layers, measured from the cat to the tile's nearest point. Past a
// layer's range its things are not gone: each has a far stand-in
// (render/standins.js), so nothing pops out of the view, it only gets
// simpler where it is small on the screen.
//   fine    a dense, costly stand (the River's reedbed: forty triangles a
//           clump) is drawn in full only near; past 20 m, five a clump.
//   small   reeds, tussocks, flowers and stones.
//   trees   within about 65 m (step 2, "the 65 m approach"), where the haze
//           is a fifth of the way in (the fog runs 40 to 130 m,
//           builder.applySky); past it, a stand-in of about 40 triangles.
// Step 1 had only small (45/58) and trees (90/105), with nothing past them.
// Chosen so the River, core and west strip, stays under 70,000 triangles at
// the worst place a cat can stand (test/striptiles.test.js).
export const LAYERS = Object.freeze([
  Object.freeze({ id: 'fine', show: 14, hide: 20 }),
  Object.freeze({ id: 'small', show: 30, hide: 38 }),
  Object.freeze({ id: 'trees', show: 55, hide: 65 }),
]);

// How often the ranges are looked at (seconds), and how much building one
// frame may do: a count of triangles, and a time in milliseconds. A step that
// would go over the triangle count waits for the next frame; the first step of
// a frame always runs, so the queue cannot stall.
export const CHECK_EVERY = 0.25;
export const FRAME_TRIANGLES = 1600;
export const FRAME_MS = 2;

// Cuts `rect` ({ minX, maxX, minZ, maxZ }) into tiles of about `size`, in row
// order (z outer, x inner). A tile's `index` is its place in that order and is
// part of its seed, so the cut must never change for a shipped strip.
export function cutTiles(rect, size = TILE_SIZE) {
  const cols = Math.max(1, Math.round((rect.maxX - rect.minX) / size));
  const rows = Math.max(1, Math.round((rect.maxZ - rect.minZ) / size));
  const w = (rect.maxX - rect.minX) / cols;
  const d = (rect.maxZ - rect.minZ) / rows;
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push(Object.freeze({
        index: row * cols + col, col, row,
        minX: rect.minX + col * w, maxX: rect.minX + (col + 1) * w,
        minZ: rect.minZ + row * d, maxZ: rect.minZ + (row + 1) * d,
      }));
    }
  }
  return Object.freeze(tiles);
}

// The seed string of one stream of one tile.
export const tileSeed = (areaId, stripId, index, stream) => `${areaId}|${stripId}|${index}|${stream}`;

// Distance from (x, z) to a tile (0 inside it).
export function tileDistance(t, x, z) {
  const dx = x < t.minX ? t.minX - x : x > t.maxX ? x - t.maxX : 0;
  const dz = z < t.minZ ? t.minZ - z : z > t.maxZ ? z - t.maxZ : 0;
  return Math.hypot(dx, dz);
}

// A slot's states.
export const ABSENT = 0;
export const QUEUED = 1;
export const BUILDING = 2;
export const BUILT = 3;

/**
 * createStreamer({ tiles, layers, begin, drop, now, frameTriangles, frameMs, checkEvery })
 *
 * The streaming state machine, with the mesh work handed in:
 *   begin(tile, layer) -> job   called when a slot's turn comes. A job is
 *                               { cost(): triangles the next step will write,
 *                                 step(): do it; true when the slot is finished,
 *                                 cancel(): free whatever was made so far }.
 *   drop(tile, layer)           remove and free a built slot's things.
 *   now()                       milliseconds, for the time budget (optional).
 *
 * update(x, z, dt) is called every frame. In the steady state (nothing coming
 * into or going out of range) it allocates nothing: slots, the queue and the
 * scratch are all made here, once.
 */
export function createStreamer({
  tiles, layers = LAYERS, begin, drop, now = null,
  frameTriangles = FRAME_TRIANGLES, frameMs = FRAME_MS, checkEvery = CHECK_EVERY,
}) {
  const slots = [];
  for (const layer of layers) {
    for (const tile of tiles) slots.push({ tile, layer, state: ABSENT, job: null, dist: Infinity, waited: 0 });
  }
  // The queue: slot references, nearest first. Fixed capacity (every slot).
  const queue = new Array(slots.length).fill(null);
  let queued = 0;
  let sinceCheck = checkEvery; // look on the very first update
  const stats = { built: 0, dropped: 0, cancelled: 0, maxFrameTriangles: 0, maxSteps: 0, maxWait: 0, frames: 0 };

  function enqueue(slot) {
    slot.state = QUEUED;
    slot.waited = 0;
    queue[queued++] = slot;
  }
  function dequeue(slot) {
    let i = 0;
    while (i < queued && queue[i] !== slot) i++;
    for (; i < queued - 1; i++) queue[i] = queue[i + 1];
    queue[--queued] = null;
  }
  // Insertion sort, nearest first: the queue is a handful of slots.
  function sortQueue() {
    for (let i = 1; i < queued; i++) {
      const s = queue[i];
      let j = i - 1;
      while (j >= 0 && queue[j].dist > s.dist) { queue[j + 1] = queue[j]; j--; }
      queue[j + 1] = s;
    }
  }

  function look(x, z) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const d = tileDistance(s.tile, x, z);
      s.dist = d;
      if (s.state === ABSENT) {
        if (d < s.layer.show) enqueue(s);
      } else if (d > s.layer.hide) {
        if (s.state === BUILT) { drop(s.tile, s.layer); stats.dropped++; }
        else {
          if (s.job) { s.job.cancel(); s.job = null; stats.cancelled++; }
          dequeue(s);
        }
        s.state = ABSENT;
      }
    }
    sortQueue();
  }

  function work() {
    let triangles = 0;
    let steps = 0;
    const t0 = now ? now() : 0;
    while (queued > 0) {
      const s = queue[0];
      if (!s.job) { s.job = begin(s.tile, s.layer); s.state = BUILDING; }
      const cost = s.job.cost();
      if (steps > 0 && (triangles + cost > frameTriangles || (now && now() - t0 >= frameMs))) break;
      triangles += cost;
      steps++;
      if (s.job.step()) {
        s.job = null;
        s.state = BUILT;
        if (s.waited > stats.maxWait) stats.maxWait = s.waited;
        dequeue(s);
        stats.built++;
      }
    }
    if (triangles > stats.maxFrameTriangles) stats.maxFrameTriangles = triangles;
    if (steps > stats.maxSteps) stats.maxSteps = steps;
    return triangles;
  }

  return {
    slots,
    stats,
    get pending() { return queued; },
    update(x, z, dt) {
      stats.frames++;
      sinceCheck += dt;
      if (sinceCheck >= checkEvery) { sinceCheck = 0; look(x, z); }
      for (let i = 0; i < queued; i++) queue[i].waited += dt;
      return queued > 0 ? work() : 0;
    },
    // Everything in range at (x, z), built at once: for a picture or a count,
    // never for a walk.
    settle(x, z) {
      look(x, z);
      while (queued > 0) {
        const s = queue[0];
        if (!s.job) { s.job = begin(s.tile, s.layer); s.state = BUILDING; }
        while (!s.job.step()) { /* to the end */ }
        s.job = null;
        s.state = BUILT;
        dequeue(s);
        stats.built++;
      }
    },
    dispose() {
      for (const s of slots) {
        if (s.state === BUILT) drop(s.tile, s.layer);
        else if (s.job) s.job.cancel();
        s.job = null;
        s.state = ABSENT;
      }
      queued = 0;
      queue.fill(null);
    },
  };
}
