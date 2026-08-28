import * as THREE from 'three';
import { litMaterial, repeatFor, surfaceProps } from '../render/materials.js';

const mat = (color) => litMaterial(color);
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));

// ---------------------------------------------------------------------------
// Surfaces (v20 surface-foundation wave).
//
// `mat`/`box` above are unchanged and still the default for every prop: the
// art direction is flat and matte, and a prop that reads fine flat stays
// flat. These two are the opt-in, used by the props the wave has actually
// been through — today that is the Docks' own builders plus the two shared
// ones (ground, platform) that take a surface only when a caller asks.
//
// The repeat is always DERIVED from the face's real size via repeatFor(),
// never typed: repeatFor speaks the 16-preset vocabulary of materials.js
// (NOT the 7 texture names of textures.js — see the two-namespaces note in
// both headers) and returns null for a preset that carries no map, which
// litMaterial reads as "take the surface's own default density".
//
// A BoxGeometry maps 0..1 per FACE, so one repeat serves all six: pass the
// dimensions of the face that matters (a wall's w x h) and accept that the
// end faces tile at a slightly different density. On the side faces v runs
// up +y, which is what puts brick courses and siding laps horizontal and
// plank grain vertical without any per-face bookkeeping.
const surfMat = (color, surface, w, h) =>
  litMaterial(color, { surface, repeat: repeatFor(surface, w, h) });
// `fw`/`fh` default to the box's own width/height — override them when the
// face that should drive the tiling is not the front one.
const surfBox = (w, h, d, color, surface, fw = w, fh = h) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), surfMat(color, surface, fw, fh));

// A preset's light response with its MAP DELIBERATELY LEFT OFF. Reads the
// roughness/metalness straight off materials.js's table rather than typing the
// numbers, so it can never drift from the preset it names.
//
// This exists because of two shapes that a tiling map makes WORSE, both found
// by the Docks pilot and both binding on this pass:
//
//   THE THIN-MEMBER RULE. repeatFor() rounds to a minimum of one whole tile,
//   so any face narrower than one tile gets the entire tile squashed into it.
//   The plank tile is four boards across 1.0m; on a 0.1m fence post that is
//   four 2.5cm stripes, which reads as corduroy, not as timber. The pilot hit
//   the same thing on the warehouse parapet lips and left them flat. Anything
//   under roughly a third of a tile in its narrow dimension comes here instead.
//
//   THE CYLINDER RULE. A planar tiling map on a 6-to-12-sided cylinder or a
//   faceted solid (trunks, barrels, posts, drums, plant pots, boulders) smears
//   at the silhouette and looks worse than no map at all — which is why the
//   'bark' and 'foliage' presets ship map-less in the first place. Roughness-
//   only is still entirely welcome on those shapes, and that is what this is.
//
// Note it takes the FAST path through litMaterial (no `surface` key), so it
// never touches the texture cache at all.
const surfNoMap = (color, surface) => litMaterial(color, surfaceProps(surface));

// ---------------------------------------------------------------------------
// WIND (v20). Foliage builders take an optional `wind` — the per-walk sway
// registry walk.js creates and threads into every area build — and register
// THEMSELVES with it as they are planted, so an area gets sway from the same
// line that plants the tree rather than from a second bookkeeping list that
// can fall out of step with the first.
//
// It is opt-in and defaults to nothing: `tree(x, z, 1.2)` is exactly the tree
// it has always been, which is what keeps every world file and every world
// test working while the four remaining areas land one at a time.
//
// THE SIZE-HINT DIRECTION, which was left open by render/wind.js and is
// settled here. wind.js derives BOTH amplitude and frequency from `sizeHint`
// on one physical reading — inertia — so a smaller prop comes out swaying
// faster AND FURTHER, like a thin branch against a thick trunk. The original
// brief asked for the opposite on amplitude: "a bush jitters faster and less".
//
// The brief wins, and it wins on observation rather than on authority. Stand
// in real wind and the hedge barely stirs while the tree crowns swing: a
// canopy is a large sail carried at 3-4m, up out of the ground boundary layer
// and on top of a springy trunk, whereas a bush is a dense low mass of stems
// sitting in the slowest air there is. It also happens to be the reading this
// game needs, because sway is an ANGLE and the arc it sweeps is proportional
// to the prop's height: 1.5° on a 4m tree is a canopy moving ~10cm and reads
// as weather, while the same 1.5° on a 0.7m bush is 2cm and reads as nothing.
// Give the small prop MORE angle and it becomes the twitchiest thing on
// screen while the trees stand still — exactly backwards.
//
// So the builders keep wind.js's frequency falloff (bigger really is slower)
// and OVERRIDE the amplitude half through wind.add's own `amplitude` escape
// hatch, using the two constants below. Every registration passes an EXPLICIT
// sizeHint as well, so what a prop does is a decision written down here rather
// than a consequence of whatever `scale` a call site happened to pass.
//
// Both are radians, and both sit at or under wind.js's UNIT_AMPLITUDE band —
// over-swaying flat-shaded low-poly foliage reads as jelly, not as weather.
// A scale-1 tree is deliberately set to UNIT_AMPLITUDE exactly, so the
// vocabulary's "ordinary prop" and this file's "ordinary tree" are the same
// 1.5°, and the two constants below are read as steps away from it.
export const SWAY_TREE = 0.026; // ~1.5° at scale 1; see swayFor() for the growth
export const SWAY_BUSH = 0.014; // ~0.8°: a bush stirs, it does not wave
export const SWAY_FLOWERS = 0.020; // ~1.1°: light, on thin stems, quickest of the three

// A tree's lean grows with the SQUARE ROOT of its scale, not linearly. Two
// reasons, and they agree:
//   * the arc a canopy sweeps is already proportional to its height, so a
//     linear angle on top of that compounds twice and a big oak ends up
//     wobbling like a sapling in a gale;
//   * the worst case this system can reach is not the resting pose — main.js
//     drives `intensity` to 1.7 in rain and wind.js's gust envelope peaks at
//     1.4x on top of that, so every number here is multiplied by ~2.4 before
//     a player ever sees the extreme. sqrt keeps the biggest tree in the game
//     under ~4.5° even at that peak, which is still "a few degrees".
// sqrt is also the same falloff shape wind.js's own amplitude derivation uses,
// so the two are at least speaking the same language while disagreeing about
// which way it points.
const swayFor = (scale) => SWAY_TREE * Math.sqrt(Math.max(0.01, scale));

// The size hints. A bush and a flower patch have no `scale` parameter and are
// visually small and light no matter how big they are drawn, so they are
// pinned low (wind.js clamps to MIN_SCALE 0.4) and come out quick: sizeHint
// 0.55 puts a bush on a ~2.0s cycle against a scale-1 tree's ~3.6s.
const BUSH_SIZE_HINT = 0.55;
const FLOWER_SIZE_HINT = 0.4;

// Per-channel multiply, clamped. The one use is colour compensation against a
// texture's mean luminance (render/textures.js's header carries the table);
// `factor` is 1/mean, so the textured prop lands back on its authored colour.
function lift(hex, factor) {
  const ch = (shift) => Math.min(255, Math.round(((hex >> shift) & 0xff) * factor));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function applySky(scene, top, horizon) {
  scene.background = new THREE.Color(top);
  scene.fog = new THREE.Fog(horizon, 40, 130);
}

// `surface` is opt-in and defaults to nothing at all, so every area that does
// not ask keeps the flat colour plane it ships with. The repeat comes from the
// ground's own size, which is the only sane density for a plane this big — a
// hand-picked number here is a plaid at 40m.
// Colour compensation lives HERE and not in the world files, so the authored
// hexes in park.js/neighborhood.js stay the colours a human picked. Grass is
// one of the two tiles worth compensating (mean 0.955 — see the luminance
// table in render/textures.js's header): a lawn is the largest single surface
// in the game and 4.5% off is a visible drop in the one colour the area is
// named for. Every other surface a ground plane takes is left alone — the
// Docks' cobbles are DELIBERATELY uncompensated (its own comment says so:
// four percent darker is the right direction for an overcast harbour), and
// sand is at 0.998 by design.
export function ground(size, color, { surface } = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    surface
      ? surfMat(surface === 'grass' ? lift(color, 1 / 0.955) : color, surface, size, size)
      : mat(color),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

// `surface` is opt-in for the same reason ground()'s and platform()'s are: a
// park's winding path is gravel ('sand' is the fine-speckle tile and is what a
// gravel walk actually looks like), a neighbourhood's is packed earth, and the
// Docks' four paths are deliberately flat because they run over cobbles that
// are already tiled — see the docks.js surface note. None of those three
// should have to change for either of the others, so nobody is defaulted into
// a surface here.
export function path(x1, z1, x2, z2, w = 2, { surface } = {}) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len),
    surface ? surfMat(0xcbb8a0, surface, w, len) : mat(0xcbb8a0),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  return m;
}

