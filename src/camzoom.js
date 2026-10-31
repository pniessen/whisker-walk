// =============================================================================
// CAMERA ZOOM — how far behind the cat the chase camera sits.
//
// WHY. The 11-year-old playtester asked for "a zoom in/out feature that is
// easier to use". The game had no camera zoom at all, so the kids were
// pinch-zooming the browser page instead. A farther view also helps them see
// where they are in an area.
//
// NOT THE ZOOMIES. player.js's `zoom`/`zooming` is the sprint burst; this file
// is only the camera distance. Everything here is called "camera zoom" or
// "zoom step" to keep the two apart.
//
// STEPS, NOT A SLIDER. Four fixed steps are easier for a kid than a free
// slider: every press of +, −, a wheel notch or a pinch moves exactly one step.
// Step 1 is the camera the game always had (4.5 m back, 2.2 m up), so anyone
// who never touches zoom sees exactly today's view. The height grows faster
// than the distance, so the far view tilts down over the area rather than
// looking along the ground at a tiny cat.
//
// PURELY LOCAL. Nothing here goes on the wire and nothing draws from the
// seeded walkRng: the camera is the one player's own view of a shared world.
// The chosen step is remembered per device in settings.js, not in the save.
//
// No three.js import on purpose: settings.js reads the step range from here,
// and settings.js must stay loadable without the renderer.
// =============================================================================

// close → far. dist and height are the two arguments catcam.js's
// cameraOffset(yaw, pitch, dist, height) already takes.
export const ZOOM_STEPS = Object.freeze([
  Object.freeze({ dist: 3.0, height: 1.5 }),
  Object.freeze({ dist: 4.5, height: 2.2 }), // today's camera, unchanged
  Object.freeze({ dist: 7.0, height: 3.8 }),
  Object.freeze({ dist: 11.0, height: 6.5 }),
]);
export const DEFAULT_ZOOM_STEP = 1;
export const MAX_ZOOM_STEP = ZOOM_STEPS.length - 1;
// The den is a 16 x 16 room. At the default step the camera already reaches
// the walls when the cat stands against one, so the den never goes farther
// than that: zooming out indoors would only put the camera behind a wall.
export const DEN_MAX_ZOOM_STEP = DEFAULT_ZOOM_STEP;

// Any input (a stored setting, a stale number, junk) → a whole step inside
// 0..max. Junk becomes the default step rather than the nearest end, so a
// corrupt setting gives today's camera.
export function clampZoomStep(step, max = MAX_ZOOM_STEP) {
  const top = Number.isInteger(max) ? Math.min(Math.max(max, 0), MAX_ZOOM_STEP) : MAX_ZOOM_STEP;
  if (typeof step !== 'number' || !Number.isFinite(step)) return Math.min(DEFAULT_ZOOM_STEP, top);
  return Math.min(Math.max(Math.round(step), 0), top);
}

// The farthest step allowed in an area.
export function maxZoomStep(isDen) {
  return isDen ? DEN_MAX_ZOOM_STEP : MAX_ZOOM_STEP;
}

// level is a float step index (the camera eases through the in-between
// values). Returns the distance and height for it, interpolated linearly
// between neighbouring steps and clamped at both ends.
export function zoomView(level) {
  const l = typeof level === 'number' && Number.isFinite(level)
    ? Math.min(Math.max(level, 0), MAX_ZOOM_STEP)
    : DEFAULT_ZOOM_STEP;
  const i = Math.min(Math.floor(l), MAX_ZOOM_STEP - 1);
  const f = l - i;
  const a = ZOOM_STEPS[i];
  const b = ZOOM_STEPS[i + 1];
  return { dist: a.dist + (b.dist - a.dist) * f, height: a.height + (b.height - a.height) * f };
}

// Exponential ease toward the target step. 12/s puts the camera ~95% of the
// way there in a quarter of a second, which is the feel asked for: quick
// enough that a press feels instant, slow enough to see the camera move.
// reducedMotion jumps straight there, like every other camera-ish motion in
// the game under that setting.
const EASE_RATE = 12;
export function easeZoomLevel(level, target, dt, reducedMotion = false) {
  if (reducedMotion || typeof level !== 'number' || !Number.isFinite(level)) return target;
  const k = 1 - Math.exp(-EASE_RATE * Math.max(dt, 0));
  const next = level + (target - level) * k;
  return Math.abs(target - next) < 0.01 ? target : next;
}

// --- controls ---------------------------------------------------------------
// Direction convention everywhere: -1 is "zoom in" (closer, smaller step),
// +1 is "zoom out" (farther). + means in, as on every map app.

// Keyboard: +/= and − on the main row and the numpad. Nothing else in the game
// binds these (main.js uses E V M T C Space, digits for chat, Enter, Escape).
export function keyZoomDir(code) {
  if (code === 'Equal' || code === 'NumpadAdd') return -1;
  if (code === 'Minus' || code === 'NumpadSubtract') return 1;
  return 0;
}

// Touch buttons (touchui.js's zoom pair) report these action names.
export function zoomActionDir(name) {
  if (name === 'zoomIn') return -1;
  if (name === 'zoomOut') return 1;
  return 0;
}

