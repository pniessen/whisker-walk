// The Market Square's lazy stages (the Old House's way, src/world/housestages.js). The base chunk (market.js and what the square draws) holds the landing; the stage chunks are the square's
// LIFE side, fetched with it by the area loader (areas.js), so they are always in before build() or the life runs and nothing appears later than before (2026-11, same behaviour):
//   live: the stallholders' sneak game (src/marketlive.js: the keepers, the rules' clock, the bubbles and the broom), the module itself in ST.live
//   life: the square's life (marketstagelife.js: the apples, petals, musician, sounds, errands, seasons and creatures, world/marketlife.js and what only it uses), as ST.life.createMarketLife
export const ST = {};

export const MARKET_STAGE_MODULES = Object.freeze(['src/marketlive.js', 'src/world/marketstagelife.js']);

let loading = null;
/** Loads the stages together; the same promise every time (a failed download is tried again on the next ask). */
export function loadMarketStages() {
  loading ??= Promise.all([import('../marketlive.js'), import('./marketstagelife.js')]).then(([live]) => { ST.live = live; return ST; }).catch((e) => { loading = null; throw e; });
  return loading;
}
