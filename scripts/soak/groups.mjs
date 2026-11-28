// Crash grouping for soak-out/summary.json: a crash is its message plus file:line;
// the same one found again only raises a count.
// The same failure is seen by up to three nets (the page's error event, the game's diagnostics
// record, DevTools). One entry per message; the one that knows its file and line wins.
export function mergeEntries(list) {
  const by = new Map();
  for (const e of list) {
    const key = `${e.kind === 'rejection' ? 'rejection' : 'error'}|${e.message}`;
    const have = by.get(key);
    if (!have || (!have.source && e.source) || (!have.line && e.line && e.source)) by.set(key, { ...(have ?? {}), ...e, count: Math.max(have?.count ?? 1, e.count ?? 1) });
  }
  return [...by.values()];
}

// The entry that names the cause: for a walk-ended card, the first real failure before it.
export function causeOf(c) {
  const list = c.entries ?? [];
  return list.find((e) => e.kind !== 'walk-ended') ?? list[0] ?? {};
}

export function crashSignature(c) {
  const e = causeOf(c);
  const where = `${e.source ?? ''}:${e.line ?? 0}`;
  const msg = (e.message ?? c.message ?? c.kind ?? '').replace(/\d+/g, 'N').slice(0, 140);
  return `${c.kind} | ${msg} | ${where}`;
}

// crashes: array of { signature?, kind, entries, runName, replay, place, cat }
export function groupCrashes(crashes) {
  const map = new Map();
  for (const c of crashes) {
    const key = c.signature ?? crashSignature(c);
    const e = causeOf(c);
    const g = map.get(key) ?? { signature: key, kind: c.kind, message: e.message ?? c.message ?? '', where: `${e.source ?? ''}:${e.line ?? 0}`, count: 0, places: {}, first: c.runName, replay: c.replay };
    g.count += 1;
    g.places[c.place] = (g.places[c.place] ?? 0) + 1;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