// `bodySurface` is 'siding' or 'brick', exactly as warehouse() takes it, and
// for the same reason: which one a house wants is a colour decision the caller
// has already made. The default is 'siding', because every house shipped today
// is a pale painted body (0xe8d8b0, 0xd8c8a8) and painted lap boards are what
// that colour has always been drawing.
export function house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a, bodySurface = 'siding') {
  const g = new THREE.Group();
  // Same compensation warehouse() applies, for the same reason: the brick
  // tile's mean is 0.948, so a textured wall lands ~5% under the hex the
  // caller typed. Siding's 0.988 is inside the noise and is left alone.
  const body = surfBox(5, 3, 4, bodySurface === 'brick' ? lift(bodyColor, 1 / 0.948) : bodyColor,
    bodySurface);
  body.position.y = 1.5;
  g.add(body);
  // Roof tabs. The 4-sided cone is the one place on this pass where the
  // cylinder rule is deliberately NOT applied, and it needs its reasoning
  // written down because it looks like a contradiction.
  //
  // A trunk smears because a tiling map fights a silhouette curving away from
  // the camera. A pyramid roof does not: three's cone UVs are parametric
  // (u around the plan, v up the slope), so each of the four pitches is a flat
  // triangle carrying a properly laid-out tile, seen face-on.
  //
  // What it DOES have is taper. u spans the whole 22m eaves perimeter at the
  // bottom and nothing at all at the apex, so one repeat cannot be right
  // everywhere: the tile density doubles by mid-height and keeps going. So the
  // repeat is derived from the MID-HEIGHT perimeter (~11m) rather than the
  // eaves — right where the pitch reads largest, a little coarse at the gutter,
  // and fine enough near the peak that mipmapping resolves it to flat colour,
  // which is the correct answer up there anyway. If a reviewer decides the
  // taper is not worth it, this is one line: drop back to mat(roofColor).
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4),
    surfMat(roofColor, 'shingle', 11, 4.4));
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // A plank door, at last literally: the plank tile is four boards across its
  // 1.0m, so a 0.9m leaf reads as four ~22cm boards running the right way up.
  const door = surfBox(0.9, 1.8, 0.1, 0x7a5230, 'wood');
  door.position.set(0, 0.9, 2.01);
  g.add(door);
  for (const wx of [-1.6, 1.6]) {
    // 'glass', matching warehouse() — a pane is the one thing on a house
    // elevation that should catch a highlight, and the dusk pass replaces the
    // material outright, so the preset and the glow never fight.
    const win = surfBox(0.9, 0.9, 0.1, 0xa8d8e8, 'glass');
    win.userData.window = true;
    win.position.set(wx, 1.8, 2.01);
    g.add(win);
  }
  g.position.set(x, 0, z);
  return g;
}

// `opts.wind` is the per-walk sway registry (see the WIND block at the top of
// this file). Passing it plants the tree AND registers it in one line; leaving
// it out is the tree this function has always returned.
//
// The whole Group is registered, so trunk and canopy lean together as one
// rigid body — which is the entire point of wind.js's rotation-only design:
// `g.position.x/z` never moves, so the collider and the perch this tree may
// carry stay exactly where the area declared them.
export function tree(x, z, scale = 1, { wind } = {}) {
  const g = new THREE.Group();
  // 'bark' is the roughest thing in the game (0.98) and ships MAP-LESS on
  // purpose — a 6-sided trunk is the cylinder rule's worked example. What
  // sells the trunk is the roughness step against the canopy above it.
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6),
    surfMat(0x7a5230, 'bark'));
  trunk.position.y = 1;
  g.add(trunk);
  // 'foliage' at 0.8 — a leaf has a waxy cuticle and a canopy in sun carries a
  // sheen band that bark simply does not. Also map-less: a single icosahedron
  // facet is far bigger than any tile, so a map here would be one stretched
  // smear per face.
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0),
    surfMat(0x4e9440, 'foliage'));
  leaves.position.y = 2.8;
  g.add(leaves);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  // Registered AFTER position/scale are set: wind.add derives this tree's
  // phase from its (x, z), so a tree registered at the origin would sway in
  // lockstep with every other tree in the area.
  //
  // sizeHint carries the frequency (a big oak is slower than a sapling, which
  // is wind.js's own falloff and is right), amplitude is overridden to grow
  // WITH the tree rather than against it — see the WIND block's note on why
  // the brief beat the inertia model here.
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// A bush. Returns the same bare Mesh it always has — UNLESS `opts.wind` is
// passed, in which case it comes back as a Group with that mesh inside it.
//
// That is not decoration, it is the pivot. wind.js rotates a registered object
// around its OWN origin, and this mesh's origin is its belly at y 0.5, so
// registering it directly would hinge the bush about its middle and slide its
// base sideways. wind.js offers `pivotY` for exactly this — but pivotY works
// by reparenting under a pivot Group, and at the moment a builder registers,
// the prop has no parent yet (the caller has not called scene.add). So the
// builder makes the hinge itself: a Group at (x, 0, z) — ground contact, the
// same origin every compound prop here already has — with the mesh at local
// y 0.5, so the bush is in exactly the same place either way and no geometry,
// collider or hide-spot record moves a millimetre.
export function bush(x, z, { wind } = {}) {
  // 'foliage', same as a tree canopy and map-less for the same reason.
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), surfMat(0x5aa04e, 'foliage'));
  if (!wind) {
    m.position.set(x, 0.5, z);
    return m;
  }
  const g = new THREE.Group();
  m.position.set(0, 0.5, 0);
  g.add(m);
  g.position.set(x, 0, z);
  // Explicit on both counts, because a bush has no `scale` to infer from: the
  // low sizeHint makes it QUICK (a ~2.0s cycle against a tree's ~3.6s) and the
  // small amplitude makes it stir rather than wave.
  wind.add(g, { sizeHint: BUSH_SIZE_HINT, amplitude: SWAY_BUSH });
  return g;
}

// A picket fence run. Left FLAT, and deliberately, though wind.js's docstring
// lists fenceRun as a candidate: a fence is posts driven into the ground and it
// does not sway, and the members are 0.06-0.1m — squarely inside the
// thin-member rule, so they take the 'wood' light response (0.75, the paint-
// and-sawn-timber step down from the 0.9 default) with the plank tile left off
// rather than four 2.5cm stripes down every post.
export function fenceRun(x1, z1, x2, z2) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / 0.8);
  const timber = () => surfNoMap(0xc8b088, 'wood');
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), timber());
    p.position.set(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t);
    g.add(p);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, len), timber());
  rail.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
  rail.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  g.add(rail);
  return g;
}

export function mailbox(x, z) {
  const g = new THREE.Group();
  // 0.08 post: thin-member rule, so wood's roughness without its tile.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), surfNoMap(0x7a5230, 'wood'));
  post.position.y = 0.5;
  g.add(post);
  // The box itself is a painted pressed-steel drum — 'paintedMetal' keeps
  // metalness at 0 so the blue survives (see fireEscape's bareMetal note), and
  // the preset carries no map, so its size is not a problem.
  const boxTop = surfBox(0.3, 0.25, 0.5, 0x4a6ea5, 'paintedMetal');
  boxTop.position.y = 1.1;
  g.add(boxTop);
  g.position.set(x, 0, z);
  return g;
}

export function car(x, z, color = 0xd06048, rotY = 0) {
  const g = new THREE.Group();
  // The preset the table was written for: automotive paint is a clearcoat over
  // pigment, the metal is UNDER the paint, and metalness 0 is what keeps a red
  // car red instead of tinting its highlight and killing the diffuse term.
  const body = surfBox(1.8, 0.6, 4, color, 'paintedMetal');
  body.position.y = 0.6;
  g.add(body);
  const cabin = surfBox(1.6, 0.55, 2, 0xa8d8e8, 'glass');
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    // Tyres stay explicitly 'matte'. Rubber loaded with carbon black is about
    // the least specular thing in the world, and it is the one material in the
    // game that has a reason to be flatter than the paint beside it.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8),
      surfMat(0x2a2a30, 'matte'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    g.add(wheel);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function bench(x, z, rotY = 0) {
  const g = new THREE.Group();
  // Sawn softwood slats. The seat is 1.6 x 0.5, so [2, 1] of the plank tile —
  // eight ~20cm boards, which is a park bench. On the seat's TOP face the
  // boards run across the bench rather than along it (a box maps 0..1 per face
  // and the plank tile always divides along u); at 8cm thick, seen from cat
  // height, that is a fair trade for having timber read as timber at all.
  const seat = surfBox(1.6, 0.08, 0.5, 0x9a7048, 'wood', 1.6, 0.5);
  seat.position.y = 0.5;
  g.add(seat);
  const back = surfBox(1.6, 0.5, 0.08, 0x9a7048, 'wood');
  back.position.set(0, 0.85, -0.25);
  g.add(back);
  for (const lx of [-0.7, 0.7]) {
    // 0.08 legs — thin-member rule.
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.4), surfNoMap(0x5a4028, 'wood'));
    leg.position.set(lx, 0.25, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function lampPost(x, z) {
  const g = new THREE.Group();
  // Painted cast column. 'paintedMetal' is map-less, so the cylinder rule does
  // not bite, and it stays painted rather than bare for the reason recorded on
  // fireEscape: at metalness 0.85 a dark 6-sided pole against this dim baked
  // probe goes to a near-black pin with a chrome rim.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6),
    surfMat(0x3a3a42, 'paintedMetal'));
  pole.position.y = 1.6;
  g.add(pole);
  // The globe keeps its plain emissive material and takes no preset. It is a
  // LIGHT: 'glass' at roughness 0.08 would resolve this dim probe into a hard
  // bright blob sitting on top of the emissive glow, which reads as an
  // artefact rather than as a lamp.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
    litMaterial(0xfff2c0, { emissive: 0x8a7a40 }));
  lamp.position.y = 3.3;
  g.add(lamp);
  g.position.set(x, 0, z);
  return g;
}

// A rain puddle. THE one prop on this pass that every area gets whether it
// authored it or not: game/walk.js drops three more of these on any rainy walk
// from a single shared call, so the surface decision belongs here rather than
// in five world files.
//
// 'water' is materials.js's own named answer for this shape — its docstring
// says "ponds, the harbour, puddles" in as many words. Roughness 0.12 with no
// map: a puddle IS a smooth dielectric film, and the small roughness stands in
// for the fine chop this flat disc has no geometry for. It stays a 12-segment
// CircleGeometry and must NOT become a createWater instance — that rig carries
// an animated normal map, a depth ramp and a foam band, all of which are for a
// body of water with a shoreline, and none of which a 0.8m disc can afford or
// wants.
export function puddle(x, z, r = 0.8) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), surfMat(0x8ab8d8, 'water'));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  return m;
}

