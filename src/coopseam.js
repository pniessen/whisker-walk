// The start-up side of couch play (two cats, one screen): a flag and one slot
// for the chunk (src/coop/*, loaded only by ?coop=1). No imports, and nothing
// here may import src/coop/: the build fails if the chunk joins start-up
// (scripts/buildjson.mjs). With the flag off `poll` stays null, so the frame
// loop's one extra line does nothing and solo play is today's.
export const coop = { poll: null }; // poll(dt): the chunk's per-frame work, null = nobody listens
export const coopWanted = (search) => /[?&]coop=1\b/.test(search); // this page load only, never saved