// Mouse wheel. One mouse notch should be one step, but a trackpad sends a
// stream of small deltas plus momentum, which would race through all four
// steps in one flick. So deltas are summed until they reach one notch's worth
// (100 px, Chrome's notch), then one step fires and further wheel input is
// ignored for a short cooldown so the momentum tail cannot fire again.
// deltaMode 1 (lines, Firefox) and 2 (pages) are converted to pixels first.
// Scrolling up (negative deltaY) zooms in, as in map apps; on a Mac a trackpad
// pinch arrives as a ctrl+wheel with the same sign convention.
const WHEEL_NOTCH = 100;
const WHEEL_COOLDOWN_MS = 220;
const WHEEL_IDLE_RESET_MS = 300;
export function createWheelStepper() {
  let acc = 0;
  let lastT = -Infinity;
  let coolUntil = -Infinity;
  return function onWheel(deltaY, deltaMode, now) {
    const px = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 400 : deltaY;
    if (typeof px !== 'number' || !Number.isFinite(px)) return 0;
    if (now - lastT > WHEEL_IDLE_RESET_MS) acc = 0;
    lastT = now;
    if (now < coolUntil) return 0;
    acc += px;
    if (Math.abs(acc) < WHEEL_NOTCH) return 0;
    const dir = acc < 0 ? -1 : 1;
    acc = 0;
    coolUntil = now + WHEEL_COOLDOWN_MS;
    return dir;
  };
}

// Two-finger pinch. Each time the finger spread changes by 30% from where the
// last step fired, one step fires: fingers apart zooms in (closer), together
// zooms out — the same way a photo or a map pinches. The baseline resets on
// every step so a long pinch walks through the steps one at a time.
const PINCH_RATIO = 1.3;
export function createPinchTracker() {
  let base = 0;
  return {
    start(dist) { base = dist > 0 ? dist : 0; },
    move(dist) {
      if (!(base > 0) || !(dist > 0)) return 0;
      const r = dist / base;
      if (r >= PINCH_RATIO) { base = dist; return -1; }
      if (r <= 1 / PINCH_RATIO) { base = dist; return 1; }
      return 0;
    },
  };
}

// The one place a step changes: keys, wheel, buttons and pinch all call
// step(dir). It reads and writes the remembered step in settings and hands the
// player the new target. In the den the step is capped; pushing past the cap
// calls onCapped (main.js shows a short toast) so a kid knows the button
// worked and the room is simply too small.
export function createZoomControl({ settings, player, isDen = () => false, onCapped = () => {} }) {
  return {
    step(dir) {
      if (dir !== -1 && dir !== 1) return null;
      const max = maxZoomStep(!!isDen());
      const cur = clampZoomStep(settings.get('cameraZoom'), max);
      const next = clampZoomStep(cur + dir, max);
      if (next === cur) {
        if (dir > 0 && max < MAX_ZOOM_STEP) onCapped();
        return cur;
      }
      settings.set('cameraZoom', next);
      player.setCameraZoom(next);
      return next;
    },
  };
}

// --- camera safety ----------------------------------------------------------
// The game has no camera collision: the default camera has always been free to
// poke into a house when the cat backs against one. Zooming out must not make
// that worse, so beyond the default distance three rules apply. None of them
// ever pulls the camera closer than the default distance, which keeps every
// step at or inside the default byte-identical to the shipped camera.
//
//  1. Area edge. The default camera can sit up to its own 4.5 m outside the
//     walkable bounds (the cat at the edge, camera behind it), so that is the
//     margin: a far camera is held to the same box, never farther out over the
//     ridges and sea beyond the map.
//  2. Buildings. Colliders are circles with no height, so a footprint is the
//     best "inside a building" test there is. Only big footprints count
//     (r >= 1.9: houses, warehouses, billboards, cliffs, containers) — cars,
//     benches and crates are short and the camera rides over them. If the
//     camera point lands inside one, it is pulled in along its line to the
//     cat to just outside the footprint. A footprint the cat itself stands in
//     (a perched cat on a roof) is ignored, or the camera would collapse.
//  3. Ground. The camera never goes below 0.5 m.
//
// Returns the scale (0..1] to apply to the whole offset, so the camera slides
// along its own line toward the cat and keeps its viewing angle.
export const BIG_COLLIDER_R = 1.9;
const EDGE_MARGIN = ZOOM_STEPS[DEFAULT_ZOOM_STEP].dist;
const CLEARANCE = 0.4;
export const MIN_CAMERA_Y = 0.5;

export function cameraPullScale(cat, off, { dist, colliders = [], bounds = null } = {}) {
  const defDist = ZOOM_STEPS[DEFAULT_ZOOM_STEP].dist;
  if (!(dist > defDist)) return 1;
  const minScale = defDist / dist;
  let s = 1;
  const ox = off.x;
  const oz = off.z;
  if (bounds) {
    const lim = (c, o, lo, hi) => {
      const p = c + o * s;
      if (p > hi && o > 0) s = Math.min(s, (hi - c) / o);
      if (p < lo && o < 0) s = Math.min(s, (lo - c) / o);
    };
    lim(cat.x, ox, bounds.minX - EDGE_MARGIN, bounds.maxX + EDGE_MARGIN);
    lim(cat.z, oz, bounds.minZ - EDGE_MARGIN, bounds.maxZ + EDGE_MARGIN);
  }
  const len = Math.hypot(ox, oz);
  if (len > 1e-6) {
    for (const c of colliders) {
      if (!(c && c.r >= BIG_COLLIDER_R)) continue;
      const cx = cat.x - c.x;
      const cz = cat.z - c.z;
      if (cx * cx + cz * cz <= c.r * c.r) continue; // cat is on/in it (perched)
      const px = cat.x + ox * s - c.x;
      const pz = cat.z + oz * s - c.z;
      if (px * px + pz * pz >= c.r * c.r) continue; // camera point is clear
      // Entry point of the cat→camera ray into the circle: smallest t > 0 of
      // |cat + t*off - c| = r.
      const a = ox * ox + oz * oz;
      const b = 2 * (cx * ox + cz * oz);
      const cc = cx * cx + cz * cz - c.r * c.r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0) s = Math.min(s, t - CLEARANCE / len);
    }
  }
  return Math.min(1, Math.max(minScale, s));
}