// A boulder. Takes 'cobble's light response (0.8 — stone, a touch smoother
// than the default because weather polishes it) with its map left off: a
// dodecahedron's UVs are a polyhedral unwrap, so a 4x4 grid of setts laid over
// it reads as a net thrown over a rock rather than as the rock's own surface.
// Cylinder rule, applied to a faceted solid.
export function rock(x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), surfNoMap(0x9a9aa2, 'cobble'));
  m.position.set(x, 0.3, z);
  return m;
}

// Flowers. Takes `opts.wind` like tree() and bush() — the Group's origin is
// already ground contact, so it hinges at the soil for free with no pivot.
//
// The blooms and stems stay FLAT: nothing here is over 8cm, and the whole
// patch is smaller than one tile of any surface in the vocabulary. The stems
// take 'foliage' rather than a map for the same reason a canopy does.
export function flowerPatch(x, z, { wind } = {}) {
  const g = new THREE.Group();
  const colors = [0xf2a0c0, 0xf2e04e, 0xffffff, 0xe07040];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 5), mat(colors[i % 4]));
    f.position.set((Math.sin(i * 2.4) * 0.5), 0.25, (Math.cos(i * 1.7) * 0.5));
    g.add(f);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.25, 0.03),
      surfMat(0x4e9440, 'foliage'));
    stem.position.set(f.position.x, 0.12, f.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  // The quickest and one of the lightest things in the area: thin stems in the
  // slowest air there is, so a pinned-low sizeHint and a small amplitude.
  if (wind) wind.add(g, { sizeHint: FLOWER_SIZE_HINT, amplitude: SWAY_FLOWERS });
  return g;
}

export function billboard(x, z, rotY = 0, title = 'THE DAD SHOW', subtitle = 'now streaming · very good episodes') {
  const g = new THREE.Group();
  for (const px of [-1.7, 1.7]) {
    // 0.18 posts: thin-member rule, wood's response without the tile.
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18),
      surfNoMap(0x7a5230, 'wood'));
    post.position.set(px, 1.6, 0);
    g.add(post);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6ecd8';
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = '#b05a4a';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 268);
  ctx.fillStyle = '#2a3550';
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px Avenir, Trebuchet MS, sans-serif';
  ctx.fillText(title, 256, 140);
  ctx.font = '28px Avenir, Trebuchet MS, sans-serif';
  ctx.fillStyle = '#b05a4a';
  ctx.fillText(subtitle, 256, 200);
  ctx.font = '34px sans-serif';
  ctx.fillText('📺  🐈  👨', 256, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 2.5),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  panel.position.y = 2.9;
  g.add(panel);
  // The hoarding behind the panel is a board-by-board timber back, 4.5 x 2.6 —
  // [5, 3] of the plank tile, i.e. twenty ~22cm boards. The PANEL itself keeps
  // its MeshBasicMaterial: it is an unlit painted sign, deliberately outside
  // the lighting model so the poster stays legible at dusk.
  const back = surfBox(4.5, 2.6, 0.08, 0x8a7048, 'wood');
  back.position.set(0, 2.9, -0.06);
  g.add(back);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// `surface` is opt-in, exactly like path()'s and for the same reason. The
// obvious candidate is 'cobble' — the sett grid is the closest thing in the
// vocabulary to paving slabs, and at a derived repeat it lays roughly 0.3m
// stones down the strip. It is NOT defaulted on, because the Docks' two
// sidewalks were deliberately left flat by the pilot (they run over a ground
// plane that is already carrying the same cobble tile, and two grids at
// different densities on top of each other is the one way to make a tiled
// surface look like a mistake).
export function sidewalk(x1, z1, x2, z2, w = 1.2, { surface } = {}) {
  // a lighter strip beside a street — reuses path() geometry with pavement color
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len),
    surface ? surfMat(0xd8d0c0, surface, w, len) : mat(0xd8d0c0),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  m.position.set((x1 + x2) / 2, 0.008, (z1 + z2) / 2);
  return m;
}

// Fallen leaves. LEFT FLAT: five 9cm discs lying on the floor, every one of
// them an order of magnitude smaller than any tile in the vocabulary, and
// 'foliage' at 0.8 would put a sheen on dead leaves, which is the one thing
// dead leaves do not have.
export function leafLitter(x, z, seed = 1) {
  const g = new THREE.Group();
  const colors = [0xc8823a, 0xb05a2a, 0xd8a04e];
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), mat(colors[(seed + i) % 3]));
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.set(x + Math.sin(seed * 3 + i * 2.1) * 0.8, 0.015, z + Math.cos(seed * 2 + i * 1.7) * 0.8);
    g.add(leaf);
  }
  return g;
}

export function bike(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const wz of [-0.45, 0.45]) {
    // Tyre, so 'matte' on purpose — same call as the car's wheels.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 10),
      surfMat(0x3a3a42, 'matte'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.28, wz);
    g.add(wheel);
  }
  // Enamelled frame tubes. 'paintedMetal' carries no map, so 6cm members are
  // no problem for it — the whole thin-member rule is about tiles, and this
  // preset is pure light response.
  const frame = surfBox(0.06, 0.06, 0.9, 0xd06048, 'paintedMetal');
  frame.position.y = 0.45; frame.rotation.x = 0.2;
  g.add(frame);
  const bars = surfBox(0.4, 0.06, 0.06, 0x3a3a42, 'paintedMetal');
  bars.position.set(0, 0.62, -0.45);
  g.add(bars);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A flat-topped box the cat can stand on — crate stacks, porch/shed roofs,
// dune ledges. Spans y `yBottom`..`yTop` so several calls at the same x/z
// with increasing yBottom stack into a tiered climbing platform.
// `surface` is opt-in for the same reason ground()'s is: the Docks' crates are
// dock timber, the neighborhood's and the seaside's are whatever they already
// were, and neither should have to change for the other. Pass `undefined` for
// `color` to keep the default while still reaching the options object.
export function platform(x, z, yTop, yBottom = 0, size = 1.2, color = 0xc8a678, { surface } = {}) {
  const h = yTop - yBottom;
  const m = surface ? surfBox(size, h, size, color, surface) : box(size, h, size, color);
  m.position.set(x, yBottom + h / 2, z);
  return m;
}

// ---------------------------------------------------------------------------
// Dockside props (v18 Task 2.6, "The Old Docks").
//
// Every one of these is written so its WALKABLE TOP SURFACE is a number the
// caller passes in or can read straight off the signature, because the Docks'
// perch chains are authored against those exact heights. If you change a
// height here, docks.js's perch array (and the hop math in its comments) has
// to move with it — test/climbing.test.js BFSes the real shipped arrays and
// will fail loudly if the two drift apart.
// ---------------------------------------------------------------------------

// A flat-roofed brick warehouse. Unlike house(), whose cone roof has nowhere
// to stand, the roof here is a flat deck at exactly `h` ringed by a parapet
// whose top is `h + PARAPET`. Those are the two numbers the roof chains use:
// docks.js perches sit on the parapet lip, not on the deck.
export const PARAPET = 0.3;

// `bodySurface` is 'brick' or 'siding' — fired masonry or painted lap boards.
// Both are warehouse walls; which one a building wants is a colour decision
// the caller has already made (docks.js's warm bodies are brick, its two cool
// grey-blue ones are painted siding), so it is passed rather than guessed.
export function warehouse(x, z, w, d, h, bodyColor = 0x8a7c74, roofColor = 0x4a4650, bodySurface = 'brick') {
  const g = new THREE.Group();
  // Colour compensation, per the luminance table in render/textures.js's
  // header: a map multiplies the base colour and the brick tile's mean is
  // 0.948, so a textured wall lands ~5% darker than the hex it ships with.
  // Lifting the brick bodies by 1/0.948 puts them back on their authored
  // colour. Siding's mean is 0.988 — inside the noise, left alone.
  const body = surfBox(w, h, d, bodySurface === 'brick' ? lift(bodyColor, 1 / 0.948) : bodyColor, bodySurface);
  body.position.y = h / 2;
  g.add(body);
  // flat roof deck, then a parapet lip on all four sides. The deck is the only
  // part that carries the shingle map: the lips are 0.3 tall and a tile
  // squashed into them would read as a stripe rather than as a roof.
  const deck = surfBox(w, 0.12, d, roofColor, 'shingle', w, d);
  deck.position.y = h + 0.06;
  g.add(deck);
  for (const [lw, ld, lx, lz] of [
    [w, 0.16, 0, d / 2 - 0.08], [w, 0.16, 0, -d / 2 + 0.08],
    [0.16, d, w / 2 - 0.08, 0], [0.16, d, -w / 2 + 0.08, 0],
  ]) {
    const lip = box(lw, PARAPET, ld, roofColor);
    lip.position.set(lx, h + PARAPET / 2, lz);
    g.add(lip);
  }
  // Two rows of windows on the long (x) faces. userData.window is what
  // walk.js's dusk pass looks for when it swaps in the warm emissive glow —
  // the same hook house() uses, so the Docks lights up at dusk for free.
  // 'glass' is the only sub-0.3-roughness preset used anywhere in this file,
  // and a pane is what it is for: small, vertical, and the one thing on a
  // warehouse elevation that should catch a highlight. The dusk pass replaces
  // the material outright, so the two never fight.
  const cols = Math.max(2, Math.floor(w / 2.6));
  for (const face of [1, -1]) {
    for (let i = 0; i < cols; i++) {
      for (const wy of h > 3.4 ? [1.1, 2.7] : [1.1]) {
        const win = surfBox(0.8, 0.7, 0.08, 0xa8d8e8, 'glass');
        win.userData.window = true;
        win.position.set(-w / 2 + (i + 0.5) * (w / cols), wy, face * (d / 2 + 0.02));
        g.add(win);
      }
    }
  }
  // a narrower column of windows on the short (x) faces, so no elevation of
  // the building reads as a blank slab
  for (const face of [1, -1]) {
    for (const wy of h > 3.4 ? [1.1, 2.7] : [1.1]) {
      const win = surfBox(0.08, 0.7, 0.8, 0xa8d8e8, 'glass');
      win.userData.window = true;
      win.position.set(face * (w / 2 + 0.02), wy, 0);
      g.add(win);
    }
  }
  const door = surfBox(1.6, 2.2, 0.12, 0x53433a, 'wood');
  door.position.set(0, 1.1, d / 2 + 0.03);
  g.add(door);
  const lintel = box(2.0, 0.16, 0.2, 0x5e5450);
  lintel.position.set(0, 2.3, d / 2 + 0.05);
  g.add(lintel);
  g.position.set(x, 0, z);
  return g;
}

