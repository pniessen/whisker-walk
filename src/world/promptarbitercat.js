// THE PER-CAT PROMPT ARBITER (split-screen couch play, docs/split-screen-s5-audit.md). A LAZY file, fetched only by the couch walk: the places' stage-A chunks keep the one-cat
// promptarbiter.js (and the Reef its reefprompt.js), whose size is pinned to the byte (test/lazybuild.test.js), so nothing about a solo walk changes.
// createPromptArbiter([source, ...]) -> { promptAt(catPos, catId = 0), interact(catId = 0) }; a source is { promptAt(catPos) -> line | null, interact(), forCats? }.
// Same rules as the one-cat arbiter (sources asked in order, the first line wins, the same source hears the press), with ONE `used` slot per cat (catId 0 = cat one, 1 = cat two)
// so the two cats' offers never cross. `forCats` says which cats a source may be offered to:
//   'one'  (the DEFAULT when absent: every source written before couch play reads cat one's session and has no path for cat two, so it is never offered to cat two)
//   'two'  a source for cat two only (it reads cat two's own state)
//   'both' a source that serves either cat: asked with (catPos, catId) and pressed with interact(catId). Every other source is called with (catPos) and interact() alone.
// promptAt(catPos) with no catId is cat one: the same calls, in the same order, as promptarbiter.js makes.
export function createPromptArbiter(sources) {
  const used = [];
  return {
    promptAt(catPos, c = 0) {
      used[c] = null;
      for (const s of sources) {
        const f = s?.forCats; // (absent = 'one')
        if (c ? f !== 'two' && f !== 'both' : f === 'two') continue;
        const line = f === 'both' ? s.promptAt?.(catPos, c) : s?.promptAt?.(catPos);
        if (line) { used[c] = s; return line; }
      }
      return null;
    },
    interact(c = 0) {
      const s = used[c];
      used[c] = null;
      return (s?.forCats === 'both' ? s.interact?.(c) : s?.interact?.()) ?? null;
    },
  };
}
