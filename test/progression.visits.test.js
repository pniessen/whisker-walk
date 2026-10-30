import { describe, it, expect } from 'vitest';
import {
  createProgression, CATALOG, STARTER_ACCESSORIES, isPrizeAccessory, isTradeableAccessory,
} from '../src/progression.js';
import { VISIT_PRIZES } from '../src/visits.js';

const KEY = 'whisker-walk-save';
const hex = (n) => n.toString(16).padStart(64, '0');

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}
// A storage already holding a v4 save with these fields.
function seeded(fields) {
  return memStorage({ [KEY]: JSON.stringify({ version: 4, ...fields }) });
}
const saved = (s) => JSON.parse(s.getItem(KEY));

describe('the prize catalog', () => {
  it('has the ten prizes, free and flagged, in award order', () => {
    const want = {
      partycrown: ['Party Crown', 'head'], confetticape: ['Confetti Cape', 'body'],
      starshades: ['Star Sunglasses', 'face'], leafcrown: ['Leaf Crown', 'head'],
      balloonbunch: ['Balloon Bunch', 'back'], sparklecollar: ['Sparkle Collar', 'collar'],
      warpaint: ['Clan War Paint', 'face'], candlehat: ['Birthday-Candle Hat', 'head'],
      streamerscarf: ['Streamer Scarf', 'neck'], goldbooties: ['Golden Paw Booties', 'feet'],
    };
    expect(Object.keys(want)).toEqual([...VISIT_PRIZES]);
    for (const [id, [name, slot]] of Object.entries(want)) {
      expect(CATALOG.accessories[id]).toEqual({ name, slot, price: 0, prize: true });
    }
    const prizes = Object.keys(CATALOG.accessories).filter((id) => CATALOG.accessories[id].prize);
    expect(prizes.sort()).toEqual([...VISIT_PRIZES].sort());
  });

  it('isPrizeAccessory is true only for prize ids', () => {
    for (const id of VISIT_PRIZES) expect(isPrizeAccessory(id)).toBe(true);
    for (const id of ['bell', 'crown', 'balloon', 'nope', '__proto__', 'toString', '', null, undefined, 7, {}]) {
      expect(isPrizeAccessory(id)).toBe(false);
    }
  });

  it('isTradeableAccessory is a known accessory that is neither a starter nor a prize', () => {
    expect(isTradeableAccessory('crown')).toBe(true);
    expect(isTradeableAccessory('glasses')).toBe(true);
    for (const id of STARTER_ACCESSORIES) expect(isTradeableAccessory(id)).toBe(false);
    for (const id of VISIT_PRIZES) expect(isTradeableAccessory(id)).toBe(false);
    for (const id of ['nope', '__proto__', 'constructor', '', null, undefined, 3]) {
      expect(isTradeableAccessory(id)).toBe(false);
    }
  });
});

