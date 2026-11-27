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
import { secretLeafGroup, furnitureMesh } from './houseparts.js';
import { SECRET_WARDROBE, HOUSE_LEVELS } from './houseplan.js';
import { WING_FEATHER } from './housewingthings.js';

const alongX = (g) => g.rotateZ(Math.PI / 2); // a cylinder's axis along x
const alongZ = (g) => g.rotateX(Math.PI / 2); // along z

// A platform of the cat tree: a board and a carpet top (flush with `h`), a sisal post with bands, a foot plate.
function treePlatform(p, w, d, h, carpet) {
  const hw = w / 2, hd = d / 2;
  p.box(-hw, hw, h - 0.07, h - 0.02, -hd, hd, 'lightWood', ['y+']);
  p.box(-hw + 0.02, hw - 0.02, h - 0.02, h, -hd + 0.02, hd - 0.02, carpet, ['y-']);
  p.cyl(0.1, 0.1, 0.05, h - 0.07, 8, 'tan', 0, 0);
  for (let y = 0.3; y < h - 0.2; y += 0.55) p.cyl(0.105, 0.105, y, y + 0.03, 8, 'brown', 0, 0);
  p.box(-0.22, 0.22, 0, 0.05, -0.22, 0.22, 'darkWood', ['y-']);
}

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

  // ---- the wonder room's pieces (milestone 3) ----

  // the cat tree's base box, 0.55 m: a carpeted sisal-wrapped box she hops onto from the floor
  treebase(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0, h - 0.02, -hd, hd, 'tan', ['y+']);
    p.box(-hw + 0.02, hw - 0.02, h - 0.02, h, -hd + 0.02, hd - 0.02, 'sage', ['y-']);
    p.box(-hw - 0.01, hw + 0.01, 0, 0.05, -hd - 0.01, hd + 0.01, 'darkWood', ['y-']);
  },

  // a platform of the cat tree (1.15 and 1.75 m): a carpeted board on a sisal post, a foot plate on the floor
  treeplat(p, { w, d, h }) { treePlatform(p, w, d, h, 'blue'); },
  // the crown (2.3 m), the same in rose
  treecrown(p, { w, d, h }) { treePlatform(p, w, d, h, 'rose'); },

  // the hammock shelf on the west wall (local -z is the wall): a sky-blue sling on a frame, two brackets, a few tassels along its front
  hammock(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, h - 0.04, h, -hd, hd, 'sky', ['y-']);
    p.box(-hw, hw, h - 0.09, h - 0.04, -hd, hd, 'lightWood', ['y-', 'y+']);
    for (const s of [-1, 1]) {
      p.box(s * (hw - 0.1) - 0.03, s * (hw - 0.1) + 0.03, h - 0.7, h - 0.09, -hd, -hd + 0.06, 'darkWood', ['y-', 'y+']);
      p.box(s * (hw - 0.1) - 0.03, s * (hw - 0.1) + 0.03, h - 0.12, h - 0.09, -hd, hd - 0.05, 'darkWood', ['y-', 'y+']);
    }
    for (let i = 0; i < 5; i++) p.box(-hw + 0.15 + (i * (w - 0.3)) / 4 - 0.015, -hw + 0.15 + (i * (w - 0.3)) / 4 + 0.015, h - 0.2, h - 0.04, hd, hd + 0.02, 'gold', ['z-']);
  },

  // the scratching post: a sisal tower on a base, a carpeted top, a bell on a ball
  scratchpost(p, { w, h }) {
    const hw = w / 2;
    p.box(-hw, hw, 0, 0.05, -hw, hw, 'darkWood', ['y-']);
    p.cyl(0.11, 0.11, 0.05, h - 0.06, 8, 'tan', 0, 0);
    for (const y of [0.3, 0.6, 0.9]) p.cyl(0.115, 0.115, y, y + 0.03, 8, 'brown', 0, 0);
    p.box(-hw + 0.05, hw - 0.05, h - 0.06, h, -hw + 0.05, hw - 0.05, 'blue', ['y-']);
    p.prim(new THREE.SphereGeometry(0.04, 5, 4), 'brass', hw - 0.12, 0.62, 0);
  },

  // the feather wand's beam: two posts, a top bar and an arm out over the floor (the spring and the feather are the wand, wandfeather)
  wandbeam(p, { w, h }) {
    const hw = w / 2;
    for (const s of [-1, 1]) p.box(s * (hw - 0.06) - 0.06, s * (hw - 0.06) + 0.06, 0, h, -0.06, 0.06, 'darkWood', ['y-']);
    p.box(-hw, hw, h - 0.12, h, -0.05, 0.05, 'darkWood', ['y-']);
    p.box(-0.03, 0.03, h - 0.09, h - 0.05, 0.05, 0.98, 'darkWood', ['y-']);
  },

  // the feather on its spring, hanging from the arm's tip (the group's pivot): a thread, a coil and the plume, local y 0 down to about -1.7
  wandfeather(p) {
    p.box(-0.006, 0.006, -1.1, -0.01, -0.006, 0.006, 'white');
    p.cyl(0.028, 0.028, -1.3, -1.1, 6, 'brass', 0, 0);
    p.box(-0.01, 0.01, -1.5, -1.3, -0.01, 0.01, 'tan');
    p.box(-0.06, 0.06, -1.78, -1.5, -0.008, 0.008, 'rose');
    p.box(-0.02, 0.02, -1.85, -1.78, -0.006, 0.006, 'gold');
  },

  // one run of the crinkly tunnel (local x along it): a floor mat, ribs of two heights and two colours down each side, a rail along each side's top; open on top and at both ends
  tunnelseg(p, { w, h }) {
    const hw = w / 2;
    p.box(-hw, hw, 0, 0.02, -0.62, 0.62, 'tan', ['y-']);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = -hw + 0.1 + (i * (w - 0.2)) / (n - 1);
      const hh = i % 2 ? h : h - 0.1;
      for (const s of [-1, 1]) {
        const z0 = s > 0 ? 0.5 : -0.6;
        p.box(x - 0.045, x + 0.045, 0.02, hh, z0, z0 + 0.1, i % 2 ? 'rose' : 'sky', ['y-']);
      }
    }
    for (const s of [-1, 1]) p.box(-hw, hw, h - 0.07, h - 0.03, s > 0 ? 0.52 : -0.58, s > 0 ? 0.58 : -0.52, 'white', ['y-']);
  },

  // the kids' wardrobe, the leaf that shuts the secret stair (its front faces the kids' room: two panelled doors, brass handles, a cornice, three faint paw scratches low on the left door)
  wardrobe(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    p.box(-hw, hw, 0.1, h - 0.14, -hd, hd, 'lightWood');
    p.box(-hw - 0.02, hw + 0.02, h - 0.14, h, -hd - 0.02, hd + 0.04, 'darkWood');
    p.box(-hw, hw, 0, 0.1, -hd + 0.03, hd - 0.02, 'darkWood');
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -hw + 0.06 : 0.02;
      const x1 = s < 0 ? -0.02 : hw - 0.06;
      p.box(x0, x1, 0.2, h - 0.22, hd, hd + 0.025, 'tan');
      p.box(x0 + 0.1, x1 - 0.1, 0.35, h - 0.4, hd + 0.025, hd + 0.04, 'lightWood');
      p.box(s * 0.07 - 0.015, s * 0.07 + 0.015, 1.0, 1.35, hd + 0.04, hd + 0.06, 'brass');
    }
    for (const x of [-0.7, -0.64, -0.58]) p.box(x - 0.007, x + 0.007, 0.45, 0.67, hd + 0.04, hd + 0.044, 'brown', ['z-']);
  },
};

