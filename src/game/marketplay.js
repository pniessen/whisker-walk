// =============================================================================
// The Market Square in the walk (step 2): what each event of src/marketlive.js
// pays and says.
//
// WHAT IS PAID (rulings M8, M9)
//   * A treat eaten pays AWARDS.treat, once per stall per walk (the discovery
//     log's key 'market-treat-<stall>', which a walk picked up again carries
//     in its note). Eaten again (it is laid out again after a while) it pays
//     nothing and says so; the walk's tally (live.treats) counts every one.
//   * Teamwork, each child on her own device: the eater's device pays her the
//     ordinary treat and says who kept the stallholder busy; the distracter's
//     device pays her AWARDS.teamtreat when the partner's pick for the stall
//     cooing at her arrives ('team'), once per stall per walk
//     ('market-team-<stall>').
// Nothing here sends anything: a grab goes out as the existing carry-pick
// (game/interactions.js), and nothing else crosses the wire (M7).
//
// A grab pays nothing (the treat is paid when eaten). A shoo says its line (or
// the laugh, for a cat who already has the treat) at most once every
// SHOO_TOAST_GAP seconds, and thumps when her hop begins; the coo says its line
// once a walk. A partner's shoo, coo and munch say nothing here.
// =============================================================================
import { TREAT_WORDS, MARKET_LINES } from '../marketwords.js';
import { SHOO_TOAST_GAP, treatItemId } from '../marketnone.js';
import { safeRemoteName } from '../net.js';

// A partner's name, as safe as any name off the wire, for a teamwork line.
export function partnerName(session, playerId) {
  const list = session?.remotes?.list;
  const entry = Array.isArray(list) ? list.find((r) => r.playerId === playerId) : null;
  return safeRemoteName(entry?.petName, 'Your partner');
}

// The walk's own toasts for the Market: once(key, text) once a walk, and
// every(key, gap, text) at most once every `gap` seconds of now() (seconds).
// One per walk (walk.js makes it beside the life).
export function createMarketToasts({ hud, now }) {
  const shown = new Set();
  const last = new Map();
  return {
    once(key, text) {
      if (shown.has(key)) return;
      shown.add(key);
      hud.toast(text);
    },
    every(key, gap, text) {
      const t = now();
      const at = last.get(key);
      if (at !== undefined && t - at < gap) return;
      last.set(key, t);
      hud.toast(text);
    },
  };
}

const treatName = (kind) => TREAT_WORDS[kind]?.name ?? '';

// handleMarketEvent(e, ctx): one event of the Market's life.
//   ctx   { hud, audio, log, session, once, every, nameOf? }
//           once(key, text)         a toast once a walk
//           every(key, gap, text)   a toast at most once every `gap` seconds
//           nameOf(playerId)        a partner's name (default: partnerName on the session)
export function handleMarketEvent(e, ctx) {
  const { hud, audio, log, session } = ctx;
  const once = ctx.once ?? ((_key, text) => hud.toast(text));
  const every = ctx.every ?? ((_key, _gap, text) => hud.toast(text));
  const nameOf = ctx.nameOf ?? ((id) => partnerName(session, id));
  switch (e?.type) {
    case 'eat': {
      const name = treatName(e.kind);
      const paid = log.awardOnce('treat', `market-treat-${e.stall}`, MARKET_LINES.eatFirst(name));
      if (!paid) hud.toast(MARKET_LINES.eatAgain(name));
      audio?.trill?.(0.8);
      if (e.teamWith) hud.toast(MARKET_LINES.teamEater(nameOf(e.teamWith)));
      break;
    }
    case 'team':
      log.awardOnce('teamtreat', `market-team-${e.stall}`, MARKET_LINES.teamDistracter(nameOf(e.partner)));
      break;
    case 'shoo':
      if (e.who !== 'me') break;
      every('market-shoo', SHOO_TOAST_GAP, e.laugh ? MARKET_LINES.laugh() : MARKET_LINES.shoo());
      if (e.hopped) audio?.landThump?.();
      break;
    case 'coo':
      if (e.who === 'me') once('market-coo', MARKET_LINES.coo());
      break;
    case 'grab':
      // A hop grab has no button press for interactions.js to follow with the carry-pick, so it goes out here
      // (the same event, M7); the partner's device shows her munching and pays the team treat from it
      if (e.hop && session?.net) session.net.sendEvent({ v: 1, id: session.playerId, type: 'carry-pick', itemId: treatItemId(e.stall) });
      break;
    default: // 'grab' pays when eaten; 'remote-eat' is the partner's own
      break;
  }
}

// A walk picked up again: the tally is the treats it already paid for.
export function restoreMarket(market, log) {
  market?.restore?.(log);
}
