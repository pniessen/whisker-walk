import { describe, it, expect } from 'vitest';
import { createNet, createFakeHub } from '../src/net.js';
import { createNetEvents, areaLifeSender } from '../src/game/netevents.js';

// Two walks in one room: a story step one cat's area life sends (ctx.sendEvent) reaches the partner's areaLife.credit, only in the same area.
const walk = async (hub, playerId, areaId, ctxOut) => {
  const net = createNet(hub.transport());
  await net.join('RF42', { playerId, petName: playerId, breed: 'tabby', accessories: {} });
  const credited = [];
  const s = { playerId, areaId, net, areaLife: { credit: (ev) => credited.push(ev) }, remotes: { list: [] } };
  const { applyRemoteEvent } = createNetEvents({ MP: 1, getCloud: () => null, getPsecret: () => null, log: {}, hud: { toast() {} }, audio: {}, samples: { has: () => false }, catVoice() {}, applyGoalResult() {}, getPartner: () => null });
  net.onEvent((ev) => applyRemoteEvent(s, ev));
  ctxOut.sendEvent = areaLifeSender(() => s, areaId);
  return { s, credited };
};

describe('a story step crosses the room to the partner\'s area life', () => {
  it('a fuse, the lab show start and a hunt step sent by one cat are credited on the other, never on the sender', async () => {
    const hub = createFakeHub();
    const ca = {}; const cb = {};
    const a = await walk(hub, 'aaaa-player-01', 'reef', ca);
    const b = await walk(hub, 'bbbb-player-02', 'reef', cb);
    const steps = [{ kind: 'fuse', fuse: 'a' }, { kind: 'labshow', elapsed: 0 }, { kind: 'map' }, { kind: 'clue', clue: 1 }];
    for (const st of steps) ca.sendEvent(st);
    expect(b.credited).toEqual(steps);
    expect(a.credited).toEqual([]);
  });
  it('a partner in another area ignores it, and a solo walk (no net) sends nothing', async () => {
    const hub = createFakeHub();
    const ca = {}; const cb = {};
    await walk(hub, 'aaaa-player-01', 'reef', ca);
    const b = await walk(hub, 'bbbb-player-02', 'crystal', cb);
    ca.sendEvent({ kind: 'fuse', fuse: 'a' });
    expect(b.credited).toEqual([]);
    expect(() => areaLifeSender(() => ({ net: null }), 'reef')({ kind: 'map' })).not.toThrow();
  });
});