// A rooftop water tank / vent housing — the thing that turns a flat roof into
// one more step of a chain. `yBottom` is the roof deck it stands on; the
// walkable top is `yBottom + height`.
export function roofTank(x, z, yBottom, height = 0.9, r = 0.85) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 10), mat(0x6a5a4a));
  drum.position.y = yBottom + height / 2;
  g.add(drum);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.08, 10), mat(0x8a7a62));
  cap.position.y = yBottom + height;
  g.add(cap);
  g.position.set(x, 0, z);
  return g;
}

// A steel shipping container. Long axis runs along local +x, so rotY turns it
// broadside. Walkable top is exactly CONTAINER_H.
export const CONTAINER_H = 2.6;

export function shippingContainer(x, z, rotY = 0, color = 0xb05a4a) {
  const g = new THREE.Group();
  // 'paintedMetal', not 'bareMetal': a container is a painted box, the metal
  // is under the paint, and metalness > 0 would tint the highlight with the
  // body colour and take the red and the blue out of the yard. No map — the
  // corrugation is already geometry, and a tile on top of it is two rhythms.
  const body = surfBox(6, CONTAINER_H, 2.5, color, 'paintedMetal');
  body.position.y = CONTAINER_H / 2;
  g.add(body);
  for (let i = 0; i < 7; i++) { // corrugated ribs
    const ribColor = color === 0xb05a4a ? 0x9a4a3a : 0x3a5a78;
    const rib = surfBox(0.1, CONTAINER_H - 0.3, 2.56, ribColor, 'paintedMetal');
    rib.position.set(-2.6 + i * 0.87, CONTAINER_H / 2, 0);
    g.add(rib);
  }
  const lid = surfBox(6.05, 0.1, 2.55, 0x6a6a72, 'paintedMetal');
  lid.position.y = CONTAINER_H;
  g.add(lid);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A night-market stall: counter, four posts, striped awning. The awning top
// is STALL_AWNING and is the first step of the Docks' crane chain.
export const STALL_AWNING = 1.3;

export function marketStall(x, z, rotY = 0, awningColor = 0xc85a5a) {
  const g = new THREE.Group();
  const counter = surfBox(1.9, 0.75, 1.0, 0x9a7048, 'wood');
  counter.position.y = 0.375;
  g.add(counter);
  for (const [px, pz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) {
    const post = box(0.08, STALL_AWNING, 0.08, 0x6a5230);
    post.position.set(px, STALL_AWNING / 2, pz);
    g.add(post);
  }
  // The awning stays FLAT, and 'matte' says so out loud rather than leaving a
  // reviewer to wonder whether it was missed: it is canvas, there is no cloth
  // tile in the vocabulary, and the nearest ones (siding, plank) would make a
  // striped awning read as a striped plank. The stripes are already geometry.
  const awning = surfBox(2.2, 0.1, 1.3, awningColor, 'matte');
  awning.position.y = STALL_AWNING;
  g.add(awning);
  for (let i = 0; i < 3; i++) { // stripes, so two stalls side by side read apart
    const stripe = box(0.35, 0.12, 1.32, 0xf0e8d8);
    stripe.position.set(-0.7 + i * 0.7, STALL_AWNING, 0);
    g.add(stripe);
  }
  // a crate of fish on the counter, purely so the stall reads as a fish market
  const crate = box(0.5, 0.3, 0.4, 0xc8a678);
  crate.position.set(0.4, 0.9, 0);
  g.add(crate);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A wall-hung fire escape: one grated landing per entry in `heights` (each
// value is the landing's WALKABLE TOP), joined by ladders. The landings are
// the perch steps; the ladders are decoration, since climbing in this game is
// perch-to-perch and not a continuous surface.
//
// `depth` is how far the assembly reaches BACKWARDS (local +z) toward the
// wall it hangs on. The group's origin sits 0.55 in from the landing's front
// edge — that origin is the perch point — so the caller places the origin
// where the cat should stand and sizes `depth` to meet the wall behind it.
// Without that the landings float in open air, which is exactly how the first
// draft of this looked in the browser.
//
// 'paintedMetal', and NOT 'bareMetal' — which is what this was built with
// first, and the swap is recorded because the reasoning applies to every dark
// metal prop in the game. bareMetal is metalness 0.85, i.e. ~85% of the
// diffuse term is thrown away and the prop shows mostly the environment; the
// environment here is a baked RoomEnvironment at envIntensity 0.32-0.45, which
// is dim. Against this assembly's authored greys (0x3e3e46, 0x4a4a52) that
// flattened the whole fire escape to one near-black shape at the range a cat
// actually climbs it — the landings, the stiles and the wall plate stopped
// being separable at all, which is a real change to how a load-bearing perch
// chain reads rather than a material nicety. paintedMetal keeps metalness at 0
// so the greys survive and each member keeps its own value, and its roughness
// 0.35 still tells the steelwork apart from the matte brick behind it.
// bareMetal wants a LIGHT colour and a bright probe; this game has neither.
export function fireEscape(x, z, rotY = 0, heights = [1.9, 3.9], depth = 2.2) {
  const g = new THREE.Group();
  const steel = (w, h, d, color) => surfBox(w, h, d, color, 'paintedMetal');
  const back = depth - 0.55; // local z of the wall face
  let prev = 0;
  for (const h of heights) {
    const landing = steel(1.7, 0.1, depth, 0x4a4a52);
    landing.position.set(0, h - 0.05, depth / 2 - 0.55);
    g.add(landing);
    for (const rx of [-0.85, 0.85]) { // side handrails
      const rail = steel(0.06, 0.55, depth, 0x5a5a62);
      rail.position.set(rx, h + 0.25, depth / 2 - 0.55);
      g.add(rail);
      const top = steel(0.1, 0.08, depth, 0x6a6a72);
      top.position.set(rx, h + 0.55, depth / 2 - 0.55);
      g.add(top);
    }
    const front = steel(1.7, 0.55, 0.06, 0x5a5a62); // front rail
    front.position.set(0, h + 0.25, -0.55);
    g.add(front);
    // ladder up from the previous landing, on the front edge, with rungs
    for (const lx of [-0.28, 0.28]) {
      const stile = steel(0.06, h - prev, 0.06, 0x6a6a72);
      stile.position.set(lx, prev + (h - prev) / 2, -0.52);
      g.add(stile);
    }
    const rungs = Math.max(2, Math.round((h - prev) / 0.32));
    for (let i = 1; i < rungs; i++) {
      const rung = steel(0.56, 0.045, 0.045, 0x6a6a72);
      rung.position.set(0, prev + (i / rungs) * (h - prev), -0.52);
      g.add(rung);
    }
    prev = h;
  }
  // the bracket plate bolted flat to the wall, so the whole thing reads as
  // hung off the building rather than standing in front of it
  const plate = steel(1.9, heights[heights.length - 1] + 0.4, 0.1, 0x3e3e46);
  plate.position.set(0, (heights[heights.length - 1] + 0.4) / 2, back);
  g.add(plate);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A dockside gantry crane. Four legs carry a deck whose top is CRANE_DECK;
// the operator cab stands on the deck and its roof is CRANE_CAB. Those are
// the two tall steps of the Docks' south-bank chain.
export const CRANE_DECK = 4.0;
export const CRANE_CAB = 5.4;

// The crane is the area's one big piece of MACHINERY: yard-painted steel, so
// 'paintedMetal' throughout — the paint is what you see, which is why that
// preset keeps metalness at 0 and the crane stays the colour it ships. The
// cable and hook are painted rather than bare for the reason recorded on
// fireEscape above: against this dim baked probe, bareMetal's 0.85 metalness
// takes a dark prop to near-black rather than to steel.
export function dockCrane(x, z, rotY = 0) {
  const g = new THREE.Group();
  const painted = (w, h, d, color) => surfBox(w, h, d, color, 'paintedMetal');
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    const leg = painted(0.34, CRANE_DECK, 0.34, 0xb0742a);
    leg.position.set(lx, CRANE_DECK / 2, lz);
    g.add(leg);
    const brace = painted(0.18, 0.18, 4.4, 0x8a5a20);
    brace.position.set(lx, CRANE_DECK * 0.55, 0);
    g.add(brace);
  }
  const deck = painted(5.4, 0.25, 5.4, 0x8a5a20);
  deck.position.y = CRANE_DECK - 0.125;
  g.add(deck);
  // The operator cab stands on the deck at local (-1, -1) and its roof top is
  // CRANE_CAB. docks.js's crane chain places its last perch on that roof, so
  // the offset is part of the contract, not a styling choice.
  const cab = painted(2.0, CRANE_CAB - CRANE_DECK, 2.0, 0xc8862a);
  cab.position.set(-1.0, (CRANE_DECK + CRANE_CAB) / 2, -1.0);
  g.add(cab);
  const cabRoof = painted(2.2, 0.12, 2.2, 0x8a5a20);
  cabRoof.position.set(-1.0, CRANE_CAB, -1.0);
  g.add(cabRoof);
  // jib reaching out over the water on the cab's far side, with a hook block
  const jib = painted(0.3, 0.3, 7, 0xb0742a);
  jib.position.set(1.4, CRANE_DECK + 0.9, 3.2);
  g.add(jib);
  const cable = painted(0.05, 2.4, 0.05, 0x3a3a42);
  cable.position.set(1.4, CRANE_DECK - 0.3, 6.2);
  g.add(cable);
  const hook = painted(0.35, 0.35, 0.35, 0x5a5a62);
  hook.position.set(1.4, CRANE_DECK - 1.6, 6.2);
  g.add(hook);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A mooring bollard with a coil of rope — quayside flavour, and a low perch
// (top BOLLARD_H) for the bank edges.
export const BOLLARD_H = 0.55;

export function bollard(x, z) {
  const g = new THREE.Group();
  // Painted cast iron, and painted rather than bare for the same reason the
  // containers are: at 0.85 metalness an 8-sided cylinder this dark would go
  // to a row of near-black pins with a chrome rim. The rope coil stays flat —
  // there is no rope tile, and hemp is matte anyway.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, BOLLARD_H, 8), surfMat(0x3a3a42, 'paintedMetal'));
  post.position.y = BOLLARD_H / 2;
  g.add(post);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), surfMat(0x4a4a52, 'paintedMetal'));
  cap.position.y = BOLLARD_H;
  g.add(cap);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 5, 10), mat(0xc8b088));
  rope.rotation.x = -Math.PI / 2;
  rope.position.y = 0.06;
  g.add(rope);
  g.position.set(x, 0, z);
  return g;
}

// An oil-drum barrel. No collider anywhere it is used — like cardboardBox, it
// is cover to hide things BEHIND rather than an obstacle.
export function barrel(x, z, color = 0x4a6a5a) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10), mat(color));
  drum.position.y = 0.375;
  g.add(drum);
  for (const ry of [0.22, 0.53]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10), mat(0x2f2f36));
    band.position.y = ry;
    g.add(band);
  }
  g.position.set(x, 0, z);
  return g;
}

