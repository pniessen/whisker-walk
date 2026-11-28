// =============================================================================
// THE SQUARE'S SMALL CREATURES (Market beauty pass 5). One pooled Points of picture-sprites (a 128 x 96 atlas
// drawn in code, no file, no mesh, no triangle, no caster):
//   * a sleepy tabby on the crates by the fountain's bench, who stretches when she passes;
//   * six sparrows that hop about the café for crumbs and fly up in a puff when she comes near, then drift back;
//   * a dog tied up at the butcher's, whose tail wags (quick when she is near);
//   * four butterflies at the flower stall, who go home at dusk;
//   * the arrival: five pigeons flutter up and a puff of petals rises at the gate as she enters the square.
// Everything is a pure function of the walk's seconds (hash01 for the variety) plus a few small states (who has flown).
// Reduced motion freezes it: the cat sleeps, the sparrows and the dog sit, the butterflies rest, no arrival. The lite rung
// draws only the cat and the dog, still. Nothing allocates per frame.
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { withLocalUuids } from './localuuids.js';
import { CAFE, MARKET_CLUTTER, stallById, fromStall } from './marketplan.js';

const SALT = 241;
const HIDDEN = -50;
const COLS = 4;
const ROWS = 3;

// atlas cells
export const CELLS = Object.freeze({ sparrow: 0, sparrowUp: 1, pigeon: 0, pigeonUp: 1, cat: 4, catStretch: 5, dog: 6, dogWag: 7, wing: 8, wingShut: 9, petal: 10 });
const SIZES = Object.freeze({ sparrow: 0.46, pigeon: 0.7, cat: 0.7, catStretch: 0.9, dog: 0.95, wing: 0.5, petal: 0.11 });

// 16 x 16 pixel pictures, facing right ('.' clear); the letters are PAL's colours
const PAL = { b: 0x8a5a38, d: 0x4a3424, c: 0xe2d2b0, o: 0xe0a040, k: 0x161616, t: 0xd98a3e, s: 0xa8581e, w: 0xf2e6d0, p: 0xf2b6b0, n: 0xc0894a, e: 0x5a3418, g: 0x2a2a2a, a: 0xa87238, W: 0xffffff };
const ART = [
  // sparrow, sparrow with wings up
  '................|................|................|................|..........bbb...|.........bbbkoo.|.........bbbbb..|..dd..bbbbbbbc..|..ddbbbbbbbbbc..|...dbddbbbbbcc..|....dddbbbbcc...|.....bbbbbcc.....|......bccc......|.......o.o......|................|................',
  '..dd............|..dddd..dd......|...dddddddd......|....ddddd.bbb...|..........bbkoo..|..dd.....bbbbb...|..ddbbbbbbbbc...|...dbbbbbbbbc...|....bbbbbbcc....|.....bbbbcc.....|......bccc......|................|................|................|................|................',
  '', '',
  // a loaf of tabby asleep; a tabby stretching, rump high
  '................|................|................|................|................|.tt.tt..........|.tttttt.........|.tkktkt.ttttt...|.tttttttstttst..|wttttsttsttsttt.|wwtttsttsttsttt.|.wwtttttttttttt.|..wwwttttttttt..|................|................|................',
  '..............tt|..............tt|..............t.|.....ttt......ss..|...tttttt...ssst.|..tkttkt..sstts..|.pttttttttsttts.|.wttttttttttts..|wwwtttttttttt...|.wwwwwwtt.wwtt...|................|................|................|................|................|................',
  // a dog sitting, tail down; tail up
  '................|................|.....ee.........|....eennn.......|...eennnnnn.....|...ennnnnnkk.....|...nnnnnnnnnk....|....nnnnnnn.......|...nnnnwwwn......|..nnnnnnwwn......|.nnnnnnnnnn......|.nnnnnnnnnn......|.nnnnnnnnnw......|.annnnnnnnw......|.aaannnnnww......|................',
  '................|.....ee.........|....eennn.......|...eennnnnn.....|...ennnnnnkk.....|...nnnnnnnnnk....|....nnnnnnn.......|...nnnnwwwn......|n..nnnnnwwn......|n.nnnnnnnnn......|nnnnnnnnnnn......|.nnnnnnnnnn......|.nnnnnnnnnw......|.nnnnnnnnnw......|.nnnnnnnnnww.....|................',
  // a butterfly's wings open, shut
  '................|.WWW........WWW.|WWWWW......WWWWW|WWWWWW.gg.WWWWWW|WWWWWW.gg.WWWWWW|.WWWW..gg..WWWW.|..WW...gg...WW..|...WW.gg.WW.....|..WWW.gg.WWW....|.WWWW.gg.WWWW...|..WW..gg..WW....|.......g........|................|................|................|................',
  '................|................|.......WW.......|......WWWW......|......WWWW......|......WgWW......|......WgWW......|......WgWW......|......WgWW......|......WWWW......|.......WW.......|................|................|................|................|................',
  // a petal
  '................|................|................|................|................|....WWWW........|..WWWWWWWW......|.WWWWWWWWWW.....|..WWWWWWWW......|....WWWW........|................|................|................|................|................|................',
];
const CELL = 16;
const SPRITES = ART.map((a) => a.split('|'));

