// The birthday Gathering on the island (2026-11-21): cats of all five clans in
// a ring facing the Watch Rock, a leader on the rock announcing her birthday,
// a very big cake with 11 candles below the rock, and the candles blown out
// once a day. src/birthday.js decides when; this file is what she sees. Only
// the Pines' download carries it (world/areas.js), so it costs the start-up
// nothing.
//
// SOLO ONLY. walk.js builds a Gathering only on a solo walk, so nothing here
// is sent or has to agree with another screen.
//
// NO RANDOMNESS. Who comes, where they sit, the cake's spot and every hop are
// derived from the island's built map, the clan casts and the walk's own
// clock: nothing draws from walkRng, the strays' stream or Math.random, so no
// stream shifts on a birthday walk or any other.
//
// THE ISLAND STAYS KEPT. The island is the truce ground no cat stands on
// (owner's decision 4, island.js ISLAND_KEEP_OUT), and that rule is left as it
// is for every cat the game moves: the strays, the ghosts, the clan. The
// Gathering's own cats are the one exception, and only on this walk: they are
// stood on the island's dry land by gatheringGround below, which says yes on
// the island only when the birthday is open, and never on the lake.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCat } from '../cat/model.js';
import { animateCat } from '../cat/animator.js';
import { makeNameTag, NAME_TAG_RANGE, tagBudget, CAMP_TAG_MAX, fitBubbleOnRender, TAG_Y } from '../nametag.js';
import { castFor, RANK_SCALE, tagOptsFor } from '../clancast.js';
import { pickableClans } from '../clanhomes.js';
import { RANK_KEYS } from '../wordset.js';
import { phrase } from '../clanphrases.js';
import { isWalkableAt } from '../player.js';
import { keepOutPoint } from '../keepout.js';
import { ISLAND_LAND, ISLAND_PERCHES, ISLAND_KEEP_OUT, BRIDGE_DECK } from './island.js';
import { segDist } from '../segdist.js';
import { withLocalUuids } from './localuuids.js';
import { mulberry32, seedFromCode } from '../rng.js';

const K = RANK_KEYS;
const freeze = (o) => Object.freeze(o);

// ---- the plan: pure numbers ----------------------------------------------------

// The great rock: the Watch Rock's flat top (island.js), where the leader sits.
export function gatheringRock() {
  const p = ISLAND_PERCHES.find((q) => q.label === 'watch rock');
  return freeze({ x: p.x, z: p.z, y: p.y });
}

// The cake: three tiers on a plate, 1.36 m across at the plate and 1.2 m at
// its bottom tier, 0.92 m to the top of the frosting and about 1.1 m to the
// flames. Solid: `r` is its collider (the plate's edge).
export const CAKE = freeze({
  r: 0.68,
  plate: freeze({ r: 0.68, h: 0.05 }),
  tiers: freeze([
    freeze({ r: 0.6, h: 0.36, color: 0xf6c6d4 }),
    freeze({ r: 0.45, h: 0.28, color: 0xfff1e0 }),
    freeze({ r: 0.31, h: 0.23, color: 0xf6c6d4 }),
  ]),
  candles: 11,
  candleR: 0.032,
  candleH: 0.2,
  ringR: 0.22,     // the candles' ring on the top tier
});
export const CAKE_TOP = CAKE.plate.h + CAKE.tiers.reduce((s, t) => s + t.h, 0);

// How the cake is placed: tried at these distances from the rock's centre and
// turns off the line to the island's centre, first fit wins. It must stand
// CAKE_GAP clear of every collider's edge, on dry land the whole way round,
// and well inside the shore.
const CAKE_D = [2.8, 3.1, 2.5, 3.4];
const CAKE_TURNS = [-0.35, 0.35, -0.6, 0.6, 0, -0.85, 0.85];
const CAKE_GAP = 0.7;
const SHORE_IN = 2;
// The ring: two rows of seats round the rock, the front row first, from the
// middle outwards, alternating sides. The middle (within RING_OPEN of the line
// to the island's centre) is left open: that is where she walks in.
const ROWS = [4.4, 5.3];
const RING_OPEN = 0.24;
const RING_TURN_MAX = 1.5;
const SEAT_GAP = 0.78;          // between two seats
const SEAT_CAKE_GAP = 0.8;      // a seat's distance from the cake's edge
const SEAT_SHORE_IN = 1.4;
export const PER_CLAN = 3;
// She is near enough for the leader to begin, and beside the cake.
export const ANNOUNCE_RANGE = 9;
export const CAKE_REACH = 1.15; // metres past the cake's edge

