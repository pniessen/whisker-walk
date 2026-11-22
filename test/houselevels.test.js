import { describe, it, expect } from 'vitest';
import { HOUSE_LEVELS, LEVEL_LINKS } from '../src/world/houseplan.js';
import { LEVEL_SWITCH, nextLevel, fullLevels, createLevelDrawing } from '../src/houselevels.js';
import { setGrow } from '../src/grow.js';

const obj = (userData = {}) => ({ visible: true, userData, children: [] });

function fixture() {
  const scene = { children: [] };
  const per = {};
  for (const l of HOUSE_LEVELS) {
    const detail = obj({ houseDetail: true, houseLevel: l.id });
    const simple = obj({ houseSimple: l.id });
    scene.children.push(detail, simple);
    per[l.id] = { detail, simple };
  }
  const cat = obj({ cat: true });
  const plain = obj();
  scene.children.push(cat, plain);
  return { scene, per, cat, plain };
}

function trace(fx) {
  const d = createLevelDrawing(fx.scene, { levels: HOUSE_LEVELS, links: LEVEL_LINKS, start: 'cellar' });
  const out = [];
  for (let y = -1.8; y <= 4.2001; y += 0.05) {
    d.update(y);
    out.push(HOUSE_LEVELS.map((l) => [fx.per[l.id].detail.visible, fx.per[l.id].simple.visible]));
    for (const l of HOUSE_LEVELS) {
      expect(fx.per[l.id].detail.visible).toBe(d.full.has(l.id));
      expect(fx.per[l.id].simple.visible).toBe(!d.full.has(l.id));
    }
    expect(fx.cat.visible).toBe(true);
    expect(fx.plain.visible).toBe(true);
  }
  return out;
}

describe('house levels', () => {
  it('changes level 0.3 m past the stair midpoint, both ways', () => {
    expect(LEVEL_SWITCH).toBe(0.3);
    let id = 'ground';
    for (const y of [0.6, 1.2, 1.34]) expect(id = nextLevel(id, y, HOUSE_LEVELS)).toBe('ground');
    expect(id = nextLevel(id, 1.36, HOUSE_LEVELS)).toBe('upstairs');
    expect(id = nextLevel(id, 1.06, HOUSE_LEVELS)).toBe('upstairs');
    expect(nextLevel(id, 1.04, HOUSE_LEVELS)).toBe('ground');
  });
  it('draws her level and its neighbours in full', () => {
    expect([...fullLevels('ground', LEVEL_LINKS)].sort()).toEqual(['cellar', 'ground', 'upstairs']);
    expect([...fullLevels('attic', LEVEL_LINKS)].sort()).toEqual(['attic', 'upstairs']);
    expect([...fullLevels('cellar', LEVEL_LINKS)].sort()).toEqual(['cellar', 'ground']);
  });
  it('swaps far levels for stand-ins and never touches anything else', () => {
    const fx = fixture();
    trace(fx);
    const d = createLevelDrawing(fx.scene, { levels: HOUSE_LEVELS, links: LEVEL_LINKS, start: 'ground' });
    expect(d.current).toBe('ground');
    expect(fx.per.attic.detail.visible).toBe(false);
    expect(fx.per.attic.simple.visible).toBe(true);
    expect(fx.per.ground.detail.visible).toBe(true);
  });
  // Final fix F1: a walk's start (a walk picked up in the attic) draws her level at once.
  it('settles on the nearest level at once, with no 0.3 m hold', () => {
    const fx = fixture();
    const d = createLevelDrawing(fx.scene, { levels: HOUSE_LEVELS, links: LEVEL_LINKS, start: 'ground' });
    d.settle(4.2);
    expect(d.current).toBe('attic');
    expect(fx.per.attic.detail.visible).toBe(true);
    expect(fx.per.attic.simple.visible).toBe(false);
    expect(fx.per.ground.detail.visible).toBe(false);
    expect(fx.per.ground.simple.visible).toBe(true);
    // a step past a stair's midpoint is enough (update would hold the old level there)
    d.settle(1.25);
    expect(d.current).toBe('upstairs');
    expect(nextLevel('ground', 1.25, HOUSE_LEVELS)).toBe('ground');
    d.settle(-1.7);
    expect(d.current).toBe('cellar');
  });
  it('finds tagged objects nested in groups', () => {
    const inner = obj({ houseDetail: true, houseLevel: 'attic' });
    const group = obj();
    group.children.push(inner);
    createLevelDrawing({ children: [group] }, { levels: HOUSE_LEVELS, links: LEVEL_LINKS, start: 'ground' });
    expect(inner.visible).toBe(false);
  });
  it('is always on: the same with ?grow=1 on or off', () => {
    try {
      setGrow(true);
      const on = trace(fixture());
      setGrow(false);
      const off = trace(fixture());
      expect(on).toEqual(off);
    } finally {
      setGrow(null);
    }
  });
});