// A moored canal barge. Sits IN the water on purpose and carries no perch and
// no collectible: the Docks canal is scenery plus a bridged crossing, never a
// place the player has to reach (see docks.js's header — Sea Legs may never
// ship, so nothing may depend on swimming).
export function barge(x, z, rotY = 0, color = 0x3a5a78) {
  const g = new THREE.Group();
  // Painted steel hull; the cabin and gunwale stay flat (a 2.2m cabin is too
  // small for a siding tile to read as anything but stripes), and the deck
  // cargo is the same dock timber as the crates ashore.
  const hull = surfBox(3.2, 0.7, 9, color, 'paintedMetal');
  hull.position.y = 0.3;
  g.add(hull);
  const gunwale = box(3.3, 0.14, 9.1, 0x2a3a4e);
  gunwale.position.y = 0.65;
  g.add(gunwale);
  const cabin = box(2.2, 1.1, 3, 0xd8cbb0);
  cabin.position.set(0, 1.2, -2.2);
  g.add(cabin);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 8), mat(0x2f2f36));
  stack.position.set(0, 2.2, -2.8);
  g.add(stack);
  for (let i = 0; i < 3; i++) { // deck cargo
    const crate = surfBox(0.9, 0.7, 0.9, 0xc8a678, 'wood');
    crate.position.set(0, 1.0, 1.4 + i * 1.1);
    g.add(crate);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A plank bridge deck across a waterway, with railings. NO COLLIDERS are
// emitted for the railings by any caller — the deck has to stay walkable,
// because it is the guaranteed dry crossing between the Docks' two banks.
export function bridgeDeck(x1, z1, x2, z2, w = 4, y = 0.14) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const angle = Math.atan2(x2 - x1, z2 - z1);
  const deck = box(w, 0.14, len, 0xa08050);
  deck.position.y = y;
  g.add(deck);
  const planks = Math.floor(len / 1.1);
  for (let i = 0; i < planks; i++) {
    const plank = box(w - 0.1, 0.04, 0.12, 0x8a6a42);
    plank.position.set(0, y + 0.09, -len / 2 + (i + 0.5) * (len / planks));
    g.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = box(0.08, 0.08, len, 0x6a5230);
    rail.position.set(side * (w / 2 - 0.06), y + 0.65, 0);
    g.add(rail);
    const posts = Math.max(2, Math.floor(len / 2));
    for (let i = 0; i <= posts; i++) {
      const post = box(0.1, 0.65, 0.1, 0x6a5230);
      post.position.set(side * (w / 2 - 0.06), y + 0.33, -len / 2 + i * (len / posts));
      g.add(post);
    }
  }
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = angle;
  return g;
}

// LEFT FLAT, in all five areas. Corrugated board is uncoated pulp — it is
// already at the matte default, and it is the one prop here with no grain at
// all to imitate: the plank tile would give it timber boards it does not have,
// and there is no paper or fibre tile in the vocabulary. Its walls are 3cm
// thick and 0.55m across, so it is inside the thin-member rule besides.
export function cardboardBox(x, z, rotY = 0) {
  const g = new THREE.Group();
  const wallSpecs = [
    [0.55, 0.3, 0.03, 0, 0.15, 0.26], [0.55, 0.3, 0.03, 0, 0.15, -0.26],
    [0.03, 0.3, 0.55, 0.26, 0.15, 0], [0.03, 0.3, 0.55, -0.26, 0.15, 0],
  ];
  for (const [w, h, d, px, py, pz] of wallSpecs) {
    const wall = box(w, h, d, 0xc8a678);
    wall.position.set(px, py, pz);
    g.add(wall);
  }
  const bottom = box(0.55, 0.03, 0.55, 0xb89468);
  bottom.position.y = 0.015;
  g.add(bottom);
  for (const side of [-1, 1]) {
    const flap = box(0.55, 0.02, 0.2, 0xd8b688);
    flap.position.set(0, 0.31, side * 0.34);
    flap.rotation.x = side * -0.7;
    g.add(flap);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// =============================================================================
// INTERIOR PROPS — the Cozy Den density pass.
//
// The den shipped in v17 with six purchasable pieces and almost no room around
// them, while the outdoor areas had four density waves. These are the props
// that furnish an INSIDE: skirting and picture rails, shelves and bookcases,
// pictures, plants, bowls, toys, a radiator, a telly. They live here rather
// than in world/den.js for the same reason the dockside block above does —
// builder.js is where a second interior (a shop, a vet's waiting room, a
// neighbour's kitchen) goes shopping.
//
// Two rules carried over from the dockside block, both load-bearing:
//
//   * Anything with a WALKABLE TOP exports that height as a constant, because
//     src/world/den.js authors its perch chain against these numbers. A silent
//     0.1 here leaves a cat hovering, or pushes a chain step out of the 1.6
//     climb budget (src/climbing.js).
//   * Everything is deterministic — no rng, injected or otherwise. Two clients
//     walking the same den must draw the same room (the CF-7 desync rule), so
//     the "scattered" props scatter by index arithmetic, never by a draw.
//
// Orientation convention, shared by every wall-mounted prop below: at rotY 0
// the prop FACES +z. A north wall (at -z, facing the room) is rotY 0, a west
// wall is +PI/2, an east wall is -PI/2.
//
// SURFACES INDOORS (v20). This block is surfaced by the shared pass even
// though only ONE area uses it, which is the opposite of the rule the rest of
// this file follows, and the reason is file ownership rather than art: the
// area agents own only their own world file, and every stick of den furniture
// is built here. Nobody but this pass can give the den's furniture a light
// response at all.
//
// The vocabulary indoors is narrower than outdoors, and the gaps are real:
// there is no cloth tile, no wicker, no carpet and no paper, so upholstery,
// rugs, curtains, baskets and bags stay explicitly flat rather than borrowing
// the nearest wrong grain — a rug wearing the plank tile is a rug with
// floorboards printed on it. What the room DOES get is the timber/paint/glaze
// step: carcasses and shelves take 'wood', painted joinery takes 'siding's
// paint film without its lap boards, and the enamel and glaze take
// 'paintedMetal'. The thin-member and cylinder rules at the top of this file
// apply here more than anywhere, because furniture is mostly 5-10cm members.
// =============================================================================

// A rectangular rug with a border trim. Flat and collider-free by design: a
// rug is the one furnishing that must never change where the cat can walk.
// Flat in the material sense too, and deliberately: wool pile is matte, there
// is no textile tile in the vocabulary, and the two nearest ones would print
// floorboards or brickwork onto a rug.
export function rugRect(x, z, w, d, color = 0xb8564e, border = 0xe8d0a8) {
  const g = new THREE.Group();
  const trim = box(w + 0.3, 0.012, d + 0.3, border);
  trim.position.y = 0.012;
  g.add(trim);
  const pile = box(w, 0.02, d, color);
  pile.position.y = 0.02;
  g.add(pile);
  // two woven stripes, so a big rug doesn't read as a painted rectangle
  for (const sz of [-d * 0.28, d * 0.28]) {
    const stripe = box(w * 0.92, 0.006, d * 0.08, border);
    stripe.position.set(0, 0.028, sz);
    g.add(stripe);
  }
  g.position.set(x, 0, z);
  return g;
}

// LEFT FLAT: 5cm strips a centimetre off the floor. This IS the den's
// floorboards — the seams are the grain, drawn as geometry, which is why the
// den's floor plane does not want the plank tile underneath them either (two
// board rhythms disagreeing, the same trap the Docks' bridge decks fell into).
//
// Floorboard seams: thin dark strips across a floor plane, `count` of them
// spread over `size`. Costs nothing (no collider, 1cm off the floor) and is
// the single cheapest thing that stops a big flat quad reading as a big flat
// quad.
export function floorSeams(size, count, color = 0x7a5230) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const seam = box(0.05, 0.01, size, color);
    seam.position.set(-size / 2 + (i + 0.5) * (size / count), 0.008, 0);
    g.add(seam);
  }
  return g;
}

