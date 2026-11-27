// The singing chamber (milestone C5), joined to the cave through the stage registry: loaded with the `crystalplay` stage (one import line and one spread in
// crystalstageplay.js), so its chunk's size is counted there and the cave's base chunk never carries it. It gives crystal.js what it reads from ST.play: `createSong(ctx)`
// (the live, made once per walk and told her position each frame), `pads` (the prompt arbiter's slot: the offer at the pads) and `credit(ev)` (a partner's `wc-song`; any
// other kind answers null). It pushes the chamber's footprint into CRYSTAL_CLEARS once, so the rim rocks and pebbles are taken out of it AFTER the scatter (never KEEP_OUT).
import { CRYSTAL_CLEARS } from './crystalplan.js';
import { CLEAR } from './crystalsongplan.js';
import { createSongLive } from './crystalsonglive.js';

if (!CRYSTAL_CLEARS.includes(CLEAR)) CRYSTAL_CLEARS.push(CLEAR);

let current = null;
export const SONG_SLOTS = Object.freeze({
  createSong(ctx) {
    const live = createSongLive(ctx);
    const dispose = live.dispose;
    current = live;
    live.dispose = () => { if (current === live) current = null; dispose(); };
    return live;
  },
  pads: Object.freeze({ promptAt: (p) => current?.promptAt(p) ?? null, interact: () => current?.interact() ?? null }),
  credit: (ev) => current?.credit(ev) ?? null,
});