// Where a Gathering cat may stand. Off the birthday (open false): exactly the
// Pines' rule for every cat, the keep-out (no island, no bridge, no lake).
// On it: the island's dry land and the bridge deck as well, never the lake.
export function gatheringGround(area, open) {
  const ko = { ...area, keepOut: ISLAND_KEEP_OUT };
  return (x, z) => {
    if (!isWalkableAt(area, x, z)) return false;
    if (open) {
      const onLand = Math.hypot(x - ISLAND_LAND.x, z - ISLAND_LAND.z) <= ISLAND_LAND.r;
      const onDeck = segDist(x, z, BRIDGE_DECK.x1, BRIDGE_DECK.z1, BRIDGE_DECK.x2, BRIDGE_DECK.z2) <= BRIDGE_DECK.halfW;
      if (onLand || onDeck) return true;
    }
    const p = keepOutPoint(ko, x, z);
    return p.x === x && p.z === z;
  };
}

// The cats who come: per clan, its leader (the speaker's own clan sends its
// deputy, the leader being on the rock), then its first warrior and its first
// apprentice. Front-row cats first: every clan's leader, then the warriors,
// then the apprentices.
export function gatheringCast(speaker, perClan = PER_CLAN) {
  const rounds = [];
  for (const clan of pickableClans()) {
    const cast = castFor(clan);
    const first = (rank) => cast.find((m) => m.rank === rank && m !== speaker && m.id !== speaker?.id);
    const head = speaker && speaker.clan === clan ? first(K.deputy) : first(K.leader);
    const picks = [head, first(K.warrior), first(K.apprentice)].filter(Boolean).slice(0, perClan);
    picks.forEach((m, i) => { (rounds[i] ??= []).push(m); });
  }
  return rounds.flat();
}

const edgeGap = (p, c) => Math.hypot(p.x - c.x, p.z - c.z) - c.r;

/**
 * planGathering(area, { speaker, perClan }) -> { rock, cake, seats, cats, speaker }
 *   rock   the Watch Rock's top { x, z, y }
 *   cake   { x, z, r }, below the rock inside the ring
 *   seats  [{ x, z }] in fill order, one per cat that fits
 *   cats   the cast members, seats[i] being cats[i]'s
 * Pure over the built Pines area (its colliders, waters and bounds).
 */
export function planGathering(area, { speaker = null, perClan = PER_CLAN } = {}) {
  const rock = gatheringRock();
  const colliders = area?.colliders ?? [];
  const ground = gatheringGround(area, true);
  const toCentre = Math.atan2(ISLAND_LAND.z - rock.z, ISLAND_LAND.x - rock.x);
  const inland = (p, d) => Math.hypot(p.x - ISLAND_LAND.x, p.z - ISLAND_LAND.z) <= ISLAND_LAND.r - d;
  let cake = null;
  for (const d of CAKE_D) {
    for (const t of CAKE_TURNS) {
      const p = { x: rock.x + Math.cos(toCentre + t) * d, z: rock.z + Math.sin(toCentre + t) * d, r: CAKE.r };
      if (!inland(p, CAKE.r + SHORE_IN)) continue;
      if (colliders.some((c) => edgeGap(p, c) - CAKE.r < CAKE_GAP)) continue;
      let dry = ground(p.x, p.z);
      for (let k = 0; dry && k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        dry = ground(p.x + Math.cos(a) * (CAKE.r + 0.4), p.z + Math.sin(a) * (CAKE.r + 0.4));
      }
      if (dry) { cake = freeze({ x: round(p.x), z: round(p.z), r: CAKE.r }); break; }
    }
    if (cake) break;
  }
  if (!cake) return null;
  const withCake = { ...area, colliders: [...colliders, cake] };
  const solid = gatheringGround(withCake, true);
  const cats = gatheringCast(speaker, perClan);
  const seats = [];
  for (const R of ROWS) {
    const step = SEAT_GAP / R;
    for (let k = 0; ; k++) {
      const turn = RING_OPEN + k * step;
      if (turn > RING_TURN_MAX) break;
      for (const side of [1, -1]) {
        const a = toCentre + side * turn;
        const p = { x: round(rock.x + Math.cos(a) * R), z: round(rock.z + Math.sin(a) * R) };
        if (!inland(p, SEAT_SHORE_IN) || !solid(p.x, p.z)) continue;
        if (edgeGap(p, cake) < SEAT_CAKE_GAP) continue;
        if (seats.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < SEAT_GAP - 1e-6)) continue;
        seats.push(p);
      }
    }
  }
  const n = Math.min(seats.length, cats.length);
  return freeze({ rock, cake, seats: freeze(seats.slice(0, n).map(freeze)), cats: freeze(cats.slice(0, n)), speaker });
}
const round = (v) => Math.round(v * 1000) / 1000;

// ---- the cake ------------------------------------------------------------------

