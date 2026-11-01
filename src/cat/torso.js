// The cat's "Version 2" proportions (docs/superpowers/specs/2026-10-31-cat-body-design.md):
// a shorter torso on longer legs. Numbers marked (sketch) come from the approved
// cat-shapes sketch; the rest keep today's cat where it already worked.

// The torso: radius, scale and centre height (sketch).
export const TORSO = { R: 0.32, SCALE: [0.8, 0.74, 1.12], CENTRE_Y: 0.43 };

// The old torso. Every authored marking and accessory point was written in
// this frame, so markings convert their points through it to keep their direction.
export const LEGACY_BODY = { CENTRE: [0, 0.34, 0], SCALE: [0.85, 0.75, 1.35] };

// Legs (sketch), except BOTTOM_R: the paw's width was tuned against 0.058.
export const LEGS = { LEN: 0.35, HIP_Y: 0.39, FRONT_Z: -0.24, HIND_Z: 0.24, FRONT_X: 0.11, HIND_X: 0.12, TOP_R: 0.046, BOTTOM_R: 0.058 };

// The paw centre in leg-local space, so the sole stays exactly where it is today
// (old hip 0.3, old paw 0.2585 below it).
export const PAW_Y = -(LEGS.HIP_Y - 0.3 + 0.2585);

// A standing sole's height above the ground: the paw centre less the flattened
// paw's half-height (0.062 * 0.62).
export const PAW_SOLE_GAP = 0.3 - 0.2585 - 0.062 * 0.62;

export const HEAD = { POS: [0, 0.70, -0.40], SCALE: 1.06 };

// The rig the poses in animator.js were written for: hip 0.3, hip-to-sole 0.2969.
export const REF_RIG = { HIP_Y: 0.30, REACH: 0.2585 + 0.062 * 0.62 };

// Per-state correction (metres, added after the pose and the long-leg fit):
// `body` moves every non-leg part, `head` overrides it for the head. Filled by
// measurement against the old rig's pose baseline (test/fixtures/catpose-baseline.json).
// The sit (requestPet, perch): the shorter torso, tilted back, leaves its rump
// 0.027 higher than the old one rested (torsoMin 0.0516 against 0.0246), so it
// comes down by exactly that. Every other state passes as it is.
export const POSE_FIT = {
  requestPet: { body: -0.027 },
  perch: { body: -0.027 },
};
