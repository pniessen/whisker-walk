// The Treehouse, beauty pass 8: the village answers her voice and moves. Points and numbers only.
import { describe, it, expect } from 'vitest';
const R = await import('../src/world/treehousereact.js');
const mk = (o = {}) => { const said = []; const sky = { fx: { flare: 0, sway: 0, flex: 0, shake: 0 }, lampList: [{ x: 2, y: 2, z: 2 }, { x: -3, y: 2, z: 1 }] };
  const owl = { hear: -1 }; const sq = { hear: -1 };
  const rx = R.createReact({ rung: 'high', sky, owl, squirrels: sq, voice: { chime: (k, p) => said.push(['chime', p]), bird: () => said.push(['bird']), squirrel: () => said.push(['sq']) }, ...o }); return { rx, said, sky, owl, sq }; };
const cat = { x: 0, y: 1.4, z: 0 }; const fwd = { x: 0, z: -1 };
const quiet = () => ({ pounceTime: 0, sniffTime: 0, idleTime: 0, wasZooming: false, perched: null });
describe('pass 8', () => {
  it('meow: cascade, flare, owl and squirrels listen, 1.5 s cooldown', () => {
    const { rx, said, sky, owl, sq } = mk(); rx.meow(); rx.step(1 / 30, 10, cat, quiet(), fwd);
    rx.step(1 / 30, 10.2, cat, quiet(), fwd); expect(rx.live(10.8)).toBeGreaterThan(8); expect(sky.fx.flare).toBeGreaterThan(0.3); expect(owl.hear).toBeGreaterThan(10); expect(sq.hear).toBeGreaterThan(10);
    for (let t = 10; t < 12; t += 1 / 30) rx.step(1 / 30, t, cat, quiet(), fwd);
    expect(said.filter((s) => s[0] === 'chime').length).toBe(4);
    rx.meow(); rx.step(1 / 30, 10.5, cat, quiet(), fwd); expect(rx.state.counts.meow).toBe(1);
    rx.meow(); rx.step(1 / 30, 11.6, cat, quiet(), fwd); expect(rx.state.counts.meow).toBe(2);
  });
  it('land, sniff, still and zoomies each set something going', () => {
    const a = mk(); a.rx.land(); a.rx.step(1 / 30, 5, cat, quiet(), fwd); expect(a.rx.live(5.3)).toBeGreaterThan(8); expect(a.sky.fx.flex).toBeGreaterThan(0.5);
    const b = mk(); b.rx.step(1 / 30, 5, cat, { ...quiet(), sniffTime: 1 }, fwd); expect(b.rx.live(5.8)).toBeGreaterThan(4); expect(b.said.length).toBe(0);
    const c = mk(); c.rx.step(1 / 30, 5, cat, { ...quiet(), idleTime: 2.5 }, fwd); expect(c.rx.live(6.5)).toBeGreaterThan(4);
    const d = mk(); d.rx.step(1 / 30, 5, cat, { ...quiet(), wasZooming: true }, fwd); d.rx.step(1 / 30, 5.2, cat, { ...quiet(), wasZooming: true }, fwd); expect(d.rx.live(5.4)).toBeGreaterThan(2); expect(d.sky.fx.flex).toBeGreaterThan(0.3);
  });
  it('reduced motion: sounds only, no slots, no shader numbers', () => {
    const { rx, said, sky } = mk({ motion: false }); rx.meow(); for (let t = 10; t < 12; t += 1 / 30) rx.step(1 / 30, t, cat, quiet(), fwd);
    expect(rx.sizes).toEqual([0, 0]); expect(said.length).toBeGreaterThan(3); expect(sky.fx.flare).toBe(0);
  });
  it('lite has fewer slots than low, low fewer than high', () => {
    expect(R.RX.glow.lite).toBeLessThan(R.RX.glow.low); expect(R.RX.glow.low).toBeLessThan(R.RX.glow.high);
  });
});