function coloured(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const CANDLE_COLOURS = [0x5aa0e8, 0xf2c14e, 0xe05a7a, 0x7cc57a, 0xb48be0];
const FROSTING = 0xffffff;

// The cake's body (one mesh) and its flames (one mesh, flame i drawn from
// i * perFlame indices: a draw range of k flames shows the first k lit).
export function buildCake() {
  const parts = [];
  const add = (g, hex, y, x = 0, z = 0) => { g.translate(x, y, z); parts.push(coloured(g, hex)); };
  add(new THREE.CylinderGeometry(CAKE.plate.r, CAKE.plate.r * 0.94, CAKE.plate.h, 28), 0xe8e4dc, CAKE.plate.h / 2);
  let y = CAKE.plate.h;
  for (const [i, t] of CAKE.tiers.entries()) {
    add(new THREE.CylinderGeometry(t.r, t.r, t.h, 28), t.color, y + t.h / 2);
    // frosting: a cap a little wider than the tier, and beads round its foot
    add(new THREE.CylinderGeometry(t.r + 0.025, t.r + 0.025, 0.05, 28), FROSTING, y + t.h - 0.02);
    add(new THREE.TorusGeometry(t.r + 0.01, 0.03, 6, 28).rotateX(Math.PI / 2), FROSTING, y + 0.02);
    // drips down the side, and berries on each tier's shoulder
    const drips = Math.round(t.r * 22);
    for (let k = 0; k < drips; k++) {
      const a = (k / drips) * Math.PI * 2 + i * 0.3;
      const len = 0.07 + ((k * 37) % 5) * 0.012;
      add(new THREE.CapsuleGeometry(0.022, len, 2, 6), FROSTING, y + t.h - 0.04 - len / 2, Math.cos(a) * (t.r + 0.012), Math.sin(a) * (t.r + 0.012));
    }
    if (i < CAKE.tiers.length - 1) {
      const next = CAKE.tiers[i + 1];
      const berries = 8;
      for (let k = 0; k < berries; k++) {
        const a = (k / berries) * Math.PI * 2 + 0.2;
        const br = (t.r + next.r) / 2 + 0.02;
        add(new THREE.SphereGeometry(0.04, 8, 6), 0xd23a4a, y + t.h + 0.04, Math.cos(a) * br, Math.sin(a) * br);
      }
    }
    y += t.h;
  }
  const top = y;
  const flames = [];
  for (let k = 0; k < CAKE.candles; k++) {
    const r = k === CAKE.candles - 1 ? 0 : CAKE.ringR; // ten round the ring, one in the middle
    const aa = k === CAKE.candles - 1 ? 0 : (k / (CAKE.candles - 1)) * Math.PI * 2;
    const cx = Math.cos(aa) * r, cz = Math.sin(aa) * r;
    add(new THREE.CylinderGeometry(CAKE.candleR, CAKE.candleR, CAKE.candleH, 8), CANDLE_COLOURS[k % CANDLE_COLOURS.length], top + CAKE.candleH / 2, cx, cz);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), 0x333333, top + CAKE.candleH + 0.015, cx, cz);
    const f = new THREE.SphereGeometry(0.04, 8, 6);
    f.scale(1, 1.9, 1);
    f.translate(cx, top + CAKE.candleH + 0.075, cz);
    flames.push(f);
  }
  const body = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed())), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }));
  for (const g of parts) g.dispose();
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'bday-cake';
  const flameGeo = mergeGeometries(flames.map((g) => g.toNonIndexed()));
  for (const g of flames) g.dispose();
  const perFlame = flameGeo.attributes.position.count / CAKE.candles;
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffc23a }));
  flame.name = 'bday-flames';
  flame.castShadow = false;
  flame.receiveShadow = false;
  flame.userData.noCast = true;
  const group = new THREE.Group();
  group.name = 'bday-cake-group';
  group.add(body, flame);
  const setLit = (k) => flameGeo.setDrawRange(0, Math.max(0, Math.min(CAKE.candles, k)) * perFlame);
  setLit(CAKE.candles);
  return { group, body, flame, setLit, top };
}

