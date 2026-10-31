import * as THREE from 'three';
import { fitCentre } from './shadowfit.js';
import { GUST_DEPTH, GUST_FREQUENCY, MAX_INTENSITY } from './wind.js';
import { WIND_DIR } from './grass.js';

// ---------------------------------------------------------------------------
// AMBIENT LIFE — small, gentle motion that makes each outdoor area feel lived
// in (Stream 4 round four, docs/VISUAL-PASS.md "Stream 4 round four —
// ambient life"). One effect per area:
//
//   park          leaves drift down from under the real tree canopies, tumble,
//                 rest on the ground for a few seconds, then fade
//   seaside       fine mist puffs where the surf meets the sand
//   docks         at dusk, a few moths circling the lamp posts nearest the
//                 view; by day, a handful of sunlit motes over the canal
//   neighborhood  a few dandelion seeds riding the breeze
//   den           nothing
//
// THE BUDGET. One THREE.Points per walk with one soft sprite drawn on a
// canvas: ONE main-pass draw call, NO shadow-pass draws (castShadow false,
// and it is created after rig.js's caster sweep anyway). Positions are
// simulated on the CPU into fixed-size buffers allocated once at walk start;
// update() allocates nothing.
//
// PURELY LOCAL. Nothing here touches the walk's seeded RNG or the network:
// co-walkers each see their own leaves, which is fine because nothing in the
// game reads where a leaf is. The module keeps its own small PRNG (seeded from
// Math.random unless a test passes `seed`).
//
// KIDS' COMFORT. Sparse (40 leaves at most), slow, and nothing ever sits right
// in front of the lens or over the cat: every particle inside KEEP_CLEAR of
// the camera, near the cat, or on the line from the camera to the cat is
// faded out and drawn at size zero.
// ---------------------------------------------------------------------------

// Per-effect settings.
//   base    particle count at ambientScale 1 (quality.js). Deliberately small.
//   size    PointsMaterial size. With size attenuation three draws a point
//           size * (H/2) / depth pixels across, which is size * tan(fov/2)
//           world metres at the game's 55-degree fov: 0.4 is a ~20cm sprite,
//           a storybook-sized leaf that still reads from 10m away.
//   sprite  which canvas sprite (makeSprite below)
//   additive  sunlit glints add light rather than cover what is behind them
const KINDS = Object.freeze({
  leaves: Object.freeze({ base: 40, size: 0.4, sprite: 'leaf' }),
  spray: Object.freeze({ base: 26, size: 1.1, sprite: 'soft' }),
  moths: Object.freeze({ base: 24, size: 0.24, sprite: 'moth' }),
  motes: Object.freeze({ base: 14, size: 0.12, sprite: 'soft', additive: true }),
  fluff: Object.freeze({ base: 12, size: 0.4, sprite: 'fluff' }),
});
export const AMBIENT_KINDS = Object.freeze(Object.keys(KINDS));

// The keep-clear sphere around the camera, metres. The game camera sits ~4.5m
// behind the cat (catcam.js), so 1.5m is well short of the cat and still big
// enough that a mist puff or a leaf can never fill the lens. Particles fade
// out over KEEP_FADE before they reach it.
export const KEEP_CLEAR = 1.5;
const KEEP_FADE = 0.8;
// Around the cat: a sphere at its middle and a thin capsule along the line of
// sight from the camera to it, so a leaf never sits over the cat on screen.
const CAT_CLEAR = 0.55;
const SIGHT_CLEAR = 0.3;
const CAT_MID_Y = 0.25;

// Where the effects gather: this far in front of the camera on the ground,
// the same idea as grass.js's patch centre. Past the cat, where the eye is.
const LEAD = 6;

