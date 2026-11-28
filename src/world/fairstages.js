// The Fairground's lazy stages (the Old House's way, src/world/housestages.js). The base chunk (fair.js and what the fair already draws) holds the landing; the two stage chunks are the
// fair's LIFE side, which the area loader already fetched beside it (areas.js) and which now count as stages, not as part of the landing's download (2026-11, same behaviour):
//   live: the rides' clock, the crowd's reactions and the beauty pass's small life (src/fairlive.js, fairsim.js, fairalive.js)
//   show: the games, the visitors and the stall show (src/fairshow.js, fairgames.js, fairvisitors.js)
// ST.live / ST.show are the two modules themselves; the loader awaits both with the base chunk, so nothing appears later than before.
export const ST = {};

export const FAIR_STAGE_MODULES = Object.freeze(['src/fairlive.js', 'src/fairshow.js']);

let loading = null;
/** Loads the two stages together; the same promise every time (a failed download is tried again on the next ask). */
export function loadFairStages() {
  loading ??= Promise.all([import('../fairlive.js'), import('../fairshow.js')]).then(([live, show]) => { ST.live = live; ST.show = show; return ST; }).catch((e) => { loading = null; throw e; });
  return loading;
}