// ---- the speech bubble -------------------------------------------------------------
// The chat bubble's look (chatbubble.js), wrapped onto up to three lines so the
// leader's announcement fits. null with no document (headless).
const BUBBLE_W = 640;
const BUBBLE_FONT = 38;
const BUBBLE_LINE = 46;
const BIG_BUBBLE_W = 4.0;        // metres, the announcement's width
const BIG_BUBBLE_LIFT = 0.6;     // metres from the leader's feet to the sign's middle
export function wrapLines(text, measure, maxW = BUBBLE_W - 70, maxLines = 3) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > maxW && out.length < maxLines - 1) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
function makeBubble(text, { big = false } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `bold ${BUBBLE_FONT}px Avenir, sans-serif`;
  const measure = (s) => (typeof ctx.measureText === 'function' ? ctx.measureText(s).width || 0 : s.length * 20);
  const lines = wrapLines(text, measure);
  const H = 24 + lines.length * BUBBLE_LINE + 30;
  canvas.width = BUBBLE_W;
  canvas.height = H;
  ctx.font = `bold ${BUBBLE_FONT}px Avenir, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(BUBBLE_W - 16, Math.max(120, Math.max(...lines.map(measure)) + 56));
  const x = (BUBBLE_W - w) / 2;
  const boxH = H - 30;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, 6, w, boxH, 26);
  else ctx.rect?.(x, 6, w, boxH);
  ctx.fill?.();
  ctx.beginPath();
  ctx.moveTo?.(BUBBLE_W / 2 - 14, boxH + 4);
  ctx.lineTo?.(BUBBLE_W / 2 + 14, boxH + 4);
  ctx.lineTo?.(BUBBLE_W / 2, H - 4);
  ctx.closePath?.();
  ctx.fill?.();
  ctx.fillStyle = '#1c2431';
  lines.forEach((l, i) => ctx.fillText(l, BUBBLE_W / 2, 6 + 12 + BUBBLE_LINE / 2 + i * BUBBLE_LINE));
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const sx = big ? BIG_BUBBLE_W : 3.4;
  sprite.scale.set(sx, sx * (H / BUBBLE_W), 1);
  sprite.renderOrder = 10;
  // A cheer is fitted like a chat bubble (its letters the size of a name
  // tag's). The leader's announcement is not: it is a sign in the world, big
  // enough to read from across the ring.
  if (!big) {
    sprite.userData.fitLines = (34 / 64) / (BUBBLE_FONT / H);
    sprite.onBeforeRender = fitBubbleOnRender;
  }
  return sprite;
}

// ---- the show: fireworks over the lake, lanterns rising ---------------------------
// After the candles: a few bursts over the lake east of the island in about
// ten seconds, each a rocket and a ball of sparks, and paper lanterns floating
// up off the island. Everything is drawn from the island's own salted stream
// (FIREWORK_SALT, never walkRng or Math.random), so the show is the same every
// time. All the sparks are ONE Points mesh (one draw) and the lanterns one
// InstancedMesh. Reduced motion: fewer, smaller, slower bursts and fewer
// lanterns. `boom` is the walk's sound (through the game's sound switch).
export const FIREWORK_SALT = 0xb1d7f12e;
const SHOW = freeze({
  bursts: 7, sparks: 72, span: 9.2, rocket: 0.9, life: 2.2, speed: 6, gravity: 2, drag: 0.8, size: 1.5,
  lanterns: 14, lanternRise: 0.45, lanternTop: 16, lanternFade: 14,
});
const SHOW_SOFT = freeze({ ...SHOW, bursts: 3, sparks: 40, span: 8, life: 2.8, speed: 3.8, gravity: 1.1, size: 1.1, lanterns: 6, lanternRise: 0.3 });
const SPARK_COLOURS = [0xff5a7a, 0xffd24a, 0x6ab8ff, 0x8cf08c, 0xd29cff, 0xffffff, 0xff9a3c];
const LANTERN_COLOUR = 0xffa64d;
// where the lanterns rise: round the Watch Rock, beyond the cake from the
// ring's open side, so none rises right in front of her camera
const LANTERN_FROM = freeze({ x: 38.5, z: 28 });

const SPARK_VERT = `
uniform float uScale;
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale * (320.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const SPARK_FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5 || vAlpha <= 0.0) discard;
  gl_FragColor = vec4(min(vec3(1.0), vColor * (1.25 - d)), vAlpha * (1.0 - smoothstep(0.25, 0.5, d)));
  #include <colorspace_fragment>
}`;

// planShow(reducedMotion) -> { bursts: [{ at, x, y, z, colour, r }], lanterns: [{ x, z, at, sway }] }
// Pure, from the salted stream alone. Bursts are over the lake east and
// north-east of the island, 4.2-6.6 m up, so from the ring they rise behind the
// Watch Rock. The lanterns rise from the ring round the cake.
export function planShow(reducedMotion = false) {
  const S = reducedMotion ? SHOW_SOFT : SHOW;
  const rnd = mulberry32((seedFromCode('bday-island-show') ^ FIREWORK_SALT) >>> 0);
  const bursts = [];
  for (let i = 0; i < S.bursts; i++) {
    const a = -0.35 + rnd() * 0.8;       // east, either side of the Watch Rock
    const d = ISLAND_LAND.r + 4 + rnd() * 5;
    bursts.push(freeze({
      at: round(S.bursts === 1 ? 0 : (i / (S.bursts - 1)) * S.span * (0.85 + rnd() * 0.15)),
      x: round(ISLAND_LAND.x + Math.cos(a) * d),
      y: round(4.2 + rnd() * 2.4),
      z: round(ISLAND_LAND.z + Math.sin(a) * d),
      colour: SPARK_COLOURS[Math.floor(rnd() * SPARK_COLOURS.length)],
      colour2: SPARK_COLOURS[Math.floor(rnd() * SPARK_COLOURS.length)],
    }));
  }
  const lanterns = [];
  for (let i = 0; i < S.lanterns; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 1.4 + rnd() * 3.2;
    const ox = LANTERN_FROM.x + Math.cos(a) * d, oz = LANTERN_FROM.z + Math.sin(a) * d;
    lanterns.push(freeze({ x: round(ox), z: round(oz), at: round(rnd() * 3), sway: round(rnd() * 6.28) }));
  }
  return { bursts: freeze(bursts), lanterns: freeze(lanterns), S };
}

function createShow(scene, { reducedMotion = false, boom = () => {}, groundY = () => 0, pixelRatio = 1 } = {}) {
  const { bursts, lanterns, S } = planShow(reducedMotion);
  const rnd = mulberry32((seedFromCode('bday-island-sparks') ^ FIREWORK_SALT) >>> 0);
  const per = S.sparks + 1; // the rocket, then its sparks
  const n = bursts.length * per;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const vel = new Float32Array(n * 3);
  const c = new THREE.Color();
  bursts.forEach((b, i) => {
    for (let k = 0; k < S.sparks; k++) {
      // an even ball of directions (golden spiral), a little jitter
      const t = (k + 0.5) / S.sparks;
      const incl = Math.acos(1 - 2 * t);
      const az = Math.PI * (1 + Math.sqrt(5)) * k + rnd() * 0.3;
      const sp = S.speed * (0.8 + rnd() * 0.4);
      const j = i * per + 1 + k;
      vel[j * 3] = Math.sin(incl) * Math.cos(az) * sp;
      vel[j * 3 + 1] = Math.cos(incl) * sp;
      vel[j * 3 + 2] = Math.sin(incl) * Math.sin(az) * sp;
      c.set(k % 3 === 0 ? b.colour2 : b.colour);
      col.set([c.r, c.g, c.b], j * 3);
    }
    c.set(0xfff2c0);
    col.set([c.r, c.g, c.b], i * per * 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(ISLAND_LAND.x + 20, 12, ISLAND_LAND.z), 60);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
    // a point's size is in drawing-buffer pixels: scaled by the pixel ratio
    uniforms: { uScale: { value: Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1 } },
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
  });
  const sparks = new THREE.Points(geo, mat);
  sparks.name = 'bday-fireworks';
  sparks.frustumCulled = false;
  sparks.renderOrder = 5;
  sparks.userData.noCast = true;
  scene.add(sparks);

  // the lanterns: a warm paper box with a lit bottom, one InstancedMesh
  const lg = new THREE.CylinderGeometry(0.13, 0.1, 0.26, 8);
  {
    // glowing from below: pale gold at the open foot, deep orange at the top
    const lp = lg.attributes.position;
    const lc = new Float32Array(lp.count * 3);
    const lo = new THREE.Color(0xffe08a), hi = new THREE.Color(LANTERN_COLOUR);
    for (let i = 0; i < lp.count; i++) {
      const k = (lp.getY(i) + 0.13) / 0.26;
      lc[i * 3] = lo.r + (hi.r - lo.r) * k; lc[i * 3 + 1] = lo.g + (hi.g - lo.g) * k; lc[i * 3 + 2] = lo.b + (hi.b - lo.b) * k;
    }
    lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  }
  const lm = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lamps = new THREE.InstancedMesh(lg, lm, Math.max(1, lanterns.length));
  lamps.count = lanterns.length;
  lamps.name = 'bday-lanterns';
  lamps.frustumCulled = false;
  lamps.userData.noCast = true;
  lamps.castShadow = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  scene.add(lamps);

  let clock = 0;
  let boomed = 0;
  let done = false;
  const sparkEnd = Math.max(...bursts.map((b) => b.at)) + S.rocket + S.life + 0.2;
  const lampEnd = Math.max(...lanterns.map((l) => l.at), 0) + S.lanternFade + 1.5;
  const showLamps = (t) => {
    lanterns.forEach((l, i) => {
      const u = t - l.at;
      const up = u <= 0 ? 0 : u * S.lanternRise;
      const fade = u < S.lanternFade ? 1 : Math.max(0, 1 - (u - S.lanternFade));
      const k = u <= 0 ? 0 : Math.min(1, u * 2) * fade;
      const sway = reducedMotion ? 0 : Math.sin(u * 0.7 + l.sway) * 0.4;
      p3.set(l.x + sway, groundY(l.x, l.z) + 0.6 + Math.min(up, S.lanternTop), l.z + Math.cos(u * 0.5 + l.sway) * 0.2);
      s3.copy(one).multiplyScalar(Math.max(0.0001, k));
      lamps.setMatrixAt(i, m4.compose(p3, q, s3));
    });
    lamps.instanceMatrix.needsUpdate = true;
  };
  showLamps(0);

  return {
    bursts,
    get lanterns() { return lanterns.length; },
    get sparks() { return bursts.length * S.sparks; },
    get done() { return done; },
    update(dt) {
      if (done) return;
      clock += Number.isFinite(dt) && dt > 0 ? dt : 0;
      bursts.forEach((b, i) => {
        const r = i * per;
        const u = clock - b.at;
        // the rocket climbs from the water to the burst
        if (u >= 0 && u < S.rocket) {
          const f = u / S.rocket;
          pos.set([b.x, b.y - 7 * (1 - f) * (1 - f), b.z], r * 3);
          size[r] = 0.35;
          alpha[r] = 1;
        } else {
          alpha[r] = 0;
        }
        const v = u - S.rocket;
        if (v >= 0 && boomed <= i) { boomed = i + 1; try { boom(i); } catch { /* sound is a nicety */ } }
        for (let k = 1; k <= S.sparks; k++) {
          const j = r + k;
          if (v < 0 || v > S.life) { alpha[j] = 0; continue; }
          const damp = (1 - Math.exp(-S.drag * v)) / S.drag;
          pos[j * 3] = b.x + vel[j * 3] * damp;
          pos[j * 3 + 1] = b.y + vel[j * 3 + 1] * damp - 0.5 * S.gravity * v * v;
          pos[j * 3 + 2] = b.z + vel[j * 3 + 2] * damp;
          const life = v / S.life;
          alpha[j] = life < 0.7 ? 1 : Math.max(0, 1 - (life - 0.7) / 0.3);
          size[j] = S.size * (1 - 0.4 * life) * (reducedMotion ? 1 : 1 + 0.25 * Math.sin(v * 30 + k));
        }
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      showLamps(clock);
      if (clock > sparkEnd && clock > lampEnd) {
        done = true;
        sparks.visible = false;
        lamps.visible = false;
      }
    },
    dispose() {
      scene.remove(sparks, lamps);
      geo.dispose();
      mat.dispose();
      lg.dispose();
      lm.dispose();
      lamps.dispose?.();
    },
  };
}

// ---- the Gathering, live --------------------------------------------------------

const ANNOUNCE_TIME = 7;      // seconds the leader speaks before the first cheer
const CHEER_TIME = 3.2;
const PHOTO_AT = 1.2;         // seconds into the second cheer
const FLAME_STEP = 0.17;      // seconds between two candles going out
const BUBBLE_LIFE = 8;
const CHEER_BUBBLE_LIFE = 2.6;
const HOP_HEIGHT = 0.16;
const HOP_RATE = 1.7;         // hops a second
const CONFETTI = [0xe05a7a, 0xf2c14e, 0x5aa0e8, 0x7cc57a, 0xb48be0, 0xffffff];
// The cats who say something when they cheer, by seat order (front row).
const CHEER_SPEAKERS = [0, 3, 6];
const AFTER_POSES = ['requestPet', 'groom', 'requestPet', 'nap'];

const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) + Math.PI;

/**
 * createBirthdayGathering(scene, plan, opts) -> gathering
 * opts: { name (her cat's name), showNames, reducedMotion, burst(pos, colour,
 *   count, opts), toast(text), onBlown() }
 * gathering: { cake, phase, lit, promptAt(pos), blow(), update(dt, t, pos), dispose() }
 */
export function createBirthdayGathering(scene, plan, {
  name = '', showNames = true, reducedMotion = false, ground = null,
  burst = () => {}, toast = () => {}, onBlown = () => {},
  boom = () => {}, onPhoto = () => {}, pixelRatio = 1,
} = {}) {
  const { rock, cake: spot, seats } = plan;
  const gy = (x, z) => (ground && !ground.flat && typeof ground.y === 'function' ? ground.y(x, z) : 0);
  const cake = withLocalUuids('bday-cake', buildCake);
  cake.group.position.set(spot.x, gy(spot.x, spot.z), spot.z);
  scene.add(cake.group);

  const cats = [];
  // Every build on a local stream (localuuids.js): Three's uuids draw from
  // Math.random, and this walk's real Math.random draws must not move.
  const make = (member, x, y, z, yaw) => withLocalUuids(`bday-cat-${member.id}`, () => {
    const scale = RANK_SCALE[member.rank] ?? 1;
    const group = buildCat(member.breed, undefined, { simple: true, style: member.style, scars: [] });
    group.userData.blinkSeed = [...String(member.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7) / 997;
    group.scale.multiplyScalar(scale);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    group.traverse((o) => { if (o.isMesh) { o.userData.noCast = true; o.castShadow = false; o.receiveShadow = true; } });
    let tag = null;
    if (showNames) {
      tag = makeNameTag(member.name, tagOptsFor(member));
      if (tag) { tag.scale.x /= scale; tag.scale.y /= scale; group.add(tag); }
    }
    scene.add(group);
    const c = { member, group, tag, scale, y, phase: ((member.id.length * 7 + cats.length * 3) % 10) / 10, i: cats.length, tagEntry: null };
    cats.push(c);
    return c;
  });
  const leader = plan.speaker
    ? make(plan.speaker, rock.x, gy(rock.x, rock.z) + rock.y, rock.z, yawToward(rock.x, rock.z, spot.x, spot.z))
    : null;
  const ring = plan.cats.map((m, i) => make(m, seats[i].x, gy(seats[i].x, seats[i].z), seats[i].z, yawToward(seats[i].x, seats[i].z, rock.x, rock.z)));

  // bubbles: { sprite, cat, life }
  const bubbles = [];
  let said = 0;
  const say = (c, text, life, big = false) => {
    if (!c) return;
    const old = bubbles.findIndex((b) => b.cat === c);
    if (old >= 0) drop(old);
    said += 1;
    const sprite = withLocalUuids(`bday-bubble-${said}`, () => makeBubble(text, { big }));
    if (!sprite) return;
    sprite.scale.x /= c.scale;
    sprite.scale.y /= c.scale;
    sprite.position.y = (big ? BIG_BUBBLE_LIFT + sprite.scale.y * c.scale * 0.5 : TAG_Y + 0.62) / c.scale;
    c.group.add(sprite);
    bubbles.push({ sprite, cat: c, life });
  };
  function drop(i) {
    const b = bubbles[i];
    b.sprite.parent?.remove(b.sprite);
    b.sprite.material.map?.dispose();
    b.sprite.material.dispose();
    bubbles.splice(i, 1);
  }

  let phase = 'wait';
  let show = null;
  let photoTaken = false;
  let since = 0;      // seconds in this phase
  let clock = 0;
  let lit = CAKE.candles;
  let cheerSaid = 0;
  const go = (p) => { phase = p; since = 0; cheerSaid = 0; };
  const cheerLines = [phrase('bday.cheer.one'), phrase('bday.cheer.two'), phrase('bday.cheer.three')];
  const cakeTop = new THREE.Vector3(spot.x, cake.top + 0.3, spot.z);

  const tagEntries = [];
  const tagShown = new Map();

  const api = {
    cake: spot,
    get phase() { return phase; },
    get lit() { return lit; },
    get cats() { return cats; },
    // Where the birthday photo is taken from: west of the cake (the ring's
    // open side), up a little, looking over the cake at the rock, so her
    // cat beside it, the leader and the ring are in the picture.
    photoView(catPos) {
      const ax = rock.x - spot.x, az = rock.z - spot.z;
      const al = Math.hypot(ax, az) || 1;
      const ux = ax / al, uz = az / al;
      // her side of the cake, so she is in front of it rather than behind
      const side = catPos ? Math.sign((catPos.x - spot.x) * -uz + (catPos.z - spot.z) * ux) || 1 : 1;
      const back = 4.2, lift = 1.9, swing = 0.5 * side;
      const bx = -ux * Math.cos(swing) + uz * Math.sin(swing);
      const bz = -uz * Math.cos(swing) - ux * Math.sin(swing);
      const g0 = gy(spot.x, spot.z);
      // aimed between the cake and her cat (when she is near it), a little
      // toward the rock, so she is in the middle of the picture
      const near = catPos && Math.hypot(catPos.x - spot.x, catPos.z - spot.z) < 3;
      const cx = near ? spot.x * 0.6 + catPos.x * 0.4 : spot.x;
      const cz = near ? spot.z * 0.6 + catPos.z * 0.4 : spot.z;
      return {
        from: { x: cx + bx * back, y: g0 + lift, z: cz + bz * back },
        at: { x: cx + ux * 0.6, y: g0 + 0.8, z: cz + uz * 0.6 },
      };
    },
    // the fireworks and lanterns once the candles are out, else null
    get show() { return show; },
    // She is beside the cake and its candles are lit.
    promptAt(pos) {
      if (lit < CAKE.candles || phase === 'blow' || !pos) return false;
      return Math.hypot(pos.x - spot.x, pos.z - spot.z) <= spot.r + CAKE_REACH;
    },
    // The action button: the candles go out one by one. true when it starts.
    blow() {
      if (lit < CAKE.candles || phase === 'blow') return false;
      if (phase === 'wait') say(leader, phrase('bday.announce', name), BUBBLE_LIFE, true);
      go('blow');
      return true;
    },
    update(dt, t, pos) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      clock += d;
      since += d;
      if (phase === 'wait' && pos && Math.hypot(pos.x - spot.x, pos.z - spot.z) <= ANNOUNCE_RANGE) {
        go('announce');
        say(leader, phrase('bday.announce', name), BUBBLE_LIFE, true);
      } else if (phase === 'announce' && since >= ANNOUNCE_TIME) {
        go('cheer');
      } else if (phase === 'cheer' && since >= CHEER_TIME) {
        go('cake');
      } else if (phase === 'blow') {
        const out = Math.min(CAKE.candles, Math.floor(since / FLAME_STEP) + 1);
        if (CAKE.candles - out < lit) {
          lit = CAKE.candles - out;
          cake.setLit(lit);
        }
        if (lit === 0 && since >= CAKE.candles * FLAME_STEP + 0.2) {
          for (const [k, colour] of CONFETTI.entries()) {
            burst(cakeTop, colour, 14, { ttl: 2.2, gravity: 2.2, speed: 3 + (k % 3) * 0.5, size: 0.09 });
          }
          toast(phrase('bday.wish'));
          try { onBlown(); } catch { /* the day's note is a nicety */ }
          go('cheer2');
          show = withLocalUuids('bday-show', () => createShow(scene, { reducedMotion, boom, groundY: gy, pixelRatio }));
        }
      }
      // the photo, a beat into the cheer: the cats up on their paws, the
      // first rocket climbing
      if (phase === 'cheer2' && !photoTaken && since >= PHOTO_AT) {
        photoTaken = true;
        try { onPhoto(); } catch { /* the Album is a nicety */ }
      }
      show?.update(d);
      if (phase === 'cheer2' && since >= CHEER_TIME) {
        go('after');
      }
      // the cheers' short bubbles, a beat apart
      if ((phase === 'cheer' || phase === 'cheer2') && cheerSaid < CHEER_SPEAKERS.length && since >= cheerSaid * 0.6) {
        say(ring[CHEER_SPEAKERS[cheerSaid]] ?? ring[cheerSaid], cheerLines[cheerSaid % cheerLines.length], CHEER_BUBBLE_LIFE);
        cheerSaid += 1;
      }
      // a gentle flicker while the candles burn
      // (a colour flicker: the merged flames' pivot is the cake's foot, so a
      // scale would move them off their wicks)
      if (lit > 0 && !reducedMotion) cake.flame.material.color.setHSL(0.11 + Math.sin(clock * 13) * 0.012, 1, 0.6 + Math.sin(clock * 9.3) * 0.05);
      const cheering = phase === 'cheer' || phase === 'cheer2';
      for (const c of ring) {
        const p = c.group.position;
        if (cheering && !reducedMotion) {
          const s = Math.sin(2 * Math.PI * (clock * HOP_RATE + c.phase));
          p.y = c.y + HOP_HEIGHT * Math.max(0, s);
          animateCat(c.group, 'follow', t, 0);
        } else {
          p.y = c.y;
          animateCat(c.group, phase === 'after' ? AFTER_POSES[c.i % AFTER_POSES.length] : 'requestPet', t, 0);
        }
      }
      if (leader) animateCat(leader.group, 'requestPet', t, 0);
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.life -= d;
        if (b.life <= 0) drop(i);
        else if (b.life < 0.6) b.sprite.material.opacity = b.life / 0.6;
      }
      // name tags: the nearest two, as in a camp (nametag.js tagBudget)
      tagEntries.length = 0;
      if (pos) {
        for (const c of cats) {
          if (!c.tag) continue;
          const e = c.tagEntry ??= { d: 0, range: NAME_TAG_RANGE, keep: false };
          e.d = c.group.position.distanceTo(pos);
          e.range = c.tag.userData?.revealRange ?? NAME_TAG_RANGE;
          tagEntries.push(e);
        }
      }
      const shown = tagBudget(tagEntries, CAMP_TAG_MAX, tagShown);
      for (const c of cats) {
        if (!c.tag) continue;
        const op = c.tagEntry ? shown.get(c.tagEntry) : undefined;
        c.tag.visible = op !== undefined;
        if (op !== undefined && c.tag.material) c.tag.material.opacity = op;
      }
    },
    dispose() {
      for (let i = bubbles.length - 1; i >= 0; i--) drop(i);
      for (const c of cats) scene.remove(c.group);
      scene.remove(cake.group);
      show?.dispose();
      show = null;
      cake.body.geometry.dispose();
      cake.body.material.dispose();
      cake.flame.geometry.dispose();
      cake.flame.material.dispose();
    },
  };
  return api;
}
