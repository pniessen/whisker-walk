// Cat two on the back of cat one's ride (Crystal's boat and cart, Snowville's sled, skis and snowmobile, the Moon's sled). Those rides are one seat each and run on cat one's player,
// so cat two does not steer them or take their paws: it hops on beside cat one while she rides, is carried at her seat, and is set down beside her the moment her ride ends (she hops off,
// the run finishes, the walk or the place changes), never left sitting on a ride that has stopped. What the ride pays is cat one's own award, once, to the household save.
import { phrase } from '../clanphrases.js';
import './words.js';

export const PILLION_RIDES = Object.freeze(['crystal-boat', 'crystal-cart', 'snow-sled', 'snow-skis', 'snow-mobile', 'moon-sled']);
export const PILLION = Object.freeze({ reach: 3.2, side: 0.45, setDown: 0.9 });

export function createSeat(host) {
  let rec = null, ride = null, wantOn = false, wantOff = false, want = null;
  const sess = () => host.session();
  const gy = (x, z) => sess()?.ground?.y(x, z) ?? 0;
  const ridden = () => { const s = sess(); const id = s?.fair?.riding?.id; return s?.perched && PILLION_RIDES.includes(id) ? { rec: s.perched, id } : null; };
  const down = (body, player, soft) => {
    if (!rec) return;
    rec = null; ride = null;
    const c = sess()?.cat?.position;
    if (body && c) { const yaw = sess().cat.rotation.y; const x = c.x + Math.cos(yaw) * PILLION.setDown, z = c.z - Math.sin(yaw) * PILLION.setDown; body.position.set(x, gy(x, z) + 0.05, z); }
    if (player) player.perchY = 0;
    player?.halt?.();
    if (soft) host.say?.(phrase('coop.seat.pillion.end'));
  };
  const source = {
    forCats: 'two',
    promptAt(c) {
      want = null;
      if (!c) return null;
      if (rec) want = 'off';
      else {
        const r = ridden();
        if (r && Math.hypot(c.x - r.rec.x, c.z - r.rec.z) <= PILLION.reach && Math.abs(c.y - (sess().cat?.position?.y ?? c.y)) < 4) want = 'on';
      }
      return want === 'off' ? phrase('coop.seat.pillion.off') : want === 'on' ? phrase('coop.seat.pillion.on') : null;
    },
    interact() {
      const w = want; want = null;
      if (w === 'on') wantOn = true; else if (w === 'off') wantOff = true;
      return w;
    },
  };
  return {
    sources: [source],
    riding: () => !!rec,
    carry(dt, body, player) {
      if (!body || !player) return false;
      if (wantOn && !rec) { const r = ridden(); if (r) { rec = r.rec; ride = r.id; player.halt?.(); host.say?.(phrase('coop.seat.pillion.tip')); } }
      wantOn = false;
      if (wantOff && rec) { wantOff = false; down(body, player); return false; }
      wantOff = false;
      if (!rec) return false;
      const s = sess(); const r = ridden();
      if (!r || r.rec !== rec || r.id !== ride) { down(body, player, true); return false; } // her ride ended or changed: cat two is set down
      const yaw = s.cat.rotation.y;
      body.position.set(rec.x + Math.cos(yaw) * PILLION.side, s.cat.position.y, rec.z - Math.sin(yaw) * PILLION.side);
      body.rotation.y = yaw;
      player.perchY = Math.max(0.05, rec.y);
      player.halt?.();
      return true;
    },
    release(body, player) { wantOn = false; wantOff = false; want = null; down(body, player); },
  };
}
