// The start-up side of couch play (two cats, one screen): a flag and one slot
// for the chunk (src/coop/*, loaded only when couch play is on). No imports, and
// nothing here may import src/coop/ (scripts/buildjson.mjs fails the build).
// Off: `poll` stays null, so the frame loop's one extra line does nothing.
export const coop = { poll: null, pad: null, frame: null, late: null }; // poll(dt): the chunk's per-frame work; pad: cat one's pad; frame/late: after player.update / the walk's interactions
export const coopWanted = (search) => /[?&]coop=1\b/.test(search);
export const coopMode = (search, on) => !/[?&]coop=0\b/.test(search) && (coopWanted(search) || on === true); // ?coop=0/1 win over the per-device Settings switch
