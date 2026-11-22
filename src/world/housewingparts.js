// THE OLD HOUSE'S EAST WING, THE PIECES (Old House wing, Milestone 1). The furniture builders for
// the wing's own kinds (sofa, fish tank, bunk beds, bath...), in the shape houseparts.js's
// BUILDERS take: `make(p, f)` with `p` a Piece (box / cyl / prim over one atlas and a few flat
// swatches), the piece's frame the middle of its footprint on the floor, front +z. houseparts.js
// merges these into its tables, so a wing piece is built, merged and faded exactly like an old one.
// They use no THREE state of their own beyond primitives, no Math.random (variation: none, the
// wing's pieces are the same everywhere), and every piece over 400 triangles says so.
//
// Triangle counts are counted by test/housebudget.test.js (the zone limits: east 5,400, kids
// 5,400); a piece's comment gives its own rough share.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';

const alongX = (g) => g.rotateZ(Math.PI / 2); // a cylinder's axis along x
const alongZ = (g) => g.rotateX(Math.PI / 2); // along z

export const WING_BUILDERS = {
  // the sofa's back and arms' backs against the north wall (a solid: she cannot walk through it)
  sofaback(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0.1, h - 0.12, -hd, hd, 'sage', ['y-']);
    p.cyl(0.09, 0.09, -hw + 0.04, hw - 0.04, 8, 'sage', 0, 0, (g) => { alongX(g); g.translate(0, h - 0.06, 0); }); // the rolled top
    for (const s of [-1, 1]) p.box(s * (hw - 0.04) - 0.03, s * (hw - 0.04) + 0.03, 0, 0.1, -hd + 0.04, hd - 0.04, 'darkWood', ['y-']); // feet
    // two plump throw cushions in front of the back
    p.box(-0.85, -0.3, 0.55, 0.88, hd, hd + 0.13, 'rose', ['y-', 'z-']);
    p.box(0.35, 0.9, 0.55, 0.86, hd, hd + 0.12, 'sky', ['y-', 'z-']);
  },

  // the seat she naps on: a low base, two seat cushions flush with the arm rolls (the seat is a
  // top she stands on at 0.55, so nothing stands higher than it), a front skirt (about 140 tris)
  sofa(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw + 0.04, hw - 0.04, 0.1, 0.38, -hd + 0.02, hd - 0.03, 'sage', ['y-', 'y+']);
    p.box(-hw + 0.04, hw - 0.04, 0.05, 0.1, hd - 0.1, hd - 0.04, 'darkWood', ['y-']);
    const inner = hw - 0.24;
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 0.02 : -inner;
      const x1 = s > 0 ? inner : -0.02;
      p.box(x0, x1, 0.38, h, -hd + 0.02, hd - 0.03, 'sage', ['y-']);
      p.box(x0 + 0.05, x1 - 0.05, h, h + 0.004, -hd + 0.1, hd - 0.1, 'sage', ['y-']);
    }
    for (const s of [-1, 1]) { // the arms, rolled flush with the seat
      const x = s * (hw - 0.12);
      p.box(x - 0.12, x + 0.12, 0.1, h - 0.1, -hd + 0.02, hd - 0.03, 'sage', ['y-', 'y+']);
      p.cyl(0.1, 0.1, -hd + 0.02, hd - 0.03, 8, 'sage', x, 0, (g) => { alongZ(g); g.translate(0, h - 0.1, 0); });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.03, 0.025, 0, 0.1, 5, 'darkWood', sx * (hw - 0.07), sz * (hd - 0.07));
  },

  // a low table: top, four legs, a shelf with two books
  coffeetable(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, h - 0.04, h, -hd, hd, 'darkWood');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.05) - 0.025, sx * (hw - 0.05) + 0.025, 0, h - 0.04, sz * (hd - 0.05) - 0.025, sz * (hd - 0.05) + 0.025, 'darkWood', ['y-', 'y+']);
    p.box(-hw + 0.06, hw - 0.06, 0.1, 0.13, -hd + 0.05, hd - 0.05, 'lightWood');
    p.box(-0.3, 0.05, 0.13, 0.17, -0.1, 0.12, 'navy', ['y-']);
    p.box(-0.25, 0.1, 0.17, 0.2, -0.08, 0.1, 'red', ['y-']);
  },

  // a fish tank on a cabinet: the stand, a glass box of water, a lid, three fish and weed (about 190 tris)
  fishtank(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const top = 0.6;
    p.box(-hw, hw, 0, top, -hd, hd, 'darkWood', ['y-', 'y+']);
    p.box(-hw + 0.05, -0.05, 0.06, top - 0.05, hd - 0.012, hd, 'lightWood', ['z-']);
    p.box(0.05, hw - 0.05, 0.06, top - 0.05, hd - 0.012, hd, 'lightWood', ['z-']);
    p.box(-hw - 0.02, hw + 0.02, top, top + 0.03, -hd - 0.02, hd + 0.02, 'darkWood');
    p.box(-hw + 0.03, hw - 0.03, top + 0.03, h - 0.06, -hd + 0.03, hd - 0.03, 'sky', ['y-']); // the water
    p.box(-hw, hw, h - 0.06, h, -hd, hd, 'darkWood', ['y-']); // the lid
    for (const sx of [-1, 1]) p.box(sx * (hw - 0.015) - 0.015, sx * (hw - 0.015) + 0.015, top + 0.03, h - 0.06, -hd, hd, 'white', ['y-', 'y+']); // glass corners
    p.box(-hw + 0.04, hw - 0.04, top + 0.03, top + 0.07, -hd + 0.04, hd - 0.04, 'ochre', ['y-']); // the gravel
    [['ochre', -0.3, 0.88], ['red', 0.05, 0.78], ['gold', 0.35, 0.92]].forEach(([look, x, y]) => {
      p.box(x - 0.05, x + 0.05, y - 0.03, y + 0.03, -0.04, 0.04, look);
      p.box(x + 0.05, x + 0.09, y - 0.045, y + 0.045, -0.02, 0.02, look); // the tail
    });
    p.prim(new THREE.ConeGeometry(0.05, 0.22, 4), 'green', -0.42, top + 0.18, 0.03);
    p.prim(new THREE.ConeGeometry(0.045, 0.18, 4), 'sage', 0.43, top + 0.16, -0.02);
  },

  // a potted plant: a clay pot and a fan of leaves; `look` is unused (about 110 tris)
  plant(p, { h }) {
    p.cyl(0.2, 0.15, 0, 0.32, 10, 'copper', 0, 0);
    p.cyl(0.2, 0.2, 0.31, 0.33, 10, 'brown', 0, 0);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const len = (h - 0.3) * (0.7 + 0.3 * ((i * 5) % 3) / 2);
      const tilt = 0.35 + 0.08 * (i % 3);
      p.prim(new THREE.ConeGeometry(0.07, len, 5), i % 2 ? 'green' : 'sage', Math.cos(a) * 0.1, 0.32 + len / 2 - 0.02, Math.sin(a) * 0.1,
        (g) => { g.rotateZ(-Math.cos(a) * tilt); g.rotateX(Math.sin(a) * tilt); });
    }
  },

  // a wicker basket of knitting: a woven tub with a rim, a yarn ball and two needles
  basket(p, { w, d, h }) {
    const hw = w / 2;
    p.cyl(hw, hw * 0.88, 0, h, 10, 'tan', 0, 0, (g) => g.scale(1, 1, d / w));
    p.cyl(hw + 0.015, hw + 0.015, h - 0.03, h, 10, 'lightWood', 0, 0, (g) => g.scale(1, 1, d / w));
    p.prim(new THREE.SphereGeometry(0.1, 6, 4), 'red', -0.05, h + 0.03, 0.02);
    for (const s of [-1, 1]) p.cyl(0.008, 0.008, 0, 0.5, 4, 'lightWood', s * 0.08, 0, (g) => { g.rotateZ(s * 0.35); g.translate(0, h + 0.1, 0); });
  },

  // a wicker chair: a woven seat, a round-topped back and a rose cushion
  wickerchair(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.07) - 0.025, sx * (hw - 0.07) + 0.025, 0, 0.42, sz * (hd - 0.07) - 0.025, sz * (hd - 0.07) + 0.025, 'tan', ['y-', 'y+']);
    p.box(-hw + 0.04, hw - 0.04, 0.4, 0.46, -hd + 0.04, hd - 0.04, 'tan', ['y-']);
    p.box(-hw + 0.06, hw - 0.06, 0.46, 0.52, -hd + 0.12, hd - 0.06, 'rose', ['y-']);
    p.box(-hw + 0.04, hw - 0.04, 0.46, h - 0.1, -hd + 0.04, -hd + 0.1, 'tan', ['y-', 'y+']);
    p.cyl(hw - 0.04, hw - 0.04, -hd + 0.04, -hd + 0.1, 10, 'tan', 0, 0, (g) => { alongZ(g); g.translate(0, h - 0.1, 0); });
  },

  // a stone bird bath: a pedestal, a shallow bowl, water, a little bird on the rim (about 120 tris)
  birdbath(p, { h }) {
    p.cyl(0.2, 0.22, 0, 0.1, 10, 'stone', 0, 0);
    p.cyl(0.07, 0.1, 0.1, h - 0.2, 8, 'stone', 0, 0);
    p.cyl(0.3, 0.14, h - 0.2, h, 12, 'stone', 0, 0);
    p.cyl(0.26, 0.26, h - 0.03, h - 0.01, 12, 'sky', 0, 0);
    p.prim(new THREE.SphereGeometry(0.05, 6, 4), 'brown', 0.22, h + 0.04, 0.05);
    p.prim(new THREE.ConeGeometry(0.02, 0.05, 4), 'gold', 0.27, h + 0.04, 0.05, (g) => g.rotateZ(-Math.PI / 2));
  },

  // the lower bunk, a trundle bed pulled out in front of the top bunk, a top she stands on at 0.55: a frame,
  // a mattress, a blanket and a pillow at its far end (local +x, the house plan's south).
  bunklow(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    for (const s of [-1, 1]) {
      p.box(-hw, hw, 0.2, 0.32, s > 0 ? hd - 0.05 : -hd, s > 0 ? hd : -hd + 0.05, 'darkWood', ['y-']); // the long rails
      p.box(s > 0 ? hw - 0.05 : -hw, s > 0 ? hw : -hw + 0.05, 0.2, 0.34, -hd, hd, 'darkWood', ['y-']); // the ends
    }
    p.box(-hw + 0.05, hw - 0.05, 0.3, h - 0.06, -hd + 0.05, hd - 0.05, 'white', ['y-']); // the mattress
    p.box(-hw + 0.06, hw - 0.5, h - 0.06, h - 0.02, -hd + 0.06, hd - 0.06, 'gingham', ['y-']); // the blanket
    p.box(hw - 0.5, hw - 0.1, h - 0.06, h, -hd + 0.15, hd - 0.15, 'rose', ['y-']); // the pillow, flush
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.04) - 0.03, sx * (hw - 0.04) + 0.03, 0, 0.2, sz * (hd - 0.04) - 0.03, sz * (hd - 0.04) + 0.03, 'darkWood', ['y-', 'y+']);
  },

  // the top bunk, 1.6 m up, its frame standing on the floor: four posts to 2.05, a lower mattress under it
  // (the bunk's own, out of her reach), the top mattress, a blanket, a pillow at the north end, a ladder
  // on the room's side
  bunktop(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.box(sx * (hw - 0.03) - 0.03, sx * (hw - 0.03) + 0.03, 0, h + 0.45, sz * (hd - 0.03) - 0.03, sz * (hd - 0.03) + 0.03, 'darkWood', ['y-']);
    }
    // the lower mattress, on a low frame between the posts
    p.box(-hw + 0.04, hw - 0.04, 0.2, 0.28, -hd + 0.04, hd - 0.04, 'darkWood', ['y-']);
    p.box(-hw + 0.05, hw - 0.05, 0.28, 0.5, -hd + 0.05, hd - 0.05, 'white', ['y-']);
    p.box(-hw + 0.05, hw - 0.5, 0.5, 0.53, -hd + 0.06, hd - 0.06, 'rugRed', ['y-']);
    for (const s of [-1, 1]) {
      p.box(-hw, hw, h - 0.2, h - 0.1, s > 0 ? hd - 0.05 : -hd, s > 0 ? hd : -hd + 0.05, 'darkWood', ['y-']);
      p.box(s > 0 ? hw - 0.05 : -hw, s > 0 ? hw : -hw + 0.05, h - 0.2, h - 0.08, -hd, hd, 'darkWood', ['y-']);
    }
    p.box(-hw + 0.05, hw - 0.05, h - 0.12, h - 0.02, -hd + 0.05, hd - 0.05, 'white', ['y-']); // the top mattress
    p.box(-hw + 0.05, hw - 0.4, h - 0.02, h, -hd + 0.06, hd - 0.06, 'gingham', ['y-']);
    p.box(hw - 0.4, hw - 0.08, h - 0.02, h + 0.02, -hd + 0.15, hd - 0.15, 'rose', ['y-']);
    // the ladder, on the room's side at the north end: two rails and three rungs
    for (const x of [-hw + 0.12, -hw + 0.52]) p.box(x - 0.02, x + 0.02, 0, h - 0.1, hd, hd + 0.04, 'lightWood', ['y-']);
    for (const y of [0.45, 0.85, 1.25]) p.box(-hw + 0.12, -hw + 0.52, y - 0.015, y + 0.015, hd, hd + 0.04, 'lightWood', ['z-']);
  },

  // a low child's bed under the window: legs, a frame, a mattress, a gingham blanket, a pillow, a headboard
  kidbed(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(sx * (hw - 0.04) - 0.03, sx * (hw - 0.04) + 0.03, 0, 0.14, sz * (hd - 0.04) - 0.03, sz * (hd - 0.04) + 0.03, 'darkWood', ['y-', 'y+']);
    p.box(-hw, hw, 0.14, 0.3, -hd, hd, 'lightWood', ['y-']);
    p.box(-hw + 0.03, hw - 0.03, 0.3, h - 0.03, -hd + 0.03, hd - 0.03, 'white', ['y-']);
    p.box(-hw + 0.03, hw - 0.03, h - 0.03, h, -hd + 0.55, hd - 0.03, 'gingham', ['y-']);
    p.box(-hw + 0.1, hw - 0.1, h - 0.03, h + 0.04, -hd + 0.1, -hd + 0.45, 'sky', ['y-']);
    p.box(-hw - 0.01, hw + 0.01, 0.14, 0.78, -hd, -hd + 0.06, 'lightWood', ['y-']); // the headboard, at the wall
  },

  // the claw-foot bath: a top she walks at 0.6. A white tub, its inside filled to the rim with a
  // heap of folded towels (a flat top, no dip: a hop of 0.3 is no hop), brass taps at the head end,
  // four claw feet (about 150 tris). Local +x is the head end.
  tub(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0.14, h - 0.02, -hd, hd, 'white', ['y-', 'y+']);
    p.box(-hw + 0.1, hw - 0.1, h - 0.02, h, -hd + 0.1, hd - 0.1, 'sky', ['y-']); // the towels
    for (const s of [-1, 1]) {
      p.box(-hw, hw, h - 0.02, h, s > 0 ? hd - 0.1 : -hd, s > 0 ? hd : -hd + 0.1, 'white', ['y-']);
      p.box(s > 0 ? hw - 0.1 : -hw, s > 0 ? hw : -hw + 0.1, h - 0.02, h, -hd + 0.1, hd - 0.1, 'white', ['y-']);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.cyl(0.05, 0.035, 0, 0.16, 6, 'brass', sx * (hw - 0.18), sz * (hd - 0.14));
    }
    p.cyl(0.02, 0.02, h, h + 0.22, 6, 'brass', hw - 0.08, 0);
    p.cyl(0.02, 0.02, 0.0, 0.1, 6, 'brass', hw - 0.08, 0, (g) => { alongX(g); g.translate(-0.05, h + 0.2, 0); });
    for (const s of [-1, 1]) p.box(hw - 0.12, hw - 0.04, h, h + 0.1, s * 0.12 - 0.02, s * 0.12 + 0.02, 'brass');
  },

  // a pedestal basin with brass taps and a bar of soap
  washbasin(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.cyl(0.1, 0.13, 0, h - 0.12, 8, 'white', 0, -hd + 0.2);
    p.box(-hw, hw, h - 0.14, h, -hd, hd, 'white');
    p.box(-hw + 0.06, hw - 0.06, h, h + 0.006, -hd + 0.06, hd - 0.1, 'sky', ['y-']); // the water
    p.box(-hw, hw, h, h + 0.1, -hd, -hd + 0.04, 'white', ['y-']); // the splashback
    p.cyl(0.015, 0.015, h, h + 0.12, 6, 'brass', 0, -hd + 0.08);
    p.cyl(0.012, 0.012, 0, 0.1, 6, 'brass', 0, -hd + 0.08, (g) => { alongZ(g); g.translate(0, h + 0.1, 0.05); });
    p.box(hw - 0.2, hw - 0.08, h, h + 0.03, -0.05, 0.05, 'rose', ['y-']);
  },

  // a toilet: a bowl, a seat and lid, a high cistern behind (its top the knock-over perch)
  toilet(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.cyl(0.14, 0.12, 0, 0.4, 8, 'white', 0, hd - 0.28, (g) => g.scale(1, 1, 1.25));
    p.cyl(0.19, 0.19, 0.4, 0.45, 10, 'white', 0, hd - 0.26, (g) => g.scale(1, 1, 1.25));
    p.cyl(0.17, 0.17, 0.45, 0.48, 10, 'tan', 0, hd - 0.26, (g) => g.scale(1, 1, 1.15));
    p.box(-hw, hw, 0.35, h - 0.04, -hd, -hd + 0.2, 'white', ['y-']);
    p.box(-hw - 0.01, hw + 0.01, h - 0.04, h, -hd - 0.01, -hd + 0.21, 'white'); // the cistern's lid, its top flush at h (the knock-over's perch)
    p.box(0.1, 0.18, h, h + 0.05, -hd + 0.04, -hd + 0.08, 'brass'); // the flush button
  },
};

