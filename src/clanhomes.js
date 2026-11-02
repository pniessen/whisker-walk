// Clan homes: which clan owns which territory, who its neighbours are, and the
// ALLIES patrol rule, all as data. A leaf module: it imports clanwords.js only
// (no DOM, no THREE, no colony.js).
//
// The allies rule (patrolClanFor): a territory has one fixed camp disc, and the
// clan on patrol there is
//   - the territory's own clan, if neither kid picked it;
//   - otherwise the first neighbour (in the HOMES row's order) neither kid picked;
//   - otherwise nobody.
// So a patrol is never either kid's clan, and both devices agree whatever the
// order of the picks.
//
// The rows are mutual: a neighbour's row names this territory back.
//
// The Moor's row gained the Gorge LAST (Gorge part 4, K9). Appending keeps
// every pair of picks the four first-release clans can make finding the same
// Moor patrol as before: two picks can block at most two of its three
// neighbours, and the first two are the ones they always were. (Since clan
// life a patrol only runs where neither kid is at home, so on a walk this
// only ever answers the territory's own clan anyway.) What the third
// neighbour does change is who visits the Moor: three clans now share its
// intruder slots (intruders.js).
//
// To add a territory later: edit its HOMES row only if its neighbours change;
// add its camp disc in rivalclans.js; a truce place needs nothing here except
// an entry in TRUCE_AREAS.
import { HOMAGE_PREFIXES, CLAN_SUFFIX } from './clanwords.js';

const row = (neighbours, pickable) => Object.freeze({ neighbours: Object.freeze(neighbours), pickable });

export const HOMES = Object.freeze({
  woods: row(['moor', 'river'], true),
  river: row(['pines', 'woods'], true),
  moor: row(['woods', 'pines', 'gorge'], true),
  pines: row(['river', 'moor'], true),
  gorge: row(['moor'], true),
});

// Places where no clan patrols, ever.
export const TRUCE_AREAS = Object.freeze(['island']);

export function isClanId(v) {
  return typeof v === 'string' && Object.hasOwn(HOMES, v);
}

export function pickableClans() {
  return Object.keys(HOMES).filter((id) => HOMES[id].pickable);
}

export function clanName(id) {
  return isClanId(id) ? HOMAGE_PREFIXES[id] + CLAN_SUFFIX : '';
}

export function patrolClanFor(areaId, picks) {
  if (typeof areaId !== 'string' || TRUCE_AREAS.includes(areaId) || !Object.hasOwn(HOMES, areaId)) return null;
  const taken = new Set(Array.isArray(picks) ? picks.filter(isClanId) : []);
  if (!taken.has(areaId)) return areaId;
  for (const n of HOMES[areaId].neighbours) if (!taken.has(n)) return n;
  return null;
}

// Inlined, not imported from edition.js: edition.js imports rivalclans.js,
// which imports this file, so importing it here would make a cycle. Same rule
// as edition.isClanEdition.
const inClanEdition = (state) => state?.edition !== 'legacy';

function mineOf(state) {
  const m = state?.clanPick?.mine;
  return isClanId(m) ? m : null;
}

// The partner's pick, only while they are still the partner (plain id equality;
// sanitizeClanPick already checked the id's shape).
function partnerPickOf(state) {
  const cp = state?.clanPick;
  if (!cp || !isClanId(cp.partner)) return null;
  const now = state?.colony?.partner?.playerId;
  return cp.partnerId === now ? cp.partner : null;
}

export function picksOf(state) {
  const out = [];
  const mine = mineOf(state);
  if (mine) out.push(mine);
  const partner = partnerPickOf(state);
  if (partner) out.push(partner);
  return out;
}

export function ownClanTitle(state) {
  if (!inClanEdition(state)) return '';
  const mine = mineOf(state);
  if (mine) return clanName(mine);
  return state?.clan?.name ?? '';
}

export function alliesName(state) {
  if (!inClanEdition(state)) return '';
  const mine = mineOf(state);
  const partner = partnerPickOf(state);
  if (!mine || !partner || partner === mine) return '';
  return clanName(partner);
}

export function homeWelcome(areaId, state) {
  if (!inClanEdition(state)) return null;
  const mine = mineOf(state);
  return mine && areaId === mine ? `Home to ${clanName(mine)}'s land 🏡` : null;
}