function atlasTexture() {
  const W = CELL * COLS;
  const H = CELL * ROWS;
  const data = new Uint8Array(W * H * 4);
  SPRITES.forEach((rows, c) => {
    if (rows.length < CELL) return; // the pigeon cells are the sparrow's, tinted
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const hex = PAL[(rows[y] ?? '').padEnd(CELL, '.')[x]];
        if (hex === undefined) continue;
        const j = ((Math.floor(c / COLS) * CELL + y) * W + (c % COLS) * CELL + x) * 4;
        data[j] = hex >> 16; data[j + 1] = (hex >> 8) & 255; data[j + 2] = hex & 255; data[j + 3] = 255;
      }
    }
  });
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const VERT = `
attribute float aCell;
attribute float aSize;
attribute float aFlip;
attribute vec3 aTint;
uniform float uPx;
varying float vCell;
varying float vFlip;
varying vec3 vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vCell = aCell; vFlip = aFlip; vTint = aTint;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPx * projectionMatrix[1][1] / max(0.1, -mv.z), 1.0, 220.0);
}`;
const FRAG = `
uniform sampler2D uAtlas;
uniform vec3 uTone;
varying float vCell;
varying float vFlip;
varying vec3 vTint;
void main() {
  vec2 pc = vec2(mix(gl_PointCoord.x, 1.0 - gl_PointCoord.x, vFlip), gl_PointCoord.y);
  float col = mod(vCell, ${COLS}.0);
  float row = floor(vCell / ${COLS}.0);
  vec4 c = texture2D(uAtlas, vec2((col + pc.x) / ${COLS}.0, (row + pc.y) / ${ROWS}.0));
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb * vTint * uTone, 1.0);
  #include <colorspace_fragment>
}`;

const rungLite = (tier) => !!tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const near2 = (p, x, z, r) => !!p && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r;

// where the things are (the plan's own spots: the crates by the bench, the café, the butcher's side, the flowers)
const stackAt = MARKET_CLUTTER.find((c) => c.id === 'stack-mid');
const CAT_AT = Object.freeze({
  x: stackAt.x + 0.34 * Math.cos(stackAt.yaw), z: stackAt.z - 0.34 * Math.sin(stackAt.yaw), y: 0.62 + 0.26,
});
const BUTCHER = stallById('butcher');
const DOG_AT = (() => { const p = fromStall(BUTCHER, -BUTCHER.hideSide * (BUTCHER.w / 2 + 1.35), 1.0); return Object.freeze({ x: p.x, z: p.z, y: 0.31 }); })();
const FLOWER_AT = (() => { const s = stallById('flowers'); return Object.freeze({ x: s.at.x, z: s.at.z }); })();
const CRUMBS = Object.freeze({ x: CAFE.tables[1].x, z: CAFE.tables[1].z + 0.9 });
const GATE = Object.freeze({ x: 0, z: 19.4 });
const TUBS = Object.freeze([-2.5, 2.5]);