// Walked-over pieces (r 0, at most 0.7 m high): the blanket fort, a ring of blankets and cushions on the floor.
export const WING_FLAT_BUILDERS = {
  // the laundry basket she can sit in (a box: the `sits` goal): four woven walls round a heap of towels, open top, no collider
  laundrybasket(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0, 0.05, -hd, hd, 'tan');
    p.box(-hw, hw, 0, h, -hd, -hd + 0.04, 'tan', ['y-']);
    p.box(-hw, hw, 0, h, hd - 0.04, hd, 'tan', ['y-']);
    p.box(-hw, -hw + 0.04, 0, h, -hd + 0.04, hd - 0.04, 'tan', ['y-']);
    p.box(hw - 0.04, hw, 0, h, -hd + 0.04, hd - 0.04, 'tan', ['y-']);
    p.box(-hw + 0.04, hw - 0.04, 0.05, 0.22, -hd + 0.04, hd - 0.04, 'white', ['y-']); // a heap of washing she sits on
    p.box(-hw + 0.08, 0.05, 0.22, 0.27, -hd + 0.08, 0.02, 'sky', ['y-']);
  },

  fort(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0, h, -hd, -hd + 0.05, 'gingham', ['y-']); // the back sheet
    p.box(-hw, -hw + 0.05, 0, h * 0.8, -hd, hd, 'curtainRed', ['y-']);
    p.box(hw - 0.05, hw, 0, h * 0.8, -hd, hd, 'curtainBlue', ['y-']);
    p.box(-hw + 0.08, -hw + 0.55, 0, 0.14, -hd + 0.12, -hd + 0.6, 'rose', ['y-']);
    p.box(hw - 0.58, hw - 0.08, 0, 0.12, -hd + 0.2, -hd + 0.7, 'sky', ['y-']);
    p.box(-0.1, 0.1, 0, 0.05, 0, 0.1, 'gold'); // a torch lying on the floor
  },
};

