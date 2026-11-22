// Add a device with a hop code (cat login, milestone 4). A lazy chunk: the My cat sheet
// (src/ui/catlogin.js) imports it only when a kid taps Add a device or I have a hop code.
//
// Two small state machines over the cloud's four hop calls (src/cloud.js). Neither makes a request
// until a tap calls start() or join(); each polls every 3 seconds with setTimeout, and stops the
// moment the sheet is closed (isOpen() answers false), the hop ends, or its time is up.
//
//   createHost({ cloud, code, secret, isOpen, onChange, now })   the device that has the cat
//       phases: code (show the six characters) > asked (a device typed them) > allowed | closed;
//               also expired, cancelled, left (the sheet was shut), error (+ error: busy | denied |
//               bad | unavailable | offline)
//   createJoiner({ cloud, isOpen, onChange, now })                the device that wants the cat
//       phases: waiting > arrived (+ code: the cat code to bring the cat with) | refused | timeout;
//               also wrong (the code did not work), busy (too many wrong tries), left, error
//
// `onChange(view)` gets a fresh plain object at every change. Everything the cloud answers is
// untrusted: the hop and the cat code are checked for their shape here before they are used, and the
// secret the cloud hands over is never kept (the cat's own key comes with the save when it is loaded).
// No import: the cloud is handed in, so this file can never make a request by itself.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // src/codealphabet.js (not imported: a lazy file imports nothing from start-up)
const HOP_RE = new RegExp(`^[${ALPHABET}]{6}$`);
const CAT_CODE_RE = /^(?:[A-Z]{3,6}(?:-[A-Z]{3,6}){3}|[A-Z]{4,6}(?:-[A-Z]{4,6}){2}-[0-9]{2})$/;

export const POLL_MS = 3000;
export const HOP_LIFE_MS = 10 * 60 * 1000; // the server's own limit; the host stops asking at the same time
export const JOIN_WAIT_MS = 60 * 1000; // how long the joining device waits for the first device to say OK

const ERRORS = new Set(['busy', 'denied', 'bad', 'unavailable', 'offline']);
const errorOf = (status) => (ERRORS.has(status) ? status : 'bad');

/** What a kid typed -> the six characters it may be (or something that will not pass the check). */
export const normalizeHop = (raw) => String(raw ?? '').toUpperCase().replace(/[\s\-._·]+/g, '');
export const isHop = (s) => HOP_RE.test(s);

function ticker(fn, isOpen, emit) {
  let timer = null;
  let dead = false;
  const stop = () => { dead = true; if (timer !== null) { clearTimeout(timer); timer = null; } };
  const next = () => {
    if (dead) return;
    timer = setTimeout(async () => {
      timer = null;
      if (dead) return;
      if (!isOpen()) { stop(); emit({ phase: 'left' }); return; }
      await fn();
      next();
    }, POLL_MS);
  };
  return { next, stop, get dead() { return dead; } };
}

export function createHost({ cloud, code, secret, isOpen = () => true, onChange = () => {}, now = () => Date.now() }) {
  let view = { phase: 'idle' };
  let hop = null;
  let startedAt = 0;
  let ended = false;
  const set = (v) => { view = v; onChange({ ...v }); };
  const end = (v) => { ended = true; tick?.stop(); set(v); };
  const poll = async () => {
    if (ended) return;
    if (now() - startedAt >= HOP_LIFE_MS) { end({ phase: 'expired' }); return; }
    const r = await cloud.hopOpen(code, secret);
    if (ended) return;
    if (r.status === 'ok' && r.hop === hop) {
      if (r.waiting === true && view.phase === 'code') set({ phase: 'asked', hop });
    } else if (r.status === 'ok') end({ phase: 'expired' }); // a different hop: ours is gone
    else if (r.status === 'offline') { /* a missed tick changes nothing; the next one asks again */ }
    else end({ phase: 'error', error: errorOf(r.status) });
  };
  const tick = ticker(poll, isOpen, (v) => { ended = true; set(v); });
  return {
    view: () => ({ ...view }),
    /** The tap on Add a device. */
    async start() {
      if (hop || ended) return;
      set({ phase: 'opening' });
      const r = await cloud.hopOpen(code, secret);
      if (r.status === 'ok' && typeof r.hop === 'string' && HOP_RE.test(r.hop)) {
        hop = r.hop; startedAt = now();
        set({ phase: r.waiting === true ? 'asked' : 'code', hop });
        tick.next();
      } else end({ phase: 'error', error: errorOf(r.status) });
    },
    /** Yes, allow: hands the cat code to the device that typed the hop code. */
    async allow() {
      if (!hop || ended) return;
      const r = await cloud.hopAnswer(code, secret, true);
      if (r === 'ok') end({ phase: 'allowed' });
      else if (r === 'none') end({ phase: 'expired' });
      else end({ phase: 'error', error: errorOf(r) });
    },
    /** No: the hop is cleared and the other device is told no. */
    async deny() {
      if (!hop || ended) return;
      const r = await cloud.hopAnswer(code, secret, false);
      end(r === 'ok' || r === 'none' ? { phase: 'closed' } : { phase: 'error', error: errorOf(r) });
    },
    /** Cancel, or the sheet closing: the hop is closed on the server too (best effort). */
    async cancel() {
      if (ended || !hop) { tick.stop(); ended = true; return; }
      end({ phase: 'cancelled' });
      await cloud.hopAnswer(code, secret, false);
    },
  };
}

export function createJoiner({ cloud, isOpen = () => true, onChange = () => {}, now = () => Date.now() }) {
  let view = { phase: 'idle' };
  let ended = true;
  let tick = null;
  let startedAt = 0;
  let ticket = null;
  const set = (v) => { view = v; onChange({ ...v }); };
  const end = (v) => { ended = true; tick?.stop(); set(v); };
  const poll = async () => {
    if (ended) return;
    if (now() - startedAt >= JOIN_WAIT_MS) { end({ phase: 'timeout' }); return; }
    const r = await cloud.hopPoll(ticket);
    if (ended) return;
    if (r.status === 'wait') return;
    if (r.status === 'ok') {
      const code = typeof r.code === 'string' ? r.code.toUpperCase() : '';
      if (CAT_CODE_RE.test(code)) end({ phase: 'arrived', code });
      else end({ phase: 'error', error: 'bad' });
    } else if (r.status === 'denied') end({ phase: 'refused' });
    else if (r.status === 'none') end({ phase: 'wrong' }); // it ran out, or it was already handed over
    else if (r.status === 'offline') { /* try again at the next tick */ }
    else end({ phase: 'error', error: errorOf(r.status) });
  };
  return {
    view: () => ({ ...view }),
    /** The tap on Go. A code of the wrong shape sends nothing. */
    async join(raw) {
      tick?.stop();
      const hop = normalizeHop(raw);
      if (!HOP_RE.test(hop)) { ended = true; set({ phase: 'wrong' }); return; }
      ended = false; ticket = null;
      set({ phase: 'joining' });
      const r = await cloud.hopJoin(hop);
      if (ended) return;
      if (r.status === 'ok' && typeof r.ticket === 'string' && r.ticket.length > 0 && r.ticket.length <= 128) {
        ticket = r.ticket; startedAt = now();
        set({ phase: 'waiting' });
        tick = ticker(poll, isOpen, (v) => { ended = true; set(v); });
        tick.next();
      } else if (r.status === 'none') end({ phase: 'wrong' });
      else if (r.status === 'busy') end({ phase: 'busy' });
      else end({ phase: 'error', error: errorOf(r.status) });
    },
    cancel() { ended = true; tick?.stop(); },
  };
}
