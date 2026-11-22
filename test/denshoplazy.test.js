// The den shop loads on its first den walk, not at start-up (den shop UX M1).
// The stub keeps the surface main.js, walk.js and the backstack already use.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLazyDenShop } from '../src/ui/denshoplazy.js';

const fakeView = () => ({
  setActive: vi.fn(), open: vi.fn(), close: vi.fn(), notNow: vi.fn(),
  isOpen: false, isAsking: false,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createLazyDenShop', () => {
  it('loads nothing until a den walk starts', async () => {
    const load = vi.fn(async () => ({ createDenShopView: () => fakeView() }));
    const shop = createLazyDenShop({}, load);
    expect(load).not.toHaveBeenCalled();
    expect(shop.isOpen).toBe(false);
    expect(shop.isAsking).toBe(false);
    shop.close(); shop.notNow(); shop.setActive(false); // all harmless before the chunk
    expect(load).not.toHaveBeenCalled();
    shop.setActive(true);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('passes its options through and sets the view active once loaded', async () => {
    const view = fakeView();
    const make = vi.fn(() => view);
    const opts = { progression: { x: 1 } };
    const shop = createLazyDenShop(opts, async () => ({ createDenShopView: make }));
    shop.setActive(true);
    await flush();
    expect(make).toHaveBeenCalledWith(opts);
    expect(view.setActive).toHaveBeenLastCalledWith(true);
  });

  it('delegates after loading, and reads isOpen / isAsking live', async () => {
    const view = fakeView();
    const shop = createLazyDenShop({}, async () => ({ createDenShopView: () => view }));
    shop.setActive(true);
    await flush();
    view.isOpen = true; view.isAsking = true;
    expect(shop.isOpen).toBe(true);
    expect(shop.isAsking).toBe(true);
    shop.open(); shop.close(); shop.notNow();
    expect(view.open).toHaveBeenCalled();
    expect(view.close).toHaveBeenCalled();
    expect(view.notNow).toHaveBeenCalled();
  });

  it('a walk that ends before the chunk arrives leaves the shop off', async () => {
    const view = fakeView();
    const shop = createLazyDenShop({}, async () => ({ createDenShopView: () => view }));
    shop.setActive(true);
    shop.setActive(false);
    await flush();
    expect(view.setActive).toHaveBeenLastCalledWith(false);
  });

  it('a failed load is not fatal and is tried again at the next den walk', async () => {
    let n = 0;
    const view = fakeView();
    const load = vi.fn(async () => { if (++n === 1) throw new Error('offline'); return { createDenShopView: () => view }; });
    const shop = createLazyDenShop({}, load);
    shop.setActive(true);
    await flush();
    expect(shop.isOpen).toBe(false);
    shop.setActive(false);
    shop.setActive(true);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(view.setActive).toHaveBeenLastCalledWith(true);
  });

  it('open() before the chunk is there loads it, then opens', async () => {
    const view = fakeView();
    const shop = createLazyDenShop({}, async () => ({ createDenShopView: () => view }));
    shop.open();
    await flush();
    expect(view.open).toHaveBeenCalledTimes(1);
  });
});

describe('start-up modules do not import the den shop statically', () => {
  it('main.js and homebase.js reach denshopview only through the stub', () => {
    for (const f of ['src/main.js', 'src/ui/homebase.js', 'src/game/walk.js']) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/import[^;]*from\s+'[^']*denshopview(\.js)?'/);
      expect(src, f).not.toMatch(/import[^;]*from\s+'[^']*\/denshop(\.js)?'/);
    }
    const stub = readFileSync(new URL('../src/ui/denshoplazy.js', import.meta.url), 'utf8');
    expect(stub).not.toMatch(/^import .*denshop/m);
    expect(stub).toMatch(/import\('\.\/denshopview\.js'\)/);
  });

  it('main.js hands the lazy shop the live-placement function and the bus (so the chunk imports neither)', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    expect(main).toMatch(/createLazyDenShop\(\{[^}]*applyDenSpot[^}]*bus/s);
    const view = readFileSync(new URL('../src/ui/denshopview.js', import.meta.url), 'utf8');
    expect(view).not.toMatch(/from '\.\.\/game\/denlive\.js'/);
    expect(view).not.toMatch(/from '\.\.\/events\.js'/);
  });
});

describe('the stub passes the placing state on (M2)', () => {
  it('is not placing before the chunk loads, and forwards stopPlacing after', async () => {
    const stop = vi.fn();
    const stub = createLazyDenShop({}, () => Promise.resolve({ createDenShopView: () => ({ setActive() {}, isPlacing: true, stopPlacing: stop }) }));
    expect(stub.isPlacing).toBe(false);
    stub.stopPlacing(); // nothing loaded: no throw
    stub.setActive(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(stub.isPlacing).toBe(true);
    stub.stopPlacing();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
