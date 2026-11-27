import { HEAD, SKULL } from './torso.js';
import { layScar, layNick, skullSurface, coatBase, fullColour, hangMesh, fitScars, UP, FWD, OUT } from './scarmesh.js';

// The builder's scar mark (builder-scars, 2026-11-27): ONE small healed stroke
// on the cat's right, chosen in the cat builder (customcats.js SCARS) and
// permanent. It is its own mesh, 'marks' (kept apart so a fight scar's
// setCatScars never wipes it), built once with the cat and fitted with it
// (fitScars). At most 8 triangles and 10 vertices; 'none' or an unknown id
// builds nothing. Head marks sit on the skull, ear marks on the right ear.
export const SCAR_MARKS = Object.freeze({
  nose: Object.freeze({ dir: [0, 0.06, -0.2], ref: [1, 0, 0], toward: UP, slant: 0.4, length: 0.05, width: 0.013 }),
  brow: Object.freeze({ dir: [0.1, 0.12, -0.155], ref: UP, toward: OUT, slant: 0.5, length: 0.08, width: 0.012 }),
  cheek: Object.freeze({ dir: [0.2, -0.06, -0.12], ref: [0, -1, 0], toward: FWD, slant: 0.5, length: 0.09, width: 0.015 }),
  nick: Object.freeze({ ear: [[0.08, 0.62], [0.55, 0.46], [0.95, 0.62]] }),
  tip: Object.freeze({ ear: [[0.1, 0.84], [0.5, 0.68], [0.9, 0.84]] }),
});

// Called once, after build (model.js loads this file on first use, so it stays
// out of start-up), so nothing is removed first.
export function setCatMark(cat, id) {
  const m = SCAR_MARKS[id];
  const { head, body, earR } = cat.userData.parts;
  if (!Object.hasOwn(SCAR_MARKS, id)) return;
  const base = coatBase(body.geometry);
  const out = { points: [], normals: [], under: [], strips: [], units: HEAD.SCALE };
  const skull = head.children.find((c) => c.isMesh && c.geometry.parameters?.radius === SKULL.R);
  if (!(m.ear ? earR?.isMesh && layNick(earR, 1, out, m.ear, 0.02)
    : layScar({ ...m, gap: 0, single: true }, 1, skullSurface(skull ? skull.material.color.clone() : base), out))) return;
  const full = fullColour(out.under, base);
  const rest = out.points.flatMap((p) => p.toArray());
  // head marks: [0, n) ride the head; ear marks: [0, n) ride the ear (split 0)
  cat.userData.parts.marks = hangMesh(cat, 'marks', {
    rest, restNormal: out.normals.flatMap((v) => v.toArray()), colours: out.points.flatMap(() => full.toArray()),
    under: out.under.flatMap((u) => u.toArray()), strips: out.strips, split: m.ear ? 0 : out.points.length, earSplit: out.points.length, earKey: m.ear ? 'earR' : null,
  });
  fitScars(cat);
}

