// Interior props: rugs, trim, frames, shelves, books, furniture, the TV, cat
// toys and baskets, for the Cozy Den and other rooms. Built from builder.js's
// boxes and materials, imported back from builder.js: the cycle is safe
// because nothing here calls into builder.js while the modules load. Every
// name exported here is re-exported by builder.js.
import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import { box, roundedBox, surfNoMap, mat, surfBox, surfMat } from './builder.js';

// =============================================================================
// INTERIOR PROPS — the Cozy Den density pass.
//
// The den shipped in v17 with six purchasable pieces and almost no room around
// them, while the outdoor areas had four density waves. These are the props
// that furnish an INSIDE: skirting and picture rails, shelves and bookcases,
// pictures, plants, bowls, toys, a radiator, a telly. They live here rather
// than in world/den.js for the same reason the dockside block in builder.js
// does — a second interior (a shop, a vet's waiting room, a neighbour's
// kitchen) goes shopping here.
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
// builder.js follows, and the reason is file ownership rather than art: the
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
// 'paintedMetal'. The thin-member and cylinder rules at the top of builder.js
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
// Same signature shape as fenceRun in builder.js so the two read alike. `y` is the
// strip's CENTRE height: 0.11 for skirting, ~2.0 for a picture rail.
//
// Painted joinery, so it takes 'siding's light response — 0.7, the paint-film
// step, because what you see on a skirting board is gloss over timber and not
// the timber — with the lap-board tile left off. It is 8cm deep and 22cm tall:
// thin-member rule, and the tile would put clapboards on the skirting anyway.
export function trimRun(x1, z1, x2, z2, y = 0.11, h = 0.22, color = 0xf0e4d0) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(roundedBox(0.08, h, len), surfNoMap(color, 'siding'));
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
  const frame = new THREE.Mesh(roundedBox(w + 0.09, h + 0.09, 0.05),
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
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 24),
    surfNoMap(0xf0e4d0, 'siding'));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 28),
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
    const bracket = new THREE.Mesh(roundedBox(0.06, 0.24, depth * 0.55),
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
    const side = new THREE.Mesh(roundedBox(0.1, BOOKCASE_H, depth),
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
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.36, 16),
    surfNoMap(0xc06a48, 'brick'));
  pot.position.y = 0.18;
  g.add(pot);
  // Potting compost: 'matte' out loud. It is the flattest thing in the room
  // and the one surface that should stay flatter than the pot around it.
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16),
    surfMat(0x4a3a30, 'matte'));
  soil.position.y = 0.36;
  g.add(soil);
  const stem = new THREE.Mesh(roundedBox(0.05, 0.5, 0.05), surfMat(0x4e7a40, 'bark'));
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
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10),
    surfMat(0xb0a070, 'paintedMetal'));
  valve.position.set(w / 2 - 0.02, 0.2, 0.08);
  g.add(valve);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8),
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
    const leg = new THREE.Mesh(roundedBox(0.09, 0.34, 0.09),
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
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 7),
        surfNoMap(0x5a4028, 'wood'));
      knob.position.set(kx, 0.3 + i * 0.34, depth / 2 + 0.06);
      g.add(knob);
    }
  }
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    const foot = new THREE.Mesh(roundedBox(0.12, 0.14, depth - 0.1),
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
    roundedBox(0.86, 0.52, 0.04),
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
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.34, 20, 1, true), litMaterial(0xc8a678, { side: THREE.DoubleSide }));
  bowl.position.y = 0.17;
  g.add(bowl);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 20), mat(0xb89468));
  base.position.y = 0.02;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), mat(0xb89468));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.34;
  g.add(rim);
  const balls = [0xd8504e, 0x4a8ec8, 0xe0b040];
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), mat(balls[i]));
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
    new THREE.CylinderGeometry(r, r, len, 20, 1, true),
    litMaterial(0x6a9ab8, { side: THREE.DoubleSide })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.y = r;
  g.add(tube);
  for (let i = 0; i < 4; i++) { // crinkle rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.03, 6, 20), mat(0x4a7a98));
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
// entry and it is not a `waters` footprint (see the WATER FOOTPRINTS block
// in water.js). The den declares neither, and a 0.2m dish of water is not a
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
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.1, 18),
      surfMat(color, 'paintedMetal'));
    bowl.position.set(bx, 0.07, 0);
    g.add(bowl);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18),
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
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 9), mat(colors[(seed + i) % 3]));
    ball.position.set(Math.sin(seed * 2 + i * 2.4) * 0.5, 0.09, Math.cos(seed * 3 + i * 1.7) * 0.5);
    g.add(ball);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 9), mat(0x9a9aa2));
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
// A paper grocery bag, tipped on its side. Cover, like cardboardBox in builder.js —
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
  const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.36, 18, 1, true), litMaterial(0x8a6a42, { side: THREE.DoubleSide }));
  hoop.position.y = 0.18;
  g.add(hoop);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10),
      surfMat(i % 2 ? 0x7a5230 : 0x6a4a30, 'bark'));
    log.position.set(Math.sin(i * 2.2) * 0.14, 0.34 + (i % 2) * 0.1, Math.cos(i * 1.6) * 0.14);
    log.rotation.set(Math.PI / 2, Math.sin(i) * 0.4, 0);
    g.add(log);
  }
  g.position.set(x, 0, z);
  return g;
}
