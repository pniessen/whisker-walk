// A stand-in for the v11 step 3 functions (docs/supabase-v11-cat-login.sql): the same answers, in
// memory. `rpc(name, args)` is what createCloud takes; `calls` lists what was asked. Nothing here
// reaches a network.
import { CODE_ALPHABET } from '../../src/codealphabet.js';

export function createFakeHopServer({ now = () => Date.now(), cats = {}, missing = false, offline = false } = {}) {
  // cats: { [catCode]: secret }
  const hops = new Map(); // hop -> { code, expires, ticket, answer, handoff }
  const calls = [];
  let misses = 0;
  const maxMisses = 10;
  const miss = () => ({ status: 'none' });
  const gc = () => { for (const [h, r] of hops) if (r.expires <= now()) hops.delete(h); };
  const rand = (n, a) => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
  async function rpc(name, args) {
    calls.push({ name, args });
    if (offline) throw new Error('Failed to fetch');
    if (missing) throw Object.assign(new Error('Could not find the function public.' + name), { code: 'PGRST202' });
    gc();
    if (name === 'hop_open') {
      if (cats[args.p_code] !== args.p_secret) return { status: 'denied' };
      for (const [h, r] of hops) if (r.code === args.p_code) return { status: 'ok', hop: h, waiting: !!r.ticket && r.answer == null };
      let hop;
      do { hop = rand(6, CODE_ALPHABET); } while (hops.has(hop));
      hops.set(hop, { code: args.p_code, expires: now() + 10 * 60 * 1000, ticket: null, answer: null, handoff: null });
      return { status: 'ok', hop, waiting: false };
    }
    if (name === 'hop_join') {
      if (misses >= maxMisses) return { status: 'busy' };
      const r = hops.get(args.p_hop);
      if (!r || r.ticket) { misses++; return miss(); }
      r.ticket = 'ticket-' + calls.length + '-' + rand(8, CODE_ALPHABET);
      return { status: 'ok', ticket: r.ticket };
    }
    if (name === 'hop_answer') {
      for (const [h, r] of hops) {
        if (r.code !== args.p_code) continue;
        if (cats[args.p_code] !== args.p_secret) return 'denied';
        if (!args.p_accept) { r.answer = 'no'; if (!r.ticket) hops.delete(h); return 'ok'; }
        if (!r.ticket) return 'none';
        r.answer = 'yes';
        r.handoff = { code: args.p_code, secret: args.p_secret };
        return 'ok';
      }
      return cats[args.p_code] === args.p_secret ? 'none' : 'denied';
    }
    if (name === 'hop_poll') {
      for (const [h, r] of hops) {
        if (r.ticket !== args.p_ticket) continue;
        if (r.answer === 'yes') { hops.delete(h); return { status: 'ok', code: r.handoff.code, secret: r.handoff.secret }; }
        if (r.answer === 'no') { hops.delete(h); return { status: 'denied' }; }
        return { status: 'wait' };
      }
      return { status: 'none' };
    }
    throw new Error('unexpected ' + name);
  }
  return { rpc, calls, hops };
}
