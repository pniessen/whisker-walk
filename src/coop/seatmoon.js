// Cat two in Dot's passenger seat (the Moon). While cat one drives (seat 0), the second cat may hop in beside it; it is carried with the rover and set down when it asks, when cat one
// gets out, or when it leaves the walk. Everything is read from what the rover already shows (life.rover.state / .sim): no claim is written into the rover, and the journal sighting
// is the household's (recordSighting is once-ever).
import { phrase } from '../clanphrases.js';
import './words.js';
import * as P from '../world/moonplan.js';
import { dismountSpot } from '../world/moonrover.js';
import { DOT_SEATS } from '../world/moonroverparts.js';

export function createSeat(host) {
  const at = { x: 0, z: 0 };
  let seated = false, wantIn = false, wantOut = false, target = null;
  const rover = () => host.life?.rover;
  const gy = (x, z) => host.session()?.ground?.y(x, z) ?? 0;
  const driving = () => { const st = rover()?.state; return !!st && st.riding && st.seat === 0; };
  const down = (body, player) => {
    if (!seated) return;
    seated = false;
    const sim = rover()?.sim;
    if (body && sim) { const s = host.session(); const to = dismountSpot(sim, { colliders: s?.areaData?.colliders ?? [], bounds: P.MOON_BOUNDS, ground: s?.ground }, null); body.position.set(to.x, gy(to.x, to.z), to.z); body.rotation.set(0, sim.yaw + Math.PI, 0); }
    if (player) player.perchY = 0;
    player?.halt?.();
  };
  const source = {
    forCats: 'two',
    promptAt(c) {
      const sim = rover()?.sim;
      target = null;
      if (c && sim) {
        if (seated) target = { kind: 'out', line: phrase('coop.seat.rover.out') };
        else if (driving() && Math.hypot(c.x - sim.x, c.z - sim.z) < P.DOT_REACH && Math.abs(c.y - gy(sim.x, sim.z)) < 1.2) target = { kind: 'in', line: phrase('coop.seat.rover.in') };
      }
      return target ? target.line : null;
    },
    interact() {
      const t = target;
      target = null;
      if (!t) return null;
      if (t.kind === 'in') wantIn = true; else wantOut = true;
      return t.kind;
    },
  };
  return {
    sources: [source],
    riding: () => seated,
    carry(dt, body, player) {
      const sim = rover()?.sim;
      if (!body || !player || !sim) return false;
      if (wantIn && !seated && driving()) { seated = true; player.halt?.(); try { host.progression?.recordSighting?.('mnrover'); } catch { /* a stand-in save */ } }
      wantIn = false;
      if (seated && (wantOut || !driving())) { wantOut = false; down(body, player); return false; }
      wantOut = false;
      if (!seated) return false;
      const s = DOT_SEATS[1], c = Math.cos(sim.yaw), n = Math.sin(sim.yaw);
      at.x = sim.x + s.x * c + s.z * n;
      at.z = sim.z - s.x * n + s.z * c;
      body.position.set(at.x, gy(sim.x, sim.z) + s.y, at.z);
      body.rotation.y = sim.yaw + Math.PI;
      player.perchY = s.y;
      player.halt?.();
      return true;
    },
    release(body, player) { wantIn = false; wantOut = false; down(body, player); },
  };
}
