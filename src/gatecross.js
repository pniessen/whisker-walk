// What a gateway says and how a walk-on is decided: pure functions, no THREE,
// no DOM. The walk's gate prompt, the cards, the "Off to ..." moment and the
// co-walk event all read these, so every device words and checks it the same.
// Place names come from placeName, never from literals.

import { placeState, lower } from './territories.js';
import { placeName, roomAreaMove } from './edition.js';
import { areaOffer } from './areaoffer.js';
import { headTo } from './bordercross.js';
import { confirmCardHtml, spendAsk } from './ui/confirmcard.js';
import { escapeHtml } from './escapehtml.js';
import { seedFromCode } from './rng.js';
import { phrase } from './clanphrases.js';
import { endById, liveEndsFor, arrivalFor } from './gateways.js';

export const GATE_MOMENT_MS = 1200;
// What a build that can walk on through a gate says about itself.
export const WALK_ON = 1;

const isObj = (v) => !!v && typeof v === 'object';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// { kind: 'go' | 'buy' | 'short' | 'shut', to, name, price, need, line } for
// one gate end. A gate only offers what the save's offer says (areaoffer.js).
export function gateStatus(end, state, catalog) {
  const to = end && typeof end.to === 'string' ? end.to : '';
  const edition = isObj(state) ? state.edition : undefined;
  const name = placeName(to, edition, catalog);
  const ps = placeState(state, catalog, to);
  const base = { to, name, price: ps.price, need: 0, line: '' };
  if (ps.owned) return { ...base, kind: 'go' };
  if (ps.locked) {
    const req = areaOffer(state, catalog, to).requires;
    const walks = isObj(state) && isObj(state.walks) ? state.walks : {};
    const have = num(Object.hasOwn(walks, req.area) ? walks[req.area] : 0);
    const line = phrase('gate.shut', req.walks, lower(placeName(req.area, edition, catalog) || req.area), req.walks - have);
    return { ...base, kind: 'shut', line };
  }
  if (ps.canOpen) return { ...base, kind: ps.price === 0 ? 'go' : 'buy' };
  const need = ps.price - num(isObj(state) ? state.points : 0);
  return { ...base, kind: 'short', need, line: phrase('gate.short', need) };
}

// The prompt a gate shows. Only a solo cat or a room's host can choose.
export function gatePrompt(status, { inRoom = false, isHost = false } = {}) {
  const guest = inRoom && !isHost;
  if (status.kind === 'go') {
    if (guest) return { text: `${status.name} is this way 🧭`, kind: 'gate-info' };
    return { text: 'E — ' + headTo(status.name), kind: 'gate' };
  }
  if (status.kind === 'buy') {
    if (guest) return { text: `${status.name} is this way 🧭`, kind: 'gate-info' };
    return { text: phrase('gate.buyPrompt', status.name, status.price), kind: 'gate-buy' };
  }
  return { text: status.line, kind: 'gate-info' };
}

// The crossing card; the buttons are the post card's, so one wiring serves both.
export function gateCardHtml({ name, extras = [] }) {
  const lines = (Array.isArray(extras) ? extras : []).map((e) => `<p>${escapeHtml(e)}</p>`).join('');
  return `<div class="pause-card cross-card">
      <h2>${escapeHtml(headTo(name))}</h2>
      <p>${escapeHtml(phrase('gate.keep'))}</p>
      ${lines}
      <button id="btn-cross-yes" class="btn" type="button">Yes, let's go!</button>
      <button id="btn-cross-no" class="btn" type="button">Keep exploring</button>
    </div>`;
}

// The usual "Get it?" card for a place.
export function gateBuyHtml({ name, price, points }) {
  return `<div class="pause-card cross-card gate-buy">${confirmCardHtml(spendAsk({ kind: 'place', name, price, points }))}</div>`;
}

// The short "Off to the Farm!" screen between two places.
export function gateMomentHtml({ name, ledBy = null }) {
  const lead = ledBy ? `<p>${escapeHtml(phrase('cross.leading', ledBy, lower(name)))}</p>` : '';
  return `<div class="pause-card cross-card gate-moment"><h1>${escapeHtml(phrase('gate.off', lower(name)))}</h1>${lead}</div>`;
}

// How a walk-on lands on this save: 'set' (an owned place she may walk),
// 'take' (a free open place, a solo cat only), else 'override' (walk it this
// once without owning it, as room starts do).
export function walkOnMove(state, catalog, to, { guest = false } = {}) {
  const ps = placeState(state, catalog, to);
  if (ps.owned && roomAreaMove(state, catalog, to) === 'set') return 'set';
  if (!guest && !ps.owned && !ps.locked && ps.price === 0) return 'take';
  return 'override';
}

// Makes the place hers when it may be: sets an owned one, takes a free one,
// and never buys a priced one. Returns 'set' | 'take', or false.
export function pickOnCrossing(progression, catalog, to, { guest = false } = {}) {
  const move = walkOnMove(progression.state, catalog, to, { guest });
  if (move === 'override') return false;
  if (move === 'take' && !progression.buy('areas', to)) return false;
  progression.setArea(to);
  return progression.state.area === to ? move : false;
}

// One seed for the next room walk, the same on every device, drawing nothing.
export function nextRoomSeed(roomSeed, via) {
  return seedFromCode(`${roomSeed >>> 0}>${via}`) >>> 0;
}

// The gate's plan: its two ends and where she lands. Border posts join later.
export function viaPlan(via, table) {
  const hit = endById(via, table);
  if (!hit) return null;
  const arrival = arrivalFor(via, table);
  if (!arrival) return null;
  const { x, z, yaw } = arrival;
  return { via, from: hit.areaId, to: hit.end.to, arrive: { x, z, yaw } };
}

// A guest follows a walk-on only when it is well formed, for this walk's
// area, through one of its live gates, from the room's host, with the seed
// every device derives.
export function decideWalkOn(ev, { areaId, selfId, remoteIds, catalog, roomSeed } = {}) {
  if (!isObj(ev) || ev.v !== 1 || ev.type !== 'walk-on' || ev.from !== areaId) return null;
  if (typeof ev.via !== 'string' || typeof ev.seed !== 'number') return null;
  const end = liveEndsFor(areaId, catalog).find((e) => e.id === ev.via);
  if (!end) return null;
  const remotes = Array.isArray(remoteIds) ? remoteIds : [];
  if (!remotes.includes(ev.id)) return null;
  const all = [selfId, ...remotes];
  if (!all.every((i) => typeof i === 'string' || typeof i === 'number')) return null;
  if (all.some((i) => i < ev.id)) return null;
  if (ev.seed !== nextRoomSeed(roomSeed, ev.via)) return null;
  return { via: ev.via, to: end.to, seed: ev.seed };
}

// A room walks on together only when every member says it can.
export function roomWalksOn(roster) {
  return Array.isArray(roster) && roster.length > 0 && roster.every((m) => isObj(m) && m.walkOn === WALK_ON);
}

// A state from a cat in another place is not drawn here. An older build sends
// no area and always passes.
export function stateIsHere(state, areaId) {
  return !(isObj(state) && typeof state.area === 'string' && state.area !== areaId);
}