// Leaves.
const LEAF_RANGE = 26; // only trees this close to the view drop leaves
const LEAF_REST_Y = 0.05; // a sprite's half-height, so a resting leaf is not cut by the lawn
const LEAF_FADE = 1.5; // seconds a resting leaf takes to fade
const RECYCLE = LEAF_RANGE + 10; // a leaf whose tree is further from the view than this is reused
// Autumn-ish but not a costume: mostly the canopy's own yellow-greens, with
// some gold and a few rust leaves. sRGB hex, converted once below.
const LEAF_COLOURS = [0x9cb84a, 0x86a843, 0xc9b03c, 0xd98a32, 0xb8652e];
// Seaside mist.
const SPRAY_SPAN = 16; // along the shore either side of the view, metres
const SPRAY_REACH = 45; // no mist when the view is further than this from the surf
const SPRAY_ALPHA = 0.36;
// Docks moths.
const MOTHS_PER_LAMP = 3;
const MOTH_RANGE = 40;
const MOTH_RESORT = 0.5; // seconds between re-picking the lamps nearest the view
// Docks motes and neighbourhood fluff.
const MOTE_SPAN = 12;
const FLUFF_SPAN = 11;

// ambientKind(areaId, { dusk }) — which effect an area gets, or null.
export function ambientKind(areaId, { dusk = false } = {}) {
  switch (areaId) {
    case 'park': return 'leaves';
    case 'seaside': return 'spray';
    case 'docks': return dusk ? 'moths' : 'motes';
    case 'neighborhood': return 'fluff';
    default: return null; // the den, and anything new until it is given one
  }
}

// ambientCapacity(kind, tier) — the fixed particle buffer size for a tier.
export function ambientCapacity(kind, tier) {
  const scale = tier?.ambientScale ?? 0;
  if (!KINDS[kind] || !(scale > 0)) return 0;
  return Math.max(1, Math.round(KINDS[kind].base * Math.min(scale, 1)));
}

// findTrees(scene) — every builder.tree() in the scene, read off the
// `userData.canopy` it tags its Group with: [{ x, z, y, r }] in world space,
// y and r being the canopy centre height and radius. Works after
// mergeStaticProps, which keeps every top-level Group and its transform.
export function findTrees(scene) {
  const out = [];
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const c = o.userData?.canopy;
    if (!c) return;
    o.getWorldPosition(p);
    o.getWorldScale(s);
    out.push({ x: p.x, z: p.z, y: p.y + c.y * s.y, r: c.r * s.x });
  });
  return out;
}

// findLamps(scene) — every builder.lampPost(): [{ x, z, y }], y = globe height.
export function findLamps(scene) {
  const out = [];
  const p = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const y = o.userData?.lampGlobeY;
    if (!(y > 0)) return;
    o.getWorldPosition(p);
    out.push({ x: p.x, z: p.z, y: p.y + y });
  });
  return out;
}