describe('recordVisit', () => {
  it('a fresh save counts its first visit and wins the Party Crown, held for the tap', () => {
    const p = createProgression(memStorage());
    const r = p.recordVisit();
    expect(r.visits).toBe(1);
    expect(r.milestone).toMatchObject({ visit: 1, index: 0, style: 'C', prize: { id: 'partycrown', isNew: true } });
    expect(p.isUnlocked('accessories', 'partycrown')).toBe(true);       // owned at once: never lost
    expect(p.state.equipped.head).toBe(null);                           // style C: worn on tap
    expect(p.state.visitPrizePending).toBe('partycrown');
    expect(p.wearPendingVisitPrize()).toBe('partycrown');
    expect(p.state.equipped.head).toBe('partycrown');
    expect(p.state.visitPrizePending).toBe(null);
  });

  it('the milestone carries the prize name and slot', () => {
    const r = createProgression(memStorage()).recordVisit();
    expect(r.milestone).toEqual({
      visit: 1, index: 0, style: 'C', prize: { id: 'partycrown', name: 'Party Crown', slot: 'head', isNew: true },
    });
  });

  it('persists the visit, the grant and the pending prize to storage', () => {
    const s = memStorage();
    createProgression(s).recordVisit();
    const d = saved(s);
    expect(d.visits).toBe(1);
    expect(d.visitPrizesSeen).toBe(1);
    expect(d.visitPrizePending).toBe('partycrown');
    expect(d.unlocked.accessories).toContain('partycrown');
  });

  it('style B is worn immediately, replacing the slot but keeping the old item', () => {
    const s = seeded({
      visits: 9, visitPrizesSeen: 5,
      unlocked: { accessories: ['bell', 'bandana', 'crown', 'glasses'] },
      equipped: { cat: 'tabby', head: 'crown', face: 'glasses' },
    });
    const p = createProgression(s);
    expect(p.state.equipped.face).toBe('glasses');
    const r = p.recordVisit();
    expect(r.visits).toBe(10);
    expect(r.milestone).toMatchObject({ visit: 10, index: 2, style: 'B', prize: { id: 'starshades', isNew: true } });
    expect(p.state.equipped.face).toBe('starshades');
    expect(p.state.equipped.head).toBe('crown');                        // other slots untouched
    expect(p.isUnlocked('accessories', 'glasses')).toBe(true);          // the old item stays owned
    expect(p.isUnlocked('accessories', 'starshades')).toBe(true);
    expect(p.state.visitPrizePending).toBe(null);                       // nothing to tap for
    expect(saved(s).equipped.face).toBe('starshades');
  });

  it('style A holds the prize for the tap, like C', () => {
    const p = createProgression(seeded({ visits: 4, visitPrizesSeen: 1 }));
    const r = p.recordVisit();
    expect(r.milestone).toMatchObject({ visit: 5, index: 1, style: 'A', prize: { id: 'confetticape', isNew: true } });
    expect(p.isUnlocked('accessories', 'confetticape')).toBe(true);
    expect(p.state.equipped.body).toBe(null);
    expect(p.state.visitPrizePending).toBe('confetticape');
  });

  it('ordinary visits count but do not celebrate', () => {
    const p = createProgression(memStorage());
    p.recordVisit();
    p.wearPendingVisitPrize();
    const before = JSON.stringify(p.state.unlocked.accessories);
    for (const n of [2, 3, 4]) {
      const r = p.recordVisit();
      expect(r).toEqual({ visits: n, milestone: null });
      expect(p.state.visitPrizesSeen).toBe(1);
      expect(p.state.visitPrizePending).toBe(null);
    }
    expect(JSON.stringify(p.state.unlocked.accessories)).toBe(before);
  });

  it('three opens in an afternoon are three visits', () => {
    const s = memStorage();
    createProgression(s).recordVisit();
    createProgression(s).recordVisit();
    const p = createProgression(s);
    p.recordVisit();
    expect(p.state.visits).toBe(3);
    expect(saved(s).visits).toBe(3);
  });

  it('a pending prize from a closed tab is worn on the next open', () => {
    const s = memStorage();
    createProgression(s).recordVisit();                 // visit 1, pending partycrown
    const p = createProgression(s);                     // the tab was closed before the tap
    expect(p.state.visitPrizePending).toBe('partycrown');
    p.recordVisit();
    expect(p.state.equipped.head).toBe('partycrown');
    expect(p.state.visitPrizePending).toBe(null);
    expect(saved(s).equipped.head).toBe('partycrown');
    expect(saved(s).visitPrizePending).toBe(null);
  });

  it('a pending prize is worn before a new milestone sets the next one', () => {
    // Visit 1's crown was never tapped; visit 5 arrives with it still pending.
    const s = seeded({ visits: 4, visitPrizesSeen: 1, visitPrizePending: 'partycrown' });
    const p = createProgression(s);
    const r = p.recordVisit();
    expect(r.milestone.prize.id).toBe('confetticape');
    expect(p.state.equipped.head).toBe('partycrown');
    expect(p.state.visitPrizePending).toBe('confetticape');
  });

  it('a skipped milestone celebrates only the latest and still grants the ones before it', () => {
    const s = seeded({ visits: 18, visitPrizesSeen: 10 });
    const p = createProgression(s);
    p.replaceFromPayload({ version: 4, visits: 34, visitPrizesSeen: 10 });
    expect(p.state.visits).toBe(34);
    const r = p.recordVisit();
    expect(r.visits).toBe(35);
    expect(r.milestone).toMatchObject({ visit: 30, index: 4, style: 'A', prize: { id: 'balloonbunch', isNew: true } });
    expect(p.state.visitPrizesSeen).toBe(30);
    for (const id of ['partycrown', 'confetticape', 'starshades', 'leafcrown', 'balloonbunch']) {
      expect(p.isUnlocked('accessories', id)).toBe(true);
    }
    expect(p.isUnlocked('accessories', 'sparklecollar')).toBe(false);
    expect(p.state.visitPrizePending).toBe('balloonbunch');
    // One party, not a backlog: the next visit is ordinary.
    expect(p.recordVisit().milestone).toBe(null);
  });

  it('after prize 10 the cycle shows an owned prize without granting or equipping', () => {
    const p = createProgression(seeded({ visits: 89, visitPrizesSeen: 80, equipped: { cat: 'tabby', collar: 'bell' } }));
    for (const id of VISIT_PRIZES) expect(p.isUnlocked('accessories', id)).toBe(true);
    const equippedBefore = { ...p.state.equipped };
    const ownedBefore = [...p.state.unlocked.accessories];
    const r = p.recordVisit();
    expect(r.visits).toBe(90);
    expect(r.milestone).toMatchObject({ visit: 90, index: 10, style: 'A', prize: { id: 'partycrown', isNew: false } });
    expect(p.state.equipped).toEqual(equippedBefore);
    expect(p.state.unlocked.accessories).toEqual(ownedBefore);
    expect(p.state.visitPrizePending).toBe(null);
    expect(p.state.visitPrizesSeen).toBe(90);
    expect(p.recordVisit().milestone).toBe(null);
    // A style-B repeat (visit 100, index 11) does not dress the cat either.
    const q = createProgression(seeded({ visits: 99, visitPrizesSeen: 90 }));
    const r2 = q.recordVisit();
    expect(r2.milestone).toMatchObject({ visit: 100, style: 'B', prize: { id: 'confetticape', isNew: false } });
    expect(q.state.equipped.body).toBe(null);
  });

  it('stops counting at the ceiling', () => {
    const p = createProgression(seeded({ visits: 1_000_000, visitPrizesSeen: 1_000_000 }));
    expect(p.recordVisit()).toEqual({ visits: 1_000_000, milestone: null });
    expect(p.state.visits).toBe(1_000_000);
  });

  it('writes once per call', () => {
    const s = memStorage();
    const base = s.setItem;
    let n = 0;
    s.setItem = (k, v) => { n += 1; base(k, v); };
    const p = createProgression(s);
    n = 0;
    p.recordVisit();
    expect(n).toBe(1);
  });
});