// A skirting board / picture rail run along a wall, from (x1,z1) to (x2,z2).
// Same signature shape as fenceRun above so the two read alike. `y` is the
// strip's CENTRE height: 0.11 for skirting, ~2.0 for a picture rail.
//
// Painted joinery, so it takes 'siding's light response — 0.7, the paint-film
// step, because what you see on a skirting board is gloss over timber and not
// the timber — with the lap-board tile left off. It is 8cm deep and 22cm tall:
// thin-member rule, and the tile would put clapboards on the skirting anyway.
export function trimRun(x1, z1, x2, z2, y = 0.11, h = 0.22, color = 0xf0e4d0) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, len), surfNoMap(color, 'siding'));
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  return m;
}

// A framed picture. Hung, so it takes an explicit `y` (its centre) and never
// a collider — the cat walks under it.
export function pictureFrame(x, y, z, rotY = 0, w = 0.7, h = 0.55, artColor = 0xa8c8d8) {
  const g = new THREE.Group();
  // A 5cm moulding: thin-member rule, so wood's roughness without its tile.
  // The ART stays flat — it is a painting, and a painting with wood grain
  // showing through it is a painting on the wrong side of the canvas.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, h + 0.09, 0.05),
    surfNoMap(0x7a5230, 'wood'));
  g.add(frame);
  const art = box(w, h, 0.02, artColor);
  art.position.z = 0.03;
  g.add(art);
  const hill = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, h * 0.42, 4), mat(0x5a8a5a));
  hill.position.set(-w * 0.14, -h * 0.16, 0.05);
  g.add(hill);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(h * 0.13, 10), mat(0xf2e0a0));
  sun.position.set(w * 0.26, h * 0.2, 0.05);
  g.add(sun);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A wall clock — a disc with two hands, permanently at ten past ten.
// A 24cm dial and a 3cm rim: everything here is inside the thin-member rule,
// so the clock takes light responses only. The face is a painted dial, the rim
// is a turned wooden bezel, and the hands are left at the default.
export function wallClock(x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16),
    surfNoMap(0xf0e4d0, 'siding'));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 16),
    surfNoMap(0x7a5230, 'wood'));
  g.add(rim);
  for (const [len, ang] of [[0.16, -0.9], [0.11, 1.05]]) {
    const hand = box(0.025, len, 0.02, 0x3a3a42);
    hand.position.set(Math.sin(ang) * len / 2, Math.cos(ang) * len / 2, 0.04);
    hand.rotation.z = -ang;
    g.add(hand);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A gathered curtain hanging beside a window. Two folds, no collider.
// LEFT FLAT: heavy cotton is matte, and there is no cloth tile — see the
// vocabulary-gap note in this block's header. (Nor does it sway: wind is an
// outdoor system and there is no draught model indoors.)
export function curtain(x, y, z, rotY = 0, w = 0.5, h = 1.7, color = 0xc07a6a) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const fold = box(w / 3, h, 0.08 + (i % 2) * 0.05, color);
    fold.position.set(-w / 2 + (i + 0.5) * (w / 3), -h / 2, 0);
    g.add(fold);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A wall-hung shelf. `y` IS the walkable top of the plank (the caller's perch
// height), and the plank is centred on the group's origin in depth, so a
// shelf on a wall at world x = -9 with depth 1.05 has its origin at
// -9 + depth/2 and reaches (depth/2) into the room.
export function wallShelf(x, y, z, rotY = 0, w = 1.4, depth = 1.05, color = 0x9a7048) {
  const g = new THREE.Group();
  // The one shelf face a cat ever looks at is the top, 1.4 x 1.05 — one whole
  // plank tile, i.e. four ~35cm boards. Derived from those two, not the 7cm
  // thickness.
  const plank = surfBox(w, 0.07, depth, color, 'wood', w, depth);
  plank.position.y = y - 0.035;
  g.add(plank);
  for (const bx of [-w / 2 + 0.16, w / 2 - 0.16]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, depth * 0.55),
      surfNoMap(0x6a5230, 'wood'));
    bracket.position.set(bx, y - 0.19, -depth * 0.2);
    g.add(bracket);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A stack of books lying flat. `seed` only picks colours and offsets off an
// integer — no rng (see this block's header). Left flat: a 7cm-thick book is
// the thin-member rule twice over, and cloth boards are matte.
export function bookStack(x, y, z, count = 3, seed = 0) {
  const g = new THREE.Group();
  const colors = [0x9a4a3a, 0x3a5a78, 0x4a6a4a, 0xb08a3a, 0x6a4a6a];
  for (let i = 0; i < count; i++) {
    const bk = box(0.3 - (i % 2) * 0.04, 0.07, 0.22, colors[(seed + i) % colors.length]);
    bk.position.set(Math.sin(seed + i) * 0.03, y + 0.035 + i * 0.075, Math.cos(seed * 2 + i) * 0.03);
    bk.rotation.y = Math.sin(seed * 3 + i) * 0.25;
    g.add(bk);
  }
  g.position.set(x, 0, z);
  return g;
}

// A bookcase. Walkable top is BOOKCASE_H — high enough that no cat reaches it
// off the floor inside the 1.6 climb budget, which is the whole point: it is
// the top of a chain, not a step.
export const BOOKCASE_H = 1.9;

export function bookcase(x, z, rotY = 0, w = 1.5, depth = 0.5) {
  const g = new THREE.Group();
  // The backer is the one big face here — 1.5 x 1.9, so [2, 2] of the plank
  // tile — and it is the surface you see THROUGH the shelves, which is what
  // makes the whole piece read as timber rather than as painted boxes.
  const backer = surfBox(w, BOOKCASE_H, 0.06, 0x7a5230, 'wood');
  backer.position.set(0, BOOKCASE_H / 2, -depth / 2 + 0.03);
  g.add(backer);
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) { // uprights, 0.1 — thin-member rule
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, BOOKCASE_H, depth),
      surfNoMap(0x9a7048, 'wood'));
    side.position.set(sx, BOOKCASE_H / 2, 0);
    g.add(side);
  }
  const shelfYs = [0.06, 0.62, 1.18, BOOKCASE_H - 0.04];
  for (const sy of shelfYs) {
    // Tiled off the shelf's top face (w x depth), not its 8cm edge.
    const shelf = surfBox(w, 0.08, depth, 0x9a7048, 'wood', w, depth);
    shelf.position.set(0, sy, 0);
    g.add(shelf);
  }
  // spines: a row of upright books per shelf, leaning where the row runs out
  const colors = [0x9a4a3a, 0x3a5a78, 0x4a6a4a, 0xb08a3a, 0x6a4a6a, 0xc06a48];
  for (let s = 0; s < 3; s++) {
    const base = shelfYs[s] + 0.04;
    for (let i = 0; i < 7; i++) {
      const h = 0.34 + ((s * 7 + i) % 3) * 0.05;
      const spine = box(0.09, h, depth * 0.62, colors[(s * 5 + i) % colors.length]);
      spine.position.set(-w / 2 + 0.18 + i * 0.16, base + h / 2, 0.02);
      spine.rotation.z = i === 6 ? 0.22 : 0;
      g.add(spine);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A potted houseplant. PLANT_H is the height at scale 1; nothing perches on
// it (leaves are not a surface) so it is a constant for collider/camera
// bookkeeping rather than for a perch.
export const PLANT_H = 1.15;

// Takes NO wind, deliberately, though it is foliage: it is an indoor prop and
// there is no draught model inside the den. If a later area puts one on a
// balcony, give it the same `{ wind }` option tree() and bush() carry.
export function pottedPlant(x, z, scale = 1) {
  const g = new THREE.Group();
  // Terracotta — fired clay, so it takes 'brick's response (0.88, the faint
  // vitrified sheen a fired face has and a plastered one does not) with the
  // bond pattern left off, because a 10-sided cylinder is the cylinder rule.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.36, 10),
    surfNoMap(0xc06a48, 'brick'));
  pot.position.y = 0.18;
  g.add(pot);
  // Potting compost: 'matte' out loud. It is the flattest thing in the room
  // and the one surface that should stay flatter than the pot around it.
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 10),
    surfMat(0x4a3a30, 'matte'));
  soil.position.y = 0.36;
  g.add(soil);
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), surfMat(0x4e7a40, 'bark'));
  stem.position.y = 0.6;
  g.add(stem);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0),
      surfMat(i % 2 ? 0x4e9440 : 0x5aa04e, 'foliage'));
    leaf.position.set(Math.sin(i * 2.3) * 0.22, 0.72 + (i % 3) * 0.14, Math.cos(i * 1.9) * 0.22);
    leaf.scale.set(1, 0.7, 1);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  return g;
}

