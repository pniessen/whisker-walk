// =============================================================================
// THE MOON'S BOUND SWITCH (milestone 7b, Tier 2 jumping). ONE constant, read by world/moonplan.js (the rifts, the ring gates, their colliders and rock keep-outs)
// and world/moonlife.js (the bound's hook on the walk). `true`: a ground pounce at a run is the "bound" (world/moonbound.js). `false`: the Moon is exactly as milestone 7a
// shipped it (the plain hop, no rifts, no rings, no hook installed, the same rock scatter): nothing else needs to change. The owner's hand test on an iPhone and a pad
// decides; if the bound feels worse than the plain hop, set this to false (or delete milestone 7b). Nothing in the story, the rover, the rocket or the mice depends on it.
// =============================================================================
export const MOON_BOUND_ON = true;