// Walked-over pieces (r 0, at most 0.7 m high): the blanket fort, a ring of blankets and cushions on the floor.
export const WING_FLAT_BUILDERS = {
  // the cardboard box castle she can sit in (a box: the `sits` goal): four low walls with a gap for a door in the front, a battlement of little blocks on top
  castle(p, { w, d, h }) {
    const hw = w / 2, hd = d / 2;
    const top = h - 0.06;
    p.box(-hw, hw, 0, 0.02, -hd, hd, 'tan');
    p.box(-hw, hw, 0, top, -hd, -hd + 0.04, 'tan', ['y-']);
    p.box(-hw, -hw + 0.04, 0, top, -hd + 0.04, hd - 0.04, 'tan', ['y-']);
    p.box(hw - 0.04, hw, 0, top, -hd + 0.04, hd - 0.04, 'tan', ['y-']);
    for (const s of [-1, 1]) p.box(s > 0 ? 0.3 : -hw, s > 0 ? hw : -0.3, 0, top, hd - 0.04, hd, 'tan', ['y-']); // the front, a doorway between
    for (let i = 0; i < 4; i++) {
      const x = -hw + 0.12 + (i * (w - 0.24)) / 3;
      p.box(x - 0.07, x + 0.07, top, h, -hd, -hd + 0.04, 'brown', ['y-']);
    }
    for (const s of [-1, 1]) p.box(s * (hw - 0.02) - 0.02, s * (hw - 0.02) + 0.02, top, h, -0.3, 0.3, 'brown', ['y-']);
    p.box(-hw + 0.08, -hw + 0.55, 0.02, 0.1, -hd + 0.1, -hd + 0.55, 'rose', ['y-']); // a cushion to sit on
  },

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

// ---- the solarium's sunny slots (milestone 2) ----

// The four patches of sun on the floor: one additive decal mesh for the room, a soft disc each (eight triangles round a bright
// middle that fades to nothing at its edge, so 32 in all), lifted off the floor and the rug, never casting. The material's
// colour is the light's: gold by day, pale moon-blue at dusk (house life sets it, and breathes it while she lies in a slot).
export const SUN_DAY = Object.freeze([1.0, 0.8, 0.42]);
export const SUN_DUSK = Object.freeze([0.42, 0.56, 0.95]);
const SUN_SEG = 8;
const SUN_LIFT = 0.035;
export function sunPatchMesh(slots, y, size, zone) {
  const pos = [];
  const col = [];
  const index = [];
  for (const s of slots) {
    const base = pos.length / 3;
    pos.push(s.x, y + SUN_LIFT, s.z);
    col.push(0.5, 0.5, 0.5);
    for (let i = 0; i < SUN_SEG; i++) {
      const a = (i / SUN_SEG) * Math.PI * 2 + Math.PI / 8;
      pos.push(s.x + Math.cos(a) * size * 0.5, y + SUN_LIFT, s.z + Math.sin(a) * size * 0.5);
      col.push(0, 0, 0);
      index.push(base, base + 1 + ((i + 1) % SUN_SEG), base + 1 + i);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.color.setRGB(SUN_DAY[0], SUN_DAY[1], SUN_DAY[2]);
  const m = new THREE.Mesh(geo, mat);
  m.name = `houseSun:${zone}`;
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData = { noCast: true, dressing: true, noMerge: true, noContactShadow: true, houseDetail: true, houseLevel: zone };
  return m;
}

// ---- the wonder room's moving and hanging parts (milestone 3) ----

const ATTIC_Y = HOUSE_LEVELS.find((l) => l.id === 'attic').y;
const detail = (o, zone) => {
  o.userData.houseDetail = true;
  o.userData.houseLevel = zone;
  o.userData.noContactShadow = true;
  return o;
};

// The kids' wardrobe's leaf (a group on its hinge, the bookcase's way: housewingfinds.js swings it) and the feather on its spring
// (a group at the arm's tip: it swings, housewingfinds.js), the string lights and the skylight's pool of light. `material` is the house's
// atlas material. Every part is a detail of its zone (the kids' for the wardrobe, the wonder room's for the rest).
export function wonderParts(material) {
  const wardrobe = secretLeafGroup(material, SECRET_WARDROBE, WING_BUILDERS.wardrobe, { id: 'kids-wardrobe', name: 'houseWardrobe', level: 'upstairs', zone: 'kids', flag: 'wardrobe' });
  const wand = new THREE.Group();
  wand.name = 'houseFeatherWand';
  wand.position.set(WING_FEATHER.x, ATTIC_Y + 2.3 - 0.07, WING_FEATHER.z);
  wand.add(furnitureMesh({ id: 'wonder-feather', kind: 'wandfeather', x: 0, z: 0, w: 0.2, d: 0.1, h: 1.8, r: 0, rotY: 0, nocast: true }, material));
  wand.userData.noMerge = true;
  detail(wand, 'wonder');
  wand.visible = false;
  // string lights along the north and east walls: little gold diamonds on a sagging line, in two colours that twinkle in turn
  const y0 = ATTIC_Y + 2.62;
  const bulbs = [];
  const strand = (x0, z0, x1, z1, n) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      bulbs.push([x0 + (x1 - x0) * t, y0 - 0.22 * Math.sin(Math.PI * ((i % 5) + 0.5) / 5), z0 + (z1 - z0) * t]);
    }
  };
  strand(41.4, -13.85, 51.6, -13.85, 20);
  strand(51.85, -13.6, 51.85, -4.4, 18);
  const geos = [[], []];
  bulbs.forEach(([x, y, z], i) => { const g = new THREE.TetrahedronGeometry(0.06, 0); g.translate(x, y, z); geos[i % 2].push(g); });
  const parts = geos.map((list) => {
    const pos = [];
    for (const g of list) pos.push(...g.attributes.position.array);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  });
  const merged = new THREE.BufferGeometry();
  const posA = parts[0].attributes.position.array;
  const posB = parts[1].attributes.position.array;
  merged.setAttribute('position', new THREE.Float32BufferAttribute([...posA, ...posB], 3));
  merged.addGroup(0, posA.length / 3, 0);
  merged.addGroup(posA.length / 3, posB.length / 3, 1);
  const lightMats = [new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false }), new THREE.MeshBasicMaterial({ color: 0xffb0a0, fog: false })];
  const lights = new THREE.Mesh(merged, lightMats);
  lights.name = 'houseLights:wonder';
  lights.castShadow = false;
  lights.receiveShadow = false;
  lights.frustumCulled = false;
  lights.userData = { noCast: true, dressing: true, noMerge: true, noContactShadow: true };
  detail(lights, 'wonder');
  lights.visible = false;
  // the round skylight's pool of light on the floor: a soft cool disc
  const pool = sunPatchMesh([{ x: 46.4, z: -9.3 }], ATTIC_Y, 3.6, 'wonder');
  pool.name = 'houseSkylight:wonder';
  pool.material.color.setRGB(0.5, 0.58, 0.78);
  pool.visible = false;
  // the faint light under the wardrobe's doors at dusk, while it is shut (house life shows it)
  const lightUnder = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xffc870, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  lightUnder.name = 'houseWardrobeLight';
  lightUnder.rotation.x = -Math.PI / 2;
  lightUnder.position.set(SECRET_WARDROBE.x, HOUSE_LEVELS.find((l) => l.id === 'upstairs').y + 0.02, SECRET_WARDROBE.z + 0.4);
  lightUnder.castShadow = false;
  lightUnder.receiveShadow = false;
  lightUnder.userData = { noCast: true, dressing: true, noMerge: true };
  detail(lightUnder, 'kids'); // the kids' room's detail: shown only at dusk, while she is near and the wardrobe is shut (houselife.js)
  lightUnder.visible = false;
  return { wardrobe, wand, lights, lightMats, pool, lightUnder };
}