// A wall radiator with fins and a valve. RADIATOR_H is its top; it is only a
// perch if the caller can put the cat within reach of it, which against a
// wall it usually cannot (see world/den.js).
export const RADIATOR_H = 0.62;

export function radiator(x, z, rotY = 0, w = 1.5) {
  const g = new THREE.Group();
  // Stove-enamelled pressed steel throughout, including the brass valve and
  // pipe. 'paintedMetal' and never 'bareMetal': the whole assembly is off-
  // white, and at metalness 0.85 an off-white prop loses its diffuse term and
  // becomes a mirror of a dim room — see the note on fireEscape.
  const enamel = (bw, bh, bd, color) => surfBox(bw, bh, bd, color, 'paintedMetal');
  const panel = enamel(w, RADIATOR_H - 0.12, 0.1, 0xf0ece4);
  panel.position.y = 0.12 + (RADIATOR_H - 0.12) / 2;
  g.add(panel);
  const fins = Math.max(4, Math.round(w / 0.16));
  for (let i = 0; i < fins; i++) {
    const fin = enamel(0.06, RADIATOR_H - 0.16, 0.17, 0xe4dfd4);
    fin.position.set(-w / 2 + 0.08 + i * ((w - 0.16) / (fins - 1)), 0.12 + (RADIATOR_H - 0.12) / 2, 0);
    g.add(fin);
  }
  const cap = enamel(w, 0.06, 0.2, 0xf0ece4);
  cap.position.y = RADIATOR_H;
  g.add(cap);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8),
    surfMat(0xb0a070, 'paintedMetal'));
  valve.position.set(w / 2 - 0.02, 0.2, 0.08);
  g.add(valve);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6),
    surfMat(0xb0a070, 'paintedMetal'));
  pipe.position.set(w / 2 - 0.02, 0.1, 0.08);
  g.add(pipe);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// An armchair. Two walkable tops — the seat and the back — and they are
// 0.45 apart on purpose: a cat on the seat can always step up to the back.
export const ARMCHAIR_SEAT = 0.5;
export const ARMCHAIR_BACK = 0.95;

export function armchair(x, z, rotY = 0, color = 0x8a5a6a) {
  const g = new THREE.Group();
  const seat = box(1.0, 0.16, 0.9, color);
  seat.position.y = ARMCHAIR_SEAT - 0.08;
  g.add(seat);
  const cushion = box(0.86, 0.1, 0.76, 0xa8707e);
  cushion.position.y = ARMCHAIR_SEAT + 0.03;
  g.add(cushion);
  const back = box(1.0, ARMCHAIR_BACK - 0.34, 0.18, color);
  back.position.set(0, 0.34 + (ARMCHAIR_BACK - 0.34) / 2, -0.36);
  g.add(back);
  for (const ax of [-0.5, 0.5]) {
    const arm = box(0.16, 0.28, 0.9, color);
    arm.position.set(ax, 0.58, 0);
    g.add(arm);
  }
  // The seat, cushion, back and arms stay FLAT on purpose: they are
  // upholstery, and the vocabulary has no cloth. The turned legs are the one
  // timber part, and at 9cm they are the thin-member rule.
  for (const [lx, lz] of [[-0.42, 0.38], [0.42, 0.38], [-0.42, -0.38], [0.42, -0.38]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.09),
      surfNoMap(0x6a4a30, 'wood'));
    leg.position.set(lx, 0.17, lz);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A chest of drawers. DRESSER_H is the walkable top — inside the 1.6 climb
// budget from the floor, so it is a one-hop perch rather than a chain.
export const DRESSER_H = 1.25;

export function dresser(x, z, rotY = 0, w = 1.2, depth = 0.6) {
  const g = new THREE.Group();
  // 1.2 x 1.11 carcass and a 1.2 x 0.6 lid, so roughly one plank tile each —
  // four ~30cm boards, which is a chest of drawers. The drawer fronts get the
  // same tile at their own density so their grain lines up with the carcass
  // rather than running at a second scale across it.
  const carcass = surfBox(w, DRESSER_H - 0.14, depth, 0x9a7048, 'wood');
  carcass.position.y = 0.14 + (DRESSER_H - 0.14) / 2;
  g.add(carcass);
  const top = surfBox(w + 0.08, 0.07, depth + 0.08, 0xb08a58, 'wood', w + 0.08, depth + 0.08);
  top.position.y = DRESSER_H - 0.035;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const front = surfBox(w - 0.16, 0.28, 0.04, 0xb08a58, 'wood');
    front.position.set(0, 0.3 + i * 0.34, depth / 2 + 0.02);
    g.add(front);
    for (const kx of [-w * 0.22, w * 0.22]) {
      // 4.5cm turned knobs, and a sphere besides: thin-member and cylinder
      // rules both, so light response only.
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6),
        surfNoMap(0x5a4028, 'wood'));
      knob.position.set(kx, 0.3 + i * 0.34, depth / 2 + 0.06);
      g.add(knob);
    }
  }
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, depth - 0.1),
      surfNoMap(0x6a4a30, 'wood'));
    foot.position.set(lx, 0.07, 0);
    g.add(foot);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A boxy old telly on a low stand. Deliberately a CRT: a flatscreen's top
// edge is not somewhere a cat can sit, and sitting on the telly is the whole
// joke. TV_TOP is that walkable top. The screen is emissive but carries NO
// userData.window — the dusk pass swaps window materials for a warm glow, and
// a telly that turns into a lamp at dusk would read as a bug.
export const TV_TOP = 1.3;

export function tvSet(x, z, rotY = 0) {
  const g = new THREE.Group();
  // Veneered stand, moulded set. The stand and its lid are timber and carry
  // the plank tile; the CASING is 1970s injection-moulded plastic, which
  // 'paintedMetal' at roughness 0.35 draws better than anything else here — a
  // continuous polymer skin with a broad soft highlight, which is exactly what
  // that preset is (its metalness is 0, so no metal read sneaks in).
  const stand = surfBox(1.3, 0.5, 0.55, 0x8a6a42, 'wood');
  stand.position.y = 0.25;
  g.add(stand);
  const shelf = surfBox(1.2, 0.05, 0.5, 0x6a5230, 'wood', 1.2, 0.5);
  shelf.position.y = 0.22;
  g.add(shelf);
  const body = surfBox(1.1, TV_TOP - 0.52, 0.5, 0x53433a, 'paintedMetal');
  body.position.y = 0.52 + (TV_TOP - 0.52) / 2;
  g.add(body);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.52, 0.04),
    litMaterial(0xa8d8e8, { emissive: 0x3a6a80 })
  );
  screen.position.set(0, 0.9, 0.26);
  g.add(screen);
  const lid = surfBox(1.16, 0.06, 0.56, 0x6a5648, 'wood', 1.16, 0.56); // the walkable top
  lid.position.y = TV_TOP - 0.03;
  g.add(lid);
  for (const ax of [-0.2, 0.2]) { // rabbit ears, purely for the silhouette
    const ear = surfBox(0.03, 0.5, 0.03, 0x8a8a92, 'paintedMetal');
    ear.position.set(ax, TV_TOP + 0.25, -0.1);
    ear.rotation.z = ax * 1.6;
    g.add(ear);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A basket of toys. Low and collider-free — a cat should be able to stand in
// its own toy basket. LEFT FLAT: woven willow, and there is no wicker tile;
// the plank tile would put straight sawn boards around a curved basket.
export function toyBasket(x, z) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.34, 12, 1, true), litMaterial(0xc8a678, { side: THREE.DoubleSide }));
  bowl.position.y = 0.17;
  g.add(bowl);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 12), mat(0xb89468));
  base.position.y = 0.02;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 14), mat(0xb89468));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.34;
  g.add(rim);
  const balls = [0xd8504e, 0x4a8ec8, 0xe0b040];
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), mat(balls[i]));
    ball.position.set(Math.sin(i * 2.1) * 0.15, 0.3 + (i % 2) * 0.11, Math.cos(i * 2.7) * 0.15);
    g.add(ball);
  }
  g.position.set(x, 0, z);
  return g;
}

