import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Child-safety pass on the walk's co-walk wiring (game/walk.js). startWalk
// needs a renderer, so the wiring is pinned as source; what it calls is tested
// for real in netevents.safety, netsafety and metplayers.

const src = () => readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
const rosterBlock = () => {
  const s = src();
  const a = s.indexOf('net.onRoster((roster) => {');
  return s.slice(a, s.indexOf('net.onState((state) => {', a));
};

describe('walk.js: who is drawn and named', () => {
  it('a hidden visitor is never upserted (not drawn, no name tag, not in the HUD roster)', () => {
    const r = rosterBlock();
    expect(r).toContain('const liveIds = new Set(roster.filter((p) => !blockList.has(p.playerId)).map((p) => p.playerId));');
    expect(r).toContain('if (!liveIds.has(p.playerId)) continue;');
    expect(r.indexOf('if (!liveIds.has(p.playerId)) continue;')).toBeLessThan(r.indexOf('remotes.upsert(p, nowSec())'));
  });
  it('netevents is told who is hidden, through the session', () => {
    expect(src()).toContain('session.isBlocked = (id) => blockList.has(id);');
  });
  it('a cat arriving mid-walk is toasted by its sanitized name, but not the ones there at the start', () => {
    const r = rosterBlock();
    expect(r).toContain("if (!firstSync) hud.toast(`${entry.petName} joined the walk 🐾`);");
  });
  it('ghosts come only from players this device met', () => {
    expect(src()).toContain('const otherIds = metOnly(deviceMetPlayers(), allIds);');
  });
});
