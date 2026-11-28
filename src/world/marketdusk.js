// The square's dusk dial, a leaf (no imports) so the landing chunk (market.js) and the life stage (marketstagelife.js, marketlife.js) share it without importing each other.
// market.js re-exports every name here, so nothing that imported them from market.js changes.
export const LANTERN_MAX = 1.6; // the lanterns' emissiveIntensity at full dusk
export const LANTERN_DAY = 0.6; // and by day (beauty pass 2: a lit lantern's warm glow shows in the sun too, no real light)
export const WINDOW_GLOW = 1.0; // the lit shop and house windows' at full dusk

// setMarketDusk(area, k): k 0 (day) .. 1 (dusk). The lanterns' one material
// glows LANTERN_MAX * k; past half way the stalls pack up (cloths over two
// displays, crates stacked) and the baskets of produce are put away. The
// treats stay. Idempotent.
export function setMarketDusk(area, k) {
  const t = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 0));
  const look = area?.look;
  if (!look) return;
  look.lantern.emissiveIntensity = LANTERN_DAY + (LANTERN_MAX - LANTERN_DAY) * t;
  look.windows.emissiveIntensity = WINDOW_GLOW * t;
  const packed = t > 0.5;
  look.packing.visible = packed;
  look.baskets.visible = !packed;
  look.level = t;
}
