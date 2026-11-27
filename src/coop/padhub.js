// The pad hub: who holds which pad. Two slots, one cat each. Pure: it reads
// the pad snapshots it is handed and says what happened; it touches no page,
// no cat and no clock (src/coop/index.js does).
//
// Identity is the SLOT, never the pad's `index` or `id`: two DualSenses share
// one id string and Chrome may hand a reconnected pad another index. The slot
// is taken by a press, in press order, and a slot whose pad went away stays
// reserved ("lost") until a pad that is not already seated presses something.
//   slot 0 (cat one): the first pad to show any life; reclaimed first.
//   slot 1 (cat two): A on a pad that is not seated, while joining is open.
// A button held when a pad is seated is ignored until it is let go, so the
// press that joined never also hops.
import { createHold, DPAD_DOWN, DPAD_LEFT } from './rules.js';
import { createPadState, stepPad, isPressed, pressedEdges, PAD_BUTTONS } from '../gamepadinput.js';

const SELECT = 8; // Back / View / Create: held on pad two, it steps out of the walk
export const LEAVE_HOLD = 0.8; // seconds
const FIRM = 0.5; // a stick push that counts as "somebody is there"

const live = (pad) => (pad.buttons ?? []).some(isPressed)
  || Math.hypot(pad.axes?.[0] || 0, pad.axes?.[1] || 0) > FIRM
  || Math.hypot(pad.axes?.[2] || 0, pad.axes?.[3] || 0) > FIRM;

const downSet = (pad) => new Set((pad.buttons ?? []).flatMap((b, i) => (isPressed(b) ? [i] : [])));

const seat = (index) => ({ index, lost: false, held: new Set(), prev: [], pad: createPadState(), hold: createHold(), progress: 0, out: 0 });

export function createPadHub() {
  const slots = [null, null];

  const claim = (slot, pad, type, events) => {
    const was = slots[slot];
    slots[slot] = Object.assign(was ?? seat(pad.index), { index: pad.index, lost: false, held: downSet(pad), prev: [], pad: createPadState(), hold: createHold(), progress: 0, out: 0 });
    events.push({ type, slot });
  };

  return {
    /** Who holds each slot: null, or { index, lost }. */
    seats() { return slots.map((s) => (s ? { index: s.index, lost: s.lost } : null)); },
    /** Gives a slot back (the walk went on without it). */
    release(slot) { slots[slot] = null; },
    /** How far each slot's hop-to-friend hold has filled (0 to 1). */
    holds() { return slots.map((s) => (s && !s.lost ? s.progress : 0)); },
    reset() { slots[0] = null; slots[1] = null; },
    /** The two pads change seats (who is cat one): only when both are seated. */
    swap() { if (slots[0] && slots[1]) [slots[0], slots[1]] = [slots[1], slots[0]]; },
    /**
     * One frame. `pads`: the connected standard pads. opts: joinOpen (a second
     * cat may join), engaged (the walk is live for cat two's pad), dt.
     * Returns { events, two, pressed }: `pressed[slot]` says that seat's pad had a new button or a firm stick push this frame (who is using the menu); events are { type: 'seat' | 'join' | 'back' | 'lost' | 'turn' | 'start' | 'hop' | 'groom', slot, dir? };
     * `two` is stepPad's answer for slot 1's pad ({ move, actions }) or null.
     */
    step(pads, { joinOpen = false, engaged = true, dt = 1 / 60 } = {}) {
      const events = [];
      const byIndex = new Map(pads.map((p) => [p.index, p]));
      for (let i = 0; i < 2; i++) {
        const s = slots[i];
        if (s && !s.lost && !byIndex.has(s.index)) { s.lost = true; events.push({ type: 'lost', slot: i }); }
      }
      const owned = new Set(slots.flatMap((s) => (s && !s.lost ? [s.index] : [])));
      // One claim a frame, lowest pad first; a lost slot is won back before a new one is taken.
      for (const pad of [...pads].sort((a, b) => a.index - b.index)) {
        if (owned.has(pad.index) || !live(pad)) continue;
        const lost = slots.findIndex((s) => s?.lost);
        if (lost >= 0) claim(lost, pad, 'back', events);
        else if (!slots[0]) claim(0, pad, 'seat', events);
        else if (!slots[1] && joinOpen && isPressed(pad.buttons?.[PAD_BUTTONS.A])) claim(1, pad, 'join', events);
        else continue;
        break;
      }
      let two = null;
      const pressed = [false, false];
      for (let i = 0; i < 2; i++) {
        const s = slots[i];
        if (!s || s.lost) continue;
        const pad = byIndex.get(s.index);
        const raw = (pad.buttons ?? []).map(isPressed);
        for (const b of [...s.held]) if (!raw[b]) s.held.delete(b);
        const cur = raw.map((d, b) => d && !s.held.has(b));
        const edges = pressedEdges(s.prev, cur);
        pressed[i] = edges.length > 0 || Math.hypot(pad.axes?.[0] || 0, pad.axes?.[1] || 0) > FIRM;
        for (const b of edges) {
          if (b === PAD_BUTTONS.Y && i === 1) events.push({ type: 'swap', slot: i });
          else if (b === PAD_BUTTONS.L1) events.push({ type: 'turn', slot: i, dir: 1 });
          else if (b === PAD_BUTTONS.R1) events.push({ type: 'turn', slot: i, dir: -1 });
          else if (b === PAD_BUTTONS.START) events.push({ type: 'start', slot: i });
          else if (b === DPAD_LEFT) events.push({ type: 'groom', slot: i });
        }
        s.prev = cur;
        if (i === 1) { // Select held: pad two steps out (one event a hold; let go and hold again to do it twice)
          const down = !!raw[SELECT];
          if (!down) s.out = 0;
          else if (s.out >= 0 && (s.out += dt) >= LEAVE_HOLD) { s.out = -1; events.push({ type: 'leave', slot: i }); }
        }
        if (engaged) { // D-pad Down held: hop to my friend (a hold, or two quick taps)
          const r = s.hold.step(dt, !!cur[DPAD_DOWN]);
          s.progress = r.progress;
          if (r.fired) events.push({ type: 'hop', slot: i });
        } else { s.hold.reset(); s.progress = 0; }
        if (i === 1) {
          const masked = s.held.size ? { ...pad, buttons: cur } : pad;
          two = stepPad(s.pad, masked, dt, { engaged });
        }
      }
      return { events, two, pressed };
    },
    /** The pad snapshot cat one's walk code should read (or undefined for "whichever, as today"). */
    padOf(slot, pads) {
      const s = slots[slot];
      return s && !s.lost ? pads.find((p) => p.index === s.index) : undefined;
    },
  };
}

/**
 * What the walk's own pad code (src/gamepad.js) is given for cat one's pad: in
 * a walk the right stick and the shoulder buttons are the couch view's (the
 * view has a fixed heading and turns in quarters), so they are taken out; in a
 * menu the pad is whole. A new object, so the browser's snapshot is untouched.
 */
export function padForWalk(pad, engaged) {
  if (!pad || !engaged) return pad;
  const a = pad.axes ?? [];
  return { ...pad, axes: [a[0] || 0, a[1] || 0, 0, 0], buttons: (pad.buttons ?? []).map((b, i) => (i === PAD_BUTTONS.L1 || i === PAD_BUTTONS.R1 ? false : b)) };
}
