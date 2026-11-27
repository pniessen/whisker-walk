import { describe, it, expect, afterEach } from 'vitest';
import { coop, joined, reset, newSession, CATALOG } from './helpers/couchrig.js';
import { teleKit } from './helpers/tele.js';
import { setTele } from '../src/teleflag.js';
import { COOP_READY } from '../src/coop/table.js';
import { createCrossing } from '../src/game/crossing.js';
import { phrase } from '../src/clanphrases.js';

// Teleport gates carry couch play (tele-room): cat two goes through with cat one, lands beside her in the place beyond
// with both pads still working, and is refused only while one of the two places is not couch-ready.
const T = await import('../src/teleport.js');
const { TELE_ENDS } = T;
const PG = TELE_ENDS.park[0];
const GP = TELE_ENDS.greenhouse[0];
const state = (walks = {}) => ({ edition: 'canon', walks: { park: 5, greenhouse: 5, seaside: 5, ...walks } });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

afterEach(() => { reset(); setTele(null); });

describe('couch play through a teleport gate', () => {
  it('cat two is carried: both cats are in the Greenhouse, cat two beside cat one, and the gate is open the whole way', async () => {
    setTele(true);
    await teleKit({ couch: () => coop.two });
    const r = joined({ areaId: 'park' });
    expect(coop.two).toBe(true);
    expect(T.teleStatus(PG, state(), CATALOG, { couch: coop.two }).kind).toBe('go');
    r.setSession(newSession('greenhouse')); // what walkOn does: the walk is freed and the next one starts at the twin gate
    r.tick(3);
    expect(coop.two).toBe(true); // waiting to come along
    r.tick(10);
    expect(r.h.state.joined).toBe(true);
    expect(r.two()).toBeTruthy();
    // the new walk's own cat one is the new session's; cat two stands within a body or two of her
    expect(dist(r.two().group.position, r.ctx.getSession().cat.position)).toBeLessThan(4);
    expect(T.teleStatus(GP, state(), CATALOG, { couch: coop.two }).kind).toBe('go'); // and the way home
  });

  it('a place that is not couch-ready keeps cat two out, with the kind line; a cat with no cat two is never refused', async () => {
    await teleKit({ couch: () => true, coopReady: (id) => (id === 'reef' ? false : COOP_READY[id] === true) });
    const seaside = TELE_ENDS.seaside[0];
    expect(seaside.to).toBe('reef');
    expect(T.teleStatus(seaside, state(), CATALOG, { couch: true })).toMatchObject({ kind: 'coop', lineId: 'tele.coop' });
    expect(T.teleStatus(seaside, state(), CATALOG, { couch: false }).kind).toBe('go');
    expect(phrase('tele.coop')).toMatch(/Two cats go together/);
    await teleKit();
  });

  it('the gate\'s card says the second cat comes too, and a lone cat\'s does not', async () => {
    setTele(true);
    await teleKit();
    const r = joined({ areaId: 'park' });
    const mk = (s) => {
      const overlay = { innerHTML: '', classList: { remove() {}, add() {} }, querySelector: () => null };
      const c = createCrossing({ getSession: () => s, overlay, hud: { toast() {} }, releaseControl() {}, resumeWalk() {}, endWalk() {}, getIsTouch: () => false, getEdition: () => 'canon' });
      return { c, overlay };
    };
    const status = T.teleStatus(PG, state(), CATALOG);
    const card = (extras) => T.prompt({ areaId: 'park' }, { x: PG.x + 1, z: PG.z }, state(), false, () => {}, true).prompt.data.card(extras);
    const two = mk(r.session);
    two.c.askGate(r.session, { end: PG, status, card });
    expect(two.overlay.innerHTML).toContain('Siamese comes too.');
    const alone = newSession('park');
    const solo = mk(alone);
    solo.c.askGate(alone, { end: PG, status, card });
    expect(solo.overlay.innerHTML).not.toContain('comes too');
    expect(solo.overlay.innerHTML).toContain('btn-cross-yes');
  });
});
