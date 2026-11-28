// Snowville: nothing a player can see as solid is walkable. Every point inside a prop's drawn footprint (the stall, board, cottages, lamp posts, snowman, square fir)
// lies inside a collider circle, and the cup pickup spot and the warm spot stay open.
import { describe, it, expect } from 'vitest';
import * as P from '../src/world/snowvilleplan.js';
import { CUP } from '../src/world/snowvillejob.js';

const solid = (x, z) => P.snowvilleColliders().some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
// local (u, v) of a prop at yaw -> world (stand(): local x goes to (cos, -sin), local z to (sin, cos))
const world = (o, yaw, u, v) => [o.x + u * Math.cos(yaw) + v * Math.sin(yaw), o.z - u * Math.sin(yaw) + v * Math.cos(yaw)];
function rectPoints(o, yaw, w, d, shrink = 0) {
  const pts = [];
  const nu = 12, nv = 8;
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) pts.push(world(o, yaw, (i / nu - 0.5) * (w - 2 * shrink), (j / nv - 0.5) * (d - 2 * shrink)));
  return pts;
}
function ring(o, r) { return Array.from({ length: 12 }, (_, i) => [o.x + Math.cos(i * 0.5236) * r, o.z + Math.sin(i * 0.5236) * r]); }

describe('Snowville props are solid across their whole footprint', () => {
  it('the cocoa stall (counter, posts)', () => {
    const S = P.STALL;
    // the drawn stall: counter + posts span x in [-w/2, w/2], z in [-d/2, d/2] of its own frame (the awning above is walked under)
    const bad = rectPoints(S, S.yaw, S.w, S.d, 0.05).filter(([x, z]) => !solid(x, z));
    expect(bad).toEqual([]);
  });
  it('every cottage', () => {
    for (const c of P.COTTAGES) {
      const bad = rectPoints(c, c.yaw, c.w, c.d, 0.05).filter(([x, z]) => !solid(x, z));
      expect({ id: c.id, bad }).toEqual({ id: c.id, bad: [] });
    }
  });
  it('the postcard board (two posts and a board 2.4 wide)', () => {
    const bad = rectPoints(P.BOARD, P.BOARD.yaw, 2.2, 0.2).filter(([x, z]) => !solid(x, z));
    expect(bad).toEqual([]);
  });
  it('the snowman, lamp posts and the square fir', () => {
    for (const [o, r] of [[P.SNOWMAN, 0.6], [P.SQUARE_FIR, 0.8], ...P.LAMPS.map((l) => [l, 0.08])]) {
      expect(ring(o, r).filter(([x, z]) => !solid(x, z))).toEqual([]);
    }
  });
  it('the cup spot and its reach, and the stall warm spot, stay open', () => {
    expect(solid(CUP.x, CUP.z)).toBe(false);
    // a cat can stand at the counter and still be within the cup's reach
    const [wx, wz] = [P.STALL.x - P.STALL.d / 2 - 0.5, P.STALL.z];
    expect(solid(wx, wz)).toBe(false);
    expect(Math.hypot(wx - CUP.x, wz - CUP.z)).toBeLessThanOrEqual(CUP.reach + 0.5);
    const w = P.WARM_SPOTS[1];
    expect(solid(w[0], w[1])).toBe(false);
  });
});
