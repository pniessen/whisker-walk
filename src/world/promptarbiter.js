// The shared prompt arbiter: ONE function that decides whose offer the action button shows. A copy of reefprompt.js (the Reef keeps its own); the Crystal Cave uses
// this one and the Moon will. The sources are asked in order of priority and the first with a line wins; the same source then hears the press. A later offer (a boat,
// a cart, a forge) is a stage slot that answers null until its stage fills it, so it is added to the list, never fought over.
// createPromptArbiter([source, ...]) -> { promptAt(catPos, ...rest), interact() }; a source is { promptAt(catPos, ...rest) -> line | null, interact() }.
export function createPromptArbiter(sources) {
  let used = null;
  return {
    promptAt(catPos, ...rest) {
      used = null;
      for (const s of sources) {
        const line = s?.promptAt?.(catPos, ...rest);
        if (line) { used = s; return line; }
      }
      return null;
    },
    interact() {
      const s = used;
      used = null;
      return s?.interact?.() ?? null;
    },
  };
}