describe('wearPendingVisitPrize', () => {
  it('returns null and changes nothing when nothing is pending', () => {
    const s = memStorage();
    const p = createProgression(s);
    expect(p.wearPendingVisitPrize()).toBe(null);
    expect(p.state.equipped.head).toBe(null);
  });

  it('replaces whatever was in the slot and persists', () => {
    const s = seeded({
      unlocked: { accessories: ['bell', 'bandana', 'tophat'] }, equipped: { cat: 'tabby', head: 'tophat' },
    });
    const p = createProgression(s);
    p.recordVisit();
    expect(p.state.equipped.head).toBe('tophat');
    expect(p.wearPendingVisitPrize()).toBe('partycrown');
    expect(p.state.equipped.head).toBe('partycrown');
    expect(p.isUnlocked('accessories', 'tophat')).toBe(true);
    expect(saved(s).equipped.head).toBe('partycrown');
    expect(saved(s).visitPrizePending).toBe(null);
    expect(p.wearPendingVisitPrize()).toBe(null);
  });
});

describe('prizes outside the schedule', () => {
  it('prizes are never for sale', () => {
    const p = createProgression(memStorage());
    p.addPoints(10000);
    for (const id of VISIT_PRIZES) {
      expect(p.canBuy('accessories', id)).toBe(false);
      expect(p.buy('accessories', id)).toBe(false);
      expect(p.isUnlocked('accessories', id)).toBe(false);
    }
    expect(p.state.points).toBe(10000);
    expect(p.canBuy('accessories', 'crown')).toBe(true);                // the shop still works
  });

  it('a redeem code cannot grant a prize', () => {
    const p = createProgression(memStorage());
    const r = p.redeemCode(hex(0x51), { accessories: ['partycrown', 'goldbooties', 'wizard'] });
    expect(r.ok).toBe(true);
    expect(p.isUnlocked('accessories', 'partycrown')).toBe(false);
    expect(p.isUnlocked('accessories', 'goldbooties')).toBe(false);
    expect(r.items.map((i) => i.id)).toEqual(['wizard']);
    expect(r.points).toBe(0);
  });

  it('a redeem code naming an owned prize pays no refund', () => {
    const p = createProgression(memStorage());
    p.recordVisit();
    const r = p.redeemCode(hex(0x52), { accessories: ['partycrown'] });
    expect(r.items).toEqual([]);
    expect(r.points).toBe(0);
    expect(p.isUnlocked('accessories', 'partycrown')).toBe(true);
  });
});