// A zone's far look: one open box per room (walls and a floor, no roof) and one wedge per stair, 10 and 12 triangles, one mesh,
// no shadows (at most 120 triangles in all). `boxes`: [{ minX, maxX, minZ, maxZ, y0, y1, color }];
// `wedges`: a stair along x as a ramp over a solid, [{ x0, x1, z, width, y0, y1, base, color }]
// (its top rises from y0 at x0 to y1 at x1, its underside at `base`).
export function boxStandInMesh(zone, boxes, wedges = []) {
  const withColor = (g, hex) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  // a room: four walls (outward faces) and a floor, no roof, so a camera above or inside it sees an
  // empty room, never a lid over the cat (10 triangles)
  const geos = boxes.map((b) => {
    const box = new THREE.BoxGeometry(b.maxX - b.minX, b.y1 - b.y0, b.maxZ - b.minZ);
    const idx = box.index.array;
    const keep = [];
    for (const g of box.groups) if (g.materialIndex !== 2 && g.materialIndex !== 3) for (let i = g.start; i < g.start + g.count; i++) keep.push(idx[i]);
    box.setIndex(keep);
    box.clearGroups();
    box.translate((b.minX + b.maxX) / 2, (b.y0 + b.y1) / 2, (b.minZ + b.maxZ) / 2);
    box.deleteAttribute('uv');
    const floor = new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ);
    floor.rotateX(-Math.PI / 2);
    floor.translate((b.minX + b.maxX) / 2, b.floorY ?? b.y0, (b.minZ + b.maxZ) / 2);
    floor.deleteAttribute('uv');
    return [withColor(box, b.color), withColor(floor, b.floorColor ?? b.color)];
  }).flat();
  for (const w of wedges) {
    const za = w.z - w.width / 2;
    const zb = w.z + w.width / 2;
    const A = [w.x0, w.base, za], B = [w.x0, w.base, zb], C = [w.x0, w.y0, za], D = [w.x0, w.y0, zb];
    const E = [w.x1, w.base, za], F = [w.x1, w.base, zb], G = [w.x1, w.y1, za], H = [w.x1, w.y1, zb];
    // the ramp's top, its two sides, its foot, its end, its underside, each wound outward
    const tris = [[C, D, H], [C, H, G], [A, C, G], [A, G, E], [B, F, H], [B, H, D], [A, B, D], [A, D, C], [E, G, H], [E, H, F], [A, E, F], [A, F, B]];
    const pos = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => t.forEach((v, k) => pos.set(v, i * 9 + k * 3)));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    geos.push(withColor(g, w.color));
  }
  const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), litMaterial(0xffffff, { vertexColors: true }));
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.noCast = true;
  m.userData.houseSimple = zone;
  m.name = `houseStandIn:${zone}`;
  return m;
}