// A crinkle tunnel. LEFT FLAT: nylon over a wire hoop, no cloth tile, and a
// 12-sided cylinder is the cylinder rule anyway.
//
// Open at both ends and COLLIDER-FREE on purpose: the cat
// walks through it, and world/den.js registers its middle as a `boxes` hide
// spot so "if I fits, I sits" fires inside it.
export function catTunnel(x, z, rotY = 0, len = 1.7, r = 0.36) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 12, 1, true),
    litMaterial(0x6a9ab8, { side: THREE.DoubleSide })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.y = r;
  g.add(tube);
  for (let i = 0; i < 4; i++) { // crinkle rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.03, 5, 12), mat(0x4a7a98));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-len / 2 + (i + 0.5) * (len / 4), r, 0);
    g.add(ring);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A food bowl and a water bowl on a mat.
//
// NO WATER RECORD. The bowl is a mesh and nothing else: it is not a `puddles`
// entry and it is not a `waters` footprint (see the block at the bottom of
// this file). The den declares neither, and a 0.2m dish of water is not a
// body of water a cat can fall into — dropping one into `waters` would pull
// the whole v19 invariant set into a room that has no shoreline.
export function petBowls(x, z, rotY = 0) {
  const g = new THREE.Group();
  const mat_ = box(0.9, 0.02, 0.6, 0x6a8a9a);
  mat_.position.y = 0.012;
  g.add(mat_);
  // Glazed ceramic, so 'paintedMetal' — the preset is a smooth continuous
  // coating over an opaque body at metalness 0, which is a glaze as exactly as
  // it is car paint. The WATER bowl's fill takes the 'water' preset (the same
  // one the puddles get) and the food bowl's does not, which is the whole
  // reason the surface is carried in the tuple rather than assumed.
  for (const [bx, color, fill, fillSurface] of [
    [-0.22, 0xd8504e, 0xb08a58, 'matte'],
    [0.22, 0x4a8ec8, 0x8ac8e0, 'water'],
  ]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.1, 12),
      surfMat(color, 'paintedMetal'));
    bowl.position.set(bx, 0.07, 0);
    g.add(bowl);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12),
      surfMat(fill, fillSurface));
    inner.position.set(bx, 0.115, 0);
    g.add(inner);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// Scattered cat toys — a couple of balls and a felt mouse. Tiny, collider-
// free, and placed off `seed` by arithmetic (no rng). Left flat: nothing here
// is over 9cm, and felt is the mattest material in the house.
export function catToys(x, z, seed = 0) {
  const g = new THREE.Group();
  const colors = [0xd8504e, 0xe0b040, 0x4a8ec8];
  for (let i = 0; i < 2; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), mat(colors[(seed + i) % 3]));
    ball.position.set(Math.sin(seed * 2 + i * 2.4) * 0.5, 0.09, Math.cos(seed * 3 + i * 1.7) * 0.5);
    g.add(ball);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 7), mat(0x9a9aa2));
  body.scale.set(1.5, 0.8, 1);
  body.position.set(0, 0.07, 0);
  g.add(body);
  const tail = box(0.22, 0.02, 0.02, 0xd8b0b8);
  tail.position.set(-0.2, 0.06, 0);
  tail.rotation.y = Math.sin(seed) * 0.6;
  g.add(tail);
  g.position.set(x, 0, z);
  g.rotation.y = Math.sin(seed * 1.3) * 1.2;
  return g;
}

// LEFT FLAT for cardboardBox's reason: kraft paper has no grain to imitate and
// the vocabulary has no fibre tile.
//
// A paper grocery bag, tipped on its side. Cover, like cardboardBox above —
// no collider, and world/den.js registers its mouth as a `boxes` hide spot.
export function paperBag(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const [w, h, d, px, py, pz] of [
    [0.5, 0.44, 0.03, 0, 0.22, 0.22], [0.5, 0.44, 0.03, 0, 0.22, -0.22],
    [0.03, 0.44, 0.44, 0.24, 0.22, 0], [0.5, 0.03, 0.44, 0, 0.005, 0],
  ]) {
    const panel = box(w, h, d, 0xd8b688);
    panel.position.set(px, py, pz);
    g.add(panel);
  }
  const fold = box(0.5, 0.06, 0.44, 0xc8a678); // the rolled-over top edge
  fold.position.set(-0.24, 0.44, 0);
  fold.rotation.z = 0.3;
  g.add(fold);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A log basket beside a hearth: a hoop of logs, ends out. The woven hoop stays
// flat (wicker again); the logs take 'bark', which is the preset built for
// exactly this shape and ships map-less because of it.
export function logBasket(x, z) {
  const g = new THREE.Group();
  const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.36, 10, 1, true), litMaterial(0x8a6a42, { side: THREE.DoubleSide }));
  hoop.position.y = 0.18;
  g.add(hoop);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 7),
      surfMat(i % 2 ? 0x7a5230 : 0x6a4a30, 'bark'));
    log.position.set(Math.sin(i * 2.2) * 0.14, 0.34 + (i % 2) * 0.1, Math.cos(i * 1.6) * 0.14);
    log.rotation.set(Math.PI / 2, Math.sin(i) * 0.4, 0);
    g.add(log);
  }
  g.position.set(x, 0, z);
  return g;
}

// =============================================================================
// WATER FOOTPRINTS — v19.
//
// Water in this game has never carried a collider: the park pond, the seaside
// sea and the Docks canal are all walk-over surfaces as shipped. A later wave
// makes them solid (and reinstates Sea Legs with them), and the one thing that
// wave must not have to do is re-derive three footprints from the mesh
// literals that draw them — a PlaneGeometry nudged half a metre would silently
// move the water out from under every invariant that depends on it.
//
// So every area that has water returns `waters`, and everything that needs to
// know where the water is reads THAT: the invariant tests in
// test/water.test.js, scent.js's buried-treat placement, and eventually the
// collider wave itself. In all three areas the mesh is now BUILT FROM the
// declaration rather than sitting beside it, so the two cannot disagree.
//
// Two footprint kinds, which between them cover all three bodies of water:
//
//   { id, kind: 'circle', x, z, r }                the park pond
//   { id, kind: 'rect', minX, maxX, minZ, maxZ }   the seaside sea — and the
//                                                  Docks canal, which is just
//                                                  a rect that happens to span
//                                                  the whole map width, i.e. a
//                                                  band
//
// A footprint may also carry `decks`: axis-aligned rectangles of DRY structure
// standing over the water — the seaside pier, the Docks' two bridges. A deck
// is how an area says "content may stand here, and a future water collider
// must leave this hole in itself". Every function below treats a point on a
// deck as dry land.
//
// All of this is plain data and pure geometry: no THREE, no renderer, so the
// world files stay unit-testable headless.
// =============================================================================

// Signed distance from (x, z) to a footprint's edge: negative inside the
// water, positive on dry land. For a rect the inside case reports the
// SHALLOWEST penetration (the nearest way out), which is what makes the
// push-out below take the short route to shore.
export function waterGap(w, x, z) {
  if (w.kind === 'circle') return Math.hypot(x - w.x, z - w.z) - w.r;
  const dx = Math.max(w.minX - x, x - w.maxX);
  const dz = Math.max(w.minZ - z, z - w.maxZ);
  if (dx > 0 || dz > 0) return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return Math.max(dx, dz);
}

// Is (x, z) standing on one of this footprint's dry decks?
export function onDeck(w, x, z) {
  return (w.decks ?? []).some(
    (d) => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ,
  );
}

// waterClearance(waters, x, z) — how far the point is from the nearest water's
// edge: positive on dry land, negative in the water, Infinity where there is
// no water to be near (an area with none, or a point standing on a deck).
export function waterClearance(waters, x, z) {
  let min = Infinity;
  for (const w of waters ?? []) {
    if (onDeck(w, x, z)) continue;
    min = Math.min(min, waterGap(w, x, z));
  }
  return min;
}

export function inWater(waters, x, z) {
  return waterClearance(waters, x, z) < 0;
}

function pushOutOf(w, x, z, margin) {
  if (w.kind === 'circle') {
    let dx = x - w.x, dz = z - w.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // dead-centre: fixed +x push
    const need = w.r + margin;
    return { x: w.x + (dx / d) * need, z: w.z + (dz / d) * need };
  }
  return nearestOf(x, z, [
    { x: w.minX - margin, z }, { x: w.maxX + margin, z },
    { x, z: w.minZ - margin }, { x, z: w.maxZ + margin },
  ]);
}

function clampInto(d, x, z, margin) {
  const cl = (v, lo, hi) => (lo + margin >= hi - margin
    ? (lo + hi) / 2
    : Math.min(hi - margin, Math.max(lo + margin, v)));
  return { x: cl(x, d.minX, d.maxX), z: cl(z, d.minZ, d.maxZ) };
}

function nearestOf(x, z, cands) {
  let best = cands[0];
  let bestD = Math.hypot(best.x - x, best.z - z);
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/**
 * nearestDry(waters, x, z, margin) — the closest point to (x, z) that is out
 * of every water by at least `margin`, or the point itself when it already is.
 * Pure and deterministic (no rng), because its one caller places buried treats
 * for a co-walk both clients must agree on.
 *
 * Two candidate escapes per footprint, because over a long pier the short way
 * out is not the shore:
 *   * straight out over the nearest edge of the footprint;
 *   * onto the nearest of its decks.
 * The closer candidate wins, so a treat that rolled off the seaside's pier POI
 * climbs back onto the pier instead of being flung 11m west to the sand.
 */
export function nearestDry(waters, x, z, margin = 0.6) {
  let p = { x, z };
  const list = waters ?? [];
  // A push out of one footprint can only land inside another where two bodies
  // of water touch — no area does that today, but the relaxation is two lines
  // and stops the function from silently returning a wet point if one ever does.
  for (let pass = 0; pass < 3; pass++) {
    const w = list.find((wt) => !onDeck(wt, p.x, p.z) && waterGap(wt, p.x, p.z) < margin);
    if (!w) break;
    p = nearestOf(x, z, [
      pushOutOf(w, p.x, p.z, margin),
      ...(w.decks ?? []).map((d) => clampInto(d, p.x, p.z, margin)),
    ]);
  }
  return p;
}