describe('visits in the save', () => {
  it('a fresh save starts at zero', () => {
    const p = createProgression(memStorage());
    expect(p.state.visits).toBe(0);
    expect(p.state.visitPrizesSeen).toBe(0);
    expect(p.state.visitPrizePending).toBe(null);
  });

  it('old saves start at zero', () => {
    const p = createProgression(seeded({ points: 40, unlocked: { accessories: ['bell', 'bandana', 'crown'] } }));
    expect(p.state.visits).toBe(0);
    expect(p.state.visitPrizesSeen).toBe(0);
    expect(p.state.visitPrizePending).toBe(null);
    expect(p.state.points).toBe(40);
    for (const id of VISIT_PRIZES) expect(p.isUnlocked('accessories', id)).toBe(false);
    // and their first open is visit 1, with the visit-1 party
    expect(p.recordVisit().milestone).toMatchObject({ visit: 1, prize: { id: 'partycrown' } });
  });

  it('a v3 save migrates to zero too', () => {
    const s = memStorage({ [KEY]: JSON.stringify({ version: 3, points: 5, equipped: { cat: 'tabby', outfit: 'bandana' } }) });
    const p = createProgression(s);
    expect(p.state.visits).toBe(0);
    expect(p.state.visitPrizesSeen).toBe(0);
    expect(p.state.visitPrizePending).toBe(null);
  });

  it('sanitizes hostile values', () => {
    expect(createProgression(seeded({ visits: 1e15 })).state.visits).toBeLessThanOrEqual(1_000_000);
    expect(createProgression(seeded({ visits: 1e15 })).state.visits).toBe(1_000_000);
    expect(createProgression(seeded({ visits: '7' })).state.visits).toBe(0);
    expect(createProgression(seeded({ visits: -2 })).state.visits).toBe(0);
    expect(createProgression(seeded({ visits: NaN })).state.visits).toBe(0);
    expect(createProgression(seeded({ visits: 7.9 })).state.visits).toBe(7);
    expect(createProgression(seeded({ visitPrizesSeen: -3 })).state.visitPrizesSeen).toBe(0);
    expect(createProgression(seeded({ visitPrizesSeen: '20' })).state.visitPrizesSeen).toBe(0);
    expect(createProgression(seeded({ visitPrizesSeen: 1e15 })).state.visitPrizesSeen).toBe(1_000_000);
    for (const bad of ['__proto__', 'bell', 'crown', 'toString', 'nope', '', 7, {}, ['partycrown'], true]) {
      expect(createProgression(seeded({ visitPrizePending: bad })).state.visitPrizePending).toBe(null);
    }
    // JSON keeps "__proto__" as an own key; it must not leak in either
    const s = memStorage({ [KEY]: '{"version":4,"visitPrizePending":"__proto__","visits":{"__proto__":3}}' });
    const p = createProgression(s);
    expect(p.state.visitPrizePending).toBe(null);
    expect(p.state.visits).toBe(0);
  });

  it('keeps a valid pending prize across a reload', () => {
    const p = createProgression(seeded({ visits: 1, visitPrizesSeen: 1, visitPrizePending: 'partycrown' }));
    expect(p.state.visitPrizePending).toBe('partycrown');
  });

  it('rebuilds won prizes on load', () => {
    const p = createProgression(seeded({ visits: 25, visitPrizesSeen: 20, unlocked: { accessories: ['bell', 'bandana', 'wings'] } }));
    for (const id of ['partycrown', 'confetticape', 'starshades', 'leafcrown']) {
      expect(p.isUnlocked('accessories', id)).toBe(true);
    }
    for (const id of ['balloonbunch', 'sparklecollar', 'goldbooties']) {
      expect(p.isUnlocked('accessories', id)).toBe(false);
    }
    expect(p.isUnlocked('accessories', 'wings')).toBe(true);
    // each prize is in the list once
    const acc = p.state.unlocked.accessories;
    expect(acc.length).toBe(new Set(acc).size);
  });

  it('rebuild does not duplicate prizes already owned', () => {
    const p = createProgression(seeded({ visitPrizesSeen: 5, unlocked: { accessories: ['bell', 'bandana', 'partycrown'] } }));
    expect(p.state.unlocked.accessories.filter((id) => id === 'partycrown')).toEqual(['partycrown']);
    expect(p.isUnlocked('accessories', 'confetticape')).toBe(true);
  });

  it('a worn prize survives a reload', () => {
    const s = memStorage();
    const p = createProgression(s);
    p.recordVisit();
    p.wearPendingVisitPrize();
    expect(createProgression(s).state.equipped.head).toBe('partycrown');
  });

  it('loading an older cloud save never lowers the count or strips a prize', () => {
    const p = createProgression(memStorage());
    for (let i = 0; i < 12; i++) p.recordVisit();          // visits 12, seen 10, three prizes
    p.replaceFromPayload({ version: 4, visits: 3, visitPrizesSeen: 1 });
    expect(p.state.visits).toBe(12);
    expect(p.state.visitPrizesSeen).toBe(10);
    expect(p.isUnlocked('accessories', 'starshades')).toBe(true);
  });

  it('the kept count is persisted, so a reload after a cloud load keeps it too', () => {
    const s = memStorage();
    const p = createProgression(s);
    for (let i = 0; i < 12; i++) p.recordVisit();
    p.replaceFromPayload({ version: 4, visits: 3, visitPrizesSeen: 1 });
    const q = createProgression(s);
    expect(q.state.visits).toBe(12);
    expect(q.state.visitPrizesSeen).toBe(10);
    for (const id of ['partycrown', 'confetticape', 'starshades']) expect(q.isUnlocked('accessories', id)).toBe(true);
  });

  it('a newer cloud save raises the count and grants its prizes', () => {
    const p = createProgression(memStorage());
    p.recordVisit();
    p.replaceFromPayload({ version: 4, visits: 22, visitPrizesSeen: 20 });
    expect(p.state.visits).toBe(22);
    expect(p.state.visitPrizesSeen).toBe(20);
    expect(p.isUnlocked('accessories', 'leafcrown')).toBe(true);
    expect(p.recordVisit().milestone).toBe(null);           // 23: the cloud already celebrated 20
  });

  it('a hostile cloud payload cannot break the count', () => {
    const p = createProgression(memStorage());
    p.recordVisit();
    p.replaceFromPayload({ version: 4, visits: 'lots', visitPrizesSeen: -1, visitPrizePending: 'bell' });
    expect(p.state.visits).toBe(1);
    expect(p.state.visitPrizesSeen).toBe(1);
    expect(p.state.visitPrizePending).toBe(null);
    expect(p.isUnlocked('accessories', 'partycrown')).toBe(true);
  });
});
