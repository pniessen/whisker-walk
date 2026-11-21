// The soft bumps of a person (rulings R28-R30): the fixed circles the cat
// slides round, as she slides round a post or a bench. player.update keeps
// her middle (by r + CAT_RADIUS), her head's middle (by r + her head's
// radius) and her body's two ends (by r + her body's radius) out of every
// one. A grown-up who kneels for the head scratch has three: one on the body,
// one where the kneel's raised knee is and one where its back foot is; the
// circles stand there all walk, kneeling or standing, and never grow or move
// (people never push her). Older people (who bow) and children (who never
// kneel) have the body's circle only. Every radius comes from the person's
// own body (their look is the spot's, so two co-walkers have the same).
import { kneelSpots } from './pose.js';

// radii (m), in the person's height scale and girth (dims.s, the height over
// 1.75 m, times the look's girth): fitted to the largest and smallest of each
// kind in the clothes that stand out most (a coat over a skirt), every
// preset cat, every side and heading (Task 11 fix 1c report)
export const BUMP = Object.freeze({
  BODY: 0.335, // a grown-up's body, standing or kneeling
  OLDER: 0.3, // an older person's body, standing or bowing
  CHILD: 0.35, // a child's body (standing: children never kneel for the scratch)
  BACK: 0.06, // the body's circle sits this far behind their middle (their back
  // and the kneel's thigh need more room than their front, where she stands)
  KNEE: 0.1, // the kneel's raised knee
  FOOT: 0.06, // the kneel's back foot
});

// The circles, figure frame: [{ x, z, r }], into `out` (made once per person).
export function bumpCircles(look, out = []) {
  out.length = 0;
  const s = look.dims.s * look.girth;
  const back = BUMP.BACK * look.dims.s;
  if (look.kind === 'child') { out.push({ x: 0, z: back, r: BUMP.CHILD * s }); return out; }
  if (look.kind === 'older') { out.push({ x: 0, z: back, r: BUMP.OLDER * s }); return out; }
  out.push({ x: 0, z: back, r: BUMP.BODY * s });
  const k = kneelSpots(look);
  out.push({ x: k.kneeX, z: k.kneeZ, r: BUMP.KNEE * s }, { x: k.footX, z: k.footZ, r: BUMP.FOOT * s });
  return out;
}
