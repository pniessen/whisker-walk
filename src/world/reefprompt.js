// The Reef's prompt arbiter: ONE function that decides whose offer the action button shows. The sources are asked in order of priority and the first with a
// line wins; the same source then hears the press. Marlo and the errand come first (the story's life asks both), the Sealab's hatch is last, so a hatch never
// hides a hello or a shell; a later offer (a mount, a fuse) is added to the list, never fought over.
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
