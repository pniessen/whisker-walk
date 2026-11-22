// What a gateway says and how a walk-on is decided: pure functions, no THREE,
// no DOM. The walk's gate prompt, the cards, the "Off to ..." moment and the
// co-walk event all read these, so every device words and checks it the same.
// Place names come from placeName, never from literals.

import { placeState, lower } from './territories.js';
import { placeName, roomAreaMove } from './edition.js';
import { areaOffer } from './areaoffer.js';
import { headTo } from './bordercross.js';
import { padTag } from './tvseam.js';
import { confirmCardHtml, spendAsk } from './ui/confirmcard.js';
import { escapeHtml } from './escapehtml.js';
import { seedFromCode } from './rng.js';
import { phrase } from './clanphrases.js';
import { endById, liveEndsFor, arrivalFor, inwardOf, INWARD_YAW } from './gateways.js';
import { postById, postArrival, postsFor, POST_ARRIVE_AT } from './borderposts.js';

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
    if (guest) return { text: phrase('gate.thisWay', status.name), kind: 'gate-info' };
    return { text: 'E — ' + headTo(status.name), kind: 'gate' };
  }
  if (status.kind === 'buy') {
    if (guest) return { text: phrase('gate.thisWay', status.name), kind: 'gate-info' };
    // "The" mid-sentence is lower case, as in every other gate line.
    return { text: phrase('gate.buyPrompt', lower(status.name), status.price), kind: 'gate-buy' };
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
      <button id="btn-cross-yes" class="btn" type="button">Yes, let's go!${padTag('⟦confirm⟧')}</button>
      <button id="btn-cross-no" class="btn" type="button">Keep exploring${padTag('⟦back⟧')}</button>
    </div>`;
}

// The usual "Get it?" card for a place. The shared card (spendAsk) keeps a
// name as given, as the map's own card does ("Open The Old Docks"); the
// gate's card lowers "The" mid-sentence, as every other gate line does.
export function gateBuyHtml({ name, price, points }) {
  return `<div class="pause-card cross-card gate-buy">${confirmCardHtml(spendAsk({ kind: 'place', name: lower(name), price, points }))}</div>`;
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

// The way's plan: the place it leaves and the place beyond, and where she
// lands. A gate end, or a border post (Task 10): a post lands her ARRIVE_IN m
// inside the post the place beyond has back (POST_ARRIVE), facing in (or at
// that post's POST_ARRIVE_AT spot), or at its spawn (`arrive` null) when it
// has none.
export function viaPlan(via, table) {
  const hit = endById(via, table);
  if (!hit) return postPlan(via);
  const arrival = arrivalFor(via, table);
  if (!arrival) return null;
  const { x, z, yaw } = arrival;
  return { via, from: hit.areaId, to: hit.end.to, arrive: { x, z, yaw } };
}

function postPlan(via) {
  const hit = postById(via);
  if (!hit) return null;
  const { post } = hit;
  const twin = postsFor(post.to).find((p) => p.id === postArrival(via)) ?? null;
  if (!twin) return { via, from: hit.areaId, to: post.to, arrive: null };
  const at = Object.hasOwn(POST_ARRIVE_AT, twin.id) ? POST_ARRIVE_AT[twin.id] : null;
  const arrive = at ? { x: at.x, z: at.z, yaw: INWARD_YAW[twin.faces] } : inwardOf(twin);
  return { via, from: hit.areaId, to: post.to, arrive };
}

// The room's host sent it: `id` is a remote in the room and nobody in the
// room (this device included) has a lower id.
function fromHost(id, selfId, remoteIds) {
  const remotes = Array.isArray(remoteIds) ? remoteIds : [];
  if (!remotes.includes(id)) return false;
  const all = [selfId, ...remotes];
  if (!all.every((i) => typeof i === 'string' || typeof i === 'number')) return false;
  return !all.some((i) => i < id);
}

// This device is the room's host: every remote's id is higher than its own.
function isHostOf(selfId, remoteIds) {
  const all = [selfId, ...(Array.isArray(remoteIds) ? remoteIds : [])];
  if (!all.every((i) => typeof i === 'string' || typeof i === 'number')) return false;
  return !all.some((i) => i < selfId);
}

// One of this place's live ways on, by id, else null: a gate end, or a
// border post (Task 10) to a place this build has a catalog row for. Either
// has the `to` a walk-on reads.
function liveEnd(areaId, via, catalog) {
  if (typeof via !== 'string') return null;
  const end = liveEndsFor(areaId, catalog).find((e) => e.id === via);
  if (end) return end;
  const areas = catalog && catalog.areas;
  return postsFor(areaId).find((p) => p.id === via && areas != null && Object.hasOwn(areas, p.to)) ?? null;
}

// A guest follows a walk-on only when it is well formed, for this walk's
// area, through one of its live gates or posts, from the room's host, with the seed
// every device derives.
export function decideWalkOn(ev, { areaId, selfId, remoteIds, catalog, roomSeed } = {}) {
  if (!isObj(ev) || ev.v !== 1 || ev.type !== 'walk-on' || ev.from !== areaId) return null;
  if (typeof ev.via !== 'string' || typeof ev.seed !== 'number') return null;
  const end = liveEnd(areaId, ev.via, catalog);
  if (!end || !fromHost(ev.id, selfId, remoteIds)) return null;
  if (ev.seed !== nextRoomSeed(roomSeed, ev.via)) return null;
  return { via: ev.via, to: end.to, seed: ev.seed };
}

// The longest way id an ask may name (every id here is far shorter).
const MAX_VIA = 64;

// In a room, every device has the place before anyone moves. The host's yes
// asks first ({ v: 1, id, type: 'walk-on-ask', from, via }); a guest answers
// only an ask that passes the walk-on's own checks, without the seed:
// { via, to }. A well-formed ask from the host about a way this build does
// not have (a newer build's gate), or about one to a place it has no row
// for, gets { via, to: null }: the guest says no at once, so the host need
// not wait. A way this build has, but of another place, is stale: null.
export function decideWalkOnAsk(ev, { areaId, selfId, remoteIds, catalog } = {}) {
  if (!isObj(ev) || ev.v !== 1 || ev.type !== 'walk-on-ask' || ev.from !== areaId) return null;
  if (typeof ev.via !== 'string' || ev.via.length === 0 || ev.via.length > MAX_VIA) return null;
  if (!fromHost(ev.id, selfId, remoteIds)) return null;
  const end = liveEnd(areaId, ev.via, catalog);
  if (end) return { via: ev.via, to: end.to };
  const known = endById(ev.via) ?? postById(ev.via);
  if (known && known.areaId !== areaId) return null;
  return { via: ev.via, to: null };
}

// The host's reading of the answers it has heard ({ v: 1, id, type:
// 'walk-on-have', via, ok }, any order, repeats welcome): { kind: 'no', id }
// as soon as one friend still in the room says it cannot have the place;
// { kind: 'go' } once the host has the place itself (`ready`) and every
// friend still in the room has said it can; else { kind: 'wait', waiting }
// (the friends not yet heard from). Only answers for this place's live gate or post
// `via`, from a remote in the room, to the room's host, count.
export function decideWalkOnHave(haves, { areaId, via, selfId, remoteIds, catalog, ready = false } = {}) {
  const remotes = Array.isArray(remoteIds) ? remoteIds : [];
  const counts = !!liveEnd(areaId, via, catalog) && isHostOf(selfId, remotes);
  const yes = new Set();
  for (const ev of Array.isArray(haves) ? haves : []) {
    if (!counts || !isObj(ev) || ev.v !== 1 || ev.type !== 'walk-on-have' || ev.via !== via) continue;
    if (typeof ev.ok !== 'boolean' || !remotes.includes(ev.id)) continue;
    if (!ev.ok) return { kind: 'no', id: ev.id };
    yes.add(ev.id);
  }
  const waiting = remotes.filter((id) => !yes.has(id));
  return waiting.length === 0 && ready ? { kind: 'go' } : { kind: 'wait', waiting };
}

// Ruling R15: a guest who said it has the place follows the host on when,
// both walk-on copies lost, the host's own state shows it already there: a
// state from `hostId`, still the room's host, tagged with the place `to`.
export function decideHostThere(state, { hostId, to, selfId, remoteIds } = {}) {
  if (!isObj(state) || state.id !== hostId || typeof to !== 'string' || state.area !== to) return null;
  if (!fromHost(hostId, selfId, remoteIds)) return null;
  return { to };
}

// A room with a member on an older build crosses at a gate as at a border
// post (the walk ends): a guest on this build follows that border-cross when
// it names a place one of this walk's live gates leads to, from the host.
export function decideGateCross(ev, { areaId, selfId, remoteIds, catalog } = {}) {
  if (!isObj(ev) || ev.type !== 'border-cross' || ev.from !== areaId || typeof ev.to !== 'string') return null;
  if (!liveEndsFor(areaId, catalog).some((e) => e.to === ev.to)) return null;
  if (!fromHost(ev.id, selfId, remoteIds)) return null;
  return { to: ev.to };
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