export const N_SPARROW = 6;
export const N_BUTTERFLY = 4;
export const N_PIGEON = 5;
export const N_PETAL = 14;
const I = { cat: 0, dog: 1, sp: 2, bf: 2 + N_SPARROW, pg: 2 + N_SPARROW + N_BUTTERFLY, pt: 2 + N_SPARROW + N_BUTTERFLY + N_PIGEON };
export const CREATURE_COUNT = I.pt + N_PETAL;
const ARRIVE_LIFE = 2.6;
const PETAL_COLOURS = [0xf8c8d8, 0xffffff, 0xf3a8c2, 0xfde6ee, 0xf8e08a];
const BF_COLOURS = [0xf3a8c2, 0xf8d84a, 0xb8a0e8, 0xffffff];

// createCreatures(scene, { reducedMotion, tier }) -> { points, update(dt, t, catPos, o), arrive(t), dispose() } | null
export function createCreatures(scene, { reducedMotion = false, tier = null } = {}) {
  if (!scene) return null;
  const lite = rungLite(tier);
  const N = CREATURE_COUNT;
  const pos = new Float32Array(N * 3);
  const cell = new Float32Array(N);
  const size = new Float32Array(N);
  const flip = new Float32Array(N);
  const tint = new Float32Array(N * 3).fill(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCell', new THREE.BufferAttribute(cell, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aFlip', new THREE.BufferAttribute(flip, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const { points, mat, tex } = withLocalUuids('market-creatures', () => {
    const tex = atlasTexture();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: tex }, uPx: { value: 270 }, uTone: { value: new THREE.Vector3(1, 1, 1) } },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    return { tex, mat, points: new THREE.Points(geo, mat) };
  });
  points.name = 'marketCreatures';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(points);

  const set = (i, x, y, z, c, s, f = 0) => {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    cell[i] = c; size[i] = s; flip[i] = f;
  };
  const hide = (i) => { pos[i * 3 + 1] = HIDDEN; };
  const colour = new THREE.Color();
  const tintOf = (i, hex) => { colour.setHex(hex); tint[i * 3] = colour.r; tint[i * 3 + 1] = colour.g; tint[i * 3 + 2] = colour.b; };

  // static looks (the lite rung and reduced motion draw only these)
  set(I.cat, CAT_AT.x, CAT_AT.y, CAT_AT.z, CELLS.cat, SIZES.cat, 0);
  set(I.dog, DOG_AT.x, DOG_AT.y, DOG_AT.z, CELLS.dog, SIZES.dog, 1);
  for (let i = 0; i < N_SPARROW; i++) { const h = homeOf(i); set(I.sp + i, h.x, 0.12, h.z, CELLS.sparrow, SIZES.sparrow, i % 2); }
  for (let i = 0; i < N_BUTTERFLY; i++) { tintOf(I.bf + i, BF_COLOURS[i % BF_COLOURS.length]); hide(I.bf + i); size[I.bf + i] = SIZES.wing; }
  for (let i = 0; i < N_PIGEON; i++) { hide(I.pg + i); size[I.pg + i] = SIZES.pigeon; cell[I.pg + i] = CELLS.pigeon; tintOf(I.pg + i, 0xb8c0d0); }
  for (let i = 0; i < N_PETAL; i++) { hide(I.pt + i); size[I.pt + i] = SIZES.petal; cell[I.pt + i] = CELLS.petal; tintOf(I.pt + i, PETAL_COLOURS[i % PETAL_COLOURS.length]); }

  function homeOf(i) {
    return { x: CRUMBS.x + (hash01(i, 1, SALT) - 0.5) * 2.4, z: CRUMBS.z + (hash01(i, 2, SALT) - 0.5) * 1.6 };
  }

  // sparrows: each sits a while, then hops to a spot near its home; flown ones return after a rest
  const fly = Array.from({ length: N_SPARROW }, () => ({ t: -1, dx: 0, dz: 0, away: -1 }));
  // the cat stretches for CAT_STRETCH s when she comes within CAT_NEAR, then waits CAT_REST before it can again
  let stretchT = -1;
  let stretchWait = 0;
  const CAT_NEAR = 3.4, CAT_STRETCH_S = 2.6, CAT_REST = 9;
  let arrival = -1;
  let arrived = false;
  let wagBurst = -1;

  function sparrows(t, catPos, dt) {
    for (let i = 0; i < N_SPARROW; i++) {
      const k = I.sp + i;
      const f = fly[i];
      const home = homeOf(i);
      if (f.t >= 0) { // in the air: up and away, then gone until it comes back
        f.t += dt;
        const age = f.t;
        if (age < 1.9) {
          set(k, f.x0 + f.dx * age * 3, 0.2 + age * 2.1 + Math.sin(age * 9) * 0.05, f.z0 + f.dz * age * 3, Math.floor(age * 14) % 2 ? CELLS.sparrowUp : CELLS.sparrow, SIZES.sparrow, f.dx < 0 ? 1 : 0);
        } else {
          hide(k);
          if (age > 11 && !near2(catPos, home.x, home.z, 5)) { f.t = -1; set(k, home.x, 0.12, home.z, CELLS.sparrow, SIZES.sparrow, i % 2); }
        }
        continue;
      }
      if (near2(catPos, pos[k * 3], pos[k * 3 + 2], 2.3)) {
        const dx = pos[k * 3] - catPos.x, dz = pos[k * 3 + 2] - catPos.z;
        const l = Math.hypot(dx, dz) || 1;
        f.t = 0; f.dx = dx / l; f.dz = dz / l; f.x0 = pos[k * 3]; f.z0 = pos[k * 3 + 2];
        continue;
      }
      // a hop cycle of 1.2 .. 2.2 s: sit, then a 0.28 s hop to a new spot within 0.45 m of home
      const per = 1.2 + hash01(i, 3, SALT);
      const n = Math.floor((t + hash01(i, 4, SALT) * 7) / per);
      const ph = ((t + hash01(i, 4, SALT) * 7) / per - n) * per;
      const to = (m) => ({ x: home.x + (hash01(m, i * 7 + 5, SALT) - 0.5) * 0.9, z: home.z + (hash01(m, i * 7 + 6, SALT) - 0.5) * 0.9 });
      const a = to(n - 1), b = to(n);
      const p = clamp01((ph - (per - 0.28)) / 0.28);
      const ease = p * p * (3 - 2 * p);
      const x = a.x + (b.x - a.x) * ease, z = a.z + (b.z - a.z) * ease;
      set(k, x, 0.12 + 0.16 * 4 * p * (1 - p), z, CELLS.sparrow, SIZES.sparrow, b.x < a.x ? 1 : 0);
    }
  }

  function butterflies(t, part) {
    const gone = part > 0.82;
    for (let i = 0; i < N_BUTTERFLY; i++) {
      const k = I.bf + i;
      if (gone) { hide(k); continue; }
      const ph = hash01(i, 8, SALT) * 40;
      const r = 1.0 + 0.7 * hash01(i, 9, SALT);
      const w = 0.35 + 0.25 * hash01(i, 10, SALT);
      const x = FLOWER_AT.x + Math.cos(t * w + ph) * r + Math.sin(t * 0.9 + ph) * 0.3;
      const z = FLOWER_AT.z + Math.sin(t * w * 1.3 + ph) * r * 0.8;
      const y = 1.0 + 0.45 * Math.sin(t * 0.8 + ph * 2) + 0.15 * i * 0.3;
      const flap = Math.floor(t * 9 + ph) % 2;
      set(k, x, y, z, flap ? CELLS.wing : CELLS.wingShut, SIZES.wing, Math.cos(t * w + ph) > 0 ? 0 : 1);
    }
  }

  // where the arrival's pigeons and petals start (made once, when she arrives)
  const from = new Float32Array((N_PIGEON + N_PETAL) * 3);
  function arrivalAt() {
    arrival = 0;
    for (let i = 0; i < N_PIGEON; i++) {
      from[i * 3] = GATE.x + (i - 2) * 0.9 + (hash01(i, 11, SALT) - 0.5) * 0.4;
      from[i * 3 + 2] = GATE.z - hash01(i, 12, SALT) * 1.2;
    }
    for (let i = 0; i < N_PETAL; i++) {
      const j = (N_PIGEON + i) * 3;
      from[j] = TUBS[i % 2] + (hash01(i, 13, SALT) - 0.5) * 0.5;
      from[j + 2] = 21.9 + (hash01(i, 14, SALT) - 0.5) * 0.5;
    }
  }
  function arriving(dt) {
    if (arrival < 0) return;
    arrival += dt;
    const a = arrival;
    for (let i = 0; i < N_PIGEON; i++) {
      const k = I.pg + i;
      if (a > ARRIVE_LIFE) { hide(k); continue; }
      const side = i < 2 ? -1 : i > 2 ? 1 : 0;
      const u = Math.max(0, a - hash01(i, 15, SALT) * 0.35);
      set(k, from[i * 3] + side * u * 1.2 + (u > 0 ? Math.sin(u * 7 + i) * 0.1 : 0), 0.2 + u * (1.3 + u * 0.35), from[i * 3 + 2] - u * 1.4,
        u > 0 && Math.floor(u * 13) % 2 ? CELLS.pigeonUp : CELLS.pigeon, SIZES.pigeon, side < 0 ? 1 : 0);
    }
    for (let i = 0; i < N_PETAL; i++) {
      const k = I.pt + i;
      if (a > ARRIVE_LIFE + 0.4) { hide(k); continue; }
      const h = hash01(i, 16, SALT);
      const u = a * (0.6 + h * 0.5);
      const j = (N_PIGEON + i) * 3;
      set(k, from[j] + Math.sin(u * 3 + i) * 0.4, 0.7 + u * 1.5 - 0.35 * u * u * h, from[j + 2] + Math.cos(u * 2.4 + i) * 0.3 - u * 0.5, CELLS.petal, SIZES.petal, 0);
    }
    if (a > ARRIVE_LIFE + 0.45) arrival = -1;
  }

  const lowFx = lite || reducedMotion;
  geo.attributes.position.needsUpdate = true;
  if (lite) for (let i = 0; i < N_SPARROW; i++) hide(I.sp + i);

  return {
    points,
    count: N,
    uniforms: mat.uniforms,
    // the pixel height of the view (the sprites are sized in metres at the camera's projection)
    setViewHeight(h) { if (Number.isFinite(h) && h > 0) mat.uniforms.uPx.value = h * 0.5; },
    // she has just come into the square: pigeons flutter up and a puff of petals rises at the gate
    arrive(t = 0) {
      if (arrived || lowFx) { arrived = true; return; }
      arrived = true;
      arrivalAt();
    },
    get arrived() { return arrived; },
    // part: 0 morning .. 1 evening; tone: the day's tone (vec3) for the sprites' colour
    update(dt, t, catPos = null, { part = 0.3, tone = null, dusk = false } = {}) {
      if (tone) mat.uniforms.uTone.value.set(tone.x, tone.y, tone.z);
      if (!lowFx) {
        // the cat on the crates: breathes asleep, stretches when she passes, then settles again
        stretchWait = Math.max(0, stretchWait - dt);
        if (stretchT < 0 && stretchWait <= 0 && near2(catPos, CAT_AT.x, CAT_AT.z, CAT_NEAR)) stretchT = 0;
        if (stretchT >= 0) {
          stretchT += dt;
          if (stretchT > CAT_STRETCH_S) { stretchT = -1; stretchWait = CAT_REST; }
        }
        const s = stretchT >= 0;
        const breathe = 1 + 0.03 * Math.sin(t * 1.7);
        set(I.cat, CAT_AT.x, CAT_AT.y + (s ? 0.05 : 0), CAT_AT.z, s ? CELLS.catStretch : CELLS.cat, (s ? SIZES.catStretch : SIZES.cat) * (s ? 1 : breathe), 0);
        // the dog's tail: a lazy wag now and then, quick and steady when she is near
        const close = near2(catPos, DOG_AT.x, DOG_AT.z, 4.2);
        wagBurst = close ? 1 : (Math.sin(t * 0.37) * Math.sin(t * 1.1 + 2) > 0.55 ? 0.5 : 0);
        const wag = wagBurst > 0 && Math.floor(t * (wagBurst > 0.8 ? 7 : 3.5)) % 2;
        cell[I.dog] = wag ? CELLS.dogWag : CELLS.dog;
        if (!lite) {
          sparrows(t, catPos, dt);
          butterflies(t, dusk ? 1 : part);
          arriving(dt);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aCell.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aFlip.needsUpdate = true;
    },
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