// A tiny local PRNG (mulberry32). Never the walk's seeded stream.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// Sprites. 64px canvases, white so the per-particle colour tints them, drawn
// inside the inscribed circle so the shader can rotate them without clipping
// a corner.
// ---------------------------------------------------------------------------
function makeSprite(kind) {
  const n = 64;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const g = canvas.getContext('2d');
  const c = n / 2;
  if (kind === 'leaf') {
    // A pointed oval with a slightly darker midrib.
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(c, 6);
    g.quadraticCurveTo(c + 30, c - 4, c, n - 8);
    g.quadraticCurveTo(c - 30, c - 4, c, 6);
    g.fill();
    g.strokeStyle = 'rgba(190,190,170,1)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c, 10);
    g.lineTo(c, n - 4);
    g.stroke();
  } else if (kind === 'moth') {
    // A faint halo (it is catching the lamplight), then two pairs of wings.
    const halo = g.createRadialGradient(c, c, 0, c, c, 30);
    halo.addColorStop(0, 'rgba(255,255,255,0.35)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(c + side * 9, c - 4, 9, 7, side * 0.5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(c + side * 7, c + 7, 6, 5, -side * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(150,140,120,1)';
    g.fillRect(c - 1.5, c - 9, 3, 18);
  } else if (kind === 'fluff') {
    // A dandelion seed: a soft core and a ring of fine filaments.
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * 24, c + Math.sin(a) * 24);
      g.stroke();
    }
    const core = g.createRadialGradient(c, c, 0, c, c, 12);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, n, n);
  } else {
    // 'soft': a round puff that fades to nothing at its rim.
    const grad = g.createRadialGradient(c, c, 0, c, c, c - 1);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The material: three's PointsMaterial (so fog, tone mapping and colour
// management all match the rest of the scene), patched for a per-point size
// multiplier and a per-point (rotation, squash) pair. Squashing the sprite
// along one axis is what makes a leaf read as tumbling and a moth as beating
// its wings, with no extra geometry.
function makeMaterial(kind, map) {
  const k = KINDS[kind];
  const material = new THREE.PointsMaterial({
    map,
    size: k.size,
    sizeAttenuation: true,
    vertexColors: true, // RGBA: the alpha channel fades each point
    transparent: true,
    depthWrite: false, // soft sprites must not punch holes in each other
    blending: k.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('uniform float size;', `uniform float size;
attribute float aSize;
attribute vec2 aSpin;
varying vec2 vSpin;`)
      .replace('gl_PointSize = size;', `gl_PointSize = size * aSize;
	vSpin = aSpin;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform vec3 diffuse;', `uniform vec3 diffuse;
varying vec2 vSpin;`)
      .replace('#include <map_particle_fragment>', `#ifdef USE_MAP
	{
		// Rotate the sprite by vSpin.x and narrow it to vSpin.y of its width.
		vec2 q = gl_PointCoord - 0.5;
		float cs = cos( vSpin.x );
		float sn = sin( vSpin.x );
		q = vec2( cs * q.x - sn * q.y, sn * q.x + cs * q.y );
		q.x /= max( vSpin.y, 0.08 );
		if ( abs( q.x ) > 0.5 || abs( q.y ) > 0.5 ) discard;
		diffuseColor *= texture2D( map, vec2( q.x, - q.y ) + 0.5 );
	}
#endif`);
  };
  material.customProgramCacheKey = () => 'whisker-ambient';
  return material;
}

const NO_AMBIENT = Object.freeze({
  mesh: null, kind: null, capacity: 0, visibleCount: 0, update() {}, dispose() {},
});

// createAmbient(scene, { areaId, areaData, tier, camera, dusk, reducedMotion,
// cat, seed, prewarm }) — the per-walk rig, in the session's
// { update, dispose } shape. Call it AFTER rig.js's assignShadowCasters and
// mergeStaticProps / createContactShadows (walk.js does, beside grass), so
// none of them sees the points.
//
// `cat` (optional) is the player's cat Group; its position is read each frame
// to keep particles off it. `dusk` is walk.js's duskActive.
//
// Reduced motion: the stub, nothing drawn at all. A frozen leaf hanging in mid
// air reads as a glitch, not as calm, and every effect here IS motion.
export function createAmbient(scene, {
  areaId, areaData, tier, camera, dusk = false, reducedMotion = false, cat = null,
  seed, prewarm = true,
} = {}) {
  if (reducedMotion) return NO_AMBIENT;
  const kind = ambientKind(areaId, { dusk });
  const cap = ambientCapacity(kind, tier);
  if (!kind || cap === 0 || !camera) return NO_AMBIENT;
  const bounds = areaData?.bounds ?? { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };

  // Anchors: where an effect may live. Without them the effect has nowhere
  // to be, so the area gets the stub rather than a mesh drawing nothing.
  let anchors = [];
  let shore = null;
  let canal = null;
  if (kind === 'leaves') anchors = findTrees(scene);
  else if (kind === 'moths') anchors = findLamps(scene);
  else if (kind === 'spray') shore = (areaData?.waters ?? []).find((w) => w.id === 'sea') ?? null;
  else if (kind === 'motes') canal = (areaData?.waters ?? []).find((w) => w.kind === 'rect') ?? null;
  if ((kind === 'leaves' || kind === 'moths') && anchors.length === 0) return NO_AMBIENT;
  if (kind === 'spray' && !shore) return NO_AMBIENT;
  if (kind === 'motes' && !canal) return NO_AMBIENT;

  const rand = makeRandom(seed ?? Math.floor(Math.random() * 4294967296));
  const colliders = areaData?.colliders ?? [];

  // ---- fixed buffers: GPU attributes and CPU particle state ----------------
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 4);
  const size = new Float32Array(cap);
  const spin = new Float32Array(cap * 2);
  const geometry = new THREE.BufferGeometry();
  const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attr(pos, 3));
  geometry.setAttribute('color', attr(col, 4));
  geometry.setAttribute('aSize', attr(size, 1));
  geometry.setAttribute('aSpin', attr(spin, 2));
  geometry.setDrawRange(0, cap);

  // Per particle: mode (0 waiting, 1 alive / falling, 2 resting), age,
  // life, base x/y/z (where the motion is measured from), four tuning values
  // drawn at spawn, its anchor, its alpha before the keep-clear pass, and its
  // base colour.
  const mode = new Uint8Array(cap);
  const age = new Float32Array(cap);
  const life = new Float32Array(cap);
  const bx = new Float32Array(cap);
  const by = new Float32Array(cap);
  const bz = new Float32Array(cap);
  const p0 = new Float32Array(cap); // phase
  const p1 = new Float32Array(cap);
  const p2 = new Float32Array(cap);
  const p3 = new Float32Array(cap);
  const anchor = new Int16Array(cap).fill(-1);
  const alpha = new Float32Array(cap);
  const rgb = new Float32Array(cap * 3);

  // Dusk dims everything but the moths: PointsMaterial is unlit, so a bright
  // daytime leaf would glow in the dusk light. Moths are lit by their lamp.
  const dim = dusk && kind !== 'moths' ? 0.45 : 1;
  const tint = new THREE.Color();
  const setColour = (i, hex) => {
    tint.setHex(hex);
    rgb[i * 3] = tint.r * dim;
    rgb[i * 3 + 1] = tint.g * dim;
    rgb[i * 3 + 2] = tint.b * dim;
  };
  const leafColours = LEAF_COLOURS;

  const focus = new THREE.Vector3();
  const catMid = new THREE.Vector3();
  let wx = 0;
  let wz = 0;

  // ---- per-kind spawn and step --------------------------------------------
  const wait = (i, lo, hi) => {
    mode[i] = 0;
    age[i] = -(lo + rand() * (hi - lo));
    alpha[i] = 0;
  };

  function spawnLeaf(i) {
    // Reservoir-pick a tree near the view: no array built per spawn.
    let pick = -1;
    let seen = 0;
    for (let k = 0; k < anchors.length; k++) {
      const a = anchors[k];
      if ((a.x - focus.x) ** 2 + (a.z - focus.z) ** 2 > LEAF_RANGE * LEAF_RANGE) continue;
      seen++;
      if (rand() * seen < 1) pick = k;
    }
    if (pick < 0) { wait(i, 1, 3); return; }
    const t = anchors[pick];
    const ang = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.7 * t.r;
    anchor[i] = pick;
    bx[i] = t.x + Math.cos(ang) * r;
    bz[i] = t.z + Math.sin(ang) * r;
    // From the underside of the canopy, where a leaf would let go.
    by[i] = t.y - 0.35 * t.r + rand() * 0.3 * t.r;
    mode[i] = 1;
    age[i] = 0;
    life[i] = 2.5 + rand() * 2.5; // seconds resting on the ground
    p0[i] = rand() * Math.PI * 2;
    p1[i] = 0.28 + rand() * 0.16; // fall speed, m/s: a ~10s fall from a big oak
    p2[i] = 1.0 + rand() * 0.8; // swing frequency, rad/s
    p3[i] = (rand() < 0.5 ? -1 : 1) * (1.2 + rand() * 1.8); // spin, rad/s
    setColour(i, leafColours[Math.floor(rand() * leafColours.length)]);
  }

  function stepLeaf(i, dt, out) {
    if (mode[i] === 0) {
      age[i] += dt;
      if (age[i] >= 0) spawnLeaf(i);
      if (mode[i] === 0) { out.x = bx[i]; out.y = -10; out.z = bz[i]; return; }
    }
    // The view has moved on: a leaf from a tree this far away is a speck in
    // the fog, so give it back to the trees near the cat instead of letting
    // it finish a fall nobody sees.
    const tree = anchors[anchor[i]];
    if ((tree.x - focus.x) ** 2 + (tree.z - focus.z) ** 2 > RECYCLE * RECYCLE) {
      wait(i, 0, 1.5);
      out.x = bx[i]; out.y = -10; out.z = bz[i];
      return;
    }
    age[i] += dt;
    const a = age[i];
    if (mode[i] === 1) {
      const ph = p0[i];
      const s = Math.sin(a * p2[i] + ph);
      const c = Math.cos(a * p2[i] + ph);
      // Fastest through the bottom of each swing, slow at its ends: a leaf
      // falling like a leaf rather than a stone.
      by[i] -= p1[i] * (0.55 + 0.9 * c * c) * dt;
      bx[i] += wx * 0.35 * dt;
      bz[i] += wz * 0.35 * dt;
      const amp = 0.25;
      out.x = bx[i] + Math.cos(ph) * s * amp;
      out.z = bz[i] + Math.sin(ph) * s * amp;
      out.y = by[i];
      out.rot = a * p3[i];
      out.squash = 0.25 + 0.75 * Math.abs(Math.cos(a * p3[i] * 0.6 + ph));
      alpha[i] = Math.min(1, a / 0.6);
      if (by[i] <= LEAF_REST_Y) {
        // Land where it is drawn, so it does not jump on touchdown.
        bx[i] = out.x;
        bz[i] = out.z;
        by[i] = LEAF_REST_Y;
        p0[i] = out.rot;
        mode[i] = 2;
        age[i] = 0;
      }
      return;
    }
    // Resting: still, then fading, then back to waiting.
    out.x = bx[i];
    out.y = by[i];
    out.z = bz[i];
    out.rot = p0[i];
    out.squash = 0.5;
    alpha[i] = 1 - smooth(life[i], life[i] + LEAF_FADE, a);
    if (a > life[i] + LEAF_FADE) wait(i, 0.5, 3);
  }

  function spawnSpray(i) {
    if (Math.abs(focus.x - shore.minX) > SPRAY_REACH) { wait(i, 1, 2); return; }
    bx[i] = shore.minX - 0.8 + rand() * 2.4; // either side of the waterline
    bz[i] = clamp(focus.z + (rand() * 2 - 1) * SPRAY_SPAN, bounds.minZ + 1, bounds.maxZ - 1);
    by[i] = 0.12 + rand() * 0.15;
    mode[i] = 1;
    age[i] = 0;
    life[i] = 2.6 + rand() * 2;
    p0[i] = rand() * Math.PI * 2;
    p1[i] = 0.06 + rand() * 0.1; // rise, m/s
    setColour(i, 0xf2f6f8);
  }

  function stepSpray(i, dt, out) {
    age[i] += dt;
    if (mode[i] === 0 && age[i] >= 0) spawnSpray(i);
    if (mode[i] === 0) { out.y = -10; out.x = bx[i]; out.z = bz[i]; return; }
    const u = age[i] / life[i];
    by[i] += p1[i] * dt;
    bx[i] += wx * 0.15 * dt;
    bz[i] += wz * 0.15 * dt;
    out.x = bx[i];
    out.y = by[i];
    out.z = bz[i];
    out.rot = p0[i];
    out.squash = 1;
    out.scale = 0.55 + 0.65 * u; // a puff spreads as it thins
    alpha[i] = SPRAY_ALPHA * Math.sin(Math.PI * Math.min(1, u));
    if (u >= 1) wait(i, 0, 1.5);
  }

  // Motes and fluff share one behaviour: born somewhere near the view, ride
  // the wind with a slow wander, fade in and out. Fluff rides it harder.
  function spawnDrifter(i) {
    let x;
    let z;
    if (kind === 'motes') {
      x = clamp(focus.x + (rand() * 2 - 1) * MOTE_SPAN, canal.minX + 1, canal.maxX - 1);
      z = canal.minZ + 0.6 + rand() * (canal.maxZ - canal.minZ - 1.2);
    } else {
      x = clamp(focus.x + (rand() * 2 - 1) * FLUFF_SPAN, bounds.minX + 1, bounds.maxX - 1);
      z = clamp(focus.z + (rand() * 2 - 1) * FLUFF_SPAN, bounds.minZ + 1, bounds.maxZ - 1);
      // Not born inside a house or a tree trunk.
      for (const c of colliders) {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.3) ** 2) { wait(i, 0.5, 1.5); return; }
      }
    }
    bx[i] = x;
    bz[i] = z;
    by[i] = kind === 'motes' ? 0.35 + rand() * 1.3 : 0.4 + rand() * 1.4;
    mode[i] = 1;
    age[i] = 0;
    life[i] = kind === 'motes' ? 6 + rand() * 5 : 9 + rand() * 5;
    p0[i] = rand() * Math.PI * 2;
    p1[i] = 0.4 + rand() * 0.5; // wander frequency
    setColour(i, kind === 'motes' ? 0xfff0c8 : 0xf6f6ee);
  }

  function stepDrifter(i, dt, out) {
    age[i] += dt;
    if (mode[i] === 0 && age[i] >= 0) spawnDrifter(i);
    if (mode[i] === 0) { out.y = -10; out.x = bx[i]; out.z = bz[i]; return; }
    // Left far behind by the view: reuse it near the cat (see stepLeaf).
    const span = kind === 'motes' ? MOTE_SPAN : FLUFF_SPAN;
    if ((bx[i] - focus.x) ** 2 + (bz[i] - focus.z) ** 2 > 4 * span * span) {
      wait(i, 0, 1.5);
      out.y = -10; out.x = bx[i]; out.z = bz[i];
      return;
    }
    const a = age[i];
    const ride = kind === 'motes' ? 0.12 : 0.5;
    bx[i] += wx * ride * dt;
    bz[i] += wz * ride * dt;
    const ph = p0[i];
    out.x = bx[i] + 0.3 * Math.sin(a * p1[i] + ph);
    out.z = bz[i] + 0.3 * Math.cos(a * p1[i] * 0.8 + ph);
    out.y = by[i] + 0.2 * Math.sin(a * p1[i] * 1.3 + ph * 2);
    out.rot = kind === 'fluff' ? a * 0.4 + ph : 0;
    out.squash = 1;
    const fade = smooth(0, 1.5, a) * (1 - smooth(life[i] - 1.5, life[i], a));
    const twinkle = kind === 'motes' ? 0.55 * (0.7 + 0.3 * Math.sin(a * 2.3 + ph)) : 0.85;
    alpha[i] = fade * twinkle;
    if (a >= life[i]) wait(i, 0, 2);
  }

  // Moths: each lamp slot holds MOTHS_PER_LAMP moths; the slots hold the
  // lamps nearest the view, re-picked twice a second. Orbits are a pure
  // function of time, so nothing accumulates.
  const slots = Math.ceil(cap / MOTHS_PER_LAMP);
  const near = new Int16Array(slots).fill(-1);
  const nearD = new Float32Array(slots);
  let resortIn = 0;
  function pickLamps() {
    near.fill(-1);
    nearD.fill(Infinity);
    for (let k = 0; k < anchors.length; k++) {
      const d = (anchors[k].x - focus.x) ** 2 + (anchors[k].z - focus.z) ** 2;
      if (d > MOTH_RANGE * MOTH_RANGE) continue;
      // Insertion into a small sorted list: slots is at most 8.
      let j = slots - 1;
      if (d >= nearD[j]) continue;
      while (j > 0 && nearD[j - 1] > d) {
        nearD[j] = nearD[j - 1];
        near[j] = near[j - 1];
        j--;
      }
      nearD[j] = d;
      near[j] = k;
    }
  }
  function initMoth(i) {
    p0[i] = rand() * Math.PI * 2;
    p1[i] = (rand() < 0.5 ? -1 : 1) * (1.3 + rand() * 1.0); // orbit, rad/s
    p2[i] = 0.42 + rand() * 0.3; // orbit radius, clear of the 0.22 globe
    p3[i] = 0.6 + rand() * 0.5; // bob frequency
    setColour(i, 0xf3e6c4);
  }
  function stepMoth(i, dt, t, out) {
    const lamp = near[Math.floor(i / MOTHS_PER_LAMP)];
    if (lamp !== anchor[i]) {
      anchor[i] = lamp;
      age[i] = 0; // a moth at a newly near lamp fades in rather than popping
    }
    if (lamp < 0) { alpha[i] = 0; out.y = -10; out.x = 0; out.z = 0; return; }
    age[i] += dt;
    const L = anchors[lamp];
    const ph = p0[i];
    const ang = ph + p1[i] * t;
    const r = p2[i] + 0.08 * Math.sin(t * 1.9 + ph);
    out.x = L.x + Math.cos(ang) * r;
    out.z = L.z + Math.sin(ang) * r;
    out.y = L.y + 0.05 + 0.22 * Math.sin(t * p3[i] + ph * 3);
    out.rot = 0.3 * Math.sin(t * 1.3 + ph);
    // About three wingbeats a second: visible, never a buzz.
    out.squash = 0.3 + 0.7 * Math.abs(Math.sin(t * 9 + ph));
    alpha[i] = Math.min(1, age[i]);
  }

  // ---- the frame ----------------------------------------------------------
  const out = { x: 0, y: 0, z: 0, rot: 0, squash: 1, scale: 1 };
  const pad = KINDS[kind].size * 0.3; // roughly a sprite's visible half-width
  const keepIn = KEEP_CLEAR + pad;
  let lastT = null;
  let visibleCount = 0;
  if (kind === 'moths') for (let i = 0; i < cap; i++) initMoth(i);
  // Staggered first births: leaves over a whole fall (~10s) so the prewarm
  // below does not land them all together, the others over two seconds.
  else for (let i = 0; i < cap; i++) wait(i, 0, kind === 'leaves' ? 10 : 2);

  function simulate(t, dt, intensity) {
    fitCentre(camera, LEAD, focus);
    const k = clamp(intensity, 0, MAX_INTENSITY);
    const gust = 1 + GUST_DEPTH * Math.sin(t * GUST_FREQUENCY);
    wx = WIND_DIR[0] * gust * k;
    wz = WIND_DIR[1] * gust * k;
    if (kind === 'moths') {
      resortIn -= dt;
      if (resortIn <= 0) { pickLamps(); resortIn = MOTH_RESORT; }
    }
    const cam = camera.position;
    const hasCat = !!cat?.position;
    if (hasCat) catMid.set(cat.position.x, cat.position.y + CAT_MID_Y, cat.position.z);
    // Camera-to-cat sight line, for the capsule test.
    const sx = catMid.x - cam.x;
    const sy = catMid.y - cam.y;
    const sz = catMid.z - cam.z;
    const sl2 = sx * sx + sy * sy + sz * sz || 1;
    visibleCount = 0;
    for (let i = 0; i < cap; i++) {
      out.rot = 0;
      out.squash = 1;
      out.scale = 1;
      if (kind === 'leaves') stepLeaf(i, dt, out);
      else if (kind === 'spray') stepSpray(i, dt, out);
      else if (kind === 'moths') stepMoth(i, dt, t, out);
      else stepDrifter(i, dt, out);
      // Keep-clear: the lens, the cat, and the line between them.
      const dx = out.x - cam.x;
      const dy = out.y - cam.y;
      const dz = out.z - cam.z;
      let f = smooth(keepIn, keepIn + KEEP_FADE, Math.sqrt(dx * dx + dy * dy + dz * dz));
      if (hasCat && f > 0) {
        const cx = out.x - catMid.x;
        const cy = out.y - catMid.y;
        const cz = out.z - catMid.z;
        f *= smooth(CAT_CLEAR + pad, CAT_CLEAR + pad + 0.3, Math.sqrt(cx * cx + cy * cy + cz * cz));
        const u = clamp((dx * sx + dy * sy + dz * sz) / sl2, 0, 1);
        const ex = dx - sx * u;
        const ey = dy - sy * u;
        const ez = dz - sz * u;
        f *= smooth(SIGHT_CLEAR + pad, SIGHT_CLEAR + pad + 0.2, Math.sqrt(ex * ex + ey * ey + ez * ez));
      }
      const a = alpha[i] * f;
      const visible = a > 0.004;
      if (visible) visibleCount++;
      pos[i * 3] = out.x;
      pos[i * 3 + 1] = out.y;
      pos[i * 3 + 2] = out.z;
      col[i * 4] = rgb[i * 3];
      col[i * 4 + 1] = rgb[i * 3 + 1];
      col[i * 4 + 2] = rgb[i * 3 + 2];
      col[i * 4 + 3] = visible ? a : 0;
      // Size zero for an invisible point: the GPU drops it before any
      // fragment work, so a hidden particle costs a vertex and nothing more.
      size[i] = visible ? out.scale : 0;
      spin[i * 2] = out.rot;
      spin[i * 2 + 1] = out.squash;
    }
  }

  const map = makeSprite(KINDS[kind].sprite);
  const material = makeMaterial(kind, map);
  const mesh = new THREE.Points(geometry, material);
  mesh.name = 'ambient';
  mesh.userData.ambient = kind;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Never culled: the points move every frame and a cached bounding sphere
  // would go stale (grass.js has the same note). Always near the view anyway.
  mesh.frustumCulled = false;
  scene.add(mesh);

  // update(t, intensity) — once per rendered frame, after the camera moved,
  // with exactly what wind.update and grass.update take (absolute elapsed
  // seconds; 1 = breeze, 1.7 in rain). dt is derived from t and capped, so a
  // long hitch (a backgrounded tab) does not fling every leaf to the ground.
  function update(t = 0, intensity = 1) {
    const dt = lastT === null ? 0 : clamp(t - lastT, 0, 0.1);
    lastT = t;
    simulate(t, dt, intensity);
    for (const name of ['position', 'color', 'aSize', 'aSpin']) geometry.attributes[name].needsUpdate = true;
  }

  // Prewarm: run ten seconds of leaf-fall up front so the first frame already
  // has leaves at every height, not a sky full of leaves letting go at once.
  // Run on time before 0, so the walk's own t starts where it always does.
  if (prewarm && kind !== 'moths') {
    for (let s = -10; s < 0; s += 0.1) simulate(s, 0.1, 1);
  }
  update(0, 1);

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    map.dispose();
  }

  return {
    mesh, kind, capacity: cap, anchors,
    get visibleCount() { return visibleCount; },
    update, dispose,
  };
}
