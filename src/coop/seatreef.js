// Cat two on a swimming seal (the Reef). The seals' claim table is the Reef's own (a seal with a rider is taken), and the way in for a rider that is not cat one is the same
// 'seal-in' / 'seal-out' claim a co-walk partner's event makes (life.sealRide.credit): the claim answers null when the seal is cat one's or already taken, so one cat per seal holds
// for both cats. Cat two sits where the seal's photo spot is (life.spottable, the point the seal is drawn at) and is set down by its own press, the timer (the ride's 40 s) or leaving
// the walk. The first ride's journal line and sighting are the household's: awardOnce is keyed, so two cats and two rides pay once.
import { phrase } from '../clanphrases.js';
import './words.js';

// the seal ride's numbers (world/reefsealride.js SEAL; test/coopseats.test.js holds them equal: that file is a Reef stage chunk and must not be pulled into this one)
export const SEAL = Object.freeze({ reach: 3.6, seconds: 40, seatUp: 0.3, journalKey: 'reef-seal-ride', journalPage: 'rfseal' });

export function createSeat(host) {
  let seal = -1, t = 0, wantOn = -1, wantOff = false, want = null, yaw = 0;
  const px = { x: 0, z: 0 };
  const seals = () => (host.life?.spottable ?? []).filter((e) => e.type === 'rfseal').slice(0, 2);
  const sr = () => host.life?.sealRide;
  const gy = (x, z) => host.session()?.ground?.y(x, z) ?? 0;
  const out = (body, player, soft) => {
    if (seal < 0) return;
    sr()?.credit({ kind: 'seal-out', seal });
    seal = -1; t = 0;
    if (player) player.perchY = 0;
    if (body) body.position.y = Math.max(body.position.y, gy(body.position.x, body.position.z) + 0.05);
    player?.halt?.();
    if (soft) host.say?.(phrase('coop.seat.seal.end'));
  };
  const source = {
    forCats: 'two',
    promptAt(c) {
      want = null;
      if (!c) return null;
      if (seal >= 0) want = { kind: 'off', line: phrase('coop.seat.seal.off') };
      else if (wantOn < 0) {
        const mine = sr()?.state?.seal;
        let best = -1, bd = SEAL.reach;
        seals().forEach((e, i) => {
          if (i === mine || Math.abs(c.y - e.pos.y) > 3) return;
          const d = Math.hypot(c.x - e.pos.x, c.z - e.pos.z);
          if (d <= bd) { best = i; bd = d; }
        });
        if (best >= 0) want = { kind: 'on', seal: best, line: phrase('coop.seat.seal.on') };
      }
      return want ? want.line : null;
    },
    interact() {
      const w = want;
      want = null;
      if (!w) return null;
      if (w.kind === 'on') wantOn = w.seal; else wantOff = true;
      return w.kind;
    },
  };
  return {
    sources: [source],
    riding: () => seal >= 0,
    carry(dt, body, player) {
      if (!body || !player) return false;
      if (wantOn >= 0 && seal < 0) {
        const i = wantOn;
        if (sr()?.credit({ kind: 'seal-in', seal: i }) === 'in') { // a seal cat one holds, or one already taken, answers null
          seal = i; t = 0; player.halt?.(); player.clearFloat?.();
          try {
            host.log?.awardOnce?.('reeffind', SEAL.journalKey, phrase('coop.seat.seal.find'));
            host.progression?.recordSighting?.(SEAL.journalPage);
          } catch { /* a stand-in save */ }
          host.say?.(phrase('coop.seat.seal.tip'));
          px.x = seals()[i].pos.x; px.z = seals()[i].pos.z;
        }
      }
      wantOn = -1;
      if (wantOff && seal >= 0) { wantOff = false; out(body, player); return false; }
      wantOff = false;
      if (seal < 0) return false;
      t += dt > 0 ? Math.min(dt, 0.25) : 0;
      if (t >= SEAL.seconds) { out(body, player, true); return false; }
      const p = seals()[seal].pos;
      if (Math.hypot(p.x - px.x, p.z - px.z) > 0.002) yaw = Math.atan2(p.x - px.x, p.z - px.z); // the seal faces where it swims
      px.x = p.x; px.z = p.z;
      const y = p.y + SEAL.seatUp;
      body.position.set(p.x, y, p.z);
      body.rotation.y = yaw + Math.PI;
      player.perchY = Math.max(0.05, y - gy(p.x, p.z));
      player.halt?.();
      return true;
    },
    release(body, player) { wantOn = -1; wantOff = false; want = null; out(body, player); },
  };
}
